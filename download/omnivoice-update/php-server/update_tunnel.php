<?php
/*
 * OmniVoice TTS - Recebe a nova URL do tunnel e atualiza o config.php
 * Chamado automaticamente pelo start_tunnel.ps1 quando o cloudflared inicia
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Use POST']);
    exit;
}

// Pega a URL do tunnel do body
$input = json_decode(file_get_contents('php://input'), true);
$tunnelUrl = trim($input['tunnelUrl'] ?? '');

if (empty($tunnelUrl)) {
    http_response_code(400);
    echo json_encode(['error' => 'tunnelUrl obrigatorio']);
    exit;
}

// Valida se é URL do cloudflared
if (!str_contains($tunnelUrl, 'trycloudflare.com')) {
    http_response_code(400);
    echo json_encode(['error' => 'URL invalida - esperado trycloudflare.com']);
    exit;
}

// Atualiza o config.php
$configFile = __DIR__ . '/config.php';

$configContent = "<?php\n";
$configContent .= "/* Configuracao OmniVoice TTS - Atualizado automaticamente */\n";
$configContent .= "return [\n";
$configContent .= "    'tunnel_url' => '" . addslashes($tunnelUrl) . "',\n";
$configContent .= "    'updated_at' => '" . date('Y-m-d H:i:s') . "',\n";
$configContent .= "];\n";

file_put_contents($configFile, $configContent);

echo json_encode([
    'status' => 'ok',
    'tunnelUrl' => $tunnelUrl,
    'updated_at' => date('Y-m-d H:i:s')
]);
