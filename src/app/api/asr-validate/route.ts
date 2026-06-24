/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * ASR Validate — Validação de pronúncia de áudio gerado
 * 
 * Recebe áudio (base64 data URI ou ArrayBuffer), transcreve com ASR
 * e compara com o texto original. Retorna se a pronúncia está correta.
 * 
 * Usado pelo frontend para retry automático: se o TTS errou uma palavra,
 * o frontend regera automaticamente até ficar perfeito.
 */

import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Singleton SDK instance
let zaiInstance: any = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

const ASR_TIMEOUT_MS = 15000
const MIN_ORIGINAL_WORDS = 3

// Palavras que o TTS alucina frequentemente (PT-BR)
const JUNK_WORDS = new Set([
  'to', 'toh', 'tô', 'ba', 'bah', 'ahn', 'ah', 'éh', 'êh',
  'hum', 'hmm', 'hm', 'oh', 'ô', 'ih', 'úh', 'uh', 'ai', 'psiu',
])

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractWords(text: string): string[] {
  return normalizeText(text).split(' ').filter(w => w.length > 0)
}

export async function POST(request: NextRequest) {
  try {
    const { audioBase64, text: originalText } = await request.json()

    if (!audioBase64 || !originalText) {
      return NextResponse.json({ error: 'audioBase64 e text são obrigatórios' }, { status: 400 })
    }

    const originalWords = extractWords(originalText)
    if (originalWords.length < MIN_ORIGINAL_WORDS) {
      return NextResponse.json({ valid: true, skipped: true, reason: 'texto curto' })
    }

    // Extrair base64 puro (remove data:audio/xxx;base64, prefix se tiver)
    const rawBase64 = audioBase64.includes(',')
      ? audioBase64.split(',')[1]
      : audioBase64

    const zai = await getZAI()

    const transcription = await Promise.race([
      zai.audio.asr.create({ file_base64: rawBase64 }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), ASR_TIMEOUT_MS)),
    ])

    const transcribedText = transcription?.text?.trim()
    if (!transcribedText) {
      return NextResponse.json({ valid: true, skipped: true, reason: 'ASR falhou' })
    }

    const transcribedWords = extractWords(transcribedText)
    const transcribedClean = transcribedWords.filter(w => !JUNK_WORDS.has(w.toLowerCase()))

    // Calcular cobertura: quantas palavras originais apareceram na transcrição
    const transcribedSet = new Set(transcribedClean.map(w => w.toLowerCase()))
    const matchedWords = originalWords.filter(w => transcribedSet.has(w.toLowerCase()))
    const wordCoverage = originalWords.length > 0
      ? matchedWords.length / originalWords.length
      : 0

    // Palavras extras (que não estão no original)
    const originalSet = new Set(originalWords.map(w => w.toLowerCase()))
    const extraWords = transcribedClean.filter(w => !originalSet.has(w.toLowerCase()))
    const extraWordsRatio = transcribedClean.length > 0
      ? extraWords.length / transcribedClean.length
      : 0

    // Palavras lixo no início = sinal forte de alucinação
    const junkAtStart = transcribedWords.length > 0 && JUNK_WORDS.has(transcribedWords[0].toLowerCase())

    // Verificar se palavras foram puladas (estão no original mas não na transcrição)
    const missedWords = originalWords.filter(w => !transcribedSet.has(w.toLowerCase()))

    const valid = !junkAtStart
      && wordCoverage >= 0.75 // 75% das palavras devem aparecer
      && extraWordsRatio <= 0.25

    console.log('[ASR Validate]', valid ? 'OK' : 'REJEITADO',
      `cobertura:${Math.round(wordCoverage * 100)}%`,
      `lixo:${junkAtStart}`,
      `perdidas:${missedWords.slice(0, 5).join(',') || 'nenhuma'}`)

    return NextResponse.json({
      valid,
      skipped: false,
      transcription: transcribedText,
      wordCoverage: Math.round(wordCoverage * 100),
      extraWords: extraWords.slice(0, 5),
      missedWords: missedWords.slice(0, 5),
      junkAtStart,
    })
  } catch (error) {
    console.error('[ASR Validate] Erro:', error instanceof Error ? error.message : String(error))
    return NextResponse.json({ valid: true, skipped: true, reason: 'erro ASR' })
  }
}
