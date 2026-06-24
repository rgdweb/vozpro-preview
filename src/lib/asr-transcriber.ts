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
 * ASR Transcriber — Real implementation using GPU Whisper ASR.
 *
 * 🛡️ BLINDAGEM: Este módulo era um STUB que retornava texto vazio.
 * Isso causava refText vazio no banco, fazendo vozes "falarem em línguas".
 * Erro #14 documentado. NÃO reverter para stub. Ver BLINDAGEM.md.
 *
 * Fluxo: VozPro → /api/asr-transcribe → GPU (10.99.0.2:7860) → Whisper-large-v3-turbo
 *
 * O GPU server carrega OmniVoice com load_asr=True, que inclui
 * openai/whisper-large-v3-turbo como modelo ASR. O endpoint
 * /api/asr-transcribe aceita ref_audio_url ou ref_audio_base64
 * e retorna o texto transcrito.
 */

export interface TranscriptionResult {
  success: boolean
  text: string
  confidence: number
  error?: string
}

/**
 * Transcreve áudio a partir de uma URL.
 * Usa o endpoint /api/asr-transcribe que repassa para o GPU.
 */
export async function transcribeFromUrl(audioUrl: string): Promise<TranscriptionResult> {
  if (!audioUrl || !audioUrl.trim()) {
    return { success: false, text: '', confidence: 0, error: 'URL de áudio vazia' }
  }

  try {
    const res = await fetch('/api/asr-transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl }),
      signal: AbortSignal.timeout(60000),
    })

    const data = await res.json()

    if (data.error) {
      console.error('[asr-transcriber] Erro:', data.error)
      return { success: false, text: '', confidence: 0, error: data.error }
    }

    const text = data.text || ''
    return {
      success: text.length > 0,
      text,
      confidence: text.length > 0 ? 0.95 : 0,
    }
  } catch (err) {
    console.error('[asr-transcriber] Erro na transcrição:', err)
    return {
      success: false,
      text: '',
      confidence: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * Transcreve áudio a partir de base64.
 * Usa o endpoint /api/asr-transcribe que repassa para o GPU.
 */
export async function transcribeFromBase64(audioBase64: string): Promise<TranscriptionResult> {
  if (!audioBase64 || !audioBase64.trim()) {
    return { success: false, text: '', confidence: 0, error: 'Base64 de áudio vazio' }
  }

  try {
    const res = await fetch('/api/asr-transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64 }),
      signal: AbortSignal.timeout(60000),
    })

    const data = await res.json()

    if (data.error) {
      console.error('[asr-transcriber] Erro:', data.error)
      return { success: false, text: '', confidence: 0, error: data.error }
    }

    const text = data.text || ''
    return {
      success: text.length > 0,
      text,
      confidence: text.length > 0 ? 0.95 : 0,
    }
  } catch (err) {
    console.error('[asr-transcriber] Erro na transcrição base64:', err)
    return {
      success: false,
      text: '',
      confidence: 0,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
