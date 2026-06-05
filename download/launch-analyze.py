#!/usr/bin/env python3
"""Minimal: connect, check script, run in background, disconnect."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)
print("Connected!")

# Check script exists
stdin, stdout, stderr = client.exec_command("ls -la /home/ubuntu/omnivoice/scripts/analyze-all-voices.js", timeout=10)
print("Script:", stdout.read().decode().strip())

# Check audio dir
stdin, stdout, stderr = client.exec_command("ls /var/www/omnivoice/audios/ref/ 2>/dev/null | wc -l", timeout=10)
print("Audio files:", stdout.read().decode().strip())

# Launch in background
stdin, stdout, stderr = client.exec_command("cd /home/ubuntu/omnivoice && nohup sudo node scripts/analyze-all-voices.js > /tmp/voice-analysis.txt 2>&1 & echo $!", timeout=10)
pid = stdout.read().decode().strip()
print(f"Launched PID: {pid}")

client.close()
print("Disconnected. Script running in background.")
