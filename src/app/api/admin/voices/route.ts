import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/voices - List ALL voices including inactive (admin only)
export async function GET(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    const where: Record<string, unknown> = {}
    if (category && category !== 'all') {
      where.category = category
    }

    const voices = await db.voice.findMany({
      where,
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
