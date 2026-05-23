import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_CONCURRENT_GENERATIONS = 1 // Apenas 1 geração por vez na GPU

// POST /api/queue/join - Entrar na fila de geração
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Verificar se já tem um item na fila do usuário
    const existingItem = await db.generationQueue.findFirst({
      where: {
        userId: session.userId,
        status: { in: ['waiting', 'processing'] },
      },
    })

    if (existingItem) {
      // Já está na fila, retornar posição
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
    })
  } catch (error) {
    console.error('[Queue] Join error:', error)
    return NextResponse.json({ error: 'Erro ao entrar na fila' }, { status: 500 })
  }
}

// GET /api/queue/status?id=xxx - Verificar posição na fila
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

    // Limpar itens antigos (completed/failed mais de 5 minutos)
    try {
      await db.generationQueue.deleteMany({
        where: {
          status: { in: ['completed', 'failed'] },
          completedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
        },
      })
    } catch {}

    return NextResponse.json({
      id: item.id,
      status: item.status,
      position,
    })
  } catch (error) {
    console.error('[Queue] Status error:', error)
    return NextResponse.json({ error: 'Erro ao verificar fila' }, { status: 500 })
  }
}
