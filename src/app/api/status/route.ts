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
import { db } from '@/lib/db'

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

    // 3. HuggingFace Space — removido (space morto/404, nao usado)
    checks.hfSpace = { ok: false, message: 'HF Space removido do sistema' }

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
