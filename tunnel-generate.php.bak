<?php
// tunnel-generate.php — Proxy PHP (higienizacao leve)
// Browser -> Oracle PHP -> Tunnel -> GPU PC (native-generate) -> Browser

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '512M');

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

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

// ===================== DESCOBRIR TUNNEL URL =====================
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
// PRIORIDADE: snake_case (campos nativos GPU) > camelCase (Next.js legado)
$voiceMode = $input['voice_mode'] ?? ($input['voiceMode'] ?? 'clone');

// Comando leve original do historico que nao quebra o contexto:
$userText = trim($input['text'] ?? '');
$userText = preg_replace('/R\$\s*/i', '', $userText);
$userText = str_replace(',', ' e ', $userText);
$userText = str_replace('%', ' por cento', $userText);

// Download e conversao em Base64 no PHP (GPU nao sai da rede)
$refUrl = $input['ref_audio_url'] ?? ($input['referenceAudioUrl'] ?? '');
$refAudioBase64 = '';

if (!empty($refUrl)) {
    $audioData = false;

    // Otimizacao: se o arquivo esta no proprio servidor Oracle, ler direto do SSD
    // Evita HTTPS loopback (saida -> Let's Encrypt -> nginx -> volta) para arquivos locais
    if (strpos($refUrl, '://cvmnews.com.br') !== false || strpos($refUrl, '://sorteiomax.com.br') !== false) {
        $nomeArquivo = basename(parse_url($refUrl, PHP_URL_PATH));
        $caminhoFisico = '/var/www/omnivoice/audios/ref/' . $nomeArquivo;
        if (file_exists($caminhoFisico)) {
            $audioData = file_get_contents($caminhoFisico);
            error_log("[Filesystem-Hit] Audio lido direto do SSD local: {$nomeArquivo}");
        }
    }

    // Fallback: baixar via HTTP se nao for local ou nao encontrado no disco
    if ($audioData === false) {
        $audioData = @file_get_contents($refUrl);
    }

    if ($audioData !== false) {
        $refAudioBase64 = base64_encode($audioData);
    }
}

$nativePayload = [
    'text'                 => $userText,
    'voice_mode'           => $voiceMode,
    'speaker_id'           => $input['speaker_id'] ?? ($input['speakerId'] ?? ($input['speakerFile'] ?? '')),
    'ref_audio_base64'     => $refAudioBase64,
    'ref_audio_url'        => '',
    'language'             => $input['language'] ?? 'Auto',
    'instruct'             => $input['instruct'] ?? '',
    'speed'                => max(0.5, min(1.5, (float)($input['speed'] ?? 1.0))),
    'num_step'             => (int)($input['num_step'] ?? ($input['numStep'] ?? 32)),
    'guidance_scale'       => (float)($input['guidance_scale'] ?? ($input['guidanceScale'] ?? 2.0)),
    'ref_text'             => $input['ref_text'] ?? ($input['refText'] ?? ''),
    'denoise'              => $input['denoise'] ?? true,
    'postprocess_output'   => $input['postprocessOutput'] ?? true,
    'preprocess_prompt'    => $input['preprocessPrompt'] ?? true,
];

// Duração alvo: só envia se definido (> 0)
$targetDuration = $input['targetDuration'] ?? null;
if ($targetDuration !== null && $targetDuration > 0) {
    $nativePayload['duration'] = (float)$targetDuration;
}

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
    CURLOPT_ENCODING       => '',
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

$result = json_decode($resp, true);

if (!$result) {
    http_response_code(502);
    echo json_encode(['error' => 'Resposta invalida do GPU', 'raw' => mb_substr($resp, 0, 300)]);
    exit;
}

if (($result['status'] ?? '') === 'ok' && !empty($result['audio_base64'])) {
    $dataUri = 'data:audio/wav;base64,' . $result['audio_base64'];
    echo json_encode([
        'audioUrl'        => $dataUri,
        'viaTunnel'       => true,
        'mode'            => 'native',
        'nlpPipeline'     => false,
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
