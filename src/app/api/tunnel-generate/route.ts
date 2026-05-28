import { NextRequest, NextResponse } from 'next/server'
import { validateGeneratedAudio, formatValidationLog } from '@/lib/asr-validator'
import { stripSSMLForTTS } from '@/lib/ssml-parser'
import { fixAudioServerUrl } from '@/lib/audio-server'

// POST /api/tunnel-generate - Geracao direta via tunnel cloudflared
// Pipeline completo com prosódia:
//   1. Chunking de texto (divide por pontuação com duração de pausa)
//   2. Gera cada chunk separadamente
//   3. Concatena com silêncio real entre frases
//   4. Valida resultado com ASR (opcional)

export const maxDuration = 300

const ORACLE_BASE = 'http://147.15.77.137'

function createDebug() {
  const steps: { time: string; step: string; status: string; detail?: string; duration?: number }[] = []
  const start = Date.now()
  function log(step: string, status: 'info' | 'ok' | 'warn' | 'error', detail?: string) {
    steps.push({ time: new Date().toISOString().split('T')[1], step, status, detail: detail || '', duration: Date.now() - start })
  }
  function result() { return { totalDuration: Date.now() - start, steps } }
  return { log, result }
}

// ============================================================
// WAV DOWNLOAD COM VALIDAÇÃO
// ============================================================

function isWavComplete(buf: Buffer): boolean {
  if (buf.length < 44) return false
  const declaredDataSize = buf.readUInt32LE(40)
  const actualDataSize = buf.length - 44
  return actualDataSize >= declaredDataSize
}

async function downloadWithRetry(
  url: string,
  maxRetries = 3,
  delayMs = 2000
): Promise<Buffer | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60000) })
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())
      if (isWavComplete(buf)) return buf
      if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs))
    } catch (err) {
      if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return null
}

// ============================================================
// FUNÇÕES AUXILIARES (tunnel, upload, submit, stream)
// ============================================================

async function getTunnelUrl(debug: ReturnType<typeof createDebug>): Promise<string> {
  try {
    const res = await fetch(`${ORACLE_BASE}/get_tunnel.php`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
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
            if (!Array.isArray(resultData) || resultData.length < 2) {
              return { audioUrl: null, error: 'Formato inesperado' }
            }
            const audioOutput = resultData[0]
            let audioUrl: string | null = null
            if (audioOutput?.url) audioUrl = audioOutput.url
            else if (audioOutput?.path) audioUrl = `${tunnelUrl}/gradio_api/file=${audioOutput.path}`
            if (audioUrl) {
              debug.log('SSE Stream', 'ok', `Audio: ${audioUrl.substring(0, 80)}`)
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
// GERACAO SINGLE-SHOT (texto inteiro, 1 chamada API)
// ============================================================

async function generateSingleShot(
  tunnelUrl: string,
  text: string,
  gradioData: unknown[],
  debug: ReturnType<typeof createDebug>
): Promise<Buffer | null> {
  debug.log('Geracao', 'info', 'Gerando audio (single-shot)...')

  let eventId: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      debug.log('Submit retry', 'warn', `Tentativa ${attempt + 1}/3`)
      await new Promise(r => setTimeout(r, 3000))
    }
    eventId = await submitJob(tunnelUrl, gradioData, debug)
    if (eventId) break
  }

  if (!eventId) return null

  const result = await streamResult(tunnelUrl, eventId, debug, 180000)
  if (!result.audioUrl) return null

  // Delay fixo 10s — dar tempo do Gradio salvar o WAV via tunnel
  await new Promise(r => setTimeout(r, 10000))
  debug.log('Download', 'info', 'Aguardou 10s apos SSE complete')

  const voiceBuffer = await downloadWithRetry(result.audioUrl, 3, 3000)
  if (!voiceBuffer) return null

  const sr = voiceBuffer.readUInt32LE(24)
  const ch = voiceBuffer.readUInt16LE(22)
  const bps = voiceBuffer.readUInt16LE(34)
  const ds = voiceBuffer.readUInt32LE(40)
  const dur = (ds / ch / Math.floor(bps / 8) / sr).toFixed(1)
  debug.log('Download', 'ok', `${(voiceBuffer.length / 1024).toFixed(1)}KB, ${dur}s`)

  return voiceBuffer
}

// ============================================================
// POST HANDLER
// ============================================================

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
      skipASR = false,
      voiceMode = 'clone',
    } = body

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto obrigatório', debug: debug.result() }, { status: 400 })
    }

    // DEFESA DUPLA: remover tags SSML que passaram pelo frontend sem processar
    const cleanText = stripSSMLForTTS(text)
    debug.log('SSML Strip', 'info', cleanText !== text ? 'SSML detectado, tags removidas' : 'sem SSML')

    // 1. Descobrir tunnel
    debug.log('Tunnel', 'info', 'Descobrindo URL do tunnel...')
    const tunnelUrl = await getTunnelUrl(debug)

    // 2. Obter audio de referencia (APENAS no modo clone)
    debug.log('Voice Mode', 'info', `Modo: ${voiceMode}`)
    let audioBuffer: ArrayBuffer | null = null
    let fileName = 'reference.wav'
    let filePath: string | null = null

    if (voiceMode === 'clone') {
      debug.log('Ref Audio', 'info', 'Baixando audio de referencia...')
      if (referenceAudioBase64) {
        const base64Data = referenceAudioBase64.replace(/^data:audio\/\w+;base64,/, '')
        audioBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0)).buffer
        debug.log('Ref Audio', 'ok', `Base64: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`)
      } else if (referenceAudioUrl) {
        const fixedUrl = fixAudioServerUrl(referenceAudioUrl)
        debug.log('Ref Audio', 'info', `URL: ${fixedUrl}`)
        const audioRes = await fetch(fixedUrl)
        if (!audioRes.ok) throw new Error(`Falha ao baixar audio de referencia (HTTP ${audioRes.status})`)
        audioBuffer = await audioRes.arrayBuffer()
        debug.log('Ref Audio', 'ok', `Download: ${(audioBuffer.byteLength / 1024).toFixed(1)}KB`)
      } else {
        return NextResponse.json({ error: 'Audio de referencia obrigatório no modo clone', debug: debug.result() }, { status: 400 })
      }

      // Auto-trim: DESATIVADO (22/05/2026)
      // OmniVoice funciona com audio de referencia longo (24s+) sem problemas.
      // O trim brusco sem fade causava alucinacoes ("ba", "to", "sao") e audio 4x mais longo.
      // A GPU RTX 3060 12GB aguenta referencias longas com empty_cache() no omnivoice_gpu.py.
      // if (audioBuffer) {
      //   const trimResult = trimAudioBuffer(audioBuffer, fileName, 12)
      //   ...
      // }

      fileName = referenceAudioName || 'reference.wav'

      // 3. Upload pro Gradio via tunnel (UMA VEZ — referencia compartilhada entre chunks)
      debug.log('Upload', 'info', 'Enviando audio pro Gradio...')
      filePath = await uploadToGradio(tunnelUrl, audioBuffer, fileName, debug)
      if (!filePath) {
        return NextResponse.json({ error: 'Falha no upload do audio', debug: debug.result() }, { status: 502 })
      }
    } else if (voiceMode === 'design') {
      if (!instruct || !instruct.trim()) {
        return NextResponse.json({ error: 'Instruct obrigatório no modo Voice Design (ex: female, low pitch)', debug: debug.result() }, { status: 400 })
      }
      debug.log('Voice Design', 'ok', `Instruct: "${instruct}" (sem audio de referencia)`)
    } else if (voiceMode === 'auto') {
      debug.log('Auto Voice', 'ok', 'Voz automatica — modelo escolhe sozinho')
    }

    // 4. Montar dados BASE do Gradio (texto será substituído por chunk)
    // No modo design/auto, ref_audio é null (vazio)
    const gradioBaseData = [
      cleanText,  // placeholder — será substituído por cada chunk
      language,
      filePath ? {
        path: filePath,
        orig_name: fileName,
        mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
        is_stream: false,
        meta: { _type: 'gradio.FileData' },
      } : null, // null no modo design/auto
      refText,
      instruct || '',
      numStep || 32,
      guidanceScale || 2.0,
      true,   // denoise
      speed || 1,
      null,   // duration
      true,   // preprocess_prompt
      true,   // postprocess_output (NECESSARIO: remove estalinhos/artefatos do audio gerado)
    ]

    debug.log('Parametros', 'info', `lang:${language} speed:${speed} steps:${numStep} cfg:${guidanceScale}`)

    // =============================================================
    // 5. GERAR ÁUDIO (chunking ou single-shot)
    // =============================================================
    let finalBuffer: Buffer | null = null

    // SINGLE-SHOT: manda texto inteiro, 1 chamada API (igual localhost demo)
    debug.log('Pipeline', 'info', `Modo SINGLE-SHOT (${cleanText.length} chars)`)
    finalBuffer = await generateSingleShot(tunnelUrl, cleanText, gradioBaseData, debug)

    // 6. Verificar resultado
    if (!finalBuffer) {
      return NextResponse.json({
        error: 'GPU nao conseguiu gerar audio',
        debug: debug.result(),
      }, { status: 500 })
    }

    // 7. Validação ASR (opcional, no audio final)
    let asrResult = null
    if (!skipASR && finalBuffer) {
      debug.log('ASR', 'info', 'Validando audio final com ASR...')
      asrResult = await validateGeneratedAudio(
        new Uint8Array(finalBuffer).buffer as ArrayBuffer,
        text
      )
      debug.log('ASR', asrResult.valid ? 'ok' : 'warn', formatValidationLog(asrResult))
    }

    // 8. Montar resposta
    const voiceDataUri = `data:audio/wav;base64,${finalBuffer.toString('base64')}`

    const response: Record<string, unknown> = {
      audioUrl: voiceDataUri,
      viaTunnel: true,
      mode: 'single-shot',
      debug: debug.result(),
    }

    // Info do ASR
    if (asrResult) {
      response.asrValidation = {
        valid: asrResult.valid,
        method: asrResult.method,
        transcription: asrResult.transcription,
        confidence: Math.round(asrResult.confidence * 100),
        wordCoverage: asrResult.wordCoverage >= 0 ? Math.round(asrResult.wordCoverage * 100) : 'N/A',
        issues: asrResult.issues,
      }
      if (!asrResult.valid) {
        response.asrWarning = true
        response.asrMessage = 'Audio pode conter imperfeicoes.'
      }
    }

    debug.log('FINAL', 'ok', `Total: ${(debug.result().totalDuration / 1000).toFixed(1)}s | single-shot`)

    return NextResponse.json(response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro interno'
    debug.log('EXCEPTION', 'error', msg)
    return NextResponse.json({ error: msg, debug: debug.result() }, { status: 500 })
  }
}
