# Registro de Correção do Painel Admin

## Data: 2026-05-23

---

## PROBLEMA: "Erro ao carregar dados" no painel admin

### Sintoma
- Toast "Erro ao carregar dados" aparece ao entrar no admin
- Vozes e trilhas não são listadas (sidebar mostra contagem correta: Vozes (57), Trilhas (512))

### Causa Raiz
No arquivo `src/app/admin/page.tsx`, função `loadData()` (linha ~921):

```javascript
// BUG: fetch duplicado de /api/admin/settings
if (settingsRes.ok) {
  const settingsData = await settingsRes.json()
  setEnableVoiceUpload(settingsData.enableVoiceUpload === 'true')
  // ...
  // SEGUNDO fetch desnecessário:
  const adminSettingsRes = await fetch('/api/admin/settings')
  if (adminSettingsRes.ok) {
    const adminData = await adminSettingsRes.json()
    const settingsMap: Record<string, string> = {}
    for (const s of adminData) {  // ← CRASH AQUI: Object is not iterable
      settingsMap[s.key] = s.value
    }
    setAdminSettings(settingsMap)
  }
}
```

O problema: `/api/admin/settings` retorna um **OBJETO** `{key: value, ...}`, não um **ARRAY**.
`for...of` em objeto lança `TypeError: not iterable`, caindo no `catch` que mostra o toast.

### Por que aconteceu
O outro chat (sessão que dropou as tabelas) provavelmente alterou `/api/admin/settings` 
de retornar array para retornar objeto, ou o admin page foi escrito esperando array mas 
a API sempre retornou objeto e ninguém testou.

### Solução (commit 198821e)
Remover o fetch duplicado e usar diretamente o objeto retornado na primeira chamada:

```javascript
if (settingsRes.ok) {
  const settingsData = await settingsRes.json()
  setEnableVoiceUpload(settingsData.enableVoiceUpload === 'true')
  setWatermarkPath(settingsData.watermarkAudioPath || '')
  setWatermarkVolume(settingsData.watermarkVolume ? parseFloat(settingsData.watermarkVolume) : 0.08)
  setAdminSettings(settingsData)  // ← Já é objeto, usar direto
  setSettingsLoaded(true)
}
```

### Como detectar se acontecer de novo
1. Abrir DevTools → Network
2. Verificar se `/api/admin/settings` retorna 200 com objeto `{...}`
3. Se o toast "Erro ao carregar dados" aparecer com todos os outros APIs retornando 200:
   - O problema é o `for...of` no objeto dentro de `loadData()`
   - Corrigir removendo o fetch duplicado e usando o objeto diretamente

---

## COMIT CHAVE

### Último commit com admin funcionando: 8439d90
```bash
git checkout 8439d90 -- src/app/admin/page.tsx
```

### Antes do restore do outro chat (commit b0cc114): 3ac6a96

---

## FUNCIONALIDADES PERDIDAS (nunca commitadas)

As seguintes funcionalidades foram implementadas em outra sessão de chat 
mas **NUNCA foram salvas no git**. Não existe nenhum commit com esse código:

1. **Sistema de Pagamento MercadoPago** (rotas `/api/payment/*`)
2. **Google OAuth Login** (rota `/api/auth/google` + botão no login)
3. **Paywall R$1** (bloqueio de download sem pagamento)
4. **Fila de Geração** (rotas `/api/queue/*`)

### Como recuperar
- Não há commit para reverter - precisa recriar do zero
- Crédenciais do MercadoPago estão salvas no banco (SystemSetting)
- Google Client ID está salvo no banco

---

## BANCO DE DADOS

- **Sempre PostgreSQL (Neon)** - NUNCA SQLite
- DATABASE_URL: postgresql://neondb_owner:...@ep-blue-band-ac85wa8e-pooler.sa-east-1.aws.neon.tech/neondb
- Prisma WASM CLI não lê .env corretamente - usar: `DATABASE_URL="..." npx prisma db push`
- Variável de ambiente do shell pode sobrescrever .env - usar `unset DATABASE_URL` antes

