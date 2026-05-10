import { NextRequest, NextResponse } from 'next/server'

// Rotas que requerem autenticação
const PROTECTED_ROUTES = ['/', '/admin']
// Rotas que NÃO devem redirecionar (login, API, assets)
const PUBLIC_PATHS = ['/login', '/api', '/_next', '/favicon', '/robots', '/sitemap']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Permitir rotas públicas
  if (PUBLIC_PATHS.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  // Verificar se a rota é protegida
  const isProtected = PROTECTED_ROUTES.some(route => pathname === route || pathname.startsWith(route + '/'))

  if (!isProtected) {
    return NextResponse.next()
  }

  // Verificar cookie de sessão
  const sessionToken = request.cookies.get('vozpro_session')?.value
  const legacyToken = request.cookies.get('vozpro_admin')?.value

  if (sessionToken || legacyToken) {
    return NextResponse.next()
  }

  // Sem sessão — redirecionar para login
  const loginUrl = new URL('/login', request.url)
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
}
