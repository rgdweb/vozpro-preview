<?php
/*
 * OmniVoice TTS - Recebe a nova URL do tunnel e atualiza o config.php
 * Chamado automaticamente pelo start_tunnel.ps1 quando o cloudflared inicia
 * Aceita GET (query string) ou POST (JSON body) para max compatibilidade
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Pega a URL do tunnel - aceita POST JSON, POST form, ou GET query param
$tunnelUrl = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    
    if (strpos($contentType, 'application/json') !== false) {
        $input = json_decode(file_get_contents('php://input'), true);
        if (is_array($input)) {
            $tunnelUrl = trim($input['tunnelUrl'] ?? '');
        }
    } else {
        $tunnelUrl = trim($_POST['tunnelUrl'] ?? '');
    }
}

// Se veio vazio por POST, tenta via GET
if (empty($tunnelUrl)) {
    $tunnelUrl = trim($_GET['tunnelUrl'] ?? '');
}

if (empty($tunnelUrl)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'tunnelUrl obrigatorio']);
    exit;
}

// Valida se e URL do cloudflared
if (strpos($tunnelUrl, 'trycloudflare.com') === false) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'URL invalida - esperado trycloudflare.com']);
    exit;
}

// Atualiza o config.php em formato INI
$configFile = __DIR__ . '/config.php';
$now = date('Y-m-d H:i:s');

$configContent = "; Configuracao OmniVoice TTS\n";
$configContent .= "; Atualizado automaticamente pelo start_tunnel.ps1\n";
$configContent .= "tunnel_url = \"" . $tunnelUrl . "\"\n";
$configContent .= "updated_at = \"" . $now . "\"\n";

file_put_contents($configFile, $configContent);

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'status' => 'ok',
    'tunnelUrl' => $tunnelUrl,
    'updated_at' => $now
]);
