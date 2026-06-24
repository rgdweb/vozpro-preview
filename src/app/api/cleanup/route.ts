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
