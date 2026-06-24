/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * 🚨 CONTRATO DE GOVERNANÇA EXECUTIVA - VOZPRO (SaaS HÍBRIDO)
 * ARQUIVO CRÍTICO: Controle de fila de geração (concorrência e rate limiting).
 *
 * ⚡ SISTEMA PREMIUM DE FILA INTELIGENTE v2.1
 * - Health check com CACHE de 30s (nao consulta GPU a cada poll)
 * - 3 minutos de timeout absoluto como backup
 * - Detecção inteligente: GPU online + respondendo = mantém | GPU offline/túnel morto = libera
 * - Heartbeat: registra última comunicação com GPU
 * - Auto-promote imediato ao detectar item preso
 *
 * ATENÇÃO MODELO DE IA: Este arquivo controla acesso concorrente à GPU.
 * 1. NUNCA remova checkGPUHealth() — é o coração do sistema inteligente.
 * 2. NUNCA remova unstickProcessing() — ela impede deadlock permanente.
 * 3. Deploy via: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_CONCURRENT_GENERATIONS = 1
const PROCESSING_TIMEOUT_MS = 3 * 60 * 1000 // 3 minutos — consistente com GPU timeout
const GPU_HEALTH_CHECK_MS = 5000 // 5 segundos timeout para health check
const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'
const ORACLE_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'

// ============================================================
// 💓 HEARTBEAT — rastreia comunicação com GPU em memória
// ============================================================
let lastGPUContact: number = 0
let gpuHealthStatus: 'online' | 'offline' | 'unknown' = 'unknown'

// ============================================================
// 🏥 CACHE DO HEALTH CHECK — evita consultar GPU a cada poll
// ============================================================
let healthCache: { result: GPUHealthResult; timestamp: number } | null = null
const HEALTH_CACHE_MS = 30000 // 30 segundos de cache

export function touchGPUHeartbeat() {
  lastGPUContact = Date.now()
  gpuHealthStatus = 'online'
}

export function getGPUHealthInfo() {
  return {
    status: gpuHealthStatus,
    lastContact: lastGPUContact,
    secondsSinceContact: lastGPUContact ? Math.floor((Date.now() - lastGPUContact) / 1000) : -1,
  }
}

// ============================================================
// 🏥 HEALTH CHECK INTELIGENTE COM CACHE
// ============================================================
interface GPUHealthResult {
  gpuOnline: boolean
  wireGuardAlive: boolean
  gpuUrl: string | null
  responseTime: number
  error: string | null
}

async function checkGPUHealth(): Promise<GPUHealthResult> {
  // Se temos cache recente (< 30s), usar cache
  if (healthCache && (Date.now() - healthCache.timestamp) < HEALTH_CACHE_MS) {
    return healthCache.result
  }

  const startTime = Date.now()
  const result: GPUHealthResult = {
    gpuOnline: false,
    wireGuardAlive: false,
    gpuUrl: null,
    responseTime: 0,
    error: null,
  }

  try {
    // Tentar WireGuard direto primeiro (sem SSL, sem nginx)
    const healthRes = await fetch(`${GPU_DIRECT_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(GPU_HEALTH_CHECK_MS),
    })

    if (!healthRes.ok) {
      result.error = `/health retornou HTTP ${healthRes.status}`
      gpuHealthStatus = 'offline'
    } else {
      const healthData = await healthRes.json()

      if (healthData.status !== 'ok' || !healthData.model_loaded) {
        result.error = healthData.error || 'GPU reportou status offline'
        gpuHealthStatus = 'offline'
      } else {
        result.gpuOnline = true
        result.wireGuardAlive = true
        result.gpuUrl = GPU_DIRECT_URL
        result.responseTime = Date.now() - startTime
        gpuHealthStatus = 'online'
        lastGPUContact = Date.now()
      }
    }
  } catch (directErr) {
    // Fallback: tentar via nginx (URL externa)
    try {
      const healthRes = await fetch(`${ORACLE_BASE}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(GPU_HEALTH_CHECK_MS),
      })
      if (healthRes.ok) {
        const healthData = await healthRes.json()
        if (healthData.status === 'ok' && healthData.model_loaded) {
          result.gpuOnline = true
          result.wireGuardAlive = true
          result.gpuUrl = ORACLE_BASE
          result.responseTime = Date.now() - startTime
          gpuHealthStatus = 'online'
          lastGPUContact = Date.now()
        } else {
          result.error = healthData.error || 'GPU reportou status offline'
          gpuHealthStatus = 'offline'
        }
      } else {
        result.error = `/health retornou HTTP ${healthRes.status}`
        gpuHealthStatus = 'offline'
      }
    } catch (nginxErr) {
      result.error = 'WireGuard: ' + (directErr instanceof Error ? directErr.message : String(directErr)) + ' | Nginx: ' + (nginxErr instanceof Error ? nginxErr.message : String(nginxErr))
      gpuHealthStatus = 'offline'
    }
  }

  // Salvar no cache
  healthCache = { result, timestamp: Date.now() }
  return result
}

// ============================================================
// 🔧 UNSTICK INTELIGENTE — só libera se GPU realmente tá morta
// ============================================================
async function unstickProcessing(): Promise<{ released: number; reason: string }> {
  try {
    const processingItems = await db.generationQueue.findMany({
      where: { status: 'processing' },
      select: { id: true, startedAt: true, createdAt: true },
    })

    if (processingItems.length === 0) {
      return { released: 0, reason: 'no_processing_items' }
    }

    // Se tem processing items, invalidar cache e fazer health check fresco
    healthCache = null
    const health = await checkGPUHealth()
    const startedAt = processingItems[0].startedAt
    if (!startedAt) {
      console.log(`[Queue] Item processing sem startedAt → LIBERA`)
      const result = await db.generationQueue.updateMany({
        where: { status: 'processing' },
        data: { status: 'failed', completedAt: new Date() },
      })
      return { released: result.count, reason: 'no_started_at' }
    }

    const elapsedMs = Date.now() - startedAt.getTime()
    const elapsedSec = Math.floor(elapsedMs / 1000)

    if (!health.gpuOnline || !health.wireGuardAlive) {
      console.log(`[Queue] GPU OFFLINE → LIBERA | Motivo: ${health.error}`)
      const result = await db.generationQueue.updateMany({
        where: { status: 'processing' },
        data: { status: 'failed', completedAt: new Date() },
      })
      return { released: result.count, reason: 'gpu_offline' }
    }

    if (elapsedMs > PROCESSING_TIMEOUT_MS) {
      console.log(`[Queue] GPU online mas ${elapsedSec}s > ${PROCESSING_TIMEOUT_MS / 1000}s → LIBERA por timeout`)
      const result = await db.generationQueue.updateMany({
        where: { status: 'processing' },
        data: { status: 'failed', completedAt: new Date() },
      })
      return { released: result.count, reason: 'timeout' }
    }

    return { released: 0, reason: 'processing_normal' }

  } catch (err) {
    console.error(`[Queue] Erro no unstick:`, err)
    return { released: 0, reason: 'error' }
  }
}

// Promover o próximo waiting para processing
async function promoteNext(): Promise<boolean> {
  try {
    const currentProcessing = await db.generationQueue.count({
      where: { status: 'processing' },
    })
    if (currentProcessing >= MAX_CONCURRENT_GENERATIONS) return false

    const nextWaiting = await db.generationQueue.findFirst({
      where: { status: 'waiting' },
      orderBy: { createdAt: 'asc' },
    })

    if (nextWaiting) {
      await db.generationQueue.update({
        where: { id: nextWaiting.id },
        data: { status: 'processing', startedAt: new Date() },
      })
      console.log('[Queue] Promoted:', nextWaiting.id)
      return true
    }
    return false
  } catch (err) {
    console.error('[Queue] Erro promoteNext:', err)
    return false
  }
}

// Limpar itens completed/failed antigos
async function cleanupOldItems() {
  try {
    await db.generationQueue.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        completedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
    })
  } catch {}
}

// POST /api/queue/join - Entrar na fila de geração
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Desbloquear itens presos (usa cache, rapido)
    const { released } = await unstickProcessing()
    if (released > 0) {
      await promoteNext()
    }
    await cleanupOldItems()

    // Verificar se já tem um item na fila do usuário
    const existingItem = await db.generationQueue.findFirst({
      where: {
        userId: session.userId,
        status: { in: ['waiting', 'processing'] },
      },
    })

    if (existingItem) {
      const waitingBefore = await db.generationQueue.count({
        where: {
          status: 'waiting',
          createdAt: { lt: existingItem.createdAt },
        },
      })
      return NextResponse.json({
        id: existingItem.id,
        status: existingItem.status,
        position: existingItem.status === 'processing' ? 0 : waitingBefore + 1,
        gpuHealth: getGPUHealthInfo(),
      })
    }

    const processingCount = await db.generationQueue.count({
      where: { status: 'processing' },
    })

    const waitingCount = await db.generationQueue.count({
      where: { status: 'waiting' },
    })

    const queueItem = await db.generationQueue.create({
      data: {
        userId: session.userId,
        status: processingCount < MAX_CONCURRENT_GENERATIONS ? 'processing' : 'waiting',
        position: processingCount < MAX_CONCURRENT_GENERATIONS ? 0 : waitingCount + 1,
        startedAt: processingCount < MAX_CONCURRENT_GENERATIONS ? new Date() : null,
      },
    })

    return NextResponse.json({
      id: queueItem.id,
      status: queueItem.status,
      position: queueItem.status === 'processing' ? 0 : waitingCount + 1,
      gpuHealth: getGPUHealthInfo(),
    })
  } catch (error) {
    console.error('[Queue] Join error:', error)
    return NextResponse.json({ error: 'Erro ao entrar na fila' }, { status: 500 })
  }
}

// GET /api/queue/join?id=xxx - Verificar posição na fila
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const queueId = searchParams.get('id')

    if (!queueId) {
      return NextResponse.json({ error: 'ID da fila não informado' }, { status: 400 })
    }

    // Unstick leve (usa cache, quase instantâneo)
    const { released } = await unstickProcessing()
    if (released > 0) {
      await promoteNext()
    }
    await cleanupOldItems()

    const item = await db.generationQueue.findUnique({
      where: { id: queueId },
    })

    if (!item || item.userId !== session.userId) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })
    }

    let position = 0
    if (item.status === 'waiting') {
      position = await db.generationQueue.count({
        where: {
          status: 'waiting',
          createdAt: { lt: item.createdAt },
        },
      }) + 1
    }

    const wasReleased = item.status === 'failed'

    return NextResponse.json({
      id: item.id,
      status: item.status,
      position,
      gpuHealth: getGPUHealthInfo(),
      ...(wasReleased ? { released: true, reason: 'gpu_offline_or_timeout' } : {}),
    })
  } catch (error) {
    console.error('[Queue] Status error:', error)
    return NextResponse.json({ error: 'Erro ao verificar fila' }, { status: 500 })
  }
}
