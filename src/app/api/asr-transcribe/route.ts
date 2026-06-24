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

/**
 * ASR Transcribe Proxy — recebe URL ou base64 de áudio,
 * repassa para o GPU server (WireGuard) que usa Whisper-large-v3-turbo
 * para transcrever, e retorna o texto.
 *
 * Usado pelo admin para auto-transcrever áudio de referência
 * quando faz upload, corta ou edita vozes. O refText gerado é
 * essencial para que o F5-TTS clone a voz corretamente.
 *
 * 🛡️ BLINDAGEM: Sem refText, vozes "falam em línguas" — erro #14 documentado.
 * NÃO remova a transcrição automática. Ver BLINDAGEM.md.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'

const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

export async function POST(req: NextRequest) {
  try {
    // Verificar se é admin
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { audioUrl, audioBase64 } = body

    if (!audioUrl && !audioBase64) {
      return NextResponse.json(
        { error: 'audioUrl ou audioBase64 obrigatório' },
        { status: 400 }
      )
    }

    // Montar body para o GPU (snake_case)
    const gpuBody: Record<string, unknown> = {}
    if (audioUrl) {
      gpuBody.ref_audio_url = audioUrl
    }
    if (audioBase64) {
      gpuBody.ref_audio_base64 = audioBase64
    }

    console.log(`[asr-transcribe] Enviando para GPU: ${audioUrl ? `URL=${String(audioUrl).substring(0, 80)}` : 'base64'}`)

    // Chamar GPU ASR endpoint
    const gpuUrl = `${GPU_DIRECT_URL}/api/asr-transcribe`
    const res = await fetch(gpuUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gpuBody),
      signal: AbortSignal.timeout(60000), // 60s timeout para ASR
    })

    const result = await res.json()

    if (result.status === 'error') {
      console.error('[asr-transcribe] GPU erro:', result.error)
      return NextResponse.json(
        { error: result.error || 'Erro na transcrição ASR' },
        { status: 500 }
      )
    }

    console.log(`[asr-transcribe] OK: "${String(result.text).substring(0, 80)}"`)

    return NextResponse.json({
      text: result.text || '',
      duration: result.duration || 0,
    })
  } catch (err) {
    console.error('[asr-transcribe] Erro:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
