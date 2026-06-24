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
import { db } from '@/lib/db'

// GET /api/settings - Return public system settings (no auth required)
export async function GET() {
  try {
    const settings = await db.systemSetting.findMany({
      where: {
        key: { in: ['enableVoiceUpload', 'watermarkAudioPath', 'watermarkVolume', 'googleClientId', 'paywallEnabled', 'paymentAmount'] },
      },
    })

    const config: Record<string, string | boolean> = { enableVoiceUpload: false, googleClientId: '', paywallEnabled: false, paymentAmount: '1.00' }
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
    return NextResponse.json({ enableVoiceUpload: false, watermarkAudioPath: '', watermarkVolume: '0.08', googleClientId: '', paymentAmount: '1.00' })
  }
}
