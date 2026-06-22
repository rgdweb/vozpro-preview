import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PATCH /api/admin/speakers/ref-text — Atualiza refText de um Locutor Oficial
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { speakerId, refText } = body

    if (!speakerId) {
      return NextResponse.json({ error: 'speakerId obrigatório' }, { status: 400 })
    }

    const speaker = await db.speaker.update({
      where: { id: speakerId },
      data: { refText: refText || '' },
    })

    return NextResponse.json({ success: true, speaker })
  } catch (error) {
    console.error('[SpeakerRefText] Erro:', error)
    const msg = error instanceof Error ? error.message : 'Erro interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
