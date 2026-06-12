/**
 * Audio Server Client - uploads to Oracle VPS (147.15.77.137)
 * Replaces Vercel Blob for audio file storage.
 *
 * Flow: Upload audio → saved permanently on PHP server → when generating TTS,
 * fetch from server → re-upload to HuggingFace Space → generate speech.
 */

const AUDIO_SERVER_URL = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
const AUDIO_SERVER_API_KEY = process.env.AUDIO_SERVER_API_KEY || 'omnivoice_api_key_2026_secure'

export interface AudioUploadResult {
  success: boolean
  url: string
  filename: string
  size: number
  tipo: string
}

/**
 * Corrige URLs de audio que ainda apontam pro sorteiomax.com.br (dominio antigo).
 * O upload.php no Oracle ainda pode retornar URLs com sorteiomax hard-coded.
 * Extrai o path (/audios/ref/arquivo.mp3) e monta a URL correta do Oracle.
 */
export function fixAudioServerUrl(url: string): string {
  if (!url || typeof url !== 'string') return url
  // Se aponta pro sorteiomax (morto), extrair path e remontar com Oracle
  const oldDomainMatch = url.match(/sorteiomax\.com\.br\/omnivoice\/(.+)/i)
  if (oldDomainMatch) {
    return `${AUDIO_SERVER_URL}/${oldDomainMatch[1]}`
  }
  // Se e caminho relativo (comeca com /), prefixar com Oracle base
  if (url.startsWith('/') && !url.startsWith('//')) {
    return `${AUDIO_SERVER_URL}${url}`
  }
  return url
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
    url: fixAudioServerUrl(data.url as string),
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
