<?php
// info.php - Diagnostico dos limites PHP do servidor (REMOVER APOS USO!)
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// === FIX PERMISSOES (execute uma vez e delete) ===
if (isset($_GET['fixperms']) && $_GET['fixperms'] === 'vozpro2026') {
    $docRoot = $_SERVER['DOCUMENT_ROOT'];
    $audiosDir = $docRoot . '/audios';
    $dirs = [$audiosDir, "$audiosDir/ref", "$audiosDir/track", "$audiosDir/generated", "$audiosDir/chunks"];
    $results = [];
    $phpUser = get_current_user();

    foreach ($dirs as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0777, true);
        }
        $owner = fileowner($dir);
        $group = filegroup($dir);
        $perms = substr(sprintf('%o', fileperms($dir)), -4);
        $writable = is_writable($dir);

        // Tentar corrigir
        @chmod($dir, 0777);

        // Se www-data existe, tentar chown
        if (function_exists('posix_getpwnam')) {
            $wd = posix_getpwnam('www-data');
            if ($wd) {
                @chown($dir, $wd['uid']);
                @chgrp($dir, $wd['gid']);
            }
        }

        $newPerms = substr(sprintf('%o', fileperms($dir)), -4);
        $newWritable = is_writable($dir);

        // Teste de escrita real
        $testFile = $dir . '/_test_' . time();
        $testWrite = @file_put_contents($testFile, 'x');
        if ($testWrite !== false) @unlink($testFile);

        $results[] = [
            'dir' => str_replace($docRoot, '', $dir),
            'was_writable' => $writable,
            'now_writable' => $newWritable,
            'perms_before' => $perms,
            'perms_after' => $newPerms,
            'write_test' => $testWrite !== false,
            'php_user' => $phpUser,
            'owner_uid' => $owner,
            'group_gid' => $group,
        ];
    }

    echo json_encode(['fix_perms' => $results], JSON_PRETTY_PRINT);
    exit;
}

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
