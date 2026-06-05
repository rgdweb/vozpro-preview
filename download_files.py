#!/usr/bin/env python3
"""Read all critical files from Oracle server for migration analysis."""
import paramiko
import sys

KEY_PATH = "/home/z/my-project/upload/ssh-key-oracle.key"
HOST = "147.15.77.137"
USER = "ubuntu"

FILES = [
    "/var/www/omnivoice/generate-omnivoice.php",
    "/var/www/omnivoice/config.php",
    "/var/www/omnivoice/get_tunnel.php",
    "/var/www/omnivoice/tunnel-generate.php",
    "/var/www/omnivoice/tunnel-config.ini",
    "/var/www/omnivoice/update_tunnel.php",
    "/var/www/omnivoice/generate-direct.php",
    "/home/ubuntu/omnivoice/.env",
    "/home/ubuntu/omnivoice/ecosystem.config.js",
    "/home/ubuntu/omnivoice/src/app/page.tsx",
]

def main():
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=HOST, username=USER, pkey=key, timeout=15)

    sftp = client.open_sftp()
    
    OUTPUT_DIR = "/home/z/my-project/download/omnivoice-migration/server-files"
    import os
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for filepath in FILES:
        filename = filepath.replace("/", "_").lstrip("_")
        local_path = os.path.join(OUTPUT_DIR, filename)
        
        try:
            sftp.get(filepath, local_path)
            size = os.path.getsize(local_path)
            print(f"[OK] {filepath} -> {local_path} ({size} bytes)")
        except Exception as e:
            print(f"[SKIP] {filepath}: {e}")
    
    sftp.close()
    client.close()
    print("\n=== Todos os arquivos baixados ===")

if __name__ == "__main__":
    main()
