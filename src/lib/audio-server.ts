/**
 * Audio Server Client - uploads to shared PHP hosting (sorteiomax.com.br)
 * Replaces Vercel Blob for audio file storage.
 *
 * Flow: Upload audio → saved permanently on PHP hosting → when generating TTS,
 * fetch from hosting → re-upload to HuggingFace Space → generate speech.
 */

const AUDIO_SERVER_URL = process.env.AUDIO_SERVER_URL || 'https://sorteiomax.com.br/omnivoice'
const AUDIO_SERVER_API_KEY = process.env.AUDIO_SERVER_API_KEY || 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1'

export interface AudioUploadResult {
  success: boolean
  url: string
  filename: string
  size: number
  tipo: string
}

/**
 * Upload a file to the PHP audio server.
 */
export async function uploadToAudioServer(
  file: File | Blob,
  filename: string,
  tipo: string = 'ref' // 'ref' (voice reference) or 'track' (music track)
): Promise<AudioUploadResult> {
  const formData = new FormData()
  formData.append('arquivo', file, filename)
  formData.append('tipo', tipo)

  const res = await fetch(`${AUDIO_SERVER_URL}/upload.php`, {
    method: 'POST',
    headers: {
      ...(AUDIO_SERVER_API_KEY ? { 'Authorization': `Bearer ${AUDIO_SERVER_API_KEY}` } : {}),
    },
    body: formData,
  })

  // Ler como texto primeiro - protege contra respostas nao-JSON (HTML, config.php, etc)
  const responseText = await res.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(responseText)
  } catch {
    throw new Error(`Servidor PHP retornou resposta invalida (HTTP ${res.status}). Tente novamente.`)
  }

  if (!data.sucesso) {
    throw new Error((data.erro as string) || 'Erro no upload para o servidor de áudio')
  }

  return {
    success: true,
    url: data.url,
    filename: data.arquivo,
    size: data.tamanho || 0,
    tipo: data.tipo || tipo,
  }
}

/**
 * Delete a file from the PHP audio server.
 */
export async function deleteFromAudioServer(
  filename: string,
  tipo: string = 'ref'
): Promise<void> {
  try {
    await fetch(`${AUDIO_SERVER_URL}/delete.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(AUDIO_SERVER_API_KEY ? { 'Authorization': `Bearer ${AUDIO_SERVER_API_KEY}` } : {}),
      },
      body: JSON.stringify({ tipo, arquivo: filename }),
    })
  } catch (error) {
    console.error('[AudioServer] Delete error:', error)
  }
}

/**
 * Cleanup temporary files (abandoned chunks, generated files) from PHP server.
 * Called automatically on page load and before generation.
 */
export async function cleanupAudioServer(): Promise<void> {
  try {
    await fetch(`${AUDIO_SERVER_URL}/cleanup.php`, {
      method: 'GET',
      headers: {
        ...(AUDIO_SERVER_API_KEY ? { 'Authorization': `Bearer ${AUDIO_SERVER_API_KEY}` } : {}),
      },
    })
  } catch (error) {
    // Silencioso - cleanup não deve quebrar a experiência
    console.warn('[AudioServer] Cleanup skip:', error)
  }
}

/**
 * Check if a URL is from our audio server.
 */
export function isAudioServerUrl(url: string): boolean {
  return url.includes(AUDIO_SERVER_URL.replace('https://', '').replace('http://', ''))
}
