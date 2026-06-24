import { cookies } from 'next/headers'
import { createHash } from 'crypto'
import { db } from '@/lib/db'

const JWT_SECRET = process.env.JWT_SECRET || 'vozpro-secret-key-2026'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'VozPro@2026'

// ============================================================
// HASH DE SENHA (SHA-256)
// ============================================================

export function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex')
}

// ============================================================
// SESSION TOKEN (cookie-based, sem JWT library)
// ============================================================
// Formato: base64(userId:role:timestamp:hmac_sha256)

function hashToken(payload: string): string {
  return createHash('sha256').update(payload + JWT_SECRET).digest('hex')
}

export async function createSession(
  userId: string,
  role: string,
  deviceInfo: string = '',
  ipAddress: string = ''
): Promise<string> {
  const timestamp = Date.now()
  const payload = `${userId}:${role}:${timestamp}`
  const hash = hashToken(payload)
  const token = Buffer.from(`${userId}:${role}:${timestamp}:${hash}`).toString('base64')

  // Tentar salvar no banco (se a tabela Session existir)
  try {
    // Calcular expiração (24 horas)
    const expiresAt = new Date(timestamp + 24 * 60 * 60 * 1000)

    // Hash do token para armazenar no banco (não guardamos o token em texto puro)
    const tokenHash = createHash('sha256').update(token).digest('hex')

    // Para usuários normais (NÃO admin): invalidar todas as sessões anteriores
    // Admin pode ter múltiplas sessões (múltiplos dispositivos)
    if (role !== 'admin') {
      await db.session.deleteMany({ where: { userId } })
    }

    // Salvar nova sessão no banco
    await db.session.create({
      data: {
        userId,
        tokenHash,
        deviceInfo: deviceInfo.substring(0, 500),
        ipAddress: ipAddress.substring(0, 45),
        expiresAt,
      },
    })
  } catch (err) {
    // Tabela Session pode não existir ainda — funciona sem ela
    // (admin sempre funciona, users normais perdem a proteção de sessão única)
    console.error('[Auth] Session DB not available, skipping:', (err as Error)?.message)
  }

  return token
}

export interface SessionData {
  userId: string
  role: string
  authenticated: boolean
}

export async function verifySession(token: string): Promise<SessionData> {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const parts = decoded.split(':')
    if (parts.length < 4) return { userId: '', role: '', authenticated: false }

    const [userId, role, timestampStr, hash] = parts
    const timestamp = parseInt(timestampStr, 10)

    // Token expires after 24 hours
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      return { userId: '', role: '', authenticated: false }
    }

    const expectedHash = hashToken(`${userId}:${role}:${timestamp}`)
    if (hash !== expectedHash) {
      return { userId: '', role: '', authenticated: false }
    }

    // Verificar se a sessão existe no banco de dados (apenas para usuários normais)
    // Admin pula essa verificação para permitir múltiplos dispositivos
    if (role !== 'admin') {
      try {
        const tokenHash = createHash('sha256').update(token).digest('hex')
        const session = await db.session.findFirst({
          where: { tokenHash },
        })

        if (!session) {
          // Sessão não existe no banco = foi invalidada por outro login
          return { userId: '', role: '', authenticated: false }
        }

        // Verificar expiração no banco
        if (new Date() > session.expiresAt) {
          await db.session.delete({ where: { id: session.id } }).catch(() => {})
          return { userId: '', role: '', authenticated: false }
        }
      } catch {
        // Tabela Session não existe — permite passar (fallback sem proteção de sessão única)
      }
    }

    return { userId, role, authenticated: true }
  } catch {
    return { userId: '', role: '', authenticated: false }
  }
}

export async function getSession(): Promise<SessionData> {
  const cookieStore = await cookies()
  const token = cookieStore.get('vozpro_session')?.value
  if (!token) return { userId: '', role: '', authenticated: false }
  return verifySession(token)
}

// ============================================================
// INVALIDAR SESSÃO NO BANCO (usado no logout)
// ============================================================

export async function invalidateSession(token: string): Promise<void> {
  try {
    const tokenHash = createHash('sha256').update(token).digest('hex')
    await db.session.deleteMany({ where: { tokenHash } })
  } catch {
    // Tabela pode não existir — ignorar
  }
}

// ============================================================
// LIMPAR SESSÕES EXPIRADAS (manutenção)
// ============================================================

export async function cleanExpiredSessions(): Promise<number> {
  try {
    const result = await db.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })
    return result.count
  } catch {
    return 0
  }
}

// ============================================================
// LEGACY — compatibilidade com senha única (ADMIN_PASSWORD)
// Mantido como fallback caso não existam usuários no banco
// ============================================================

const LEGACY_SESSION_KEY = 'vozpro_admin'
const NEW_SESSION_KEY = 'vozpro_session'

function hashLegacyToken(payload: string): string {
  return createHash('sha256').update(payload + JWT_SECRET).digest('hex')
}

export async function ensureAdminExists(): Promise<void> {
  try {
    const adminCount = await db.user.count({ where: { role: 'admin' } })
    if (adminCount === 0) {
      // Criar primeiro admin automaticamente usando ADMIN_PASSWORD
      await db.user.create({
        data: {
          name: 'Administrador',
          email: 'admin@vozpro.com',
          password: hashPassword(ADMIN_PASSWORD),
          role: 'admin',
        },
      })
      console.log('[Auth] Primeiro admin criado automaticamente: admin@vozpro.com')
    }
  } catch (err) {
    console.error('[Auth] Erro ao criar admin automaticamente:', err)
  }
}

export async function getAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies()

    // Garantir que existe pelo menos um admin no banco (não bloqueia se falhar)
    try {
      await ensureAdminExists()
    } catch (err) {
      console.error('[Auth] ensureAdminExists failed (non-blocking):', err)
    }

    // Tentar nova sessão (User-based)
    const newToken = cookieStore.get(NEW_SESSION_KEY)?.value
    if (newToken) {
      const session = await verifySession(newToken)
      if (session.authenticated) return true
    }

    // Fallback para sessão legada (senha única)
    const legacyToken = cookieStore.get(LEGACY_SESSION_KEY)?.value
    if (legacyToken) {
      try {
        const decoded = Buffer.from(legacyToken, 'base64').toString()
        const [timestampStr, hash] = decoded.split(':')
        const timestamp = parseInt(timestampStr, 10)
        if (Date.now() - timestamp > 24 * 60 * 60 * 1000) return false
        const expectedHash = hashLegacyToken(`${ADMIN_PASSWORD}:${timestamp}`)
        return hash === expectedHash
      } catch {
        return false
      }
    }
  } catch (err) {
    console.error('[Auth] getAdminSession error:', err)
  }

  return false
}

export async function loginLegacy(password: string): Promise<{ success: boolean; token?: string }> {
  if (password === ADMIN_PASSWORD) {
    const timestamp = Date.now()
    const payload = `${ADMIN_PASSWORD}:${timestamp}`
    const hash = hashLegacyToken(payload)
    return { success: true, token: Buffer.from(`${timestamp}:${hash}`).toString('base64') }
  }
  return { success: false }
}

// ============================================================
// LOGIN COM EMAIL/SENHA (User-based)
// ============================================================

export async function loginUser(email: string, password: string): Promise<{ success: boolean; error?: string; userId?: string; role?: string; name?: string }> {
  const user = await db.user.findUnique({ where: { email } })

  if (!user) {
    return { success: false, error: 'Usuário não encontrado' }
  }

  if (!user.active) {
    return { success: false, error: 'Conta desativada' }
  }

  const hashedInput = hashPassword(password)
  if (hashedInput !== user.password) {
    return { success: false, error: 'Senha incorreta' }
  }

  return {
    success: true,
    userId: user.id,
    role: user.role,
    name: user.name,
  }
}

// ============================================================
// REGISTRO DE NOVO USUÁRIO
// ============================================================

export async function registerUser(name: string, email: string, password: string, role: string = 'user'): Promise<{ success: boolean; error?: string }> {
  // Verificar se email já existe
  const existing = await db.user.findUnique({ where: { email } })
  if (existing) {
    return { success: false, error: 'Email já cadastrado' }
  }

  // Criar usuário
  await db.user.create({
    data: {
      name,
      email,
      password: hashPassword(password),
      role,
    },
  })

  return { success: true }
}

// ============================================================
// LISTAR / GERENCIAR USUÁRIOS (admin only)
// ============================================================

export async function listUsers() {
  return db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      paymentExempt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateUser(id: string, data: { name?: string; email?: string; role?: string; active?: boolean; paymentExempt?: boolean; password?: string }) {
  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.email !== undefined) updateData.email = data.email
  if (data.role !== undefined) updateData.role = data.role
  if (data.active !== undefined) updateData.active = data.active
  if (data.paymentExempt !== undefined) updateData.paymentExempt = data.paymentExempt
  if (data.password) updateData.password = hashPassword(data.password)

  return db.user.update({
    where: { id },
    data: updateData,
  })
}

export async function deleteUser(id: string) {
  // Não permitir deletar o último admin
  const user = await db.user.findUnique({ where: { id } })
  if (!user) throw new Error('Usuário não encontrado')

  if (user.role === 'admin') {
    const adminCount = await db.user.count({ where: { role: 'admin', active: true } })
    if (adminCount <= 1) {
      throw new Error('Não é possível deletar o último administrador')
    }
  }

  return db.user.delete({ where: { id } })
}
