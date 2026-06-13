/**
 * GET /api/debug/empty-urls
 *
 * Retorna lista de variações com refText vazio, com URLs COMPLETAS de áudio.
 * Admin-only.
 */
import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

export const maxDuration = 30

export async function GET() {
  const isAdmin = await getAdminSession()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 401 })
  }

  const variations = await db.voiceVariation.findMany({
    where: { active: true, refText: '' },
    select: {
      id: true,
      refAudioServerUrl: true,
      voice: { select: { name: true } },
      label: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const list = variations
    .filter(v => v.refAudioServerUrl && v.refAudioServerUrl.trim())
    .map(v => ({
      id: v.id,
      voiceName: v.voice.name,
      label: v.label,
      audioUrl: v.refAudioServerUrl,
    }))

  return NextResponse.json({ total: list.length, variations: list })
}