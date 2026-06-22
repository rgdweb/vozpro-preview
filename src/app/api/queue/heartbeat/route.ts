/**
 * Heartbeat da fila — cliente chama a cada 15s enquanto gera.
 * Reseta o timer de stuck, impedindo que geracao ativa seja liberada.
 * Se o cliente parar de chamar (fechou aba, crash, sem conexao),
 * apos 1 minuto sem heartbeat o item e liberado automaticamente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    const { queueId } = await req.json()
    if (!queueId) {
      return NextResponse.json({ error: 'ID nao informado' }, { status: 400 })
    }

    const item = await db.generationQueue.findUnique({
      where: { id: queueId },
    })

    if (!item || item.userId !== session.userId) {
      return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })
    }

    if (item.status !== 'processing') {
      return NextResponse.json({ ok: true, status: item.status })
    }

    // Resetar timer — cliente ainda esta ativo gerando
    await db.generationQueue.update({
      where: { id: queueId },
      data: { startedAt: new Date() },
    })

    return NextResponse.json({ ok: true, heartbeat: true })
  } catch (error) {
    console.error('[Queue] Heartbeat error:', error)
    return NextResponse.json({ ok: true }) // Nao falha o heartbeat
  }
}
