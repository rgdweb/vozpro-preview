<?php
// generate.php - Geracao de voz TTS via OmniVoice (HuggingFace Space)
// Este arquivo BYPASSA o Vercel para evitar o timeout de 60s do plano Hobby
// Recebe os parametros via POST JSON e retorna audio base64
// v2: Retry robusto + heartbeat fix + 404 handling

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '256M');

// CORS
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'Metodo nao permitido']);
    exit;
}

require_once __DIR__ . '/config.php';

// ===================== DEBUG LOGGER =====================
$debugSteps = [];
$debugStart = microtime(true);

function debugLog($step, $status, $detail = '') {
    global $debugSteps, $debugStart;
    $debugSteps[] = [
        'time' => date('H:i:s'),
        'step' => $step,
        'status' => $status,
        'detail' => $detail,
        'duration' => round((microtime(true) - $debugStart) * 1000)
    ];
}

function debugResult() {
    global $debugSteps, $debugStart;
    return [
        'totalDuration' => round((microtime(true) - $debugStart) * 1000),
        'steps' => $debugSteps
    ];
}

function returnError($msg, $code = 500) {
    http_response_code($code);
    echo json_encode([
        'erro' => $msg,
        'debug' => debugResult()
    ]);
    exit;
}

// ===================== LER INPUT JSON =====================
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input) {
    returnError('JSON invalido ou vazio', 400);
}

$texto = $input['text'] ?? '';
$idioma = $input['language'] ?? 'Auto';
$refAudioUrl = $input['refAudioUrl'] ?? '';   // URL do PHP server (local)
$refAudioPath = $input['refAudioPath'] ?? '';  // Path no HF Space (fallback)
$refText = $input['refText'] ?? '';
$instruct = $input['instruct'] ?? '';
$refAudioName = $input['refAudioName'] ?? 'ref_audio.wav';
$speed = $input['speed'] ?? 1.0;
$numStep = $input['numStep'] ?? 32;
$guidanceScale = $input['guidanceScale'] ?? 2.0;

debugLog('Input recebido', 'info', "texto: " . mb_substr($texto, 0, 50) . " | idioma: $idioma | steps: $numStep");

// Validacoes
if (empty(trim($texto))) {
    returnError('Texto e obrigatorio', 400);
}
if (empty($refAudioUrl) && empty($refAudioPath)) {
    returnError('Audio de referencia nao fornecido', 400);
}

$hfUrl = defined('HF_SPACE_URL') ? HF_SPACE_URL : 'https://k2-fsa-omnivoice.hf.space';
debugLog('HF Space', 'info', $hfUrl);

// ===================== FUNCOES HELPER =====================

/**
 * Faz download do audio de referencia do PHP server
 */
function downloadRefAudio($url, $name) {
    global $debugSteps, $debugStart;
    debugLog('Download ref audio', 'info', 'de: ' . mb_substr($url, 0, 80));
    $tempFile = tempnam(sys_get_temp_dir(), 'vp_ref_') . '.' . pathinfo($name, PATHINFO_EXTENSION);

    $ch = curl_init($url);
    $fp = fopen($tempFile, 'w');
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $dlOk = curl_exec($ch);
    $dlHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);

    if ($dlOk && $dlHttpCode == 200 && filesize($tempFile) > 0) {
        debugLog('Download ref audio', 'ok', round(filesize($tempFile) / 1024) . 'KB');
        return $tempFile;
    } else {
        debugLog('Download ref audio', 'error', "HTTP $dlHttpCode");
        if (file_exists($tempFile)) unlink($tempFile);
        return null;
    }
}

/**
 * Faz upload de arquivo local para o HF Space
 */
function uploadToHF($filePath, $fileName, $hfUrl) {
    debugLog('Upload para HF', 'info', 'enviando arquivo...');

    $ch = curl_init($hfUrl . '/gradio_api/upload');
    $cfile = new CURLFile($filePath, mime_content_type($filePath), $fileName);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['files' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $uploadResp = curl_exec($ch);
    $uploadCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($uploadCode == 200 && $uploadResp) {
        $uploadData = json_decode($uploadResp, true);
        if (is_array($uploadData) && count($uploadData) > 0) {
            debugLog('Upload para HF', 'ok', $uploadData[0]);
            return $uploadData[0];
        } else {
            debugLog('Upload para HF', 'error', 'resposta inesperada: ' . mb_substr($uploadResp, 0, 200));
        }
    } else {
        debugLog('Upload para HF', 'error', "HTTP $uploadCode: " . mb_substr($uploadResp ?: 'sem resposta', 0, 200));
    }
    return null;
}

/**
 * Submete job ao Gradio e retorna event_id ou null
 */
function submitToGradio($gradioData, $hfUrl) {
    debugLog('Submit Gradio', 'info', 'enviando job...');

    $submitBody = json_encode(['data' => $gradioData]);

    $ch = curl_init($hfUrl . '/gradio_api/call/_clone_fn');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $submitBody,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $submitResp = curl_exec($ch);
    $submitCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($submitCode != 200 || !$submitResp) {
        debugLog('Submit Gradio', 'error', "HTTP $submitCode");
        return null;
    }

    $submitData = json_decode($submitResp, true);
    $eventId = $submitData['event_id'] ?? null;

    if ($eventId) {
        debugLog('Submit Gradio', 'ok', "event_id: $eventId");
    } else {
        debugLog('Submit Gradio', 'error', 'sem event_id: ' . mb_substr($submitResp, 0, 200));
    }

    return $eventId;
}

/**
 * Poll por resultado do Gradio. Retorna:
 *   'complete' => audioUrl (string)
 *   'error_null' => null (retry recommended)
 *   'error_404' => null (retry recommended)
 *   'error_real' => errorMsg (string, don't retry)
 *   'timeout' => null
 */
function pollGradioResult($eventId, $hfUrl, $maxPolls = 90, $pollIntervalUs = 1500000) {
    for ($i = 0; $i < $maxPolls; $i++) {
        usleep($pollIntervalUs);

        $ch = curl_init($hfUrl . '/gradio_api/call/_clone_fn/' . $eventId);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => ['Accept: text/event-stream'],
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $pollResp = curl_exec($ch);
        $pollCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        // 404 = event_id perdido (worker crashou/reiniciou)
        if ($pollCode == 404) {
            debugLog('Poll', 'error', "404 - event_id $eventId perdido (worker crashou?)");
            return ['status' => 'error_404'];
        }

        if ($pollCode != 200 || !$pollResp) {
            if ($i % 15 == 0) {
                debugLog('Poll', 'warn', "HTTP $pollCode na tentativa " . ($i + 1));
            }
            continue;
        }

        // Parsear blocos SSE
        $blocks = explode("\n\n", trim($pollResp));

        foreach ($blocks as $block) {
            $lines = explode("\n", $block);
            $eventType = '';
            $eventData = '';

            foreach ($lines as $line) {
                if (strpos($line, 'event: ') === 0) {
                    $eventType = trim(substr($line, 7));
                }
                if (strpos($line, 'data: ') === 0) {
                    $eventData = trim(substr($line, 6));
                }
            }

            // Evento COMPLETE = audio gerado
            if ($eventType === 'complete' && !empty($eventData)) {
                debugLog('Poll', 'ok', "complete na tentativa " . ($i + 1));

                $resultData = json_decode($eventData, true);
                $audioUrl = null;

                if (is_array($resultData) && count($resultData) >= 2) {
                    $audioOutput = $resultData[0];
                    if (isset($audioOutput['url'])) {
                        $audioUrl = $audioOutput['url'];
                    } elseif (isset($audioOutput['path'])) {
                        $audioUrl = $hfUrl . '/gradio_api/file=' . $audioOutput['path'];
                    }
                }

                if ($audioUrl) {
                    debugLog('Audio gerado', 'ok', mb_substr($audioUrl, 0, 100));
                    return ['status' => 'complete', 'audioUrl' => $audioUrl];
                } else {
                    return ['status' => 'error_real', 'message' => 'Audio gerado mas sem URL no output'];
                }
            }

            // Evento ERROR
            if ($eventType === 'error') {
                debugLog('Gradio ERROR', 'error', mb_substr($eventData ?: 'vazio', 0, 500));

                $isNullError = empty($eventData) || $eventData === 'null';
                $is404Error = strpos($eventData, '404') !== false;

                if ($isNullError) {
                    debugLog('Gradio retry', 'warn', 'Null error - job perdido/crashed');
                    return ['status' => 'error_null'];
                }

                if ($is404Error) {
                    debugLog('Gradio retry', 'warn', '404 error - event_id perdido');
                    return ['status' => 'error_404'];
                }

                // Erro real (texto, OOM, etc) - nao retry
                $errorMsg = 'Erro na geracao pelo servidor de IA';
                $errParsed = json_decode($eventData, true);
                if ($errParsed) {
                    $errorMsg = $errParsed['error'] ?? $errParsed['message'] ?? $errorMsg;
                } elseif (strlen($eventData) > 5 && strlen($eventData) < 500) {
                    $errorMsg = $eventData;
                }
                return ['status' => 'error_real', 'message' => $errorMsg];
            }

            // Heartbeat = Gradio ainda processando, NAO parar!
            if ($eventType === 'heartbeat') {
                if ($i % 15 == 0) {
                    debugLog('Poll', 'info', "Heartbeat (ainda processando, tentativa " . ($i + 1) . ")");
                }
                // Continua o loop normalmente
            }
        }
    }

    return ['status' => 'timeout'];
}

// ===================== FLUXO PRINCIPAL COM RETRY =====================

$audioUrl = null;
$tempRefFile = null;
$refAudioFile = null;
$hfFilePath = null;
$maxRetries = 3;

// Download ref audio (faz uma vez, reusa)
if (!empty($refAudioUrl)) {
    $tempRefFile = downloadRefAudio($refAudioUrl, $refAudioName);
    if ($tempRefFile) {
        $refAudioFile = $tempRefFile;
    }
}

// Fallback para path existente no HF
if (!$refAudioFile && !empty($refAudioPath)) {
    $hfFilePath = $refAudioPath;
    debugLog('Fallback HF path', 'info', $hfFilePath);
}

if (!$refAudioFile && !$hfFilePath) {
    returnError('Nao foi possivel obter o audio de referencia');
}

// Tentar gerar com retry
for ($attempt = 0; $attempt < $maxRetries && !$audioUrl; $attempt++) {
    if ($attempt > 0) {
        debugLog('Retry', 'info', "Tentativa " . ($attempt + 1) . "/$maxRetries - aguardando " . ($attempt * 5) . "s...");
        sleep($attempt * 5);
    }

    // Upload para HF (ou re-upload se retry)
    $currentHfPath = null;
    if ($refAudioFile && file_exists($refAudioFile)) {
        $uploadName = $attempt > 0 ? 'retry_' . time() . '_' . $refAudioName : $refAudioName;
        $currentHfPath = uploadToHF($refAudioFile, $uploadName, $hfUrl);
    }

    if (!$currentHfPath) {
        $currentHfPath = $hfFilePath; // usar path antigo como fallback
    }

    if (!$currentHfPath) {
        debugLog('Upload HF', 'error', 'Falhou em todas as tentativas de upload');
        break;
    }

    // Montar dados do Gradio
    $gradioData = [
        $texto,
        $idioma,
        [
            'path' => $currentHfPath,
            'orig_name' => $refAudioName,
            'mime_type' => (pathinfo($refAudioName, PATHINFO_EXTENSION) === 'mp3') ? 'audio/mpeg' : 'audio/wav',
            'is_stream' => false,
            'meta' => ['_type' => 'gradio.FileData']
        ],
        $refText,
        $instruct,
        (int)$numStep,
        (float)$guidanceScale,
        true,    // denoise
        (float)$speed,
        null,    // duration
        true,    // preprocess_prompt
        true     // postprocess_output
    ];

    // Submit com retry (ate 2x no submit)
    $eventId = null;
    for ($submitRetry = 0; $submitRetry < 2 && !$eventId; $submitRetry++) {
        if ($submitRetry > 0) {
            debugLog('Submit retry', 'warn', "Retry submit " . $submitRetry . "/1 - aguardando 5s...");
            sleep(5);
            // Re-upload com nome fresco
            if ($refAudioFile && file_exists($refAudioFile)) {
                $freshName = 'retry_' . time() . '_' . $refAudioName;
                $freshPath = uploadToHF($refAudioFile, $freshName, $hfUrl);
                if ($freshPath) {
                    $gradioData[2]['path'] = $freshPath;
                    $gradioData[2]['orig_name'] = $freshName;
                }
            }
        }
        $eventId = submitToGradio($gradioData, $hfUrl);
    }

    if (!$eventId) {
        debugLog('Retry', 'warn', "Submit falhou na tentativa " . ($attempt + 1));
        continue; // proxima tentativa do loop principal
    }

    // Poll resultado
    debugLog('Polling', 'info', "aguardando resultado de $eventId...");
    $pollResult = pollGradioResult($eventId, $hfUrl);

    switch ($pollResult['status']) {
        case 'complete':
            $audioUrl = $pollResult['audioUrl'];
            debugLog('FINAL', 'ok', $attempt > 0 ? "Sucesso na tentativa " . ($attempt + 1) : "Sucesso na primeira tentativa");
            break;

        case 'error_null':
        case 'error_404':
            debugLog('Retry', 'warn', ($pollResult['status'] === 'error_null' ? 'Null error' : '404') . " - job perdido, vai reiniciar...");
            break; // continua o loop principal (retry)

        case 'error_real':
            if ($tempRefFile && file_exists($tempRefFile)) unlink($tempRefFile);
            returnError($pollResult['message'], 500);

        case 'timeout':
            debugLog('Retry', 'warn', "Timeout no polling da tentativa " . ($attempt + 1));
            break; // continua o loop principal (retry)
    }
}

// Limpar temp
if ($tempRefFile && file_exists($tempRefFile)) unlink($tempRefFile);

if (!$audioUrl) {
    returnError('Falha apos ' . $maxRetries . ' tentativas. O servidor de IA pode estar instavel.', 504);
}

// ===================== BAIXAR AUDIO GERADO =====================
debugLog('Download audio gerado', 'info', 'baixando...');
$tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_gen_') . '.wav';

$ch = curl_init($audioUrl);
$fp = fopen($tempAudioFile, 'w');
curl_setopt_array($ch, [
    CURLOPT_FILE => $fp,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_SSL_VERIFYPEER => false,
]);
$dlOk = curl_exec($ch);
$dlCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
fclose($fp);

if (!$dlOk || $dlCode != 200 || filesize($tempAudioFile) == 0) {
    if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);
    returnError("Falha ao baixar audio gerado (HTTP $dlCode)");
}

$audioSize = filesize($tempAudioFile);
debugLog('Download audio gerado', 'ok', round($audioSize / 1024) . 'KB');

// ===================== CONVERTER PARA BASE64 =====================
debugLog('Base64 encode', 'info', 'convertendo...');
$audioBase64 = base64_encode(file_get_contents($tempAudioFile));

// Detectar mime type
$ext = strtolower(pathinfo($audioUrl, PATHINFO_EXTENSION));
$mimeType = ($ext === 'mp3') ? 'audio/mpeg' : 'audio/wav';

$dataUri = 'data:' . $mimeType . ';base64,' . $audioBase64;
debugLog('Base64 encode', 'ok', round(strlen($audioBase64) / 1024) . 'KB base64');

// ===================== LIMPAR ARQUIVOS TEMP =====================
if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);

// ===================== RETORNAR =====================
debugLog('FINAL', 'ok', 'audio pronto via PHP (sem Vercel)');

echo json_encode([
    'audioUrl' => $dataUri,
    'mixed' => false,
    'viaPhp' => true,
    'debug' => debugResult()
]);
?>
