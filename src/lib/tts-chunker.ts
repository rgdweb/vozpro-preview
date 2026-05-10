/**
 * TTS Text Chunker — Divide texto em frases com controle de prosódia
 * Estilo NaturalReaders: pontuação = pausas reais
 * 
 * Pipeline obrigatório (não depende do modelo para pausas):
 * 
 * Entrada: "Olá, tudo bem? Hoje é dia especial."
 * ↓
 * Chunk 1: "Olá" → pausa: 180ms (vírgula)
 * Chunk 2: "tudo bem" → pausa: 500ms (interrogação)
 * Chunk 3: "Hoje é dia especial" → pausa: 0ms (fim)
 * ↓
 * Cada chunk é gerado separadamente pelo TTS
 * Áudios são concatenados com silêncio real entre eles
 * 
 * PRINCÍPIO: NENHUMA pontuação chega ao TTS.
 * Toda pontuação é convertida em pausas reais (silêncio).
 */

// ============================================================
// TIPOS
// ============================================================

export interface TextChunk {
  text: string           // texto limpo SEM pontuação
  pauseAfterMs: number   // silêncio REAL em ms após esta frase
  punctuation: string    // pontuação original que causou a quebra: '.', '!', '?', ',', ';'
  index: number          // índice do chunk (0-based)
}

// ============================================================
// CONFIGURAÇÃO DE PAUSAS (em milissegundos) — Estilo NaturalReaders
// ============================================================

const PAUSE_DURATION: Record<string, number> = {
  ',': 180,     // vírgula → micro-pausa natural (NaturalReaders: ~150-200ms)
  ';': 280,     // ponto e vírgula → pausa média
  ':': 280,     // dois pontos → pausa média (equivalente a ponto e vírgula)
  '.': 400,     // ponto final → pausa longa (NaturalReaders: ~350-450ms)
  '!': 450,     // exclamação → pausa expressiva
  '?': 500,     // interrogação → pausa expressiva
  '...': 600,   // reticências → pausa alongada
}

const MIN_CHUNK_CHARS = 3    // mínimo de caracteres por chunk
const MAX_CHUNK_WORDS = 20   // máximo antes de forçar quebra

// ============================================================
// CHUNKING PRINCIPAL
// ============================================================

/**
 * Divide texto em chunks com controle de prosódia.
 * Estilo NaturalReaders: cada pontuação vira uma pausa real.
 * 
 * Regras:
 * 1. Vírgula (,) → quebra com pausa curta (180ms)
 * 2. Ponto e vírgula (;) / dois pontos (:) → quebra com pausa média (280ms)
 * 3. Ponto final (.) → quebra com pausa longa (400ms)
 * 4. Exclamação (!) / interrogação (?) → pausa expressiva (450-500ms)
 * 5. Reticências (...) → pausa alongada (600ms)
 * 6. Frases muito longas (>20 palavras) → quebra forçada
 * 7. Frases muito curtas (< 3 chars) → mescla com a próxima
 */
export function chunkText(text: string): TextChunk[] {
  if (!text || !text.trim()) return []

  // Normalizar whitespace
  let normalized = text.replace(/\s+/g, ' ').trim()

  // Se o texto já tem newlines, usar como quebras primárias
  if (normalized.includes('\n')) {
    const newlineChunks = chunkByNewlines(normalized)
    // Mas ainda processar cada linha para vírgulas internas
    return expandChunksWithCommas(newlineChunks)
  }

  // Passo 1: Identificar TODOS os pontos de quebra (incluindo vírgulas)
  const breakPoints = findBreakPoints(normalized)

  // Passo 2: Dividir texto nos pontos de quebra
  const rawChunks = splitAtBreakPoints(normalized, breakPoints)

  // Passo 3: Mesclar chunks muito curtos
  const merged = mergeShortChunks(rawChunks)

  // Passo 4: Quebrar chunks muito longos
  const split = splitLongChunks(merged)

  // Passo 5: Limpar chunks vazios e muito curtos
  return split.filter(c => c.text.length >= MIN_CHUNK_CHARS)
}

// ============================================================
// PASSO 1: ENCONTRAR PONTOS DE QUEBRA
// ============================================================

interface BreakPoint {
  index: number        // posição no texto
  punctuation: string  // tipo de pontuação
  length: number       // tamanho do marcador (1 para '.', 3 para '...')
}

/**
 * Encontra todos os pontos de quebra no texto.
 * Agora INCLUI vírgulas como pontos de quebra (estilo NaturalReaders).
 */
function findBreakPoints(text: string): BreakPoint[] {
  const breaks: BreakPoint[] = []
  
  let i = 0
  while (i < text.length) {
    const char = text[i]
    
    // Reticências (... ou …)
    if (char === '.' && text[i + 1] === '.' && text[i + 2] === '.') {
      breaks.push({ index: i, punctuation: '...', length: 3 })
      i += 3
      continue
    }
    
    // Reticência unicode (U+2026)
    if (char === '\u2026') {
      breaks.push({ index: i, punctuation: '...', length: 1 })
      i += 1
      continue
    }
    
    // Pontuação forte (. ! ?) → quebra de sentença
    if (char === '.' || char === '!' || char === '?') {
      // Ignorar pontos que são parte de abreviações ou números
      const nextChar = text[i + 1] || ''
      const prevChar = text[i - 1] || ''
      
      // Ponto seguido de espaço ou fim = fim de frase
      // Ponto seguido de letra = abreviação (não quebrar)
      if (char === '.' && /[a-zA-ZÀ-ÿ]/.test(nextChar) && /[a-zA-ZÀ-ÿ]/.test(prevChar)) {
        i++
        continue
      }
      
      // Ponto como parte de número decimal (3.14) — não quebrar
      if (char === '.' && /\d/.test(prevChar) && /\d/.test(nextChar)) {
        i++
        continue
      }
      
      breaks.push({ index: i, punctuation: char, length: 1 })
      i++
      continue
    }
    
    // Vírgula → quebra com pausa curta (NOVA: agora respeita vírgulas!)
    if (char === ',') {
      // Ignorar vírgulas dentro de números (1.000,50)
      const nextChar = text[i + 1] || ''
      if (/\d/.test(nextChar)) {
        i++
        continue
      }
      breaks.push({ index: i, punctuation: ',', length: 1 })
      i++
      continue
    }
    
    // Ponto e vírgula / dois pontos → quebra média
    if (char === ';' || char === ':') {
      breaks.push({ index: i, punctuation: char, length: 1 })
      i++
      continue
    }
    
    i++
  }
  
  return breaks
}

// ============================================================
// PASSO 2: DIVIDIR NOS PONTOS DE QUEBRA
// ============================================================

function splitAtBreakPoints(text: string, breakPoints: BreakPoint[]): TextChunk[] {
  if (breakPoints.length === 0) {
    return [{ text: text.trim(), pauseAfterMs: 0, punctuation: '.', index: 0 }]
  }
  
  const chunks: TextChunk[] = []
  let lastIndex = 0
  
  for (let i = 0; i < breakPoints.length; i++) {
    const bp = breakPoints[i]
    const textBefore = text.substring(lastIndex, bp.index).trim()
    const isLast = i === breakPoints.length - 1
    
    if (textBefore) {
      chunks.push({
        text: textBefore,
        pauseAfterMs: isLast ? 0 : (PAUSE_DURATION[bp.punctuation] || 300),
        punctuation: bp.punctuation,
        index: chunks.length,
      })
    }
    
    lastIndex = bp.index + bp.length
  }
  
  // Texto após último ponto de quebra
  const remaining = text.substring(lastIndex).trim()
  if (remaining) {
    chunks.push({
      text: remaining,
      pauseAfterMs: 0,
      punctuation: '.',
      index: chunks.length,
    })
  }
  
  return chunks
}

// ============================================================
// PASSO 3: MESCLAR CHUNKS MUITO CURTOS
// ============================================================

/**
 * Mescla chunks muito curtos com o próximo.
 * Evita chunks como "sim" ou "não" que geram áudio muito curto/artificial.
 * Mas NÃO mescla se a pausa for forte (. ! ?) — preserva parada natural.
 */
function mergeShortChunks(chunks: TextChunk[]): TextChunk[] {
  if (chunks.length <= 1) return chunks

  const result: TextChunk[] = []
  let i = 0

  while (i < chunks.length) {
    const current = chunks[i]
    const wordCount = current.text.split(/\s+/).filter(w => w.length > 0).length

    // Só mescla se:
    // 1. Chunk é curto (< 3 palavras E < 15 chars)
    // 2. Não é o último chunk
    // 3. A pontuação não é forte (. ! ?) — vírgula e ; podem mesclar
    const isWeakPunct = current.punctuation === ',' || current.punctuation === ';'
    const isShort = (wordCount < 3 && current.text.length < 15) || current.text.length < MIN_CHUNK_CHARS

    if (isShort && isWeakPunct && i < chunks.length - 1) {
      const next = chunks[i + 1]
      result.push({
        text: current.text + ' ' + next.text,
        pauseAfterMs: next.pauseAfterMs,  // usa a pausa do PRÓXIMO chunk
        punctuation: next.punctuation,     // usa a pontuação do PRÓXIMO
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
// PASSO 4: QUEBRAR CHUNKS LONGOS
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
      'se', 'ou', 'essa', 'esse', 'esta', 'este', 'que', 'num', 'uma']

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
        pauseAfterMs: isLast ? chunk.pauseAfterMs : 200, // pausa curta entre sub-chunks
        punctuation: isLast ? chunk.punctuation : ',',
        index: result.length,
      })
    }
  }

  return result
}

// ============================================================
// EXPANDIR CHUNKS COM VÍRGULAS INTERNAS
// ============================================================

/**
 * Para chunks que vieram de newline splitting, expandir vírgulas internas.
 * Transforma: "Olá, tudo bem, como vai?" em 3 chunks separados.
 */
function expandChunksWithCommas(chunks: TextChunk[]): TextChunk[] {
  const expanded: TextChunk[] = []

  for (const chunk of chunks) {
    // Verificar se tem vírgulas, ponto-e-vírgula ou dois pontos
    const hasCommas = /[;,]/.test(chunk.text)
    
    if (!hasCommas || chunk.text.length < 10) {
      expanded.push(chunk)
      continue
    }

    // Encontrar pontos de vírgula/vírgula para quebrar
    const commaBreaks: BreakPoint[] = []
    for (let i = 0; i < chunk.text.length; i++) {
      const char = chunk.text[i]
      if (char === ',' || char === ';') {
        const nextChar = chunk.text[i + 1] || ''
        if (char === ',' && /\d/.test(nextChar)) continue // número
        commaBreaks.push({ index: i, punctuation: char, length: 1 })
      }
    }

    if (commaBreaks.length === 0) {
      expanded.push(chunk)
      continue
    }

    // Dividir nas vírgulas
    const subChunks = splitAtBreakPoints(chunk.text, commaBreaks)
    
    for (let s = 0; s < subChunks.length; s++) {
      const isLast = s === subChunks.length - 1
      expanded.push({
        text: subChunks[s].text,
        pauseAfterMs: isLast ? chunk.pauseAfterMs : subChunks[s].pauseAfterMs,
        punctuation: isLast ? chunk.punctuation : subChunks[s].punctuation,
        index: expanded.length,
      })
    }
  }

  return expanded
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
        ? (PAUSE_DURATION[punctuation] || 400)
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
    `[${i + 1}/${chunks.length}] "${c.text.substring(0, 50)}${c.text.length > 50 ? '...' : ''}" → ${c.pauseAfterMs}ms (${c.punctuation})`
  ).join('\n')
}

/** Tempo total estimado de silêncio entre chunks */
export function estimateTotalPauseMs(chunks: TextChunk[]): number {
  return chunks.reduce((sum, c) => sum + c.pauseAfterMs, 0)
}
