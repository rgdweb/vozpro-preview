<?php
// ============================================================
// Configuracao OmniVoice TTS
// IMPORTANTE: TUNNEL_URL e TUNNEL_UPDATED_AT sao atualizados pelo start_tunnel.ps1
// NAO remova essas linhas!
// ============================================================

// --- TUNNEL (atualizado automaticamente pelo start_tunnel.ps1) ---
define('TUNNEL_URL', 'https://introduce-laden-orbit-vids.trycloudflare.com');
define('TUNNEL_UPDATED_AT', '2026-05-14 11:58:44');

// --- API ---
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');

// --- URLs ---
define('BASE_URL', 'https://sorteiomax.com.br/omnivoice');
define('HF_SPACE_URL', 'https://hereby-shopper-aid-producer.trycloudflare.com');

// --- Upload ---
define('UPLOAD_DIR', __DIR__ . '/audios/');
define('MAX_SIZE', 52428800); // 50MB
define('ALLOWED_TYPES', [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a',
    'audio/flac', 'audio/x-flac', 'audio/mp4',
]);
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);

// --- Log ---
define('ENABLE_LOGS', true);
define('LOG_FILE', __DIR__ . '/uploads.log');

/**
 * Funcao de log usada por upload.php e delete.php
 * CORRECAO: Esta funcao faltava no config.php do servidor,
 * causando Fatal Error em upload.php:142 e delete.php:71
 */
function logUpload($mensagem) {
    if (defined('ENABLE_LOGS') && ENABLE_LOGS) {
        $logFile = defined('LOG_FILE') ? LOG_FILE : __DIR__ . '/uploads.log';
        $data = date('Y-m-d H:i:s');
        @file_put_contents($logFile, "[$data] $mensagem\n", FILE_APPEND);
    }
}
?>
