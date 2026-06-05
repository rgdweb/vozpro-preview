#!/usr/bin/env python3
"""Step 2: Fetch the output."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Check if still running
stdin, stdout, _ = client.exec_command("ps aux | grep analyze-all | grep -v grep | head -1", timeout=5)
ps = stdout.read().decode().strip()
print(f"Process: {'RUNNING' if ps else 'FINISHED'}")
if ps: print(ps)

# Get output
stdin, stdout, _ = client.exec_command("cat /tmp/voice-analysis.txt 2>/dev/null", timeout=10)
out = stdout.read().decode()
print(f"\nOutput length: {len(out)} chars")
print(out)

client.close()
