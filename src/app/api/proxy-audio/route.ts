import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const AUDIO_SERVER_URL = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'

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
    // Se URL for path relativo (/audios/...), converter para URL completa do Oracle
    let fullUrl = url
    if (url.startsWith('/')) {
      fullUrl = AUDIO_SERVER_URL + url
    }

    const res = await fetch(fullUrl, {
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
