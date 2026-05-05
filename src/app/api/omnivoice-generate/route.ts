import { NextRequest, NextResponse } from 'next/server'

// POST /api/omnivoice-generate — Proxy para OmniVoice (k2-fsa) via tunnel
// Usa API Gradio nativa do OmniVoice com parametros corretos
// NÃO altera nenhum fluxo existente do F5-TTS (tunnel-generate)

const OMNIVOICE_URL = process.env.OMNIVOICE_URL || process.env.HF_SPACE_URL || ''

export const maxDuration = 300

function createDebug() {
  const steps: { time: string; step: string; status: string; detail?: string; duration?: number }[] = []
  const start = Date.now()
  function log(step: string, status: 'info' | 'ok' | 'warn' | 'error', detail?: string) {
    steps.push({ time: new Date().toISOString().split('T')[1], step, status, detail: detail || '', duration: Date.now() - start })
  }
  function result() { return { totalDuration: Date.now() - start, steps } }
  return { log, result }
}

/**
 * Faz upload de audio para o Gradio e retorna o path no servidor
 */
async function uploadToGradio(
  baseUrl: string,
  audioBuffer: ArrayBuffer,
  fileName: string,
  debug: ReturnType<typeof createDebug>
): Promise<string | null> {
  try {
    const blob = new Blob([audioBuffer], { type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' })
    const form = new FormData()
    form.append('files', blob, fileName)

    const res = await fetch(`${baseUrl}/gradio_api/upload`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const errText = await res.text()
      debug.log('Upload', 'error', `HTTP ${res.status}: ${errText.substring(0, 200)}`)
      return null
    }

    const paths = await res.json()
    if (Array.isArray(paths) && paths.length > 0) {
      debug.log('Upload', 'ok', `path: ${paths[0]}`)
      return paths[0]
    }

    debug.log('Upload', 'error', 'Resposta inesperada')
    return null
  } catch (err) {
    debug.log('Upload', 'error', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Submete job para o Gradio (clone ou design) via SSE
 * Retorna o event_id para acompanhar o resultado
 */
async function submitJob(
  baseUrl: string,
  endpoint: string, // '_clone_fn' ou '_design_fn'
  data: unknown[],
  debug: ReturnType<typeof createDebug>
): Promise<string | null> {
  try {
    const res = await fetch(`${baseUrl}/gradio_api/call/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
      signal: AbortSignal.timeout(30000),
    })

    if (!res.ok) {
      const errText = await res.text()
      debug.log('Submit', 'error', `HTTP ${res.status}: ${errText.substring(0, 200)}`)
      return null
    }

    const result = await res.json()
    const eventId = result.event_id
    debug.log('Submit', eventId ? 'ok' : 'error', eventId ? `event_id: ${eventId}` : 'sem event_id')
    return eventId
  } catch (err) {
    debug.log('Submit', 'error', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Acompanha resultado via SSE stream
 * Retorna URL do audio gerado
 */
async function streamResult(
  baseUrl: string,
  endpoint: string,
  eventId: string,
  debug: ReturnType<typeof createDebug>,
  timeoutMs = 300000 // 5 min
): Promise<{ audioUrl: string | null; error: string | null }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `${baseUrl}/gradio_api/call/${endpoint}/${eventId}`,
      { headers: { 'Accept': 'text/event-stream' }, signal: controller.signal }
    )

    if (response.status === 404) { clearTimeout(timeoutId); return { audioUrl: null, error: '404' } }
    if (!response.ok) { clearTimeout(timeoutId); return { audioUrl: null, error: `HTTP ${response.status}` } }

    debug.log('SSE Stream', 'ok', 'Conexao aberta, aguardando resultado...')

    const reader = response.body?.getReader()
    if (!reader) { clearTimeout(timeoutId); return { audioUrl: null, error: 'No stream reader' } }

    const decoder = new TextDecoder()
    let buffer = ''
    let heartbeatCount = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() || ''

      for (const block of blocks) {
        if (!block.trim()) continue

        const lines = block.split('\n')
        const eventLine = lines.find(l => l.startsWith('event:'))
        const dataLine = lines.find(l => l.startsWith('data:'))
        const eventType = eventLine?.replace('event: ', '').trim()
        const eventData = dataLine?.slice(6).trim()

        if (eventType === 'complete' && eventData) {
          clearTimeout(timeoutId)
          debug.log('SSE Stream', 'ok', 'Evento COMPLETE recebido!')
          try {
            const resultData = JSON.parse(eventData)
            // OmniVoice retorna [info_text, audio_output]
            if (!Array.isArray(resultData) || resultData.length < 2) {
              return { audioUrl: null, error: 'Formato inesperado' }
            }
            const infoText = resultData[0]
            const audioOutput = resultData[1]
            let audioUrl: string | null = null
            if (audioOutput?.url) audioUrl = audioOutput.url
            else if (audioOutput?.path) audioUrl = `${baseUrl}/gradio_api/file=${audioOutput.path}`
            if (audioUrl) {
              debug.log('SSE Stream', 'ok', `Audio: ${audioUrl.substring(0, 80)}`)
              // Extrair RTF do info text se disponivel
              const rtfMatch = infoText?.match(/RTF[:\s]*([\d.]+)/)
              if (rtfMatch) {
                debug.log('SSE Stream', 'ok', `RTF: ${rtfMatch[1]}`)
              }
              return { audioUrl, error: null }
            }
            return { audioUrl: null, error: 'Sem URL no output' }
          } catch { return { audioUrl: null, error: 'Parse error' } }
        }

        if (eventType === 'error') {
          clearTimeout(timeoutId)
          debug.log('SSE Stream', 'error', (eventData || 'Erro na geracao').substring(0, 200))
          return { audioUrl: null, error: eventData || 'Erro na geracao' }
        }

        if (eventType === 'heartbeat') {
          heartbeatCount++
          if (heartbeatCount <= 2 || heartbeatCount % 15 === 0) {
            debug.log('SSE Stream', 'info', `Heartbeat #${heartbeatCount}`)
          }
        }
      }
    }

    clearTimeout(timeoutId)
    return { audioUrl: null, error: 'Stream ended without result' }
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') return { audioUrl: null, error: 'timeout' }
    return { audioUrl: null, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================
// POST HANDLER
// ============================================================

export async function POST(request: NextRequest) {
  const debug = createDebug()

  try {
    const body = await request.json()
    const {
      text,
      mode = 'clone',         // clone | design | auto
      instruct = '',           // voice design description
      referenceAudioUrl = '',  // URL do audio de referencia (clone mode)
      referenceAudioName = 'ref_audio.wav',
      refText = '',            // transcricao (vazio = auto Whisper)
      numStep = 16,            // 16=rapido, 32=qualidade
      speed = 1.0,
      language = 'Auto',       // Auto = detectar
      // Voice Design params (usados no modo design)
      gender = 'Auto',
      age = 'Auto',
      pitch = 'Auto',
      style = 'Auto',
      accent = 'Auto',
    } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Texto e obrigatorio' }, { status: 400 })
    }

    const effectiveUrl = OMNIVOICE_URL
    if (!effectiveUrl) {
      return NextResponse.json({
        error: 'OmniVoice nao configurado. Defina OMNIVOICE_URL no ambiente.',
        debug: debug.result(),
      }, { status: 503 })
    }

    const startTime = Date.now()

    if (mode === 'clone') {
      // =============================================================
      // MODO CLONE: _clone_fn endpoint
      // Params: text, lang, ref_aud, ref_text, instruct, ns, gs, dn, sp, du, pp, po
      // =============================================================
      debug.log('OmniVoice Clone', 'info', `text: "${text.substring(0, 60)}..."`)

      // 1. Baixar e fazer upload do audio de referencia
      let refAudioPath: string | null = null
      if (referenceAudioUrl) {
        debug.log('Ref Audio', 'info', 'Baixando audio de referencia...')
        try {
          const audioRes = await fetch(referenceAudioUrl)
          if (audioRes.ok) {
            const audioBuffer = await audioRes.arrayBuffer()
            refAudioPath = await uploadToGradio(effectiveUrl, audioBuffer, referenceAudioName, debug)
          } else {
            debug.log('Ref Audio', 'error', `Falha ao baixar: HTTP ${audioRes.status}`)
          }
        } catch (err) {
          debug.log('Ref Audio', 'error', err instanceof Error ? err.message : String(err))
        }
      }

      if (!refAudioPath) {
        return NextResponse.json({
          error: 'Falha ao processar audio de referencia',
          debug: debug.result(),
        }, { status: 400 })
      }

      // 2. Montar dados para o Gradio
      const gradioData = [
        text,                    // text
        language || 'Auto',      // lang
        {                        // ref_aud (FileData)
          path: refAudioPath,
          orig_name: referenceAudioName,
          mime_type: referenceAudioName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
          is_stream: false,
          meta: { _type: 'gradio.FileData' },
        },
        refText,                 // ref_text
        instruct,                // instruct
        numStep,                 // ns (inference steps)
        2.0,                     // gs (guidance scale / CFG)
        true,                    // dn (denoise)
        speed,                   // sp (speed)
        null,                    // du (duration, null = auto)
        true,                    // pp (preprocess prompt)
        true,                    // po (postprocess output)
      ]

      debug.log('Params', 'info', `lang:${language} steps:${numStep} speed:${speed}`)

      // 3. Submeter e acompanhar
      let eventId: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          debug.log('Retry', 'warn', `Tentativa ${attempt + 1}/3`)
          await new Promise(r => setTimeout(r, 2000))
        }
        eventId = await submitJob(effectiveUrl, '_clone_fn', gradioData, debug)
        if (eventId) break
      }

      if (!eventId) {
        return NextResponse.json({
          error: 'Falha ao submeter job ao OmniVoice',
          debug: debug.result(),
        }, { status: 502 })
      }

      const elapsed = Date.now() - startTime
      const result = await streamResult(effectiveUrl, '_clone_fn', eventId, debug)
      const totalElapsed = Date.now() - startTime

      if (!result.audioUrl) {
        return NextResponse.json({
          error: `OmniVoice falhou: ${result.error}`,
          debug: debug.result(),
        }, { status: 500 })
      }

      debug.log('FINAL', 'ok', `Total: ${(totalElapsed / 1000).toFixed(1)}s`)

      return NextResponse.json({
        audioUrl: result.audioUrl,
        model: 'omnivoice',
        mode: 'clone',
        elapsed: totalElapsed,
        debug: debug.result(),
      })

    } else {
      // =============================================================
      // MODO DESIGN / AUTO: _design_fn endpoint
      // Params: text, lang, ns, gs, dn, sp, du, pp, po, gender, age, pitch, style, accent, dialect
      // =============================================================
      const modeLabel = mode === 'design' ? 'Design' : 'Auto'
      debug.log(`OmniVoice ${modeLabel}`, 'info', `text: "${text.substring(0, 60)}..."`)

      const gradioData = [
        text,                        // text
        language || 'Auto',          // lang
        numStep,                     // ns (inference steps)
        2.0,                         // gs (guidance scale / CFG)
        true,                        // dn (denoise)
        speed,                       // sp (speed)
        null,                        // du (duration, null = auto)
        true,                        // pp (preprocess prompt)
        true,                        // po (postprocess output)
        gender || 'Auto',            // gender
        age || 'Auto',               // age
        pitch || 'Auto',             // pitch
        style || 'Auto',             // style
        accent || 'Auto',            // english accent
        'Auto',                      // chinese dialect
      ]

      // Se modo design com instruct, injetar no style
      if (mode === 'design' && instruct) {
        gradioData[12] = instruct // style = instruct
      }

      debug.log('Params', 'info', `lang:${language} steps:${numStep} gender:${gradioData[9]} pitch:${gradioData[11]}`)

      let eventId: string | null = null
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) {
          debug.log('Retry', 'warn', `Tentativa ${attempt + 1}/3`)
          await new Promise(r => setTimeout(r, 2000))
        }
        eventId = await submitJob(effectiveUrl, '_design_fn', gradioData, debug)
        if (eventId) break
      }

      if (!eventId) {
        return NextResponse.json({
          error: `Falha ao submeter job OmniVoice ${modeLabel}`,
          debug: debug.result(),
        }, { status: 502 })
      }

      const result = await streamResult(effectiveUrl, '_design_fn', eventId, debug)
      const totalElapsed = Date.now() - startTime

      if (!result.audioUrl) {
        return NextResponse.json({
          error: `OmniVoice ${modeLabel} falhou: ${result.error}`,
          debug: debug.result(),
        }, { status: 500 })
      }

      debug.log('FINAL', 'ok', `Total: ${(totalElapsed / 1000).toFixed(1)}s`)

      return NextResponse.json({
        audioUrl: result.audioUrl,
        model: 'omnivoice',
        mode,
        elapsed: totalElapsed,
        debug: debug.result(),
      })
    }

  } catch (error) {
    console.error('[OmniVoice] Exception:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Erro interno',
      debug: { steps: [], totalDuration: 0 },
    }, { status: 500 })
  }
}

// ============================================================
// GET HANDLER — Health check
// ============================================================

export async function GET() {
  const effectiveUrl = OMNIVOICE_URL || process.env.HF_SPACE_URL || ''

  let reachable = false
  if (effectiveUrl) {
    try {
      const res = await fetch(effectiveUrl + '/gradio_api/info/', {
        signal: AbortSignal.timeout(8000),
      })
      reachable = res.ok
    } catch {
      reachable = false
    }
  }

  return NextResponse.json({
    status: reachable ? 'omnivoice_available' : 'omnivoice_unavailable',
    url: effectiveUrl || undefined,
    reachable,
    model: 'k2-fsa/OmniVoice',
    features: [
      'voice_cloning',
      'voice_design',
      'auto_voice',
      'pronunciation_control_cmu',
      'nonverbal_symbols',
      '600_plus_languages',
      'rtf_0.025',
    ],
  })
}
