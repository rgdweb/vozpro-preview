<?php
// cleanup.php - Limpar arquivos temporários do VozPro
// Remove: chunks abandonados, arquivos generated antigos
// Chamado automaticamente pelo frontend ou via cron

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Responder preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Carregar configuracoes
require_once __DIR__ . '/config.php';

// Validar API Key
$headers = getallheaders();
$authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$apiKey = str_replace('Bearer ', '', $authHeader);

if ($apiKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['sucesso' => false, 'erro' => 'Nao autorizado']);
    exit;
}

$uploadDir = defined('UPLOAD_DIR') ? UPLOAD_DIR : __DIR__ . '/audios/';
$resultados = [
    'chunks_removidos' => 0,
    'chunks_espaco_liberado' => 0,
    'generated_removidos' => 0,
    'generated_espaco_liberado' => 0,
];

// ============================================
// 1. Limpar chunks abandonados (> 2 horas)
// ============================================
$chunksDir = $uploadDir . 'chunks/';
if (is_dir($chunksDir)) {
    $tempoLimite = time() - (2 * 60 * 60); // 2 horas
    
    $diretorios = scandir($chunksDir);
    foreach ($diretorios as $dir) {
        if ($dir === '.' || $dir === '..') continue;
        
        $dirPath = $chunksDir . $dir . '/';
        if (!is_dir($dirPath)) continue;
        
        // Verificar idade do diretório (usando o arquivo mais antigo dentro)
        $arquivos = glob($dirPath . '*');
        if (empty($arquivos)) {
            // Diretório vazio, remover
            @rmdir($dirPath);
            $resultados['chunks_removidos']++;
            continue;
        }
        
        // Usar mtime do diretório como referencia
        $dirMtime = filemtime($dirPath);
        
        if ($dirMtime < $tempoLimite) {
            $espaco = 0;
            foreach ($arquivos as $arquivo) {
                $espaco += filesize($arquivo);
                @unlink($arquivo);
            }
            @rmdir($dirPath);
            $resultados['chunks_removidos']++;
            $resultados['chunks_espaco_liberado'] += $espaco;
            
            logUpload("Cleanup: Chunk abandonado removido - $dir (" . round($espaco / 1024, 1) . "KB)");
        }
    }
}

// ============================================
// 2. Limpar arquivos em audios/generated/ (> 1 hora)
// ============================================
$generatedDir = $uploadDir . 'generated/';
if (is_dir($generatedDir)) {
    $tempoLimite = time() - (1 * 60 * 60); // 1 hora
    
    $arquivos = glob($generatedDir . '*');
    foreach ($arquivos as $arquivo) {
        if (!is_file($arquivo)) continue;
        
        if (filemtime($arquivo) < $tempoLimite) {
            $espaco = filesize($arquivo);
            $nomeArquivo = basename($arquivo);
            
            if (unlink($arquivo)) {
                $resultados['generated_removidos']++;
                $resultados['generated_espaco_liberado'] += $espaco;
                logUpload("Cleanup: Generated removido - $nomeArquivo (" . round($espaco / 1024, 1) . "KB)");
            }
        }
    }
}

// ============================================
// 3. Informações de uso do disco
// ============================================
$espacoTotal = 0;
$contagemArquivos = 0;
$categorias = ['ref', 'track', 'generated'];

foreach ($categorias as $cat) {
    $catDir = $uploadDir . $cat . '/';
    if (is_dir($catDir)) {
        $arquivos = glob($catDir . '*');
        foreach ($arquivos as $arquivo) {
            if (is_file($arquivo)) {
                $espacoTotal += filesize($arquivo);
                $contagemArquivos++;
            }
        }
    }
}

$resultados['espaco_total_usado'] = $espacoTotal;
$resultados['espaco_total_formatado'] = formatarBytes($espacoTotal);
$resultados['total_arquivos_permanentes'] = $contagemArquivos;

logUpload("Cleanup executado - Chunks: {$resultados['chunks_removidos']}, Generated: {$resultados['generated_removidos']}");

echo json_encode([
    'sucesso' => true,
    'limpou' => ($resultados['chunks_removidos'] + $resultados['generated_removidos']) > 0,
    'detalhes' => $resultados,
    'espaco_liberado' => formatarBytes($resultados['chunks_espaco_liberado'] + $resultados['generated_espaco_liberado']),
]);

function formatarBytes($bytes) {
    if ($bytes === 0) return '0 B';
    $unidades = ['B', 'KB', 'MB', 'GB'];
    $i = floor(log($bytes, 1024));
    return round($bytes / pow(1024, $i), 1) . ' ' . $unidades[$i];
}
?>
