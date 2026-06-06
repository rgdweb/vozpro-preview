/** 🚨 CONTRATO DE GOVERNANCA EXECUTIVA - VOZPRO (SaaS Hibrido)
 * 🚨 PROIBICOES ABSOLUTAS (13 erros ja cometidos que derrubaram o sistema):
 *   1. NUNCA git reset --hard | 2. NUNCA altere git remote | 3. NUNCA rm -rf
 *   4. NUNCA push syntax errors | 5. NUNCA commit .env real | 6. NUNCA temp no root
 *   7. NUNCA scripts deploy alternativos | 8. NUNCA quebre next.config | 9. queue: 3x, 3min
 *   10. NUNCA remova AUDIO_SERVER_API_KEY | 11. NUNCA desalinhe tokens .env/config.php
 *   12. NUNCA pm2 restart sozinho (faz rebuild) | 13. NUNCA git checkout -- .env
 * 🚨 REGRA UNICA DE DEPLOY: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 * 🚨 REGISTRO COMPLETO: REGRAS-ERROS-PROIBIDOS.md (leia ANTES de alterar qualquer coisa)
 * 🚨 IP: 147.15.77.137 | Repo: rgdweb/vozpro-preview | PM2: PM2_HOME=/root/.pm2
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
