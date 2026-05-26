import { NextResponse } from 'next/server'

// GET /api/upload-token - Generates a temporary signed token for direct browser-to-PHP upload
// This avoids Vercel's 4.5MB body size limit (Hobby plan)
export async function GET() {
  try {
    const audioServerUrl = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
    const apiKey = process.env.AUDIO_SERVER_API_KEY || ''

    if (!audioServerUrl || !apiKey) {
      return NextResponse.json(
        { error: 'Servidor de áudio não configurado' },
        { status: 500 }
      )
    }

    // Generate token: timestamp.hmac_sha256(timestamp, apiKey)
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

    // Convert signature to hex
    const hmac = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return NextResponse.json({
      uploadUrl: `${audioServerUrl}/upload-direct.php`,
      token: `${timestamp}.${hmac}`,
    })
  } catch (error) {
    console.error('Upload token error:', error)
    return NextResponse.json(
      { error: 'Erro ao gerar token de upload' },
      { status: 500 }
    )
  }
}
