# 🚨 CONTRATO DE GOVERNANCA EXECUTIVA - VOZPRO (SaaS Hibrido)
# 🚨 PROIBICOES ABSOLUTAS (13 erros ja cometidos que derrubaram o sistema):
#   1. NUNCA git reset --hard | 2. NUNCA altere git remote | 3. NUNCA rm -rf
#   4. NUNCA push syntax errors | 5. NUNCA commit .env real | 6. NUNCA temp no root
#   7. NUNCA scripts deploy alternativos | 8. NUNCA quebre next.config | 9. queue: 3x, 3min
#   10. NUNCA remova AUDIO_SERVER_API_KEY | 11. NUNCA desalinhe tokens .env/config.php
#   12. NUNCA pm2 restart sozinho (faz rebuild) | 13. NUNCA git checkout -- .env
# 🚨 REGRA UNICA DE DEPLOY: python3 /home/ubuntu/omnivoice/deploy-seguro.py
# 🚨 REGISTRO COMPLETO: REGRAS-ERROS-PROIBIDOS.md (leia ANTES de alterar qualquer coisa)
# 🚨 IP: 147.15.77.137 | Repo: rgdweb/vozpro-preview | PM2: PM2_HOME=/root/.pm2

#!/usr/bin/env python3
"""
SISTEMA DE DEPLOY SEGURO E AUTOMATIZADO - VOZPRO
=================================================
Regras absolutas:
  - NUNCA toca em .env
  - NUNCA usa git reset --hard
  - NUNCA usa rm -rf
  - NUNCA muda git remote
  - NUNCA mexe em PostgreSQL/nginx/PM2 configs
  - SOMENTE: git pull por diferença + build + restart
"""

import subprocess
import sys
import os

ORACLE_PROJECT_DIR = "/home/ubuntu/omnivoice"
PM2_HOME = "/root/.pm2"

def executar_comando(comando, descricao, check=True):
    print(f"\n[Deploy-Seguro] {descricao}...")
    try:
        resultado = subprocess.run(
            comando, shell=True, check=check, text=True,
            capture_output=True, timeout=300
        )
        if resultado.stdout.strip():
            print(resultado.stdout.strip()[-2000:])
        return resultado.stdout
    except subprocess.CalledProcessError as e:
        print(f"[ERRO CRITICO] Falha em: {descricao}")
        if e.stderr:
            print(f"  STDERR: {e.stderr[-1000:]}")
        sys.exit(1)
    except subprocess.TimeoutExpired:
        print(f"[TIMEOUT] Comando excedeu 5min: {descricao}")
        sys.exit(1)

def verificar_env_protegido():
    """Verifica que o .env existe e tem DATABASE_URL postgresql."""
    env_path = os.path.join(ORACLE_PROJECT_DIR, ".env")
    if not os.path.exists(env_path):
        print("[ERRO CRITICO] .env nao encontrado! Deploy cancelado.")
        sys.exit(1)
    with open(env_path) as f:
        conteudo = f.read()
    if "postgresql" not in conteudo and "postgres" not in conteudo:
        print("[ERRO CRITICO] .env nao contem DATABASE_URL postgresql!")
        print("  Deploy cancelado para proteger o banco.")
        sys.exit(1)
    print("[OK] .env protegido e intacto (postgresql detectado)")

def main():
    print("=" * 60)
    print("     SISTEMA DE DEPLOY SEGURO E AUTOMATIZADO - VOZPRO")
    print("=" * 60)

    # 0) Verificar .env antes de qualquer coisa
    verificar_env_protegido()

    # 1) Pull por diferença (JAMAIS reset --hard)
    executar_comando(
        f"cd {ORACLE_PROJECT_DIR} && git fetch origin",
        "Buscando atualizacoes do GitHub"
    )
    executar_comando(
        f"cd {ORACLE_PROJECT_DIR} && git pull origin main",
        "Aplicando diferencas via git pull"
    )

    # 2) Verificar .env DEPOIS do pull (garantia dupla)
    verificar_env_protegido()

    # 3) Gerar Prisma client
    executar_comando(
        f"cd {ORACLE_PROJECT_DIR} && sudo npx prisma generate",
        "Gerando Prisma client",
        check=False  # prisma generate pode dar warnings
    )

    # 4) Build Next.js (com standalone)
    executar_comando(
        f"cd {ORACLE_PROJECT_DIR} && sudo npx next build",
        "Compilando Next.js em modo standalone"
    )

    # 5) Copiar static e public para standalone
    executar_comando(
        f"cd {ORACLE_PROJECT_DIR} && sudo cp -r .next/static .next/standalone/.next/static && "
        f"sudo cp -r public .next/standalone/public",
        "Copiando arquivos static para standalone"
    )

    # 6) Stop + Start PM2 (restart NAO recarrega .env no standalone - Erro 12)
    executar_comando(
        f"sudo PM2_HOME={PM2_HOME} pm2 stop omnivoice || true",
        "Parando PM2"
    )
    executar_comando(
        f"sudo PM2_HOME={PM2_HOME} pm2 start {ORACLE_PROJECT_DIR}/.next/standalone/server.js --name omnivoice",
        "Iniciando PM2"
    )

    # 7) Verificar status
    executar_comando(
        f"sudo PM2_HOME={PM2_HOME} pm2 status",
        "Verificando status do PM2"
    )

    print("\n" + "=" * 60)
    print("  DEPLOY CONCLUIDO COM SUCESSO!")
    print("  Banco PostgreSQL, .env e configs preservados intactos.")
    print("=" * 60)

if __name__ == "__main__":
    main()
