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

// GET /api/generate-token - Generates a temporary signed token for direct browser-to-PHP generation
// This avoids Vercel's 60s timeout (Hobby plan) for the generation proxy
export async function GET() {
  try {
    const audioServerUrl = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
    const apiKey = process.env.AUDIO_SERVER_API_KEY || ''

    if (!audioServerUrl || !apiKey) {
      return NextResponse.json(
        { error: 'Servidor de audio nao configurado' },
        { status: 500 }
      )
    }

    // Generate token: timestamp.hmac_sha256(timestamp, apiKey)
    // Validade de 15 minutos (geracao pode demorar com retries)
    const timestamp = Math.floor(Date.now() / 1000)
    const encoder = new TextEncoder()

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(apiKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(String(timestamp))
    )

    // Convert signature to hex
    const hmac = Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    return NextResponse.json({
      generateUrl: `${audioServerUrl}/generate.php`,
      token: `${timestamp}.${hmac}`,
    })
  } catch (error) {
    console.error('Generate token error:', error)
    return NextResponse.json(
      { error: 'Erro ao gerar token de geracao' },
      { status: 500 }
    )
  }
}
