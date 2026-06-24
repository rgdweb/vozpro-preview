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
import { NextRequest, NextResponse } from 'next/server'
import { validateGeneratedAudio, formatValidationLog } from '@/lib/asr-validator'
import { stripSSMLForTTS } from '@/lib/ssml-parser'
import { fixAudioServerUrl } from '@/lib/audio-server'

// POST /api/tunnel-generate - Geracao via API nativa (100% Python/OmniVoice)
// Pipeline simplificado:
//   1. Recebe texto + params do frontend
//   2. Envia para /api/native-generate no servidor GPU (Python)
//   3. Servidor GPU baixa audio, processa com OmniVoice, retorna WAV base64
//   4. Valida com ASR (opcional) e retorna ao frontend
//
// Zero processamento de audio em JavaScript — tudo roda nativamente no Python.
// Se funciona no localhost, funciona aqui.

export const maxDuration = 300

const ORACLE_BASE = 'http://147.15.77.137'
const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

// ============================================================
// DEBUG
// ============================================================

function createDebug() {
  const steps: { time: string; step: string; status: string; detail?: string; duration?: number }[] = []
  const start = Date.now()
  function log(step: string, status: 'info' | 'ok' | 'warn' | 'error', detail?: string) {
    steps.push({ time: new Date().toISOString().split('T')[1], step, status, detail: detail || '', duration: Date.now() - start })
  }
  function result() { return { totalDuration: Date.now() - start, steps } }
  return { log, result }
}

// ============================================================
// TUNNEL URL
// ============================================================

async function getGpuUrl(debug: ReturnType<typeof createDebug>): Promise<string> {
  // v4.1: Try WireGuard direct first (bypasses nginx/SSL issues), then ORACLE_BASE as fallback
  // WireGuard direct: http://10.99.0.2:7860 — no SSL, no nginx, no cert issues
  // ORACLE_BASE: http://147.15.77.137 — nginx proxy, sometimes SSL cert mismatch

  // Try 1: WireGuard direct URL
  try {
    const res = await fetch(`${GPU_DIRECT_URL}/health`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'ok' || !data.model_loaded) {
      throw new Error('GPU offline (modelo nao carregado)')
    }
    debug.log('WireGuard Direct', 'ok', `GPU online via WireGuard direct (${GPU_DIRECT_URL})`)
    return GPU_DIRECT_URL
  } catch (directErr) {
    debug.log('WireGuard Direct', 'warn', `Falhou: ${directErr instanceof Error ? directErr.message : String(directErr)}, tentando ORACLE_BASE...`)
  }

  // Try 2: ORACLE_BASE (nginx fallback)
  try {
    const res = await fetch(`${ORACLE_BASE}/health`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'ok' || !data.model_loaded) {
      throw new Error('GPU offline (modelo nao carregado)')
    }
    debug.log('ORACLE_BASE', 'ok', 'GPU online via Oracle nginx fallback')
    return ORACLE_BASE
  } catch (err) {
    throw new Error('GPU offline (direct + nginx fallback): ' + (err instanceof Error ? err.message : String(err)))
  }
}

// ============================================================
// NATIVE GENERATE — chama /api/native-generate no servidor GPU
// ============================================================

interface NativeResult {
  status: string
  audio_base64?: string
  audio_size?: number
  duration?: number
  generation_time?: number
  rtf?: number
  error?: string
}

async function callNativeGenerate(
  tunnelUrl: string,
  params: {
    text: string
    voiceMode: string
    refAudioUrl?: string
    refAudioBase64?: string
    language: string
    instruct: string | null
    speed: number
    numStep: number
    guidanceScale: number
  },
  debug: ReturnType<typeof createDebug>
): Promise<NativeResult | null> {
  const body: Record<string, unknown> = {
    text: params.text,
    voice_mode: params.voiceMode,
    ref_audio_url: params.refAudioUrl || '',
    ref_audio_base64: params.refAudioBase64 || '',
    language: params.language,
    instruct: params.instruct || '',
    speed: params.speed,
    num_step: params.numStep,
    guidance_scale: params.guidanceScale,
  }

  debug.log('Native API', 'info', `POST /api/native-generate (${params.text.length} chars, mode=${params.voiceMode})`)

  try {
    const res = await fetch(`${tunnelUrl}/api/native-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    })

    const responseText = await res.text()
    debug.log('Native API', 'info', `HTTP ${res.status} (${responseText.length} bytes)`)  

    // Log primeiros 500 chars da resposta bruta pra debug
    debug.log('Native API Raw', res.ok ? 'info' : 'error', responseText.substring(0, 500))

    let result: NativeResult
    try {
      result = JSON.parse(responseText)
    } catch {
      debug.log('Native API', 'error', `Resposta nao e JSON valido: ${responseText.substring(0, 200)}`)
      return null
    }

    if (result.status === 'ok') {
      debug.log('Native API', 'ok', `${result.duration}s gerado em ${result.generation_time}s (RTF=${result.rtf})`)
      return result
    }

    debug.log('Native API', 'error', result.error || `status=${result.status}, sem campo error`)
    return null
  } catch (err) {
    debug.log('Native API', 'error', err instanceof Error ? err.message : String(err))
    return null
  }
}

// ============================================================
// POST HANDLER
// ============================================================

export async function POST(req: NextRequest) {
  const debug = createDebug()

  try {
    const body = await req.json()
    const {
      referenceAudioUrl,
      referenceAudioBase64,
      referenceAudioName,
      text,
      language = 'Auto',
      refText = '',
      instruct = null,
      speed = 1,
      numStep = 32,
      guidanceScale = 2.0,
      skipASR = false,
      voiceMode = 'clone',
    } = body

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto obrigatório', debug: debug.result() }, { status: 400 })
    }

    // Remover tags SSML (defesa dupa — frontend ja processa, mas previne escapes)
    const cleanText = stripSSMLForTTS(text)
    debug.log('SSML Strip', 'info', cleanText !== text ? 'Tags removidas' : 'sem SSML')

    // 1. Verificar GPU online via WireGuard VPN
    debug.log('WireGuard', 'info', 'Verificando GPU via WireGuard VPN...')
    const gpuUrl = await getGpuUrl(debug)

    // 2. Gerar via API nativa Python (100% OmniVoice, zero processamento JS)
    debug.log('Pipeline', 'info', `Modo NATIVE (${voiceMode})`)

    const genParams = {
      text: cleanText,
      voiceMode,
      refAudioUrl: voiceMode === 'clone' && !referenceAudioBase64 && referenceAudioUrl
        ? fixAudioServerUrl(referenceAudioUrl)
        : '',
      refAudioBase64: voiceMode === 'clone' ? (referenceAudioBase64 || '') : '',
      language,
      instruct,
      speed,
      numStep,
      guidanceScale,
    }

    let result = await callNativeGenerate(gpuUrl, genParams, debug)

    // 3. Retry se falhou
    if (!result) {
      debug.log('Pipeline', 'warn', 'Falhou, tentando novamente...')
      try {
        const retryUrl = await getGpuUrl(debug)
        result = await callNativeGenerate(retryUrl, genParams, debug)
      } catch (retryErr) {
        debug.log('Pipeline', 'error', `Retry falhou: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`)
      }
    }

    if (!result) {
      return NextResponse.json({
        error: 'GPU nao conseguiu gerar audio',
        debug: debug.result(),
      }, { status: 500 })
    }

    // 4. Validacao ASR (opcional, no audio final)
    let asrResult = null
    if (!skipASR && result.audio_base64) {
      debug.log('ASR', 'info', 'Validando audio final...')
      const wavBinary = Buffer.from(result.audio_base64, 'base64')
      asrResult = await validateGeneratedAudio(wavBinary.buffer as ArrayBuffer, text)
      debug.log('ASR', asrResult.valid ? 'ok' : 'warn', formatValidationLog(asrResult))
    }

    // 5. Montar resposta
    const response: Record<string, unknown> = {
      audioUrl: `data:audio/wav;base64,${result.audio_base64}`,
      viaTunnel: false,
      viaWireGuard: true,
      mode: 'native',
      duration: result.duration,
      generationTime: result.generation_time,
      debug: debug.result(),
    }

    if (asrResult) {
      response.asrValidation = {
        valid: asrResult.valid,
        method: asrResult.method,
        transcription: asrResult.transcription,
        confidence: Math.round(asrResult.confidence * 100),
        wordCoverage: asrResult.wordCoverage >= 0 ? Math.round(asrResult.wordCoverage * 100) : 'N/A',
        issues: asrResult.issues,
      }
      if (!asrResult.valid) {
        response.asrWarning = true
        response.asrMessage = 'Audio pode conter imperfeicoes.'
      }
    }

    debug.log('FINAL', 'ok', `Total: ${(debug.result().totalDuration / 1000).toFixed(1)}s | native`)
    return NextResponse.json(response)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro interno'
    debug.log('EXCEPTION', 'error', msg)
    return NextResponse.json({ error: msg, debug: debug.result() }, { status: 500 })
  }
}
