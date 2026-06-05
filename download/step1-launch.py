#!/usr/bin/env python3
"""Step 1: Just launch the script."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Check if already running
stdin, stdout, _ = client.exec_command("ps aux | grep analyze-all | grep -v grep", timeout=5)
already = stdout.read().decode().strip()
if already:
    print("Already running!")
    client.close()
    exit(0)

# Kill any previous leftover
client.exec_command("sudo pkill -f analyze-all-voices 2>/dev/null", timeout=5)

# Launch
import subprocess
# Use bash -c to properly background
stdin, stdout, _ = client.exec_command("cd /home/ubuntu/omnivoice && sudo bash -c 'nohup node scripts/analyze-all-voices.js > /tmp/voice-analysis.txt 2>&1 &' && echo STARTED", timeout=10)
out = stdout.read().decode().strip()
print(f"Result: {out}")

client.close()
