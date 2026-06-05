<?php
// info.php - Diagnostico dos limites PHP do servidor (REMOVER APOS USO!)
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

echo json_encode([
    'upload_max_filesize' => ini_get('upload_max_filesize'),
    'post_max_size' => ini_get('post_max_size'),
    'max_execution_time' => ini_get('max_execution_time'),
    'max_input_time' => ini_get('max_input_time'),
    'memory_limit' => ini_get('memory_limit'),
    'file_uploads' => ini_get('file_uploads'),
    'upload_tmp_dir' => ini_get('upload_tmp_dir'),
    'max_file_uploads' => ini_get('max_file_uploads'),
    'disable_functions' => ini_get('disable_functions'),
    'php_version' => phpversion(),
    'sapi' => php_sapi_name(),
    'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
    'document_root' => $_SERVER['DOCUMENT_ROOT'] ?? 'unknown',
    'htaccess_test' => is_readable(__DIR__ . '/.htaccess'),
    'user_ini_test' => is_readable(__DIR__ . '/.user.ini'),
], JSON_PRETTY_PRINT);
?>
