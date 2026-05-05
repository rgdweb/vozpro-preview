<?php
/*
 * OmniVoice TTS - Endpoint para pegar a URL do tunnel ativo
 * O frontend testa a conectividade direto (servidores compartilhados
 * como HostGator bloqueiam conexoes HTTPS de saida)
 */

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$configFile = __DIR__ . '/config.php';

if (!file_exists($configFile)) {
    echo json_encode([
        'status' => 'offline',
        'tunnelUrl' => '',
        'message' => 'config.php nao encontrado'
    ]);
    exit;
}

$config = parse_ini_file($configFile);

if ($config === false) {
    echo json_encode([
        'status' => 'offline',
        'tunnelUrl' => '',
        'message' => 'Erro ao ler config.php'
    ]);
    exit;
}

$tunnelUrl = trim($config['tunnel_url'] ?? '');
$updatedAt = trim($config['updated_at'] ?? '');

if (empty($tunnelUrl)) {
    echo json_encode([
        'status' => 'offline',
        'tunnelUrl' => '',
        'message' => 'Nenhuma URL de tunnel registrada. Inicie o iniciar.bat na maquina local.'
    ]);
    exit;
}

// Se tem URL registrada, retorna como "online"
// O frontend testa a conectividade real direto no tunnel
echo json_encode([
    'status' => 'online',
    'tunnelUrl' => $tunnelUrl,
    'updated_at' => $updatedAt,
    'message' => 'GPU online e pronta'
]);
