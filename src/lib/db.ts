/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

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

