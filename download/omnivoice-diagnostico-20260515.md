# DIAGNÓSTICO COMPLETO - OmniVoice/VozPro
## Data: 15/05/2026
## Análise: Servidor Produção vs Git vs Documentação

---

## 1. RESUMO EXECUTIVO

Foram analisados TODOS os arquivos PHP do servidor de produção (HostGator), os arquivos do repositório Git (github.com/rgdweb/Omnivoice), os scripts locais (iniciar.bat, start_tunnel.ps1), e a documentação completa do sistema.

**Encontrados 8 problemas**, sendo 3 CRÍTICOS que causam diretamente os bugs relatados (corte de palavras, travadas, silêncios).

---

## 2. ARQUITETURA DO FLUXO PRINCIPAL (O QUE ESTÁ EM USO)

```
Browser → Vercel (/api/omnivoice-token) → Token HMAC
Browser → PHP Server (generate-omnivoice.php) → get_tunnel.php → Tunnel URL
PHP → Cloudflare Tunnel → GPU Local (localhost:7860) → OmniVoice Gradio API
PHP → SSE Stream → Aguarda resultado → Download áudio → Base64 → Browser
```

O fluxo PRINCIPAL usa o `generate-omnivoice.php` NO SERVIDOR PHP, NÃO o Vercel route.ts.

---

## 3. COMPARAÇÃO SERVIDOR vs GIT

| Arquivo | Git | Servidor | Diferença? |
|---------|-----|----------|------------|
| config.php | Sem TUNNEL_URL, HF_SPACE_URL hardcoded | Com TUNNEL_URL (auto-update), HF_SPACE_URL morta | SIM - DIFERENTE |
| generate-omnivoice.php | Com stripSSML() | Sem stripSSML() | SIM - MENOR |
| get_tunnel.php | Lê tunnel-config.ini | Lê TUNNEL_URL do config.php | SIM - DIFERENTE |
| update_tunnel.php | Escreve em tunnel-config.ini | Escreve no config.php via regex | SIM - DIFERENTE |
| tunnel-config.ini | Existe (vazio) | NÃO EXISTE | SIM |
| .htaccess | Com limite upload/timeout | Apenas CORS + proteção config | SIM - DIFERENTE |
| .user.ini | memory_limit=128M | Não consegui baixar | ? |
| generate.php | Existe | NÃO EXISTE (404) | SIM - AUSENTE |

---

## 4. PROBLEMAS ENCONTRADOS

### PROBLEMA #1 - CRÍTICO: po=true (postprocess) corta sílabas

**Arquivo**: generate-omnivoice.php (servidor) linhas 413 e 438
**Impacto**: CORTE DE PALAVRAS NO FINAL, TRAVADAS

O servidor PHP envia `po = true` (postprocess LIGADO) para o VozPro.
Mas o Vercel route.ts envia `po = false` (postprocess DESLIGADO).

O próprio comentário no route.ts diz:
```
false,  // po (postprocess OFF — client-side trimming evita corte de sílabas)
```

O postprocess do VozPro faz trim de silêncio e pode cortar sílabas finais.
Quando `po = true`, o modelo pode "comer" as últimas sílabas das palavras.

**PHP (servidor) - ERRADO:**
```php
true,   // po (postprocess) ← ESTÁ CAUSANDO CORTE DE SÍLABAS
```

**route.ts (Vercel) - CORRETO:**
```typescript
false,  // po (postprocess OFF — client-side trimming evita corte de sílabas)
```

**Correção**: Mudar `true` para `false` nas linhas 413 e 438.

---

### PROBLEMA #2 - CRÍTICO: Sem pré-processamento de texto no PHP

**Arquivo**: generate-omnivoice.php (servidor)
**Impacto**: FALA DE PALAVRAS ESTRANHAS, IGNORA PONTUAÇÃO

O Vercel route.ts faz 7 passos de limpeza de texto:
1. Converte SSML para formato VozPro (parseSSML)
2. Remove URLs e emails
3. Filtra caracteres (mantém letras, números, acentos, pontuação, colchetes)
4. Preserva colchetes de pronúncia forçada [palavra]
5. Remove espaços múltiplos
6. Garante espaço após vírgula e ponto-e-vírgula
7. Limita a 800 caracteres

O PHP NÃO FAZ NENHUMA DESSAS LIMPEZAS. O texto vai "cru" direto para o TTS.

Isso causa:
- Palavras estranhas se o texto tiver URLs/emails
- Pontuação mal interpretada
- Texto longo pode causar problemas

**Correção**: Adicionar as mesmas 7 etapas de limpeza no generate-omnivoice.php.

---

### PROBLEMA #3 - CRÍTICO: Sem trim do áudio de referência

**Arquivo**: generate-omnivoice.php (servidor)
**Impacto**: CUDA OOM, TRAVADAS, SILÊNCIOS

O generate.php (que está no Git mas NÃO no servidor) faz trim do áudio de referência para máximo 10 segundos usando trim_audio.py:
```php
define('MAX_REF_AUDIO_SECONDS', 10);
$trimmedFile = trimAudioToMaxSeconds($tempFile, MAX_REF_AUDIO_SECONDS);
```

O generate-omnivoice.php NÃO faz esse trim. Se o áudio de referência for maior que 10s, pode causar CUDA Out of Memory na RTX 3060 12GB, gerando áudio corrompido, com travadas e silêncios.

**Correção**: Adicionar trim de áudio de referência no generate-omnivoice.php.

---

### PROBLEMA #4 - IMPORTANTE: Timeout SSE de 300s pode ser curto

**Arquivo**: generate-omnivoice.php linhas 262 e 495
**Impacto**: TIMEOUT EM TEXTOS LONGOS

O generate.php (v4 no Git) usa timeout de 600s (10 min).
O generate-omnivoice.php usa timeout de 300s (5 min).

Para textos longos (acima de 500 caracteres), o VozPro pode demorar mais de 5 minutos para gerar o áudio, causando timeout.

**Correção**: Aumentar timeout de 300s para 600s.

---

### PROBLEMA #5 - IMPORTANTE: HF_SPACE_URL está MORTA no config.php

**Arquivo**: config.php (servidor)
**Impacto**: FALLBACK PARA URL INVÁLIDA

O config.php ainda tem:
```php
define('HF_SPACE_URL', 'https://hereby-shopper-aid-producer.trycloudflare.com');
```

Essa URL é de uma sessão antiga do Cloudflare. Está morta.
Se o get_tunnel.php falhar por qualquer motivo, o PHP cai nessa URL morta.

**Correção**: Remover ou atualizar a HF_SPACE_URL para um valor vazio. O sistema deve depender apenas do TUNNEL_URL que é atualizado automaticamente.

---

### PROBLEMA #6 - MODERADO: .user.ini e .htaccess sem limites adequados

**Arquivo**: .htaccess (servidor)
**Impacto**: TIMEOUT DO HOSTGATOR PODE INTERROMPER GERAÇÃO

O .htaccess do servidor NÃO tem as diretivas de timeout que o Git tem:
```apache
# Git version (completo):
php_value upload_max_filesize 50M
php_value post_max_size 55M
php_value max_execution_time 600
php_value max_input_time 300

# Server version (incompleto):
# Apenas CORS e proteção config.php
```

Sem `max_execution_time = 600`, o Hostgator pode usar o default (30-60s), o que interrompe gerações longas.

**Correção**: Adicionar as diretivas de timeout e upload no .htaccess.

---

### PROBLEMA #7 - MODERADO: Sem health check antes de gerar

**Arquivo**: generate-omnivoice.php
**Impacto**: PERDA DE TEMPO SE TUNNEL ESTIVER MORTO

O PHP só descobre que o tunnel caiu depois de:
1. Baixar o áudio de referência
2. Fazer upload para o Gradio
3. Submeter o job
4. Esperar o SSE timeoutar

Isso pode desperdiçar vários minutos.

**Correção**: Adicionar um health check (GET no tunnel URL) antes de iniciar o processo de geração.

---

### PROBLEMA #8 - INFORMAÇÃO: error_log inacessível

**Arquivo**: error_log (servidor) - 12,653 bytes
**Status**: Bloqueado por HTTP (403) e FTP timeout na transferência

O error_log tem erros que podem revelar problemas adicionais. Não foi possível ler o conteúdo.

**Ação necessária**: Ler o error_log via cPanel File Manager ou PHP script.

---

## 5. CORRELAÇÃO: BUGS DO USUÁRIO vs PROBLEMAS TÉCNICOS

| Bug relatado | Causa técnica | Problema # |
|-------------|---------------|------------|
| Corta palavras no final | po=true (postprocess corta sílabas) | #1 |
| Fala palavras do áudio de referência | Modelo GPT-SoVITS (conhecido) + sem trim do ref audio | #3 |
| Não respeita ponto e vírgula | Sem pré-processamento de texto no PHP | #2 |
| Travada na fala / silêncio | po=true + sem trim ref audio + timeout curto | #1, #3, #4 |
| Travadas esporádicas | Tunnel instável + sem health check | #7 |

---

## 6. CORREÇÕES PRIORITÁRIAS

### URGENTE (fazer agora - resolve os bugs principais):

**A) Mudar po=true para po=false no generate-omnivoice.php**
- Linha 413: `true,  // po (postprocess)` → `false, // po (postprocess OFF)`
- Linha 438: `true,  // po (postprocess)` → `false, // po (postprocess OFF)`

**B) Adicionar trim de áudio de referência no generate-omnivoice.php**
- Após downloadRefAudio(), chamar trimAudioToMaxSeconds() com max 12s

**C) Adicionar pré-processamento de texto no generate-omnivoice.php**
- Remover URLs, emails
- Filtrar caracteres especiais
- Garantir espaço após pontuação

### IMPORTANTE (fazer em seguida):

**D) Aumentar timeout SSE de 300s para 600s**
- Linhas 262 e 495: `300` → `600`

**E) Corrigir .htaccess com diretivas de timeout**
- Adicionar max_execution_time=600, upload_max_filesize=50M, etc.

**F) Remover HF_SPACE_URL morta do config.php**
- Trocar por valor vazio ou URL genérica

**G) Adicionar health check do tunnel antes de gerar**
- GET no tunnel URL antes de iniciar upload + submit

---

## 7. BUG DO "ABRIR 3 VEZES" (iniciar.bat)

O iniciar.bat espera 15 segundos para o OmniVoice carregar (linha 20).
Mas o modelo CUDA demora mais que isso na primeira vez.

**Correção**: Aumentar para 30 segundos E adicionar verificação de saúde:
```batch
echo [2/4] Iniciando OmniVoice Demo (porta 7860)...
start "OmniVoice GPU" cmd /k "..."
echo      Aguardando 30 segundos...
timeout /t 30 /nobreak >nul

echo [2.5/4] Verificando se OmniVoice está online...
:check_server
curl -s -o nul http://localhost:7860/ 2>nul
if %errorlevel% neq 0 (
    echo      OmniVoice ainda não está pronto, aguardando mais 10s...
    timeout /t 10 /nobreak >nul
    goto check_server
)
echo      OmniVoice online!
```

---

## 8. ARQUIVOS DO SERVIDOR (PRODUÇÃO)

Listagem completa do diretório /public_html/omnivoice/:
```
.htaccess         (546 bytes, CORS + proteção)
.user.ini         (257 bytes, config PHP)
audios/           (4 KB, diretório)
check.php         (177 bytes, diagnóstico)
check_url.php     (162 bytes, verifica tunnel)
config.php        (1.1 KB, ATUALIZADO pelo tunnel)
debug.php         (729 bytes, informações do servidor)
debug_read.php    (523 bytes, leitura debug)
delete.php        (2.29 KB, deletar áudios)
error_log         (11.25 KB, ERROS - INACESSÍVEL)
fix_htaccess.php  (0 bytes, vazio)
generate-omnivoice.php (18.12 KB, GERADOR PRINCIPAL)
generate_backup.php (18.83 KB, backup do gerador)
get_tunnel.php    (657 bytes, lê tunnel URL)
php.ini1          (72 bytes, config PHP alternativa)
README.txt        (1.18 KB, instruções)
test.txt          (0 bytes, vazio)
test_reader.txt   (0 bytes, vazio)
tmp_reader.php    (93 bytes, teste temporário)
trim_audio.py     (4.53 KB, trim de áudio)
update_tunnel.php (1.11 KB, atualiza tunnel no config.php)
upload-direct.php (5.85 KB, upload direto)
upload.php        (12.3 KB, upload normal)
uploads.log       (log de uploads)
```

---

## 9. TUNNEL STATUS

```
URL: https://introduce-laden-orbit-vids.trycloudflare.com
Atualizado: 2026-05-14 11:58:44
Status: Online (respondendo)
Idade: ~1 dia (ainda válida se cloudflared estiver rodando)
```

---

## 10. CONCLUSÃO

Os bugs relatados (corte de palavras, travadas, silêncios) são causados principalmente por 3 problemas no generate-omnivoice.php:
1. **po=true** ativa o postprocess que corta sílabas
2. **Sem trim do áudio de referência** pode causar CUDA OOM
3. **Sem pré-processamento de texto** deixa passar caracteres inválidos

A correção desses 3 problemas deve eliminar a maioria dos bugs de áudio.
