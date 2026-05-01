# VozPro - Documentacao Completa do Sistema

> Este documento foi escrito como referencia para uma IA que precise trabalhar neste projeto em outra conversa.
> Contem TUDO que voce precisa saber sem precisar vasculhar os arquivos.

---

## 1. O QUE E O PROJETO

**VozPro** e um produto comercial de sintese de voz (TTS - Text-to-Speech) que usa o modelo **OmniVoice** hospedado no HuggingFace Spaces. O sistema permite:

- Clonagem de voz a partir de audios de referencia (3-10 segundos)
- Geracao de voz com diferentes emocoes/estilos (cada variacao usa um audio de referencia diferente)
- Mixagem de voz com trilha musical de fundo (feita no client-side via Web Audio API)
- Painel administrativo para gerenciar vozes, variacoes e trilhas

**Publico-alvo**: Estudios de gravacao, produtoras de conteudo, agencias de publicidade, criadores de conteudo que precisam de vozes profissionais para propagandas, videos, podcasts, etc.

**Modelo de negocio**: Produto SaaS - o usuario escolhe uma voz, digita o texto, gera o audio e baixa. O admin cadastra vozes e trilhas pelo painel.

---

## 2. STACK TECNOLOGICA

| Camada | Tecnologia | Detalhes |
|--------|-----------|----------|
| Frontend | Next.js 16 (App Router) | React 19, TypeScript |
| UI | shadcn/ui + Tailwind CSS 4 | Radix UI primitives, dark theme customizado |
| Backend | Next.js API Routes | Serverless functions no Vercel |
| Banco de Dados | PostgreSQL (Neon) | Acesso via Prisma ORM |
| ORM | Prisma 6 | Schema em `prisma/schema.prisma` |
| Armazenamento de Audio | Vercel Blob | Trilhas musicais (arquivos de fundo) |
| Armazenamento de Ref Audio | HuggingFace Space | Audios de referencia de voz ficam no servidor HF |
| IA/TTS | OmniVoice (HuggingFace Space) | API Gradio SSE em `https://k2-fsa-omnivoice.hf.space` |
| Mixagem | Web Audio API (client-side) | OfflineAudioContext + AudioBuffer → WAV |
| Autenticacao | Custom JWT-like (cookie) | SHA-256 hash + timestamp, cookie httpOnly |
| Deploy | Vercel | Serverless, funcoes com ate 300s timeout |
| Repositorio | GitHub | `https://github.com/rgdweb/Omnivoice` |

---

## 3. ESTRUTURA DE ARQUIVOS

```
Omnivoice/
├── prisma/
│   ├── schema.prisma              # Schema do banco (3 models: Voice, VoiceVariation, Track)
│   ├── migrations/
│   │   └── 0001_init/
│   │       └── migration.sql      # SQL inicial para criar as tabelas
│   └── migration_lock.toml
├── public/
│   ├── logo.svg                   # Logo do VozPro (35KB SVG)
│   └── robots.txt
├── src/
│   ├── app/
│   │   ├── globals.css            # Tema customizado (dark violet/slate)
│   │   ├── layout.tsx             # Root layout (Geist font, Toaster, metadata)
│   │   ├── page.tsx               # CLIENT PAGE - Interface principal do usuario
│   │   ├── admin/
│   │   │   ├── layout.tsx         # Admin layout (sem sidebar, so children)
│   │   │   ├── login/
│   │   │   │   └── page.tsx       # Tela de login admin (senha unica)
│   │   │   └── page.tsx           # ADMIN DASHBOARD - CRUD vozes/variacoes/trilhas
│   │   └── api/
│   │       ├── route.ts           # GET /api - Health check (Hello World)
│   │       ├── auth/
│   │       │   ├── route.ts       # POST login / DELETE logout
│   │       │   └── verify/
│   │       │       └── route.ts   # GET verifica se cookie de admin e valido
│   │       ├── generate/
│   │       │   └── route.ts       # POST - ROTA PRINCIPAL DE GERACAO TTS
│   │       ├── upload-voice/
│   │       │   └── route.ts       # POST - Upload ref audio para HuggingFace Space
│   │       ├── upload-track/
│   │       │   └── route.ts       # POST - Upload trilha para Vercel Blob
│   │       ├── voices/
│   │       │   ├── route.ts       # GET (publico) / POST (admin)
│   │       │   └── [id]/
│   │       │       ├── route.ts   # GET / PUT / DELETE
│   │       │       └── variations/
│   │       │           └── route.ts # GET / POST (adicionar variacao)
│   │       ├── variations/
│   │       │   └── [id]/
│   │       │       └── route.ts   # PUT / DELETE variacao
│   │       └── tracks/
│   │           ├── route.ts       # GET (publico) / POST (admin)
│   │           └── [id]/
│   │               └── route.ts   # PUT / DELETE
│   ├── components/
│   │   ├── audio-player.tsx       # Player de audio generico (funciona com Blob URLs)
│   │   └── ui/                    # 40+ componentes shadcn/ui
│   ├── hooks/
│   │   ├── use-mobile.ts
│   │   └── use-toast.ts
│   └── lib/
│       ├── auth.ts                # Autenticacao: createSession, verifySession, login, getAdminSession
│       ├── blob.ts                # Vercel Blob: uploadToBlob, deleteFromBlob, isBlobUrl, getBlobMetadata
│       ├── db.ts                  # Prisma client singleton (globalForPrisma pattern)
│       └── utils.ts               # cn() helper (tailwind-merge + clsx)
├── .env.example                   # Template de variaveis de ambiente
├── .gitignore
├── components.json                # shadcn/ui config
├── eslint.config.mjs
├── next.config.ts                 # Remote patterns para Vercel Blob e HF
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── vercel.json                    # Cache headers para API routes
```

---

## 4. BANCO DE DADOS (Prisma Schema)

### 4.1 Model: Voice
```
Voice {
  id          String   @id @default(cuid())
  name        String                    // "Ana", "Carlos", "Maria"
  description String   @default("")
  gender      String   @default("Auto") // male, female, Auto
  age         String   @default("Auto") // child, teenager, young adult, middle-aged, elderly, Auto
  accent      String   @default("Auto") // portuguese accent, american accent, brazilian accent, etc
  pitch       String   @default("Auto") // very low pitch, low pitch, moderate pitch, high pitch, very high pitch, Auto
  previewUrl  String   @default("")     // URL para preview audio
  order       Int      @default(0)      // Ordem de exibicao
  active      Boolean  @default(true)   // Se aparece para o cliente
  variations  VoiceVariation[]          // Relacao 1:N
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 4.2 Model: VoiceVariation
```
VoiceVariation {
  id           String   @id @default(cuid())
  voiceId      String                    // FK para Voice
  label        String                    // "Neutra", "Animada", "Empresarial", "Dramatica"
  emoji        String   @default("")     // "😊", "🎉", "💼", "🎭"
  refAudioPath String                    // CAMINHO no servidor HF Space (para Gradio FileData)
  refAudioName String   @default("")     // Nome original do arquivo
  refText      String   @default("")     // Transcricao do audio de referencia
  instruct     String   @default("")     // Instrucao para o modelo (valores suportados: whisper, male, female, etc)
  order        Int      @default(0)
  active       Boolean  @default(true)
  voice        Voice    @relation(...)   // Cascade delete
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}
```

### 4.3 Model: Track
```
Track {
  id          String   @id @default(cuid())
  name        String                    // "Corporativo", "Eletronica", "Acustica"
  description String   @default("")
  emoji       String   @default("")     // "🎵", "🎸", "🎹"
  audioPath   String                    // Vercel Blob URL (url completa com https://...)
  duration    Float    @default(0)      // Duracao em segundos
  order       Int      @default(0)
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 4.4 Indices e Relacoes
- `VoiceVariation.voiceId` tem indice
- `VoiceVariation` tem FK para `Voice` com `onDelete: Cascade`
- Voice 1:N VoiceVariation

---

## 5. FLUXO PRINCIPAL DE GERACAO DE VOZ

### 5.1 Visao Geral
```
Usuario (cliente) → Seleciona Voz + Variacao → Digita Texto → Clica "Gerar Voz"
    ↓
POST /api/generate { variationId, text, language, trackId?, trackVolume?, speed, numStep, guidanceScale }
    ↓
1. Busca variacao no banco (refAudioPath, refText, instruct)
2. Constroi objeto FileData do Gradio com refAudioPath
3. Monta array de parametros para _clone_fn do OmniVoice
4. POST para HF Space /gradio_api/call/_clone_fn → obtem event_id
5. Polling SSE em /gradio_api/call/_clone_fn/{event_id} (ate 120 tentativas, 1.5s cada)
6. Recebe URL do audio gerado (do HF Space)
7. Download do audio gerado → converte para base64 data URI
8. Se trackId foi fornecido, busca Track no banco e retorna trackUrl para mixagem client-side
9. Retorna JSON: { audioUrl: dataURI, trackUrl?, trackVolume?, clientMix: true }
    ↓
Cliente recebe resposta:
  - Se clientMix=true + trackUrl: mixa voz + trilha via Web Audio API (OfflineAudioContext)
  - Se so voz: reproduz direto
  - Download: converte data URI para Blob → download
```

### 5.2 Parametros do _clone_fn (OmniVoice)
```
data = [
  text,                   // [0] Texto para sintetizar
  language || 'Auto',     // [1] Idioma
  refAudioFileData,       // [2] Audio de referencia (Gradio FileData object)
  refText,                // [3] Transcricao do ref audio
  instructStr,            // [4] Instrucoes (genero, idade, pitch, accent, whisper, etc)
  numStep ?? 32,          // [5] Passos de inferencia (4-64, mais = melhor qualidade)
  guidanceScale ?? 2.0,   // [6] CFG scale (0-4)
  true,                   // [7] denoise (sempre true)
  speed ?? 1.0,           // [8] Velocidade (0.5-1.5)
  null,                   // [9] duration (null = automatico)
  true,                   // [10] preprocess_prompt
  true,                   // [11] postprocess_output
]
```

### 5.3 Formato do refAudioFileData (Gradio)
```json
{
  "path": "/tmp/gradio/xxx/audio_ref.wav",
  "orig_name": "ref_audio.wav",
  "mime_type": "audio/wav",
  "is_stream": false,
  "meta": { "_type": "gradio.FileData" }
}
```

### 5.4 Idiomas Suportados
Auto, Portuguese, English, Spanish, French, German, Italian, Chinese, Japanese, Korean, Russian, Arabic, Hindi

### 5.5 Valores de Instruct Suportados pelo OmniVoice
`whisper`, `male`, `female`, `young adult`, `middle-aged`, `low pitch`, `high pitch`, `moderate pitch`

---

## 6. MIXAGEM DE AUDIO (Client-Side)

### 6.1 Como Funciona
A mixagem e feita inteiramente no browser usando Web Audio API:
1. Cria `AudioContext` para decodificar os audios
2. Cria `OfflineAudioContext` com duracao da voz
3. Conecta voz (volume 100%) e trilha (volume configuravel via GainNode)
4. `startRendering()` → AudioBuffer mixado
5. Converte AudioBuffer → WAV (PCM 16-bit) → base64 data URI

### 6.2 Por que Client-Side?
- Vercel serverless nao suporta ffmpeg
- Nao precisa de bibliotecas nativas
- O browser ja tem Web Audio API nativo
- Offload do processamento para o dispositivo do usuario

### 6.3 Funcoes Importantes em page.tsx
- `mixAudioClientSide(voiceDataUri, trackUrl, trackVolume)` → data URI do mix
- `audioBufferToWav(buffer)` → converte AudioBuffer para WAV data URI
- `writeString(view, offset, str)` → helper para WAV header

---

## 7. SISTEMA DE AUTENTICACAO

### 7.1 Como Funciona
- **Nao tem sistema de usuarios** - e uma unica senha de admin
- Login: POST `/api/auth` com `{ password }` → seta cookie `vozpro_admin`
- O cookie contem: `base64(timestamp:sha256(timestamp + ADMIN_PASSWORD + JWT_SECRET))`
- Validade: 24 horas
- Cookie: httpOnly, secure em producao, sameSite=lax

### 7.2 Variaveis de Ambiente
```
ADMIN_PASSWORD=VozPro@2026       # Senha para acessar /admin
JWT_SECRET=vozpro-secret-2026-xK9mP2  # Chave para assinar o cookie
```

### 7.3 Fluxo de Protecao
1. Admin acessa `/admin` → `page.tsx` chama GET `/api/auth/verify`
2. Se nao autenticado → redirect para `/admin/login`
3. Login → POST `/api/auth` → cookie setado → redirect para `/admin`
4. Todas as rotas admin verificam `getAdminSession()` antes de executar

---

## 8. VARIAVEIS DE AMBIENTE

| Variavel | Onde Usar | Obrigatorio | Descricao |
|----------|----------|-------------|-----------|
| `DATABASE_URL` | Vercel (Neon auto-configura) | SIM | URL de conexao PostgreSQL do Neon |
| `BLOB_READ_WRITE_TOKEN` | Vercel (auto-configura ao ativar Blob) | SIM | Token para Vercel Blob storage |
| `ADMIN_PASSWORD` | Vercel (manual) | SIM | Senha do painel admin |
| `JWT_SECRET` | Vercel (manual) | SIM | Chave secreta para cookies de sessao |
| `HF_SPACE_URL` | Vercel (manual) | SIM | URL do HuggingFace Space OmniVoice |

### Valores Atuais (producao):
```
DATABASE_URL=postgresql://neondb_owner:npg_8jNPdgtB3kQD@ep-blue-band-ac85wa8e-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
ADMIN_PASSWORD=VozPro@2026
JWT_SECRET=vozpro-secret-2026-xK9mP2
HF_SPACE_URL=https://k2-fsa-omnivoice.hf.space
```

> **IMPORTANTE**: O DATABASE_URL acima foi exposto no chat. Recomenda-se regenerar a senha do Neon.

### Fallbacks no Codigo:
- `HF_SPACE_URL` tem fallback: `'https://k2-fsa-omnivoice.hf.space'`
- `ADMIN_PASSWORD` tem fallback: `'VozPro@2026'`
- `JWT_SECRET` tem fallback: `'vozpro-secret-key-2026'`

---

## 9. DEPLOY NO VERCEL - GUIA COMPLETO

### 9.1 Prerequisitos
1. Conta no Vercel (vercel.com)
2. Conta no Neon (neon.tech) - para PostgreSQL
3. Repositorio no GitHub: `https://github.com/rgdweb/Omnivoice`

### 9.2 Passo a Passo

#### Passo 1: Criar o Projeto no Vercel
1. Acesse https://vercel.com/new
2. Importe o repositorio `rgdweb/Omnivoice`
3. Framework: Next.js (auto-detectado)
4. NAO clique em Deploy ainda - va em Environment Variables primeiro

#### Passo 2: Configurar o Banco de Dados (Neon)
1. Acesse https://console.neon.tech
2. Crie um projeto (regiao: sa-east-1 para Brasil)
3. Copie a `DATABASE_URL`
4. No Vercel: Settings > Environment Variables > Adicione:
   - Key: `DATABASE_URL`
   - Value: `postgresql://neondb_owner:...`
   - Environments: Production, Preview, Development (todos)

> **Dica**: Se voce instalar a integracao Neon no Vercel, ela auto-configura o DATABASE_URL.

#### Passo 3: Ativar Vercel Blob
1. No dashboard do Vercel, va no projeto > Storage
2. Clique "Create Database" > selecione "Blob"
3. Isso auto-configura `BLOB_READ_WRITE_TOKEN` nas variaveis de ambiente

#### Passo 4: Adicionar Variaveis Restantes
No Vercel: Settings > Environment Variables, adicione:

| Key | Value | Environments |
|-----|-------|-------------|
| `ADMIN_PASSWORD` | `VozPro@2026` | Production, Preview, Development |
| `JWT_SECRET` | `vozpro-secret-2026-xK9mP2` | Production, Preview, Development |
| `HF_SPACE_URL` | `https://k2-fsa-omnivoice.hf.space` | Production, Preview, Development |

#### Passo 5: Deploy
1. Clique em "Deploy" ou faça um push para o GitHub
2. O Vercel detecta o push e faz deploy automaticamente

#### Passo 6: Criar as Tabelas no Banco
**IMPORTANTE**: As tabelas precisam ser criadas manualmente uma unica vez.

Opcao A - Via terminal local (com .env configurado):
```bash
npx prisma db push
```

Opcao B - Via SQL no console do Neon, execute o conteudo de `prisma/migrations/0001_init/migration.sql`:
```sql
CREATE TABLE "Voice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "gender" TEXT NOT NULL DEFAULT 'Auto',
    "age" TEXT NOT NULL DEFAULT 'Auto',
    "accent" TEXT NOT NULL DEFAULT 'Auto',
    "pitch" TEXT NOT NULL DEFAULT 'Auto',
    "previewUrl" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Voice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VoiceVariation" (
    "id" TEXT NOT NULL,
    "voiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '',
    "refAudioPath" TEXT NOT NULL,
    "refAudioName" TEXT NOT NULL DEFAULT '',
    "refText" TEXT NOT NULL DEFAULT '',
    "instruct" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "VoiceVariation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Track" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT NOT NULL DEFAULT '',
    "audioPath" TEXT NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Track_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VoiceVariation_voiceId_idx" ON "VoiceVariation"("voiceId");

ALTER TABLE "VoiceVariation" ADD CONSTRAINT "VoiceVariation_voiceId_fkey"
    FOREIGN KEY ("voiceId") REFERENCES "Voice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

### 9.3 Problemas Conhecidos e Solucoes

| Problema | Causa | Solucao |
|----------|-------|---------|
| `Environment variable not found: DATABASE_URL` no build | O script de build tinha `prisma migrate deploy` que precisa do DB | **JA CORRIGIDO**: build script agora e `prisma generate && next build` |
| 404 NOT_FOUND no deploy | Variaveis de ambiente no projeto errado, ou build falhou | Verifique se as variaveis estao no projeto CORRETO do Vercel |
| Timeout na geracao de voz | TTS demora mais de 60s (limite do Vercel Hobby) | Precisa do Vercel Pro (maxDuration ate 300s) ou aceitar falhas em textos longos |
| `BLOB_READ_WRITE_TOKEN` missing | Nao ativou Vercel Blob no projeto | Va em Storage > ative Blob para o projeto |

### 9.4 Configuracao Especifica do Vercel

**vercel.json** (ja no repo):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "headers": [
    {
      "source": "/api/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache, no-store, must-revalidate" }
      ]
    }
  ]
}
```

**next.config.ts** (ja no repo):
- `typescript.ignoreBuildErrors: true` (para acelerar builds)
- `reactStrictMode: false`
- Remote patterns para: `*.blob.vercel-storage.com`, `public.blob.vercel-storage.com`, `*.hf.space`

**Build script** (package.json):
```json
"build": "prisma generate && next build",
"postinstall": "prisma generate"
```

**maxDuration** em `/api/generate/route.ts`:
```typescript
export const maxDuration = 300  // 5 minutos (requer Vercel Pro)
```

---

## 10. API ROUTES - REFERENCIA COMPLETA

### 10.1 Rotas Publicas (sem autenticacao)

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api` | Health check → `{ message: "Hello, world!" }` |
| GET | `/api/voices` | Lista vozes ativas com variacoes ativas |
| GET | `/api/tracks` | Lista trilhas ativas |
| POST | `/api/generate` | Gera voz via TTS (body: variationId, text, language, etc) |
| POST | `/api/auth` | Login admin (body: `{ password }`) → seta cookie |
| GET | `/api/auth/verify` | Verifica se admin esta autenticado |
| DELETE | `/api/auth` | Logout admin (limpa cookie) |

### 10.2 Rotas de Upload

| Metodo | Rota | Auth | Descricao |
|--------|------|------|-----------|
| POST | `/api/upload-voice` | Nao | Upload ref audio para HF Space (FormData com file) |
| POST | `/api/upload-track` | Admin | Upload trilha para Vercel Blob (FormData com file) |

### 10.3 Rotas Admin (requer cookie de admin)

| Metodo | Rota | Descricao |
|--------|------|-----------|
| GET | `/api/admin/voices` | Lista TODAS as vozes (incluindo inativas) |
| GET | `/api/admin/tracks` | Lista TODAS as trilhas (incluindo inativas) |
| POST | `/api/voices` | Cria nova voz |
| PUT | `/api/voices/[id]` | Atualiza voz |
| DELETE | `/api/voices/[id]` | Deleta voz (cascade: deleta variacoes) |
| GET | `/api/voices/[id]` | Busca voz especifica |
| POST | `/api/voices/[id]/variations` | Adiciona variacao a voz |
| PUT | `/api/variations/[id]` | Atualiza variacao |
| DELETE | `/api/variations/[id]` | Deleta variacao |
| POST | `/api/tracks` | Cria trilha |
| PUT | `/api/tracks/[id]` | Atualiza trilha |
| DELETE | `/api/tracks/[id]` | Deleta trilha (deleta blob tambem) |

---

## 11. UPLOAD DE AUDIOS - COMO FUNCIONA

### 11.1 Audio de Referencia de Voz
- Admin faz upload pelo painel → POST `/api/upload-voice` (FormData)
- A rota envia o arquivo para `https://k2-fsa-omnivoice.hf.space/gradio_api/upload`
- O HF Space retorna um array com o caminho do arquivo no servidor: `["/tmp/gradio/xxx/audio.wav"]`
- Esse caminho e salvo em `VoiceVariation.refAudioPath`
- Na geracao, esse caminho e usado para construir o objeto FileData do Gradio

### 11.2 Trilha Musical
- Admin faz upload pelo painel → POST `/api/upload-track` (FormData, requer auth)
- A rota faz upload para Vercel Blob via `uploadToBlob()`
- Retorna a URL completa do blob (ex: `https://xxx.blob.vercel-storage.com/tracks/123-audio.mp3`)
- Essa URL e salva em `Track.audioPath`
- Quando deleta uma trilha, o blob tambem e deletado via `deleteFromBlob()`

---

## 12. PAGINA DO CLIENTE (src/app/page.tsx)

### 12.1 Interface
- Header: Logo VozPro + badge "Online"
- Hero: "Crie Vozes Profissionais"
- Grid 5 colunas: 3 colunas (configuracao) + 2 colunas (resultado)

### 12.2 Fluxo do Usuario
1. Escolhe uma voz (cards com nome + descricao)
2. Escolhe estilo/emocao (botoes com emoji + label)
3. Digita o texto (textarea com contador de caracteres)
4. Seleciona idioma (Auto, PT, EN, ES, FR, DE, IT, ZH, JA, KO, RU, AR, HI)
5. Opcional: ativa trilha musical, escolhe trilha, ajusta volume
6. Opcional: configura avancado (passos, CFG, velocidade)
7. Clica "Gerar Voz" → loading state
8. Resultado: player de audio + badges (voz, variacao, trilha) + botoes (play/pause, stop, download)
9. Se mixado: pode alternar entre "Com trilha" e "Somente voz"

### 12.3 Painel de Debug
- Mostra audioUrl, mixedAudioUrl, isMixed
- Exibe ultima resposta da API como JSON
- Botao para copiar resposta

### 12.4 Estados de Loading
- Loading inicial: spinner centralizado
- Gerando: spinner no botao + texto "Gerando..."
- Resultado vazio: icone de waveform + "Nenhum audio gerado ainda"

---

## 13. PAGINA DO ADMIN (src/app/admin/page.tsx)

### 13.1 Interface
- Header: Logo + botoes refresh e logout
- Tabs: "Vozes" e "Trilhas" com contadores

### 13.2 Tab Vozes
- Botao "Nova Voz" → Dialog com campos: nome*, descricao, genero, idade, tom, sotaque
- Cada voz mostra: nome, descricao, badges (genero, idade, tom), switch ativo/inativo, botoes editar/deletar
- Variacoes dentro de cada voz: label, emoji, badge audio OK/sem audio, badge instruct, badge inativa
- Botoes por variacao: upload/update audio, editar, toggle ativo, deletar
- Dialog de variacao: nome*, emoji, upload audio* (nova) / opcional (edicao), texto ref, instrucao adicional

### 13.3 Tab Trilhas
- Botao "Nova Trilha" → Dialog: nome*, emoji, descricao, upload arquivo audio*
- Cada trilha: emoji, nome, badge ativo/inativa, descricao, duracao
- Botoes: switch ativo/inativo, editar, deletar

### 13.4 Opcoes de Formulario
**Genero**: Auto, Masculino, Feminino
**Idade**: Auto, Crianca, Adolescente, Jovem Adulto, Meia-idade, Idoso
**Tom**: Auto, Muito Grave, Grave, Moderado, Agudo, Muito Agudo
**Sotaque**: Auto, Portugues, Americano, Britanico, Brasileiro
**Instruct**: Nenhum, Sussurrado, Masculino, Feminino, Jovem, Meia-idade, Grave, Agudo, Moderado

---

## 14. DECISOES ARQUITETURAIS IMPORTANTES

### 14.1 Por que PostgreSQL + Prisma em vez de SQLite?
SQLite nao funciona no Vercel porque o filesystem e efemero (desaparece a cada deploy). PostgreSQL e necessario para persistencia de dados em serverless.

### 14.2 Por que Vercel Blob em vez de arquivos locais?
Mesmo motivo: filesystem efemero. Vercel Blob oferece armazenamento persiste na nuvem com URLs publicas.

### 14.3 Por que Web Audio API em vez de ffmpeg?
ffmpeg requer binarios nativos que nao estao disponiveis no Vercel serverless. A Web Audio API roda no browser do usuario.

### 14.4 Por que refAudioPath e salvo como caminho do HF Space?
O Gradio API do OmniVoice espera um objeto FileData com o caminho do arquivo no servidor. Quando fazemos upload via `/gradio_api/upload`, o servidor retorna o caminho temporario. Esse caminho e reutilizado nas chamadas de _clone_fn.

### 14.5 Por que o audio gerado e retornado como base64 data URI?
O audio gerado fica no servidor HF Space com URL temporaria. Para evitar problemas de CORS e expiracao, baixamos o audio no servidor e convertemos para base64. O cliente recebe tudo inline, sem depender de URLs externas.

### 14.6 Por que prisma migrate deploy foi removido do build?
O `prisma migrate deploy` requer conexao com o banco durante o build. No Vercel, isso falhava quando a variavel DATABASE_URL nao estava acessivel durante a fase de build. A solucao e rodar `prisma generate` (que nao precisa de DB) durante o build, e aplicar migracoes separadamente (via `npx prisma db push` ou SQL direto no Neon).

---

## 15. LIMITACOES E CAVEATS

### 15.1 Timeout do Vercel Hobby
- Vercel Hobby (gratuito): funcoes serverless tem timeout maximo de 60 segundos
- A geracao de TTS pode demorar 30-120 segundos dependendo do texto e da fila do HF Space
- **Solucao**: Vercel Pro permite ate 300 segundos
- O codigo ja tem `export const maxDuration = 300` no generate route

### 15.2 Audios de Referencia no HF Space
- Os audios de referencia ficam no filesystem temporario do HF Space
- Se o Space reiniciar, os audios podem ser perdidos
- **Mitigacao**: Re-upload necessario caso o Space reinicie

### 15.3 Sem Sistema de Usuarios
- So existe uma conta de admin (senha unica)
- Nao tem login para clientes - a pagina principal e publica
- Se necessario adicionar autenticacao de clientes, precisaria implementar

### 15.4 Duracao das Trilhas
- A duracao e setada como 0 no upload (ffprobe nao disponivel no Vercel)
- Precisaria ser calculada client-side ou via servico externo

---

## 16. COMO DAR MANUTENCAO

### 16.1 Adicionar Novos Componentes shadcn/ui
```bash
npx shadcn@latest add [component-name]
```
O projeto ja tem 40+ componentes em `src/components/ui/`.

### 16.2 Modificar o Schema do Banco
1. Editar `prisma/schema.prisma`
2. Rodar `npx prisma migrate dev --name nome_da_migracao`
3. Commit os arquivos gerados em `prisma/migrations/`
4. Em producao: rodar `npx prisma db push` ou `npx prisma migrate deploy`

### 16.3 Trocar o Modelo de IA
Se quiser usar outro modelo TTS em vez do OmniVoice:
1. Alterar `HF_SPACE_URL` no .env / Vercel
2. Modificar `/api/generate/route.ts` para ajustar os parametros do novo modelo
3. Modificar `/api/upload-voice/route.ts` para o novo endpoint de upload
4. Atualizar os valores de instruct suportados

### 16.4 Estilos e Tema
- O tema usa violet/purple com background slate escuro
- Cores definidas em `src/app/globals.css` (CSS custom properties)
- Componentes usam classes Tailwind diretamente (nao usa CSS modules)

---

## 17. HISTORICO DE PROBLEMAS RESOLVIDOS

| Data | Problema | Solucao |
|------|----------|---------|
| Sessao 1 | SQLite nao funciona no Vercel | Migracao para PostgreSQL + Prisma |
| Sessao 1 | Arquivos locais nao persistem no Vercel | Migracao para Vercel Blob |
| Sessao 1 | ffmpeg nao funciona no Vercel serverless | Mixagem client-side via Web Audio API |
| Sessao 1 | Build passou localmente | `next build` executado com sucesso |
| Sessao 2 | `Environment variable not found: DATABASE_URL` no build Vercel | Removido `prisma migrate deploy` do build script |
| Sessao 2 | Variaveis de ambiente adicionadas no projeto errado do Vercel | Instrucoes para remover e adicionar no projeto correto |
| Sessao 2 | 404 NOT_FOUND no deploy | Causado por variaveis no projeto errado ou build falho |

---

## 18. STATUS ATUAL DO PROJETO

### O que funciona:
- ✅ Projeto compila (`next build` passa)
- ✅ Schema do banco definido (Prisma + PostgreSQL)
- ✅ API routes implementadas (CRUD completo + geracao TTS)
- ✅ Interface do cliente (selecao de voz, geracao, player, download)
- ✅ Painel admin (login, CRUD vozes/variacoes/trilhas)
- ✅ Upload de audio de referencia para HF Space
- ✅ Upload de trilha para Vercel Blob
- ✅ Mixagem client-side via Web Audio API
- ✅ Repositorio no GitHub atualizado
- ✅ Build script corrigido para Vercel

### O que precisa ser feito:
- ⬜ Deploy com sucesso no Vercel (aguardando configuracao correta das variaveis)
- ⬜ Criar tabelas no banco Neon (rodar SQL ou `npx prisma db push`)
- ⬜ Ativar Vercel Blob no projeto
- ⬜ Testar geracao de voz end-to-end
- ⬜ Cadastrar vozes e variacoes pelo painel admin
- ⬜ Cadastrar trilhas musicais pelo painel admin
- ⬜ Regenerar senha do Neon (DATABASE_URL foi exposta)
- ⬜ Regenerar GitHub Personal Access Token (foi exposto no chat)

### Pendencia critica:
- **Vercel Pro**: Para textos longos, o timeout de 60s do Vercel Hobby pode nao ser suficiente. A rota de geracao tem `maxDuration = 300` que so funciona no Pro.
