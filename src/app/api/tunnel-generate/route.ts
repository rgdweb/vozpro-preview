import { NextRequest, NextResponse } from 'next/server'
import { validateGeneratedAudio, shouldRetry, formatValidationLog, type ValidationResult } from '@/lib/asr-validator'
import { preprocessTTS } from '@/lib/tts-text-preprocessor'

// POST /api/tunnel-generate - Geracao direta via tunnel cloudflared
// Sem HostGator intermediario - audio vai LIMPO pro GPU local
// Usa os mesmos endpoints Gradio que o /api/generate usa pro HF Space
//
// CAMADA 2: ASR Validator — apos gerar, transcreve e compara com texto original.
// Se detectar alucinacao ("to", "ba", outra lingua), regenera automaticamente.

export const maxDuration = 300

const HOSTGATOR_BASE = 'https://sorteiomax.com.br/omnivoice'

// Configuração do ASR validator
const ASR_MAX_RETRIES = 3  // max regenerações se ASR detectar problema

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
 * Descobre a URL do tunnel cloudflared via HostGator
 */
async function getTunnelUrl(debug: ReturnType<typeof createDebug>): Promise<string> {
  try {
    const res = await fetch(`${HOSTGATOR_BASE}/get_tunnel.php`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'online' || !data.tunnelUrl) {
      throw new Error(data.message || 'GPU offline')
    }
    debug.log('Tunnel URL', 'ok', data.tunnelUrl.substring(0, 60) + '...')
    return data.tunnelUrl
  } catch (err) {
    throw new Error('GPU offline: ' + (err instanceof Error ? err.message : String(err)))
  }
}

/**
 * Faz upload de audio para o Gradio via tunnel
 * Usa /gradio_api/upload (mesmo endpoint que o HF Space usa)
 */
async function uploadToGradio(
  tunnelUrl: string,
  audioBuffer: ArrayBuffer,
  fileName: string,
  debug: ReturnType<typeof createDebug>
): Promise<string | null> {
  try {
    const blob = new Blob([audioBuffer], { type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' })
    const form = new FormData()
    form.append('files', blob, fileName)

    const res = await fetch(`${tunnelUrl}/gradio_api/upload`, {
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
 * Submete job de geracao pro Gradio via tunnel
 * Usa /gradio_api/call/_clone_fn (mesmo que o HF Space)
 */
async function submitJob(
  tunnelUrl: string,
  data: unknown[],
  debug: ReturnType<typeof createDebug>
): Promise<string | null> {
  try {
    const res = await fetch(`${tunnelUrl}/gradio_api/call/_clone_fn`, {
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
 * SSE Stream para receber resultado do Gradio
 */
async function streamResult(
  tunnelUrl: string,
  eventId: string,
  debug: ReturnType<typeof createDebug>,
  timeoutMs = 180000
): Promise<{ audioUrl: string | null; error: string | null }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(
      `${tunnelUrl}/gradio_api/call/_clone_fn/${eventId}`,
      {
        headers: { 'Accept': 'text/event-stream' },
        signal: controller.signal,
      }
    )

    if (response.status === 404) {
      clearTimeout(timeoutId)
      return { audioUrl: null, error: '404' }
    }

    if (!response.ok) {
      clearTimeout(timeoutId)
      return { audioUrl: null, error: `HTTP ${response.status}` }
    }

    debug.log('SSE Stream', 'ok', 'Conexao aberta, aguardando resultado...')

    const reader = response.body?.getReader()
    if (!reader) {
      clearTimeout(timeoutId)
      return { audioUrl: null, error: 'No stream reader' }
    }

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
            if (!Array.isArray(resultData) || resultData.length < 2) {
              return { audioUrl: null, error: 'Formato inesperado' }
            }

            const audioOutput = resultData[0]
            let audioUrl: string | null = null
            if (audioOutput?.url) {
              audioUrl = audioOutput.url
            } else if (audioOutput?.path) {
              audioUrl = `${tunnelUrl}/gradio_api/file=${audioOutput.path}`
            }

            if (audioUrl) {
              debug.log('SSE Stream', 'ok', `Audio: ${audioUrl.substring(0, 80)}`)
              return { audioUrl, error: null }
            }
            return { audioUrl: null, error: 'Sem URL no output' }
          } catch {
            return { audioUrl: null, error: 'Parse error' }
          }
        }

        if (eventType === 'error') {
          clearTimeout(timeoutId)
          const errMsg = eventData || 'Erro na geracao'
          debug.log('SSE Stream', 'error', errMsg.substring(0, 200))
          return { audioUrl: null, error: errMsg }
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
    if (err instanceof Error && err.name === 'AbortError') {
      return { audioUrl: null, error: 'timeout' }
    }
    return { audioUrl: null, error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Gera audio TTS (submit + stream + download) — uma tentativa
 * Retorna o buffer do audio ou null se falhou
 */
async function generateOnce(
  tunnelUrl: string,
  data: unknown[],
  debug: ReturnType<typeof createDebug>
): Promise<{ buffer: Buffer; audioUrl: string; mimeType: string } | null> {
  // Submeter job com retry
  let eventId: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      debug.log('Submit retry', 'warn', `Tentativa ${attempt + 1}/3`)
      await new Promise(r => setTimeout(r, 3000))
    }
    eventId = await submitJob(tunnelUrl, data, debug)
    if (eventId) break
  }

  if (!eventId) return null

  // SSE Stream - receber resultado
  const result = await streamResult(tunnelUrl, eventId, debug, 180000)
  if (!result.audioUrl) return null

  // Baixar audio gerado
  const voiceRes = await fetch(result.audioUrl)
  if (!voiceRes.ok) return null

  const voiceBuffer = Buffer.from(await voiceRes.arrayBuffer())
  const mimeType = result.audioUrl.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
  debug.log('Download', 'ok', `${(voiceBuffer.length / 1024).toFixed(1)}KB`)

  return { buffer: voiceBuffer, audioUrl: result.audioUrl, mimeType }
}

// POST /api/tunnel-generate
export async function POST(req: NextRequest) {
  const debug = createDebug()

  try {
    const body = await req.json()
    const {
      referenceAudioUrl,
      referenceAudioBase64,
      referenceAudioName,
      text,
      language = 'Auto',
      refText = '',  // IGNORADO - sempre vazio para evitar alucinacao
      instruct = null,
      speed = 1,
      numStep = 32,
      guidanceScale = 2.0,
      skipASR = false,  // permite pular ASR se necessario (fallback)
    } = body

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto obrigatório', debug: debug.result() }, { status: 400 })
    }

    // 1. Descobrir tunnel
    debug.log('Tunnel', 'info', 'Descobrindo URL do tunnel...')
    const tunnelUrl = await getTunnelUrl(debug)

    // 2. Obter audio de referencia
    debug.log('Ref Audio', 'info', 'Baixando audio de referencia...')
    let audioBuffer: ArrayBuffer

    if (referenceAudioBase64) {
      const base64Data = referenceAudioBase64.replace(/^data:audio\/\w+;base64,/, '')
      audioBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer
      debug.log('Ref Audio', 'ok', `Base64: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`)
    } else if (referenceAudioUrl) {
      const audioRes = await fetch(referenceAudioUrl)
      if (!audioRes.ok) throw new Error('Falha ao baixar audio de referencia')
      audioBuffer = await audioRes.arrayBuffer()
      debug.log('Ref Audio', 'ok', `Download: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`)
    } else {
      return NextResponse.json({ error: 'Audio de referencia obrigatório', debug: debug.result() }, { status: 400 })
    }

    const fileName = referenceAudioName || 'reference.wav'

    // 3. Upload pro Gradio via tunnel
    debug.log('Upload', 'info', 'Enviando audio pro Gradio...')
    const filePath = await uploadToGradio(tunnelUrl, audioBuffer, fileName, debug)
    if (!filePath) {
      return NextResponse.json({ error: 'Falha no upload do audio', debug: debug.result() }, { status: 502 })
    }

    // 4. Pre-processar texto para TTS (forçar pausas na pontuação)
    const processedText = preprocessTTS(text)
    if (processedText !== text) {
      debug.log('Preprocess', 'info', 'Texto preprocessado para melhor pontuacao')
    }

    // 5. Montar dados do Gradio (mesmo formato que /api/generate usa pro HF Space)
    const gradioData = [
      processedText,  // usa texto preprocessado (com pausas forçadas)
      language,
      {
        path: filePath,
        orig_name: fileName,
        mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
        is_stream: false,
        meta: { _type: 'gradio.FileData' },
      },
      refText,
      instruct || '',
      numStep || 32,
      guidanceScale || 2.0,
      true,   // denoise
      speed || 1,
      null,   // duration
      true,   // preprocess_prompt
      true,   // postprocess_output
    ]

    debug.log('Parametros', 'info', `lang:${language} speed:${speed} steps:${numStep} cfg:${guidanceScale}`)

    // =============================================================
    // 5. GERAR + VALIDAR COM ASR (loop de qualidade)
    // Gera o audio, valida com ASR, se ruim regenera até ASR_MAX_RETRIES
    // Se ASR indisponível, retorna audio sem validação (graceful degradation)
    // =============================================================
    let bestResult: { buffer: Buffer; mimeType: string } | null = null
    let bestValidation: ValidationResult | null = null
    let validationAttempt = 0

    for (validationAttempt = 1; validationAttempt <= ASR_MAX_RETRIES; validationAttempt++) {
      if (validationAttempt > 1) {
        debug.log('ASR Retry', 'warn', `Regenerando (tentativa ${validationAttempt}/${ASR_MAX_RETRIES})...`)
        await new Promise(r => setTimeout(r, 2000)) // pequena pausa entre tentativas
      }

      // 5a. Gerar audio
      debug.log('Geracao', 'info', `Gerando audio (tentativa ${validationAttempt}/${ASR_MAX_RETRIES})...`)
      const generated = await generateOnce(tunnelUrl, gradioData, debug)

      if (!generated) {
        debug.log('Geracao', 'error', 'Falha na geracao')
        continue
      }

      // Sempre guarda o melhor resultado (primeiro que gerou)
      if (!bestResult) {
        bestResult = { buffer: generated.buffer, mimeType: generated.mimeType }
      }

      // 5b. Validar com ASR (se não foi desativado pelo frontend)
      if (skipASR) {
        debug.log('ASR', 'info', 'Validacao ASR desativada pelo frontend')
        bestResult = { buffer: generated.buffer, mimeType: generated.mimeType }
        bestValidation = null
        break
      }

      debug.log('ASR', 'info', 'Validando audio gerado com ASR...')
      const validation = await validateGeneratedAudio(
        new Uint8Array(generated.buffer).buffer as ArrayBuffer,
        text
      )
      debug.log('ASR', validation.valid ? 'ok' : 'warn', formatValidationLog(validation))
      bestValidation = validation

      // Se válido, usa esse audio!
      if (validation.valid) {
        bestResult = { buffer: generated.buffer, mimeType: generated.mimeType }
        break
      }

      // Se inválido, checa se vale retry
      if (!shouldRetry(validation)) {
        const reason = validation.method === 'unavailable'
          ? 'ASR e duracao indisponiveis'
          : 'validacao passou por outro metodo'
        debug.log('ASR', 'info', `Aceitando audio (${reason})`)
        bestResult = { buffer: generated.buffer, mimeType: generated.mimeType }
        bestValidation = validation
        break
      }

      // Inválido e vale retry — continua o loop
      debug.log('ASR', 'warn', `Audio rejeitado, tentando novamente (${validationAttempt}/${ASR_MAX_RETRIES})`)
    }

    // 6. Verificar se conseguiu gerar pelo menos um audio
    if (!bestResult) {
      return NextResponse.json({
        error: 'GPU nao conseguiu gerar audio apos varias tentativas',
        debug: debug.result(),
      }, { status: 500 })
    }

    // 7. Montar resposta
    const voiceDataUri = `data:${bestResult.mimeType};base64,${bestResult.buffer.toString('base64')}`

    const response: Record<string, unknown> = {
      audioUrl: voiceDataUri,
      viaTunnel: true,
      debug: debug.result(),
    }

    // Incluir info da validação ASR no response (útil para debug e UI)
    if (bestValidation) {
      response.asrValidation = {
        valid: bestValidation.valid,
        attempts: validationAttempt,
        method: bestValidation.method,
        transcription: bestValidation.transcription,
        confidence: Math.round(bestValidation.confidence * 100),
        wordCoverage: bestValidation.wordCoverage >= 0 ? Math.round(bestValidation.wordCoverage * 100) : 'N/A',
        issues: bestValidation.issues,
      }
      // Se após todas tentativas ainda tá inválido, adiciona aviso
      if (!bestValidation.valid) {
        response.asrWarning = true
        response.asrMessage = `Audio pode conter imperfeicoes apos ${ASR_MAX_RETRIES} tentativas. Tente outra voz ou texto mais curto.`
      }
    }

    debug.log('FINAL', 'ok', `Total: ${(debug.result().totalDuration / 1000).toFixed(1)}s | ASR tentativas: ${validationAttempt}`)

    return NextResponse.json(response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro interno'
    debug.log('EXCEPTION', 'error', msg)
    return NextResponse.json({ error: msg, debug: debug.result() }, { status: 500 })
  }
}
