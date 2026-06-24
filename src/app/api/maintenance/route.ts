import { NextRequest, NextResponse } from 'next/server'

const ORACLE_URL = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
const ORACLE_API_KEY = process.env.AUDIO_SERVER_API_KEY || 'omnivoice_sk_2024_secure_key_v4'

/**
 * Maintenance API - Live repair tools
 * 
 * GET  /api/maintenance?action=status     → Full system status (WireGuard + GPU + Oracle)
 * GET  /api/maintenance?action=gpu-status  → GPU status via WireGuard VPN
 * POST /api/maintenance?action=gpu-cleanup → Force GPU cleanup via WireGuard
 * POST /api/maintenance?action=oracle-cleanup → Clean Oracle temp files
 */

async function getGpuUrl(): Promise<string | null> {
  try {
    const res = await fetch(`${ORACLE_URL}/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data.status !== 'ok' || !data.model_loaded) return null
    return ORACLE_URL
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'status'

  // === GPU Status (via WireGuard) ===
  if (action === 'gpu-status') {
    const gpuUrl = await getGpuUrl()
    if (!gpuUrl) {
      return NextResponse.json({ error: 'GPU offline via WireGuard', status: 'offline' }, { status: 503 })
    }
    try {
      const res = await fetch(`${gpuUrl}/api/maint/status`, { signal: AbortSignal.timeout(10000) })
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      return NextResponse.json({ error: 'GPU inacessível via WireGuard', details: String(err) }, { status: 504 })
    }
  }

  // === Full system status ===
  if (action === 'status') {
    const results: Record<string, unknown> = {}

    // 1. WireGuard VPN
    const gpuUrl = await getGpuUrl()
    results.wireguard = {
      url: gpuUrl,
      ok: !!gpuUrl,
    }

    // 2. GPU Status (via WireGuard)
    if (gpuUrl) {
      try {
        const gpuRes = await fetch(`${gpuUrl}/api/maint/status`, { signal: AbortSignal.timeout(10000) })
        results.gpu = await gpuRes.json()
        results.gpu.wireguard_ok = true
      } catch {
        results.gpu = { error: 'Inacessível', wireguard_ok: false }
      }
    } else {
      results.gpu = { error: 'GPU offline', wireguard_ok: false }
    }

    // 3. Oracle health
    try {
      const oracleRes = await fetch(`${ORACLE_URL}/info.php`, {
        headers: { 'Authorization': `Bearer ${ORACLE_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      results.oracle = oracleRes.ok ? await oracleRes.json() : { error: oracleRes.statusText }
    } catch {
      results.oracle = { error: 'Inacessível' }
    }

    // 4. Oracle files
    try {
      const filesRes = await fetch(`${ORACLE_URL}/check.php`, {
        headers: { 'Authorization': `Bearer ${ORACLE_API_KEY}` },
        signal: AbortSignal.timeout(10000),
      })
      results.files = filesRes.ok ? await filesRes.json() : null
    } catch {
      // ignore
    }

    return NextResponse.json(results)
  }

  return NextResponse.json({ error: 'Ação desconhecida' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  let action = 'gpu-cleanup'

  try {
    const body = await request.json()
    action = body.action || action
  } catch {
    // no body, use default
  }

  // === GPU Cleanup (via WireGuard) ===
  if (action === 'gpu-cleanup') {
    const gpuUrl = await getGpuUrl()
    if (!gpuUrl) {
      return NextResponse.json({ error: 'GPU offline via WireGuard', status: 'offline' }, { status: 503 })
    }
    try {
      const res = await fetch(`${gpuUrl}/api/maint/cleanup`, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      return NextResponse.json({ error: 'Falha ao limpar GPU', details: String(err) }, { status: 504 })
    }
  }

  // === Oracle Cleanup ===
  if (action === 'oracle-cleanup') {
    try {
      const res = await fetch(`${ORACLE_URL}/cleanup.php`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ORACLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(30000),
      })
      const data = await res.json()
      return NextResponse.json(data)
    } catch (err) {
      return NextResponse.json({ error: 'Falha ao limpar Oracle', details: String(err) }, { status: 504 })
    }
  }

  return NextResponse.json({ error: 'Ação desconhecida', action }, { status: 400 })
}
