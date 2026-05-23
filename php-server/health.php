<?php
// health.php - Diagnóstico completo do servidor VozPro
// Verifica: tunnel, GPU, disco, RAM, arquivos, conexão, fila

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/config.php';

$headers = getallheaders();
$authHeader = $headers['Authorization'] ?? $headers['authorization'] ?? '';
$apiKey = str_replace('Bearer ', '', $authHeader);

if ($apiKey !== API_KEY) {
    http_response_code(401);
    echo json_encode(['sucesso' => false, 'erro' => 'Nao autorizado']);
    exit;
}

$result = [
    'timestamp' => date('Y-m-d H:i:s'),
    'servidor' => gethostname(),
    'status' => 'ok', // muda pra 'warning' ou 'critical' se tiver problema
    'problemas' => [],
    'checks' => [],
];

// ============================================
// 1. TUNNEL - Verificar se cloudflared está OK
// ============================================
$tunnelStatus = ['ok' => false, 'url' => '', 'erro' => ''];

// Ler tunnel-config.ini
$tunnelIniFile = __DIR__ . '/tunnel-config.ini';
if (file_exists($tunnelIniFile)) {
    $tunnelIni = parse_ini_file($tunnelIniFile);
    if ($tunnelIni !== false && !empty($tunnelIni['tunnel_url'])) {
        $tunnelUrl = trim($tunnelIni['tunnel_url']);
        $tunnelStatus['url'] = $tunnelUrl;
        
        // Testar conexão com o tunnel
        $tunnelTest = @file_get_contents($tunnelUrl, false, stream_context_create([
            'http' => ['timeout' => 5, 'method' => 'GET']
        ]));
        
        if ($tunnelTest !== false) {
            $tunnelStatus['ok'] = true;
            $tunnelStatus['latencia_ms'] = 0; // Não dá pra medir com file_get_contents
        } else {
            $tunnelStatus['erro'] = 'Tunnel não responde (cloudflared pode estar down)';
            $result['problemas'][] = 'Tunnel inacessível';
        }
        
        // Verificar idade do tunnel (se foi atualizado recentemente)
        $tunnelMtime = filemtime($tunnelIniFile);
        $tunnelAge = time() - $tunnelMtime;
        $tunnelStatus['idade_segundos'] = $tunnelAge;
        $tunnelStatus['idade_formatada'] = formatarTempo($tunnelAge);
        
        if ($tunnelAge > 3600) {
            $tunnelStatus['aviso'] = 'Tunnel config não é atualizado há mais de 1 hora';
        }
    } else {
        $tunnelStatus['erro'] = 'tunnel-config.ini existe mas sem tunnel_url';
        $result['problemas'][] = 'Sem URL do tunnel';
    }
} else {
    $tunnelStatus['erro'] = 'tunnel-config.ini não encontrado';
    $result['problemas'][] = 'Arquivo de config do tunnel não existe';
}

$result['checks']['tunnel'] = $tunnelStatus;

// ============================================
// 2. GPU - nvidia-smi (se disponível)
// ============================================
$gpuStatus = ['detectada' => false];

$nvidiaOutput = @shell_exec('nvidia-smi --query-gpu=name,memory.used,memory.total,temperature.gpu,utilization.gpu --format=csv,noheader,nounits 2>&1');
if ($nvidiaOutput !== null && trim($nvidiaOutput) !== '') {
    $gpuStatus['detectada'] = true;
    $gpuLines = array_filter(array_map('trim', explode("\n", $nvidiaOutput)));
    
    $gpuStatus['gpus'] = [];
    foreach ($gpuLines as $i => $line) {
        $parts = array_map('trim', str_getcsv($line));
        $gpuInfo = [
            'nome' => $parts[0] ?? 'Desconhecida',
            'vram_usada_mb' => intval($parts[1] ?? 0),
            'vram_total_mb' => intval($parts[2] ?? 0),
            'temperatura_c' => intval($parts[3] ?? 0),
            'utilizacao_porcento' => intval($parts[4] ?? 0),
        ];
        $gpuInfo['vram_livre_mb'] = $gpuInfo['vram_total_mb'] - $gpuInfo['vram_usada_mb'];
        $gpuInfo['vram_uso_porcento'] = $gpuInfo['vram_total_mb'] > 0 
            ? round(($gpuInfo['vram_usada_mb'] / $gpuInfo['vram_total_mb']) * 100, 1) 
            : 0;
        
        // Alertas de GPU
        if ($gpuInfo['temperatura_c'] > 85) {
            $result['problemas'][] = "GPU {$i}: temperatura alta ({$gpuInfo['temperatura_c']}°C)";
            $result['status'] = 'critical';
        } elseif ($gpuInfo['temperatura_c'] > 75) {
            $result['problemas'][] = "GPU {$i}: temperatura elevada ({$gpuInfo['temperatura_c']}°C)";
            if ($result['status'] === 'ok') $result['status'] = 'warning';
        }
        
        if ($gpuInfo['vram_uso_porcento'] > 95) {
            $result['problemas'][] = "GPU {$i}: VRAM quase cheia ({$gpuInfo['vram_uso_porcento']}%)";
            if ($result['status'] === 'ok') $result['status'] = 'warning';
        }
        
        $gpuStatus['gpus'][] = $gpuInfo;
    }
} else {
    $gpuStatus['motivo'] = 'nvidia-smi não disponível (servidor PHP geralmente não tem GPU direto)';
}

$result['checks']['gpu'] = $gpuStatus;

// ============================================
// 3. DISCO - Espaço em disco
// ============================================
$uploadDir = defined('UPLOAD_DIR') ? UPLOAD_DIR : __DIR__ . '/audios/';
$diskTotal = @disk_total_space(__DIR__);
$diskFree = @disk_free_space(__DIR__);
$diskStatus = [
    'total_mb' => round($diskTotal / (1024*1024)),
    'livre_mb' => round($diskFree / (1024*1024)),
    'usado_mb' => round(($diskTotal - $diskFree) / (1024*1024)),
    'usado_porcento' => $diskTotal > 0 ? round((($diskTotal - $diskFree) / $diskTotal) * 100, 1) : 0,
];

if ($diskStatus['usado_porcento'] > 90) {
    $result['problemas'][] = "Disco quase cheio ({$diskStatus['usado_porcento']}%)";
    $result['status'] = 'critical';
} elseif ($diskStatus['usado_porcento'] > 80) {
    $result['problemas'][] = "Disco com espaço baixo ({$diskStatus['usado_porcento']}%)";
    if ($result['status'] === 'ok') $result['status'] = 'warning';
}

$result['checks']['disco'] = $diskStatus;

// ============================================
// 4. RAM do servidor
// ============================================
$ramStatus = [];
$memInfo = @file_get_contents('/proc/meminfo');
if ($memInfo) {
    preg_match('/MemTotal:\s+(\d+)\s+kB/', $memInfo, $totalMatch);
    preg_match('/MemAvailable:\s+(\d+)\s+kB/', $memInfo, $availMatch);
    
    if ($totalMatch && $availMatch) {
        $ramTotal = intval($totalMatch[1]) / 1024; // MB
        $ramAvail = intval($availMatch[1]) / 1024; // MB
        $ramUsed = $ramTotal - $ramAvail;
        
        $ramStatus = [
            'total_mb' => round($ramTotal),
            'usado_mb' => round($ramUsed),
            'livre_mb' => round($ramAvail),
            'usado_porcento' => round(($ramUsed / $ramTotal) * 100, 1),
        ];
        
        if ($ramStatus['usado_porcento'] > 95) {
            $result['problemas'][] = "RAM quase cheia ({$ramStatus['usado_porcento']}%)";
            $result['status'] = 'critical';
        }
    }
} else {
    $ramStatus['motivo'] = '/proc/meminfo não disponível';
}

$result['checks']['ram'] = $ramStatus;

// ============================================
// 5. ARQUIVOS - Contagem de áudios no servidor
// ============================================
$arquivosStatus = ['categorias' => []];
$totalArquivos = 0;
$totalTamanho = 0;

foreach (['ref', 'track', 'generated'] as $cat) {
    $catDir = $uploadDir . $cat . '/';
    $count = 0;
    $size = 0;
    
    if (is_dir($catDir)) {
        $files = glob($catDir . '*');
        foreach ($files as $f) {
            if (is_file($f)) {
                $count++;
                $size += filesize($f);
            }
        }
    }
    
    $arquivosStatus['categorias'][$cat] = [
        'quantidade' => $count,
        'tamanho_mb' => round($size / (1024*1024), 2),
    ];
    $totalArquivos += $count;
    $totalTamanho += $size;
}

// Chunks temporários
$chunksDir = $uploadDir . 'chunks/';
$chunksCount = 0;
$chunksSize = 0;
if (is_dir($chunksDir)) {
    $chunksDirs = glob($chunksDir . '*', GLOB_ONLYDIR);
    $chunksCount = count($chunksDirs);
    foreach ($chunksDirs as $cd) {
        $chunkFiles = glob($cd . '/*');
        foreach ($chunkFiles as $cf) {
            if (is_file($cf)) $chunksSize += filesize($cf);
        }
    }
}

$arquivosStatus['total_arquivos'] = $totalArquivos;
$arquivosStatus['total_tamanho_mb'] = round($totalTamanho / (1024*1024), 2);
$arquivosStatus['chunks_pendentes'] = $chunksCount;
$arquivosStatus['chunks_tamanho_mb'] = round($chunksSize / (1024*1024), 2);

if ($chunksCount > 5) {
    $result['problemas'][] = "{$chunksCount} chunks pendentes (pode ter uploads interrompidos)";
    if ($result['status'] === 'ok') $result['status'] = 'warning';
}

$result['checks']['arquivos'] = $arquivosStatus;

// ============================================
// 6. UPTIME DO SERVIDOR
// ============================================
$uptimeOutput = @file_get_contents('/proc/uptime');
$uptimeSegundos = $uptimeOutput ? floatval(explode(' ', $uptimeOutput)[0]) : 0;
$result['checks']['uptime'] = [
    'segundos' => round($uptimeSegundos),
    'formatado' => formatarTempo($uptimeSegundos),
];

// ============================================
// 7. PROCESSOS - Verificar se Gradio/python está rodando
// ============================================
$processos = [];
$pythonProcesses = @shell_exec('ps aux | grep -i "python.*f5\|python.*gradio\|python.*tts" | grep -v grep 2>&1');
if ($pythonProcesses !== null && trim($pythonProcesses) !== '') {
    $processos['python_tts'] = trim($pythonProcesses);
    $processos['rodando'] = true;
} else {
    $processos['python_tts'] = null;
    $processos['rodando'] = false;
}

// Verificar cloudflared
$cloudflaredProc = @shell_exec('ps aux | grep cloudflared | grep -v grep 2>&1');
if ($cloudflaredProc !== null && trim($cloudflaredProc) !== '') {
    $processos['cloudflared'] = trim($cloudflaredProc);
    $processos['cloudflared_rodando'] = true;
} else {
    $processos['cloudflared_rodando'] = false;
    $result['problemas'][] = 'cloudflared NÃO está rodando!';
    $result['status'] = 'critical';
}

$result['checks']['processos'] = $processos;

// ============================================
// 8. ÚLTIMO LOG (últimas 5 linhas do uploads.log)
// ============================================
$logFile = defined('LOG_FILE') ? LOG_FILE : __DIR__ . '/uploads.log';
$ultimosLogs = [];
if (file_exists($logFile)) {
    $logContent = file_get_contents($logFile);
    $logLines = array_filter(explode("\n", trim($logContent)));
    $ultimosLogs = array_slice($logLines, -5);
}

$result['checks']['logs_recentes'] = $ultimosLogs;

// ============================================
// RESUMO FINAL
// ============================================
$result['resumo'] = [
    'status' => $result['status'],
    'problemas_count' => count($result['problemas']),
    'recomendacao' => '',
];

if ($result['status'] === 'critical') {
    $result['resumo']['recomendacao'] = 'REINICIAR SERVIDOR GPU AGORA — problemas críticos detectados';
} elseif ($result['status'] === 'warning') {
    $result['resumo']['recomendacao'] = 'Atenção: problemas detectados, monitorar de perto';
} else {
    $result['resumo']['recomendacao'] = 'Tudo funcionando normalmente';
}

logUpload("Health check: status={$result['status']}, problemas=" . count($result['problemas']));

echo json_encode($result, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

// ============================================
// FUNÇÕES AUXILIARES
// ============================================
function formatarTempo($segundos) {
    if ($segundos < 60) return "{$segundos}s";
    if ($segundos < 3600) return floor($segundos / 60) . "min " . ($segundos % 60) . "s";
    $horas = floor($segundos / 3600);
    $minutos = floor(($segundos % 3600) / 60);
    if ($horas < 24) return "{$horas}h {$minutos}min";
    $dias = floor($horas / 24);
    $horas = $horas % 24;
    return "{$dias}d {$horas}h";
}
?>
