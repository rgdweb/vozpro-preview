<?php
// generate.php - Geracao de voz TTS via VozPro (chamada DIRETA do browser)
// Bypassa completamente o Vercel para evitar timeout de 60s
// Usa HMAC token para autenticacao (mesmo padrao do upload-direct.php)
// v4: Audio trimming (max 10s) para evitar CUDA OOM na RTX 3060 12GB

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '512M');

require_once __DIR__ . '/config.php';

// CORS (necessario para chamada direta do browser)
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
// Remove caracteres de controle invisiveis que podem causar garbling
function cleanText($text) {
    if (!is_string($text)) return '';
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text);
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $text = preg_replace('/\n{3,}/', "\n\n", $text);
    return trim($text);
}

// DICIONARIO DE PRONUNCIA: REMOVIDO PARA TESTE LIMPO (19/05/2026)
// O OmniVoice local fala corretamente sem regras.
// Testando se as regras causavam mais problemas que solucoes.

// ===================== LER INPUT JSON =====================
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input) {
    returnError('JSON invalido ou vazio', 400);
}

$texto = $input['text'] ?? '';
$idioma = $input['language'] ?? 'Auto';
// FORCAR PORTUGUES DESATIVADO PARA TESTE
// if (empty($idioma) || $idioma === 'Auto' || strtolower($idioma) === 'auto') {
//     $idioma = 'Portuguese';
// }
$refAudioUrl = $input['refAudioUrl'] ?? '';
$refAudioPath = $input['refAudioPath'] ?? '';
$refText = $input['refText'] ?? '';
$instruct = $input['instruct'] ?? '';
// DETECCAO DE IDIOMA DESATIVADA PARA TESTE
// $isPortuguese = in_array(strtolower($idioma), ['portuguese', 'portugues', 'pt', 'pt-br', 'pt_br']);
// NOTA: NAO adicionamos instruct automatico! O GPT-SoVITS so aceita termos especificos:
// male, female, high pitch, low pitch, portuguese accent, whisper, teenager, child, elderly, etc.
// Texto livre no instruct causa ValueError: "Unsupported instruct items found"
$refAudioName = $input['refAudioName'] ?? 'ref_audio.wav';
$speed = $input['speed'] ?? 1.0;
// Clamp velocidade: modelo OmniVoice/GPT-SoVITS fica distorcido fora desta faixa
// < 0.8 = audio reverso/garbled ("lingua dos anjos") | > 1.3 = acelera demais/engole palavras
$speedOriginal = $speed;
$speed = max(0.8, min(1.3, (float)$speed));
$numStep = $input['numStep'] ?? 16;

// DEFESA: strip SSML + clean texto
$texto = stripSSML($texto);
$texto = cleanText($texto);
// PRONUNCIA: Sem dicionario - teste limpo (19/05/2026)
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

// Tempo maximo do audio de referencia em segundos (GPU 12GB)
// TRIM DESATIVADO (22/05/2026)
// define('MAX_REF_AUDIO_SECONDS', 10);

function downloadRefAudio($url, $name) {
    debugLog('Download ref audio', 'info', 'de: ' . mb_substr($url, 0, 80));
    $tempFile = tempnam(sys_get_temp_dir(), 'vp_ref_') . '.' . pathinfo($name, PATHINFO_EXTENSION);

    $ch = curl_init($url);
    $fp = fopen($tempFile, 'w');
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao gzip/brotli (corrompe audio via tunnel)
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

    $originalSize = filesize($tempFile);
    debugLog('Download ref audio', 'ok', round($originalSize / 1024) . 'KB');

    // TRIM DESATIVADO (22/05/2026): OmniVoice funciona com audio de referencia longo (24s+).
    // O trim brusco sem fade causava alucinacoes e audio 4x mais longo.
    // A GPU RTX 3060 12GB aguenta referencias longas com empty_cache() no omnivoice_gpu.py.

    return $tempFile;
}

function trimAudioToMaxSeconds($filePath, $maxSeconds = 999) {
    // DESATIVADO (22/05/2026): retornar false = usa audio original
    return false;
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
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao (corrompe upload de audio via tunnel)
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
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao no submit
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

function streamSSEForResult($eventId, $hfUrl, $timeoutSec = 600) {
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
                debugLog('SSE Stream', 'error', 'Evento ERROR: ' . mb_substr($eventData ?: 'vazio', 0, 500));
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
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao no SSE stream
        CURLOPT_HTTPHEADER => [
            'Accept: text/event-stream',
            'Cache-Control: no-cache',
            'Connection: keep-alive',
            'X-Accel-Buffering: no',
            'Accept-Encoding: identity',  // Forca sem compressao
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

// ===================== QUEUE MONITOR =====================
$monitorFile = sys_get_temp_dir() . '/vp_queue_monitor.json';
$genId = uniqid('f5_');

function monitorStartGen($file, $id, $model, $text) {
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
        'id' => $id, 'model' => $model, 'mode' => 'f5-tts',
        'text' => $text, 'started_at' => time(),
        'ip' => $_SERVER['REMOTE_ADDR'] ?? '?',
    ];
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
}

function monitorEndGen($file, $id, $success) {
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

monitorStartGen($monitorFile, $genId, 'f5-tts', $texto);

$audioUrl = null;
$tempRefFile = null;

if (!empty($refAudioUrl)) {
    $tempRefFile = downloadRefAudio($refAudioUrl, $refAudioName);
}

if (!$tempRefFile && !empty($refAudioPath)) {
    debugLog('Fallback HF path', 'info', $refAudioPath);
}

$gradioData = [
    $texto,
    'Auto',  // Auto detecta (interface do VozPro usa Auto)
    [
        'path' => $refAudioPath ?? '',
        'url' => '',  // preenchido apos upload
        'orig_name' => $refAudioName,
        'size' => $tempRefFile ? filesize($tempRefFile) : 0,
        'mime_type' => (pathinfo($refAudioName, PATHINFO_EXTENSION) === 'mp3') ? 'audio/mpeg' : 'audio/wav',
        'meta' => ['_type' => 'gradio.FileData']
    ],
    $refText ?? '',  // refText: usa texto de referência do admin (vazio = Whisper auto)
    null,      // instruct: null (interface do VozPro envia null!)
    (int)$numStep,
    (float)$guidanceScale,
    true,      // denoise
    (float)$speed, // speed como float (1.3, nao 1!)
    null,      // duration: null = auto (usa speed para calcular)
    true,      // preprocess
    true       // postprocess
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
    } elseif ($lastError === 'CUDA OOM') {
        $userMsg = 'GPU sem memoria. O audio de referencia e muito longo - use um audio de ate 10 segundos.';
    }
    monitorEndGen($monitorFile, $genId, false);
    returnError($userMsg, 504);
}

// ===================== BAIXAR AUDIO GERADO (COM RETRY + VALIDACAO) =====================
debugLog('Download audio gerado', 'info', 'baixando...');

// Aguardar Gradio terminar de escrever o arquivo no disco.
// Delay dinamico: texto longo precisa de mais tempo para o Gradio salvar o WAV.
$delaySec = min(5, 2 + (int)floor(strlen($texto) / 200));
sleep($delaySec);
debugLog('Download audio gerado', 'info', "Aguardou {$delaySec}s apos SSE complete (texto: " . strlen($texto) . ' chars)');

// Detectar extensao real do audio gerado (Gradio pode retornar WAV ou MP3)
$ext = strtolower(pathinfo($audioUrl, PATHINFO_EXTENSION));
if (empty($ext) || !in_array($ext, ['wav', 'mp3', 'ogg', 'flac'])) {
    $ext = 'wav'; // default seguro
}
$tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_gen_') . '.' . $ext;

// Funcao: adiciona silencio (zeros PCM) no final de um arquivo WAV
function appendWavSilence($filepath, $durationSec = 0.5) {
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

// Funcao: valida se o header WAV bate com o tamanho real do arquivo
// Retorna true se OK, false se truncado
function isWavComplete($filepath) {
    if (!file_exists($filepath) || filesize($filepath) < 44) return false;
    $f = fopen($filepath, 'rb');
    if (!$f) return false;
    $header = fread($f, 44);
    fclose($f);
    // Verificar assinaturas RIFF e WAVE
    if (substr($header, 0, 4) !== 'RIFF' || substr($header, 8, 4) !== 'WAVE') return false;
    // Ler tamanho declarado no header RIFF (offset 4, 4 bytes, little-endian)
    $declaredSize = unpack('V', substr($header, 4, 4))[1];
    $actualSize = filesize($filepath);
    // RIFF size = filesize - 8 (os 8 bytes de "RIFF" + size)
    $expectedRiffSize = $actualSize - 8;
    if ($expectedRiffSize < $declaredSize) {
        // Arquivo truncado: tem menos bytes que o header declara
        return false;
    }
    return true;
}

// Download com retry: ate 3 tentativas, validando tamanho e header WAV
$dlOk = false;
$dlCode = 0;
$maxRetries = 3;
$minFileSize = 50000; // 50KB minimo para qualquer audio gerado

for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    $tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_gen_') . '.' . $ext;
    
    $ch = curl_init($audioUrl);
    $fp = fopen($tempAudioFile, 'w');
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao (corrompe audio WAV via tunnel!)
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $dlOk = curl_exec($ch);
    $dlCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);
    clearstatcache();
    
    $fileSize = filesize($tempAudioFile);
    debugLog('Download audio', 'info', "Tentativa $attempt/$maxRetries: " . round($fileSize / 1024) . "KB (HTTP $dlCode)");
    
    // Validação 1: download OK e HTTP 200
    if (!$dlOk || $dlCode != 200 || $fileSize == 0) {
        debugLog('Download audio', 'warn', "Falha no download (HTTP $dlCode)");
        if ($attempt < $maxRetries) { sleep(2); }
        continue;
    }
    
    // Validação 2: tamanho minimo (arquivo parcial do Gradio costuma ter poucos KB)
    if ($fileSize < $minFileSize) {
        debugLog('Download audio', 'warn', "Arquivo muito pequeno ($fileSize bytes < $minFileSize min), possivel Gradio ainda escrevendo");
        if ($attempt < $maxRetries) { sleep(3); }
        continue;
    }
    
    // Validação 3: se WAV, verificar se header bate com tamanho real (detecta truncacao via tunnel)
    if ($ext === 'wav') {
        if (isWavComplete($tempAudioFile)) {
            debugLog('Download audio', 'ok', "WAV completo (header OK)");
            break; // Sucesso!
        } else {
            debugLog('Download audio', 'warn', "WAV truncado (header declara mais bytes que o arquivo tem)");
            if ($attempt < $maxRetries) { sleep(3); }
            continue;
        }
    }
    
    // MP3/OGG/FLAC: sem validacao de header, confia no tamanho minimo
    break;
}

if (!$dlOk || $dlCode != 200 || filesize($tempAudioFile) == 0) {
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    monitorEndGen($monitorFile, $genId, false);
    returnError("Falha ao baixar audio apos $maxRetries tentativas (HTTP $dlCode)");
}

$audioSize = filesize($tempAudioFile);
debugLog('Download audio gerado', 'ok', round($audioSize / 1024) . 'KB' . ($ext !== 'wav' ? " ($ext)" : '') . " (tentativa $attempt/$maxRetries)");

// ===================== APPEND SILENCIO NO FINAL DO WAV =====================
// O postprocess_output do OmniVoice pode cortar a ultima silaba junto com o silencio.
// Adicionamos 750ms de silencio PCM (zeros) no final para proteger.
if ($ext === 'wav' && file_exists($tempAudioFile)) {
    $appendOk = appendWavSilence($tempAudioFile, 0.75);
    if ($appendOk) {
        clearstatcache();
        $newSize = filesize($tempAudioFile);
        $hdr = file_get_contents($tempAudioFile, false, null, 0, 44);
        $sr = unpack('V', substr($hdr, 24, 4))[1];
        $ch = unpack('v', substr($hdr, 22, 2))[1];
        $bps = unpack('v', substr($hdr, 34, 2))[1];
        $dsz = unpack('V', substr($hdr, 40, 4))[1];
        $dur = round($dsz / $ch / ($bps / 8) / $sr, 1);
        debugLog('Silence Pad', 'ok', "+750ms silencio adicionado (" . round($newSize / 1024) . "KB final, duracao: {$dur}s, {$sr}Hz)");
    }
}

// ===================== CONVERTER PARA BASE64 =====================
debugLog('Base64 encode', 'info', 'convertendo...');
$audioBase64 = base64_encode(file_get_contents($tempAudioFile));

$mimeType = ($ext === 'mp3') ? 'audio/mpeg' : 'audio/wav';

$dataUri = 'data:' . $mimeType . ';base64,' . $audioBase64;
debugLog('Base64 encode', 'ok', round(strlen($audioBase64) / 1024) . 'KB base64');

if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);

monitorEndGen($monitorFile, $genId, true);

// ===================== RETORNAR =====================
debugLog('FINAL', 'ok', 'audio pronto via PHP DIRECT (SSE + trim)');

echo json_encode([
    'audioUrl' => $dataUri,
    'mixed' => false,
    'viaDirectPhp' => true,
    'viaPhp' => true,
    'debug' => debugResult()
]);
?>
