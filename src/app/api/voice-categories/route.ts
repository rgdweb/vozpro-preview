import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/voice-categories - List unique categories with counts (public, only active)
export async function GET() {
  try {
    const voices = await db.voice.findMany({
      where: { active: true },
      select: { category: true },
    })

    // Count voices per category
    const categoryMap: Record<string, number> = {}
    for (const voice of voices) {
      if (voice.category && voice.category.trim()) {
        categoryMap[voice.category] = (categoryMap[voice.category] || 0) + 1
      }
    }

    const categories = Object.entries(categoryMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(categories)
  } catch (error) {
    console.error('Error fetching voice categories:', error)
    return NextResponse.json({ error: 'Erro ao buscar categorias' }, { status: 500 })
  }
}
