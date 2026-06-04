import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession } from '@/lib/auth'
import { db } from '@/lib/db'

// GET /api/admin/settings - Return all system settings
export async function GET() {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const settings = await db.systemSetting.findMany()
    const config: Record<string, string> = {}
    for (const s of settings) {
      config[s.key] = s.value
    }

    return NextResponse.json(config)
  } catch (error) {
    console.error('Error getting settings:', error)
    return NextResponse.json({ error: 'Erro ao obter configurações' }, { status: 500 })
  }
}

// PUT /api/admin/settings - Update system settings
export async function PUT(request: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await request.json()
    const { key, value } = body

    if (!key) {
      return NextResponse.json({ error: 'Key é obrigatória' }, { status: 400 })
    }

    await db.systemSetting.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    })

    return NextResponse.json({ success: true, key, value })
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json({ error: 'Erro ao salvar configuração' }, { status: 500 })
  }
}
