---
Task ID: 0
Agent: main
Task: PROCEDIMENTO DE ACESSO CPANEL - REGISTRO PERMANENTE

Work Log:
- Registrado procedimento completo para sempre acessar e editar arquivos no servidor

## ==================== PROCEDIMENTO CPANEL ====================
## SEMPRE que precisar editar/subir/verificar arquivos no servidor, seguir ESTES passos:

### 1. ACESSAR CPANEL
```
URL: https://sorteiomax.com.br:2083
Login: marci955
Senha: Rgdweb@2637
```

### 2. FLUXO COM agent-browser
```
# Abrir cPanel
agent-browser open "https://sorteiomax.com.br:2083"

# Esperar carregar e fazer login
agent-browser snapshot -i
# Encontrar refs: @e11 (username), @e12 (password), @e13 (login button)
agent-browser fill @e11 "marci955"
agent-browser fill @e12 "Rgdweb@2637"
agent-browser click @e13
agent-browser wait --load networkidle

# Se aparecer popup de consentimento, fechar:
agent-browser click @e6  # Close User Consent
```

### 3. ABRIR FILE MANAGER
```
# Encontrar ref do "Gerenciador de arquivos" (geralmente @e55 na primeira carga)
agent-browser snapshot -i
# Procurar: link "Gerenciador de arquivos"
agent-browser click @e55  # (ref pode mudar, sempre usar snapshot antes)
agent-browser wait --load networkidle
```

### 4. NAVEGAR PARA /public_html/omnivoice/
```
# Via input de path (ref @e2 = textbox, @e3 = botão Ir):
agent-browser fill @e2 "/public_html/omnivoice"
agent-browser click @e3
agent-browser wait --load networkidle
```

### 5. UPLOAD DE ARQUIVOS (ZIP)
```
# Clicar em Carregar (geralmente @e9 ou @e24)
agent-browser snapshot -i  # encontrar ref de "Carregar"
agent-browser click @e9
agent-browser wait --load networkidle

# Marcar "Substitua os arquivos existentes"
agent-browser snapshot -i  # encontrar checkbox ref (ex: @e4)
agent-browser check @e4

# O file input fica invisível. Tornar visível e fazer upload:
agent-browser eval "const fi = document.querySelector('input[type=file]'); fi.style.display='block'; fi.style.opacity='1'; fi.id='myFi';"
agent-browser snapshot -i  # agora aparece "Choose File" (ex: @e6)
agent-browser upload @e6 "/caminho/do/arquivo.zip"

# Submeter form
agent-browser eval "document.querySelector('form').submit();"

# Voltar para listagem
agent-browser snapshot -i  # encontrar "Voltar" (ex: @e3)
agent-browser click @e3
agent-browser wait --load networkidle
```

### 6. EXTRAIR ZIP
```
# Selecionar o arquivo zip clicando na celula com o nome
agent-browser eval "document.querySelectorAll('td').forEach(td => { if(td.textContent.trim() === 'NOME_DO_ZIP.zip' && td.offsetParent) td.click(); });"

# Clicar em Extrair
agent-browser snapshot -i  # encontrar "Extrair" (ex: @e32)
agent-browser click @e32
agent-browser wait 3000

# Confirmar extração
agent-browser snapshot -i  # encontrar "Extract Files" (ex: @e22)
agent-browser click @e22
agent-browser wait --load networkidle

# Fechar dialogo de resultado
agent-browser snapshot -i  # encontrar "Close" (ex: @e8)
agent-browser click @e8
```

### 7. VERIFICAR CONTEÚDO DE ARQUIVO (via editor ACE)
```
# Selecionar arquivo
agent-browser eval "document.querySelectorAll('td').forEach(td => { if(td.textContent.trim() === 'generate-direct.php' && td.offsetParent) td.click(); });"

# Clicar Editar
agent-browser snapshot -i  # encontrar "Editar" (ex: @e29)
agent-browser click @e29
agent-browser wait 5000

# Ler conteudo do ACE editor:
agent-browser eval "const ace = document.querySelector('#codewindow'); const val = ace.env.editor.getValue(); val.includes('fixPortuguesePronunciation');"

# Fechar editor: Escape
agent-browser press Escape
```

### 8. DELETAR ARQUIVOS
```
# Selecionar arquivo clicando na celula
agent-browser eval "document.querySelectorAll('td').forEach(td => { if(td.textContent.trim() === 'ARQUIVO.php' && td.offsetParent) td.click(); });"

# Clicar Excluir
agent-browser snapshot -i  # encontrar "Excluir" (ex: @e26)
agent-browser click @e26
agent-browser wait 3000

# Confirmar exclusão
agent-browser snapshot -i  # encontrar "Confirm" (ex: @e22)
agent-browser click @e22
agent-browser wait --load networkidle
```

### 9. VERIFICAR LISTA DE ARQUIVOS
```
# Listar todos os arquivos PHP no diretório atual:
agent-browser eval "const allTds = document.querySelectorAll('td'); const phps = []; allTds.forEach(td => { if(td.textContent.trim().match(/\\.php$/) && td.offsetParent) { const row = td.parentElement; const cells = Array.from(row.children); phps.push(cells.map(c=>c.textContent.trim()).join(' | ')); }}); phps.join('\\n')"

# Verificar se arquivo existe:
agent-browser eval "const found = Array.from(document.querySelectorAll('td')).some(td => td.textContent.trim() === 'NOME.php' && td.offsetParent); found ? 'EXISTS' : 'NOT FOUND'"
```

### 10. EXECUTAR PHP REMOTAMENTE
```
# Subir um PHP de verificação e acessar via browser:
agent-browser open "https://sorteiomax.com.br/omnivoice/check_pronuncia.php"
agent-browser eval "document.body.innerText"
```

### DADOS IMPORTANTES DO SERVIDOR
- cPanel: https://sorteiomax.com.br:2083
- Site: https://sorteiomax.com.br
- Diretório OmniVoice: /public_html/omnivoice/
- Path absoluto: /home4/marci955/public_html/omnivoice/
- PHP: 8.3.31, LiteSpeed, FastCGI
- Local dev path: /home/z/my-project/php-server/

### OBSERVAÇÕES IMPORTANTES
- Os refs (ex: @e11, @e55) mudam a cada carregamento de página. SEMPRE usar snapshot -i antes de clicar
- O editor do cPanel usa ACE editor (não textarea simples). Para ler conteúdo: document.querySelector('#codewindow').env.editor.getValue()
- O file input de upload é invisível por padrão. Precisa tornar visível com JS antes de usar upload
- Checkbox "Substitua os arquivos existentes" DEVE estar marcado ao subir arquivos atualizados
- Sempre fechar/limpar arquivos temporários após verificações
- O form de upload às vezes some, usar document.querySelector('form').submit() como fallback

Stage Summary:
- Procedimento completo de acesso cPanel registrado permanentemente no worklog
- Sempre seguir estes passos para qualquer edição no servidor

---
Task ID: 1
Agent: main
Task: Verificar e corrigir arquivos PHP no servidor cPanel + diagnosticar pronúncia "exatamente"

Work Log:
- Leu os 3 arquivos PHP locais (generate-direct.php, generate.php, generate-omnivoice.php)
- Confirmou que todos têm fixPortuguesePronunciation() com dicionário completo + funções auxiliares (cleanText, stripSSML, CURLOPT_ENCODING)
- Acessou cPanel (sorteiomax.com.br:2083) com credenciais marci955/Rgdweb@2637
- Navegou até /public_html/omnivoice/ no File Manager
- Abriu generate-direct.php no editor do cPanel e confirmou: **FUNÇÃO NÃO EXISTIA NO SERVIDOR**
- Este era o problema raiz: os arquivos que o usuário subiu anteriormente eram versões ANTIGAS sem o dicionário de pronúncia
- Criou ZIP com 14 arquivos PHP corrigidos de /home/z/my-project/php-server/
- Subiu ZIP via cPanel File Manager → Extrair
- Confirmou extração com sucesso (tamanhos aumentaram: generate-direct 23.8KB→24.94KB, generate.php 24.92KB→26.05KB, generate-omnivoice.php 26.94KB→28.07KB)
- Criou check_pronuncia.php para verificar todos os 3 arquivos remotamente
- Resultado: TODOS os 3 arquivos têm TODAS as correções:
  - fixPortuguesePronunciation(): ✅
  - Dicionário "ezatamente": ✅
  - Chamada no pipeline fixPortuguesePronunciation($texto): ✅
  - Dicionário palavras corrompidas (ekssatamente→ezatamente): ✅
  - cleanText(): ✅
  - stripSSML(): ✅
  - CURLOPT_ENCODING => '': ✅
- Limpou arquivos temporários (check_pronuncia.php, .zip)

Stage Summary:
- PROBLEMA DESCOBERTO: Os arquivos no servidor NÃO tinham a função fixPortuguesePronunciation(). Os arquivos que o usuário subiu antes eram versões antigas.
- CORREÇÃO: Todos os 3 PHP foram atualizados com versões locais corretas
- O "exatamente" falando "ekssatamente" era porque o dicionário de pronúncia simplesmente NÃO EXISTIA no servidor
- Agora com os arquivos corretos, "exatamente" será substituído por "ezatamente" ANTES de enviar ao TTS
---
Task ID: 1
Agent: Main Agent
Task: Corrigir pronúncia de siglas (HTML, SQL, etc.) e palavra "teste" no TTS

Work Log:
- Analisado o dicionário de pronúncia existente nos 3 PHPs (generate-omnivoice.php, generate.php, generate-direct.php)
- Adicionada seção $abbreviations com 100+ siglas organizadas por categoria:
  - Documentos (CPF, CNPJ, RG, CNH, IPTU, IPVA...)
  - Tecnologia (HTML, CSS, SQL, API, TTS, GPU, CPU, PDF, PHP, HTTP, JSON...)
  - Redes (WiFi, LAN, WAN, VPN, IP, USB, HDMI, SSD...)
  - Medicina (SUS, ANS, HIV...)
  - Governo (IBGE, INSS, PF, PJ, MEI...)
  - Educação (ENEM, PROUNI, FIES...)
  - Financeiro (PIX, CDI, SELIC, IPCA, PIB...)
  - Outros (CEO, CFO, CTO, FAQ, WhatsApp, YouTube...)
- Adicionada seção $problemWords para palavras com timbre errado: "teste" → "téstie", "testes" → "tésties"
- Siglas são case-insensitive (HTML, html, Html tudo funciona)
- Removidas duplicatas acidentais no generate-omnivoice.php
- ZIP criado e enviado ao servidor via cPanel (browser automation)
- Arquivos extraídos em /public_html/omnivoice/ substituindo os antigos

Stage Summary:
- 3 arquivos PHP atualizados no servidor com dicionário de siglas completo
- As siglas agora são pronunciadas letra por letra em português (ex: HTML = "agá-tê-eme-ele", SQL = "esse-cú-ele")
- "Teste" agora pronuncia com timbre correto
- Git commit: 99edd0f pushado para origin/main
---
Task ID: 2
Agent: Main Agent
Task: Git commit + push mudanças pendentes (slider velocidade + speed clamp)

Work Log:
- Verificado que src/app/page.tsx já tinha slider min=0.8 max=1.3 ✅
- Verificado que Omnivoice/src/app/api/omnivoice-generate/route.ts ainda tinha clamp antigo (0.25-4.0) ❌
- Corrigido clamp no submodule: Math.max(0.25, Math.min(4.0, ...)) → Math.max(0.8, Math.min(1.3, ...))
- Commit no submodule: "fix: clamp velocidade 0.8-1.3 no API route"
- Git pull --rebase → conflito resolvido (ambos já tinham 0.8-1.3)
- Push do submodule + push do projeto principal
- Commit final: 99edd0f em origin/main

Stage Summary:
- Todos os arquivos estão sincronizados: slider 0.8-1.3 no frontend + clamp 0.8-1.3 no backend
- Git push concluído com sucesso
