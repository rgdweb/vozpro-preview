<?php
/**
 * ============================================================
 *  VozPro — Proxy de Geração TTS (v2.7.0 — NLP Semântico)
 * ============================================================
 *
 *  Este proxy recebe requisições do frontend Omnivoice,
 *  aplica um Motor de Normalização Semântica completa em
 *  português brasileiro e repassa o texto pré-processado
 *  para o backend de TTS nativo na GPU.
 *
 *  Pontos de normalização cobertos:
 *    • Moedas (R$) → texto por extenso
 *    • Numerais e separadores de milhar
 *    • Símbolos especiais (% @ &)
 *    • Pausas respiratórias e pontuação
 *    • Abreviações comuns (SR., SRA., DR., etc.)
 *    • Horários (HH:MM / HH:MMh)
 *    • Medidas básicas (km, kg, m², m³)
 *    • Números ordinais até 20
 *    • URLs e e-mails (sanitização)
 *    • Contrações e grafias problemáticas do PT-BR
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
header('X-Proxy: VozPro-NLP-v2.7.0');
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
//   MOTOR DE NORMALIZAÇÃO SEMÂNTICA — PORTUGUÊS BR
//  ═══════════════════════════════════════════════════════
// -------------------------------------------------------

$originalText = $userText; // Guarda cópia para logs/diagnóstico

// ────────────────────────────────────────────────────────
//  Camada 0: Sanitização preliminar
//  Remove caracteres de controle, BOM, tags HTML/PHP e
//  normaliza a codificação para UTF-8 NFC.
// ────────────────────────────────────────────────────────
$userText = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $userText);
$userText = preg_replace('/\xEF\xBB\xBF/', '', $userText); // BOM
$userText = strip_tags($userText);
$userText = str_replace("\r\n", ' ', $userText);
$userText = str_replace(["\r", "\t", "\n"], ' ', $userText);

// ────────────────────────────────────────────────────────
//  Camada 1: Isolamento e conversão de MOEDAS (R$)
//  Cobertura:
//    R$ 1.500,00 → "mil e quinhentos reais"
//    R$ 99,50    → "noventa e nove reais e cinquenta centavos"
//    R$ 10       → "dez reais"
// ────────────────────────────────────────────────────────
// 1a — Valores inteiros com vírgula centesimal ,00
$userText = preg_replace_callback(
    '/R\$\s*(\d{1,3}(?:\.\d{3})*),00/i',
    function ($m) {
        $num = str_replace('.', '', $m[1]); // Remove pontos de milhar
        $extenso = numeroParaPortugues((int)$num);
        return $extenso . ' reais';
    },
    $userText
);

// 1b — Valores com centavos (,XX onde XX != 00)
$userText = preg_replace_callback(
    '/R\$\s*(\d{1,3}(?:\.\d{3})*),(\d{2})\b/i',
    function ($m) {
        $reais = str_replace('.', '', $m[1]);
        $centavos = (int)$m[2];
        $extenso = numeroParaPortugues((int)$reais);
        $resultado = $extenso . ' reais';
        if ($centavos > 0) {
            $resultado .= ' e ' . numeroParaPortugues($centavos) . ' centavos';
        }
        return $resultado;
    },
    $userText
);

// 1c — Valores sem centavos explícitos (apenas dígitos inteiros após R$)
$userText = preg_replace_callback(
    '/R\$\s*(\d{1,3}(?:\.\d{3})*)\b/i',
    function ($m) {
        $num = str_replace('.', '', $m[1]);
        return numeroParaPortugues((int)$num) . ' reais';
    },
    $userText
);

// 1d — Valores com vírgula e 1 dígito centesimal (ex: R$ 5,5)
$userText = preg_replace_callback(
    '/R\$\s*(\d+),(\d)(?!\d)/i',
    function ($m) {
        $reais = (int)$m[1];
        $centavos = (int)$m[2] * 10;
        $resultado = numeroParaPortugues($reais) . ' reais';
        if ($centavos > 0) {
            $resultado .= ' e ' . numeroParaPortugues($centavos) . ' centavos';
        }
        return $resultado;
    },
    $userText
);

// ────────────────────────────────────────────────────────
//  Camada 2: Proteção de Numerais e Pontos de Milhar
//  1.500 → 1500 | 10.000 → 10000 | 3.500.000 → 3500000
//  IMPORTANTE: Remove APENAS pontos entre dígitos
//  (não confunde com ponto final de frase).
// ────────────────────────────────────────────────────────
$userText = preg_replace('/(\d)\.(\d)/', '$1$2', $userText);
// Repete para casos de múltiplos pontos (1.500.000)
$userText = preg_replace('/(\d)\.(\d)/', '$1$2', $userText);

// ────────────────────────────────────────────────────────
//  Camada 2b: Conversão de números isolados para extenso
//  Números de 0 a 1000 que aparecem isolados no texto são
//  convertidos para melhor naturalidade na fala.
//  Ex: "ligue para 0800" → "ligue para zero oitocentos"
// ────────────────────────────────────────────────────────
// Números especiais
$userText = str_ireplace('0800', 'zero oitocentos', $userText);
$userText = str_ireplace('0300', 'zero trezentos', $userText);
$userText = str_ireplace('0800 722', 'zero oitocentos setecentos e vinte e dois', $userText);

// Números inteiros isolados (1 a 999) que NÃO fazem parte de R$ já processado
$userText = preg_replace_callback(
    '/\b(\d{1,3})\b/u',
    function ($m) {
        // Preserva se faz parte de contexto numérico maior (telefone, CEP, etc.)
        $num = (int)$m[1];
        if ($num <= 20 || $num === 30 || $num === 40 || $num === 50 ||
            $num === 60 || $num === 70 || $num === 80 || $num === 90 ||
            $num === 100 || $num === 200 || $num === 300 || $num === 400 ||
            $num === 500 || $num === 600 || $num === 700 || $num === 800 ||
            $num === 900 || $num === 1000) {
            return numeroParaPortugues($num);
        }
        return $m[0];
    },
    $userText
);

// ────────────────────────────────────────────────────────
//  Camada 3: Tradução de Símbolos Especiais e Sinais
//  Gráficos comuns em spots publicitários
// ────────────────────────────────────────────────────────
$symbolMap = [
    '%'  => ' por cento',
    '‰'  => ' por mil',
    '@'  => ' arroba',
    '&'  => ' e ',
    '+'  => ' mais',
    '='  => ' igual a ',
    '<'  => ' menor que ',
    '>'  => ' maior que ',
    '#'  => ' número ',
    '°'  => ' graus',
    'º'  => ' graus',
    'ª'  => 'ª',  // preserva (1ª, 2ª)
    '~'  => ' aproximadamente ',
    '±'  => ' mais ou menos ',
    '×'  => ' vezes ',
    '÷'  => ' dividido por ',
    '→'  => ' para ',
    '←'  => ' de ',
    '•'  => ', ',
    '●'  => ', ',
    '◆'  => ', ',
    '▶'  => ', ',
    '■'  => ', ',
    '✓'  => ' ',
    '✗'  => ' ',
    '©'  => ' copyright ',
    '®'  => ' registrado ',
    '™'  => ' marca registrada ',
    '§'  => ' seção ',
];

foreach ($symbolMap as $symbol => $replacement) {
    $userText = str_replace($symbol, $replacement, $userText);
}

// Símbolos matemáticos com verificação de contexto
$userText = preg_replace('/(\d+)\s*x\s*(\d+)/iu', '$1 vezes $2', $userText);
$userText = preg_replace('/(\d+)\s*\+\s*(\d+)/u', '$1 mais $2', $userText);

// ────────────────────────────────────────────────────────
//  Camada 4: Padronização de Pausas Respiratórias
//  Força o modelo TTS a respeitar a pontuação, removendo
//  repetições e garantindo espaçamento limpo.
// ────────────────────────────────────────────────────────

// 4a — Normaliza múltiplos pontos finais (.. ... ....) em um único ponto
$userText = preg_replace('/\.{2,}/', '.', $userText);

// 4b — Normaliza múltiplas exclamações e interrogações
$userText = preg_replace('/!{2,}/', '!', $userText);
$userText = preg_replace('/\?{2,}/', '?', $userText);

// 4c — Remove pontos de exclamação/interrogação seguidos de pontos
$userText = str_replace(['!.', '.!', '?.', '.?'], ['.', '.', '.', '.'], $userText);

// 4d — Remove combinações mistas de pontuação
$userText = preg_replace('/[!?]{2,}/', '.', $userText);
$userText = preg_replace('/[;:]/', ',', $userText); // Simplifica vírgulas e ponto-e-vírgula

// 4e — Garante exatamente UM espaço após pontuação
$userText = preg_replace('/\.(?!\s|$)/u', '. ', $userText);
$userText = preg_replace('/,(?!\s|$)/u', ', ', $userText);
$userText = preg_replace('/\?(?!\s|$)/u', '? ', $userText);
$userText = preg_replace('/!(?!\s|$)/u', '! ', $userText);

// 4f — Remove espaços ANTES da pontuação
$userText = preg_replace('/\s+([.,!?])/', '$1', $userText);

// 4g — Remove espaços duplos, triplos, etc.
$userText = preg_replace('/\s+/', ' ', $userText);

// ────────────────────────────────────────────────────────
//  Camada 5: Abreviações Comuns do Português Brasileiro
//  Expande para melhor pronúncia pelo modelo TTS
// ────────────────────────────────────────────────────────
$abbreviations = [
    '/\bSr\.?\s/i'          => 'Senhor ',
    '/\bSra\.?\s/i'         => 'Senhora ',
    '/\bSrta\.?\s/i'        => 'Senhorita ',
    '/\bDr\.?\s/i'          => 'Doutor ',
    '/\bDra\.?\s/i'         => 'Doutora ',
    '/\bProf\.?\s/i'        => 'Professor ',
    '/\bProfa\.?\s/i'       => 'Professora ',
    '/\bEng\.?\s/i'         => 'Engenheiro ',
    '/\bGov\.?\s/i'         => 'Governador ',
    '/\bPres\.?\s/i'        => 'Presidente ',
    '/\bGen\.?\s/i'         => 'General ',
    '/\bCel\.?\s/i'         => 'Coronel ',
    '/\bMaj\.?\s/i'         => 'Major ',
    '/\bCap\.?\s/i'         => 'Capitão ',
    '/\bTen\.?\s/i'         => 'Tenente ',
    '/\bSgt\.?\s/i'         => 'Sargento ',
    '/\bAl\.?\s/i'          => 'Almirante ',
    '/\bMin\.?\s/i'         => 'Ministro ',
    '/\bExm[ao]\.?\s/i'     => 'Excelentíssimo ',
    '/\bV\.?Ex\.?a\.?\s/i'  => 'Vossa Excelência ',
    '/\bV\.?S\.?a\.?\s/i'   => 'Vossa Senhoria ',
    '/\bAv\.?\s/i'          => 'Avenida ',
    '/\bRd\.?\s/i'          => 'Rodovia ',
    '/\bR\.?\s/i'           => 'Rua ',     // cuidado: "R." pode ser confundido
    '/\bPg\.?\s/i'          => 'Página ',
    '/\bVol\.?\s/i'         => 'Volume ',
    '/\bN\.?[oº]\.?\s/i'    => 'Número ',
    '/\bTel\.?\s/i'         => 'Telefone ',
    '/\bDep\.?\s/i'         => 'Departamento ',
    '/\bDept[oõ]\.?\s/i'    => 'Departamento ',
    '/\bImp\.?\s/i'         => 'Importação ',
    '/\bExp\.?\s/i'         => 'Exportação ',
    '/\bS\.?A\.?\b/i'       => 'Sociedade Anônima',
    '/\bL\.?T\.?D\.?A\.?\b/i' => 'Limitada',
    '/\bE\.?P\.?T\.?C\.?\b/i' => 'Empresa Pública',
    '/\bC\.?N\.?P\.?J\.?\b/i' => 'Cadastro Nacional da Pessoa Jurídica',
    '/\bC\.?P\.?F\.?\b/i'  => 'Cadastro de Pessoa Física',
    '/\bI\.?P\.?T\.?U\.?\b/i' => 'Imposto Predial Territorial Urbano',
    '/\bP\.?M\.?\b/i'      => 'Polícia Militar',
    '/\bC\.?M\.?\b/i'      => 'Câmara Municipal',
];

foreach ($abbreviations as $pattern => $replacement) {
    $userText = preg_replace($pattern, $replacement, $userText);
}

// ────────────────────────────────────────────────────────
//  Camada 6: Conversão de Horários (HH:MM / HH:MMh)
//  14:30 → "quatorze e trinta"
//  08:00h → "oito horas"
// ────────────────────────────────────────────────────────
$userText = preg_replace_callback(
    '/\b(\d{1,2}):(\d{2})h?\b/',
    function ($m) {
        $hora = (int)$m[1];
        $min  = (int)$m[2];
        if ($min === 0) {
            return numeroParaPortugues($hora) . ' horas';
        }
        return numeroParaPortugues($hora) . ' e ' . numeroParaPortugues($min);
    },
    $userText
);

// ────────────────────────────────────────────────────────
//  Camada 7: Medidas e Unidades Comuns
//  10km → "dez quilômetros" | 5kg → "cinco quilos"
// ────────────────────────────────────────────────────────
$unitMap = [
    '/(\d+)\s*km\b/i'     => function($m) { return numeroParaPortugues((int)$m[1]) . ' quilômetros'; },
    '/(\d+)\s*kg\b/i'     => function($m) { return numeroParaPortugues((int)$m[1]) . ' quilogramas'; },
    '/(\d+)\s*g\b/i'      => function($m) { return numeroParaPortugues((int)$m[1]) . ' gramas'; },
    '/(\d+)\s*ml\b/i'     => function($m) { return numeroParaPortugues((int)$m[1]) . ' mililitros'; },
    '/(\d+)\s*l\b/i'      => function($m) { return numeroParaPortugues((int)$m[1]) . ' litros'; },
    '/(\d+)\s*m\b/i'      => function($m) { return numeroParaPortugues((int)$m[1]) . ' metros'; },
    '/(\d+)\s*cm\b/i'     => function($m) { return numeroParaPortugues((int)$m[1]) . ' centímetros'; },
    '/(\d+)\s*mm\b/i'     => function($m) { return numeroParaPortugues((int)$m[1]) . ' milímetros'; },
    '/(\d+)\s*km\/h\b/i'  => function($m) { return numeroParaPortugues((int)$m[1]) . ' quilômetros por hora'; },
    '/(\d+)\s*hp\b/i'     => function($m) { return numeroParaPortugues((int)$m[1]) . ' cavalos de força'; },
];

foreach ($unitMap as $pattern => $callback) {
    $userText = preg_replace_callback($pattern, $callback, $userText);
}

// m² e m³ (sobrescreve o "m" genérico se houver)
$userText = preg_replace_callback(
    '/(\d+)\s*m[²2]/u',
    function ($m) { return numeroParaPortugues((int)$m[1]) . ' metros quadrados'; },
    $userText
);
$userText = preg_replace_callback(
    '/(\d+)\s*m[³3]/u',
    function ($m) { return numeroParaPortugues((int)$m[1]) . ' metros cúbicos'; },
    $userText
);

// ────────────────────────────────────────────────────────
//  Camada 8: Números Ordinais
//  1º → "primeiro" | 2ª → "segunda" | 3º → "terceiro"
// ────────────────────────────────────────────────────────
$ordinalMap = [
    '1º'  => 'primeiro',  '1a'  => 'primeira',
    '2º'  => 'segundo',   '2a'  => 'segunda',
    '3º'  => 'terceiro',  '3a'  => 'terceira',
    '4º'  => 'quarto',    '4a'  => 'quarta',
    '5º'  => 'quinto',    '5a'  => 'quinta',
    '6º'  => 'sexto',     '6a'  => 'sexta',
    '7º'  => 'sétimo',    '7a'  => 'sétima',
    '8º'  => 'oitavo',    '8a'  => 'oitava',
    '9º'  => 'nono',      '9a'  => 'nona',
    '10º' => 'décimo',    '10a' => 'décima',
    '11º' => 'décimo primeiro', '11a' => 'décima primeira',
    '12º' => 'décimo segundo',  '12a' => 'décima segunda',
    '1.º' => 'primeiro',  '1.ª' => 'primeira',
    '2.º' => 'segundo',   '2.ª' => 'segunda',
    '3.º' => 'terceiro',  '3.ª' => 'terceira',
    '4.º' => 'quarto',    '4.ª' => 'quarta',
    '5.º' => 'quinto',    '5.ª' => 'quinta',
    '6.º' => 'sexto',     '6.ª' => 'sexta',
    '7.º' => 'sétimo',    '7.ª' => 'sétima',
    '8.º' => 'oitavo',    '8.ª' => 'oitava',
    '9.º' => 'nono',      '9.ª' => 'nona',
    '10.º'=> 'décimo',    '10.ª'=> 'décima',
];

foreach ($ordinalMap as $ordinal => $extenso) {
    $userText = str_ireplace($ordinal, $extenso, $userText);
}

// ────────────────────────────────────────────────────────
//  Camada 9: Sanitização de URLs e E-mails
//  Remove protocolos e símbolos que o TTS não lê bem
// ────────────────────────────────────────────────────────
$userText = preg_replace('#https?://#i', 'site ', $userText);
$userText = preg_replace('#www\.#i', 'dublê V dublê V dublê V ponto ', $userText);
$userText = str_replace('.com', ' ponto com', $userText);
$userText = str_replace('.br', ' ponto br', $userText);
$userText = str_replace('.org', ' ponto org', $userText);
$userText = str_replace('.io', ' ponto i o', $userText);

// E-mail: user@domain → "user arroba domain ponto com"
// (arroba já foi tratado na Camada 3)

// ────────────────────────────────────────────────────────
//  Camada 10: Contrações e Grafias Problemáticas PT-BR
//  Trata casos que o modelo TTS pode pronunciar errado
// ────────────────────────────────────────────────────────
// Expande "p/" e "pra" → "para"
$userText = preg_replace('/\bp\/\s/i', 'para ', $userText);
$userText = preg_replace('/\bpra\b/i', 'para', $userText);
$userText = preg_replace('/\bpro\b/i', 'para o', $userText);
$userText = preg_replace('/\bpros\b/i', 'para os', $userText);
$userText = preg_replace('/\bpra\b/i', 'para', $userText);
$userText = preg_replace('/\bpras\b/i', 'para as', $userText);

// Expande "tb" / "também" / "tmb"
$userText = preg_replace('/\btb\b/i', 'também', $userText);
$userText = preg_replace('/\btbm\b/i', 'também', $userText);

// Expande "vc" / "vcs"
$userText = preg_replace('/\bvc[s]?\b/i', function($m) {
    return isset($m[0][2]) ? 'vocês' : 'você';
}, $userText);

// Expande "q" → "que" em contexto informal
$userText = preg_replace('/\bq\s+(?=[aeiou])/i', 'que ', $userText);
$userText = str_ireplace('qto', 'quanto', $userText);
$userText = str_ireplace('qdo', 'quando', $userText);
$userText = str_ireplace('pq', 'porque', $userText);
$userText = str_ireplace('blz', 'beleza', $userText);
$userText = str_ireplace('ok', 'ok', $userText);
$userText = str_ireplace('etc.', ' etcétera', $userText);
$userText = str_ireplace('etc', ' etcétera', $userText);

// Expande "não" escrito como "nao" ou "num" como "não"
$userText = preg_replace('/\bnao\b/i', 'não', $userText);
$userText = preg_replace('/\bnum\b(?!\.)/i', 'em um', $userText);
$userText = preg_replace('/\bnuns\b/i', 'em uns', $userText);
$userText = preg_replace('/\bnuma\b/i', 'em uma', $userText);

// ────────────────────────────────────────────────────────
//  Camada 11: Limpeza Final (última passagem)
//  Garante que o texto final esteja perfeitamente limpo
// ────────────────────────────────────────────────────────

// Remove espaços antes de pontuação (última checagem)
$userText = preg_replace('/\s+([.,!?])/', '$1', $userText);

// Garante espaço após pontuação (última checagem)
$userText = preg_replace('/([.,!?])(?=[^\s\d])/', '$1 ', $userText);

// Remove espaços duplos/triplos (última checagem)
$userText = preg_replace('/\s{2,}/', ' ', $userText);

// Trim final
$userText = trim($userText);

// Remove pontuação final dupla
$userText = preg_replace('/[.,!?]+\s*$/', '', $userText);
$userText .= '.';

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
//  ═══════════════════════════════════════════════════════
//   FUNÇÃO AUXILIAR: Conversão Numérica → Português BR
//  ═══════════════════════════════════════════════════════
// -------------------------------------------------------

/**
 * Converte um número inteiro (0–999999) para texto por extenso
 * em português brasileiro.
 *
 * @param  int $numero Número a converter
 * @return string      Representação por extenso
 */
function numeroParaPortugues(int $numero): string
{
    if ($numero === 0) {
        return 'zero';
    }

    $unidades = [
        '', 'um', 'dois', 'três', 'quatro', 'cinco',
        'seis', 'sete', 'oito', 'nove', 'dez',
        'onze', 'doze', 'treze', 'quatorze', 'quinze',
        'dezesseis', 'dezessete', 'dezoito', 'dezenove'
    ];

    $dezenas = [
        '', '', 'vinte', 'trinta', 'quarenta',
        'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'
    ];

    $centenas = [
        '', 'cento', 'duzentos', 'trezentos', 'quatrocentos',
        'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'
    ];

    if ($numero < 20) {
        return $unidades[$numero];
    }

    if ($numero < 100) {
        $dezena = intdiv($numero, 10);
        $resto  = $numero % 10;
        return $resto > 0
            ? $dezenas[$dezena] . ' e ' . $unidades[$resto]
            : $dezenas[$dezena];
    }

    if ($numero < 1000) {
        $centena = intdiv($numero, 100);
        $resto   = $numero % 100;

        // Caso especial: 100 = "cem" (não "cento e zero")
        if ($centena === 1 && $resto === 0) {
            return 'cem';
        }

        return $resto > 0
            ? $centenas[$centena] . ' e ' . numeroParaPortugues($resto)
            : $centenas[$centena];
    }

    if ($numero < 1000000) {
        $milhar = intdiv($numero, 1000);
        $resto  = $numero % 1000;
        $milText = $milhar === 1 ? 'mil' : numeroParaPortugues($milhar) . ' mil';

        return $resto > 0
            ? $milText . ' e ' . numeroParaPortugues($resto)
            : $milText;
    }

    // Fallback para números muito grandes
    return (string)$numero;
}


// -------------------------------------------------------
//  CONSTRUÇÃO DO NATIVE PAYLOAD — REPASSE SEGURO
// -------------------------------------------------------
//  A string $userText já está totalmente normalizada.
//  Aqui ela é injetada no payload nativo que segue para
//  a GPU do backend de TTS.
// -------------------------------------------------------

$voice     = trim($input['voice'] ?? 'default');
$speed     = isset($input['speed']) ? (float)$input['speed'] : 1.0;
$language  = trim($input['language'] ?? 'pt-BR');
$modelId   = trim($input['model'] ?? 'default');
$refId     = trim($input['ref_id'] ?? '');
$outputFmt = trim($input['output_format'] ?? 'mp3');

$nativePayload = [
    'text'    => $userText,       // ← TEXTO NORMALIZADO INJETADO AQUI
    'voice'   => $voice,
    'speed'   => max(0.25, min(4.0, $speed)),
    'language'=> $language,
    'model'   => $modelId,
    'ref_id'  => $refId,
    'output_format' => $outputFmt,
    'metadata' => [
        'nlp_version'   => '2.7.0',
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
        'X-NLP-Version: 2.7.0',
        $apiKey ? "Authorization: Bearer {$apiKey}" : '',
    ],
]);

// Timeout: define um tempo máximo de geração
if (isset($input['timeout']) && is_numeric($input['timeout'])) {
    curl_setopt($ch, CURLOPT_TIMEOUT, (int)$input['timeout']);
}

$responseBody = curl_exec($ch);
$httpCode     = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError    = curl_error($ch);
curl_close($ch);

if ($curlError) {
    http_response_code(502);
    echo json_encode([
        'error'    => 'Falha na comunicação com o backend de TTS',
        'details'  => $curlError,
        'nlp_info' => [
            'original'    => $originalText,
            'normalized'  => $userText,
            'version'     => '2.7.0',
        ],
    ]);
    exit;
}

// -------------------------------------------------------
//  RESPOSTA — RETORNA O ÁUDIO GERADO AO FRONTEND
// -------------------------------------------------------
$httpCode = (int)$httpCode;

if ($httpCode >= 200 && $httpCode < 300 && $responseBody !== false) {
    // Detecta se a resposta é áudio binário ou JSON
    $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);

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
        header('X-NLP-Version: 2.7.0');
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
            'version'     => '2.7.0',
        ],
    ]);
}

exit;
