import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/tracks - List all tracks (public, only active)
export async function GET() {
  try {
    const tracks = await db.track.findMany({
      where: { active: true },
      orderBy: { order: 'asc' },
    })
    return NextResponse.json(tracks)
  } catch (error) {
    console.error('Error fetching tracks:', error)
    return NextResponse.json({ error: 'Erro ao buscar trilhas' }, { status: 500 })
  }
}

// POST /api/tracks - Create a new track (admin only)
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { name, description, emoji, audioPath, duration, order } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    if (!audioPath) {
      return NextResponse.json({ error: 'Arquivo de áudio é obrigatório' }, { status: 400 })
    }

    const track = await db.track.create({
      data: {
        name: name.trim(),
        description: description || '',
        emoji: emoji || '',
        audioPath,
        duration: duration || 0,
        order: order || 0,
      },
    })

    return NextResponse.json(track, { status: 201 })
  } catch (error) {
    console.error('Error creating track:', error)
    return NextResponse.json({ error: 'Erro ao criar trilha' }, { status: 500 })
  }
}
