# GOVERNANCE OFICIAL E RESTRITA - VOZPRO (Oracle)
# ===================================================================================
# REGRA 1: PROIBIDO restaurar/substituir TODOS os arquivos de uma vez no Oracle.
#   Nunca use scp/rsync para copiar todo o projeto. Envie SOMENTE arquivos
#   que foram EDITADOS ou ATUALIZADOS.
#
# REGRA 2: PROIBIDO voltar backup sem ORDEM EXPRESSA do dono do projeto.
#   Nenhum backup pode ser restaurado sem autorizacao explicita do usuario.
#
# REGRA 3: PROIBIDO substituir arquivos que NAO foram tocados/editados.
#   Se o arquivo nao foi modificado, nao envie ao Oracle. Deixe como esta.
#
# REGRA 4: Deploy UNICO e EXCLUSIVO via deploy-seguro.py.
#   O UNICO metodo permitido de deploy e:
#     python3 /home/ubuntu/omnivoice/deploy-seguro.py
#   Nenhum deploy manual, nenhum git reset --hard, nenhum rm -rf.
#
# VIOLACAO de qualquer regra acima e considerada FALHA CRITICA de seguranca.
# ===================================================================================

