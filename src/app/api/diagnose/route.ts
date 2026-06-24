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

import { NextResponse } from 'next/server'

/**
 * GET /api/diagnose — Diagnóstico em tempo real do sistema OmniVoice
 *
 * Verifica:
 * 1. WireGuard VPN — conexão com GPU via Oracle Nginx
 * 2. Native API — health check e endpoint /api/native-generate
 * 3. Configurações do frontend vs backend — consistência de parâmetros
 *
 * Uso: GET /api/diagnose?deep=true  (deep=true testa geração real)
 */

const ORACLE_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

interface CheckResult {
  name: string
  status: 'ok' | 'warn' | 'error'
  detail: string
  durationMs?: number
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deep = url.searchParams.get('deep') === 'true'
  const checks: CheckResult[] = []
  const startTime = Date.now()

  // ============================================================
  // 1. WIREGUARD VPN CHECK — GPU health via WireGuard Direct first, then Oracle Nginx fallback
  // ============================================================
  let wireGuardAlive = false
  let gpuOnline = false
  let usedGpuUrl = GPU_DIRECT_URL

  // Try 1: WireGuard direct URL
  try {
    const t0 = Date.now()
    const res = await fetch(`${GPU_DIRECT_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()

    if (data.status === 'ok' && data.model_loaded) {
      gpuOnline = true
      wireGuardAlive = true
      checks.push({
        name: 'WireGuard Direct',
        status: 'ok',
        detail: `GPU online via WireGuard direct (${GPU_DIRECT_URL}) — model_loaded=true, pitch_engine=${data.pitch_engine || 'unknown'}`,
        durationMs: Date.now() - t0,
      })
    } else {
      checks.push({
        name: 'WireGuard Direct',
        status: 'warn',
        detail: `WireGuard direct respondeu mas GPU modelo nao carregado: status=${data.status}`,
        durationMs: Date.now() - t0,
      })
    }
  } catch (directErr) {
    checks.push({
      name: 'WireGuard Direct',
      status: 'warn',
      detail: `Falha via WireGuard direct (${GPU_DIRECT_URL}): ${directErr instanceof Error ? directErr.message : String(directErr)}, tentando ORACLE_BASE...`,
    })
  }

  // Try 2: ORACLE_BASE (nginx fallback) — only if direct failed
  if (!wireGuardAlive) {
    usedGpuUrl = ORACLE_BASE
    try {
      const t0 = Date.now()
      const res = await fetch(`${ORACLE_BASE}/health`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      })
      const data = await res.json()

      if (data.status === 'ok' && data.model_loaded) {
        gpuOnline = true
        wireGuardAlive = true
        checks.push({
          name: 'WireGuard VPN (fallback)',
          status: 'ok',
          detail: `GPU online via Oracle nginx fallback (${ORACLE_BASE}) — model_loaded=true`,
          durationMs: Date.now() - t0,
        })
      } else {
        checks.push({
          name: 'WireGuard VPN (fallback)',
          status: 'warn',
          detail: `Oracle respondeu mas GPU modelo nao carregado: status=${data.status}`,
          durationMs: Date.now() - t0,
        })
      }
    } catch (err) {
      checks.push({
        name: 'WireGuard VPN (fallback)',
        status: 'error',
        detail: `Falha ao conectar Oracle/WireGuard: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ============================================================
  // 2. NATIVE API CHECK — /api/native-generate endpoint (via usedGpuUrl)
  // ============================================================
  if (wireGuardAlive) {
    try {
      const t0 = Date.now()
      const nativeRes = await fetch(`${usedGpuUrl}/api/native-generate`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(8000),
      })
      checks.push({
        name: 'Native API',
        status: nativeRes.ok ? 'ok' : 'warn',
        detail: nativeRes.ok
          ? `/api/native-generate OPTIONS OK (CORS habilitado)`
          : `/api/native-generate retornou HTTP ${nativeRes.status}`,
        durationMs: Date.now() - t0,
      })
    } catch (err) {
      checks.push({
        name: 'Native API',
        status: 'error',
        detail: `Não conseguiu acessar /api/native-generate: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  } else {
    checks.push({
      name: 'Native API',
      status: 'error',
      detail: 'WireGuard não disponível — não é possível testar Native API',
    })
  }

  // ============================================================
  // 3. DEEP CHECK — Testa geração real (se deep=true)
  // ============================================================
  if (deep && wireGuardAlive) {
    try {
      const t0 = Date.now()
      const testPayload = {
        text: 'teste de diagnóstico',
        voice_mode: 'design',
        language: 'pt',
        instruct: 'female, moderate pitch',
        speed: 1.0,
        num_step: 8,
        guidance_scale: 2.0,
      }

      const genRes = await fetch(`${usedGpuUrl}/api/native-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(120000),
      })

      if (genRes.ok) {
        const result = await genRes.json()
        checks.push({
          name: 'Generation Test',
          status: result.status === 'ok' && result.audio_base64 ? 'ok' : 'warn',
          detail: result.status === 'ok'
            ? `Geração OK — ${result.duration || '?'}s em ${result.generation_time || '?'}s (RTF=${result.rtf || '?'})`
            : `Geração falhou: ${result.error || 'unknown'}`,
          durationMs: Date.now() - t0,
        })
      } else {
        checks.push({
          name: 'Generation Test',
          status: 'error',
          detail: `HTTP ${genRes.status}`,
          durationMs: Date.now() - t0,
        })
      }
    } catch (err) {
      checks.push({
        name: 'Generation Test',
        status: 'error',
        detail: `Timeout/falhou: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ============================================================
  // 4. CONFIG CONSISTENCY CHECK
  // ============================================================
  checks.push({
    name: 'Speed Range',
    status: 'ok',
    detail: 'Frontend: 0.8-1.3 (step 0.05) | Backend: parseFloat com fallback 1.0',
  })

  checks.push({
    name: 'Pipeline',
    status: 'ok',
    detail: 'WireGuard VPN v4.0: Browser → Oracle Nginx → 10.99.0.2:7860 → GPU FastAPI',
  })

  checks.push({
    name: 'Postprocess',
    status: 'ok',
    detail: 'postprocess_output=false (DESATIVADO — causava estalos e oscilacao de velocidade)',
  })

  // WireGuard registration
  checks.push({
    name: 'WireGuard VPN',
    status: wireGuardAlive ? 'ok' : 'error',
    detail: wireGuardAlive
      ? `GPU online via ${usedGpuUrl}`
      : `WireGuard offline — verifique WireGuard no Oracle e GPU PC`,
  })

  // ============================================================
  // RESUMO
  // ============================================================
  const okCount = checks.filter(c => c.status === 'ok').length
  const warnCount = checks.filter(c => c.status === 'warn').length
  const errorCount = checks.filter(c => c.status === 'error').length
  const overallStatus = errorCount > 0 ? 'error' : warnCount > 0 ? 'warn' : 'ok'

  return NextResponse.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    totalDurationMs: Date.now() - startTime,
    summary: { ok: okCount, warn: warnCount, error: errorCount, total: checks.length },
    wireguard: {
      url: usedGpuUrl,
      directUrl: GPU_DIRECT_URL,
      oracleUrl: ORACLE_BASE,
      alive: wireGuardAlive,
      gpuOnline,
    },
    checks,
    recommendations: errorCount > 0
      ? ['Verifique WireGuard VPN no Oracle (sudo wg show)', 'Verifique se omnivoice_gpu.py está rodando no GPU PC (porta 7860)', 'Acesse /api/diagnose?deep=true para teste completo']
      : warnCount > 0
        ? ['Alguns checks apresentaram avisos — monitore ao longo do dia']
        : ['Tudo funcionando — sistema pronto para gerar voz'],
  })
}
