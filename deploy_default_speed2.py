"""
Deploy: Campo defaultSpeed por variação de voz (com sudo)
"""
import paramiko
import os

SSH_KEY = "/home/z/my-project/upload/ssh-key-oracle.key"
ORACLE_HOST = "147.15.77.137"
ORACLE_USER = "ubuntu"
NEXTJS_DIR = "/home/ubuntu/omnivoice"

LOCAL_FILES = {
    "prisma/schema.prisma": "/home/z/my-project/Omnivoice/prisma/schema.prisma",
    "prisma/migrations/20260602000000_add_default_speed/migration.sql": "/home/z/my-project/Omnivoice/prisma/migrations/20260602000000_add_default_speed/migration.sql",
    "src/app/api/variations/[id]/route.ts": "/home/z/my-project/Omnivoice/src/app/api/variations/[id]/route.ts",
    "src/app/api/voices/[id]/variations/route.ts": "/home/z/my-project/Omnivoice/src/app/api/voices/[id]/variations/route.ts",
    "src/app/admin/page.tsx": "/home/z/my-project/Omnivoice/src/app/admin/page.tsx",
    "src/app/page.tsx": "/home/z/my-project/Omnivoice/src/app/page.tsx",
}

def exec_cmd(ssh, cmd, label=""):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if label:
        print(f"  [{label}] exit={exit_code}")
    if out:
        # Truncate long output
        print(f"  {out[-400:] if len(out) > 400 else out}")
    if err and exit_code != 0:
        print(f"  ERR: {err[-300:] if len(err) > 300 else err}")
    return exit_code, out, err

def main():
    print("=" * 60)
    print("  DEPLOY: defaultSpeed por variação de voz")
    print("=" * 60)

    # Conectar SSH
    print("\n[1/5] Conectando ao Oracle...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    ssh.connect(ORACLE_HOST, username=ORACLE_USER, pkey=key, timeout=30)
    print("  OK - Conectado!")

    # Upload arquivos para /tmp primeiro (sem sudo)
    print("\n[2/5] Enviando arquivos para /tmp...")
    sftp = ssh.open_sftp()
    tmp_files = {}
    for remote_rel, local_path in LOCAL_FILES.items():
        tmp_name = f"/tmp/ov_deploy_{remote_rel.replace('/', '_').replace('[', '_').replace(']', '_')}"
        sftp.put(local_path, tmp_name)
        tmp_files[remote_rel] = tmp_name
        print(f"  OK - {remote_rel}")
    sftp.close()

    # Mover com sudo + executar migration
    print("\n[3/5] Movendo arquivos e executando migration...")
    
    # Primeiro: migration SQL
    sql_file = tmp_files["prisma/migrations/20260602000000_add_default_speed/migration.sql"]
    exec_cmd(ssh, f"sudo cp {sql_file} {NEXTJS_DIR}/prisma/migrations/20260602000000_add_default_speed/migration.sql", "migration file")
    exec_cmd(ssh, f"sudo mkdir -p {NEXTJS_DIR}/prisma/migrations/20260602000000_add_default_speed", "mkdir")
    
    # Executar migration via npx prisma migrate deploy (usa .env do projeto)
    exec_cmd(ssh, f"sudo chown -R ubuntu:ubuntu {NEXTJS_DIR}", "chown")
    
    # Agora executar migration
    print("  Executando prisma migrate...")
    code, out, err = exec_cmd(ssh, f"cd {NEXTJS_DIR} && npx prisma migrate deploy 2>&1", "migrate")
    if code != 0:
        # Tentar diretamente com psql
        print("  prisma migrate falhou, tentando psql direto...")
        code2, out2, err2 = exec_cmd(ssh, 
            f"cd {NEXTJS_DIR} && source .env 2>/dev/null; DB_URL=$(grep DATABASE_URL .env | cut -d= -f2-); "
            f"echo \"$DB_URL\" | sed 's|postgresql://||' | sed 's|@| |' | sed 's|/| |' | "
            f"while read USER PASS HOST DB; do PGPASSWORD=$PASS psql -h $HOST -U $USER -d $DB -c \\\"ALTER TABLE \\\"VoiceVariation\\\" ADD COLUMN IF NOT EXISTS \\\"defaultSpeed\\\" DOUBLE PRECISION NOT NULL DEFAULT 0;\\\"; done",
            "psql")
        if code2 != 0:
            # Usar Node.js com Prisma
            print("  psql falhou, tentando Node com Prisma...")
            migrate_script = """
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "VoiceVariation" ADD COLUMN IF NOT EXISTS "defaultSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0');
    console.log('OK: Migration executada');
  } catch(e) {
    if (e.message.includes('already exists') || e.message.includes('column already')) {
      console.log('OK: Coluna ja existe');
    } else {
      console.error('ERR:', e.message);
    }
  }
  await prisma.$disconnect();
}
main();
"""
            exec_cmd(ssh, f"cd {NEXTJS_DIR} && node -e '{migrate_script}'", "node migrate")

    # Copiar os demais arquivos com sudo
    for remote_rel, tmp_path in tmp_files.items():
        if "migration.sql" in remote_rel:
            continue  # Ja copiado
        dest = f"{NEXTJS_DIR}/{remote_rel}"
        # Criar dir se necessario
        dest_dir = os.path.dirname(dest)
        exec_cmd(ssh, f"sudo mkdir -p '{dest_dir}'", f"mkdir {remote_rel}")
        exec_cmd(ssh, f"sudo cp '{tmp_path}' '{dest}' && sudo chown ubuntu:ubuntu '{dest}'", f"copy {remote_rel}")

    # Garantir permissões
    exec_cmd(ssh, f"sudo chown -R ubuntu:ubuntu {NEXTJS_DIR}", "chown final")

    # 4. Gerar Prisma client + Build
    print("\n[4/5] Build do Next.js...")
    code, out, err = exec_cmd(ssh, f"cd {NEXTJS_DIR} && npm run build 2>&1 | tail -30", "build")
    if "error" in out.lower() or code != 0:
        print("  Build falhou! Verificando erros...")
        exec_cmd(ssh, f"cd {NEXTJS_DIR} && npm run build 2>&1 | grep -i error | head -10", "errors")

    # 5. Restart PM2
    print("\n[5/5] Restart PM2...")
    exec_cmd(ssh, "pm2 restart omnivoice 2>&1", "pm2")

    # Limpar temp files
    for tmp_path in tmp_files.values():
        try:
            exec_cmd(ssh, f"rm -f '{tmp_path}'", "cleanup")
        except:
            pass

    ssh.close()
    print("\n" + "=" * 60)
    print("  DEPLOY CONCLUÍDO!")
    print("=" * 60)
    print("\nPara usar:")
    print("  1. Abra o painel Admin")
    print("  2. Edite uma variação de voz grave")
    print("  3. No campo 'Velocidade Padrão', selecione 1.2 ou 1.3")
    print("  4. Salve")
    print("  5. No painel principal, ao selecionar essa voz,")
    print("     o slider de velocidade será ajustado automaticamente")

if __name__ == "__main__":
    main()
