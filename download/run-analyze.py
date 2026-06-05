#!/usr/bin/env python3
"""Run analyze-all-voices.js on Oracle via SSH. Only runs the script, nothing else."""
import paramiko
import sys

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print("Connecting to Oracle...")
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    print("Connected!\n")
    
    cmd = "cd /home/ubuntu/omnivoice && sudo node scripts/analyze-all-voices.js"
    print(f"Running: {cmd}\n")
    print("=" * 60)
    
    stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
    
    # Stream output line by line
    while True:
        line = stdout.readline()
        if not line and stdout.channel.exit_status_ready():
            break
        if line:
            print(line, end='')
    
    # Print any stderr
    err = stderr.read().decode()
    if err:
        print(f"\nSTDERR: {err}")
    
    exit_code = stdout.channel.exit_status
    print("\n" + "=" * 60)
    print(f"Exit code: {exit_code}")
    
    client.close()

if __name__ == '__main__':
    main()
