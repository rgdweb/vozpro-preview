import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/settings - Return public system settings (no auth required)
export async function GET() {
  try {
    const settings = await db.systemSetting.findMany({
      where: {
        key: { in: ['enableVoiceUpload', 'watermarkAudioPath', 'watermarkVolume', 'googleClientId', 'paywallEnabled'] },
      },
    })

    const config: Record<string, string | boolean> = { enableVoiceUpload: false, googleClientId: '', paywallEnabled: false }
    for (const s of settings) {
      if (s.key === 'enableVoiceUpload') {
        config[s.key] = s.value === 'true'
      } else {
        config[s.key] = s.value
      }
    }

    return NextResponse.json(config)
  } catch (error) {
    console.error('Error getting public settings:', error)
    return NextResponse.json({ enableVoiceUpload: false, watermarkAudioPath: '', watermarkVolume: '0.08', googleClientId: '' })
  }
}
