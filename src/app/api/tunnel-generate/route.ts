import { NextRequest, NextResponse } from 'next/server'
import { chunkText, chunkByCharLimit, formatChunkSummary, type TextChunk } from '@/lib/tts-chunker'
import { type AudioChunk } from '@/lib/audio-concatenator'
import { validateGeneratedAudio, shouldRetry, formatValidationLog } from '@/lib/asr-validator'
import { stripSSMLForTTS } from '@/lib/ssml-parser'
import { trimAudioBuffer } from '@/lib/audio-trimmer'

// ============================================================
// UTIL: Validar e baixar WAV com retry
// ============================================================

/**
 * Verifica se o buffer WAV está completo (header data size == bytes reais).
 * O Cloudflare Tunnel pode truncar downloads grandes de áudio do Gradio.
 */
function isWavComplete(buf: Buffer): boolean {
  if (buf.length < 44) return false
  const declaredDataSize = buf.readUInt32LE(40)
  const actualDataSize = buf.length - 44
  return actualDataSize >= declaredDataSize
}

/**
 * Baixa audio com retry + validação WAV.
 * Se o download foi truncado (header diz que o arquivo é maior), espera e tenta de novo.
 */
async function downloadWithRetry(
  url: string,
  maxRetries = 3,
  delayMs = 2000
): Promise<Buffer | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url)
      if (!res.ok) return null
      const buf = Buffer.from(await res.arrayBuffer())

      if (isWavComplete(buf)) return buf

      // Arquivo truncado — esperar e retry
      const declared = buf.readUInt32LE(40)
      const actual = buf.length - 44
      console.warn(`[Download] WAV truncado: header diz ${declared} bytes, recebeu ${actual} bytes (faltam ${declared - actual}). Tentativa ${attempt + 1}/${maxRetries}`)
      if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs * (attempt + 1)))
    } catch (err) {
      console.warn(`[Download] Erro na tentativa ${attempt + 1}:`, err)
      if (attempt < maxRetries - 1) await new Promise(r => setTimeout(r, delayMs))
    }
  }
  return null
}


// POST /api/tunnel-generate - Geracao direta via tunnel cloudflared
// Pipeline completo com prosódia:
//   1. Chunking de texto (divide por pontuação com duração de pausa)
//   2. Gera cada chunk separadamente
//   3. Concatena com silêncio real entre frases
//   4. Valida resultado com ASR (opcional)

export const maxDuration = 300

const HOSTGATOR_BASE = 'https://sorteiomax.com.br/omnivoice'

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
// FUNÇÕES AUXILIARES (tunnel, upload, submit, stream)
// ============================================================

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

/**
 * Gera um chunk de texto via Gradio (submit + stream + download)
 */
async function generateChunk(
  tunnelUrl: string,
  chunkText: string,
  gradioBaseData: unknown[],
  debug: ReturnType<typeof createDebug>,
  chunkIndex: number,
  totalChunks: number
): Promise<Buffer | null> {
  // Substituir texto no data array
  const data = [...gradioBaseData]
  data[0] = chunkText  // índice 0 = texto

  debug.log(`Chunk ${chunkIndex + 1}/${totalChunks}`, 'info', `"${chunkText.substring(0, 50)}..." (${chunkText.length} chars)`)

  // Submeter job
  let eventId: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      debug.log(`Chunk ${chunkIndex + 1} retry`, 'warn', `Tentativa ${attempt + 1}/3`)
      await new Promise(r => setTimeout(r, 2000))
    }
    eventId = await submitJob(tunnelUrl, data, debug)
    if (eventId) break
  }

  if (!eventId) {
    debug.log(`Chunk ${chunkIndex + 1}`, 'error', 'Falha ao submeter job')
    return null
  }

  // SSE Stream
  const result = await streamResult(tunnelUrl, eventId, debug, 180000)
  if (!result.audioUrl) {
    debug.log(`Chunk ${chunkIndex + 1}`, 'error', `Falha: ${result.error}`)
    return null
  }

  // Aguardar Gradio salvar o arquivo no disco (igual single-shot)
  // Delay curto para chunks pequenos (< 250 chars o Gradio salva rápido)
  const chunkDelay = Math.min(3000, 1500 + Math.floor(chunkText.length / 200) * 500)
  await new Promise(r => setTimeout(r, chunkDelay))

  // Download com retry
  const voiceBuffer = await downloadWithRetry(result.audioUrl, 3, 1500)
  if (!voiceBuffer) {
    debug.log(`Chunk ${chunkIndex + 1}`, 'error', 'Falha no download apos retry')
    return null
  }

  // Calcular duração do chunk para diagnóstico
  const sr = voiceBuffer.readUInt32LE(24)
  const ch = voiceBuffer.readUInt16LE(22)
  const bps = voiceBuffer.readUInt16LE(34)
  const ds = voiceBuffer.readUInt32LE(40)
  const dur = (ds / ch / Math.floor(bps / 8) / sr).toFixed(1)
  debug.log(`Chunk ${chunkIndex + 1}/${totalChunks}`, 'ok', `${(voiceBuffer.length / 1024).toFixed(1)}KB, ${dur}s, delay ${chunkDelay}ms`)

  // Retornar áudio bruto do chunk — SEM padding individual.
  // O padding no final de cada chunk causa "baixada" perceptível na junção.
  // O postprocess do OmniVoice já gera final limpo. Só padding no áudio final concatenado.
  return voiceBuffer
}

// ============================================================
// WAV HELPERS (splice cru — sem dependência do audio-concatenator)
// ============================================================

interface SimpleWavFormat {
  numChannels: number
  sampleRate: number
  byteRate: number
  blockAlign: number
  bitsPerSample: number
}

function parseWavHeaderSimple(buf: Buffer): SimpleWavFormat {
  return {
    numChannels: buf.readUInt16LE(22),
    sampleRate: buf.readUInt32LE(24),
    byteRate: buf.readUInt32LE(28),
    blockAlign: buf.readUInt16LE(32),
    bitsPerSample: buf.readUInt16LE(34),
  }
}

function buildSimpleWavHeader(fmt: SimpleWavFormat, dataSize: number, pcm: Buffer): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)          // PCM
  header.writeUInt16LE(1, 20)           // PCM format
  header.writeUInt16LE(fmt.numChannels, 22)
  header.writeUInt32LE(fmt.sampleRate, 24)
  header.writeUInt32LE(fmt.byteRate, 28)
  header.writeUInt16LE(fmt.blockAlign, 32)
  header.writeUInt16LE(fmt.bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcm])
}

// ============================================================
// PIPELINE COM CHUNKING — OVERLAP BUFFER
// ============================================================

async function generateWithChunking(
  tunnelUrl: string,
  text: string,
  gradioBaseData: unknown[],
  debug: ReturnType<typeof createDebug>
): Promise<{ finalBuffer: Buffer; chunks: TextChunk[] } | null> {
  // 1. Chunking por limite de caracteres (anti-postprocess)
  const chunks = chunkByCharLimit(text, 250)
  if (chunks.length === 0) return null

  debug.log('Chunking', 'ok', `${chunks.length} chunks (max 250 chars cada)`)
  debug.log('Chunking', 'info', formatChunkSummary(chunks).substring(0, 500))

  // 2. Gerar cada chunk COM BUFFER DE OVERLAP
  // Cada chunk (exceto último) recebe as primeiras 5 palavras do próximo chunk.
  // O postprocess come o buffer ao invés da última palavra real.
  // Depois cortamos o buffer do áudio.
  const OVERLAP_WORDS = 5
  const audioChunks: AudioChunk[] = []
  const overlapMsList: number[] = []
  let failedChunks = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    let textToSend = chunk.text

    if (i < chunks.length - 1) {
      const nextWords = chunks[i + 1].text
        .split(/\s+/).filter(w => w.length > 0)
        .slice(0, OVERLAP_WORDS)
        .join(' ')
      textToSend = chunk.text + ' ' + nextWords
      overlapMsList.push(nextWords.length * 80)
      debug.log(`Chunk ${i + 1}`, 'info', `+buffer: "${nextWords.substring(0, 40)}" (${nextWords.length} chars)`)
    } else {
      overlapMsList.push(0)
    }

    const buffer = await generateChunk(tunnelUrl, textToSend, gradioBaseData, debug, i, chunks.length)

    if (buffer) {
      audioChunks.push({ buffer, pauseAfterMs: chunk.pauseAfterMs })
    } else {
      failedChunks++
      overlapMsList[i] = 0
      debug.log('Chunking', 'warn', `Chunk ${i + 1} falhou, pulando (${failedChunks} falhas)`)
    }
  }

  if (audioChunks.length === 0) {
    debug.log('Chunking', 'error', 'Todos os chunks falharam')
    return null
  }

  if (failedChunks > 0) {
    debug.log('Chunking', 'warn', `${failedChunks}/${chunks.length} chunks falharam, continuando com ${audioChunks.length}`)
  }

  // 3. Concatenação: trim buffer + crossfade 3ms nas junções
  debug.log('Concatenacao', 'info', `Overlap splice: ${audioChunks.length} chunks...`)

  const firstFormat = parseWavHeaderSimple(audioChunks[0].buffer)
  const blockAlign = firstFormat.blockAlign
  const crossfadeSamples = Math.floor(firstFormat.sampleRate * 0.003) // 3ms
  const crossfadeBytes = crossfadeSamples * blockAlign
  const bytesPerMs = firstFormat.sampleRate * firstFormat.numChannels * Math.floor(firstFormat.bitsPerSample / 8) / 1000

  // Extrair PCM e trimar buffer do final
  const pcmList: Buffer[] = []
  for (let i = 0; i < audioChunks.length; i++) {
    const buf = audioChunks[i].buffer
    if (buf.length < 44) continue
    const dataSize = buf.readUInt32LE(40)
    const actualDataEnd = Math.min(44 + dataSize, buf.length)
    let pcm = buf.subarray(44, actualDataEnd)

    const trimMs = overlapMsList[i] || 0
    if (trimMs > 0 && i < chunks.length - 1) {
      // Estimativa do buffer em bytes, menos 200ms de margem de segurança
      const trimBytes = Math.floor(trimMs * bytesPerMs) - Math.floor(200 * bytesPerMs)
      const safeTrim = Math.max(0, trimBytes)
      if (safeTrim > 0 && safeTrim < pcm.length * 0.5) {
        pcm = pcm.subarray(0, pcm.length - safeTrim)
        debug.log(`Chunk ${i + 1}`, 'info', `trim: ${trimMs - 200}ms (${safeTrim} bytes)`)
      }
    }

    pcmList.push(pcm)
  }

  if (pcmList.length === 1) {
    const finalBuffer = buildSimpleWavHeader(firstFormat, pcmList[0].length, pcmList[0])
    return { finalBuffer, chunks }
  }

  // Crossfade 3ms nas junções
  let finalPcm: Buffer = pcmList[0]
  for (let i = 1; i < pcmList.length; i++) {
    const prev = finalPcm
    const next = pcmList[i]

    if (prev.length < crossfadeBytes * 3 || next.length < crossfadeBytes * 3) {
      finalPcm = Buffer.concat([prev, next])
      continue
    }

    const prevTail = prev.subarray(prev.length - crossfadeBytes)
    const nextHead = next.subarray(0, crossfadeBytes)

    const xfade = Buffer.alloc(crossfadeBytes)
    for (let s = 0; s < crossfadeSamples; s++) {
      const t = s / crossfadeSamples
      for (let ch = 0; ch < firstFormat.numChannels; ch++) {
        const off = (s * firstFormat.numChannels + ch) * 2
        xfade.writeInt16LE(
          Math.round(prevTail.readInt16LE(off) * (1 - t) + nextHead.readInt16LE(off) * t),
          off
        )
      }
    }

    finalPcm = Buffer.concat([
      prev.subarray(0, prev.length - crossfadeBytes),
      xfade,
      next.subarray(crossfadeBytes),
    ])
  }

  const finalBuffer = buildSimpleWavHeader(firstFormat, finalPcm.length, finalPcm)

  debug.log('Concatenacao', 'ok',
    `PCM: ${finalPcm.length} bytes, ${pcmList.length} chunks, crossfade 3ms, ${(finalBuffer.length / 1024).toFixed(1)}KB`)

  return { finalBuffer, chunks }
}

// ============================================================
// MODO SINGLE-SHOT (fallback sem chunking)
// ============================================================

interface AudioDiagnostics {
  textLength: number
  audioDurationSec: string
  fileSizeKB: string
  sampleRate: number
  bitsPerSample: number
  channels: number
  delayAfterSse: number
  silencePadSec: number
  expectedMinDuration: string
  durationOk: boolean
  wavHeaderValid: boolean
}

async function generateSingleShot(
  tunnelUrl: string,
  text: string,
  gradioData: unknown[],
  debug: ReturnType<typeof createDebug>
): Promise<{ buffer: Buffer | null; diagnostics: AudioDiagnostics | null }> {
  debug.log('Geracao', 'info', 'Gerando audio (single-shot, sem chunking)...')

  // Submeter job com retry
  let eventId: string | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      debug.log('Submit retry', 'warn', `Tentativa ${attempt + 1}/3`)
      await new Promise(r => setTimeout(r, 3000))
    }
    eventId = await submitJob(tunnelUrl, gradioData, debug)
    if (eventId) break
  }

  if (!eventId) return { buffer: null, diagnostics: null }

  // SSE Stream
  const result = await streamResult(tunnelUrl, eventId, debug, 180000)
  if (!result.audioUrl) return { buffer: null, diagnostics: null }

  // Aguardar Gradio terminar de escrever o arquivo no disco.
  // O evento SSE "complete" dispara quando a GERACAO termina, mas o Gradio
  // ainda pode estar salvando o arquivo WAV. Sem esse delay, o download pode
  // pegar um arquivo incompleto (cortando o final do audio em textos longos).
  // Delay dinamico: texto longo precisa de mais tempo para o Gradio salvar o WAV no disco.
  // OmniVoice com postprocess_output=true pode levar ate 7s para finalizar textos >300 chars.
  const delayMs = Math.min(7000, 2500 + Math.floor(text.length / 150) * 1000)
  await new Promise(r => setTimeout(r, delayMs))
  debug.log('Download', 'info', `Aguardou ${delayMs}ms apos SSE complete (texto: ${text.length} chars)`)

  // Download com retry + validação WAV (tunnel pode truncar arquivos grandes)
  const voiceBuffer = await downloadWithRetry(result.audioUrl, 3, 2000)
  if (!voiceBuffer) {
    debug.log('Download', 'error', 'Falha no download apos 3 tentativas')
    return { buffer: null, diagnostics: null }
  }
  // Log de duração real do áudio baixado para diagnóstico
  const dlSampleRate = voiceBuffer.readUInt32LE(24)
  const dlChannels = voiceBuffer.readUInt16LE(22)
  const dlBits = voiceBuffer.readUInt16LE(34)
  const dlBytesPerSample = Math.floor(dlBits / 8)
  const dlDataSize = voiceBuffer.readUInt32LE(40)
  const dlDuration = (dlDataSize / dlChannels / dlBytesPerSample / dlSampleRate).toFixed(1)
  debug.log('Download', 'ok', `${(voiceBuffer.length / 1024).toFixed(1)}KB (WAV completo, duracao: ${dlDuration}s, ${dlSampleRate}Hz, ${dlBits}bit, ${dlChannels}ch)`)
  // Verificar se a duração parece curta para o tamanho do texto
  const expectedMinDuration = text.length * 0.08 // ~80ms por caractere em português
  if (parseFloat(dlDuration) < expectedMinDuration) {
    debug.log('Download', 'warn', `Duracao suspeita: ${dlDuration}s para ${text.length} chars (esperado >=${expectedMinDuration.toFixed(1)}s). Possivel corte pelo postprocess.`)
  }

  // Adicionar 750ms de silêncio no final do WAV para proteger a última sílaba.
  // O postprocess_output do OmniVoice pode cortar a última sílaba junto com o silêncio.
  // Textos longos (>300 chars) precisam de mais margem — 500ms não era suficiente.
  const paddedBuffer = appendWavSilence(voiceBuffer, 0.75)
  if (paddedBuffer) {
    // Calcular duração real do áudio para diagnóstico
    const sampleRate = paddedBuffer.readUInt32LE(24)
    const channels = paddedBuffer.readUInt16LE(22)
    const bitsPerSample = paddedBuffer.readUInt16LE(34)
    const bytesPerSample = Math.floor(bitsPerSample / 8)
    const dataSize = paddedBuffer.readUInt32LE(40)
    const durationSec = (dataSize / channels / bytesPerSample / sampleRate).toFixed(1)
    debug.log('Silence Pad', 'ok', `+750ms silêncio (${(paddedBuffer.length / 1024).toFixed(1)}KB final, duracao: ${durationSec}s, sampleRate: ${sampleRate}Hz)`)
    const diagnostics: AudioDiagnostics = {
      textLength: text.length,
      audioDurationSec: durationSec,
      fileSizeKB: (paddedBuffer.length / 1024).toFixed(1),
      sampleRate,
      bitsPerSample,
      channels,
      delayAfterSse: delayMs,
      silencePadSec: 0.75,
      expectedMinDuration: expectedMinDuration.toFixed(1),
      durationOk: parseFloat(durationSec) >= expectedMinDuration,
      wavHeaderValid: isWavComplete(paddedBuffer),
    }
    return { buffer: paddedBuffer, diagnostics }
  }

  // SEM pós-processamento. Passa o áudio exatamente como o Gradio/OmniVoice gera.
  // Mesma coisa que ouvir direto no localhost:7860.
  const diagnostics: AudioDiagnostics = {
    textLength: text.length,
    audioDurationSec: dlDuration,
    fileSizeKB: (voiceBuffer.length / 1024).toFixed(1),
    sampleRate: dlSampleRate,
    bitsPerSample: dlBits,
    channels: dlChannels,
    delayAfterSse: delayMs,
    silencePadSec: 0,
    expectedMinDuration: expectedMinDuration.toFixed(1),
    durationOk: parseFloat(dlDuration) >= expectedMinDuration,
    wavHeaderValid: isWavComplete(voiceBuffer),
  }
  return { buffer: voiceBuffer, diagnostics }
}

// ============================================================
// APPEND WAV SILENCE - Adiciona silêncio PCM no final de um WAV
// ============================================================

function appendWavSilence(wavBuffer: Buffer, durationSec: number): Buffer | null {
  if (wavBuffer.length < 44) return null

  // Verificar assinatura RIFF/WAVE
  const riff = wavBuffer.subarray(0, 4).toString('ascii')
  const wave = wavBuffer.subarray(8, 12).toString('ascii')
  if (riff !== 'RIFF' || wave !== 'WAVE') return null

  // Ler parâmetros do WAV header
  const sampleRate = wavBuffer.readUInt32LE(24)
  const bitsPerSample = wavBuffer.readUInt16LE(34)
  const channels = wavBuffer.readUInt16LE(22)
  const bytesPerSample = Math.floor(bitsPerSample / 8)

  // Calcular bytes de silêncio
  const silenceSamples = Math.floor(sampleRate * durationSec)
  const silenceBytes = silenceSamples * channels * bytesPerSample

  // Criar novo buffer: WAV original + zeros + header atualizado
  const newBuffer = Buffer.alloc(wavBuffer.length + silenceBytes)
  wavBuffer.copy(newBuffer)

  // Preencher silêncio (zeros) no final dos dados PCM
  newBuffer.fill(0, wavBuffer.length)

  // Atualizar RIFF ChunkSize (offset 4) = total - 8
  newBuffer.writeUInt32LE(newBuffer.length - 8, 4)

  // Atualizar Subchunk2Size (offset 40) = dados antigos + silêncio
  const oldDataSize = wavBuffer.readUInt32LE(40)
  newBuffer.writeUInt32LE(oldDataSize + silenceBytes, 40)

  return newBuffer
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
      useChunking = false,  // AUTO: chunking ativa automaticamente para texto >280 chars
      voiceMode = 'clone', // 'clone' (ref_audio) | 'design' (instruct only) | 'auto' (nenhum)
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
        const audioRes = await fetch(referenceAudioUrl)
        if (!audioRes.ok) throw new Error('Falha ao baixar audio de referencia')
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
      true,   // postprocess_output (padrao do Gradio — funciona igual localhost:7860)
    ]

    debug.log('Parametros', 'info', `lang:${language} speed:${speed} steps:${numStep} cfg:${guidanceScale} chunking:${useChunking}`)

    // =============================================================
    // 5. GERAR ÁUDIO (chunking ou single-shot)
    // =============================================================
    let finalBuffer: Buffer | null = null
    let chunkInfo: TextChunk[] | null = null
    let audioDiagnostics: AudioDiagnostics | null = null

    // AUTO-CHUNKING para textos longos (>280 chars)
    // Motivação: OmniVoice com postprocess_output=true corta ~29% do áudio para textos >280 chars.
    // Solução: dividir em chunks de ~250 chars (onde postprocess não corta) e concatenar.
    const shouldChunk = cleanText.length > 280 || useChunking
    if (shouldChunk && cleanText.length > 20) {
      debug.log('Pipeline', 'info', `Modo CHUNKING ativo (texto: ${cleanText.length} chars > 280 threshold)`)      
      const chunkResult = await generateWithChunking(tunnelUrl, cleanText, gradioBaseData, debug)
      if (chunkResult) {
        finalBuffer = chunkResult.finalBuffer
        chunkInfo = chunkResult.chunks
        // Diagnóstico para chunking
        const sr = finalBuffer.readUInt32LE(24)
        const ch = finalBuffer.readUInt16LE(22)
        const bps = finalBuffer.readUInt16LE(34)
        const ds = finalBuffer.readUInt32LE(40)
        const dur = (ds / ch / Math.floor(bps / 8) / sr).toFixed(1)
        const expDur = (cleanText.length * 0.08).toFixed(1)
        audioDiagnostics = {
          textLength: cleanText.length,
          audioDurationSec: dur,
          fileSizeKB: (finalBuffer.length / 1024).toFixed(1),
          sampleRate: sr,
          bitsPerSample: bps,
          channels: ch,
          delayAfterSse: 0,
          silencePadSec: 0.5,
          expectedMinDuration: expDur,
          durationOk: parseFloat(dur) >= parseFloat(expDur),
          wavHeaderValid: isWavComplete(finalBuffer),
        }
      } else {
        // Fallback para single-shot se chunking falhar completamente
        debug.log('Pipeline', 'warn', 'Chunking falhou, tentando single-shot como fallback...')
        const ssResult = await generateSingleShot(tunnelUrl, cleanText, gradioBaseData, debug)
        finalBuffer = ssResult.buffer
        audioDiagnostics = ssResult.diagnostics
      }
    } else {
      // MODO SINGLE-SHOT — texto curto (<=280 chars, postprocess não corta)
      debug.log('Pipeline', 'info', `Modo SINGLE-SHOT (texto: ${cleanText.length} chars <= 280)`)
      const ssResult = await generateSingleShot(tunnelUrl, cleanText, gradioBaseData, debug)
      finalBuffer = ssResult.buffer
      audioDiagnostics = ssResult.diagnostics
    }

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
      mode: chunkInfo ? 'chunking' : 'single-shot',
      debug: debug.result(),
      audioDiagnostics,
    }

    // Info do chunking
    if (chunkInfo) {
      response.chunking = {
        totalChunks: chunkInfo.length,
        chunks: chunkInfo.map(c => ({
          text: c.text.substring(0, 50),
          pauseAfterMs: c.pauseAfterMs,
          punctuation: c.punctuation,
        })),
      }
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

    debug.log('FINAL', 'ok', `Total: ${(debug.result().totalDuration / 1000).toFixed(1)}s | modo: ${chunkInfo ? 'chunking' : 'single-shot'}`)

    return NextResponse.json(response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro interno'
    debug.log('EXCEPTION', 'error', msg)
    return NextResponse.json({ error: msg, debug: debug.result() }, { status: 500 })
  }
}
