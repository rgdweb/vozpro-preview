#!/usr/bin/env python3
"""Launch script on Oracle and check output after delay."""
import paramiko
import time

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

def run(client, cmd, timeout=15):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    try:
        return stdout.read().decode().strip()
    except:
        return ''

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Check if already running from previous attempt
out = run(client, "ps aux | grep 'analyze-all' | grep -v grep | head -1")
if out:
    print("Already running:", out)
else:
    # Launch with nohup + redirect
    run(client, "cd /home/ubuntu/omnivoice && sudo nohup node scripts/analyze-all-voices.js > /tmp/voice-analysis.txt 2>&1 &", timeout=5)
    print("Script launched!")

client.close()

# Wait 30s then check output
print("Waiting 30s...")
time.sleep(30)

client.connect(HOST, username=USER, pkey=key, timeout=15)
out = run(client, "cat /tmp/voice-analysis.txt 2>/dev/null")
print(f"\n--- Output ({len(out)} chars) ---")
print(out)

# Check if still running
out2 = run(client, "ps aux | grep 'analyze-all' | grep -v grep | head -1")
if out2:
    print("\nStill running...")
else:
    print("\nFinished!")

client.close()
