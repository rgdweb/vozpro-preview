#!/usr/bin/env python3
"""Find and restore original files on Oracle."""
import paramiko

SSH_KEY = '/home/z/my-project/upload/ssh-key-2026-05-24.key'
HOST = '147.15.77.137'
USER = 'ubuntu'
REMOTE_DIR = '/home/ubuntu/omnivoice'

def run(client, cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    return stdout.read().decode().strip(), stderr.read().decode().strip()

def main():
    key = paramiko.RSAKey.from_private_key_file(SSH_KEY)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(HOST, username=USER, pkey=key, timeout=15)
    
    # Check for backups
    print("=== Looking for backups ===")
    out, _ = run(client, f"ls -la {REMOTE_DIR}/backup* 2>/dev/null; ls -la {REMOTE_DIR}/.next/backup* 2>/dev/null; find {REMOTE_DIR} -name '*.bak' -o -name '*.orig' 2>/dev/null | head -10")
    print(out)
    
    # Check git reflog or stash
    print("\n=== Check git ===")
    out, _ = run(client, f"cd {REMOTE_DIR} && git status 2>&1; git stash list 2>&1")
    print(out)
    
    # Check file timestamps — what was the ORIGINAL page.tsx before my upload
    print("\n=== File timestamps ===")
    out, _ = run(client, f"ls -la {REMOTE_DIR}/src/app/page.tsx {REMOTE_DIR}/src/app/admin/page.tsx")
    print(out)
    
    # Check if there's a Vercel deployment we can pull from
    print("\n=== Check for Vercel/deploy history ===")
    out, _ = run(client, f"ls -la {REMOTE_DIR}/.vercel 2>/dev/null; cat {REMOTE_DIR}/vercel.json 2>/dev/null | head -10")
    print(out)
    
    # Check if the old .next/server build still has the old compiled pages (from before my rebuild)
    print("\n=== Check if old .next/server exists (pre-rebuild) ===")
    out, _ = run(client, f"ls -la {REMOTE_DIR}/.next/server/app/page.js 2>/dev/null; stat {REMOTE_DIR}/.next/server/app/page.js 2>/dev/null")
    print(out)
    
    # MOST IMPORTANT: Check the Omnivoice submodule - the REAL source might be there
    print("\n=== Check Omnivoice subdir ===")
    out, _ = run(client, f"ls {REMOTE_DIR}/Omnivoice/ 2>/dev/null | head -10")
    print(out)
    out, _ = run(client, f"ls {REMOTE_DIR}/Omnivoice/src/app/page.tsx 2>/dev/null")
    print(out)
    
    client.close()

if __name__ == '__main__':
    main()
