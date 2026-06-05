<?php
// upload.php - VERSAO LOCAL
// Upload de audios de referencia e trilhas

set_time_limit(0);
ini_set('max_input_time', 0);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Validar API Key
$apiKey = $_SERVER['HTTP_X_API_KEY'] ?? '';
if ($apiKey !== API_KEY) {
    http_response_code(403);
    echo json_encode(['error' => 'API key invalida']);
    exit;
}

// Verificar se e upload
if (empty($_FILES['file'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Nenhum arquivo enviado']);
    exit;
}

$file = $_FILES['file'];
$category = $_POST['category'] ?? 'ref';

if (!in_array($category, ALLOWED_CATEGORIES)) {
    http_response_code(400);
    echo json_encode(['error' => 'Categoria invalida']);
    exit;
}

// Validar tipo MIME
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);

if (!in_array($mime, ALLOWED_TYPES)) {
    http_response_code(400);
    echo json_encode(['error' => 'Tipo de arquivo nao permitido: ' . $mime]);
    exit;
}

// Validar tamanho
if ($file['size'] > MAX_SIZE) {
    http_response_code(400);
    echo json_encode(['error' => 'Arquivo muito grande (max ' . (MAX_SIZE / 1024 / 1024) . 'MB)']);
    exit;
}

// Criar pasta se nao existe
$dir = UPLOAD_DIR . $category . '/';
if (!is_dir($dir)) {
    mkdir($dir, 0755, true);
}

// Gerar nome unico
$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$filename = uniqid('audio_') . '.' . $ext;
$filepath = $dir . $filename;

if (!move_uploaded_file($file['tmp_name'], $filepath)) {
    http_response_code(500);
    echo json_encode(['error' => 'Falha ao salvar arquivo']);
    exit;
}

$url = BASE_URL . '/audios/' . $category . '/' . $filename;
$path = 'audios/' . $category . '/' . $filename;

logUpload("UPLOAD: $filename ($mime, " . round($file['size'] / 1024) . "KB) -> $path");

echo json_encode([
    'ok' => true,
    'url' => $url,
    'path' => $path,
    'filename' => $filename,
    'size' => $file['size'],
    'mime' => $mime
]);
?>
