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

out, _ = run(client, "grep -n defaultSpeed " + REMOTE + "/prisma/schema.prisma")
print("Schema has defaultSpeed:", out if out else "NO!")

out, _ = run(client, "sed -n '/model VoiceVariation/,/^}/p' " + REMOTE + "/prisma/schema.prisma")
print("\nVoiceVariation model:")
print(out)

client.close()
