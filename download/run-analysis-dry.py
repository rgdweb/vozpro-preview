#!/usr/bin/env python3
"""Run voice analysis batch on Oracle via SSH (paramiko)."""
import paramiko
import json
import time

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print("Connecting...")
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    print("Connected!")
    
    # First: dry run to see what we'd analyze
    print("\n=== DRY RUN (preview) ===")
    cmd = "curl -s -X POST 'http://localhost:3000/api/admin/analyze-voices?dry=1' --max-time 180"
    stdin, stdout, stderr = client.exec_command(cmd, timeout=200)
    out = stdout.read().decode()
    err = stderr.read().decode()
    if err: print(f"STDERR: {err.strip()}")
    
    try:
        data = json.loads(out)
        print(f"Total: {data.get('total', '?')}")
        print(f"Elapsed: {data.get('elapsedSeconds', '?')}s")
        print(f"\n--- Results ---")
        for r in data.get('results', []):
            name = r.get('voiceName', '?')
            label = r.get('label', '?')
            fmt = r.get('format', '?')
            status = r.get('status', '?')
            speed = r.get('recommendedSpeed', '?')
            f0 = r.get('f0', '?')
            cls = r.get('classification', '?')
            conf = r.get('confidence', '?')
            err_msg = r.get('error', '')
            extra = f" Speed: {speed}x F0: {f0}Hz [{cls}] conf: {conf}" if status == 'updated' else f" {err_msg}"
            print(f"  {name} → {label} ({fmt}): {status}{extra}")
    except json.JSONDecodeError:
        print(f"Raw output ({len(out)} chars):")
        print(out[:2000])
    
    client.close()
    print("\nDone!")

if __name__ == '__main__':
    main()
