import { NextRequest, NextResponse } from 'next/server'

// POST /api/omnivoice-generate — Proxy para OmniVoice (k2-fsa) via tunnel
// Usa o Gradio nativo do OmniVoice na porta 7861
// NÃO altera nenhum fluxo existente do F5-TTS (tunnel-generate)

const OMNIVOICE_URL = process.env.OMNIVOICE_URL || process.env.HF_SPACE_URL || ''

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      text,
      mode = 'clone',         // clone | design | auto
      instruct = '',           // voice design description
      referenceAudioUrl = '',  // URL do áudio de referência
      referenceAudioName = 'ref_audio.wav',
      refText = '',            // transcrição (vazio = auto Whisper)
      numStep = 16,            // 16=rapido, 32=qualidade
      speed = 1.0,
      language = '',           // omitido = auto
    } = body

    if (!text?.trim()) {
      return NextResponse.json({ error: 'Texto é obrigatório' }, { status: 400 })
    }

    // Verificar se OmniVoice URL está configurada
    if (!OMNIVOICE_URL) {
      return NextResponse.json({
        error: 'OmniVoice não configurado. Defina OMNIVOICE_URL no ambiente.',
        debug: { step: 'config_check', status: 'missing_url' },
      }, { status: 503 })
    }

    console.log(`[OmniVoice Generate] mode=${mode}, text=${text.substring(0, 80)}...`)

    // Montar dados para a API Gradio do OmniVoice
    // A API do Gradio usa multipart/form-data para uploads de áudio
    const formData = new FormData()
    formData.append('data', JSON.stringify([text, mode, instruct, null, refText, numStep, speed]))
    formData.append('fn_index', '0')

    // Se tem áudio de referência, fazer upload
    if (mode === 'clone' && referenceAudioUrl) {
      console.log(`[OmniVoice] Baixando áudio de referência: ${referenceAudioName}`)
      try {
        const audioRes = await fetch(referenceAudioUrl)
        if (!audioRes.ok) {
          console.warn(`[OmniVoice] Falha ao baixar áudio de ref (${audioRes.status}), continuando sem ele`)
        } else {
          const audioBlob = await audioRes.blob()
          const audioFile = new File([audioBlob], referenceAudioName, { type: audioBlob.type || 'audio/wav' })
          formData.append('files', audioFile)
          // O Gradio espera o arquivo na posição 3 (index 3 dos inputs)
          formData.append('data', JSON.stringify([null, null, null, audioFile.name, null, null, null]))
          formData.append('fn_index', '0')
        }
      } catch (err) {
        console.warn(`[OmniVoice] Erro ao processar áudio de referência:`, err)
      }
    }

    // Chamar API OmniVoice via Gradio
    const startTime = Date.now()

    const res = await fetch(`${OMNIVOICE_URL}/api/generate`, {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(600000), // 10 min max
    })

    const elapsed = Date.now() - startTime

    if (!res.ok) {
      let errorMsg = `Erro OmniVoice (${res.status})`
      try {
        const errText = await res.text()
        errorMsg = errText.substring(0, 300)
      } catch {}
      console.error(`[OmniVoice] Erro:`, errorMsg)

      return NextResponse.json({
        error: errorMsg,
        debug: {
          step: 'omnivoice_api_error',
          status: res.status,
          elapsed,
        },
      }, { status: res.status })
    }

    const result = await res.json()
    console.log(`[OmniVoice] Resposta em ${elapsed}ms:`, JSON.stringify(result).substring(0, 200))

    // O Gradio retorna [info_text, audio_path]
    // O audio_path é um path local no servidor, precisamos converter para URL
    let audioUrl = ''

    if (result.data && result.data[1]) {
      // Gradio retorna o filepath do áudio gerado
      const audioFilePath = result.data[1]
      // Tentar servir via URL do Gradio
      const filename = audioFilePath.split(/[\\/]/).pop() || `omnivoice_${Date.now()}.wav`
      audioUrl = `${OMNIVOICE_URL}/file=${filename}`
    }

    // Fallback: se não conseguiu URL, retornar via Gradio download
    if (!audioUrl) {
      audioUrl = `${OMNIVOICE_URL}/download/`
    }

    return NextResponse.json({
      audioUrl,
      info: result.data?.[0] || '',
      model: 'omnivoice',
      mode,
      elapsed,
      debug: {
        step: 'success',
        mode,
        model: 'omnivoice',
        elapsed,
        rtf: result.data?.[0]?.includes('RTF') ? result.data[0] : 'N/A',
      },
    })

  } catch (error) {
    console.error('[OmniVoice] Exception:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Erro interno',
      debug: {
        step: 'exception',
        error: error instanceof Error ? error.stack : String(error),
      },
    }, { status: 500 })
  }
}

export async function GET() {
  const effectiveUrl = OMNIVOICE_URL || process.env.HF_SPACE_URL || ''

  // Verificar se o servidor OmniVoice realmente responde
  let reachable = false
  if (effectiveUrl) {
    try {
      const res = await fetch(effectiveUrl + '/gradio_api/info/', {
        signal: AbortSignal.timeout(8000),
      })
      reachable = res.ok
    } catch {
      reachable = false
    }
  }

  return NextResponse.json({
    status: reachable ? 'omnivoice_available' : 'omnivoice_unavailable',
    url: effectiveUrl || undefined,
    reachable,
    model: 'k2-fsa/OmniVoice',
    features: [
      'voice_cloning',
      'voice_design',
      'auto_voice',
      'pronunciation_control_cmu',
      'nonverbal_symbols',
      '600_plus_languages',
      'rtf_0.025',
    ],
  })
}
