import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/tracks - List ALL tracks including inactive (admin only)
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

    const tracks = await db.track.findMany({
      where,
      orderBy: { order: 'asc' },
    })

    return NextResponse.json(tracks)
  } catch (error) {
    console.error('Error fetching admin tracks:', error)
    return NextResponse.json({ error: 'Erro ao buscar trilhas' }, { status: 500 })
  }
}
