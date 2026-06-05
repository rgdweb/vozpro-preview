<?php
// Tenta mover/copiar .htaccess pro diretorio pai
$parent = dirname(__DIR__);

// Metodo 1: rename (se o .htaccess novo estiver aqui)
$novo = __DIR__ . '/.htaccess_pai';
if (file_exists($novo)) {
    $ok = copy($novo, $parent . '/.htaccess');
    echo "Metodo copy: " . ($ok ? "OK" : "FALHOU") . "\n";
    echo "Erro: " . (error_get_last()['message'] ?? 'nenhum') . "\n";
    echo "Parent writable: " . (is_writable($parent) ? 'SIM' : 'NAO') . "\n";
    echo "Owner parent: " . (function_exists('posix_getpwuid') ? posix_getpwuid(fileowner($parent))['name'] : fileowner($parent)) . "\n";
    echo "Current user: " . (function_exists('posix_getpwuid') ? posix_getpwuid(posix_geteuid())['name'] : get_current_user()) . "\n";
} else {
    echo ".htaccess_pai nao encontrado\n";
}

// Listar arquivos no pai
echo "Arquivos no parent:\n";
$files = @scandir($parent);
if ($files) {
    foreach ($files as $f) {
        echo "  $f\n";
    }
}
