<?php
// config.php - Configurações do servidor de áudios VozPro

// Chave de API para autenticação (ALTERE PARA UMA CHAVE FORTE!)
define('API_KEY', 'omnivoice_api_key_2026_secure');

// URL base do servidor (ALTERE PARA SEU DOMÍNIO!)
define('BASE_URL', 'https://api.cvmnews.com.br');

// Tipos de arquivos permitidos (apenas áudio)
define('ALLOWED_TYPES', [
    'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a',
    'audio/flac', 'audio/x-flac'
]);

// Tamanho máximo em bytes (50MB)
define('MAX_SIZE', 50 * 1024 * 1024);

// Pasta raiz dos uploads
define('UPLOAD_DIR', __DIR__ . '/audios/');

// Tipos permitidos de upload
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);

// URL do HuggingFace Space VozPro (usado pelo generate.php)
define('HF_SPACE_URL', 'https://hereby-shopper-aid-producer.trycloudflare.com');

// Habilitar logs
define('ENABLE_LOGS', true);

// Função para log
function logUpload($mensagem) {
    if (ENABLE_LOGS) {
        $logFile = __DIR__ . '/uploads.log';
        $data = date('Y-m-d H:i:s');
        file_put_contents($logFile, "[$data] $mensagem\n", FILE_APPEND);
    }
}
?>
