#!/usr/bin/env python3
"""Batch 2: Lib files + API routes."""
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

# Lib files
print("Lib files...")
c, out = run(ssh, "find /home/ubuntu/omnivoice/src/lib -type f \\( -name '*.ts' -o -name '*.tsx' \\) | sort")
for f in out.strip().split('\n'):
    if not f.strip(): continue
    fname = os.path.basename(f)
    print(f"  {fname}")
    c2, content = run(ssh, f"cat '{f}'")
    save(f"{OUT}/lib/{fname}", content)

# API routes
print("API routes...")
c, out = run(ssh, "find /home/ubuntu/omnivoice/src/app/api -name 'route.ts' | sort")
for f in out.strip().split('\n'):
    if not f.strip(): continue
    rel = f.replace('/home/ubuntu/omnivoice/src/app/api/', '')
    print(f"  api/{rel}")
    c2, content = run(ssh, f"cat '{f}'")
    save(f"{OUT}/api-routes/{rel}", content)

ssh.close()
print("Batch 2 OK!")
