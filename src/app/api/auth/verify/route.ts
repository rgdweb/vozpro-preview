import { NextRequest, NextResponse } from 'next/server'
import { getSession, getAdminSession } from '@/lib/auth'

export async function GET() {
  // Tentar nova sessão (User-based)
  const session = await getSession()

  if (session.authenticated) {
    return NextResponse.json({
      authenticated: true,
      role: session.role,
      userId: session.userId,
    })
  }

  // Fallback para sessão legada (senha única)
  const isLegacyAdmin = await getAdminSession()
  if (isLegacyAdmin) {
    return NextResponse.json({
      authenticated: true,
      role: 'admin',
      userId: '',
    })
  }

  return NextResponse.json({ authenticated: false })
}
