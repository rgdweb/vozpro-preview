import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/voices - List all voices with variations (public, only active)
export async function GET() {
  try {
    const voices = await db.voice.findMany({
      where: { active: true },
      include: {
        variations: {
          where: { active: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json(voices)
  } catch (error) {
    console.error('Error fetching voices:', error)
    return NextResponse.json({ error: 'Erro ao buscar vozes' }, { status: 500 })
  }
}

// POST /api/voices - Create a new voice (admin only)
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { name, description, gender, age, accent, pitch, order } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const voice = await db.voice.create({
      data: {
        name: name.trim(),
        description: description || '',
        gender: gender || 'Auto',
        age: age || 'Auto',
        accent: accent || 'Auto',
        pitch: pitch || 'Auto',
        order: order || 0,
      },
    })

    return NextResponse.json(voice, { status: 201 })
  } catch (error) {
    console.error('Error creating voice:', error)
    return NextResponse.json({ error: 'Erro ao criar voz' }, { status: 500 })
  }
}
