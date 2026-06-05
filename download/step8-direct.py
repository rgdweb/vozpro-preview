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

# Kill any running
run(client, "sudo pkill -f analyze-all-voices 2>/dev/null")

# Clear node require cache - use a fresh node invocation
# First check that the require resolves to the new client
out, _ = run(client, "cd " + REMOTE + " && node -e \"const p = require('@prisma/client'); const db = new p.PrismaClient(); console.log(Object.keys(db.voiceVariation).slice(0,5))\" 2>&1", timeout=10)
print("Quick test:", out)

# Run the script directly (not via nohup, to see output immediately)
out, err = run(client, "cd " + REMOTE + " && timeout 90 sudo node scripts/analyze-all-voices.js 2>&1 | tail -50", timeout=100)
print("\n--- Output ---")
print(out)
if err: print("ERR:", err)

client.close()
