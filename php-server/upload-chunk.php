<?php
// upload-chunk.php - Recebe chunks de upload e remonta o arquivo final
// Permite bypassar o limite de 4MB do Vercel dividindo o arquivo em pedacos

set_time_limit(0);
ini_set('max_input_time', 0);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Responder preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// So aceitar POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['sucesso' => false, 'erro' => 'Metodo nao permitido']);
    exit;
}

// Validar API Key (server-to-server, mesma chave do upload.php)
$headers = getallheaders();
$authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$apiKey = str_replace('Bearer ', '', $authHeader);

if ($apiKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['sucesso' => false, 'erro' => 'Nao autorizado']);
    logUpload("Chunk upload negado: API key invalida - IP: " . $_SERVER['REMOTE_ADDR']);
    exit;
}

// === Parametros esperados ===
// chunkIndex (int): indice do chunk atual (0-based)
// totalChunks (int): total de chunks
// fileName (string): nome final do arquivo (com extensao)
// tipo (string): categoria (ref, track, generated)
// fileId (string): ID unico da sessao de upload (gerado pelo frontend)
// chunkData (file): blob binario do chunk

$chunkIndex = isset($_POST['chunkIndex']) ? (int)$_POST['chunkIndex'] : -1;
$totalChunks = isset($_POST['totalChunks']) ? (int)$_POST['totalChunks'] : -1;
$fileName = $_POST['fileName'] ?? '';
$tipo = $_POST['tipo'] ?? 'track';
$fileId = $_POST['fileId'] ?? '';

// Validacao basica
if ($chunkIndex < 0 || $totalChunks < 1 || empty($fileName) || empty($fileId)) {
    http_response_code(400);
    echo json_encode(['sucesso' => false, 'erro' => 'Parametros invalidos (chunkIndex, totalChunks, fileName, fileId)']);
    exit;
}

if (!in_array($tipo, ALLOWED_CATEGORIES)) {
    http_response_code(400);
    echo json_encode(['sucesso' => false, 'erro' => 'Tipo invalido. Permitidos: ' . implode(', ', ALLOWED_CATEGORIES)]);
    exit;
}

// Validar extensao do arquivo
$extensao = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
$extensoesPermitidas = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm'];
if (!in_array($extensao, $extensoesPermitidas)) {
    http_response_code(400);
    echo json_encode(['sucesso' => false, 'erro' => 'Extensao nao permitida. Use MP3, WAV, OGG, FLAC, M4A ou WEBM.']);
    exit;
}

// Diretorio temporario para esta sessao de upload
$chunkDir = UPLOAD_DIR . 'chunks/' . $fileId . '/';

// Criar diretorio se necessario
if (!is_dir($chunkDir)) {
    mkdir($chunkDir, 0755, true);
}

// Receber o chunk
if (!isset($_FILES['chunkData']) || $_FILES['chunkData']['error'] !== UPLOAD_ERR_OK) {
    $erroMsg = 'Erro ao receber chunk';
    if (isset($_FILES['chunkData'])) {
        $erros = [
            UPLOAD_ERR_INI_SIZE => 'Chunk muito grande (limite do servidor)',
            UPLOAD_ERR_PARTIAL => 'Chunk enviado parcialmente',
            UPLOAD_ERR_NO_FILE => 'Nenhum chunk recebido',
        ];
        $erroMsg = $erros[$_FILES['chunkData']['error']] ?? $erroMsg;
    }
    http_response_code(400);
    echo json_encode(['sucesso' => false, 'erro' => $erroMsg]);
    exit;
}

$chunkFile = $_FILES['chunkData'];
$tempChunkPath = $chunkDir . sprintf('%06d', $chunkIndex);

// Salvar o chunk
if (!move_uploaded_file($chunkFile['tmp_name'], $tempChunkPath)) {
    http_response_code(500);
    echo json_encode(['sucesso' => false, 'erro' => 'Erro ao salvar chunk no servidor']);
    exit;
}

logUpload("Chunk recebido: fileId=$fileId, chunk=$chunkIndex/$totalChunks, size=" . $chunkFile['size']);

// === Se e o ultimo chunk, remontar o arquivo ===
if ($chunkIndex === $totalChunks - 1) {
    // Verificar se todos os chunks estao presentes
    $chunksPresentes = 0;
    $totalSize = 0;
    for ($i = 0; $i < $totalChunks; $i++) {
        $chunkPath = $chunkDir . sprintf('%06d', $i);
        if (file_exists($chunkPath)) {
            $chunksPresentes++;
            $totalSize += filesize($chunkPath);
        }
    }

    if ($chunksPresentes !== $totalChunks) {
        http_response_code(400);
        echo json_encode([
            'sucesso' => false,
            'erro' => "Chunks incompletos: recebidos $chunksPresentes de $totalChunks"
        ]);
        exit;
    }

    // Validar tamanho total
    if ($totalSize > MAX_SIZE) {
        // Limpar chunks
        array_map('unlink', glob($chunkDir . '*'));
        rmdir($chunkDir);
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Arquivo final muito grande. Maximo: ' . round(MAX_SIZE / (1024 * 1024)) . 'MB']);
        exit;
    }

    // Criar pasta da categoria
    $pastaCategoria = UPLOAD_DIR . $tipo . '/';
    if (!is_dir($pastaCategoria)) {
        mkdir($pastaCategoria, 0755, true);
    }

    // Gerar nome unico para o arquivo final
    $nomeArquivo = uniqid() . '_' . time() . '.' . $extensao;
    $caminhoFinal = $pastaCategoria . $nomeArquivo;

    // Remontar: concatenar todos os chunks em ordem
    $finalFile = fopen($caminhoFinal, 'wb');
    if (!$finalFile) {
        http_response_code(500);
        echo json_encode(['sucesso' => false, 'erro' => 'Erro ao criar arquivo final']);
        exit;
    }

    for ($i = 0; $i < $totalChunks; $i++) {
        $chunkPath = $chunkDir . sprintf('%06d', $i);
        $chunkData = file_get_contents($chunkPath);
        fwrite($finalFile, $chunkData);
    }
    fclose($finalFile);

    // Validar tipo MIME do arquivo remontado
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $caminhoFinal);
    finfo_close($finfo);

    if (!in_array($mimeType, ALLOWED_TYPES)) {
        // Remover arquivo e chunks
        unlink($caminhoFinal);
        array_map('unlink', glob($chunkDir . '*'));
        rmdir($chunkDir);
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Tipo de arquivo nao permitido apos remontagem: ' . $mimeType]);
        exit;
    }

    // Limpar chunks
    array_map('unlink', glob($chunkDir . '*'));
    if (is_dir($chunkDir)) {
        rmdir($chunkDir);
    }
    // Limpar dir chunks se vazio
    $chunksDir = UPLOAD_DIR . 'chunks/';
    if (is_dir($chunksDir)) {
        @rmdir($chunksDir);
    }

    $urlPublica = BASE_URL . '/audios/' . $tipo . '/' . $nomeArquivo;
    $tamanhoMB = round($totalSize / (1024 * 1024), 2);

    logUpload("Upload chunked COMPLETO - Tipo: $tipo, Arquivo: $nomeArquivo, Tamanho: {$tamanhoMB}MB, Chunks: $totalChunks");

    echo json_encode([
        'sucesso' => true,
        'url' => $urlPublica,
        'arquivo' => $nomeArquivo,
        'tamanho' => $totalSize,
        'tipo' => $mimeType,
        'chunked' => true,
        'chunks' => $totalChunks
    ]);
} else {
    // Nao e o ultimo chunk, confirmar recebimento
    echo json_encode([
        'sucesso' => true,
        'chunkIndex' => $chunkIndex,
        'status' => 'partial',
        'message' => "Chunk $chunkIndex recebido com sucesso"
    ]);
}
?>
