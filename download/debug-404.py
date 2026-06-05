#!/usr/bin/env python3
"""Debug the 404 issue."""
import paramiko
import time

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

def run(client, cmd, timeout=60):
    print(f"$ {cmd[:150]}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out: print(out[:3000])
    if err: print(f"ERR: {err[:500]}")

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    
    # Check what port PM2 is running on
    run(client, "sudo PM2_HOME=/root/.pm2 pm2 show omnivoice 2>&1 | head -20")
    
    # Check if the route actually responds (maybe a route conflict)
    run(client, "curl -sv 'http://localhost:3000/api/admin/voices' --max-time 5 2>&1 | tail -5")
    run(client, "curl -sv 'http://localhost:3000/api/admin/analyze-voices' --max-time 5 2>&1 | tail -10")
    run(client, "curl -s 'http://localhost:3000/api/admin/analyze-voices' -X POST --max-time 5 2>&1 | head -20")
    
    # Maybe need to check server logs
    run(client, "sudo PM2_HOME=/root/.pm2 pm2 logs omnivoice --lines 30 --nostream 2>&1")
    
    client.close()

if __name__ == '__main__':
    main()
