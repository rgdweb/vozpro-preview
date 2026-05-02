# VozPro - Documentacao Completa do Sistema

> Este documento serve como referencia para qualquer IA que precise trabalhar neste projeto em uma nova conversa.
> Contem TUDO que foi implementado, decisoes arquiteturais, problemas resolvidos e como cada parte funciona.
> 
> **Ultima atualizacao**: 02/05/2026
> **Status**: Sistema 100% funcional em producao

---

## 1. O QUE E O PROJETO

**VozPro** e um produto comercial de sintese de voz (TTS - Text-to-Speech) que usa o modelo **OmniVoice** hospedado no HuggingFace Spaces. O sistema permite:

- Clonagem de voz a partir de audios de referencia (3-10 segundos)
- Geracao de voz com diferentes emocoes/estilos (variacoes com audios de referencia diferentes)
- Mixagem de voz com trilha musical de fundo (Web Audio API no client-side)
- Painel administrativo para gerenciar vozes, variacoes e trilhas
- Upload de trilhas com processamento inteligente (trim 80s + MP3 encoding)
- Geracao de voz via PHP proxy (bypassa timeout do Vercel)

**Publico-alvo**: Estudios de gravacao, produtoras de conteudo, agencias de publicidade.

**URL de producao**: `https://omnivoice-umber.vercel.app/`

**Repositorio**: `https://github.com/rgdweb/Omnivoice`

---

## 2. STACK TECNOLOGICA

| Camada | Tecnologia | Detalhes |
|--------|-----------|----------|
| Frontend | Next.js 16 (App Router) | React 19, TypeScript |
| UI | shadcn/ui + Tailwind CSS 4 | Radix UI primitives, dark theme violet/slate |
| Backend | Next.js API Routes | Serverless no Vercel |
| Banco de Dados | PostgreSQL (Neon) | Prisma ORM |
| Armazenamento de Audio | **PHP Hosting** (sorteiomax.com.br) | Substituiu Vercel Blob (blob removido) |
| IA/TTS | OmniVoice (HuggingFace Space) | `k2-fsa-omnivoice.hf.space` via Gradio API |
| Mixagem | Web Audio API (client-side) | OfflineAudioContext + AudioBuffer |
| Encodign de Audio | lamejs (CDN) | MP3 encoding no navegador (trilhas grandes) |
| Autenticacao | Custom cookie-based | SHA-256 hash + timestamp, cookie httpOnly |
| Deploy | Vercel (Hobby plan) | Auto-deploy via GitHub push |
| PHP Server | sorteiomax.com.br/omnivoice | Upload, delete, generate, CORS habilitado |

---

## 3. ARQUITETURA E FLUXO DE DADOS

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER (Usuario)                                              │
│  ├── / (Pagina principal TTS)                                   │
│  │   ├── Seleciona Voz → Variacao → Texto → Idioma              │
│  │   ├── Opcional: Trilha + Volume                              │
│  │   ├── Gera voz via /api/php-generate ou /api/generate        │
│  │   ├── Mixa voz + trilha client-side (Web Audio API)          │
│  │   └── Player de audio + Download                             │
│  ├── /admin (Painel administrativo)                              │
│  │   ├── CRUD Vozes + Variacoes (upload audio)                  │
│  │   ├── CRUD Trilhas (MP3 encoding, trim 80s)                  │
│  │   └── Upload direto navegador→PHP via token HMAC             │
│  └── /admin/login                                               │
└────────────────────┬────────────────────────────────────────────┘
                     │ HTTPS
         ┌───────────┴────────────┐
         ▼                        ▼
┌──────────────────┐   ┌──────────────────────────┐
│  VERCEL (Next.js)│   │  PHP Server               │
│  (Hobby plan)     │   │  sorteiomax.com.br/omnivoice│
│  ┌────────────┐  │   │  ┌─────────────────────┐  │
│  │ API Routes │──┼──▶│  │ upload.php (normal) │  │
│  │ /generate  │  │   │  │ upload-direct.php   │  │
│  │ /php-gen   │──┼──▶│  │ generate.php ──────┼──┼──▶ HF Space
│  │ /upload-*  │──┼──▶│  │ delete.php         │  │
│  │ /voices    │  │   │  │ upload-chunk.php    │  │
│  │ /tracks    │  │   │  │ audios/{ref,track}/ │  │
│  │ /auth      │  │   │  └─────────────────────┘  │
│  └─────┬──────┘  │   └──────────────────────────┘
│        │         │
│  ┌─────▼──────┐  │
│  │ PostgreSQL │  │   ┌──────────────────────────┐
│  │ (Neon)     │  │   │  HuggingFace Space       │
│  │ Voices     │  │   │  k2-fsa-omnivoice        │
│  │ Variations │  │   │  Gradio _clone_fn (TTS)  │
│  │ Tracks     │  │   │  Upload API              │
│  └────────────┘  │   └──────────────────────────┘
└──────────────────┘
```

### Duas rotas de geracao de voz:
1. **PHP Proxy** (`/api/php-generate`): Browser → Vercel (proxy rapido) → PHP → HF Space. PHP faz o trabalho pesado (polling ate ~4.5 min). **Rota principal em uso.**
2. **Vercel Direto** (`/api/generate`): Vercel → HF Space direto. Limitado a 300s (requer Pro). **Fallback.**

---

## 4. ESTRUTURA DE ARQUIVOS

```
Omnivoice/
├── prisma/
│   ├── schema.prisma              # 3 models: Voice, VoiceVariation, Track
│   └── migrations/
├── php-server/                    # SERVIDOR PHP (hospedado em sorteiomax.com.br)
│   ├── config.php                 # API_KEY, BASE_URL, MAX_SIZE (50MB), ALLOWED_TYPES
│   ├── upload.php                 # Upload normal + suporte chunked upload
│   ├── upload-direct.php          # Upload direto navegador→PHP (token HMAC)
│   ├── upload-chunk.php           # Upload por chunks (remonta no server)
│   ├── delete.php                 # Delete arquivos de audio
│   ├── generate.php               # Geracao TTS via HF Space (bypass timeout Vercel)
│   ├── info.php                   # Diagnostico PHP (remover apos uso)
│   ├── .htaccess                  # Limites: 50MB upload, 600s execution
│   └── README.txt                 # Instrucoes de instalacao
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (Geist font, Sonner toaster)
│   │   ├── page.tsx               # PAGINA PRINCIPAL - Interface do cliente TTS
│   │   ├── page-backup.tsx        # Backup versao antiga (nao ativa)
│   │   ├── globals.css            # Tema dark violet/slate (CSS custom properties)
│   │   ├── admin/
│   │   │   ├── layout.tsx         # Layout admin (meta noindex)
│   │   │   ├── login/page.tsx     # Tela de login (senha unica)
│   │   │   └── page.tsx           # ADMIN DASHBOARD - CRUD completo
│   │   └── api/
│   │       ├── route.ts           # Health check
│   │       ├── auth/route.ts      # POST login / DELETE logout
│   │       ├── auth/verify/route.ts
│   │       ├── generate/route.ts  # Geracao TTS direta (maxDuration=300s)
│   │       ├── php-generate/route.ts  # PROXY para PHP generate.php
│   │       ├── upload-voice/route.ts  # Upload ref audio → PHP + HF Space
│   │       ├── upload-track/route.ts  # Upload trilha → PHP server
│   │       ├── upload-chunk/route.ts  # Proxy chunked upload → PHP
│   │       ├── upload-token/route.ts  # Gera token HMAC p/ upload direto
│   │       ├── server-config/route.ts # Retorna config do servidor PHP
│   │       ├── generate-config/route.ts # Retorna phpServerUrl
│   │       ├── status/route.ts    # Health check completo (DB, PHP, HF)
│   │       ├── voices/route.ts    # GET public / POST admin
│   │       ├── voices/[id]/route.ts  # GET / PUT / DELETE
│   │       ├── voices/[id]/variations/route.ts
│   │       ├── variations/[id]/route.ts  # PUT / DELETE
│   │       ├── tracks/route.ts    # GET public / POST admin
│   │       ├── tracks/[id]/route.ts  # PUT / DELETE
│   │       ├── admin/voices/route.ts   # GET todas vozes (incl. inativas)
│   │       └── admin/tracks/route.ts   # GET todas trilhas (incl. inativas)
│   ├── components/
│   │   ├── audio-player.tsx       # Player HTML5 reutilizavel
│   │   └── ui/                    # 40+ componentes shadcn/ui (nao modificar)
│   └── lib/
│       ├── auth.ts                # Login, verifySession, getAdminSession
│       ├── audio-server.ts        # uploadToAudioServer, deleteFromAudioServer
│       ├── db.ts                  # Prisma client singleton
│       └── utils.ts               # cn() helper
├── public/
│   ├── logo.svg
│   └── robots.txt
├── next.config.ts
├── vercel.json                    # Cache-Control no-store em /api/*
├── package.json                   # Next.js 16.1.1, React 19, Prisma 6
└── SISTEMA-COMPLETO.md            # ESTE ARQUIVO
```

---

## 5. BANCO DE DADOS (Prisma Schema)

### Voice
```
id          String   @id @default(cuid())
name        String                        // "Ana", "Carlos"
description String   @default("")
gender      String   @default("Auto")     // male, female, Auto
age         String   @default("Auto")     // child, teenager, young adult, middle-aged, elderly
accent      String   @default("Auto")     // portuguese accent, american accent, etc
pitch       String   @default("Auto")     // low pitch, high pitch, etc
previewUrl  String   @default("")
order       Int      @default(0)
active      Boolean  @default(true)
variations  VoiceVariation[]              // 1:N, cascade delete
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt
```

### VoiceVariation
```
id                   String   @id @default(cuid())
voiceId              String                   // FK → Voice (cascade delete)
label                String                   // "Neutra", "Animada", "Empresarial"
emoji                String   @default("")
refAudioPath         String                   // Caminho no HF Space (p/ Gradio FileData)
refAudioServerUrl    String                   // URL permanente no PHP server
refAudioFilename     String                   // Filename no PHP server (p/ delete)
refAudioName         String   @default("")    // Nome original do arquivo
refText              String   @default("")    // Transcricao do audio de referencia
instruct             String   @default("")    // Instrucao p/ modelo (whisper, male, etc)
order                Int      @default(0)
active               Boolean  @default(true)
```

### Track
```
id          String   @id @default(cuid())
name        String                   // "Corporativo", "Eletronica"
description String   @default("")
emoji       String   @default("")
audioPath   String                   // URL no PHP server
duration    Float    @default(0)     // Duracao em segundos
order       Int      @default(0)
active      Boolean  @default(true)
```

---

## 6. SISTEMA DE UPLOAD DE AUDIOS - DETALHES COMPLETOS

Esta e a parte mais critica do sistema. Foi reescrita varias vezes ate funcionar 100%.

### 6.1 Audio de Referencia de Voz (variacoes)
- **Fluxo**: Admin seleciona arquivo → `POST /api/upload-voice` → Vercel proxy → PHP `upload.php`
- O upload vai **server-to-server** (Vercel → PHP), sem CORS
- O PHP valida API key, MIME type, salva em `audios/ref/`
- URL permanente salva em `VoiceVariation.refAudioServerUrl`
- **Nao ha compressao** — envia o arquivo original
- **Nao ha limite de tamanho pratico** — vozes de referencia sao pequenas (<1MB)

### 6.2 Trilha Musical (tracks)
- **Fluxo**: Admin seleciona arquivo → processado no navegador → `POST /api/upload-track` → PHP
- **Processamento no navegador** (ao selecionar o arquivo, antes de enviar):
  1. Decodifica o audio com `AudioContext.decodeAudioData()`
  2. Se arquivo ≤ 3.5MB e ≤ 80s → envia **original** (zero alteracao)
  3. Se arquivo > 80s → **trima para 80s** via `OfflineAudioContext`
  4. Re-encoda como **MP3** usando lamejs (carregado do CDN)
  5. Bitrate calculado automaticamente: `min(192kbps, (3.5MB * 8) / duracao / 1000)`
  6. Mantem sample rate original (44100Hz) e canais (stereo/mono)

- **Exemplo**: MP3 5.5MB, 120s → trim 80s → MP3 192kbps stereo → ~1.9MB
- **Qualidade**: 192kbps MP3 em 44100Hz stereo = qualidade alta (indistinguivel do original pra trilha de fundo)
- **Formatos aceitos**: MP3, WAV, OGG, M4A, FLAC, WEBM
- **Limite maximo**: 80 segundos (definido como constante `MAX_DURATION`)

### 6.3 Por que MP3 encoding em vez de WAV?
O WAV e arquivo "cru" sem compressao. Para 80s stereo em 44100Hz, ficaria ~13MB (nao cabe no Vercel).
Para caber em 3.5MB, o WAV precisava ser reduzido para 11025Hz mono (qualidade terrivel).
MP3 192kbps mantem 44100Hz stereo e fica ~1.9MB — **qualidade 10x melhor, arquivo 7x menor**.

### 6.4 Upload Direto (upload-direct.php) - NAO ESTA EM USO
- Existe mas **nao e mais usado** no frontend
- Foi criado como tentativa de bypassar limite 4.5MB do Vercel
- Funciona no servidor (testado via curl), mas navegador bloqueia por CORS na pratica
- Usa token HMAC temporario gerado por `/api/upload-token`
- Token expira em 10 minutos, assinado com API_KEY
- **Pode ser uteil no futuro se o Vercel mudar os limites**

### 6.5 Chunked Upload (upload-chunk.php / /api/upload-chunk) - NAO ESTA EM USO
- Implementado mas substituido pelo MP3 encoding
- Divide arquivos em chunks de 3MB, envia sequencialmente, remonta no PHP
- Funciona tecnicamente mas nao e necessario ja que o MP3 encoding resolve o problema
- **Pode ser reativado se necessario para arquivos de outros tipos**

### 6.6 Delete de Arquivos no PHP
- Quando admin deleta uma voz → deleta variacoes → deleta cada arquivo de audio no PHP via `deleteFromAudioServer()`
- Quando admin deleta uma trilha → deleta arquivo de audio no PHP
- A API `/api/voices/[id]` DELETE faz cascade: deleta do banco + deleta arquivos do PHP

---

## 7. GERACAO DE VOZ (TTS)

### 7.1 Rota Principal: PHP Proxy (`/api/php-generate`)
```
Browser → POST /api/php-generate → Vercel (proxy rapido, ~1s) → PHP generate.php
PHP: download ref audio → upload ao HF Space → chamar _clone_fn → polling (ate 4.5min) → retornar audio
```

**Por que PHP proxy?** O Vercel Hobby tem timeout de 60s. A geracao TTS pode demorar 30-120s. O PHP faz o polling sem limite de timeout.

### 7.2 Rota Fallback: Vercel Direto (`/api/generate`)
- Vercel → HF Space direto
- `maxDuration = 300` (requer Vercel Pro)
- Tem retry (3 tentativas) e recovery para null-error
- **So funciona se Vercel Pro estiver ativo**

### 7.3 Parametros do _clone_fn (OmniVoice)
```
[0] text          - Texto para sintetizar
[1] language      - Auto, Portuguese, English, etc
[2] refAudioFileData - Gradio FileData com path no HF Space
[3] refText       - Transcricao do audio de referencia
[4] instructStr   - Instrucoes (genero, pitch, whisper, etc)
[5] numStep       - 4-64 (mais = melhor qualidade, padrao 32)
[6] guidanceScale - 0-4 (padrao 2.0)
[7] denoise       - true
[8] speed         - 0.5-1.5 (padrao 1.0)
[9] duration      - null (automatico)
[10] preprocess   - true
[11] postprocess  - true
```

### 7.4 Formato Gradio FileData
```json
{
  "path": "/tmp/gradio/xxx/audio_ref.wav",
  "orig_name": "ref_audio.wav",
  "mime_type": "audio/wav",
  "is_stream": false,
  "meta": { "_type": "gradio.FileData" }
}
```

---

## 8. MIXAGEM DE AUDIO (Client-Side)

A mixagem de voz + trilha e feita inteiramente no browser:
1. `AudioContext` decodifica os audios
2. `OfflineAudioContext` com duracao da voz
3. Voz conectada em volume 100%, trilha com volume configuravel via `GainNode`
4. `startRendering()` → AudioBuffer mixado
5. Converte para WAV (PCM 16-bit) → base64 data URI
6. Usuario pode alternar entre "Com trilha" e "Somente voz"

---

## 9. AUTENTICACAO

- **Senha unica de admin** (nao tem sistema de usuarios)
- Login: `POST /api/auth` com `{ password }` → seta cookie `vozpro_admin`
- Cookie: `base64(timestamp:sha256(timestamp + ADMIN_PASSWORD + JWT_SECRET))`
- Validade: 24 horas, httpOnly, secure em producao
- `getAdminSession()` verificada em cada rota admin

**Variaveis**: `ADMIN_PASSWORD`, `JWT_SECRET`

---

## 10. PHP SERVER - CONFIGURACAO

### config.php
```
API_KEY = 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1'
BASE_URL = 'https://sorteiomax.com.br/omnivoice'
MAX_SIZE = 50MB
UPLOAD_DIR = __DIR__ . '/audios/'
ALLOWED_CATEGORIES = ['ref', 'track', 'generated']
ALLOWED_TYPES = [audio/mpeg, audio/wav, audio/ogg, audio/webm, audio/m4a, audio/flac]
```

### .htaccess
```
upload_max_filesize = 50M
post_max_size = 55M
max_execution_time = 600
max_input_time = 300
```

### Estrutura de pastas no servidor
```
omnivoice/
├── config.php
├── upload.php          # Upload normal (server-to-server via API key)
├── upload-direct.php   # Upload direto navegador→PHP (token HMAC)
├── upload-chunk.php    # Upload por chunks (remonta no server)
├── delete.php          # Delete arquivos
├── generate.php        # Geracao TTS via HF Space
├── .htaccess
└── audios/
    ├── ref/            # Audios de referencia de voz
    ├── track/          # Trilhas musicais
    ├── generated/      # Reservado
    └── chunks/         # Temp (auto-limpo)
```

---

## 11. VARIAVEIS DE AMBIENTE

| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `DATABASE_URL` | PostgreSQL (Neon) | SIM |
| `ADMIN_PASSWORD` | Senha do admin | SIM |
| `JWT_SECRET` | Chave p/ assinar cookies | SIM |
| `HF_SPACE_URL` | URL do HF OmniVoice Space | SIM (tem fallback) |
| `AUDIO_SERVER_URL` | URL base do PHP server | SIM (tem fallback) |
| `AUDIO_SERVER_API_KEY` | API key do PHP server | SIM |

**Fallbacks no codigo**:
- `HF_SPACE_URL` → `https://k2-fsa-omnivoice.hf.space`
- `AUDIO_SERVER_URL` → `https://sorteiomax.com.br/omnivoice`
- `ADMIN_PASSWORD` → `VozPro@2026`
- `JWT_SECRET` → fallback generico

---

## 12. HISTORICO DE PROBLEMAS RESOLVIDOS

### Fase 1 - Setup Inicial
| Problema | Solucao |
|----------|---------|
| SQLite nao funciona no Vercel | Migracao para PostgreSQL + Prisma |
| Arquivos locais nao persistem | Primeiro Vercel Blob, depois PHP hosting |
| ffmpeg nao funciona no Vercel | Mixagem client-side via Web Audio API |
| Build falhava com `prisma migrate deploy` | Removido do build script |
| 404 NOT_FOUND no deploy | Variaveis de ambiente no projeto errado do Vercel |
| Timeout 60s na geracao TTS | PHP proxy (`generate.php`) faz o polling |

### Fase 2 - Upload de Audios
| Problema | Solucao |
|----------|---------|
| "Failed to fetch" no upload de trilhas | CORS entre Vercel e PHP — resolvido com server-to-server proxy |
| Vercel Hobby limita payload a 4.5MB | Primeiro: compressao WAV com sample rate reduzido. Depois: MP3 encoding com lamejs |
| Qualidade terrivel (WAV 11025Hz mono) | Trocado para MP3 192kbps 44100Hz stereo via lamejs |
| Upload direto navegador→PHP falha (CORS) | upload-direct.php funciona via curl mas navegador bloqueia. Nao e mais usado. |
| "Unexpected end of JSON input" | PHP retornava resposta vazia (HTTP 500). Adicionado parsing seguro (ler como texto primeiro). |
| Arquivos grandes (>4.5MB) | MP3 encoding resolve: qualquer arquivo → max 80s → max ~1.9MB |
| upload.php no servidor retornava 500 | Versao antiga do PHP no servidor. Como nao tinha acesso FTP, foi feito workaround com upload-direct.php. |

### Fase 3 - Funcionalidades
| Problema | Solucao |
|----------|---------|
| Audio de referencia era temporario no HF | Implementado armazenamento permanente no PHP + campo refAudioServerUrl |
| Delete de voz nao removia arquivos do servidor | Adicionado deleteFromAudioServer() no cascade delete |
| Trilhas longas quebravam o sistema | Limite de 80s + trim automatico via OfflineAudioContext |

---

## 13. DECISOES ARQUITETURAIS

| Decisao | Motivo |
|---------|--------|
| PHP hosting para audio em vez de Vercel Blob | Sem limite de tamanho, sem custo extra, ja tinha o servidor |
| MP3 encoding em vez de WAV | Qualidade 10x melhor no mesmo tamanho (192kbps stereo vs 11025Hz mono) |
| lamejs via CDN em vez de npm | Evita problemas com bundler (require nativo no Node, nao funciona no browser) |
| PHP proxy para TTS em vez de Vercel direto | Bypassa timeout de 60s do Vercel Hobby |
| Cookie-based auth em vez de JWT | Mais simples, sem dependencia de biblioteca, httpOnly seguro |
| Prisma generate no build (nao migrate deploy) | migrate deploy precisa de conexao com banco durante build |
| Deferred upload (so envia ao clicar Salvar) | Melhor UX: usuario pode cancelar antes de enviar |

---

## 14. LIMITACOES CONHECIDAS

| Limitacao | Impacto | Possivel Solucao |
|-----------|---------|-----------------|
| Vercel Hobby timeout 60s | Rotas que nao usam PHP proxy | Upgrade Vercel Pro |
| Audios de referencia no HF Space | Podem ser perdidos se Space reiniciar | Ja mitigado: armazenamento permanente no PHP |
| Sem sistema de usuarios | So uma conta admin | Implementar auth completa quando necessario |
| Trilhas limitadas a 80s | Pode ser curto pra alguns casos | Aumentar MAX_DURATION ou usar chunked upload |
| Sem processamento server-side de audio | Nao tem ffmpeg no Vercel | PHP server tem ffmpeg disponivel para uso futuro |
| Domain: omnivoice-umber.vercel.app | Dominio provisorio | Configurar dominio personalizado |

---

## 15. COMO DAR MANUTENCAO

### Adicionar componente shadcn/ui:
```bash
npx shadcn@latest add [component-name]
```

### Modificar schema do banco:
1. Editar `prisma/schema.prisma`
2. `npx prisma migrate dev --name nome`
3. Commit
4. Producao: `npx prisma db push`

### Atualizar PHP server:
- Acessar painel do hosting (cPanel/FTP)
- Substituir arquivos na pasta `omnivoice/`
- O `upload.php` no servidor precisa ser a versao nova (com suporte chunked) se for usar chunked upload
- Atualmente o upload normal via Vercel proxy funciona sem alterar o PHP

### Alterar limite de duracao das trilhas:
- Editar `const MAX_DURATION = 80` em `src/app/admin/page.tsx`
- Alterar `const MP3_BITRATE = 192` se necessario

### Trocar modelo de IA:
1. Alterar `HF_SPACE_URL`
2. Modificar parametros em `/api/generate/route.ts` e `php-server/generate.php`
3. Atualizar valores de instruct suportados

---

## 16. COMANDOS UTEIS

```bash
# Build local (precisa de DATABASE_URL apontando pra Neon)
npm run build

# Gerar Prisma client
npx prisma generate

# Push schema pro banco (sem criar migration)
npx prisma db push

# Criar migration
npx prisma migrate dev --name nome

# Deploy (auto via git push)
git push origin main

# Backup do projeto
git archive --format=zip -o backup.zip HEAD
```
