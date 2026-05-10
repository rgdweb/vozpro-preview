/**
 * Seed: Cria o primeiro usuário admin se não existir nenhum.
 * Executar: npx tsx prisma/seed.ts
 *
 * Ou usar via API: POST /api/admin/users com name, email, password, role
 */
import { db } from '../src/lib/db'
import { hashPassword } from '../src/lib/auth'

async function main() {
  // Verificar se já existe algum usuário
  const count = await db.user.count()

  if (count > 0) {
    console.log(`Já existem ${count} usuário(s) no banco. Nenhum criado.`)
    // Listar usuários existentes
    const users = await db.user.findMany({ select: { name: true, email: true, role: true, active: true } })
    for (const u of users) {
      console.log(`  - ${u.name} (${u.email}) [${u.role}] ${u.active ? '✓' : '✗'}`)
    }
    return
  }

  // Criar usuário admin padrão
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@omnivoice.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'VozPro@2026'

  const user = await db.user.create({
    data: {
      name: 'Administrador',
      email: adminEmail,
      password: hashPassword(adminPassword),
      role: 'admin',
      active: true,
    },
  })

  console.log(`✅ Usuário admin criado com sucesso!`)
  console.log(`   Email: ${user.email}`)
  console.log(`   Senha: ${adminPassword}`)
  console.log(`   (Altere a senha após o primeiro login)`)
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect())
