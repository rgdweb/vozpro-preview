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
 * 🛡️ BLINDAGEM — Google OAuth Route
 * ⚠️ Cookie DEVE seguir mesma config do auth/route.ts:
 *   SEM domain, secure condicional, sameSite 'lax'.
 *   Ver BLINDAGEM.md Bloco 2.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createSession } from '@/lib/auth'
import { db } from '@/lib/db'

// POST /api/auth/google - Login via Google OAuth
// Aceita access_token do OAuth2 (client-side flow) + dados do usuário
export async function POST(req: NextRequest) {
  try {
    const { token: accessToken, email, name, sub: googleId } = await req.json()

    if (!email || !googleId) {
      return NextResponse.json({ error: 'Dados do Google incompletos' }, { status: 400 })
    }

    const clientName = name || email.split('@')[0] || 'Usuário Google'

    // Buscar ou criar usuário
    let user = await db.user.findUnique({ where: { email } })

    if (user) {
      // Usuário existe - vincular Google se ainda não vinculado
      if (!user.googleId && googleId) {
        user = await db.user.update({
          where: { id: user.id },
          data: { googleId },
        })
      }
    } else {
      // Criar novo usuário via Google - aguardando aprovação admin
      // Buscar configuração de downloads grátis por nova conta
      const freeDlSetting = await db.systemSetting.findUnique({ where: { key: 'freeDownloadsPerAccount' } })
      const freeDownloads = freeDlSetting ? parseInt(freeDlSetting.value, 10) : 5
      const validFreeDownloads = isNaN(freeDownloads) ? 5 : Math.max(0, freeDownloads)

      user = await db.user.create({
        data: {
          name: clientName,
          email,
          password: '', // sem senha para Google OAuth
          googleId,
          role: 'user',
          active: false, // precisa de aprovação do admin
          freeDownloads: validFreeDownloads,
        },
      })
    }

    if (!user.active) {
      return NextResponse.json({ 
        success: false, 
        needsApproval: true,
        error: 'Conta aguardando aprovação do administrador' 
      }, { status: 403 })
    }

    // Criar sessão (mesmo sistema de sessão existente)
    const sessionToken = await createSession(
      user.id,
      user.role,
      req.headers.get('user-agent') || '',
      req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''
    )

    const response = NextResponse.json({
      success: true,
      name: user.name,
      role: user.role,
      userId: user.id,
    })

    // Set cookie de sessão
    response.cookies.set('vozpro_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60, // 24 horas
      path: '/',
    })

    return response
  } catch (error) {
    console.error('[Google Auth] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro na autenticação Google' },
      { status: 500 }
    )
  }
}
