# PROMPT MASTER - CRIAR SISTEMA DE CLONAGEM DE VOZ TTS

> Copie o texto abaixo e cole na outra IA. Este prompt foi construído para que a IA entenda 100% o sistema e consiga recriá-lo do zero ou melhorá-lo.

---

## PROMPT:

```
Crie um sistema web completo de clonagem de voz (TTS - Text-to-Speech) com as seguintes características:

## O QUE É O SISTEMA
Um aplicativo web comercial onde o usuário seleciona uma voz cadastrada, digita um texto, e o sistema gera um áudio com a voz clonada. Opcionalmente, permite misturar a voz gerada com uma trilha musical de fundo. Inclui painel administrativo para gerenciar vozes, variações e trilhas.

## ARQUITETURA (3 camadas)

### Camada 1 - Frontend (Next.js)
- Next.js + React + TypeScript + Tailwind CSS + shadcn/ui
- Página principal: seletor de voz, variação, campo de texto, botão gerar, player de áudio, download
- Painel admin: CRUD de vozes, variações de voz, trilhas musicais
- Mixagem client-side: Web Audio API (OfflineAudioContext + GainNode) para misturar voz + trilha
- Upload de trilhas com processamento no navegador: trim 80s + re-encode MP3 via lamejs (CDN)

### Camada 2 - Backend (PHP no hosting)
- PHP hospedado em servidor compartilhado (HostGator ou similar)
- Arquivos: config.php, generate.php, upload.php, delete.php, update_tunnel.php, trim_audio.py
- CORS habilitado, timeout de 600s, upload max 50MB
- Recebe uploads de áudio, serve arquivos estáticos, e ORQUESTRA a geração TTS

### Camada 3 - GPU Local (VozPro)
- Modelo VozPro (k2-fsa/omnivoice) rodando em GPU NVIDIA (RTX 3060 12GB)
- Servidor Gradio na porta 7860 com endpoint _clone_fn
- Exposto na internet via localtunnel (npx localtunnel --port 7860)
- URL do tunnel atualizada automaticamente no PHP server

## FLUXO PRINCIPAL DE GERAÇÃO DE VOZ (o mais importante)

1. Usuário seleciona voz + variação + digita texto no frontend
2. Frontend faz POST DIRETO do browser para o PHP server (bypassa timeout de 60s do Vercel/Netlify)
3. PHP generate.php processa:
   a. Valida token HMAC de autenticação
   b. Baixa o áudio de referência do servidor PHP
   c. Executa trim_audio.py para cortar o áudio para max 10 segundos (evita CUDA Out of Memory na GPU 12GB)
   d. Faz upload do áudio cortado para o servidor VozPro (GPU) via POST /gradio_api/upload
   e. Envia job de geração via POST /gradio_api/call/_clone_fn com JSON contendo 12 parâmetros
   f. Abre conexão SSE (Server-Sent Events) via GET /gradio_api/call/_clone_fn/{event_id} e aguarda resultado
   g. Recebe evento "complete" com URL do áudio gerado
   h. Baixa o áudio gerado, converte para base64, retorna como data URI
4. Frontend reproduz o áudio e opcionalmente mistura com trilha musical via Web Audio API

## API Gradio do VozPro (endpoint _clone_fn)

POST /gradio_api/call/_clone_fn
Body: {"data": [
  texto,           // string - texto para sintetizar
  idioma,          // string - "Auto", "Portuguese", "English", etc
  {FileData},      // objeto - audio de referência (path no Gradio, nome, mime_type, meta._type="gradio.FileData")
  refText,         // string - transcrição exata do audio de referência
  instruct,        // string - instruções: "whisper", "male", "female", etc
  numStep,         // int - passos de difusão (4-64, padrão 32)
  guidanceScale,   // float - escala de guiamento (0-4, padrão 2.0)
  denoise,         // bool - aplicar denoise (true)
  speed,           // float - velocidade (0.5-1.5, padrão 1.0)
  duration,        // float/null - duração forçada (null=auto)
  preprocess,      // bool - pré-processamento do texto (true)
  postprocess      // bool - pós-processamento do áudio (true)
]}
Response: {"event_id": "uuid-xxxx"}

GET /gradio_api/call/_clone_fn/{event_id}
Accept: text/event-stream
Resposta (streaming):
  event: heartbeat (mantém conexão viva)
  event: complete → data: [{"url":"/gradio_api/file=/tmp/xxx/output.wav",...}, null]

## BANCO DE DADOS (PostgreSQL + Prisma)

3 tabelas:

1. Voice (vozes): id, name, description, gender, age, accent, pitch, order, active
2. VoiceVariation (variações): id, voiceId(FK), label, emoji, refAudioServerUrl(URL permanente no PHP), refAudioFilename, refText(transcrição), instruct, order, active
3. Track (trilhas): id, name, description, emoji, audioPath(URL no PHP), duration(segundos), order, active

## UPLOAD DE ÁUDIOS

Audio de referência (vozes): Upload sem processamento via proxy (frontend → Vercel → PHP). Salvo em audios/ref/.
Trilha musical: Processado no navegador antes de enviar - trim 80s via OfflineAudioContext, re-encode MP3 192kbps via lamejs CDN, max ~1.9MB. Salvo em audios/track/.

## TRIM DE ÁUDIO (trim_audio.py)

Script Python puro (SEM ffmpeg) que corta WAV e MP3:
- WAV: usa módulo wave nativo, lê N frames = max_seconds * framerate
- MP3: parsing de frame headers MPEG Layer III, calcula duração por frames (1152 samples/frame), corta quando duration >= max_seconds
- Uso: python3 trim_audio.py input.wav output.wav 10

## TUNNEL AUTOMÁTICO

O PC com GPU roda:
1. iniciar.bat → ativa conda, inicia omnivoice-demo --ip 0.0.0.0 --port 7860
2. start_tunnel.ps1 → cria localtunnel (npx localtunnel --port 7860), captura URL, chama update_tunnel.php?auth=xxx&url=xxx
3. PHP atualiza config.php com nova URL
4. generate.php usa essa URL para se conectar à GPU

Localtunnel é usado porque suporta SSE (Cloudflare Quick Tunnel não suporta).

## AUTENTICAÇÃO

- Senha única de admin (sem sistema de usuários)
- Cookie httpOnly: base64(timestamp : sha256(timestamp + senha + secret))
- Validade 24h
- Rotas admin verificam cookie

## RESTRIÇÕES E REQUISITOS

- GPU com mínimo 12GB VRAM (CUDA OOM com audio > 10s)
- PHP server precisa de timeout alto (600s) pois geração pode demorar 30-120s
- Frontend faz POST direto ao PHP (não via Vercel) para evitar timeout
- Localtunnel muda URL a cada reinício, precisa de atualização automática
- Trilhas limitadas a 80s para caber no upload
- Audio de referência ideal: 3-10 segundos

## O QUE PRECISO

Crie o sistema completo com:
1. Frontend Next.js com interface bonita (dark theme, profissional)
2. Painel admin completo
3. PHP server com todos os endpoints
4. Script Python de trim de audio
5. Scripts de inicialização local (BAT + PowerShell)
6. Banco de dados Prisma
7. Mixagem client-side de voz + trilha
8. Sistema de tunnel automático
9. Deploy no Vercel + PHP server

O repositório de referência com o código atual está em: https://github.com/rgdweb/Omnivoice
```

---

## COMO USAR

1. Copie o bloco de texto entre as aspas triplas (```...```)
2. Cole como prompt na outra IA
3. A IA terá 100% das informações para criar o sistema

## DICAS

- Se a IA perguntar sobre algo específico, consulte o arquivo `OMNIVOICE-SISTEMA-COMPLETO-REFERENCIA.md` que tem TODOS os detalhes técnicos de cada função
- O prompt acima é a **versão resumida** ideal para iniciar a conversa
- Para detalhes de implementação (código PHP específico, como o trim_audio.py funciona, etc), a IA pode consultar o repositório GitHub ou o documento de referência
