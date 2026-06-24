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
 * Heartbeat da fila — cliente chama a cada 15s enquanto gera.
 * Reseta o timer de stuck, impedindo que geracao ativa seja liberada.
 * Se o cliente parar de chamar (fechou aba, crash, sem conexao),
 * apos 1 minuto sem heartbeat o item e liberado automaticamente.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Nao autenticado' }, { status: 401 })
    }

    const { queueId } = await req.json()
    if (!queueId) {
      return NextResponse.json({ error: 'ID nao informado' }, { status: 400 })
    }

    const item = await db.generationQueue.findUnique({
      where: { id: queueId },
    })

    if (!item || item.userId !== session.userId) {
      return NextResponse.json({ error: 'Item nao encontrado' }, { status: 404 })
    }

    if (item.status !== 'processing') {
      return NextResponse.json({ ok: true, status: item.status })
    }

    // Resetar timer — cliente ainda esta ativo gerando
    await db.generationQueue.update({
      where: { id: queueId },
      data: { startedAt: new Date() },
    })

    return NextResponse.json({ ok: true, heartbeat: true })
  } catch (error) {
    console.error('[Queue] Heartbeat error:', error)
    return NextResponse.json({ ok: true }) // Nao falha o heartbeat
  }
}
