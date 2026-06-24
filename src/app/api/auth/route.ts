import { NextRequest, NextResponse } from 'next/server'
import { loginUser, loginLegacy, createSession, invalidateSession } from '@/lib/auth'

const NEW_SESSION_KEY = 'vozpro_session'
const LEGACY_SESSION_KEY = 'vozpro_admin'

// Helper para pegar IP real (considera proxies como Vercel)
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  const realIp = request.headers.get('x-real-ip')
  if (realIp) return realIp
  return '0.0.0.0'
}

// Helper para pegar User-Agent resumido
function getClientDevice(request: NextRequest): string {
  const ua = request.headers.get('user-agent') || 'Desconhecido'
  // Resumir para não guardar strings gigantes
  if (ua.length > 500) return ua.substring(0, 500)
  return ua
}

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!password) {
      return NextResponse.json({ error: 'Senha é obrigatória' }, { status: 400 })
    }

    // Capturar info do dispositivo
    const deviceInfo = getClientDevice(req)
    const ipAddress = getClientIp(req)

    // Se tem email, tentar login com User (email + senha)
    if (email) {
      const result = await loginUser(email, password)

      if (result.success && result.userId && result.role) {
        // createSession agora salva no DB e invalida sessões anteriores (para não-admin)
        const token = await createSession(result.userId, result.role, deviceInfo, ipAddress)

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

      // Se o login por email falhou, retorna erro
      return NextResponse.json({ error: result.error || 'Email ou senha incorretos' }, { status: 401 })
    }

    // Sem email = login legado com senha única (ADMIN_PASSWORD)
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

    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 })
  } catch (error) {
    console.error('Auth error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const cookieStore = await req.cookies
    const token = cookieStore.get(NEW_SESSION_KEY)?.value

    // Invalidar sessão no banco de dados (se existir o token)
    if (token) {
      await invalidateSession(token)
    }

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
  } catch (error) {
    console.error('Logout error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
