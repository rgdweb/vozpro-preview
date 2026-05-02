<?php
// generate.php - VERSAO LOCAL (sem tunnel, sem SSL)
// PHP roda NA MESMA MAQUINA que a GPU
// GPU = localhost:7860 (comunicacao interna, sem internet)
// Browser acessa PHP via tunnel (so JSON, audio ja em base64)

// v5: LOCAL - Zero SSL, zero tunnel para GPU, tudo localhost

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '512M');

require_once __DIR__ . '/config.php';

// CORS
header_remove('Access-Control-Allow-Origin');
header_remove('Access-Control-Allow-Methods');
header_remove('Access-Control-Allow-Headers');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Generate-Token');

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
    global $debugSteps, $debugStart;
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

// LOCAL: Sempre usa localhost:7860
$hfUrl = defined('HF_SPACE_URL') ? HF_SPACE_URL : 'http://localhost:7860';
debugLog('GPU Local', 'info', $hfUrl . ' (localhost, sem tunnel!)');

// ===================== FUNCOES =====================

define('MAX_REF_AUDIO_SECONDS', 10);

// NO LOCAL: Se o refAudioUrl aponta para o proprio PHP server,
// tentamos resolver como caminho local (evita download HTTP)
function resolveLocalAudio($url) {
    $baseUrl = BASE_URL; // ex: http://localhost:8080

    // Se a URL aponta para nos mesmos, resolve o caminho do arquivo
    if (strpos($url, $baseUrl) === 0) {
        $relativePath = substr($url, strlen($baseUrl));
        $localPath = __DIR__ . $relativePath;

        if (file_exists($localPath) && filesize($localPath) > 0) {
            return $localPath;
        }
    }

    // Tenta como caminho absoluto do filesystem
    if (file_exists($url) && is_file($url)) {
        return $url;
    }

    return null;
}

function downloadRefAudio($url, $name) {
    // TENTATIVA 1: Resolver como arquivo local (sem HTTP, sem corrupcao)
    $localPath = resolveLocalAudio($url);
    if ($localPath) {
        debugLog('Ref audio', 'ok', 'Arquivo LOCAL: ' . $localPath . ' (' . round(filesize($localPath) / 1024) . 'KB)');
        return $localPath;
    }

    // TENTATIVA 2: Download via HTTP (para URLs externas)
    debugLog('Download ref audio', 'info', 'HTTP de: ' . mb_substr($url, 0, 80));
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

    if (!$dlOk || $dlHttpCode != 200 || filesize($tempFile) == 0) {
        debugLog('Download ref audio', 'error', "HTTP $dlHttpCode");
        if (file_exists($tempFile)) unlink($tempFile);
        return null;
    }

    debugLog('Download ref audio', 'ok', round(filesize($tempFile) / 1024) . 'KB (HTTP)');
    return $tempFile;
}

function trimAudioToMaxSeconds($filePath, $maxSeconds = 10) {
    $trimScript = __DIR__ . '/trim_audio.py';

    if (!file_exists($trimScript)) {
        debugLog('Trim audio', 'warn', 'trim_audio.py nao encontrado');
        return false;
    }

    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    $trimmedFile = tempnam(sys_get_temp_dir(), 'vp_trim_') . '.' . $ext;

    // No Windows XAMPP: usar o Python do Conda (o "python" do Windows abre a Microsoft Store)
    $pythonCmd = 'C:\\Users\\Administrador\\Miniconda3\\python.exe';
    if (PHP_OS_FAMILY !== 'Windows') {
        $pythonCmd = 'python3';
    }
    if (!file_exists($pythonCmd)) {
        $pythonCmd = 'python3';
    }

    $cmd = $pythonCmd . ' ' . escapeshellarg($trimScript) . ' '
         . escapeshellarg($filePath) . ' '
         . escapeshellarg($trimmedFile) . ' '
         . escapeshellarg((string)$maxSeconds);

    $output = shell_exec($cmd . ' 2>&1');
    $output = trim($output ?? '');

    if ($output === 'OK' && file_exists($trimmedFile) && filesize($trimmedFile) > 0) {
        return $trimmedFile;
    }

    if (file_exists($trimmedFile)) unlink($trimmedFile);
    debugLog('Trim audio', 'warn', 'Falha: ' . $output);
    return false;
}

function uploadToHF($filePath, $fileName, $hfUrl) {
    debugLog('Upload para GPU', 'info', 'enviando para ' . $hfUrl . ' (localhost)...');

    $ch = curl_init($hfUrl . '/gradio_api/upload');
    $cfile = new CURLFile($filePath, mime_content_type($filePath), $fileName);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['files' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($code == 200 && $resp) {
        $data = json_decode($resp, true);
        if (is_array($data) && count($data) > 0) {
            debugLog('Upload para GPU', 'ok', $data[0] . ' (localhost!)');
            return $data[0];
        }
    }
    debugLog('Upload para GPU', 'error', "HTTP $code - $curlError");
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
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($code != 200 || !$resp) {
        debugLog('Submit Gradio', 'error', "HTTP $code - $curlError");
        return null;
    }

    $data = json_decode($resp, true);
    $eventId = $data['event_id'] ?? null;

    if ($eventId) {
        debugLog('Submit Gradio', 'ok', "event_id: $eventId");
    } else {
        debugLog('Submit Gradio', 'error', 'sem event_id - resp: ' . mb_substr($resp, 0, 200));
    }

    return $eventId;
}

function streamSSEForResult($eventId, $hfUrl, $timeoutSec = 600) {
    debugLog('SSE Stream', 'info', "Aguardando $eventId (localhost)...");

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
                debugLog('SSE Stream', 'ok', 'Evento COMPLETE!');
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
                    debugLog('SSE Stream', 'ok', 'Audio: ' . mb_substr($audioUrl, 0, 80));
                } else {
                    $error = 'Sem URL no output';
                }
                return -1;
            }

            if ($eventType === 'error') {
                debugLog('SSE Stream', 'error', 'ERRO: ' . mb_substr($eventData ?: 'vazio', 0, 500));
                if (empty($eventData) || $eventData === 'null') {
                    $error = 'null';
                } elseif (strpos($eventData, '404') !== false) {
                    $error = '404';
                } elseif (strpos($eventData, 'OutOfMemory') !== false || strpos($eventData, 'CUDA') !== false) {
                    $error = 'CUDA OOM';
                } else {
                    $errParsed = json_decode($eventData, true);
                    $error = $errParsed['error'] ?? $errParsed['message'] ?? 'Erro na geracao';
                }
                return -1;
            }

            if ($eventType === 'heartbeat') {
                $heartbeatCount++;
                if ($heartbeatCount <= 3 || $heartbeatCount % 10 === 0) {
                    debugLog('SSE Stream', 'info', "Heartbeat #$heartbeatCount");
                }
            }
        }

        return strlen($chunk);
    };

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_TIMEOUT => $timeoutSec,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_HTTPHEADER => [
            'Accept: text/event-stream',
            'Cache-Control: no-cache',
            'Connection: keep-alive',
            'X-Accel-Buffering: no',
        ],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
        CURLOPT_WRITEFUNCTION => $writeFn,
    ]);

    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($audioUrl) {
        debugLog('SSE Stream', 'ok', "Resultado apos $heartbeatCount heartbeats");
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
        debugLog('SSE Stream', 'warn', "curl: $curlError");
        return ['status' => 'error', 'error' => 'connection_lost'];
    }

    if (time() - $startTime >= $timeoutSec) {
        debugLog('SSE Stream', 'warn', "Timeout {$timeoutSec}s");
        return ['status' => 'error', 'error' => 'timeout'];
    }

    debugLog('SSE Stream', 'warn', "Stream encerrou ($heartbeatCount heartbeats)");
    return ['status' => 'error', 'error' => 'stream_ended'];
}

function runGeneration($gradioData, $refAudioFile, $refAudioName, $hfUrl) {
    if ($refAudioFile && file_exists($refAudioFile)) {
        $path = uploadToHF($refAudioFile, $refAudioName, $hfUrl);
        if (!$path) {
            return ['audioUrl' => null, 'error' => 'Falha no upload do audio para GPU local'];
        }
        $gradioData[2]['path'] = $path;
        $gradioData[2]['url'] = $hfUrl . '/gradio_api/file=' . $path;
        $gradioData[2]['size'] = filesize($refAudioFile);
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
        return ['audioUrl' => null, 'error' => 'Falha ao enviar job para GPU local'];
    }

    debugLog('Geracao', 'info', 'Aguardando resultado via SSE (localhost)...');
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

    // TRIMAR AUDIO (evita CUDA OOM)
    if ($tempRefFile) {
        $trimmedFile = trimAudioToMaxSeconds($tempRefFile, MAX_REF_AUDIO_SECONDS);
        if ($trimmedFile && $trimmedFile !== $tempRefFile) {
            if ($tempRefFile !== resolveLocalAudio($refAudioUrl)) {
                // So apaga se for arquivo temporario (nao o original)
                unlink($tempRefFile);
            }
            $tempRefFile = $trimmedFile;
            debugLog('Trim audio', 'ok', round(filesize($tempRefFile) / 1024) . 'KB (max ' . MAX_REF_AUDIO_SECONDS . 's)');
        } elseif ($trimmedFile === false) {
            debugLog('Trim audio', 'warn', 'Falha no trim, usando original');
        }
    }
}

if (!$tempRefFile && !empty($refAudioPath)) {
    debugLog('Fallback HF path', 'info', $refAudioPath);
}

$gradioData = [
    $texto,
    'Auto',  // Auto detecta melhor (a interface do OmniVoice usa Auto)
    [
        'path' => $refAudioPath ?? '',
        'url' => '',  // preenchido apos upload
        'orig_name' => $refAudioName,
        'size' => $tempRefFile ? filesize($tempRefFile) : 0,
        'mime_type' => (pathinfo($refAudioName, PATHINFO_EXTENSION) === 'mp3') ? 'audio/mpeg' : 'audio/wav',
        'meta' => ['_type' => 'gradio.FileData']
    ],
    '',        // refText: vazio (a interface do OmniVoice envia vazio!)
    null,      // instruct: null (a interface do OmniVoice envia null!)
    (int)$numStep,
    (float)$guidanceScale,
    true,      // denoise
    (int)$speed, // speed como int (a interface envia int, nao float)
    0,         // duration: 0 (a interface envia 0, nao null!)
    true,      // preprocess
    true       // postprocess
];

$maxRetries = 3;
$lastError = '';

for ($attempt = 0; $attempt < $maxRetries && !$audioUrl; $attempt++) {
    if ($attempt > 0) {
        $waitSec = 5 * $attempt;
        debugLog('Retry', 'info', "Tentativa " . ($attempt + 1) . "/$maxRetries - ${waitSec}s...");
        sleep($waitSec);
    } else {
        debugLog('Geracao', 'info', 'Iniciando geracao LOCAL (localhost, sem tunnel)...');
    }

    $result = runGeneration($gradioData, $tempRefFile, $refAudioName, $hfUrl);

    if ($result['audioUrl']) {
        $audioUrl = $result['audioUrl'];
        if ($attempt > 0) {
            debugLog('Retry', 'ok', "Sucesso tentativa " . ($attempt + 1) . "!");
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

// Nao apagar arquivo local (pode ser o original)
// Apenas apaga se for temporario
if ($tempRefFile && !resolveLocalAudio($refAudioUrl)) {
    if (file_exists($tempRefFile)) unlink($tempRefFile);
}

if (!$audioUrl) {
    $userMsg = 'Erro na geracao pela GPU local.';
    if ($lastError === 'null') {
        $userMsg = 'GPU local instavel. Tente novamente.';
    } elseif ($lastError === '404') {
        $userMsg = 'GPU local reiniciou. Tente novamente.';
    } elseif ($lastError === 'timeout') {
        $userMsg = 'Tempo limite excedido.';
    } elseif ($lastError === 'CUDA OOM') {
        $userMsg = 'GPU sem memoria. Use audio de referencia de ate 10 segundos.';
    }
    returnError($userMsg, 504);
}

// ===================== BAIXAR AUDIO GERADO (LOCAL!) =====================
debugLog('Download audio gerado', 'info', 'localhost...');
$tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_gen_') . '.wav';

$ch = curl_init($audioUrl);
$fp = fopen($tempAudioFile, 'w');
curl_setopt_array($ch, [
    CURLOPT_FILE => $fp,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 120,
    CURLOPT_SSL_VERIFYPEER => false,
    CURLOPT_SSL_VERIFYHOST => 0,
]);
$dlOk = curl_exec($ch);
$dlCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);
fclose($fp);

if (!$dlOk || $dlCode != 200 || filesize($tempAudioFile) == 0) {
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    returnError("Falha ao baixar audio gerado (HTTP $dlCode - $curlError)");
}

$audioSize = filesize($tempAudioFile);
debugLog('Download audio gerado', 'ok', round($audioSize / 1024) . 'KB (localhost!)');

// ===================== CONVERTER PARA BASE64 =====================
debugLog('Base64 encode', 'info', 'convertendo...');
$audioBase64 = base64_encode(file_get_contents($tempAudioFile));

$ext = strtolower(pathinfo($audioUrl, PATHINFO_EXTENSION));
$mimeType = ($ext === 'mp3') ? 'audio/mpeg' : 'audio/wav';

$dataUri = 'data:' . $mimeType . ';base64,' . $audioBase64;
debugLog('Base64 encode', 'ok', round(strlen($audioBase64) / 1024) . 'KB');

if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);

// ===================== RETORNAR =====================
debugLog('FINAL', 'ok', 'audio pronto via PHP LOCAL (sem tunnel!)');

echo json_encode([
    'audioUrl' => $dataUri,
    'mixed' => false,
    'viaLocalPhp' => true,
    'viaPhp' => true,
    'debug' => debugResult()
]);
?>
