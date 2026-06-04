<?php
// generate-omnivoice.php - Geracao de voz TTS via OmniVoice (NATIVE-GENERATE)
// MIGRADO: Gradio API -> native-generate (2026-06-02)
//
// Antes: usava /gradio_api/upload + /gradio_api/call/_clone_fn + SSE stream
// Agora: usa /api/native-generate (JSON POST, resposta direta com audio_base64)
//
// Suporta 3 modos: clone, design, auto
// Usa o mesmo padrao HMAC do generate.php
// Bypassa o Vercel completamente - zero gasto de serverless
//
// MANTIDO: debug logging, queue monitor, SSML strip, clean text, WAV silence pad,
//           retry logic, speed clamping, HMAC token validation

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

// ===================== STRIP SSML (defesa) =====================
function stripSSML($text) {
    if (!is_string($text)) return '';
    if (!preg_match('/<[a-z][^>]*>/i', $text)) return $text;
    $r = preg_replace('/<[^>]+>/', '', $text);
    $r = html_entity_decode($r, ENT_QUOTES | ENT_XML1, 'UTF-8');
    return trim(preg_replace('/\s+/', ' ', $r));
}

// ===================== LIMPAR TEXTO (defesa extra) =====================
function cleanText($text) {
    if (!is_string($text)) return '';
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text);
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $text = preg_replace('/\n{3,}/', "\n\n", $text);
    return trim($text);
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
// Range oficial OmniVoice: 0.5 a 1.5
$speedOriginal = $speed;
$speed = max(0.5, min(1.5, (float)$speed));
$numStep = $input['numStep'] ?? 32;

// Voice Design params
$gender = $input['gender'] ?? 'Auto';
$age = $input['age'] ?? 'Auto';
$pitch = $input['pitch'] ?? 'Auto';
$style = $input['style'] ?? 'Auto';
$accent = $input['accent'] ?? 'Auto';

// ===================== DEFESA: STRIP SSML + CLEAN TEXTO =====================
$texto = stripSSML($texto);
$texto = cleanText($texto);

debugLog('Input', 'info', "modo: $mode | texto: " . mb_substr($texto, 0, 50) . " | lang: $idioma | steps: $numStep");

if (empty(trim($texto))) {
    returnError('Texto e obrigatorio', 400);
}

if ($mode === 'clone' && empty($refAudioUrl)) {
    returnError('Audio de referencia necessario no modo clone', 400);
}

// ===================== OBTER TUNNEL URL =====================
debugLog('Tunnel', 'info', 'Descobrindo URL do tunnel...');

$tunnelUrl = null;

// 1. tunnel-config.ini (atualizado pelo cloudflared)
$tunnelIni = __DIR__ . '/tunnel-config.ini';
if (file_exists($tunnelIni)) {
    $ini = parse_ini_file($tunnelIni);
    if ($ini !== false && !empty($ini['tunnel_url'])) {
        $tunnelUrl = trim($ini['tunnel_url']);
        debugLog('Tunnel', 'info', 'Usando tunnel-config.ini');
    }
}

// 2. Fallback: get_tunnel.php
if (empty($tunnelUrl)) {
    $tunnelCh = curl_init(BASE_URL . '/get_tunnel.php');
    curl_setopt_array($tunnelCh, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $tunnelResp = curl_exec($tunnelCh);
    $tunnelCode = curl_getinfo($tunnelCh, CURLINFO_HTTP_CODE);
    curl_close($tunnelCh);

    if ($tunnelCode == 200 && $tunnelResp) {
        $tunnelData = json_decode($tunnelResp, true);
        if (($tunnelData['status'] ?? '') === 'online' && !empty($tunnelData['tunnelUrl'])) {
            $tunnelUrl = $tunnelData['tunnelUrl'];
            debugLog('Tunnel', 'info', 'Usando get_tunnel.php');
        }
    }
}

if (empty($tunnelUrl)) {
    returnError('Servidor OmniVoice offline - tunnel nao disponivel', 503);
}

debugLog('Tunnel', 'ok', mb_substr($tunnelUrl, 0, 60) . '...');

// ===================== DOWNLOAD REF AUDIO (para clone mode) =====================
$refAudioBase64 = '';

if ($mode === 'clone' && !empty($refAudioUrl)) {
    debugLog('Download ref audio', 'info', 'de: ' . mb_substr($refAudioUrl, 0, 80));
    
    $ch = curl_init($refAudioUrl);
    $audioData = '';
    $writeFn = function($ch, $chunk) use (&$audioData) {
        $audioData .= $chunk;
        return strlen($chunk);
    };
    
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_RETURNTRANSFER => false,
        CURLOPT_WRITEFUNCTION => $writeFn,
    ]);
    
    $dlOk = curl_exec($ch);
    $dlHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if ($dlOk && $dlHttpCode == 200 && strlen($audioData) > 0) {
        $refAudioBase64 = base64_encode($audioData);
        debugLog('Download ref audio', 'ok', round(strlen($audioData) / 1024) . 'KB -> base64 ' . strlen($refAudioBase64) . ' chars');
    } else {
        returnError('Falha ao baixar audio de referencia (HTTP ' . $dlHttpCode . ')', 400);
    }
}

// ===================== MONTAR PAYLOAD NATIVE-GENERATE =====================
debugLog('Modo', 'info', "modo: $mode | gender: $gender | pitch: $pitch");

$nativePayload = [
    'text'                 => $texto,
    'language'             => $idioma,
    'speed'                => (float)$speed,
    'num_step'             => (int)$numStep,
    'guidance_scale'       => 2.0,
    'denoise'              => true,
    'preprocess_prompt'    => true,
    'postprocess_output'   => true,
];

if ($mode === 'clone') {
    $nativePayload['voice_mode'] = 'clone';
    $nativePayload['ref_audio_base64'] = $refAudioBase64;
    $nativePayload['ref_text'] = $input['refText'] ?? '';
    $nativePayload['instruct'] = $instruct ?: null;
} elseif ($mode === 'design') {
    $nativePayload['voice_mode'] = 'design';
    $nativePayload['instruct'] = $instruct;
    $nativePayload['gender'] = $gender;
    $nativePayload['age'] = $age;
    $nativePayload['pitch'] = $pitch;
    $nativePayload['style'] = $style;
    $nativePayload['accent'] = $accent;
} else {
    // auto mode
    $nativePayload['voice_mode'] = 'auto';
}

// Duração alvo (se definida)
$targetDuration = $input['targetDuration'] ?? null;
if ($targetDuration !== null && $targetDuration > 0) {
    $nativePayload['duration'] = (float)$targetDuration;
}

// ===================== QUEUE MONITOR =====================
$monitorFile = sys_get_temp_dir() . '/vp_queue_monitor.json';
$genId = uniqid('ov_');
$genStartTime = time();

function monitorStart($file, $id, $model, $mode, $text) {
    $data = ['active' => [], 'history' => [], 'total_today' => 0];
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true) ?: $data;
    }
    $today = date('Y-m-d');
    if (!isset($data['today_date']) || $data['today_date'] !== $today) {
        $data['total_today'] = 0;
        $data['today_date'] = $today;
        $data['history'] = [];
    }
    $data['total_today']++;
    $now = time();
    $data['active'] = array_values(array_filter($data['active'], function($g) use ($now) {
        return ($now - $g['started_at']) < 600;
    }));
    $data['active'][] = [
        'id' => $id,
        'model' => $model,
        'mode' => $mode,
        'text' => $text,
        'started_at' => time(),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '?',
    ];
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

function monitorEnd($file, $id, $success) {
    if (!file_exists($file)) return;
    $data = json_decode(file_get_contents($file), true) ?: ['active' => [], 'history' => []];
    $now = time();
    $finished = null;
    $data['active'] = array_values(array_filter($data['active'], function($g) use ($id, $now, &$finished) {
        if ($g['id'] === $id) {
            $finished = $g;
            $finished['ended_at'] = $now;
            $finished['success'] = $success;
            return false;
        }
        return true;
    }));
    if ($finished) {
        $data['history'][] = $finished;
        if (count($data['history']) > 100) $data['history'] = array_slice($data['history'], -100);
    }
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

monitorStart($monitorFile, $genId, 'omnivoice-native', $mode, $texto);
debugLog('Monitor', 'info', "Gen ID: $genId");

// ===================== CHAMAR NATIVE-GENERATE (COM RETRY) =====================
$audioBase64 = null;
$lastError = '';
$maxRetries = 3;

for ($attempt = 0; $attempt < $maxRetries && $audioBase64 === null; $attempt++) {
    if ($attempt > 0) {
        $waitSec = 3 * $attempt;
        debugLog('Retry', 'warn', "Tentativa " . ($attempt + 1) . "/$maxRetries - aguardando ${waitSec}s...");
        sleep($waitSec);
    } else {
        debugLog('Native Generate', 'info', 'Enviando requisicao para /api/native-generate...');
    }

    $nativeUrl = rtrim($tunnelUrl, '/') . '/api/native-generate';
    
    $ch = curl_init($nativeUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode($nativePayload),
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Content-Length: ' . strlen(json_encode($nativePayload)),
        ],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 300,   // 5 min para textos longos
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_ENCODING       => '',     // bloqueia gzip (corrompe audio)
        CURLOPT_SSL_VERIFYPEER => false,
    ]);

    $resp = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    $curlInfo = curl_getinfo($ch);
    curl_close($ch);

    if (!$resp) {
        $lastError = 'connection_lost: ' . $curlError;
        debugLog('Native Generate', 'error', $lastError);
        continue;
    }

    $result = json_decode($resp, true);
    
    if (!$result) {
        $lastError = 'Resposta invalida do GPU (HTTP ' . $httpCode . ')';
        debugLog('Native Generate', 'error', $lastError . ' | raw: ' . mb_substr($resp, 0, 200));
        continue;
    }

    if (($result['status'] ?? '') === 'ok' && !empty($result['audio_base64'])) {
        $audioBase64 = $result['audio_base64'];
        debugLog('Native Generate', 'ok', 'Audio recebido (' . strlen($audioBase64) . ' chars base64) | duracao: ' . ($result['duration'] ?? '?') . 's | tempo: ' . ($result['generation_time'] ?? '?') . 's');
        if ($attempt > 0) {
            debugLog('Retry', 'ok', "Sucesso na tentativa " . ($attempt + 1) . "!");
        }
        break;
    }

    // Erro do GPU
    $lastError = $result['error'] ?? 'Erro desconhecido do GPU';
    debugLog('Native Generate', 'error', "GPU error: $lastError");

    // Verificar se é retryable
    $retryable = ['timeout', 'connection', 'OOM', 'CUDA', 'out of memory', 'queue', 'busy'];
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

// ===================== PROCESSAR RESULTADO =====================
if ($audioBase64 === null) {
    $userMsg = 'OmniVoice falhou: ' . $lastError;
    if (stripos($lastError, 'timeout') !== false) {
        $userMsg = 'OmniVoice demorou demais. Tente um texto mais curto.';
    } elseif (stripos($lastError, 'OOM') !== false || stripos($lastError, 'CUDA') !== false) {
        $userMsg = 'GPU sem memoria. Tente novamente em instantes.';
    } elseif (stripos($lastError, 'connection') !== false) {
        $userMsg = 'GPU offline. Tente novamente.';
    }
    monitorEnd($monitorFile, $genId, false);
    returnError($userMsg, 504);
}

// ===================== SALVAR WAV E ADICIONAR SILENCIO =====================
debugLog('Process audio', 'info', 'Decodificando base64 e aplicando silence pad...');

$audioBinary = base64_decode($audioBase64);
$tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_ov_gen_') . '.wav';
file_put_contents($tempAudioFile, $audioBinary);

// Funcao: adiciona silencio (zeros PCM) no final de um arquivo WAV
function appendWavSilenceNative($filepath, $durationSec = 0.75) {
    if (!file_exists($filepath) || filesize($filepath) < 44) return false;
    
    $f = fopen($filepath, 'rb+');
    if (!$f) return false;
    
    $header = fread($f, 44);
    if (strlen($header) < 44) { fclose($f); return false; }
    
    if (substr($header, 0, 4) !== 'RIFF' || substr($header, 8, 4) !== 'WAVE') { fclose($f); return false; }
    
    $sampleRate = unpack('V', substr($header, 24, 4))[1];
    $bitsPerSample = unpack('v', substr($header, 34, 2))[1];
    $channels = unpack('v', substr($header, 22, 2))[1];
    $bytesPerSample = (int)($bitsPerSample / 8);
    
    $silenceSamples = (int)($sampleRate * $durationSec);
    $silenceBytes = $silenceSamples * $channels * $bytesPerSample;
    
    fseek($f, 0, SEEK_END);
    fwrite($f, str_repeat("\x00", $silenceBytes));
    
    $newSize = filesize($filepath);
    fseek($f, 4);
    fwrite($f, pack('V', $newSize - 8));
    
    $oldDataSize = unpack('V', substr($header, 40, 4))[1];
    fseek($f, 40);
    fwrite($f, pack('V', $oldDataSize + $silenceBytes));
    
    fclose($f);
    return true;
}

// Adicionar 750ms de silencio no final (protege ultima silaba)
if (file_exists($tempAudioFile) && filesize($tempAudioFile) >= 44) {
    $appendOk = appendWavSilenceNative($tempAudioFile, 0.75);
    if ($appendOk) {
        clearstatcache();
        $newSize = filesize($tempAudioFile);
        $hdr = file_get_contents($tempAudioFile, false, null, 0, 44);
        $sr = unpack('V', substr($hdr, 24, 4))[1];
        $chCount = unpack('v', substr($hdr, 22, 2))[1];
        $bps = unpack('v', substr($hdr, 34, 2))[1];
        $dsz = unpack('V', substr($hdr, 40, 4))[1];
        $dur = round($dsz / $chCount / ($bps / 8) / $sr, 1);
        debugLog('Silence Pad', 'ok', "+750ms silencio (" . round($newSize / 1024) . "KB, duracao: {$dur}s, {$sr}Hz)");
    }
}

// Converter para data URI
$finalAudioBase64 = base64_encode(file_get_contents($tempAudioFile));
$dataUri = 'data:audio/wav;base64,' . $finalAudioBase64;

if (file_exists($tempAudioFile)) unlink($tempAudioFile);

// Registrar sucesso no monitor
monitorEnd($monitorFile, $genId, true);

debugLog('FINAL', 'ok', 'OmniVoice via native-generate - zero Gradio, zero Vercel');

echo json_encode([
    'audioUrl' => $dataUri,
    'model' => 'omnivoice',
    'mode' => $mode,
    'viaDirectPhp' => true,
    'viaNative' => true,
    'debug' => debugResult()
]);
?>
