import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { createHash, randomUUID } from 'crypto'

export const maxDuration = 30

// POST /api/payment/create - Cria pagamento MercadoPago (R$1)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { format = 'mp3' } = await req.json()
    if (!['mp3', 'wav'].includes(format)) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
    }

    const mpAccessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!mpAccessToken) {
      // Modo sandbox: gerar pagamento simulado para testes
      const externalRef = `vozpro_${randomUUID()}`
      const simulatedPayment = await db.payment.create({
        data: {
          userId: session.userId,
          externalRef,
          status: 'pending',
          amount: 1.0,
          format,
        },
      })

      return NextResponse.json({
        id: externalRef,
        status: 'pending',
        sandbox: true,
        sandboxUrl: `/api/payment/status?id=${simulatedPayment.id}&sandbox=true`,
        message: 'Modo sandbox - MercadoPago não configurado. Configure MERCADOPAGO_ACCESS_TOKEN no .env',
      })
    }

    // MercadoPago real
    const externalRef = `vozpro_${randomUUID()}`

    // Buscar settings de pagamento
    const mpSettings = await db.systemSetting.findMany({
      where: { key: { in: ['mpTitle', 'mpDescription'] } },
    })
    const settingsMap: Record<string, string> = {}
    mpSettings.forEach(s => { settingsMap[s.key] = s.value })

    const body = {
      items: [
        {
          id: 'vozpro_download',
          title: settingsMap.mpTitle || 'Download de Áudio - VozPro',
          description: settingsMap.mpDescription || `Download de áudio ${format.toUpperCase()} - Sintetizador de voz VozPro`,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: 1.0,
        },
      ],
      external_reference: externalRef,
      notification_url: `${process.env.NEXT_PUBLIC_APP_URL || ''}/api/payment/webhook`,
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL || ''}/`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL || ''}/`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL || ''}/`,
      },
      auto_return: 'approved',
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }],
        installments: 1,
      },
    }

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mpAccessToken}`,
        'X-Idempotency-Key': externalRef,
      },
      body: JSON.stringify(body),
    })

    if (!mpRes.ok) {
      const errText = await mpRes.text()
      console.error('[MercadoPago] Error:', errText)
      return NextResponse.json({ error: 'Erro ao criar pagamento no MercadoPago' }, { status: 500 })
    }

    const mpData = await mpRes.json()

    // Salvar pagamento no banco
    await db.payment.create({
      data: {
        userId: session.userId,
        externalRef,
        status: 'pending',
        amount: 1.0,
        format,
      },
    })

    return NextResponse.json({
      id: mpData.id,
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
      status: 'pending',
    })
  } catch (error) {
    console.error('[Payment] Create error:', error)
    return NextResponse.json({ error: 'Erro ao criar pagamento' }, { status: 500 })
  }
}
