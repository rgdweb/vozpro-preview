import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/payment/status?id=xxx - Verifica status do pagamento
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const paymentId = searchParams.get('id')
    const sandbox = searchParams.get('sandbox') === 'true'

    if (!paymentId) {
      return NextResponse.json({ error: 'ID do pagamento não informado' }, { status: 400 })
    }

    // Buscar pagamento no banco
    let payment = await db.payment.findFirst({
      where: { id: paymentId },
    })

    if (!payment) {
      // Tentar buscar por externalRef
      payment = await db.payment.findFirst({
        where: { externalRef: paymentId },
      })
    }

    if (!payment) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
    }

    // Verificar se pertence ao usuário
    if (payment.userId !== session.userId && session.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Se sandbox, permitir aprovação manual
    if (sandbox && payment.status === 'pending') {
      return NextResponse.json({
        id: payment.id,
        externalRef: payment.externalRef,
        status: payment.status,
        format: payment.format,
        sandbox: true,
        canApprove: true,
      })
    }

    // Verificar status no MercadoPago (se access token disponível)
    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (mpAccessToken && payment.externalRef) {
      try {
        // Buscar pagamentos por external_reference
        const mpRes = await fetch(
          `https://api.mercadopago.com/v1/payments/search?external_reference=${payment.externalRef}`,
          {
            headers: { Authorization: `Bearer ${mpAccessToken}` },
          }
        )
        if (mpRes.ok) {
          const mpData = await mpRes.json()
          if (mpData.results && mpData.results.length > 0) {
            const latestPayment = mpData.results[0]
            const newStatus = latestPayment.status // approved, pending, rejected, cancelled

            // Atualizar no banco se diferente
            if (newStatus !== payment.status) {
              await db.payment.update({
                where: { id: payment.id },
                data: {
                  status: newStatus,
                  mpPaymentId: String(latestPayment.id || ''),
                },
              })
              payment.status = newStatus
            }
          }
        }
      } catch (mpErr) {
        console.warn('[Payment] MP status check failed:', mpErr)
      }
    }

    return NextResponse.json({
      id: payment.id,
      externalRef: payment.externalRef,
      status: payment.status,
      format: payment.format,
    })
  } catch (error) {
    console.error('[Payment] Status error:', error)
    return NextResponse.json({ error: 'Erro ao verificar pagamento' }, { status: 500 })
  }
}

// POST /api/payment/status - Sandbox: aprovar pagamento manualmente
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Sandbox: permitir aprovação manual (apenas se MERCADOPAGO_ACCESS_TOKEN não configurado)
    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (mpAccessToken) {
      return NextResponse.json({ error: 'Aprovação manual disponível apenas em modo sandbox' }, { status: 400 })
    }

    const { paymentId } = await req.json()
    if (!paymentId) {
      return NextResponse.json({ error: 'ID do pagamento não informado' }, { status: 400 })
    }

    const payment = await db.payment.findFirst({
      where: { id: paymentId, userId: session.userId },
    })
    if (!payment) {
      return NextResponse.json({ error: 'Pagamento não encontrado' }, { status: 404 })
    }

    await db.payment.update({
      where: { id: payment.id },
      data: { status: 'approved' },
    })

    return NextResponse.json({ status: 'approved' })
  } catch (error) {
    console.error('[Payment] Approve error:', error)
    return NextResponse.json({ error: 'Erro ao aprovar pagamento' }, { status: 500 })
  }
}
