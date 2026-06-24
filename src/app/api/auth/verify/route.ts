import { NextResponse } from 'next/server'
import { getSession, getAdminSession } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    // Diagnóstico: logar cookies recebidos
    const cookieStore = await cookies()
    const hasNewCookie = !!cookieStore.get('vozpro_session')?.value
    const hasLegacyCookie = !!cookieStore.get('vozpro_admin')?.value
    console.log('[Auth/Verify] Cookies:', { hasNewCookie, hasLegacyCookie })

    // Tentar nova sessão (User-based)
    const session = await getSession()
    console.log('[Auth/Verify] Session result:', { authenticated: session.authenticated, role: session.role, userId: session.userId })

    if (session.authenticated) {
      return NextResponse.json({
        authenticated: true,
        role: session.role,
        userId: session.userId,
      })
    }

    // Fallback para sessão legada (senha única)
    const isLegacyAdmin = await getAdminSession()
    console.log('[Auth/Verify] Legacy admin:', isLegacyAdmin)
    if (isLegacyAdmin) {
      return NextResponse.json({
        authenticated: true,
        role: 'admin',
        userId: '',
      })
    }

    return NextResponse.json({ authenticated: false })
  } catch (err) {
    console.error('[Auth/Verify] Error:', err)
    return NextResponse.json({ authenticated: false })
  }
}
