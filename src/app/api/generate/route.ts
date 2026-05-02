import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Vercel serverless function timeout - TTS generation can take up to 3 minutes
export const maxDuration = 300

const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://k2-fsa-omnivoice.hf.space'

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
 * Upload a reference audio to HuggingFace Space from a URL.
 */
async function uploadAudioToHF(audioUrl: string, fileName: string, debug: ReturnType<typeof createDebug>): Promise<string | null> {
  try {
    debug.log('Download ref audio', 'info', `from: ${audioUrl.substring(0, 80)}`)

    const audioRes = await fetch(audioUrl)
    if (!audioRes.ok) {
      debug.log('Download ref audio', 'error', `HTTP ${audioRes.status} - ${audioRes.statusText}`)
      return null
    }

    const audioBlob = await audioRes.blob()
    debug.log('Download ref audio', 'ok', `${(audioBlob.size / 1024).toFixed(1)}KB baixado`)

    const uploadForm = new FormData()
    uploadForm.append('files', audioBlob, fileName)

    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: 'POST',
      body: uploadForm,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      debug.log('Upload to HF', 'error', `HTTP ${uploadRes.status}: ${errText.substring(0, 200)}`)
      return null
    }

    const uploadData = await uploadRes.json()
    if (Array.isArray(uploadData) && uploadData.length > 0) {
      debug.log('Upload to HF', 'ok', `path: ${uploadData[0]}`)
      return uploadData[0]
    }

    debug.log('Upload to HF', 'error', 'Resposta inesperada do upload')
    return null
  } catch (err) {
    debug.log('Upload to HF', 'error', err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * Submit TTS job to Gradio.
 */
async function submitToGradio(data: unknown[], debug: ReturnType<typeof createDebug>): Promise<{ eventId: string | null; gradioError: string | null }> {
  const submitRes = await fetch(`${HF_SPACE_URL}/gradio_api/call/_clone_fn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  })

  if (!submitRes.ok) {
    const errText = await submitRes.text()
    debug.log('Submit to Gradio', 'error', `HTTP ${submitRes.status}: ${errText.substring(0, 300)}`)
    return { eventId: null, gradioError: `HTTP ${submitRes.status}: ${errText}` }
  }

  const submitData = await submitRes.json()
  const eventId = submitData.event_id
  debug.log('Submit to Gradio', eventId ? 'ok' : 'error', eventId ? `event_id: ${eventId}` : 'sem event_id retornado')
  return { eventId, gradioError: null }
}

/**
 * Check if HF Space is awake.
 */
async function checkHFStatus(debug: ReturnType<typeof createDebug>): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await fetch(`${HF_SPACE_URL}/info`, { signal: AbortSignal.timeout(5000) })
    if (res.ok) {
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('application/json')) {
        const info = await res.json()
        debug.log('HF Space status', 'ok', `Model: ${info?.model_name || info?.model || 'loaded'}`)
        return { ok: true, detail: JSON.stringify(info).substring(0, 200) }
      }
    }
    debug.log('HF Space status', 'warn', `Space acordando ou em manutencao (HTTP ${res.status})`)
    return { ok: false, detail: `HTTP ${res.status} - space pode estar acordando` }
  } catch (err) {
    debug.log('HF Space status', 'warn', `Sem resposta (timeout 5s) - space pode estar acordando, continuando...`)
    return { ok: false, detail: 'Sem resposta - continuando mesmo assim' }
  }
}

// POST /api/generate - Generate TTS audio
export async function POST(req: NextRequest) {
  const debug = createDebug()

  try {
    const body = await req.json()
    const { variationId, text, language, trackId, trackVolume, speed, numStep, guidanceScale } = body

    // Validate
    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Texto é obrigatório', debug: debug.result() }, { status: 400 })
    }

    if (!variationId) {
      return NextResponse.json({ error: 'Selecione uma variação de voz', debug: debug.result() }, { status: 400 })
    }

    // Get the voice variation
    const variation = await db.voiceVariation.findUnique({
      where: { id: variationId },
      include: { voice: true },
    })

    if (!variation) {
      debug.log('Busca variação', 'error', `ID: ${variationId} não encontrado`)
      return NextResponse.json({ error: 'Variação de voz não encontrada', debug: debug.result() }, { status: 404 })
    }

    debug.log('Variação encontrada', 'ok', `${variation.label} (voz: ${variation.voice.name})`)
    debug.log('Áudio ref', 'info', `serverUrl: ${((variation as Record<string, unknown>).refAudioServerUrl as string) || 'NÃO DEFINIDO'}`)
    debug.log('Áudio ref', 'info', `hfPath: ${variation.refAudioPath || 'NENHUM'}`)
    debug.log('Áudio ref', 'info', `fileName: ${variation.refAudioName || 'NENHUM'}`)
    debug.log('Texto', 'info', `${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`)

    // Check HF Space status first
    const hfStatus = await checkHFStatus(debug)

    // Build instruct
    let instructParts: string[] = []
    if (variation.voice.gender && variation.voice.gender !== 'Auto') instructParts.push(variation.voice.gender.toLowerCase())
    if (variation.voice.age && variation.voice.age !== 'Auto') instructParts.push(variation.voice.age.toLowerCase())
    if (variation.voice.pitch && variation.voice.pitch !== 'Auto') instructParts.push(variation.voice.pitch.toLowerCase())
    if (variation.voice.accent && variation.voice.accent !== 'Auto') instructParts.push(variation.voice.accent.toLowerCase())
    if (variation.instruct && variation.instruct.trim()) instructParts.push(variation.instruct.trim())
    const instructStr = instructParts.join(', ')
    debug.log('Instruct', 'info', instructStr || '(vazio)')
    debug.log('Parâmetros', 'info', `lang: ${language || 'Auto'} | speed: ${speed ?? 1.0} | steps: ${numStep ?? 32} | cfg: ${guidanceScale ?? 2.0}`)

    // Get permanent audio URL
    const serverUrl = (variation as Record<string, unknown>).refAudioServerUrl as string || (variation as Record<string, unknown>).refAudioBlobUrl as string || ''
    const fileName = variation.refAudioName || 'ref_audio.wav'

    // Re-upload to HF
    let refAudioPath: string | null = null

    if (serverUrl) {
      debug.log('Re-upload audio', 'info', 'Enviando do servidor PHP para HF Space...')
      refAudioPath = await uploadAudioToHF(serverUrl, fileName, debug)
      if (refAudioPath) {
        await db.voiceVariation.update({
          where: { id: variation.id },
          data: { refAudioPath },
        })
        debug.log('Re-upload audio', 'ok', 'Atualizado no DB')
      } else {
        debug.log('Re-upload audio', 'warn', 'Falhou! Tentando path existente...')
      }
    } else {
      debug.log('Re-upload audio', 'warn', 'Sem serverUrl! Usando path HF existente')
    }

    if (!refAudioPath && variation.refAudioPath) {
      refAudioPath = variation.refAudioPath
      debug.log('Fallback HF path', 'info', `Usando: ${refAudioPath}`)
    }

    if (!refAudioPath) {
      debug.log('Audio ref FINAL', 'error', 'Nenhum audio disponivel para envio ao Gradio')
      return NextResponse.json(
        { error: 'Áudio de referência não disponível. Reenvie o áudio de referência na variação.', debug: debug.result() },
        { status: 400 }
      )
    }

    // Build Gradio params
    const refAudioFileData = {
      path: refAudioPath,
      orig_name: fileName,
      mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
      is_stream: false,
      meta: { _type: 'gradio.FileData' },
    }

    const data = [
      text,
      language || 'Auto',
      refAudioFileData,
      variation.refText || '',
      instructStr,
      numStep ?? 32,
      guidanceScale ?? 2.0,
      true,   // denoise
      speed ?? 1.0,
      null,   // duration
      true,   // preprocess_prompt
      true,   // postprocess_output
    ]

    // Submit with retry
    debug.log('Submit job', 'info', 'Enviando para Gradio...')
    let submitResult = await submitToGradio(data, debug)

    if (!submitResult.eventId) {
      for (let retry = 1; retry <= 3; retry++) {
        debug.log('Retry', 'warn', `Tentativa ${retry}/3 - aguardando 5s...`)
        await new Promise(r => setTimeout(r, 5000))

        if (serverUrl) {
          const retryPath = await uploadAudioToHF(serverUrl, fileName, debug)
          if (retryPath) {
            data[2] = {
              path: retryPath,
              orig_name: fileName,
              mime_type: fileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
              is_stream: false,
              meta: { _type: 'gradio.FileData' },
            }
          }
        }

        submitResult = await submitToGradio(data, debug)
        if (submitResult.eventId) {
          debug.log('Retry', 'ok', `Sucesso na tentativa ${retry}!`)
          break
        }
      }
    }

    if (submitResult.gradioError) {
      debug.log('FINAL', 'error', `Gradio rejeitou: ${submitResult.gradioError.substring(0, 200)}`)
      return NextResponse.json(
        { error: `Falha ao enviar para o servidor de IA: ${submitResult.gradioError}`, debug: debug.result() },
        { status: 502 }
      )
    }

    const eventId = submitResult.eventId
    if (!eventId) {
      debug.log('FINAL', 'error', 'Sem event_id apos retries')
      return NextResponse.json(
        { error: 'Nenhum event_id retornado apos tentativas', debug: debug.result() },
        { status: 502 }
      )
    }

    // Poll for result
    debug.log('Polling', 'info', `event_id: ${eventId}`)
    const maxAttempts = 120
    let voiceAudioUrl: string | null = null
    let attemptCount = 0
    let lastGradioError: string | null = null

    for (let i = 0; i < maxAttempts; i++) {
      attemptCount = i + 1

      const resultRes = await fetch(
        `${HF_SPACE_URL}/gradio_api/call/_clone_fn/${eventId}`,
        { headers: { 'Accept': 'text/event-stream' } }
      )

      let eventBlocks: string[] = []
      
      if (resultRes.status === 404) {
        // 404 = event_id perdido (worker crashou/reiniciou)
        debug.log('Poll', 'error', `404 - event_id ${eventId} perdido (worker crashou?)`)
        eventBlocks = ['event: error\ndata: "404: Not Found - event_id lost"']
      } else if (!resultRes.ok) {
        if (i % 10 === 0) debug.log('Poll', 'warn', `HTTP ${resultRes.status} na tentativa ${i + 1}`)
        await new Promise(r => setTimeout(r, 2000))
        continue
      } else {
        const resultText = await resultRes.text()
        eventBlocks = resultText.split('\n\n').filter(Boolean)
      }

      for (const block of eventBlocks) {
        const lines = block.split('\n')
        const eventLine = lines.find(l => l.startsWith('event:'))
        const dataLine = lines.find(l => l.startsWith('data:'))
        const eventType = eventLine?.replace('event: ', '').trim()
        const eventData = dataLine?.slice(6).trim()

        if (eventType === 'complete' && eventData) {
          debug.log('Poll', 'ok', `Complete na tentativa ${i + 1} (${((i + 1) * 1.5).toFixed(0)}s)`)
          try {
            const resultData = JSON.parse(eventData)
            if (!Array.isArray(resultData) || resultData.length < 2) {
              debug.log('Parse result', 'error', `Formato inesperado: ${JSON.stringify(resultData).substring(0, 200)}`)
              return NextResponse.json(
                { error: 'Formato de resposta inesperado', debug: debug.result() },
                { status: 502 }
              )
            }

            const audioOutput = resultData[0]
            if (audioOutput?.url) {
              voiceAudioUrl = audioOutput.url
            } else if (audioOutput?.path) {
              voiceAudioUrl = `${HF_SPACE_URL}/gradio_api/file=${audioOutput.path}`
            }

            if (voiceAudioUrl) {
              debug.log('Audio gerado', 'ok', voiceAudioUrl.substring(0, 100))
            } else {
              debug.log('Audio gerado', 'error', `Sem URL no output: ${JSON.stringify(resultData).substring(0, 200)}`)
              return NextResponse.json(
                { error: 'Nenhum áudio gerado pela IA', debug: debug.result() },
                { status: 500 }
              )
            }
          } catch (parseErr) {
            debug.log('Parse result', 'error', `${parseErr instanceof Error ? parseErr.message : String(parseErr)} | raw: ${eventData.substring(0, 100)}`)
            return NextResponse.json(
              { error: 'Erro ao processar resposta do servidor', debug: debug.result() },
              { status: 502 }
            )
          }
        }

        if (eventType === 'error') {
          debug.log('Gradio ERROR', 'error', `Raw: ${eventData?.substring(0, 500) || 'vazio'}`)
          
          // If Gradio returns null error (generic rejection), retry entire flow
          // This often happens when the HF Space was sleeping or the uploaded file got corrupted
          const isNullError = !eventData || eventData === 'null'
          const is404Error = eventData?.includes('404')
          
          if (isNullError || is404Error) {
            debug.log('Gradio retry', 'warn', `${isNullError ? 'Null' : '404'} detectado - job perdido/crashed, reiniciando job completo...`)
            await new Promise(r => setTimeout(r, 3000))
            
            // Full retry loop (up to 2 additional times)
            for (let retryIdx = 0; retryIdx < 2 && !voiceAudioUrl; retryIdx++) {
              debug.log('Gradio retry', 'info', `Tentativa ${retryIdx + 1}/2`)
              
              // Re-upload audio with fresh unique name
              const freshFileName = `retry_${Date.now()}_${fileName}`
              if (serverUrl) {
                const freshPath = await uploadAudioToHF(serverUrl, freshFileName, debug)
                if (freshPath) {
                  data[2] = {
                    path: freshPath,
                    orig_name: freshFileName,
                    mime_type: freshFileName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav',
                    is_stream: false,
                    meta: { _type: 'gradio.FileData' },
                  }
                } else {
                  debug.log('Gradio retry', 'warn', 'Re-upload falhou, tentando mesmo assim...')
                }
              }
              
              // Fresh submit
              const retrySubmit = await submitToGradio(data, debug)
              if (!retrySubmit.eventId) {
                await new Promise(r => setTimeout(r, 5000 * (retryIdx + 1)))
                continue
              }
              
              const newEventId = retrySubmit.eventId
              debug.log('Gradio retry', 'ok', `Novo event_id: ${newEventId}, pollando...`)
              
              // Poll the new event with timeout
              for (let j = 0; j < 60; j++) {
                await new Promise(r => setTimeout(r, 2000))
                const retryRes = await fetch(
                  `${HF_SPACE_URL}/gradio_api/call/_clone_fn/${newEventId}`,
                  { headers: { 'Accept': 'text/event-stream' } }
                )
                if (!retryRes.ok) continue
                const retryText = await retryRes.text()
                const retryBlocks = retryText.split('\n\n').filter(Boolean)
                for (const rBlock of retryBlocks) {
                  const rLines = rBlock.split('\n')
                  const rEventType = rLines.find(l => l.startsWith('event:'))?.replace('event: ', '').trim()
                  const rEventData = rLines.find(l => l.startsWith('data:'))?.slice(6).trim()
                  
                  if (rEventType === 'complete' && rEventData) {
                    debug.log('Gradio retry', 'ok', `Geracao completou apos retry ${retryIdx + 1}!`)
                    try {
                      const rResult = JSON.parse(rEventData)
                      const rAudio = rResult[0]
                      if (rAudio?.url) voiceAudioUrl = rAudio.url
                      else if (rAudio?.path) voiceAudioUrl = `${HF_SPACE_URL}/gradio_api/file=${rAudio.path}`
                    } catch {}
                  }
                  if (rEventType === 'error') {
                    debug.log('Gradio retry', 'warn', `Erro no retry ${retryIdx + 1}: ${rEventData?.substring(0, 300) || 'null'}`)
                    // If it's a non-null error, stop retrying
                    if (rEventData && rEventData !== 'null' && !rEventData.includes('404')) {
                      let retryErrorMsg = 'Erro na geracao pelo servidor de IA'
                      try {
                        const errParsed = JSON.parse(rEventData)
                        retryErrorMsg = errParsed.error || errParsed.message || retryErrorMsg
                      } catch {}
                      lastGradioError = retryErrorMsg
                      break
                    }
                  }
                  // Ignore heartbeat - keep polling
                  if (rEventType === 'heartbeat') continue
                }
                if (voiceAudioUrl || lastGradioError) break
              }
            }
            
            if (voiceAudioUrl) break
          }
          
          if (!voiceAudioUrl) {
            let errorMsg = 'Erro na geração pelo servidor de IA.'
            if (eventData && eventData !== 'null') {
              try {
                const errData = JSON.parse(eventData)
                errorMsg = errData.error || errData.message || errorMsg
              } catch {
                if (eventData.length > 5 && eventData.length < 500) {
                  errorMsg = eventData
                }
              }
            }
            return NextResponse.json({ error: errorMsg, debug: debug.result() }, { status: 500 })
          }
        }

        if (eventType === 'heartbeat') {
          // Heartbeat = Gradio ainda processando, NAO parar!
          if (i % 15 === 0) debug.log('Poll', 'info', `Heartbeat (ainda processando, tentativa ${i + 1})`)
        }
      }

      if (voiceAudioUrl) break
      await new Promise(r => setTimeout(r, 1500))
    }

    debug.log('Polling', voiceAudioUrl ? 'ok' : 'error', `${attemptCount} tentativas | ${voiceAudioUrl ? 'audio encontrado' : 'timeout'}`)

    if (!voiceAudioUrl) {
      return NextResponse.json(
        { error: 'Tempo limite excedido na geração (3 min)', debug: debug.result() },
        { status: 504 }
      )
    }

    // Download voice audio
    debug.log('Download audio', 'info', 'Baixando audio gerado...')
    const voiceRes = await fetch(voiceAudioUrl)
    if (!voiceRes.ok) {
      debug.log('Download audio', 'error', `HTTP ${voiceRes.status}`)
      return NextResponse.json({ error: 'Falha ao baixar audio gerado', debug: debug.result() }, { status: 502 })
    }
    const voiceBuffer = Buffer.from(await voiceRes.arrayBuffer())
    debug.log('Download audio', 'ok', `${(voiceBuffer.length / 1024).toFixed(1)}KB baixado`)

    const voiceMimeType = voiceAudioUrl.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav'
    const voiceDataUri = `data:${voiceMimeType};base64,${voiceBuffer.toString('base64')}`

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
