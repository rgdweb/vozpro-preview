/**
 * TTS Text Chunker — Divide texto em frases com controle de prosódia
 * 
 * Pipeline obrigatório (não depende do modelo para pausas):
 * 
 * Entrada: "Olá, tudo bem? Hoje é dia especial."
 * ↓
 * Chunk 1: "Olá, tudo bem?" → pausa: 600ms
 * Chunk 2: "Hoje é dia especial." → pausa: 0ms (fim)
 * ↓
 * Cada chunk é gerado separadamente pelo TTS
 * Áudios são concatenados com silêncio real entre eles
 */

// ============================================================
// TIPOS
// ============================================================

export interface TextChunk {
  text: string           // texto da frase
  pauseAfterMs: number   // silêncio REAL em ms após esta frase
  punctuation: string    // pontuação que causou a quebra: '.', '!', '?', ',', ';'
  index: number          // índice do chunk (0-based)
}

// ============================================================
// CONFIGURAÇÃO DE PAUSAS (em milissegundos)
// ============================================================

const PAUSE_DURATION: Record<string, number> = {
  ',': 0,       // vírgula → sem pausa (fluxo natural)
  ';': 180,     // ponto e vírgula → pausa média
  '.': 380,     // ponto final → pausa longa
  '!': 420,     // exclamação → pausa expressiva
  '?': 500,     // interrogação → pausa expressiva
}

const MIN_CHUNK_WORDS = 2    // mínimo de palavras por chunk
const MAX_CHUNK_WORDS = 25   // máximo antes de forçar quebra
const MIN_CHUNK_CHARS = 5    // mínimo de caracteres

// ============================================================
// CHUNKING PRINCIPAL
// ============================================================

/**
 * Divide texto em chunks com controle de prosódia.
 * 
 * Regras:
 * 1. Pontuação forte (. ! ?) → quebra de sentença (pausa longa)
 * 2. Ponto e vírgula (;) → quebra média
 * 3. Vírgula (,) → quebra curta (só se chunk ficar >= MIN_CHUNK_WORDS)
 * 4. Frases muito longas (>25 palavras) → quebra forçada
 * 5. Frases muito curtas → mescla com a próxima
 */
export function chunkText(text: string): TextChunk[] {
  if (!text || !text.trim()) return []

  // Normalizar whitespace
  let normalized = text.replace(/\s+/g, ' ').trim()

  // Se o texto já tem newlines, usar como quebras primárias
  if (normalized.includes('\n')) {
    return chunkByNewlines(normalized)
  }

  // Passo 1: Inserir marcadores de quebra na pontuação
  // Cada pontuação vira: PONTUAÇÃO | SEPARADOR | texto seguinte
  const marked = insertBreakMarkers(normalized)

  // Passo 2: Dividir pelos marcadores
  const rawChunks = splitByMarkers(marked)

  // Passo 3: Atribuir pausas e limpar
  const withPauses = rawChunks.map((chunk, i) => ({
    text: chunk.text.trim(),
    pauseAfterMs: PAUSE_DURATION[chunk.punctuation] || 500,
    punctuation: chunk.punctuation,
    index: i,
  }))

  // Passo 4: Mesclar chunks muito curtos
  const merged = mergeShortChunks(withPauses)

  // Passo 5: Quebrar chunks muito longos
  const split = splitLongChunks(merged)

  // Passo 6: Limpar chunks vazios
  return split.filter(c => c.text.length >= MIN_CHUNK_CHARS)
}

// ============================================================
// PASSO 1: INSERIR MARCADORES
// ============================================================

/**
 * Substitui pontuação por marcadores especiais para facilitar o split.
 * 
 * "Olá, tudo bem? Hoje." → "Olá¶,¶ tudo bem¶?¶ Hoje¶.¶"
 * 
 * ¶ é usado como separador (caractere pouco provável no texto normal)
 */
function insertBreakMarkers(text: string): string {
  let result = text

  // Preservar reticências — converter para ponto único
  result = result.replace(/\.{3,}/g, '...BREAKER...')
  result = result.replace(/\.\.\.BREAKER\.\.\./g, '.')

  // Pontuação forte → marcador
  result = result.replace(/([.!?])\s+/g, '$1¶¶¶')

  // Vírgula → marcador (vírgula pode ter espaço antes/depis)
  result = result.replace(/,\s*/g, ',¶¶¶')

  // Ponto e vírgula → marcador
  result = result.replace(/;\s*/g, ';¶¶¶')

  // Dois pontos → marcador
  result = result.replace(/:\s*/g, ';¶¶¶') // trata como ponto e vírgula

  // Limpar parênteses e aspas soltas
  result = result.replace(/[()""'']/g, '')

  return result
}

// ============================================================
// PASSO 2: SPLIT POR MARCADORES
// ============================================================

interface RawChunk {
  text: string
  punctuation: string
}

function splitByMarkers(markedText: string): RawChunk[] {
  const parts = markedText.split(/¶¶¶/)
  const chunks: RawChunk[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue

    // Verificar se termina com pontuação
    const punctuationMatch = trimmed.match(/([.!?;,])$/)
    const punctuation = punctuationMatch ? punctuationMatch[1] : '.'
    const text = punctuationMatch ? trimmed.slice(0, -1).trim() : trimmed

    if (text) {
      chunks.push({ text, punctuation })
    }
  }

  return chunks
}

// ============================================================
// PASSO 3 (inline): atribuição de pausas
// já feito no chunkText principal
// ============================================================

// ============================================================
// PASSO 4: MESCLAR CHUNKS CURTOS
// ============================================================

/**
 * Mescla chunks com menos de MIN_CHUNK_WORDS palavras com o próximo.
 * Evita chunks como "sim." ou "não," que geram áudio muito curto.
 */
function mergeShortChunks(chunks: TextChunk[]): TextChunk[] {
  if (chunks.length <= 1) return chunks

  const result: TextChunk[] = []
  let i = 0

  while (i < chunks.length) {
    const current = chunks[i]
    const wordCount = current.text.split(/\s+/).filter(w => w.length > 0).length

    // Se o chunk é curto E não é o último, mescla com o próximo
    if (wordCount < MIN_CHUNK_WORDS && i < chunks.length - 1) {
      const next = chunks[i + 1]
      result.push({
        text: current.text + (current.punctuation === ',' ? ',' : '') + ' ' + next.text,
        pauseAfterMs: next.pauseAfterMs,  // usa a pausa do MAIOR chunk
        punctuation: next.punctuation,
        index: result.length,
      })
      i += 2 // pula o próximo (já foi mesclado)
    } else {
      result.push({ ...current, index: result.length })
      i++
    }
  }

  return result
}

// ============================================================
// PASSO 5: QUEBRAR CHUNKS LONGOS
// ============================================================

/**
 * Quebra chunks com mais de MAX_CHUNK_WORDS palavras.
 * Procura vírgulas ou conjunções como ponto natural de quebra.
 */
function splitLongChunks(chunks: TextChunk[]): TextChunk[] {
  const result: TextChunk[] = []

  for (const chunk of chunks) {
    const words = chunk.text.split(/\s+/).filter(w => w.length > 0)

    if (words.length <= MAX_CHUNK_WORDS) {
      result.push(chunk)
      continue
    }

    // Procura ponto natural de quebra
    const breakWords = ['e', 'mas', 'porem', 'contudo', 'porque', 'pois', 'portanto',
      'alem', 'tambem', 'quando', 'onde', 'como', 'para', 'com', 'mais', 'nao',
      'se', 'ou', 'alem', 'ento', 'essa', 'esse', 'esta']

    const subChunks: string[][] = [[]]
    let wordCount = 0

    for (let w = 0; w < words.length; w++) {
      const cleanWord = words[w].toLowerCase().replace(/[,;:.!?]/g, '')
      subChunks[subChunks.length - 1].push(words[w])
      wordCount++

      // Quebra em conjunção dentro do limite
      if (wordCount >= Math.floor(MAX_CHUNK_WORDS / 2) && breakWords.includes(cleanWord)) {
        subChunks.push([])
        wordCount = 0
      }

      // Hard limit
      if (wordCount >= MAX_CHUNK_WORDS) {
        subChunks.push([])
        wordCount = 0
      }
    }

    // Criar TextChunks a partir das sub-partes
    for (let s = 0; s < subChunks.length; s++) {
      const subText = subChunks[s].join(' ').trim()
      if (!subText) continue

      const isLast = s === subChunks.length - 1
      result.push({
        text: subText,
        pauseAfterMs: isLast ? chunk.pauseAfterMs : 300, // pausa média entre sub-chunks
        punctuation: isLast ? chunk.punctuation : ',',
        index: result.length,
      })
    }
  }

  return result
}

// ============================================================
// CHUNKING POR NEWLINES (texto já formatado)
// ============================================================

/**
 * Se o texto já tem newlines, usa como quebras primárias.
 * Cada linha vira um chunk com pausa padrão.
 */
function chunkByNewlines(text: string): TextChunk[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0)

  return lines.map((line, i) => {
    const trimmed = line.trim()

    // Detectar pontuação final
    const punctMatch = trimmed.match(/([.!?])\s*$/)
    const punctuation = punctMatch ? punctMatch[1] : '.'
    const cleanText = punctMatch ? trimmed.slice(0, -1).trim() : trimmed

    return {
      text: cleanText || trimmed,
      pauseAfterMs: i < lines.length - 1
        ? (PAUSE_DURATION[punctuation] || 500)
        : 0, // último chunk sem pausa
      punctuation,
      index: i,
    }
  })
}

// ============================================================
// HELPERS
// ============================================================

/** Resumo dos chunks para debug */
export function formatChunkSummary(chunks: TextChunk[]): string {
  return chunks.map((c, i) =>
    `[${i + 1}/${chunks.length}] "${c.text.substring(0, 40)}${c.text.length > 40 ? '...' : ''}" → ${c.pauseAfterMs}ms (${c.punctuation})`
  ).join('\n')
}
