/**
 * 🚨 CONTRATO DE GOVERNANÇA EXECUTIVA - VOZPRO (SaaS HÍBRIDO)
 * ARQUIVO CRÍTICO: Middleware de autenticação e proteção de rotas.
 *
 * ATENÇÃO MODELO DE IA: Este arquivo protege rotas privadas do sistema.
 * 1. NUNCA desabilite a proteção da rota /admin.
 * 2. NUNCA exponha rotas de API administrativas sem autenticação.
 * 3. Mantenha JWT verification ativo.
 * 4. Deploy via: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 */
import { NextRequest, NextResponse } from 'next/server'

// Rotas que requerem autenticação
const PROTECTED_ROUTES = ['/', '/admin']
// Rotas que NÃO devem redirecionar (login, API, assets)
const PUBLIC_PATHS = ['/login', '/admin/login', '/api', '/_next', '/favicon', '/robots', '/sitemap', '/logo']

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
