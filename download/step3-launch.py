#!/usr/bin/env python3
"""Re-run analyze script after adding column."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Launch
stdin, stdout, _ = client.exec_command("cd /home/ubuntu/omnivoice && sudo bash -c 'nohup node scripts/analyze-all-voices.js > /tmp/voice-analysis2.txt 2>&1 &' && echo STARTED", timeout=10)
print(stdout.read().decode().strip())
client.close()
