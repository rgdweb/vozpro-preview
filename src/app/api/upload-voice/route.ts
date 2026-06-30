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
 * Upload Voice — Faz upload do áudio de referência e AUTO-TRANSCREVE.
 *
 * 🛡️ BLINDAGEM: O refText é ESSENCIAL para que o F5-TTS clone a voz
 * corretamente. Sem refText, vozes "falam em línguas" e ficam "locas".
 * Erro #14 documentado. NÃO remova a transcrição automática.
 * Ver BLINDAGEM.md.
 *
 * Fluxo:
 * 1. Upload do arquivo para PHP server (armazenamento permanente)
 * 2. Upload para HuggingFace Space (cache temporário)
 * 3. Auto-transcrição via GPU ASR (Whisper-large-v3-turbo)
 * 4. Retorna URLs + refText transcrito
 */
import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { uploadToAudioServer } from '@/lib/audio-server'

export const maxDuration = 60

const GPU_DIRECT_URL = process.env.GPU_DIRECT_URL || 'http://10.99.0.2:7860'

/**
 * Chama o GPU ASR para transcrever o áudio a partir de uma URL.
 * Falha silenciosamente — não deve bloquear o upload.
 */
async function autoTranscribe(serverUrl: string): Promise<string> {
  try {
    console.log(`[UploadVoice] Auto-transcrevendo: ${serverUrl.substring(0, 80)}`)
    const res = await fetch(`${GPU_DIRECT_URL}/api/asr-transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref_audio_url: serverUrl }),
      signal: AbortSignal.timeout(45000),
    })

    const data = await res.json()
    if (data.status === 'ok' && data.text) {
      console.log(`[UploadVoice] Transcrito: "${String(data.text).substring(0, 80)}"`)
      return data.text
    }
    console.warn('[UploadVoice] ASR retornou vazio ou erro:', data.error || 'sem texto')
    return ''
  } catch (err) {
    console.warn('[UploadVoice] Auto-transcrição falhou (não bloqueia upload):', err)
    return ''
  }
}

// POST /api/upload-voice - Upload reference audio to PHP hosting AND HuggingFace Space + auto-transcribe
export async function POST(req: NextRequest) {
  try {
    // Verificar se é admin
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo fornecido' }, { status: 400 })
    }

    // Step 1: Upload the file to PHP hosting (permanent storage)
    const ext = file.name.match(/\.(mp3|wav|ogg|m4a|flac|webm)$/i)?.[0] || '.wav'
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`
    const audioServerResult = await uploadToAudioServer(file, uniqueName, 'ref')
    console.log('[UploadVoice] Saved to audio server:', audioServerResult.url)

    // HF Space upload removido — space morto (404), causava timeout desnecessario.
    // Upload fica so no PHP server (fonte de verdade) + AutoASR no GPU.

    // Step 3: Auto-transcrever o áudio usando GPU ASR (Whisper)
    const refText = await autoTranscribe(audioServerResult.url)

    // Return success with PHP URL + transcription
    return NextResponse.json({
      path: '',                                     // HF Space removido (vazio)
      serverUrl: audioServerResult.url,            // PHP hosting URL (permanent)
      filename: audioServerResult.filename,        // filename on server (for deletion)
      url: audioServerResult.url,                  // permanent URL for reference
      name: file.name,
      refText,                                     // 🆕 Texto transcrito automaticamente
    })
  } catch (error) {
    console.error('[UploadVoice] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro no upload' },
      { status: 500 }
    )
  }
}
