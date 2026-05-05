/**
 * TTS Text Preprocessor — Melhora a interpretação de pontuação pelo F5-TTS
 * 
 * O F5-TTS tende a:
 * - Ignorar vírgulas e pontos (fala tudo junto)
 * - Colar a última sílaba de uma palavra com a primeira da próxima
 * - Não fazer pausas entre frases
 * 
 * Este módulo pré-processa o texto ANTES de enviar pro modelo,
 * forçando pausas naturais sem alterar o conteúdo.
 */

// ============================================================
// CONFIGURAÇÃO
// ============================================================

interface PreprocessConfig {
  enabled: boolean           // master switch
  strongPunctuation: boolean // usa ... para pontos (! ? .)
  commaPause: boolean        // adiciona pausa depois de vírgulas
  sentenceBreak: boolean     // quebra frases longas
  maxSentenceLength: number  // max palavras por frase antes de quebrar
  removeDoubleSpaces: boolean
}

const DEFAULT_CONFIG: PreprocessConfig = {
  enabled: true,
  strongPunctuation: true,
  commaPause: true,
  sentenceBreak: true,
  maxSentenceLength: 25,
  removeDoubleSpaces: true,
}

// ============================================================
// PRÉ-PROCESSAMENTO PRINCIPAL
// ============================================================

/**
 * Pré-processa texto para TTS — adiciona pausas e melhora pontuação
 * 
 * Transformações:
 * - "." "!" "?" → " ... " (pausa longa)
 * - "," → " , " (pausa curta com espaço)
 * - ";" ":" → " , " (pausa média)
 * - Frases muito longas → quebra com " ... "
 * - "..." → mantém (já é pausa)
 * - Aspas → mantém
 */
export function preprocessTTS(text: string, config: Partial<PreprocessConfig> = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  
  if (!cfg.enabled) return text

  let result = text
  
  // 1. Preservar reticências (não dobrar)
  // Já tem "..." → mantém como está
  
  // 2. Pontuação forte (. ! ?) → " ..." (força pausa longa)
  if (cfg.strongPunctuation) {
    result = result.replace(/([.!?])\s*/g, ' ... ')
    
    // Mas se já tinha "..." antes da pontuação, limpa
    result = result.replace(/\.{4,}/g, '...')
    result = result.replace(/\.\s*\.\s*\.\s*[.!?]/g, '...')
  }
  
  // 3. Vírgula → " , " (pausa curta)
  if (cfg.commaPause) {
    result = result.replace(/,\s*/g, ' , ')
  }
  
  // 4. Ponto e vírgula / dois pontos → " , " (pausa média)
  result = result.replace(/[;:]\s*/g, ' , ')
  
  // 5. Frases muito longas → quebrar a cada N palavras
  if (cfg.sentenceBreak) {
    result = breakLongSentences(result, cfg.maxSentenceLength)
  }
  
  // 6. Limpar espaços múltiplos (mas preservar espaços antes de pontuação)
  if (cfg.removeDoubleSpaces) {
    result = result.replace(/  +/g, ' ')
  }
  
  // 7. Limpar espaços no inicio/fim
  result = result.trim()
  
  // 8. Remover pontuação solta no final (ex: "texto ... " → "texto ...")
  result = result.replace(/\s+([.,;:!?])\s*$/g, '$1')
  
  return result
}

// ============================================================
// QUEBRA DE FRASES LONGAS
// ============================================================

/**
 * Quebra frases com mais de maxWords palavras.
 * Insere " ... " no ponto mais natural (após vírgula, ou a cada maxWords).
 */
function breakLongSentences(text: string, maxWords: number): string {
  // Divide em segmentos pelas reticências/pausas (não quebra dentro delas)
  const segments = text.split(/(\s*\.{3}\s*)/)
  
  const result = segments.map(segment => {
    // Se é reticência, mantém
    if (/^\s*\.{3}\s*$/.test(segment)) return segment
    
    // Verifica se o segmento é muito longo
    const words = segment.trim().split(/\s+/)
    if (words.length <= maxWords) return segment
    
    // Procura pontos naturais para quebrar (vírgulas, "e", "mas", "porque", etc)
    return breakAtNaturalPoints(words, maxWords)
  })
  
  return result.join('')
}

/**
 * Quebra array de palavras nos pontos naturais de respiração
 */
function breakAtNaturalPoints(words: string[], maxWords: number): string {
  const breakWords = ['e', 'mas', 'porem', 'contudo', 'porque', 'pois', 'portanto', 'alem', 'tambem', 'quando', 'onde', 'como', 'que', 'para', 'com', 'mais', 'nao', 'se', 'ou']
  
  const result: string[] = []
  let count = 0
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i]
    const isBreakPoint = breakWords.includes(word.toLowerCase().replace(/[,;:.!?]/g, ''))
    
    result.push(word)
    count++
    
    // Se atingiu o limite e a próxima palavra é um ponto natural de pausa
    if (count >= maxWords - 3 && i < words.length - 1) {
      const nextWord = words[i + 1].toLowerCase().replace(/[,;:.!?]/g, '')
      
      if (isBreakPoint || breakWords.includes(nextWord)) {
        // Remove pontuação da última palavra e adiciona ...
        const lastIdx = result.length - 1
        const lastWord = result[lastIdx].replace(/[,;:.!?]+$/, '')
        result[lastIdx] = lastWord
        result.push(' ...')
        count = 0
      }
    }
    
    // Hard limit — força quebra
    if (count >= maxWords) {
      const lastIdx = result.length - 1
      const lastWord = result[lastIdx].replace(/[,;:.!?]+$/, '')
      result[lastIdx] = lastWord
      result.push(' ...')
      count = 0
    }
  }
  
  return result.join(' ')
}
