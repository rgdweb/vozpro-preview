<?php
// update_tunnel.php - Atualiza a URL do tunel no config.php automaticamente
// Chamado pelo script start_tunnel.js apos abrir o localtunnel

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

$simpleAuth = 'vozpro_tunnel_2024';

$auth = $_GET['auth'] ?? '';
if ($auth !== $simpleAuth) {
    http_response_code(403);
    echo json_encode(['error' => 'Acesso negado']);
    exit;
}

$newUrl = $_GET['url'] ?? '';
if (empty($newUrl)) {
    http_response_code(400);
    echo json_encode(['error' => 'URL nao informada']);
    exit;
}

if (!filter_var($newUrl, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    echo json_encode(['error' => 'URL invalida']);
    exit;
}

// Ler config.php atual e trocar a URL
$configFile = __DIR__ . '/config.php';
$content = file_get_contents($configFile);

if ($content === false) {
    http_response_code(500);
    echo json_encode(['error' => 'Falha ao ler config.php']);
    exit;
}

// Substituir HF_SPACE_URL
$oldUrl = null;
if (preg_match("/define\('HF_SPACE_URL',\s*'([^']+)'\)/", $content, $matches)) {
    $oldUrl = $matches[1];
}

$newContent = preg_replace(
    "/define\('HF_SPACE_URL',\s*'[^']+'\)/",
    "define('HF_SPACE_URL', '$newUrl')",
    $content
);

if ($newContent === $content) {
    http_response_code(500);
    echo json_encode(['error' => 'Nao foi possivel atualizar a URL no config']);
    exit;
}

file_put_contents($configFile, $newContent);

// Log
if (function_exists('logUpload')) {
    logUpload("TUNNEL URL atualizada: $oldUrl => $newUrl");
} else {
    $logFile = __DIR__ . '/uploads.log';
    $data = date('Y-m-d H:i:s');
    file_put_contents($logFile, "[$data] TUNNEL URL: $oldUrl => $newUrl\n", FILE_APPEND);
}

echo json_encode([
    'ok' => true,
    'oldUrl' => $oldUrl,
    'newUrl' => $newUrl,
    'timestamp' => date('Y-m-d H:i:s')
]);
?>
