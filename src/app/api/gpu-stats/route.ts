// GET /api/gpu-stats — Busca estatísticas da GPU via WireGuard VPN

import { NextResponse } from 'next/server'

const ORACLE_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'

export async function GET() {
  try {
    // WireGuard VPN: check /health endpoint via Oracle Nginx
    const healthRes = await fetch(`${ORACLE_BASE}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })

    if (!healthRes.ok) {
      return NextResponse.json({
        status: 'offline',
        error: 'GPU offline via WireGuard',
        gpu: null,
      })
    }

    const healthData = await healthRes.json()

    if (healthData.status !== 'ok' || !healthData.model_loaded) {
      return NextResponse.json({
        status: 'offline',
        error: 'GPU modelo nao carregado',
        gpu: null,
      })
    }

    // Buscar stats do GPU monitor (porta 7861 via WireGuard)
    try {
      const res = await fetch(`${ORACLE_BASE}/stats`, {
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
      })
    } catch (fetchErr) {
      return NextResponse.json({
        status: 'monitor_offline',
        error: 'GPU Monitor nao disponivel',
        gpu: null,
      })
    }
  } catch (err) {
    return NextResponse.json({
      status: 'error',
      error: err instanceof Error ? err.message : 'Erro desconhecido',
      gpu: null,
    })
  }
}
