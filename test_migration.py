#!/usr/bin/env python3
"""FASE 4: Testes da migracao native-generate no servidor Oracle."""
import paramiko
import json
import time

KEY_PATH = "/home/z/my-project/upload/ssh-key-oracle.key"
HOST = "147.15.77.137"
USER = "ubuntu"

def run_cmd(client, cmd, timeout=30):
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read().decode()
    err = stderr.read().decode().strip()
    return out, err

def main():
    key = paramiko.RSAKey.from_private_key_file(KEY_PATH)
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(hostname=HOST, username=USER, pkey=key, timeout=15)

    print("==========================================")
    print("  TESTES POS-MIGRACAO")
    print("==========================================\n")

    # --- Teste 1: Verificar tunnel URL ativa ---
    print("[TESTE 1] Tunnel URL ativa...")
    out, err = run_cmd(client, "cat /var/www/omnivoice/tunnel-config.ini")
    print(f"  tunnel-config.ini: {out.strip()}")
    
    out, err = run_cmd(client, 
        "curl -s http://127.0.0.1/get_tunnel.php 2>/dev/null")
    print(f"  get_tunnel.php: {out.strip()}")
    print()

    # --- Teste 2: PHP syntax check ---
    print("[TESTE 2] PHP syntax check...")
    out, err = run_cmd(client, "php -l /var/www/omnivoice/generate-omnivoice.php")
    print(f"  {out.strip()}")
    if 'Parse error' in out:
        print("  ERRO CRITICO: PHP tem erro de sintaxe!")
    print()

    # --- Teste 3: Verificar o novo arquivo ---
    print("[TESTE 3] Verificar conteudo do PHP migrado...")
    out, err = run_cmd(client, 
        "head -5 /var/www/omnivoice/generate-omnivoice.php && echo '...' && "
        "rg 'native-generate' /var/www/omnivoice/generate-omnivoice.php | head -3 && echo '...' && "
        "rg 'gradio' /var/www/omnivoice/generate-omnivoice.php || echo '  Zero referencias a gradio (OK!)'")
    print(f"  {out.strip()}")
    print()

    # --- Teste 4: Verificar se native-generate responde ---
    print("[TESTE 4] Testar endpoint native-generate via tunnel...")
    tunnel_url = ""
    try:
        ini_out, _ = run_cmd(client, "cat /var/www/omnivoice/tunnel-config.ini")
        for line in ini_out.split("\n"):
            if "tunnel_url" in line.lower():
                tunnel_url = line.split("=")[1].strip().strip('"')
                break
    except:
        pass
    
    if tunnel_url:
        print(f"  Tunnel: {tunnel_url}")
        
        # Teste de health com payload minimo
        test_payload = json.dumps({
            "text": "Teste",
            "voice_mode": "design",
            "instruct": "A neutral voice",
            "language": "English",
            "speed": 1.0,
            "num_step": 4,
            "denoise": False,
            "preprocess_prompt": False,
            "postprocess_output": False
        })
        
        out, err = run_cmd(client,
            f'curl -s -m 30 "{tunnel_url}/api/native-generate" '
            f'-X POST -H "Content-Type: application/json" '
            f'-d \'{test_payload}\' 2>/dev/null | head -c 500',
            timeout=45
        )
        print(f"  Resposta: {out.strip()[:400]}")
        if err:
            print(f"  STDERR: {err[:200]}")
    else:
        print("  ERRO: Nao conseguiu descobrir tunnel URL")
    print()

    # --- Teste 5: Verificar backup existe ---
    print("[TESTE 5] Verificar backups...")
    out, err = run_cmd(client,
        "ls -la /var/www/omnivoice-backup-20250602/ | head -3 && echo '---' && "
        "ls -la /var/www/omnivoice/generate-omnivoice.php.gradio-backup* 2>/dev/null || echo '  Gradio backup: NAO ENCONTRADO'")
    print(f"  {out.strip()}")
    print()

    # --- Teste 6: Verificar Apache esta servindo PHP ---
    print("[TESTE 6] Apache PHP check...")
    out, err = run_cmd(client,
        "curl -s -o /dev/null -w '%{http_code}' 'http://localhost/var/www/omnivoice/generate-omnivoice.php' 2>/dev/null || echo 'N/A'")
    print(f"  HTTP Status: {out.strip()}")
    print()

    # --- Teste 7: Comparar generate-omnivoice.php vs tunnel-generate.php ---
    print("[TESTE 7] Comparacao: ambos usam native-generate?")
    out, err = run_cmd(client,
        "echo 'generate-omnivoice.php:' && rg -c 'native-generate' /var/www/omnivoice/generate-omnivoice.php && "
        "echo 'tunnel-generate.php:' && rg -c 'native-generate' /var/www/omnivoice/tunnel-generate.php")
    print(f"  {out.strip()}")
    print()

    print("==========================================")
    print("  TESTES CONCLUIDOS")
    print("==========================================")
    
    client.close()

if __name__ == "__main__":
    main()
