<?php
/**
 * OmniVoice TTS - Endpoint para retornar a URL do tunnel ativo
 * Le do tunnel-config.ini (separado do config.php principal para nao conflitar)
 * Se o INI nao existir, tenta o HF_SPACE_URL do config.php como fallback
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

// 1. Tentar ler do tunnel-config.ini (atualizado pelo start_tunnel.ps1 / cloudflared)
$tunnelUrl = '';
$updatedAt = '';

$iniFile = __DIR__ . '/tunnel-config.ini';
if (file_exists($iniFile)) {
    $ini = parse_ini_file($iniFile);
    if ($ini !== false) {
        $tunnelUrl = trim($ini['tunnel_url'] ?? '');
        $updatedAt = trim($ini['updated_at'] ?? '');
    }
}

// 2. Fallback: tentar do config.php principal (HF_SPACE_URL)
if (empty($tunnelUrl)) {
    require_once __DIR__ . '/config.php';
    if (defined('HF_SPACE_URL') && !empty(HF_SPACE_URL)) {
        $tunnelUrl = HF_SPACE_URL;
        $updatedAt = 'fallback_config';
    }
}

if (empty($tunnelUrl)) {
    echo json_encode([
        'status' => 'offline',
        'tunnelUrl' => '',
        'message' => 'Nenhuma URL de tunnel registrada. Inicie o cloudflared na maquina local.'
    ]);
    exit;
}

echo json_encode([
    'status' => 'online',
    'tunnelUrl' => $tunnelUrl,
    'updated_at' => $updatedAt,
    'message' => 'GPU online e pronta'
]);
