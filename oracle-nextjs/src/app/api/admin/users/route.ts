import { NextRequest, NextResponse } from 'next/server'
import { getAdminSession, listUsers, registerUser, updateUser, deleteUser } from '@/lib/auth'

// GET /api/admin/users — listar todos os usuários
export async function GET() {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const users = await listUsers()
    return NextResponse.json({ users })
  } catch (error) {
    console.error('List users error:', error)
    return NextResponse.json({ error: 'Erro ao listar usuários' }, { status: 500 })
  }
}

// POST /api/admin/users — criar novo usuário
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { name, email, password, role } = await req.json()

    if (!name || !email || !password) {
      return NextResponse.json({ error: 'Nome, email e senha são obrigatórios' }, { status: 400 })
    }

    if (password.length < 4) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 4 caracteres' }, { status: 400 })
    }

    const validRoles = ['admin', 'user']
    const userRole = validRoles.includes(role) ? role : 'user'

    const result = await registerUser(name, email, password, userRole)

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Usuário criado com sucesso' })
    }

    return NextResponse.json({ error: result.error }, { status: 400 })
  } catch (error) {
    console.error('Create user error:', error)
    return NextResponse.json({ error: 'Erro ao criar usuário' }, { status: 500 })
  }
}

// PUT /api/admin/users — editar usuário
export async function PUT(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id, name, email, role, active, paymentExempt, password } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (role !== undefined) updateData.role = role
    if (active !== undefined) updateData.active = active
    if (paymentExempt !== undefined) updateData.paymentExempt = paymentExempt
    if (password) updateData.password = password

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    const updated = await updateUser(id, updateData)
    return NextResponse.json({ success: true, user: updated })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao atualizar usuário'
    console.error('Update user error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/admin/users — deletar usuário
export async function DELETE(req: NextRequest) {
  try {
    const isAdmin = await getAdminSession()
    if (!isAdmin) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { id } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório' }, { status: 400 })
    }

    await deleteUser(id)
    return NextResponse.json({ success: true, message: 'Usuário deletado' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao deletar usuário'
    console.error('Delete user error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
