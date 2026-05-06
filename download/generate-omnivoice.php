<?php
// generate-omnivoice.php - Geracao de voz TTS via OmniVoice (PHP direto do browser)
// Suporta 3 modos: clone (_clone_fn), design (_design_fn), auto (_design_fn com Auto)
// Usa o mesmo padrao HMAC do generate.php
// Bypassa o Vercel completamente - zero gasto de serverless

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '256M');

require_once __DIR__ . '/config.php';

// CORS
header_remove('Access-Control-Allow-Origin');
header_remove('Access-Control-Allow-Methods');
header_remove('Access-Control-Allow-Headers');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Generate-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'Metodo nao permitido']);
    exit;
}

// ===================== VALIDACAO HMAC TOKEN =====================
$token = $_SERVER['HTTP_X_GENERATE_TOKEN'] ?? '';
if (empty($token)) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token de geracao necessario']);
    exit;
}

$parts = explode('.', $token);
if (count($parts) !== 2) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido (formato)']);
    exit;
}

$timestamp = (int)$parts[0];
$receivedHmac = $parts[1];

if (time() - $timestamp > 1800) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token expirado, tente novamente']);
    exit;
}

if ($timestamp > time() + 60) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido']);
    exit;
}

$expectedHmac = hash_hmac('sha256', (string)$timestamp, API_KEY);
if (!hash_equals($expectedHmac, $receivedHmac)) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido (assinatura)']);
    exit;
}

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
$mode = $input['mode'] ?? 'clone';       // clone | design | auto
$idioma = $input['language'] ?? 'Auto';
$refAudioUrl = $input['referenceAudioUrl'] ?? '';
$refAudioName = $input['referenceAudioName'] ?? 'ref_audio.wav';
$instruct = $input['instruct'] ?? '';
$speed = $input['speed'] ?? 1.0;
$numStep = $input['numStep'] ?? 32;
$guidanceScale = $input['guidanceScale'] ?? 2.0;
$denoise = isset($input['denoise']) ? ($input['denoise'] === true || $input['denoise'] === 'true' || $input['denoise'] === 1) : true;
$preprocess = isset($input['preprocess']) ? ($input['preprocess'] === true || $input['preprocess'] === 'true' || $input['preprocess'] === 1) : true;
$postprocess = isset($input['postprocess']) ? ($input['postprocess'] === true || $input['postprocess'] === 'true' || $input['postprocess'] === 1) : true;

// Voice Design params (usados no _design_fn)
$gender = $input['gender'] ?? 'Auto';
$age = $input['age'] ?? 'Auto';
$pitch = $input['pitch'] ?? 'Auto';
$style = $input['style'] ?? 'Auto';
$accent = $input['accent'] ?? 'Auto';

debugLog('Input', 'info', "modo: $mode | texto: " . mb_substr($texto, 0, 50) . " | lang: $idioma | steps: $numStep | cfg: $guidanceScale | dn: " . ($denoise ? '1' : '0') . " | pp: " . ($preprocess ? '1' : '0') . " | po: " . ($postprocess ? '1' : '0'));

if (empty(trim($texto))) {
    returnError('Texto e obrigatorio', 400);
}

if ($mode === 'clone' && empty($refAudioUrl)) {
    returnError('Audio de referencia necessario no modo clone', 400);
}

// ===================== OBTER TUNNEL URL =====================
debugLog('Tunnel', 'info', 'Descobrindo URL do tunnel...');

$tunnelUrl = null;
$tunnelCh = curl_init(BASE_URL . '/get_tunnel.php');
curl_setopt_array($tunnelCh, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_SSL_VERIFYPEER => false,
]);
$tunnelResp = curl_exec($tunnelCh);
$tunnelCode = curl_getinfo($tunnelCh, CURLINFO_HTTP_CODE);
curl_close($tunnelCh);

if ($tunnelCode == 200 && $tunnelResp) {
    $tunnelData = json_decode($tunnelResp, true);
    if (($tunnelData['status'] ?? '') === 'online' && !empty($tunnelData['tunnelUrl'])) {
        $tunnelUrl = $tunnelData['tunnelUrl'];
    }
}

if (!$tunnelUrl) {
    // Fallback para HF_SPACE_URL do config
    $tunnelUrl = defined('HF_SPACE_URL') ? HF_SPACE_URL : '';
}

if (empty($tunnelUrl)) {
    returnError('Servidor OmniVoice offline - tunnel nao disponivel', 503);
}

debugLog('Tunnel', 'ok', mb_substr($tunnelUrl, 0, 60) . '...');

// ===================== FUNCOES =====================

function downloadRefAudio($url, $name) {
    debugLog('Download ref audio', 'info', 'de: ' . mb_substr($url, 0, 80));
    $tempFile = tempnam(sys_get_temp_dir(), 'vp_ov_') . '.' . pathinfo($name, PATHINFO_EXTENSION);

    $ch = curl_init($url);
    $fp = fopen($tempFile, 'w');
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $dlOk = curl_exec($ch);
    $dlHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);

    if (!$dlOk || $dlHttpCode != 200 || filesize($tempFile) == 0) {
        debugLog('Download ref audio', 'error', "HTTP $dlHttpCode");
        if (file_exists($tempFile)) unlink($tempFile);
        return null;
    }

    debugLog('Download ref audio', 'ok', round(filesize($tempFile) / 1024) . 'KB');
    return $tempFile;
}

function uploadToGradio($filePath, $fileName, $baseUrl) {
    debugLog('Upload Gradio', 'info', 'enviando...');

    $ch = curl_init($baseUrl . '/gradio_api/upload');
    $cfile = new CURLFile($filePath, mime_content_type($filePath), $fileName);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['files' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code == 200 && $resp) {
        $data = json_decode($resp, true);
        if (is_array($data) && count($data) > 0) {
            debugLog('Upload Gradio', 'ok', $data[0]);
            return $data[0];
        }
    }
    debugLog('Upload Gradio', 'error', "HTTP $code");
    return null;
}

function submitJob($baseUrl, $endpoint, $gradioData) {
    debugLog('Submit', 'info', "endpoint: $endpoint");

    $ch = curl_init($baseUrl . '/gradio_api/call/' . $endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['data' => $gradioData]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code != 200 || !$resp) {
        debugLog('Submit', 'error', "HTTP $code");
        return null;
    }

    $data = json_decode($resp, true);
    $eventId = $data['event_id'] ?? null;

    if ($eventId) {
        debugLog('Submit', 'ok', "event_id: $eventId");
    } else {
        debugLog('Submit', 'error', 'sem event_id');
    }

    return $eventId;
}

function streamResult($baseUrl, $endpoint, $eventId, $timeoutSec = 300) {
    debugLog('SSE Stream', 'info', "Abrindo conexao para $eventId...");

    $audioUrl = null;
    $error = null;
    $buffer = '';
    $heartbeatCount = 0;
    $startTime = time();

    $ch = curl_init($baseUrl . '/gradio_api/call/' . $endpoint . '/' . $eventId);

    $writeFn = function($ch, $chunk) use (&$buffer, &$audioUrl, &$error, &$heartbeatCount, &$startTime, $timeoutSec) {
        $buffer .= $chunk;

        if (time() - $startTime > $timeoutSec) {
            return -1;
        }

        $blocks = explode("\n\n", $buffer);
        $buffer = array_pop($blocks) ?? '';

        foreach ($blocks as $block) {
            $block = trim($block);
            if (empty($block)) continue;

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

            if ($eventType === 'complete' && !empty($eventData)) {
                debugLog('SSE Stream', 'ok', 'Evento COMPLETE recebido!');
                $resultData = json_decode($eventData, true);
                // Gradio retorna [audio_output(FileData), status_text]
                if (is_array($resultData) && count($resultData) >= 2) {
                    $output = $resultData[0];
                    if (isset($output['url'])) {
                        $audioUrl = $output['url'];
                    } elseif (isset($output['path'])) {
                        $audioUrl = $baseUrl . '/gradio_api/file=' . $output['path'];
                    }
                }
                if ($audioUrl) {
                    debugLog('SSE Stream', 'ok', 'Audio: ' . mb_substr($audioUrl, 0, 80));
                } else {
                    $error = 'Sem URL no output';
                }
                return -1;
            }

            if ($eventType === 'error') {
                debugLog('SSE Stream', 'error', mb_substr($eventData ?: 'vazio', 0, 300));
                $error = $eventData ?: 'Erro na geracao';
                return -1;
            }

            if ($eventType === 'heartbeat') {
                $heartbeatCount++;
                if ($heartbeatCount <= 2 || $heartbeatCount % 15 === 0) {
                    debugLog('SSE Stream', 'info', "Heartbeat #$heartbeatCount");
                }
            }
        }

        return strlen($chunk);
    };

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_TIMEOUT => $timeoutSec,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_ENCODING => '',
        CURLOPT_HTTPHEADER => [
            'Accept: text/event-stream',
            'Cache-Control: no-cache',
            'Connection: keep-alive',
            'X-Accel-Buffering: no',
            'Accept-Encoding: identity',
        ],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_WRITEFUNCTION => $writeFn,
    ]);

    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($audioUrl) {
        return ['audioUrl' => $audioUrl, 'error' => null];
    }
    if ($error) {
        return ['audioUrl' => null, 'error' => $error];
    }
    if ($httpCode == 404) {
        return ['audioUrl' => null, 'error' => '404'];
    }
    if (!empty($curlError)) {
        return ['audioUrl' => null, 'error' => 'connection_lost: ' . $curlError];
    }
    if (time() - $startTime >= $timeoutSec) {
        return ['audioUrl' => null, 'error' => 'timeout'];
    }
    return ['audioUrl' => null, 'error' => 'stream_ended'];
}

// ===================== MONTAR DADOS E GERAR =====================

$tempRefFile = null;
$endpoint = '';
$gradioData = [];

if ($mode === 'clone') {
    // ===== MODO CLONE: _clone_fn =====
    $endpoint = '_clone_fn';

    // Baixar audio de referencia
    if (!empty($refAudioUrl)) {
        $tempRefFile = downloadRefAudio($refAudioUrl, $refAudioName);
        if (!$tempRefFile) {
            returnError('Falha ao baixar audio de referencia', 400);
        }
    }

    $gradioData = [
        $texto,                            // text
        $idioma,                           // lang
        [
            'path' => '',
            'orig_name' => $refAudioName,
            'mime_type' => (pathinfo($refAudioName, PATHINFO_EXTENSION) === 'mp3') ? 'audio/mpeg' : 'audio/wav',
            'is_stream' => false,
            'meta' => ['_type' => 'gradio.FileData']
        ],
        '',                                // ref_text (vazio = auto Whisper)
        $instruct ?: null,                 // instruct
        (int)$numStep,                     // ns
        (float)$guidanceScale,             // gs (CFG)
        $denoise,                          // dn (denoise)
        (float)$speed,                     // sp (speed)
        null,                              // du (duration, null = auto)
        $preprocess,                       // pp (preprocess)
        $postprocess                       // po (postprocess)
    ];

} else {
    // ===== MODO DESIGN / AUTO: _design_fn =====
    $endpoint = '_design_fn';

    // Se modo auto, forcar todos os params como Auto
    if ($mode === 'auto') {
        $gender = 'Auto';
        $age = 'Auto';
        $pitch = 'Auto';
        $style = 'Auto';
        $accent = 'Auto';
    }

    $gradioData = [
        $texto,                            // text
        $idioma,                           // lang
        (int)$numStep,                     // ns
        (float)$guidanceScale,             // gs (CFG)
        $denoise,                          // dn (denoise)
        (float)$speed,                     // sp (speed)
        null,                              // du (duration)
        $preprocess,                       // pp (preprocess)
        $postprocess,                      // po (postprocess)
        $gender,                           // gender
        $age,                              // age
        $pitch,                            // pitch
        $style,                            // style
        $accent,                           // english accent
        'Auto'                             // chinese dialect
    ];
}

debugLog('Modo', 'info', "endpoint: $endpoint | gender: $gender | pitch: $pitch");

// ===================== FLUXO COM RETRY =====================

$audioUrl = null;
$maxRetries = 3;
$lastError = '';

for ($attempt = 0; $attempt < $maxRetries && !$audioUrl; $attempt++) {
    if ($attempt > 0) {
        $waitSec = 3 * $attempt;
        debugLog('Retry', 'warn', "Tentativa " . ($attempt + 1) . "/$maxRetries - aguardando ${waitSec}s...");
        sleep($waitSec);
    } else {
        debugLog('Geracao', 'info', "Iniciando OmniVoice via PHP DIRECT ($endpoint)...");
    }

    // Upload audio de referencia (clone mode only)
    $refPath = null;
    if ($mode === 'clone' && $tempRefFile && file_exists($tempRefFile)) {
        $refPath = uploadToGradio($tempRefFile, $refAudioName, $tunnelUrl);
        if (!$refPath) {
            debugLog('Upload', 'error', 'Falha no upload, tentando novamente...');
            $lastError = 'Falha no upload do audio';
            continue;
        }
        $gradioData[2]['path'] = $refPath;
        $gradioData[2]['url'] = $tunnelUrl . '/gradio_api/file=' . $refPath;
        $gradioData[2]['size'] = filesize($tempRefFile);
    }

    // Submit job
    $eventId = null;
    for ($s = 0; $s < 3 && !$eventId; $s++) {
        if ($s > 0) {
            debugLog('Submit retry', 'warn', "Tentativa " . ($s + 1) . "/3");
            sleep(2);
        }
        $eventId = submitJob($tunnelUrl, $endpoint, $gradioData);
    }

    if (!$eventId) {
        $lastError = 'Falha ao submeter job ao OmniVoice';
        continue;
    }

    // Stream resultado
    $result = streamResult($tunnelUrl, $endpoint, $eventId, 300);

    if ($result['audioUrl']) {
        $audioUrl = $result['audioUrl'];
        if ($attempt > 0) {
            debugLog('Retry', 'ok', "Sucesso na tentativa " . ($attempt + 1) . "!");
        }
        break;
    }

    $lastError = $result['error'] ?? 'unknown';

    $retryable = ['null', '404', 'timeout', 'connection_lost', 'stream_ended'];
    $shouldRetry = false;
    foreach ($retryable as $re) {
        if (stripos($lastError, $re) !== false) {
            $shouldRetry = true;
            break;
        }
    }

    if (!$shouldRetry) {
        debugLog('Retry', 'error', "Erro nao-retriable: $lastError");
        break;
    }
}

// Limpar temp
if ($tempRefFile && file_exists($tempRefFile)) unlink($tempRefFile);

if (!$audioUrl) {
    $userMsg = 'OmniVoice falhou: ' . $lastError;
    if ($lastError === 'null') {
        $userMsg = 'OmniVoice instavel. Tente novamente em instantes.';
    } elseif ($lastError === '404') {
        $userMsg = 'OmniVoice reiniciou. Tente novamente.';
    } elseif ($lastError === 'timeout') {
        $userMsg = 'OmniVoice demorou demais. Tente um texto mais curto.';
    }
    returnError($userMsg, 504);
}

// ===================== BAIXAR AUDIO E RETORNAR =====================
debugLog('Download audio', 'info', 'baixando audio gerado...');
$tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_ov_gen_') . '.wav';

$ch = curl_init($audioUrl);
$fp = fopen($tempAudioFile, 'w');
curl_setopt_array($ch, [
    CURLOPT_FILE => $fp,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_ENCODING => '',
    CURLOPT_SSL_VERIFYPEER => false,
]);
$dlOk = curl_exec($ch);
$dlCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
fclose($fp);

if (!$dlOk || $dlCode != 200 || filesize($tempAudioFile) == 0) {
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    returnError("Falha ao baixar audio gerado (HTTP $dlCode)");
}

debugLog('Download audio', 'ok', round(filesize($tempAudioFile) / 1024) . 'KB');

// Base64
$audioBase64 = base64_encode(file_get_contents($tempAudioFile));
$ext = strtolower(pathinfo($audioUrl, PATHINFO_EXTENSION));
$mimeType = ($ext === 'mp3') ? 'audio/mpeg' : 'audio/wav';
$dataUri = 'data:' . $mimeType . ';base64,' . $audioBase64;

if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);

debugLog('FINAL', 'ok', 'OmniVoice via PHP DIRECT - zero Vercel');

echo json_encode([
    'audioUrl' => $dataUri,
    'model' => 'omnivoice',
    'mode' => $mode,
    'viaDirectPhp' => true,
    'debug' => debugResult()
]);
?>
