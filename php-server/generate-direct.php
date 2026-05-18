<?php
// generate-direct.php - Geracao de voz TTS via VozPro (chamada DIRETA do browser)
// Bypassa completamente o Vercel para evitar timeout de 60s
// Usa HMAC token para autenticacao (mesmo padrao do upload-direct.php)
// v4: SSE Streaming persistente + CORRECOES
// - CURLOPT_ENCODING => '' em TODOS os curl (bloqueia gzip que corrompe audio)
// - Token 30min (igual generate.php/omnivoice)
// - SSE timeout 600s (textos longos)
// - CORS header_remove
// - cleanText() (remove caracteres de controle invisiveis)
// - SSE headers completos (Cache-Control, Connection, X-Accel-Buffering, Accept-Encoding)
// - Extensao detectada do audio gerado (nao mais forca .wav)

set_time_limit(0);
ini_set('max_input_time', 0);
ini_set('memory_limit', '512M');
// v5: fix duplo array_pop no SSE buffer + trimAudio adicionado

require_once __DIR__ . '/config.php';

// CORS (necessario para chamada direta do browser)
header_remove('Access-Control-Allow-Origin');
header_remove('Access-Control-Allow-Methods');
header_remove('Access-Control-Allow-Headers');
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Generate-Token');

// Responder preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['erro' => 'Metodo nao permitido']);
    exit;
}

// ===================== VALIDACAO HMAC TOKEN =====================
$token = $_SERVER['HTTP_X_GENERATE_TOKEN'] ?? '';
if (empty($token)) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token de geracao necessario']);
    exit;
}

// Token format: timestamp.hmac_sha256
$parts = explode('.', $token);
if (count($parts) !== 2) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido (formato)']);
    exit;
}

$timestamp = (int)$parts[0];
$receivedHmac = $parts[1];

// Token expira em 30 minutos (geracao de texto longo pode demorar)
if (time() - $timestamp > 1800) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token expirado, tente novamente']);
    exit;
}

// Token no futuro (diferenca de relogio)
if ($timestamp > time() + 60) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido']);
    exit;
}

// Verificar HMAC usando a API_KEY como segredo
$expectedHmac = hash_hmac('sha256', (string)$timestamp, API_KEY);
if (!hash_equals($expectedHmac, $receivedHmac)) {
    http_response_code(401);
    echo json_encode(['erro' => 'Token invalido (assinatura)']);
    exit;
}

// ===================== DEBUG LOGGER =====================
$debugSteps = [];
$debugStart = microtime(true);

function debugLog($step, $status, $detail = '') {
    global $debugSteps, $debugStart;
    $debugSteps[] = [
        'time' => date('H:i:s'),
        'step' => $step,
        'status' => $status,
        'detail' => $detail,
        'duration' => round((microtime(true) - $debugStart) * 1000)
    ];
}

function debugResult() {
    global $debugSteps, $debugStart;
    return [
        'totalDuration' => round((microtime(true) - $debugStart) * 1000),
        'steps' => $debugSteps
    ];
}

function returnError($msg, $code = 500) {
    http_response_code($code);
    echo json_encode([
        'erro' => $msg,
        'debug' => debugResult()
    ]);
    exit;
}

// ===================== STRIP SSML (defesa) =====================
function stripSSML($text) {
    if (!is_string($text)) return '';
    if (!preg_match('/<[a-z][^>]*>/i', $text)) return $text;
    $r = preg_replace('/<[^>]+>/', '', $text);
    $r = html_entity_decode($r, ENT_QUOTES | ENT_XML1, 'UTF-8');
    return trim(preg_replace('/\s+/', ' ', $r));
}

// ===================== LIMPAR TEXTO (defesa extra) =====================
// Remove caracteres de controle invisiveis que podem causar garbling
function cleanText($text) {
    if (!is_string($text)) return '';
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $text);
    $text = str_replace(["\r\n", "\r"], "\n", $text);
    $text = preg_replace('/\n{3,}/', "\n\n", $text);
    return trim($text);
}

// ===================== DICIONARIO PRONUNCIA PORTUGUES =====================
// Corrige SOMENTE palavras que o TTS pronuncia errado.
//
// REGRA DA LETRA X EM PORTUGUES (nao mexer no que ja esta certo!):
//   ex- + vogal   = Z     (exato = ezato)         <-- TTS ERRA AQUI, corrigir
//   x + consoante = SS/KS  (proximo = prossimo, anexo = aneksso)  <-- TTS ja acerta, NAO mexer
//   x antes de A  = CH/SH  (taxa = tacha)          <-- TTS ja acerta, NAO mexer
//   enx- / ch-    = SH     (enxame, chave)         <-- TTS ja acerta, NAO mexer
//
// O TTS so erra no "ex-" + vogal (fala ekssatamente em vez de ezatamente).
// Palavras como anexo, proximo, texto, complexo, taxa ja sao pronunciadas certo.
function fixPortuguesePronunciation($text) {
    if (!is_string($text) || empty($text)) return $text;

    // Apenas palavras com "ex-" onde X soa como Z e o TTS fala "eks"
    $dict = [
        'exatamente'  => 'ezatamente',
        'exato'       => 'ezato',
        'exata'       => 'ezata',
        'exatos'      => 'ezatos',
        'exatas'      => 'ezatas',
        'exemplo'     => 'ezemplo',
        'exemplos'    => 'ezemplos',
        'existir'     => 'ezistir',
        'existe'      => 'eziste',
        'existem'     => 'ezistem',
        'existente'   => 'ezistente',
        'exame'       => 'ezame',
        'exames'      => 'ezames',
        'examinar'    => 'ezaminar',
        'exercicio'   => 'ezerccio',
        'exercicios'  => 'ezerccios',
        'exercer'     => 'ezerccer',
        'excecao'     => 'essecao',
        'excecoes'    => 'esecoes',
        'excesso'     => 'ecesso',
        'excessivo'   => 'ecessivo',
        'excluir'     => 'escluir',
        'exclusivo'   => 'esclusivo',
        'exibir'      => 'ezibir',
        'exibicao'    => 'ezibicao',
        'experiencia' => 'esperiencia',
        'experimento' => 'esperimento',
        'explicar'    => 'esplicar',
        'explicacao'  => 'esplicacao',
        'explorar'    => 'esplorar',
        'explosao'    => 'esplosao',
        'exposicao'   => 'esposicao',
        'expressar'   => 'espressar',
        'expresso'    => 'espresso',
        'extensao'    => 'estensao',
        'extenso'     => 'estenso',
        'extensivo'   => 'estensivo',
        'exterior'    => 'esterior',
        'externo'     => 'esterno',
        'extra'       => 'estra',
        'extraordinario' => 'estraordinario',
        'extrema'     => 'estrema',
        'extremo'     => 'estremo',
        'extremidade' => 'estremidade',
        'exigir'      => 'ezigir',
        'exigente'    => 'ezigente',
        'exotico'     => 'ezotico',
        'exagerar'    => 'ezagerar',
        'exagero'     => 'ezagero',
        'exigencia'   => 'ezigencia',
        'exumir'      => 'ezumir',
        'exumacao'    => 'ezumacao',
    ];

    // FALBACK: Palavras ja corrompidas pelo frontend (preprocessX converteu x→ks)
    // O frontend pode ter transformado "exatamente" em "eksatamente" ANTES do PHP receber.
    // Este dicionario captura essas correcoes de emergencia.
    $corrupted = [
        'eksatamente'  => 'ezatamente',
        'ekssatamente' => 'ezatamente',
        'eksato'       => 'ezato',
        'eksata'       => 'ezata',
        'eksexemplo'   => 'ezemplo',
        'eksisitir'    => 'ezistir',
        'eksisiste'    => 'eziste',
        'eksercicio'   => 'ezerccio',
        'eksplicar'    => 'esplicar',
        'ekstremo'     => 'estremo',
        'ekstra'       => 'estra',
    ];

    // DICIONARIO DE SIGLAS: Substitui siglas pela pronuncia em portugues (letra por letra)
    // O TTS tenta pronunciar siglas em ingles (ex: HTML = "aitch-tee-em-el", SQL = "sequel")
    // Aqui forcamos a pronuncia correta em portugues brasileiro
    $abbreviations = [
        // Documentos / identificacao
        'cpf'  => 'ce pe efe',
        'cnpj' => 'ce ene pe jota',
        'rg'   => 'ere ge',
        'cns'  => 'ce ene esse',
        'pis'  => 'pe i esse',
        'pasep' => 'pe a ese e pe',
        'ctps' => 'ce te pe esse',
        'titulo de eleitor' => 'titulo de eleitor',
        'cnh'  => 'ce ene aga',
        'renavam' => 'renavam', // palavra, nao sigla - TTS ja acerta
        'iptu' => 'i pe te u',
        'ipva' => 'i pe ve a',

        // Tecnologia / TI
        'html'  => 'aga te eme ele',
        'css'   => 'ce esse esse',
        'sql'   => 'esse cue ele',
        'api'   => 'a pe i',
        'tts'   => 'te te esse',
        'gpu'   => 'ge pe u',
        'cpu'   => 'ce pe u',
        'pdf'   => 'pe de efe',
        'xml'   => 'equis eme ele',
        'json'  => 'jei otim eson',
        'url'   => 'u erre ele',
        'ui'    => 'u i',
        'ux'    => 'u equis',
        'php'   => 'pe aga pe',
        'sdk'   => 'esse de ca',
        'csv'   => 'ce esse ve',
        'png'   => 'pe ene ge',
        'jpg'   => 'jota pe ge',
        'jpeg'  => 'jota pe e i',
        'gif'   => 'ge i efe',
        'svg'   => 'esse ve ge',
        'mp3'   => 'eme pe treis',
        'mp4'   => 'eme pe quatro',
        'jwt'   => 'jei dableiu te',
        'tcp'   => 'te ce pe',
        'dns'   => 'de ene esse',
        'ftp'   => 'efe te pe',
        'ssh'   => 'esse esse aga',
        'sms'   => 'esse eme esse',
        'http'  => 'aga te te pe',
        'https' => 'aga te te pe esse',
        'ipv4'  => 'i pe ve quatro',
        'ipv6'  => 'i pe ve seis',
        'seo'   => 'esse e o',
        'crm'   => 'ce erre eme',
        'erp'   => 'e erre pe',
        'saas'  => 'essa a esse',
        'iaas'  => 'i a a esse',
        'paas'  => 'pa a esse',
        'html5' => 'aga te eme ele cinco',
        'mysql' => 'me i esse cue ele',
        'nosql' => 'no esse cue ele',
        'oauth' => 'o aut',
        'rest'  => 'reste',
        'soap'  => 'sope',
        'aws'   => 'a dableiu esse',
        'gcp'   => 'ge ce pe',

        // Redes / telecom
        'wifi'  => 'uai fai',
        'wan'   => 'ua ane',
        'lan'   => 'el ane',
        'vlan'  => 've el ane',
        'vpn'   => 've pe ene',
        'ip'    => 'i pe',
        'mac'   => 'em a ce',
        'ssd'   => 'esse esse de',
        'hdmi'  => 'aga de eme i',
        'usb'   => 'u esse be',
        'bluetooth' => 'bluetooth',

        // Medicina / ciencia
        'sus'   => 'esse u esse',
        'ans'   => 'a ene esse',
        'anvisa' => 'anvisa',
        'hiv'   => 'aga i ve',

        // Governo / orgaos
        'ibge'  => 'i be ge e',
        'inss'  => 'i ene esse esse',
        'receita federal' => 'receita federal',
        'pf'    => 'pe efe',
        'pj'    => 'pe jota',
        'mei'   => 'eme e i',
        'cnpj'  => 'ce ene pe jota',
        'mf'    => 'eme efe',
        'bc'    => 'be ce',
        'cmn'   => 'ce eme ene',

        // Educacao
        'enem'  => 'e ene eme',
        'prouni' => 'prouni',
        'fies'  => 'fiis',
        'saeb'  => 'essa e be',

        // Financeiro
        'pix'   => 'piquis',
        'spc'   => 'esse pe ce',
        'serasa' => 'serasa',
        'cdi'   => 'ce de i',
        'selic' => 'selic',
        'igpm'  => 'i ge pe eme',
        'ipca'  => 'i pe ce a',
        'inpc'  => 'i ene pe ce',
        'pib'   => 'pe i be',
        'gdp'   => 'gi di pi',

        // Outros
        'ceo'   => 'ce i o',
        'cfo'   => 'ce efe o',
        'cto'   => 'ce te o',
        'coo'   => 'ce o o',
        'hr'    => 'aga erre',
        'rh'    => 'erre aga',
        'cv'    => 'ce ve',
        'faq'   => 'efe a que',
        'tiktok' => 'tic toc',
        'youtube' => 'ioutube',
        'whatsapp' => 'uatsape',
    ];

    // DICIONARIO DE PALAVRAS PROBLEMATICAS
    // Palavras comuns que o TTS pronuncia com erro de timbre/vogal
    $problemWords = [
        'teste'       => 'téstie',    // TTS fala "têste" (aberto) -> forcamos "téstie" (fechado)
        'testes'      => 'tésties',   // plural
        'testar'      => 'testar',    // verbo - TTS geralmente acerta
        'testando'    => 'testando',  // verbo - TTS geralmente acerta
        'testemunha'  => 'testemunha',
        'testemunhar' => 'testemunhar',
    ];

    // DICIONARIO DE PALAVRAS ESTRANGEIRAS COMUNS
    // SO palavras que o TTS pronuncia claramente em ingles (sotaque estrangeiro)
    // e os brasileiros falam aportuguesado. NAO incluir palavras que o TTS ja acerta.
    // Regra: se o brasileiro fala "saite", "imeil", "loguine", o TTS precisa falar igual.
    $foreignWords = [
        // Internet / web - pronunciadas como brasileiros falam
        'site'       => 'saite',
        'sites'      => 'saites',
        'website'    => 'uaibe saite',
        'e-mail'     => 'imeil',
        'email'      => 'imeil',
        'login'      => 'login',
        'logout'     => 'logaut',
        'password'   => 'paswordi',
        'dashboard'  => 'dachebord',
        'download'   => 'downloadi',
        'upload'     => 'uploadi',
        'backup'     => 'bequi',
        'feedback'   => 'fidebequi',
        'link'       => 'linqui',
        'click'      => 'clic',
        'app'        => 'epi',
        'apps'       => 'epis',
        'chat'       => 'tchat',
        'bot'        => 'bote',
        'ai'         => 'a i',

        // TI / dev - pronunciadas aportuguesadas
        'software'   => 'softueire',
        'hardware'   => 'iardueire',
        'setup'      => 'setape',
        'deploy'     => 'deploye',
        'frontend'   => 'frontende',
        'backend'    => 'bakiende',
        'framework'  => 'frameuoque',
        'plugin'     => 'pluguine',
        'token'      => 'toquene',
        'default'    => 'defauti',
        'setting'    => 'setingue',
        'bug'        => 'bage',
        'release'    => 'rileise',
        'update'     => 'updeite',
        'upgrade'    => 'upugreide',
        'feature'    => 'fitxe',
        'performance' => 'performanse',
        'container'  => 'containe',
        'docker'     => 'doque',

        // Redes / telecom
        'streaming'  => 'streaminge',
        'bluetooth'  => 'blutufe',
        'wifi'       => 'uaifai',
        'server'     => 'servidor',
        'server'     => 'servidores',
        'database'   => 'beise de dados',
        'database'   => 'beise de dados',

        // Dispositivos
        'smartphone' => 'smartfone',
        'laptop'     => 'laptop',
        'notebook'   => 'notebooque',
        'tablet'     => 'tablete',
        'headphone'  => 'headfone',
        'keyboard'   => 'teclado',
        'mouse'      => 'mause',
        'speaker'    => 'speiquer',
        'microphone' => 'microfone',
        'printer'    => 'printe',

        // Marketing / business
        'marketing'  => 'marqueteingue',
        'meeting'    => 'mitingue',
        'startup'    => 'startape',
        'branding'   => 'brandinge',
        'newsletter' => 'newsletter',
        'analytics'  => 'analitiques',

        // Segurança
        'hacker'     => 'haquer',
        'phishing'   => 'fixingue',
        'malware'    => 'maluere',
        'firewall'   => 'faireuol',

        // Social media
        'hashtag'    => 'axetaque',
        'podcast'    => 'podcaste',
        'trending'   => 'trendingue',
        'vlog'       => 'vloque',
        'follower'   => 'seguidor',
        'follow'     => 'folou',

        // UX / UI
        'slider'     => 'slaider',
        'widget'     => 'uidguelle',
        'tooltip'    => 'tulipe',
        'popup'      => 'popape',
        'checkbox'   => 'xequeboxe',
        'dropdown'   => 'dropdowni',
        'scroll'     => 'escrole',
        'thumbnail'  => 'thumbnaille',

        // Outras comuns que o TTS fala em ingles
        'speech'     => 'espiichi',
        'review'     => 'reviu',
        'preview'    => 'previu',
        'overview'   => 'overviewi',
        'guide'      => 'gaide',
        'tutorial'   => 'tutoriale',
        'template'   => 'template',
        'layout'     => 'laiaute',
        'gambling'   => 'gamblingue',
        'gameplay'   => 'gameplei',
        'fitness'    => 'fitnesse',
        'brand'      => 'brande',
        'premium'    => 'premiumie',
        'discount'   => 'descontou',
        'coupon'     => 'cupom',
        'checkout'   => 'xequeaute',
        'shipping'   => 'chipinge',
        'delivery'   => 'delimiterie',
        'standard'   => 'standarde',
        'enterprise' => 'enterpraize',
        'deadline'   => 'dedlaine',
        'schedule'   => 'esquejuule',
        'timeline'   => 'taimleine',
        'reminder'   => 'remainde',
        'status'     => 'statusse',
        'priority'   => 'prioridaide',
        'category'   => 'categoorie',
        'notification' => 'notifiquexeone',
        'attachment' => 'ataquexemente',
        'screenshot' => 'screenshoti',
        'resolution' => 'resoluxam',
        'quality'    => 'qualidaide',
        'autoplay'   => 'autopurei',
        'subtitle'   => 'subtitle',
        'volume'     => 'voliumi',
        'mute'       => 'miuti',
        'playlist'   => 'playlisti',
        'playback'   => 'pureibeque',

        // Financeiro / corporativo
        'budget'     => 'borjete',
        'invoice'    => 'invoice',

        // AI / ML
        'machine learning' => 'machine learningue',
        'deep learning' => 'deep learningue',
        'neural'     => 'neural',
        'algorithm'  => 'algoritme',
    ];

    // Aplicar dicionario principal (ex- palavras)
    foreach ($dict as $wrong => $correct) {
        $text = preg_replace('/\b' . preg_quote($wrong, '/') . '\b/i', $correct, $text);
    }

    // Aplicar correcoes de emergencia para palavras corrompidas
    foreach ($corrupted as $wrong => $correct) {
        $text = preg_replace('/\b' . preg_quote($wrong, '/') . '\b/i', $correct, $text);
    }

    // Aplicar siglas (case-insensitive, word boundary)
    foreach ($abbreviations as $wrong => $correct) {
        $text = preg_replace('/\b' . preg_quote($wrong, '/') . '\b/i', $correct, $text);
    }

    // Aplicar correcoes de palavras problematicas
    foreach ($problemWords as $wrong => $correct) {
        $text = preg_replace('/\b' . preg_quote($wrong, '/') . '\b/i', $correct, $text);
    }

    // Aplicar palavras estrangeiras (pronuncia aportuguesada)
    foreach ($foreignWords as $wrong => $correct) {
        $text = preg_replace('/\b' . preg_quote($wrong, '/') . '\b/i', $correct, $text);
    }

    // FALBACK FINAL: Regex generica para ex- + vogal que o frontend corrompeu
    // Captura qualquer "eksX" ou "ekssX" que comeca com ex- original
    $text = preg_replace('/\beks([aeiouáàãâéèêíïóôõúü])/i', 'ez$1', $text);

    return $text;
}

// ===================== LER INPUT JSON =====================
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if (!$input) {
    returnError('JSON invalido ou vazio', 400);
}

$texto = $input['text'] ?? '';

// DEFESA: strip SSML + clean texto + corrigir pronuncia PT-BR + forcar contexto
$texto = stripSSML($texto);
$texto = cleanText($texto);
$texto = fixPortuguesePronunciation($texto);
$idioma = $input['language'] ?? 'Auto';
// FORCAR PORTUGUES: autodetecção do GPT-SoVITS causa mistura de idiomas
if (empty($idioma) || $idioma === 'Auto' || strtolower($idioma) === 'auto') {
    $idioma = 'Portuguese';
}
$refAudioUrl = $input['refAudioUrl'] ?? '';
$refAudioPath = $input['refAudioPath'] ?? '';
$refText = $input['refText'] ?? '';
$instruct = $input['instruct'] ?? '';
// DETECCAO DE IDIOMA (usado para prefixo PT-BR no texto)
$isPortuguese = in_array(strtolower($idioma), ['portuguese', 'portugues', 'pt', 'pt-br', 'pt_br']);
// NOTA: NAO adicionamos instruct automatico! O GPT-SoVITS so aceita termos especificos:
// male, female, high pitch, low pitch, portuguese accent, whisper, teenager, child, elderly, etc.
// Texto livre no instruct causa ValueError: "Unsupported instruct items found"
$refAudioName = $input['refAudioName'] ?? 'ref_audio.wav';
$speed = $input['speed'] ?? 1.0;
// Clamp velocidade: modelo OmniVoice/GPT-SoVITS fica distorcido fora desta faixa
// < 0.8 = audio reverso/garbled ("lingua dos anjos") | > 1.3 = acelera demais/engole palavras
$speedOriginal = $speed;
$speed = max(0.8, min(1.3, (float)$speed));
$numStep = $input['numStep'] ?? 32;
$guidanceScale = $input['guidanceScale'] ?? 2.0;

// Prefixo [PT-BR] para forcar idioma no tokenizer do GPT-SoVITS
if ($isPortuguese) {
    $texto = '[PT-BR] ' . $texto;
}

debugLog('Input recebido', 'info', "texto: " . mb_substr($texto, 0, 50) . " | idioma: $idioma | steps: $numStep | speed: $speedOriginal -> $speed");

if (empty(trim($texto))) {
    returnError('Texto e obrigatorio', 400);
}
if (empty($refAudioUrl) && empty($refAudioPath)) {
    returnError('Audio de referencia nao fornecido', 400);
}

$hfUrl = defined('HF_SPACE_URL') ? HF_SPACE_URL : 'https://k2-fsa-omnivoice.hf.space';
debugLog('HF Space', 'info', $hfUrl);

// ===================== FUNCOES =====================

/**
 * Baixa audio de referencia do servidor PHP
 */
function downloadRefAudio($url, $name) {
    debugLog('Download ref audio', 'info', 'de: ' . mb_substr($url, 0, 80));
    $tempFile = tempnam(sys_get_temp_dir(), 'vp_ref_') . '.' . pathinfo($name, PATHINFO_EXTENSION);

    $ch = curl_init($url);
    $fp = fopen($tempFile, 'w');
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao gzip/brotli (corrompe audio via tunnel)
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $dlOk = curl_exec($ch);
    $dlHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);

    if ($dlOk && $dlHttpCode == 200 && filesize($tempFile) > 0) {
        debugLog('Download ref audio', 'ok', round(filesize($tempFile) / 1024) . 'KB');
        return $tempFile;
    }
    debugLog('Download ref audio', 'error', "HTTP $dlHttpCode");
    if (file_exists($tempFile)) unlink($tempFile);
    return null;
}

/**
 * Upload de arquivo local para HF Space
 */
function uploadToHF($filePath, $fileName, $hfUrl) {
    debugLog('Upload para HF', 'info', 'enviando...');

    $ch = curl_init($hfUrl . '/gradio_api/upload');
    $cfile = new CURLFile($filePath, mime_content_type($filePath), $fileName);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['files' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao (corrompe upload de audio via tunnel)
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code == 200 && $resp) {
        $data = json_decode($resp, true);
        if (is_array($data) && count($data) > 0) {
            debugLog('Upload para HF', 'ok', $data[0]);
            return $data[0];
        }
    }
    debugLog('Upload para HF', 'error', "HTTP $code");
    return null;
}

/**
 * Submete job ao Gradio, retorna event_id ou null
 */
function submitToGradio($gradioData, $hfUrl) {
    debugLog('Submit Gradio', 'info', 'enviando job...');

    $ch = curl_init($hfUrl . '/gradio_api/call/_clone_fn');
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['data' => $gradioData]),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 90,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao no submit
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($code != 200 || !$resp) {
        debugLog('Submit Gradio', 'error', "HTTP $code");
        return null;
    }

    $data = json_decode($resp, true);
    $eventId = $data['event_id'] ?? null;

    if ($eventId) {
        debugLog('Submit Gradio', 'ok', "event_id: $eventId");
    } else {
        debugLog('Submit Gradio', 'error', 'sem event_id');
    }

    return $eventId;
}

/**
 * SSE Streaming - CONEXAO PERSISTENTE que fica aberta ate o resultado chegar.
 * Igual ao site oficial do Gradio funciona.
 *
 * Ao inves de fazer 180 requests HTTP separados (polling),
 * faz UMA conexao e le os eventos conforme chegam (heartbeats, complete, error).
 */
function streamSSEForResult($eventId, $hfUrl, $timeoutSec = 600) {
    debugLog('SSE Stream', 'info', "Abrindo conexao persistente para $eventId...");

    $audioUrl = null;
    $error = null;
    $buffer = '';
    $heartbeatCount = 0;
    $startTime = time();

    $ch = curl_init($hfUrl . '/gradio_api/call/_clone_fn/' . $eventId);

    // Callback que processa os chunks em tempo real
    $writeFn = function($ch, $chunk) use (&$buffer, &$audioUrl, &$error, &$heartbeatCount, &$startTime, $timeoutSec) {
        $buffer .= $chunk;

        // Timeout check
        if (time() - $startTime > $timeoutSec) {
            return -1; // aborta o curl
        }

        // Processar blocos SSE completos
        $blocks = explode("\n\n", $buffer);
        // Manter ultimo bloco possivelmente incompleto
        $buffer = array_pop($blocks) ?? '';

        foreach ($blocks as $block) {
            $block = trim($block);
            if (empty($block)) continue;

            $lines = explode("\n", $block);
            $eventType = '';
            $eventData = '';

            foreach ($lines as $line) {
                if (strpos($line, 'event: ') === 0) {
                    $eventType = trim(substr($line, 7));
                }
                if (strpos($line, 'data: ') === 0) {
                    $eventData = trim(substr($line, 6));
                }
            }

            // COMPLETE = audio gerado!
            if ($eventType === 'complete' && !empty($eventData)) {
                debugLog('SSE Stream', 'ok', 'Evento COMPLETE recebido!');
                debugLog('SSE Raw Data', 'info', mb_substr($eventData, 0, 500));
                $resultData = json_decode($eventData, true);
                debugLog('SSE Parsed', 'info', 'type=' . gettype($resultData) . (is_array($resultData) ? ' count=' . count($resultData) : '') . ' | keys=' . (is_array($resultData) ? implode(',', array_keys($resultData)) : 'N/A'));
                if (is_array($resultData) && count($resultData) >= 2) {
                    $output = $resultData[0];
                    debugLog('SSE Output[0]', 'info', 'type=' . gettype($output) . ' | ' . mb_substr(json_encode($output), 0, 300));
                    if (isset($output['url'])) {
                        $audioUrl = $output['url'];
                    } elseif (isset($output['path'])) {
                        $audioUrl = $hfUrl . '/gradio_api/file=' . $output['path'];
                    } else {
                        debugLog('SSE Output[0]', 'warn', 'Sem url nem path! Conteudo: ' . mb_substr(json_encode($output), 0, 500));
                    }
                } elseif (is_array($resultData) && count($resultData) === 1) {
                    debugLog('SSE Parsed', 'warn', 'Apenas 1 elemento: ' . mb_substr(json_encode($resultData[0]), 0, 300));
                } else {
                    debugLog('SSE Parsed', 'warn', 'Formato inesperado! rawData: ' . mb_substr($eventData, 0, 500));
                }
                if ($audioUrl) {
                    debugLog('SSE Stream', 'ok', 'Audio URL: ' . mb_substr($audioUrl, 0, 80));
                } else {
                    $error = 'Sem URL no output';
                }
                return -1; // encerra a conexao
            }

            // ERROR
            if ($eventType === 'error') {
                debugLog('SSE Stream', 'error', 'Evento ERROR: ' . mb_substr($eventData ?: 'vazio', 0, 300));

                if (empty($eventData) || $eventData === 'null') {
                    $error = 'null';
                } elseif (strpos($eventData, '404') !== false) {
                    $error = '404';
                } else {
                    $errParsed = json_decode($eventData, true);
                    $error = $errParsed['error'] ?? $errParsed['message'] ?? 'Erro na geracao';
                }
                return -1; // encerra a conexao
            }

            // HEARTBEAT = conexao viva, continuar
            if ($eventType === 'heartbeat') {
                $heartbeatCount++;
                if ($heartbeatCount <= 3 || $heartbeatCount % 10 === 0) {
                    debugLog('SSE Stream', 'info', "Heartbeat #$heartbeatCount (conexao ativa...)");
                }
            }
        }

        return strlen($chunk); // continuar lendo
    };

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => false, // NAO esperar tudo - stream!
        CURLOPT_TIMEOUT => $timeoutSec,
        CURLOPT_CONNECTTIMEOUT => 20,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao no SSE stream
        CURLOPT_HTTPHEADER => [
            'Accept: text/event-stream',
            'Cache-Control: no-cache',
            'Connection: keep-alive',
            'X-Accel-Buffering: no',
            'Accept-Encoding: identity',  // Forca sem compressao
        ],
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_WRITEFUNCTION => $writeFn,
    ]);

    curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    // Verificar resultado
    if ($audioUrl) {
        debugLog('SSE Stream', 'ok', "Resultado obtido apos $heartbeatCount heartbeats");
        return ['status' => 'complete', 'audioUrl' => $audioUrl];
    }

    if ($error) {
        return ['status' => 'error', 'error' => $error];
    }

    if ($httpCode == 404) {
        debugLog('SSE Stream', 'error', '404 - event_id perdido');
        return ['status' => 'error', 'error' => '404'];
    }

    if (!empty($curlError)) {
        debugLog('SSE Stream', 'warn', "Erro curl: $curlError");
        return ['status' => 'error', 'error' => 'connection_lost'];
    }

    if (time() - $startTime >= $timeoutSec) {
        debugLog('SSE Stream', 'warn', "Timeout apos {$timeoutSec}s");
        return ['status' => 'error', 'error' => 'timeout'];
    }

    debugLog('SSE Stream', 'warn', "Stream encerrou sem resultado ($heartbeatCount heartbeats)");
    return ['status' => 'error', 'error' => 'stream_ended'];
}

/**
 * Executa o fluxo completo: upload + submit + SSE stream
 */
function runGeneration($gradioData, $refAudioFile, $refAudioName, $hfUrl) {
    // Upload para HF
    if ($refAudioFile && file_exists($refAudioFile)) {
        $path = uploadToHF($refAudioFile, $refAudioName, $hfUrl);
        if (!$path) {
            return ['audioUrl' => null, 'error' => 'Falha no upload do audio para HF Space'];
        }
        $gradioData[2]['path'] = $path;
    }

    // Submit com retry
    $eventId = null;
    for ($s = 0; $s < 3 && !$eventId; $s++) {
        if ($s > 0) {
            debugLog('Submit retry', 'warn', "Tentativa " . ($s + 1) . "/2");
            sleep(3);
        }
        $eventId = submitToGradio($gradioData, $hfUrl);
    }

    if (!$eventId) {
        return ['audioUrl' => null, 'error' => 'Falha ao enviar job para o Gradio'];
    }

    // SSE Stream persistente
    debugLog('Geracao', 'info', "Aguardando resultado via SSE...");
    $result = streamSSEForResult($eventId, $hfUrl, 600);

    if ($result['status'] === 'complete') {
        return ['audioUrl' => $result['audioUrl'], 'error' => null];
    }

    return ['audioUrl' => null, 'error' => $result['error'] ?? 'unknown'];
}

// ===================== FLUXO PRINCIPAL COM RETRY =====================

$audioUrl = null;
$tempRefFile = null;

// Download ref audio (uma vez, reusa)
if (!empty($refAudioUrl)) {
    $tempRefFile = downloadRefAudio($refAudioUrl, $refAudioName);
}

if (!$tempRefFile && !empty($refAudioPath)) {
    debugLog('Fallback HF path', 'info', $refAudioPath);
    $audioUrl = null; // vai usar uploadToHF com path existente
}

// ===== TRIMAR AUDIO DE REFERENCIA (max 10s) para evitar CUDA OOM =====
if ($tempRefFile && file_exists($tempRefFile)) {
    define('MAX_REF_AUDIO_SECONDS', 10);
    $trimScript = __DIR__ . '/trim_audio.py';
    if (file_exists($trimScript)) {
        $ext = strtolower(pathinfo($tempRefFile, PATHINFO_EXTENSION));
        $trimmedFile = tempnam(sys_get_temp_dir(), 'vp_dir_trim_') . '.' . $ext;
        $cmd = 'python3 ' . escapeshellarg($trimScript) . ' '
             . escapeshellarg($tempRefFile) . ' '
             . escapeshellarg($trimmedFile) . ' '
             . escapeshellarg((string)MAX_REF_AUDIO_SECONDS);
        $trimOutput = trim(shell_exec($cmd . ' 2>&1') ?? '');
        if ($trimOutput === 'OK' && file_exists($trimmedFile) && filesize($trimmedFile) > 0) {
            debugLog('Trim ref audio', 'ok', round(filesize($trimmedFile) / 1024) . 'KB (max ' . MAX_REF_AUDIO_SECONDS . 's)');
            unlink($tempRefFile);
            $tempRefFile = $trimmedFile;
        } else {
            debugLog('Trim ref audio', 'warn', 'Falha no trim, usando original: ' . $trimOutput);
            if (file_exists($trimmedFile)) unlink($trimmedFile);
        }
    } else {
        debugLog('Trim ref audio', 'warn', 'trim_audio.py nao encontrado');
    }
}

// Montar dados do Gradio
$gradioData = [
    $texto,
    $idioma,
    [
        'path' => $refAudioPath ?? '',
        'orig_name' => $refAudioName,
        'mime_type' => (pathinfo($refAudioName, PATHINFO_EXTENSION) === 'mp3') ? 'audio/mpeg' : 'audio/wav',
        'is_stream' => false,
        'meta' => ['_type' => 'gradio.FileData']
    ],
    $refText,
    $instruct,
    (int)$numStep,
    (float)$guidanceScale,
    true,    // denoise
    (float)$speed,
    null,    // duration
    true,    // preprocess_prompt
    true     // postprocess_output
];

// Tentar gerar com retry (ate 3 tentativas completas)
$maxRetries = 3;
$lastError = '';

for ($attempt = 0; $attempt < $maxRetries && !$audioUrl; $attempt++) {
    if ($attempt > 0) {
        $waitSec = 5 * $attempt;
        debugLog('Retry', 'info', "Tentativa " . ($attempt + 1) . "/$maxRetries - aguardando ${waitSec}s...");
        sleep($waitSec);
    } else {
        debugLog('Geracao', 'info', 'Iniciando geracao (SSE Streaming, DIRECT)...');
    }

    $result = runGeneration($gradioData, $tempRefFile, $refAudioName, $hfUrl);

    if ($result['audioUrl']) {
        $audioUrl = $result['audioUrl'];
        if ($attempt > 0) {
            debugLog('Retry', 'ok', "Sucesso na tentativa " . ($attempt + 1) . "!");
        }
        break;
    }

    $lastError = $result['error'];

    // So retry erros retriable (null, 404, timeout, conexao perdida, HTTP 5xx)
    $retryableErrors = ['null', '404', 'timeout', 'connection_lost', 'stream_ended', 'HTTP 5'];
    $shouldRetry = false;
    foreach ($retryableErrors as $re) {
        if (stripos($lastError, $re) !== false) {
            $shouldRetry = true;
            break;
        }
    }

    if (!$shouldRetry) {
        debugLog('Retry', 'error', "Erro nao-retriable: $lastError");
        break;
    }

    debugLog('Retry', 'warn', "Erro retriable: $lastError");
}

// Limpar temp
if ($tempRefFile && file_exists($tempRefFile)) unlink($tempRefFile);

if (!$audioUrl) {
    $userMsg = 'Erro na geracao pelo servidor de IA.';
    if ($lastError === 'null') {
        $userMsg = 'Servidor de IA instavel. Tente novamente em instantes.';
    } elseif ($lastError === '404') {
        $userMsg = 'Servidor de IA reiniciou. Tente novamente.';
    } elseif ($lastError === 'timeout') {
        $userMsg = 'Tempo limite excedido na geracao.';
    }
    returnError($userMsg, 504);
}

// ===================== BAIXAR AUDIO GERADO =====================
debugLog('Download audio gerado', 'info', 'baixando...');

// Detectar extensao real do audio gerado (Gradio pode retornar WAV ou MP3)
$ext = strtolower(pathinfo($audioUrl, PATHINFO_EXTENSION));
if (empty($ext) || !in_array($ext, ['wav', 'mp3', 'ogg', 'flac'])) {
    $ext = 'wav'; // default seguro
}
$tempAudioFile = tempnam(sys_get_temp_dir(), 'vp_gen_') . '.' . $ext;

$ch = curl_init($audioUrl);
$fp = fopen($tempAudioFile, 'w');
curl_setopt_array($ch, [
    CURLOPT_FILE => $fp,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_TIMEOUT => 180,
    CURLOPT_ENCODING => '',  // BLOQUEIA compressao (corrompe audio via tunnel!)
    CURLOPT_SSL_VERIFYPEER => false,
]);
$dlOk = curl_exec($ch);
$dlCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);
fclose($fp);

if (!$dlOk || $dlCode != 200 || filesize($tempAudioFile) == 0) {
    if (file_exists($tempAudioFile)) unlink($tempAudioFile);
    returnError("Falha ao baixar audio gerado (HTTP $dlCode)");
}

$audioSize = filesize($tempAudioFile);
debugLog('Download audio gerado', 'ok', round($audioSize / 1024) . 'KB' . ($ext !== 'wav' ? " ($ext)" : ''));

// ===================== CONVERTER PARA BASE64 =====================
debugLog('Base64 encode', 'info', 'convertendo...');
$audioBase64 = base64_encode(file_get_contents($tempAudioFile));

$mimeType = ($ext === 'mp3') ? 'audio/mpeg' : 'audio/wav';

$dataUri = 'data:' . $mimeType . ';base64,' . $audioBase64;
debugLog('Base64 encode', 'ok', round(strlen($audioBase64) / 1024) . 'KB base64');

// Limpar
if ($tempAudioFile && file_exists($tempAudioFile)) unlink($tempAudioFile);

// ===================== RETORNAR =====================
debugLog('FINAL', 'ok', 'audio pronto via PHP DIRECT (SSE Streaming, sem Vercel proxy)');

echo json_encode([
    'audioUrl' => $dataUri,
    'mixed' => false,
    'viaDirectPhp' => true,
    'viaPhp' => true,
    'debug' => debugResult()
]);
?>
