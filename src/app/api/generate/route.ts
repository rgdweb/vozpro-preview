import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Vercel serverless function timeout - TTS generation can take up to 3 minutes
export const maxDuration = 300

const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://k2-fsa-omnivoice.hf.space'

/**
 * Upload a reference audio to HuggingFace Space from a URL.
 * Downloads the audio from the given URL, then uploads it to HF Space.
 * Returns the HF path for Gradio FileData.
 */
async function uploadAudioToHF(audioUrl: string, fileName: string): Promise<string | null> {
  try {
    console.log('[Generate] Downloading ref audio from:', audioUrl.substring(0, 80))

    // Download the audio file
    const audioRes = await fetch(audioUrl)
    if (!audioRes.ok) {
      console.error('[Generate] Failed to download ref audio:', audioRes.status)
      return null
    }

    const audioBlob = await audioRes.blob()
    console.log('[Generate] Downloaded audio, size:', audioBlob.size, 'bytes')

    // Upload to HF Space
    const uploadForm = new FormData()
    uploadForm.append('files', audioBlob, fileName)

    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: 'POST',
      body: uploadForm,
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
 * Try to submit a TTS job to Gradio. Returns { eventId, gradioError }.
 */
async function submitToGradio(data: unknown[]): Promise<{ eventId: string | null; gradioError: string | null }> {
  const submitRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/_clone_fn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
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

    // Validate
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

    console.log('[Generate] Variation:', variation.label, '| Voice:', variation.voice.name)
    console.log('[Generate] refAudioPath (HF):', variation.refAudioPath)
    console.log('[Generate] refAudioServerUrl:', (variation as Record<string, unknown>).refAudioServerUrl || '(not set)')
    console.log('[Generate] refAudioName:', variation.refAudioName)
    console.log('[Generate] Text:', text.substring(0, 80) + (text.length > 80 ? '...' : ''))

    // Build instruct from voice settings + variation instruct
    let instructParts: string[] = []

    if (variation.voice.gender && variation.voice.gender !== 'Auto') {
      instructParts.push(variation.voice.gender.toLowerCase())
    }
    if (variation.voice.age && variation.voice.age !== 'Auto') {
      instructParts.push(variation.voice.age.toLowerCase())
    }
    if (variation.voice.pitch && variation.voice.pitch !== 'Auto') {
      instructParts.push(variation.voice.pitch.toLowerCase())
    }
    if (variation.voice.accent && variation.voice.accent !== 'Auto') {
      instructParts.push(variation.voice.accent.toLowerCase())
    }
    if (variation.instruct && variation.instruct.trim()) {
      instructParts.push(variation.instruct.trim())
    }

    const instructStr = instructParts.join(', ')

    console.log('[Generate] Instruct string:', instructStr || '(empty)')
    console.log('[Generate] Language:', language || 'Auto', '| Speed:', speed ?? 1.0, '| Steps:', numStep ?? 32, '| CFG:', guidanceScale ?? 2.0)

    // Get the permanent audio URL from our server
    const serverUrl = (variation as Record<string, unknown>).refAudioServerUrl as string || (variation as Record<string, unknown>).refAudioBlobUrl as string || ''
    const fileName = variation.refAudioName || 'ref_audio.wav'

    // ALWAYS re-upload from our permanent server to HF Space
    // This ensures the audio is always available, even if HF Space was restarted
    let refAudioPath: string | null = null

    if (serverUrl) {
      console.log('[Generate] Re-uploading audio from server to HF Space...')
      refAudioPath = await uploadAudioToHF(serverUrl, fileName)
      if (refAudioPath) {
        // Update the HF path in DB (it may have changed)
        await db.voiceVariation.update({
          where: { id: variation.id },
          data: { refAudioPath },
        })
        console.log('[Generate] Updated refAudioPath in DB:', refAudioPath)
      }
    } else if (variation.refAudioPath) {
      // Fallback: try using the existing HF path (may or may not work)
      console.log('[Generate] No server URL, trying existing HF path...')
      refAudioPath = variation.refAudioPath
    }

    if (!refAudioPath) {
      return NextResponse.json(
        { error: 'Áudio de referência não disponível. Reenvie o áudio de referência na variação.' },
        { status: 400 }
      )
    }

    // Build the ref audio FileData object for Gradio
    const refAudioFileData = {
      path: refAudioPath,
      orig_name: fileName,
      mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
      is_stream: false,
      meta: { _type: 'gradio.FileData' },
    }

    // Build clone mode parameters
    const data = [
      text,                                           // [0] text
      language || 'Auto',                             // [1] language
      refAudioFileData,                               // [2] ref_audio
      variation.refText || '',                        // [3] ref_text
      instructStr,                                    // [4] instruct
      numStep ?? 32,                                  // [5] num_step
      guidanceScale ?? 2.0,                           // [6] guidance_scale
      true,                                           // [7] denoise
      speed ?? 1.0,                                   // [8] speed
      null,                                           // [9] duration
      true,                                           // [10] preprocess_prompt
      true,                                           // [11] postprocess_output
    ]

    // Step 1: Submit the job to Gradio queue
    console.log('[Generate] Submitting to Gradio clone_fn...')
    let submitResult = await submitToGradio(data)

    // If first attempt failed and we have a server URL, retry once with a fresh upload
    if (!submitResult.eventId && serverUrl) {
      console.log('[Generate] First submit failed, retrying with fresh upload...')
      const retryPath = await uploadAudioToHF(serverUrl, fileName)
      if (retryPath) {
        const retryFileData = {
          path: retryPath,
          orig_name: fileName,
          mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
          is_stream: false,
          meta: { _type: 'gradio.FileData' },
        }
        data[2] = retryFileData
        submitResult = await submitToGradio(data)
      }
    }

    if (submitResult.gradioError) {
      console.error('[Generate] Submit error:', submitResult.gradioError)
      return NextResponse.json(
        { error: `Falha ao enviar para o servidor de IA: ${submitResult.gradioError}` },
        { status: 502 }
      )
    }

    const eventId = submitResult.eventId
    console.log('[Generate] Got event_id:', eventId)

    if (!eventId) {
      return NextResponse.json(
        { error: 'Nenhum event_id retornado do servidor' },
        { status: 502 }
      )
    }

    // Step 2: Poll for the result using SSE stream
    console.log('[Generate] Polling for result...')
    const maxAttempts = 120
    let voiceAudioUrl: string | null = null
    let attemptCount = 0

    for (let i = 0; i < maxAttempts; i++) {
      attemptCount = i + 1
      if (i % 10 === 0) console.log(`[Generate] Poll attempt ${i + 1}/${maxAttempts}...`)
      const resultRes = await fetch(
        `${HF_SPACE_URL}/gradio_api/call/_clone_fn/${eventId}`,
        { headers: { 'Accept': 'text/event-stream' } }
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
              return NextResponse.json(
                { error: 'Formato de resposta inesperado' },
                { status: 502 }
              )
            }

            const audioOutput = resultData[0]
            if (audioOutput?.url) {
              voiceAudioUrl = audioOutput.url
              console.log('[Generate] Audio URL (direct):', voiceAudioUrl)
            } else if (audioOutput?.path) {
              voiceAudioUrl = `${HF_SPACE_URL}/gradio_api/file=${audioOutput.path}`
              console.log('[Generate] Audio URL (from path):', voiceAudioUrl)
            }

            if (!voiceAudioUrl) {
              console.error('[Generate] No audio URL found in response:', JSON.stringify(resultData))
              return NextResponse.json(
                { error: 'Nenhum áudio gerado pela IA' },
                { status: 500 }
              )
            }
          } catch (parseErr) {
            console.error('[Generate] Parse error:', parseErr, eventData)
            return NextResponse.json(
              { error: 'Erro ao processar resposta do servidor' },
              { status: 502 }
            )
          }
        }

        if (eventType === 'error') {
          console.error('[Generate] Error event from Gradio:', eventData)
          if (eventData && eventData !== 'null') {
            try {
              const errData = JSON.parse(eventData)
              return NextResponse.json(
                { error: errData.error || 'Falha na geração' },
                { status: 500 }
              )
            } catch {
              // fall through
            }
          }
          return NextResponse.json(
            { error: 'Erro na geração. Verifique se o áudio de referência é válido (3-10 segundos, formato WAV/MP3).' },
            { status: 500 }
          )
        }

        if (eventType === 'heartbeat') {
          break
        }
      }

      if (voiceAudioUrl) break
      await new Promise(r => setTimeout(r, 1500))
    }

    console.log(`[Generate] Polling completed after ${attemptCount} attempts, voiceAudioUrl:`, voiceAudioUrl ? 'FOUND' : 'NULL')

    if (!voiceAudioUrl) {
      console.error('[Generate] Timeout - no audio URL after', maxAttempts, 'attempts')
      return NextResponse.json({ error: 'Tempo limite excedido na geração' }, { status: 504 })
    }

    // Step 3: Download voice audio and return as base64
    console.log('[Generate] Downloading voice audio for client delivery...')
    const voiceRes = await fetch(voiceAudioUrl)
    const voiceBuffer = Buffer.from(await voiceRes.arrayBuffer())
    const voiceBase64 = voiceBuffer.toString('base64')

    // Determine audio MIME type from URL or default to wav
    const voiceMimeType = voiceAudioUrl.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
    const voiceDataUri = `data:${voiceMimeType};base64,${voiceBase64}`

    // If track is requested, return the track URL for client-side mixing
    if (trackId) {
      const track = await db.track.findUnique({ where: { id: trackId } })
      console.log('[Generate] Track requested:', track?.name, '| Volume:', trackVolume)

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

    // No track - return voice audio only
    return NextResponse.json({
      audioUrl: voiceDataUri,
      mixed: false,
    })
  } catch (error) {
    console.error('[Generate] API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
