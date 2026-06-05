# VozPro / OmniVoice - Documentacao Consolidada

> **Consolidado em 14/05/2026**
> Sistema de clonagem de voz (TTS) comercial com dois modelos de IA rodando localmente em GPU (RTX 3060 12GB), expostos via tunnel, com frontend Next.js no Vercel e PHP no HostGator como intermediario. Suporta clonagem de voz, Voice Design, Auto Voice, mixagem com trilhas musicais e ducking.

---

## Arquivos Consolidados (Fontes Originais)

| # | Arquivo | Descricao |
|---|---------|-----------|
| 1 | `Omnivoice/SISTEMA-COMPLETO.md` | Documentacao principal do sistema (570 linhas) |
| 2 | `Omnivoice/download/PROMPT-MASTER-OMNIVOICE.md` | Prompt master para recriar o sistema |
| 3 | `Omnivoice/download/VOZPRO-HANDOFF-COMPLETO.md` | Handoff com credenciais e historico de commits |
| 4 | `Omnivoice/download/VOZPRO-DOCUMENTACAO-COMPLETA.md` | Documentacao completa com fases de desenvolvimento |
| 5 | `Omnivoice/download/OMNIVOICE-SISTEMA-COMPLETO-REFERENCIA.md` | Referencia tecnica detalhada de todas as funcoes |
| 6 | `download/ANALISE-COMPLETA-OMNIVOICE-PRONUNCIA.md` | Analise profunda de problemas de pronuncia e pipeline TTS |
| 7 | `Omnivoice/download/INSTRUCOES-INSTALACAO.txt` | Instrucoes de instalacao PHP local (XAMPP) |
| 8 | `Omnivoice/download/omnivoice-update/INSTRUCOES.txt` | Instrucoes de atualizacao para conexao direta via tunnel |
| 9 | `Omnivoice/download/omnivoice_htaccess.txt` | Configuracao .htaccess do servidor PHP |
| 10 | `Omnivoice/download/parent_htaccess_new.txt` | Configuracao .htaccess do diretorio pai |
| 11 | `Omnivoice/php-server/README.txt` | README do servidor PHP |
| 12 | `Omnivoice/download/VOZPRO-TROUBLESHOOTING-ESTALOS.pdf` | Troubleshooting de estalos/chiaidos no audio |
| 13 | `Omnivoice/local-server/INSTRUCOES-INSTALACAO.txt` | Instrucoes de instalacao do servidor local |
| 14 | `worklog.md` | Log de trabalho da sessao de melhorias do pipeline TTS |
| 15 | `RESEARCH_REPORT.md` | Relatorio de pesquisa sobre Sonauto, TTS e G2P |
| 16 | `Omnivoice/download/README.md` | README do diretorio de downloads |
| 17 | `Omnivoice/backup.sh` | Script de backup e restauracao |

---

## Indice de Documentacao

| Documento | Descricao |
|-----------|-----------|
| **[GUIA-COMPLETO.md](./GUIA-COMPLETO.md)** | Guia completo com arquitetura, deploy, API, troubleshooting, pronuncia, backup, roadmap |
| **[HISTORICO-ALTERACOES.md](./HISTORICO-ALTERACOES.md)** | Historico cronologico de todas as alteracoes, bugs, correcoes e status |

---

## Diagrama de Arquitetura

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
│  │ API Routes │──┼──▶│  │ generate.php (TTS)   │  │
│  │ /generate  │  │   │  │ generate-omnivoice   │  │
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
│  └────────────┘  │   │  Gradio API v2 (_clone_fn)       │
└──────────────────┘   │  PYTORCH_CUDA_ALLOC_CONF        │
                       └──────────────────────────────────┘
```

---

## Referencia Rapida

### Deploy (Producao)

```bash
# Deploy automatico via GitHub push
git push origin main

# Verificar se deploy foi bem sucedido
# Acesse: https://omnivoice-umber.vercel.app/
```

### Backup

```bash
# Criar backup com label
./backup.sh backup nome-do-backup

# Listar backups disponiveis
./backup.sh list

# Restaurar backup
./backup.sh restore nome-do-backup
```

### Debug / Diagnostico

```bash
# Verificar status do servidor
curl https://sorteiomax.com.br/omnivoice/get_tunnel.php
# Deve retornar: {"status":"online","tunnelUrl":"https://xxx.loca.lt",...}

# Health check da API
curl https://omnivoice-umber.vercel.app/api/status

# Verificar se GPU esta online
# Abrir http://localhost:7860 no PC com GPU
```

### Baixar arquivos atualizados via chat

Quando a IA atualizar arquivos PHP, voce pode baixar direto pelo chat:
1. Peca: "deixa os arquivos disponiveis pra baixar"
2. A IA copia os arquivos para `/download/`
3. Os arquivos aparecem no Task do chat para download

```bash
# A IA faz isso automaticamente:
cp php-server/generate.php /home/z/my-project/download/
cp php-server/generate-direct.php /home/z/my-project/download/
cp php-server/generate-omnivoice.php /home/z/my-project/download/
```

Depois basta subir no HostGator via cPanel > File Manager > public_html/omnivoice/

### Atualizar PHP Server (via FTP)

```bash
# Upload de arquivo via FTP
curl -s --connect-timeout 10 -m 30 \
  "ftp://sorteiomax.com.br/public_html/omnivoice/ARQUIVO.php" \
  --user "marci955:SENHA" \
  -T "/caminho/local/arquivo.php"
```

### Iniciar GPU Local (PC Windows)

1. Executar `iniciar.bat` (ativa conda, inicia VozPro, mata porta 7860)
2. Executar `start_tunnel.ps1` (cria tunnel e atualiza URL no PHP)
3. Aguardar ~30 segundos para tunnel ficar online

### Comandos Git Importantes

```bash
# Commit estavel de referencia (sem estalos): 6ba5549
# Restaurar arquivos desse commit:
git checkout 6ba5549 -- php-server/generate-omnivoice.php src/app/api/omnivoice-generate/route.ts src/app/page.tsx

# Branch de melhorias TTS
# PR: https://github.com/rgdweb/Omnivoice/pull/new/feat/tts-pipeline-improvements
```

### Variaveis de Ambiente (Vercel)

| Variavel | Valor |
|----------|-------|
| `DATABASE_URL` | String PostgreSQL (Neon) |
| `ADMIN_PASSWORD` | Senha do admin |
| `JWT_SECRET` | Chave para cookies |
| `AUDIO_SERVER_URL` | `https://sorteiomax.com.br/omnivoice` |
| `AUDIO_SERVER_API_KEY` | `vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1` |

---

## Links Importantes

| Recurso | URL |
|---------|-----|
| **Producao** | https://omnivoice-umber.vercel.app/ |
| **PHP Server** | https://sorteiomax.com.br/omnivoice/ |
| **GitHub** | https://github.com/rgdweb/Omnivoice |
| **cPanel** | https://sorteiomax.com.br:2083/ |
