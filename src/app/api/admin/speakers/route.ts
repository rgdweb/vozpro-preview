import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/speakers — Retorna todos os Locutores Oficiais
// Usado pelo painel admin para marcar quais variacoes ja estao ativadas como speakers
export async function GET() {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Nao autorizado' }, { status: 401 })
    }

    const speakers = await db.speaker.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        speakerFile: true,
        refAudioUrl: true,
        refText: true,
        isActive: true,
        createdAt: true,
      },
    })

    return NextResponse.json(speakers)
  } catch (error) {
    console.error('[AdminSpeakers] Erro ao buscar locutores:', error)
    return NextResponse.json({ error: 'Erro ao buscar locutores' }, { status: 500 })
  }
}

