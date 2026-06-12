import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const _db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _db

// Validacao defensiva: garante que o Prisma Client foi gerado com os modelos corretos
const REQUIRED_MODELS = ['user', 'voice', 'voiceVariation', 'track', 'session', 'systemSetting', 'payment', 'generationQueue', 'speaker'] as const

function validatePrismaClient(): PrismaClient {
  const missing: string[] = []
  for (const model of REQUIRED_MODELS) {
    if (!(model in (_db as unknown as Record<string, unknown>))) {
      missing.push(model)
    }
  }
  if (missing.length > 0) {
    const msg = `[Prisma FATAL] Modelos nao gerados: ${missing.join(', ')}. Execute 'npx prisma generate' e rebuild.`
    console.error(msg)
    throw new Error(msg)
  }
  return _db
}

export const db = validatePrismaClient()

