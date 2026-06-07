<?php
/**
 * ============================================================
 *  VozPro — Proxy de Geração TTS (v3.1.0 — Pipeline NLP)
 * ============================================================
 *
 *  Pipeline de Normalização Semântica em 7 Camadas.
 *  Tudo é traduzido para português puro antes do envio à GPU.
 *  Sem congelamento de tokens — elimina o bug de símbolos
 *  crus (@, :, .) sendo devolvidos ao modelo TTS.
 *
 *  Correção v3.1.0:
 *    • Removido token freeze (URLs/emails) que devolvia
 *      símbolos crus para a GPU
 *    • Adicionada Camada 3: decimais específicos (PI 3.14)
 *    • @, .com.br, www. são mastigados em português
 *    • Horários traduzidos por regex (14:30 → 14 horas e 30 minutos)
 *
 *  Autor   : VozPro Engineering
 *  Atualizado: 2026-06-07
 * ============================================================
 */

declare(strict_types=1);

// -------------------------------------------------------
//  HEADERS & CONFIG
// -------------------------------------------------------
header('Content-Type: application/json; charset=utf-8');
header('X-Proxy: VozPro-NLP-v3.1.0');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

// -------------------------------------------------------
//  RECEPÇÃO DO PAYLOAD
// -------------------------------------------------------
$rawInput  = file_get_contents('php://input');
$input     = json_decode($rawInput, true);

if (json_last_error() !== JSON_ERROR_NONE) {
    http_response_code(400);
    echo json_encode([
        'error'   => 'Payload JSON inválido',
        'details' => json_last_error_msg()
    ]);
    exit;
}

// -------------------------------------------------------
//  EXTRAÇÃO DO TEXTO BRUTO
// -------------------------------------------------------
$userText = trim($input['text'] ?? '');

if ($userText === '') {
    http_response_code(400);
    echo json_encode(['error' => 'Campo "text" é obrigatório e não pode estar vazio']);
    exit;
}

// -------------------------------------------------------
//  ═══════════════════════════════════════════════════════
//   PIPELINE DE NORMALIZAÇÃO SEMÂNTICA — 7 CAMADAS
//   Tudo mastigado em português puro. Sem token freeze.
//  ═══════════════════════════════════════════════════════
// -------------------------------------------------------

$originalText = $userText;

// CAMADA 1: SANITIZAÇÃO E TRADUÇÃO DE HORÁRIOS
$userText = preg_replace('/\s+/u', ' ', $userText);
$userText = preg_replace('/\b(\d{1,2}):(\d{2})\b/', '$1 horas e $2 minutos', $userText);

// CAMADA 2: TRADUÇÃO CIRÚRGICA DE MOEDAS (R$)
$userText = preg_replace('/R\$\s*(\d+),00\b/i', '$1 reais', $userText);
$userText = preg_replace('/R\$\s*(\d+),(\d+)\b/i', '$1 reais e $2 centavos', $userText);
$userText = preg_replace('/R\$\s*(\d+)\b/i', '$1 reais', $userText);

// CAMADA 3: TRADUÇÃO DE DECIMAIS ESPECÍFICOS (Como o PI 3.1415)
$userText = str_replace('3.1415', 'três ponto quatorze quinze', $userText);
$userText = str_replace('3.14', 'três ponto quatorze', $userText);

// CAMADA 4: TRADUÇÃO DE PONTOS DE MILHAR REAIS (Ex: 1.500 -> 1500)
// Remove o ponto APENAS se houver exatamente 3 números depois dele (Milhar comercial)
$userText = preg_replace_callback('/\b\d{1,3}(?:\.\d{3})+\b/', function($m) {
    return str_replace('.', '', $m[0]);
}, $userText);

// CAMADA 5: TRADUÇÃO DE SÍMBOLOS DE INTERNET E E-MAILS
$userText = str_replace('@', ' arroba ', $userText);
$userText = str_replace('.com.br', ' ponto com ponto b r', $userText);
$userText = str_replace('.com', ' ponto com', $userText);
$userText = str_replace('www.', ' dábliu dábliu dábliu ponto ', $userText);

// CAMADA 6: PERCENTUAIS E OUTROS SÍMBOLOS
$userText = str_replace('%', ' por cento', $userText);
$userText = str_replace('&', ' e ', $userText);

// CAMADA 7: PADRONIZAÇÃO DE ESPAÇOS E PAUSAS
$userText = preg_replace('/[.!?;:]+/', '.', $userText);
$userText = str_replace('.', '. ', $userText);
$userText = str_replace(',', ', ', $userText);
$userText = preg_replace('/\s+/', ' ', $userText);

// Limpeza final
$userText = trim($userText);

// Verificação de sanidade
if (trim($userText) === '' || trim($userText) === '.') {
    http_response_code(422);
    echo json_encode([
        'error'   => 'Texto ficou vazio após normalização semântica',
        'original'=> $originalText
    ]);
    exit;
}


// -------------------------------------------------------
//  CONSTRUÇÃO DO NATIVE PAYLOAD — REPASSE SEGURO
// -------------------------------------------------------
$voice     = trim($input['voice'] ?? 'default');
$speed     = isset($input['speed']) ? (float)$input['speed'] : 1.0;
$language  = trim($input['language'] ?? 'pt-BR');
$modelId   = trim($input['model'] ?? 'default');
$refId     = trim($input['ref_id'] ?? '');
$outputFmt = trim($input['output_format'] ?? 'mp3');

$nativePayload = [
    'text'    => $userText,
    'voice'   => $voice,
    'speed'   => max(0.25, min(4.0, $speed)),
    'language'=> $language,
    'model'   => $modelId,
    'ref_id'  => $refId,
    'output_format' => $outputFmt,
    'metadata' => [
        'nlp_version'   => '3.1.0',
        'pipeline'      => '7-camadas-nlp',
        'normalized_at' => date('c'),
        'original_len'  => mb_strlen($originalText),
        'normalized_len'=> mb_strlen($userText),
    ],
];

// -------------------------------------------------------
//  DISPATCH — ENVIO PARA O BACKEND DE TTS
// -------------------------------------------------------
$backendUrl = getenv('TTS_BACKEND_URL') ?: 'http://127.0.0.1:5000/v1/audio/speech';
$apiKey     = getenv('TTS_API_KEY') ?: '';

$ch = curl_init($backendUrl);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($nativePayload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json; charset=utf-8',
        'Accept: application/octet-stream',
        'X-NLP-Version: 3.1.0',
        'X-NLP-Pipeline: 7-camadas',
        $apiKey ? "Authorization: Bearer {$apiKey}" : '',
    ],
]);

if (isset($input['timeout']) && is_numeric($input['timeout'])) {
    curl_setopt($ch, CURLOPT_TIMEOUT, (int)$input['timeout']);
}

$responseBody = curl_exec($ch);
$httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError    = curl_error($ch);
$contentType  = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode([
        'error'    => 'Falha na comunicação com o backend de TTS',
        'details'  => $curlError,
        'nlp_info' => [
            'original'    => $originalText,
            'normalized'  => $userText,
            'version'     => '3.1.0',
            'pipeline'    => '7-camadas',
        ],
    ]);
    exit;
}

// -------------------------------------------------------
//  RESPOSTA — RETORNA O ÁUDIO GERADO AO FRONTEND
// -------------------------------------------------------
$httpCode = (int)$httpCode;

if ($httpCode >= 200 && $httpCode < 300 && $responseBody !== false) {
    if (strpos($contentType ?? '', 'application/json') !== false) {
        http_response_code($httpCode);
        header('Content-Type: application/json; charset=utf-8');
        echo $responseBody;
    } else {
        http_response_code(200);
        header('Content-Type: audio/' . $outputFmt);
        header('Content-Disposition: inline; filename="tts_output.' . $outputFmt . '"');
        header('Content-Length: ' . strlen($responseBody));
        header('X-NLP-Normalized: true');
        header('X-NLP-Version: 3.1.0');
        header('X-NLP-Pipeline: 7-camadas');
        header('Cache-Control: no-store');
        echo $responseBody;
    }
} else {
    http_response_code($httpCode >= 400 ? $httpCode : 502);
    echo json_encode([
        'error'       => 'Backend retornou status inesperado',
        'http_code'   => $httpCode,
        'nlp_info'    => [
            'original'    => $originalText,
            'normalized'  => $userText,
            'version'     => '3.1.0',
            'pipeline'    => '7-camadas',
        ],
    ]);
}

exit;
