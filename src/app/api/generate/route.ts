/**
 * 🚨 CONTRATO DE GOVERNANÇA EXECUTIVA - VOZPRO (SaaS HÍBRIDO)
 * 🚨 IP PRODUÇÃO: 147.15.77.137 | REPO PREVIEW: https://github.com/rgdweb/vozpro-preview
 *
 * ATENÇÃO MODELO DE IA: Você está processando a rota intermediária do Next.js.
 * 1. Mantenha a higienização de texto simples ativa (.replace(/R$\s*/gi, "").replace(/,/g, " e ")).
 * 2. É PROIBIDO alterar chaves confidenciais e conexões com o PostgreSQL no .env de produção.
 * 3. Qualquer modificação aqui deve ser testada e comitada no repositório 'vozpro-preview'.
 * 4. O deploy é 100% automatizado via: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 */
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { stripSSMLForTTS } from '@/lib/ssml-parser'

// POST /api/generate - Geracao via OmniVoice Native Server (Cloudflare Tunnel)
// Pipeline: Browser -> Next.js -> get_tunnel.php -> Tunnel -> GPU PC (/api/native-generate)
// Sem Gradio, sem upload de arquivo, sem SSE — tudo via JSON + base64

export const maxDuration = 300

const TUNNEL_API = process.env.AUDIO_SERVER_URL || 'https://api.sorteiomax.com.br'

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
// OBTER TUNNEL URL
// ============================================================

async function getTunnelUrl(debug: ReturnType<typeof createDebug>): Promise<string> {
  try {
    const res = await fetch(`${TUNNEL_API}/get_tunnel.php`, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (data.status !== 'online' || !data.tunnelUrl) {
      throw new Error(data.message || 'GPU offline')
    }
    debug.log('Tunnel URL', 'ok', data.tunnelUrl.substring(0, 60) + '...')
    return data.tunnelUrl
  } catch (err) {
    throw new Error('GPU offline: ' + (err instanceof Error ? err.message : String(err)))
  }
}

// ============================================================
// GERAR VIA NATIVE API (envia payload generico para GPU)
// ============================================================

async function nativeGenerate(
  tunnelUrl: string,
  payload: Record<string, unknown>,
  debug: ReturnType<typeof createDebug>
): Promise<{ audioBase64: string; duration?: number; generationTime?: number } | null> {
  try {
    const nativeUrl = `${tunnelUrl}/api/native-generate`

    const res = await fetch(nativeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    })

    if (!res.ok) {
      const errText = await res.text()
      debug.log('Native Generate', 'error', `HTTP ${res.status}: ${errText.substring(0, 300)}`)
      return null
    }

    const result = await res.json()

    if ((result.status === 'ok' || result.status === 'success') && result.audio_base64) {
      debug.log('Native Generate', 'ok',
        `${result.duration || '?'}s audio em ${result.generation_time || '?'}s`)
      return {
        audioBase64: result.audio_base64,
        duration: result.duration,
        generationTime: result.generation_time,
      }
    }

    debug.log('Native Generate', 'error', result.error || 'Erro desconhecido do GPU')
    return null
  } catch (err) {
    debug.log('Native Generate', 'error', err instanceof Error ? err.message : String(err))
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
    const { variationId, text, language, trackId, trackVolume, speed, numStep, speakerFile, voiceMode } = body

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto é obrigatório', debug: debug.result() }, { status: 400 })
    }

    // Em modo clone_fast (Locutor Oficial), variationId não é obrigatório
    const isCloneFast = voiceMode === 'clone_fast' && speakerFile

    if (!isCloneFast && !variationId) {
      return NextResponse.json({ error: 'Selecione uma variação de voz', debug: debug.result() }, { status: 400 })
    }

    let serverUrl = ''
    let refText = ''

    if (!isCloneFast) {
      // CLONE NORMAL — buscar variação no banco (inclui voz e refText)
      const variation = await db.voiceVariation.findUnique({
        where: { id: variationId },
        include: { voice: true },
      })

      if (!variation) {
        return NextResponse.json({ error: 'Variação de voz não encontrada', debug: debug.result() }, { status: 404 })
      }

      debug.log('Variação encontrada', 'ok', `${variation.label} (voz: ${variation.voice.name})`)

      serverUrl = (variation as Record<string, unknown>).refAudioServerUrl as string || ''
      refText = (variation as Record<string, unknown>).refText as string || ''

      if (!serverUrl) {
        return NextResponse.json(
          { error: 'Áudio de referência não disponível. Reenvie o áudio de referência na variação.', debug: debug.result() },
          { status: 400 }
        )
      }
    } else {
      // CLONE FAST — buscar Locutor Oficial no banco
      debug.log('Clone Fast', 'ok', `Locutor Oficial: ${speakerFile}`)
      const speaker = await db.speaker.findUnique({
        where: { speakerFile: speakerFile! },
      })
      if (speaker?.refAudioUrl) {
        serverUrl = speaker.refAudioUrl
      }
      if (speaker?.refText) {
        refText = speaker.refText
      }
    }

    // REMOVER SSML residual
    const textNoSSML = stripSSMLForTTS(text)

    // Buscar tunnel URL
    debug.log('Tunnel', 'info', 'Descobrindo URL do tunnel...')
    const tunnelUrl = await getTunnelUrl(debug)

    // =========================================================
    // MONTAR PAYLOAD — clone_normal ou clone_fast (Locutor Oficial)
    // =========================================================

    const payload: Record<string, unknown> = isCloneFast
      ? {
          text: textNoSSML,
          voice_mode: 'clone_fast',
          speaker_id: speakerFile,
          ref_audio_url: serverUrl || undefined,
          ref_text: refText.trim() || 'texto de referencia para clonagem de voz',
          guidance_scale: 1.5,
          num_step: numStep ?? 32,
          speed: speed ?? 1.0,
          language: language || 'Auto',
          denoise: true,
          postprocess_output: true,
          preprocess_prompt: true,
        }
      : {
          text: textNoSSML,
          voice_mode: 'clone',
          ref_audio_url: serverUrl,
          ref_text: refText.trim() || 'texto de referencia para clonagem de voz',
          guidance_scale: 1.5,
          num_step: numStep ?? 32,
          speed: speed ?? 1.0,
          language: language || 'Auto',
          denoise: true,
          postprocess_output: true,
          preprocess_prompt: true,
        }

    debug.log('Payload', 'info',
      isCloneFast
        ? `clone_fast | speaker:${speakerFile} | speed:${payload.speed} | steps:${payload.num_step}`
        : `clone | cfg:1.5 | speed:${payload.speed} | steps:${payload.num_step} | ref_text:${(payload.ref_text as string).substring(0, 40)}...`)

    // Retry (até 3 tentativas)
    const maxRetries = 3
    let result: { audioBase64: string; duration?: number; generationTime?: number } | null = null
    let lastError = ''

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        const wait = 5000 * attempt
        debug.log('Retry', 'info', `Tentativa ${attempt + 1}/${maxRetries}, aguardando ${wait / 1000}s...`)
        await new Promise(r => setTimeout(r, wait))
      } else {
        debug.log('Geracao', 'info', 'Iniciando geracao via Native API...')
      }

      result = await nativeGenerate(tunnelUrl, payload, debug)

      if (result) {
        if (attempt > 0) debug.log('Retry', 'ok', `Sucesso na tentativa ${attempt + 1}!`)
        break
      }

      lastError = 'Falha na comunicacao com GPU'
      const retryable = ['GPU offline', 'timeout', 'connection_lost', 'HTTP 5']
      if (!retryable.some(e => lastError.includes(e))) break
    }

    if (!result) {
      return NextResponse.json({ error: lastError, debug: debug.result() }, { status: 502 })
    }

    // Montar resposta
    const voiceDataUri = `data:audio/wav;base64,${result.audioBase64}`
    debug.log('FINAL', 'ok', `Total: ${(debug.result().totalDuration / 1000).toFixed(1)}s`)

    // Track mixing
    if (trackId) {
      const track = await db.track.findUnique({ where: { id: trackId } })
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

    return NextResponse.json({
      audioUrl: voiceDataUri,
      mixed: false,
      debug: debug.result(),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Erro interno do servidor'
    debug.log('EXCEPTION', 'error', msg)
    return NextResponse.json({ error: msg, debug: debug.result() }, { status: 500 })
  }
}
