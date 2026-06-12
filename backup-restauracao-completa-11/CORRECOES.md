# Backup VozPro Oracle - 12/06/2025
# COMPLETO - 100% funcional - Todas as 7 correções aplicadas

================================================================================
COMO RESTAURAR QUANDO DER PAU NO ORACLE
================================================================================

QUANDO DER PAU: baixe esta pasta do GitHub, mande pro Oracle, rode 2 comandos.

PASSO 1 - Subir o backup ao Oracle (via SFTP/SCP):
  scp -r backup-restauracao-completa-11/ ubuntu@api.cvmnews.com.br:/home/ubuntu/backup-restore/

PASSO 2 - SSH no Oracle e rodar:
  cd /home/ubuntu/backup-restore/backup-restauracao-completa-11
  chmod +x RESTAURAR.sh
  ./RESTAURAR.sh

PRONTO. O script faz TUDO: apaga o codigo velho, copia o backup, instala
dependencias, migra o banco, roda deploy-seguro.py. Site volta no ar.

================================================================================
SOBRE O GIT PUSH --FORCE
================================================================================

NÃO use --force no repositório do Oracle (vozpro-preview).
O repositório no GitHub é APENAS para armazenar backups.
O --force foi necessário só porque o repo local estava vazio (sem commits).
Se o repo já tiver commits, use push normal:
  git push origin main

NO ORACLE, NUNCA use:
  git reset --hard        (PERIGO: perde tudo)
  git push --force        (PERIGO: reescreve histórico)

NO ORACLE, SEMPRE use:
  sudo python3 deploy-seguro.py   (SEGURO: pull, build, restart)

================================================================================
O QUE O SCRIPT RESTAURAR.SH FAZ (PASSO A PASSO)
================================================================================

1. Para o PM2 (via deploy-seguro.py que gerencia isso)
2. APAGA o código velho: src/, public/, prisma/ do /home/ubuntu/omnivoice/
3. Copia TODOS os arquivos do backup para os locais corretos
4. Copia .env (com SMTP Gmail) para /home/ubuntu/omnivoice/.env
5. Copia tunnel-generate.php para /var/www/omnivoice/ (fix estalos)
6. Copia deploy-seguro.py para /home/ubuntu/omnivoice/
7. Roda npm install
8. Roda npx prisma migrate deploy (cria/atualiza tabelas do banco)
9. Roda sudo python3 deploy-seguro.py (git pull, next build, copy standalone, pm2 restart)

DEPOIS DISSO O SITE ESTÁ 100% NO AR. NÃO PRECISA CONFIGURAR NADA MAIS.

================================================================================
O QUE PRECISA PARA FUNCIONAR (PRÉ-REQUISITOS NO ORACLE)
================================================================================

Estas coisas JÁ ESTÃO instaladas no Oracle (não precisa reinstalar):
  - Node.js v20.20.2
  - npm 10.8.2
  - PM2 (gerenciador de processos)
  - Nginx (proxy reverso)
  - PHP 8.3 com FPM
  - Certbot (SSL/Let's Encrypt)
  - PostgreSQL (banco de dados)
  - cloudflared (túnel)

SE o Oracle for formatado do zero, precisaria instalar tudo isso antes.
Mas para "der pau no site", basta o backup + RESTAURAR.sh.

================================================================================
LISTA COMPLETA DE ARQUIVOS NO BACKUP (161 arquivos)
================================================================================

env/
  .env                           ← Variáveis de ambiente (SMTP, DATABASE_URL, etc.)

src/  (130 arquivos - CÓDIGO FONTE COMPLETO)
  app/page.tsx                   ← Página principal (idioma PT, download dialog, auto-split off)
  app/layout.tsx                 ← Layout do Next.js
  app/globals.css                ← Estilos globais
  app/login/page.tsx             ← Página de login
  app/admin/page.tsx             ← Painel admin
  app/admin/layout.tsx           ← Layout admin
  app/admin/login/page.tsx       ← Login admin
  app/api/generate/route.ts      ← API de geração (ref_text='', guidance_scale=2.0)
  app/api/tunnel-generate/route.ts
  app/api/php-generate/route.ts
  app/api/omnivoice-generate/route.ts
  app/api/send-audio-email/route.ts
  app/api/free-download/route.ts
  app/api/payment/create/route.ts
  app/api/payment/download/route.ts
  app/api/payment/qrcode/route.ts
  app/api/payment/status/route.ts
  app/api/payment/webhook/route.ts
  app/api/voices/route.ts
  app/api/voices/[id]/route.ts
  app/api/voices/[id]/variations/route.ts
  app/api/auth/route.ts
  app/api/auth/google/route.ts
  app/api/auth/verify/route.ts
  app/api/upload-voice/route.ts
  app/api/upload-track/route.ts
  app/api/upload-chunk/route.ts
  app/api/upload-token/route.ts
  app/api/upload-watermark/route.ts
  app/api/speakers/route.ts
  app/api/categories/route.ts
  app/api/tracks/route.ts
  app/api/tracks/[id]/route.ts
  app/api/queue/join/route.ts
  app/api/queue/complete/route.ts
  app/api/queue/heartbeat/route.ts
  app/api/admin/voices/route.ts
  app/api/admin/voices/bulk-upload/route.ts
  app/api/admin/speakers/route.ts
  app/api/admin/speakers/convert/route.ts
  app/api/admin/speakers/ref-text/route.ts
  app/api/admin/tracks/route.ts
  app/api/admin/users/route.ts
  app/api/admin/settings/route.ts
  app/api/admin/rename-category/route.ts
  app/api/generate-token/route.ts
  app/api/generate-config/route.ts
  app/api/omnivoice-token/route.ts
  app/api/server-config/route.ts
  app/api/settings/route.ts
  app/api/status/route.ts
  app/api/health/route.ts
  app/api/diagnose/route.ts
  app/api/maintenance/route.ts
  app/api/cleanup/route.ts
  app/api/proxy-audio/route.ts
  app/api/gpu-stats/route.ts
  app/api/asr-validate/route.ts
  app/api/g2p-phonemize/route.ts
  app/api/optimize-pronunciation/route.ts
  app/api/clean-instructs/route.ts
  app/api/batch-upload-tracks/route.ts
  app/api/voice-categories/route.ts
  app/api/track-categories/route.ts
  app/api/setup-sessions/route.ts
  app/api/route.ts
  components/payment-dialog.tsx    ← Dialog de pagamento/download (free download credit)
  components/audio-player.tsx
  components/voice-preview-button.tsx
  components/ui/ (42 componentes shadcn/ui)
  hooks/use-toast.ts
  hooks/use-mobile.ts
  lib/auth.ts
  lib/db.ts
  lib/utils.ts
  lib/audio-server.ts
  lib/audio-trimmer.ts
  lib/audio-concatenator.ts
  lib/ssml-parser.ts
  lib/tts-chunker.ts
  lib/tts-text-preprocessor.ts
  lib/pronunciation-optimizer.ts
  lib/asr-validator.ts

database/prisma/
  schema.prisma                  ← Schema do banco de dados
  migrations/
    20260505171504_init/migration.sql
    20260510000000_add_user_model/migration.sql
    20260511000000_add_session_model/migration.sql
    migration_lock.toml

php/
  tunnel-generate.php            ← PHP proxy (CURLOPT_ENCODING identity = fix estalos)

nginx/
  vozpro.cvmnews.com.br          ← Config Nginx do site (proxy → 127.0.0.1:3001)
  omnivoice                      ← Config Nginx do PHP (api.cvmnews.com.br)
  teste.cvmnews.com.br           ← Config de teste (referência)

pm2/
  pm2-processes.json             ← Info dos processos PM2 ativos

gpu-server/                      ← Servidor Windows com GPU (NÃO vai no Oracle)
  omnivoice_api.py               ← API Python de geração (torchaudio 24k→44.1k)
  start_tunnel.py                ← cloudflared + túnel SSH
  iniciar.bat                    ← Startup do Windows
  fix_api.py                     ← Fix urllib

public/
  logo.jpg
  logo.svg
  og-image.jpg
  robots.txt

deploy-seguro.py                 ← SCRIPT DE DEPLOY (NUNCA MODIFICAR)
package.json                     ← Dependências do projeto
package-lock.json                ← Versões exatas das dependências
next.config.ts                   ← Config do Next.js
tsconfig.json                    ← Config TypeScript
tailwind.config.ts               ← Config Tailwind CSS
postcss.config.mjs               ← Config PostCSS
components.json                  ← Config shadcn/ui
.gitignore                       ← Arquivos ignorados pelo git
system-info.txt                  ← Node v20.20.2, npm 10.8.2
CORRECOES.md                     ← ESTE ARQUIVO
RESTAURAR.sh                     ← Script de restauração automática

================================================================================
CORREÇÕES APLICADAS (7 correções)
================================================================================

1. ESTALOS/CRACKLING NO ÁUDIO (CRÍTICA)
   Arquivo: tunnel-generate.php
   O que: CURLOPT_ENCODING => 'identity' (bloqueia compressão gzip do cloudflared)
   Antes: aceite qualquer compressão → dados binários corrompidos → estalos
   Depois: força resposta limpa → áudio perfeito

2. ENVIO DE EMAIL DESATIVADO
   Arquivo: .env
   O que: Adicionou SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
   Faltava: sem essas vars a função de enviar áudio por email não funcionava

3. OPÇÕES DE DOWNLOAD OCULTAS PARA GRATUITOS
   Arquivos: page.tsx, payment-dialog.tsx
   O que: handleDownloadClick agora sempre abre o PaymentDialog (WAV/MP3/Email)
   Antes: usuários grátis não viam as opções de como baixar

4. IDIOMA ERRADO (GERAVA ÁUDIO EM INGLÊS)
   Arquivo: page.tsx
   O que: 'Portuguese' → 'Portuguese (pt)'
   Por que: OmniVoice precisa do formato com código ISO entre parênteses

5. TEXTO DE REFERÊNCIA ARTIFICIAL
   Arquivo: generate/route.ts
   O que: ref_text vazio '' ao invés de texto artificial
   Antes: 'texto de referencia para clonagem de voz' → qualidade ruim

6. GUIDANCE_SCALE FIXO EM 1.5
   Arquivo: generate/route.ts
   O que: Agora usa valor do frontend com fallback 2.0
   Antes: sempre 1.5 → qualidade reduzida na clonagem

7. AUTO-SPLIT DESATIVADO
   Arquivo: page.tsx
   O que: Desativado com if (true) return
   Por que: dividia texto desnecessariamente

================================================================================
REGRA DE OURO
================================================================================

NO ORACLE:
  ✅ SEMPRE use: sudo python3 deploy-seguro.py
  ❌ NUNCA use: git reset --hard, kill manual, npm start manual

NO GITHUB (vozpro-preview):
  ✅ Use: git push origin main (sem --force se já tiver commits)
  ❌ NUNCA use: git push --force no repo do Oracle

Data do backup: 12/06/2025
Status: 100% funcional