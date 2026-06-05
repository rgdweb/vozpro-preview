#!/usr/bin/env python3
"""Step 2b: Fetch last lines of output."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Check process
stdin, stdout, _ = client.exec_command("ps aux | grep analyze-all | grep -v grep | wc -l", timeout=5)
running = stdout.read().decode().strip()
print(f"Running: {running}")

# File size
stdin, stdout, _ = client.exec_command("wc -l /tmp/voice-analysis.txt 2>/dev/null", timeout=5)
lines = stdout.read().decode().strip()
print(f"Output lines: {lines}")

# Last 40 lines
stdin, stdout, _ = client.exec_command("tail -40 /tmp/voice-analysis.txt 2>/dev/null", timeout=10)
out = stdout.read().decode()
print("\n--- Last 40 lines ---")
print(out)

client.close()
