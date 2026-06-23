/**
 * GPU Proxy — repassa o request do frontend EXATAMENTE como está para o GPU via WireGuard.
 * Não modifica o body, não busca no banco, não strip SSML.
 * Só resolve o problema de CORS/SSL: browser -> server -> WireGuard -> GPU.
 */
import { NextRequest, NextResponse } from 'next/server'

const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const gpuUrl = `${GPU_DIRECT_URL}/api/native-generate`

    const res = await fetch(gpuUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    })

    const result = await res.json()
    return NextResponse.json(result, { status: res.status })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }
}
