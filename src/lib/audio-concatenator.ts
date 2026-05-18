/**
 * Audio Concatenator v2 — Concatena áudios WAV com qualidade profissional
 * 
 * Pipeline de pós-processamento:
 * 1. Trim de silêncio (corta silêncio morto do INÍCIO de cada chunk — preserva final)
 * 2. Normalização de volume (RMS — todas frases no mesmo nível)
 * 3. Silêncio real entre frases (pausas em ms) — PCM puro, sem header
 * 4. Concatenação direta (sem crossfade — preserva vogais finais)
 * 5. Fade-out final (150ms — suave, sem corte abrupto)
 * 
 * Funciona com WAV PCM 16-bit (mono/estéreo).
 * 
 * v2: Trabalho com PCM cru, bounds checking.
 * v3: Trim só no início (preserva vogais finais), crossfade desativado.
 */

// ============================================================
// TIPOS
// ============================================================

export interface AudioChunk {
  buffer: Buffer
  pauseAfterMs: number
}

export interface ConcatenationResult {
  buffer: Buffer
  format: 'wav'
  totalDurationMs: number
  chunkCount: number
  chunksInfo: { index: number; durationMs: number; pauseAfterMs: number }[]
}

export interface ConcatenationConfig {
  crossfadeMs: number      // crossfade entre chunks (0 = sem crossfade)
  trimSilenceMs: number    // trim de silêncio no INÍCIO de cada chunk (preserva final)
  normalizeVolume: boolean // normaliza RMS entre chunks
  fadeOutMs: number        // fade-out final
  targetRmsDb: number      // volume alvo para normalização (-16 dB)
}

const DEFAULT_CONFIG: ConcatenationConfig = {
  crossfadeMs: 0,        // 0 = sem crossfade (preserva vogais finais, evita flanging)
  trimSilenceMs: 80,     // só corta silêncio do INÍCIO (não do final)
  normalizeVolume: true,
  fadeOutMs: 150,        // fade-out final suave (150ms)
  targetRmsDb: -16,
}

// ============================================================
// WAV HELPERS
// ============================================================

interface WavFormat {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
  byteRate: number
  blockAlign: number
  dataSize: number
}

function isWav(buffer: Buffer): boolean {
  if (buffer.length < 44) return false
  return buffer.toString('ascii', 0, 4) === 'RIFF' &&
         buffer.toString('ascii', 8, 12) === 'WAVE'
}

function parseWavHeader(buffer: Buffer): WavFormat | null {
  if (!isWav(buffer)) return null
  return {
    numChannels: buffer.readUInt16LE(22),
    sampleRate: buffer.readUInt32LE(24),
    byteRate: buffer.readUInt32LE(28),
    blockAlign: buffer.readUInt16LE(32),
    bitsPerSample: buffer.readUInt16LE(34),
    dataSize: buffer.readUInt32LE(40),
  }
}

function buildWavHeader(format: WavFormat, dataSize: number): Buffer {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // chunk size
  header.writeUInt16LE(1, 20)  // PCM
  header.writeUInt16LE(format.numChannels, 22)
  header.writeUInt32LE(format.sampleRate, 24)
  header.writeUInt32LE(format.byteRate, 28)
  header.writeUInt16LE(format.blockAlign, 32)
  header.writeUInt16LE(format.bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return header
}

function bytesPerMs(format: WavFormat): number {
  return (format.sampleRate * format.blockAlign) / 1000
}

function msToBytes(ms: number, format: WavFormat): number {
  return Math.round(ms * bytesPerMs(format))
}

/**
 * Retorna o final seguro dos dados PCM em um buffer WAV.
 * Usa Math.min(dataSize, buffer.length - 44) para evitar overflow.
 */
function safeDataEnd(buffer: Buffer, format: WavFormat): number {
  return Math.min(44 + format.dataSize, buffer.length)
}

/** Lê sample 16-bit com bounds checking */
function readSample16(buf: Buffer, pos: number): number {
  if (pos < 0 || pos + 1 >= buf.length) return 0
  return buf.readInt16LE(pos)
}

function writeSample16(buf: Buffer, pos: number, value: number): void {
  if (pos < 0 || pos + 1 >= buf.length) return
  buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(value))), pos)
}

// ============================================================
// TRIM DE SILÊNCIO
// ============================================================

/**
 * Corta silêncio morto do INÍCIO do áudio.
 * NÃO corta o final — preserva a vogal final da frase.
 * O F5-TTS já aplica postprocess_output que corta silêncio do final.
 */
export function trimSilenceStart(wavBuffer: Buffer, trimMs: number): Buffer {
  const format = parseWavHeader(wavBuffer)
  if (!format || format.bitsPerSample !== 16) return wavBuffer

  const threshold = 200
  const maxTrimBytes = msToBytes(trimMs, format)
  const dataStart = 44
  const dataEnd = safeDataEnd(wavBuffer, format)

  // Encontrar início real (primeiro sample acima do threshold)
  let startByte = dataStart
  const startLimit = Math.min(dataStart + maxTrimBytes, dataEnd)
  for (let i = dataStart; i < startLimit; i += format.blockAlign) {
    const sample = Math.abs(readSample16(wavBuffer, i))
    if (sample > threshold) {
      startByte = i
      break
    }
  }

  // Se o início já está ok, retornar original
  if (startByte === dataStart) return wavBuffer

  // Construir novo WAV sem o silêncio do início
  const trimmedSize = dataEnd - startByte
  if (trimmedSize <= 0) return wavBuffer

  const output = Buffer.concat([
    buildWavHeader(format, trimmedSize),
    wavBuffer.subarray(startByte, dataEnd),
  ])

  return output
}

// ============================================================
// NORMALIZAÇÃO DE VOLUME (RMS)
// ============================================================

function calculateRmsDb(wavBuffer: Buffer): number {
  const format = parseWavHeader(wavBuffer)
  if (!format || format.bitsPerSample !== 16) return 0

  const dataStart = 44
  const dataEnd = safeDataEnd(wavBuffer, format)
  let sumSquares = 0
  let count = 0

  for (let i = dataStart; i + 1 < dataEnd; i += 2) {
    const sample = readSample16(wavBuffer, i)
    sumSquares += sample * sample
    count++
  }

  if (count === 0) return -Infinity
  const rms = Math.sqrt(sumSquares / count)
  return 20 * Math.log10(rms / 32768)
}

export function normalizeVolume(wavBuffer: Buffer, targetRmsDb: number = -16): Buffer {
  const format = parseWavHeader(wavBuffer)
  if (!format || format.bitsPerSample !== 16) return wavBuffer

  const currentRmsDb = calculateRmsDb(wavBuffer)
  if (!isFinite(currentRmsDb)) return wavBuffer

  const gainDb = targetRmsDb - currentRmsDb
  const gainLinear = Math.pow(10, gainDb / 20)

  // Limitar ganho para não distorcer
  const clampedGain = Math.min(gainLinear, 2.0)

  if (Math.abs(clampedGain - 1.0) < 0.05) return wavBuffer

  const output = Buffer.from(wavBuffer)
  const dataStart = 44
  const dataEnd = safeDataEnd(wavBuffer, format)

  for (let i = dataStart; i + 1 < dataEnd; i += 2) {
    const sample = readSample16(output, i)
    writeSample16(output, i, sample * clampedGain)
  }

  return output
}

// ============================================================
// EXTRAIR PCM CRU
// ============================================================

/**
 * Extrai dados PCM puros de um buffer WAV (sem header).
 * Retorna Buffer com apenas os samples de áudio.
 */
function extractPcmData(wavBuffer: Buffer): { pcm: Buffer; format: WavFormat } {
  const format = parseWavHeader(wavBuffer)
  if (!format) {
    throw new Error('Buffer não é WAV válido')
  }
  const dataEnd = safeDataEnd(wavBuffer, format)
  const pcm = wavBuffer.subarray(44, dataEnd)
  return { pcm, format }
}

// ============================================================
// CROSSFADE ENTRE CHUNKS (PCM puro)
// ============================================================

/**
 * Aplica crossfade entre o final do PCM A e o início do PCM B.
 * Retorna um novo buffer PCM (sem header) com o mix.
 */
function crossfadePcm(
  pcmA: Buffer, pcmB: Buffer,
  format: WavFormat,
  crossfadeMs: number
): Buffer {
  const crossfadeBytes = msToBytes(crossfadeMs, format)

  if (format.bitsPerSample !== 16 || crossfadeBytes < format.blockAlign || pcmA.length === 0 || pcmB.length === 0) {
    return Buffer.concat([pcmA, pcmB])
  }

  // Limitar crossfade ao menor dos dois lados
  const actualFadeBytes = Math.min(crossfadeBytes, pcmA.length, pcmB.length)

  if (actualFadeBytes < format.blockAlign) {
    return Buffer.concat([pcmA, pcmB])
  }

  const partASize = pcmA.length - actualFadeBytes
  const partBSize = pcmB.length - actualFadeBytes
  const totalSize = partASize + actualFadeBytes + partBSize

  // Alocar buffer final
  const output = Buffer.alloc(totalSize)

  // Copiar parte A (sem final)
  pcmA.copy(output, 0, 0, partASize)

  // Crossfade region — mix de A (fade-out) e B (fade-in)
  for (let i = 0; i < actualFadeBytes; i += format.blockAlign) {
    const progress = i / actualFadeBytes
    const gainA = 1 - progress
    const gainB = progress

    for (let ch = 0; ch < format.numChannels; ch++) {
      const posA = partASize + i + ch * 2
      const posB = i + ch * 2
      const posOut = partASize + i + ch * 2

      const sampleA = (posA + 1 < pcmA.length) ? pcmA.readInt16LE(posA) : 0
      const sampleB = (posB + 1 < pcmB.length) ? pcmB.readInt16LE(posB) : 0
      const mixed = Math.round(sampleA * gainA + sampleB * gainB)

      if (posOut + 1 < output.length) {
        output.writeInt16LE(Math.max(-32768, Math.min(32767, mixed)), posOut)
      }
    }
  }

  // Copiar parte B (sem início)
  pcmB.copy(output, partASize + actualFadeBytes, actualFadeBytes, pcmB.length)

  return output
}

// ============================================================
// FADE-OUT FINAL
// ============================================================

export function applyFadeOut(wavBuffer: Buffer, fadeOutMs: number): Buffer {
  const format = parseWavHeader(wavBuffer)
  if (!format || format.bitsPerSample !== 16) return wavBuffer

  const dataEnd = safeDataEnd(wavBuffer, format)
  const fadeOutBytes = Math.min(msToBytes(fadeOutMs, format), dataEnd - 44)
  if (fadeOutBytes <= 0) return wavBuffer

  const output = Buffer.from(wavBuffer)
  const fadeStart = dataEnd - fadeOutBytes

  for (let i = fadeStart; i + 1 < dataEnd; i += 2) {
    const progress = (i - fadeStart) / fadeOutBytes
    const factor = 1 - progress
    const sample = readSample16(output, i)
    writeSample16(output, i, sample * factor)
  }

  return output
}

// ============================================================
// CONCATENAÇÃO PRINCIPAL (com todo o pipeline)
// ============================================================

/**
 * Concatena múltiplos chunks com qualidade profissional.
 * 
 * v2: Trabalha com PCM cru internamente — sem headers no meio.
 *     Bounds checking em todas as operações de leitura/escrita.
 */
export function concatenateAudioBuffers(
  chunks: AudioChunk[],
  config: Partial<ConcatenationConfig> = {}
): ConcatenationResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (chunks.length === 0) {
    throw new Error('Nenhum chunk de áudio para concatenar')
  }

  // Se só tem 1 chunk, aplicar trim + normalize + fade-out
  if (chunks.length === 1) {
    let buffer = chunks[0].buffer
    if (cfg.trimSilenceMs > 0) buffer = trimSilenceStart(buffer, cfg.trimSilenceMs)
    if (cfg.normalizeVolume) buffer = normalizeVolume(buffer, cfg.targetRmsDb)
    if (cfg.fadeOutMs > 0) buffer = applyFadeOut(buffer, cfg.fadeOutMs)

    const format = parseWavHeader(buffer)!
    const actualDataSize = Math.min(format.dataSize, buffer.length - 44)
    return {
      buffer,
      format: 'wav',
      totalDurationMs: Math.round(actualDataSize / bytesPerMs(format)),
      chunkCount: 1,
      chunksInfo: [{ index: 0, durationMs: Math.round(actualDataSize / bytesPerMs(format)), pauseAfterMs: 0 }],
    }
  }

  // Verificar se todos são WAV
  if (!chunks.every(c => isWav(c.buffer))) {
    throw new Error('Todos os chunks devem ser WAV para concatenacao.')
  }

  const format = parseWavHeader(chunks[0].buffer)!
  const chunksInfo: ConcatenationResult['chunksInfo'] = []

  // Passo 1: Pré-processar cada chunk (trim + normalize) e extrair PCM
  const pcmChunks: Buffer[] = []

  for (let i = 0; i < chunks.length; i++) {
    let buf = chunks[i].buffer

    // Trim silêncio (só início — preserva vogal final)
    if (cfg.trimSilenceMs > 0) {
      buf = trimSilenceStart(buf, cfg.trimSilenceMs)
    }

    // Normalizar volume
    if (cfg.normalizeVolume) {
      buf = normalizeVolume(buf, cfg.targetRmsDb)
    }

    // Extrair PCM cru
    const { pcm } = extractPcmData(buf)
    const durationMs = Math.round(pcm.length / bytesPerMs(format))
    chunksInfo.push({ index: i, durationMs, pauseAfterMs: chunks[i].pauseAfterMs })
    pcmChunks.push(pcm)
  }

  // Passo 2: Concatenar PCM com silêncio + crossfade
  let currentPcm = pcmChunks[0]

  for (let i = 1; i < pcmChunks.length; i++) {
    const prevPauseMs = chunks[i - 1].pauseAfterMs

    if (prevPauseMs > 0) {
      // Inserir silêncio como PCM puro (sem header WAV!)
      const silenceBytes = msToBytes(prevPauseMs, format)
      const silence = Buffer.alloc(silenceBytes, 0) // PCM silêncio = zeros
      currentPcm = Buffer.concat([currentPcm, silence])
    }

    // Crossfade + concatenar próximo chunk
    if (cfg.crossfadeMs > 0) {
      currentPcm = crossfadePcm(currentPcm, pcmChunks[i], format, cfg.crossfadeMs)
    } else {
      currentPcm = Buffer.concat([currentPcm, pcmChunks[i]])
    }
  }

  // Passo 3: Montar WAV final (header + PCM)
  const finalWav = Buffer.concat([
    buildWavHeader(format, currentPcm.length),
    currentPcm,
  ])

  // Passo 4: Fade-out final
  const withFade = cfg.fadeOutMs > 0 ? applyFadeOut(finalWav, cfg.fadeOutMs) : finalWav

  const finalFormat = parseWavHeader(withFade)!
  const actualDataSize = Math.min(finalFormat.dataSize, withFade.length - 44)
  const totalDurationMs = Math.round(actualDataSize / bytesPerMs(finalFormat))

  return {
    buffer: withFade,
    format: 'wav',
    totalDurationMs,
    chunkCount: chunks.length,
    chunksInfo,
  }
}
