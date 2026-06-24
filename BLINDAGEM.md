# 🛡️ BLINDAGEM DE CÓDIGO — VOZPRO
# ⚠️ ESTE ARQUIVO É SAGRADO. NÃO ALTERE NADA AQUI SEM ORDEM EXPLÍCITA.
# Cada item abaixo foi um erro REAL que causou DOWNTIME.
# Se você tocar em qualquer coisa listada aqui, vai quebrar o sistema.

===============================================================================
BLOCO 1 — API KEY (causou "Não autorizado" no upload admin)
===============================================================================

O PHP server (config.php) usa API_KEY = 'omnivoice_sk_2024_secure_key_v4'
O código VozPro DEVE usar o mesmo valor como fallback padrão.

ARQUIVOS PROTEGIDOS:
  ✅ src/lib/audio-server.ts — getAudioServerApiKey() fallback
  ✅ src/app/api/health/route.ts — AUDIO_SERVER_API_KEY fallback
  ✅ src/app/api/maintenance/route.ts — ORACLE_API_KEY fallback
  ✅ src/app/api/upload-chunk/route.ts — getAudioServerApiKey() fallback

VALOR CORRETO: 'omnivoice_sk_2024_secure_key_v4'
VALOR ERRADO (NUNCA USE): 'omnivoice_api_key_2026_secure'

⚠️ PROIBIDO: Mudar o fallback para qualquer outro valor
⚠️ PROIBIDO: Usar '' (string vazia) como fallback
⚠️ PROIBIDO: Adicionar domain: '.cvmnews.com.br' em cookies

===============================================================================
BLOCO 2 — COOKIES DE AUTENTICAÇÃO (causou "não desloga" e admin sem acesso)
===============================================================================

Cookies de sessão DEVEM ser setados SEM o atributo `domain`.
O browser define automaticamente para o host correto.

ARQUIVOS PROTEGIDOS:
  ✅ src/app/api/auth/route.ts — login e logout
  ✅ src/app/api/auth/google/route.ts — Google OAuth login

CONFIGURAÇÃO CORRETA DOS COOKIES:
  vozpro_session:
    httpOnly: true
    secure: process.env.NODE_ENV === 'production'
    sameSite: 'lax'
    maxAge: 86400 (24h)
    path: '/'
    ⚠️ SEM domain: '.cvmnews.com.br' (QUEBRA LOGOUT!)
    ⚠️ SEM secure: true hardcode (QUEBRA EM DEV!)

  vozpro_admin (legado):
    Mesmas regras acima

⚠️ PROIBIDO: Adicionar `domain: '.cvmnews.com.br'` em qualquer cookie
⚠️ PROIBIDO: Usar `secure: true` sem `process.env.NODE_ENV === 'production'`

===============================================================================
BLOCO 3 — GPU PROXY (causou "Failed to fetch" e áudio embaralhado)
===============================================================================

O frontend DEVE usar /api/gpu-proxy para falar com a GPU.
NUNCA chamar api.cvmnews.com.br diretamente do browser (CORS).

ARQUIVOS PROTEGIDOS:
  ✅ src/app/api/gpu-proxy/route.ts — proxy camelCase → snake_case
  ✅ src/app/page.tsx — geração via /api/gpu-proxy

FLUXO CORRETO:
  Browser → /api/gpu-proxy (Next.js) → WireGuard 10.99.0.2:7860

⚠️ PROIBIDO: fetch('https://api.cvmnews.com.br/api/native-generate') no browser
⚠️ PROIBIDO: Remover o text split do omnivoice_gpu.py (F5-TTS garra sem split)
⚠️ PROIBIDO: Remover smartSplitText do frontend já foi removido — NÃO VOLTE

===============================================================================
BLOCO 4 — AUTH ADMIN (causou admin não reconhece login Google)
===============================================================================

getAdminSession() DEVE aceitar tanto vozpro_session (Google/email)
quanto vozpro_admin (legado). A ordem de verificação importa.

ARQUIVOS PROTEGIDOS:
  ✅ src/lib/auth.ts — getAdminSession(), verifySession(), getSession()
  ✅ src/app/api/auth/verify/route.ts — verifica sessão

FLUXO CORRETO:
  1. Login Google → POST /api/auth/google → seta vozpro_session
  2. Admin page → GET /api/auth/verify → getSession() → verifySession()
  3. Upload → getAdminSession() → verifySession() → retorna true

⚠️ PROIBIDO: Mudar a ordem de verificação em getAdminSession()
⚠️ PROIBIDO: Remover ensureAdminExists() (mesmo que rode em try-catch separado)

===============================================================================
BLOCO 5 — PHP CONFIG (causou "Tipo de arquivo não permitido")
===============================================================================

O /var/www/omnivoice/config.php DEVE ter ALLOWED_TYPES definido.
Sem isso, o upload.php usa array vazio e rejeita TUDO.

CONFIGURAÇÃO CORRETA EM config.php:
  define('ALLOWED_TYPES', [
      'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/x-wav',
      'audio/ogg', 'audio/webm', 'audio/m4a', 'audio/x-m4a',
      'audio/flac', 'audio/x-flac'
  ]);
  define('ALLOWED_CATEGORIES', ['ref', 'track', 'generated']);
  define('MAX_SIZE', 50 * 1024 * 1024);
  define('UPLOAD_DIR', __DIR__ . '/audios/');
  define('BASE_URL', 'https://api.cvmnews.com.br');

⚠️ PROIBIDO: Remover ALLOWED_TYPES do config.php
⚠️ PROIBIDO: Deixar config.php sem ALLOWED_TYPES (upload.php usa require_once config.php)

===============================================================================
BLOCO 6 — DEPLOY
===============================================================================

REGRA ABSOLUTA: python3 /home/ubuntu/omnivoice/deploy-seguro.py
NUNCA: pm2 restart sozinho (faz rebuild via deploy-seguro.py)
NUNCA: git reset --hard
NUNCA: Alterar .env sem verificar API_KEY corresponde ao config.php

===============================================================================
HISTÓRICO DE ERROS (para nunca repetir)
===============================================================================

ERRO #1 — "Não autorizado" no upload admin
  CAUSA: API key padrão no código (omnivoice_api_key_2026_secure) ≠ PHP (omnivoice_sk_2024_secure_key_v4)
  CORREÇÃO: Mudar fallback para 'omnivoice_sk_2024_secure_key_v4'

ERRO #2 — "Não desloga" / admin não reconhece login Google
  CAUSA: Cookie com domain: '.cvmnews.com.br' não era limpo no logout
  CORREÇÃO: Remover domain dos cookies, usar secure condicional

ERRO #3 — "Failed to fetch" (180ms)
  CAUSA: Browser chamando api.cvmnews.com.br direto (CORS)
  CORREÇÃO: Criar /api/gpu-proxy que faz proxy server-side

ERRO #4 — Áudio embaralhado/garbled
  CAUSA: Removido text split do GPU (F5-TTS precisa de split)
  CORREÇÃO: Restaurar split no omnivoice_gpu.py (NÃO MEXER NELE)

ERRO #5 — "Tipo de arquivo não permitido"
  CAUSA: config.php sem ALLOWED_TYPES definido → array vazio → nenhum tipo aceito
  CORREÇÃO: Adicionar ALLOWED_TYPES no config.php

ERRO #6 — "Selecione uma variação de voz"
  CAUSA: body sem voiceMode
  CORREÇÃO: Incluir voiceMode no tunnelBody

ERRO #7 — Áudio referência misturado com texto
  CAUSA: gpu-proxy enviando camelCase, GPU espera snake_case
  CORREÇÃO: Converter camelCase → snake_case no gpu-proxy
