# GOVERNANCE OFICIAL E RESTRITA - VOZPRO (SaaS Hibrido)
# ===================================================================================
# REGRAS ABSOLUTAS (VIOLACAO = FALHA CRITICA):
#
# REGRA 0: PROIBIDO restaurar backups sem ORDEM EXPRESSA do dono do projeto.
#   Nenhum backup pode ser restaurado sem autorizacao explicita do usuario.
#
# REGRA 1: PROIBIDO enviar/substituir TODOS os arquivos de uma vez no Oracle.
#   Nunca use scp/rsync para copiar todo o projeto. Envie SOMENTE arquivos
#   que foram EDITADOS ou ATUALIZADOS. Nunca substitua arquivos nao tocados.
#
# REGRA 2: Deploy UNICO e EXCLUSIVO via este script (deploy-seguro.py).
#   Comando: python3 /home/ubuntu/omnivoice/deploy-seguro.py
#   Nenhum deploy manual. Nenhum git reset --hard. Nenhum rm -rf.
#
# REGRA 3: NUNCA toca em .env, PostgreSQL, nginx ou configs do PM2.
# REGRA 4: A funcao verificar_env_protegido() e a ULTIMA linha de defesa.
# REGRA 5: Se este script falhar, NAO tente deploy manual.
# ===================================================================================

#!/usr/bin/env python3
"""SISTEMA DE DEPLOY SEGURO E AUTOMATIZADO - VOZPRO"""

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
            print(f"  STDERR: {str(e.stderr)[-1000:]}")
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

    # 1) Pull por diferenca (JAMAIS reset --hard)
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
        check=False
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

    # 6) Copiar .env e Prisma para standalone
    executar_comando(
        f"sudo cp {ORACLE_PROJECT_DIR}/.env {ORACLE_PROJECT_DIR}/.next/standalone/.env",
        "Copiando .env para standalone"
    )
    executar_comando(
        f"sudo cp -r {ORACLE_PROJECT_DIR}/node_modules/.prisma {ORACLE_PROJECT_DIR}/.next/standalone/node_modules/ && "
        f"sudo cp -r {ORACLE_PROJECT_DIR}/node_modules/@prisma {ORACLE_PROJECT_DIR}/.next/standalone/node_modules/",
        "Copiando Prisma client para standalone"
    )

    # 7) Restart PM2 com ecosystem config (todas as env vars)
    executar_comando(
        f"sudo PM2_HOME={PM2_HOME} pm2 restart omnivoice --update-env",
        "Reiniciando PM2"
    )

    # 8) Verificar status
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

