import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export interface ManagedCategory {
  name: string
  emoji: string
}

// Default track categories (used when no managed categories exist in SystemSetting)
const DEFAULT_TRACK_CATEGORIES: ManagedCategory[] = [
  { name: 'ALEGRE', emoji: '😄' },
  { name: 'BOSSA', emoji: '🎷' },
  { name: 'CINEMA', emoji: '🎬' },
  { name: 'DRUMSTEP', emoji: '🥁' },
  { name: 'EFEITOS', emoji: '💥' },
  { name: 'HIP HOP', emoji: '🎤' },
  { name: 'JAZZ', emoji: '🎷' },
  { name: 'LOUNGE', emoji: '🛋️' },
  { name: 'NEWS', emoji: '📰' },
  { name: 'REGGAE', emoji: '🌴' },
  { name: 'ROCK', emoji: '🎸' },
  { name: 'TANGO', emoji: '💃' },
  { name: 'TECNOLOGIA', emoji: '💻' },
  { name: 'TRAILER', emoji: '🎥' },
  { name: 'URBANO', emoji: '🏙️' },
  { name: 'VINHETAS', emoji: '📻' },
]

// GET /api/track-categories - List categories with counts (public, only active)
// Returns managed categories (even with 0 items) + any ad-hoc categories from data
export async function GET() {
  try {
    // 1. Get managed categories from SystemSetting
    const setting = await db.systemSetting.findUnique({
      where: { key: 'managed_track_categories' },
    })

    let managedCategories: ManagedCategory[] = setting?.value
      ? JSON.parse(setting.value)
      : DEFAULT_TRACK_CATEGORIES

    // 2. Count tracks per category (from actual data)
    const tracks = await db.track.findMany({
      where: { active: true },
      select: { category: true },
    })

    const categoryCountMap: Record<string, number> = {}
    for (const track of tracks) {
      if (track.category && track.category.trim()) {
        categoryCountMap[track.category] = (categoryCountMap[track.category] || 0) + 1
      }
    }

    // 3. Build result: managed categories with their counts, then add ad-hoc categories
    const managedNames = new Set(managedCategories.map(c => c.name.toUpperCase()))
    const result: { name: string; count: number; emoji: string }[] = []

    for (const cat of managedCategories) {
      result.push({
        name: cat.name,
        count: categoryCountMap[cat.name] || 0,
        emoji: cat.emoji || '📁',
      })
    }

    // Add any ad-hoc categories from data that aren't in managed list
    for (const [name, count] of Object.entries(categoryCountMap)) {
      if (!managedNames.has(name.toUpperCase())) {
        result.push({
          name,
          count,
          emoji: '📁',
        })
      }
    }

    result.sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching track categories:', error)
    return NextResponse.json({ error: 'Erro ao buscar categorias' }, { status: 500 })
  }
}
