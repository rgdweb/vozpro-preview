# MEMÓRIA COMPLETA DO PROJETO OMNIVOICE
# Última atualização: 2026-05-24 05:33 UTC
# BACKUP TAG: backup-funcional-completo-20260524-053351

================================================================================
1. VISÃO GERAL DO PROJETO
================================================================================

Omnivoice é um sistema de TTS (Text-to-Speech) profissional com:
- Geração de voz por IA usando Gradio API (local Python + tunnel PHP)
- Sistema de autenticação Google OAuth
- Sistema de pagamento via MercadoPago (PIX via QR Code)
- Marca d'água em áudios (usuários gratuitos)
- Painel administrativo completo
- Fila de geração com WebSocket
- Upload de vozes personalizadas
- Categorização de vozes e trilhas
- Masterização de áudio
- ASR (Speech-to-Text) para validação

================================================================================
2. ARQUITETURA
================================================================================

Frontend: Next.js 16 + React 19 + Tailwind CSS 4 + shadcn/ui
Backend: Next.js API Routes + Prisma ORM
Database: Neon PostgreSQL (project: nameless-term-28412842)
TTS Engine: Gradio (Python local) acessado via tunnel PHP
Hosting: Vercel (frontend) + VPS Python (TTS engine)
Tunnel: PHP script em sorteiomax.com.br/omnivoice/

================================================================================
3. CREDENCIAIS E CONFIGURAÇÕES
================================================================================

GITHUB:
- Repo: https://github.com/rgdweb/Omnivoice
- Branch principal: main
- PAT para push: ver variavel de ambiente ou pedir ao usuario
  (Configurar no remote: git remote set-url origin https://<PAT>@github.com/rgdweb/Omnivoice.git)

VERCEL:
- Token: ver variavel de ambiente ou pedir ao usuario
- Team ID: sites-projects-5055e519 (account)
- Account ID: team_fFtMEUQEuLj63ZeKdH7q2sXA
- Project ID: prj_mG4KTYDFx87Rj8YTgtvLvwu6asSG (omnivoice)
- Outro projeto: prj_0xXVG0RNWscDnJZ9vhFdoayGSSxM (omnivoice-repo - NAO USAR)
- URL: https://omnivoice-pckosayjn-sites-projects-5055e519.vercel.app
- Neon faz prisma db push AUTOMATICAMENTE no deploy
- API env vars: PATCH https://api.vercel.com/v10/projects/{id}/env/{envId}

MERCADOPAGO:
- Access Token: ver variaveis de ambiente Vercel (MERCADOPAGO_ACCESS_TOKEN)

GOOGLE:
- Client ID: ver variaveis de ambiente Vercel (GOOGLE_CLIENT_ID)

DATABASE (Neon PostgreSQL):
- Project: nameless-term-28412842
- ORM: Prisma
- SystemSetting model: chave/valor para todas as configs do sistema

TUNNEL PHP:
- URL: https://sorteiomax.com.br/omnivoice/update_tunnel.php
- Auth: ver variaveis de ambiente Vercel (TUNNEL_AUTH_KEY)

GRADIO TTS LOCAL:
- Parâmetros PERFEITOS (NÃO MEXER):
  * denoise = true
  * preprocess_prompt = true
  * postprocess_output = true
- Qualquer mudança nesses 3 parâmetros pode causar:
  * Estalos/clicks no áudio
  * Oscilação de velocidade
  * Palavras embaralhadas
  * Voz "bêbada"

================================================================================
4. REGRA DE OURO - NUNCA VIOLAR
================================================================================

4.1 NUNCA usar git push --force
    - Isso sobrescreve commits de outros colaboradores
    - Em 2026-05-24, um push --force apagou funcionalidades que o usuário
      tinha programado o dia todo (pagamento, marca d'água, Google login)
    - Sempre usar: git pull --rebase ANTES de git push

4.2 NUNCA mudar os 3 parâmetros Gradio
    - denoise=true, preprocess_prompt=true, postprocess_output=true
    - Esses são os padrões do Gradio demo local e funcionam perfeitamente

4.3 SEMPRE criar backup (tag) antes de qualquer mudança
    - git tag -a "backup-descricao-$(date +%Y%m%d-%H%M%S)" -m "descrição"

4.4 SEMPRE verificar se não removeu nada após qualquer edição
    - git diff HEAD~1 --stat
    - Verificar se arquivos que deveriam existir ainda existem

4.5 NUNCA editar arquivos que não são o alvo da tarefa
    - Foco: mexer apenas no necessário
    - Sepreciso editar um arquivo, ler INTEIRO antes e depois comparar

4.6 Push SEMPRE via PAT do GitHub
    - Não tem SSH configurado no sandbox
    - Remote URL: https://<PAT>@github.com/rgdweb/Omnivoice.git
    - Pedir token ao usuario se necessario

================================================================================
5. ESTRUTURA DE ARQUIVOS CRÍTICOS
================================================================================

API Routes (src/app/api/):
├── admin/           - Painel administrativo (dados/stats)
├── auth/            - Google OAuth login
├── generate/        - Geração TTS direta (Gradio params: 3x true)
├── tunnel-generate/ - Geração TTS via tunnel PHP (Gradio params: 3x true)
├── payment/         - Sistema MercadoPago
│   ├── create/      - Cria pagamento PIX
│   ├── qrcode/      - Gera QR code (depende do pacote 'qrcode')
│   ├── status/      - Checa status do pagamento
│   └── webhook/     - Webhook MercadoPago
├── queue/           - Fila de geração (WebSocket)
├── settings/        - Configurações do sistema (SystemSetting)
├── tracks/          - CRUD de trilhas de voz
├── voices/          - CRUD de vozes
├── upload-watermark/ - Upload de marca d'água
└── variations/      - Variações de voz

Pages (src/app/):
├── page.tsx         - Página principal de geração (~2688 linhas)
├── admin/page.tsx   - Painel administrativo (~3749 linhas)
├── login/page.tsx   - Login com Google
├── billing/page.tsx - Planos e pagamento
└── ...

Database (schema.prisma):
- SystemSetting: chave/valor (configs gerais)
- User: usuários do sistema
- Voice: vozes personalizadas
- Track: trilhas de áudio
- Payment/PaymentLog: registros de pagamento
- Queue: fila de geração

Monitor Local:
- download/diagnostico.py - Script Python para monitorar Gradio local
  - Auto-restart DESATIVADO (bug crítico: matava o próprio processo)
  - Usa kill por PID em vez de taskkill /IM python.exe

================================================================================
6. HISTÓRICO DE PROBLEMAS E SOLUÇÕES
================================================================================

6.1 AUDIO ESTALANDO/CLICKS
- Causa: postprocess_output estava false em tunnel-generate
- Solução: All 3 Gradio params = true (padrão do demo local)
- Data: 2026-05-24
- Status: RESOLVIDO

6.2 VOZ "BÊBADA"/EMBARALHADA
- Causa: preprocess_prompt estava false
- Solução: preprocess_prompt=true
- Status: RESOLVIDO

6.3 OSCILAÇÃO DE VELOCIDADE
- Causa: Parâmetros Gradio inconsistentes entre generate e tunnel-generate
- Solução: Padronizar todos para true
- Status: RESOLVIDO

6.4 MONITOR MATANDO O PRÓPRIO PROCESSO
- Causa: Auto-restart verificava "python.exe" e matava TODOS os processos Python
- Solução: Desativar auto-restart, usar kill por PID específico
- Arquivo: download/diagnostico.py
- Status: RESOLVIDO

6.5 GIT PUSH --FORCE APAGOU FUNCIONALIDADES
- Causa: git push --force após rebase sobrescreveu commits do usuário
- Perdido: Pagamento, marca d'água, Google login, isenção por usuário
- Solução: Recuperado do Vercel deployment cd98775
- Lição: NUNCA usar push --force
- Data: 2026-05-24
- Status: RESOLVIDO (código restaurado via Vercel API)

6.6 BUILD VERCEL FALHANDO - MODULE NOT FOUND 'QRCODE'
- Causa: Arquivo payment/qrcode/route.ts importava 'qrcode' mas pacote não estava no package.json
- Solução: npm install qrcode + @types/qrcode
- Commit: 0265e07
- Status: RESOLVIDO

================================================================================
7. DEPLOYMENTS VERCEL IMPORTANTES
================================================================================

DEPLOYMENT ATUAL (READY):
- dpl_FoMo (2026-05-24) - Tudo funcional, build passou

DEPLOYMENT HISTÓRICO COM CÓDIGO COMPLETO:
- cd98775c485d25a75c517e5a - "fix: payment exempt toggle now works both ways"
  Este deployment tinha TODAS as funcionalidades antes de ser sobrescrito

DEPLOYMENTS COM ERRO (JÁ RESOLVIDO):
- D7Kk (ebc132b) - Erro: faltava pacote qrcode
- 5n7W (521c708) - Erro: faltava pacote qrcode

================================================================================
8. GIT TAGS DE BACKUP (ORDENADOS DO MAIS RECENTE)
================================================================================

backup-funcional-completo-20260524-053351  ← ESTADO ATUAL PERFEITO
backup-antes-reconstrucao-20260524-041859  ← Antes da reconstrução
backup-before-voice-preview-redesign
backup-before-category-edit
backup-before-voice-batch-fix
backup-before-track-play-client
backup-before-show-more-tracks
backup-before-admin-voice-preview-download
backup-before-voice-preview-download
backup-estado-atual

================================================================================
9. FUNCIONALIDADES DO SISTEMA (CHECKLIST)
================================================================================

[x] Geração TTS via Gradio (local + tunnel)
[x] Parâmetros Gradio: denoise=true, preprocess_prompt=true, postprocess_output=true
[x] Autenticação Google OAuth
[x] Sistema de pagamento MercadoPago (PIX via QR Code)
[x] Isenção de pagamento por usuário (toggle no admin)
[x] Marca d'água em áudios (usuários gratuitos)
[x] Painel administrativo completo
[x] Fila de geração com prioridades
[x] Upload de vozes personalizadas
[x] Categorização de vozes e trilhas
[x] Preview de vozes
[x] Duração das trilhas exibida nos cards
[x] Masterização de áudio
[x] ASR validação de pronúncia
[x] Geração em lote (batch)
[x] Configurações de servidor
[x] Monitor local do Gradio

================================================================================
10. WORKFLOW PARA FUTURAS SESSÕES
================================================================================

AO RETOMAR O PROJETO:
1. Ler ESTE arquivo (MEMORIA-PROJETO-OMNIVOICE.md)
2. git pull origin main (JAMAIS --force)
3. Verificar backup tag mais recente: git tag -l --sort=-creatordate | head -3
4. NÃO mexer nos 3 parâmetros Gradio (estão perfeitos)
5. Verificar estado do deploy: curl Vercel API

ANTES DE QUALQUER MUDANÇA:
1. git tag -a "backup-descricao-$(date +%Y%m%d-%H%M%S)" -m "o que vai fazer"
2. Fazer as mudanças
3. git diff --stat (verificar se não apagou nada acidentalmente)
4. npm run build (verificar se compila)
5. git add + commit + push (via PAT)

NUNCA:
- git push --force
- Mudar denoise/preprocess_prompt/postprocess_output
- Editar arquivos que não são o alvo
- Fazer push sem verificar diff antes

================================================================================
11. DEPENDÊNCIAS IMPORTANTES
================================================================================

Pacotes NPM que já causaram problemas de build:
- qrcode (v1.5.4) + @types/qrcode - Necessário para payment/qrcode/route.ts

Se adicionar novos imports de pacotes externos, SEMPRE:
1. npm install <pacote>
2. npm install -D @types/<pacote> (se for TypeScript)
3. Verificar se build passa localmente
4. Fazer commit e push SEPARADO só para as dependências

================================================================================
12. ENDPOINTS DE API
================================================================================

TTS:
- POST /api/generate - Geração direta
- POST /api/tunnel-generate - Geração via tunnel PHP

Pagamento:
- POST /api/payment/create - Criar pagamento PIX
- POST /api/payment/qrcode - Gerar QR code
- GET  /api/payment/status?id= - Status do pagamento
- POST /api/payment/webhook - Webhook MercadoPago

Admin:
- GET  /api/admin/stats - Estatísticas
- GET/POST /api/admin/users - Gerenciar usuários
- GET/POST /api/admin/settings - Configurações do sistema

Voices:
- GET  /api/voices - Listar vozes
- POST /api/upload-voice - Upload nova voz
- GET/POST /api/voice-categories - Categorias de voz

Tracks:
- GET  /api/tracks - Listar trilhas
- POST /api/upload-track - Upload nova trilha
- GET/POST /api/track-categories - Categorias de trilha

Fila:
- WebSocket /api/queue - Fila de geração em tempo real

Configurações:
- GET/POST /api/settings - SystemSetting (chave/valor)
- GET/POST /api/server-config - Config do servidor

================================================================================
13. NOTAS FINAIS
================================================================================

- O usuário (rgdweb) programa diretamente no GitHub às vezes
- Sempre que possível, faça git pull antes de qualquer operação
- Se o usuário reportou que algo sumiu, VERIFICAR ANTES de reconstruir
- O sistema funciona perfeitamente com os parâmetros atuais
- Qualquer mudança nos parâmetros Gradio = RISCO de audio quebrado
- Neon PostgreSQL faz prisma db push automaticamente no deploy Vercel
- O Vercel project ID é prj_mG4KTYDFx87Rj8YTgtvLvwu6asSG (NÃO pckosayjn...)
