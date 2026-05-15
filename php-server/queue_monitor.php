<?php
// queue_monitor.php - Monitor de geracoes ativas do OmniVoice
// Exibe em JSON quantas geracoes estao rodando simultaneamente
// Acesso: https://sorteiomax.com.br/omnivoice/queue_monitor.php

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$monitorFile = sys_get_temp_dir() . '/vp_queue_monitor.json';

function readMonitor($file) {
    if (!file_exists($file)) return ['active' => [], 'history' => [], 'total_today' => 0];
    $data = json_decode(file_get_contents($file), true);
    if (!$data) return ['active' => [], 'history' => [], 'total_today' => 0];
    return $data;
}

function cleanExpired(&$data) {
    $now = time();
    // Remover geracoes ativas que passaram de 10 minutos (provavelmente crasharam)
    $data['active'] = array_values(array_filter($data['active'], function($g) use ($now) {
        return ($now - $g['started_at']) < 600;
    }));
    // Manter apenas os ultimos 100 do historico
    if (count($data['history']) > 100) {
        $data['history'] = array_slice($data['history'], -100);
    }
}

$data = readMonitor($monitorFile);
cleanExpired($data);

// Se for POST com action=clean, limpar historico
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    if (($input['action'] ?? '') === 'clean') {
        $data['history'] = [];
        $data['total_today'] = 0;
        file_put_contents($monitorFile, json_encode($data, JSON_PRETTY_PRINT), LOCK_EX);
        echo json_encode(['status' => 'cleaned', 'active_count' => count($data['active'])]);
        exit;
    }
}

// Calcular estatisticas
$activeCount = count($data['active']);
$concurrentMax = 0;
$concurrentCount = 0;

// Detectar picos de concorrencia no historico
if (!empty($data['history'])) {
    $times = array_column($data['history'], 'started_at');
    for ($i = 0; $i < count($times); $i++) {
        $count = 0;
        for ($j = 0; $j < count($data['history']); $j++) {
            $start = $data['history'][$j]['started_at'];
            $end = $data['history'][$j]['ended_at'] ?? ($start + 60);
            if ($times[$i] >= $start && $times[$i] <= $end) $count++;
        }
        if ($count > $concurrentMax) $concurrentMax = $count;
    }
}

echo json_encode([
    'active_count' => $activeCount,
    'max_concurrent_seen' => $concurrentMax,
    'total_today' => $data['total_today'] ?? 0,
    'active' => array_map(function($g) {
        return [
            'id' => $g['id'],
            'model' => $g['model'] ?? 'unknown',
            'mode' => $g['mode'] ?? '?',
            'text_preview' => mb_substr($g['text'] ?? '', 0, 60),
            'started_at' => $g['started_at'],
            'elapsed_sec' => time() - $g['started_at'],
            'ip' => $g['ip'] ?? '?',
        ];
    }, $data['active']),
    'last_10' => array_slice(array_map(function($g) {
        return [
            'id' => $g['id'],
            'model' => $g['model'] ?? '?',
            'mode' => $g['mode'] ?? '?',
            'text_preview' => mb_substr($g['text'] ?? '', 0, 60),
            'duration_sec' => ($g['ended_at'] ?? 0) - ($g['started_at'] ?? 0),
            'finished_at' => $g['ended_at'] ?? null,
            'ip' => $g['ip'] ?? '?',
        ];
    }, $data['history']), -10),
], JSON_PRETTY_PRINT);
?>
