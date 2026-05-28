<?php
// tunnel-generate.php - Proxy PHP para geracao nativa OmniVoice (sem Gradio, sem Vercel)
// Browser -> Oracle PHP -> Tunnel -> GPU PC (native-generate) -> Browser
//
// Substitui o tunnel-generate/route.ts da Vercel:
// - Zero processamento de audio em JavaScript
// - Zero timeout da Vercel (PHP roda no Oracle, sem limite)
// - Zero custo (Oracle ja pago)
//
// Usa mesmo sistema de token HMAC do generate-direct.php

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
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

// ===================== TOKEN HMAC =====================
$token = $_SERVER['HTTP_X_GENERATE_TOKEN'] ?? '';
if (empty($token)) {
    http_response_code(401);
    echo json_encode(['error' => 'Token necessario']);
    exit;
}

$parts = explode('.', $token);
if (count($parts) !== 2) {
    http_response_code(401);
    echo json_encode(['error' => 'Token invalido']);
    exit;
}

$timestamp = (int)$parts[0];
$receivedHmac = $parts[1];

if (time() - $timestamp > 1800 || $timestamp > time() + 60) {
    http_response_code(401);
    echo json_encode(['error' => 'Token expirado']);
    exit;
}

$expectedHmac = hash_hmac('sha256', (string)$timestamp, API_KEY);
if (!hash_equals($expectedHmac, $receivedHmac)) {
    http_response_code(401);
    echo json_encode(['error' => 'Token invalido']);
    exit;
}

// ===================== INPUT =====================
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON invalido']);
    exit;
}

// ===================== DESCOBRIR TUNNEL URL (local!) =====================
// Tenta: 1) tunnel-config.ini (atualizado pelo cloudflared)  2) get_tunnel.php
$tunnelUrl = '';

if (defined('TUNNEL_URL') && !empty(TUNNEL_URL)) {
    $tunnelUrl = TUNNEL_URL;
}

if (empty($tunnelUrl)) {
    $tunnelIni = __DIR__ . '/tunnel-config.ini';
    if (file_exists($tunnelIni)) {
        $ini = parse_ini_file($tunnelIni);
        if ($ini !== false && !empty($ini['tunnel_url'])) {
            $tunnelUrl = trim($ini['tunnel_url']);
        }
    }
}

if (empty($tunnelUrl)) {
    // Fallback: chamar get_tunnel.php localmente
    $tunnelResp = @file_get_contents('http://127.0.0.1/get_tunnel.php');
    if ($tunnelResp) {
        $tunnelData = json_decode($tunnelResp, true);
        if ($tunnelData && ($tunnelData['status'] ?? '') === 'online' && !empty($tunnelData['tunnelUrl'])) {
            $tunnelUrl = $tunnelData['tunnelUrl'];
        }
    }
}

if (empty($tunnelUrl)) {
    http_response_code(502);
    echo json_encode(['error' => 'GPU offline: tunnel nao encontrado']);
    exit;
}

// ===================== MONTAR PAYLOAD PRO NATIVE-GENERATE =====================
$nativePayload = [
    'text'             => $input['text'] ?? '',
    'voice_mode'       => $input['voiceMode'] ?? ($input['voice_mode'] ?? 'clone'),
    'ref_audio_url'    => $input['referenceAudioUrl'] ?? '',
    'ref_audio_base64' => $input['referenceAudioBase64'] ?? '',
    'language'         => $input['language'] ?? 'Auto',
    'instruct'         => $input['instruct'] ?? '',
    'ref_text'         => $input['refText'] ?? '',
    'speed'            => $input['speed'] ?? 1.0,
    'num_step'         => $input['numStep'] ?? 32,
    'guidance_scale'   => $input['guidanceScale'] ?? 2.0,
];

// ===================== CHAMAR NATIVE-GENERATE =====================
$nativeUrl = rtrim($tunnelUrl, '/') . '/api/native-generate';

$ch = curl_init($nativeUrl);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($nativePayload),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 180,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_ENCODING       => '',  // bloqueia gzip (corrompe audio)
    CURLOPT_SSL_VERIFYPEER => false,
]);

$resp = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
$curlInfo = curl_getinfo($ch);
curl_close($ch);

if (!$resp) {
    http_response_code(502);
    echo json_encode(['error' => 'Erro ao conectar com GPU: ' . $curlError]);
    exit;
}

// ===================== RETORNAR RESPOSTA DO NATIVE-GENERATE =====================
// Se o GPU retornou sucesso, converte audio_base64 pra data URI
$result = json_decode($resp, true);

if (!$result) {
    http_response_code(502);
    echo json_encode(['error' => 'Resposta invalida do GPU', 'raw' => mb_substr($resp, 0, 300)]);
    exit;
}

if (($result['status'] ?? '') === 'ok' && !empty($result['audio_base64'])) {
    // Converter base64 pra data URI (formato que o frontend espera)
    $dataUri = 'data:audio/wav;base64,' . $result['audio_base64'];

    echo json_encode([
        'audioUrl'        => $dataUri,
        'viaTunnel'       => true,
        'mode'            => 'native',
        'duration'        => $result['duration'] ?? null,
        'generationTime'  => $result['generation_time'] ?? null,
        'debug' => [
            'totalDuration' => round(($curlInfo['total_time'] ?? 0) * 1000),
            'steps' => [
                ['step' => 'Tunnel', 'status' => 'ok', 'detail' => mb_substr($tunnelUrl, 0, 60) . '...'],
                ['step' => 'Native Generate', 'status' => 'ok', 'detail' => ($result['duration'] ?? 0) . 's em ' . ($result['generation_time'] ?? 0) . 's'],
            ],
        ],
    ]);
} else {
    // Erro do GPU
    $errorMsg = $result['error'] ?? 'Erro desconhecido do GPU';
    $httpCodeNative = $httpCode >= 400 ? $httpCode : 500;

    http_response_code($httpCodeNative);
    echo json_encode([
        'error' => 'GPU nao conseguiu gerar audio: ' . $errorMsg,
        'viaTunnel' => true,
        'debug' => [
            'totalDuration' => round(($curlInfo['total_time'] ?? 0) * 1000),
            'steps' => [
                ['step' => 'Tunnel', 'status' => 'ok', 'detail' => mb_substr($tunnelUrl, 0, 60) . '...'],
                ['step' => 'Native Generate', 'status' => 'error', 'detail' => $errorMsg],
            ],
        ],
    ]);
}
?>
