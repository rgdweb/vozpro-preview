import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// PUT /api/variations/[id] - Update a variation
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

    const variation = await db.voiceVariation.update({
      where: { id },
      data: {
        ...(body.label !== undefined && { label: body.label.trim() }),
        ...(body.emoji !== undefined && { emoji: body.emoji }),
        ...(body.refAudioPath !== undefined && { refAudioPath: body.refAudioPath }),
        ...(body.refAudioBlobUrl !== undefined && { refAudioBlobUrl: body.refAudioBlobUrl }),
        ...(body.refAudioName !== undefined && { refAudioName: body.refAudioName }),
        ...(body.refText !== undefined && { refText: body.refText }),
        ...(body.instruct !== undefined && { instruct: body.instruct }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.active !== undefined && { active: body.active }),
      },
    })

    return NextResponse.json(variation)
  } catch (error) {
    console.error('Error updating variation:', error)
    return NextResponse.json({ error: 'Erro ao atualizar variação' }, { status: 500 })
  }
}

// DELETE /api/variations/[id] - Delete a variation
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
    await db.voiceVariation.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting variation:', error)
    return NextResponse.json({ error: 'Erro ao excluir variação' }, { status: 500 })
  }
}
