#!/usr/bin/env python3
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

# Check root schema vs prisma/schema
out, _ = run(client, "grep -c 'defaultSpeed' " + REMOTE + "/schema.prisma")
print(f"Root schema.prisma defaultSpeed count: {out}")

out, _ = run(client, "grep -c 'defaultSpeed' " + REMOTE + "/prisma/schema.prisma")
print(f"prisma/schema.prisma defaultSpeed count: {out}")

# Copy the correct schema to root
out, _ = run(client, "cp " + REMOTE + "/prisma/schema.prisma " + REMOTE + "/schema.prisma")
print("Copied prisma/schema.prisma to root schema.prisma")

# Verify
out, _ = run(client, "grep -c 'defaultSpeed' " + REMOTE + "/schema.prisma")
print(f"After copy, root defaultSpeed count: {out}")

# Kill old process
run(client, "sudo pkill -f analyze-all-voices 2>/dev/null")

# Regenerate
out, _ = run(client, "cd " + REMOTE + " && rm -rf node_modules/.prisma node_modules/@prisma/client && npx prisma generate 2>&1 | tail -3", timeout=30)
print("Generate:", out)

# Verify client
out, _ = run(client, "grep -c 'defaultSpeed' " + REMOTE + "/node_modules/.prisma/client/index.js 2>/dev/null || echo 0")
print(f"Client has defaultSpeed: {out}")

# Re-launch
out, _ = run(client, "cd " + REMOTE + " && sudo bash -c 'nohup node scripts/analyze-all-voices.js > /tmp/voice-analysis5.txt 2>&1 &' && echo STARTED", timeout=10)
print("Launch:", out)

client.close()
