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
      // Criar novo usuário via Google
      user = await db.user.create({
        data: {
          name: clientName,
          email,
          password: '', // sem senha para Google OAuth
          googleId,
          role: 'user',
        },
      })
    }

    if (!user.active) {
      return NextResponse.json({ error: 'Conta desativada' }, { status: 403 })
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
