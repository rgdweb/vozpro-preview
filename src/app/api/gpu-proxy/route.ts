/**
 * GPU Proxy — recebe o body do frontend (camelCase), converte pro formato do GPU (snake_case),
 * e repassa via WireGuard. Mesma conversão que o tunnel-generate fazia.
 */
import { NextRequest, NextResponse } from 'next/server'

const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Converter camelCase do frontend → snake_case do GPU (mesma lógica do tunnel-generate)
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
    if (body.speakerFile) {
      gpuBody.speaker_id = body.speakerFile
    }
    if (body.targetDuration) {
      gpuBody.target_duration = body.targetDuration
    }

    const gpuUrl = `${GPU_DIRECT_URL}/api/native-generate`

    const res = await fetch(gpuUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gpuBody),
      signal: AbortSignal.timeout(180000),
    })

    const result = await res.json()
    return NextResponse.json(result, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
