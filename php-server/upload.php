<?php
// upload.php - Upload de áudios para o VozPro

// Remover limites de tempo para uploads grandes (funciona mesmo se .htaccess for ignorado)
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

// Pegar categoria
$tipo = $_POST['tipo'] ?? 'ref';

// Validar tipo
if (!in_array($tipo, ALLOWED_CATEGORIES)) {
    http_response_code(400);
    echo json_encode(['sucesso' => false, 'erro' => 'Tipo invalido. Permitidos: ' . implode(', ', ALLOWED_CATEGORIES)]);
    exit;
}

// Validar arquivo enviado
if (!isset($_FILES['arquivo'])) {
    // Se $_FILES esta vazio, pode ser que post_max_size foi excedido
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

if (!in_array($mimeType, ALLOWED_TYPES)) {
    http_response_code(400);
    echo json_encode(['sucesso' => false, 'erro' => 'Tipo de arquivo nao permitido. Use WAV, MP3, OGG, FLAC ou M4A']);
    exit;
}

// Validar tamanho
if ($arquivo['size'] > MAX_SIZE) {
    http_response_code(400);
    echo json_encode(['sucesso' => false, 'erro' => 'Arquivo muito grande. Maximo: 20MB']);
    exit;
}

// Criar pasta da categoria
$pastaCategoria = UPLOAD_DIR . $tipo . '/';
if (!is_dir($pastaCategoria)) {
    mkdir($pastaCategoria, 0755, true);
}

// Gerar nome unico para o arquivo
$extensao = strtolower(pathinfo($arquivo['name'], PATHINFO_EXTENSION));
if (empty($extensao)) {
    // Detectar extensao pelo MIME type
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

// Mover arquivo
if (move_uploaded_file($arquivo['tmp_name'], $caminhoCompleto)) {
    $urlPublica = BASE_URL . '/audios/' . $tipo . '/' . $nomeArquivo;

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
?>
