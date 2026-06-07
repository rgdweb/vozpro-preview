import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/speakers — Retorna locutores oficiais ativos (publico)
// Usado pelo site principal para listar locutores disponiveis em clone_fast
export async function GET() {
  try {
    const speakers = await db.speaker.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        speakerFile: true,
        refAudioUrl: true,
        refText: true,
        avatarUrl: true,
      },
    })

    return NextResponse.json(speakers)
  } catch (error) {
    console.error('[Speakers] Erro ao buscar locutores:', error)
    return NextResponse.json({ error: 'Erro ao buscar locutores' }, { status: 500 })
  }
}

