import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/voices - List ALL voices including inactive (admin only)
export async function GET() {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const voices = await db.voice.findMany({
      include: {
        variations: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json(voices)
  } catch (error) {
    console.error('Error fetching admin voices:', error)
    return NextResponse.json({ error: 'Erro ao buscar vozes' }, { status: 500 })
  }
}
