import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

// API para download do áudio após pagamento aprovado
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { paymentId } = await req.json()

    if (!paymentId) {
      return NextResponse.json({ error: 'paymentId obrigatório' }, { status: 400 })
    }

    // Buscar pagamento no banco
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    })

    if (!payment || payment.userId !== session.userId) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
    }

    if (payment.status !== 'approved') {
      return NextResponse.json({ error: 'Pagamento ainda não foi aprovado' }, { status: 402 })
    }

    // Retornar a URL do áudio para download
    return NextResponse.json({
      success: true,
      audioUrl: payment.audioUrl,
      format: payment.format,
      paymentId: payment.id,
    })
  } catch (error) {
    console.error('[Payment Download] Error:', error)
    return NextResponse.json({ error: 'Erro ao processar download' }, { status: 500 })
  }
}
