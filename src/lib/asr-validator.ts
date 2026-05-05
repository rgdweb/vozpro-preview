/**
 * ASR Validator — Validação inteligente de áudio gerado por TTS
 * 
 * Camada 2 do sistema de qualidade OmniVoice:
 * 1. Prevenção: refText vazio, denoise on, preprocess on (ja implementado)
 * 2. Correção: ASR + filtro inteligente + retry (ESTE MODULO)
 * 3. Fallback: se ASR falhar, usa check de duração como backup
 * 
 * Não altera a geração — só valida o resultado e pede regeneração se necessário.
 */

import ZAI from 'z-ai-web-dev-sdk'

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const ASR_TIMEOUT_MS = 20000        // timeout do ASR (20s)
const MAX_RETRY_ATTEMPTS = 3        // max regenerações por validação
const WORD_COVERAGE_MIN = 0.70       // min 70% das palavras originais devem aparecer
const EXTRA_WORDS_MAX_RATIO = 0.25   // max 25% de palavras extras aceitáveis
const MIN_ORIGINAL_WORDS = 3         // ignora validação se texto tem menos de 3 palavras

// Velocidade de fala típica (palavras por segundo) — usada no check de duração
const WORDS_PER_SECOND_MIN = 2.0     // minimo esperado
const WORDS_PER_SECOND_MAX = 5.5     // maximo esperado

// Palavras lixo que o TTS às vezes alucina (PT-BR)
const JUNK_WORDS = [
  'to', 'toh', 'tô', 'toh',
  'ba', 'bah',
  'ahn', 'ah', 'ahn',
  'eh', 'éh', 'êh',
  'hum', 'hmm', 'hm',
  'oh', 'ô',
  'ih', 'íh',
  'uh', 'úh',
  'ai', 'áí',
  'psiu', 'ps',
]

// ============================================================
// TIPOS
// ============================================================

export interface ValidationResult {
  valid: boolean
  transcription: string
  confidence: number        // 0-1
  issues: string[]          // lista de problemas detectados
  wordCoverage: number      // % das palavras originais que apareceram
  extraWordsRatio: number   // % de palavras extras na transcrição
  method: 'asr' | 'duration' | 'skipped' | 'unavailable'
}

interface ValidationConfig {
  enabled: boolean
  maxRetries: number
  skipShortTexts: boolean
}

// ============================================================
// SDK INSTANCE (singleton)
// ============================================================

let zaiInstance: InstanceType<typeof ZAI> | null = null

async function getZAI(): Promise<InstanceType<typeof ZAI>> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

// ============================================================
// FUNÇÕES DE NORMALIZAÇÃO
// ============================================================

/** Normaliza texto para comparação: lowercase, sem pontuação, sem acentos */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^\w\s]/g, '')          // remove pontuação
    .replace(/\s+/g, ' ')
    .trim()
}

/** Converte texto em array de palavras */
function extractWords(text: string): string[] {
  const normalized = normalizeText(text)
  return normalized.split(' ').filter(w => w.length > 0)
}

/** Remove palavras lixo de um array de palavras */
function removeJunkWords(words: string[]): string[] {
  return words.filter(w => !JUNK_WORDS.includes(w.toLowerCase()))
}

// ============================================================
// CHECK DE DURAÇÃO (backup quando ASR não está disponível)
// ============================================================

/**
 * Estima a duração esperada do áudio com base no número de palavras.
 * Se a duração real for muito maior que o esperado, provavelmente tem alucinação.
 * 
 * WAV: bytes - 44 header / (sampleRate * channels * bytesPerSample)
 * MP3: usa taxa aproximada de ~16KB por segundo a 128kbps
 */
function estimateDurationFromBuffer(audioBuffer: ArrayBuffer): number | null {
  try {
    const bytes = new Uint8Array(audioBuffer)
    
    if (bytes.length < 4) return null
    
    // Verificar se é WAV (header "RIFF")
    const isWav = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    
    if (isWav && bytes.length >= 44) {
      // WAV: ler sample rate do header (bytes 24-27, little-endian)
      const sampleRate = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16) | (bytes[27] << 24)
      const channels = bytes[22] | (bytes[23] << 8)
      const bitsPerSample = bytes[34] | (bytes[35] << 8)
      const bytesPerSample = bitsPerSample / 8
      const dataSize = bytes.length - 44
      
      if (sampleRate > 0 && channels > 0 && bytesPerSample > 0) {
        return dataSize / (sampleRate * channels * bytesPerSample)
      }
    }
    
    // MP3: estimativa grosseira (~16KB/s a 128kbps, ~24KB/s a 192kbps)
    // Assume média de ~20KB por segundo
    return bytes.length / 20000
  } catch {
    return null
  }
}

/**
 * Valida áudio usando apenas análise de duração (sem ASR).
 * Detecta alucinações pelo tamanho do áudio vs número de palavras.
 */
function validateByDuration(audioBuffer: ArrayBuffer, originalText: string): {
  valid: boolean
  issues: string[]
  durationSeconds: number | null
  expectedMin: number
  expectedMax: number
} {
  const wordCount = extractWords(originalText).length
  const duration = estimateDurationFromBuffer(audioBuffer)
  
  // Duração esperada: palavras / velocidade
  const expectedMin = wordCount / WORDS_PER_SECOND_MAX  // fala rápida
  const expectedMax = wordCount / WORDS_PER_SECOND_MIN  // fala lenta
  
  const issues: string[] = []
  
  if (duration === null) {
    return { valid: true, issues: ['Nao foi possivel ler duracao do audio'], duration: null, expectedMin, expectedMax }
  }
  
  // Se o áudio é mais de 40% mais longo que o máximo esperado → alucinação
  const maxAcceptable = expectedMax * 1.4
  if (duration > maxAcceptable) {
    issues.push(`Audio muito longo: ${duration.toFixed(1)}s (esperado max ${expectedMax.toFixed(1)}s para ${wordCount} palavras)`)
  }
  
  // Se o áudio é mais curto que 50% do mínimo → cortou o texto
  const minAcceptable = expectedMin * 0.5
  if (duration < minAcceptable) {
    issues.push(`Audio muito curto: ${duration.toFixed(1)}s (esperado min ${expectedMin.toFixed(1)}s para ${wordCount} palavras)`)
  }
  
  return {
    valid: issues.length === 0,
    issues,
    durationSeconds: duration,
    expectedMin,
    expectedMax,
  }
}

// ============================================================
// COMPARAÇÃO INTELIGENTE (ASR)
// ============================================================

/**
 * Compara a transcrição ASR com o texto original
 */
function compareTexts(originalText: string, transcription: string): {
  wordCoverage: number
  extraWordsRatio: number
  issues: string[]
  junkAtStart: boolean
  junkWords: string[]
} {
  const originalWords = extractWords(originalText)
  const transcribedWords = extractWords(transcription)

  const transcribedClean = removeJunkWords(transcribedWords)
  const junkWordsFound = transcribedWords.filter(w => JUNK_WORDS.includes(w.toLowerCase()))
  
  // Verifica se há palavras lixo no INÍCIO (sinal forte de alucinação)
  let junkAtStart = false
  if (transcribedWords.length > 0 && JUNK_WORDS.includes(transcribedWords[0].toLowerCase())) {
    junkAtStart = true
  }
  if (transcribedWords.length > 1 && JUNK_WORDS.includes(transcribedWords[1].toLowerCase())) {
    junkAtStart = true
  }

  const issues: string[] = []

  if (originalWords.length < MIN_ORIGINAL_WORDS) {
    return { wordCoverage: 1, extraWordsRatio: 0, issues: [], junkAtStart: false, junkWords: [] }
  }

  // 1. Palavras lixo no início
  if (junkAtStart) {
    issues.push(`Palavras lixo no inicio: "${junkWordsFound.slice(0, 3).join(', ')}"`)
  }

  // 2. Qualquer palavra lixo na transcrição
  if (junkWordsFound.length > 0 && !junkAtStart) {
    issues.push(`Palavras lixo detectadas: "${junkWordsFound.join(', ')}"`)
  }

  // 3. Cobertura de palavras
  const transcribedSet = new Set(transcribedClean.map(w => w.toLowerCase()))
  const matchedWords = originalWords.filter(w => transcribedSet.has(w.toLowerCase()))
  const wordCoverage = originalWords.length > 0
    ? matchedWords.length / originalWords.length
    : 0

  if (wordCoverage < WORD_COVERAGE_MIN) {
    issues.push(`Cobertura baixa: ${(wordCoverage * 100).toFixed(0)}% (${matchedWords.length}/${originalWords.length} palavras)`)
  }

  // 4. Palavras extras
  const originalSet = new Set(originalWords.map(w => w.toLowerCase()))
  const extraWords = transcribedClean.filter(w => !originalSet.has(w.toLowerCase()) && !JUNK_WORDS.includes(w.toLowerCase()))
  const extraWordsRatio = transcribedClean.length > 0
    ? extraWords.length / transcribedClean.length
    : 0

  if (extraWordsRatio > EXTRA_WORDS_MAX_RATIO) {
    issues.push(`Muitas palavras extras: ${extraWords.length}`)
  }

  // 5. Idioma diferente
  if (wordCoverage < 0.30) {
    issues.push('Possivel geracao em outro idioma')
  }

  return { wordCoverage, extraWordsRatio, issues, junkAtStart, junkWords: junkWordsFound }
}

// ============================================================
// ASR TRANSCRIPTION
// ============================================================

/**
 * Transcreve audio usando ASR (z-ai-web-dev-sdk)
 */
async function transcribeAudio(audioBuffer: ArrayBuffer): Promise<string | null> {
  try {
    const zai = await getZAI()
    const base64Audio = Buffer.from(audioBuffer).toString('base64')

    console.log('[ASR Validator] Enviando audio para ASR (' + Math.round(audioBuffer.byteLength / 1024) + 'KB)...')
    const response = await zai.audio.asr.create({
      file_base64: base64Audio,
    })

    if (!response?.text || response.text.trim().length === 0) {
      console.log('[ASR Validator] Transcricao vazia')
      return null
    }

    console.log('[ASR Validator] Transcricao recebida:', response.text)
    return response.text
  } catch (err) {
    console.error('[ASR Validator] Falha no ASR:', err instanceof Error ? err.message : String(err))
    return null
  }
}

// ============================================================
// VALIDAÇÃO PRINCIPAL
// ============================================================

/**
 * Valida áudio gerado comparando com o texto original.
 * 
 * Estratégia:
 * 1. Tenta ASR (melhor precisão)
 * 2. Se ASR falhar, usa check de duração (backup)
 * 3. Se ambos falharem, aceita (último recurso)
 */
export async function validateGeneratedAudio(
  audioBuffer: ArrayBuffer,
  originalText: string,
  config: Partial<ValidationConfig> = {}
): Promise<ValidationResult> {
  const cfg: ValidationConfig = {
    enabled: config.enabled ?? true,
    maxRetries: config.maxRetries ?? MAX_RETRY_ATTEMPTS,
    skipShortTexts: config.skipShortTexts ?? true,
  }

  // Texto muito curto — skip
  const words = extractWords(originalText)
  if (cfg.skipShortTexts && words.length < MIN_ORIGINAL_WORDS) {
    return {
      valid: true,
      transcription: '(texto curto)',
      confidence: 1,
      issues: [],
      wordCoverage: 1,
      extraWordsRatio: 0,
      method: 'skipped',
    }
  }

  // ---- TENTA ASR ----
  console.log('[ASR Validator] Iniciando validacao ASR...')
  const transcription = await Promise.race([
    transcribeAudio(audioBuffer),
    new Promise<null>(resolve => setTimeout(() => {
      console.log('[ASR Validator] Timeout do ASR (' + ASR_TIMEOUT_MS + 'ms)')
      resolve(null)
    }, ASR_TIMEOUT_MS)),
  ])

  // Se ASR funcionou, usa resultado
  if (transcription) {
    const comparison = compareTexts(originalText, transcription)

    const isValid = !comparison.junkAtStart
      && comparison.wordCoverage >= WORD_COVERAGE_MIN
      && comparison.extraWordsRatio <= EXTRA_WORDS_MAX_RATIO
      && !comparison.issues.some(i => i.includes('outro idioma'))

    const confidence = Math.min(
      comparison.wordCoverage,
      1 - comparison.extraWordsRatio,
      comparison.junkAtStart ? 0.3 : 1
    )

    console.log('[ASR Validator] Resultado ASR:', isValid ? 'VALIDO' : 'REJEITADO',
      '| cobertura:', Math.round(comparison.wordCoverage * 100) + '%',
      '| lixo:', comparison.junkWords.join(',') || 'nenhum',
      '| transcricao:', '"' + transcription.substring(0, 60) + '"')

    return {
      valid: isValid,
      transcription,
      confidence,
      issues: comparison.issues,
      wordCoverage: comparison.wordCoverage,
      extraWordsRatio: comparison.extraWordsRatio,
      method: 'asr',
    }
  }

  // ---- ASR FALHOU — USA CHECK DE DURAÇÃO COMO BACKUP ----
  console.log('[ASR Validator] ASR indisponivel, usando check de duracao como backup...')
  const durationCheck = validateByDuration(audioBuffer, originalText)

  console.log('[ASR Validator] Resultado duracao:', durationCheck.valid ? 'VALIDO' : 'REJEITADO',
    '| duracao:', durationCheck.durationSeconds?.toFixed(1) + 's',
    '| esperado:', durationCheck.expectedMin.toFixed(1) + '-' + durationCheck.expectedMax.toFixed(1) + 's',
    '| issues:', durationCheck.issues.join('; ') || 'nenhum')

  return {
    valid: durationCheck.valid,
    transcription: '(ASR indisponivel — validado por duracao)',
    confidence: durationCheck.valid ? 0.7 : 0.4,
    issues: [
      'ASR indisponivel (usou check de duracao)',
      ...durationCheck.issues,
    ],
    wordCoverage: -1,  // -1 = não medido por ASR
    extraWordsRatio: -1,
    method: 'duration',
  }
}

/** Verifica se é necessário tentar regenerar */
export function shouldRetry(validation: ValidationResult): boolean {
  if (validation.valid) return false
  // Se foi validado por duração e falhou, vale retry
  if (validation.method === 'duration') return true
  // Se ASR não disponível e duração não detectou problema, não perde tempo
  if (validation.method === 'unavailable') return false
  // Se tem issues, retry
  return validation.issues.length > 0
}

/** Formata resultado da validação para log */
export function formatValidationLog(validation: ValidationResult): string {
  const methodStr = `[${validation.method.toUpperCase()}]`
  if (validation.valid) {
    if (validation.method === 'asr') {
      return `${methodStr} VALIDO — cobertura: ${(validation.wordCoverage * 100).toFixed(0)}%, confianca: ${(validation.confidence * 100).toFixed(0)}%`
    }
    return `${methodStr} VALIDO — confianca: ${(validation.confidence * 100).toFixed(0)}%`
  }
  return `${methodStr} REJEITADO — ${validation.issues.join('; ')} | transcricao: "${validation.transcription.substring(0, 80)}"`
}
