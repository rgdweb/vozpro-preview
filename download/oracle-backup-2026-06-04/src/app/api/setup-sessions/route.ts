import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// Endpoint de emergência: cria a tabela Session se não existir
// Chamado automaticamente quando o sistema detecta que a tabela não existe
export async function POST() {
  try {
    // Tenta fazer um count simples para verificar se a tabela existe
    await db.session.count()
    return NextResponse.json({ success: true, message: 'Tabela Session já existe' })
  } catch {
    // Tabela não existe — criar via SQL raw
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "Session" (
          "id" TEXT NOT NULL,
          "userId" TEXT NOT NULL,
          "tokenHash" TEXT NOT NULL,
          "deviceInfo" TEXT NOT NULL DEFAULT '',
          "ipAddress" TEXT NOT NULL DEFAULT '',
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "expiresAt" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
        );
        CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
        CREATE INDEX IF NOT EXISTS "Session_tokenHash_idx" ON "Session"("tokenHash");
        ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
      `)
      return NextResponse.json({ success: true, message: 'Tabela Session criada com sucesso' })
    } catch (err) {
      console.error('[Setup] Erro ao criar tabela Session:', err)
      return NextResponse.json({ success: false, error: 'Erro ao criar tabela Session' }, { status: 500 })
    }
  }
}
