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
// Formato: base64(userId:timestamp:hmac_sha256)

function hashToken(payload: string): string {
  return createHash('sha256').update(payload + JWT_SECRET).digest('hex')
}

export async function createSession(userId: string, role: string): Promise<string> {
  const timestamp = Date.now()
  const payload = `${userId}:${role}:${timestamp}`
  const hash = hashToken(payload)
  return Buffer.from(`${userId}:${role}:${timestamp}:${hash}`).toString('base64')
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
// LEGACY — compatibilidade com senha única (ADMIN_PASSWORD)
// Mantido como fallback caso não existam usuários no banco
// ============================================================

const LEGACY_SESSION_KEY = 'vozpro_admin'
const NEW_SESSION_KEY = 'vozpro_session'

function hashLegacyToken(payload: string): string {
  return createHash('sha256').update(payload + JWT_SECRET).digest('hex')
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()

  // Tentar nova sessão (User-based)
  const newToken = cookieStore.get(NEW_SESSION_KEY)?.value
  if (newToken) {
    const session = await verifySession(newToken)
    return session.authenticated
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
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateUser(id: string, data: { name?: string; email?: string; role?: string; active?: boolean; password?: string }) {
  const updateData: Record<string, unknown> = {}
  if (data.name !== undefined) updateData.name = data.name
  if (data.email !== undefined) updateData.email = data.email
  if (data.role !== undefined) updateData.role = data.role
  if (data.active !== undefined) updateData.active = data.active
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
