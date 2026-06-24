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