/**
 * TTS Text Chunker — Divide texto em frases com controle de prosódia
 * Estilo NaturalReaders: pontuação forte = pausas reais entre chunks
 * 
 * Pipeline otimizado (v2 — velocidade + qualidade):
 * 
 * Entrada: "Olá, tudo bem? Hoje é dia especial."
 * ↓
 * Chunk 1: "Olá, tudo bem" → pausa: 500ms (interrogação)
 * Chunk 2: "Hoje é dia especial" → pausa: 0ms (fim)
 * ↓
 * Cada chunk é gerado separadamente pelo TTS
 * Áudios são concatenados com silêncio real entre eles
 * 
 * PRINCÍPIO: 
 * - Pontuação FORTE (. ! ? ...) = quebra de chunk + silêncio real
 * - Pontuação FRACA (, ; :) = mantida no texto do chunk (o TTS respeita naturalmente)
 * - Isso reduz DRASTICAMENTE o número de chamadas à API
 *   Ex: texto com 3 pontos e 8 vírgulas
 *     Antes: 11 chunks = 11 chamadas API
 *     Depois: 3 chunks = 3 chamadas API (3.6x mais rápido!)
 */

// ============================================================
// TIPOS
// ============================================================

export interface TextChunk {
  text: string           // texto com vírgulas mantidas (TTS respeita naturalmente)
  pauseAfterMs: number   // silêncio REAL em ms após esta frase
  punctuation: string    // pontuação forte que causou a quebra: '.', '!', '?', '...'
  index: number          // índice do chunk (0-based)
}

// ============================================================
// CONFIGURAÇÃO DE PAUSAS (em milissegundos) — Estilo NaturalReaders
// ============================================================

const PAUSE_DURATION: Record<string, number> = {
  '.': 400,     // ponto final → pausa longa (NaturalReaders: ~350-450ms)
  '!': 450,     // exclamação → pausa expressiva
  '?': 500,     // interrogação → pausa expressiva
  '...': 600,   // reticências → pausa alongada
  ';': 300,     // ponto-e-vírgula → pausa média (adicional PT-BR)
  ':': 350,     // dois pontos → pausa média-longa (adicional PT-BR)
}

const MIN_CHUNK_CHARS = 3     // mínimo de caracteres por chunk
const MAX_CHUNK_WORDS = 30    // máximo de palavras antes de forçar quebra (aumentado)

// ============================================================
// CHUNKING PRINCIPAL
// ============================================================

/**
 * Divide texto em chunks com controle de prosódia.
 * Estilo NaturalReaders: pontuação forte = pausas reais.
 * 
 * Estratégia v2 (otimizada para velocidade):
 * 1. Ponto final (.) → quebra com pausa longa (400ms)
 * 2. Exclamação (!) / interrogação (?) → pausa expressiva (450-500ms)
 * 3. Reticências (...) → pausa alongada (600ms)
 * 4. Vírgulas (,) e ponto-e-vírgula (;) → MANTIDAS no texto do chunk
 *    (o GPT-SoVITS respeita vírgulas naturalmente no texto)
 * 5. Frases muito longas (>30 palavras) → quebra forçada em conjunções
 * 6. Frases muito curtas (< 3 chars) → mescla com a próxima
 */
export function chunkText(text: string): TextChunk[] {
  if (!text || !text.trim()) return []

  // Normalizar whitespace
  let normalized = text.replace(/\s+/g, ' ').trim()

  // Se o texto já tem newlines, usar como quebras primárias
  if (normalized.includes('\n')) {
    const newlineChunks = chunkByNewlines(normalized)
    return splitLongChunks(newlineChunks)
  }

  // Passo 1: Identificar apenas pontos de quebra FORTE (. ! ? ...)
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
// PASSO 1: ENCONTRAR PONTOS DE QUEBRA (APENAS PONTUAÇÃO FORTE)
// ============================================================

interface BreakPoint {
  index: number        // posição no texto
  punctuation: string  // tipo de pontuação
  length: number       // tamanho do marcador (1 para '.', 3 para '...')
}

/**
 * Encontra pontos de quebra FORTE no texto (. ! ? ... ; :).
 * Vírgulas NÃO são pontos de quebra — ficam no texto.
 */
function findBreakPoints(text: string): BreakPoint[] {
  const breaks: BreakPoint[] = []
  let bracketDepth = 0  // rastrear profundidade de [colchetes]
  
  let i = 0
  while (i < text.length) {
    const char = text[i]
    
    // Rastrear colchetes — NUNCA quebrar dentro de [pronúncia forçada]
    if (char === '[') { bracketDepth++; i++; continue }
    if (char === ']') { bracketDepth = Math.max(0, bracketDepth - 1); i++; continue }
    
    // Se estamos dentro de colchetes, pular tudo (não buscar pontos de quebra)
    if (bracketDepth > 0) { i++; continue }
    
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
      const nextChar = text[i + 1] || ''
      const prevChar = text[i - 1] || ''
      
      // Ponto seguido de letra = abreviação (não quebrar)
      // Ex: "Dr. Silva", "Av. Paulista", "Sr. João"
      // IMPORTANTE: olhar além do espaço — "Dr." + " " + "Silva" = abreviação
      if (char === '.' && /[a-zA-ZÀ-ÿ]/.test(prevChar)) {
        // Verificar se o próximo caractere (ignorando espaços) é letra
        const restAfterDot = text.substring(i + 1).trimStart()
        if (restAfterDot.length > 0 && /[a-zA-ZÀ-ÿ]/.test(restAfterDot[0])) {
          i++
          continue
        }
      }
      
      // Ponto como parte de número decimal (3.14) — não quebrar
      if (char === '.' && /\d/.test(prevChar) && /\d/.test(nextChar)) {
        i++
        continue
      }
      
      // Ponto seguido de outro ponto = reticências (já tratado acima)
      if (char === '.' && nextChar === '.') {
        i++
        continue
      }
      
      breaks.push({ index: i, punctuation: char, length: 1 })
      i++
      continue
    }
    
    // Ponto-e-vírgula → quebra de pausa média (PT-BR)
    if (char === ';') {
      breaks.push({ index: i, punctuation: char, length: 1 })
      i++
      continue
    }
    
    // Dois pontos — quebra de pausa média, EXCETO entre dígitos (horário/placar)
    // Ex: "14:30" (hora) ou "2:1" (placar) — não quebrar
    if (char === ':') {
      const prevChar = text[i - 1] || ''
      const nextChar = text[i + 1] || ''
      if (/\d/.test(prevChar) && /\d/.test(nextChar)) {
        // : entre dígitos = horário ou placar, não quebrar
        i++
        continue
      }
      breaks.push({ index: i, punctuation: char, length: 1 })
      i++
      continue
    }
    
    // Vírgula — NÃO quebra. Fica no texto do chunk (o TTS respeita naturalmente)
    if (char === ',') {
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
    // Sem pontuação forte — retorna texto inteiro como um chunk
    return [{ text: text.trim() + '.', pauseAfterMs: 0, punctuation: '.', index: 0 }]
  }
  
  const chunks: TextChunk[] = []
  let lastIndex = 0
  
  for (let i = 0; i < breakPoints.length; i++) {
    const bp = breakPoints[i]
    const textBefore = text.substring(lastIndex, bp.index).trim()
    const isLast = i === breakPoints.length - 1
    
    if (textBefore) {
      // BUG FIX: textBefore NÃO inclui a pontuação (substring corta antes do ponto).
      // Sem pontuação no texto, o TTS gera final "morto" → corte de áudio.
      // SOLUÇÃO: Sempre anexar pontuação ao texto do chunk.
      // Intermediários: vírgula (TTS faz pausa curta + frontend adiciona silêncio).
      // Último: pontuação original (frase final soa completa).
      let cleanText = textBefore.trim()
      if (!isLast) {
        // Chunks intermediários: anexar vírgula para o TTS finalizar naturalmente
        cleanText = cleanText + ','
      } else {
        // Último chunk: anexar pontuação original (., !, ?, ...)
        cleanText = cleanText + bp.punctuation
      }

      chunks.push({
        text: cleanText,
        pauseAfterMs: isLast ? 0 : (PAUSE_DURATION[bp.punctuation] || 400),
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
      text: remaining + '.',
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
 * Só mescla se a pontuação que separa for vírgula (pontuação fraca no contexto
 * de quebra = o ponto final de uma frase curta como "Ok.").
 */
function mergeShortChunks(chunks: TextChunk[]): TextChunk[] {
  if (chunks.length <= 1) return chunks

  const result: TextChunk[] = []
  let i = 0

  while (i < chunks.length) {
    const current = chunks[i]
    const wordCount = current.text.split(/\s+/).filter(w => w.length > 0).length
    const isShort = (wordCount < 3 && current.text.length < 20) || current.text.length < MIN_CHUNK_CHARS

    if (isShort && i < chunks.length - 1) {
      const next = chunks[i + 1]
      result.push({
        text: current.text + ', ' + next.text,
        pauseAfterMs: next.pauseAfterMs,
        punctuation: next.punctuation,
        index: result.length,
      })
      // Garantir que o chunk mesclado tem pontuação final
      if (!/[,.!?;:...]$/.test(result[result.length - 1].text)) {
        result[result.length - 1].text += ','
      }
      i += 2
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
 * Procura conjunções como ponto natural de quebra.
 * IMPORTANTE: NÃO quebra dentro de colchetes [pronúncia forçada].
 */
function splitLongChunks(chunks: TextChunk[]): TextChunk[] {
  const result: TextChunk[] = []

  for (const chunk of chunks) {
    const words = chunk.text.split(/\s+/).filter(w => w.length > 0)

    if (words.length <= MAX_CHUNK_WORDS) {
      result.push(chunk)
      continue
    }

    // Procura ponto natural de quebra em conjunções (PT-BR expandido)
    const breakWords = ['e', 'mas', 'porem', 'contudo', 'porque', 'pois', 'portanto',
      'alem', 'tambem', 'quando', 'onde', 'como', 'para', 'com', 'mais', 'nao',
      'se', 'ou', 'essa', 'esse', 'esta', 'este', 'que', 'num', 'uma',
      // Adicionais para PT-BR
      'embola', 'entretanto', 'todavia', 'conforme',
      'inclusive', 'principalmente', 'geralmente',
      'sobretudo', 'atualmente',
      'durante', 'atraves', 'mediante', 'segundo',
      'jah', 'ainda', 'bem', 'logo', 'depois', 'antes', 'sempre',
      'enfim', 'afinal']

    const subChunks: string[][] = [[]]
    let wordCount = 0
    let bracketDepth = 0  // rastrear profundidade de colchetes

    for (let w = 0; w < words.length; w++) {
      const word = words[w]

      // Rastrear colchetes — NÃO quebrar dentro de [pronúncia forçada]
      for (const ch of word) {
        if (ch === '[') bracketDepth++
        if (ch === ']') bracketDepth = Math.max(0, bracketDepth - 1)
      }

      subChunks[subChunks.length - 1].push(word)
      wordCount++

      // Só quebrar se NÃO estamos dentro de colchetes
      if (bracketDepth === 0) {
        const cleanWord = word.toLowerCase().replace(/[,;:.!?]/g, '')
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
    }

    // Criar TextChunks a partir das sub-partes
    for (let s = 0; s < subChunks.length; s++) {
      const subText = subChunks[s].join(' ').trim()
      if (!subText) continue

      // BUG FIX: anexar pontuação ao sub-chunk para TTS finalizar frase.
      // Sem isso, o TTS corta o áudio no final do sub-chunk.
      const isLast = s === subChunks.length - 1
      const subTextPunct = isLast
        ? (subText + (chunk.punctuation || '.'))
        : (subText + ',')
      result.push({
        text: subTextPunct,
        pauseAfterMs: isLast ? chunk.pauseAfterMs : 250,
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

    // Detectar pontuação forte final
    const punctMatch = trimmed.match(/([.!?])\s*$/)
    const punctuation = punctMatch ? punctMatch[1] : '.'
    const cleanText = punctMatch ? trimmed.slice(0, -1).trim() : trimmed

    // BUG FIX: re-anexar pontuação ao texto para TTS finalizar frase.
    // cleanText remove a pontuação mas o TTS precisa dela.
    const finalText = (i < lines.length - 1)
      ? ((cleanText || trimmed) + (punctuation || ','))
      : ((cleanText || trimmed) + (punctuation || '.'))
    return {
      text: finalText,
      pauseAfterMs: i < lines.length - 1
        ? (PAUSE_DURATION[punctuation] || 400)
        : 0,
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

// ============================================================
// DURATION PREDICTOR — Estima duração de cada chunk
// ============================================================

/**
 * Estima a duração de fala de um texto em milissegundos.
 * Baseado em contagem de sílabas + complexidade fonética.
 * Usado para ajustar velocidade e pausas proporcionalmente.
 *
 * PT-BR médio: ~5.5 sílabas por segundo = ~182ms por sílaba
 * Palavras longas = mais tempo por sílaba (articulação mais lenta)
 * Pontuação final alonga a última sílaba
 */
export function estimateChunkDurationMs(chunk: string, speed = 1.0): number {
  const words = chunk.split(/\s+/).filter(w => w.length > 0)
  let totalMs = 0

  for (const word of words) {
    const clean = word.replace(/[.,;:!?¿¡…"'()\[\]{}]/g, '')
    if (!clean) continue

    // Contar sílabas (aproximação: grupos de vogais)
    const syllableCount = Math.max(1, (clean.match(/[aeiouáàãâéèêíïóôõúü]/gi) || []).length)

    // Base: ~180ms por sílaba em velocidade normal
    const baseMsPerSyllable = 180

    // Ajuste por comprimento da palavra (palavras longas = articulação mais lenta)
    const lengthFactor = clean.length > 8 ? 1.15 : clean.length > 5 ? 1.05 : 1.0

    // Ajuste por posição (última palavra antes de pontuação forte = alongada)
    const isLastWord = word === words[words.length - 1]
    const endFactor = isLastWord ? 1.2 : 1.0

    totalMs += syllableCount * baseMsPerSyllable * lengthFactor * endFactor
  }

  // Ajustar por velocidade
  return Math.round(totalMs / speed)
}

/**
 * Retorna duração estimada total de todos os chunks (em segundos)
 */
export function estimateTotalDurationSec(chunks: TextChunk[], speed = 1.0): number {
  const totalSpeechMs = chunks.reduce((sum, c) => sum + estimateChunkDurationMs(c.text, speed), 0)
  const totalPauseMs = estimateTotalPauseMs(chunks)
  return Math.round((totalSpeechMs + totalPauseMs) / 100) / 10 // arredondar para 1 casa
}
