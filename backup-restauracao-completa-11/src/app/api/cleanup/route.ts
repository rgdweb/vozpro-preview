import { NextResponse } from 'next/server'

const AUDIO_SERVER_URL = process.env.AUDIO_SERVER_URL || 'http://147.15.77.137'
const AUDIO_SERVER_API_KEY = process.env.AUDIO_SERVER_API_KEY || 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1'

export async function GET() {
  try {
    await fetch(`${AUDIO_SERVER_URL}/cleanup.php`, {
      method: 'GET',
      headers: {
        ...(AUDIO_SERVER_API_KEY ? { 'Authorization': `Bearer ${AUDIO_SERVER_API_KEY}` } : {}),
      },
    })
    return NextResponse.json({ status: 'ok' })
  } catch {
    // Silencioso - cleanup não deve quebrar nada
    return NextResponse.json({ status: 'skip' })
  }
}
