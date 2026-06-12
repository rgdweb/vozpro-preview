import { NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'

// GET /api/server-config - Return audio server config for direct client uploads
// This bypasses Vercel's 4.5MB body size limit for large files
export async function GET() {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    return NextResponse.json({
      url: process.env.AUDIO_SERVER_URL || '',
      apiKey: process.env.AUDIO_SERVER_API_KEY || '',
    })
  } catch (error) {
    console.error('Error getting server config:', error)
    return NextResponse.json({ error: 'Erro ao obter configuração' }, { status: 500 })
  }
}
