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

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

export interface ManagedCategory {
  name: string
  emoji: string
}

const DEFAULT_TRACK_CATEGORIES: ManagedCategory[] = [
  { name: 'ALEGRE', emoji: '😄' },
  { name: 'BOSSA', emoji: '🎷' },
  { name: 'CINEMA', emoji: '🎬' },
  { name: 'DRUMSTEP', emoji: '🥁' },
  { name: 'EFEITOS', emoji: '💥' },
  { name: 'HIP HOP', emoji: '🎤' },
  { name: 'JAZZ', emoji: '🎷' },
  { name: 'LOUNGE', emoji: '🛋️' },
  { name: 'NEWS', emoji: '📰' },
  { name: 'REGGAE', emoji: '🌴' },
  { name: 'ROCK', emoji: '🎸' },
  { name: 'TANGO', emoji: '💃' },
  { name: 'TECNOLOGIA', emoji: '💻' },
  { name: 'TRAILER', emoji: '🎥' },
  { name: 'URBANO', emoji: '🏙️' },
  { name: 'VINHETAS', emoji: '📻' },
]

const DEFAULT_VOICE_CATEGORIES: ManagedCategory[] = [
  { name: 'Graves', emoji: '🎙️' },
  { name: 'Super Graves', emoji: '🔊' },
  { name: 'Festas', emoji: '🎉' },
  { name: 'Igrejas', emoji: '⛪' },
  { name: 'Mercado', emoji: '🛒' },
  { name: 'Vinheta', emoji: '📻' },
  { name: 'Vozes Famosas', emoji: '⭐' },
  { name: 'Vozes Inéditas', emoji: '🆕' },
  { name: 'Narradores', emoji: '📖' },
  { name: 'Vendas', emoji: '💼' },
  { name: 'Infantil', emoji: '🧒' },
  { name: 'Idoso', emoji: '👴' },
]

// GET /api/categories - Return managed categories (admin only)
export async function GET() {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const settings = await db.systemSetting.findMany({
      where: {
        key: { in: ['managed_track_categories', 'managed_voice_categories'] },
      },
    })

    const config: Record<string, string> = {}
    for (const s of settings) {
      config[s.key] = s.value
    }

    // If no categories exist yet, return defaults (don't save them yet)
    const trackCategories: ManagedCategory[] = config.managed_track_categories
      ? JSON.parse(config.managed_track_categories)
      : DEFAULT_TRACK_CATEGORIES

    const voiceCategories: ManagedCategory[] = config.managed_voice_categories
      ? JSON.parse(config.managed_voice_categories)
      : DEFAULT_VOICE_CATEGORIES

    return NextResponse.json({ tracks: trackCategories, voices: voiceCategories })
  } catch (error) {
    console.error('Error fetching managed categories:', error)
    return NextResponse.json({ error: 'Erro ao buscar categorias' }, { status: 500 })
  }
}

// PUT /api/categories - Save managed categories (admin only)
export async function PUT(request: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { tracks, voices } = body as {
      tracks?: ManagedCategory[]
      voices?: ManagedCategory[]
    }

    // Validate structure
    if (tracks) {
      if (!Array.isArray(tracks)) {
        return NextResponse.json({ error: 'Formato inválido para categorias de trilhas' }, { status: 400 })
      }
      for (const cat of tracks) {
        if (!cat.name || typeof cat.name !== 'string') {
          return NextResponse.json({ error: 'Cada categoria precisa de um nome' }, { status: 400 })
        }
      }
    }

    if (voices) {
      if (!Array.isArray(voices)) {
        return NextResponse.json({ error: 'Formato inválido para categorias de vozes' }, { status: 400 })
      }
      for (const cat of voices) {
        if (!cat.name || typeof cat.name !== 'string') {
          return NextResponse.json({ error: 'Cada categoria precisa de um nome' }, { status: 400 })
        }
      }
    }

    // Save to SystemSetting
    if (tracks !== undefined) {
      await db.systemSetting.upsert({
        where: { key: 'managed_track_categories' },
        update: { value: JSON.stringify(tracks) },
        create: { key: 'managed_track_categories', value: JSON.stringify(tracks) },
      })
    }

    if (voices !== undefined) {
      await db.systemSetting.upsert({
        where: { key: 'managed_voice_categories' },
        update: { value: JSON.stringify(voices) },
        create: { key: 'managed_voice_categories', value: JSON.stringify(voices) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving managed categories:', error)
    return NextResponse.json({ error: 'Erro ao salvar categorias' }, { status: 500 })
  }
}
