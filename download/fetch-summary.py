#!/usr/bin/env python3
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE = '/home/ubuntu/omnivoice'

key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, pkey=key, timeout=15)

# Get the full summary from the last run
stdin, stdout, _ = client.exec_command("cat /tmp/voice-analysis5.txt 2>/dev/null | head -20", timeout=10)
print("=== HEADER ===")
print(stdout.read().decode())

stdin, stdout, _ = client.exec_command("grep -E '(RESUMO|Atualizadas|Puladas|DISTRIBUICAO|Speed|grave|media|aguda|VOZES COM)' /tmp/voice-analysis5.txt 2>/dev/null", timeout=10)
print("=== SUMMARY ===")
print(stdout.read().decode())

client.close()
