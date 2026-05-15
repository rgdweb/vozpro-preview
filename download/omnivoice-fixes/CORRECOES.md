# OmniVoice - Correcoes Aplicadas (15/05/2026)

## Resumo do Diagnostico

Foram encontrados **6 bugs criticos** nos arquivos do servidor Hostgator que explicam todos os sintomas reportados (audio cortado, garbling, travamentos, ignorar pontuacao).

---

## Bugs Encontrados e Corrigidos

### BUG 1: `config.php` sem funcao `logUpload()` (CRITICO)
- **Erro no error_log**: `Fatal error: Call to undefined function logUpload()` em `upload.php:142` e `delete.php:71`
- **Impacto**: Uploads e delecoes de audio falham completamente
- **Causa**: O config.php do servidor nao define `ENABLE_LOGS` nem a funcao `logUpload()`, mas upload.php e delete.php chamam essa funcao
- **Correcao**: Adicionadas as constantes `ENABLE_LOGS`, `LOG_FILE` e a funcao `logUpload()` ao config.php

### BUG 2: `generate-omnivoice.php` sem `stripSSML()` (CRITICO)
- **Impacto**: Tags SSML (ex: `<speak>`, `<break>`) enviadas como texto literal para o TTS → **garbling** e **leitura de tags como palavras**
- **Causa**: A versao do servidor nao tinha a funcao `stripSSML()` que remove tags XML/SSML do texto antes de enviar ao TTS
- **Correcao**: Adicionada funcao `stripSSML()` + funcao `cleanText()` para remover caracteres de controle invisiveis que tambem podem causar problemas

### BUG 3: `memory_limit = 128M` muito baixo (CRITICO)
- **Impacto**: Audio longo e convertido para base64 excede 128MB de memoria → **PHP mata o processo** → **audio cortado no final**
- **Causa**: O `.user.ini` do servidor define `memory_limit = 128M`, insuficiente para audios gerados com textos longos
- **Correcao**: Aumentado para `memory_limit = 512M` no `.user.ini` e `ini_set('memory_limit', '512M')` no PHP

### BUG 4: SSE timeout de apenas 300s (ALTO)
- **Impacto**: Textos longos demoram mais de 300s para gerar → **timeout** → **silencio/travamento**
- **Causa**: A funcao `streamResult()` tinha timeout padrao de 300 segundos
- **Correcao**: Aumentado para 600s (10 minutos)

### BUG 5: `check.php` referencia arquivo inexistente (MEDIO)
- **Erro**: `check.php` faz `file_get_contents("generate.php")` mas esse arquivo nao existe mais
- **Impacto**: Nao causava bugs diretos no TTS, mas o check sempre retornava "not found"
- **Correcao**: Atualizado para referenciar `generate-omnivoice.php` e adicionado check completo (tunnel, memory, PHP version)

### BUG 6: `iniciar.bat` espera fixa de 15s (MEDIO)
- **Impacto**: GPU demora 30s+ para carregar modelo → tunnel tenta conectar antes do servidor subir → erro "servidor offline" → **precisa abrir 3 vezes**
- **Causa**: O bat usava `timeout /t 15` fixo sem verificar se o servidor realmente subiu
- **Correcao**: Substituido por health check com `curl http://localhost:7860/` a cada 5s, maximo de 120s

---

## Arquivos Corrigidos (para upload no servidor)

### Hospedagem Hostgator (via cPanel File Manager → /public_html/omnivoice/):
1. **config.php** — Adicionada funcao logUpload() e constantes ENABLE_LOGS/LOG_FILE
2. **generate-omnivoice.php** — Adicionadas stripSSML() + cleanText(), timeouts aumentados, CURLOPT_ENCODING em todos os curls
3. **.user.ini** — memory_limit 128M → 512M, max_execution_time 300 → 600
4. **check.php** — Atualizado para funcionar corretamente

### PC local (pasta do OmniVoice GPU):
5. **iniciar.bat** — Health check ao inves de timeout fixo

---

## Instrucoes de Upload

### No servidor Hostgator:
1. Acesse cPanel: https://sh-pro138.hostgator.com.br:2083
2. Login: marci955 | Senha: Rgdweb@2637
3. Va em **File Manager** → **public_html** → **omnivoice**
4. Para cada arquivo:
   - Clique com botao direito no arquivo existente → **Edit** ou **Delete + Upload**
   - Substitua pelo arquivo corrigido correspondente
5. **IMPORTANTE**: Nao altere as linhas `TUNNEL_URL` e `TUNNEL_UPDATED_AT` no config.php — elas sao atualizadas automaticamente pelo start_tunnel.ps1

### No PC local:
1. Substitua o `iniciar.bat` na pasta do OmniVoice GPU
2. Certifique-se que `start_tunnel.ps1` esta na mesma pasta

---

## O que cada correcao resolve:

| Sintoma | Causa | Correcao |
|---------|-------|----------|
| Audio corta no final | memory_limit 128M → PHP mata processo | memory_limit 512M |
| Garbling/fala palavras do ref audio | SSML tags lidas como texto | stripSSML() + cleanText() |
| Travamento/silencio | SSE timeout 300s | Timeout 600s |
| Ignora pontuacao | Tags SSML embutidas no texto | stripSSML() |
| Erro ao fazer upload de ref audio | logUpload() indefinida | Adicionada ao config.php |
| Precisa abrir 3x o iniciar.bat | GPU nao subiu em 15s | Health check inteligente |
