import { NextRequest, NextResponse } from 'next/server'
import { uploadToAudioServer } from '@/lib/audio-server'

export const maxDuration = 60

const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://k2-fsa-omnivoice.hf.space'

// POST /api/upload-voice - Upload reference audio to PHP hosting AND HuggingFace Space
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo fornecido' }, { status: 400 })
    }

    // Step 1: Upload the file to PHP hosting (permanent storage)
    const ext = file.name.match(/\.(mp3|wav|ogg|m4a|flac|webm)$/i)?.[0] || '.wav'
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`
    const audioServerResult = await uploadToAudioServer(file, uniqueName, 'ref')
    console.log('[UploadVoice] Saved to audio server:', audioServerResult.url)

    // Step 2: Upload the file to the Gradio Space's upload endpoint
    const uploadForm = new FormData()
    uploadForm.append('files', file)

    let hfPath = ''
    try {
      const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
        method: 'POST',
        body: uploadForm,
      })

      if (uploadRes.ok) {
        const uploadData = await uploadRes.json()
        if (Array.isArray(uploadData) && uploadData.length > 0) {
          hfPath = uploadData[0]
          console.log('[UploadVoice] Also uploaded to HF Space:', hfPath)
        }
      } else {
        const errText = await uploadRes.text()
        console.error('[UploadVoice] HF upload error:', uploadRes.status, errText)
      }
    } catch (err) {
      console.error('[UploadVoice] HF upload failed, will re-upload on generate:', err)
    }

    // Return success with both URLs
    return NextResponse.json({
      path: hfPath,                                // HF Space path (temporary, may expire)
      serverUrl: audioServerResult.url,            // PHP hosting URL (permanent)
      filename: audioServerResult.filename,        // filename on server (for deletion)
      url: audioServerResult.url,                  // permanent URL for reference
      name: file.name,
    })
  } catch (error) {
    console.error('[UploadVoice] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no upload' },
      { status: 500 }
    )
  }
}
