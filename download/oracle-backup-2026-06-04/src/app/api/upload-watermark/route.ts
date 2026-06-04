import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { uploadToAudioServer } from '@/lib/audio-server'

export const maxDuration = 60

// POST /api/upload-watermark - Upload marca d'água (admin only)
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
    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp3', 'audio/x-wav', 'audio/flac', 'audio/m4a', 'audio/webm', 'audio/webm;codecs=opus']
    if (!validTypes.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|m4a|flac|webm)$/i)) {
      return NextResponse.json(
        { error: 'Formato não suportado. Use MP3, WAV, OGG, M4A, FLAC ou WEBM.' },
        { status: 400 }
      )
    }

    // Upload to PHP hosting (usa 'ref' como tipo para compatibilidade com config do servidor)
    const ext = file.name.match(/\.(mp3|wav|ogg|m4a|flac|webm)$/i)?.[0] || '.mp3'
    const uniqueName = `watermark-${Date.now()}${ext}`
    const result = await uploadToAudioServer(file, uniqueName, 'ref')

    return NextResponse.json({
      path: result.url,
      filename: result.filename,
      name: file.name,
    })
  } catch (error) {
    console.error('Upload watermark error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no upload' },
      { status: 500 }
    )
  }
}
