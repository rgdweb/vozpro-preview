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
