import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Vercel serverless function timeout - TTS generation can take up to 5 minutes
export const maxDuration = 300

const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://k2-fsa-omnivoice.hf.space'

// Debug logger - coleta todos os passos para retorno ao frontend
function createDebug() {
  const steps: { time: string; step: string; status: string; detail?: string; duration?: number }[] = []
  const start = Date.now()

  function log(step: string, status: 'info' | 'ok' | 'warn' | 'error', detail?: string) {
    steps.push({
      time: new Date().toISOString().split('T')[1],
      step,
      status,
      detail: detail || '',
      duration: Date.now() - start,
    })
    console.log(`[Generate][${status.toUpperCase()}] ${step}${detail ? ': ' + detail : ''}`)
  }

  function result() {
    return { totalDuration: Date.now() - start, steps }
  }

  return { log, result }
}

/**
 * Upload a reference audio to HuggingFace Space from a URL.
 */
async function uploadAudioToHF(audioUrl: string, fileName: string, debug: ReturnType<typeof createDebug>): Promise<string | null> {
  try {
    debug.log('Download ref audio', 'info', `from: ${audioUrl.substring(0, 80)}`)

    const audioRes = await fetch(audioUrl)
    if (!audioRes.ok) {
      debug.log('Download ref audio', 'error', `HTTP ${audioRes.status} - ${audioRes.statusText}`)
      return null
    }

    const audioBlob = await audioRes.blob()
    debug.log('Download ref audio', 'ok', `${(audioBlob.size / 1024).toFixed(1)}KB baixado`)

    const uploadForm = new FormData()
    uploadForm.append('files', audioBlob, fileName)

    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: 'POST',
      body: uploadForm,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      debug.log('Upload to HF', 'error', `HTTP ${uploadRes.status}: ${errText.substring(0, 200)}`)
      return null
    }

    const uploadData = await uploadRes.json()
    if (Array.isArray(uploadData) && uploadData.length > 0) {
      debug.log('Upload to HF', 'ok', `path: ${uploadData[0]}`)
      return uploadData[0]
    }

    debug.log('Upload to HF', 'error', 'Resposta inesperada do upload')
    return null
  } catch (err) {
    debug.log('Upload to HF', 'error', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Submit TTS job to Gradio.
 */
async function submitToGradio(data: unknown[], debug: ReturnType<typeof createDebug>): Promise<{ eventId: string | null; gradioError: string | null }> {
  const submitRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/_clone_fn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })

  if (!submitRes.ok) {
    const errText = await submitRes.text()
    debug.log('Submit Gradio', 'error', `HTTP ${submitRes.status}: ${errText.substring(0, 300)}`)
    return { eventId: null, gradioError: `HTTP ${submitRes.status}: ${errText}` }
  }

  const submitData = await submitRes.json()
  const eventId = submitData.event_id
  debug.log('Submit Gradio', eventId ? 'ok' : 'error', eventId ? `event_id: ${eventId}` : 'sem event_id retornado')
  return { eventId, gradioError: null }
}

/**
 * Check if HF Space is awake.
 */
async function checkHFStatus(debug: ReturnType<typeof createDebug>): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${HF_SPACE_URL}/info`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const info = await res.json()
        debug.log('HF Space status', 'ok', `Model: ${info?.model_name || info?.model || 'loaded'}`)
        return { ok: true, detail: JSON.stringify(info).substring(0, 200) }
      }
    }
    debug.log('HF Space status', 'warn', `Space acordando ou em manutencao (HTTP ${res.status})`)
    return { ok: false, detail: `HTTP ${res.status} - space pode estar acordando` }
  } catch (err) {
    debug.log('HF Space status', 'warn', `Sem resposta (timeout 5s) - space pode estar acordando, continuando...`)
    return { ok: false, detail: 'Sem resposta - continuando mesmo assim' }
  }
}

/**
 * SSE Stream Reader - abre UMA conexao persistente e le eventos em tempo real.
 * Isso e como o site oficial do Gradio funciona, so que via HTTP ao inves de WebSocket.
 * Retorna: { audioUrl, error } - um dos dois sera preenchido.
 */
async function streamSSEForResult(
  eventId: string,
  debug: ReturnType<typeof createDebug>,
  timeoutMs: number = 180000 // 3 minutos por stream
): Promise<{ audioUrl: string | null; error: string | null }> {
  debug.log('SSE Stream', 'info', `Abrindo conexao persistente para ${eventId}...`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `${HF_SPACE_URL}/gradio_api/call/_clone_fn/${eventId}`,
      {
        headers: { 'Accept': 'text/event-stream' },
        signal: controller.signal,
      }
    )

    if (response.status === 404) {
      debug.log('SSE Stream', 'error', '404 - event_id perdido')
      clearTimeout(timeoutId)
      return { audioUrl: null, error: '404' }
    }

    if (!response.ok) {
      debug.log('SSE Stream', 'warn', `HTTP ${response.status}, tentando novamente...`)
      clearTimeout(timeoutId)
      return { audioUrl: null, error: `HTTP ${response.status}` }
    }

    debug.log('SSE Stream', 'ok', 'Conexao aberta, aguardando eventos...')

    // Ler o stream de forma persistente
    const reader = response.body?.getReader()
    if (!reader) {
      debug.log('SSE Stream', 'error', 'Nao foi possivel obter reader do response body')
      clearTimeout(timeoutId)
      return { audioUrl: null, error: 'No stream reader' }
    }

    const decoder = new TextDecoder()
    let buffer = ''
    let heartbeatCount = 0

    while (true) {
      const { done, value } = await reader.read()

      if (done) {
        debug.log('SSE Stream', 'info', 'Stream encerrado pelo servidor')
        break
      }

      // Decodificar chunk e adicionar ao buffer
      buffer += decoder.decode(value, { stream: true })

      // Processar blocos SSE completos (separados por \n\n)
      const blocks = buffer.split('\n\n')
      // Manter o ultimo bloco incompleto no buffer
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
            if (!Array.isArray(resultData) || resultData.length < 2) {
              debug.log('SSE Stream', 'error', `Formato inesperado: ${JSON.stringify(resultData).substring(0, 200)}`)
              return { audioUrl: null, error: 'Formato inesperado' }
            }

            const audioOutput = resultData[0]
            let audioUrl: string | null = null
            if (audioOutput?.url) {
              audioUrl = audioOutput.url
            } else if (audioOutput?.path) {
              audioUrl = `${HF_SPACE_URL}/gradio_api/file=${audioOutput.path}`
            }

            if (audioUrl) {
              debug.log('SSE Stream', 'ok', `Audio URL obtida: ${audioUrl.substring(0, 100)}`)
              return { audioUrl, error: null }
            } else {
              debug.log('SSE Stream', 'error', 'Sem URL no output')
              return { audioUrl: null, error: 'Sem URL no output' }
            }
          } catch (parseErr) {
            debug.log('SSE Stream', 'error', `Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`)
            return { audioUrl: null, error: 'Parse error' }
          }
        }

        if (eventType === 'error') {
          clearTimeout(timeoutId)
          debug.log('SSE Stream', 'error', `Evento ERROR: ${eventData?.substring(0, 300) || 'vazio'}`)

          const isNullError = !eventData || eventData === 'null'
          const is404Error = eventData?.includes('404')

          if (isNullError) {
            return { audioUrl: null, error: 'null' }
          }
          if (is404Error) {
            return { audioUrl: null, error: '404' }
          }

          // Erro real - extrair mensagem
          let errorMsg = 'Erro na geracao pelo servidor de IA'
          try {
            const errParsed = JSON.parse(eventData)
            errorMsg = errParsed.error || errParsed.message || errorMsg
          } catch {
            if (eventData && eventData.length > 5 && eventData.length < 500) {
              errorMsg = eventData
            }
          }
          return { audioUrl: null, error: errorMsg }
        }

        if (eventType === 'heartbeat') {
          heartbeatCount++
          if (heartbeatCount <= 3 || heartbeatCount % 10 === 0) {
            debug.log('SSE Stream', 'info', `Heartbeat #${heartbeatCount} (conexao ativa, aguardando resultado...)`)
          }
          // Heartbeat = conexao esta viva, continuar lendo
        }
      }
    }

    // Stream encerrou sem complete nem error
    clearTimeout(timeoutId)
    debug.log('SSE Stream', 'warn', `Stream encerrou sem resultado (${heartbeatCount} heartbeats recebidos)`)
    return { audioUrl: null, error: 'Stream ended without result' }

  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      debug.log('SSE Stream', 'warn', `Timeout apos ${(timeoutMs / 1000).toFixed(0)}s`)
      return { audioUrl: null, error: 'timeout' }
    }
    debug.log('SSE Stream', 'error', `Conexao perdida: ${err instanceof Error ? err.message : String(err)}`)
    return { audioUrl: null, error: 'connection_lost' }
  }
}

/**
 * Executa o fluxo completo: upload + submit + SSE stream
 * Retorna { audioUrl, error }
 */
async function runGeneration(
  data: unknown[],
  serverUrl: string,
  fileName: string,
  debug: ReturnType<typeof createDebug>,
): Promise<{ audioUrl: string | null; error: string }> {
  // Upload
  const hfPath = await uploadAudioToHF(serverUrl, fileName, debug)
  if (!hfPath) {
    return { audioUrl: null, error: 'Falha no upload do audio para HF Space' }
  }

  // Montar FileData
  data[2] = {
    path: hfPath,
    orig_name: fileName,
    mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
    is_stream: false,
    meta: { _type: 'gradio.FileData' },
  }

  // Submit com retry
  let eventId: string | null = null
  for (let s = 0; s < 3 && !eventId; s++) {
    if (s > 0) {
      debug.log('Submit retry', 'warn', `Tentativa ${s + 1}/2`)
      await new Promise(r => setTimeout(r, 3000))
    }
    const submit = await submitToGradio(data, debug)
    if (submit.gradioError && s === 2) {
      return { audioUrl: null, error: submit.gradioError }
    }
    eventId = submit.eventId
  }

  if (!eventId) {
    return { audioUrl: null, error: 'Falha ao enviar job para o Gradio' }
  }

  // SSE Stream - conexao persistente
  const streamResult = await streamSSEForResult(eventId, debug, 180000)

  if (streamResult.audioUrl) {
    return { audioUrl: streamResult.audioUrl, error: '' }
  }

  return { audioUrl: null, error: streamResult.error || 'unknown' }
}

// POST /api/generate - Generate TTS audio
export async function POST(req: NextRequest) {
  const debug = createDebug()

  try {
    const body = await req.json()
    const { variationId, text, language, trackId, trackVolume, speed, numStep, guidanceScale } = body

    // Validate
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto é obrigatório', debug: debug.result() }, { status: 400 })
    }

    if (!variationId) {
      return NextResponse.json({ error: 'Selecione uma variação de voz', debug: debug.result() }, { status: 400 })
    }

    // Get the voice variation
    const variation = await db.voiceVariation.findUnique({
      where: { id: variationId },
      include: { voice: true },
    })

    if (!variation) {
      debug.log('Busca variação', 'error', `ID: ${variationId} não encontrado`)
      return NextResponse.json({ error: 'Variação de voz não encontrada', debug: debug.result() }, { status: 404 })
    }

    debug.log('Variação encontrada', 'ok', `${variation.label} (voz: ${variation.voice.name})`)
    debug.log('Áudio ref', 'info', `serverUrl: ${((variation as Record<string, unknown>).refAudioServerUrl as string) || 'NÃO DEFINIDO'}`)
    debug.log('Texto', 'info', `${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`)

    // Check HF Space status first
    await checkHFStatus(debug)

    // Build instruct
    let instructParts: string[] = []
    if (variation.voice.gender && variation.voice.gender !== 'Auto') instructParts.push(variation.voice.gender.toLowerCase())
    if (variation.voice.age && variation.voice.age !== 'Auto') instructParts.push(variation.voice.age.toLowerCase())
    if (variation.voice.pitch && variation.voice.pitch !== 'Auto') instructParts.push(variation.voice.pitch.toLowerCase())
    if (variation.voice.accent && variation.voice.accent !== 'Auto') instructParts.push(variation.voice.accent.toLowerCase())
    if (variation.instruct && variation.instruct.trim()) instructParts.push(variation.instruct.trim())
    const instructStr = instructParts.join(', ')
    debug.log('Instruct', 'info', instructStr || '(vazio)')
    debug.log('Parâmetros', 'info', `lang: ${language || 'Auto'} | speed: ${speed ?? 1.0} | steps: ${numStep ?? 32} | cfg: ${guidanceScale ?? 2.0}`)

    // Get permanent audio URL
    const serverUrl = (variation as Record<string, unknown>).refAudioServerUrl as string || ''
    const fileName = variation.refAudioName || 'ref_audio.wav'

    if (!serverUrl) {
      return NextResponse.json(
        { error: 'Áudio de referência não disponível. Reenvie o áudio de referência na variação.', debug: debug.result() },
        { status: 400 }
      )
    }

    // Build Gradio params
    const data = [
      text,
      language || 'Auto',
      {} as unknown, // placeholder, preenchido no runGeneration
      '',  // refText: SEMPRE vazio - texto causa alucinacao (fala "to", "ba", outra lingua)
      instructStr,
      numStep ?? 32,
      guidanceScale ?? 2.0,
      true,   // denoise
      speed ?? 1.0,
      null,   // duration
      true,   // preprocess_prompt
      true,   // postprocess_output
    ]

    // =========================================================
    // EXECUTAR COM RETRY (ate 3 tentativas completas)
    // Cada tentativa = upload + submit + SSE stream
    // =========================================================
    const maxRetries = 3
    let voiceAudioUrl: string | null = null
    let lastError = ''

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const waitTime = 5000 * attempt // 5s, 10s
        debug.log('Retry', 'info', `Tentativa ${attempt + 1}/${maxRetries} - aguardando ${waitTime / 1000}s...`)
        await new Promise(r => setTimeout(r, waitTime))
      } else {
        debug.log('Geracao', 'info', 'Iniciando geracao...')
      }

      const result = await runGeneration(data, serverUrl, fileName, debug)

      if (result.audioUrl) {
        voiceAudioUrl = result.audioUrl
        if (attempt > 0) {
          debug.log('Retry', 'ok', `Sucesso na tentativa ${attempt + 1}!`)
        }
        break
      }

      lastError = result.error

      // Erro real (texto, OOM) - nao vale a pena retry
      const retryableErrors = ['null', '404', 'timeout', 'connection_lost', 'Stream ended', 'HTTP 5']
      const shouldRetry = retryableErrors.some(e => lastError.includes(e))

      if (!shouldRetry) {
        debug.log('Retry', 'error', `Erro nao-retriable: ${lastError}`)
        break
      }

      debug.log('Retry', 'warn', `Erro retriable: ${lastError}`)
    }

    if (!voiceAudioUrl) {
      const userMsg = lastError === 'null'
        ? 'Servidor de IA instável (null). Tente novamente em instantes.'
        : lastError === '404'
          ? 'Servidor de IA reiniciou. Tente novamente.'
          : lastError === 'timeout'
            ? 'Tempo limite excedido. O servidor demorou demais para responder.'
            : `Erro na geração: ${lastError}`

      return NextResponse.json({ error: userMsg, debug: debug.result() }, { status: 500 })
    }

    // Download voice audio
    debug.log('Download audio', 'info', 'Baixando audio gerado...')
    const voiceRes = await fetch(voiceAudioUrl)
    if (!voiceRes.ok) {
      debug.log('Download audio', 'error', `HTTP ${voiceRes.status}`)
      return NextResponse.json({ error: 'Falha ao baixar audio gerado', debug: debug.result() }, { status: 502 })
    }
    const voiceBuffer = Buffer.from(await voiceRes.arrayBuffer())
    debug.log('Download audio', 'ok', `${(voiceBuffer.length / 1024).toFixed(1)}KB baixado`)

    const voiceMimeType = voiceAudioUrl.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
    const voiceDataUri = `data:${voiceMimeType};base64,${voiceBuffer.toString('base64')}`

    // Track mixing
    if (trackId) {
      const track = await db.track.findUnique({ where: { id: trackId } })
      debug.log('Track', track?.audioPath ? 'ok' : 'warn', `${track?.name || 'N/A'} | vol: ${trackVolume ?? 0.3}`)

      if (track?.audioPath) {
        debug.log('FINAL', 'ok', 'Retornando voice + track para mix no cliente')
        return NextResponse.json({
          audioUrl: voiceDataUri,
          trackUrl: track.audioPath,
          trackVolume: trackVolume ?? 0.3,
          trackName: track.name,
          mixed: false,
          clientMix: true,
          debug: debug.result(),
        })
      }
    }

    debug.log('FINAL', 'ok', 'Audio pronto sem track')
    return NextResponse.json({
      audioUrl: voiceDataUri,
      mixed: false,
      debug: debug.result(),
    })
  } catch (error) {
    debug.log('EXCEPTION', 'error', error instanceof Error ? `${error.message}\n${error.stack?.substring(0, 300)}` : String(error))
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno do servidor', debug: debug.result() },
      { status: 500 }
    )
  }
}
