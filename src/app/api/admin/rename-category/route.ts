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

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// PUT /api/admin/rename-category - Rename a category for all tracks/voices
export async function PUT(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { type, oldName, newName } = body as {
      type: 'tracks' | 'voices'
      oldName: string
      newName: string
    }

    if (!type || !oldName || !newName) {
      return NextResponse.json({ error: 'Parâmetros obrigatórios: type, oldName, newName' }, { status: 400 })
    }

    if (type === 'tracks') {
      const result = await db.track.updateMany({
        where: { category: oldName },
        data: { category: newName },
      })
      console.log(`[RenameCategory] Updated ${result.count} tracks: "${oldName}" → "${newName}"`)
      return NextResponse.json({ updated: result.count })
    } else {
      const result = await db.voice.updateMany({
        where: { category: oldName },
        data: { category: newName },
      })
      console.log(`[RenameCategory] Updated ${result.count} voices: "${oldName}" → "${newName}"`)
      return NextResponse.json({ updated: result.count })
    }
  } catch (error) {
    console.error('Error renaming category:', error)
    return NextResponse.json({ error: 'Erro ao renomear categoria' }, { status: 500 })
  }
}
