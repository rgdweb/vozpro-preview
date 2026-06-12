import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export interface ManagedCategory {
  name: string
  emoji: string
}

// Default voice categories (used when no managed categories exist in SystemSetting)
const DEFAULT_VOICE_CATEGORIES: ManagedCategory[] = [
  { name: 'Graves', emoji: '🎙️' },
  { name: 'Super Graves', emoji: '🔊' },
  { name: 'Festas', emoji: '🎉' },
  { name: 'Igrejas', emoji: '⛪' },
  { name: 'Mercado', emoji: '🛒' },
  { name: 'Vinheta', emoji: '📻' },
  { name: 'Vozes Famosas', emoji: '⭐' },
  { name: 'Vozes Inéditas', emoji: '🆕' },
  { name: 'Narradores', emoji: '📖' },
  { name: 'Vendas', emoji: '💼' },
  { name: 'Infantil', emoji: '🧒' },
  { name: 'Idoso', emoji: '👴' },
]

// GET /api/voice-categories - List categories with counts (public, only active)
// Returns managed categories (even with 0 items) + any ad-hoc categories from data
export async function GET() {
  try {
    // 1. Get managed categories from SystemSetting
    const setting = await db.systemSetting.findUnique({
      where: { key: 'managed_voice_categories' },
    })

    let managedCategories: ManagedCategory[] = setting?.value
      ? JSON.parse(setting.value)
      : DEFAULT_VOICE_CATEGORIES

    // 2. Count voices per category (from actual data)
    const voices = await db.voice.findMany({
      where: { active: true },
      select: { category: true },
    })

    const categoryCountMap: Record<string, number> = {}
    for (const voice of voices) {
      if (voice.category && voice.category.trim()) {
        categoryCountMap[voice.category] = (categoryCountMap[voice.category] || 0) + 1
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
    console.error('Error fetching voice categories:', error)
    return NextResponse.json({ error: 'Erro ao buscar categorias' }, { status: 500 })
  }
}
