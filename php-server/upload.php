<?php
// upload.php - Upload de áudios para o VozPro
// Suporta upload normal (arquivo inteiro) E chunked upload (arquivos grandes divididos em pedacos)
// Modo chunked e ativado quando os parametros chunkIndex, totalChunks e fileId estao presentes

set_time_limit(0);
ini_set('max_input_time', 0);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

// Responder preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Só aceitar POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['sucesso' => false, 'erro' => 'Metodo nao permitido']);
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
    logUpload("Tentativa de acesso nao autorizado - IP: " . $_SERVER['REMOTE_ADDR']);
    exit;
}

// Detectar modo: chunked ou normal
$isChunked = isset($_POST['chunkIndex']) && isset($_POST['totalChunks']) && isset($_POST['fileId']);

if ($isChunked) {
    handleChunkedUpload();
} else {
    handleNormalUpload();
}

// ========================
// UPLOAD NORMAL (arquivo inteiro, menor que 4MB)
// ========================
function handleNormalUpload() {
    global $ALLOWED_TYPES, $ALLOWED_CATEGORIES, $MAX_SIZE, $UPLOAD_DIR, $BASE_URL;

    // Pegar categoria
    $tipo = $_POST['tipo'] ?? 'ref';

    if (!in_array($tipo, $ALLOWED_CATEGORIES)) {
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Tipo invalido. Permitidos: ' . implode(', ', $ALLOWED_CATEGORIES)]);
        exit;
    }

    // Validar arquivo enviado
    if (!isset($_FILES['arquivo'])) {
        if (empty($_POST) && $_SERVER['CONTENT_LENGTH'] > 0) {
            http_response_code(400);
            echo json_encode(['sucesso' => false, 'erro' => 'Arquivo excede o limite post_max_size do servidor (' . ini_get('post_max_size') . ')']);
            exit;
        }
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Nenhum arquivo enviado']);
        exit;
    }

    if ($_FILES['arquivo']['error'] !== UPLOAD_ERR_OK) {
        $erros = [
            UPLOAD_ERR_INI_SIZE => 'Arquivo muito grande (limite do servidor: ' . ini_get('upload_max_filesize') . ')',
            UPLOAD_ERR_FORM_SIZE => 'Arquivo muito grande (limite do formulario)',
            UPLOAD_ERR_PARTIAL => 'Arquivo enviado parcialmente - tente novamente',
            UPLOAD_ERR_NO_FILE => 'Nenhum arquivo enviado',
            UPLOAD_ERR_NO_TMP_DIR => 'Pasta temporaria inexistente no servidor',
            UPLOAD_ERR_CANT_WRITE => 'Erro de permissao ao salvar no servidor',
            UPLOAD_ERR_EXTENSION => 'Upload bloqueado por extensao do PHP',
        ];
        $erro = $erros[$_FILES['arquivo']['error']] ?? 'Erro desconhecido no upload (codigo: ' . $_FILES['arquivo']['error'] . ')';
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => $erro]);
        exit;
    }

    $arquivo = $_FILES['arquivo'];

    // Validar tipo MIME
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mimeType = finfo_file($finfo, $arquivo['tmp_name']);
    finfo_close($finfo);

    if (!in_array($mimeType, $ALLOWED_TYPES)) {
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Tipo de arquivo nao permitido. Use WAV, MP3, OGG, FLAC ou M4A']);
        exit;
    }

    // Validar tamanho
    if ($arquivo['size'] > $MAX_SIZE) {
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Arquivo muito grande. Maximo: ' . round($MAX_SIZE / (1024 * 1024)) . 'MB']);
        exit;
    }

    // Criar pasta da categoria
    $pastaCategoria = $UPLOAD_DIR . $tipo . '/';
    if (!is_dir($pastaCategoria)) {
        mkdir($pastaCategoria, 0755, true);
    }

    // Gerar nome unico para o arquivo
    $extensao = strtolower(pathinfo($arquivo['name'], PATHINFO_EXTENSION));
    if (empty($extensao)) {
        $mimeMap = [
            'audio/mpeg' => 'mp3', 'audio/mp3' => 'mp3',
            'audio/wav' => 'wav', 'audio/x-wav' => 'wav',
            'audio/ogg' => 'ogg', 'audio/webm' => 'webm',
            'audio/m4a' => 'm4a', 'audio/x-m4a' => 'm4a',
            'audio/flac' => 'flac', 'audio/x-flac' => 'flac',
        ];
        $extensao = $mimeMap[$mimeType] ?? 'wav';
    }
    $nomeArquivo = uniqid() . '_' . time() . '.' . $extensao;
    $caminhoCompleto = $pastaCategoria . $nomeArquivo;

    if (move_uploaded_file($arquivo['tmp_name'], $caminhoCompleto)) {
        $urlPublica = $BASE_URL . '/audios/' . $tipo . '/' . $nomeArquivo;
        logUpload("Upload OK - Tipo: $tipo, Arquivo: $nomeArquivo, Tamanho: " . $arquivo['size']);

        echo json_encode([
            'sucesso' => true,
            'url' => $urlPublica,
            'arquivo' => $nomeArquivo,
            'tamanho' => $arquivo['size'],
            'tipo' => $mimeType
        ]);
    } else {
        http_response_code(500);
        echo json_encode(['sucesso' => false, 'erro' => 'Erro ao salvar arquivo']);
        logUpload("ERRO ao mover arquivo - Tipo: $tipo");
    }
}

// ========================
// CHUNKED UPLOAD (arquivo dividido em pedacos de ~3MB)
// ========================
function handleChunkedUpload() {
    global $ALLOWED_TYPES, $ALLOWED_CATEGORIES, $MAX_SIZE, $UPLOAD_DIR, $BASE_URL;

    $chunkIndex = (int)$_POST['chunkIndex'];
    $totalChunks = (int)$_POST['totalChunks'];
    $fileName = $_POST['fileName'] ?? '';
    $tipo = $_POST['tipo'] ?? 'track';
    $fileId = $_POST['fileId'] ?? '';

    if ($chunkIndex < 0 || $totalChunks < 1 || empty($fileName) || empty($fileId)) {
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Parametros de chunk invalidos']);
        exit;
    }

    if (!in_array($tipo, $ALLOWED_CATEGORIES)) {
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Tipo invalido. Permitidos: ' . implode(', ', $ALLOWED_CATEGORIES)]);
        exit;
    }

    // Validar extensao
    $extensao = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));
    $extensoesPermitidas = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'webm'];
    if (!in_array($extensao, $extensoesPermitidas)) {
        http_response_code(400);
        echo json_encode(['sucesso' => false, 'erro' => 'Extensao nao permitida']);
        exit;
    }

    // Diretorio temporario para esta sessao de upload
    $chunkDir = $UPLOAD_DIR . 'chunks/' . $fileId . '/';
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

    if (!move_uploaded_file($chunkFile['tmp_name'], $tempChunkPath)) {
        http_response_code(500);
        echo json_encode(['sucesso' => false, 'erro' => 'Erro ao salvar chunk']);
        exit;
    }

    logUpload("Chunk OK: fileId=$fileId, chunk=$chunkIndex/$totalChunks, size=" . $chunkFile['size']);

    // Se e o ultimo chunk, remontar o arquivo
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
            echo json_encode(['sucesso' => false, 'erro' => "Chunks incompletos: $chunksPresentes de $totalChunks"]);
            exit;
        }

        if ($totalSize > $MAX_SIZE) {
            array_map('unlink', glob($chunkDir . '*'));
            @rmdir($chunkDir);
            http_response_code(400);
            echo json_encode(['sucesso' => false, 'erro' => 'Arquivo final muito grande. Maximo: ' . round($MAX_SIZE / (1024 * 1024)) . 'MB']);
            exit;
        }

        // Criar pasta da categoria
        $pastaCategoria = $UPLOAD_DIR . $tipo . '/';
        if (!is_dir($pastaCategoria)) {
            mkdir($pastaCategoria, 0755, true);
        }

        // Gerar nome unico
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

        if (!in_array($mimeType, $ALLOWED_TYPES)) {
            unlink($caminhoFinal);
            array_map('unlink', glob($chunkDir . '*'));
            @rmdir($chunkDir);
            http_response_code(400);
            echo json_encode(['sucesso' => false, 'erro' => 'Tipo invalido apos remontagem: ' . $mimeType]);
            exit;
        }

        // Limpar chunks
        array_map('unlink', glob($chunkDir . '*'));
        @rmdir($chunkDir);
        $chunksParentDir = $UPLOAD_DIR . 'chunks/';
        if (is_dir($chunksParentDir)) {
            @rmdir($chunksParentDir);
        }

        $urlPublica = $BASE_URL . '/audios/' . $tipo . '/' . $nomeArquivo;
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
        // Chunk intermediario - confirmar recebimento
        echo json_encode([
            'sucesso' => true,
            'chunkIndex' => $chunkIndex,
            'status' => 'partial',
            'message' => "Chunk $chunkIndex recebido"
        ]);
    }
}
?>
