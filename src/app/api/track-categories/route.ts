import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/track-categories - List unique categories with counts (public, only active)
export async function GET() {
  try {
    const tracks = await db.track.findMany({
      where: { active: true },
      select: { category: true },
    })

    // Count tracks per category
    const categoryMap: Record<string, number> = {}
    for (const track of tracks) {
      if (track.category && track.category.trim()) {
        categoryMap[track.category] = (categoryMap[track.category] || 0) + 1
      }
    }

    const categories = Object.entries(categoryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching track categories:', error)
    return NextResponse.json({ error: 'Erro ao buscar categorias' }, { status: 500 })
  }
}
