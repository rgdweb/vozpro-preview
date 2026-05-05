import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { deleteFromAudioServer } from '@/lib/audio-server'

// PUT /api/tracks/[id] - Update a track
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

    // Se trocou o audio, tenta apagar o arquivo antigo do servidor (non-blocking)
    // Requer delete.php no HostGator - se nao existir, ignora silenciosamente
    if (body.audioPath !== undefined) {
      (async () => {
        try {
          const oldTrack = await db.track.findUnique({ where: { id } })
          if (oldTrack?.audioPath) {
            const oldFilename = oldTrack.audioPath.split('/').pop()
            if (oldFilename && oldFilename !== body.audioPath.split('/').pop()) {
              await deleteFromAudioServer(oldFilename, 'track')
            }
          }
        } catch {}
      })()
    }

    const track = await db.track.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.description !== undefined && { description: body.description }),
        ...(body.emoji !== undefined && { emoji: body.emoji }),
        ...(body.audioPath !== undefined && { audioPath: body.audioPath }),
        ...(body.duration !== undefined && { duration: body.duration }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.active !== undefined && { active: body.active }),
      },
    })

    return NextResponse.json(track)
  } catch (error) {
    console.error('Error updating track:', error)
    return NextResponse.json({ error: 'Erro ao atualizar trilha' }, { status: 500 })
  }
}

// DELETE /api/tracks/[id] - Delete a track
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

    // Delete audio from PHP server before removing from DB
    const track = await db.track.findUnique({ where: { id } })
    if (track?.audioPath) {
      const filename = track.audioPath.split('/').pop()
      if (filename) {
        try {
          await deleteFromAudioServer(filename, 'track')
          console.log('[Track] Deleted audio from server:', filename)
        } catch (err) {
          console.error('[Track] Failed to delete audio from server:', err)
          // Continue with DB deletion even if server deletion fails
        }
      }
    }

    await db.track.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting track:', error)
    return NextResponse.json({ error: 'Erro ao excluir trilha' }, { status: 500 })
  }
}
