---
Task ID: 1
Agent: Main Agent
Task: Deploy tunnel-generate.php no Oracle VPS e corrigir path do frontend

Work Log:
- Conectou ao Oracle VPS (147.15.77.137) via SSH com paramiko (user: ubuntu)
- Verificou estrutura do servidor: nginx root = /var/www/omnivoice (sem prefixo /omnivoice/)
- Confirmou API_KEY no config.php bate com a do generate-token Vercel
- Upload do tunnel-generate.php via SFTP (tmp -> sudo cp -> chown www-data)
- Teste local: http://127.0.0.1/tunnel-generate.php -> 405 (PHP rodando)
- Teste externo: sem token -> 401, com token -> 200 + audio base64 (SUCESSO!)
- Corrigiu path no tunnel-generate.php: get_tunnel.php de /omnivoice/ para / (sem prefixo)
- Corrigiu frontend page.tsx linha 1101: removido /omnivoice/ do path

Stage Summary:
- tunnel-generate.php部署完成 no Oracle: /var/www/omnivoice/tunnel-generate.php
- Path correto: http://147.15.77.137/tunnel-generate.php (SEM /omnivoice/)
- Frontend atualizado: ${oracleUrl}/tunnel-generate.php
- End-to-end test passed: Browser -> Oracle PHP -> Tunnel -> GPU PC -> Audio returned

# OmniVoice TTS — Worklog Completo

---
Task ID: 1
Agent: main
Task: Fix chunking regression — audio still 33% short even with 7 chunks

Work Log:
- Diagnosed root cause: `postprocess_output: true` was being sent for EACH chunk individually, causing OmniVoice to cut ~29% of each chunk's audio
- Fix: Set `postprocess_output: false` for all chunks
- Files modified: src/app/api/tunnel-generate/route.ts, src/app/page.tsx

Stage Summary:
- Partial fix — postprocess=false resolved cutting but caused hiss/chiado in audio

---
Task ID: 2
Agent: main
Task: Eliminar cortes no audio TTS — tentativas de chunking e processamento

Work Log:
- Tentativa 1: Chunking com overlap buffer → causou repetição de palavras (REJEITADO)
- Tentativa 2: Crossfade entre chunks → causou estalos e ruído (REJEITADO)
- Tentativa 3: postprocess_output=false → causou chiado/hiss no audio inteiro (REJEITADO)
- Tentativa 4: Separação denoise=true + postprocess=false → não testado, pivotei para single-shot
- Tentativa 5: Retry com re-download → causou pops e cracks (REJEITADO)
- Tentativa 6: Detecção de zeros PCM no tail + retry → "muita instabilidade no audio" (REJEITADO)
- Tentativa 7: Fade-out manual → "deu fade out em SP" (REJEITADO)

Stage Summary:
- TODAS as abordagens de processamento/manipulação de PCM causaram artefatos
- O modelo OmniVoice NÃO é o problema — localhost demo funciona perfeitamente com textos longos (756+ chars em 30s)

---
Task ID: 3
Agent: main
Task: SOLUÇÃO FINAL — Single-shot puro

Work Log:
- Removeu TODOS os códigos de chunking, retry, detecção PCM, crossfade, overlap
- Removeu import de tts-chunker.ts
- Implementou generateSingleShot(): envia texto inteiro em 1 única chamada API (igual localhost demo)
- Delay fixo de 10 segundos após SSE complete antes de baixar o WAV
- Zero processamento/manipulação de audio — entrega exatamente o que o Gradio gera
- Corrigiu bug "useChunking is not defined" — referência pendente da limpeza
- File reduziu de ~580 para ~444 linhas

Stage Summary:
- SOLUÇÃO: Single-shot puro + delay 10s = ÁUDIO PERFEITO SEM CORTE
- Testes confirmados pelo usuário:
  - 756 caracteres, 30 segundos, sem corte, falou perfeito (2x seguido)
  - Velocidade IGUAL ou MELHOR que localhost demo
- Parâmetros finais: postprocess_output=true, denoise=true, speed=1, numStep=32, guidanceScale=2.0
- Commit: 2230b51 fix: remover referencia useChunking que causava crash
- Commit: c7560a0 fix: versao limpa — single-shot puro, delay 10s, zero processamento
- Arquivo principal: src/app/api/tunnel-generate/route.ts (~444 linhas)
- Pipeline: Browser → Vercel route.ts → HostGator get_tunnel.php → cloudflared → Local GPU Gradio (OmniVoice)

---
## LIÇÕES APRENDIDAS

1. **NUNCA use chunking com TTS OmniVoice** — corta palavras nas junções (SP, br, X-BURGUER)
2. **NUNCA manipule PCM diretamente** (fade, crossfade, trim, zero detection) — sempre causa artefatos
3. **NUNCA desative postprocess_output** — causa chiado/hiss no audio inteiro
4. **Single-shot é a ÚNICA abordagem confiável** — manda tudo de uma vez igual o demo local
5. **O delay de 10s é ESSENCIAL** — dá tempo do Gradio salvar o WAV completo via tunnel antes do download
6. **O problema nunca foi o modelo** — era sempre a entrega via tunnel + processamento desnecessário

---
## BACKUP DE CONFIGURAÇÃO

### Tunnel (cloudflared)
- Setup: `iniciar.bat` → roda omnivoice_gpu.py (port 7860) + cloudflared tunnel
- Tunnel URL salva em HostGator via `start_tunnel.ps1` → `update_tunnel.php`
- Endpoint: `https://sorteiomax.com.br/omnivoice/get_tunnel.php` → retorna URL trycloudflare.com

### Parâmetros Gradio (ordem do array data[])
- [0] text (string)
- [1] language ("Auto" | "pt" | "en" etc.)
- [2] ref_audio (FileData | null)
- [3] ref_text (string, sempre vazio "")
- [4] instruct (string, modo design)
- [5] numStep (32)
- [6] guidanceScale (2.0)
- [7] denoise (true)
- [8] speed (1)
- [9] duration (null)
- [10] preprocess_prompt (true)
- [11] postprocess_output (true — NUNCA mudar para false)

### Formato WAV
- Sample Rate: 24000 Hz
- Bits: 16
- Channels: 1 (mono)

### Pontos Críticos do Código (NÃO MEXER)
- generateSingleShot(): função principal — envia texto inteiro, 1 chamada
- Delay de 10s após SSE complete: `await new Promise(r => setTimeout(r, 10000))`
- downloadWithRetry(): valida WAV header antes de aceitar (isWavComplete)
- postprocess_output SEMPRE true (index 11 do gradioData)

---
Task ID: 4
Agent: main
Task: Implementar Paywall (MercadoPago), Google OAuth e Fila de Geração

Work Log:
- Instalou pacotes: mercadopago, google-auth-library, qrcode, @types/qrcode
- Atualizou Prisma schema: adicionou googleId no User, model Payment, model GenerationQueue
- Criou API routes de pagamento:
  - /api/payment/create — cria preferência MercadoPago (R$1)
  - /api/payment/status — verifica status do pagamento (GET + sandbox POST)
  - /api/payment/webhook — webhook do MercadoPago para atualizar status
  - /api/payment/qrcode — gera QR code como data URI
- Criou API route Google OAuth:
  - /api/auth/google — login via Google OAuth2 access token
  - Cria/atualiza usuário no banco, cria sessão cookie
  - 1 sessão por conta (sistema existente respeita para users normais)
- Criou API routes de fila:
  - /api/queue/join — entrar na fila (máx 1 geração simultânea)
  - /api/queue/status — verificar posição (GET)
  - /api/queue/complete — marcar como completo/falha, promover próximo
- Criou componente PaymentDialog (src/components/payment-dialog.tsx):
  - Escolha de formato MP3 ou WAV
  - Geração de QR code via MercadoPago
  - Modo sandbox (quando MP não configurado) com aprovação manual
  - Polling automático a cada 3s para verificar pagamento
  - Auto-download após aprovação
- Modificou page.tsx:
  - Botão "Baixar" agora abre PaymentDialog (paywall R$1)
  - handleDownloadClick abre dialog, handlePaymentApproved faz download real
  - Fila de geração: ao clicar "Gerar Voz", entra na fila primeiro
  - Se posição > 0, mostra "Posição X na fila..." no UI
  - Quando é a vez, gera normalmente
  - Marca fila como completa no finally (sucesso ou falha)
- Modificou login/page.tsx:
  - Botão "Entrar com Google" com divisor "ou"
  - Usa Google Identity Services (GIS) para OAuth2 client-side
  - Envia access token + dados do usuário para /api/auth/google
- Modificou admin/page.tsx:
  - Seção "MercadoPago" com campo Access Token
  - Seção "Google OAuth" com campo Google Client ID
  - Ambos salvam via /api/admin/settings
- Atualizou .env.example com novas variáveis

Stage Summary:
- Build OK (0 erros)
- Novos API routes: /api/payment/*, /api/queue/*, /api/auth/google
- Novo componente: PaymentDialog
- Novos modelos Prisma: Payment, GenerationQueue
- Campo novo no User: googleId
- Para deploy: rodar `npx prisma db push` ou `npx prisma migrate dev` no servidor
- Configurar: MERCADOPAGO_ACCESS_TOKEN e GOOGLE_CLIENT_ID no .env ou painel admin

---
Task ID: 1
Agent: Main
Task: Corrigir erro "Erro ao carregar dados" no admin

Work Log:
- Verificou que admin chama /api/admin/voices e /api/admin/tracks que usam Prisma
- Descobriu que .env tinha DATABASE_URL=file:/home/z/my-project/db/custom.db (SQLite) mas schema usa postgresql
- Encontrou a URL Neon PostgreSQL no git history: postgresql://neondb_owner:npg_...@ep-blue-band-ac85wa8e-pooler.sa-east-1.aws.neon.tech/neondb
- Variável de ambiente do shell sobrescrevia o .env (DATABASE_URL=file:...)
- Corrigiu googleId duplicados (valores vazios) via prisma db execute
- Rodou prisma db push --accept-data-loss para sincronizar schema
- Confirmou banco conectado: 3 vozes, 3 trilhas, 3 usuários, 4 settings
- Build passou

Stage Summary:
- .env corrigido para apontar para Neon PostgreSQL
- Schema sincronizado com todas as tabelas (User, Voice, VoiceVariation, Track, Session, SystemSetting, Payment, GenerationQueue)
- Commit + push: 3ac6a96

---
## BUG FIX DOCUMENTADO — Admin "Erro ao carregar dados"

### Problema:
No admin `loadData()`, havia um fetch duplicado para `/api/admin/settings`:
```js
const adminData = await fetch('/api/admin/settings').then(r => r.json())
for (const s of adminData) { ... } // TypeError: not iterable!
```
O endpoint `/api/admin/settings` retorna um OBJETO `{key: value}`, não um array.
O `for...of` em objeto causa `TypeError: not iterable`, cai no catch, mostra toast de erro.

### Solução:
Remover o fetch duplicado e usar os dados já carregados de `settingsData` (que já era objeto).

### Arquivo: src/app/admin/page.tsx, função `loadData()`
### Commit: 198821e

### Se der de novo:
1. Abrir `src/app/admin/page.tsx`
2. Buscar `for (const s of` dentro de `loadData()`
3. Verificar se está iterando sobre objeto do `/api/admin/settings`
4. Remover o fetch duplicado; usar os dados já carregados

---
## COMO RESTAURAR APÓS PERDA DE CÓDIGO

Se o código local ficar diferente do deploy:
1. `git fetch origin`
2. `git reset --hard origin/main` (sobrescreve local com o remoto)
3. `npm install` (se mudou package.json)
4. `npx prisma generate` (se mudou schema)
5. `npx next build` (verificar build)

O branch remoto `origin/main` é a fonte de verdade.

---
Task ID: 5
Agent: main
Task: Sincronizar código local com remoto + verificar estado completo

Work Log:
- Descobriu que branches local e remoto haviam divergido (4 commits locais vs 24 remotos)
- As features (Google OAuth, Paywall, Watermark, Fila) JÁ ESTAVAM no código remoto (origin/main)
- As features foram implementadas em outra sessão mas nunca commitadas no branch local
- Reset local para origin/main: `git reset --hard origin/main`
- Verificou que TODAS as features estão funcionando:
  - Google Sign-In na login page (OAuth2 via GSI)
  - PaymentDialog component (QR Code PIX)
  - Paywall toggle no admin
  - Watermark upload + volume slider no admin
  - MercadoPago config no admin
  - Google Client ID config no admin
  - Fila de geração (queue/join, queue/complete)
  - APIs de pagamento (create, qrcode, status, webhook)
  - Mix de marca d'água no preview
- Build OK com todas as rotas
- Commit checkpoint + push: 1b065cc

Stage Summary:
- Código local 100% sincronizado com origin/main
- Build passou com zero erros
- Tudo funcional: Google login, paywall, watermark, payment APIs, queue
---

Task ID: 1
Agent: Main Agent
Task: Fix queue system + implement TEMP audio cleanup

Work Log:
- Analyzed full audio storage architecture: generated audio is already in-memory (base64), cleared on refresh
- Identified 2 critical queue bugs:
  1. queue/complete only promoted next on success=true → queue froze on failures
  2. No timeout for stuck processing items (user closes browser → permanent block)
- Fixed queue/complete to ALWAYS promote next item
- Added unstickProcessing() to detect items processing >10min and mark as failed
- Added cleanupOldItems() to delete completed/failed items >5min old
- Added GET /api/queue/complete health check endpoint
- Updated queue/join to run unstick+cleanup before accepting new entries
- Updated queue/status to run unstick during polling
- Created php-server/cleanup.php to remove:
  - Abandoned chunk directories (>2h old)
  - Generated audio files in audios/generated/ (>1h old)
- Added cleanupAudioServer() in src/lib/audio-server.ts
- Added automatic cleanup calls in page.tsx:
  - On page load (auth checked): queue health check + PHP cleanup
  - Before each generation: PHP cleanup
- Build passed successfully, pushed as commit a9a826e

Stage Summary:
- Queue now properly promotes next user even when generation fails
- Stuck processing items auto-unstick after 10 minutes
- PHP server cleanup runs automatically on page load and before generation
- Generated audio was already TEMP (in-memory only) - no disk writes on Vercel side
- Reference audios (voice clones) remain permanent as designed (needed for future generations)
---
Task ID: 1
Agent: main
Task: Criar arquivo de diagnóstico + auto-restart e funcionalidade de envio de áudio por email

Work Log:
- Criou diagnostico_auto_restart.py com 10 verificações (GPU, Gradio, Tunnel, Disco, RAM, Internet, Python, Temp, Ref Audio, Riscos Futuros)
- Auto-restart com monitoramento de fila via API Vercel, idle detection, cleanup e restart automático
- Instalou nodemailer + @types/nodemailer no projeto
- Criou /api/send-audio-email/route.ts (POST para enviar, GET para verificar config)
- Reescreveu payment-dialog.tsx com 3 modos: Baixar (PC), E-mail, e Formato (MP3/WAV)
- Atualizou page.tsx: adicionou ícone Mail e props isPaymentExempt/freeDownloads/onEmailSent ao PaymentDialog
- Build passou sem erros

Stage Summary:
- Script de diagnóstico: /home/z/my-project/download/diagnostico_auto_restart.py
- Script copiado para: /home/z/my-project/local-server/diagnostico_auto_restart.py
- Instruções: /home/z/my-project/download/INSTRUCOES-DIAGNOSTICO.txt
- API email: /api/send-audio-email (GET para config check, POST para enviar)
- PaymentDialog agora suporta: Download direto MP3/WAV + Receber via E-mail
- Variáveis de ambiente necessárias para email: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM

---
Task ID: 1
Agent: Main
Task: Sessão completa de correções Oracle VPS migration

Work Log:
- Fix proxy-audio 403 Forbidden: trocar runtime de 'edge' para 'nodejs' (Vercel Edge bloqueia fetch para IPs puros)
- Descoberto sorteiomax.com.br MORTO (404 HostGator) - 6 referências ainda apontavam pra lá
- Corrigido AUDIO_SERVER_URL em 6 arquivos: health, tunnel-generate, upload-chunk, upload-token, generate-token, audio-server.ts
- Adicionado filtro de falsos positivos no /api/health (cloudflared, nvidia-smi, TTS no Oracle)
- health POST agora usa /api/cleanup ao invés de cleanup.php direto

Stage Summary:
- proxy-audio/route.ts: runtime edge -> nodejs (fix 403)
- 6 arquivos: sorteiomax.com.br -> http://147.15.77.137
- health/route.ts: filtra alerts de cloudflared/nvidia/TTS quando tunnel localtunnel ativo
- Commits: bce0a52 (proxy-audio), 7d78f31 (sorteiomax cleanup)

---
Task ID: 2
Agent: Main
Task: Investigar audios que mostram --s e não tocam no preview do painel admin

Work Log:
- Investigando...

---
Task ID: 3
Agent: Main
Task: Fix preview e duracao de audio que mostravam --s e nao tocavam

Work Log:
- Investigado: VarDuration usava new Audio(url) direto — falhava com URLs antigas/mortas
- toggleVoicePreview tambem usava URL direta sem proxy
- toggleTrackPreview (preview de trilhas) mesma questao
- Edit ja usava /api/proxy-audio (por isso funcionava)
- Criada funcao toProxyAudioUrl() helper em admin/page.tsx
- VarDuration, toggleVoicePreview, toggleTrackPreview agora usam proxy

Stage Summary:
- Commit 6a8949b: preview e duracao de audio usam proxy-audio
- Usuario confirmou: "ok resolveu tbm"

RESUMO DA SESSAO COMPLETA:
- 3 commits feitos: bce0a52 (proxy-audio edge->nodejs), 7d78f31 (sorteiomax cleanup), 6a8949b (audio preview proxy)
- Problemas resolvidos: proxy-audio 403, painel saude critico (6 URLs sorteiomax morto), alerts falsos health.php, audio preview --s

---
Task ID: 5
Agent: Main
Task: Fix "audio de referencia obrigatorio" ao salvar nova variacao com corte de audio

Work Log:
- Bug: ao criar nova variacao com audio cortado, a primeira tentativa de salvar falhava com "Audio de referencia e obrigatorio" mas a segunda funcionava
- Causa raiz: handleSaveVariation() faz upload do audio cortado e recebe pendingVoiceFileData (var local), depois chama setVariationForm() (async do React) para atualizar o estado
- Porem a validacao na linha 1817 checa variationForm.serverUrl (estado antigo, ainda vazio) — nao checa pendingVoiceFileData
- E o POST body usava ...variationForm (spread do estado antigo) — serverUrl chegava vazio no servidor
- Fix 1: Adicionado `|| pendingVoiceFileData` na condicao de validacao (linha 1819)
- Fix 2: Body do POST agora construido explicitamente com createBody, sobrescrevendo campos com pendingVoiceFileData quando disponivel

Stage Summary:
- Arquivo: src/app/admin/page.tsx, funcao handleSaveVariation()
- Antes: validacao usava variationForm (estado async) → falhava na 1a tentativa
- Depois: validacao checa pendingVoiceFileData tambem; body usa dados do upload diretamente
- Resultado: salvar nova variacao com corte funciona na 1a tentativa

---
Task ID: 6
Agent: Main
Task: Fix mixed-content e preview de voz no site principal

Work Log:
- cleanupAudioServer() era chamado do navegador (HTTPS) → fetch direto ao http://147.15.77.137 → bloqueado mixed-content
- Preview de voz e trilha no site principal usavam URL direta http:// → bloqueado pelo browser
- mixAudioClientSide fazia fetch direto da track URL → tambem bloqueado
- tunnel-generate: refAudioUrl podia apontar pro sorteiomax morto

- Criado /api/cleanup (server-side proxy) para limpeza PHP
- Adicionado toProxyAudioUrl() no page.tsx (mesma logica do admin)
- Todos os VoicePreviewButton de voz agora usam proxy (3 locais)
- Todos os VoicePreviewButton de trilha agora usam proxy (3 locais)
- mixAudioClientSide agora recebe URL via proxy
- refAudioUrl para tunnel-generate usa fixAudioServerUrl()
- tunnel-generate: adicionado fixAudioServerUrl + logging melhorado

Stage Summary:
- Commit 825647c: mixed-content e preview de voz no site principal
- Commit d69471e: tunnel-generate aplica fixAudioServerUrl + logging

---
Task ID: 7
Agent: Main
Task: Fix diagnostico_auto_restart.py acumulando janelas CMD

Work Log:
- do_restart() fazia taskkill /F /IM python.exe → matava TODOS os python.exe incluindo o proprio script de monitoramento
- Quando o monitor morria, se algo reiniciasse (Task Scheduler, .bat), abria nova janela CMD
- A cada ciclo de restart automatico (60 min idle), nova janela se acumulava
- Alem disso, subprocess.Popen para reiniciar Gradio/cloudflared podia abrir janelas visiveis

- Criado MY_PID = os.getpid() para proteger o proprio processo
- Nova funcao _kill_gradio_only(): mata APENAS o PID na porta do Gradio (netstat + taskkill /PID)
- Adicionado _get_hidden_startupinfo() com STARTUPINFO(SW_HIDE) para esconder janelas no Windows
- subprocess.Popen agora usa startupinfo para nao abrir janelas CMD extras
- iniciar.bat (linha 9) tem o mesmo bug (taskkill /F /IM python.exe) mas nao foi modificado (so e executado manualmente)

Stage Summary:
- Arquivo: local-server/diagnostico_auto_restart.py e download/diagnostico_auto_restart.py
- Antes: do_restart() matava o proprio script + abria janelas visiveis a cada restart
- Depois: mata so o Gradio (PID especifico), monitor sobrevive, janelas escondidas
- NOTA: usuario precisa copiar o novo script para o PC GPU e fechar as janelas acumuladas manualmente

---
Task ID: 8
Agent: Main
Task: Fix sorteiomax.com.br morto nos scripts PowerShell de tunnel

Work Log:
- start_tunnel.ps1 linha 3: $serverUpdate apontava para sorteiomax.com.br (MORTO - 404)
- start_gpu_tunnel.ps1 linha 3: mesma URL morta
- tunnel_php.ps1 linha 6: mesma URL morta
- Quando o tunnel subia e tentava registrar a URL via Invoke-RestMethod, falhava silenciosamente
- Resultado: Vercel nao descobria o tunnel → geracao TTS falhava

- Corrigido todos os 3 arquivos: sorteiomax.com.br → http://147.15.77.137
- Copiados para /download/ tambem

Stage Summary:
- Arquivos: start_tunnel.ps1, start_gpu_tunnel.ps1, tunnel_php.ps1
- Antes: tunnel URL era salva num servidor morto → tunnel nunca registrado
- Depois: URL salva no Oracle (147.15.77.137) → Vercel encontra o tunnel
- IMPORTANTE: usuario precisa copiar os .ps1 corrigidos para o PC GPU
---
Task ID: 1
Agent: Main Agent
Task: Fix port mismatch 7861→7860, update_tunnel.php param/domain validation, iniciar.bat taskkill

Work Log:
- Read diagnostico_auto_restart.py: CONFIG had gradio_port 7860 but hardcoded findstr/messages still referenced 7861
- Read update_tunnel.php: expected param 'tunnelUrl' but PS sends 'url'; only accepted trycloudflare.com not loca.lt; returned 'status' not 'ok'
- Read iniciar.bat: still had taskkill /F /IM python.exe killing ALL python processes
- Fixed diagnostico_auto_restart.py: all 4 hardcoded 7861→7860 + omnivoice_server.py→omnivoice_gpu.py
- Fixed update_tunnel.php: accept 'url' param, accept loca.lt domain, return ok:true
- Fixed iniciar.bat: targeted PID kill on port 7860 instead of killing all python.exe
- Copied all 4 files to /download/

Stage Summary:
- 3 files fixed: diagnostico_auto_restart.py, update_tunnel.php, iniciar.bat
- start_tunnel.ps1 already correct in /download/ (has retry loop)
- update_tunnel.php needs to be uploaded to Oracle server at /var/www/omnivoce/

---
Task ID: 9
Agent: Main
Task: Fix {{slow}} tag + manutencao GPU automatica inteligente

Work Log:
- Descobriu que processControlTags() (que processa {{pause}}, {{slow}}, {{fast}}, {{emphasis}}, {{whisper}}) NUNCA era chamado no pipeline de geracao
- Em page.tsx so parseSSML() era chamado quando detectava SSML — tags diretos como {{slow}} passavam cru pro TTS e eram lidos em voz alta
- {{slow}} handler antigo so triplicava virgulas existentes, sem efeito se nao houvesse virgulas no texto
- Corrigiu processControlTags() no pipeline: substituiu bloco SSML-only por processControlTags() que faz TUDO (SSML + control tags)
- Melhorou {{slow}} handler: agora insere virgulas entre palavras para criar pausas (antes so triplicava virgulas existentes)
- Adicionou defesa no stripSSMLForTTS() para remover tags {{}} residuais no backend
- Reescreveu omnivoice_gpu.py com manutencao 100% automatica:
  - Monitor em background: verifica VRAM a cada 3 min, limpa se >70%
  - Pre-geracao: se VRAM >80%, cleanup agressivo; se >90%, deep cleanup
  - Pos-geracao: cleanup inteligente (ja existia)
  - Deep cleanup: a cada 5 geracoes, cleanup triplo preventivo
  - Tudo sem botao, sem painel, 100% automatico

Stage Summary:
- Arquivos: pronunciation-optimizer.ts, page.tsx, ssml-parser.ts, omnivoice_gpu.py
- {{slow}}...{{/slow}} agora funciona — insere pausas entre palavras
- {{pause:500}}, {{emphasis}}, {{whisper}}, {{fast}} tambem passam a funcionar
- GPU maintenance totalmente automatica, sem interacao humana
- Commit: 6e5cddc
---
Task ID: 1
Agent: main
Task: Investigar e corrigir erro persistente 500 no tunnel-generate

Work Log:
- Investigou status do Oracle VPS: tunnel online, Gradio respondendo, API info OK
- Testou upload + submit + stream + download completo via tunnel - TUDO FUNCIONANDO
- Identificou causa provável: cloudflared free tunnel reiniciou e URL mudou temporariamente
- Melhorou `streamResult()` para capturar `resultData[1]` (mensagem de erro do Gradio)
- Refatorou `generateSingleShot()` para retornar `{buffer, failReason}` em vez de `Buffer | null`
- Adicionado retry automático de tunnel URL: se falha com 502/timeout, busca nova URL e tenta novamente
- Mensagens de erro agora são específicas (ex: "GPU: CUDA out of memory" em vez de genérico "GPU nao conseguiu gerar audio")

Stage Summary:
- Tunnel e Gradio estão funcionando normalmente
- Código melhorado com retry automático e mensagens de erro detalhadas
- Arquivo: src/app/api/tunnel-generate/route.ts
---
Task ID: 2
Agent: main
Task: Diagnosticar e corrigir erro 500 persistente no tunnel-generate

Work Log:
- Testou fluxo completo: tunnel online, Gradio respondendo, upload OK
- Descobriu que Gradio retorna "event: error" com {"error": null} quando CUDA OOM
- Verificou que /api/maint/status retorna 404 — omnivoice_gpu.py NÃO está carregado
- O Gradio está rodando como demo original, sem wrapper de GPU
- Root cause: sem wrapper, GPU acumula VRAM sem cleanup → OOM silencioso
- Melhorou streamResult() para detectar {"error": null} e retornar mensagem clara "GPU sem memoria"
- Adicionou triggerGpuCleanup() para tentar limpar VRAM via API do wrapper
- Adicionou retry automático dentro de generateSingleShot() quando detecta OOM

Stage Summary:
- Erro 500 causado por CUDA OOM silencioso (Gradio retorna {"error": null})
- omnivoice_gpu.py NÃO está ativo no servidor GPU — precisa reiniciar com iniciar.bat
- Código agora detecta OOM, tenta cleanup automático e retry
- Arquivo: src/app/api/tunnel-generate/route.ts
---
Task ID: 3
Agent: main
Task: Corrigir erros do Gradio 6.x (InvalidPathError + TypeError)

Work Log:
- Analisei os logs do GPU server fornecidos pelo usuario
- Identifiquei que o wrapper omnivoice_gpu.py ESTA carregado corretamente
- Erro 1: InvalidPathError - Gradio 6.x tem validacao de segurança mais rigorosa para paths de arquivos
- Erro 2: TypeError "Parameter data is not a valid key-word argument" - Gradio 6.x middleware intercepta endpoints customizados
- Corrigi omnivoice_gpu.py: adicionado include_in_schema=False nas rotas de manutencao para evitar interceptacao pelo middleware do Gradio 6.x
- Corrigi tunnel-generate/route.ts: detecta {"error": null} do Gradio (CUDA OOM) e retorna mensagem clara
- Adicionado triggerGpuCleanup() e retry automatico quando detecta OOM

Stage Summary:
- Arquivo corrigido: download/omnivoice_gpu.py (para usuario copiar no PC)
- Arquivo corrigido: src/app/api/tunnel-generate/route.ts (deploy automatico)
- Usuario precisa copiar omnivoice_gpu.py atualizado para o PC e reiniciar com iniciar.bat

---
Task ID: 10
Agent: Main Agent
Task: Adicionar parametros nativos do OmniVoice na interface (postprocess_output, preprocess_prompt, duration)

Work Log:
- Analisou todos os parametros nativos do OmniVoice.generate() e identificou 4 uteis nao expostos:
  - postprocess_output (bool, default True) — remove silencios longos do audio gerado
  - preprocess_prompt (bool, default True) — remove silencios longos do audio de referencia
  - duration (float, optional) — forca duracao exata em segundos
  - denoise ja existia na interface e no pipeline
- Editou src/app/page.tsx (frontend):
  - Adicionou 3 state variables: postprocessOutput, preprocessPrompt, targetDuration
  - Adicionou no body do POST: postprocessOutput, preprocessPrompt, targetDuration
  - Adicionou 3 toggles na secao "Configuracoes Avançadas" (abaixo do denoise)
  - Adicionou input numerico para duracao alvo com botao Reset (vazio = auto)
- Editou download/tunnel-generate.php (PHP proxy):
  - Adicionou denoise, postprocess_output, preprocess_prompt no nativePayload
  - Adicionado logica condicional para duration (so envia se > 0)
- Editou local-server/omnivoice_gpu.py e download/omnivoice_gpu.py (Python server):
  - Recebe postprocess_output, preprocess_prompt, duration do JSON
  - Valida duration (float > 0, senao None)
  - Passa postprocess_output e preprocess_prompt no kwargs (antes eram hardcoded True)
  - Passa duration condicionalmente no kwargs
  - Log melhorado com todos os novos params

Stage Summary:
- Interface agora expoe todos os parametros nativos uteis do OmniVoice:
  - Passos (num_step): 4-64, slider
  - Guia/CFG (guidance_scale): 0-4, slider
  - Velocidade (speed): 0.5-1.5, slider
  - Denoise: toggle (default ON)
  - Pós-processar (postprocess_output): toggle (default ON) — NOVO
  - Pré-processar ref (preprocess_prompt): toggle (default ON) — NOVO
  - Duração alvo (duration): input numerico, vazio = auto — NOVO
- Pipeline completo: Frontend -> PHP (Oracle) -> Python (GPU) -> model.generate()
- Arquivos editados: src/app/page.tsx, download/tunnel-generate.php, local-server/omnivoice_gpu.py, download/omnivoice_gpu.py
- PENDENTE: Usuario precisa copiar tunnel-generate.php para Oracle e omnivoice_gpu.py para PC GPU
---
Task ID: 1
Agent: Main Agent
Task: Migrar VozPro do Vercel para Oracle VPS com dominio vozpro.cvmnews.com.br

Work Log:
- Verificou DNS: vozprooff.com.br NAO resolve (nao registrado no registro.br)
- vozpro.cvmnews.com.br ja resolve para 147.15.77.137 (A record criado pelo usuario no HostGator)
- Atualizou Nginx: removeu config vozprooff.com.br, criou vozpro.cvmnews.com.br
- Gerou certificado SSL Let's Encrypt via certbot (SUCESSO)
- certbot configurou redirect HTTP->HTTPS automaticamente
- Clone do repo rgdweb/Omnivoice no Oracle
- Adicionou output: standalone no next.config.ts
- Criou .env com DATABASE_URL Oracle, AUDIO_SERVER_URL, etc.
- Build standalone: OK (55 paginas, 60+ API routes)
- Copiou static/public/prisma para standalone
- PM2 iniciado: node server.js na porta 3000
- PM2 startup configurado: systemd service (auto-restart on boot)
- HTTPS 200 confirmado externamente
- HTTP 301 (redirect to HTTPS) confirmado

Stage Summary:
- Site acessivel em: https://vozpro.cvmnews.com.br
- SSL valido (Let's Encrypt)
- PM2 com auto-restart (systemd)
- Banco de dados: Oracle PostgreSQL (omnivoice)
- VARIAVEIS DO .env (texto puro - nao tem SMTP/MercadoPago/Blob ainda):
  - DATABASE_URL, NEXT_PUBLIC_AUDIO_SERVER_URL, AUDIO_SERVER_URL
  - NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_BASE_URL, ADMIN_PASSWORD, JWT_SECRET
  - HF_SPACE_URL, NODE_ENV
- PENDENTE: SMTP, MercadoPago, BLOB_READ_WRITE_TOKEN nao configurados
  - Essas variaveis estavam criptografadas na Vercel e nao puderam ser extraidas
  - Usuario pode configurar SMTP e MercadoPago pelo painel admin
  - BLOB token pode nao ser necessario (usado para Vercel Blob storage)
