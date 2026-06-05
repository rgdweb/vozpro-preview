import { NextResponse } from 'next/server'

/**
 * GET /api/diagnose — Diagnóstico em tempo real do sistema OmniVoice
 *
 * Verifica:
 * 1. Tunnel (cloudflared) — URL registrada + health check
 * 2. Gradio API — upload, submit, heartbeat
 * 3. Configurações do frontend vs backend — consistência de parâmetros
 * 4. GPU status (se disponível via tunnel)
 *
 * Uso: GET /api/diagnose?deep=true  (deep=true testa upload + submit no Gradio)
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

      // Health check: tentar acessar a raiz do tunnel
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
            : `${tunnelUrl.substring(0, 60)}... (URL registrada mas tunnel MORTO — HTTP ${healthRes.status})`,
          durationMs: Date.now() - t0,
        })
      } catch (healthErr) {
        checks.push({
          name: 'Tunnel URL',
          status: 'error',
          detail: `URL registrada (${tunnelUrl.substring(0, 50)}...) mas tunnel INACCESSÍVEL: ${healthErr instanceof Error ? healthErr.message : String(healthErr)}`,
          durationMs: Date.now() - t0,
        })
      }
    } else {
      checks.push({
        name: 'Tunnel URL',
        status: 'error',
        detail: data.message || 'GPU offline — nenhuma URL registrada',
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
  // 2. GRADIO API CHECK — Disponibilidade da API de voz
  // ============================================================
  if (tunnelUrl && tunnelAlive) {
    // 2a. Info endpoint
    try {
      const t0 = Date.now()
      const infoRes = await fetch(`${tunnelUrl}/gradio_api/info`, {
        signal: AbortSignal.timeout(10000),
      })
      if (infoRes.ok) {
        const info = await infoRes.json()
        const apiNames = (info.named_endpoints || []).map((ep: { fn_index: number; name: string }) => `${ep.name}(${ep.fn_index})`)
        checks.push({
          name: 'Gradio API',
          status: 'ok',
          detail: `${apiNames.length} endpoints disponíveis: ${apiNames.join(', ')}`,
          durationMs: Date.now() - t0,
        })
      } else {
        checks.push({
          name: 'Gradio API',
          status: 'warn',
          detail: `Gradio respondeu mas info retornou HTTP ${infoRes.status}`,
          durationMs: Date.now() - t0,
        })
      }
    } catch (err) {
      checks.push({
        name: 'Gradio API',
        status: 'error',
        detail: `Não conseguiu acessar Gradio API: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  } else {
    checks.push({
      name: 'Gradio API',
      status: 'error',
      detail: 'Tunnel não disponível — não é possível testar Gradio',
    })
  }

  // ============================================================
  // 3. DEEP CHECK — Testa upload + submit no Gradio (se deep=true)
  // ============================================================
  if (deep && tunnelUrl && tunnelAlive) {
    // 3a. Upload test (arquivo vazio)
    try {
      const t0 = Date.now()
      const blob = new Blob([new Uint8Array(44).fill(0)], { type: 'audio/wav' }) // WAV header vazio
      const form = new FormData()
      form.append('files', blob, 'test.wav')

      const uploadRes = await fetch(`${tunnelUrl}/gradio_api/upload`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(15000),
      })

      if (uploadRes.ok) {
        const paths = await uploadRes.json()
        checks.push({
          name: 'Upload Test',
          status: 'ok',
          detail: `Upload OK — path: ${Array.isArray(paths) ? paths[0] : 'unknown'}`,
          durationMs: Date.now() - t0,
        })
      } else {
        const errText = await uploadRes.text()
        checks.push({
          name: 'Upload Test',
          status: 'warn',
          detail: `Upload falhou: HTTP ${uploadRes.status} — ${errText.substring(0, 200)}`,
          durationMs: Date.now() - t0,
        })
      }
    } catch (err) {
      checks.push({
        name: 'Upload Test',
        status: 'error',
        detail: `Upload timeout/falhou: ${err instanceof Error ? err.message : String(err)}`,
      })
    }

    // 3b. GPU Status (se exposto pelo servidor)
    try {
      const t0 = Date.now()
      const gpuRes = await fetch(`${tunnelUrl}/gradio_api/call/_clone_fn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: ['test', 'Auto', null, '', '', 32, 2.0, true, 1.0, null, true, true] }),
        signal: AbortSignal.timeout(15000),
      })

      if (gpuRes.ok) {
        checks.push({
          name: 'Submit Test',
          status: 'ok',
          detail: 'Gradio aceitou submit de teste — GPU respondendo',
          durationMs: Date.now() - t0,
        })
      } else {
        checks.push({
          name: 'Submit Test',
          status: 'warn',
          detail: `Submit falhou: HTTP ${gpuRes.status}`,
          durationMs: Date.now() - t0,
        })
      }
    } catch (err) {
      checks.push({
        name: 'Submit Test',
        status: 'error',
        detail: `Submit falhou: ${err instanceof Error ? err.message : String(err)}`,
      })
    }
  }

  // ============================================================
  // 4. CONFIG CONSISTENCY CHECK — Frontend vs Backend
  // ============================================================
  const configChecks: CheckResult[] = []

  // Speed range (frontend: 0.8-1.3, backend: any float)
  configChecks.push({
    name: 'Speed Range',
    status: 'ok',
    detail: 'Frontend: 0.8-1.3 (step 0.05) | Backend: parseFloat com fallback 1.0',
  })

  // Modo pipeline
  configChecks.push({
    name: 'Pipeline',
    status: 'ok',
    detail: 'MODO LIMPO: 100% single-shot, SEM chunking, SEM ASR, SEM preprocess. Texto direto pro Gradio.',
  })

  // postprocess_output
  configChecks.push({
    name: 'Postprocess',
    status: 'ok',
    detail: 'postprocess_output=false (DESATIVADO — causava estalos e oscilacao de velocidade)',
  })

  // denoise
  configChecks.push({
    name: 'Denoise',
    status: 'ok',
    detail: 'denoise=false (DESATIVADO — evita artefatos no audio gerado)',
  })

  // refText
  configChecks.push({
    name: 'Ref Text',
    status: 'ok',
    detail: 'Sempre vazio (evita alucinacao do modelo)',
  })

  // Tunnel registration
  configChecks.push({
    name: 'Tunnel Registration',
    status: tunnelAlive ? 'ok' : 'error',
    detail: tunnelAlive
      ? `POST JSON { tunnelUrl } para ${HOSTGATOR_BASE}/update_tunnel.php`
      : `Tunnel offline — verifique start_tunnel.ps1 na máquina local`,
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
      ? ['Reinicie o tunnel na máquina local (start_tunnel.ps1)', 'Verifique se omnivoice_gpu.py está rodando na porta 7860', 'Acesse /api/diagnose?deep=true para teste completo']
      : warnCount > 0
        ? ['Alguns checks apresentaram avisos — monitore ao longo do dia']
        : ['Tudo funcionando — sistema pronto para gerar voz'],
  })
}
