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
 * G2P Phonemize — Pipeline de conversão texto → fonemas para PT-BR
 *
 * Usa espeak-ng para converter texto em representação fonética.
 * O VozPro (k2-fsa/F5-TTS) é character-based e não faz conversão
 * fonética nativa para PT-BR, resultando em pronúncias erradas.
 *
 * Este endpoint complementa o pronunciation-optimizer.ts fornecendo:
 * - Conversão G2P para QUALQUER palavra (não apenas as ~1100 do dicionário)
 * - Cobertura de nomes próprios, neologismos, termos técnicos
 * - Fallback automático quando o dicionário hardcoded não cobre a palavra
 *
 * Uso: POST /api/g2p-phonemize
 * Body: { text: "exemplo de texto", voice: "pt-br" }
 * Response: { phonemes: "EZe~pludZI dZI tEkStU", words: [{word, phoneme}] }
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Executa espeak-ng com flag --ipa para obter fonemas IPA
 */
function espeakPhonemize(text: string, voice = 'pt-br'): string {
  const { execSync } = require('child_process')

  try {
    // espeak-ng --ipa -v pt-br "texto"
    // --ipa: output IPA phonemes
    // -v pt-br: Brazilian Portuguese voice
    // -q: quiet mode (no audio)
    const cmd = `espeak-ng --ipa -v ${voice} -q "${text.replace(/"/g, '\\"')}" 2>/dev/null`
    const result = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return result.trim()
  } catch {
    return ''
  }
}

/**
 * Executa espeak-ng com --phonout para obter fonemas no formato espeak
 * (mais legível para TTS do que IPA puro)
 */
function espeakPhonemeCodes(text: string, voice = 'pt-br'): string {
  const { execSync } = require('child_process')

  try {
    // Usar --phonout para escrever em arquivo temporário
    const tmpFile = `/tmp/espeak_phon_${Date.now()}.out`
    const cmd = `espeak-ng -v ${voice} -q --phonout=${tmpFile} "${text.replace(/"/g, '\\"')}" 2>/dev/null`

    try {
      execSync(cmd, {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      const { readFileSync, unlinkSync } = require('fs')
      let phonemes = ''
      try {
        phonemes = readFileSync(tmpFile, 'utf-8').trim()
      } catch {
        // arquivo não criado
      }
      try {
        unlinkSync(tmpFile)
      } catch {
        // falha silenciosa na limpeza
      }

      return phonemes
    } catch {
      return ''
    }
  } catch {
    return ''
  }
}

/**
 * Converte texto para fonemas IPA palavra por palavra
 */
function phonemizeWordByWord(text: string, voice = 'pt-br'): Array<{ word: string; ipa: string }> {
  const words = text.split(/\s+/).filter(w => w.length > 0)
  return words.map(word => {
    // Remover pontuação para a conversão fonética
    const cleanWord = word.replace(/[.,;:!?¿¡…"'()\[\]{}]/g, '')
    if (!cleanWord) return { word, ipa: word }

    const ipa = espeakPhonemize(cleanWord, voice)
    return { word: cleanWord, ipa: ipa || cleanWord }
  })
}

/**
 * Detecta se uma palavra provavelmente será pronunciada errada pelo TTS
 * Heurísticas baseadas nos padrões identificados na análise:
 * - Palavras com grupos consonantais não-usuais em PT (gn, pn, mn, pt)
 * - Palavras com H mudo no início
 * - Palavras estrangeiras (detectadas por padrões ortográficos)
 * - Siglas (tudo maiúsculas)
 */
function isLikelyMispronounced(word: string): boolean {
  const w = word.replace(/[.,;:!?¿¡…"'()\[\]{}]/g, '')
  if (!w || w.length < 3) return false

  const lower = w.toLowerCase()

  // Grupos consonantais problemáticos no início
  if (/^(gn|pn|mn|pt|ps|bn)/.test(lower)) return true

  // H mudo no início
  if (/^h[aeiouáàãâéèêíïóôõúü]/i.test(w)) return true

  // Siglas (tudo maiúsculas, 2-6 chars)
  if (/^[A-Z]{2,6}$/.test(w) && w.length <= 6) return true

  // Palavras com X no início
  if (/^x/i.test(lower)) return true

  // Palavras com padrões típicos de inglês
  if (/[aeiou]tion$/.test(lower)) return true
  if (/^(?:the|this|that|with|from|have|will|would|should|could|been|were|what|when|where|which|their|there|they|them|these|those|your|about)$/.test(lower)) return true

  // Palavras com ge/gi que TTS pode ler como G duro
  if (/[gG][eEéÉêÊiIíÍ]/.test(w) && !/^[gG]ui/.test(lower)) return true

  return false
}

// ============================================================
// POST HANDLER — Fonemizar texto
// ============================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, voice = 'pt-br', mode = 'full' } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Texto obrigatório' }, { status: 400 })
    }

    const startTime = Date.now()

    if (mode === 'check') {
      // Modo "check": retorna apenas palavras que provavelmente serão pronunciadas errado
      const words = text.split(/\s+/).filter(w => w.length > 0)
      const problematic = words.filter(w => isLikelyMispronounced(w))
      const elapsed = Date.now() - startTime

      return NextResponse.json({
        mode: 'check',
        text,
        totalWords: words.length,
        problematicWords: problematic,
        problematicCount: problematic.length,
        elapsed,
      })
    }

    if (mode === 'words') {
      // Modo "words": fonemiza palavra por palavra
      const wordPhonemes = phonemizeWordByWord(text, voice)
      const elapsed = Date.now() - startTime

      return NextResponse.json({
        mode: 'words',
        text,
        words: wordPhonemes,
        elapsed,
      })
    }

    // Modo "full" (padrão): fonemiza o texto completo
    const ipa = espeakPhonemize(text, voice)
    const phonemeCodes = espeakPhonemeCodes(text, voice)
    const wordPhonemes = phonemizeWordByWord(text, voice)
    const problematic = text.split(/\s+/).filter(w => isLikelyMispronounced(w))
    const elapsed = Date.now() - startTime

    return NextResponse.json({
      mode: 'full',
      text,
      ipa,
      phonemeCodes,
      words: wordPhonemes,
      problematicWords: problematic,
      problematicCount: problematic.length,
      elapsed,
    })
  } catch (error) {
    console.error('[G2P] Exception:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Erro interno na conversão G2P',
    }, { status: 500 })
  }
}

// ============================================================
// GET HANDLER — Health check + info
// ============================================================

export async function GET() {
  try {
    // Testar se espeak-ng está funcionando
    const testPhonemes = espeakPhonemize('olá mundo', 'pt-br')

    return NextResponse.json({
      status: testPhonemes ? 'g2p_available' : 'g2p_error',
      engine: 'espeak-ng',
      version: '1.52.0',
      voice: 'pt-br',
      testInput: 'olá mundo',
      testOutput: testPhonemes || 'ERRO',
      features: [
        'g2p_phonemize',
        'ipa_output',
        'espeak_phoneme_codes',
        'word_by_word',
        'mispronunciation_detection',
        'pt_br_voice',
      ],
    })
  } catch {
    return NextResponse.json({
      status: 'g2p_unavailable',
      engine: 'espeak-ng',
      error: 'espeak-ng não está disponível no servidor',
    })
  }
}
