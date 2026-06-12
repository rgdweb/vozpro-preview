/**
 * 🚨 CONTRATO DE GOVERNANÇA EXECUTIVA - VOZPRO (SaaS HÍBRIDO)
 * ARQUIVO CRÍTICO: Finalização de itens na fila e promoção do próximo.
 *
 * ⚡ SISTEMA PREMIUM DE FILA INTELIGENTE v2.0
 * - Health check REAL na GPU (não só timeout cego)
 * - 1 minuto de timeout absoluto
 * - SEMPRE chame promoteNext() após completar/falhar — sem isso a fila trava.
 * - Deploy via: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_CONCURRENT_GENERATIONS = 1
const PROCESSING_TIMEOUT_MS = 1 * 60 * 1000 // 1 minuto — consistente com join
const GPU_HEALTH_CHECK_MS = 5000 // 5 segundos timeout para health check
const TUNNEL_API = process.env.AUDIO_SERVER_URL || 'https://api.sorteiomax.com.br'

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
    const tunnelRes = await fetch(`${TUNNEL_API}/get_tunnel.php`, {
      signal: AbortSignal.timeout(GPU_HEALTH_CHECK_MS),
    })

    if (!tunnelRes.ok) {
      result.error = `get_tunnel.php retornou HTTP ${tunnelRes.status}`
      return result
    }

    const tunnelData = await tunnelRes.json()

    if (tunnelData.status !== 'online' || !tunnelData.tunnelUrl) {
      result.error = tunnelData.message || 'GPU reportou status offline'
      return result
    }

    result.gpuOnline = true
    result.tunnelUrl = tunnelData.tunnelUrl

    // Verificar se o túnel responde
    const gpuPing = await fetch(`${tunnelData.tunnelUrl}/`, {
      method: 'GET',
      signal: AbortSignal.timeout(GPU_HEALTH_CHECK_MS),
    }).catch(() => null)

    if (gpuPing) {
      result.tunnelAlive = true
    } else {
      result.error = `Túnel ${tunnelData.tunnelUrl.substring(0, 40)}... não responde`
    }

    result.responseTime = Date.now() - startTime
    return result

  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err)
    return result
  }
}

// ============================================================
// 🔧 UNSTICK INTELIGENTE — só libera se GPU realmente tá morta
// ============================================================
async function unstickProcessing(): Promise<{ released: number; reason: string }> {
  try {
    const stuckItems = await db.generationQueue.findMany({
      where: {
        status: 'processing',
        startedAt: { lt: new Date(Date.now() - PROCESSING_TIMEOUT_MS) },
      },
      select: { id: true, startedAt: true },
    })

    if (stuckItems.length === 0) {
      return { released: 0, reason: 'no_stuck_items' }
    }

    const health = await checkGPUHealth()
    const elapsedMs = Date.now() - stuckItems[0].startedAt.getTime()
    const elapsedMin = (elapsedMs / 60000).toFixed(1)

    console.log(`[Queue Premium Complete] ${stuckItems.length} item(s) há ${elapsedMin}min | GPU: ${health.gpuOnline ? 'ONLINE' : 'OFFLINE'} | Túnel: ${health.tunnelAlive ? 'VIVO' : 'MORTO'}`)

    // Se GPU tá online E túnel vivo E < 1.5min = mantém
    if (health.gpuOnline && health.tunnelAlive && elapsedMs < 1.5 * 60 * 1000) {
      console.log(`[Queue Premium Complete] GPU online + túnel vivo + < 1.5min → MANTÉM`)
      return { released: 0, reason: 'gpu_alive_keep_processing' }
    }

    // Libera por timeout ou GPU offline
    const reasonStr = health.gpuOnline ? `timeout_${elapsedMin}min` : 'gpu_offline'
    console.log(`[Queue Premium Complete] Liberando ${stuckItems.length} item(s) | Motivo: ${reasonStr}`)

    const result = await db.generationQueue.updateMany({
      where: {
        status: 'processing',
        startedAt: { lt: new Date(Date.now() - PROCESSING_TIMEOUT_MS) },
      },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    })

    return { released: result.count, reason: reasonStr }

  } catch (err) {
    console.error(`[Queue Premium Complete] Erro unstick:`, err)
    return { released: 0, reason: 'error' }
  }
}

// Promover o próximo waiting para processing
async function promoteNext() {
  try {
    const currentProcessing = await db.generationQueue.count({
      where: { status: 'processing' },
    })

    if (currentProcessing >= MAX_CONCURRENT_GENERATIONS) return

    const nextWaiting = await db.generationQueue.findFirst({
      where: { status: 'waiting' },
      orderBy: { createdAt: 'asc' },
    })

    if (nextWaiting) {
      await db.generationQueue.update({
        where: { id: nextWaiting.id },
        data: {
          status: 'processing',
          startedAt: new Date(),
        },
      })
      console.log('[Queue Premium Complete] 🚀 Promoted next:', nextWaiting.id)
    }
  } catch (err) {
    console.error('[Queue Premium Complete] Erro promoteNext:', err)
  }
}

// Limpar itens antigos
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

// POST /api/queue/complete - Marcar geração como completa/falha
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { queueId, success = true } = await req.json()

    if (!queueId) {
      return NextResponse.json({ error: 'ID da fila não informado' }, { status: 400 })
    }

    const item = await db.generationQueue.findUnique({
      where: { id: queueId },
    })

    if (!item || item.userId !== session.userId) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })
    }

    // Marcar como completo
    await db.generationQueue.update({
      where: { id: queueId },
      data: {
        status: success ? 'completed' : 'failed',
        completedAt: new Date(),
      },
    })

    // SEMPRE promover o próximo da fila
    await promoteNext()

    // Limpar itens antigos
    await cleanupOldItems()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Queue Premium Complete] Complete error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar fila' }, { status: 500 })
  }
}

// GET /api/queue/complete?health=true - Health check premium + limpar presos
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Detectar e limpar itens presos COM health check inteligente
    const { released, reason } = await unstickProcessing()

    // Se desbloqueou algo, tentar promover
    if (released > 0) {
      await promoteNext()
    }

    return NextResponse.json({
      ok: true,
      released,
      reason,
    })
  } catch (error) {
    console.error('[Queue Premium Complete] Health check error:', error)
    return NextResponse.json({ error: 'Erro ao verificar fila' }, { status: 500 })
  }
}
