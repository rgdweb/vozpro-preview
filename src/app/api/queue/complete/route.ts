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
const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'
const ORACLE_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'

// ============================================================
// 🏥 HEALTH CHECK INTELIGENTE — verifica GPU via WireGuard VPN
// ============================================================
interface GPUHealthResult {
  gpuOnline: boolean
  wireGuardAlive: boolean
  gpuUrl: string | null
  responseTime: number
  error: string | null
}

async function checkGPUHealth(): Promise<GPUHealthResult> {
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
      return result
    }

    const healthData = await healthRes.json()

    if (healthData.status !== 'ok' || !healthData.model_loaded) {
      result.error = healthData.error || 'GPU reportou status offline'
      return result
    }

    result.gpuOnline = true
    result.wireGuardAlive = true
    result.gpuUrl = GPU_DIRECT_URL
    result.responseTime = Date.now() - startTime
    return result

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
          return result
        } else {
          result.error = healthData.error || 'GPU reportou status offline'
          return result
        }
      } else {
        result.error = `/health retornou HTTP ${healthRes.status}`
        return result
      }
    } catch (nginxErr) {
      result.error = 'WireGuard: ' + (directErr instanceof Error ? directErr.message : String(directErr)) + ' | Nginx: ' + (nginxErr instanceof Error ? nginxErr.message : String(nginxErr))
      return result
    }
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

    console.log(`[Queue Premium Complete] ${stuckItems.length} item(s) há ${elapsedMin}min | GPU: ${health.gpuOnline ? 'ONLINE' : 'OFFLINE'} | WireGuard: ${health.wireGuardAlive ? 'VIVO' : 'MORTO'}`)

    // Se GPU tá online E WireGuard vivo E < 1.5min = mantém
    if (health.gpuOnline && health.wireGuardAlive && elapsedMs < 1.5 * 60 * 1000) {
      console.log(`[Queue Premium Complete] GPU online + WireGuard vivo + < 1.5min → MANTÉM`)
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
