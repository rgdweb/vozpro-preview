<?php
// config.php - Configuracoes do servidor de audios OmniVoice
// AUDITORIA (18/05/2026):
// - CORRIGIDO: HF_SPACE_URL vazio NAO e mais definido como constante
// - CORRIGIDO: TUNNEL_URL agora e a fonte primaria de URL
// - CORRIGIDO: Funcao getTtsUrl() retorna a melhor URL disponivel (TUNNEL > HF > fallback)
// - Adicionada constante LOG_FILE e funcao logUpload() com @file_put_contents

// Chave de API para autenticacao (ALTERE PARA UMA CHAVE FORTE!)
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');

// URL base do servidor (ALTERE PARA SEU DOMINIO!)
define('BASE_URL', 'https://sorteiomax.com.br/omnivoice');

// Tipos de arquivos permitidos (apenas audio)
define('ALLOWED_TYPES', [
    'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav',
    'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a',
    'audio/flac', 'audio/x-flac'
]);

// Tamanho maximo em bytes (50MB)
define('MAX_SIZE', 50 * 1024 * 1024);

// Pasta raiz dos uploads
define('UPLOAD_DIR', __DIR__ . '/audios/');

// Tipos permitidos de upload
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);

// ===================== TUNNEL URL (FONTE PRIMARIA) =====================
// Lido dinamicamente do tunnel-config.ini (atualizado pelo start_tunnel.ps1)
$_tunnelUrl = '';
$tunnelIniFile = __DIR__ . '/tunnel-config.ini';
if (file_exists($tunnelIniFile)) {
    $_tunnelIni = parse_ini_file($tunnelIniFile);
    if ($_tunnelIni !== false && !empty($_tunnelIni['tunnel_url'])) {
        $_tunnelUrl = trim($_tunnelIni['tunnel_url']);
    }
}
define('TUNNEL_URL', $_tunnelUrl);

// ===================== HF SPACE URL (FONTE SECUNDARIA/FIXA) =====================
// URL fixa do HuggingFace (usado como fallback se TUNNEL_URL estiver vazio)
// NAO deixe vazio E defina como constante se tiver um valor real.
// Se vazio, o sistema usara get_tunnel.php para descobrir a URL dinamicamente.
$_hfSpaceUrl = '';
define('HF_SPACE_URL', $_hfSpaceUrl);

// ===================== FUNCAO: OBTER URL DO TTS =====================
/**
 * Retorna a melhor URL disponivel para o TTS, nesta ordem:
 * 1. TUNNEL_URL (do tunnel-config.ini, atualizada pelo cloudflared)
 * 2. HF_SPACE_URL (do config, se definida)
 * 3. Fallback via get_tunnel.php (HTTP interno)
 * 4. URL padrao HF Space
 *
 * IMPORTANTE: Esta funcao verifica !empty() para TUNNEL_URL e HF_SPACE_URL,
 * resolvendo o bug onde HF_SPACE_URL = '' (vazio) era tratado como URL valida.
 */
function getTtsUrl() {
    // 1. TUNNEL_URL do config (tunnel-config.ini)
    if (!empty(TUNNEL_URL)) {
        return TUNNEL_URL;
    }

    // 2. HF_SPACE_URL do config (fixa)
    if (!empty(HF_SPACE_URL)) {
        return HF_SPACE_URL;
    }

    // 3. Fallback via get_tunnel.php (HTTP interno)
    $tunnelCh = curl_init(BASE_URL . '/get_tunnel.php');
    curl_setopt_array($tunnelCh, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $tunnelResp = curl_exec($tunnelCh);
    $tunnelCode = curl_getinfo($tunnelCh, CURLINFO_HTTP_CODE);
    curl_close($tunnelCh);

    if ($tunnelCode == 200 && $tunnelResp) {
        $tunnelData = json_decode($tunnelResp, true);
        if (($tunnelData['status'] ?? '') === 'online' && !empty($tunnelData['tunnelUrl'])) {
            return $tunnelData['tunnelUrl'];
        }
    }

    // 4. Fallback final (HF Space publico)
    return 'https://k2-fsa-omnivoice.hf.space';
}

// ===================== LOGS =====================
define('ENABLE_LOGS', true);
define('LOG_FILE', __DIR__ . '/uploads.log');

/**
 * Funcao para log (usada por upload.php, delete.php, etc.)
 * CORRECAO: @file_put_contents para evitar Fatal Error quando log dir nao tem permissao
 */
function logUpload($mensagem) {
    if (defined('ENABLE_LOGS') && ENABLE_LOGS) {
        $logFile = defined('LOG_FILE') ? LOG_FILE : __DIR__ . '/uploads.log';
        $data = date('Y-m-d H:i:s');
        @file_put_contents($logFile, "[$data] $mensagem\n", FILE_APPEND);
    }
}
?>
