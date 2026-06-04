/**
 * analyze-all-voices.js
 * Batch analysis - le arquivos LOCALMENTE do /var/www/omnivoice/audios/ref/
 * Converte MP3/OGG com ffmpeg quando necessario.
 * SO atualiza vozes GRAVES (speed >= 1.2). Vozes medias/agudas nao mexe.
 * Uso: cd /home/ubuntu/omnivoice && sudo node scripts/analyze-all-voices.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const db = new PrismaClient({ log: ['error'] });
const AUDIO_DIR = '/var/www/omnivoice/audios/ref';

function analyzeWavBuffer(buffer) {
  try {
    if (buffer.length < 44) return null;
    if (buffer.toString('ascii', 0, 4) !== 'RIFF') return null;
    const channels = buffer.readUInt16LE(22);
    const sampleRate = buffer.readUInt32LE(24);
    const bitsPerSample = buffer.readUInt16LE(34);
    if (bitsPerSample !== 16) return null;

    const pcmData = buffer.slice(44);
    const floatSamples = [];
    if (channels === 2) {
      for (let i = 0; i < pcmData.length - 3; i += 2) {
        floatSamples.push(((pcmData.readInt16LE(i) + pcmData.readInt16LE(i + 2)) / 2) / 32767);
      }
    } else {
      for (let i = 0; i < pcmData.length - 1; i += 2) {
        floatSamples.push(pcmData.readInt16LE(i) / 32767);
      }
    }
    if (floatSamples.length < 1024) return null;

    const f0 = estimateF0(floatSamples, sampleRate);
    if (f0 <= 0) return null;

    const bassRatio = getBassRatio(floatSamples, sampleRate);
    return {
      f0,
      classification: classifyVoice(f0, bassRatio),
      speed: calculateSpeed(f0, bassRatio),
      bassRatio,
    };
  } catch { return null; }
}

function getBassRatio(samples, sampleRate) {
  const segLen = Math.min(samples.length, Math.floor(2 * sampleRate));
  const seg = samples.slice(0, segLen);
  const win = applyHanning(seg);
  const fft = simpleFFT(win);
  let grave = 0, total = 0;
  for (let i = 0; i < fft.length; i++) {
    const freq = (i * sampleRate) / fft.length;
    const e = fft[i] * fft[i];
    if (freq < 255) grave += e;
    total += e;
  }
  return total > 0 ? grave / total : 0.3;
}

function estimateF0(samples, sampleRate) {
  const segSamples = Math.floor(0.4 * sampleRate);
  const freqs = [];
  const maxAnalyze = Math.min(samples.length, Math.floor(3.5 * sampleRate));
  for (let i = 0; i < maxAnalyze - segSamples; i += segSamples) {
    const seg = samples.slice(i, i + segSamples);
    const win = applyHanning(seg);
    const freq = detectPitch(win, sampleRate);
    if (freq > 60 && freq < 600) freqs.push(freq);
  }
  if (freqs.length === 0) return 0;
  freqs.sort((a, b) => a - b);
  const mid = Math.floor(freqs.length / 2);
  return freqs.length % 2 === 0 ? (freqs[mid - 1] + freqs[mid]) / 2 : freqs[mid];
}

function detectPitch(samples, sampleRate) {
  const len = samples.length;
  let rms = 0;
  for (let i = 0; i < len; i++) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / len);
  if (rms < 0.01) return 0;
  const norm = samples.map(s => s / rms);
  const minLag = Math.floor(sampleRate / 600);
  const maxLag = Math.min(Math.floor(sampleRate / 60), Math.floor(len / 2));
  let bestLag = minLag, bestCorr = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < len - lag; i++) corr += norm[i] * norm[i + lag];
    corr /= (len - lag);
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
  }
  return sampleRate / bestLag;
}

function classifyVoice(f0, bassRatio) {
  const bw = bassRatio > 0.4 ? 1 : 0;
  if (f0 < 130 || (f0 < 170 && bw)) return 'muito-grave';
  if (f0 < 180 || (f0 < 220 && bw)) return 'grave';
  if (f0 < 280) return 'media';
  if (f0 < 380) return 'aguda';
  return 'muito-aguda';
}

function calculateSpeed(f0, bassRatio) {
  let score = 0;
  if (f0 < 130) score += 0;
  else if (f0 < 180) score += 20;
  else if (f0 < 220) score += 40;
  else if (f0 < 300) score += 65;
  else if (f0 < 400) score += 85;
  else score += 100;
  if (bassRatio > 0.5) score -= 15;
  else if (bassRatio > 0.35) score -= 8;
  score = Math.max(0, Math.min(100, score));
  if (score <= 15) return 1.3;
  if (score <= 30) return 1.2;
  if (score <= 55) return 1.1;
  if (score <= 80) return 1.0;
  return 0.95;
}

function applyHanning(samples) {
  const len = samples.length;
  return samples.map((s, i) => s * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1))));
}

function simpleFFT(samples) {
  const n = nextPow2(samples.length);
  const real = new Float64Array(n);
  for (let i = 0; i < samples.length; i++) real[i] = samples[i];
  const imag = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (j > i) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size >> 1;
    const angle = -2 * Math.PI / size;
    const wR = Math.cos(angle), wI = Math.sin(angle);
    for (let i = 0; i < n; i += size) {
      let cR = 1, cI = 0;
      for (let k = 0; k < half; k++) {
        const tR = cR * real[i + k + half] - cI * imag[i + k + half];
        const tI = cR * imag[i + k + half] + cI * real[i + k + half];
        real[i + k + half] = real[i + k] - tR;
        imag[i + k + half] = imag[i + k] - tI;
        real[i + k] += tR;
        imag[i + k] += tI;
        const nR = cR * wR - cI * wI;
        cI = cR * wI + cI * wR;
        cR = nR;
      }
    }
  }
  const mags = [];
  for (let i = 0; i <= n / 2; i++) mags.push(real[i]);
  return mags;
}

function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

// Converte MP3/OGG/M4A/qualquer formato para WAV 16-bit mono usando ffmpeg
function convertToWav(filePath) {
  const tmpFile = path.join(os.tmpdir(), 'voice_analysis_' + Date.now() + '.wav');
  try {
    execSync('ffmpeg -y -i "' + filePath + '" -ar 16000 -ac 1 -sample_fmt s16 "' + tmpFile + '" 2>/dev/null', {
      timeout: 30000,
    });
    if (!fs.existsSync(tmpFile) || fs.statSync(tmpFile).size < 1024) return null;
    return fs.readFileSync(tmpFile);
  } catch (e) {
    return null;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('=== ANALISE VOCAL BATCH (filesystem local) ===');
  console.log('Audio dir:', AUDIO_DIR);
  console.log('Data:', new Date().toISOString());
  console.log('');

  const variations = await db.voiceVariation.findMany({
    where: { refAudioServerUrl: { not: '' } },
    include: { voice: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log('Total de variacoes: ' + variations.length);
  console.log('');

  let updated = 0, failed = 0, skipped = 0;
  const results = [];

  for (const v of variations) {
    const voiceName = v.voice.name;
    const label = v.label || '(sem label)';

    try {
      const urlPath = v.refAudioServerUrl;
      const filename = path.basename(urlPath);
      const filePath = path.join(AUDIO_DIR, filename);

      if (!fs.existsSync(filePath)) {
        console.log('  [SKIP] ' + voiceName + ' - ' + label + ': arquivo nao encontrado (' + filename + ')');
        skipped++;
        continue;
      }

      // Se WAV puro, usa direto; se MP3/OGG/outro, converte com ffmpeg
      const ext = path.extname(filename).toLowerCase();
      let wavBuffer;

      if (ext === '.wav') {
        wavBuffer = fs.readFileSync(filePath);
      } else {
        wavBuffer = convertToWav(filePath);
        if (!wavBuffer) {
          console.log('  [SKIP] ' + voiceName + ' - ' + label + ': falha ao converter ' + ext + ' com ffmpeg');
          skipped++;
          continue;
        }
      }

      if (wavBuffer.length < 1024) {
        console.log('  [SKIP] ' + voiceName + ' - ' + label + ': arquivo muito pequeno');
        skipped++;
        continue;
      }

      const analysis = analyzeWavBuffer(wavBuffer);

      if (!analysis) {
        console.log('  [SKIP] ' + voiceName + ' - ' + label + ': falha na analise do audio');
        skipped++;
        continue;
      }

      // SO atualiza vozes GRAVES (speed >= 1.2). Demais mantem o que ja tem no banco.
      if (analysis.speed >= 1.2) {
        await db.voiceVariation.update({
          where: { id: v.id },
          data: { defaultSpeed: analysis.speed },
        });
        console.log('  [OK]   ' + voiceName + ' - ' + label + ': F0=' + Math.round(analysis.f0) + 'Hz | Speed ' + analysis.speed + 'x (' + analysis.classification + ') -> ATUALIZADO');
        updated++;
      } else {
        console.log('  [IGN]  ' + voiceName + ' - ' + label + ': F0=' + Math.round(analysis.f0) + 'Hz | Speed ' + analysis.speed + 'x (' + analysis.classification + ') -> mantido como esta');
        skipped++;
        continue;
      }

      results.push({ voice: voiceName, label, f0: Math.round(analysis.f0), speed: analysis.speed, cls: analysis.classification });
    } catch (err) {
      console.log('  [ERR]  ' + voiceName + ' - ' + label + ': ' + (err.message || err));
      failed++;
    }
  }

  console.log('');
  console.log('=== RESUMO ===');
  console.log('Atualizadas: ' + updated);
  console.log('Puladas (arquivo nao encontrado/formato/nao-grave): ' + skipped);
  console.log('Erros: ' + failed);
  console.log('');

  const bySpeed = {};
  const byClass = {};
  for (const r of results) {
    bySpeed[r.speed] = (bySpeed[r.speed] || 0) + 1;
    byClass[r.cls] = (byClass[r.cls] || 0) + 1;
  }

  console.log('=== DISTRIBUICAO POR SPEED ===');
  Object.entries(bySpeed).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([s, c]) => {
    console.log('  Speed ' + s + 'x: ' + c + ' vozes');
  });

  console.log('');
  console.log('=== DISTRIBUICAO POR CLASSIFICACAO ===');
  Object.entries(byClass).forEach(([c, n]) => console.log('  ' + c + ': ' + n + ' vozes'));

  console.log('');
  const adjusted = results.filter(r => r.speed !== 1.0);
  console.log('=== VOZES COM SPEED AJUSTADO (' + adjusted.length + ') ===');
  if (adjusted.length === 0) {
    console.log('  Nenhuma precisou de ajuste');
  } else {
    for (const r of adjusted) {
      console.log('  ' + r.voice + ' (' + r.label + '): F0=' + r.f0 + 'Hz -> Speed ' + r.speed + 'x');
    }
  }

  await db.$disconnect();
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  await db.$disconnect();
  process.exit(1);
});
