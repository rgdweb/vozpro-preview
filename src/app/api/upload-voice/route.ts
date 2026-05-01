import { NextRequest, NextResponse } from 'next/server'
import { uploadToBlob } from '@/lib/blob'

const HF_SPACE_URL = process.env.HF_SPACE_URL || 'https://k2-fsa-omnivoice.hf.space'

// POST /api/upload-voice - Upload reference audio to HuggingFace Space AND Vercel Blob
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo fornecido' }, { status: 400 })
    }

    // Step 1: Upload the file to Vercel Blob (permanent storage)
    const ext = file.name.match(/\.(mp3|wav|ogg|m4a|flac|webm)$/i)?.[0] || '.wav'
    const uniqueName = `ref-voice/${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`
    const blobUrl = await uploadToBlob(uniqueName, file, file.type || 'audio/wav')
    console.log('[UploadVoice] Saved to Blob:', blobUrl)

    // Step 2: Upload the file to the Gradio Space's upload endpoint
    const uploadForm = new FormData()
    uploadForm.append('files', file)

    const uploadRes = await fetch(`${HF_SPACE_URL}/gradio_api/upload`, {
      method: 'POST',
      body: uploadForm,
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error('[UploadVoice] HF upload error:', uploadRes.status, errText)
      // Still return success with blob URL - we will re-upload to HF when generating
      return NextResponse.json({
        path: '',
        blobUrl,
        url: blobUrl,
        name: file.name,
      })
    }

    const uploadData = await uploadRes.json()

    // Gradio returns an array of file paths
    if (Array.isArray(uploadData) && uploadData.length > 0) {
      return NextResponse.json({
        path: uploadData[0],
        blobUrl,
        url: `${HF_SPACE_URL}/gradio_api/file=${uploadData[0]}`,
        name: file.name,
      })
    }

    // HF upload returned unexpected response, but blob is saved
    return NextResponse.json({
      path: '',
      blobUrl,
      url: blobUrl,
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
