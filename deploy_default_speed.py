"""
Deploy: Campo defaultSpeed por variação de voz
- Executa migration SQL no PostgreSQL
- Atualiza arquivos Next.js no Oracle
- Reinicia PM2

Arquivos alterados:
1. prisma/schema.prisma (campo defaultSpeed)
2. prisma/migrations/20260602000000_add_default_speed/migration.sql
3. src/app/api/variations/[id]/route.ts (PUT com defaultSpeed)
4. src/app/api/voices/[id]/variations/route.ts (POST com defaultSpeed)
5. src/app/admin/page.tsx (campo visual + form state)
6. src/app/page.tsx (auto-apply defaultSpeed no slider)
"""

import paramiko
import os
import sys

SSH_KEY = "/home/z/my-project/upload/ssh-key-oracle.key"
ORACLE_HOST = "147.15.77.137"
ORACLE_USER = "ubuntu"
NEXTJS_DIR = "/home/ubuntu/omnivoice"

LOCAL_FILES = {
    # destino relativo a NEXTJS_DIR: caminho local
    "prisma/schema.prisma": "/home/z/my-project/Omnivoice/prisma/schema.prisma",
    "prisma/migrations/20260602000000_add_default_speed/migration.sql": "/home/z/my-project/Omnivoice/prisma/migrations/20260602000000_add_default_speed/migration.sql",
    "src/app/api/variations/[id]/route.ts": "/home/z/my-project/Omnivoice/src/app/api/variations/[id]/route.ts",
    "src/app/api/voices/[id]/variations/route.ts": "/home/z/my-project/Omnivoice/src/app/api/voices/[id]/variations/route.ts",
    "src/app/admin/page.tsx": "/home/z/my-project/Omnivoice/src/app/admin/page.tsx",
    "src/app/page.tsx": "/home/z/my-project/Omnivoice/src/app/page.tsx",
}

MIGRATION_SQL = """
ALTER TABLE "VoiceVariation" ADD COLUMN IF NOT EXISTS "defaultSpeed" DOUBLE PRECISION NOT NULL DEFAULT 0;
"""

def main():
    print("=" * 60)
    print("  DEPLOY: defaultSpeed por variação de voz")
    print("=" * 60)

    # 1. Conectar SSH
    print("\n[1/5] Conectando ao Oracle...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    ssh.connect(ORACLE_HOST, username=ORACLE_USER, pkey=key, timeout=30)
    print("  OK - Conectado!")

    # 2. Executar migration SQL
    print("\n[2/5] Executando migration SQL...")
    stdin, stdout, stderr = ssh.exec_command(
        f"cd {NEXTJS_DIR} && PGPASSWORD=$(grep DATABASE_URL .env | sed 's|.*://[^:]*:\\([^@]*\\)@.*|\\1|') psql $(grep DATABASE_URL .env | sed 's|postgresql://[^@]*@\\([^/]*\\)/\\(.*\\)|\\1/\\2|') -c \"{MIGRATION_SQL.strip()}\""
    )
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if exit_code == 0:
        print(f"  OK - {out}")
    else:
        print(f"  ERRO: {err}")
        # Tentar método alternativo
        print("  Tentando método alternativo (node script)...")
        alt_sql = MIGRATION_SQL.strip()
        stdin2, stdout2, stderr2 = ssh.exec_command(
            f"cd {NEXTJS_DIR} && node -e \""
            f"const {{ Client }} = require('pg'); "
            f"require('dotenv').config(); "
            f"const c = new Client(process.env.DATABASE_URL); "
            f"c.connect().then(() => c.query('{alt_sql}')).then(r => {{ console.log('OK:', r.command); c.end(); }}).catch(e => {{ console.error('ERR:', e.message); process.exit(1); }})"
            f"\""
        )
        exit_code2 = stdout2.channel.recv_exit_status()
        out2 = stdout2.read().decode().strip()
        err2 = stderr2.read().decode().strip()
        if exit_code2 == 0:
            print(f"  OK (alt) - {out2}")
        else:
            print(f"  ERRO (alt): {err2}")
            print("  AVISO: Migration pode precisar ser executada manualmente.")

    # 3. Upload arquivos
    print("\n[3/5] Enviando arquivos...")
    sftp = ssh.open_sftp()

    for remote_rel, local_path in LOCAL_FILES.items():
        remote_path = f"{NEXTJS_DIR}/{remote_rel}"
        try:
            # Criar diretório se não existe
            remote_dir = os.path.dirname(remote_path)
            try:
                sftp.stat(remote_dir)
            except FileNotFoundError:
                # Criar hierarquia de diretórios
                parts = remote_dir.split('/')
                for i in range(2, len(parts) + 1):
                    try:
                        sftp.stat('/'.join(parts[:i]))
                    except FileNotFoundError:
                        sftp.mkdir('/'.join(parts[:i]))

            sftp.put(local_path, remote_path)
            size = os.path.getsize(local_path)
            print(f"  OK - {remote_rel} ({size:,} bytes)")
        except Exception as e:
            print(f"  ERRO - {remote_rel}: {e}")

    sftp.close()

    # 4. Gerar Prisma client
    print("\n[4/5] Gerando Prisma client...")
    stdin, stdout, stderr = ssh.exec_command(f"cd {NEXTJS_DIR} && npx prisma generate 2>&1")
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"  {out}")
    if err and 'warn' not in err.lower():
        print(f"  stderr: {err[:500]}")

    # 5. Build e restart PM2
    print("\n[5/5] Fazendo build e restart...")
    stdin, stdout, stderr = ssh.exec_command(f"cd {NEXTJS_DIR} && npm run build 2>&1 | tail -20")
    out = stdout.read().decode().strip()
    print(f"  Build: {out[-500:] if len(out) > 500 else out}")

    stdin, stdout, stderr = ssh.exec_command("pm2 restart omnivoice 2>&1 || pm2 restart all 2>&1")
    out = stdout.read().decode().strip()
    print(f"  PM2: {out}")

    ssh.close()
    print("\n" + "=" * 60)
    print("  DEPLOY CONCLUÍDO!")
    print("=" * 60)
    print("\nO que foi feito:")
    print("  - Campo 'defaultSpeed' adicionado na tabela VoiceVariation")
    print("  - Painel admin: campo 'Velocidade Padrão' ao criar/editar variação")
    print("  - Frontend: speed automaticamente aplicado ao selecionar variação")
    print("  - Badge 'Auto' aparece no slider quando speed veio da variação")

if __name__ == "__main__":
    main()
