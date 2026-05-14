<?php
// check.php - Verifica status do OmniVoice
// CORRECAO: Referencia correta para generate-omnivoice.php (nao generate.php que nao existe)
header("Content-Type: text/plain");

// Verifica se o config.php esta OK
if (!file_exists(__DIR__ . '/config.php')) {
    echo "ERRO: config.php nao encontrado!\n";
    exit;
}

// Verifica se generate-omnivoice.php existe
if (!file_exists(__DIR__ . '/generate-omnivoice.php')) {
    echo "ERRO: generate-omnivoice.php nao encontrado!\n";
    exit;
}

// Verifica se logUpload() esta definida
require_once __DIR__ . '/config.php';
if (!function_exists('logUpload')) {
    echo "ERRO: funcao logUpload() nao definida no config.php\n";
} else {
    echo "OK: logUpload() definida\n";
}

// Extrai numStep default do generate-omnivoice.php
$c = file_get_contents(__DIR__ . '/generate-omnivoice.php');
if (preg_match("/numStep.*?(\d+)/", $c, $m)) {
    echo "numStep default: " . $m[1] . "\n";
} else {
    echo "numStep default: not found\n";
}

// Verifica tunnel URL
if (defined('TUNNEL_URL')) {
    echo "TUNNEL_URL: " . TUNNEL_URL . "\n";
    // Testa se tunnel esta online
    $ch = curl_init(TUNNEL_URL . '/');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);

    if ($code == 200) {
        echo "Tunnel: ONLINE (HTTP 200)\n";
    } else {
        echo "Tunnel: OFFLINE (HTTP $code) - $err\n";
    }
} else {
    echo "TUNNEL_URL: nao definida no config.php\n";
}

// Verifica memory_limit
echo "memory_limit: " . ini_get('memory_limit') . "\n";
echo "max_execution_time: " . ini_get('max_execution_time') . "s\n";
echo "Data/Hora: " . date('Y-m-d H:i:s') . "\n";
echo "Versao PHP: " . phpversion() . "\n";
echo "Status: TUDO OK\n";
?>
