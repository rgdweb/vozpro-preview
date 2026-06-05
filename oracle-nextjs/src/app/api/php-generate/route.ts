import { NextRequest, NextResponse } from 'next/server'

// POST /api/php-generate - Proxy de geracao de voz via PHP server
// Browser -> Vercel (same-origin, sem CORS) -> PHP (server-to-server, sem CORS)
// Isso bypassa o timeout de 60s do Vercel pois o PHP faz o trabalho pesado

export const maxDuration = 60 // So o proxy rapido, o PHP que faz o trabalho pesado

export async function POST(req: NextRequest) {
  const phpServerUrl = process.env.AUDIO_SERVER_URL

  if (!phpServerUrl) {
    return NextResponse.json(
      { error: 'Servidor PHP nao configurado. Defina AUDIO_SERVER_URL no Vercel.', debug: null },
      { status: 500 }
    )
  }

  try {
    // Pegar o body da requisicao do browser e repassar pro PHP
    const body = await req.text()
    const generateUrl = phpServerUrl.replace(/\/$/, '') + '/generate.php'

    const startTime = Date.now()

    // Fazer a requisicao pro PHP (server-to-server, sem CORS)
    const phpRes = await fetch(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })

    const elapsed = Date.now() - startTime

    if (!phpRes.ok) {
      let errorMsg = `Erro do servidor PHP (HTTP ${phpRes.status})`
      let debugData = null

      try {
        const errText = await phpRes.text()
        try {
          const errData = JSON.parse(errText)
          errorMsg = errData.erro || errData.error || errorMsg
          debugData = errData.debug || null
        } catch {
          if (errText.length > 10 && errText.length < 1000) {
            errorMsg = `PHP HTTP ${phpRes.status}: ${errText.substring(0, 300)}`
          }
        }
      } catch {}

      return NextResponse.json(
        { error: errorMsg, debug: debugData || { totalDuration: elapsed, steps: [{ time: new Date().toISOString(), step: 'PHP proxy error', status: 'error', detail: `HTTP ${phpRes.status} em ${elapsed}ms`, duration: elapsed }] } },
        { status: phpRes.status }
      )
    }

    // Retornar a resposta do PHP diretamente (ja tem audioUrl, debug, etc)
    const phpData = await phpRes.json()

    // Marcar que veio via PHP
    phpData.viaPhp = true

    return NextResponse.json(phpData)
  } catch (error) {
    console.error('[php-generate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no proxy PHP', debug: null },
      { status: 500 }
    )
  }
}
