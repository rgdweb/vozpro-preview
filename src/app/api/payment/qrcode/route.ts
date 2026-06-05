import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'

// POST /api/payment/qrcode - Gera QR code como data URI
export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) {
      return NextResponse.json({ error: 'URL não fornecida' }, { status: 400 })
    }

    const qrCodeDataUri = await QRCode.toDataURL(url, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
    })

    return NextResponse.json({ qrCode: qrCodeDataUri })
  } catch (error) {
    console.error('[QRCode] Error:', error)
    return NextResponse.json({ error: 'Erro ao gerar QR code' }, { status: 500 })
  }
}
