/**
 * 🛡️ BLINDAGEM — ASR Transcriber (REAL)
 * ⚠️ NÃO substitua por stub — este módulo transcreve áudio de referência
 * para preencher refText automaticamente. Sem refText, o F5-TTS não consegue
 * clonar a voz corretamente e gera áudio "falando em línguas".
 * Erro já cometido: asr-transcriber era um stub que retornava ''.
 * Ver BLINDAGEM.md erro #14.
 *
 * Usa z-ai-web-dev-sdk (mesma lib do asr-validator.ts) para transcrever.
 * Suporta:
 *   - transcribeFromUrl(url) → baixa o áudio e transcreve
 *   - transcribeFromBase64(base64) → transcreve base64 direto
 *   - transcribeFromBuffer(buffer) → transcreve ArrayBuffer direto
 */

import ZAI from 'z-ai-web-dev-sdk'

// Singleton SDK instance (mesmo padrão do asr-validate/route.ts)
let zaiInstance: any = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

const ASR_TIMEOUT_MS = 25000 // 25s timeout para transcrição de referência

export interface TranscribeResult {
  text: string
  confidence: number
  success: boolean
  error?: string
}

/**
 * Transcreve áudio a partir de um ArrayBuffer.
 * Usado internamente pelas demais funções.
 */
export async function transcribeFromBuffer(audioBuffer: ArrayBuffer): Promise<TranscribeResult> {
  try {
    const zai = await getZAI()
    const base64Audio = Buffer.from(audioBuffer).toString('base64')

    console.log('[asr-transcriber] Enviando áudio para ASR (' + Math.round(audioBuffer.byteLength / 1024) + 'KB)...')

    const response = await Promise.race([
      zai.audio.asr.create({ file_base64: base64Audio }),
      new Promise<null>(resolve => setTimeout(() => {
        console.log('[asr-transcriber] Timeout ASR (' + ASR_TIMEOUT_MS + 'ms)')
        resolve(null)
      }, ASR_TIMEOUT_MS)),
    ])

    if (!response || !response.text || response.text.trim().length === 0) {
      console.log('[asr-transcriber] Transcrição vazia ou timeout')
      return { text: '', confidence: 0, success: false, error: 'Transcrição vazia ou timeout' }
    }

    const text = response.text.trim()
    console.log('[asr-transcriber] Transcrição recebida:', text.substring(0, 100))
    return { text, confidence: 0.9, success: true }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[asr-transcriber] Falha no ASR:', errMsg)
    return { text: '', confidence: 0, success: false, error: errMsg }
  }
}

/**
 * Transcreve áudio a partir de uma URL (baixa primeiro, depois transcreve).
 * Usado pelo fix-empty-reftext e pelo endpoint de transcrição.
 */
export async function transcribeFromUrl(audioUrl: string): Promise<TranscribeResult> {
  if (!audioUrl || !audioUrl.trim()) {
    return { text: '', confidence: 0, success: false, error: 'URL vazia' }
  }

  try {
    console.log('[asr-transcriber] Baixando áudio de:', audioUrl.substring(0, 80))
    const res = await fetch(audioUrl, { signal: AbortSignal.timeout(15000) })

    if (!res.ok) {
      return { text: '', confidence: 0, success: false, error: `HTTP ${res.status} ao baixar áudio` }
    }

    const arrayBuffer = await res.arrayBuffer()
    if (arrayBuffer.byteLength < 1000) {
      return { text: '', confidence: 0, success: false, error: 'Áudio muito pequeno (< 1KB)' }
    }

    return await transcribeFromBuffer(arrayBuffer)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[asr-transcriber] Erro ao baixar/transcrever de URL:', errMsg)
    return { text: '', confidence: 0, success: false, error: errMsg }
  }
}

/**
 * Transcreve áudio a partir de base64 (com ou sem prefixo data:audio/...).
 * Usado pelo endpoint de transcrição quando o admin envia base64 direto.
 */
export async function transcribeFromBase64(audioBase64: string): Promise<TranscribeResult> {
  if (!audioBase64) {
    return { text: '', confidence: 0, success: false, error: 'Base64 vazio' }
  }

  try {
    // Remover prefixo data:audio/xxx;base64, se existir
    const rawBase64 = audioBase64.includes(',')
      ? audioBase64.split(',')[1]
      : audioBase64

    const buffer = Buffer.from(rawBase64, 'base64')
    return await transcribeFromBuffer(buffer.buffer as ArrayBuffer)
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    console.error('[asr-transcriber] Erro ao decodificar base64:', errMsg)
    return { text: '', confidence: 0, success: false, error: errMsg }
  }
}
