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
