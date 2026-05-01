import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { uploadToAudioServer } from '@/lib/audio-server'

// POST /api/upload-track - Upload music track to PHP hosting
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo fornecido' }, { status: 400 })
    }

    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/x-wav']
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg)$/i)) {
      return NextResponse.json(
        { error: 'Formato não suportado. Use MP3, WAV ou OGG.' },
        { status: 400 }
      )
    }

    // Upload to PHP hosting
    const ext = file.name.match(/\.(mp3|wav|ogg)$/i)?.[0] || '.mp3'
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`
    const result = await uploadToAudioServer(file, uniqueName, 'track')

    // Duration will be detected on the client or set to 0
    const duration = 0

    return NextResponse.json({
      path: result.url,
      filename: result.filename,
      name: file.name,
      duration,
    })
  } catch (error) {
    console.error('Upload track error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no upload' },
      { status: 500 }
    )
  }
}
