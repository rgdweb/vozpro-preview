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
): Promise<{ audioUrl: string | null; error: string | null; gradioMessage?: string }> {
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
            // Log cru do Gradio pra debug quando falha
            const rawSummary = Array.isArray(resultData)
              ? `[array ${resultData.length} itens] item0=${resultData[0] === null ? 'null' : typeof resultData[0]} item1=${JSON.stringify(resultData[1]).substring(0, 200)}`
              : `${typeof resultData}: ${JSON.stringify(resultData).substring(0, 300)}`
            debug.log('Gradio Raw', 'info', rawSummary)

            if (!Array.isArray(resultData) || resultData.length < 2) {
              debug.log('SSE Stream', 'error', 'Formato inesperado (nao e array ou length < 2)')
              return { audioUrl: null, error: 'Formato inesperado' }
            }
            const audioOutput = resultData[0]
            const gradioMessage = resultData[1] || ''
            let audioUrl: string | null = null
            if (audioOutput?.url) audioUrl = audioOutput.url
            else if (audioOutput?.path) audioUrl = `${tunnelUrl}/gradio_api/file=${audioOutput.path}`
            if (audioUrl) {
              debug.log('SSE Stream', 'ok', `Audio: ${audioUrl.substring(0, 80)}`)
              return { audioUrl, error: null, gradioMessage }
            }
            // Audio null = Gradio nao gerou. gradioMessage tem o motivo real.
            debug.log('SSE Stream', 'error', `Gradio sem audio: ${gradioMessage}`)
            return { audioUrl: null, error: `GPU: ${gradioMessage}`, gradioMessage }
          } catch (parseErr) {
            debug.log('SSE Stream', 'error', `Parse falhou: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} | raw: ${eventData.substring(0, 300)}`)
            return { audioUrl: null, error: 'Parse error' }
          }
        }

        if (eventType === 'error') {
          clearTimeout(timeoutId)
          let errMsg = eventData || 'Erro na geracao'
          // Gradio frequentemente retorna {"error": null} quando é CUDA OOM
          // que o OmniVoice não captura corretamente sem o wrapper omnivoice_gpu.py
          try {
            const parsed = JSON.parse(eventData)
            if (parsed.error === null || parsed.error === undefined) {
              errMsg = 'GPU sem memoria (CUDA OOM) — reinicie o servidor GPU ou use texto menor'
              debug.log('SSE Stream', 'error', `Gradio error nulo detectado -> ${errMsg}`)
            } else if (typeof parsed.error === 'string') {
              errMsg = parsed.error
            }
          } catch {
            // eventData não é JSON, usar como string
          }
          debug.log('SSE Stream', 'error', errMsg.substring(0, 300))
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
    if (err instanceof Error && err.name === 'AbortError') return { audioUrl: null, error: 'timeout' }
    return { audioUrl: null, error: err instanceof Error ? err.message : String(err) }
  }
}

// ============================================================
// GERACAO SINGLE-SHOT (texto inteiro, 1 chamada API)
// ============================================================

interface GenResult {
  buffer: Buffer | null
  failReason: string
}

async function triggerGpuCleanup(tunnelUrl: string, debug: ReturnType<typeof createDebug>): Promise<boolean> {
  try {
    debug.log('GPU Cleanup', 'info', 'Tentando limpar GPU via /api/maint/cleanup...')
    const res = await fetch(`${tunnelUrl}/api/maint/cleanup`, {
      method: 'POST', signal: AbortSignal.timeout(15000)
    })
    if (res.ok) {
      const data = await res.json()
      debug.log('GPU Cleanup', 'ok', `VRAM apos cleanup: ${data.vram_percent}%`)
      return true
    }
    debug.log('GPU Cleanup', 'warn', `Endpoint nao disponivel (wrapper nao carregado) - HTTP ${res.status}`)
    return false
  } catch (err) {
    debug.log('GPU Cleanup', 'warn', err instanceof Error ? err.message : String(err))
    return false
  }
}

async function generateSingleShot(
  tunnelUrl: string,
  text: string,
  gradioData: unknown[],
  debug: ReturnType<typeof createDebug>,
  isRetry = false
): Promise<GenResult> {
  debug.log('Geracao', 'info', `Gerando audio (single-shot${isRetry ? ' RETRY' : ''})...`)

  let eventId: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      debug.log('Submit retry', 'warn', `Tentativa ${attempt + 1}/3`)
      await new Promise(r => setTimeout(r, 3000))
    }
    eventId = await submitJob(tunnelUrl, gradioData, debug)
    if (eventId) break
  }

  if (!eventId) return { buffer: null, failReason: 'Falha ao enviar job para GPU (3 tentativas)' }

  const result = await streamResult(tunnelUrl, eventId, debug, 180000)
  if (!result.audioUrl) {
    // Se foi OOM (error nulo do Gradio), tentar cleanup e retry UMA VEZ
    const isOom = result.error?.includes('CUDA OOM') || result.error?.includes('GPU sem memoria')
    if (isOom && !isRetry) {
      debug.log('Geracao', 'warn', 'CUDA OOM detectado — tentando limpar GPU e gerar de novo...')
      await triggerGpuCleanup(tunnelUrl, debug)
      // Aguardar 5s para GPU liberar
      await new Promise(r => setTimeout(r, 5000))
      return generateSingleShot(tunnelUrl, text, gradioData, debug, true)
    }
    return { buffer: null, failReason: result.error || 'Stream sem resultado' }
  }

  // Delay fixo 10s — dar tempo do Gradio salvar o WAV via tunnel
  await new Promise(r => setTimeout(r, 10000))
  debug.log('Download', 'info', 'Aguardou 10s apos SSE complete')

  const voiceBuffer = await downloadWithRetry(result.audioUrl, 3, 3000)
  if (!voiceBuffer) return { buffer: null, failReason: `Falha ao baixar audio gerado (URL: ${result.audioUrl.substring(0, 80)})` }

  const sr = voiceBuffer.readUInt32LE(24)
  const ch = voiceBuffer.readUInt16LE(22)
  const bps = voiceBuffer.readUInt16LE(34)
  const ds = voiceBuffer.readUInt32LE(40)
  const dur = (ds / ch / Math.floor(bps / 8) / sr).toFixed(1)
  debug.log('Download', 'ok', `${(voiceBuffer.length / 1024).toFixed(1)}KB, ${dur}s`)

  return { buffer: voiceBuffer, failReason: '' }
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
      instruct ?? '',
      numStep ?? 32,
      guidanceScale ?? 2.0,
      true,   // denoise
      speed ?? 1,
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
    let genResult = await generateSingleShot(tunnelUrl, cleanText, gradioBaseData, debug)

    // 6. Verificar resultado + retry automatico com tunnel novo se for 502/timeout
    if (!genResult.buffer) {
      const needsRetry = genResult.failReason.includes('502') || genResult.failReason.includes('timeout') || genResult.failReason.includes('HTTP 5')
      if (needsRetry) {
        debug.log('Pipeline', 'warn', 'Tunnel pode estar stale, buscando novo URL...')
        try {
          const newTunnelUrl = await getTunnelUrl(debug)
          if (newTunnelUrl !== tunnelUrl) {
            debug.log('Pipeline', 'info', `Novo tunnel: ${newTunnelUrl.substring(0, 60)}...`)
            // Re-upload se modo clone
            if (voiceMode === 'clone' && audioBuffer) {
              filePath = await uploadToGradio(newTunnelUrl, audioBuffer, fileName, debug)
              if (!filePath) {
                return NextResponse.json({ error: 'Falha no upload via novo tunnel', debug: debug.result() }, { status: 502 })
              }
              gradioBaseData[2] = filePath ? {
                path: filePath, orig_name: fileName,
                mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
                is_stream: false, meta: { _type: 'gradio.FileData' },
              } : null
            }
            genResult = await generateSingleShot(newTunnelUrl, cleanText, gradioBaseData, debug)
          }
        } catch (retryErr) {
          return NextResponse.json({
            error: `GPU falhou e retry tbm: ${genResult.failReason}. ${retryErr instanceof Error ? retryErr.message : retryErr}`,
            debug: debug.result(),
          }, { status: 500 })
        }
      }
      if (!genResult.buffer) {
        return NextResponse.json({
          error: `GPU nao conseguiu gerar audio: ${genResult.failReason}`,
          debug: debug.result(),
        }, { status: 500 })
      }
    }
    finalBuffer = genResult.buffer

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
