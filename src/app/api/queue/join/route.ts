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
import { getSession } from '@/lib/auth'
import { db } from '@/lib/db'

const MAX_CONCURRENT_GENERATIONS = 1
const PROCESSING_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutos

// Limpar itens processing presos há mais de PROCESSING_TIMEOUT_MS
async function unstickProcessing(): Promise<number> {
  try {
    const result = await db.generationQueue.updateMany({
      where: {
        status: 'processing',
        startedAt: { lt: new Date(Date.now() - PROCESSING_TIMEOUT_MS) },
      },
      data: {
        status: 'failed',
        completedAt: new Date(),
      },
    })
    if (result.count > 0) {
      console.log(`[Queue] Unstuck ${result.count} stuck processing items`)
    }
    return result.count
  } catch {
    return 0
  }
}

// Promover o próximo waiting para processing
async function promoteNext() {
  const currentProcessing = await db.generationQueue.count({
    where: { status: 'processing' },
  })
  if (currentProcessing >= MAX_CONCURRENT_GENERATIONS) return false

  const nextWaiting = await db.generationQueue.findFirst({
    where: { status: 'waiting' },
    orderBy: { createdAt: 'asc' },
  })

  if (nextWaiting) {
    await db.generationQueue.update({
      where: { id: nextWaiting.id },
      data: { status: 'processing', startedAt: new Date() },
    })
    console.log('[Queue] Promoted:', nextWaiting.id)
    return true
  }
  return false
}

// Limpar itens completed/failed antigos
async function cleanupOldItems() {
  try {
    await db.generationQueue.deleteMany({
      where: {
        status: { in: ['completed', 'failed'] },
        completedAt: { lt: new Date(Date.now() - 5 * 60 * 1000) },
      },
    })
  } catch {}
}

// POST /api/queue/join - Entrar na fila de geração
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    // Primeiro: desbloquear itens presos e limpar antigos
    const unstuckCount = await unstickProcessing()
    if (unstuckCount > 0) {
      await promoteNext()
    }
    await cleanupOldItems()

    // Verificar se já tem um item na fila do usuário
    const existingItem = await db.generationQueue.findFirst({
      where: {
        userId: session.userId,
        status: { in: ['waiting', 'processing'] },
      },
    })

    if (existingItem) {
      // Já está na fila, retornar posição
      const waitingBefore = await db.generationQueue.count({
        where: {
          status: 'waiting',
          createdAt: { lt: existingItem.createdAt },
        },
      })
      return NextResponse.json({
        id: existingItem.id,
        status: existingItem.status,
        position: existingItem.status === 'processing' ? 0 : waitingBefore + 1,
      })
    }

    // Contar quantos estão processando
    const processingCount = await db.generationQueue.count({
      where: { status: 'processing' },
    })

    // Contar posição na fila
    const waitingCount = await db.generationQueue.count({
      where: { status: 'waiting' },
    })

    // Criar entrada na fila
    const queueItem = await db.generationQueue.create({
      data: {
        userId: session.userId,
        status: processingCount < MAX_CONCURRENT_GENERATIONS ? 'processing' : 'waiting',
        position: processingCount < MAX_CONCURRENT_GENERATIONS ? 0 : waitingCount + 1,
        startedAt: processingCount < MAX_CONCURRENT_GENERATIONS ? new Date() : null,
      },
    })

    return NextResponse.json({
      id: queueItem.id,
      status: queueItem.status,
      position: queueItem.status === 'processing' ? 0 : waitingCount + 1,
    })
  } catch (error) {
    console.error('[Queue] Join error:', error)
    return NextResponse.json({ error: 'Erro ao entrar na fila' }, { status: 500 })
  }
}

// GET /api/queue/status?id=xxx - Verificar posição na fila
export async function GET(req: NextRequest) {
  try {
    const session = await getSession()
    if (!session.authenticated) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const queueId = searchParams.get('id')

    if (!queueId) {
      return NextResponse.json({ error: 'ID da fila não informado' }, { status: 400 })
    }

    // Desbloquear itens presos periodicamente durante o poll
    await unstickProcessing()
    await cleanupOldItems()

    const item = await db.generationQueue.findUnique({
      where: { id: queueId },
    })

    if (!item || item.userId !== session.userId) {
      return NextResponse.json({ error: 'Item não encontrado' }, { status: 404 })
    }

    // Calcular posição atual
    let position = 0
    if (item.status === 'waiting') {
      position = await db.generationQueue.count({
        where: {
          status: 'waiting',
          createdAt: { lt: item.createdAt },
        },
      }) + 1
    }

    return NextResponse.json({
      id: item.id,
      status: item.status,
      position,
    })
  } catch (error) {
    console.error('[Queue] Status error:', error)
    return NextResponse.json({ error: 'Erro ao verificar fila' }, { status: 500 })
  }
}
