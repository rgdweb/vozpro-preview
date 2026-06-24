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

// GET /api/gpu-stats — Busca estatísticas da GPU via WireGuard VPN

import { NextResponse } from 'next/server'

const ORACLE_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

export async function GET() {
  let healthUrl = GPU_DIRECT_URL
  let healthOk = false
  let healthData: Record<string, unknown> | null = null

  // Try 1: WireGuard direct URL
  try {
    const healthRes = await fetch(`${GPU_DIRECT_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })

    if (healthRes.ok) {
      healthData = await healthRes.json()
      if (healthData.status === 'ok' && healthData.model_loaded) {
        healthOk = true
      }
    }
  } catch {
    healthOk = false
  }

  // Try 2: ORACLE_BASE (nginx fallback) — only if direct failed
  if (!healthOk) {
    healthUrl = ORACLE_BASE
    try {
      const healthRes = await fetch(`${ORACLE_BASE}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      })

      if (healthRes.ok) {
        healthData = await healthRes.json()
        if (healthData.status === 'ok' && healthData.model_loaded) {
          healthOk = true
        }
      }
    } catch {
      healthOk = false
    }
  }

  // Both health checks failed
  if (!healthOk) {
    return NextResponse.json({
      status: 'offline',
      error: 'GPU offline (WireGuard direct + nginx fallback failed)',
      gpu: null,
    })
  }

  // Health OK — now fetch /stats from the same URL that worked for health
  try {
    const res = await fetch(`${healthUrl}/stats`, {
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) {
      return NextResponse.json({
        status: 'monitor_offline',
        error: 'GPU Monitor nao disponivel',
        gpu: null,
      })
    }

    const gpu = await res.json()
    return NextResponse.json({
      status: 'ok',
      gpu,
      viaWireGuard: true,
      url: healthUrl,
    })
  } catch (fetchErr) {
    return NextResponse.json({
      status: 'monitor_offline',
      error: 'GPU Monitor nao disponivel',
      gpu: null,
    })
  }
}
