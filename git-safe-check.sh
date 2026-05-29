#!/bin/bash
# git-safe-check.sh - Verifica estado do git ANTES de qualquer operação perigosa
# NAO remove nada - apenas REPORTA o estado
# Se estiver em conflito, ABORTA a operação e pede ação manual

set -e

CHECK_DIR="${1:-/home/z/my-project/Omnivoice}"

if [ ! -d "$CHECK_DIR/.git" ]; then
    echo "[SAFE] Nao e um repositorio git: $CHECK_DIR"
    exit 0
fi

cd "$CHECK_DIR"

# Verificar se tem operação em andamento
STUCK=0

if [ -f ".git/MERGE_HEAD" ]; then
    echo "[BLOQUEADO] Merge em andamento. Resolva manualmente ou: git merge --abort"
    STUCK=1
fi

if [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ]; then
    echo "[BLOQUEADO] Rebase em andamento. Resolva manualmente ou: git rebase --abort"
    STUCK=1
fi

if [ -f ".git/CHERRY_PICK_HEAD" ]; then
    echo "[BLOQUEADO] Cherry-pick em andamento. Resolva manualmente ou: git cherry-pick --abort"
    STUCK=1
fi

if [ $STUCK -eq 1 ]; then
    echo "[ERRO] Git em estado de conflito. Nenhuma operacao sera executada."
    exit 1
fi

# Verificar se tem alterações sem commit
CHANGES=$(git status --porcelain 2>/dev/null | wc -l)
if [ "$CHANGES" -gt 0 ]; then
    echo "[AVISO] $CHANGES arquivo(s) modificado(s) sem commit."
    echo "  Use 'git stash' antes de pull ou faça commit das alterações."
    echo "  Ou use: git stash && git pull && git stash pop"
fi

echo "[OK] Git limpo. Operações seguras."
exit 0
