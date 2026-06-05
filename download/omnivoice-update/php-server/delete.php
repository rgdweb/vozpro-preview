<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    echo json_encode(['sucesso' => false, 'erro' => 'Metodo nao permitido']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!$input || empty($input['arquivo'])) {
    echo json_encode(['sucesso' => false, 'erro' => 'Nome do arquivo nao informado']);
    exit;
}

$arquivo = basename($input['arquivo']);
$tipo = isset($input['tipo']) ? $input['tipo'] : 'ref';

// Validar tipo
if (!in_array($tipo, ['ref', 'track'])) {
    echo json_encode(['sucesso' => false, 'erro' => 'Tipo invalido']);
    exit;
}

// Diretorio base
$baseDir = __DIR__;

if ($tipo === 'ref') {
    $caminho = $baseDir . '/audios/ref/' . $arquivo;
} else {
    $caminho = $baseDir . '/audios/tracks/' . $arquivo;
}

// Seguranca: nao permitir path traversal
if (strpos($arquivo, '..') !== false || strpos($arquivo, '/') !== false || strpos($arquivo, '\\') !== false) {
    echo json_encode(['sucesso' => false, 'erro' => 'Nome de arquivo invalido']);
    exit;
}

if (file_exists($caminho)) {
    if (unlink($caminho)) {
        echo json_encode(['sucesso' => true, 'mensagem' => 'Arquivo removido: ' . $arquivo]);
    } else {
        echo json_encode(['sucesso' => false, 'erro' => 'Falha ao remover arquivo']);
    }
} else {
    echo json_encode(['sucesso' => true, 'mensagem' => 'Arquivo nao encontrado (ja removido): ' . $arquivo]);
}
