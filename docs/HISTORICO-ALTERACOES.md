# VozPro / OmniVoice - Historico de Alteracoes

> **Consolidado em 14/05/2026**
> Este documento consolida TODAS as alteracoes conhecidas no sistema, ordenadas cronologicamente.
> Inclui referencias a commits, arquivos modificados, bugs encontrados e status de cada item.

---

## Arquivos Fonte Consultados

| Arquivo | Conteudo Relevante |
|---------|-------------------|
| `VOZPRO-DOCUMENTACAO-COMPLETA.md` | Fases 1-9 de desenvolvimento, commits importantes |
| `VOZPRO-HANDOFF-COMPLETO.md` | Historico de commits com hash, estalos, backup estavel |
| `SISTEMA-COMPLETO.md` | Problemas resolvidos por fase, decisoes arquiteturais |
| `ANALISE-COMPLETA-OMNIVOICE-PRONUNCIA.md` | 6 bugs + 8 problemas arquiteturais encontrados |
| `worklog.md` | Melhorias do pipeline TTS (branch feat/tts-pipeline-improvements) |
| `omnivoice-update/INSTRUCOES.txt` | Atualizacao para conexao direta via tunnel |
| `RESEARCH_REPORT.md` | Pesquisa sobre Sonauto, G2P, DiffSinger |

---

## Fase 1: Fundacao do Sistema (Inicial)

### Commit `bbe9802` - Projeto criado
- **Data**: Inicio do projeto
- **Descricao**: Projeto VozPro criado com Next.js + Prisma + Neon PostgreSQL
- **Arquivos**: Projeto base completo
- **Status**: ✅ Concluido

### SQLite para PostgreSQL (Neon)
- **Motivo**: SQLite nao funciona no Vercel (serverless, sem filesystem persistente)
- **Acao**: Migracao completa para PostgreSQL (Neon) + Prisma ORM
- **Arquivos**: `prisma/schema.prisma`, `src/lib/db.ts`
- **Status**: ✅ Concluido

### Armazenamento de Audio: Vercel Blob -> PHP Hosting
- **Motivo**: Vercel Blob tem limites de tamanho e custo
- **Acao 1**: Primeiro implementado com Vercel Blob
- **Acao 2**: Migrado para PHP hosting no HostGator (sorteiomax.com.br)
- **Arquivos**: `php-server/upload.php`, `php-server/delete.php`, `php-server/config.php`
- **Status**: ✅ Concluido

### Build falhava com `prisma migrate deploy`
- **Motivo**: `migrate deploy` precisa de conexao com banco durante build
- **Acao**: Removido do build script
- **Arquivos**: `package.json`
- **Status**: ✅ Concluido

### 404 NOT_FOUND no deploy
- **Motivo**: Variaveis de ambiente configuradas no projeto errado do Vercel
- **Acao**: Corrigido projeto no Vercel
- **Status**: ✅ Concluido

---

## Fase 2: PHP Server (Bypass Timeout Vercel)

### Timeout 60s na geracao TTS
- **Motivo**: Vercel Hobby tem timeout de 10s (free) / 60s (pro). Geracao TTS demora 30-120s+
- **Acao**: PHP proxy (`generate.php`) faz polling sem limite de timeout
- **Arquivos**: `php-server/generate.php`, `.htaccess` (max_execution_time=600)
- **Status**: ✅ Concluido

### Criacao do PHP Server completo
- **Arquivos criados**: `generate.php`, `upload.php`, `delete.php`, `config.php`
- **Autenticacao**: Token HMAC (timestamp + SHA256) para evitar uso indevido
- **CORS**: Habilitado no PHP
- **Commit**: `15a46aa` - Geracao de voz via PHP server
- **Commit**: `1ece0f5` - Migracao de Vercel Blob para PHP hosting
- **Status**: ✅ Concluido

### Commit `ecbc60b` - API tunnel-generate + integracao GPU local
- **Descricao**: API route para geracao via tunnel direto (GPU local)
- **Status**: ✅ Concluido

---

## Fase 3: Chunking e Prosodia

### Texto dividido em frases com pausas reais
- **Descricao**: Implementado chunking frase por frase para geracao TTS
- **Detalhes**:
  - Pontuacao forte (`.`, `!`, `?`) divide chunks
  - Virgula NAO divide (eliminou micro-glitch)
  - Pausas: `.`=400ms, `!`=450ms, `?`=500ms, `...`=600ms
  - Concatenacao profissional: crossfade, trim silencio, normalizacao volume
- **Commit**: `47d724c` - TTS prosody pipeline - chunking + concatenacao
- **Arquivos**: `src/lib/tts-chunker.ts`, `src/lib/tts-text-preprocessor.ts`
- **Status**: ✅ Concluido

---

## Fase 4: Ducking (Mixagem Voz + Trilha)

### Sistema de audio ducking client-side
- **Descricao**: Musica comeca alta, reduz quando a voz entra, volta alta apos voz
- **Detalhes**:
  - 100% client-side com Web Audio API
  - Configuravel: duckVolume, fadeInMs, duckFadeMs, unduckFadeMs, fadeOutMs, musicStartLeadMs
  - Mono output + compressor para clareza da voz
  - MP3 encoding com lamejs para arquivos de saida
- **Commit**: `9d03679` - Audio ducking system
- **Arquivos**: Componentes de mixagem no frontend
- **Status**: ✅ Concluido

---

## Fase 5: GPU Local com Tunnel

### Script `start_tunnel.ps1` (PowerShell)
- **Descricao**: Inicia cloudflared automaticamente, registra URL no PHP
- **Arquivos**: `local-server/start_tunnel.ps1`
- **Status**: ✅ Concluido

### Cloudflare Quick Tunnel -> Localtunnel
- **Motivo**: Cloudflare Quick Tunnel nao suporta SSE (Server-Sent Events)
- **Acao**: Migrado para Localtunnel (npx localtunnel)
- **Alternativas descartadas**: ngrok (requer conta/pago), Cloudflare (sem SSE)
- **Arquivos**: `local-server/start_tunnel.ps1`, `php-server/update_tunnel.php`
- **Status**: ✅ Concluido

### ngrok descartado
- **Motivo**: Requer conta autenticada (pago)
- **Status**: ❌ Descartado

---

## Fase 6: Integracao VozPro

### VozPro (k2-fsa) adicionado como segundo modelo TTS
- **Descricao**: OmniVoice adicionado como alternativa ao F5-TTS
- **Arquivos**: `local-server/omnivoice_server.py`, `src/app/api/omnivoice-generate/route.ts`
- **Status**: ✅ Concluido

### Health check automatico
- **Descricao**: Botao VozPro desabilitado se servidor offline
- **Status**: ✅ Concluido

---

## Fase 7: Correcoes VozPro (Bugs Criticos)

### Bug 1: VozPro Offline (endpoint names com `/`)
- **Descricao**: Gradio retorna nomes de endpoints com `/` prefixo (`/_design_fn`, `/_clone_fn`), mas o codigo checava sem `/`
- **Correcao**: Verifica com e sem `/` no health check
- **Commit**: `3ecbff6`
- **Status**: ✅ Concluido

### Bug 2: "Sem URL no output"
- **Descricao**: Gradio retorna `[audio, status]` mas o codigo lia `[status, audio]` (index 1 em vez de 0)
- **Correcao**: Ler index 0 para audio, index 1 para status
- **Commit**: `d96f5a8`
- **Status**: ✅ Concluido

### Bug 3: Voice Design/Auto usando voz selecionada
- **Descricao**: Ao selecionar Voice Design ou Auto Voice, o sistema enviava metadados da voz selecionada em vez dos params corretos
- **Correcao**: Parser de texto para dropdowns VozPro + Auto mode forca todos params como "Auto"
- **Commit**: `bff23a0`
- **Status**: ✅ Concluido

### Bug 4: "Voz bebada" e palavras erradas
- **Descricao**: `numStep: 16` (modo rapido) gerava audio com palavras distorcidas. `language: 'Auto'` ignorava a selecao do usuario
- **Correcao**: `numStep` mudado para 32 (qualidade). Language agora usa selecao do usuario
- **Commit**: `9076556`
- **Status**: ✅ Concluido

### API VozPro reescrita com params Gradio corretos
- **Commit**: `7f3cebe`
- **Status**: ✅ Concluido

### Bloqueia Voice Design/Auto no F5-TTS
- **Commit**: `94a2e5e`
- **Status**: ✅ Concluido

---

## Fase 8: VozPro PHP Direto (Bypass Total do Vercel)

### Commit `ceeb10b` - VozPro PHP direto
- **Descricao**: `generate-omnivoice.php` + `get_tunnel.php` + `tunnel-config.ini` + `update_tunnel.php`
- **Resultado**: VozPro vai Browser -> PHP sorteiomax -> Tunnel -> GPU. Zero Vercel.
- **Arquivos**: `php-server/generate-omnivoice.php`, `php-server/get_tunnel.php`, `php-server/tunnel-config.ini`
- **Status**: ✅ Concluido

---

## Fase 9: Voice Design, Auto Voice, Upload e Pronuncia

### Commit `0fdc437` - Voice Design, Auto Voice, Upload voz + Pronuncia CMU
- **Descricao**: Implementacao completa dos modos Voice Design e Auto Voice
- **Status**: ✅ Concluido

### Admin e Upload de Voz (toggle admin)
- **Descricao**: Painel admin com toggle para habilitar/desabilitar upload de voz no cliente
- **Modelo**: `SystemSetting` no Prisma (key-value pairs)
- **Status**: ✅ Concluido

---

## Problemas de Upload de Audios

### "Failed to fetch" no upload de trilhas
- **Motivo**: CORS entre Vercel e PHP
- **Solucao**: Resolvido com server-to-server proxy
- **Status**: ✅ Concluido

### Vercel Hobby limita payload a 4.5MB
- **Acao 1**: Compressao WAV com sample rate reduzido (qualidade terrivel)
- **Acao 2**: MP3 encoding com lamejs (192kbps 44100Hz stereo, ~1.9MB)
- **Status**: ✅ Concluido

### Qualidade terrivel (WAV 11025Hz mono)
- **Motivo**: Para caber 80s de WAV em 3.5MB, precisou reduzir sample rate
- **Solucao**: MP3 192kbps mantem 44100Hz stereo com qualidade alta
- **Status**: ✅ Concluido

### Upload direto navegador->PHP falha (CORS)
- **Descricao**: `upload-direct.php` funciona via curl mas navegador bloqueia
- **Status**: ❌ Nao em uso (backup)

### Chunked Upload implementado
- **Descricao**: Divide arquivos em chunks de 3MB
- **Status**: ❌ Substituido por MP3 encoding (nao necessario)

### "Unexpected end of JSON input"
- **Motivo**: PHP retornava resposta vazia (HTTP 500)
- **Solucao**: Parsing seguro (ler como texto primeiro)
- **Status**: ✅ Concluido

### CORS duplicate headers
- **Motivo**: PHP enviava headers CORS duplicados
- **Solucao**: `header_remove()` antes de `setar`
- **Status**: ✅ Concluido

### Mod_Security bloqueando POST
- **Motivo**: Servidor HostGator bloqueava POST sem Content-Type
- **Solucao**: Content-Type header obrigatorio
- **Status**: ✅ Concluido

---

## Bug: Estalos/Chiaidos no Audio

### Situacao
- Estalos comecaram APOS commit `1b550f9` (adicao de toggles Denoise/Preprocess/Postprocess)
- Codigo foi REVERTIDO para estado identario ao `6ba5549` (diff zero)
- PHP no servidor foi atualizado via FTP (verificado, diff zero)
- **MESMO ASSIM os estalos continuam**
- Afeta AMBOS os modelos: F5-TTS e VozPro

### Possiveis causas investigadas
1. **CACHE DO VERCEL** - `x-vercel-cache: HIT` com ETag antigo. Foi disparado redeploy (`497b8cf`)
2. **CACHE DO NAVEGADOR** - Mesmo em anônima pode ter Service Worker cacheado
3. **ARQUIVOS NO SERVIDOR PHP** - Verificar se TODOS os PHPs estao corretos
4. **SERVICE WORKER CACHE** - Verificar se há `/public/sw.js`

### Status: ⚠️ Investigacao em andamento

### Commits relacionados:
| Hash | Descricao |
|------|-----------|
| `6ba5549` | Estado estavel (SEM estalos) - Backup de referencia |
| `1b550f9` | ONDE COMECARAM OS PROBLEMAS (feat: toggles Denoise/Preprocess/Postprocess) |
| `a973622` | fix: reverter params hardcoded VozPro (tentativa de correcao) |
| `9869573` | revert: restaurar estado funcional (arquivos identicos ao 6ba5549) |
| `497b8cf` | deploy: force rebuild to clear cache |

### Documentacao adicional:
- `Omnivoice/download/VOZPRO-TROUBLESHOOTING-ESTALOS.pdf` - Guia detalhado de troubleshooting

---

## Bug: update_tunnel.php sobrescreve config.php

### Descricao
- O `update_tunnel.php` pode sobrescrever o `config.php` com formato INI, destruindo os `define()`
- Isso causa erro 401 (API_KEY fica vazio)

### Solucao
- `update_tunnel.php` deve escrever em `tunnel-config.ini` (arquivo separado)
- `get_tunnel.php` deve ler de `tunnel-config.ini` com fallback para `HF_SPACE_URL`

### Status: ✅ Parcialmente resolvido (tunnel-config.ini criado)

---

## Atualizacao: Conexao Direta via Tunnel

### Mudanca de arquitetura
- **ANTES**: Vercel -> HostGator (processa audio) -> tunnel -> Gradio
- **DEPOIS**: Vercel -> tunnel -> Gradio (DIRETO, audio limpo!)
- **Motivo**: Eliminar processamento intermediario no HostGator que causava degradacao

### Arquivos criados/atualizados
- `php-server/get_tunnel.php` (NOVO - Retorna URL do tunnel)
- `php-server/update_tunnel.php` (ATUALIZADO - Com CORS e validacao)
- `php-server/config.php` (LIMPO - Formato padrao)
- `frontend/omnivoice-direct.js` (MODULO - Conexao direta com Gradio)
- `frontend/teste-omnivoice.html` (PAGINA DE TESTE standalone)

### Ganhos
- Audio chega limpo direto no Gradio (resolve "voz bebada")
- ~5-8 segundos mais rapido por geracao
- Menos carga no HostGator
- Upload temporario (audio some apos geracao)

### Status: ✅ Implementado (arquivos criados, pendente integracao no Vercel)

---

## Analise de Pronuncia (Aggressive Prompt - 13/05/2026)

### 6 Bugs Encontrados

| # | Bug | Arquivo | Linha | Status |
|---|-----|---------|-------|--------|
| 1 | **Remocao de colchetes de pronuncia forcada** - Linha que REMOVE `[pronuncia]` antes de enviar ao VozPro, destruindo 1100+ entradas do dicionario | `src/app/api/omnivoice-generate/route.ts` | 258 | ✅ Corrigido (linha deletada) |
| 2 | **SSML removido sem conversao** - Backend usa `stripSSMLForTTS()` (REMOVE tudo) ao inves de `parseSSML()` (CONVERTE para formato VozPro) | `src/app/api/omnivoice-generate/route.ts` | 245 | ⚠️ Pendente |
| 3 | **Dicionario hardcoded de 1100+ palavras** - Nao escalavel, manutencao insustentavel | `src/lib/pronunciation-optimizer.ts` | 118-1407 | ⚠️ Parcialmente resolvido (G2P em desenvolvimento) |
| 4 | **Ausencia de pipeline G2P** - Toda conversao texto-pronuncia e manual (regex + dicionario + LLM fallback) | Pipeline geral | - | ⚠️ G2P espeak-ng criado, pendente integracao |
| 5 | **Pipeline F5-TTS vs OmniVoice compartilham processamento** - F5-TTS NAO suporta colchetes nativamente, OmniVoice SIM | `src/lib/pronunciation-optimizer.ts` | - | ⚠️ Pendente separacao |
| 6 | **PHP generate.php sem pre-processamento de pronuncia** - Texto vai "cru" para o VozPro sem nenhuma otimizacao | `php-server/generate.php` | 128-129 | ⚠️ Pendente |

### 8 Problemas Arquiteturais Encontrados

| # | Problema | Descricao | Status |
|---|----------|-----------|--------|
| 1 | **Falta G2P automatico** | Sistema depende de 1400+ entradas manuais | ⚠️ G2P espeak-ng proposto |
| 2 | **Dicionarios duplicados** | 3 dicionarios separados com logica sobreposta | ⚠️ Necessario consolidar |
| 3 | **LLM fallback lento** | 1-3s de latencia por chamada | ⚠️ Substituir por G2P |
| 4 | **Limite 800 chars** | Pode truncar textos longos sem aviso | ⚠️ Pendente |
| 5 | **Pipeline PHP sem pronuncia** | Fluxo PHP direto perde otimizacoes | ⚠️ Pendente |
| 6 | **generate-dict.py nao integrado** | Script existe mas resultado NAO vai para producao | ⚠️ Pendente |
| 7 | **Sem Duration Predictor** | TTS nao controla duracao de cada fonema | ⚠️ Roadmap (Fase 3) |
| 8 | **Sem Pitch Predictor** | Entonacao plana/artificial | ⚠️ Roadmap (Fase 3) |

---

## Correcoes do Pipeline TTS (14/05/2026)

### Branch: `feat/tts-pipeline-improvements`

### Correcao 1: Removida linha 258 de route.ts
- **Descricao**: Linha que destruia colchetes de pronuncia `[palavra]`
- **Arquivo**: `src/app/api/omnivoice-generate/route.ts`
- **Status**: ✅ Concluido (commit + push)

### Correcao 2: Adicionados `[]` ao regex de caracteres permitidos
- **Descricao**: PASSO 3 de route.ts agora permite colchetes no texto
- **Arquivo**: `src/app/api/omnivoice-generate/route.ts`
- **Status**: ✅ Concluido (commit + push)

### Correcao 3: Criada API route `/api/g2p-phonemize` com espeak-ng
- **Descricao**: Microservico G2P para PT-BR usando espeak-ng 1.52.0
- **Arquivo**: `src/app/api/g2p-phonemize/route.ts`
- **Status**: ✅ Concluido (commit + push)

### Correcao 4: Melhorada lista de conjuncoes PT-BR no chunker
- **Descricao**: Mais conjuncoes para divisao inteligente de chunks
- **Arquivo**: `src/lib/tts-chunker.ts`
- **Status**: ✅ Concluido (commit + push)

### Correcao 5: Adicionadas pausas para `;` (300ms) e `:` (350ms)
- **Descricao**: Pontuacao adicional com pausas configuradas
- **Arquivo**: `src/lib/tts-chunker.ts`
- **Status**: ✅ Concluido (commit + push)

### Resumo
- **Branch**: `feat/tts-pipeline-improvements`
- **PR**: https://github.com/rgdweb/Omnivoice/pull/new/feat/tts-pipeline-improvements
- **Alteracoes**: 3 arquivos modificados, 268 insercoes, 12 delecoes
- **espeak-ng**: 1.52.0 confirmado disponivel com voz pt-br

---

## Commits Importantes (Ordem Cronologica Completa)

| Commit | Descricao | Fase |
|--------|-----------|------|
| `bbe9802` | Projeto VozPro criado (Next.js + Prisma + Neon) | 1 |
| `1ece0f5` | Migracao de Vercel Blob para PHP hosting | 2 |
| `15a46aa` | Geracao de voz via PHP server | 2 |
| `ecbc60b` | API tunnel-generate + integracao GPU local | 5 |
| `47d724c` | TTS prosody pipeline - chunking + concatenacao | 3 |
| `9d03679` | Audio ducking system | 4 |
| `3ecbff6` | VozPro health check - endpoint names com `/` | 7 |
| `d96f5a8` | VozPro result parsing - audio no index 0 | 7 |
| `bff23a0` | Voice Design e Auto Voice corrigidos | 7 |
| `7f3cebe` | API VozPro reescrita com params Gradio corretos | 7 |
| `94a2e5e` | Bloqueia Voice Design/Auto no F5-TTS | 7 |
| `9076556` | VozPro quality - 32 steps + idioma do usuario | 7 |
| `0fdc437` | Voice Design, Auto Voice, Upload voz + Pronuncia CMU | 9 |
| `ceeb10b` | VozPro PHP direto - bypassa Vercel completamente | 8 |
| `6ba5549` | **Estado estavel (SEM estalos)** | - |
| `1b550f9` | ONDE COMECARAM OS ESTALOS (toggles Denoise/Preprocess) | - |
| `a973622` | fix: reverter params hardcoded VozPro | - |
| `9869573` | revert: restaurar estado funcional (diff zero vs 6ba5549) | - |
| `7a7ba32` | atualizacao do ZIP do instalador | - |
| `497b8cf` | deploy: force rebuild to clear cache | - |

---

## Resumo de Status por Area

| Area | Status | Notas |
|------|--------|-------|
| **Clonagem de voz (Clone)** | ✅ Funcional | Modelo VozPro e F5-TTS operacionais |
| **Voice Design** | ✅ Funcional | VozPro exclusivo |
| **Auto Voice** | ✅ Funcional | VozPro exclusivo |
| **Mixagem com trilha (Ducking)** | ✅ Funcional | Client-side Web Audio API |
| **Upload de audios** | ✅ Funcional | MP3 encoding, trim 80s |
| **Painel Admin** | ✅ Funcional | CRUD vozes, variacoes, trilhas |
| **GPU Local + Tunnel** | ✅ Funcional | Localtunnel, auto-update |
| **PHP Server** | ✅ Funcional | generate.php, upload, delete |
| **Autenticacao** | ✅ Funcional | Cookie-based, 24h |
| **Chunking + Prosodia** | ✅ Funcional | Pausas por pontuacao |
| **Pronuncia (Dicionario)** | ⚠️ Parcial | 1100+ entradas, bug do backend corrigido |
| **G2P Automatico (espeak-ng)** | ⚠️ Parcial | API criada, pendente integracao no pipeline |
| **SSML Support** | ⚠️ Pendente | Parser existe mas usa strip ao inves de parse |
| **Pipeline F5-TTS separado** | ⚠️ Pendente | Logica compartilhada precisa separacao |
| **PHP com pronuncia** | ⚠️ Pendente | Texto chega cru ao VozPro |
| **Estalos no audio** | ⚠️ Investigacao | Possivel cache, causa nao confirmada |
| **Cache de resultado** | 🔲 Nao implementado | Futuro |
| **Duration/Pitch Predictor** | 🔲 Roadmap | Fase 3 (longo prazo) |
| **Pipeline DiffSinger** | 🔲 Roadmap | Fase 3 (longo prazo) |
