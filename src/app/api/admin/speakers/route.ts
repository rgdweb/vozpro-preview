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

