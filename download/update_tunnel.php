<?php
/**
 * VozPro TTS - Recebe a nova URL do tunnel e salva em tunnel-config.ini
 * Chamado pelo start_tunnel.ps1 quando o cloudflared inicia
 * NAO sobreescreve o config.php principal (usa tunnel-config.ini separado)
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Pega a URL do tunnel
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

if (empty($tunnelUrl)) {
    $tunnelUrl = trim($_GET['tunnelUrl'] ?? '');
}

// Aceita tambem param 'url' (usado pelo start_tunnel.ps1)
if (empty($tunnelUrl)) {
    $tunnelUrl = trim($_GET['url'] ?? '');
}

if (empty($tunnelUrl)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'tunnelUrl obrigatorio']);
    exit;
}

// Valida se e URL do tunnel valido (cloudflared, localtunnel ou localhost)
$isValid = (
    strpos($tunnelUrl, 'trycloudflare.com') !== false ||
    strpos($tunnelUrl, 'loca.lt') !== false ||
    strpos($tunnelUrl, 'localhost') !== false ||
    strpos($tunnelUrl, '127.0.0.1') !== false
);

if (!$isValid) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'URL invalida - esperado trycloudflare.com ou loca.lt']);
    exit;
}

// Salva em tunnel-config.ini (separado do config.php principal)
$iniFile = __DIR__ . '/tunnel-config.ini';
$now = date('Y-m-d H:i:s');

$iniContent = "; Configuracao do Tunnel VozPro\n";
$iniContent .= "; Atualizado automaticamente pelo cloudflared\n";
$iniContent .= "tunnel_url = \"$tunnelUrl\"\n";
$iniContent .= "updated_at = \"$now\"\n";

file_put_contents($iniFile, $iniContent);

header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'ok' => true,
    'status' => 'ok',
    'tunnelUrl' => $tunnelUrl,
    'updated_at' => $now
]);
