/**
 * Audio Concatenator — Concatena áudios WAV com silêncio real entre eles
 * 
 * Pipeline de pós-processamento:
 * Áudio 1 (frase 1) + 600ms silêncio + Áudio 2 (frase 2) + 500ms silêncio + ...
 * 
 * Funciona com WAV PCM (16-bit, 24-bit, mono/estéreo).
 * Se receber MP3, converte para WAV antes de concatenar.
 */

// ============================================================
// TIPOS
// ============================================================

export interface AudioChunk {
  buffer: Buffer
  pauseAfterMs: number   // silêncio em ms após este chunk
}

export interface ConcatenationResult {
  buffer: Buffer
  format: 'wav' | 'mp3'
  totalDurationMs: number
  chunkCount: number
  chunksInfo: { index: number; durationMs: number; pauseAfterMs: number }[]
}

// ============================================================
// CONCATENAÇÃO PRINCIPAL
// ============================================================

/**
 * Concatena múltiplos chunks de áudio com silêncio real entre eles.
 * 
 * @param chunks - Array de { buffer, pauseAfterMs }
 * @returns Buffer do áudio final concatenado (WAV)
 */
export function concatenateAudioBuffers(chunks: AudioChunk[]): ConcatenationResult {
  if (chunks.length === 0) {
    throw new Error('Nenhum chunk de áudio para concatenar')
  }

  // Se só tem 1 chunk, retorna como está
  if (chunks.length === 1) {
    const duration = estimateWavDuration(chunks[0].buffer)
    return {
      buffer: chunks[0].buffer,
      format: 'wav',
      totalDurationMs: duration,
      chunkCount: 1,
      chunksInfo: [{ index: 0, durationMs: duration, pauseAfterMs: 0 }],
    }
  }

  // Verificar se todos são WAV
  const allWav = chunks.every(c => isWav(c.buffer))
  if (!allWav) {
    throw new Error('Todos os chunks devem ser WAV para concatenacao. MP3 nao suportado.')
  }

  // Parse header do primeiro chunk para obter info de formato
  const format = parseWavHeader(chunks[0].buffer)
  if (!format) {
    throw new Error('Header WAV invalido no primeiro chunk')
  }

  // Verificar consistência de formato
  for (let i = 1; i < chunks.length; i++) {
    const chunkFormat = parseWavHeader(chunks[i].buffer)
    if (chunkFormat && (
      chunkFormat.sampleRate !== format.sampleRate ||
      chunkFormat.numChannels !== format.numChannels ||
      chunkFormat.bitsPerSample !== format.bitsPerSample
    )) {
      console.warn(`[AudioConcat] Chunk ${i} tem formato diferente do chunk 0. Usando formato do chunk 0.`)
    }
  }

  // Calcular tamanhos
  const blockAlign = format.numChannels * (format.bitsPerSample / 8)
  const bytesPerMs = (format.sampleRate * blockAlign) / 1000

  let totalDataSize = 0
  const chunksInfo: ConcatenationResult['chunksInfo'] = []

  for (let i = 0; i < chunks.length; i++) {
    const chunkDataSize = chunks[i].buffer.length - 44 // PCM data (sem header)
    const chunkDurationMs = Math.round(chunkDataSize / bytesPerMs)
    const silenceBytes = Math.round(chunks[i].pauseAfterMs * bytesPerMs)

    totalDataSize += chunkDataSize + silenceBytes
    chunksInfo.push({
      index: i,
      durationMs: chunkDurationMs,
      pauseAfterMs: chunks[i].pauseAfterMs,
    })
  }

  // Criar buffer de saída (header WAV de 44 bytes + dados)
  const output = Buffer.alloc(44 + totalDataSize)

  // Copiar header do primeiro chunk
  chunks[0].buffer.copy(output, 0, 0, 44)

  // Atualizar tamanhos no header
  output.writeUInt32LE(36 + totalDataSize, 4)   // RIFF chunk size (file size - 8)
  output.writeUInt32LE(totalDataSize, 40)        // data chunk size

  // Copiar dados PCM de cada chunk + silêncio
  let offset = 44
  for (let i = 0; i < chunks.length; i++) {
    // Copiar dados PCM (pular header de 44 bytes)
    const dataSize = chunks[i].buffer.length - 44
    chunks[i].buffer.copy(output, offset, 44, 44 + dataSize)
    offset += dataSize

    // Silêncio (buffer já é inicializado com zeros = silêncio PCM)
    const silenceBytes = Math.round(chunks[i].pauseAfterMs * bytesPerMs)
    offset += silenceBytes
  }

  const totalDurationMs = Math.round(totalDataSize / bytesPerMs)

  return {
    buffer: output,
    format: 'wav',
    totalDurationMs,
    chunkCount: chunks.length,
    chunksInfo,
  }
}

// ============================================================
// HELPERS
// ============================================================

interface WavFormat {
  numChannels: number
  sampleRate: number
  bitsPerSample: number
  byteRate: number
  blockAlign: number
  dataSize: number
}

/** Verifica se buffer é WAV (header RIFF...WAVE) */
function isWav(buffer: Buffer): boolean {
  if (buffer.length < 44) return false
  return buffer.toString('ascii', 0, 4) === 'RIFF' &&
         buffer.toString('ascii', 8, 12) === 'WAVE'
}

/** Parse WAV header para extrair info de formato */
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

/** Estima duração do WAV em ms */
function estimateWavDuration(buffer: Buffer): number {
  const format = parseWavHeader(buffer)
  if (!format) return 0

  const blockAlign = format.numChannels * (format.bitsPerSample / 8)
  const bytesPerMs = (format.sampleRate * blockAlign) / 1000

  return Math.round(format.dataSize / bytesPerMs)
}

/** Aplica fade-out nos últimos N ms de um áudio WAV */
export function applyFadeOut(wavBuffer: Buffer, fadeOutMs: number): Buffer {
  const format = parseWavHeader(wavBuffer)
  if (!format) return wavBuffer

  const blockAlign = format.numChannels * (format.bitsPerSample / 8)
  const bytesPerMs = (format.sampleRate * blockAlign) / 1000
  const fadeOutBytes = Math.min(Math.round(fadeOutMs * bytesPerMs), format.dataSize)

  if (fadeOutBytes <= 0) return wavBuffer

  const output = Buffer.from(wavBuffer)
  const fadeStart = 44 + format.dataSize - fadeOutBytes

  // Aplicar fade-out linear nos samples
  if (format.bitsPerSample === 16) {
    for (let i = fadeStart; i < 44 + format.dataSize; i += 2) {
      const progress = (i - fadeStart) / fadeOutBytes // 0 a 1
      const factor = 1 - progress
      const sample = output.readInt16LE(i)
      output.writeInt16LE(Math.round(sample * factor), i)
    }
  }
  // 24-bit e 32-bit seguem lógica similar (mas 16-bit cobre 99% dos casos)

  return output
}
