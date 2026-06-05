<?php
// Script temporario para copiar .htaccess do pai
// EXECUTAR UMA VEZ E DEPOIS APAGAR

$novo_htaccess = <<<'HTACCESS'
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /sorteiomax_min/

    # Excluir /omnivoice/ de qualquer reescrita
    RewriteCond %{REQUEST_URI} ^/omnivoice/
    RewriteRule ^ - [L]

    # Redirecionar para index.php se nao for um arquivo ou diretorio existente
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . index.php [L]
</IfModule>

# Configuracoes de seguranca
<Files "data/*.json">
    Order allow,deny
    Deny from all
</Files>

# Habilitar exibicao de erros
php_flag display_errors on
php_value error_reporting E_ALL
HTACCESS;

// Tenta escrever no pai
$parent_path = dirname(__DIR__) . '/.htaccess';
$result = @file_put_contents($parent_path, $novo_htaccess);

if ($result !== false) {
    echo json_encode(['sucesso' => true, 'mensagem' => '.htaccess do pai atualizado!']);
} else {
    echo json_encode(['sucesso' => false, 'erro' => 'Nao conseguiu escrever no .htaccess do pai (permissao)']);
}
