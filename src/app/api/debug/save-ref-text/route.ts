/**
 * POST /api/debug/save-ref-text
 *
 * Salva refText de uma variação. Recebe { variationId, refText }.
 * Admin-only.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  const isAdmin = await getAdminSession()
  if (!isAdmin) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { variationId, refText } = body

    if (!variationId || !refText) {
      return NextResponse.json({ error: 'variationId e refText obrigatorios' }, { status: 400 })
    }

    const updated = await db.voiceVariation.update({
      where: { id: variationId },
      data: { refText: refText.trim() },
    })

    return NextResponse.json({ success: true, id: updated.id, refText: updated.refText })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}