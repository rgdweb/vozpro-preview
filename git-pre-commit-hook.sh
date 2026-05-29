#!/bin/bash
if [ -d ".git/rebase-merge" ] || [ -d ".git/rebase-apply" ]; then
    echo "AVISO: Voce esta em meio a um rebase. Resolva antes de commitar."
    echo "   Para abortar: git rebase --abort"
    exit 1
fi
if [ -f ".git/MERGE_HEAD" ]; then
    echo "AVISO: Voce esta em meio a um merge. Resolva antes de commitar."
    echo "   Para abortar: git merge --abort"
    exit 1
fi
if [ -f ".git/CHERRY_PICK_HEAD" ]; then
    echo "AVISO: Voce esta em meio a um cherry-pick."
    exit 1
fi
exit 0
