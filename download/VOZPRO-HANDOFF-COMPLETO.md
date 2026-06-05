# ===========================================
# HANDOFF COMPLETO - VOZPRO
# Data: 06/05/2026
# ===========================================

## PROJETO
- **Nome**: VozPro (VozPro TTS)
- **Site**: https://omnivoice-umber.vercel.app/
- **GitHub**: https://github.com/rgdweb/Omnivoice.git
- **Repositório local**: /home/z/my-project/

## CPANEL / SERVIDOR
- **URL cPanel**: https://sorteiomax.com.br:2083/
- **Usuário**: marci955
- **Senha**: Rgdweb@2637
- **FTP (para upload de arquivos)**:
  ```
  curl -s --connect-timeout 10 -m 30 \
    "ftp://sorteiomax.com.br/public_html/omnivoice/ARQUIVO.php" \
    --user "marci955:Rgdweb@2637" \
    -T "/caminho/local/arquivo.php" \
    -w "\nFTP: %{http_code}"
  ```
- **Resposta FTP 226/227 = sucesso**
- **cPanel WebDAV (NÃO funciona)**: portas 2078/2077 dão timeout
- **cPanel API (NÃO funciona)**: porta 2083 timeout em uploads grandes
- **cPanel Login AJAX (funciona para login, não para upload)**:
  ```
  curl -s -k "https://sorteiomax.com.br:2083/login/?login_only=1" \
    --data-urlencode "user=marci955" \
    --data-urlencode "pass=Rgdweb@2637"
  ```

## GIT - HISTÓRICO DE COMMITS (ORDEM CRONOLÓGICA)
```
ceeb10b  feat: VozPro PHP direto - bypassa Vercel completamente
3166864  (commit de sessão anterior)
d1df588  (commit de sessão anterior)
2a87170  (commit de sessão anterior)
9eaf63e  (commit de sessão anterior)
6ba5549  ← ESTADO QUE FUNCIONAVA SEM ESTALOS
1b550f9  ← ONDE COMEÇARAM OS PROBLEMAS (feat: adicionar toggles Denoise/Preprocess/Postprocess)
a973622  fix: reverter params hardcoded VozPro (tentativa de correção)
9869573  revert: restaurar estado funcional antes dos estalos (arquivos idênticos ao 6ba5549)
7a7ba32  atualização do ZIP do instalador
497b8cf  deploy: force rebuild to clear cache (último commit)
```

## BACKUP ESTÁVEL
- **Commit de referência (funcionando)**: `6ba5549`
- **Para restaurar**: `git checkout 6ba5549 -- php-server/generate-omnivoice.php src/app/api/omnivoice-generate/route.ts src/app/page.tsx`
- **Os 3 arquivos foram verificados com diff zero contra 6ba5549**

## ARQUIVOS PHP NO SERVIDOR (sorteiomax.com.br/omnivoice/)
```
/public_html/omnivoice/
├── config.php              ← CONFIG COM API_KEY (importante!)
├── generate-omnivoice.php  ← GERAÇÃO VOZPRO via PHP direto
├── get_tunnel.php          ← RETORNA URL DO TUNNEL ATIVO
├── update_tunnel.php       ← ATUALIZA URL DO TUNNEL (chamado pelo start_tunnel.ps1)
├── tunnel-config.ini       ← ARMAZENA URL DO TUNNEL (separado do config.php)
└── .htaccess               ← Proteção
```

### config.php - CONTEÚDO CORRETO:
```php
<?php
define('API_KEY', 'vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1');
define('BASE_URL', 'https://sorteiomax.com.br/omnivoice');
define('HF_SPACE_URL', 'https://hereby-shopper-aid-producer.trycloudflare.com');
define('ALLOWED_TYPES', ['ref', 'track', 'generated']);
define('MAX_SIZE', 50 * 1024 * 1024);
define('UPLOAD_DIR', __DIR__ . '/audios/');
define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);
define('ENABLE_LOGS', true);
```

### BUG CONHECIDO: update_tunnel.php sobrescreve config.php
- O `update_tunnel.php` pode sobrescrever o `config.php` com formato INI, destruindo os `define()`
- Isso causa erro 401 (API_KEY fica vazio)
- **Solução**: `update_tunnel.php` deve escrever em `tunnel-config.ini` (arquivo separado)
- `get_tunnel.php` deve ler de `tunnel-config.ini` com fallback para `HF_SPACE_URL`

## ARQUITETURA DO SISTEMA

### Fluxo VozPro PHP Direto (principal):
```
Browser → PHP (sorteiomax.com.br/omnivoice/generate-omnivoice.php)
       → get_tunnel.php (pega URL do tunnel)
       → Tunnel Cloudflare (trycloudflare.com)
       → VozPro Demo no PC (localhost:7860)
       → Retorna áudio em base64
```

### Fluxo F5-TTS:
```
Browser → Vercel API (/api/tunnel-generate)
       → get_tunnel.php (pega URL do tunnel)
       → Tunnel Cloudflare (trycloudflare.com)
       → F5-TTS no PC (localhost:7860)
       → Retorna áudio
```

### Fluxo VozPro via Vercel (fallback, NÃO recomendado - timeout 10s):
```
Browser → Vercel API (/api/omnivoice-generate)
       → get_tunnel.php → Tunnel → VozPro
```

### Autenticação:
- HMAC token entre Vercel/PHP e o servidor
- Token gerado em `/api/omnivoice-token` (Vercel)
- Validado no PHP via `hash_hmac('sha256', timestamp, API_KEY)`
- Token expira em 30 minutos

## VARIÁVEIS DE AMBIENTE (VERCEL)
Precisam estar configuradas:
- `AUDIO_SERVER_URL` = `https://sorteiomax.com.br/omnivoice`
- `AUDIO_SERVER_API_KEY` = `vozpro_2024_a8f7d9e2b4c1m6n3p5q0r9s2t8u1`

## PARAMÊTROS DO VOZPRO (valores estáveis)
```
Clone mode (_clone_fn): text, lang, ref_aud, ref_text, instruct, ns, gs, dn, sp, du, pp, po
Design/Auto mode (_design_fn): text, lang, ns, gs, dn, sp, du, pp, po, gender, age, pitch, style, accent, dialect

Valores padrão (hardcoded no PHP):
- numStep (ns): 32
- speed (sp): 1.0
- guidanceScale (gs): 2.0
- denoise (dn): true
- preprocess (pp): true
- postprocess (po): true
```

## BUG ATUAL: ESTALOS/CHIADOS NO ÁUDIO
### Situação:
- Estalos começaram APÓS commit `1b550f9` (adição de toggles)
- Código foi REVERTIDO para estado idêntico ao `6ba5549` (diff zero)
- PHP no servidor foi atualizado via FTP (verificado, diff zero)
- **MESMO ASSIM os estalos continuam**
- Afeta AMBOS os modelos: F5-TTS e VozPro
- Testado em janela anônima: mesma coisa

### Possíveis causas:
1. **CACHE DO VERCEL** - `x-vercel-cache: HIT` com ETag antigo
   - Foi disparado redeploy (commit `497b8cf`) para forçar rebuild
   - Verificar após deploy se estalos somem
   
2. **CACHE DO NAVEGADOR** - Mesmo em anônima pode ter Service Worker cacheado
   - Solução: Limpar dados de navegação completo (não só anônima)
   - Ou testar em outro navegador que nunca acessou o site

3. **ARQUIVOS NO SERVIDOR PHP** - Verificar se TODOS os PHPs estão corretos
   - `generate.php` (F5-TTS) pode ter sido alterado também
   - Comparar todos os PHPs do servidor com o git

4. **SERVICE WORKER CACHE** - Se o site tem service worker registrado
   - Verificar se há `/public/sw.js` ou similar

### Próximos passos para investigar:
1. Aguardar deploy do commit `497b8cf` e testar
2. Se persistir: comparar TODOS os PHPs do servidor vs git
3. Se persistir: testar em navegador diferente (Firefox se usa Chrome)
4. Se persistir: o problema pode ser no próprio VozPro/F5-TTS no PC

## SCRIPTS DO PC (INSTALADOR)
- **ZIP**: `/download/OmniVoice-Server.zip`
- **Arquivos**: iniciar.bat, start_tunnel.ps1 (ORIGINAL), start_hidden.vbs, stop.bat, restart.bat, OmniVoice-Server.bat, INSTALL.bat
- O `iniciar.bat` é IDÊNTICO ao original do usuário
- O `start_tunnel.ps1` é IDÊNTICO ao original do usuário
- Issue: `taskkill` não mata processos se os arquivos estão em uso (locked)

## DOCUMENTAÇÃO EXISTENTE
- `/download/VOZPRO-DOCUMENTACAO-COMPLETA.md` (437 linhas, da sessão anterior)

## ENVS DO PROJETO LOCAL
- Próximo de `/home/z/my-project/`
- Framework: Next.js 16 + TypeScript + Tailwind CSS 4 + shadcn/ui
