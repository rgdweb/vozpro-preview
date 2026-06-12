# Correções Realizadas no Oracle VozPro (12/06/2025)

## Resumo
Estas são TODAS as correções feitas para eliminar estalos/crackling no áudio, ativar email, corrigir idioma e outros ajustes. O sistema está 100% funcional com estas correções aplicadas.

---

## Correção 1: Estalos/Crackling no Áudio (CRÍTICA)

### Arquivo: `/var/www/omnivoice/tunnel-generate.php`
### Problema: Áudio gerado tinha estalos/crackling/ruidos
### Causa: O cloudflared comprimia a resposta binária WAV (base64) com gzip/deflate,
e o PHP curl aceitava essa compressão, corrompendo os dados binários do áudio.
### Solução: Forçar `CURLOPT_ENCODING => 'identity'` para bloquear qualquer compressão.

**Trecho crítico adicionado:**
```php
// Cabeçalhos
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Accept-Encoding: identity',   // CRITICAL: bloqueia compressao cloudflared!
]);

// Opção cURL
curl_setopt($ch, CURLOPT_ENCODING, 'identity');  // CRITICAL: nao aceita gzip/deflate na resposta
```

**Antes:** `CURLOPT_ENCODING => ''` (aceita qualquer compressão)
**Depois:** `CURLOPT_ENCODING => 'identity'` (força resposta sem compressão)

---

## Correção 2: Envio de Email Desativado

### Arquivo: `/home/ubuntu/omnivoice/.env`
### Problema: A função de enviar áudio por email não funcionava (faltava configuração SMTP)
### Solução: Adicionar variáveis SMTP ao .env

**Variáveis adicionadas:**
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=contatorgdweb@gmail.com
SMTP_PASS=bzgq tcff pfab bsre
EMAIL_FROM=VozPro <contatorgdweb@gmail.com>
```

---

## Correção 3: Opções de Download Ocultas para Usuários Gratuitos

### Arquivo: `/home/ubuntu/omnivoice/src/components/payment-dialog.tsx`
### Problema: Usuários gratuitos não viam as opções de download (WAV, MP3, Email)
### Solução: Modificar `handleDownloadClick` para sempre abrir o PaymentDialog

**Arquivo: `/home/ubuntu/omnivoice/src/app/page.tsx`**
```tsx
// ANTES: condição complexa que bypassava o dialog para free users
// DEPOIS: sempre abre o dialog
const handleDownloadClick = useCallback(async () => {
  const url = audioUrl
  if (!url) return
  setPaymentDialogOpen(true)
}, [audioUrl])
```

**Arquivo: `/home/ubuntu/omnivoice/src/components/payment-dialog.tsx`**
```tsx
// Adicionado consumo de crédito de download gratuito antes do download:
const handleFreeAction = useCallback(async () => {
  if (deliveryMode === 'email') {
    handleSendEmail()
  } else {
    if (freeDownloads > 0) {
      try { await fetch('/api/free-download', { method: 'POST' }) } catch { }
    }
    onPaymentApproved(format)
    onOpenChange(false)
  }
}, [deliveryMode, format, onPaymentApproved, onOpenChange, handleSendEmail, freeDownloads])
```

---

## Correção 4: Código de Idioma Errado (Gerava Áudio em Inglês)

### Arquivo: `/home/ubuntu/omnivoice/src/app/page.tsx` (linha ~251)
### Problema: `'Portuguese'` era enviado como idioma, mas o OmniVoice precisa
do formato `'Portuguese (pt)'` para extrair o código ISO `pt` corretamente.
### Solução: Alterar o valor do idioma

**Antes:** `{ value: 'Portuguese', label: 'Português' }`
**Depois:** `{ value: 'Portuguese (pt)', label: 'Português' }`

---

## Correção 5: Texto de Referência Artificial (ref_text)

### Arquivo: `/home/ubuntu/omnivoice/src/app/api/generate/route.ts` (linhas 175, 188)
### Problema: Quando não havia transcrição, era enviado um texto artificial
`'texto de referencia para clonagem de voz'` que afetava a qualidade da clonagem.
### Solução: Enviar string vazia quando não há transcrição

**Antes:** `ref_text: refText.trim() || 'texto de referencia para clonagem de voz'`
**Depois:** `ref_text: refText.trim() || ''`

---

## Correção 6: guidance_scale Fixo em 1.5 (Qualidade Reduzida)

### Arquivo: `/home/ubuntu/omnivoice/src/app/api/generate/route.ts` (linhas 176, 189)
### Problema: guidance_scale estava fixo em 1.5 ao invés de usar o valor do frontend (default 2.0)
### Solução: Usar o valor enviado pelo frontend com fallback para 2.0

**Antes:** `guidance_scale: 1.5`
**Depois:** `guidance_scale: (body as Record<string, unknown>).guidanceScale ?? (body as Record<string, unknown>).guidance_scale ?? 2.0`

---

## Correção 7: Auto-Split Desativado

### Arquivo: `/home/ubuntu/omnivoice/src/app/page.tsx`
### Problema: O auto-split dividia o texto em múltiplos segmentos desnecessariamente
### Solução: Desativar com `if (true) return` no início da função de auto-split

---

## Arquivos Modificados (Lista Completa)

| # | Arquivo | Correções |
|---|---------|-----------|
| 1 | `src/app/page.tsx` | #3 (download dialog), #4 (idioma), #7 (auto-split) |
| 2 | `src/app/api/generate/route.ts` | #5 (ref_text), #6 (guidance_scale) |
| 3 | `src/components/payment-dialog.tsx` | #3 (free download credit) |
| 4 | `.env` | #2 (SMTP) |
| 5 | `/var/www/omnivoice/tunnel-generate.php` | #1 (CURLOPT_ENCODING identity) |

---

## Arquivos do Servidor GPU (Sem Alterações Nestes)

Estes arquivos rodam no servidor Windows com GPU e não foram modificados nesta sessão:
- `omnivoice_api.py` - API de geração de áudio (torchaudio resample 24k->44.1k, np.clip, guidance_scale=2.0)
- `start_tunnel.py` - cloudflared + registro do túnel SSH
- `iniciar.bat` - Script de inicialização do Windows
- `fix_api.py` - Correção urllib (já aplicada anteriormente)

---

## Versão do Sistema no Momento do Backup
- Node.js: v20.20.2
- npm: 10.8.2
- Data: 12/06/2025
- Status: 100% funcional (geração de áudio OK, downloads OK, email OK, sem estalos)