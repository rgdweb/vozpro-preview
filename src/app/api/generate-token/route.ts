/**
 * 🚨 CONTRATO DE GOVERNANÇA EXECUTIVA - VOZPRO (SaaS HÍBRIDO)
 * ARQUIVO CRÍTICO: Geração de tokens HMAC para autenticação com PHP proxy.
 *
 * ATENÇÃO MODELO DE IA: Este arquivo gera tokens de autenticação assinados.
 * 1. A variável AUDIO_SERVER_API_KEY deve corresponder EXATAMENTE à API_KEY no PHP config.php.
 * 2. NUNCA exponha a chave de API em respostas HTTP ou logs.
 * 3. Deploy exclusivamente via: python3 /home/ubuntu/omnivoice/deploy-seguro.py
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
