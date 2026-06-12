/**
 * 🚨 CONTRATO DE GOVERNANÇA EXECUTIVA - VOZPRO (SaaS HÍBRIDO)
 * ARQUIVO CRÍTICO: Controle de fila de geração (concorrência e rate limiting).
 *
 * ⚡ SISTEMA PREMIUM DE FILA INTELIGENTE v2.0
 * - Health check REAL na GPU a cada poll (não só timeout cego)
 * - 1 minuto de timeout absoluto como backup
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
const PROCESSING_TIMEOUT_MS = 1 * 60 * 1000 // 1 minuto — backup absoluto
const GPU_HEALTH_CHECK_MS = 5000 // 5 segundos timeout para health check
const TUNNEL_API = process.env.AUDIO_SERVER_URL || 'https://api.sorteiomax.com.br'

// ============================================================
// 💓 HEARTBEAT — rastreia comunicação com GPU em memória
// ============================================================
let lastGPUContact: number = 0
let gpuHealthStatus: 'online' | 'offline' | 'unknown' = 'unknown'

// Atualizar heartbeat quando a GPU responde
export function touchGPUHeartbeat() {
  lastGPUContact = Date.now()
  gpuHealthStatus = 'online'
}

// Obter status da GPU
export function getGPUHealthInfo() {
  return {
    status: gpuHealthStatus,
    lastContact: lastGPUContact,
    secondsSinceContact: lastGPUContact ? Math.floor((Date.now() - lastGPUContact) / 1000) : -1,
  }
}

// ============================================================
// 🏥 HEALTH CHECK INTELIGENTE — verifica GPU REALMENTE está viva
// ============================================================
interface GPUHealthResult {
  gpuOnline: boolean
  tunnelAlive: boolean
  tunnelUrl: string | null
  responseTime: number
  error: string | null
}

async function checkGPUHealth(): Promise<GPUHealthResult> {
  const startTime = Date.now()
  const result: GPUHealthResult = {
    gpuOnline: false,
    tunnelAlive: false,
    tunnelUrl: null,
    responseTime: 0,
    error: null,
  }

  try {
    // PASSO 1: Verificar se o servidor PHP tá vivo e tem URL do túnel
    const tunnelRes = await fetch(`${TUNNEL_API}/get_tunnel.php`, {
      signal: AbortSignal.timeout(GPU_HEALTH_CHECK_MS),
    })

    if (!tunnelRes.ok) {
      result.error = `get_tunnel.php retornou HTTP ${tunnelRes.status}`
      gpuHealthStatus = 'offline'
      return result
    }

    const tunnelData = await tunnelRes.json()

    if (tunnelData.status !== 'online' || !tunnelData.tunnelUrl) {
      result.error = tunnelData.message || 'GPU reportou status offline'
      gpuHealthStatus = 'offline'
      return result
    }

    result.gpuOnline = true
    result.tunnelUrl = tunnelData.tunnelUrl

    // PASSO 2: Verificar se o túnel (GPU) está respondendo
    const gpuPingRes = await fetch(`${tunnelData.tunnelUrl}/api/native-generate`, {
      method: 'OPTIONS',
      signal: AbortSignal.timeout(GPU_HEALTH_CHECK_MS),
    }).catch(() => null)

    // OPTIONS pode falhar, tenta GET simples
    if (!gpuPingRes || !gpuPingRes.ok) {
      const gpuPingRes2 = await fetch(`${tunnelData.tunnelUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(GPU_HEALTH_CHECK_MS),
      }).catch(() => null)

      if (!gpuPingRes2) {
        result.error = `Túnel ${tunnelData.tunnelUrl.substring(0, 40)}... não responde`
        gpuHealthStatus = 'offline'
        return result
      }

      // Se o túnel respondeu a GET, tá vivo (mesmo que OPTIONS falhou)
      result.tunnelAlive = true
    } else {
      result.tunnelAlive = true
    }

    result.responseTime = Date.now() - startTime
    gpuHealthStatus = 'online'
    lastGPUContact = Date.now()
    return result

  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    gpuHealthStatus = 'offline'
    return result
  }
}

// ============================================================
// 🔧 UNSTICK INTELIGENTE — só libera se GPU realmente tá morta
// ============================================================
async function unstickProcessing(): Promise<{ released: number; reason: string }> {
  try {
    // Buscar TODOS os itens em processing (sem filtro de tempo)
    const processingItems = await db.generationQueue.findMany({
      where: { status: 'processing' },
      select: { id: true, startedAt: true, createdAt: true },
    })

    if (processingItems.length === 0) {
      return { released: 0, reason: 'no_processing_items' }
    }

    // Verificar saúde da GPU em tempo real
    const health = await checkGPUHealth()
    const elapsedMs = Date.now() - processingItems[0].startedAt.getTime()
    const elapsedSec = Math.floor(elapsedMs / 1000)

    console.log(`[Queue Premium] ${processingItems.length} processing há ${elapsedSec}s | GPU: ${health.gpuOnline ? 'ONLINE' : 'OFFLINE'} | Túnel: ${health.tunnelAlive ? 'VIVO' : 'MORTO'}`)

    // LÓGICA INTELIGENTE:
    // 1. GPU OFFLINE ou túnel MORTO → LIBERA IMEDIATAMENTE (0s de espera)
    // 2. GPU online E túnel vivo E < 1min → mantém (processamento normal)
    // 3. GPU online mas > 1min → libera por timeout absoluto

    if (!health.gpuOnline || !health.tunnelAlive) {
      console.log(`[Queue Premium] ⚡ GPU OFFLINE/túnel morto → LIBERA IMEDIATAMENTE | Motivo: ${health.error}`)
      const result = await db.generationQueue.updateMany({
        where: { status: 'processing' },
        data: { status: 'failed', completedAt: new Date() },
      })
      if (result.count > 0) {
        console.log(`[Queue Premium] ✅ Liberou ${result.count} item(s) preso(s) | gpu_offline`)
      }
      return { released: result.count, reason: 'gpu_offline' }
    }

    // GPU tá online = pode estar processando de verdade, só libera se excedeu 1min
    if (elapsedMs > PROCESSING_TIMEOUT_MS) {
      console.log(`[Queue Premium] GPU online mas ${elapsedSec}s > 1min → LIBERA por timeout`)
      const result = await db.generationQueue.updateMany({
        where: { status: 'processing' },
        data: { status: 'failed', completedAt: new Date() },
      })
      return { released: result.count, reason: 'timeout' }
    }

    // GPU online + < 1min = processamento normal, manter
    console.log(`[Queue Premium] GPU online + ${elapsedSec}s < 1min → MANTÉM (processando normal)`)
    return { released: 0, reason: 'processing_normal' }

  } catch (err) {
    console.error(`[Queue Premium] Erro no unstick:`, err)
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
      console.log('[Queue Premium] 🚀 Promoted:', nextWaiting.id)
      return true
    }
    return false
  } catch (err) {
    console.error('[Queue Premium] Erro promoteNext:', err)
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

    // SISTEMA PREMIUM: desbloquear com health check inteligente
    const { released, reason } = await unstickProcessing()
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

    // Contar quantos estão processando
    const processingCount = await db.generationQueue.count({
      where: { status: 'processing' },
    })

    // Contar posição na fila
    const waitingCount = await db.generationQueue.count({
      where: { status: 'waiting' },
    })

    // Criar entrada na fila
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
    console.error('[Queue Premium] Join error:', error)
    return NextResponse.json({ error: 'Erro ao entrar na fila' }, { status: 500 })
  }
}

// GET /api/queue/status?id=xxx - Verificar posição na fila (COM HEALTH CHECK)
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

    // SISTEMA PREMIUM: health check + unstick inteligente a cada poll
    const { released, reason } = await unstickProcessing()
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

    // Calcular posição atual
    let position = 0
    if (item.status === 'waiting') {
      position = await db.generationQueue.count({
        where: {
          status: 'waiting',
          createdAt: { lt: item.createdAt },
        },
      }) + 1
    }

    // Se item foi liberado (failed), informar o cliente
    const wasReleased = item.status === 'failed'

    return NextResponse.json({
      id: item.id,
      status: item.status,
      position,
      gpuHealth: getGPUHealthInfo(),
      ...(wasReleased ? { released: true, reason: 'gpu_offline_or_timeout' } : {}),
    })
  } catch (error) {
    console.error('[Queue Premium] Status error:', error)
    return NextResponse.json({ error: 'Erro ao verificar fila' }, { status: 500 })
  }
}
