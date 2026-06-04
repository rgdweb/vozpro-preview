#!/usr/bin/env python3
"""Coleta completa da estrutura do Oracle para documentação."""

import paramiko
import os

HOST = '147.15.77.137'
USER = 'ubuntu'
KEY_PATH = '/home/z/.ssh/oracle_key'
OUTPUT_DIR = '/home/z/my-project/download/oracle-scan'

def create_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    ssh.connect(HOST, username=USER, pkey=key, timeout=30)
    return ssh

def run(ssh, cmd, timeout=60):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err

def save(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  Saved: {path}")

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    ssh = create_ssh()
    print("SSH conectado!")

    # 1. Estrutura de pastas do projeto
    print("\n[1] Estrutura de pastas...")
    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice -maxdepth 5 -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.git/*' | sort")
    save(f"{OUTPUT_DIR}/01-directory-structure.txt", out)

    # 2. Schema Prisma
    print("[2] Schema Prisma...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/prisma/schema.prisma")
    save(f"{OUTPUT_DIR}/02-prisma-schema.prisma", out)

    # 3. package.json
    print("[3] package.json...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/package.json")
    save(f"{OUTPUT_DIR}/03-package.json", out)

    # 4. Variáveis de ambiente (.env)
    print("[4] .env...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/.env")
    save(f"{OUTPUT_DIR}/04-env.txt", out)

    # 5. PM2 config
    print("[5] PM2 config...")
    code, out, _ = run(ssh, "sudo PM2_HOME=/root/.pm2 pm2 prettylist 2>/dev/null || sudo PM2_HOME=/root/.pm2 pm2 jlist 2>/dev/null")
    save(f"{OUTPUT_DIR}/05-pm2-config.json", out)

    # 6. Ecosystem.config.js (se existir)
    print("[6] Ecosystem config...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/ecosystem.config.js 2>/dev/null; cat /home/ubuntu/omnivoice/ecosystem.config.cjs 2>/dev/null; echo '---NOT_FOUND_OR_END---'")
    save(f"{OUTPUT_DIR}/06-ecosystem.config.txt", out)

    # 7. next.config
    print("[7] next.config...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/next.config.ts")
    save(f"{OUTPUT_DIR}/07-next-config.ts", out)

    # 8. middleware
    print("[8] middleware.ts...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/middleware.ts")
    save(f"{OUTPUT_DIR}/08-middleware.ts", out)

    # 9. tsconfig
    print("[9] tsconfig.json...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/tsconfig.json")
    save(f"{OUTPUT_DIR}/09-tsconfig.json", out)

    # 10. Lib files
    print("[10] Lib files...")
    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice/src/lib -type f -name '*.ts' -o -name '*.tsx' 2>/dev/null | sort")
    lib_files = [f.strip() for f in out.strip().split('\n') if f.strip()]
    for f in lib_files:
        fname = os.path.basename(f)
        code, content, _ = run(ssh, f"cat {f}")
        save(f"{OUTPUT_DIR}/lib/{fname}", content)

    # 11. Todas as rotas API
    print("[11] API Routes...")
    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice/src/app/api -type f -name 'route.ts' | sort")
    api_files = [f.strip() for f in out.strip().split('\n') if f.strip()]
    for f in api_files:
        rel = f.replace('/home/ubuntu/omnivoice/src/app/api/', '')
        code, content, _ = run(ssh, f"cat {f}")
        save(f"{OUTPUT_DIR}/api-routes/{rel}", content)

    # 12. Páginas e componentes
    print("[12] Pages & Components...")
    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice/src/app -name 'page.tsx' -o -name 'layout.tsx' -o -name 'loading.tsx' | sort")
    page_files = [f.strip() for f in out.strip().split('\n') if f.strip()]
    for f in page_files:
        rel = f.replace('/home/ubuntu/omnivoice/', '')
        code, content, _ = run(ssh, f"cat {f}")
        save(f"{OUTPUT_DIR}/pages/{rel}", content)

    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice/src/components -type f -name '*.tsx' -o -name '*.ts' 2>/dev/null | sort")
    comp_files = [f.strip() for f in out.strip().split('\n') if f.strip()]
    for f in comp_files:
        rel = f.replace('/home/ubuntu/omnivoice/', '')
        code, content, _ = run(ssh, f"cat {f}")
        save(f"{OUTPUT_DIR}/components/{rel}", content)

    # 13. Arquivos PHP (tunnel etc)
    print("[13] PHP files...")
    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice -name '*.php' -type f | sort")
    php_files = [f.strip() for f in out.strip().split('\n') if f.strip()]
    for f in php_files:
        fname = os.path.basename(f)
        code, content, _ = run(ssh, f"cat {f}")
        save(f"{OUTPUT_DIR}/php/{fname}", content)

    # 14. Nginx config
    print("[14] Nginx config...")
    code, out, _ = run(ssh, "sudo cat /etc/nginx/sites-enabled/omnivoice 2>/dev/null; sudo cat /etc/nginx/sites-enabled/default 2>/dev/null; sudo nginx -T 2>/dev/null | head -200")
    save(f"{OUTPUT_DIR}/14-nginx-config.txt", out)

    # 15. Scripts
    print("[15] Scripts...")
    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice/scripts -type f 2>/dev/null | sort")
    script_files = [f.strip() for f in out.strip().split('\n') if f.strip()]
    for f in script_files:
        fname = os.path.basename(f)
        code, content, _ = run(ssh, f"cat {f}")
        save(f"{OUTPUT_DIR}/scripts/{fname}", content)

    # 16. System info
    print("[16] System info...")
    cmds = [
        "uname -a",
        "cat /etc/os-release | head -5",
        "free -h",
        "df -h /",
        "node --version",
        "npm --version",
        "npx prisma --version",
        "php --version 2>/dev/null | head -1",
        "sudo PM2_HOME=/root/.pm2 pm2 --version",
        "mysql --version 2>/dev/null || echo 'mysql not found'",
        "sudo nginx -v 2>&1",
    ]
    sysinfo = ""
    for c in cmds:
        code2, o, _ = run(ssh, c)
        sysinfo += f"$ {c}\n{o}\n\n"
    save(f"{OUTPUT_DIR}/16-system-info.txt", sysinfo)

    # 17. Prisma migrations list
    print("[17] Prisma migrations...")
    code, out, _ = run(ssh, "ls -la /home/ubuntu/omnivoice/prisma/migrations/ 2>/dev/null")
    save(f"{OUTPUT_DIR}/17-prisma-migrations.txt", out)

    # 18. Database dump (schema only, no data)
    print("[18] DB schema (Prisma describe)...")
    code, out, _ = run(ssh, "cd /home/ubuntu/omnivoice && npx prisma db describe --schema=prisma/schema.prisma 2>&1", timeout=30)
    save(f"{OUTPUT_DIR}/18-db-describe.txt", out)

    # 19. Public folder contents
    print("[19] Public folder...")
    code, out, _ = run(ssh, "find /home/ubuntu/omnivoice/public -type f | sort")
    save(f"{OUTPUT_DIR}/19-public-files.txt", out)

    # 20. Docker/container (se houver)
    print("[20] Docker check...")
    code, out, _ = run(ssh, "docker ps 2>/dev/null; docker-compose ps 2>/dev/null; echo '---END---'")
    save(f"{OUTPUT_DIR}/20-docker-check.txt", out)

    # 21. Backup script
    print("[21] Backup script...")
    code, out, _ = run(ssh, "cat /home/ubuntu/omnivoice/backup.sh 2>/dev/null")
    save(f"{OUTPUT_DIR}/21-backup.sh", out)

    ssh.close()
    print(f"\nScan completo! Arquivos salvos em {OUTPUT_DIR}/")

if __name__ == '__main__':
    main()
