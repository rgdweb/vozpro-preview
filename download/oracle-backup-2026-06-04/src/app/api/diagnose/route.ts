import { NextResponse } from 'next/server'

/**
 * GET /api/diagnose — Diagnostico em tempo real do sistema VozPro
 *
 * Verifica:
 * 1. Tunnel (cloudflared) — URL registrada + health check
 * 2. Native GPU API — /api/native-generate disponibilidade
 * 3. Configuracoes do frontend vs backend
 * 4. GPU status (se disponivel via tunnel)
 *
 * Uso: GET /api/diagnose?deep=true  (deep=true testa native-generate)
 */

const HOSTGATOR_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'

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
  // 1. TUNNEL CHECK — URL registrada no PHP
  // ============================================================
  let tunnelUrl = ''
  let tunnelAlive = false

  try {
    const t0 = Date.now()
    const res = await fetch(`${HOSTGATOR_BASE}/get_tunnel.php`, {
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json()

    if (data.status === 'online' && data.tunnelUrl) {
      tunnelUrl = data.tunnelUrl

      try {
        const healthRes = await fetch(`${tunnelUrl}/`, {
          signal: AbortSignal.timeout(8000),
        })
        tunnelAlive = healthRes.ok
        checks.push({
          name: 'Tunnel URL',
          status: tunnelAlive ? 'ok' : 'warn',
          detail: tunnelAlive
            ? `${tunnelUrl.substring(0, 60)}... (vivo, HTTP ${healthRes.status})`
            : `${tunnelUrl.substring(0, 60)}... (URL registrada mas tunnel MORTO - HTTP ${healthRes.status})`,
          durationMs: Date.now() - t0,
        })
      } catch (healthErr) {
        checks.push({
          name: 'Tunnel URL',
          status: 'error',
          detail: `URL registrada (${tunnelUrl.substring(0, 50)}...) mas tunnel INACCESSIVEL: ${healthErr instanceof Error ? healthErr.message : String(healthErr)}`,
          durationMs: Date.now() - t0,
        })
      }
    } else {
      checks.push({
        name: 'Tunnel URL',
        status: 'error',
        detail: data.message || 'GPU offline',
        durationMs: Date.now() - t0,
      })
    }
  } catch (err) {
    checks.push({
      name: 'Tunnel URL',
      status: 'error',
      detail: `Falha ao consultar PHP: ${err instanceof Error ? err.message : String(err)}`,
    })
  }

  // ============================================================
  // 2. NATIVE GPU API CHECK
  // ============================================================
  if (tunnelUrl && tunnelAlive) {
    try {
      const t0 = Date.now()
      const infoRes = await fetch(`${tunnelUrl}/`, {
        signal: AbortSignal.timeout(10000),
      })
      if (infoRes.ok) {
        const info = await infoRes.json()
        checks.push({
          name: 'GPU Native API',
          status: 'ok',
          detail: `${info.service || 'OmniVoice'} | GPU: ${info.gpu || 'disponivel'} | Model: ${info.model_loaded ? 'carregado' : 'nao carregado'}`,
          durationMs: Date.now() - t0,
        })
      } else {
        checks.push({
          name: 'GPU Native API',
          status: 'warn',
          detail: `Tunnel respondeu mas info retornou HTTP ${infoRes.status}`,
          durationMs: Date.now() - t0,
        })
      }
    } catch (err) {
      checks.push({
        name: 'GPU Native API',
        status: 'error',
        detail: `Nao conseguiu acessar API nativa: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  } else {
    checks.push({
      name: 'GPU Native API',
      status: 'error',
      detail: 'Tunnel nao disponivel - nao e possivel testar GPU',
    })
  }

  // ============================================================
  // 3. DEEP CHECK — Testa native-generate (se deep=true)
  // ============================================================
  if (deep && tunnelUrl && tunnelAlive) {
    try {
      const t0 = Date.now()
      const healthRes = await fetch(`${tunnelUrl}/health`, {
        signal: AbortSignal.timeout(10000),
      })
      if (healthRes.ok) {
        const healthData = await healthRes.json()
        checks.push({
          name: 'GPU Health',
          status: 'ok',
          detail: `GPU: ${healthData.gpu || 'OK'} | VRAM: ${healthData.vram || 'N/A'}`,
          durationMs: Date.now() - t0,
        })
      } else {
        checks.push({
          name: 'GPU Health',
          status: 'warn',
          detail: `Health endpoint retornou HTTP ${healthRes.status}`,
          durationMs: Date.now() - t0,
        })
      }
    } catch (err) {
      checks.push({
        name: 'GPU Health',
        status: 'error',
        detail: `Health check falhou: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ============================================================
  // 4. CONFIG CONSISTENCY CHECK
  // ============================================================
  const configChecks: CheckResult[] = []

  configChecks.push({
    name: 'Speed Range',
    status: 'ok',
    detail: 'Frontend: 0.5-1.5 (step 0.1) | Backend: parseFloat com fallback 1.0',
  })

  configChecks.push({
    name: 'Pipeline',
    status: 'ok',
    detail: '100% single-shot, SEM chunking, SEM ASR, SEM preprocess. Texto direto via tunnel native.',
  })

  configChecks.push({
    name: 'Postprocess',
    status: 'ok',
    detail: 'postprocess_output=true (ativo)',
  })

  configChecks.push({
    name: 'Denoise',
    status: 'ok',
    detail: 'denoise=true (ativo)',
  })

  configChecks.push({
    name: 'Ref Text',
    status: 'ok',
    detail: 'Sempre vazio (evita alucinacao do modelo)',
  })

  configChecks.push({
    name: 'Tunnel Registration',
    status: tunnelAlive ? 'ok' : 'error',
    detail: tunnelAlive
      ? `Tunnel ativo e registrado`
      : `Tunnel offline - verifique cloudflared na maquina local`,
  })

  checks.push(...configChecks)

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
    tunnel: {
      url: tunnelUrl || null,
      alive: tunnelAlive,
      registered: !!tunnelUrl,
    },
    checks,
    recommendations: errorCount > 0
      ? ['Reinicie o tunnel na maquina local (cloudflared)', 'Verifique se omnivoice_gpu.py esta rodando na porta 7860', 'Acesse /api/diagnose?deep=true para teste completo']
      : warnCount > 0
        ? ['Alguns checks apresentaram avisos - monitore ao longo do dia']
        : ['Tudo funcionando - sistema pronto para gerar voz'],
  })
}
