<?php
// generate.php - Geracao de voz TTS via OmniVoice (chamada DIRETA do browser)
// Bypassa completamente o Vercel para evitar timeout de 60s
// Usa HMAC token para autenticacao (mesmo padrao do upload-direct.php)
// v3: SSE Streaming persistente (conexao aberta ate resultado)

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '256M');

require_once __DIR__ . '/config.php';

// CORS (necessario para chamada direta do browser)
// header_remove evita duplicata com .htaccess / config do servidor
header_remove('Access-Control-Allow-Origin');
header_remove('Access-Control-Allow-Methods');
header_remove('Access-Control-Allow-Headers');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Generate-Token');

// Responder preflight
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

// Token format: timestamp.hmac_sha256
$parts = explode('.', $token);
if (count($parts) !== 2) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido (formato)']);
    exit;
}

$timestamp = (int)$parts[0];
$receivedHmac = $parts[1];

// Token expira em 30 minutos (geracao na GPU local pode demorar)
if (time() - $timestamp > 1800) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token expirado, tente novamente']);
    exit;
}

// Token no futuro (diferenca de relogio)
if ($timestamp > time() + 60) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido']);
    exit;
}

// Verificar HMAC usando a API_KEY como segredo
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
$idioma = $input['language'] ?? 'Auto';
$refAudioUrl = $input['refAudioUrl'] ?? '';
$refAudioPath = $input['refAudioPath'] ?? '';
$refText = $input['refText'] ?? '';
$instruct = $input['instruct'] ?? '';
$refAudioName = $input['refAudioName'] ?? 'ref_audio.wav';
$speed = $input['speed'] ?? 1.0;
$numStep = $input['numStep'] ?? 32;
$guidanceScale = $input['guidanceScale'] ?? 2.0;

debugLog('Input recebido', 'info', "texto: " . mb_substr($texto, 0, 50) . " | idioma: $idioma | steps: $numStep");

if (empty(trim($texto))) {
    returnError('Texto e obrigatorio', 400);
}
if (empty($refAudioUrl) && empty($refAudioPath)) {
    returnError('Audio de referencia nao fornecido', 400);
}

$hfUrl = defined('HF_SPACE_URL') ? HF_SPACE_URL : 'https://k2-fsa-omnivoice.hf.space';
debugLog('HF Space', 'info', $hfUrl);

// ===================== FUNCOES =====================

function downloadRefAudio($url, $name) {
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
    }
    debugLog('Download ref audio', 'error', "HTTP $dlHttpCode");
    if (file_exists($tempFile)) unlink($tempFile);
    return null;
}

function uploadToHF($filePath, $fileName, $hfUrl) {
    debugLog('Upload para HF', 'info', 'enviando...');

    $ch = curl_init($hfUrl . '/gradio_api/upload');
    $cfile = new CURLFile($filePath, mime_content_type($filePath), $fileName);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['files' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code == 200 && $resp) {
        $data = json_decode($resp, true);
        if (is_array($data) && count($data) > 0) {
            debugLog('Upload para HF', 'ok', $data[0]);
            return $data[0];
        }
    }
    debugLog('Upload para HF', 'error', "HTTP $code");
    return null;
}

function submitToGradio($gradioData, $hfUrl) {
    debugLog('Submit Gradio', 'info', 'enviando job...');

    $ch = curl_init($hfUrl . '/gradio_api/call/_clone_fn');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['data' => $gradioData]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code != 200 || !$resp) {
        debugLog('Submit Gradio', 'error', "HTTP $code");
        return null;
    }

    $data = json_decode($resp, true);
    $eventId = $data['event_id'] ?? null;

    if ($eventId) {
        debugLog('Submit Gradio', 'ok', "event_id: $eventId");
    } else {
        debugLog('Submit Gradio', 'error', 'sem event_id');
    }

    return $eventId;
}

function streamSSEForResult($eventId, $hfUrl, $timeoutSec = 180) {
    debugLog('SSE Stream', 'info', "Abrindo conexao persistente para $eventId...");

    $audioUrl = null;
    $error = null;
    $buffer = '';
    $heartbeatCount = 0;
    $startTime = time();

    $ch = curl_init($hfUrl . '/gradio_api/call/_clone_fn/' . $eventId);

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
                if (is_array($resultData) && count($resultData) >= 2) {
                    $output = $resultData[0];
                    if (isset($output['url'])) {
                        $audioUrl = $output['url'];
                    } elseif (isset($output['path'])) {
                        $audioUrl = $hfUrl . '/gradio_api/file=' . $output['path'];
                    }
                }
                if ($audioUrl) {
                    debugLog('SSE Stream', 'ok', 'Audio URL: ' . mb_substr($audioUrl, 0, 80));
                } else {
                    $error = 'Sem URL no output';
                }
                return -1;
            }

            if ($eventType === 'error') {
                debugLog('SSE Stream', 'error', 'Evento ERROR: ' . mb_substr($eventData ?: 'vazio', 0, 300));
                if (empty($eventData) || $eventData === 'null') {
                    $error = 'null';
                } elseif (strpos($eventData, '404') !== false) {
                    $error = '404';
                } else {
                    $errParsed = json_decode($eventData, true);
                    $error = $errParsed['error'] ?? $errParsed['message'] ?? 'Erro na geracao';
                }
                return -1;
            }

            if ($eventType === 'heartbeat') {
                $heartbeatCount++;
                if ($heartbeatCount <= 3 || $heartbeatCount % 10 === 0) {
                    debugLog('SSE Stream', 'info', "Heartbeat #$heartbeatCount (conexao ativa...)");
                }
            }
        }

        return strlen($chunk);
    };

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_TIMEOUT => $timeoutSec,
        CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => [
            'Accept: text/event-stream',
            'Cache-Control: no-cache',
            'Connection: keep-alive',
            'X-Accel-Buffering: no',
        ],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_WRITEFUNCTION => $writeFn,
    ]);

    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($audioUrl) {
        debugLog('SSE Stream', 'ok', "Resultado obtido apos $heartbeatCount heartbeats");
        return ['status' => 'complete', 'audioUrl' => $audioUrl];
    }

    if ($error) {
        return ['status' => 'error', 'error' => $error];
    }

    if ($httpCode == 404) {
        debugLog('SSE Stream', 'error', '404 - event_id perdido');
        return ['status' => 'error', 'error' => '404'];
    }

    if (!empty($curlError)) {
        debugLog('SSE Stream', 'warn', "Erro curl: $curlError");
        return ['status' => 'error', 'error' => 'connection_lost'];
    }

    if (time() - $startTime >= $timeoutSec) {
        debugLog('SSE Stream', 'warn', "Timeout apos {$timeoutSec}s");
        return ['status' => 'error', 'error' => 'timeout'];
    }

    debugLog('SSE Stream', 'warn', "Stream encerrou sem resultado ($heartbeatCount heartbeats)");
    return ['status' => 'error', 'error' => 'stream_ended'];
}

function runGeneration($gradioData, $refAudioFile, $refAudioName, $hfUrl) {
    if ($refAudioFile && file_exists($refAudioFile)) {
        $path = uploadToHF($refAudioFile, $refAudioName, $hfUrl);
        if (!$path) {
            return ['audioUrl' => null, 'error' => 'Falha no upload do audio para HF Space'];
        }
        $gradioData[2]['path'] = $path;
    }

    $eventId = null;
    for ($s = 0; $s < 3 && !$eventId; $s++) {
        if ($s > 0) {
            debugLog('Submit retry', 'warn', "Tentativa " . ($s + 1) . "/2");
            sleep(3);
        }
        $eventId = submitToGradio($gradioData, $hfUrl);
    }

    if (!$eventId) {
        return ['audioUrl' => null, 'error' => 'Falha ao enviar job para o Gradio'];
    }

    debugLog('Geracao', 'info', "Aguardando resultado via SSE...");
    $result = streamSSEForResult($eventId, $hfUrl, 600);

    if ($result['status'] === 'complete') {
        return ['audioUrl' => $result['audioUrl'], 'error' => null];
    }

    return ['audioUrl' => null, 'error' => $result['error'] ?? 'unknown'];
}

// ===================== FLUXO PRINCIPAL COM RETRY =====================

$audioUrl = null;
$tempRefFile = null;

if (!empty($refAudioUrl)) {
    $tempRefFile = downloadRefAudio($refAudioUrl, $refAudioName);
}

if (!$tempRefFile && !empty($refAudioPath)) {
    debugLog('Fallback HF path', 'info', $refAudioPath);
    $audioUrl = null;
}

$gradioData = [
    $texto,
    $idioma,
    [
        'path' => $refAudioPath ?? '',
        'orig_name' => $refAudioName,
        'mime_type' => (pathinfo($refAudioName, PATHINFO_EXTENSION) === 'mp3') ? 'audio/mpeg' : 'audio/wav',
        'is_stream' => false,
        'meta' => ['_type' => 'gradio.FileData']
    ],
    $refText,
    $instruct,
    (int)$numStep,
    (float)$guidanceScale,
    true,
    (float)$speed,
    null,
    true,
    true
];

$maxRetries = 3;
$lastError = '';

for ($attempt = 0; $attempt < $maxRetries && !$audioUrl; $attempt++) {
    if ($attempt > 0) {
        $waitSec = 5 * $attempt;
        debugLog('Retry', 'info', "Tentativa " . ($attempt + 1) . "/$maxRetries - aguardando ${waitSec}s...");
        sleep($waitSec);
    } else {
        debugLog('Geracao', 'info', 'Iniciando geracao (SSE Streaming, DIRECT)...');
    }

    $result = runGeneration($gradioData, $tempRefFile, $refAudioName, $hfUrl);

    if ($result['audioUrl']) {
        $audioUrl = $result['audioUrl'];
        if ($attempt > 0) {
            debugLog('Retry', 'ok', "Sucesso na tentativa " . ($attempt + 1) . "!");
        }
        break;
    }

    $lastError = $result['error'];

    $retryableErrors = ['null', '404', 'timeout', 'connection_lost', 'stream_ended', 'HTTP 5'];
    $shouldRetry = false;
    foreach ($retryableErrors as $re) {
        if (stripos($lastError, $re) !== false) {
            $shouldRetry = true;
            break;
        }
    }

    if (!$shouldRetry) {
        debugLog('Retry', 'error', "Erro nao-retriable: $lastError");
        break;
    }

    debugLog('Retry', 'warn', "Erro retriable: $lastError");
}

if ($tempRefFile && file_exists($tempRefFile)) unlink($tempRefFile);

if (!$audioUrl) {
    $userMsg = 'Erro na geracao pelo servidor de IA.';
    if ($lastError === 'null') {
        $userMsg = 'Servidor de IA instavel. Tente novamente em instantes.';
    } elseif ($lastError === '404') {
        $userMsg = 'Servidor de IA reiniciou. Tente novamente.';
    } elseif ($lastError === 'timeout') {
        $userMsg = 'Tempo limite excedido na geracao.';
    }
    returnError($userMsg, 504);
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
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    returnError("Falha ao baixar audio gerado (HTTP $dlCode)");
}

$audioSize = filesize($tempAudioFile);
debugLog('Download audio gerado', 'ok', round($audioSize / 1024) . 'KB');

// ===================== CONVERTER PARA BASE64 =====================
debugLog('Base64 encode', 'info', 'convertendo...');
$audioBase64 = base64_encode(file_get_contents($tempAudioFile));

$ext = strtolower(pathinfo($audioUrl, PATHINFO_EXTENSION));
$mimeType = ($ext === 'mp3') ? 'audio/mpeg' : 'audio/wav';

$dataUri = 'data:' . $mimeType . ';base64,' . $audioBase64;
debugLog('Base64 encode', 'ok', round(strlen($audioBase64) / 1024) . 'KB base64');

if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);

// ===================== RETORNAR =====================
debugLog('FINAL', 'ok', 'audio pronto via PHP DIRECT (SSE Streaming, sem Vercel proxy)');

echo json_encode([
    'audioUrl' => $dataUri,
    'mixed' => false,
    'viaDirectPhp' => true,
    'viaPhp' => true,
    'debug' => debugResult()
]);
?>
