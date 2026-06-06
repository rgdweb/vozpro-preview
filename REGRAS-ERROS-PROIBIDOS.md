# REGRAS DE GOVERNANCA - ERROS PROIBIDOS (REGISTRO PERMANENTE)
# =========================================================================
# Este arquivo registra TODOS os erros cometidos por sessoes anteriores de IA
# que causaram queda do sistema VozPro. NENHUMA sessao futura pode repetir
# estes erros. Leia ANTES de alterar QUALQUER arquivo deste repositorio.
# =========================================================================
#
# Ultima atualizacao: 2026-06-07
# Responsavel: Governanca Executiva VozPro
#
# =========================================================================
# ERRO 1: git reset --hard (CATASTROFICO)
# =========================================================================
# O que aconteceu: Uma sessao executou 'git reset --hard' no servidor Oracle
# destruindo TODAS as alteracoes locais nao commitadas, incluindo:
#   - Correcoes da fila (queue config)
#   - Fix da admin page
#   - Configuracoes do .env de producao
# REGRA: NUNCA execute 'git reset --hard' em QUALQUER circunstancia.
#   Use 'git stash' se precisar limpar o working tree.
#   Use 'git checkout -- <arquivo>' APENAS para arquivos de codigo,
#   NUNCA para .env (veja Erro 13).
#
# =========================================================================
# ERRO 2: Alteracao de git remote (PIPELINE QUEBRADO)
# =========================================================================
# O que aconteceu: Uma sessao mudou o remote de 'origin' de vozpro-preview
# para Omnivoice ou outro repo, quebrando todo o pipeline de deploy.
# REGRA: O remote 'origin' DEVE apontar EXCLUSIVAMENTE para:
#   https://github.com/rgdweb/vozpro-preview.git
#   NUNCA altere o git remote no Oracle ou em qualquer clone de producao.
#
# =========================================================================
# ERRO 3: rm -rf .next (BUILD CACHE DESTRUIDO)
# =========================================================================
# O que aconteceu: Executou 'rm -rf .next' destruindo o cache de build.
# REGRA: NUNCA execute 'rm -rf' em QUALQUER diretorio do projeto.
#   Para rebuild limpo, use 'next build' que limpa e recria automaticamente.
#   O deploy-seguro.py ja faz rebuild completo -- nao precisa de rm -rf.
#
# =========================================================================
# ERRO 4: Syntax error na admin page empurrada para producao
# =========================================================================
# O que aconteceu: A sessao escreveu uma linha com syntax error:
#   const [enableVoiceFileText, Upload, setEnableVoiceUpload] = useState(true)
#   (nomes de variaveis com espaco/maiuscula invalidos)
# Isso causou crash de toda a rota /admin.
# REGRA: Toda alteracao de codigo DEVE ser testada com 'next build' ANTES
#   de fazer commit. O deploy-seguro.py ja executa next build e aborta
#   se houver erro de compilacao. NAO desabilite esta verificacao.
#
# =========================================================================
# ERRO 5: .env com valores errados no GitHub
# =========================================================================
# O que aconteceu: Um .env com DATABASE_URL apontando para SQLite foi
# commitado e pushado para o GitHub, sobrescrevendo a versao PostgreSQL.
# REGRA: NUNCA commit .env no git. O .env no Oracle (PostgreSQL) e o
#   .env no GitHub (template/desenvolvimento) sao ARQUIVOS DIFERENTES.
#   O deploy-seguro.py tem verificar_env_protegido() que aborta se
#   o .env nao tiver DATABASE_URL com "postgresql".
#
# =========================================================================
# ERRO 6: 30+ arquivos temporarios no root do Oracle
# =========================================================================
# O que aconteceu: Sessoes criaram dezenas de arquivos temporarios
# em /root/: admin_page_temp.tsx, client_page_temp.tsx, deploy_route.py,
# scan_b1.py, scan_b2.py, scan_b3.py, scan_oracle.py, etc.
# REGRA: NUNCA crie arquivos temporarios no root do servidor.
#   Se precisar de temp, use /tmp/ e remova apos o uso.
#   NAO polua o diretorio de producao com arquivos de debug.
#
# =========================================================================
# ERRO 7: deploy_route.py com rm -rf (DESTRUCTIVO)
# =========================================================================
# O que aconteceu: Criou um script deploy_route.py que continha
# 'rm -rf .next' e outros comandos destrutivos.
# REGRA: O UNICO script de deploy permitido e deploy-seguro.py.
#   NUNCA crie scripts de deploy alternativos.
#   NUNCA inclua rm -rf em qualquer script.
#
# =========================================================================
# ERRO 8: next.config.ts quebrado no repo backup
# =========================================================================
# O que aconteceu: O next.config.ts no omnivoice-backup foi alterado
# com configuracoes invalidas que causariam build failure.
# REGRA: Mantenha next.config.ts IDENTICO entre vozpro-preview e backup.
#   'output: standalone' e OBRIGATORIO. NUNCA remova esta diretiva.
#
# =========================================================================
# ERRO 9: Queue config inadequada (FILAS EMPERRADAS)
# =========================================================================
# O que aconteceu: A fila tinha MAX_CONCURRENT_GENERATIONS=1 e
# PROCESSING_TIMEOUT_MS=600000 (10 minutos). Com 1 item por vez e
# 10 min de timeout, qualquer falha travava o sistema por 10 min.
# REGRA: Configuracao correta e PERMANENTE:
#   MAX_CONCURRENT_GENERATIONS = 3
#   PROCESSING_TIMEOUT_MS = 180000 (3 minutos)
#   Health check automatico em cada acesso.
#   NUNCA reduza concurrent abaixo de 3 ou timeout acima de 3 min.
#
# =========================================================================
# ERRO 10: AUDIO_SERVER_API_KEY ausente do .env
# =========================================================================
# O que aconteceu: O .env perdeu a variavel AUDIO_SERVER_API_KEY,
# causando falha de autenticacao entre Next.js e o PHP proxy.
# REGRA: O .env de producao DEVE ter SEMPRE estas variaveis:
#   DATABASE_URL=postgresql://omnivoice:VozPro2026@localhost:5432/omnivoice
#   AUDIO_SERVER_API_KEY=omnivoice_api_key_2026_secure
#   JWT_SECRET=<chave existente>
#   Se qualquer variavel estiver faltando, RESTAURE antes de qualquer deploy.
#
# =========================================================================
# ERRO 11: Mismatch de token entre .env e config.php (TOKEN INVALIDO)
# =========================================================================
# O que aconteceu: O .env tinha 'vozpro_2024_a8f7d9e2b4c1...' mas o
# config.php no GPU server tinha 'omnivoice_api_key_2026_secure'.
# Resultado: HTTP 401 "Token de geracao invalido" em toda geracao.
# REGRA: A chave DEVE ser IDENTICA em ambos:
#   .env: AUDIO_SERVER_API_KEY=omnivoice_api_key_2026_secure
#   config.php: API_KEY='omnivoice_api_key_2026_secure'
#   Se mudar em um, mude no outro IMEDIATAMENTE.
#
# =========================================================================
# ERRO 12: pm2 restart NAO recarrega .env no standalone
# =========================================================================
# O que aconteceu: Apos mudar .env, a sessao fez 'pm2 restart omnivoice'
# esperando que o .env fosse recarregado. Mas Next.js standalone congela
# as variaveis de ambiente no momento do BUILD (next build).
# REGRA: Para aplicar mudancas no .env, e OBRIGATORIO fazer rebuild completo:
#   next build -> copiar static/public -> pm2 stop -> pm2 start
#   O deploy-seguro.py ja faz tudo isso automaticamente.
#   NUNCA use 'pm2 restart' sozinho para aplicar mudancas de .env.
#
# =========================================================================
# ERRO 13: git checkout -- .env destruiu producao
# =========================================================================
# O que aconteceu: Executou 'git checkout -- .env' no Oracle, que
# restaurou a versao do Git (SQLite) sobrescrevendo a versao PostgreSQL
# de producao. Banco de dados desconectado instantaneamente.
# REGRA: NUNCA execute 'git checkout -- .env' em QUALQUER circunstancia.
#   O .env NAO e gerenciado pelo Git em producao.
#   Adicione .env ao .gitignore e nunca o versione com valores reais.
#
# =========================================================================
# RESUMO DAS 5 REGRAS ABSOLUTAS
# =========================================================================
# 1. NUNCA execute: git reset --hard, rm -rf, git checkout -- .env
# 2. NUNCA altere: .env de producao, git remote, DATABASE_URL, API keys
# 3. NUNCA crie: scripts de deploy alternativos, arquivos temp no root
# 4. SEMPRE use: deploy-seguro.py para deploy, vozpro-preview para commits
# 5. SEMPRE verifique: next build passa, .env tem PostgreSQL, token bate
# =========================================================================
