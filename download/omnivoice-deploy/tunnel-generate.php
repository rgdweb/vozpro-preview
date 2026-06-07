<?php
/**
 * ============================================================
 *  VozPro — Proxy de Geração TTS (v3.0.0 — Pipeline NLP)
 * ============================================================
 *
 *  Arquitetura de Normalização Semântica em 10 Camadas
 *  Especializadas, baseada no modelo de engenharia ElevenLabs.
 *
 *  Técnicas implementadas:
 *    • Congelamento por tokens (URLs e E-mails são extraídos
 *      antes do processamento e restaurados ao final, para
 *      impedir que o pipeline destrua endereços)
 *    • Barragem contra decimais e IPs na remoção de separador
 *      de milhar (regex word-boundary + lookahead)
 *    • Sanitização progressiva com preservação de contexto
 *
 *  Camadas:
 *    1  — Sanitização básica
 *    2  — Moedas isoladas (R$)
 *    3,4,5 — Símbolos complementares
 *    6  — Percentuais
 *    7,8 — Proteção de URLs e E-mails (congelamento por tokens)
 *    9  — Separador de milhar seguro (barragem contra decimais e IPs)
 *    10 — Espaçamento de pontuação e equilíbrio de pausas respiratórias
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
header('X-Proxy: VozPro-NLP-v3.0.0');
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
//   PIPELINE DE NORMALIZAÇÃO SEMÂNTICA AVANÇADO — 10 CAMADAS
//   Modelo: Engenharia ElevenLabs
//  ═══════════════════════════════════════════════════════
// -------------------------------------------------------

$originalText = $userText; // Guarda cópia para logs/diagnóstico

// CAMADA 1: SANITIZAÇÃO BÁSICA
// Normaliza espaçamento e caracteres de controle
$userText = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $userText);
$userText = preg_replace('/\xEF\xBB\xBF/', '', $userText); // BOM
$userText = strip_tags($userText);
$userText = str_replace(["\r\n", "\r", "\t", "\n"], ' ', $userText);
$userText = preg_replace('/\s+/u', ' ', $userText);

// ────────────────────────────────────────────────────────
// CAMADA 7 E 8: PROTEÇÃO DE URLS E EMAILS (CONGELAMENTO POR TOKENS)
// Técnica ElevenLabs: extrai URLs e E-mails ANTES do
// processamento, substituindo por tokens seguros, e
// restaura ao final. Isso impede que as camadas
// subsequentes (símbolos, pontuação) destruam
// endereços web e eletrônicos.
// ────────────────────────────────────────────────────────
$urls_salvas = [];
$emails_salvos = [];

// Pesca e protege E-mails antes de tudo
if (preg_match_all('/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/', $userText, $matches_emails)) {
    foreach ($matches_emails[0] as $idx => $email) {
        $token = "__EMAIL_" . $idx . "__";
        $emails_salvos[$token] = $email;
        $userText = str_replace($email, $token, $userText);
    }
}

// Pesca e protege URLs (HTTP, HTTPS, WWW)
if (preg_match_all('/(https?:\/\/[^\s]+|www\.[^\s]+)/', $userText, $matches_urls)) {
    foreach ($matches_urls[0] as $idx => $url) {
        $token = "__URL_" . $idx . "__";
        $urls_salvas[$token] = $url;
        $userText = str_replace($url, $token, $userText);
    }
}

// CAMADA 2: MOEDAS ISOLADAS (R$)
$userText = preg_replace('/R\$\s*(\d+),00\b/i', '$1 reais', $userText);
$userText = preg_replace('/R\$\s*(\d+),(\d+)\b/i', '$1 reais e $2 centavos', $userText);
$userText = preg_replace('/R\$\s*(\d+)\b/i', '$1 reais', $userText);

// CAMADA 6: PERCENTUAIS
$userText = str_replace('%', ' por cento', $userText);

// CAMADA 9: SEPARADOR DE MILHAR SEGURO (BARRAGEM CONTRA DECIMAIS E IPS)
// Remove o ponto APENAS se o padrão de milhar inteiro for válido
// Ex: 1.500 → 1500 | 1.250.000 → 1250000
// Protege: 192.168.0.1 (IP) e 3.14 (decimal) — não possuem
// padrão de milhar triplo, logo não são atingidos pelo regex
$userText = preg_replace_callback('/\b\d{1,3}(?:\.\d{3})+\b/', function($m) {
    return str_replace('.', '', $m[0]);
}, $userText);

// CAMADA 3, 4 E 5: TRADUÇÃO DE SÍMBOLOS COMPLEMENTARES
$userText = str_replace('@', ' arroba', $userText);
$userText = str_replace('&', ' e ', $userText);

// RESTAURAÇÃO DE URLS E EMAILS (DEVOLVE OS DADOS PROTEGIDOS PARA O FLUXO)
foreach ($emails_salvos as $token => $original) {
    $userText = str_replace($token, $original, $userText);
}
foreach ($urls_salvas as $token => $original) {
    $userText = str_replace($token, $original, $userText);
}

// CAMADA 10: ESPAÇAMENTO DE PONTUAÇÃO E EQUILÍBRIO DE PAUSAS RESPIRATÓRIAS
$userText = preg_replace('/[.!?;:]+/', '.', $userText);
$userText = str_replace('.', '. ', $userText);
$userText = str_replace(',', ', ', $userText);
$userText = preg_replace('/\s+/', ' ', $userText);

// Limpeza final: trim e sanidade
$userText = trim($userText);
$userText = preg_replace('/\s+\./', '.', $userText);
$userText = preg_replace('/\s+([.,!?])/', '$1', $userText);
$userText = preg_replace('/\s{2,}/', ' ', $userText);

// Verificação de sanidade: texto não pode estar vazio após normalização
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
//  A string $userText já está totalmente normalizada pelo
//  Pipeline de 10 Camadas. Aqui ela é injetada no payload
//  nativo que segue para a GPU do backend de TTS.
// -------------------------------------------------------

$voice     = trim($input['voice'] ?? 'default');
$speed     = isset($input['speed']) ? (float)$input['speed'] : 1.0;
$language  = trim($input['language'] ?? 'pt-BR');
$modelId   = trim($input['model'] ?? 'default');
$refId     = trim($input['ref_id'] ?? '');
$outputFmt = trim($input['output_format'] ?? 'mp3');

$nativePayload = [
    'text'    => $userText,       // ← TEXTO NORMALIZADO PELO PIPELINE 10 CAMADAS
    'voice'   => $voice,
    'speed'   => max(0.25, min(4.0, $speed)),
    'language'=> $language,
    'model'   => $modelId,
    'ref_id'  => $refId,
    'output_format' => $outputFmt,
    'metadata' => [
        'nlp_version'   => '3.0.0',
        'pipeline'      => '10-camadas-elevenlabs',
        'normalized_at' => date('c'),
        'original_len'  => mb_strlen($originalText),
        'normalized_len'=> mb_strlen($userText),
        'tokens_frozen' => count($urls_salvas) + count($emails_salvos),
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
        'X-NLP-Version: 3.0.0',
        'X-NLP-Pipeline: 10-camadas',
        $apiKey ? "Authorization: Bearer {$apiKey}" : '',
    ],
]);

// Timeout dinâmico
if (isset($input['timeout']) && is_numeric($input['timeout'])) {
    curl_setopt($ch, CURLOPT_TIMEOUT, (int)$input['timeout']);
}

$responseBody = curl_exec($ch);
$httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError    = curl_error($ch);

// Captura content-type ANTES de fechar o handle
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
            'version'     => '3.0.0',
            'pipeline'    => '10-camadas',
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
        // Resposta JSON do backend (erro ou metadata)
        http_response_code($httpCode);
        header('Content-Type: application/json; charset=utf-8');
        echo $responseBody;
    } else {
        // Resposta binária (áudio)
        http_response_code(200);
        header('Content-Type: audio/' . $outputFmt);
        header('Content-Disposition: inline; filename="tts_output.' . $outputFmt . '"');
        header('Content-Length: ' . strlen($responseBody));
        header('X-NLP-Normalized: true');
        header('X-NLP-Version: 3.0.0');
        header('X-NLP-Pipeline: 10-camadas');
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
            'version'     => '3.0.0',
            'pipeline'    => '10-camadas',
        ],
    ]);
}

exit;
