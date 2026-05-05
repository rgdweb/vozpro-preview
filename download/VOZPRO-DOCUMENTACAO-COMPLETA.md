# VozPro - Documentacao Completa do Sistema

> Gerador de vozes profissionais com IA — Clonagem, Voice Design e Auto Voice
> Ultima atualizacao: 06/05/2026

---

## 1. Visao Geral da Arquitetura

O VozPro e um sistema TTS (Text-to-Speech) com dois modelos de IA rodando localmente na GPU do usuario, com frontend hospedado no Vercel e PHP no HostGator (sorteiomax.com.br) como intermediario.

### Fluxo Principal (atual)

```
                                ┌─────────────────────────────────────────┐
                                │           VERCEL (Frontend)              │
                                │   - Serve pagina estatica (Next.js)      │
                                │   - API routes: auth, voices, tracks     │
                                │   - NENHUMA geracao de audio aqui        │
                                └──────────────┬──────────────────────────┘
                                               │
                          ┌────────────────────┼────────────────────────┐
                          │                    │                        │
                          v                    v                        v
                ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
                │  F5-TTS (PHP)    │  │ OmniVoice (PHP)  │  │  Vercel API      │
                │  sorteiomax.com  │  │  sorteiomax.com  │  │  (fallback)      │
                │  generate.php    │  │  generate-       │  │  omnivoice-      │
                │                  │  │  omnivoice.php    │  │  generate/       │
                └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
                         │                     │                     │
                         └──────────┬──────────┘                     │
                                    v                                │
                         ┌──────────────────────┐                    │
                         │  get_tunnel.php       │                    │
                         │  (descobre tunnel URL) │                    │
                         └──────────┬───────────┘                    │
                                    v                                │
                         ┌──────────────────────┐                    │
                         │  cloudflared tunnel   │                    │
                         │  (GPU local → internet)│                   │
                         └──────────┬───────────┘                    │
                                    v                                │
                         ┌──────────────────────┐                    │
                         │  GPU LOCAL (PC)       │◄───────────────────┘
                         │  - F5-TTS Server      │
                         │  - OmniVoice Server   │
                         │  - Gradio API         │
                         └──────────────────────┘
```

### Modelos TTS Disponiveis

| Modelo | Velocidade | Qualidade | Recursos |
|--------|-----------|-----------|----------|
| **F5-TTS** | Lento (RTF ~0.5) | Alta | Clonagem fiel, chunking frase por frase |
| **OmniVoice** | Rapido (RTF 0.025) | Boa | Clonagem, Voice Design, Auto Voice, 600+ idiomas |

### Modos de Voz

| Modo | Descricao | Modelos |
|------|-----------|---------|
| **Clone** | Clona voz a partir de audio de referencia | F5-TTS, OmniVoice |
| **Voice Design** | Cria voz a partir de descricao (genero, idade, tom, sotaque) | OmniVoice apenas |
| **Auto Voice** | Voz aleatoria com todos os params "Auto" | OmniVoice apenas |

---

## 2. Historico de Desenvolvimento (ordem cronologica)

### Fase 1: Fundacao do Sistema
- **Commit inicial** (`bbe9802`): Projeto VozPro criado com Next.js + Prisma + Neon PostgreSQL
- Upload de audio via Vercel Blob, depois migrado para PHP no HostGator
- Sistema de vozes e trilhas com painel admin

### Fase 2: PHP Server (bypass timeout Vercel)
- **Problema**: Vercel Hobby tem timeout de 10s (free tier) / 60s (pro). Geracao TTS demora mais.
- **Solucao**: PHP no HostGator como intermediario (sem limite de timeout)
- **Arquivos criados**: `generate.php`, `upload.php`, `delete.php`, `config.php`
- **Autenticacao**: Token HMAC (timestamp + SHA256) para evitar uso indevido
- **Fluxo**: Browser → PHP sorteiomax → Tunnel → GPU local

### Fase 3: Chunking e Prosodia
- Texto dividido em frases com pausas reais entre elas
- Concatenacao profissional: crossfade, trim de silencio, normalizacao de volume
- Pausas em pontuacao (`.`, `!`, `?`, `,`) para fala natural
- Virgula nao divide mais chunks (eliminou micro-glitch)

### Fase 4: Ducking (mixagem voz + trilha)
- Sistema de audio ducking client-side com Web Audio API
- Musica comeca alta, reduz quando a voz entra, volta alta apos voz
- Configuravel: duckVolume, fadeInMs, duckFadeMs, unduckFadeMs, fadeOutMs, musicStartLeadMs
- Mono output + compressor para preservar clareza da voz
- MP3 encoding com lamejs para arquivos de saida

### Fase 5: GPU Local com Tunnel
- Script `start_tunnel.ps1` (PowerShell) inicia cloudflared automaticamente
- URL do tunnel registrada no PHP via `update_tunnel.php`
- `get_tunnel.php` retorna URL dinamica do tunnel
- F5-TTS e OmniVoice rodam localmente, acessiveis via tunnel

### Fase 6: Integracao OmniVoice
- OmniVoice (k2-fsa) adicionado como segundo modelo TTS
- Script `omnivoice_server.py` (Gradio) para rodar localmente
- API route `/api/omnivoice-generate` no Vercel para integracao inicial
- Health check automatico: botao OmniVoice desabilitado se servidor offline

### Fase 7: Correcoes OmniVoice (bugs criticos)
Varios bugs foram encontrados e corrigidos durante testes reais:

#### Bug 1: OmniVoice Offline (endpoint names com `/`)
- **Problema**: Gradio retorna nomes de endpoints com `/` prefixo (`/_design_fn`, `/_clone_fn`), mas o codigo checava sem `/`
- **Correcao** (`3ecbff6`): Verifica com e sem `/` no health check

#### Bug 2: "Sem URL no output"
- **Problema**: Gradio retorna `[audio, status]` mas o codigo lia `[status, audio]` (index 1 em vez de 0)
- **Correcao** (`d96f5a8`): Ler index 0 para audio, index 1 para status

#### Bug 3: Voice Design/Auto usando voz selecionada
- **Problema**: Ao selecionar Voice Design ou Auto Voice, o sistema enviava os metadados da voz selecionada em vez dos params do Voice Design ou "Auto"
- **Correcao** (`bff23a0`): Parser de texto para dropdowns OmniVoice + Auto mode forca todos params como "Auto"

#### Bug 4: "Voz bebada" e palavras erradas
- **Problema**: `numStep: 16` (modo rapido) gerava audio com palavras distorcidas. `language: 'Auto'` ignorava a selecao do usuario
- **Correcao** (`9076556`): `numStep` mudado para 32 (qualidade). Language agora usa a selecao do usuario (Portuguese, English, etc)

### Fase 8: OmniVoice PHP Direto (bypass total do Vercel)
- **Problema**: OmniVoice ainda passava pela API route do Vercel (`/api/omnivoice-generate`), consumindo serverless function hours
- **Solucao**: Criar `generate-omnivoice.php` no sorteiomax com a mesma logica da API route
- **Commit** (`ceeb10b`): `generate-omnivoice.php` + `get_tunnel.php` + `tunnel-config.ini` + `update_tunnel.php`
- **Resultado**: OmniVoice agora vai Browser → PHP sorteiomax → Tunnel → GPU. Zero Vercel.

### Fase 9: Admin e Upload de Voz
- Painel admin com toggle para habilitar/desabilitar upload de voz no cliente
- Modelo `SystemSetting` no Prisma (key-value pairs)
- Upload condicional: so aparece quando admin ativa

---

## 3. Estrutura de Arquivos

### Frontend (Next.js no Vercel)

```
src/
├── app/
│   ├── page.tsx              # Pagina principal (cliente) - TTS interface
│   ├── admin/
│   │   └── page.tsx          # Painel admin - vozes, trilhas, config
│   └── api/
│       ├── voices/           # CRUD de vozes
│       ├── tracks/           # CRUD de trilhas
│       ├── variations/       # CRUD de variacoes de voz
│       ├── generate/         # Geracao F5-TTS via HF Space (legacy)
│       ├── generate-token/   # Token HMAC para PHP direto (F5-TTS)
│       ├── generate-config/  # Config: URL do PHP server
│       ├── tunnel-generate/  # Geracao F5-TTS via tunnel direto (GPU local)
│       ├── omnivoice-generate/ # Geracao OmniVoice via Vercel (FALLBACK)
│       ├── omnivoice-token/  # Token HMAC para PHP direto (OmniVoice)
│       ├── upload-voice/     # Upload de audio de referencia
│       ├── upload-track/     # Upload de trilha sonora
│       ├── upload-chunk/     # Upload chunked para arquivos grandes
│       ├── upload-token/     # Token HMAC para upload
│       ├── auth/             # Autenticacao admin
│       ├── settings/         # Settings publicas (toggle upload)
│       ├── admin/settings/   # Settings admin (toggle upload)
│       ├── server-config/    # Config do servidor
│       ├── php-generate/     # Proxy PHP
│       └── status/           # Diagnostico do servidor
├── components/
│   └── audio-player.tsx      # Player de audio reutilizavel
└── lib/
    └── db.ts                 # Conexao Prisma
```

### PHP Server (sorteiomax.com.br/omnivoice/)

```
php-server/
├── config.php                # Config principal: API_KEY, BASE_URL, HF_SPACE_URL (define format)
├── get_tunnel.php            # Retorna URL do tunnel ativo (parse_ini ou fallback HF_SPACE_URL)
├── update_tunnel.php         # Recebe URL do tunnel do cloudflared (salva no config.php)
├── tunnel-config.ini         # Config INI separado para tunnel URL (fallback)
├── generate.php              # Geracao F5-TTS via PHP (tunnel → GPU local)
├── generate-omnivoice.php    # Geracao OmniVoice via PHP (tunnel → GPU local) ← NOVO
├── generate-direct.php       # Geracao direta (sem tunnel, HF Space publico)
├── generate_local.php        # Geracao local (rede interna)
├── upload.php                # Upload de arquivos de audio
├── upload-direct.php         # Upload direto sem chunking
├── upload-chunk.php          # Upload por chunks (arquivos grandes +4.5MB)
├── upload_local.php          # Upload local (rede interna)
├── delete.php                # Deletar arquivos de audio
├── info.php                  # Info do servidor PHP
├── trim_audio.py             # Trim de silencio em audio (Python + pydub)
├── teste_local.html          # Pagina de teste local
├── config_local.php          # Config para ambiente local
├── .htaccess                 # Regras Apache (CORS, permissoes)
└── .user.ini                 # Config PHP (timeouts, memory)
```

### Servidor Local (GPU)

```
local-server/
├── omnivoice_server.py       # Servidor OmniVoice (Gradio) ← NOVO
├── iniciar_omnivoice.bat     # Iniciar OmniVoice no Windows ← NOVO
├── iniciar.bat               # Iniciar F5-TTS + tunnel (batch)
├── iniciar_local.bat         # Iniciar modo local (sem tunnel)
├── start_tunnel.ps1          # Iniciar cloudflared + registrar URL no PHP
├── tunnel_php.ps1            # Tunnel alternativo via PHP
├── INSTRUCOES-INSTALACAO.txt # Instrucoes de instalacao
└── php-local/                # PHP para ambiente local
    ├── config.php
    ├── generate.php
    └── upload.php
```

---

## 4. Sistema de Autenticacao (Token HMAC)

Para evitar que qualquer pessoa use o PHP diretamente, o sistema usa tokens HMAC:

### Fluxo:
1. Frontend pede token ao Vercel: `GET /api/omnivoice-token` ou `GET /api/generate-token`
2. Vercel gera: `timestamp.HMAC_SHA256(timestamp, API_KEY)`
3. Frontend envia token no header `X-Generate-Token` para o PHP
4. PHP valida: timestamp dentro de 30min + HMAC confere com `API_KEY` do `config.php`

### Chaves:
- `API_KEY` no `config.php` do sorteiomax: `vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1`
- `AUDIO_SERVER_API_KEY` no Vercel `.env`: deve ser **a mesma chave**

---

## 5. Configuracao do Vercel (Environment Variables)

| Variavel | Valor | Obrigatória? |
|----------|-------|:---:|
| `DATABASE_URL` | String de conexao PostgreSQL (Neon) | Sim |
| `AUDIO_SERVER_URL` | `https://sorteiomax.com.br/omnivoice` | **Sim** (para PHP direto) |
| `AUDIO_SERVER_API_KEY` | `vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1` | **Sim** (para PHP direto) |

> **IMPORTANTE**: Sem `AUDIO_SERVER_URL` e `AUDIO_SERVER_API_KEY`, o OmniVoice cai pro fallback do Vercel API route (com risco de timeout).

---

## 6. Configuracao do PHP (config.php no sorteiomax)

```php
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');
define('BASE_URL', 'https://sorteiomax.com.br/omnivoice');
define('HF_SPACE_URL', 'https://hereby-shopper-aid-producer.trycloudflare.com');
```

| Constante | Descricao |
|-----------|-----------|
| `API_KEY` | Chave HMAC (deve bater com Vercel) |
| `BASE_URL` | URL base do PHP no HostGator |
| `HF_SPACE_URL` | Fallback do tunnel URL (cloudflared) |

---

## 7. Detalhes Tecnicos por Feature

### 7.1 Chunking F5-TTS (prosodia natural)
- Texto dividido por frases (pontuacao: `.`, `!`, `?`)
- Virgulas NAO dividem chunks (evita micro-glitch)
- Cada frase gerada separadamente pelo F5-TTS
- Concatenacao profissional: crossfade, trim silencio, normalizacao volume
- Resultado: fala natural com pausas reais entre frases

### 7.2 Ducking (mixagem voz + trilha)
- Implementado 100% client-side com Web Audio API
- Timeline:
  1. Musica comeca com fade-in
  2. Musica alta ate a voz comecar
  3. Musica reduz (duck) quando voz entra
  4. Musica permanece baixa enquanto voz fala
  5. Musica volta alta (unduck) quando voz termina
  6. Musica fade-out final
- Configuravel pelo usuario no frontend

### 7.3 Voice Design (OmniVoice exclusivo)
- Usuario descreve a voz em texto: "homem jovem com sotaque brasileiro, tom grave"
- Parser converte texto para dropdowns OmniVoice: gender, age, pitch, style, accent
- OmniVoice `_design_fn` recebe params estruturados (nao texto livre)
- Suporta: Female/Male, Child/Teen/Young/Middle-aged/Elderly, pitch variants, Whisper, sotaques

### 7.4 Pronuncia CMU (OmniVoice)
- Texto pode conter pronuncia fonetica CMU: `[B EY1 S]` = "base"
- OmniVoice interpreta nativamente, sem tratamento especial no frontend

### 7.5 Simbolos nao-verbais (OmniVoice)
- `[laughter]`, `[clears throat]`, etc. funcionam nativamente
- Passam direto no texto sem tratamento especial

### 7.6 Upload de Voz (toggle admin)
- Admin pode habilitar/desabilitar upload de voz no cliente
- Quando desabilitado: usuario so pode usar vozes pre-cadastradas
- Quando habilitado: usuario pode fazer upload de audio proprio para clonagem
- Salvo em `SystemSetting` no banco (key: `enableVoiceUpload`)

---

## 8. Fluxo de Geracao (passo a passo)

### F5-TTS (via tunnel direto)

```
1. Usuario seleciona voz, escreve texto, clica Gerar
2. Frontend envia POST /api/tunnel-generate (Vercel)
3. Vercel busca tunnel URL via get_tunnel.php (sorteiomax)
4. Vercel faz proxy: baixa audio ref, upload pro Gradio, submete job
5. Gradio gera audio na GPU local
6. Vercel recebe audio via SSE streaming
7. Vercel retorna URL do audio pro frontend
8. Frontend reproduz (com ou sem trilha)
```

### OmniVoice (via PHP direto - ideal)

```
1. Usuario seleciona OmniVoice, escolhe modo (Clone/Design/Auto)
2. Frontend pede token: GET /api/omnivoice-token (Vercel)
3. Vercel retorna { generateUrl, token }
4. Frontend envia POST direto para generate-omnivoice.php (sorteiomax)
5. PHP busca tunnel URL via get_tunnel.php
6. PHP baixa audio ref (clone mode), upload pro Gradio, submete job
7. PHP recebe resultado via SSE streaming
8. PHP baixa audio gerado, converte pra base64
9. PHP retorna data URI do audio pro frontend
10. Frontend reproduz (com ou sem trilha)
```

### OmniVoice (via Vercel - fallback, sem AUDIO_SERVER_URL)

```
1. Usuario seleciona OmniVoice
2. Frontend nao consegue obter token PHP (AUDIO_SERVER_URL vazio)
3. Frontend envia POST /api/omnivoice-generate (Vercel)
4. Vercel faz tudo: tunnel, upload, submit, stream
5. Vercel retorna URL do audio
6. ⚠️ Risco: timeout 10s no free tier do Vercel
```

---

## 9. Problemas Conhecidos e Solucoes

| Problema | Status | Solucao |
|----------|--------|---------|
| Timeout Vercel (10s free tier) | ✅ Resolvido | OmniVoice via PHP direto |
| OmniVoice offline (endpoint names) | ✅ Resolvido | Check com e sem `/` prefixo |
| "Sem URL no output" (audio index) | ✅ Resolvido | Ler index 0 (audio), nao 1 (status) |
| Voice Design usando voz selecionada | ✅ Resolvido | Parser de texto + Auto mode |
| "Voz bebada" (numStep baixo) | ✅ Resolvido | numStep 32 (qualidade) |
| Idioma ignorado (language Auto) | ✅ Resolvido | Usa selecao do usuario |
| Ducking values stale (closure bug) | ✅ Resolvido | Atualizar dependencias do useCallback |
| CORS duplicate headers | ✅ Resolvido | header_remove() antes de setar |
| Upload arquivos grandes (>4.5MB) | ✅ Resolvido | Chunked upload |
| Mod_Security bloqueando POST | ✅ Resolvido | Content-Type header obrigatorio |
| Tunnel URL dinamica | ✅ Resolvido | get_tunnel.php + update_tunnel.php |
| **Falta AUDIO_SERVER_URL no Vercel** | ⚠️ Pendente | Configurar env var no Vercel |

---

## 10. O Que Falta Fazer

### Urgente:
1. **Configurar `AUDIO_SERVER_URL` e `AUDIO_SERVER_API_KEY` no Vercel**
   - Ir em Vercel Dashboard → Project → Settings → Environment Variables
   - `AUDIO_SERVER_URL` = `https://sorteiomax.com.br/omnivoice`
   - `AUDIO_SERVER_API_KEY` = `vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1`
   - Sem isso, OmniVoice ainda passa pelo Vercel (fallback)

### Futuro (discutido, nao implementado):
2. **Cache de resultado** (same text + voice = instant)
   - Armazenar hash (texto + voice) → audio gerado no sorteiomax
   - PHP verifica cache antes de gerar
   - Evita geracao duplicada

3. **Cache de voz local** (reference audio)
   - Ja funciona automaticamente (GPU precisa do arquivo local)
   - Nao precisa hospedar

4. **PHP admin panel no sorteiomax**
   - Gerenciar env vars, git pull, tunnel status via navegador
   - HostGator shared hosting suporta PHP mas nao Node.js

---

## 11. Resumo dos Commits Importantes

| Commit | Descricao |
|--------|-----------|
| `ceeb10b` | OmniVoice PHP direto - bypassa Vercel completamente |
| `9076556` | OmniVoice quality - 32 steps + idioma do usuario |
| `bff23a0` | Voice Design e Auto Voice corrigidos |
| `d96f5a8` | OmniVoice result parsing - audio no index 0 |
| `3ecbff6` | OmniVoice health check - endpoint names com `/` |
| `7f3cebe` | API OmniVoice reescrita com params Gradio corretos |
| `94a2e5e` | Bloqueia Voice Design/Auto no F5-TTS |
| `0fdc437` | Voice Design, Auto Voice, Upload voz + Pronuncia CMU |
| `9d03679` | Audio ducking system |
| `47d724c` | TTS prosody pipeline - chunking + concatenacao |
| `ecbc60b` | API tunnel-generate + integracao GPU local |
| `15a46aa` | Geracao de voz via PHP server |
| `1ece0f5` | Migracao de Vercel Blob para PHP hosting |

---

## 12. Como Usar

### Primeiro acesso:
1. Acessar a interface no Vercel
2. Se o botao OmniVoice estiver desabilitado = GPU offline. Ligar o `iniciar.bat` ou `iniciar_omnivoice.bat` na maquina local
3. O cloudflared vai registrar a URL do tunnel automaticamente
4. Recarregar a pagina — OmniVoice deve aparecer disponivel

### Para gerar voz:
1. Selecionar modelo (F5-TTS ou OmniVoice)
2. Selecionar modo de voz (Clone, Voice Design ou Auto)
3. Digitar o texto
4. Clicar "Gerar"
5. O audio aparece no player — opcionalmente mixar com trilha

### Para usar Voice Design:
1. Selecionar OmniVoice como modelo
2. Selecionar modo "Voice Design"
3. Descrever a voz: "homem jovem com sotaque brasileiro e tom grave"
4. Digitar texto e gerar

### Para usar Auto Voice:
1. Selecionar OmniVoice como modelo
2. Selecionar modo "Auto Voice"
3. Digitar texto e gerar (OmniVoice cria voz aleatoria)
