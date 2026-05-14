<?php
// config.php - Configuracoes do servidor de audios OmniVoice
// CORRECAO (15/05/2026): Adicionada constante LOG_FILE e funcao logUpload() robusta
// com @file_put_contents para evitar Fatal Error quando log dir nao tem permissao

// Chave de API para autenticacao (ALTERE PARA UMA CHAVE FORTE!)
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');

// URL base do servidor (ALTERE PARA SEU DOMINIO!)
define('BASE_URL', 'https://sorteiomax.com.br/omnivoice');

// Tipos de arquivos permitidos (apenas audio)
define('ALLOWED_TYPES', [
    'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a',
    'audio/flac', 'audio/x-flac'
]);

// Tamanho maximo em bytes (50MB)
define('MAX_SIZE', 50 * 1024 * 1024);

// Pasta raiz dos uploads
define('UPLOAD_DIR', __DIR__ . '/audios/');

// Tipos permitidos de upload
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);

// URL do HuggingFace Space OmniVoice (fallback)
define('HF_SPACE_URL', 'https://hereby-shopper-aid-producer.trycloudflare.com');

// Habilitar logs
define('ENABLE_LOGS', true);
define('LOG_FILE', __DIR__ . '/uploads.log');

// Funcao para log (usada por upload.php e delete.php)
// CORRECAO: Adicionado @ para evitar erro quando arquivo de log nao pode ser escrito
function logUpload($mensagem) {
    if (defined('ENABLE_LOGS') && ENABLE_LOGS) {
        $logFile = defined('LOG_FILE') ? LOG_FILE : __DIR__ . '/uploads.log';
        $data = date('Y-m-d H:i:s');
        @file_put_contents($logFile, "[$data] $mensagem\n", FILE_APPEND);
    }
}
?>
