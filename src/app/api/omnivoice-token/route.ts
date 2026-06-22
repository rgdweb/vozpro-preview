import { NextResponse } from 'next/server'

// GET /api/omnivoice-token - Token para VozPro PHP direto (bypassa Vercel)
// Mesmo HMAC do generate-token, mas aponta para generate-omnivoice.php
export async function GET() {
  try {
    const audioServerUrl = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
    const apiKey = process.env.AUDIO_SERVER_API_KEY || ''

    if (!audioServerUrl || !apiKey) {
      return NextResponse.json(
        { error: 'Servidor de audio nao configurado' },
        { status: 500 }
      )
    }

    const timestamp = Math.floor(Date.now() / 1000)
    const encoder = new TextEncoder()

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(String(timestamp))
    )

    const hmac = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return NextResponse.json({
      generateUrl: `${audioServerUrl}/generate-omnivoice.php`,
      token: `${timestamp}.${hmac}`,
    })
  } catch (error) {
    console.error('VozPro token error:', error)
    return NextResponse.json(
      { error: 'Erro ao gerar token VozPro' },
      { status: 500 }
    )
  }
}
