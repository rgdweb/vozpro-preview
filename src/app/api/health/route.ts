import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const AUDIO_SERVER_URL = process.env.AUDIO_SERVER_URL || 'https://sorteiomax.com.br/omnivoice'
const AUDIO_SERVER_API_KEY = process.env.AUDIO_SERVER_API_KEY || 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1'

// GET /api/health — Diagnóstico completo do sistema
export async function GET() {
  const result: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    status: 'ok',
    checks: {},
    problemas: [],
  }

  // 1. Verificar DATABASE (Neon PostgreSQL)
  try {
    const dbStart = Date.now()
    await db.$queryRaw`SELECT 1 as ok`
    const dbLatency = Date.now() - dbStart

    // Contar registros
    const [userCount, voiceCount, trackCount] = await Promise.all([
      db.user.count(),
      db.voice.count(),
      db.track.count(),
    ])

    result.checks.database = {
      ok: true,
      latencia_ms: dbLatency,
      usuarios: userCount,
      vozes: voiceCount,
      trilhas: trackCount,
    }
  } catch (err) {
    result.checks.database = { ok: false, erro: String(err) }
    result.problemas.push('Database inacessível')
    result.status = 'critical'
  }

  // 2. Verificar FILA
  try {
    const processing = await db.generationQueue.count({ where: { status: 'processing' } })
    const waiting = await db.generationQueue.count({ where: { status: 'waiting' } })
    const stuck = await db.generationQueue.count({
      where: {
        status: 'processing',
        startedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
      },
    })

    const queueStatus: Record<string, unknown> = {
      processing,
      waiting,
      ocupada: processing >= 1,
    }

    if (stuck > 0) {
      queueStatus.stuck = stuck
      queueStatus.acao = 'Itens presos detectados — será necessário desbloquear'
      result.problemas.push(`${stuck} itens presos na fila`)
      // Auto-unstick
      await db.generationQueue.updateMany({
        where: {
          status: 'processing',
          startedAt: { lt: new Date(Date.now() - 10 * 60 * 1000) },
        },
        data: { status: 'failed', completedAt: new Date() },
      })
      // Promover próximo
      if (processing - stuck < 1 && waiting > 0) {
        const next = await db.generationQueue.findFirst({
          where: { status: 'waiting' },
          orderBy: { createdAt: 'asc' },
        })
        if (next) {
          await db.generationQueue.update({
            where: { id: next.id },
            data: { status: 'processing', startedAt: new Date() },
          })
        }
      }
      queueStatus.auto_fix = 'Itens presos foram limpos'
    }

    result.checks.fila = queueStatus
  } catch (err) {
    result.checks.fila = { ok: false, erro: String(err) }
  }

  // 3. Verificar SERVIDOR PHP (tunnel + GPU + disco)
  try {
    const phpStart = Date.now()
    const phpRes = await fetch(`${AUDIO_SERVER_URL}/health.php`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${AUDIO_SERVER_API_KEY}` },
      signal: AbortSignal.timeout(10000),
    })
    const phpLatency = Date.now() - phpStart

    if (phpRes.ok) {
      const phpData = await phpRes.json()
      result.checks.php_server = {
        ok: true,
        latencia_ms: phpLatency,
        ...phpData,
      }

      // Propagar problemas do PHP
      if (phpData.problemas && Array.isArray(phpData.problemas)) {
        for (const p of phpData.problemas) {
          result.problemas.push(`[PHP] ${p}`)
        }
      }

      // Atualizar status geral baseado no PHP
      if (phpData.status === 'critical') result.status = 'critical'
      else if (phpData.status === 'warning' && result.status === 'ok') result.status = 'warning'
    } else {
      result.checks.php_server = { ok: false, status: phpRes.status }
      result.problemas.push('Servidor PHP inacessível')
      if (result.status === 'ok') result.status = 'warning'
    }
  } catch (err) {
    result.checks.php_server = { ok: false, erro: 'Timeout ou sem conexão' }
    result.problemas.push('Servidor PHP não respondeu')
    if (result.status === 'ok') result.status = 'warning'
  }

  // 4. Verificar VERCel/env
  result.checks.vercel = {
    node_env: process.env.NODE_ENV || 'não definido',
    database_url: process.env.DATABASE_URL ? 'configurada' : 'NÃO CONFIGURADA',
    hf_space_url: process.env.HF_SPACE_URL ? 'configurada' : 'vazia (usa tunnel)',
    audio_server: AUDIO_SERVER_URL,
  }

  // 5. Status geral
  if (Array.isArray(result.problemas) && result.problemas.length > 0) {
    if (result.status === 'ok') result.status = 'warning'
  }

  result.total_problemas = Array.isArray(result.problemas) ? result.problemas.length : 0

  return NextResponse.json(result)
}

// POST /api/health?restart=true — Trigger cleanup no PHP server
export async function POST() {
  try {
    const cleanupRes = await fetch(`${AUDIO_SERVER_URL}/cleanup.php`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${AUDIO_SERVER_API_KEY}` },
      signal: AbortSignal.timeout(15000),
    })

    const cleanupData = await cleanupRes.json()
    return NextResponse.json({ ok: true, cleanup: cleanupData })
  } catch (err) {
    return NextResponse.json({ ok: false, erro: String(err) }, { status: 500 })
  }
}
