<?php
// get_tunnel.php - Returns current tunnel URL
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$configFile = __DIR__ . '/tunnel-config.ini';
$url = '';

if (file_exists($configFile)) {
    $lines = file($configFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    foreach ($lines as $line) {
        $line = trim($line);
        if (strpos($line, '#') === 0) continue;
        if (preg_match('/^tunnel_url\s*=\s*(.*)$/', $line, $m)) {
            $url = trim($m[1]);
            break;
        }
    }
}

if (!empty($url)) {
    echo json_encode(['status' => 'online', 'tunnelUrl' => $url]);
} else {
    http_response_code(503);
    echo json_encode(['status' => 'offline', 'message' => 'Tunnel URL not configured']);
}
