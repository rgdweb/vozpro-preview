import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { deleteFromAudioServer } from '@/lib/audio-server'

// GET /api/voices/[id] - Get a specific voice
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const voice = await db.voice.findUnique({
      where: { id },
      include: { variations: { orderBy: { order: 'asc' } } },
    })

    if (!voice) {
      return NextResponse.json({ error: 'Voz não encontrada' }, { status: 404 })
    }

    return NextResponse.json(voice)
  } catch (error) {
    console.error('Error fetching voice:', error)
    return NextResponse.json({ error: 'Erro ao buscar voz' }, { status: 500 })
  }
}

// PUT /api/voices/[id] - Update a voice (admin only)
export async function PUT(
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

    const voice = await db.voice.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.gender !== undefined && { gender: body.gender }),
        ...(body.age !== undefined && { age: body.age }),
        ...(body.accent !== undefined && { accent: body.accent }),
        ...(body.pitch !== undefined && { pitch: body.pitch }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.previewUrl !== undefined && { previewUrl: body.previewUrl }),
      },
    })

    return NextResponse.json(voice)
  } catch (error) {
    console.error('Error updating voice:', error)
    return NextResponse.json({ error: 'Erro ao atualizar voz' }, { status: 500 })
  }
}

// DELETE /api/voices/[id] - Delete a voice (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params

    // Delete all variation audio files from PHP server before removing voice
    const voice = await db.voice.findUnique({
      where: { id },
      include: { variations: true },
    })
    if (voice?.variations) {
      for (const variation of voice.variations) {
        if (variation.refAudioFilename) {
          try {
            await deleteFromAudioServer(variation.refAudioFilename, 'ref')
            console.log('[Voice] Deleted variation audio:', variation.refAudioFilename)
          } catch (err) {
            console.error('[Voice] Failed to delete variation audio:', err)
          }
        }
      }
    }

    await db.voice.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting voice:', error)
    return NextResponse.json({ error: 'Erro ao excluir voz' }, { status: 500 })
  }
}
