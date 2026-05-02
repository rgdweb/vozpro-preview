# OmniVoice TTS - Documentacao Tecnica Completa para Clonagem

> **Objetivo**: Este documento descreve 100% do sistema OmniVoice TTS, incluindo todas as funcoes, fluxos de dados, parametros, APIs, banco de dados, e arquitetura. Foi escrito para que uma IA consiga entender e clonar o sistema completo.

---

## SUMARIO

1. [Visao Geral do Sistema](#1-visao-geral-do-sistema)
2. [Arquitetura Completa](#2-arquitetura-completa)
3. [Fluxo de Geracao de Voz (TTS) - Passo a Passo Detalhado](#3-fluxo-de-geracao-de-voz-tts---passo-a-passo-detalhado)
4. [Fluxo de Upload de Audios](#4-fluxo-de-upload-de-audios)
5. [Banco de Dados - Schema Completo](#5-banco-de-dados---schema-completo)
6. [Todos os Arquivos PHP - Funcoes e Detalhes](#6-todos-os-arquivos-php---funcoes-e-detalhes)
7. [Script Python trim_audio.py](#7-script-python-trim_audiopy)
8. [Scripts Locais (BAT + PowerShell)](#8-scripts-locais-bat--powershell)
9. [Frontend Next.js - Componentes e APIs](#9-frontend-nextjs---componentes-e-apis)
10. [Sistema de Autenticacao](#10-sistema-de-autenticacao)
11. [Sistema de Mixagem de Audio (Client-Side)](#11-sistema-de-mixagem-de-audio-client-side)
12. [Sistema de Tunnel Automatico](#12-sistema-de-tunnel-automatico)
13. [Modelo OmniVoice - Parametros e API Gradio](#13-modelo-omnivoice---parametros-e-api-gradio)
14. [Variaveis de Ambiente](#14-variaveis-de-ambiente)
15. [Como Recriar o Sistema do Zero](#15-como-recriar-o-sistema-do-zero)

---

## 1. VISAO GERAL DO SISTEMA

### O que e
Um aplicativo web de **clonagem de voz** (TTS - Text-to-Speech) que usa o modelo **OmniVoice** da K2-FSA. O usuario seleciona uma voz cadastrada, digita um texto, e o sistema gera um audio com a voz clonada. Opcionalmente, o usuario pode misturar a voz gerada com uma trilha musical de fundo.

### O que faz
- Clonar vozes a partir de audios de referencia (3-10 segundos)
- Gerar voz sintetizada com a voz clonada
- Suportar multiplas variacoes de uma mesma voz (neutra, animada, empresarial, etc.)
- Misturar voz com trilha musical de fundo
- Painel administrativo para gerenciar vozes, variacoes e trilhas
- Download do audio gerado

### Tecnologias usadas
- **Frontend**: Next.js 16 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend**: Next.js API Routes (Vercel) + PHP (HostGator)
- **Banco de Dados**: PostgreSQL (Neon) + Prisma ORM
- **IA/TTS**: OmniVoice (k2-fsa/omnivoice) rodando em GPU local (RTX 3060 12GB)
- **Tunnel**: Localtunnel (npx localtunnel) para expor a GPU local na internet
- **Armazenamento**: PHP server (sorteiomax.com.br)

### URL de producao
- Frontend: `https://omnivoice-umber.vercel.app/`
- PHP Backend: `https://sorteiomax.com.br/omnivoice/`
- GPU Local: `https://xxxx.loca.lt` (URL dinamica via localtunnel)

---

## 2. ARQUITETURA COMPLETA

```
USUARIO (Browser)
    |
    | HTTPS POST (JSON com texto + params)
    v
VERCEL (Next.js) - Cloud Serverless
    |-- /api/php-generate (proxy rapido, nao espera resultado)
    |-- /api/upload-voice (upload ref audio via proxy)
    |-- /api/upload-track (upload trilha via proxy)
    |-- /api/voices (CRUD vozes)
    |-- /api/tracks (CRUD trilhas)
    |-- /api/auth (login admin)
    |
    |----> PHP SERVER (sorteiomax.com.br)
    |      |-- generate.php (GERACAO TTS - funcao principal)
    |      |-- upload.php (recebe uploads)
    |      |-- delete.php (deleta arquivos)
    |      |-- config.php (configuracoes)
    |      |-- trim_audio.py (corta audio)
    |      |-- update_tunnel.php (atualiza URL do tunnel)
    |      |
    |      |----> GPU LOCAL (PC Windows, RTX 3060 12GB)
    |             |-- omnivoice-demo :7860 (servidor Gradio)
    |             |-- Endpoint: POST /gradio_api/call/_clone_fn
    |             |-- SSE Stream: GET /gradio_api/call/_clone_fn/{event_id}
    |             |-- Upload: POST /gradio_api/upload
    |
    |----> POSTGRESQL (Neon) - Banco de Dados
           |-- Voices (vozes cadastradas)
           |-- VoiceVariations (variacoes de cada voz)
           |-- Tracks (trilhas musicais)
```

### Fluxo de dados principal (Geracao de Voz):
```
1. Usuario seleciona voz + variacao + digita texto
2. Browser envia POST para /api/php-generate (Vercel proxy)
3. Vercel proxy repassa para PHP generate.php
4. PHP generate.php:
   a. Valida token HMAC de autenticacao
   b. Baixa o audio de referencia do PHP server (ou usa URL direta)
   c. Executa trim_audio.py para cortar o audio para max 10 segundos
   d. Faz upload do audio cortado para o servidor OmniVoice local (GPU)
   e. Envia o job de geracao para o endpoint _clone_fn do Gradio
   f. Abre conexao SSE (Server-Sent Events) e aguarda o resultado
   g. Quando recebe o evento "complete", extrai a URL do audio gerado
   h. Baixa o audio gerado do servidor OmniVoice
   i. Converte para base64 e retorna como data URI
5. Browser recebe o audio base64 e reproduz
6. Opcionalmente, browser faz mixagem com trilha (Web Audio API)
```

---

## 3. FLUXO DE GERACAO DE VOZ (TTS) - PASSO A PASSO DETALHADO

### 3.1 O Usuario Clica em "Gerar"

O usuario esta na pagina principal (`/`). Ele:
1. Seleciona uma **Voz** (ex: "Ana")
2. Seleciona uma **Variacao** (ex: "Neutra", "Animada", "Empresarial")
3. Digita o **texto** que quer que seja falado
4. Opcionalmente seleciona uma **trilha musical** e ajusta volume
5. Clica em "Gerar"

### 3.2 O Frontend Prepara a Requisicao

O frontend (`page.tsx`) constroi um objeto JSON com:
```json
{
  "text": "Olá, bem-vindo ao nosso canal!",
  "language": "Auto",
  "refAudioUrl": "https://sorteiomax.com.br/omnivoice/audios/ref/ana_neutra.wav",
  "refAudioPath": "",
  "refText": "Olá, esta é a minha voz de referência.",
  "instruct": "",
  "refAudioName": "ana_neutra.wav",
  "speed": 1.0,
  "numStep": 32,
  "guidanceScale": 2.0
}
```

**Campos explicados:**
- `text`: O texto que sera sintetizado (obrigatorio)
- `language`: Idioma do texto. "Auto" detecta automaticamente. Opcoes: Portuguese, English, Spanish, etc.
- `refAudioUrl`: URL do audio de referencia no PHP server (obrigatorio)
- `refAudioPath`: Path do audio no HF Space (vazio no fluxo atual, era usado antes)
- `refText`: Transcricao exata do que e dito no audio de referencia (obrigatorio para boa qualidade)
- `instruct`: Instrucoes extras para o modelo (ex: "whisper", "male", "female", "high pitch")
- `refAudioName`: Nome do arquivo de referencia
- `speed`: Velocidade da fala. 1.0 = normal, 0.5 = lento, 1.5 = rapido
- `numStep`: Numero de passos de difusao. Mais passos = melhor qualidade, porem mais lento. Padrao: 32. Range: 4-64
- `guidanceScale`: Escala de guiamento. Mais alto = mais fiel ao audio de referencia. Padrao: 2.0. Range: 0-4

### 3.3 O Token HMAC e Gerado

O frontend chama `/api/upload-token` para obter um token HMAC temporario (valido 30 min). Este token e usado como header `X-Generate-Token` na requisicao para o PHP.

**Formato do token**: `{timestamp}.{hmac_sha256(timestamp, API_KEY)}`

### 3.4 Requisicao para o PHP

O frontend faz um POST direto do browser para o PHP server:
```
POST https://sorteiomax.com.br/omnivoice/generate.php
Header: X-Generate-Token: {timestamp}.{hmac}
Header: Content-Type: application/json
Body: { JSON acima }
```

**Por que direto do browser e nao via Vercel?** O Vercel Hobby tem timeout de 60 segundos. A geracao TTS pode demorar 30-120+ segundos. O PHP server nao tem esse limite (configurado para 600s no .htaccess).

### 3.5 generate.php - Processamento no PHP

O PHP recebe a requisicao e executa o seguinte:

#### PASSO 1: Validacao HMAC Token
```php
// Verifica se o header X-Generate-Token existe
// Divide o token em timestamp e hmac
// Verifica se o timestamp esta dentro da janela de 30 minutos
// Verifica se o hmac bate com hash_hmac('sha256', timestamp, API_KEY)
// Se qualquer validacao falhar, retorna 401
```

#### PASSO 2: Leitura dos parametros
```php
$texto = $input['text'];
$idioma = $input['language'];
$refAudioUrl = $input['refAudioUrl'];
$refText = $input['refText'];
$instruct = $input['instruct'];
$speed = $input['speed'];          // float, padrao 1.0
$numStep = $input['numStep'];      // int, padrao 32
$guidanceScale = $input['guidanceScale']; // float, padrao 2.0
```

#### PASSO 3: Download do audio de referencia
A funcao `downloadRefAudio($url, $name)` faz:
1. Cria um arquivo temporario no servidor PHP
2. Faz download do audio via curl (da URL do PHP server mesmo)
3. Verifica se o download foi bem sucedido (HTTP 200, tamanho > 0)
4. **EXECUTA O TRIM** - chama `trim_audio.py` para cortar o audio para max 10 segundos
5. Retorna o caminho do arquivo temporario (ja cortado)

#### PASSO 4: Trim do audio (evitar CUDA OOM)
A funcao `trimAudioToMaxSeconds($filePath, 10)` faz:
1. Verifica se `trim_audio.py` existe
2. Executa: `python3 trim_audio.py {input} {output} 10`
3. Se retornar "OK", usa o arquivo cortado
4. Se falhar, usa o original (mas pode causar CUDA OOM na GPU)

**Por que cortar?** A GPU RTX 3060 tem 12GB de VRAM. O modelo OmniVoice tenta alocar memoria proporcional ao tamanho do audio de referencia. Com audios longos (ex: 71.8s), tenta alocar 17.9GB e da CUDA Out of Memory. Cortando para 10s, funciona perfeitamente.

#### PASSO 5: Upload do audio para o servidor OmniVoice (GPU local)
A funcao `uploadToHF($filePath, $fileName, $hfUrl)` faz:
1. Faz POST para `{hfUrl}/gradio_api/upload` com o arquivo
2. O Gradio salva o arquivo e retorna um JSON: `["/tmp/gradio/xxx/filename.wav"]`
3. Retorna o path retornado pelo Gradio

**Nota**: `hfUrl` e a URL do tunnel (ex: `https://random-name.loca.lt`). Essa URL e armazenada em `config.php` como `HF_SPACE_URL` e e atualizada automaticamente pelo script PowerShell.

#### PASSO 6: Montagem do array de dados para o Gradio
```php
$gradioData = [
    $texto,              // [0] texto para sintetizar
    $idioma,             // [1] idioma
    [                    // [2] audio de referencia (FileData)
        'path' => $path_do_upload,    // caminho retornado pelo Gradio
        'orig_name' => $refAudioName, // nome do arquivo
        'mime_type' => 'audio/wav',   // MIME type
        'is_stream' => false,
        'meta' => ['_type' => 'gradio.FileData']
    ],
    $refText,            // [3] transcricao do audio de referencia
    $instruct,           // [4] instrucoes
    (int)$numStep,       // [5] passos de difusao (padrao 32)
    (float)$guidanceScale,// [6] escala de guiamento (padrao 2.0)
    true,                // [7] denoise (ruido)
    (float)$speed,       // [8] velocidade (padrao 1.0)
    null,                // [9] duracao (null = automatico)
    true,                // [10] preprocess (pre-processamento)
    true                 // [11] postprocess (pos-processamento)
];
```

#### PASSO 7: Envio do job para o OmniVoice
A funcao `submitToGradio($gradioData, $hfUrl)` faz:
1. POST para `{hfUrl}/gradio_api/call/_clone_fn`
2. Body: `{"data": [array acima]}`
3. O Gradio responde: `{"event_id": "uuid-xxxx-xxxx"}`
4. Retorna o `event_id`

#### PASSO 8: Aguardar resultado via SSE Stream
A funcao `streamSSEForResult($eventId, $hfUrl, 600)` faz:
1. Abre conexao HTTP GET para `{hfUrl}/gradio_api/call/_clone_fn/{eventId}`
2. Headers: `Accept: text/event-stream`, `Connection: keep-alive`
3. Usa `CURLOPT_WRITEFUNCTION` para processar os dados em tempo real (streaming)
4. Enquanto a conexao esta aberta, recebe eventos SSE:
   - `event: heartbeat` - Mantem a conexao viva (comando curl continua esperando)
   - `event: complete` - RESULTADO! Contem o JSON com o audio gerado
   - `event: error` - Erro na geracao
5. Quando recebe `event: complete`:
   - Faz parse do JSON do evento
   - Extrai `result[0].url` ou `result[0].path`
   - Se for path, constroi URL: `{hfUrl}/gradio_api/file={path}`
   - Fecha a conexao imediatamente
6. Timeout de 600 segundos (10 minutos)

**Formato do evento complete:**
```
event: complete
data: [{"url": "/gradio_api/file=/tmp/gradio/xxx/output.wav", "orig_name": "output.wav", ...}, null]
```

#### PASSO 9: Download do audio gerado
Apos obter a URL do audio:
1. Faz download via curl (timeout 120s)
2. Salva em arquivo temporario no PHP server

#### PASSO 10: Conversao para base64 e retorno
1. Le o arquivo do audio gerado
2. Converte para base64: `base64_encode(file_get_contents($tempFile))`
3. Monta data URI: `data:audio/wav;base64,{base64data}`
4. Retorna JSON:
```json
{
  "audioUrl": "data:audio/wav;base64,UklGRi...",
  "mixed": false,
  "viaDirectPhp": true,
  "viaPhp": true,
  "debug": {
    "totalDuration": 45000,
    "steps": [...]
  }
}
```

### 3.6 O Frontend Reproduz o Audio

O browser recebe o JSON, extrai `audioUrl` (data URI), cria um elemento `<audio>` e reproduz. Se o usuario selecionou uma trilha, o frontend faz a mixagem client-side via Web Audio API.

### 3.7 Sistema de Retry

Se a geracao falhar, o PHP tenta ate 3 vezes:
- Erros retriable: null, 404, timeout, connection_lost, stream_ended, HTTP 5xx
- Erros nao-retriable: CUDA OOM (para de tentar)
- Entre tentativas, aguarda 5s x numero da tentativa (5s, 10s)

---

## 4. FLUXO DE UPLOAD DE AUDIOS

### 4.1 Upload de Audio de Referencia (Vozes)

**Onde acontece**: Painel Admin (`/admin`), ao criar/editar uma variacao de voz.

**Fluxo:**
```
1. Admin seleciona arquivo de audio (WAV/MP3/OGG/M4A/FLAC)
2. Frontend envia POST para /api/upload-voice (Vercel proxy)
3. Vercel proxy repassa para PHP upload.php (server-to-server, sem CORS)
4. PHP upload.php:
   a. Valida API key (header X-API-Key)
   b. Valida MIME type
   c. Valida tamanho (max 50MB)
   d. Salva em audios/ref/{nome_arquivo}
   e. Retorna: {"url": "https://sorteiomax.com.br/omnivoice/audios/ref/nome.wav", "path": "audios/ref/nome.wav"}
5. Frontend salva a URL no banco (VoiceVariation.refAudioServerUrl)
```

**Nao ha compressao ou processamento** - o audio de referencia e enviado exatamente como esta. O trim para 10s so acontece na hora da geracao (no PHP, via trim_audio.py).

### 4.2 Upload de Trilha Musical

**Onde acontece**: Painel Admin (`/admin`), ao criar/editar uma trilha.

**Fluxo com processamento no navegador:**
```
1. Admin seleciona arquivo de audio
2. Browser faz decode do audio com AudioContext.decodeAudioData()
3. Verifica tamanho e duracao:
   - Se <= 3.5MB E <= 80s: envia ORIGINAL (zero processamento)
   - Se > 80s: trima para 80s via OfflineAudioContext
   - Se > 3.5MB apos trim: re-encoda como MP3 192kbps via lamejs
4. Re-encode como MP3:
   - Carrega lamejs do CDN
   - Bitrate calculado: min(192kbps, (3.5MB * 8) / duracao / 1000)
   - Mantem sample rate 44100Hz e canais (stereo/mono)
   - Resultado: max ~1.9MB
5. Envia POST para /api/upload-track (Vercel proxy -> PHP)
6. PHP salva em audios/track/{nome_arquivo}
7. Frontend calcula duracao e salva no banco
```

**Por que MP3 encoding?** WAV de 80s stereo 44100Hz = ~13MB (nao cabe no limite). MP3 192kbps = ~1.9MB com qualidade alta.

### 4.3 Upload Direto (NAO ESTA EM USO)

Existe `upload-direct.php` que permite upload direto do navegador para o PHP (bypassa Vercel). Usa token HMAC temporario. Funciona via curl mas tem problemas de CORS no navegador. Criado como backup mas nao e mais usado.

---

## 5. BANCO DE DADOS - SCHEMA COMPLETO

### 5.1 Voice (Voz)

```prisma
model Voice {
  id          String   @id @default(cuid())
  name        String                    // Nome da voz: "Ana", "Carlos", etc.
  description String   @default("")     // Descricao opcional
  gender      String   @default("Auto") // Genero: male, female, Auto
  age         String   @default("Auto") // Idade: child, teenager, young adult, middle-aged, elderly
  accent      String   @default("Auto") // Sotaque: portuguese accent, american accent, etc.
  pitch       String   @default("Auto") // Tom: low pitch, high pitch, etc.
  previewUrl  String   @default("")     // URL de preview (nao usado no fluxo atual)
  order       Int      @default(0)      // Ordem de exibicao
  active      Boolean  @default(true)   // Visivel no frontend?
  variations  VoiceVariation[]          // Variacoes desta voz (1:N)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

### 5.2 VoiceVariation (Variacao de Voz)

```prisma
model VoiceVariation {
  id                   String   @id @default(cuid())
  voiceId              String                   // FK para Voice (cascade delete)
  voice                Voice    @relation(fields: [voiceId], references: [id], onDelete: Cascade)
  label                String                   // Nome da variacao: "Neutra", "Animada", "Empresarial"
  emoji                String   @default("")    // Emoji de exibicao
  refAudioPath         String                   // Path no Gradio (obsoleto, usado antes)
  refAudioServerUrl    String                   // URL permanente no PHP server (usado no fluxo atual)
  refAudioFilename     String                   // Filename no PHP server (para delete)
  refAudioName         String   @default("")    // Nome original do arquivo
  refText              String   @default("")    // Transcricao do audio de referencia
  instruct             String   @default("")    // Instrucao para o modelo
  order                Int      @default(0)     // Ordem de exibicao
  active               Boolean  @default(true)  // Visivel no frontend?
}
```

**Campos criticos para a geracao TTS:**
- `refAudioServerUrl`: URL do audio de referencia (ex: `https://sorteiomax.com.br/omnivoice/audios/ref/ana_neutra.wav`)
- `refText`: Transcricao EXATA do que e dito no audio. O modelo usa isso para entender a voz.
- `instruct`: Instrucao opcional (ex: "whisper" para voz sussurrada)

### 5.3 Track (Trilha Musical)

```prisma
model Track {
  id          String   @id @default(cuid())
  name        String                   // Nome da trilha: "Corporativo", "Eletronica"
  description String   @default("")    // Descricao
  emoji       String   @default("")    // Emoji
  audioPath   String                   // URL no PHP server
  duration    Float    @default(0)     // Duracao em segundos
  order       Int      @default(0)     // Ordem
  active      Boolean  @default(true)  // Visivel?
}
```

---

## 6. TODOS OS ARQUIVOS PHP - FUNCOES E DETALHES

### 6.1 config.php - Configuracoes

```php
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');
define('BASE_URL', 'https://sorteiomax.com.br/omnivoice');
define('HF_SPACE_URL', 'https://xxxx.loca.lt');  // Atualizado automaticamente pelo tunnel
define('MAX_SIZE', 50 * 1024 * 1024);            // 50MB
define('UPLOAD_DIR', __DIR__ . '/audios/');
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);
define('ALLOWED_TYPES', ['audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a', 'audio/flac', 'audio/x-flac']);
```

**Finalidade**: Centralizar todas as configuracoes do PHP server. `HF_SPACE_URL` e a URL da GPU local via tunnel.

### 6.2 generate.php - Geracao TTS (ARQUIVO PRINCIPAL)

**Finalidade**: Receber requisicao do browser, orquestrar toda a geracao de voz na GPU local, e retornar o audio gerado.

**Funcoes:**

1. **Validacao HMAC Token**: Verifica autenticidade da requisicao via token HMAC no header `X-Generate-Token`. Token = `timestamp.hmac_sha256(timestamp, API_KEY)`. Validade: 30 minutos.

2. **downloadRefAudio($url, $name)**: Faz download do audio de referencia via curl. Salva em arquivo temporario. Depois chama `trimAudioToMaxSeconds()`.

3. **trimAudioToMaxSeconds($filePath, $maxSeconds)**: Chama o script Python `trim_audio.py` para cortar o audio para max N segundos. Comando: `python3 trim_audio.py {input} {output} {maxSeconds}`. Se retornar "OK", usa o arquivo cortado.

4. **uploadToHF($filePath, $fileName, $hfUrl)**: Faz upload do audio para o servidor OmniVoice via Gradio API. POST para `{hfUrl}/gradio_api/upload` com multipart/form-data. Retorna o path do arquivo no servidor Gradio.

5. **submitToGradio($gradioData, $hfUrl)**: Envia o job de geracao. POST para `{hfUrl}/gradio_api/call/_clone_fn` com JSON body `{"data": [...]}`. Retorna `event_id`.

6. **streamSSEForResult($eventId, $hfUrl, $timeoutSec)**: Abre conexao SSE persistente para aguardar o resultado. GET `{hfUrl}/gradio_api/call/_clone_fn/{eventId}`. Processa eventos em tempo real via `CURLOPT_WRITEFUNCTION`. Retorna array com `status` (complete/error) e `audioUrl`.

7. **runGeneration($gradioData, $refAudioFile, $refAudioName, $hfUrl)**: Orquestra: upload do audio -> submit do job -> SSE stream para resultado. Tenta o submit ate 3 vezes.

8. **Fluxo principal**: Download ref audio -> Trim -> Montar dados Gradio -> Upload para GPU -> Submit job -> SSE stream -> Download audio gerado -> Base64 -> Retornar JSON.

9. **Sistema de retry**: Ate 3 tentativas para erros retriable (null, 404, timeout, connection_lost). Erros nao-retriable (CUDA OOM) param imediatamente.

10. **Debug logging**: Cada passo e logado com timestamp e duracao. Retornado no campo `debug` da resposta.

### 6.3 upload.php - Upload de Arquivos

**Finalidade**: Receber uploads de audio (ref voices e tracks) via proxy do Vercel.

**Validacoes:**
- Header `X-API-Key` com a API_KEY valida
- MIME type na lista ALLOWED_TYPES
- Tamanho <= MAX_SIZE (50MB)
- Categoria (ref ou track) via query param ou header

**Acao:**
1. Valida API key
2. Valida MIME type e tamanho
3. Gera nome unico para evitar colisoes
4. Salva em `audios/{categoria}/{nome_arquivo}`
5. Retorna JSON com URL e path

### 6.4 delete.php - Deletar Arquivos

**Finalidade**: Deletar arquivos de audio do servidor PHP quando uma voz ou trilha e removida do banco.

**Validacoes:**
- Header `X-API-Key` com API_KEY valida
- Body JSON com `category` (ref/track) e `filename`

### 6.5 update_tunnel.php - Atualizar URL do Tunnel

**Finalidade**: Receber a nova URL do localtunnel e atualizar `HF_SPACE_URL` no `config.php` automaticamente.

**Fluxo:**
1. Valida autenticacao simples: `?auth=vozpro_tunnel_2024`
2. Valida URL informada: `?url=https://xxx.loca.lt`
3. Le `config.php` atual
4. Substitui `HF_SPACE_URL` via regex
5. Salva `config.php` atualizado
6. Retorna JSON com oldUrl, newUrl, timestamp

**Quem chama**: O script PowerShell `start_tunnel.ps1` (roda no PC local com GPU).

### 6.6 .htaccess - Configuracao do Apache

```
php_value upload_max_filesize 50M
php_value post_max_size 55M
php_value max_execution_time 600
php_value max_input_time 300
```

**Finalidade**: Aumentar limites do PHP para suportar uploads grandes e geracao longa.

---

## 7. SCRIPT PYTHON trim_audio.py

### Finalidade
Cortar audios de referencia para max N segundos para evitar CUDA Out of Memory na GPU RTX 3060 12GB.

### Como funciona (SEM ffmpeg)
O script e 100% Python puro, sem depender de ffmpeg. Suporta WAV e MP3:

**Para WAV:**
- Usa o modulo `wave` nativo do Python
- Le os parametros do WAV (canais, sample rate, etc)
- Calcula quantos frames cabem em N segundos: `n_frames = int(max_seconds * framerate)`
- Le apenas esses frames
- Escreve novo WAV com os mesmos parametros

**Para MP3:**
- Le o arquivo binario inteiro
- Pula o tag ID3v2 se presente (calcula tamanho do tag via synchsafe integer)
- Escaneia o arquivo procurando sync words (0xFF seguido de 0xE0+)
- Para cada frame MP3 encontrado:
  - Decodifica o header MPEG (versao, layer, bitrate, sample rate, padding)
  - Calcula o tamanho do frame: `144 * bitrate / samplerate + padding`
  - Avanca para o proximo frame
  - Calcula duracao: `frame_count * 1152 / samplerate` (Layer III = 1152 samples/frame)
  - Para quando duracao >= max_seconds
- Escreve o output: tag ID3v2 (se houver) + frames ate o limite

**Uso via linha de comando:**
```bash
python3 trim_audio.py input.wav output.wav 10
python3 trim_audio input.mp3 output.mp3 10
```

**Retorno:** Imprime "OK" em caso de sucesso, "ERROR:..." em caso de falha.

---

## 8. SCRIPTS LOCAIS (BAT + PowerShell)

### 8.1 iniciar.bat - Iniciar Servidor OmniVoice

**Finalidade**: Script principal que inicia tudo no PC local com GPU.

**O que faz (em ordem):**
1. **Limpa processos antigos**: `taskkill /F /IM python.exe` (mata qualquer Python rodando)
2. **Ativa o ambiente Conda**: `call C:\Users\Administrador\Miniconda3\Scripts\activate.bat`
3. **Configura CUDA**: `set PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True`
4. **Inicia o OmniVoice**: `omnivoice-demo --ip 0.0.0.0 --port 7860` em uma nova janela CMD
5. **Aguarda 15 segundos** para o servidor subir
6. **Inicia o tunnel**: Abre PowerShell com `start_tunnel.ps1` em outra janela

**Requisitos:**
- Windows 10/11
- NVIDIA GPU com 12GB+ VRAM
- Miniconda3 instalado em `C:\Users\Administrador\Miniconda3\`
- Pacote `omnivoice-demo` instalado no conda
- Node.js 18+ (para localtunnel)

### 8.2 start_tunnel.ps1 - Tunnel Automatico

**Finalidade**: Criar tunnel localtunnel para expor a GPU local na internet e atualizar a URL automaticamente no PHP server.

**O que faz (em ordem):**
1. **Verifica OmniVoice**: Faz HTTP GET para `http://localhost:7860/` para confirmar que esta rodando
2. **Cria tunnel**: Executa `npx localtunnel --port 7860` via `Start-Job` + `cmd /c` (porque npx e um .cmd, nao um .exe)
3. **Captura URL**: Monitora o output do localtunnel procurando por "your url is: https://xxx.loca.lt" (regex)
4. **Atualiza PHP server**: Quando captura a URL, faz GET para `https://sorteiomax.com.br/omnivoice/update_tunnel.php?auth=vozpro_tunnel_2024&url={url}`
5. **Mantem ativo**: Aguarda indefinidamente (Wait-Job) para manter o tunnel vivo

**Por que localtunnel?**
- Gratuito, sem cadastro
- Suporta SSE (Server-Sent Events) - essencial para a geracao TTS
- Cloudflare Quick Tunnel NAO suporta SSE (fecha com 0 heartbeats)
- ngrok requer conta verificada

**Por que Start-Job + cmd /c?**
O PowerShell `Start-Process` nao funciona com `.cmd` files (como npx). `Start-Job` roda em background e `cmd /c` executa o comando no CMD.

---

## 9. FRONTEND NEXT.JS - COMPONENTES E APIs

### 9.1 Pagina Principal (`/` - page.tsx)

**Finalidade**: Interface do usuario para gerar voz.

**Funcionalidades:**
- Lista de vozes disponiveis (do banco, ativas)
- Para cada voz, lista de variacoes
- Campo de texto para digitar o que sera sintetizado
- Seletor de idioma
- Controle de velocidade (0.5x - 1.5x)
- Controle de qualidade (steps: 4-64)
- Seletor de trilha musical (opcional)
- Slider de volume da trilha
- Botao "Gerar" que dispara a geracao
- Player de audio para reproduzir o resultado
- Botao de download
- Alternancia "Com trilha" / "Somente voz"

**Como gera a voz:**
1. Chama `/api/upload-token` para obter token HMAC
2. Faz POST direto do browser para PHP `generate.php` (bypassa Vercel timeout)
3. Recebe JSON com `audioUrl` (base64 data URI)
4. Se tem trilha, faz mixagem client-side (Web Audio API)
5. Reproduz no player

### 9.2 Painel Admin (`/admin` - page.tsx)

**Finalidade**: Gerenciar vozes, variacoes e trilhas.

**CRUD de Vozes:**
- Listar, criar, editar, deletar vozes
- Campos: nome, descricao, genero, idade, sotaque, tom
- Ativar/desativar

**CRUD de Variacoes:**
- Para cada voz, gerenciar variacoes
- Upload de audio de referencia (via proxy Vercel -> PHP)
- Configurar refText (transcricao) e instruct
- Upload de audio ao clicar "Salvar" (deferred upload)

**CRUD de Trilhas:**
- Listar, criar, editar, deletar trilhas
- Upload com processamento automatico (trim 80s, MP3 encoding)
- Exibir duracao da trilha

### 9.3 API Routes do Vercel

**Rota `/api/php-generate`** (POST):
- Proxy rapido que repassa a requisicao para o PHP server
- Nao espera o resultado - apenas encaminha
- Na verdade, o frontend faz chamada direta ao PHP (nao via esta rota)

**Rota `/api/generate`** (POST):
- Geracao TTS direta via Vercel -> GPU local
- Timeout de 300s (requer Vercel Pro)
- Fallback, nao e mais a rota principal

**Rota `/api/upload-voice`** (POST):
- Recebe arquivo do frontend
- Valida autenticacao (admin session)
- Faz proxy server-to-server para PHP upload.php

**Rota `/api/upload-track`** (POST):
- Recebe arquivo do frontend (ja processado: trim + MP3)
- Faz proxy server-to-server para PHP upload.php

**Rota `/api/upload-token`** (GET):
- Gera token HMAC temporario (valido 30 min)
- Usado para autenticacao de upload direto browser -> PHP

**Rota `/api/voices`** (GET/POST):
- GET: Lista vozes ativas (public)
- POST: Cria voz (admin)

**Rota `/api/voices/[id]`** (GET/PUT/DELETE):
- GET: Detalhes da voz
- PUT: Atualiza voz
- DELETE: Remove voz + variacoes + arquivos do PHP server

**Rota `/api/tracks`** (GET/POST):
- GET: Lista trilhas ativas (public)
- POST: Cria trilha (admin)

**Rota `/api/tracks/[id]`** (GET/PUT/DELETE):
- PUT: Atualiza trilha
- DELETE: Remove trilha + arquivo do PHP server

**Rota `/api/auth`** (POST/DELETE):
- POST: Login com senha (seta cookie)
- DELETE: Logout (remove cookie)

---

## 10. SISTEMA DE AUTENTICACAO

### Sistema de Login do Admin

**Tipo**: Senha unica, sem sistema de usuarios.

**Fluxo de Login:**
1. Admin acessa `/admin` - redirecionado para `/admin/login`
2. Digita a senha
3. POST `/api/auth` com `{ password: "..." }`
4. Vercel verifica: `password === ADMIN_PASSWORD`
5. Cria cookie `vozpro_admin`:
   - Valor: `base64(timestamp : sha256(timestamp + ADMIN_PASSWORD + JWT_SECRET))`
   - Flags: httpOnly, secure (em producao), sameSite strict, maxAge 86400 (24h)
6. Redireciona para `/admin`

**Verificacao de Sessao:**
- `getAdminSession()` le o cookie
- Decodifica base64
- Verifica se timestamp < 24h
- Recalcula SHA256 e compara
- Se valido, retorna sessao; se nao, retorna null

**Variaveis de ambiente:**
- `ADMIN_PASSWORD`: Senha do admin
- `JWT_SECRET`: Chave para assinar o cookie

---

## 11. SISTEMA DE MIXAGEM DE AUDIO (CLIENT-SIDE)

### Finalidade
Misturar a voz gerada com uma trilha musical de fundo, permitindo ao usuario controlar o volume de cada um.

### Como funciona (100% no browser, sem servidor)

```
1. AudioContext.decodeAudioData() - Decodifica voz e trilha
2. OfflineAudioContext - Cria contexto offline com duracao = duracao da voz
3. Cria AudioBufferSourceNode para a voz (volume 100%)
4. Cria AudioBufferSourceNode para a trilha (volume configuravel via GainNode)
5. Conecta ambos ao destino do OfflineAudioContext
6. startRendering() - Renderiza a mixagem
7. Converte o AudioBuffer resultante para WAV (PCM 16-bit)
8. Cria data URI base64
```

**Alternancia**: O usuario pode alternar entre "Com trilha" e "Somente voz" sem gerar novamente (os dois audios ficam em memoria).

---

## 12. SISTEMA DE TUNNEL AUTOMATICO

### Finalidade
Expor o servidor OmniVoice rodando na GPU local (porta 7860) para a internet, para que o PHP server possa acessa-lo.

### Por que precisa de tunnel?
O PHP server esta na HostGator (nuvem). A GPU esta no PC local. O PHP precisa acessar `http://localhost:7860` do PC, mas so pode acessar URLs publicas. O tunnel cria uma URL publica que aponta para `localhost:7860`.

### Fluxo automatico:
```
1. Usuario liga o PC e roda iniciar.bat
2. iniciar.bat inicia omnivoice-demo na porta 7860
3. iniciar.bat abre start_tunnel.ps1
4. start_tunnel.ps1 cria tunnel: npx localtunnel --port 7860
5. localtunnel gera URL aleatoria: https://random-name.loca.lt
6. start_tunnel.ps1 extrai a URL do output
7. start_tunnel.ps1 faz GET para update_tunnel.php?auth=...&url=...
8. update_tunnel.php atualiza HF_SPACE_URL no config.php
9. Pronto! generate.php agora usa a nova URL
```

### Quando reiniciar?
Toda vez que o PC reiniciar ou o tunnel cair, basta rodar `iniciar.bat` novamente. A URL sera atualizada automaticamente.

### Alternativas consideradas:
| Tunnel | Suporta SSE | Precisa conta | Gratuito | Status |
|--------|------------|---------------|----------|--------|
| Localtunnel | SIM | NAO | SIM | USANDO |
| Cloudflare Quick Tunnel | NAO | NAO | SIM | Descartado |
| ngrok | SIM | SIM (pago) | NAO | Descartado |

---

## 13. MODELO OMNIVOICE - PARAMETROS E API GRADIO

### Modelo OmniVoice
- **Origem**: k2-fsa/omnivoice (HuggingFace)
- **Tipo**: Difusao para sintese de voz
- **Capacidade**: Clonagem de voz com poucos segundos de referencia
- **Idiomas**: Multi-idioma (Portugues, Ingles, Espanhol, etc.)
- **Formato de entrada**: Texto + Audio de referencia + Transcricao
- **Formato de saida**: Audio WAV

### API Gradio v2

O OmniVoice roda como um app Gradio na porta 7860. A API Gradio v2 funciona assim:

**1. Upload de arquivo:**
```
POST /gradio_api/upload
Content-Type: multipart/form-data
Body: files=@audio.wav
Response: ["/tmp/gradio/xxx/audio.wav"]
```

**2. Submeter job:**
```
POST /gradio_api/call/_clone_fn
Content-Type: application/json
Body: {"data": [texto, idioma, {FileData}, refText, instruct, steps, guidance, denoise, speed, duration, preprocess, postprocess]}
Response: {"event_id": "uuid-xxxx-xxxx"}
```

**3. Aguardar resultado via SSE:**
```
GET /gradio_api/call/_clone_fn/{event_id}
Accept: text/event-stream
Connection: keep-alive

Resposta (streaming):
event: heartbeat
data: null

event: heartbeat
data: null

event: complete
data: [{"url":"/gradio_api/file=/tmp/gradio/xxx/output.wav", ...}, null]
```

### Parametros do _clone_fn (detalhado)

| # | Nome | Tipo | Padrao | Descricao |
|---|------|------|--------|-----------|
| 0 | text | string | - | Texto para sintetizar (obrigatorio) |
| 1 | language | string | "Auto" | Idioma do texto. "Auto" detecta automaticamente |
| 2 | refAudioFile | FileData | - | Audio de referencia (obrigatorio). Format: `{path, orig_name, mime_type, is_stream, meta}` |
| 3 | refText | string | - | Transcricao exata do audio de referencia (muito importante para qualidade) |
| 4 | instructStr | string | "" | Instrucoes: "whisper", "male", "female", "high pitch", etc |
| 5 | numStep | int | 32 | Passos de difusao. Mais = melhor qualidade, mais lento. Range: 4-64 |
| 6 | guidanceScale | float | 2.0 | Escala de guiamento. Mais = mais fiel a referencia. Range: 0-4 |
| 7 | denoise | bool | true | Aplica denoising no audio gerado |
| 8 | speed | float | 1.0 | Velocidade da fala. 0.5=lento, 1.5=rapido |
| 9 | duration | float/null | null | Duracao forcada. Null = automatico (recomendado) |
| 10 | preprocess | bool | true | Pre-processamento do texto |
| 11 | postprocess | bool | true | Pos-processamento do audio |

### Formato FileData (para refAudioFile):
```json
{
  "path": "/tmp/gradio/xxx/audio_ref.wav",
  "orig_name": "ref_audio.wav",
  "mime_type": "audio/wav",
  "is_stream": false,
  "meta": {"_type": "gradio.FileData"}
}
```

---

## 14. VARIAVEIS DE AMBIENTE

### Vercel (Next.js)
| Variavel | Descricao | Obrigatorio |
|----------|-----------|-------------|
| `DATABASE_URL` | String de conexao PostgreSQL (Neon) | SIM |
| `ADMIN_PASSWORD` | Senha do admin | SIM |
| `JWT_SECRET` | Chave para assinar cookies | SIM |
| `AUDIO_SERVER_URL` | URL base do PHP server (`https://sorteiomax.com.br/omnivoice`) | SIM |
| `AUDIO_SERVER_API_KEY` | API key do PHP server | SIM |

### PHP Server (config.php)
| Constante | Valor | Descricao |
|-----------|-------|-----------|
| `API_KEY` | `vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1` | Chave de API |
| `BASE_URL` | `https://sorteiomax.com.br/omnivoice` | URL base |
| `HF_SPACE_URL` | `https://xxxx.loca.lt` | URL do tunnel (auto-atualizado) |
| `MAX_SIZE` | 52428800 (50MB) | Tamanho max upload |
| `UPLOAD_DIR` | `__DIR__ . '/audios/'` | Pasta de uploads |

### Local (iniciar.bat)
| Variavel | Descricao |
|----------|-----------|
| `PYTORCH_CUDA_ALLOC_CONF` | `expandable_segments:True` (otimizacao CUDA) |

---

## 15. COMO RECRiar O SISTEMA DO ZERO

### Passo 1: Infraestrutura
1. Criar projeto Next.js: `npx create-next-app@latest`
2. Configurar Tailwind CSS e shadcn/ui
3. Criar banco PostgreSQL (Neon ou qualquer provider)
4. Configurar Prisma com schema (Voice, VoiceVariation, Track)
5. Fazer deploy no Vercel

### Passo 2: Servidor PHP
1. Ter um hosting PHP (HostGator, etc)
2. Upload dos arquivos PHP (config.php, generate.php, upload.php, delete.php, trim_audio.py, update_tunnel.php, .htaccess)
3. Criar pastas: audios/ref/, audios/track/
4. Configurar permissoes de escrita

### Passo 3: GPU Local
1. Ter PC com NVIDIA GPU (minimo 12GB VRAM)
2. Instalar Miniconda3
3. Criar ambiente e instalar omnivoice-demo: `pip install omnivoice-demo`
4. Instalar Node.js 18+ (para localtunnel)
5. Colocar `iniciar.bat` e `start_tunnel.ps1` na pasta desejada
6. Editar o caminho do Conda no iniciar.bat se necessario

### Passo 4: Frontend
1. Pagina principal com seletor de voz, texto, botao gerar
2. Painel admin com CRUD de vozes/variacoes/trilhas
3. Sistema de upload de audio (via proxy Vercel -> PHP)
4. Sistema de geracao TTS (POST direto browser -> PHP)
5. Player de audio + download
6. Mixagem client-side (Web Audio API)

### Passo 5: Tuning
1. Ajustar `numStep` (4-64) para balancear qualidade/velocidade
2. Ajustar `guidanceScale` (0-4) para fidelidade da voz
3. Configurar tamanho max do audio de referencia (10s para GPU 12GB)
4. Configurar timeout do PHP (600s recomendado)
