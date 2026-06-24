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
 * 🛡️ BLINDAGEM — Audio Server Client
 * ⚠️ NÃO ALTERE O FALLBACK DA API KEY. O PHP server (config.php) usa
 * 'omnivoice_sk_2024_secure_key_v4' — se mudar aqui, upload quebra com
 * "Nao autorizado". Erro já cometido em 2026-06-24. Ver BLINDAGEM.md.
 *
 * ⚠️ NÃO mude module-level const para function getters — o Next.js bakes
 * module-level const defaults no build. Se usar const, o valor fica
 * congelado no build e ignora o .env em runtime.
 *
 * Flow: Upload audio → saved permanently on PHP server → when generating TTS,
 * fetch from server → re-upload to HuggingFace Space → generate speech.
 */

// Ler sempre do process.env em tempo de execução (não const — Next.js bakes const defaults)
function getAudioServerUrl(): string {
  return process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
}

// 🛡️ FALLBACK SAGRADO: 'omnivoice_sk_2024_secure_key_v4' — DEVE casar com PHP config.php
// NUNCA usar 'omnivoice_api_key_2026_secure' (valor antigo, causa "Nao autorizado")
function getAudioServerApiKey(): string {
  return process.env.AUDIO_SERVER_API_KEY || 'omnivoice_sk_2024_secure_key_v4'
}

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
    return `${getAudioServerUrl()}/${oldDomainMatch[1]}`
  }
  // Se e caminho relativo (comeca com /), prefixar com Oracle base
  if (url.startsWith('/') && !url.startsWith('//')) {
    return `${getAudioServerUrl()}${url}`
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

  const uploadUrl = `${getAudioServerUrl()}/upload.php`
  const apiKey = getAudioServerApiKey()

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
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
    await fetch(`${getAudioServerUrl()}/delete.php`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(getAudioServerApiKey() ? { 'Authorization': `Bearer ${getAudioServerApiKey()}` } : {}),
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
    await fetch(`${getAudioServerUrl()}/cleanup.php`, {
      method: 'GET',
      headers: {
        ...(getAudioServerApiKey() ? { 'Authorization': `Bearer ${getAudioServerApiKey()}` } : {}),
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
  return url.includes(getAudioServerUrl().replace('https://', '').replace('http://', ''))
}
