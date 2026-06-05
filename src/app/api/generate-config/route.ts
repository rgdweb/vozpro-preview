import { NextResponse } from 'next/server'

// GET /api/generate-config - Retorna config para geracao (URL do PHP server)
// Endpoint publico (sem auth) pois o cliente precisa saber onde gerar audio
export async function GET() {
  try {
    return NextResponse.json({
      phpServerUrl: process.env.AUDIO_SERVER_URL || '',
    })
  } catch (error) {
    console.error('Error getting generate config:', error)
    return NextResponse.json({ error: 'Erro ao obter configuração' }, { status: 500 })
  }
}
