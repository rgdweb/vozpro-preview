import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/voices/[id]/variations - List variations for a voice
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const variations = await db.voiceVariation.findMany({
      where: { voiceId: id },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(variations)
  } catch (error) {
    console.error('Error fetching variations:', error)
    return NextResponse.json({ error: 'Erro ao buscar variações' }, { status: 500 })
  }
}

// POST /api/voices/[id]/variations - Add a variation to a voice
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()
    const { label, emoji, refAudioPath, serverUrl, filename, refAudioName, refText, instruct, order } = body

    if (!label || !label.trim()) {
      return NextResponse.json({ error: 'Label é obrigatório' }, { status: 400 })
    }

    if (!refAudioPath && !serverUrl) {
      return NextResponse.json({ error: 'Áudio de referência é obrigatório' }, { status: 400 })
    }

    // Verify voice exists
    const voice = await db.voice.findUnique({ where: { id } })
    if (!voice) {
      return NextResponse.json({ error: 'Voz não encontrada' }, { status: 404 })
    }

    const variation = await db.voiceVariation.create({
      data: {
        voiceId: id,
        label: label.trim(),
        emoji: emoji || '',
        refAudioPath: refAudioPath || '',
        refAudioServerUrl: serverUrl || '',
        refAudioFilename: filename || '',
        refAudioName: refAudioName || '',
        refText: refText || '',
        instruct: instruct || '',
        order: order || 0,
      },
    })

    return NextResponse.json(variation, { status: 201 })
  } catch (error) {
    console.error('Error creating variation:', error)
    return NextResponse.json({ error: 'Erro ao criar variação' }, { status: 500 })
  }
}
