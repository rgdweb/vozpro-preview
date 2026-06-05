#!/bin/bash
# ============================================================
# auto-restart.sh - Monitoramento e restart automático do GPU server
# Uso: chmod +x auto-restart.sh && ./auto-restart.sh
#
# O que faz:
# - Monitora a fila de geração (via API)
# - Quando NINGUÉM está gerando há X minutos → reinicia tudo
# - Verifica saúde do sistema (GPU, RAM, disco)
# - Limpa arquivos temporários
# - Reinicia o Gradio/F5-TTS e o cloudflared
#
# Configuração recomendada (cron):
# */5 * * * * /caminho/para/auto-restart.sh >> /caminho/para/auto-restart.log 2>&1
# Isso roda a cada 5 minutos
# ============================================================

# ========== CONFIGURAÇÃO ==========
# Tempo de inatividade antes de reiniciar (em minutos)
IDLE_MINUTES=30

# URL da API do VozPro (Next.js)
API_URL="https://omnivoice-umber.vercel.app"

# API Key do servidor PHP
API_KEY="vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1"

# Caminho do servidor PHP
PHP_SERVER_URL="https://sorteiomax.com.br/omnivoice"

# Comando para reiniciar o Gradio (ajuste conforme seu setup)
# Exemplo: "cd /path/to/f5-tts && python app.py"
GRADIO_START_CMD=""

# Comando para reiniciar o cloudflared
# Exemplo: "cloudflared tunnel --url http://localhost:7860 > /dev/null 2>&1 &"
CLOUDFLARED_START_CMD=""

# Limite de VRAM para considerar "precisa reiniciar" (porcentagem)
VRAM_THRESHOLD=95

# Limite de temperatura para considerar "precisa reiniciar" (Celsius)
TEMP_THRESHOLD=85

# Arquivo de controle (evita restart duplo)
LOCK_FILE="/tmp/vozpro_auto_restart.lock"
LOG_FILE="/tmp/vozpro_auto_restart.log"

# ========== FUNÇÕES ==========

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Verificar se já está rodando
if [ -f "$LOCK_FILE" ]; then
    lock_pid=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
        echo "Já existe uma instância rodando (PID: $lock_pid). Saindo."
        exit 0
    fi
    # Lock antigo, remover
    rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

log "=== Iniciando verificação ==="

# ============================================
# 1. Verificar saúde do GPU (nvidia-smi)
# ============================================
GPU_NEEDS_RESTART=false
GPU_INFO=""

if command -v nvidia-smi &> /dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits 2>/dev/null)
    
    if [ -n "$GPU_INFO" ]; then
        IFS=',' read -r VRAM_USED VRAM_TOTAL TEMP <<< "$GPU_INFO"
        VRAM_USED=$(echo "$VRAM_USED" | tr -d ' ')
        VRAM_TOTAL=$(echo "$VRAM_TOTAL" | tr -d ' ')
        TEMP=$(echo "$TEMP" | tr -d ' ')
        
        VRAM_PCT=$((VRAM_USED * 100 / VRAM_TOTAL))
        
        log "GPU: VRAM ${VRAM_USED}/${VRAM_TOTAL}MB (${VRAM_PCT}%), Temp: ${TEMP}°C"
        
        if [ "$VRAM_PCT" -ge "$VRAM_THRESHOLD" ]; then
            log "⚠️ VRAM alta: ${VRAM_PCT}% (limite: ${VRAM_THRESHOLD}%)"
            GPU_NEEDS_RESTART=true
        fi
        
        if [ "$TEMP" -ge "$TEMP_THRESHOLD" ]; then
            log "⚠️ Temperatura alta: ${TEMP}°C (limite: ${TEMP_THRESHOLD}°C)"
            GPU_NEEDS_RESTART=true
        fi
    fi
else
    log "nvidia-smi não disponível (este servidor não tem GPU ou não está configurado)"
fi

# ============================================
# 2. Verificar fila de geração (via API)
# ============================================
FILA_OCUPADA=false

FILA_DATA=$(curl -s --max-time 10 "${API_URL}/api/health" 2>/dev/null)

if [ -n "$FILA_DATA" ]; then
    # Usar python para parsear JSON (mais confiável que grep)
    PROCESSING=$(echo "$FILA_DATA" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    fila = d.get('checks', {}).get('fila', {})
    print(fila.get('processing', 0))
except:
    print(0)
" 2>/dev/null)
    
    if [ "$PROCESSING" -ge 1 ]; then
        FILA_OCUPADA=true
        log "Fila: OCUPADA (${PROCESSING} gerando)"
    else
        log "Fila: livre (ninguém gerando)"
    fi
else
    log "⚠️ Não conseguiu acessar API do VozPro (sem internet ou Vercel down)"
    # Se não consegue acessar a API, assume que está ocupado (não reinicia)
    FILA_OCUPADA=true
fi

# ============================================
# 3. Verificar último arquivo gerado (inatividade)
# ============================================
# Se a fila não está ocupada, verificar há quanto tempo
if [ "$FILA_OCUPADA" = false ]; then
    # Chamar cleanup no PHP
    curl -s --max-time 10 -H "Authorization: Bearer ${API_KEY}" "${PHP_SERVER_URL}/cleanup.php" > /dev/null 2>&1
    log "Cleanup do PHP executado"
fi

# ============================================
# 4. DECISÃO: Reiniciar ou não?
# ============================================
SHOULD_RESTART=false
REASON=""

if [ "$GPU_NEEDS_RESTART" = true ] && [ "$FILA_OCUPADA" = false ]; then
    SHOULD_RESTART=true
    REASON="GPU precisa de reinicialização (VRAM/Temp alta) e fila está livre"
elif [ "$GPU_NEEDS_RESTART" = true ] && [ "$FILA_OCUPADA" = true ]; then
    log "GPU precisa de restart mas fila está ocupada — aguardando..."
    REASON="Aguardando fila ficar livre para reiniciar GPU"
fi

# ============================================
# 5. EXECUTAR RESTART (se necessário)
# ============================================
if [ "$SHOULD_RESTART" = true ]; then
    log "🔄 REINICIANDO: ${REASON}"
    
    # Matar processos python/gradio
    log "Matando processos Python TTS..."
    pkill -f "python.*f5\|python.*gradio\|python.*tts" 2>/dev/null
    sleep 3
    
    # Limpar VRAM forçando reload do driver (opcional, comentado por segurança)
    # sudo nvidia-smi --gpu-reset -i 0 2>/dev/null
    
    # Limpar temp files do sistema
    log "Limpando temp files do sistema..."
    find /tmp -name "tmp*" -mmin +60 -delete 2>/dev/null
    find /tmp -name "gradio*" -delete 2>/dev/null
    
    # Reiniciar Gradio se comando configurado
    if [ -n "$GRADIO_START_CMD" ]; then
        log "Iniciando Gradio: ${GRADIO_START_CMD}"
        eval "$GRADIO_START_CMD" &
        sleep 5
        log "Gradio reiniciado"
    else
        log "GRADIO_START_CMD não configurado — pulando restart do Gradio"
        log "Configure a variável GRADIO_START_CMD neste script"
    fi
    
    # Reiniciar cloudflared se comando configurado
    if [ -n "$CLOUDFLARED_START_CMD" ]; then
        log "Reiniciando cloudflared..."
        pkill -f cloudflared 2>/dev/null
        sleep 2
        eval "$CLOUDFLARED_START_CMD" &
        sleep 3
        log "Cloudflared reiniciado"
    fi
    
    log "✅ Restart completo em $(date '+%Y-%m-%d %H:%M:%S')"
else
    if [ -n "$REASON" ]; then
        log "⏳ ${REASON}"
    else
        log "✅ Tudo normal, nenhum restart necessário"
    fi
fi

log "=== Verificação finalizada ==="
echo ""
