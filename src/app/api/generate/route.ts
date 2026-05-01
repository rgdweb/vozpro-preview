import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Vercel serverless function timeout - TTS generation can take up to 3 minutes
export const maxDuration = 300

const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://k2-fsa-omnivoice.hf.space'

/**
 * Download audio from a URL and upload to HuggingFace Space.
 * Returns the HF path for Gradio FileData.
 */
async function uploadAudioToHF(audioUrl: string, fileName: string): Promise<string | null> {
  try {
    console.log('[Generate] Downloading ref audio from:', audioUrl.substring(0, 100))

    const audioRes = await fetch(audioUrl, {
      signal: AbortSignal.timeout(30000), // 30s timeout for download
    })
    if (!audioRes.ok) {
      console.error('[Generate] Failed to download ref audio:', audioRes.status)
      return null
    }

    const audioBlob = await audioRes.blob()
    console.log('[Generate] Downloaded audio, size:', audioBlob.size, 'bytes')

    if (audioBlob.size < 1000) {
      console.error('[Generate] Audio file too small:', audioBlob.size)
      return null
    }

    // Upload to HF Space
    const uploadForm = new FormData()
    uploadForm.append('files', audioBlob, fileName)

    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: 'POST',
      body: uploadForm,
      signal: AbortSignal.timeout(30000), // 30s timeout for upload
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[Generate] Upload to HF failed:', uploadRes.status, errText)
      return null
    }

    const uploadData = await uploadRes.json()
    if (Array.isArray(uploadData) && uploadData.length > 0) {
      console.log('[Generate] Upload to HF successful:', uploadData[0])
      return uploadData[0]
    }

    return null
  } catch (err) {
    console.error('[Generate] Upload to HF error:', err)
    return null
  }
}

/**
 * Submit a TTS job to Gradio queue.
 */
async function submitToGradio(data: unknown[]): Promise<{ eventId: string | null; gradioError: string | null }> {
  const submitRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/_clone_fn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(15000),
  })

  if (!submitRes.ok) {
    const errText = await submitRes.text()
    return { eventId: null, gradioError: `HTTP ${submitRes.status}: ${errText}` }
  }

  const submitData = await submitRes.json()
  return { eventId: submitData.event_id, gradioError: null }
}

// POST /api/generate - Generate TTS audio
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { variationId, text, language, trackId, trackVolume, speed, numStep, guidanceScale } = body

    // Validate inputs
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto é obrigatório' }, { status: 400 })
    }
    if (!variationId) {
      return NextResponse.json({ error: 'Selecione uma variação de voz' }, { status: 400 })
    }

    // Get the voice variation
    const variation = await db.voiceVariation.findUnique({
      where: { id: variationId },
      include: { voice: true },
    })

    if (!variation) {
      return NextResponse.json({ error: 'Variação de voz não encontrada' }, { status: 404 })
    }

    // Cast to access new fields that Prisma may not have typed yet
    const variationAny = variation as unknown as Record<string, string>
    const serverUrl = variationAny.refAudioServerUrl || variationAny.refAudioBlobUrl || ''
    const fileName = variation.refAudioName || 'ref_audio.wav'

    console.log('[Generate] === NEW GENERATION REQUEST ===')
    console.log('[Generate] Variation:', variation.label, '| Voice:', variation.voice.name)
    console.log('[Generate] serverUrl:', serverUrl ? serverUrl.substring(0, 80) + '...' : '(EMPTY)')
    console.log('[Generate] refAudioPath (HF):', variation.refAudioPath || '(empty)')
    console.log('[Generate] Text:', text.substring(0, 80))

    // CHECK: Do we have an audio source at all?
    if (!serverUrl && !variation.refAudioPath) {
      return NextResponse.json({
        error: 'Áudio de referência não encontrado. Por favor, reenvie o áudio de referência no painel admin.',
      }, { status: 400 })
    }

    // STEP 1: Always try to get a fresh HF path
    let refAudioPath: string | null = null

    if (serverUrl) {
      console.log('[Generate] Step 1: Re-uploading audio from server to HF Space...')
      refAudioPath = await uploadAudioToHF(serverUrl, fileName)

      if (refAudioPath) {
        // Update the HF path in DB
        await db.voiceVariation.update({
          where: { id: variation.id },
          data: { refAudioPath },
        })
        console.log('[Generate] Step 1 OK: HF path updated:', refAudioPath)
      } else {
        console.error('[Generate] Step 1 FAILED: Could not download/upload audio from server')
        return NextResponse.json({
          error: 'Não foi possível baixar o áudio de referência do servidor. Verifique se o servidor de áudios está configurado e o arquivo existe.',
        }, { status: 502 })
      }
    } else {
      // No server URL - use the existing HF path (may be expired)
      console.log('[Generate] WARNING: No server URL, using existing HF path (may be expired)')
      refAudioPath = variation.refAudioPath
    }

    if (!refAudioPath) {
      return NextResponse.json({
        error: 'Áudio de referência indisponível. Reenvie o áudio no painel admin.',
      }, { status: 400 })
    }

    // Build instruct
    const instructParts: string[] = []
    if (variation.voice.gender && variation.voice.gender !== 'Auto') instructParts.push(variation.voice.gender.toLowerCase())
    if (variation.voice.age && variation.voice.age !== 'Auto') instructParts.push(variation.voice.age.toLowerCase())
    if (variation.voice.pitch && variation.voice.pitch !== 'Auto') instructParts.push(variation.voice.pitch.toLowerCase())
    if (variation.voice.accent && variation.voice.accent !== 'Auto') instructParts.push(variation.voice.accent.toLowerCase())
    if (variation.instruct && variation.instruct.trim()) instructParts.push(variation.instruct.trim())
    const instructStr = instructParts.join(', ')

    // Build the ref audio FileData
    const refAudioFileData = {
      path: refAudioPath,
      orig_name: fileName,
      mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
      is_stream: false,
      meta: { _type: 'gradio.FileData' },
    }

    // Build parameters
    const data = [
      text,                        // [0] text
      language || 'Auto',          // [1] language
      refAudioFileData,            // [2] ref_audio
      variation.refText || '',     // [3] ref_text
      instructStr,                 // [4] instruct
      numStep ?? 32,               // [5] num_step
      guidanceScale ?? 2.0,        // [6] guidance_scale
      true,                        // [7] denoise
      speed ?? 1.0,                // [8] speed
      null,                        // [9] duration
      true,                        // [10] preprocess_prompt
      true,                        // [11] postprocess_output
    ]

    // STEP 2: Submit to Gradio
    console.log('[Generate] Step 2: Submitting to Gradio clone_fn...')
    const submitResult = await submitToGradio(data)

    if (submitResult.gradioError) {
      console.error('[Generate] Step 2 FAILED:', submitResult.gradioError)
      return NextResponse.json({
        error: `Falha ao enviar para o servidor de IA: ${submitResult.gradioError}`,
      }, { status: 502 })
    }

    const eventId = submitResult.eventId
    if (!eventId) {
      console.error('[Generate] Step 2 FAILED: No event_id returned')
      return NextResponse.json({
        error: 'Servidor de IA não retornou confirmação. Tente novamente.',
      }, { status: 502 })
    }

    console.log('[Generate] Step 2 OK: event_id =', eventId)

    // STEP 3: Poll for result
    console.log('[Generate] Step 3: Polling for result (max 90 attempts)...')
    const maxAttempts = 90
    let voiceAudioUrl: string | null = null
    let lastError = ''

    for (let i = 0; i < maxAttempts; i++) {
      if (i % 10 === 0) console.log(`[Generate] Poll ${i + 1}/${maxAttempts}...`)

      try {
        const resultRes = await fetch(
          `${HF_SPACE_URL}/gradio_api/call/_clone_fn/${eventId}`,
          {
            headers: { 'Accept': 'text/event-stream' },
            signal: AbortSignal.timeout(10000),
          }
        )

        if (!resultRes.ok) {
          await new Promise(r => setTimeout(r, 2000))
          continue
        }

        const resultText = await resultRes.text()
        const eventBlocks = resultText.split('\n\n').filter(Boolean)

        for (const block of eventBlocks) {
          const lines = block.split('\n')
          const eventLine = lines.find(l => l.startsWith('event:'))
          const dataLine = lines.find(l => l.startsWith('data:'))
          const eventType = eventLine?.replace('event: ', '').trim()
          const eventData = dataLine?.slice(6).trim()

          if (eventType === 'complete' && eventData) {
            console.log('[Generate] Got complete event!')
            try {
              const resultData = JSON.parse(eventData)
              if (!Array.isArray(resultData) || resultData.length < 2) {
                lastError = 'Formato de resposta inesperado do servidor'
                break
              }

              const audioOutput = resultData[0]
              if (audioOutput?.url) {
                voiceAudioUrl = audioOutput.url
              } else if (audioOutput?.path) {
                voiceAudioUrl = `${HF_SPACE_URL}/gradio_api/file=${audioOutput.path}`
              }

              if (!voiceAudioUrl) {
                lastError = 'Servidor não retornou áudio'
              }
            } catch (parseErr) {
              lastError = 'Erro ao processar resposta: ' + String(parseErr)
            }
            break
          }

          if (eventType === 'error') {
            console.error('[Generate] Error event from Gradio:', eventData)
            lastError = eventData || 'Erro desconhecido do servidor de IA'
            if (eventData && eventData !== 'null') {
              try {
                const errData = JSON.parse(eventData)
                lastError = errData.error || lastError
              } catch {}
            }
            break
          }

          if (eventType === 'heartbeat') {
            console.log('[Generate] Heartbeat received, breaking poll')
            break
          }
        }

        if (voiceAudioUrl || lastError) break
      } catch (pollErr) {
        console.log(`[Generate] Poll ${i + 1} error:`, String(pollErr))
      }

      await new Promise(r => setTimeout(r, 2000))
    }

    // STEP 4: Return result
    if (voiceAudioUrl) {
      console.log('[Generate] Step 3 OK: Got audio URL')

      // Download audio and return as base64
      try {
        console.log('[Generate] Step 4: Downloading generated audio...')
        const voiceRes = await fetch(voiceAudioUrl, { signal: AbortSignal.timeout(30000) })
        const voiceBuffer = Buffer.from(await voiceRes.arrayBuffer())
        const voiceBase64 = voiceBuffer.toString('base64')
        const voiceMimeType = voiceAudioUrl.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
        const voiceDataUri = `data:${voiceMimeType};base64,${voiceBase64}`

        console.log('[Generate] DONE! Audio size:', voiceBuffer.length, 'bytes')

        // If track is requested, return track info for client-side mixing
        if (trackId) {
          const track = await db.track.findUnique({ where: { id: trackId } })
          if (track?.audioPath) {
            return NextResponse.json({
              audioUrl: voiceDataUri,
              trackUrl: track.audioPath,
              trackVolume: trackVolume ?? 0.3,
              trackName: track.name,
              mixed: false,
              clientMix: true,
            })
          }
        }

        return NextResponse.json({ audioUrl: voiceDataUri, mixed: false })
      } catch (dlErr) {
        console.error('[Generate] Step 4 FAILED:', dlErr)
        return NextResponse.json({
          error: 'Erro ao baixar o áudio gerado. Tente novamente.',
        }, { status: 500 })
      }
    }

    // No audio - return detailed error
    console.error('[Generate] FAILED after polling. Last error:', lastError)
    if (lastError) {
      return NextResponse.json({
        error: `Falha na geração: ${lastError}`,
      }, { status: 500 })
    }

    return NextResponse.json({
      error: 'Tempo limite excedido. O servidor de IA demorou muito para responder. Tente novamente.',
    }, { status: 504 })
  } catch (error) {
    console.error('[Generate] UNEXPECTED ERROR:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
