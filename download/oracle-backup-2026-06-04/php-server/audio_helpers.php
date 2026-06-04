<?php
/**
 * audio_helpers.php - Validacao de integridade de audio
 * Valida arquivos WAV/MP3 para garantir que nao estao corrompidos
 * antes de enviar ao TTS ou retornar ao usuario
 * 
 * Uso:
 *   require_once __DIR__ . '/audio_helpers.php';
 *   $result = validateAudioFile($filePath);
 *   if (!$result['valid']) { ... }
 */

/**
 * Valida um arquivo de audio (WAV ou MP3)
 * @param string $filePath Caminho do arquivo
 * @return array ['valid' => bool, 'error' => string|null, 'info' => array]
 */
function validateAudioFile($filePath) {
    if (!file_exists($filePath)) {
        return ['valid' => false, 'error' => 'Arquivo nao existe', 'info' => []];
    }
    
    if (filesize($filePath) == 0) {
        return ['valid' => false, 'error' => 'Arquivo vazio (0 bytes)', 'info' => ['size' => 0]];
    }
    
    // Arquivo muito pequeno (< 100 bytes) provavelmente corrompido
    if (filesize($filePath) < 100) {
        return ['valid' => false, 'error' => 'Arquivo suspeito: ' . filesize($filePath) . ' bytes', 'info' => ['size' => filesize($filePath)]];
    }
    
    $ext = strtolower(pathinfo($filePath, PATHINFO_EXTENSION));
    
    if ($ext === 'wav') {
        return validateWavFile($filePath);
    } elseif ($ext === 'mp3') {
        return validateMp3File($filePath);
    } else {
        // Outros formatos (ogg, flac, m4a) - valida tamanho basico
        $size = filesize($filePath);
        return [
            'valid' => true, 
            'error' => null,
            'info' => [
                'format' => $ext,
                'size' => $size,
                'size_kb' => round($size / 1024),
                'note' => 'Validacao basica (tamanho)'
            ]
        ];
    }
}

/**
 * Valida cabecalho de arquivo WAV
 * Verifica: RIFF header, WAVE format, tamanho valido
 */
function validateWavFile($filePath) {
    $data = file_get_contents($filePath, false, null, 0, 44);
    $size = filesize($filePath);
    
    if (strlen($data) < 44) {
        return ['valid' => false, 'error' => 'WAV header incompleto (' . strlen($data) . ' bytes)', 'info' => ['size' => $size]];
    }
    
    // Verificar RIFF header
    $riff = substr($data, 0, 4);
    if ($riff !== 'RIFF') {
        return ['valid' => false, 'error' => 'WAV invalido: sem header RIFF (encontrado: ' . bin2hex($riff) . ')', 'info' => ['size' => $size]];
    }
    
    // Verificar WAVE
    $wave = substr($data, 8, 4);
    if ($wave !== 'WAVE') {
        return ['valid' => false, 'error' => 'WAV invalido: sem tag WAVE (encontrado: ' . $wave . ')', 'info' => ['size' => $size]];
    }
    
    // Extrair parametros do audio
    $audioFormat = unpack('v', substr($data, 20, 2))[1];
    $numChannels = unpack('v', substr($data, 22, 2))[1];
    $sampleRate = unpack('V', substr($data, 24, 4))[1];
    $bitsPerSample = unpack('v', substr($data, 34, 2))[1];
    $dataSize = unpack('V', substr($data, 40, 4))[1];
    
    // Formato PCM = 1, Float = 3
    if ($audioFormat !== 1 && $audioFormat !== 3) {
        return ['valid' => false, 'error' => 'WAV: formato de audio desconhecido (' . $audioFormat . ')', 'info' => ['size' => $size, 'format' => $audioFormat]];
    }
    
    // Verificar se data size faz sentido
    if ($dataSize > $size + 100) {
        return ['valid' => false, 'error' => 'WAV: data_size (' . $dataSize . ') maior que arquivo (' . $size . ')', 'info' => ['size' => $size, 'data_size' => $dataSize]];
    }
    
    $duration = $sampleRate > 0 ? round($dataSize / ($numChannels * ($bitsPerSample / 8) * $sampleRate), 2) : 0;
    
    return [
        'valid' => true,
        'error' => null,
        'info' => [
            'format' => 'wav',
            'audio_format' => $audioFormat === 1 ? 'PCM' : 'Float',
            'channels' => $numChannels,
            'sample_rate' => $sampleRate,
            'bits_per_sample' => $bitsPerSample,
            'duration_sec' => $duration,
            'size' => $size,
            'size_kb' => round($size / 1024)
        ]
    ];
}

/**
 * Valida arquivo MP3
 * Verifica: sync word, frames validas, duracao estimada
 */
function validateMp3File($filePath) {
    $data = file_get_contents($filePath, false, null, 0, 4096);
    $size = filesize($filePath);
    
    if (strlen($data) < 4) {
        return ['valid' => false, 'error' => 'MP3 muito pequeno para analise', 'info' => ['size' => $size]];
    }
    
    // Pular ID3v2 tag se presente
    $offset = 0;
    if (substr($data, 0, 3) === 'ID3') {
        if (strlen($data) >= 10) {
            $tagSize = ((ord($data[6]) & 0x7F) << 21) 
                     | ((ord($data[7]) & 0x7F) << 14) 
                     | ((ord($data[8]) & 0x7F) << 7) 
                     | (ord($data[9]) & 0x7F);
            $offset = 10 + $tagSize;
        }
    }
    
    // Procurar sync word (0xFF E0+)
    $foundSync = false;
    $foundFrames = 0;
    $bitrate = 0;
    $sampleRate = 0;
    $scanEnd = min(strlen($data), 4096);
    
    for ($i = $offset; $i < $scanEnd - 4; $i++) {
        if ($data[$i] === "\xFF" && (ord($data[$i + 1]) & 0xE0) === 0xE0) {
            $foundSync = true;
            $foundFrames++;
            
            $version = (ord($data[$i + 1]) >> 3) & 0x03;
            $layer = (ord($data[$i + 1]) >> 1) & 0x03;
            $brIdx = (ord($data[$i + 2]) >> 4) & 0x0F;
            $srIdx = (ord($data[$i + 2]) >> 2) & 0x03;
            
            // Tabelas de bitrate
            $brTable = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
            $srTable = [44100, 48000, 32000];
            
            if ($brIdx > 0 && $brIdx < 15 && $srIdx < 3 && $layer === 1) {
                $bitrate = $brTable[$brIdx] * 1000;
                $sampleRate = $srTable[$srIdx];
            }
            
            // Parar apos encontrar 3 frames (suficiente para validar)
            if ($foundFrames >= 3) break;
        }
    }
    
    if (!$foundSync) {
        return ['valid' => false, 'error' => 'MP3 invalido: nenhuma sync frame encontrada', 'info' => ['size' => $size]];
    }
    
    if ($bitrate === 0 || $sampleRate === 0) {
        // Teve sync mas nao conseguiu ler bitrate/samplerate - MP3 possivelmente valido mas header dificil
        return [
            'valid' => true,
            'error' => null,
            'info' => [
                'format' => 'mp3',
                'size' => $size,
                'size_kb' => round($size / 1024),
                'frames_found' => $foundFrames,
                'note' => 'Sync word encontrado, bitrate/samplerate nao decodificados'
            ]
        ];
    }
    
    // Estimar duracao (aproximada)
    $duration = $bitrate > 0 ? round(($size * 8) / $bitrate, 2) : 0;
    
    return [
        'valid' => true,
        'error' => null,
        'info' => [
            'format' => 'mp3',
            'bitrate' => $bitrate,
            'sample_rate' => $sampleRate,
            'duration_sec' => $duration,
            'frames_found' => $foundFrames,
            'size' => $size,
            'size_kb' => round($size / 1024)
        ]
    ];
}

/**
 * Calcula SHA256 de um arquivo (para verificacao de integridade)
 */
function fileSHA256($filePath) {
    if (!file_exists($filePath)) return false;
    return hash_file('sha256', $filePath);
}

/**
 * Baixa URL com validacao de integridade
 * Retorna o caminho do arquivo temporario ou null em caso de falha
 */
function downloadWithValidation($url, $timeout = 60) {
    $tempFile = tempnam(sys_get_temp_dir(), 'vp_val_');
    
    $ch = curl_init($url);
    $fp = fopen($tempFile, 'wb');
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => $timeout,
        CURLOPT_ENCODING => '',
        CURLOPT_SSL_VERIFYPEER => false,
    ]);
    $ok = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    fclose($fp);
    
    if (!$ok || $httpCode != 200 || filesize($tempFile) == 0) {
        if (file_exists($tempFile)) unlink($tempFile);
        return null;
    }
    
    return $tempFile;
}

/**
 * Gera um ID de requisicao unico para tracking
 */
function generateRequestId() {
    return uniqid('req_') . '_' . substr(hash('sha256', microtime(true) . mt_rand()), 0, 8);
}
?>
