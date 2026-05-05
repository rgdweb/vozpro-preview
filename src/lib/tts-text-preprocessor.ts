/**
 * TTS Text Preprocessor — Melhora a interpretação de pontuação pelo F5-TTS
 * 
 * O F5-TTS tende a:
 * - Ignorar pontos/vírgulas (fala tudo junto)
 * - Cortar a última palavra da frase (não finaliza direito)
 * - Não fazer pausas entre frases
 * 
 * ATENÇÃO: O modelo LÊ os caracteres literais. Não adicionar "..." porque
 * ele vai TENTAR FALAR "ponto ponto ponto". Em vez disso, usar:
 * - Newlines (\n) entre frases = quebra de sentença natural do modelo
 * - Espaços extras ao redor de pontuação = micro-pausa
 * - Repetir última palavra levemente no final = garante que finalize
 */

// ============================================================
// CONFIGURAÇÃO
// ============================================================

interface PreprocessConfig {
  enabled: boolean
  useNewlines: boolean     // quebra de linha entre frases (pause natural)
  commaSpace: boolean      // espaço extra depois de vírgula
  repeatLastWord: boolean  // repete última palavra com pontuação (evita corte)
  sentenceBreak: boolean   // quebra frases muito longas
  maxSentenceLength: number
}

const DEFAULT_CONFIG: PreprocessConfig = {
  enabled: true,
  useNewlines: true,
  commaSpace: true,
  repeatLastWord: false,   // desativado — soa estranho repetir palavras
  sentenceBreak: true,
  maxSentenceLength: 20,
}

// ============================================================
// PRÉ-PROCESSAMENTO PRINCIPAL
// ============================================================

/**
 * Pré-processa texto para TTS
 * 
 * Transformações:
 * - ". ! ?" → ".\n" (newline = quebra de sentença forte)
 * - "," → ", " (espaço extra = micro-pausa)
 * - ";" ":" → ".\n" (quebra de sentença média)
 * - Frases longas → quebra com newline
 * - NÃO adiciona caracteres faláveis (!!!)
 */
export function preprocessTTS(text: string, config: Partial<PreprocessConfig> = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  if (!cfg.enabled) return text

  let result = text

  // 1. Reticências existentes → newline (são usadas como pausa, converter para quebra)
  result = result.replace(/\.{3,}/g, '.\n')

  // 2. Pontuação forte (. ! ?) → newline (quebra de sentença)
  if (cfg.useNewlines) {
    // Cada pontuação forte vira uma nova linha
    result = result.replace(/([.!?])\s*/g, '$1\n')
  }

  // 3. Vírgula → espaço extra depois (micro-pausa, sem adicionar caracteres)
  if (cfg.commaSpace) {
    result = result.replace(/,\s*/g, ',  ')  // 2 espaços depois de vírgula
  }

  // 4. Ponto e vírgula / dois pontos → newline (pausa média)
  result = result.replace(/[;:]\s*/g, '.\n')

  // 5. Limpar newlines múltiplos
  result = result.replace(/\n{2,}/g, '\n')

  // 6. Limpar espaços múltiplos (dentro de cada linha)
  result = result.split('\n').map(line => line.trim().replace(/  +/g, ' ')).join('\n')

  // 7. Frases muito longas → quebrar com newline
  if (cfg.sentenceBreak) {
    result = breakLongSentences(result, cfg.maxSentenceLength)
  }

  // 8. Repetir última palavra de cada frase (opcional — para vozes que cortam)
  if (cfg.repeatLastWord) {
    result = repeatLastWordOfSentences(result)
  }

  // 9. Limpar linhas vazias
  result = result.split('\n').filter(line => line.trim().length > 0).join('\n')

  // 10. Trim final
  result = result.trim()

  return result
}

// ============================================================
// REPETIR ÚLTIMA PALAVRA (opcional)
// ============================================================

/**
 * Repete a última palavra de cada frase com pontuação.
 * Ex: "Olá, seja bem-vindo à nossa plataforma." 
 * → "Olá, seja bem-vindo à nossa plataforma. plataforma."
 * 
 * Isso faz o modelo articular a última palavra duas vezes,
 * garantindo que ela saia completa na segunda vez.
 */
function repeatLastWordOfSentences(text: string): string {
  return text.split('\n').map(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length < 5) return trimmed

    // Pega a última palavra (sem pontuação)
    const words = trimmed.split(/\s+/)
    const lastWord = words[words.length - 1].replace(/[,;:.!?]+$/, '')
    
    if (lastWord.length < 3) return trimmed // ignora palavras muito curtas

    // Repete a última palavra com ponto
    return trimmed + ' ' + lastWord + '.'
  }).join('\n')
}

// ============================================================
// QUEBRA DE FRASES LONGAS
// ============================================================

function breakLongSentences(text: string, maxWords: number): string {
  return text.split('\n').map(line => {
    const words = line.trim().split(/\s+/)
    if (words.length <= maxWords) return line.trim()

    // Procura ponto natural para quebrar
    return breakAtNaturalPoints(words, maxWords)
  }).join('\n')
}

function breakAtNaturalPoints(words: string[], maxWords: number): string {
  const breakWords = ['e', 'mas', 'porem', 'contudo', 'porque', 'pois', 'portanto', 'alem', 'tambem', 'quando', 'onde', 'como', 'para', 'com', 'mais', 'nao', 'se', 'ou']

  const sentences: string[][] = [[]]
  let currentCount = 0

  for (const word of words) {
    const cleanWord = word.toLowerCase().replace(/[,;:.!?]/g, '')
    const isBreakWord = breakWords.includes(cleanWord)

    sentences[sentences.length - 1].push(word)
    currentCount++

    // Quebra se atingiu o limite e a próxima é ponto natural
    if (currentCount >= maxWords && isBreakWord) {
      sentences.push([])
      currentCount = 0
    }

    // Hard limit
    if (currentCount >= maxWords + 5) {
      sentences.push([])
      currentCount = 0
    }
  }

  return sentences
    .map(s => s.join(' ').trim())
    .filter(s => s.length > 0)
    .join('\n')
}
