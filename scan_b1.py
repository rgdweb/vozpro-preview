#!/usr/bin/env python3
"""Batch 1: Structure, schema, config, system info."""
import paramiko, os

HOST = '147.15.77.137'
USER = 'ubuntu'
KEY_PATH = '/home/z/.ssh/oracle_key'
OUT = '/home/z/my-project/download/oracle-scan'

def ssh_connect():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    ssh.connect(HOST, username=USER, pkey=key, timeout=30)
    return ssh

def run(ssh, cmd, timeout=30):
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    code = stdout.channel.recv_exit_status()
    return code, out, err

def save(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

ssh = ssh_connect()
print("SSH OK")

# 1. Directory structure
print("1. Directory structure...")
c, o, _ = run(ssh, "find /home/ubuntu/omnivoice -maxdepth 4 -not -path '*/node_modules/*' -not -path '*/.next/*' -not -path '*/.git/*' | sort")
save(f"{OUT}/01-directory-structure.txt", o)

# 2. Prisma schema
print("2. Prisma schema...")
c, o, _ = run(ssh, "cat /home/ubuntu/omnivoice/prisma/schema.prisma")
save(f"{OUT}/02-prisma-schema.prisma", o)

# 3. package.json
print("3. package.json...")
c, o, _ = run(ssh, "cat /home/ubuntu/omnivoice/package.json")
save(f"{OUT}/03-package.json", o)

# 4. .env
print("4. .env...")
c, o, _ = run(ssh, "cat /home/ubuntu/omnivoice/.env")
save(f"{OUT}/04-env.txt", o)

# 5. next.config
print("5. next.config...")
c, o, _ = run(ssh, "cat /home/ubuntu/omnivoice/next.config.ts")
save(f"{OUT}/05-next-config.ts", o)

# 6. middleware
print("6. middleware...")
c, o, _ = run(ssh, "cat /home/ubuntu/omnivoice/middleware.ts")
save(f"{OUT}/06-middleware.ts", o)

# 7. tsconfig
print("7. tsconfig...")
c, o, _ = run(ssh, "cat /home/ubuntu/omnivoice/tsconfig.json")
save(f"{OUT}/07-tsconfig.json", o)

# 8. System info
print("8. System info...")
cmds = ["uname -a", "cat /etc/os-release | head -5", "free -h", "df -h /",
        "node --version", "npm --version", "npx prisma --version",
        "php --version 2>/dev/null | head -1", "sudo PM2_HOME=/root/.pm2 pm2 --version",
        "sudo nginx -v 2>&1"]
info = ""
for cmd in cmds:
    c2, o2, _ = run(ssh, cmd)
    info += f"$ {cmd}\n{o2}\n\n"
save(f"{OUT}/08-system-info.txt", info)

# 9. PM2 status
print("9. PM2...")
c, o, _ = run(ssh, "sudo PM2_HOME=/root/.pm2 pm2 jlist 2>/dev/null")
save(f"{OUT}/09-pm2-config.json", o)

# 10. Nginx
print("10. Nginx...")
c, o, _ = run(ssh, "sudo cat /etc/nginx/sites-enabled/omnivoice 2>/dev/null; echo '==='; sudo cat /etc/nginx/sites-enabled/default 2>/dev/null; echo '===END==='")
save(f"{OUT}/10-nginx-config.txt", o)

# 11. DB describe
print("11. DB schema...")
c, o, _ = run(ssh, "cd /home/ubuntu/omnivoice && npx prisma db describe 2>&1", timeout=30)
save(f"{OUT}/11-db-describe.txt", o)

ssh.close()
print("Batch 1 OK!")
