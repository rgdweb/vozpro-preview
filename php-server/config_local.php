<?php
// config.php - LOCAL (sem tunnel, sem HostGator)
// PHP roda na mesma maquina que a GPU = tudo via localhost

// Chave de API (mantida para compatibilidade)
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');

// URL base local
define('BASE_URL', 'http://localhost:8080');

// GPU LOCAL - DIRETO, SEM TUNNEL!
define('HF_SPACE_URL', 'http://localhost:7860');

// Tipos de arquivos permitidos
define('ALLOWED_TYPES', [
    'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a',
    'audio/flac', 'audio/x-flac'
]);

// Tamanho maximo (50MB)
define('MAX_SIZE', 50 * 1024 * 1024);

// Pasta de uploads local
define('UPLOAD_DIR', __DIR__ . '/audios/');

// Categorias permitidas
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);

// Habilitar logs
define('ENABLE_LOGS', true);

function logUpload($mensagem) {
    if (ENABLE_LOGS) {
        $logFile = __DIR__ . '/uploads.log';
        $data = date('Y-m-d H:i:s');
        file_put_contents($logFile, "[$data] $mensagem\n", FILE_APPEND);
    }
}
?>
