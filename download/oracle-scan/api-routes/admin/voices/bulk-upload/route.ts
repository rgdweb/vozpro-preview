import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { uploadToAudioServer } from '@/lib/audio-server'

export const maxDuration = 120

// POST /api/admin/voices/bulk-upload
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const category = (formData.get('category') as string) || ''
    const gender = (formData.get('gender') as string) || 'Auto'
    const accent = (formData.get('accent') as string) || 'Auto'
    const pitch = (formData.get('pitch') as string) || 'Auto'
    const age = (formData.get('age') as string) || 'Auto'

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    if (files.length > 50) {
      return NextResponse.json({ error: 'Máximo 50 arquivos por upload' }, { status: 400 })
    }

    const results: { name: string; success: boolean; error?: string; voiceId?: string }[] = []
    let createdCount = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // Extrair nome do arquivo (sem extensão) como nome da voz
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim()

      if (!baseName) {
        results.push({ name: file.name, success: false, error: 'Nome inválido' })
        continue
      }

      try {
        // 1. Upload do áudio para o servidor PHP
        const ext = file.name.match(/\.(mp3|wav|ogg|m4a|flac|webm)$/i)?.[0] || '.wav'
        const uniqueName = `bulk-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}${ext}`

        const audioServerResult = await uploadToAudioServer(file, uniqueName, 'ref')

        // 2. Criar Voice no banco
        const voice = await db.voice.create({
          data: {
            name: baseName,
            description: `Voz ${baseName}`,
            gender,
            age,
            accent,
            pitch,
            category,
            active: true,
          },
        })

        // 3. Criar VoiceVariation com o áudio
        await db.voiceVariation.create({
          data: {
            voiceId: voice.id,
            label: 'Padrão',
            emoji: '',
            refAudioPath: audioServerResult.url,
            refAudioServerUrl: audioServerResult.url,
            refAudioFilename: audioServerResult.filename,
            refAudioName: file.name,
            refText: '',
            instruct: '',
            order: 0,
            active: true,
          },
        })

        createdCount++
        results.push({ name: baseName, success: true, voiceId: voice.id })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro desconhecido'
        results.push({ name: baseName, success: false, error: message })
      }
    }

    return NextResponse.json({
      success: true,
      total: files.length,
      created: createdCount,
      failed: files.length - createdCount,
      results,
    })
  } catch (error) {
    console.error('[BulkUpload] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no upload em massa' },
      { status: 500 }
    )
  }
}
