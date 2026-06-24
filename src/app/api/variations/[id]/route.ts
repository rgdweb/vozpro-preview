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
import { deleteFromAudioServer } from '@/lib/audio-server'

// PUT /api/variations/[id] - Update a variation
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      // Debug: qual cookie existe?
      const { cookies } = await import('next/headers')
      const cs = await cookies()
      const hasSession = !!cs.get('vozpro_session')?.value
      const hasLegacy = !!cs.get('vozpro_admin')?.value
      console.error('[Auth] Não autorizado. vozpro_session:', hasSession, 'vozpro_admin:', hasLegacy)
      return NextResponse.json({ error: 'Não autorizado', _debug: { hasSession, hasLegacy } }, { status: 401 })
    }

    const { id } = await params
    const body = await req.json()

    // Se trocou o audio, tenta apagar o arquivo antigo do servidor (non-blocking)
    // Requer delete.php no HostGator - se nao existir, ignora silenciosamente
    if (body.refAudioFilename !== undefined || body.refAudioPath !== undefined) {
      (async () => {
        try {
          const oldVar = await db.voiceVariation.findUnique({ where: { id } })
          if (oldVar?.refAudioFilename && oldVar.refAudioFilename !== body.refAudioFilename) {
            await deleteFromAudioServer(oldVar.refAudioFilename, 'ref')
          }
        } catch {}
      })()
    }

    const variation = await db.voiceVariation.update({
      where: { id },
      data: {
        ...(body.label !== undefined && { label: body.label.trim() }),
        ...(body.emoji !== undefined && { emoji: body.emoji }),
        ...(body.refAudioPath !== undefined && { refAudioPath: body.refAudioPath }),
        ...(body.refAudioServerUrl !== undefined && { refAudioServerUrl: body.refAudioServerUrl }),
        ...(body.refAudioFilename !== undefined && { refAudioFilename: body.refAudioFilename }),
        ...(body.refAudioName !== undefined && { refAudioName: body.refAudioName }),
        ...(body.refText !== undefined && { refText: body.refText }),
        ...(body.instruct !== undefined && { instruct: body.instruct }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.active !== undefined && { active: body.active }),
      },
    })

    return NextResponse.json(variation)
  } catch (error) {
    console.error('Error updating variation:', error)
    return NextResponse.json({ error: 'Erro ao atualizar variação' }, { status: 500 })
  }
}

// DELETE /api/variations/[id] - Delete a variation
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await params
    const variation = await db.voiceVariation.findUnique({ where: { id } })

    // Delete audio from PHP server
    if (variation?.refAudioFilename) {
      await deleteFromAudioServer(variation.refAudioFilename, 'ref')
    }

    await db.voiceVariation.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting variation:', error)
    return NextResponse.json({ error: 'Erro ao excluir variação' }, { status: 500 })
  }
}
