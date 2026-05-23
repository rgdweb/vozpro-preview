import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_CONCURRENT_GENERATIONS = 1
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutos

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

    // SEMPRE promover o próximo da fila (independentemente de sucesso/falha)
    await promoteNext()

    // Limpar itens antigos (completed/failed > 5 min)
    await cleanupOldItems()

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Queue] Complete error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar fila' }, { status: 500 })
  }
}

// Função auxiliar: promover o próximo waiting para processing
async function promoteNext() {
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
    console.log('[Queue] Promoted next:', nextWaiting.id)
  }
}

// Função auxiliar: limpar itens antigos
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

// Função auxiliar: detectar e desbloquear itens presos em "processing"
// Itens processing há mais de PROCESSING_TIMEOUT_MS são marcados como failed
async function unstickProcessing() {
  try {
    const stuckItems = await db.generationQueue.findMany({
      where: {
        status: 'processing',
        startedAt: { lt: new Date(Date.now() - PROCESSING_TIMEOUT_MS) },
      },
    })

    if (stuckItems.length > 0) {
      console.log(`[Queue] Found ${stuckItems.length} stuck processing items, marking as failed`)
      await db.generationQueue.updateMany({
        where: {
          status: 'processing',
          startedAt: { lt: new Date(Date.now() - PROCESSING_TIMEOUT_MS) },
        },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      })
    }

    return stuckItems.length
  } catch {
    return 0
  }
}

// GET /api/queue/complete?health=true - Health check + limpar presos
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Detectar e limpar itens presos
    const unstuckCount = await unstickProcessing()

    // Se desbloqueou algo, tentar promover
    if (unstuckCount > 0) {
      await promoteNext()
    }

    return NextResponse.json({ ok: true, unstuckCount })
  } catch (error) {
    console.error('[Queue] Health check error:', error)
    return NextResponse.json({ error: 'Erro ao verificar fila' }, { status: 500 })
  }
}
