<?php
/**
 * fix_permissions.php - Corrige permissoes das pastas de upload
 * Execute UMA VEZ e depois delete este arquivo!
 * Acesse: http://147.15.77.137/fix_permissions.php
 */

header('Content-Type: text/plain; charset=utf-8');

// Security: apenas via localhost ou com chave
$auth = $_GET['key'] ?? '';
if ($auth !== 'vozpro_fix_2026') {
    http_response_code(403);
    echo "Acesso negado. Use: http://SEU_SERVIDOR/fix_permissions.php?key=vozpro_fix_2026";
    exit;
}

echo "=== VozPro - Fix Permissoes de Upload ===\n\n";

$webRoot = dirname(__FILE__);
$audiosDir = $webRoot . '/audios';
$phpUser = get_current_user();
$phpUid = function_exists('posix_getuid') ? posix_getuid() : getmyuid();
$phpGid = function_exists('posix_getgid') ? posix_getgid() : getmygid();

echo "PHP User: $phpUser\n";
echo "PHP UID: $phpUid | GID: $phpGid\n\n";

// Tentar descobrir o dono atual das pastas
$dirsToFix = [
    $audiosDir,
    $audiosDir . '/ref',
    $audiosDir . '/track',
    $audiosDir . '/generated',
    $audiosDir . '/chunks',
];

foreach ($dirsToFix as $dir) {
    echo "--- $dir ---\n";
    $exists = is_dir($dir);
    echo "  Existe: " . ($exists ? 'SIM' : 'NAO') . "\n";

    if (!$exists) {
        $created = @mkdir($dir, 0775, true);
        echo "  Criado: " . ($created ? 'SIM' : 'NAO - ' . error_get_last()['message']) . "\n";
    }

    if (is_dir($dir)) {
        $owner = function_exists('posix_getpwuid') ? posix_getpwuid(fileowner($dir)) : null;
        $group = function_exists('posix_getgrgid') ? posix_getgrgid(filegroup($dir)) : null;
        $perms = substr(sprintf('%o', fileperms($dir)), -4);

        echo "  Perms: $perms\n";
        echo "  Owner: " . ($owner ? $owner['name'] . " (uid={$owner['uid']})" : fileowner($dir)) . "\n";
        echo "  Group: " . ($group ? $group['name'] . " (gid={$group['gid']})" : filegroup($dir)) . "\n";
        echo "  Writable: " . (is_writable($dir) ? 'SIM' : 'NAO') . "\n";

        // Tentar corrigir permissao
        @chmod($dir, 0775);
        $newPerms = substr(sprintf('%o', fileperms($dir)), -4);
        echo "  Apos chmod 0775: $newPerms\n";

        // Se www-data existe, tentar chown
        if (function_exists('posix_getpwnam')) {
            $wwwData = posix_getpwnam('www-data');
            if ($wwwData) {
                $chownOk = @chown($dir, $wwwData['uid']);
                $chgrpOk = @chgrp($dir, $wwwData['gid']);
                echo "  chown www-data: " . ($chownOk ? 'OK' : 'FALHOU (precisa de sudo)') . "\n";
                echo "  chgrp www-data: " . ($chgrpOk ? 'OK' : 'FALHOU (precisa de sudo)') . "\n";
            }
        }

        // Teste de escrita real
        $testFile = $dir . '/_permission_test_' . time() . '.txt';
        $written = @file_put_contents($testFile, 'test ' . date('Y-m-d H:i:s'));
        if ($written !== false) {
            echo "  TESTE ESCRITA: OK ($written bytes)\n";
            @unlink($testFile);
        } else {
            echo "  TESTE ESCRITA: FALHOU!\n";
            echo "  >>> PRECISA RODAR NO TERMINAL DO SERVIDOR:\n";
            echo "  >>> sudo chown -R www-data:www-data $dir\n";
            echo "  >>> sudo chmod -R 775 $dir\n";
        }
    }
    echo "\n";
}

echo "=== Verificacao Final ===\n";
// Teste completo de upload
$testDir = $audiosDir . '/ref/';
if (is_writable($testDir)) {
    $testFile = $testDir . 'test_' . time() . '.txt';
    @file_put_contents($testFile, 'UPLOAD TEST OK');
    echo "Upload funcionaria: SIM\n";
    @unlink($testFile);
} else {
    echo "Upload funcionaria: NAO\n";
    echo "\n*** RODE NO TERMINAL DO SERVIDOR (SSH): ***\n";
    echo "sudo chown -R www-data:www-data $audiosDir\n";
    echo "sudo chmod -R 775 $audiosDir\n";
}

echo "\n=== FIM ===\n";
echo "IMPORTANTE: Delete este arquivo apos usar!\n";
?>
