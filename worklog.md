---
Task ID: 1
Agent: Main Agent
Task: Investigar e corrigir bugs persistentes do OmniVoice (corte de audio, pontuacao, pronuncia)

Work Log:
- Investigacao completa do codigo: PHP server, Next.js API routes, frontend
- Encontrado que generate-omnivoice.php (producao) NAO truncava audio de referencia
- Outros arquivos truncavam: generate.php (10s), Next.js routes (12s)
- Sem trim, audio de ref longo causa CUDA OOM na RTX 3060 12GB -> audio cortado
- Adicionado trimAudioToMaxSeconds() usando trim_audio.py existente (max 12s)
- Adicionado normalizePronunciation() com dicionario fonetico PT-BR (150+ palavras)
- Adicionado splitTextIntoChunks() para textos longos (max 500 chars)
- Pipeline de normalizacao: stripSSML -> cleanText -> normalizePronunciation
- Commit ff8e864 pushed para GitHub
- Arquivo atualizado no Hostgator via cPanel (925 linhas)

Stage Summary:
- CORRECAO CRITICA: Audio de referencia agora e truncado para 12s antes de enviar ao TTS
- 150+ palavras PT-BR adicionadas ao dicionario fonetico (acessar, processar, etc.)
- Textos longos agora sao divididos em chunks para evitar corte de audio
- Arquivos atualizados: GitHub (ff8e864) + Hostgator cPanel
