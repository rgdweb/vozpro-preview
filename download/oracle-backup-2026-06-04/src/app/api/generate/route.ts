import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stripSSMLForTTS } from '@/lib/ssml-parser'

// Vercel serverless function timeout - TTS generation can take up to 5 minutes
export const maxDuration = 300

const ORACLE_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'

// Debug logger - coleta todos os passos para retorno ao frontend
function createDebug() {
  const steps: { time: string; step: string; status: string; detail?: string; duration?: number }[] = []
  const start = Date.now()

  function log(step: string, status: 'info' | 'ok' | 'warn' | 'error', detail?: string) {
    steps.push({
      time: new Date().toISOString().split('T')[1],
      step,
      status,
      detail: detail || '',
      duration: Date.now() - start,
    })
    console.log(`[Generate][${status.toUpperCase()}] ${step}${detail ? ': ' + detail : ''}`)
  }

  function result() {
    return { totalDuration: Date.now() - start, steps }
  }

  return { log, result }
}

/**
 * Get tunnel URL from Oracle PHP server
 */
async function getTunnelUrl(debug: ReturnType<typeof createDebug>): Promise<string> {
  try {
    const res = await fetch(`${ORACLE_BASE}/get_tunnel.php`, { cache: 'no-store', signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'online' || !data.tunnelUrl) {
      throw new Error(data.message || 'GPU offline')
    }
    debug.log('Tunnel', 'ok', data.tunnelUrl.substring(0, 60))
    return data.tunnelUrl
  } catch (err) {
    debug.log('Tunnel', 'error', `Falha ao obter tunnel: ${err instanceof Error ? err.message : String(err)}`)
    throw new Error('Servidor GPU nao disponivel. Tente novamente em instantes.')
  }
}

/**
 * Generate TTS via native Python server (POST /api/native-generate)
 */
async function generateNative(
  tunnelUrl: string,
  text: string,
  language: string,
  refAudioUrl: string,
  refAudioName: string,
  instruct: string,
  speed: number,
  debug: ReturnType<typeof createDebug>,
): Promise<{ audioBase64: string; sampleRate: number }> {
  const body = {
    text,
    language: language || 'Auto',
    reference_audio_url: refAudioUrl,
    reference_audio_name: refAudioName,
    instruct: instruct || '',
    speed,
    num_step: 32,
    guidance_scale: 2.0,
    denoise: true,
    preprocess_prompt: true,
    postprocess_output: true,
  }

  debug.log('Native Generate', 'info', `POST ${tunnelUrl}/api/native-generate | speed: ${speed}`)

  const res = await fetch(`${tunnelUrl}/api/native-generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000), // 5 min
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    debug.log('Native Generate', 'error', `HTTP ${res.status}: ${errText.substring(0, 300)}`)
    throw new Error(`GPU retornou erro ${res.status}: ${errText.substring(0, 200)}`)
  }

  const data = await res.json()
  if (!data.audio_base64 && !data.audio) {
    debug.log('Native Generate', 'error', 'Resposta sem audio_base64')
    throw new Error('Servidor GPU nao retornou audio')
  }

  const audioBase64 = data.audio_base64 || data.audio
  const sampleRate = data.sample_rate || data.sampleRate || 24000
  debug.log('Native Generate', 'ok', `Audio recebido (${(audioBase64.length * 0.75 / 1024).toFixed(0)}KB)`)
  return { audioBase64, sampleRate }
}

// POST /api/generate - Generate TTS audio (fallback route, usa tunnel native)
export async function POST(req: NextRequest) {
  const debug = createDebug()

  try {
    const body = await req.json()
    const { variationId, text, language, trackId, trackVolume, speed, numStep, guidanceScale } = body

    // Validate
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto e obrigatorio', debug: debug.result() }, { status: 400 })
    }

    const cleanText = stripSSMLForTTS(text)

    if (!variationId) {
      return NextResponse.json({ error: 'Selecione uma variacao de voz', debug: debug.result() }, { status: 400 })
    }

    // Get the voice variation
    const variation = await db.voiceVariation.findUnique({
      where: { id: variationId },
      include: { voice: true },
    })

    if (!variation) {
      debug.log('Busca variacao', 'error', `ID: ${variationId} nao encontrado`)
      return NextResponse.json({ error: 'Variacao de voz nao encontrada', debug: debug.result() }, { status: 404 })
    }

    debug.log('Variacao encontrada', 'ok', `${variation.label} (voz: ${variation.voice.name})`)
    debug.log('Texto', 'info', `${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`)

    // Build instruct
    let instructParts: string[] = []
    if (variation.voice.gender && variation.voice.gender !== 'Auto') instructParts.push(variation.voice.gender.toLowerCase())
    if (variation.voice.age && variation.voice.age !== 'Auto') instructParts.push(variation.voice.age.toLowerCase())
    if (variation.voice.pitch && variation.voice.pitch !== 'Auto') instructParts.push(variation.voice.pitch.toLowerCase())
    if (variation.voice.accent && variation.voice.accent !== 'Auto') instructParts.push(variation.voice.accent.toLowerCase())
    if (variation.instruct && variation.instruct.trim()) instructParts.push(variation.instruct.trim())
    const instructStr = instructParts.join(', ')
    debug.log('Instruct', 'info', instructStr || '(vazio)')
    debug.log('Parametros', 'info', `lang: ${language || 'Auto'} | speed: ${speed ?? 1.0} | steps: ${numStep ?? 32} | cfg: ${guidanceScale ?? 2.0}`)

    // Get permanent audio URL
    const serverUrl = (variation as Record<string, unknown>).refAudioServerUrl as string || ''
    const fileName = variation.refAudioName || 'ref_audio.wav'

    if (!serverUrl) {
      return NextResponse.json(
        { error: 'Audio de referencia nao disponivel. Reenvie o audio de referencia na variacao.', debug: debug.result() },
        { status: 400 }
      )
    }

    // Get tunnel URL
    const tunnelUrl = await getTunnelUrl(debug)

    // Execute with retry
    const maxRetries = 3
    let voiceDataUri: string | null = null
    let lastError = ''

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const waitTime = 5000 * attempt
        debug.log('Retry', 'info', `Tentativa ${attempt + 1}/${maxRetries} - aguardando ${waitTime / 1000}s...`)
        await new Promise(r => setTimeout(r, waitTime))
      } else {
        debug.log('Geracao', 'info', 'Iniciando geracao via tunnel native...')
      }

      try {
        const result = await generateNative(
          tunnelUrl, cleanText, language || 'Auto', serverUrl, fileName,
          instructStr, speed ?? 1.0, debug
        )

        voiceDataUri = `data:audio/wav;base64,${result.audioBase64}`
        if (attempt > 0) {
          debug.log('Retry', 'ok', `Sucesso na tentativa ${attempt + 1}!`)
        }
        break
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        const retryableErrors = ['timeout', 'connection', '502', '503', 'GPU nao disponivel']
        const shouldRetry = retryableErrors.some(e => lastError.includes(e))

        if (!shouldRetry) {
          debug.log('Retry', 'error', `Erro nao-retriable: ${lastError}`)
          break
        }
        debug.log('Retry', 'warn', `Erro retriable: ${lastError}`)
      }
    }

    if (!voiceDataUri) {
      return NextResponse.json({ error: `Erro na geracao: ${lastError}`, debug: debug.result() }, { status: 500 })
    }

    // Track mixing
    if (trackId) {
      const track = await db.track.findUnique({ where: { id: trackId } })
      debug.log('Track', track?.audioPath ? 'ok' : 'warn', `${track?.name || 'N/A'} | vol: ${trackVolume ?? 0.3}`)

      if (track?.audioPath) {
        debug.log('FINAL', 'ok', 'Retornando voice + track para mix no cliente')
        return NextResponse.json({
          audioUrl: voiceDataUri,
          trackUrl: track.audioPath,
          trackVolume: trackVolume ?? 0.3,
          trackName: track.name,
          mixed: false,
          clientMix: true,
          debug: debug.result(),
        })
      }
    }

    debug.log('FINAL', 'ok', 'Audio pronto sem track')
    return NextResponse.json({
      audioUrl: voiceDataUri,
      mixed: false,
      debug: debug.result(),
    })
  } catch (error) {
    debug.log('EXCEPTION', 'error', error instanceof Error ? `${error.message}\n${error.stack?.substring(0, 300)}` : String(error))
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno do servidor', debug: debug.result() },
      { status: 500 }
    )
  }
}
