import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { uploadToAudioServer } from '@/lib/audio-server'

// POST /api/batch-upload-tracks - Upload multiple track files at once (admin only)
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const formData = await req.formData()
    const category = (formData.get('category') as string) || ''
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    if (files.length > 50) {
      return NextResponse.json({ error: 'Máximo de 50 arquivos por upload' }, { status: 400 })
    }

    const createdTracks: Array<Record<string, unknown>> = []
    const errors: Array<{ file: string; error: string }> = []

    for (const file of files) {
      try {
        const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm']
        const ext = '.' + file.name.split('.').pop()?.toLowerCase()
        if (!validExts.includes(ext)) {
          errors.push({ file: file.name, error: 'Formato não suportado' })
          continue
        }

        // Upload to audio server
        const uploadResult = await uploadToAudioServer(file, file.name, 'track')

        // Create track record
        const trackName = file.name.replace(/\.[^.]+$/, '')
        const track = await db.track.create({
          data: {
            name: trackName,
            description: '',
            emoji: '',
            category,
            audioPath: uploadResult.url,
            duration: 0,
            order: 0,
            active: true,
          },
        })

        createdTracks.push(track)
      } catch (err) {
        console.error(`[BatchUpload] Error with file ${file.name}:`, err)
        errors.push({ file: file.name, error: err instanceof Error ? err.message : 'Erro desconhecido' })
      }
    }

    return NextResponse.json({
      tracks: createdTracks,
      errors,
      total: files.length,
      created: createdTracks.length,
      failed: errors.length,
    })
  } catch (error) {
    console.error('Error batch uploading tracks:', error)
    return NextResponse.json({ error: 'Erro no upload em lote' }, { status: 500 })
  }
}
