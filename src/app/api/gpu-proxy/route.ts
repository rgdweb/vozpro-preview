/**
 * GPU Proxy — recebe body do frontend (camelCase), converte pro GPU (snake_case),
 * e repassa via WireGuard. Com retry em caso de falha.
 */
import { NextRequest, NextResponse } from 'next/server'

const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Converter camelCase do frontend → snake_case do GPU
    const gpuBody: Record<string, unknown> = {
      text: body.text,
      voice_mode: body.voiceMode || 'clone',
      ref_audio_url: body.referenceAudioUrl || body.refAudioUrl || '',
      ref_audio_base64: body.referenceAudioBase64 || body.refAudioBase64 || '',
      ref_audio_name: body.referenceAudioName || body.refAudioName || '',
      ref_text: body.refText || '',
      instruct: body.instruct || '',
      language: body.language || 'Auto',
      speed: body.speed ?? 1.0,
      num_step: body.numStep ?? 32,
      guidance_scale: body.guidanceScale ?? 2.0,
      denoise: body.denoise ?? true,
      postprocess_output: body.postprocessOutput ?? true,
      preprocess_prompt: body.preprocessPrompt ?? true,
    }
    if (body.targetDuration) {
      gpuBody.target_duration = body.targetDuration
    }

    const gpuUrl = `${GPU_DIRECT_URL}/api/native-generate`

    // Tentar até 2x (1 retry)
    let lastError = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(gpuUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gpuBody),
          signal: AbortSignal.timeout(180000),
        })

        const result = await res.json()

        // Se o GPU retornou erro de "nao encontrado", retry pode resolver (timeout de download)
        if (result.status === 'error' && attempt === 0) {
          lastError = result.error || 'Erro desconhecido'
          console.warn(`[gpu-proxy] Tentativa ${attempt + 1} falhou: ${lastError}. Retentando...`)
          await new Promise(r => setTimeout(r, 2000))
          continue
        }

        return NextResponse.json(result, { status: res.status })
      } catch (fetchErr) {
        lastError = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        if (attempt === 0) {
          console.warn(`[gpu-proxy] Fetch falhou: ${lastError}. Retentando...`)
          await new Promise(r => setTimeout(r, 3000))
          continue
        }
      }
    }

    return NextResponse.json({ error: `GPU falhou após retry: ${lastError}` }, { status: 502 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
