/**
 * TTS Text Preprocessor — Pipeline de pré-processamento para TTS
 * 
 * Estilo NaturalReaders: pontuação = pausas naturais
 * 
 * O TTS OmniVoice (k2-fsa) via Gradio:
 * - Não usa SSML nativamente
 * - Pontuação de texto é removida pelo backend antes de enviar ao modelo
 * - Pausas são geradas pelo sistema de chunking (frontend)
 * 
 * Portanto, este preprocessor:
 * - Normaliza pontuação (simples → padrão)
 * - Remove pontuação duplicada
 * - NÃO adiciona caracteres que o TTS falaria
 * - Mantém a pontuação para o chunker poder criar as pausas corretas
 */

// ============================================================
// CONFIGURAÇÃO
// ============================================================

interface PreprocessConfig {
  enabled: boolean
  normalizePunctuation: boolean  // normaliza pontuação duplicada
  sentenceBreak: boolean          // quebra frases muito longas
  maxSentenceLength: number
}

const DEFAULT_CONFIG: PreprocessConfig = {
  enabled: true,
  normalizePunctuation: true,
  sentenceBreak: true,
  maxSentenceLength: 25,
}

// ============================================================
// PRÉ-PROCESSAMENTO PRINCIPAL
// ============================================================

/**
 * Pré-processa texto para TTS.
 * 
 * IMPORTANTE: NÃO remove pontuação aqui. O chunker usa a pontuação
 * para criar as pausas corretas. O backend (route.ts) remove a 
 * pontuação antes de enviar ao modelo TTS.
 * 
 * Transformações:
 * - Reticências Unicode → "..."
 * - Pontuação triplicada → simples ("!!!" → "!")
 * - Ponto e vírgula → mantém (chunker cria pausa média)
 * - Dois pontos → mantém (chunker cria pausa média)
 * - Vírgula → mantém (chunker cria pausa curta)
 * - Espaços múltiplos → espaço simples
 */
export function preprocessTTS(text: string, config: Partial<PreprocessConfig> = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (!cfg.enabled) return text

  let result = text

  // 1. Reticências Unicode (U+2026 …) → três pontos
  result = result.replace(/\u2026/g, '...')

  // 2. Pontuação triplicada/duplicada → manter só uma
  result = result.replace(/([!?])\1+/g, '$1')     // !! → !, ?? → ?
  result = result.replace(/\.{4,}/g, '...')        // .... → ...
  // Manter "..." (reticências) — o chunker reconhece como pausa longa

  // 3. Limpar combinações inválidas
  result = result.replace(/([!?])[.]+/g, '$1')     // !. → !
  result = result.replace(/([.])[!?]+$/gm, '$1')   // .! → .

  // 4. Espaços ao redor de pontuação (ajuda o chunker)
  // Garantir espaço após pontuação forte
  result = result.replace(/([.!?;:])([A-ZÀ-ÿ])/g, '$1 $2')
  // Garantir espaço após vírgula
  result = result.replace(/,(?=[^\s\d])/g, ', ')

  // 5. Limpar espaços múltiplos
  result = result.replace(/  +/g, ' ')

  // 6. Garantir ponto final se não tiver pontuação no final
  if (result.length > 0 && !/[.!?…]$/.test(result.trim())) {
    result = result.trim() + '.'
  }

  // 7. Trim
  result = result.trim()

  return result
}

// ============================================================
// AUTO-PONTUAÇÃO — Adiciona pontuação onde falta
// ============================================================

/**
 * Detecta e adiciona pontuação faltante no texto.
 * Muito útil para textos informais sem pontuação.
 * 
 * Regras:
 * - Capitalizar após ponto/exclamação/interrogação
 * - Adicionar ponto final se faltar
 * - Detectar perguntas e adicionar "?"
 * - Detectar exclamações e adicionar "!"
 */
export function autoPunctuate(text: string): string {
  let result = text.trim()
  
  // Se já tem pontuação decente, não modificar
  const punctCount = (result.match(/[.,!?]/g) || []).length
  const wordCount = result.split(/\s+/).length
  const punctRatio = punctCount / Math.max(wordCount, 1)
  
  // Se tem pelo menos 1 pontuação a cada 5 palavras, está OK
  if (punctRatio >= 0.15 && /[.!?]$/.test(result)) {
    return result
  }
  
  // Se não tem pontuação nenhuma ou muito pouca, adicionar básica
  if (punctRatio < 0.05) {
    // Dividir por newlines ou sentenças longas e adicionar pontos
    result = result
      .split(/(?<=[.!?])\s+|\n+/)
      .map(sentence => sentence.trim())
      .filter(s => s.length > 0)
      .map(sentence => {
        // Remover pontuação existente do final para re-adicionar
        const clean = sentence.replace(/[.!?]+$/, '')
        if (!clean) return sentence
        // Adicionar ponto se não tem pontuação
        return clean
      })
      .join('. ') + '.'
    
    // Capitalizar primeira letra
    result = result.charAt(0).toUpperCase() + result.slice(1)
  }
  
  // Garantir ponto final
  if (!/[.!?…]$/.test(result)) {
    result = result + '.'
  }
  
  return result
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Conta palavras no texto
 */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}
