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
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/free-download - Check remaining free downloads
export async function GET() {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { freeDownloads: true, paymentExempt: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Usuário isento de pagamento = downloads infinitos
    return NextResponse.json({ 
      freeDownloads: user.paymentExempt ? 99999 : user.freeDownloads,
      paymentExempt: user.paymentExempt 
    })
  } catch (error) {
    console.error('[Free Download] Check error:', error)
    return NextResponse.json({ freeDownloads: 0 }, { status: 500 })
  }
}

// POST /api/free-download - Use one free download
export async function POST() {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const user = await db.user.findUnique({
      where: { id: session.userId },
      select: { freeDownloads: true, paymentExempt: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Usuário isento de pagamento = sempre sucesso, sem decrementar
    if (user.paymentExempt) {
      return NextResponse.json({ 
        hasFree: true, 
        remaining: user.freeDownloads, 
        paymentExempt: true 
      })
    }

    if (user.freeDownloads <= 0) {
      return NextResponse.json({ error: 'Sem downloads gratuitos', hasFree: false, remaining: 0 })
    }

    const updated = await db.user.update({
      where: { id: session.userId },
      data: { freeDownloads: { decrement: 1 } },
    })

    return NextResponse.json({ 
      hasFree: true, 
      remaining: Math.max(0, updated.freeDownloads) 
    })
  } catch (error) {
    console.error('[Free Download] Use error:', error)
    return NextResponse.json({ error: 'Erro ao usar download gratuito' }, { status: 500 })
  }
}
