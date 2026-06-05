# VozPro - Servidor de Armazenamento de Áudios

## Instalação

1. Crie uma pasta `omnivoice` na raiz do seu site
2. Copie todos os arquivos desta pasta para lá
3. Dê permissão 755 na pasta `audios/` e subpastas

## Estrutura de Pastas

```
omnivoice/
├── .htaccess           # Seguranca (nao mexer)
├── config.php          # Configuracoes (EDITAR API_KEY e BASE_URL!)
├── upload.php          # Script de upload (nao mexer)
├── delete.php          # Script de exclusao (nao mexer)
├── README.txt          # Este arquivo
└── audios/              # Pasta de armazenamento (permissao 755)
    ├── ref/            # Audios de referencia de vozes
    ├── track/          # Trilhas de fundo musicais
    └── generated/      # Reservado para futuros audios gerados
```

## Configuracao

Edite o `config.php` e altere:
- `API_KEY` - Chave de seguranca (use uma chave forte!)
- `BASE_URL` - URL completa do seu servidor

## Variaveis de Ambiente (Vercel)

Adicione estas variaveis no projeto Vercel:
- `AUDIO_SERVER_URL` = https://sorteiomax.com.br/omnivoice
- `AUDIO_SERVER_API_KEY` = (a mesma chave definida no config.php)
