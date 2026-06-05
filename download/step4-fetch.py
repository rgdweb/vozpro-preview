#!/usr/bin/env python3
"""Fetch analysis results."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Check if still running
stdin, stdout, _ = client.exec_command("ps aux | grep analyze-all | grep -v grep | wc -l", timeout=5)
running = stdout.read().decode().strip()
print(f"Running: {running}")

# Lines count
stdin, stdout, _ = client.exec_command("wc -l /tmp/voice-analysis2.txt 2>/dev/null", timeout=5)
print("Lines:", stdout.read().decode().strip())

# Last 50 lines
stdin, stdout, _ = client.exec_command("tail -50 /tmp/voice-analysis2.txt 2>/dev/null", timeout=10)
print("\n--- Results ---")
print(stdout.read().decode())

client.close()
