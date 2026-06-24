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

// GET /api/voices - List all voices with variations (public, only active)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    const where: Record<string, unknown> = { active: true }
    if (category && category !== 'all') {
      where.category = category
    }

    const voices = await db.voice.findMany({
      where,
      include: {
        variations: {
          where: { active: true },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    })

    return NextResponse.json(voices)
  } catch (error) {
    console.error('Error fetching voices:', error)
    return NextResponse.json({ error: 'Erro ao buscar vozes' }, { status: 500 })
  }
}

// POST /api/voices - Create a new voice (admin only)
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { name, description, gender, age, accent, pitch, category, order } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    const voice = await db.voice.create({
      data: {
        name: name.trim(),
        description: description || '',
        gender: gender || 'Auto',
        age: age || 'Auto',
        accent: accent || 'Auto',
        pitch: pitch || 'Auto',
        category: category || '',
        order: order || 0,
      },
    })

    return NextResponse.json(voice, { status: 201 })
  } catch (error) {
    console.error('Error creating voice:', error)
    return NextResponse.json({ error: 'Erro ao criar voz' }, { status: 500 })
  }
}
