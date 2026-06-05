#!/usr/bin/env python3
"""Add defaultSpeed column using prisma db execute."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE = '/home/ubuntu/omnivoice'

def run(client, cmd, timeout=15):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    return out, err

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Add column
out, err = run(client, f'cd {REMOTE} && echo "ALTER TABLE \\"VoiceVariation\\" ADD COLUMN IF NOT EXISTS \\"defaultSpeed\\" DOUBLE PRECISION NOT NULL DEFAULT 0;" | npx prisma db execute --schema prisma/schema.prisma --stdin 2>&1', timeout=20)
print("Add column:", out or err)

# Regenerate prisma client
out, _ = run(client, f"cd {REMOTE} && npx prisma generate 2>&1 | tail -2", timeout=30)
print("Generate:", out)

client.close()
print("Done!")
