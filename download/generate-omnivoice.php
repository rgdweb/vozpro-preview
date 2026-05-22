<?php
// generate-omnivoice.php - Geracao de voz TTS via OmniVoice (PHP direto do browser)
// Suporta 3 modos: clone (_clone_fn), design (_design_fn), auto (_design_fn com Auto)
// Usa o mesmo padrao HMAC do generate.php
// Bypassa o Vercel completamente - zero gasto de serverless
//
// CORRECOES (15/05/2026):
// - Adicionada cleanText() para remover caracteres de controle invisiveis
// - memory_limit 256M -> 512M (base64 de audio longo precisa mais memoria)
// - SSE timeout 300s -> 600s (textos longos nao estouram)
// - po (postprocess) mantido true (limpa artefatos/estalos do audio gerado)
// - CURLOPT_ENCODING => '' adicionado no fetch da tunnel URL
// - Timeout submit job 60s -> 90s
// - Timeout download audio 120s -> 180s

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
// Se o frontend enviar SSML, remove tudo. TTS nao entende tags.
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
$mode = $input['mode'] ?? 'clone';       // clone | design | auto
$idioma = $input['language'] ?? 'Auto';
// FORCAR PORTUGUES DESATIVADO PARA TESTE
// if (empty($idioma) || $idioma === 'Auto' || strtolower($idioma) === 'auto') {
//     $idioma = 'Portuguese';
// }
$refAudioUrl = $input['referenceAudioUrl'] ?? '';
$refAudioName = $input['referenceAudioName'] ?? 'ref_audio.wav';
$instruct = $input['instruct'] ?? '';
// DETECCAO DE IDIOMA DESATIVADA PARA TESTE
// $isPortuguese = in_array(strtolower($idioma), ['portuguese', 'portugues', 'pt', 'pt-br', 'pt_br']);
$speed = $input['speed'] ?? 1.0;
// Clamp velocidade: modelo OmniVoice/GPT-SoVITS fica distorcido fora desta faixa
// < 0.8 = audio reverso/garbled ("lingua dos anjos") | > 1.3 = acelera demais/engole palavras
$speedOriginal = $speed;
$speed = max(0.8, min(1.3, (float)$speed));
$numStep = $input['numStep'] ?? 32;

// Voice Design params (usados no _design_fn)
$gender = $input['gender'] ?? 'Auto';
$age = $input['age'] ?? 'Auto';
$pitch = $input['pitch'] ?? 'Auto';
$style = $input['style'] ?? 'Auto';
$accent = $input['accent'] ?? 'Auto';

// ===================== DEFESA: STRIP SSML + CLEAN TEXTO =====================
$texto = stripSSML($texto);
$texto = cleanText($texto);
// PRONUNCIA: Sem dicionario - teste limpo (19/05/2026)

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
// Primeiro tenta a constante TUNNEL_URL do config (atualizada pelo start_tunnel.ps1)
if (defined('TUNNEL_URL') && !empty(TUNNEL_URL)) {
    $tunnelUrl = TUNNEL_URL;
    debugLog('Tunnel', 'info', 'Usando TUNNEL_URL do config');
} else {
    // Fallback: tenta via get_tunnel.php
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
        }
    }
}

if (!$tunnelUrl) {
    // Fallback final para HF_SPACE_URL
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

    // TRIM DESATIVADO (22/05/2026): OmniVoice funciona com audio de referencia longo (24s+).
    // O trim brusco sem fade causava alucinacoes ("ba", "to", "sao") e audio 4x mais longo.
    // A GPU RTX 3060 12GB aguenta referencias longas com empty_cache() no omnivoice_gpu.py.

    return $tempFile;
}

// ===================== TRIM AUDIO REF (DESATIVADO 22/05/2026) =====================
// O trim brusco sem fade causava alucinacoes no modelo OmniVoice.
// Mantido como funcao de fallback caso precise reativar no futuro.
// define('MAX_REF_AUDIO_SECONDS', 10);

function trimRefAudioToMaxSeconds($filePath, $maxSeconds = 10) {
    // DESATIVADO: retornar false (usa audio original)
    return false;
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
        CURLOPT_TIMEOUT => 90,
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

function streamResult($baseUrl, $endpoint, $eventId, $timeoutSec = 600) {
    debugLog('SSE Stream', 'info', "Abrindo conexao para $eventId (timeout: {$timeoutSec}s)...");

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
                debugLog('SSE Raw Data', 'info', mb_substr($eventData, 0, 500));
                $resultData = json_decode($eventData, true);
                debugLog('SSE Parsed', 'info', 'type=' . gettype($resultData) . (is_array($resultData) ? ' count=' . count($resultData) : '') . ' | keys=' . (is_array($resultData) ? implode(',', array_keys($resultData)) : 'N/A'));
                // Gradio retorna [audio_output(FileData), status_text]
                if (is_array($resultData) && count($resultData) >= 2) {
                    $output = $resultData[0];
                    debugLog('SSE Output[0]', 'info', 'type=' . gettype($output) . ' | ' . mb_substr(json_encode($output), 0, 300));
                    if (isset($output['url'])) {
                        $audioUrl = $output['url'];
                    } elseif (isset($output['path'])) {
                        $audioUrl = $baseUrl . '/gradio_api/file=' . $output['path'];
                    } else {
                        debugLog('SSE Output[0]', 'warn', 'Sem url nem path! Conteudo: ' . mb_substr(json_encode($output), 0, 500));
                    }
                } elseif (is_array($resultData) && count($resultData) === 1) {
                    debugLog('SSE Parsed', 'warn', 'Apenas 1 elemento no resultado: ' . mb_substr(json_encode($resultData[0]), 0, 300));
                } else {
                    debugLog('SSE Parsed', 'warn', 'Formato inesperado! rawData: ' . mb_substr($eventData, 0, 500));
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
        2.0,                               // gs (CFG)
        true,                              // dn (denoise)
        (float)$speed,                     // sp (speed)
        null,                              // du (duration, null = auto)
        true,                              // pp (preprocess)
        true                               // po (postprocess) - limpa estalos/artefatos do audio
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
        2.0,                               // gs (CFG)
        true,                              // dn (denoise)
        (float)$speed,                     // sp (speed)
        null,                              // du (duration)
        true,                              // pp (preprocess)
        true,                              // po (postprocess) - limpa estalos/artefatos
        $gender,                           // gender
        $age,                              // age
        $pitch,                            // pitch
        $style,                            // style
        $accent,                           // english accent
        'Auto'                             // chinese dialect
    ];
}

debugLog('Modo', 'info', "endpoint: $endpoint | gender: $gender | pitch: $pitch");

// ===================== QUEUE MONITOR =====================
$monitorFile = sys_get_temp_dir() . '/vp_queue_monitor.json';
$genId = uniqid('ov_');
$genStartTime = time();

function monitorStart($file, $id, $model, $mode, $text) {
    $data = ['active' => [], 'history' => [], 'total_today' => 0];
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true) ?: $data;
    }
    // Contar total de hoje
    $today = date('Y-m-d');
    if (!isset($data['today_date']) || $data['today_date'] !== $today) {
        $data['total_today'] = 0;
        $data['today_date'] = $today;
        $data['history'] = [];
    }
    $data['total_today']++;
    // Limpar ativos expirados (>10min)
    $now = time();
    $data['active'] = array_values(array_filter($data['active'], function($g) use ($now) {
        return ($now - $g['started_at']) < 600;
    }));
    // Adicionar geracao ativa
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
    // Mover de active para history
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

// Registrar inicio
monitorStart($monitorFile, $genId, 'omnivoice', $mode, $texto);
debugLog('Monitor', 'info', "Gen ID: $genId | Ativas: " . count(json_decode(file_get_contents($monitorFile), true)['active'] ?? []));

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

    // Stream resultado (timeout 600s para textos longos)
    $result = streamResult($tunnelUrl, $endpoint, $eventId, 600);

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
    monitorEnd($monitorFile, $genId, false);
    returnError($userMsg, 504);
}

// ===================== BAIXAR AUDIO E RETORNAR (COM RETRY + VALIDACAO) =====================
debugLog('Download audio', 'info', 'baixando audio gerado...');

// Aguardar Gradio terminar de escrever o arquivo no disco.
// O evento SSE "complete" dispara quando a GERACAO termina, mas o Gradio
// ainda pode estar salvando o arquivo WAV. Sem esse delay, o download pode
// pegar um arquivo incompleto (cortando o final do audio em textos longos).
// Delay maior para texto longo: o Gradio pode demorar ate 5s para salvar o WAV
$delaySec = min(5, 2 + (int)floor(strlen($texto) / 200));
sleep($delaySec);
debugLog('Download audio', 'info', "Aguardou {$delaySec}s apos SSE complete (texto: " . strlen($texto) . ' chars)');

// Detectar extensao real do audio gerado
$ext = strtolower(pathinfo($audioUrl, PATHINFO_EXTENSION));
if (empty($ext) || !in_array($ext, ['wav', 'mp3', 'ogg', 'flac'])) {
    $ext = 'wav';
}
$tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_ov_gen_') . '.' . $ext;

// Funcao: adiciona silencio (zeros PCM) no final de um arquivo WAV
// Atualiza os headers RIFF e data chunk automaticamente
function appendWavSilenceOv($filepath, $durationSec = 0.5) {
    if (!file_exists($filepath) || filesize($filepath) < 44) return false;
    
    $f = fopen($filepath, 'rb+');
    if (!$f) return false;
    
    $header = fread($f, 44);
    if (strlen($header) < 44) { fclose($f); return false; }
    
    // Verificar se e WAV PCM valido
    if (substr($header, 0, 4) !== 'RIFF' || substr($header, 8, 4) !== 'WAVE') { fclose($f); return false; }
    
    // Ler parametros do WAV
    $sampleRate = unpack('V', substr($header, 24, 4))[1];
    $bitsPerSample = unpack('v', substr($header, 34, 2))[1];
    $channels = unpack('v', substr($header, 22, 2))[1];
    $bytesPerSample = (int)($bitsPerSample / 8);
    
    // Calcular bytes de silencio
    $silenceSamples = (int)($sampleRate * $durationSec);
    $silenceBytes = $silenceSamples * $channels * $bytesPerSample;
    
    // Ir para o final do arquivo e escrever zeros
    fseek($f, 0, SEEK_END);
    fwrite($f, str_repeat("\x00", $silenceBytes));
    
    // Atualizar header: RIFF ChunkSize (offset 4) = filesize - 8
    $newSize = filesize($filepath);
    fseek($f, 4);
    fwrite($f, pack('V', $newSize - 8));
    
    // Atualizar header: Subchunk2Size (offset 40) = data size anterior + silence bytes
    $oldDataSize = unpack('V', substr($header, 40, 4))[1];
    fseek($f, 40);
    fwrite($f, pack('V', $oldDataSize + $silenceBytes));
    
    fclose($f);
    return true;
}

function isWavCompleteOv($filepath) {
    if (!file_exists($filepath) || filesize($filepath) < 44) return false;
    $f = fopen($filepath, 'rb');
    if (!$f) return false;
    $header = fread($f, 44);
    fclose($f);
    if (substr($header, 0, 4) !== 'RIFF' || substr($header, 8, 4) !== 'WAVE') return false;
    $declaredSize = unpack('V', substr($header, 4, 4))[1];
    $actualSize = filesize($filepath);
    $expectedRiffSize = $actualSize - 8;
    if ($expectedRiffSize < $declaredSize) return false;
    return true;
}

// Download com retry: ate 3 tentativas, validando tamanho e header WAV
$dlOk = false;
$dlCode = 0;
$maxRetries = 3;
$minFileSize = 50000;

for ($attempt = 1; $attempt <= $maxRetries; $attempt++) {
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    $tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_ov_gen_') . '.' . $ext;
    
    $ch = curl_init($audioUrl);
    $fp = fopen($tempAudioFile, 'w');
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 180,
        CURLOPT_CONNECTTIMEOUT => 30,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $dlOk = curl_exec($ch);
    $dlCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);
    clearstatcache();
    
    $fileSize = filesize($tempAudioFile);
    debugLog('Download audio', 'info', "Tentativa $attempt/$maxRetries: " . round($fileSize / 1024) . "KB (HTTP $dlCode)");
    
    if (!$dlOk || $dlCode != 200 || $fileSize == 0) {
        debugLog('Download audio', 'warn', "Falha no download (HTTP $dlCode)");
        if ($attempt < $maxRetries) { sleep(2); }
        continue;
    }
    
    if ($fileSize < $minFileSize) {
        debugLog('Download audio', 'warn', "Arquivo muito pequeno ($fileSize bytes < $minFileSize)");
        if ($attempt < $maxRetries) { sleep(3); }
        continue;
    }
    
    if ($ext === 'wav') {
        if (isWavCompleteOv($tempAudioFile)) {
            debugLog('Download audio', 'ok', "WAV completo (header OK)");
            break;
        } else {
            debugLog('Download audio', 'warn', "WAV truncado (header vs tamanho real)");
            if ($attempt < $maxRetries) { sleep(3); }
            continue;
        }
    }
    break;
}

if (!$dlOk || $dlCode != 200 || filesize($tempAudioFile) == 0) {
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    returnError("Falha ao baixar audio apos $maxRetries tentativas (HTTP $dlCode)");
}

debugLog('Download audio', 'ok', round(filesize($tempAudioFile) / 1024) . 'KB' . ($ext !== 'wav' ? " ($ext)" : '') . " (tentativa $attempt/$maxRetries)");

// ===================== APPEND SILENCIO NO FINAL DO WAV =====================
// O postprocess_output do OmniVoice pode cortar a ultima silaba junto com o silencio.
// Adicionamos 500ms de silencio PCM (zeros) no final para proteger.
if ($ext === 'wav' && file_exists($tempAudioFile)) {
    $appendOk = appendWavSilenceOv($tempAudioFile, 0.5);
    if ($appendOk) {
        clearstatcache();
        $newSize = filesize($tempAudioFile);
        debugLog('Silence Pad', 'ok', '+500ms silencio adicionado (' . round($newSize / 1024) . 'KB final)');
    }
}

// Base64
$audioBase64 = base64_encode(file_get_contents($tempAudioFile));

$mimeType = ($ext === 'mp3') ? 'audio/mpeg' : 'audio/wav';
$dataUri = 'data:' . $mimeType . ';base64,' . $audioBase64;

if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);

// Registrar sucesso no monitor
monitorEnd($monitorFile, $genId, true);

debugLog('FINAL', 'ok', 'OmniVoice via PHP DIRECT - zero Vercel');

echo json_encode([
    'audioUrl' => $dataUri,
    'model' => 'omnivoice',
    'mode' => $mode,
    'viaDirectPhp' => true,
    'debug' => debugResult()
]);
?>
