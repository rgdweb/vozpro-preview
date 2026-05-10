#!/bin/bash
# VozPro Backup Manager
# Uso: ./backup.sh [backup|restore|list]

BACKUP_DIR="/home/z/my-project/backups"
REPO_DIR="/home/z/my-project"
SRC_DIR="/home/z/my-project/src"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

backup() {
    local LABEL="$1"
    if [ -z "$LABEL" ]; then
        LABEL="$TIMESTAMP"
    fi

    echo "=== VozPro Backup ==="
    echo "Label: $LABEL"

    # 1. Criar tag git
    cd "$REPO_DIR"
    git add -A
    git commit -m "backup: $LABEL" --allow-empty 2>/dev/null
    git tag "backup-$LABEL" 2>/dev/null
    echo "[OK] Git tag: backup-$LABEL"

    # 2. Copiar arquivos-chave para backup local
    local BACKUP_PATH="$BACKUP_DIR/$LABEL"
    mkdir -p "$BACKUP_PATH/src/app" "$BACKUP_PATH/src/lib" "$BACKUP_PATH/src/components"

    cp -r "$SRC_DIR/app/page.tsx" "$BACKUP_PATH/src/app/" 2>/dev/null
    cp -r "$SRC_DIR/app/admin/page.tsx" "$BACKUP_PATH/src/app/" 2>/dev/null
    cp -r "$SRC_DIR/app/admin/page.module.css" "$BACKUP_PATH/src/app/" 2>/dev/null
    cp -r "$SRC_DIR/lib"/*.ts "$BACKUP_PATH/src/lib/" 2>/dev/null
    cp -r "$SRC_DIR/components"/*.tsx "$BACKUP_PATH/src/components/" 2>/dev/null
    cp -r "$SRC_DIR/app/api" "$BACKUP_PATH/src/app/api" 2>/dev/null
    cp -r package.json vercel.json .env* "$BACKUP_PATH/" 2>/dev/null

    # Salvar info do commit
    git log --oneline -1 > "$BACKUP_PATH/commit.txt"
    echo "Branch: $(git branch --show-current)" >> "$BACKUP_PATH/commit.txt"
    echo "Date: $(date)" >> "$BACKUP_PATH/commit.txt"

    echo "[OK] Arquivos salvos em: $BACKUP_PATH"

    # 3. Push tag para GitHub (backup remoto)
    git push origin "backup-$LABEL" 2>/dev/null && echo "[OK] Tag pushed to GitHub" || echo "[WARN] Nao conseguiu push da tag"

    # Limpar backups antigos (manter ultimos 10)
    cd "$BACKUP_DIR"
    ls -dt */ 2>/dev/null | tail -n +11 | xargs rm -rf 2>/dev/null
    echo "[OK] Backups antigos limpos (mantendo ultimos 10)"

    echo ""
    echo "=== BACKUP CONCLUIDO ==="
    echo "Para restaurar: ./backup.sh restore $LABEL"
}

restore() {
    local LABEL="$1"
    if [ -z "$LABEL" ]; then
        echo "Backups disponiveis:"
        list
        return 1
    fi

    local BACKUP_PATH="$BACKUP_DIR/$LABEL"
    if [ ! -d "$BACKUP_PATH" ]; then
        echo "[ERRO] Backup '$LABEL' nao encontrado em $BACKUP_PATH"
        echo "Backups disponiveis:"
        list
        return 1
    fi

    echo "=== RESTAURAR BACKUP: $LABEL ==="
    echo "Acao: Restaurar arquivos do backup $LABEL"
    echo ""
    echo "Arquivos a serem restaurados:"
    find "$BACKUP_PATH" -name "*.tsx" -o -name "*.ts" -o -name "*.json" -o -name "vercel.json" | sed "s|$BACKUP_PATH/||"
    echo ""

    # Verificar se tem tag git
    cd "$REPO_DIR"
    if git rev-parse "backup-$LABEL" >/dev/null 2>&1; then
        echo "[OK] Git tag encontrada: backup-$LABEL"
        echo "[OK] Restaurando via git checkout..."

        # Resetar para o commit da tag
        local COMMIT=$(git rev-parse "backup-$LABEL^{commit}" 2>/dev/null)
        git checkout "backup-$LABEL" -- src/ package.json vercel.json 2>/dev/null
        echo "[OK] Arquivos restaurados do commit $COMMIT"
    else
        echo "[INFO] Sem tag git, copiando arquivos do backup local..."
        cp -r "$BACKUP_PATH/src/app/page.tsx" "$SRC_DIR/app/" 2>/dev/null
        cp -r "$BACKUP_PATH/src/app/admin/page.tsx" "$SRC_DIR/app/admin/" 2>/dev/null
        cp -r "$BACKUP_PATH/src/lib"/*.ts "$SRC_DIR/lib/" 2>/dev/null
        cp -r "$BACKUP_PATH/src/components"/*.tsx "$SRC_DIR/components/" 2>/dev/null
        cp -r "$BACKUP_PATH/package.json" "$REPO_DIR/" 2>/dev/null
        cp -r "$BACKUP_PATH/vercel.json" "$REPO_DIR/" 2>/dev/null
        echo "[OK] Arquivos copiados"
    fi

    echo ""
    echo "=== RESTAURACAO CONCLUIDA ==="
    echo "Revise as mudancas com: git diff"
    echo "Para commitar: git add -A && git commit -m 'restore: $LABEL'"
    echo "Para descartar: git checkout ."
}

list() {
    echo ""
    echo "=== Backups Locais ==="
    if [ -d "$BACKUP_DIR" ]; then
        for d in "$BACKUP_DIR"/*/; do
            if [ -d "$d" ]; then
                local NAME=$(basename "$d")
                local DATE=$(stat -c %y "$d" 2>/dev/null | cut -d. -f1)
                local COMMIT=$(cat "$d/commit.txt" 2>/dev/null | head -1)
                echo "  $NAME  ($DATE)  $COMMIT"
            fi
        done
    else
        echo "  Nenhum backup local"
    fi

    echo ""
    echo "=== Git Tags (backup-*) ==="
    cd "$REPO_DIR"
    git tag -l "backup-*" --sort=-creatordate | while read tag; do
        local DATE=$(git log -1 --format='%ci' "$tag" 2>/dev/null | cut -d' ' -f1,2)
        local MSG=$(git log -1 --format='%s' "$tag" 2>/dev/null)
        echo "  $tag  ($DATE)  $MSG"
    done
    echo ""
}

case "${1:-backup}" in
    backup)   backup "$2" ;;
    restore)  restore "$2" ;;
    list|ls)  list ;;
    *)
        echo "VozPro Backup Manager"
        echo ""
        echo "Uso:"
        echo "  ./backup.sh backup [label]  - Criar backup (label padrao: data/hora)"
        echo "  ./backup.sh restore [label] - Restaurar backup"
        echo "  ./backup.sh list           - Listar backups"
        echo ""
        echo "Exemplos:"
        echo "  ./backup.sh backup antes-trilhas"
        echo "  ./backup.sh restore antes-trilhas"
        echo "  ./backup.sh list"
        ;;
esac
