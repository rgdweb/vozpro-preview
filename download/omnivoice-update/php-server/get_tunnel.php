<?php
/*
 * OmniVoice TTS - Endpoint para pegar a URL do tunnel ativo
 * O frontend Vercel chama este arquivo para descobrir onde o tunnel esta rodando
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

// Responde preflight CORS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Le o config.php que o start_tunnel.ps1 atualiza automaticamente
$configFile = __DIR__ . '/config.php';

if (!file_exists($configFile)) {
    echo json_encode([
        'status' => 'offline',
        'tunnelUrl' => '',
        'message' => 'config.php nao encontrado'
    ]);
    exit;
}

// Parse do config.php (formato INI)
$config = parse_ini_file($configFile);

$tunnelUrl = trim($config['tunnel_url'] ?? '');

if (empty($tunnelUrl)) {
    echo json_encode([
        'status' => 'offline',
        'tunnelUrl' => '',
        'message' => 'Nenhuma URL de tunnel registrada. Inicie o iniciar.bat na maquina local.'
    ]);
    exit;
}

// Testa se o tunnel esta respondendo (timeout curto de 3s)
$ping = @file_get_contents($tunnelUrl . '/info', false, stream_context_create([
    'http' => [
        'timeout' => 3,
        'method' => 'GET'
    ]
]));

$isOnline = $ping !== false;

if ($isOnline) {
    echo json_encode([
        'status' => 'online',
        'tunnelUrl' => $tunnelUrl,
        'message' => 'GPU online e pronta'
    ]);
} else {
    echo json_encode([
        'status' => 'offline',
        'tunnelUrl' => $tunnelUrl,
        'message' => 'URL registrada mas tunnel nao responde'
    ]);
}
