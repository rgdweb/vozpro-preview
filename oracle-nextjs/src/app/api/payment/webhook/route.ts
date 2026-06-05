import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createHmac } from 'crypto'

// POST /api/payment/webhook - Webhook do MercadoPago
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // MercadoPago envia o tipo de notificação
    if (body.type === 'payment') {
      const paymentId = body.data?.id
      if (!paymentId) {
        return NextResponse.json({ error: 'Missing payment ID' }, { status: 400 })
      }

      const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
      if (!mpAccessToken) {
        return NextResponse.json({ error: 'MP not configured' }, { status: 500 })
      }

      // Buscar detalhes do pagamento no MercadoPago
      const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${mpAccessToken}` },
      })

      if (!mpRes.ok) {
        return NextResponse.json({ error: 'Failed to fetch payment' }, { status: 500 })
      }

      const mpPayment = await mpRes.json()
      const externalRef = mpPayment.external_reference
      const status = mpPayment.status // approved, pending, rejected, cancelled

      if (!externalRef) {
        return NextResponse.json({ ok: true })
      }

      // Atualizar no banco
      const existingPayment = await db.payment.findFirst({
        where: { externalRef },
      })

      if (existingPayment) {
        await db.payment.update({
          where: { id: existingPayment.id },
          data: {
            status,
            mpPaymentId: String(paymentId),
          },
        })
        console.log(`[Webhook] Payment ${externalRef} updated to ${status}`)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[Webhook] Error:', error)
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}

// GET /api/payment/webhook - Verificação do MercadoPago
export async function GET() {
  return NextResponse.json({ ok: true })
}
