#!/bin/bash
# Instala os hooks de segurança no git
# Rodar UMA VEZ quando tiver permissão: bash git-hooks-INSTALL.sh

REPO="/home/z/my-project/Omnivoice"

echo "Instalando pre-commit hook..."
cp /home/z/my-project/git-pre-commit-hook.sh "$REPO/.git/hooks/pre-commit"
chmod +x "$REPO/.git/hooks/pre-commit"
echo "Done! Hook pre-commit ativo."
