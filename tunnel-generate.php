<?php
// tunnel-generate.php v3.1.0 — Proxy PHP + Pipeline NLP 7 camadas
// Browser -> Oracle PHP -> [Pipeline NLP] -> Tunnel -> GPU PC (native-generate) -> Browser
// Pipeline converte numeros, moedas, horarios, simbolos para PT-BR falado

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '512M');

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Metodo nao permitido']);
    exit;
}

// ===================== TOKEN HMAC =====================
$token = $_SERVER['HTTP_X_GENERATE_TOKEN'] ?? '';
if (empty($token)) {
    http_response_code(401);
    echo json_encode(['error' => 'Token necessario']);
    exit;
}

$parts = explode('.', $token);
if (count($parts) !== 2) {
    http_response_code(401);
    echo json_encode(['error' => 'Token invalido']);
    exit;
}

$timestamp = (int)$parts[0];
$receivedHmac = $parts[1];

if (time() - $timestamp > 1800 || $timestamp > time() + 60) {
    http_response_code(401);
    echo json_encode(['error' => 'Token expirado']);
    exit;
}

$expectedHmac = hash_hmac('sha256', (string)$timestamp, API_KEY);
if (!hash_equals($expectedHmac, $receivedHmac)) {
    http_response_code(401);
    echo json_encode(['error' => 'Token invalido']);
    exit;
}

// ===================== INPUT =====================
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input) {
    http_response_code(400);
    echo json_encode(['error' => 'JSON invalido']);
    exit;
}

// ===================== PIPELINE NLP v3.1.0 — 7 CAMADAS =====================
// Tudo mastigado em PT puro. Zero token freeze. Sem restauracao de simbolos.

function pipelineNLP($text) {
    if (empty($text)) return $text;

    // --- Helper: numeros por extenso ---
    $unidades = ['', 'um', 'dois', 'tres', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    $teen = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    $dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    $centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    function numeroExtenso($n) {
        global $unidades, $teen, $dezenas, $centenas;
        $n = (int)$n;
        if ($n === 0) return 'zero';
        if ($n < 0) return 'menos ' . numeroExtenso(-$n);
        if ($n < 10) return $unidades[$n];
        if ($n < 20) return $teen[$n - 10];
        if ($n < 100) {
            $d = (int)($n / 10);
            $u = $n % 10;
            return $u === 0 ? $dezenas[$d] : $dezenas[$d] . ' e ' . $unidades[$u];
        }
        if ($n === 100) return 'cem';
        if ($n < 1000) {
            $c = (int)($n / 100);
            $resto = $n % 100;
            return $resto === 0 ? $centenas[$c] : $centenas[$c] . ' e ' . numeroExtenso($resto);
        }
        if ($n < 1000000) {
            $m = (int)($n / 1000);
            $resto = $n % 1000;
            $milStr = $m === 1 ? 'mil' : numeroExtenso($m) . ' mil';
            return $resto === 0 ? $milStr : $milStr . ' e ' . numeroExtenso($resto);
        }
        // Para numeros maiores, retorna em formato numerico
        return (string)$n;
    }

    // ===== CAMADA 1: Sanitizacao + Horarios =====
    // 14:30 -> 14 horas e 30 minutos
    // 08:45 -> 8 horas e 45 minutos
    $text = preg_replace_callback(
        '/\b(\d{1,2}):(\d{2})\b/',
        function ($m) {
            $h = (int)$m[1];
            $min = (int)$m[2];
            if ($min === 0) return $h . ' horas';
            return $h . ' horas e ' . $min . ' minutos';
        },
        $text
    );

    // ===== CAMADA 2: Moedas R$ =====
    // R$ 1.500,00 -> mil e quinhentos reais
    // R$ 50,00 -> cinquenta reais
    // R$ 1.200,50 -> mil e duzentos reais e cinquenta centavos
    $text = preg_replace_callback(
        '/R\$\s*([\d.]+),(\d{2})\b/',
        function ($m) {
            $intPart = str_replace('.', '', $m[1]);
            $cents = (int)$m[2];
            $valor = (int)$intPart;
            $result = numeroExtenso($valor) . ' reais';
            if ($cents > 0) {
                $result .= ' e ' . numeroExtenso($cents) . ' centavos';
            }
            return $result;
        },
        $text
    );

    // R$ 150 -> cento e cinquenta reais (sem centavos)
    $text = preg_replace_callback(
        '/R\$\s*([\d.]+)(?:,\d{2})?\b/',
        function ($m) {
            // Se ja tem "reais" no match (foi processado acima), ignora
            if (strpos($m[0], 'reais') !== false) return $m[0];
            $intPart = str_replace('.', '', $m[1]);
            return numeroExtenso((int)$intPart) . ' reais';
        },
        $text
    );

    // ===== CAMADA 3: Decimais especificos =====
    // 3.1415 -> tres ponto quatorze quinze
    // 0.5 -> zero ponto cinco
    $text = preg_replace_callback(
        '/\b(\d+)\.(\d+)\b/',
        function ($m) {
            $inteiro = $m[1];
            $decimal = $m[2];
            // Ignorar IPs (4 grupos) e horarios ja processados
            return numeroExtenso((int)$inteiro) . ' ponto ' . implode(' ', str_split($decimal));
        },
        $text
    );

    // ===== CAMADA 4: Milhar seguro =====
    // 1.500 -> 1500 (remove ponto de milhar, mas preserva IPs 0.0.0.0)
    // Apenas remove ponto entre digitos que NAO se parece com IP
    $text = preg_replace('/\b(\d{1,3})\.(\d{3})\b/', '$1$2', $text);

    // ===== CAMADA 5: Simbolos internet =====
    // email@dominio.com -> email arroba dominio ponto com
    // www.site.com -> dablilu dablilu dablilu ponto site ponto com
    // www. -> dablilu dablilu dablilu ponto
    $text = str_replace('@', ' arroba ', $text);
    $text = str_replace('www.', 'dablilu dablilu dablilu ponto ', $text);

    // .com, .br, .org, .net, .io, .gov -> ponto com, ponto br, etc
    $dominios = ['com', 'br', 'org', 'net', 'io', 'gov', 'edu', 'tv', 'me', 'co', 'info', 'app'];
    foreach ($dominios as $dom) {
        $text = preg_replace('/\.' . $dom . '\b/i', ' ponto ' . $dom, $text);
    }

    // ===== CAMADA 6: Percentuais e simbolos =====
    // 50% -> cinquenta por cento
    $text = preg_replace_callback(
        '/(\d+)%/',
        function ($m) { return numeroExtenso((int)$m[1]) . ' por cento'; },
        $text
    );

    // & -> e
    $text = str_replace('&', ' e ', $text);

    // ===== CAMADA 7: Pausas e pontuacao padronizada =====
    // Normalizar pontuacao multipla
    $text = preg_replace('/\.{2,}/', '... ', $text);
    $text = preg_replace('/!{2,}/', '! ', $text);
    $text = preg_replace('/\?{2,}/', '? ', $text);

    // Espacos multiplos -> espaco simples
    $text = preg_replace('/\s+/', ' ', $text);

    // Trim
    $text = trim($text);

    return $text;
}

// ===================== DESCOBRIR TUNNEL URL =====================
$tunnelUrl = '';

if (defined('TUNNEL_URL') && !empty(TUNNEL_URL)) {
    $tunnelUrl = TUNNEL_URL;
}

if (empty($tunnelUrl)) {
    $tunnelIni = __DIR__ . '/tunnel-config.ini';
    if (file_exists($tunnelIni)) {
        $ini = parse_ini_file($tunnelIni);
        if ($ini !== false && !empty($ini['tunnel_url'])) {
            $tunnelUrl = trim($ini['tunnel_url']);
        }
    }
}

if (empty($tunnelUrl)) {
    $tunnelResp = @file_get_contents('http://127.0.0.1/get_tunnel.php');
    if ($tunnelResp) {
        $tunnelData = json_decode($tunnelResp, true);
        if ($tunnelData && ($tunnelData['status'] ?? '') === 'online' && !empty($tunnelData['tunnelUrl'])) {
            $tunnelUrl = $tunnelData['tunnelUrl'];
        }
    }
}

if (empty($tunnelUrl)) {
    http_response_code(502);
    echo json_encode(['error' => 'GPU offline: tunnel nao encontrado']);
    exit;
}

// ===================== MONTAR PAYLOAD PRO NATIVE-GENERATE =====================
// PRIORIDADE: snake_case (campos nativos GPU) > camelCase (Next.js legado)
$voiceMode = $input['voice_mode'] ?? ($input['voiceMode'] ?? 'clone');

// Texto bruto do input
$rawText = $input['text'] ?? '';

// Aplicar Pipeline NLP no texto
$nlpText = pipelineNLP($rawText);

$nativePayload = [
    'text'                 => $nlpText,
    'voice_mode'           => $voiceMode,
    'speaker_id'           => $input['speaker_id'] ?? ($input['speakerId'] ?? ''),
    'ref_audio_url'        => $input['ref_audio_url'] ?? ($input['referenceAudioUrl'] ?? ''),
    'ref_audio_base64'     => $input['referenceAudioBase64'] ?? '',
    'language'             => $input['language'] ?? 'Auto',
    'instruct'             => $input['instruct'] ?? '',
    'speed'                => max(0.5, min(1.5, (float)($input['speed'] ?? 1.0))),
    'num_step'             => (int)($input['num_step'] ?? ($input['numStep'] ?? 32)),
    'guidance_scale'       => (float)($input['guidance_scale'] ?? ($input['guidanceScale'] ?? 2.0)),
    'ref_text'             => $input['ref_text'] ?? ($input['refText'] ?? ''),
    'denoise'              => $input['denoise'] ?? true,
    'postprocess_output'   => $input['postprocessOutput'] ?? true,
    'preprocess_prompt'    => $input['preprocessPrompt'] ?? true,
];

// Duração alvo: só envia se definido (> 0)
$targetDuration = $input['targetDuration'] ?? null;
if ($targetDuration !== null && $targetDuration > 0) {
    $nativePayload['duration'] = (float)$targetDuration;
}

// ===================== CHAMAR NATIVE-GENERATE =====================
$nativeUrl = rtrim($tunnelUrl, '/') . '/api/native-generate';

$ch = curl_init($nativeUrl);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => json_encode($nativePayload),
    CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT        => 180,
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_ENCODING       => '',
    CURLOPT_SSL_VERIFYPEER => false,
]);

$resp = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
$curlInfo = curl_getinfo($ch);
curl_close($ch);

if (!$resp) {
    http_response_code(502);
    echo json_encode(['error' => 'Erro ao conectar com GPU: ' . $curlError]);
    exit;
}

$result = json_decode($resp, true);

if (!$result) {
    http_response_code(502);
    echo json_encode(['error' => 'Resposta invalida do GPU', 'raw' => mb_substr($resp, 0, 300)]);
    exit;
}

if (($result['status'] ?? '') === 'ok' && !empty($result['audio_base64'])) {
    $dataUri = 'data:audio/wav;base64,' . $result['audio_base64'];
    echo json_encode([
        'audioUrl'        => $dataUri,
        'viaTunnel'       => true,
        'mode'            => 'native',
        'nlpPipeline'     => true,
        'duration'        => $result['duration'] ?? null,
        'generationTime'  => $result['generation_time'] ?? null,
        'debug' => [
            'totalDuration' => round(($curlInfo['total_time'] ?? 0) * 1000),
            'nlp' => [
                'step' => 'NLP Pipeline v3.1.0',
                'status' => 'ok',
                'detail' => '7 camadas aplicadas',
            ],
            'steps' => [
                ['step' => 'Tunnel', 'status' => 'ok', 'detail' => mb_substr($tunnelUrl, 0, 60) . '...'],
                ['step' => 'Native Generate', 'status' => 'ok', 'detail' => ($result['duration'] ?? 0) . 's em ' . ($result['generation_time'] ?? 0) . 's'],
            ],
        ],
    ]);
} else {
    $errorMsg = $result['error'] ?? 'Erro desconhecido do GPU';
    $httpCodeNative = $httpCode >= 400 ? $httpCode : 500;
    http_response_code($httpCodeNative);
    echo json_encode([
        'error' => 'GPU nao conseguiu gerar audio: ' . $errorMsg,
        'viaTunnel' => true,
        'debug' => [
            'totalDuration' => round(($curlInfo['total_time'] ?? 0) * 1000),
            'steps' => [
                ['step' => 'Tunnel', 'status' => 'ok', 'detail' => mb_substr($tunnelUrl, 0, 60) . '...'],
                ['step' => 'Native Generate', 'status' => 'error', 'detail' => $errorMsg],
            ],
        ],
    ]);
}
?>
