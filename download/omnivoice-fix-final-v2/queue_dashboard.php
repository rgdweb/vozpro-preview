<?php
// queue_dashboard.php - Dashboard ao vivo de geracoes TTS
// Acesso: https://sorteiomax.com.br/omnivoice/queue_dashboard.php

header('Content-Type: text/html; charset=utf-8');
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VozPro - Monitor ao Vivo</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;600&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  :root {
    --bg: #0a0a0f;
    --surface: #12121a;
    --surface2: #1a1a28;
    --border: #2a2a3a;
    --text: #e8e8f0;
    --text2: #8888a0;
    --green: #00e68a;
    --green-dim: #00e68a33;
    --red: #ff4466;
    --red-dim: #ff446633;
    --yellow: #ffbb33;
    --yellow-dim: #ffbb3333;
    --blue: #4488ff;
    --blue-dim: #4488ff33;
    --purple: #aa66ff;
    --purple-dim: #aa66ff33;
  }

  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Animated background grid */
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      linear-gradient(rgba(68,136,255,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(68,136,255,0.03) 1px, transparent 1px);
    background-size: 40px 40px;
    pointer-events: none;
    z-index: 0;
  }

  .container {
    position: relative;
    z-index: 1;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 24px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .logo {
    width: 42px;
    height: 42px;
    background: linear-gradient(135deg, var(--blue), var(--purple));
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 800;
  }

  .header-title h1 {
    font-size: 22px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--text), var(--blue));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .header-title span {
    font-size: 12px;
    color: var(--text2);
    font-weight: 400;
  }

  .live-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--green-dim);
    border: 1px solid var(--green);
    border-radius: 20px;
    font-size: 13px;
    font-weight: 600;
    color: var(--green);
  }

  .live-dot {
    width: 8px;
    height: 8px;
    background: var(--green);
    border-radius: 50%;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.8); }
  }

  /* Stats Grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 24px;
    position: relative;
    overflow: hidden;
    transition: all 0.3s;
  }

  .stat-card:hover {
    border-color: var(--blue);
    transform: translateY(-2px);
  }

  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
  }

  .stat-card.active::before { background: linear-gradient(90deg, var(--green), var(--blue)); }
  .stat-card.queue::before { background: linear-gradient(90deg, var(--yellow), var(--red)); }
  .stat-card.total::before { background: linear-gradient(90deg, var(--purple), var(--blue)); }
  .stat-card.peak::before { background: linear-gradient(90deg, var(--red), var(--yellow)); }
  .stat-card.success::before { background: linear-gradient(90deg, var(--green), #00ccff); }
  .stat-card.fail::before { background: linear-gradient(90deg, var(--red), var(--purple)); }

  .stat-label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--text2);
    margin-bottom: 8px;
    font-weight: 500;
  }

  .stat-value {
    font-size: 48px;
    font-weight: 900;
    font-family: 'JetBrains Mono', monospace;
    line-height: 1;
  }

  .stat-card.active .stat-value { color: var(--green); }
  .stat-card.queue .stat-value { color: var(--yellow); }
  .stat-card.total .stat-value { color: var(--purple); }
  .stat-card.peak .stat-value { color: var(--red); }
  .stat-card.success .stat-value { color: var(--green); }
  .stat-card.fail .stat-value { color: var(--red); }

  .stat-sub {
    font-size: 12px;
    color: var(--text2);
    margin-top: 8px;
  }

  /* Main Content */
  .content-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  @media (max-width: 768px) {
    .content-grid { grid-template-columns: 1fr; }
    .stat-value { font-size: 36px; }
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
  }

  .panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 16px;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
  }

  .panel-title {
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-count {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
  }

  .panel-count.green { background: var(--green-dim); color: var(--green); }
  .panel-count.yellow { background: var(--yellow-dim); color: var(--yellow); }
  .panel-count.blue { background: var(--blue-dim); color: var(--blue); }

  .panel-body {
    padding: 0;
    max-height: 400px;
    overflow-y: auto;
  }

  .panel-body::-webkit-scrollbar { width: 6px; }
  .panel-body::-webkit-scrollbar-track { background: transparent; }
  .panel-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }

  /* Active Generation Item */
  .gen-item {
    padding: 14px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateX(-10px); }
    to { opacity: 1; transform: translateX(0); }
  }

  .gen-item:last-child { border-bottom: none; }

  .gen-icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    flex-shrink: 0;
  }

  .gen-icon.omnivoice { background: var(--purple-dim); }
  .gen-icon.f5-tts { background: var(--blue-dim); }

  .gen-info { flex: 1; min-width: 0; }

  .gen-model {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 2px;
  }

  .gen-icon.omnivoice + .gen-info .gen-model { color: var(--purple); }
  .gen-icon.f5-tts + .gen-info .gen-model { color: var(--blue); }

  .gen-text {
    font-size: 13px;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .gen-meta {
    text-align: right;
    flex-shrink: 0;
  }

  .gen-time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px;
    font-weight: 600;
    color: var(--yellow);
  }

  .gen-ip {
    font-size: 10px;
    color: var(--text2);
    font-family: 'JetBrains Mono', monospace;
    margin-top: 2px;
  }

  /* History Item */
  .history-item {
    padding: 12px 20px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
  }

  .history-item:last-child { border-bottom: none; }

  .history-status {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .history-status.ok { background: var(--green); }
  .history-status.fail { background: var(--red); }

  .history-model {
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    width: 80px;
    flex-shrink: 0;
  }

  .history-text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--text2);
  }

  .history-dur {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text2);
    flex-shrink: 0;
  }

  /* Empty state */
  .empty-state {
    padding: 40px 20px;
    text-align: center;
    color: var(--text2);
  }

  .empty-state .emoji { font-size: 32px; margin-bottom: 8px; }
  .empty-state p { font-size: 13px; }

  /* Activity bar */
  .activity-bar {
    height: 4px;
    background: var(--surface2);
    border-radius: 2px;
    overflow: hidden;
    margin-top: 4px;
  }

  .activity-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 0.5s ease;
    background: linear-gradient(90deg, var(--green), var(--blue));
  }

  /* Timestamp */
  .timestamp {
    text-align: center;
    padding: 16px;
    font-size: 11px;
    color: var(--text2);
    font-family: 'JetBrains Mono', monospace;
  }
</style>
</head>
<body>

<div class="container">
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="logo">V</div>
      <div class="header-title">
        <h1>VozPro Monitor</h1>
        <span>Dashboard de geracoes TTS em tempo real</span>
      </div>
    </div>
    <div class="live-badge">
      <div class="live-dot"></div>
      AO VIVO
    </div>
  </div>

  <!-- Stats -->
  <div class="stats-grid">
    <div class="stat-card active">
      <div class="stat-label">Gerando Agora</div>
      <div class="stat-value" id="activeCount">0</div>
      <div class="activity-bar"><div class="activity-fill" id="activityFill" style="width: 0%"></div></div>
    </div>
    <div class="stat-card peak">
      <div class="stat-label">Pico Simultaneo</div>
      <div class="stat-value" id="peakCount">0</div>
      <div class="stat-sub">maximo visto hoje</div>
    </div>
    <div class="stat-card total">
      <div class="stat-label">Total Hoje</div>
      <div class="stat-value" id="totalCount">0</div>
      <div class="stat-sub">geracoes completas</div>
    </div>
    <div class="stat-card success">
      <div class="stat-label">Sucesso</div>
      <div class="stat-value" id="successCount">0</div>
      <div class="stat-sub" id="successRate">0% taxa de sucesso</div>
    </div>
  </div>

  <!-- Content -->
  <div class="content-grid">
    <!-- Active Generations -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          <span style="color: var(--green);">&#9679;</span>
          Geracoes Ativas
        </div>
        <div class="panel-count green" id="activeBadge">0</div>
      </div>
      <div class="panel-body" id="activeList">
        <div class="empty-state">
          <div class="emoji">&#128424;</div>
          <p>Nenhuma geracao em andamento</p>
        </div>
      </div>
    </div>

    <!-- History -->
    <div class="panel">
      <div class="panel-header">
        <div class="panel-title">
          <span style="color: var(--blue);">&#9201;</span>
          Ultimas Geracoes
        </div>
        <div class="panel-count blue" id="historyBadge">0</div>
      </div>
      <div class="panel-body" id="historyList">
        <div class="empty-state">
          <div class="emoji">&#128203;</div>
          <p>Nenhuma geracao registrada</p>
        </div>
      </div>
    </div>
  </div>

  <!-- Timestamp -->
  <div class="timestamp" id="lastUpdate">Atualizando...</div>
</div>

<script>
const MONITOR_URL = 'queue_monitor.php';
const REFRESH_MS = 2000;

let prevActiveIds = new Set();
let successCount = 0;
let failCount = 0;

async function fetchStatus() {
  try {
    const res = await fetch(MONITOR_URL + '?_=' + Date.now());
    const data = await res.json();
    updateUI(data);
  } catch (e) {
    document.getElementById('lastUpdate').textContent = 'Erro ao conectar: ' + e.message;
  }
}

function updateUI(data) {
  const active = data.active || [];
  const history = data.last_10 || [];
  const activeIds = new Set(active.map(g => g.id));

  // Count successes/failures from history
  successCount = 0;
  failCount = 0;
  (data.last_10 || []).forEach(h => {
    if (h.success) successCount++;
    else failCount++;
  });

  // Active count
  const activeEl = document.getElementById('activeCount');
  animateNumber(activeEl, parseInt(activeEl.textContent) || 0, active.length);

  // Activity bar (max 5 = full)
  const fill = Math.min((active.length / 5) * 100, 100);
  document.getElementById('activityFill').style.width = fill + '%';

  // Peak
  document.getElementById('peakCount').textContent = data.max_concurrent_seen || 0;

  // Total today
  document.getElementById('totalCount').textContent = data.total_today || 0;

  // Success
  const total = successCount + failCount;
  const rate = total > 0 ? Math.round((successCount / total) * 100) : 100;
  document.getElementById('successCount').textContent = successCount;
  document.getElementById('successRate').textContent = rate + '% taxa de sucesso';

  // Active badge
  document.getElementById('activeBadge').textContent = active.length;

  // Active list
  const activeList = document.getElementById('activeList');
  if (active.length === 0) {
    activeList.innerHTML = '<div class="empty-state"><div class="emoji">&#128424;</div><p>Nenhuma geracao em andamento</p></div>';
  } else {
    let html = '';
    active.forEach(g => {
      const isOV = g.model === 'omnivoice';
      const icon = isOV ? '&#127908;' : '&#127925;';
      const cls = isOV ? 'omnivoice' : 'f5-tts';
      const elapsed = g.elapsed_sec || 0;
      const min = Math.floor(elapsed / 60);
      const sec = elapsed % 60;
      const time = min > 0 ? `${min}m${sec.toString().padStart(2,'0')}s` : `${sec}s`;
      html += `
        <div class="gen-item">
          <div class="gen-icon ${cls}">${icon}</div>
          <div class="gen-info">
            <div class="gen-model">${g.model || '?'}</div>
            <div class="gen-text" title="${escapeHtml(g.text_preview || '')}">${escapeHtml(g.text_preview || '...')}</div>
          </div>
          <div class="gen-meta">
            <div class="gen-time">${time}</div>
            <div class="gen-ip">${g.ip || '?'}</div>
          </div>
        </div>`;
    });
    activeList.innerHTML = html;
  }

  // History list
  document.getElementById('historyBadge').textContent = history.length;
  const historyList = document.getElementById('historyList');
  if (history.length === 0) {
    historyList.innerHTML = '<div class="empty-state"><div class="emoji">&#128203;</div><p>Nenhuma geracao registrada</p></div>';
  } else {
    let html = '';
    [...history].reverse().forEach(h => {
      const isOV = h.model === 'omnivoice';
      const statusCls = h.success ? 'ok' : 'fail';
      const dur = h.duration_sec || 0;
      const min = Math.floor(dur / 60);
      const sec = dur % 60;
      const time = min > 0 ? `${min}m${sec}s` : `${sec}s`;
      const modelColor = isOV ? 'var(--purple)' : 'var(--blue)';
      html += `
        <div class="history-item">
          <div class="history-status ${statusCls}"></div>
          <div class="history-model" style="color: ${modelColor}">${h.model || '?'}</div>
          <div class="history-text" title="${escapeHtml(h.text_preview || '')}">${escapeHtml(h.text_preview || '...')}</div>
          <div class="history-dur">${time}</div>
        </div>`;
    });
    historyList.innerHTML = html;
  }

  // Timestamp
  const now = new Date();
  document.getElementById('lastUpdate').textContent =
    'Ultima atualizacao: ' + now.toLocaleTimeString('pt-BR') + ' (atualiza a cada ' + (REFRESH_MS/1000) + 's)';

  prevActiveIds = activeIds;
}

function animateNumber(el, from, to) {
  if (from === to) return;
  const duration = 300;
  const start = performance.now();
  function step(ts) {
    const progress = Math.min((ts - start) / duration, 1);
    const current = Math.round(from + (to - from) * progress);
    el.textContent = current;
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Start
fetchStatus();
setInterval(fetchStatus, REFRESH_MS);
</script>

</body>
</html>
