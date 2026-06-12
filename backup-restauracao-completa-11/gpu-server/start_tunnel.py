"""
start_tunnel.py - Inicia cloudflared tunnel e registra URL no Oracle
=============================================================
Uso: python start_tunnel.py

O que faz:
  1. Inicia cloudflared tunnel apontando pra 127.0.0.1:8000
  2. Espera a URL do tunnel (trycloudflare.com)
  3. Registra a URL no Oracle via SSH
  4. Mantem rodando

Requer:
  - cloudflared no PATH
  - ssh no PATH
  - oracle_key na mesma pasta
"""

import os, subprocess, time, re, sys

ORACLE_HOST = "api.cvmnews.com.br"
ORACLE_USER = "ubuntu"
ORACLE_KEY = os.path.join(os.path.dirname(os.path.abspath(__file__)), "oracle_key")
LOCAL_PORT = 8000


def get_tunnel_url(process):
    """Le stdout do cloudflared ate achar a URL."""
    url = None
    while True:
        line = process.stdout.readline()
        if not line:
            break
        line = line.decode("utf-8", errors="replace").strip()
        print(line)

        match = re.search(r'https://[a-z0-9\-]+\.trycloudflare\.com', line)
        if match:
            url = match.group(0)

        if url:
            break

    return url


def register_on_oracle(tunnel_url):
    """Registra a URL no Oracle via SSH (sem paramiko, usa ssh nativo do Windows)."""
    if not os.path.exists(ORACLE_KEY):
        print(f"[ERRO] Chave SSH nao encontrada: {ORACLE_KEY}")
        print("        Coloque o arquivo 'oracle_key' na mesma pasta deste script.")
        return False

    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    ini_content = f"tunnel_url = {tunnel_url}\nstatus = online\nupdated_at = {ts}\n"

    # Escapar aspas simples pro bash
    ini_escaped = ini_content.replace("'", "'\\''")
    cmd = [
        "ssh", "-i", ORACLE_KEY,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=NUL",
        f"{ORACLE_USER}@{ORACLE_HOST}",
        f"sudo tee /var/www/omnivoice/tunnel-config.ini > /dev/null << 'ENDOFINI'\n{ini_content}ENDOFINI"
    ]

    # Tentar via stdin do ssh
    try:
        proc = subprocess.Popen(
            ["ssh", "-i", ORACLE_KEY,
             "-o", "StrictHostKeyChecking=no",
             "-o", "UserKnownHostsFile=NUL",
             f"{ORACLE_USER}@{ORACLE_HOST}",
             f"sudo tee /var/www/omnivoice/tunnel-config.ini > /dev/null"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        proc.communicate(input=ini_content.encode(), timeout=15)

        if proc.returncode == 0:
            print(f"[ORACLE] URL registrada com sucesso!")
            print(f"[ORACLE] {tunnel_url}")
            return True
        else:
            err = proc.stderr.read().decode()
            print(f"[ORACLE] Erro SSH (code {proc.returncode}): {err[:200]}")
            return False
    except subprocess.TimeoutExpired:
        proc.kill()
        print("[ORACLE] Timeout ao registrar via SSH")
        return False
    except FileNotFoundError:
        print("[ERRO] Comando 'ssh' nao encontrado. Instale OpenSSH no Windows.")
        print("        Ou instale paramiko: pip install paramiko")
        return False
    except Exception as e:
        print(f"[ORACLE] Erro: {e}")
        return False


def main():
    print("=" * 55)
    print("  OmniVoice Tunnel - GPU -> Oracle -> VozPro")
    print("=" * 55)

    # Iniciar cloudflared
    print(f"\n[1/3] Iniciando cloudflared tunnel -> 127.0.0.1:{LOCAL_PORT}...")
    process = subprocess.Popen(
        ["cloudflared", "tunnel", "--url", f"http://127.0.0.1:{LOCAL_PORT}"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    # Esperar URL
    print(f"[2/3] Aguardando URL do tunnel...")
    url = get_tunnel_url(process)

    if not url:
        print("[ERRO] Nao conseguiu obter URL do tunnel!")
        process.terminate()
        sys.exit(1)

    print(f"\n>>> TUNNEL URL: {url}")

    # Registrar no Oracle
    print(f"[3/3] Registrando no Oracle ({ORACLE_HOST})...")
    register_on_oracle(url)

    print(f"\nTudo pronto! VozPro pode gerar audio via tunnel.")
    print(f"Pressione Ctrl+C para parar.\n")

    # Manter rodando
    try:
        while process.poll() is None:
            line = process.stdout.readline()
            if line:
                print(line.decode("utf-8", errors="replace").strip())
    except KeyboardInterrupt:
        print("\nParando tunnel...")
        process.terminate()


if __name__ == "__main__":
    main()