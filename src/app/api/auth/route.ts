import { NextRequest, NextResponse } from 'next/server'
import { loginUser, loginLegacy, createSession } from '@/lib/auth'

const NEW_SESSION_KEY = 'vozpro_session'
const LEGACY_SESSION_KEY = 'vozpro_admin'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 })
    }

    // Tentar login com User (email + senha)
    const result = await loginUser(email, password)

    if (result.success && result.userId && result.role) {
      const token = await createSession(result.userId, result.role)
      const response = NextResponse.json({
        success: true,
        name: result.name,
        role: result.role,
      })

      response.cookies.set(NEW_SESSION_KEY, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24, // 24 hours
        path: '/',
      })

      return response
    }

    // Fallback: login legado com senha única (ADMIN_PASSWORD)
    // O email é usado como senha legada para compatibilidade
    const legacyResult = await loginLegacy(password)
    if (legacyResult.success && legacyResult.token) {
      const response = NextResponse.json({ success: true, name: 'Admin', role: 'admin' })

      response.cookies.set(LEGACY_SESSION_KEY, legacyResult.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24,
        path: '/',
      })

      return response
    }

    return NextResponse.json({ error: result.error || 'Email ou senha incorretos' }, { status: 401 })
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })

  // Limpar ambos os cookies
  response.cookies.set(NEW_SESSION_KEY, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  response.cookies.set(LEGACY_SESSION_KEY, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  return response
}
