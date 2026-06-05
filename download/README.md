# Download - Arquivos prontos para baixar

## Como baixar

Todos os arquivos nesta pasta ficam **disponiveis para download via chat**.
Para disponibilizar um arquivo, basta copiar para esta pasta:

```bash
cp /caminho/do/arquivo.ext /home/z/my-project/download/
```

O chat automaticamente detecta os arquivos aqui e disponibiliza para download.

## Arquivos PHP atualizados (23/05/2026)

| Arquivo | Descricao | Commit |
|---------|-----------|--------|
| `generate.php` | TTS via F5-TTS (SSE + download com retry) | 1966f10 |
| `generate-direct.php` | TTS direto (SSE + download com retry) | 1966f10 |
| `generate-omnivoice.php` | TTS OmniVoice clone/design/auto | 1966f10 |

### Melhorias incluidas nos 3 PHPs:

1. **downloadWithRetry** - Ate 3 tentativas de download
2. **Validacao de tamanho** - Arquivo < 50KB = Gradio ainda escrevendo, retentar
3. **Validacao WAV** - Header RIFF vs bytes reais (detecta truncamento pelo tunnel)
4. **CURLOPT_CONNECTTIMEOUT** - 30s (nao trava sem resposta)
5. **clearstatcache()** - PHP nao cacheia filesize()
6. **sleep(2)** apos SSE complete - Gradio termina de salvar o WAV antes de baixar

### Como atualizar no HostGator:

1. Baixe os 3 arquivos aqui
2. Acesse cPanel > File Manager > public_html/omnivoice/
3. Substitua os 3 arquivos
4. Teste com texto longo

## Outros arquivos

| Arquivo | Descricao |
|---------|-----------|
| `generate_local.php` | Versao antiga para PHP local (XAMPP) |
| `INSTRUCOES-INSTALACAO.txt` | Guia de instalacao PHP local |
