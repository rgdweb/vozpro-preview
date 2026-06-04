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
// REGRAS DE HIGIENIZACAO DE TEXTO
// ============================================================

function numberToWordsPT(text: string): string {
  // Tabela de números mais comuns em propagandas/português
  const numMap: Record<string, string> = {
    '0': 'zero', '1': 'um', '2': 'dois', '3': 'três', '4': 'quatro',
    '5': 'cinco', '6': 'seis', '7': 'sete', '8': 'oito', '9': 'nove',
    '10': 'dez', '11': 'onze', '12': 'doze', '13': 'treze', '14': 'quatorze',
    '15': 'quinze', '16': 'dezesseis', '17': 'dezessete', '18': 'dezoito', '19': 'dezenove',
    '20': 'vinte', '30': 'trinta', '40': 'quarenta', '50': 'cinquenta',
    '60': 'sessenta', '70': 'setenta', '80': 'oitenta', '90': 'noventa',
    '100': 'cem', '200': 'duzentos', '300': 'trezentos', '400': 'quatrocentos',
    '500': 'quinhentos', '600': 'seiscentos', '700': 'setecentos',
    '800': 'oitocentos', '900': 'novecentos', '1000': 'mil',
  }

  // Converter valores monetários: R$ 1.500 -> mil e quinhentos reais
  let result = text.replace(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g, (match, numStr) => {
    const clean = numStr.replace(/\./g, '').replace(',', '.')
    const num = parseFloat(clean)
    return ` ${convertNumber(num)} reais `
  })

  // Converter porcentagens: 50% -> cinquenta por cento
  result = result.replace(/(\d+)%/g, (match, num) => {
    return ` ${convertNumber(parseInt(num))} por cento `
  })

  // Converter horários: 08h -> oito horas, 15h -> quinze horas
  result = result.replace(/(\d{1,2})h/g, (match, h) => {
    return ` ${convertNumber(parseInt(h))} horas `
  })

  // Converter números isolados e sequências comuns
  result = result.replace(/\b(\d+)\b/g, (match, num) => {
    const n = parseInt(num)
    if (n in numMap && n <= 1000) {
      return numMap[n]
    }
    // Numeros grandes: ler digito por digito
    return num.toString().split('').map(d => numMap[d] || d).join(', ')
  })

  return result
}

function convertNumber(n: number): string {
  const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove']
  const teens = ['dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove']
  const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa']

  if (n === 0) return 'zero'
  if (n < 0) return `menos ${convertNumber(Math.abs(n))}`

  if (n < 10) return units[n]
  if (n < 20) return teens[n - 10]
  if (n < 100) {
    const t = Math.floor(n / 10)
    const u = n % 10
    return u === 0 ? tens[t] : `${tens[t]} e ${units[u]}`
  }
  if (n < 1000) {
    const h = Math.floor(n / 100)
    const rest = n % 100
    if (rest === 0) return h === 1 ? 'cem' : `${units[h]}entos`
    return `${units[h]}entos e ${convertNumber(rest)}`
  }
  if (n < 1000000) {
    const m = Math.floor(n / 1000)
    const rest = n % 1000
    if (rest === 0) return m === 1 ? 'mil' : `${convertNumber(m)} mil`
    return `${convertNumber(m)} mil e ${convertNumber(rest)}`
  }
  // Acima de 1M, simplificar
  return n.toLocaleString('pt-BR')
}

function sanitizeText(text: string): string {
  let t = text

  // 1. Converter números e valores para texto por extenso
  t = numberToWordsPT(t)

  // 2. Adicionar espaços antes e depois de pontuações importantes
  t = t.replace(/([.,;:!?])\s*/g, ' $1 ')

  // 3. Limpar espaços múltiplos
  t = t.replace(/\s+/g, ' ').trim()

  // 4. Limpar espaços antes de vírgula/ ponto que ficaram grudados no inicio
  t = t.replace(/^\s*[.,;:!?]\s*/, '')

  return t
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
// GERAR VIA NATIVE API
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

    if (result.status === 'ok' && result.audio_base64) {
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
      // Buscar variação no banco (inclui voz e refText)
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
      debug.log('Clone Fast', 'ok', `Locutor Oficial: ${speakerFile}`)
    }

    // REMOVER SSML residual
    const textNoSSML = stripSSMLForTTS(text)

    // HIGIENIZAR TEXTO: espaçar pontuações + converter números
    const sanitizedText = sanitizeText(textNoSSML)
    debug.log('Sanitização', 'info', `Texto higienizado: "${sanitizedText.substring(0, 80)}..."`)

    // Buscar tunnel URL
    debug.log('Tunnel', 'info', 'Descobrindo URL do tunnel...')
    const tunnelUrl = await getTunnelUrl(debug)

    // =========================================================
    // MONTAR PAYLOAD COM 4 REGRAS APLICADAS
    // =========================================================

    // =========================================================
    // MONTAR PAYLOAD — clone_normal ou clone_fast (Locutor Oficial)
    // =========================================================
    
    const payload: Record<string, unknown> = isCloneFast
      ? {
          text: sanitizedText,
          voice_mode: 'clone_fast',
          speaker_id: speakerFile,
          guidance_scale: 1.5,
          num_step: numStep ?? 32,
          speed: speed ?? 1.0,
          language: language || 'Auto',
          denoise: true,
          postprocess_output: true,
          preprocess_prompt: true,
        }
      : {
          text: sanitizedText,
          voice_mode: 'clone',
          ref_audio_url: serverUrl,
          // REGRA 3: ref_text NUNCA vazio no modo clone
          ref_text: refText.trim() || 'texto de referencia para clonagem de voz',
          // REGRA 1: guidance_scale fixo em 1.5
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
