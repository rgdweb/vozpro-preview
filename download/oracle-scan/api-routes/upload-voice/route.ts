import { NextRequest, NextResponse } from 'next/server'
import { uploadToAudioServer } from '@/lib/audio-server'

export const maxDuration = 60

// POST /api/upload-voice - Upload reference audio to PHP hosting (audio server)
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

    // Return success with URL
    return NextResponse.json({
      path: audioServerResult.url,
      serverUrl: audioServerResult.url,
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
