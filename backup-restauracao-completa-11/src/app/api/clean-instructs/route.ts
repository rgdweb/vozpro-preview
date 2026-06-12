import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/clean-instructs - Limpa instructs redundantes das variações
// Redundantes = valores que o OmniVoice detecta automaticamente do áudio:
//   female, male, child, young adult, middle-aged, elderly,
//   low pitch, moderate pitch, high pitch
// Esses valores causam "Conflicting instruct items" quando combinados
// com as propriedades da voz (gênero, idade, tom) no frontend.

const REDUNDANT_INSTRUCTS = [
  'female', 'male',
  'child', 'young adult', 'middle-aged', 'elderly',
  'low pitch', 'moderate pitch', 'high pitch',
]

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const variations = await db.voiceVariation.findMany({
      where: {
        instruct: { in: REDUNDANT_INSTRUCTS },
      },
      select: { id: true, instruct: true },
    })

    if (variations.length === 0) {
      return NextResponse.json({ message: 'Nenhum instruct redundante encontrado', cleaned: 0 })
    }

    const ids = variations.map(v => v.id)
    const details = variations.map(v => ({ id: v.id, oldInstruct: v.instruct }))

    // Limpar todos de uma vez
    await db.voiceVariation.updateMany({
      where: { id: { in: ids } },
      data: { instruct: '' },
    })

    return NextResponse.json({
      message: `Limpos ${ids.length} instructs redundantes`,
      cleaned: ids.length,
      details,
    })
  } catch (error) {
    console.error('Error cleaning instructs:', error)
    return NextResponse.json({ error: 'Erro ao limpar instructs' }, { status: 500 })
  }
}
