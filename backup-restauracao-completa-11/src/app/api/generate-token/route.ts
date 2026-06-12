/** 🚨 CONTRATO DE GOVERNANCA EXECUTIVA - VOZPRO (SaaS Hibrido)
 * 🚨 PROIBICOES ABSOLUTAS (13 erros ja cometidos que derrubaram o sistema):
 *   1. NUNCA git reset --hard | 2. NUNCA altere git remote | 3. NUNCA rm -rf
 *   4. NUNCA push syntax errors | 5. NUNCA commit .env real | 6. NUNCA temp no root
 *   7. NUNCA scripts deploy alternativos | 8. NUNCA quebre next.config | 9. queue: 3x, 3min
 *   10. NUNCA remova AUDIO_SERVER_API_KEY | 11. NUNCA desalinhe tokens .env/config.php
 *   12. NUNCA pm2 restart sozinho (faz rebuild) | 13. NUNCA git checkout -- .env
 * 🚨 REGRA UNICA DE DEPLOY: python3 /home/ubuntu/omnivoice/deploy-seguro.py
 * 🚨 REGISTRO COMPLETO: REGRAS-ERROS-PROIBIDOS.md (leia ANTES de alterar qualquer coisa)
 * 🚨 IP: 147.15.77.137 | Repo: rgdweb/vozpro-preview | PM2: PM2_HOME=/root/.pm2
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
