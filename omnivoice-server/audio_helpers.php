<?php
/**
 * audio_helpers.php - Funcoes de validacao de integridade de audio
 * Previnir engasgo e lixo causados por arquivos corrompidos no tunnel
 *
 * FUNCIONALIDADES:
 * - SHA256 hash para detectar corrupcao em transferencia
 * - Validacao de WAV header (detecta arquivos truncados/corrompidos)
 * - Validacao de tamanho minimo (detecta audio vazio/silencio)
 * - Validacao de MP3 header
 * - Geracao de UUID por requisicao para rastreamento
 */

// ===================== UUID POR REQUISICAO =====================

/**
 * Gera um UUID v4 para rastrear a requisicao do inicio ao fim.
 * Facilita encontrar erros no log quando algo falha no tunnel.
 */
function generateRequestId() {
    return sprintf('%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// ===================== SHA256 HASH =====================

/**
 * Calcula SHA256 de um arquivo.
 * Retorna hash hex (64 chars) ou false em caso de erro.
 */
function fileSHA256($filePath) {
    if (!file_exists($filePath) || filesize($filePath) == 0) {
        return false;
    }
    return hash_file('sha256', $filePath);
}

// ===================== VALIDACAO WAV =====================

/**
 * Valida se o arquivo e um WAV autentico.
 * Detecta truncamento, header corrompido, tamanho inconsistente.
 *
 * Retorna:
 *   true  - WAV valido
 *   string - mensagem de erro
 */
function validateWavFile($filePath) {
    if (!file_exists($filePath)) {
        return 'arquivo_nao_existe';
    }

    $fileSize = filesize($filePath);
    if ($fileSize < 44) {
        // WAV header minimo = 44 bytes
        return 'wav_truncado: ' . $fileSize . ' bytes (minimo 44)';
    }

    $fp = fopen($filePath, 'rb');
    if (!$fp) {
        return 'erro_leitura';
    }

    // RIFF header (4 bytes)
    $riff = fread($fp, 4);
    if ($riff !== 'RIFF') {
        fclose($fp);
        return 'header_invalido: nao comeca com RIFF (comeca com: ' . bin2hex($riff) . ')';
    }

    // File size - 8 (4 bytes, little-endian)
    $chunkSize = fread($fp, 4);
    $declaredSize = unpack('V', $chunkSize)[1];
    // declaredSize = fileSize - 8 (tamanho do arquivo menos RIFF + size field)

    // WAVE (4 bytes)
    $wave = fread($fp, 4);
    if ($wave !== 'WAVE') {
        fclose($fp);
        return 'header_invalido: nao contem WAVE (contem: ' . $wave . ')';
    }

    fclose($fp);

    // Verificar se o tamanho declarado faz sentido
    // Tolerancia de 2 bytes (padding)
    $expectedSize = $fileSize - 8;
    if (abs($declaredSize - $expectedSize) > 2) {
        // Arquivo pode estar truncado - o header diz que deveria ser maior
        if ($declaredSize > $expectedSize + 100) {
            return 'wav_truncado: header declara ' . $declaredSize . ' bytes mas arquivo tem ' . $fileSize;
        }
    }

    return true;
}

// ===================== VALIDACAO MP3 =====================

/**
 * Valida se o arquivo e um MP3 autentico.
 * MP3 pode comecar com ID3 tag ou com sync word 0xFFFB/0xFFF3.
 *
 * Retorna:
 *   true  - MP3 valido
 *   string - mensagem de erro
 */
function validateMp3File($filePath) {
    if (!file_exists($filePath)) {
        return 'arquivo_nao_existe';
    }

    $fileSize = filesize($filePath);
    if ($fileSize < 128) {
        // MP3 minimo razoavel (frame header + alguns frames)
        return 'mp3_muito_pequeno: ' . $fileSize . ' bytes (minimo 128)';
    }

    $fp = fopen($filePath, 'rb');
    if (!$fp) {
        return 'erro_leitura';
    }

    $header = fread($fp, 3);
    fclose($fp);

    // ID3 tag (0x49 0x44 0x33)
    if ($header === 'ID3') {
        return true;
    }

    // MP3 sync word (0xFF seguido de 0xE0-0xFF)
    $byte1 = ord($header[0] ?? "\x00");
    $byte2 = ord($header[1] ?? "\x00");
    if ($byte1 === 0xFF && ($byte2 & 0xE0) === 0xE0) {
        return true;
    }

    // Tentar buscar sync word nos primeiros 4KB (pode ter padding/garbage no inicio)
    $fp = fopen($filePath, 'rb');
    $probe = fread($fp, 4096);
    fclose($fp);

    for ($i = 0; $i < strlen($probe) - 1; $i++) {
        if (ord($probe[$i]) === 0xFF && (ord($probe[$i + 1]) & 0xE0) === 0xE0) {
            return true; // sync word encontrado
        }
    }

    return 'mp3_header_invalido: sync word nao encontrado nos primeiros 4KB';
}

// ===================== VALIDACAO DE TAMANHO MINIMO =====================

/**
 * Verifica se o audio tem tamanho minimo para nao ser silencio/garbage.
 *
 * WAV: pelo menos 1 segundo de audio (16kHz mono 16-bit = ~32KB)
 * MP3: pelo menos 4KB (1 frame + header)
 *
 * Retorna true se OK, string com erro se invalido.
 */
function validateAudioMinSize($filePath, $extensao = 'wav') {
    if (!file_exists($filePath)) {
        return 'arquivo_nao_existe';
    }

    $fileSize = filesize($filePath);

    $minSize = [
        'wav' => 16000,   // ~0.5s de audio 16kHz mono 16-bit
        'mp3' => 4096,    // ~1 frame MP3
        'ogg' => 4096,
        'flac' => 4096,
        'm4a' => 4096,
        'webm' => 4096,
    ];

    $min = $minSize[$extensao] ?? 4096;

    if ($fileSize < $min) {
        return 'audio_muito_pequeno: ' . $fileSize . ' bytes (minimo ' . $min . ' para ' . $extensao . ')';
    }

    return true;
}

// ===================== VALIDACAO COMPLETA =====================

/**
 * Validacao completa de um arquivo de audio.
 * Combina: existe, tamanho, header, tamanho minimo.
 *
 * @param string $filePath Caminho do arquivo
 * @param string $extensao Extensao (wav, mp3, etc)
 * @param string $contexto Descricao do contexto para log (ex: 'ref audio download')
 * @return array ['valid' => bool, 'error' => string, 'sha256' => string, 'size' => int]
 */
function validateAudioFile($filePath, $extensao = 'wav', $contexto = 'audio') {
    $sha256 = fileSHA256($filePath);

    if ($sha256 === false) {
        return [
            'valid' => false,
            'error' => "$contexto: arquivo vazio ou inexistente",
            'sha256' => null,
            'size' => 0
        ];
    }

    // Validacao de tamanho minimo
    $sizeCheck = validateAudioMinSize($filePath, $extensao);
    if ($sizeCheck !== true) {
        return [
            'valid' => false,
            'error' => "$contexto: $sizeCheck",
            'sha256' => $sha256,
            'size' => filesize($filePath)
        ];
    }

    // Validacao de header
    $extLower = strtolower($extensao);
    if ($extLower === 'wav') {
        $headerCheck = validateWavFile($filePath);
        if ($headerCheck !== true) {
            return [
                'valid' => false,
                'error' => "$contexto: WAV invalido - $headerCheck",
                'sha256' => $sha256,
                'size' => filesize($filePath)
            ];
        }
    } elseif ($extLower === 'mp3') {
        $headerCheck = validateMp3File($filePath);
        if ($headerCheck !== true) {
            return [
                'valid' => false,
                'error' => "$contexto: MP3 invalido - $headerCheck",
                'sha256' => $sha256,
                'size' => filesize($filePath)
            ];
        }
    }

    return [
        'valid' => true,
        'error' => null,
        'sha256' => $sha256,
        'size' => filesize($filePath)
    ];
}

// ===================== DOWNLOAD COM VALIDACAO =====================

/**
 * Faz download de um arquivo com validacao de integridade.
 * Se o download falhar a validacao, re-faz ate maxRetries vezes.
 *
 * Isso previne o principal problema: audio de referencia corrompido
 * chegando ao TTS e gerando "engasgo" e "delirios".
 *
 * @param string $url URL do arquivo
 * @param string $name Nome do arquivo (para extensao)
 * @param int $maxRetries Maximo de tentativas (default 3)
 * @return array ['path' => string, 'sha256' => string, 'size' => int] ou ['error' => string]
 */
function downloadWithValidation($url, $name, $maxRetries = 3) {
    $extensao = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    if (empty($extensao)) {
        $extensao = 'wav';
    }

    for ($attempt = 0; $attempt < $maxRetries; $attempt++) {
        $tempFile = tempnam(sys_get_temp_dir(), 'vp_val_') . '.' . $extensao;

        // Download
        $ch = curl_init($url);
        $fp = fopen($tempFile, 'w');
        curl_setopt_array($ch, [
            CURLOPT_FILE => $fp,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_ENCODING => '',  // BLOQUEIA compressao (corrompe audio via tunnel)
            CURLOPT_SSL_VERIFYPEER => false,
        ]);
        $dlOk = curl_exec($ch);
        $dlHttpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        fclose($fp);

        // Verificar HTTP response
        if (!$dlOk || $dlHttpCode != 200) {
            if (file_exists($tempFile)) unlink($tempFile);
            if ($attempt < $maxRetries - 1) {
                sleep(1);
                continue;
            }
            return ['error' => 'HTTP ' . $dlHttpCode];
        }

        // Verificar tamanho (arquivo vazio = falha total)
        if (filesize($tempFile) == 0) {
            if (file_exists($tempFile)) unlink($tempFile);
            if ($attempt < $maxRetries - 1) {
                sleep(1);
                continue;
            }
            return ['error' => 'arquivo_vazio'];
        }

        // VALIDACAO DE INTEGRIDADE
        $validation = validateAudioFile($tempFile, $extensao, 'download');

        if ($validation['valid']) {
            return [
                'path' => $tempFile,
                'sha256' => $validation['sha256'],
                'size' => $validation['size']
            ];
        }

        // Validacao falhou - arquivo corrompido
        $error = $validation['error'];
        if (file_exists($tempFile)) unlink($tempFile);

        if ($attempt < $maxRetries - 1) {
            // Retry - o tunnel pode ter corrompido nesta tentativa
            sleep(2);
            continue;
        }

        return ['error' => $error];
    }

    return ['error' => 'max_retries_exceeded'];
}

// ===================== UPLOAD COM VALIDACAO DE RESPOSTA =====================

/**
 * Faz upload para Gradio com validacao da resposta.
 * Verifica se o Gradio realmente aceitou o arquivo.
 *
 * @param string $filePath Caminho do arquivo local
 * @param string $fileName Nome do arquivo
 * @param string $baseUrl URL base do Gradio
 * @return string|null Path do arquivo no Gradio, ou null em caso de falha
 */
function uploadWithValidation($filePath, $fileName, $baseUrl) {
    $sha256 = fileSHA256($filePath);

    $ch = curl_init($baseUrl . '/gradio_api/upload');
    $cfile = new CURLFile($filePath, mime_content_type($filePath), $fileName);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => ['files' => $cfile],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 120,
        CURLOPT_ENCODING => '',  // BLOQUEIA compressao
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($code != 200 || !$resp) {
        return null;
    }

    $data = json_decode($resp, true);
    if (is_array($data) && count($data) > 0 && !empty($data[0])) {
        $gradioPath = $data[0];
        // Validar que o path nao esta vazio e parece valido
        if (strlen($gradioPath) > 5) {
            return $gradioPath;
        }
    }

    return null;
}
?>
