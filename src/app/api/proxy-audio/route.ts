import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

/**
 * Proxy de áudio para evitar CORS ao carregar áudios do servidor PHP
 * no painel admin (waveform preview, trim, etc)
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL não fornecida' }, { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        'Accept': 'audio/*, */*',
      },
    })

    if (!res.ok) {
      return NextResponse.json(
        { error: `Erro ao buscar áudio: HTTP ${res.status}` },
        { status: res.status }
      )
    }

    const contentType = res.headers.get('content-type') || 'audio/wav'
    const arrayBuffer = await res.arrayBuffer()

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': arrayBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('[proxy-audio] Erro:', err)
    return NextResponse.json(
      { error: 'Falha ao carregar áudio do servidor' },
      { status: 500 }
    )
  }
}
