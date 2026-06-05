import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const ORACLE_BASE = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'

// GET /api/status - Check system health (no auth required)
export async function GET() {
  try {
    const checks: Record<string, { ok: boolean; message: string }> = {}

    // 1. Database
    try {
      const voiceCount = await db.voice.count()
      const variationCount = await db.voiceVariation.count()
      checks.database = { ok: true, message: `${voiceCount} vozes, ${variationCount} variações` }
    } catch (err) {
      checks.database = { ok: false, message: `Erro: ${String(err)}` }
    }

    // 2. Audio Server (PHP hosting)
    const audioServerUrl = process.env.AUDIO_SERVER_URL
    const audioServerKey = process.env.AUDIO_SERVER_API_KEY
    if (audioServerUrl) {
      try {
        const res = await fetch(audioServerUrl + '/upload.php', {
          method: 'OPTIONS',
          signal: AbortSignal.timeout(5000),
        })
        checks.audioServer = {
          ok: res.ok || res.status === 405,
          message: `${audioServerUrl} - ${res.ok ? 'OK' : 'responding'}${audioServerKey ? ' (key set)' : ' (NO KEY!)'}`,
        }
      } catch {
        checks.audioServer = { ok: false, message: `${audioServerUrl} - NÃO RESPONDE` }
      }
    } else {
      checks.audioServer = { ok: false, message: 'AUDIO_SERVER_URL não configurada no Vercel' }
    }

    // 3. GPU Server (tunnel)
    try {
      const tunnelRes = await fetch(ORACLE_BASE + '/get_tunnel.php', {
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      })
      if (tunnelRes.ok) {
        const tunnelData = await tunnelRes.json()
        checks.gpuServer = {
          ok: tunnelData.status === 'online',
          message: tunnelData.status === 'online'
            ? `${tunnelData.tunnelUrl?.substring(0, 50) || 'online'}`
            : `Offline: ${tunnelData.message || 'desconhecido'}`,
        }
      } else {
        checks.gpuServer = { ok: false, message: `Oracle PHP respondeu HTTP ${tunnelRes.status}` }
      }
    } catch {
      checks.gpuServer = { ok: false, message: `${ORACLE_BASE} - NAO RESPONDE` }
    }

    // 4. Variations with/without audio
    try {
      const allVars = await db.voiceVariation.findMany({
        include: { voice: true },
      })
      const withServer = allVars.filter(v => {
        const vAny = v as unknown as Record<string, string>
        return vAny.refAudioServerUrl || vAny.refAudioBlobUrl
      })
      const withoutServer = allVars.filter(v => {
        const vAny = v as unknown as Record<string, string>
        return !vAny.refAudioServerUrl && !vAny.refAudioBlobUrl
      })
      checks.variations = {
        ok: withoutServer.length === 0,
        message: `${allVars.length} total: ${withServer.length} com áudio no servidor, ${withoutServer.length} SEM áudio no servidor`,
      }
      if (withoutServer.length > 0) {
        checks.variations.details = withoutServer.map(v => `${v.voice.name} - ${v.label}`)
      }
    } catch {
      checks.variations = { ok: false, message: 'Erro ao verificar variações' }
    }

    const allOk = Object.values(checks).every(c => c.ok)

    return NextResponse.json({
      ok: allOk,
      timestamp: new Date().toISOString(),
      checks,
    })
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: String(error),
    }, { status: 500 })
  }
}
