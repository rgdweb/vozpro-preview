#!/usr/bin/env python3
"""Deploy script: upload updated route.ts to Oracle, build, restart PM2, check logs."""

import paramiko
import time
import sys

HOST = '147.15.77.137'
USER = 'ubuntu'
KEY_PATH = '/home/z/.ssh/oracle_key'
LOCAL_FILE = '/home/z/my-project/download/generate-route-updated.ts'
REMOTE_FILE = '/home/ubuntu/omnivoice/src/app/api/generate/route.ts'
PROJECT_DIR = '/home/ubuntu/omnivoice'

def create_ssh():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    ssh.connect(HOST, username=USER, pkey=key, timeout=30)
    return ssh

def run_cmd(ssh, cmd, timeout=120):
    print(f"\n>>> {cmd[:120]}...")
    stdin, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    exit_code = stdout.channel.recv_exit_status()
    if out:
        print(out[-2000:] if len(out) > 2000 else out)
    if err and exit_code != 0:
        print(f"STDERR: {err[-1500:] if len(err) > 1500 else err}")
    print(f"Exit code: {exit_code}")
    return exit_code, out, err

def upload_file(ssh, local, remote):
    print(f"\n>>> Uploading {local} -> {remote}")
    sftp = ssh.open_sftp()
    sftp.put(local, remote)
    sftp.close()
    print("Upload OK")

def main():
    print("=" * 60)
    print("DEPLOY VOZPRO - Atualizar route.ts em produção")
    print("=" * 60)

    ssh = create_ssh()
    print("SSH conectado com sucesso!")

    # Step 1: Backup original
    print("\n--- ETAPA 0: Backup do arquivo original ---")
    run_cmd(ssh, f"cp {REMOTE_FILE} {REMOTE_FILE}.bak.$(date +%Y%m%d%H%M%S)")

    # Step 1: Upload file
    print("\n--- ETAPA 1: Substituir arquivo de rota ---")
    upload_file(ssh, LOCAL_FILE, REMOTE_FILE)

    # Verify upload
    print("\nVerificando upload...")
    run_cmd(ssh, f"wc -l {REMOTE_FILE}")
    run_cmd(ssh, f"head -5 {REMOTE_FILE}")

    # Step 2: Build
    print("\n--- ETAPA 2: Build do projeto ---")
    print("Atenção: O build usa sudo (PM2_HOME=/root/.pm2). Executando build completo...")
    code, out, err = run_cmd(ssh, f"cd {PROJECT_DIR} && sudo rm -rf .next && sudo rm -rf node_modules/.prisma/client && sudo npx prisma generate && sudo npx next build 2>&1", timeout=300)

    if code != 0:
        print(f"\n!!! BUILD FALHOU com exit code {code} !!!")
        print("Não vou reiniciar PM2. Verifique os erros acima.")
        ssh.close()
        sys.exit(1)

    print("\nBuild concluído com sucesso!")

    # Copy static files for standalone
    print("\n--- Copiando static e public para standalone ---")
    run_cmd(ssh, f"cd {PROJECT_DIR} && sudo cp -r .next/static .next/standalone/.next/static && sudo cp -r public .next/standalone/public")

    # Step 3: Restart PM2
    print("\n--- ETAPA 3: Reiniciar PM2 ---")
    run_cmd(ssh, "sudo PM2_HOME=/root/.pm2 pm2 restart all")
    time.sleep(3)
    run_cmd(ssh, "sudo PM2_HOME=/root/.pm2 pm2 status")

    # Step 4: Check logs
    print("\n--- ETAPA 4: Logs PM2 (últimas 50 linhas) ---")
    run_cmd(ssh, "sudo PM2_HOME=/root/.pm2 pm2 logs --lines 50 --nostream")

    # Final verification
    print("\n--- VERIFICAÇÃO FINAL ---")
    run_cmd(ssh, "sudo PM2_HOME=/root/.pm2 pm2 status")

    ssh.close()
    print("\n" + "=" * 60)
    print("DEPLOY CONCLUÍDO!")
    print("=" * 60)

if __name__ == '__main__':
    main()
