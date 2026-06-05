/**
 * VozPro TTS - Modulo de conexao direta com Gradio via cloudflared tunnel
 * 
 * Fluxo:
 * 1. Descobre a URL do tunnel via HostGator (get_tunnel.php)
 * 2. Faz upload do audio de referencia direto pro Gradio
 * 3. Submete o job de geracao
 * 4. Recebe o audio gerado via streaming
 * 
 * NAO passa mais pelo generate.php do HostGator - audio vai LIMPO direto pro GPU
 */

const HOSTGATOR_BASE = 'https://sorteiomax.com.br/omnivoice';
const TIMEOUT_UPLOAD = 30000;   // 30s para upload
const TIMEOUT_GENERATE = 120000; // 120s para geracao na GPU
const MAX_REF_SECONDS = 10;     // maximo de segundos do audio de ref

/**
 * Descobre a URL atual do tunnel cloudflared
 * @returns {Promise<string>} URL do tunnel
 */
export async function getTunnelUrl() {
    const response = await fetch(`${HOSTGATOR_BASE}/get_tunnel.php`);
    
    if (!response.ok) {
        throw new Error(`Erro ao buscar URL do tunnel: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.status !== 'online') {
        throw new Error(data.message || 'GPU offline. Inicie o iniciar.bat na maquina local.');
    }
    
    return data.tunnelUrl;
}

/**
 * Corta os primeiros N segundos de um audio usando Web Audio API
 * Evita passar pelo FFmpeg do HostGator - audio fica limpo
 * @param {File|Blob} audioFile - Audio original
 * @param {number} maxSeconds - Maximo de segundos para cortar
 * @returns {Promise<File>} Audio cortado como WAV
 */
export async function trimAudio(audioFile, maxSeconds = MAX_REF_SECONDS) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Le o arquivo como ArrayBuffer
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // Decodifica o audio
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Calcula duracao do corte
    const duration = Math.min(audioBuffer.duration, maxSeconds);
    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const numSamples = Math.floor(duration * sampleRate);
    
    // Cria buffer de saida
    const offCtx = new OfflineAudioContext(numChannels, numSamples, sampleRate);
    const source = offCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offCtx.destination);
    source.start(0, 0, duration);
    
    // Renderiza
    const trimmedBuffer = await offCtx.startRendering();
    
    // Converte para WAV
    const wavBlob = audioBufferToWav(trimmedBuffer);
    
    // Retorna como File
    return new File([wavBlob], 'reference.wav', { type: 'audio/wav' });
}

/**
 * Converte AudioBuffer para WAV Blob
 * @param {AudioBuffer} buffer 
 * @returns {Blob}
 */
function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitsPerSample = 16;
    
    // Interleave canais
    let interleaved;
    if (numChannels === 1) {
        interleaved = buffer.getChannelData(0);
    } else {
        const length = buffer.length * numChannels;
        interleaved = new Float32Array(length);
        for (let ch = 0; ch < numChannels; ch++) {
            const channelData = buffer.getChannelData(ch);
            for (let i = 0; i < buffer.length; i++) {
                interleaved[i * numChannels + ch] = channelData[i];
            }
        }
    }
    
    // Cria WAV buffer
    const dataLength = interleaved.length * (bitsPerSample / 8);
    const headerLength = 44;
    const totalLength = headerLength + dataLength;
    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Converte float32 para int16 e escreve
    let offset = 44;
    for (let i = 0; i < interleaved.length; i++) {
        const sample = Math.max(-1, Math.min(1, interleaved[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Faz upload de um arquivo para o Gradio
 * @param {string} tunnelUrl - URL do tunnel
 * @param {File} file - Arquivo para upload
 * @returns {Promise<string>} Path do arquivo no servidor Gradio
 */
async function uploadToGradio(tunnelUrl, file) {
    const formData = new FormData();
    formData.append('files', file);
    
    const response = await fetch(`${tunnelUrl}/upload`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(TIMEOUT_UPLOAD)
    });
    
    if (!response.ok) {
        throw new Error(`Upload falhou: ${response.status} ${response.statusText}`);
    }
    
    const paths = await response.json();
    
    if (!Array.isArray(paths) || paths.length === 0) {
        throw new Error('Upload retornou caminho vazio');
    }
    
    return paths[0]; // retorna o path do arquivo no Gradio
}

/**
 * Geracao de voz via VozPro - CONEXAO DIRETA
 * 
 * @param {Object} params
 * @param {File} params.referenceAudio - Audio de referencia (voz a clonar)
 * @param {string} params.text - Texto para gerar a fala
 * @param {string} [params.refText=''] - Transcricao do audio de ref (deixe vazio se nao souber)
 * @param {string} [params.language='Auto'] - Idioma
 * @param {string|null} [params.instruct=null] - Instrucao de estilo
 * @param {number} [params.speed=1] - Velocidade (0.5 a 2)
 * @param {number} [params.duration=0] - Duracao maxima (0 = automatico)
 * @param {boolean} [params.autoTrim=true] - Cortar audio para 10s automaticamente
 * @param {Function} [params.onProgress] - Callback de progresso
 * @returns {Promise<{audioUrl: string, audioBlob: Blob}>} Audio gerado
 */
export async function generateVoice({
    referenceAudio,
    text,
    refText = '',
    language = 'Auto',
    instruct = null,
    speed = 1,
    duration = 0,
    autoTrim = true,
    onProgress = null
}) {
    if (onProgress) onProgress('Descobrindo tunnel...');
    
    // 1. Descobre a URL do tunnel
    const tunnelUrl = await getTunnelUrl();
    
    if (onProgress) onProgress('Preparando audio de referencia...');
    
    // 2. Trim do audio no frontend (se ativo)
    let audioToUpload = referenceAudio;
    if (autoTrim) {
        try {
            audioToUpload = await trimAudio(referenceAudio, MAX_REF_SECONDS);
        } catch (e) {
            console.warn('Trim falhou, usando audio original:', e);
            audioToUpload = referenceAudio;
        }
    }
    
    if (onProgress) onProgress('Enviando audio para GPU...');
    
    // 3. Upload do audio direto pro Gradio
    const filePath = await uploadToGradio(tunnelUrl, audioToUpload);
    
    if (onProgress) onProgress('Gerando voz na GPU...');
    
    // 4. Monta o payload do Gradio API v4
    const payload = {
        data: [
            {
                path: filePath,
                meta: { _type: 'gradio.FileData' }
            },
            refText || '',
            text,
            language,
            instruct,
            parseInt(speed),
            parseInt(duration)
        ]
    };
    
    // 5. Submete o job (streaming)
    const submitResponse = await fetch(`${tunnelUrl}/call/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_GENERATE)
    });
    
    if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        throw new Error(`Erro ao submeter geracao: ${submitResponse.status} - ${errorText}`);
    }
    
    const submitData = await submitResponse.json();
    const eventId = submitData.event_id;
    
    if (!eventId) {
        throw new Error('Nenhum event_id retornado pelo Gradio');
    }
    
    // 6. Escuta o streaming do resultado via SSE
    const result = await streamResult(tunnelUrl, eventId, onProgress);
    
    return result;
}

/**
 * Faz streaming do resultado do Gradio via Server-Sent Events
 * @param {string} tunnelUrl 
 * @param {string} eventId 
 * @param {Function} onProgress 
 * @returns {Promise<{audioUrl: string, audioBlob: Blob}>}
 */
async function streamResult(tunnelUrl, eventId, onProgress) {
    return new Promise((resolve, reject) => {
        const eventSource = new EventSource(`${tunnelUrl}/call/predict/${eventId}`);
        let completed = false;
        
        eventSource.onmessage = (event) => {
            if (completed) return;
            
            try {
                const data = JSON.parse(event.data);
                
                switch (data.msg) {
                    case 'heartbeat':
                        // Keep alive - ignorar
                        break;
                        
                    case 'generating':
                        if (onProgress) onProgress('Gerando voz...');
                        break;
                        
                    case 'progress':
                        if (onProgress) {
                            const pct = Math.round((data.data?.[0] || 0) * 100);
                            onProgress(`Processando... ${pct}%`);
                        }
                        break;
                        
                    case 'complete':
                        completed = true;
                        eventSource.close();
                        
                        // O resultado vem em data.data - geralmente um array com o audio
                        const output = data.data;
                        
                        if (!output || !Array.isArray(output) || output.length === 0) {
                            reject(new Error('Resultado vazio do Gradio'));
                            return;
                        }
                        
                        // O Gradio retorna o audio como objeto com url
                        const audioData = output[0];
                        
                        if (!audioData || (!audioData.url && !audioData.path)) {
                            reject(new Error('Audio nao encontrado no resultado'));
                            return;
                        }
                        
                        // Monta a URL completa do audio
                        const audioUrl = audioData.url 
                            ? audioData.url 
                            : `${tunnelUrl}/file=${audioData.path}`;
                        
                        if (onProgress) onProgress('Baixando audio...');
                        
                        // Baixa o audio como Blob
                        fetch(audioUrl)
                            .then(r => r.blob())
                            .then(blob => {
                                resolve({
                                    audioUrl,
                                    audioBlob: blob
                                });
                            })
                            .catch(err => {
                                // Se falhar o download, retorna a URL pelo menos
                                resolve({ audioUrl, audioBlob: null });
                            });
                        break;
                        
                    case 'error':
                        completed = true;
                        eventSource.close();
                        reject(new Error(data.data || 'Erro na geracao'));
                        break;
                }
            } catch (e) {
                console.error('Erro ao processar evento SSE:', e);
            }
        };
        
        eventSource.onerror = (err) => {
            if (!completed) {
                completed = true;
                eventSource.close();
                reject(new Error('Conexao com tunnel perdida'));
            }
        };
        
        // Timeout de seguranca
        setTimeout(() => {
            if (!completed) {
                completed = true;
                eventSource.close();
                reject(new Error('Timeout na geracao - GPU demorou demais'));
            }
        }, TIMEOUT_GENERATE);
    });
}

/**
 * Verifica se a GPU esta online
 * @returns {Promise<{online: boolean, tunnelUrl: string, message: string}>}
 */
export async function checkStatus() {
    try {
        const tunnelUrl = await getTunnelUrl();
        return {
            online: true,
            tunnelUrl,
            message: 'GPU online e pronta'
        };
    } catch (e) {
        return {
            online: false,
            tunnelUrl: '',
            message: e.message
        };
    }
}
