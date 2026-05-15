# VozPro / OmniVoice - Guia Completo

> **Consolidado em 14/05/2026**
> Guia completo consolidando o melhor conteudo de TODA a documentacao existente do sistema.
> Destinado a desenvolvedores, administradores e qualquer pessoa que precise entender, manter ou evoluir o sistema.

---

## Arquivos Fonte Consolidados

| # | Arquivo Original | Secoes Utilizadas |
|---|-----------------|-------------------|
| 1 | `SISTEMA-COMPLETO.md` | Arquitetura, stack, DB, upload, TTS, mixagem, auth, variaveis |
| 2 | `VOZPRO-DOCUMENTACAO-COMPLETA.md` | Historico de fases, fluxos, modelos, modos de voz |
| 3 | `OMNIVOICE-SISTEMA-COMPLETO-REFERENCIA.md` | API detalhada, PHP functions, trim_audio, scripts locais |
| 4 | `VOZPRO-HANDOFF-COMPLETO.md` | Credenciais, commits, estalos, backup estavel |
| 5 | `ANALISE-COMPLETA-OMNIVOICE-PRONUNCIA.md` | Pipeline de pronuncia, bugs, G2P, plano de 3 fases |
| 6 | `INSTRUCOES-INSTALACAO.txt` | Instalacao PHP local (XAMPP) |
| 7 | `omnivoice-update/INSTRUCOES.txt` | Atualizacao para conexao direta via tunnel |
| 8 | `omnivoice_htaccess.txt` | Configuracao .htaccess |
| 9 | `parent_htaccess_new.txt` | .htaccess diretorio pai |
| 10 | `php-server/README.txt` | README servidor PHP |
| 11 | `backup.sh` | Procedimentos de backup |
| 12 | `worklog.md` | Melhorias do pipeline TTS |
| 13 | `RESEARCH_REPORT.md` | Pesquisa Sonauto, TTS, G2P, DiffSinger |

---

## 1. Visao Geral do Sistema

O VozPro e um sistema comercial de sintese de voz (TTS - Text-to-Speech) que utiliza dois modelos de IA rodando localmente em GPU, com frontend hospedado no Vercel e PHP no HostGator como intermediario. O sistema permite:

- **Clonagem de voz** a partir de audios de referencia (3-10 segundos)
- **Voice Design**: Criacao de voz a partir de descricao textual (genero, idade, tom, sotaque)
- **Auto Voice**: Voz aleatoria com todos os parametros "Auto"
- **Mixagem inteligente**: Sistema de ducking (voz + trilha musical com volume automatico)
- **Painel administrativo**: Gerenciamento completo de vozes, variacoes e trilhas
- **Upload de trilhas com processamento**: Trim 80s + MP3 encoding automatico
- **Geracao via PHP proxy**: SSE streaming que bypassa timeout do Vercel
- **GPU local**: RTX 3060 12GB exposta via tunnel automatico

**Publico-alvo**: Estudios de gravacao, produtoras de conteudo, agencias de publicidade.

**URL de producao**: `https://omnivoice-umber.vercel.app/`
**Repositorio**: `https://github.com/rgdweb/Omnivoice`

---

## 2. Stack Tecnologica

| Camada | Tecnologia | Detalhes |
|--------|-----------|----------|
| Frontend | Next.js 16 (App Router) | React 19, TypeScript, Tailwind CSS 4 |
| UI | shadcn/ui (New York style) | Radix UI primitives, dark theme violet/slate, Lucide icons |
| Backend | Next.js API Routes | Serverless no Vercel (Hobby plan) |
| Banco de Dados | PostgreSQL (Neon) | Prisma ORM |
| Armazenamento de Audio | PHP Hosting | sorteiomax.com.br/omnivoice |
| IA/TTS (Modelo 1) | F5-TTS | Chunking frase por frase, clonagem fiel, RTF ~0.5 |
| IA/TTS (Modelo 2) | OmniVoice/VozPro (k2-fsa) | Clone + Design + Auto, RTF 0.025, 600+ idiomas |
| Tunnel | Localtunnel (npx) | Gratuito, sem cadastro, suporta SSE |
| Audio Trimmer | Python 3 (trim_audio.py) | Corta ref audio para max 10s (evita CUDA OOM) |
| Mixagem | Web Audio API (client-side) | OfflineAudioContext + AudioBuffer + Ducking |
| Encoding de Audio | lamejs (CDN) | MP3 encoding no navegador para trilhas |
| Autenticacao | Custom cookie-based | SHA-256 hash + timestamp, cookie httpOnly |
| Deploy | Vercel (Hobby plan) | Auto-deploy via GitHub push |
| PHP Server | sorteiomax.com.br/omnivoice | Upload, delete, generate, CORS, timeout 600s |

---

## 3. Arquitetura e Fluxo de Dados

```
┌─────────────────────────────────────────────────────────────────────────┐
│  BROWSER (Usuario)                                                       │
│  ├── / (Pagina principal TTS)                                           │
│  │   ├── Seleciona Modelo: F5-TTS ou VozPro                             │
│  │   ├── Seleciona Modo: Clone / Voice Design / Auto Voice              │
│  │   ├── Seleciona Voz -> Variacao -> Texto -> Idioma                   │
│  │   ├── Opcional: Trilha + Volume (Ducking)                            │
│  │   ├── Gera voz via PHP direto (SSE) ou /api/generate (fallback)      │
│  │   ├── Mixa voz + trilha client-side (Web Audio API)                  │
│  │   └── Player de audio + Download                                     │
│  ├── /admin (Painel administrativo)                                     │
│  │   ├── CRUD Vozes + Variacoes (upload audio)                          │
│  │   ├── CRUD Trilhas (MP3 encoding, trim 80s)                          │
│  │   └── Upload direto navegador -> PHP via token HMAC                  │
│  └── /admin/login                                                       │
└────────────────────┬────────────────────────────────────────────────────┘
                     │ HTTPS
         ┌───────────┴────────────┐
         ▼                        ▼
┌──────────────────┐   ┌──────────────────────────┐
│  VERCEL (Next.js)│   │  PHP Server               │
│  (Hobby plan)     │   │  sorteiomax.com.br/omnivoice│
│  ┌────────────┐  │   │  ┌─────────────────────┐  │
│  │ API Routes │──┼──▶│  │ generate.php (F5-TTS) │  │
│  │ /generate  │  │   │  │ generate-omnivoice   │──┼──▶ GPU Local
│  │ /php-gen   │  │   │  │ upload.php           │  │
│  │ /upload-*  │  │   │  │ delete.php           │  │
│  │ /voices    │  │   │  │ get_tunnel.php       │  │
│  │ /tracks    │  │   │  │ update_tunnel.php    │  │
│  │ /auth      │  │   │  │ trim_audio.py        │  │
│  └─────┬──────┘  │   │  │ audios/{ref,track}/  │  │
│        │         │   │  └─────────────────────┘  │
│  ┌─────▼──────┐  │   └──────────────────────────┘
│  │ PostgreSQL │  │
│  │ (Neon)     │  │   ┌──────────────────────────────────┐
│  │ Voices     │  │   │  GPU LOCAL (PC Windows)          │
│  │ Variations │  │   │  RTX 3060 12GB                   │
│  │ Tracks     │  │   │  omnivoice-demo :7860            │
│  │ SystemSettings │ │   │  Gradio API v2 (_clone_fn)       │
│  └────────────┘  │   │  PYTORCH_CUDA_ALLOC_CONF        │
└──────────────────┘   └──────────────────────────────────┘
```

### Rotas de Geracao de Voz

#### Rota 1: PHP Direto via SSE (PRINCIPAL - VozPro)
```
Browser -> POST generate-omnivoice.php (sorteiomax) -> get_tunnel.php (URL tunnel)
-> Tunnel (loca.lt) -> VozPro GPU (localhost:7860) -> audio base64 de volta
```
PHP faz download do ref audio, trim para 10s, upload para GPU, SSE streaming ate resultado.

#### Rota 2: PHP Proxy F5-TTS
```
Browser -> POST generate.php (sorteiomax) -> Tunnel -> F5-TTS GPU -> audio base64
```

#### Rota 3: Vercel Direto (FALLBACK)
```
Browser -> POST /api/generate (Vercel) -> Tunnel -> GPU -> audio
```
Limitado a 300s (requer Vercel Pro). Apenas fallback.

### Modos de Voz

| Modo | Descricao | Modelos |
|------|-----------|---------|
| **Clone** | Clona voz a partir de audio de referencia (3-10s) | F5-TTS, VozPro |
| **Voice Design** | Cria voz a partir de descricao (genero, idade, tom, sotaque) | VozPro apenas |
| **Auto Voice** | Voz aleatoria com todos os params "Auto" | VozPro apenas |

---

## 4. Estrutura de Arquivos

### Frontend (Next.js no Vercel)

```
Omnivoice/
├── prisma/
│   └── schema.prisma              # Models: Voice, VoiceVariation, Track, SystemSetting
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (Geist font, Sonner toaster)
│   │   ├── page.tsx               # PAGINA PRINCIPAL - Interface TTS
│   │   ├── globals.css            # Tema dark violet/slate
│   │   ├── admin/
│   │   │   ├── layout.tsx         # Layout admin (meta noindex)
│   │   │   ├── login/page.tsx     # Tela de login
│   │   │   └── page.tsx           # ADMIN DASHBOARD - CRUD completo
│   │   └── api/
│   │       ├── route.ts           # Health check
│   │       ├── auth/route.ts      # POST login / DELETE logout
│   │       ├── auth/verify/route.ts
│   │       ├── generate/route.ts  # Geracao TTS direta (maxDuration=300s)
│   │       ├── php-generate/route.ts  # Proxy PHP
│   │       ├── tunnel-generate/route.ts  # Geracao F5-TTS via tunnel
│   │       ├── omnivoice-generate/route.ts  # Geracao VozPro via Vercel (fallback)
│   │       ├── omnivoice-token/route.ts  # Token HMAC VozPro
│   │       ├── generate-token/route.ts  # Token HMAC F5-TTS
│   │       ├── generate-config/route.ts  # Retorna phpServerUrl
│   │       ├── upload-voice/route.ts  # Upload ref audio
│   │       ├── upload-track/route.ts  # Upload trilha
│   │       ├── upload-chunk/route.ts  # Proxy chunked upload
│   │       ├── upload-token/route.ts  # Token HMAC upload
│   │       ├── server-config/route.ts # Config do PHP server
│   │       ├── status/route.ts    # Diagnostico completo
│   │       ├── voices/route.ts    # GET public / POST admin
│   │       ├── voices/[id]/route.ts
│   │       ├── voices/[id]/variations/route.ts
│   │       ├── variations/[id]/route.ts
│   │       ├── tracks/route.ts
│   │       ├── tracks/[id]/route.ts
│   │       ├── admin/voices/route.ts
│   │       ├── admin/tracks/route.ts
│   │       ├── settings/route.ts  # Settings publicas
│   │       └── admin/settings/route.ts  # Settings admin
│   ├── components/
│   │   ├── audio-player.tsx       # Player HTML5 reutilizavel
│   │   └── ui/                    # 40+ componentes shadcn/ui
│   └── lib/
│       ├── auth.ts                # Login, verifySession, getAdminSession
│       ├── audio-server.ts        # uploadToAudioServer, deleteFromAudioServer
│       ├── db.ts                  # Prisma client singleton
│       ├── utils.ts               # cn() helper
│       ├── pronunciation-optimizer.ts  # Pipeline de pronuncia (3 camadas)
│       ├── tts-chunker.ts         # Chunking com pausas
│       ├── tts-text-preprocessor.ts  # Normalizacao de texto
│       └── ssml-parser.ts         # Conversao SSML -> formato VozPro
├── public/
│   ├── logo.svg
│   └── robots.txt
├── next.config.ts
├── vercel.json
├── package.json
└── backup.sh
```

### PHP Server (sorteiomax.com.br/omnivoice/)

```
php-server/
├── config.php                # API_KEY, BASE_URL, HF_SPACE_URL, MAX_SIZE (50MB)
├── .htaccess                 # Limites: 50MB upload, 600s execution
├── .user.ini                 # Config PHP (timeouts, memory)
├── generate.php              # Geracao F5-TTS via PHP (tunnel -> GPU)
├── generate-omnivoice.php    # Geracao VozPro via PHP (tunnel -> GPU)
├── generate-direct.php       # Geracao direta (sem tunnel)
├── generate_local.php        # Geracao local (rede interna)
├── get_tunnel.php            # Retorna URL do tunnel ativo
├── update_tunnel.php         # Atualiza URL do tunnel (via start_tunnel.ps1)
├── tunnel-config.ini         # Config INI separado para tunnel URL
├── upload.php                # Upload normal (server-to-server via API key)
├── upload-direct.php         # Upload direto navegador->PHP (token HMAC)
├── upload-chunk.php          # Upload por chunks (arquivos grandes)
├── upload_local.php          # Upload local (rede interna)
├── delete.php                # Deletar arquivos de audio
├── trim_audio.py             # Python puro: corta MP3/WAV para max 10s
├── info.php                  # Diagnostico PHP
├── teste_local.html          # Pagina de teste local
└── audios/
    ├── ref/                  # Audios de referencia de voz
    ├── track/                # Trilhas musicais
    ├── generated/            # Reservado
    └── chunks/               # Temp (auto-limpo)
```

### Servidor Local (GPU)

```
local-server/
├── omnivoice_server.py       # Servidor VozPro (Gradio)
├── iniciar.bat               # Ativa conda, mata porta 7860, inicia omnivoice-demo
├── iniciar_omnivoice.bat     # Iniciar VozPro especifico
├── iniciar_local.bat         # Iniciar modo local (sem tunnel)
├── start_tunnel.ps1          # PowerShell: cria tunnel + atualiza config.php
├── tunnel_php.ps1            # Tunnel alternativo via PHP
├── start_hidden.vbs          # Executa BAT em background
├── stop.bat                  # Para servidores
├── restart.bat               # Reinicia servidores
├── OmniVoice-Server.bat      # Iniciar servidor completo
├── INSTALL.bat               # Instalador
└── php-local/                # PHP para ambiente local
    ├── config.php
    ├── generate.php
    └── upload.php
```

---

## 5. Banco de Dados (Prisma Schema)

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
voiceId              String                   // FK -> Voice (cascade delete)
label                String                   // "Neutra", "Animada", "Empresarial"
emoji                String   @default("")
refAudioPath         String                   // Path no Gradio (obsoleto)
refAudioServerUrl    String                   // URL permanente no PHP server (USADO)
refAudioFilename     String                   // Filename no PHP server (p/ delete)
refAudioName         String   @default("")    // Nome original
refText              String   @default("")    // Transcricao do audio de referencia
instruct             String   @default("")    // Instrucao p/ modelo
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

### SystemSetting (key-value)
```
id          String   @id @default(cuid())
key         String   @unique        // "enableVoiceUpload"
value       String                   // "true" / "false"
```

---

## 6. API Reference

### API Gradio do VozPro (endpoint `_clone_fn`)

**Submeter job:**
```
POST /gradio_api/call/_clone_fn
Content-Type: application/json
Body: {"data": [
  texto,           // [0] string - texto para sintetizar
  idioma,          // [1] string - "Auto", "Portuguese", "English"
  {FileData},      // [2] audio de referencia (Gradio FileData)
  refText,         // [3] string - transcricao exata do audio
  instruct,        // [4] string - "whisper", "male", "female", etc
  numStep,         // [5] int - passos difusao (4-64, padrao 32)
  guidanceScale,   // [6] float - escala guiamento (0-4, padrao 2.0)
  denoise,         // [7] bool - true
  speed,           // [8] float - 0.5-1.5, padrao 1.0
  duration,        // [9] float/null - null=auto
  preprocess,      // [10] bool - true
  postprocess      // [11] bool - true
]}
Response: {"event_id": "uuid-xxxx"}
```

**Aguardar resultado via SSE:**
```
GET /gradio_api/call/_clone_fn/{event_id}
Accept: text/event-stream

event: heartbeat      (mantem conexao viva)
event: complete       (resultado!)
data: [{"url":"/gradio_api/file=/tmp/xxx/output.wav",...}, null]
```

**Upload de arquivo:**
```
POST /gradio_api/upload
Content-Type: multipart/form-data
Body: files=@audio.wav
Response: ["/tmp/gradio/xxx/audio.wav"]
```

### API Gradio do VozPro (endpoint `_design_fn`)

```
POST /gradio_api/call/_design_fn
Body: {"data": [
  text,            // texto
  language,        // idioma
  numStep,         // 32
  guidanceScale,   // 2.0
  denoise,         // true
  speed,           // 1.0
  duration,        // null
  preprocess,      // true
  postprocess,     // true
  gender,          // "Male" / "Female" / "Auto"
  age,             // "Young" / "Middle-aged" / "Elderly" / "Auto"
  pitch,           // "Very Low" / "Low" / "Moderate" / "High" / "Very High" / "Auto"
  style,           // "Narration" / "Conversation" / "Whisper" / "Shout" / etc
  accent,          // "American" / "British" / "Portuguese" / "Auto"
  dialect          // "Standard" / etc
]}
```

### API Routes do Vercel

| Rota | Metodo | Descricao | Auth |
|------|--------|-----------|------|
| `/api/` | GET | Health check | Nenhuma |
| `/api/auth` | POST | Login (seta cookie) | Password |
| `/api/auth` | DELETE | Logout (remove cookie) | Cookie |
| `/api/auth/verify` | GET | Verifica sessao | Cookie |
| `/api/voices` | GET | Lista vozes ativas | Nenhuma |
| `/api/voices` | POST | Cria voz | Admin |
| `/api/voices/[id]` | GET | Detalhes da voz | Nenhuma |
| `/api/voices/[id]` | PUT | Atualiza voz | Admin |
| `/api/voices/[id]` | DELETE | Remove voz + variacoes + arquivos | Admin |
| `/api/voices/[id]/variations` | GET | Lista variacoes | Nenhuma |
| `/api/voices/[id]/variations` | POST | Cria variacao | Admin |
| `/api/variations/[id]` | PUT | Atualiza variacao | Admin |
| `/api/variations/[id]` | DELETE | Remove variacao + arquivo | Admin |
| `/api/tracks` | GET | Lista trilhas ativas | Nenhuma |
| `/api/tracks` | POST | Cria trilha | Admin |
| `/api/tracks/[id]` | PUT | Atualiza trilha | Admin |
| `/api/tracks/[id]` | DELETE | Remove trilha + arquivo | Admin |
| `/api/upload-voice` | POST | Upload ref audio (proxy -> PHP) | Admin |
| `/api/upload-track` | POST | Upload trilha (proxy -> PHP) | Admin |
| `/api/upload-chunk` | POST | Proxy chunked upload -> PHP | Admin |
| `/api/upload-token` | GET | Gera token HMAC (valido 30min) | Nenhuma |
| `/api/generate` | POST | Geracao TTS direta (fallback) | Nenhuma |
| `/api/php-generate` | POST | Proxy para PHP generate.php | Nenhuma |
| `/api/tunnel-generate` | POST | Geracao F5-TTS via tunnel | Nenhuma |
| `/api/omnivoice-generate` | POST | Geracao VozPro (fallback Vercel) | Nenhuma |
| `/api/omnivoice-token` | GET | Token HMAC para VozPro PHP | Nenhuma |
| `/api/generate-config` | GET | Retorna phpServerUrl | Nenhuma |
| `/api/server-config` | GET | Config do PHP server | Nenhuma |
| `/api/status` | GET | Diagnostico completo (DB, PHP, GPU) | Nenhuma |
| `/api/settings` | GET | Settings publicas | Nenhuma |
| `/api/admin/settings` | GET/PUT | Settings admin | Admin |
| `/api/admin/voices` | GET | Todas vozes (incl. inativas) | Admin |
| `/api/admin/tracks` | GET | Todas trilhas (incl. inativas) | Admin |

### PHP Server Endpoints

| Arquivo | Metodo | Descricao | Auth |
|---------|--------|-----------|------|
| `generate.php` | POST | Geracao F5-TTS via tunnel | HMAC Token |
| `generate-omnivoice.php` | POST | Geracao VozPro via tunnel | HMAC Token |
| `upload.php` | POST | Upload de audio (server-to-server) | API Key |
| `upload-direct.php` | POST | Upload direto navegador->PHP | HMAC Token |
| `upload-chunk.php` | POST | Upload por chunks | API Key |
| `delete.php` | POST | Deletar arquivo de audio | API Key |
| `get_tunnel.php` | GET | Retorna URL do tunnel ativo | Nenhuma |
| `update_tunnel.php` | GET | Atualiza URL do tunnel | auth param |

---

## 7. Sistema de Upload de Audios

### 7.1 Audio de Referencia (Vozes)
- **Fluxo**: Admin seleciona arquivo -> `POST /api/upload-voice` -> Vercel proxy -> PHP `upload.php`
- Server-to-server (sem CORS)
- PHP valida API key, MIME type, salva em `audios/ref/`
- URL permanente salva em `VoiceVariation.refAudioServerUrl`
- Sem compressao, sem limite pratico (<1MB tipicamente)

### 7.2 Trilha Musical
- **Processamento no navegador** (antes de enviar):
  1. Decodifica com `AudioContext.decodeAudioData()`
  2. Se <= 3.5MB E <= 80s -> envia **original** (zero processamento)
  3. Se > 80s -> **trima para 80s** via `OfflineAudioContext`
  4. Re-encoda como **MP3** usando lamejs (CDN)
  5. Bitrate: `min(192kbps, (3.5MB * 8) / duracao / 1000)`
  6. Mantem sample rate 44100Hz e canais (stereo/mono)
- **Formatos aceitos**: MP3, WAV, OGG, M4A, FLAC, WEBM
- **Resultado tipico**: MP3 5.5MB 120s -> trim 80s -> ~1.9MB

### 7.3 Por que MP3 encoding?
- WAV 80s stereo 44100Hz = ~13MB (nao cabe no limite 4.5MB Vercel)
- WAV para caber precisaria 11025Hz mono (qualidade terrivel)
- MP3 192kbps 44100Hz stereo = ~1.9MB (qualidade alta, 7x menor)

---

## 8. Pipeline de Pronuncia

### 8.1 Visao Geral

```
Input do usuario
    |
    v
[Frontend] pronunciation-optimizer.ts
    |   Camada 1: Regex (H mudo, numeros, moeda, pontuacao, X) - 0ms
    |   Camada 2: Dicionario hardcoded (1100+ entradas) - 0ms
    |   Camada 3: LLM fallback (1-3s)
    |
    v
[Frontend] tts-text-preprocessor.ts (normaliza pontuacao)
    |
    v
[Frontend] tts-chunker.ts (divide em frases por pontuacao forte)
    |   Cada chunk = 1 chamada API separada
    |   Pausas: . = 400ms, ! = 450ms, ? = 500ms, ... = 600ms
    |   ; = 300ms, : = 350ms
    |
    v
[Backend] omnivoice-generate/route.ts (limpeza)
    |   PASSO 1: stripSSMLForTTS(text)
    |   PASSO 2: Remove URLs e emails
    |   PASSO 3: Mantem letras, numeros, acentos, pontuacao ,;:!?[]
    |   PASSO 4: (REMOVIDO) Remove colchetes [pronuncia] -> pronuncia
    |   PASSO 5: Remove espacos multiplos
    |   PASSO 6: Espaco apos virgula e ponto-e-virgula
    |   PASSO 7: Limita texto a 800 chars
    |
    v
[Gradio API] VozPro gera audio
```

### 8.2 Bugs Conhecidos do Pipeline de Pronuncia

| Bug | Arquivo | Status |
|-----|---------|--------|
| ~~Remocao de colchetes `[pronuncia]`~~ | `route.ts:258` | ✅ Corrigido (linha deletada) |
| SSML removido em vez de convertido | `route.ts:245` | ⚠️ Pendente |
| Dicionario hardcoded 1100+ entradas | `pronunciation-optimizer.ts` | ⚠️ G2P em desenvolvimento |
| PHP sem pre-processamento de pronuncia | `generate.php` | ⚠️ Pendente |
| Pipeline F5-TTS e OmniVoice compartilhados | Geral | ⚠️ Pendente separacao |

### 8.3 G2P com espeak-ng (Em Desenvolvimento)

- API route `/api/g2p-phonemize` criada
- espeak-ng 1.52.0 confirmado com voz pt-br
- Cobertura: 106 idiomas, qualquer palavra em portugues
- Latencia: <10ms por palavra
- Pendente: Integracao no pipeline principal

### 8.4 Plano de Melhoria (3 Fases)

**Fase 1: Correcoes imediatas** (feitas)
- Deletar linha 258 de route.ts ✅
- Adicionar `[]` ao regex permitido ✅
- API G2P espeak-ng ✅
- Melhorar chunker (conjuncoes, pausas `;` e `:`) ✅

**Fase 2: G2P automatico** (2-5 dias)
- Integrar espeak-ng no pipeline de producao
- Migrar dicionario para JSON externo
- Remover entradas manuais cobertas pelo G2P

**Fase 3: Pipeline DiffSinger** (2-4 semanas)
- Duration Predictor (controla duracao de cada fonema)
- Pitch Predictor (controla entonacao/F0)
- Diffusion Model (mel-espectrograma)
- Vocoder (HiFi-GAN)

---

## 9. Mixagem de Audio (Client-Side)

### Ducking System
O sistema de ducking permite que a trilha musical se ajuste automaticamente quando a voz esta presente:

1. Musica comeca com fade-in
2. Musica alta ate a voz comecar
3. Musica reduz (duck) quando voz entra
4. Musica permanece baixa enquanto voz fala
5. Musica volta alta (unduck) quando voz termina
6. Musica fade-out final

**Parametros configuraveis:**
- `duckVolume`: Volume da trilha durante a fala (0.0-1.0)
- `fadeInMs`: Fade-in inicial da trilha
- `duckFadeMs`: Tempo de transicao para duck
- `unduckFadeMs`: Tempo de transicao para unduck
- `fadeOutMs`: Fade-out final
- `musicStartLeadMs`: Tempo de trilha antes da voz

**Implementacao:** 100% client-side com Web Audio API, OfflineAudioContext + AudioBuffer + GainNode. Mono output + compressor para clareza da voz. MP3 encoding com lamejs para arquivos de saida.

---

## 10. Sistema de Autenticacao

### Admin Login
- **Tipo**: Senha unica (sem sistema de usuarios)
- **Login**: `POST /api/auth` com `{ password }` -> seta cookie `vozpro_admin`
- **Cookie**: `base64(timestamp : sha256(timestamp + ADMIN_PASSWORD + JWT_SECRET))`
- **Validade**: 24 horas, httpOnly, secure em producao, sameSite strict
- **Verificacao**: `getAdminSession()` verificada em cada rota admin

### Token HMAC (PHP)
- **Geracao**: `GET /api/omnivoice-token` ou `GET /api/generate-token`
- **Formato**: `{timestamp}.{hmac_sha256(timestamp, API_KEY)}`
- **Validade**: 30 minutos
- **Uso**: Header `X-Generate-Token` nas requisicoes para o PHP
- **Validacao**: PHP verifica timestamp (30min) + HMAC confere com API_KEY

---

## 11. Instrucoes de Deploy

### 11.1 Deploy Frontend (Vercel)

```bash
# Deploy automatico via GitHub push
git push origin main

# Ou manual via Vercel CLI
npx vercel --prod
```

### 11.2 Deploy PHP Server (HostGator via FTP)

```bash
# Upload de arquivo individual
curl -s --connect-timeout 10 -m 30 \
  "ftp://sorteiomax.com.br/public_html/omnivoice/ARQUIVO.php" \
  --user "marci955:SENHA" \
  -T "/caminho/local/arquivo.php"

# Resposta FTP 226/227 = sucesso
```

**Importante:** Sempre fazer backup do arquivo existente antes de substituir.

### 11.3 Configurar Variaveis de Ambiente (Vercel)

| Variavel | Valor | Obrigatorio |
|----------|-------|:-----------:|
| `DATABASE_URL` | String PostgreSQL (Neon) | SIM |
| `ADMIN_PASSWORD` | Senha do admin | SIM |
| `JWT_SECRET` | Chave para cookies | SIM |
| `AUDIO_SERVER_URL` | `https://sorteiomax.com.br/omnivoice` | SIM |
| `AUDIO_SERVER_API_KEY` | `vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1` | SIM |

### 11.4 Iniciar GPU Local (PC Windows)

1. **Executar `iniciar.bat`**:
   - Ativa ambiente conda `omnivoice`
   - Mata processo Python na porta 7860
   - Configura `PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`
   - Inicia `omnivoice-demo --ip 0.0.0.0 --port 7860`

2. **Executar `start_tunnel.ps1`**:
   - Verifica se VozPro esta rodando (localhost:7860)
   - Cria tunnel via `npx localtunnel --port 7860`
   - Captura URL gerada (https://random-name.loca.lt)
   - Atualiza PHP server via `update_tunnel.php?auth=...&url=...`

3. **Aguardar ~30 segundos** para tunnel ficar online

4. **Verificar**: `https://sorteiomax.com.br/omnivoice/get_tunnel.php` deve retornar `{"status":"online",...}`

---

## 12. Configuracoes do PHP Server

### config.php
```php
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');
define('BASE_URL', 'https://sorteiomax.com.br/omnivoice');
define('HF_SPACE_URL', 'https://xxxx.loca.lt');  // Atualizado automaticamente
define('MAX_SIZE', 50 * 1024 * 1024);            // 50MB
define('UPLOAD_DIR', __DIR__ . '/audios/');
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);
define('ALLOWED_TYPES', ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/flac']);
```

### .htaccess (diretorio omnivoice)
```
# Aumentar limites de upload
php_value upload_max_filesize 50M
php_value post_max_size 55M
php_value max_execution_time 600
php_value max_input_time 300

# Proteger arquivos de configuracao
<FilesMatch "^(config\.php|uploads\.log)$">
    Order deny,allow
    Deny from all
</FilesMatch>

# Proteger pasta de uploads - bloquear PHP
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteRule ^audios/.*\.php$ - [F]
</IfModule>

# Permitir acesso aos arquivos de audio
<FilesMatch "\.(wav|mp3|ogg|flac|m4a|webm)$">
    Order allow,deny
    Allow from all
</FilesMatch>
```

### .htaccess (diretorio pai - sorteiomax)
```
<IfModule mod_rewrite.c>
    RewriteEngine On
    RewriteBase /sorteiomax_min/
    RewriteRule ^omnivoice/ - [L]          # Excluir /omnivoice/ de reescrita
    RewriteCond %{REQUEST_FILENAME} !-f
    RewriteCond %{REQUEST_FILENAME} !-d
    RewriteRule . index.php [L]
</IfModule>

# Configuracoes de seguranca
<Files "data/*.json">
    Order allow,deny
    Deny from all
</Files>
```

---

## 13. Script Python trim_audio.py

### Finalidade
Cortar audios de referencia para max N segundos para evitar CUDA Out of Memory na GPU RTX 3060 12GB.

### Como funciona (SEM ffmpeg, Python puro)

**Para WAV:**
- Usa modulo `wave` nativo do Python
- Calcula `n_frames = int(max_seconds * framerate)`
- Le apenas esses frames
- Escreve novo WAV com mesmos parametros

**Para MP3:**
- Le arquivo binario inteiro
- Pula tag ID3v2 (synchsafe integer)
- Escaneia sync words (0xFF seguido de 0xE0+)
- Decodifica header MPEG (versao, layer, bitrate, sample rate)
- Calcula tamanho do frame: `144 * bitrate / samplerate + padding`
- Duracao: `frame_count * 1152 / samplerate`
- Para quando duracao >= max_seconds

### Uso
```bash
python3 trim_audio.py input.wav output.wav 10
python3 trim_audio.py input.mp3 output.mp3 10
```

---

## 14. Sistema de Tunnel Automatico

### Por que precisa de tunnel?
O PHP server esta na HostGator (nuvem). A GPU esta no PC local. O PHP precisa acessar `localhost:7860` do PC, mas so pode acessar URLs publicas. O tunnel cria uma URL publica apontando para `localhost:7860`.

### Fluxo automatico:
1. Usuario liga o PC e roda `iniciar.bat`
2. `iniciar.bat` inicia omnivoice-demo na porta 7860
3. `iniciar.bat` abre `start_tunnel.ps1`
4. `start_tunnel.ps1` cria tunnel: `npx localtunnel --port 7860`
5. Localtunnel gera URL: `https://random-name.loca.lt`
6. Script captura URL e faz GET para `update_tunnel.php?auth=...&url=...`
7. PHP atualiza `tunnel-config.ini` com nova URL
8. `get_tunnel.php` retorna URL para quem precisar
9. `generate.php` usa URL para conectar a GPU local

### Alternativas consideradas:
| Tunnel | Suporta SSE | Precisa conta | Gratuito | Status |
|--------|:-----------:|:-------------:|:--------:|--------|
| **Localtunnel** | SIM | NAO | SIM | **USANDO** |
| Cloudflare Quick Tunnel | NAO | NAO | SIM | Descartado |
| ngrok | SIM | SIM (pago) | NAO | Descartado |

---

## 15. Procedimentos de Backup

### Script backup.sh
```bash
# Criar backup com label
./backup.sh backup nome-do-backup

# Criar backup automatico (usa timestamp)
./backup.sh backup

# Listar backups disponiveis
./backup.sh list

# Restaurar backup
./backup.sh restore nome-do-backup
```

### O que o backup faz:
1. Cria tag git: `backup-{label}`
2. Copia arquivos-chave para `/home/z/my-project/backups/{label}/`
   - `src/app/page.tsx`, `src/app/admin/page.tsx`
   - `src/lib/*.ts`, `src/components/*.tsx`
   - `src/app/api/` (inteiro)
   - `package.json`, `vercel.json`, `.env*`
3. Salva info do commit e branch
4. Push tag para GitHub (backup remoto)
5. Limpa backups antigos (mantem ultimos 10)

### Backup estavel de referencia:
- **Commit**: `6ba5549` (funcionando SEM estalos)
- **Restaurar**: `git checkout 6ba5549 -- php-server/generate-omnivoice.php src/app/api/omnivoice-generate/route.ts src/app/page.tsx`

---

## 16. Instalacao PHP Local (XAMPP)

Para rodar PHP localmente na maquina Windows (elimina tunnel):

### Passo 1: Instalar XAMPP
1. Baixar: https://www.apachefriends.org/download.html (versao 7.4.x ou 8.x)
2. Instalar em `C:\xampp` (desmarcar MySQL, FileZilla, Mercury, Tomcat)

### Passo 2: Configurar Apache
1. Editar `C:\xampp\apache\conf\httpd.conf`
2. Trocar `Listen 80` para `Listen 8080`

### Passo 3: Habilitar CURL
1. Editar `C:\xampp\php\php.ini`
2. Remover `;` de `extension=curl` e `extension=mbstring`

### Passo 4: Copiar arquivos
1. Copiar pasta `php-local/` para `C:\xampp\htdocs\php-local\`
2. Copiar `iniciar_local.bat` e `tunnel_php.ps1` para pasta desejada

### Passo 5: Rodar
1. Duplo clique em `iniciar_local.bat`
2. Acessar `http://localhost:8080/php-local/teste_local.html`

**Vantagem**: Fluxo totalmente local (Browser -> PHP Local -> GPU Local), zero tunnel, zero latencia de rede.

---

## 17. Troubleshooting

### Audio com estalos/chiaidos
- **Situacao**: Estalos comecaram apos commit `1b550f9`, persistem mesmo apos revert
- **Possiveis causas**:
  1. Cache do Vercel (ETag antigo) -> Fazer redeploy forcado
  2. Cache do navegador (Service Worker) -> Limpar dados de navegacao completa
  3. Arquivos PHP desatualizados -> Comparar todos PHPs do servidor vs git
  4. Problema no proprio VozPro/F5-TTS no PC
- **Ver**: `VOZPRO-TROUBLESHOOTING-ESTALOS.pdf` para guia detalhado

### CUDA Out of Memory
- **Causa**: Audio de referencia muito longo (>10s)
- **Solucao**: `trim_audio.py` corta automaticamente para 10s
- **Verificacao**: Certificar-se de que Python esta disponivel no PHP server

### GPU Offline
- **Verificar**: `iniciar.bat` esta rodando?
- **Verificar**: Tunnel esta ativo? Abrir URL do tunnel no navegador
- **Verificar**: `get_tunnel.php` retorna `{"status":"online",...}`?
- **Verificar**: VozPro responde em `http://localhost:7860`

### "Failed to fetch" no upload
- **Causa**: CORS entre Vercel e PHP
- **Solucao**: Upload via proxy server-to-server (Vercel -> PHP), nao direto do browser

### "Unexpected end of JSON input"
- **Causa**: PHP retornou resposta vazia (HTTP 500)
- **Solucao**: Parsing seguro (ler como texto primeiro antes de JSON.parse)

### Timeout Vercel (10s/60s)
- **Causa**: Vercel Hobby tem limites rigorosos
- **Solucao**: Usar PHP direto (SSE streaming sem limite)

### Tunnel URL muda a cada reinicio
- **Solucao**: `start_tunnel.ps1` + `update_tunnel.php` atualizam automaticamente

### Porta 7860 em uso
- **Solucao**: `iniciar.bat` faz `taskkill /F /IM python.exe` antes de iniciar

### `update_tunnel.php` sobrescreve config.php
- **Causa**: Script pode escrever em formato INI, destruindo os `define()`
- **Solucao**: Usar `tunnel-config.ini` separado (ja implementado)

---

## 18. Todos os Bugs Conhecidos e Status

| Bug | Area | Status | Solucao |
|-----|------|--------|---------|
| ~~Colchetes pronuncia removidos~~ | Backend | ✅ Corrigido | Linha 258 deletada |
| ~~Colchetes fora do regex permitido~~ | Backend | ✅ Corrigido | `[]` adicionado ao regex |
| SSML removido em vez de convertido | Backend | ⚠️ Pendente | Usar `parseSSML()` |
| Dicionario 1100+ hardcoded | Pronuncia | ⚠️ Parcial | G2P espeak-ng criado |
| PHP sem pre-processamento pronuncia | PHP | ⚠️ Pendente | Enviar texto pre-processado |
| Pipeline F5 vs OmniVoice misturado | Pronuncia | ⚠️ Pendente | Separar logica |
| Estalos no audio | Audio | ⚠️ Investigacao | Causa nao confirmada |
| update_tunnel sobrescreve config.php | PHP | ✅ Parcial | tunnel-config.ini |
| Limite 800 chars | Backend | ⚠️ Pendente | Aumentar ou remover |
| generate-dict.py nao integrado | Pipeline | ⚠️ Pendente | Integrar no build |

---

## 19. Limitacoes Conhecidas

| Limitacao | Impacto | Possivel Solucao |
|-----------|---------|-----------------|
| Vercel Hobby timeout 60s | Rotas que nao usam PHP proxy | Upgrade Vercel Pro |
| PC precisa estar ligado para gerar voz | TTS indisponivel se PC desligado | Servidor dedicado ou cloud GPU (RunPod) |
| Sem sistema de usuarios | So uma conta admin | Implementar auth completa |
| Trilhas limitadas a 80s | Pode ser curto para alguns casos | Aumentar MAX_DURATION |
| Audio de referencia max 10s | GPU 12GB CUDA OOM | GPU maior ou cloud GPU |
| Dominio provisorio | omnivoice-umber.vercel.app | Configurar dominio personalizado |
| Sem cache de resultado | Geracao duplicada do mesmo texto | Hash texto+voz no PHP |

---

## 20. Pesquisa e Referencias

### Sonauto/Melodia v3 (Referencia de Qualidade)
- **Tipo**: Latent Diffusion Model (LDM) a 21.5Hz
- **Por que funciona perfeito**: NUNCA passa por etapa G2P; aprende relacao texto-audio diretamente no espaco latente continuo
- **API**: `https://api.sonauto.ai/v1/generations/v3`
- **Licao**: Eliminar dependencia de G2P baseado em caracteres

### Modelos Open-Source Relevantes
| Sistema | Tipo | G2P | Pronuncia PT | Nota |
|---------|------|-----|:------------:|------|
| **DiffSinger** | SVS | Sim | ⭐⭐ | Melhor para SVS controlado |
| **F5-TTS** | TTS | NAO | ⭐⭐⭐ | Baseado em caracteres |
| **CosyVoice** | TTS | LLM | ⭐⭐ | Alta qualidade |
| **espeak-ng** | G2P | Sim | ⭐⭐⭐⭐ | 106 idiomas, <10ms/palavra |
| **Transinger** | SVS | IPA | ⭐⭐⭐⭐ | Cross-lingual |

### Papers de Referencia
- Sonauto: "Long-form music generation with latent diffusion" (arXiv:2404.10301)
- DiffSinger: AAAI 2022 (arXiv:2105.02446)
- F5-TTS: "A Fairytaler that Fakes Fluent and Faithful Speech" (arXiv:2410.06885)
- Lightweight Multilingual G2P for Romance Languages (arXiv:2509.03300)

---

## 21. Roadmap Futuro

### Urgente (fazer agora)
1. ~~Deletar linha 258 de route.ts~~ ✅ FEITO
2. Trocar `stripSSMLForTTS()` por `parseSSML()` no backend
3. Verificar fluxo PHP - garantir texto pre-processado chega ao PHP
4. Separar pipeline F5-TTS vs OmniVoice

### Alta prioridade (esta semana)
5. Integrar API G2P espeak-ng no pipeline de producao
6. Integrar `generate-dict.py` no build
7. Migrar dicionario para JSON externo (carregado via API)

### Media prioridade (este mes)
8. Microservico G2P espeak-ng standalone
9. Remover entradas manuais cobertas pelo G2P
10. Cache de resultado (hash texto+voz)

### Baixa prioridade (proximo trimestre)
11. Duration Predictor (controla duracao de cada fonema)
12. Pitch Predictor (controla entonacao/F0)
13. Pipeline DiffSinger completo
14. Dominio personalizado
15. Sistema de usuarios completo
16. PHP admin panel no sorteiomax

---

## 22. Comandos Uteis

```bash
# Build local
npm run build

# Gerar Prisma client
npx prisma generate

# Push schema pro banco
npx prisma db push

# Criar migration
npx prisma migrate dev --name nome

# Deploy (auto via git push)
git push origin main

# Backup do projeto
./backup.sh backup

# Listar backups
./backup.sh list

# Restaurar backup
./backup.sh restore nome

# Adicionar componente shadcn/ui
npx shadcn@latest add [component-name]

# Gerar dicionario de pronuncia com espeak-ng
python3 scripts/generate-dict.py

# Testar espeak-ng
espeak-ng -v pt-br --ipa -x "hoje"
```

---

## 23. Manutencao do Sistema

### Alterar limite de duracao das trilhas
- Editar `const MAX_DURATION = 80` em `src/app/admin/page.tsx`
- Alterar `const MP3_BITRATE = 192` se necessario

### Trocar modelo de IA
1. Alterar URL do tunnel/modelo
2. Modificar parametros em `/api/generate/route.ts` e `php-server/generate.php`
3. Atualizar valores de instruct suportados

### Atualizar PHP server
1. Acessar painel do hosting (cPanel/FTP)
2. Fazer backup do arquivo existente
3. Substituir arquivos na pasta `omnivoice/`
4. Verificar permissoes (644 para arquivos, 755 para pastas)

### Modificar schema do banco
1. Editar `prisma/schema.prisma`
2. `npx prisma migrate dev --name nome`
3. Commit e push
4. Producao: `npx prisma db push`

---

## 24. Decisoes Arquiteturais

| Decisao | Motivo |
|---------|--------|
| PHP hosting para audio | Sem limite de tamanho, sem custo extra, ja tinha o servidor |
| MP3 encoding em vez de WAV | Qualidade 10x melhor no mesmo tamanho (192kbps stereo vs 11025Hz mono) |
| lamejs via CDN em vez de npm | Evita problemas com bundler (require nativo no Node) |
| PHP proxy para TTS | Bypassa timeout de 60s do Vercel Hobby |
| Cookie-based auth em vez de JWT | Mais simples, sem dependencia, httpOnly seguro |
| Prisma generate no build | `migrate deploy` precisa de conexao durante build |
| GPU local em vez de HF Space | Sem quota, sem custo, mais rapido, melhor controle |
| Localtunnel em vez de Cloudflare/ngrok | Gratuito, sem cadastro, suporta SSE |
| Audio trimming automatico | Evita CUDA OOM na GPU 12GB, melhora qualidade |
| Deferred upload (so envia ao salvar) | Melhor UX: usuario pode cancelar antes |
