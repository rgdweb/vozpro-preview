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

# Check if there's a nested Omnivoice dir with schema
out, _ = run(client, "find " + REMOTE + " -name 'schema.prisma' -type f 2>/dev/null")
print("All schema.prisma files:")
print(out)

# Check package.json for prisma schema path
out, _ = run(client, "grep -i prisma " + REMOTE + "/package.json")
print("\nPrisma in package.json:", out)

# Check if there's a prisma schema config
out, _ = run(client, "cat " + REMOTE + "/node_modules/.prisma/client/schema.prisma 2>/dev/null | tail -20")
print("\nGenerated client schema (tail):")
print(out)

client.close()
