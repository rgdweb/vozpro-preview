#!/usr/bin/env python3
"""FASE 2: Deploy do generate-omnivoice.php migrado para native-generate."""
import paramiko
import os

KEY_PATH = "/home/z/my-project/upload/ssh-key-oracle.key"
HOST = "147.15.77.137"
USER = "ubuntu"
LOCAL_FILE = "/home/z/my-project/download/omnivoice-migration/generate-omnivoice-native.php"
REMOTE_TEMP = "/tmp/generate-omnivoice-native.php"
REMOTE_TARGET = "/var/www/omnivoice/generate-omnivoice.php"

def main():
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=HOST, username=USER, pkey=key, timeout=15)

    sftp = client.open_sftp()
    
    # 1. Upload novo arquivo para /tmp
    print("[1/5] Uploading novo PHP para /tmp...")
    sftp.put(LOCAL_FILE, REMOTE_TEMP)
    print("  OK")
    
    # 2. Verificar que o arquivo subiu corretamente
    stdin, stdout, stderr = client.exec_command(
        f"wc -l {REMOTE_TEMP} && head -5 {REMOTE_TEMP}",
        timeout=10
    )
    info = stdout.read().decode()
    print(f"[2/5] Verificacao: {info.strip()}")
    
    # 3. Criar backup extra do arquivo ATUAL (generate-omnivoice.php.gradio-backup)
    print("[3/5] Backup extra do PHP Gradio atual...")
    stdin, stdout, stderr = client.exec_command(
        f"sudo cp {REMOTE_TARGET} {REMOTE_TARGET}.gradio-backup-$(date +%Y%m%d%H%M%S) && "
        f"echo 'Backup criado'",
        timeout=10
    )
    resp = stdout.read().decode().strip()
    print(f"  {resp}")
    
    # 4. Substituir o arquivo
    print("[4/5] Substituindo generate-omnivoice.php...")
    stdin, stdout, stderr = client.exec_command(
        f"sudo cp {REMOTE_TEMP} {REMOTE_TARGET} && "
        f"sudo chown www-data:www-data {REMOTE_TARGET} && "
        f"sudo chmod 644 {REMOTE_TARGET} && "
        f"echo 'Arquivo substituido'",
        timeout=10
    )
    resp = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    print(f"  {resp}")
    if err:
        print(f"  STDERR: {err}")
    
    # 5. Limpar temp
    print("[5/5] Limpando temp...")
    client.exec_command(f"rm -f {REMOTE_TEMP}", timeout=5)
    print("  OK")
    
    # 6. Verificar diff
    print("\n=== VERIFICACAO ===")
    stdin, stdout, stderr = client.exec_command(
        f"head -10 {REMOTE_TARGET} && echo '---' && wc -l {REMOTE_TARGET} && echo '---' && ls -la {REMOTE_TARGET}",
        timeout=10
    )
    print(stdout.read().decode())
    
    sftp.close()
    client.close()
    print("\nDeploy concluido! PHP migrado para native-generate.")

if __name__ == "__main__":
    main()
