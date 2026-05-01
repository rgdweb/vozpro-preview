import { cookies } from 'next/headers'
import { createHash } from 'crypto'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'VozPro@2026'
const JWT_SECRET = process.env.JWT_SECRET || 'vozpro-secret-key-2026'

function hashToken(payload: string): string {
  return createHash('sha256').update(payload + JWT_SECRET).digest('hex')
}

export async function createSession(): Promise<string> {
  const timestamp = Date.now()
  const payload = `${ADMIN_PASSWORD}:${timestamp}`
  const hash = hashToken(payload)
  return Buffer.from(`${timestamp}:${hash}`).toString('base64')
}

export async function verifySession(token: string): Promise<boolean> {
  try {
    const decoded = Buffer.from(token, 'base64').toString()
    const [timestampStr, hash] = decoded.split(':')
    const timestamp = parseInt(timestampStr, 10)

    // Token expires after 24 hours
    if (Date.now() - timestamp > 24 * 60 * 60 * 1000) {
      return false
    }

    const expectedHash = hashToken(`${ADMIN_PASSWORD}:${timestamp}`)
    return hash === expectedHash
  } catch {
    return false
  }
}

export async function getAdminSession(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get('vozpro_admin')?.value
  if (!token) return false
  return verifySession(token)
}

export async function login(password: string): Promise<{ success: boolean; token?: string }> {
  if (password === ADMIN_PASSWORD) {
    const token = await createSession()
    return { success: true, token }
  }
  return { success: false }
}
