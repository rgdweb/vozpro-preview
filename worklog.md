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
