import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_CONCURRENT_GENERATIONS = 1

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

    // Se completou com sucesso, promover o próximo da fila
    if (success) {
      const nextWaiting = await db.generationQueue.findFirst({
        where: { status: 'waiting' },
        orderBy: { createdAt: 'asc' },
      })

      if (nextWaiting) {
        const currentProcessing = await db.generationQueue.count({
          where: { status: 'processing' },
        })

        if (currentProcessing < MAX_CONCURRENT_GENERATIONS) {
          await db.generationQueue.update({
            where: { id: nextWaiting.id },
            data: {
              status: 'processing',
              startedAt: new Date(),
            },
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Queue] Complete error:', error)
    return NextResponse.json({ error: 'Erro ao atualizar fila' }, { status: 500 })
  }
}
