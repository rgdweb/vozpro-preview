#!/usr/bin/env python3
"""Force prisma generate and re-run."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE = '/home/ubuntu/omnivoice'

def run(client, cmd, timeout=15):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Force regenerate
out, _ = run(client, f"cd {REMOTE} && rm -rf node_modules/.prisma && npx prisma generate 2>&1", timeout=30)
print("Regenerate:", out[-200:] if len(out) > 200 else out)

# Verify client has defaultSpeed
out, _ = run(client, f"grep -c 'defaultSpeed' {REMOTE}/node_modules/.prisma/client/index.js 2>/dev/null || echo 0")
print(f"defaultSpeed in client: {out}")

# Re-run
out, _ = run(client, f"cd {REMOTE} && sudo bash -c 'nohup node scripts/analyze-all-voices.js > /tmp/voice-analysis3.txt 2>&1 &' && echo STARTED", timeout=10)
print(f"Launch: {out}")

client.close()
