/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

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