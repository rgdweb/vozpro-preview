// GET /api/gpu-stats — Busca estatísticas da GPU local via tunnel
// Usa o mesmo mecanismo do tunnel-generate para descobrir a URL local

import { NextResponse } from 'next/server'

const HOSTGATOR_BASE = process.env.HOSTGATOR_BASE || 'https://sorteiomax.com.br/omnivoice'

async function getTunnelUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${HOSTGATOR_BASE}/get_tunnel.php`, {
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'online' || !data.tunnelUrl) return null
    return data.tunnelUrl
  } catch {
    return null
  }
}

export async function GET() {
  try {
    // Descobrir URL do tunnel (mesmo mecanismo do tunnel-generate)
    const tunnelUrl = await getTunnelUrl()

    if (!tunnelUrl) {
      return NextResponse.json({
        status: 'offline',
        error: 'Tunnel offline',
        gpu: null,
      })
    }

    // Buscar stats do GPU monitor local (porta 7861)
    // O tunnel redireciona: sorteiomax.com.br/omnivoice → localhost:7860
    // Para o GPU monitor: usamos a mesma URL base mas com porta diferente
    // O cloudflared precisa ter a porta 7861 configurada
    const gpuMonitorUrl = tunnelUrl.replace(/:(\d+)$/, ':7861').replace(/\/$/, '')

    try {
      const res = await fetch(`${gpuMonitorUrl}/stats`, {
        signal: AbortSignal.timeout(5000),
      })

      if (!res.ok) {
        return NextResponse.json({
          status: 'monitor_offline',
          error: 'GPU Monitor nao esta rodando na porta 7861',
          tunnelUrl: tunnelUrl.substring(0, 60),
          gpu: null,
        })
      }

      const gpu = await res.json()
      return NextResponse.json({
        status: 'ok',
        gpu,
      })
    } catch (fetchErr) {
      return NextResponse.json({
        status: 'monitor_offline',
        error: 'GPU Monitor nao esta rodando na porta 7861',
        tunnelUrl: tunnelUrl.substring(0, 60),
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
