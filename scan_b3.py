#!/usr/bin/env python3
"""Batch 3: Pages, components, PHP, scripts."""
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
    return stdout.channel.recv_exit_status(), out

def save(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)

ssh = ssh_connect()
print("SSH OK")

# Pages (page.tsx, layout.tsx)
print("Pages...")
c, out = run(ssh, "find /home/ubuntu/omnivoice/src/app -name 'page.tsx' -o -name 'layout.tsx' -o -name 'loading.tsx' -o -name 'error.tsx' | sort")
for f in out.strip().split('\n'):
    if not f.strip(): continue
    rel = f.replace('/home/ubuntu/omnivoice/', '')
    print(f"  {rel}")
    c2, content = run(ssh, f"cat '{f}'")
    save(f"{OUT}/pages/{rel}", content)

# Components
print("Components...")
c, out = run(ssh, "find /home/ubuntu/omnivoice/src/components -type f \\( -name '*.tsx' -o -name '*.ts' \\) | sort")
for f in out.strip().split('\n'):
    if not f.strip(): continue
    rel = f.replace('/home/ubuntu/omnivoice/', '')
    print(f"  {rel}")
    c2, content = run(ssh, f"cat '{f}'")
    save(f"{OUT}/components/{rel}", content)

# PHP files
print("PHP files...")
c, out = run(ssh, "find /home/ubuntu/omnivoice -name '*.php' -type f | sort")
for f in out.strip().split('\n'):
    if not f.strip(): continue
    fname = os.path.basename(f)
    print(f"  {fname}")
    c2, content = run(ssh, f"cat '{f}'")
    save(f"{OUT}/php/{fname}", content)

# Scripts
print("Scripts...")
c, out = run(ssh, "find /home/ubuntu/omnivoice/scripts -type f | sort")
for f in out.strip().split('\n'):
    if not f.strip(): continue
    fname = os.path.basename(f)
    print(f"  {fname}")
    c2, content = run(ssh, f"cat '{f}'")
    save(f"{OUT}/scripts/{fname}", content)

# Backup
print("backup.sh...")
c, out = run(ssh, "cat /home/ubuntu/omnivoice/backup.sh 2>/dev/null")
save(f"{OUT}/backup.sh", out)

# Public files list
print("Public files...")
c, out = run(ssh, "find /home/ubuntu/omnivoice/public -type f | sort")
save(f"{OUT}/public-files.txt", out)

# Prisma migrations
print("Migrations...")
c, out = run(ssh, "ls -la /home/ubuntu/omnivoice/prisma/migrations/ 2>/dev/null")
save(f"{OUT}/migrations-list.txt", out)

# Ecosystem config
print("Ecosystem config...")
c, out = run(ssh, "cat /home/ubuntu/omnivoice/ecosystem.config.js 2>/dev/null; echo '---'; cat /home/ubuntu/omnivoice/ecosystem.config.cjs 2>/dev/null")
save(f"{OUT}/ecosystem.config.txt", out)

# PostCSS, tailwind
print("PostCSS + Tailwind...")
c, out = run(ssh, "cat /home/ubuntu/omnivoice/postcss.config.mjs 2>/dev/null")
save(f"{OUT}/postcss.config.mjs", out)
c, out = run(ssh, "cat /home/ubuntu/omnivoice/globals.css 2>/dev/null | head -50")
save(f"{OUT}/globals.css", out)

ssh.close()
print("Batch 3 OK!")
