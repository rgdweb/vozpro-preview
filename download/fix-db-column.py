#!/usr/bin/env python3
"""Check schema and add defaultSpeed column to the database."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE = '/home/ubuntu/omnivoice'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# 1. Check if defaultSpeed column exists in the database
stdin, stdout, _ = client.exec_command(f"cd {REMOTE} && npx prisma db execute --stdin <<'SQL'\nSELECT column_name FROM information_schema.columns WHERE table_name = 'VoiceVariation' AND column_name = 'defaultSpeed';\nSQL", timeout=15)
out = stdout.read().decode().strip()
print("Column check:", out)

# 2. Check current schema on server
stdin, stdout, _ = client.exec_command(f"grep -n 'defaultSpeed' {REMOTE}/prisma/schema.prisma", timeout=5)
out = stdout.read().decode().strip()
print("Schema has defaultSpeed:", out)

# 3. Add the column if it doesn't exist
stdin, stdout, stderr = client.exec_command(f"cd {REMOTE} && npx prisma db execute --stdin <<'SQL'\nALTER TABLE \"VoiceVariation\" ADD COLUMN IF NOT EXISTS \"defaultSpeed\" DOUBLE PRECISION NOT NULL DEFAULT 0;\nSQL", timeout=15)
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print("Add column:", out or err)

# 4. Verify
stdin, stdout, _ = client.exec_command(f"cd {REMOTE} && npx prisma db execute --stdin <<'SQL'\nSELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'VoiceVariation' AND column_name = 'defaultSpeed';\nSQL", timeout=15)
out = stdout.read().decode().strip()
print("Verify:", out)

# 5. Regenerate Prisma client
stdin, stdout, _ = client.exec_command(f"cd {REMOTE} && npx prisma generate 2>&1 | tail -3", timeout=30)
out = stdout.read().decode().strip()
print("Prisma generate:", out)

client.close()
