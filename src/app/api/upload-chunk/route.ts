import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { uploadToAudioServer } from '@/lib/audio-server'

const AUDIO_SERVER_URL = process.env.AUDIO_SERVER_URL || 'https://sorteiomax.com.br/omnivoice'
const AUDIO_SERVER_API_KEY = process.env.AUDIO_SERVER_API_KEY || ''

export const maxDuration = 60

// POST /api/upload-chunk - Proxy individual chunk to PHP upload.php (chunked mode)
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const formData = await req.formData()
    const chunkData = formData.get('chunkData') as File | null
    const chunkIndex = formData.get('chunkIndex') as string | null
    const totalChunks = formData.get('totalChunks') as string | null
    const fileName = formData.get('fileName') as string | null
    const fileId = formData.get('fileId') as string | null
    const tipo = formData.get('tipo') as string | null

    if (!chunkData || chunkIndex === null || totalChunks === null || !fileName || !fileId) {
      return NextResponse.json(
        { error: 'Parâmetros incompletos' },
        { status: 400 }
      )
    }

    // Send chunk to PHP upload.php (server-to-server, no CORS issues)
    // upload.php auto-detects chunked mode via chunkIndex/totalChunks/fileId params
    const phpFormData = new FormData()
    phpFormData.append('chunkData', chunkData, 'chunk')
    phpFormData.append('chunkIndex', chunkIndex)
    phpFormData.append('totalChunks', totalChunks)
    phpFormData.append('fileName', fileName)
    phpFormData.append('fileId', fileId)
    phpFormData.append('tipo', tipo || 'track')

    const phpRes = await fetch(`${AUDIO_SERVER_URL}/upload.php`, {
      method: 'POST',
      headers: {
        ...(AUDIO_SERVER_API_KEY ? { 'Authorization': `Bearer ${AUDIO_SERVER_API_KEY}` } : {}),
      },
      body: phpFormData,
    })

    const data = await phpRes.json()

    if (!data.sucesso) {
      return NextResponse.json(
        { error: data.erro || 'Erro no servidor PHP' },
        { status: phpRes.status }
      )
    }

    return NextResponse.json({
      success: true,
      chunkIndex: parseInt(chunkIndex),
      totalChunks: parseInt(totalChunks),
      status: data.chunked ? 'complete' : 'partial',
      ...(data.chunked ? {
        path: data.url,
        filename: data.arquivo,
        size: data.tamanho,
      } : {}),
    })
  } catch (error) {
    console.error('Upload chunk error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no upload do chunk' },
      { status: 500 }
    )
  }
}
