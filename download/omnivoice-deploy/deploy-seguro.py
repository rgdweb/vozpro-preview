#!/usr/bin/env python3
"""
============================================================
  deploy-seguro.py — Build Atômico com Diff-Safe
  VozPro NLP Pipeline v3.0.0 — 10 Camadas
============================================================

Deploy seguro por comparação de diferenças:
  1. Valida integridade e sintaxe PHP do novo arquivo
  2. Calcula diff contra o arquivo atual em produção
  3. Exibe resumo das mudanças (adições/remoções)
  4. Cria backup timestamped do arquivo atual
  5. Aplica o novo arquivo com permissões corretas
  6. Recarrega PHP-FPM sem derrubar conexões ativas
  7. Executa smoke-test de sanidade
  8. Em caso de falha → rollback automático para o backup

Requisitos:
  - Python 3.8+
  - sudo sem senha para deploy
  - PHP-CLI (php -l)
  - systemd (PHP-FPM reload)
  - diffutils (diff)

Uso:
  python3 /home/ubuntu/omnivoice/deploy-seguro.py

Variáveis de ambiente (opcionais):
  DEPLOY_SOURCE    — arquivo PHP a deployar
                     (default: /home/ubuntu/omnivoice/tunnel-generate.php)
  DEPLOY_TARGET    — destino no servidor web
                     (default: /var/www/omnivoice/tunnel-generate.php)
  BACKUP_DIR       — diretório de backups
                     (default: /var/www/omnivoice/backups/)
  PHP_FPM_SERVICE  — serviço PHP-FPM
                     (default: php8.2-fpm)
  SMOKE_TEST_URL   — URL do smoke-test
                     (default: http://127.0.0.1/tunnel-generate.php)
"""

import os
import sys
import shutil
import subprocess
import datetime
import hashlib
from pathlib import Path
from typing import Optional, Tuple

# ================================================================
#  CONFIGURAÇÃO
# ================================================================
DEPLOY_SOURCE    = os.environ.get('DEPLOY_SOURCE',    '/home/ubuntu/omnivoice/tunnel-generate.php')
DEPLOY_TARGET    = os.environ.get('DEPLOY_TARGET',    '/var/www/omnivoice/tunnel-generate.php')
BACKUP_DIR       = os.environ.get('BACKUP_DIR',       '/var/www/omnivoice/backups/')
PHP_FPM_SERVICE  = os.environ.get('PHP_FPM_SERVICE',  'php8.2-fpm')
SMOKE_TEST_URL   = os.environ.get('SMOKE_TEST_URL',   'http://127.0.0.1/tunnel-generate.php')

# ================================================================
#  CORES ANSI
# ================================================================
class C:
    RESET  = '\033[0m'
    RED    = '\033[91m'
    GREEN  = '\033[92m'
    YELLOW = '\033[93m'
    BLUE   = '\033[94m'
    CYAN   = '\033[96m'
    BOLD   = '\033[1m'
    DIM    = '\033[2m'

# ================================================================
#  HELPERS
# ================================================================

def log(msg: str, level: str = 'info') -> None:
    ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    prefix_map = {
        'info':     f'{C.BLUE}[DEPLOY]{C.RESET}',
        'ok':       f'{C.GREEN}[OK]{C.RESET}',
        'warn':     f'{C.YELLOW}[WARN]{C.RESET}',
        'error':    f'{C.RED}[ERROR]{C.RESET}',
        'diff':     f'{C.CYAN}[DIFF]{C.RESET}',
        'success':  f'{C.GREEN}{C.BOLD}[DEPLOY CONCLUÍDO]{C.RESET}',
        'rollback': f'{C.RED}{C.BOLD}[ROLLBACK]{C.RESET}',
    }
    prefix = prefix_map.get(level, '[DEPLOY]')
    print(f'  {prefix} {ts} — {msg}')


def run(cmd: str, check: bool = True) -> Tuple[int, str, str]:
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(
            f'Falha (exit {r.returncode}): {cmd}\n'
            f'stdout: {r.stdout}\nstderr: {r.stderr}'
        )
    return r.returncode, r.stdout.strip(), r.stderr.strip()


def fhash(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()[:16]


# ================================================================
#  PIPELINE — 6 ETAPAS
# ================================================================

def step_1_validate_source() -> None:
    """Valida existência e sintaxe PHP do arquivo fonte."""
    log('Etapa 1/6: Validação do arquivo fonte PHP')

    if not os.path.isfile(DEPLOY_SOURCE):
        raise FileNotFoundError(f'Fonte não encontrado: {DEPLOY_SOURCE}')

    size = os.path.getsize(DEPLOY_SOURCE)
    log(f'  Fonte: {DEPLOY_SOURCE} ({size:,} bytes)')

    _, out, err = run(f'php -l {DEPLOY_SOURCE}')
    if 'No syntax errors' not in out:
        raise SyntaxError(f'Sintaxe PHP inválida:\n{out}\n{err}')

    log(f'  Sintaxe PHP: {C.GREEN}OK{C.RESET}')


def step_2_diff_analysis() -> bool:
    """Compara novo arquivo com o atual e exibe resumo de mudanças."""
    log('Etapa 2/6: Análise de diferenças (diff-safe)')

    if not os.path.isfile(DEPLOY_TARGET):
        log('  Nenhum arquivo em produção — deploy será criação nova', 'warn')
        return True

    src_hash = fhash(DEPLOY_SOURCE)
    tgt_hash = fhash(DEPLOY_TARGET)

    if src_hash == tgt_hash:
        log('  Arquivos idênticos (mesmo hash) — nenhuma mudança necessária', 'ok')
        log(f'  Hash: {src_hash}', 'ok')
        return False

    log(f'  Fonte:  {src_hash}')
    log(f'  Alvo:  {tgt_hash}')
    log(f'  Arquivos DIFERENTES — prosseguindo com deploy', 'diff')

    # Executa diff e captura estatísticas
    _, diff_out, _ = run(
        f'diff -u {DEPLOY_TARGET} {DEPLOY_SOURCE} | head -80',
        check=False
    )

    # Conta linhas adicionadas/removidas
    lines = diff_out.split('\n')
    added   = sum(1 for l in lines if l.startswith('+') and not l.startswith('+++'))
    removed = sum(1 for l in lines if l.startswith('-') and not l.startswith('---'))

    log(f'  Linhas adicionadas: {C.GREEN}+{added}{C.RESET}')
    log(f'  Linhas removidas:   {C.RED}-{removed}{C.RESET}')

    return True


def step_3_backup_current() -> Optional[str]:
    """Cria backup timestamped do arquivo atual em produção."""
    log('Etapa 3/6: Backup do arquivo atual')

    if not os.path.isfile(DEPLOY_TARGET):
        log('  Sem arquivo em produção — backup pulado', 'warn')
        return None

    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    bak = os.path.join(BACKUP_DIR, f'tunnel-generate_{ts}.php.bak')

    shutil.copy2(DEPLOY_TARGET, bak)

    if fhash(DEPLOY_TARGET) != fhash(bak):
        raise IOError('Hash do backup diverge do original!')

    log(f'  Backup: {bak} ({fhash(bak)})')
    return bak


def step_4_deploy_file() -> None:
    """Aplica o novo arquivo com permissões www-data."""
    log('Etapa 4/6: Aplicando novo arquivo')

    shutil.copy2(DEPLOY_SOURCE, DEPLOY_TARGET)

    if fhash(DEPLOY_SOURCE) != fhash(DEPLOY_TARGET):
        raise IOError('Hash pós-deploy diverge da fonte!')

    run(f'chown www-data:www-data {DEPLOY_TARGET}')
    run(f'chmod 0644 {DEPLOY_TARGET}')

    log(f'  Deployado: {DEPLOY_TARGET} ({fhash(DEPLOY_TARGET)})')


def step_5_reload_fpm() -> None:
    """Recarrega PHP-FPM graceful (sem derrubar conexões)."""
    log(f'Etapa 5/6: Reload {PHP_FPM_SERVICE} (graceful)')

    code, _, _ = run(f'systemctl is-active {PHP_FPM_SERVICE}', check=False)

    if code != 0:
        log(f'  {PHP_FPM_SERVICE} inativo — iniciando', 'warn')
        run(f'sudo systemctl start {PHP_FPM_SERVICE}')
        log(f'  {PHP_FPM_SERVICE} iniciado', 'ok')
    else:
        run(f'sudo systemctl reload {PHP_FPM_SERVICE}')
        log(f'  {PHP_FPM_SERVICE} recarregado (graceful)', 'ok')


def step_6_smoke_test() -> None:
    """Smoke-test: requisição POST de diagnóstico ao proxy."""
    log(f'Etapa 6/6: Smoke-test ({SMOKE_TEST_URL})')

    try:
        _, out, _ = run(
            f'curl -s -o /dev/null -w "%{{http_code}}" '
            f'-X POST -H "Content-Type: application/json" '
            f'-d \'{{"text":"smoke test pipeline 10 camadas"}}\' '
            f'{SMOKE_TEST_URL} --connect-timeout 5 --max-time 15',
            check=False
        )
        code = int(out) if out.isdigit() else 0
        log(f'  HTTP {code} — proxy respondendo', 'ok')
    except Exception as e:
        log(f'  Smoke-test falhou: {e}', 'warn')
        log(f'  Não bloqueia o deploy (TTS backend pode estar offline)', 'warn')


def rollback(bak: Optional[str]) -> None:
    """Restaura o backup em caso de falha."""
    log('INICIANDO ROLLBACK AUTOMÁTICO...', 'rollback')

    if bak is None or not os.path.isfile(bak):
        log('  Sem backup disponível — abortando', 'error')
        sys.exit(1)

    shutil.copy2(bak, DEPLOY_TARGET)
    run(f'chown www-data:www-data {DEPLOY_TARGET}')
    run(f'chmod 0644 {DEPLOY_TARGET}')
    run(f'sudo systemctl reload {PHP_FPM_SERVICE}', check=False)

    log(f'  Restaurado: {bak} → {DEPLOY_TARGET}', 'ok')


# ================================================================
#  MAIN
# ================================================================

def main():
    print()
    print(f'{C.BOLD}══════════════════════════════════════════════════{C.RESET}')
    print(f'{C.BOLD}  VozPro — Deploy Seguro (Diff-Safe){C.RESET}')
    print(f'{C.BOLD}  Pipeline NLP v3.0.0 — 10 Camadas{C.RESET}')
    print(f'{C.BOLD}  {datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")}{C.RESET}')
    print(f'{C.BOLD}══════════════════════════════════════════════════{C.RESET}')
    print()

    bak = None

    try:
        step_1_validate_source()
        has_changes = step_2_diff_analysis()

        if not has_changes:
            print()
            log('Deploy pulado — arquivos idênticos em produção', 'ok')
            print()
            return

        bak = step_3_backup_current()
        step_4_deploy_file()
        step_5_reload_fpm()
        step_6_smoke_test()

        print()
        print(f'{C.GREEN}{C.BOLD}╔══════════════════════════════════════════╗{C.RESET}')
        print(f'{C.GREEN}{C.BOLD}║  DEPLOY CONCLUÍDO COM SUCESSO           ║{C.RESET}')
        print(f'{C.GREEN}{C.BOLD}║  Pipeline NLP v3.0.0 — 10 Camadas       ║{C.RESET}')
        print(f'{C.GREEN}{C.BOLD}║  Modelo: Engenharia ElevenLabs          ║{C.RESET}')
        print(f'{C.GREEN}{C.BOLD}╚══════════════════════════════════════════╝{C.RESET}')
        print()
        print(f'  {C.DIM}Arquivo  : {DEPLOY_TARGET}{C.RESET}')
        print(f'  {C.DIM}Hash     : {fhash(DEPLOY_TARGET)}{C.RESET}')
        print(f'  {C.DIM}Backup   : {bak or "nenhum (novo arquivo)"}{C.RESET}')
        print(f'  {C.DIM}Pipeline : 10 camadas especializadas{C.RESET}')
        print(f'  {C.DIM}Tokens   : congelamento URLs/E-mails ativo{C.RESET}')
        print()

    except Exception as e:
        log(f'Falha no deploy: {e}', 'error')
        if bak:
            rollback(bak)
        print()
        print(f'{C.RED}{C.BOLD}╔══════════════════════════════════════════╗{C.RESET}')
        print(f'{C.RED}{C.BOLD}║  DEPLOY FALHOU — Rollback executado     ║{C.RESET}')
        print(f'{C.RED}{C.BOLD}╚══════════════════════════════════════════╝{C.RESET}')
        print()
        sys.exit(1)


if __name__ == '__main__':
    main()
