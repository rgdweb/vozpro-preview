<?php
/**
 * VozPro TTS - Recebe a nova URL do tunnel e salva em tunnel-config.ini
 * Chamado pelo start_tunnel.ps1 quando o cloudflared inicia
 * NAO sobreescreve o config.php principal (usa tunnel-config.ini separado)
 * 
 * COMPATÍVEL com start_tunnel.ps1 existente:
 *   GET ?auth=vozpro_tunnel_2024&url=https://...
 *   Responde: {ok: true, oldUrl: '...', newUrl: '...'}
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// ===================== AUTH (compatível com start_tunnel.ps1) =====================
$simpleAuth = 'vozpro_tunnel_2024';

// Pegar a URL do tunnel (suporta formato antigo E novo)
$tunnelUrl = '';

// Formato NOVO: POST JSON {tunnelUrl: "..."}
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (strpos($contentType, 'application/json') !== false) {
        $input = json_decode(file_get_contents('php://input'), true);
        if (is_array($input)) {
            $tunnelUrl = trim($input['tunnelUrl'] ?? $input['url'] ?? '');
        }
    } else {
        $tunnelUrl = trim($_POST['tunnelUrl'] ?? $_POST['url'] ?? '');
    }
}

// Formato ANTIGO: GET ?auth=...&url=... (usado pelo start_tunnel.ps1)
if (empty($tunnelUrl)) {
    $tunnelUrl = trim($_GET['url'] ?? '');
}

// Auth via GET (start_tunnel.ps1 envia assim)
$auth = $_GET['auth'] ?? '';
if (!empty($auth) && $auth !== $simpleAuth) {
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Acesso negado', 'ok' => false]);
    exit;
}

if (empty($tunnelUrl)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'URL nao informada', 'ok' => false]);
    exit;
}

// Validação básica da URL
if (!filter_var($tunnelUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'URL invalida', 'ok' => false]);
    exit;
}

// ===================== SALVAR EM tunnel-config.ini =====================
$iniFile = __DIR__ . '/tunnel-config.ini';
$oldUrl = '';

// Ler URL antiga
if (file_exists($iniFile)) {
    $oldIni = parse_ini_file($iniFile);
    if ($oldIni !== false) {
        $oldUrl = trim($oldIni['tunnel_url'] ?? '');
    }
}

$now = date('Y-m-d H:i:s');
$iniContent = "; Configuracao do Tunnel VozPro\n";
$iniContent .= "; Atualizado automaticamente pelo cloudflared\n";
$iniContent .= "tunnel_url = \"$tunnelUrl\"\n";
$iniContent .= "updated_at = \"$now\"\n";

file_put_contents($iniFile, $iniContent);

// Log
if (function_exists('logUpload')) {
    logUpload("TUNNEL URL atualizada: $oldUrl => $tunnelUrl");
} else {
    $logFile = __DIR__ . '/uploads.log';
    $data = date('Y-m-d H:i:s');
    @file_put_contents($logFile, "[$data] TUNNEL URL: $oldUrl => $tunnelUrl\n", FILE_APPEND);
}

// ===================== RESPOSTA (compatível com start_tunnel.ps1) =====================
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'ok' => true,                    // start_tunnel.ps1 verifica resp.ok
    'status' => 'ok',                // formato novo
    'oldUrl' => $oldUrl,             // start_tunnel.ps1 usa resp.oldUrl
    'newUrl' => $tunnelUrl,          // start_tunnel.ps1 usa resp.newUrl
    'tunnelUrl' => $tunnelUrl,       // formato novo
    'updated_at' => $now
]);
