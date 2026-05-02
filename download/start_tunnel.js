// start_tunnel.js - Abre localtunnel e atualiza o config.php no servidor automaticamente
// Uso: node start_tunnel.js

const localtunnel = require('localtunnel');
const https = require('https');
const http = require('http');

const PORT = 7860;
const SERVER_BASE = 'https://sorteiomax.com.br/omnivoice';
const AUTH_KEY = 'vozpro_tunnel_2024';

async function updateServerConfig(tunnelUrl) {
    const url = `${SERVER_BASE}/update_tunnel.php?auth=${AUTH_KEY}&url=${encodeURIComponent(tunnelUrl)}`;

    return new Promise((resolve) => {
        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    console.log(`[OK] Servidor atualizado: ${result.oldUrl} -> ${result.newUrl}`);
                } catch(e) {
                    console.log(`[WARN] Resposta inesperada: ${data}`);
                }
                resolve();
            });
        });
        req.on('error', (err) => {
            console.log(`[ERRO] Nao foi possivel atualizar o servidor: ${err.message}`);
            console.log(`[INFO] Atualize manualmente em config.php: ${tunnelUrl}`);
            resolve();
        });
        req.setTimeout(15000, () => {
            req.destroy();
            console.log('[WARN] Timeout ao atualizar servidor');
            resolve();
        });
    });
}

async function main() {
    console.log('========================================');
    console.log('  OmniVoice - Localtunnel Automatico');
    console.log('========================================');
    console.log('');

    // Verificar se a porta esta aberta (omnivoice-demo rodando)
    console.log(`[1/2] Verificando OmniVoice na porta ${PORT}...`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
        await new Promise((resolve, reject) => {
            const req = http.get(`http://localhost:${PORT}/`, (res) => {
                console.log(`[OK] OmniVoice respondendo na porta ${PORT}`);
                resolve();
            });
            req.on('error', () => {
                console.log(`[ERRO] OmniVoice NAO esta rodando na porta ${PORT}!`);
                console.log('[INFO] Execute omnivoice-demo primeiro.');
                process.exit(1);
            });
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('timeout'));
            });
        });
    } catch(e) {
        console.log(`[ERRO] OmniVoice NAO esta rodando na porta ${PORT}!`);
        process.exit(1);
    }

    // Abrir localtunnel
    console.log('[2/2] Abrindo localtunnel...');
    try {
        const tunnel = await localtunnel({ port: PORT });
        console.log('');
        console.log(`========================================`);
        console.log(`  URL PUBLICA: ${tunnel.url}`);
        console.log(`========================================`);
        console.log('');

        // Atualizar config.php no servidor
        await updateServerConfig(tunnel.url);

        console.log('');
        console.log('Tunel ativo! Pressione Ctrl+C para parar.');
        console.log('');

        tunnel.on('close', () => {
            console.log('[INFO] Tunel fechado.');
            process.exit(0);
        });

        tunnel.on('error', (err) => {
            console.log(`[ERRO] Tunel: ${err.message}`);
            process.exit(1);
        });

        // Se a URL mudar (reconnect)
        tunnel.on('url', () => {
            console.log(`[INFO] URL alterada: ${tunnel.url}`);
            updateServerConfig(tunnel.url);
        });
    } catch(err) {
        console.log(`[ERRO] Falha ao abrir localtunnel: ${err.message}`);
        console.log('[INFO] Verifique se Node.js esta instalado (node --version)');
        process.exit(1);
    }
}

main();
