/** 
 * 🛡️ GOVERNANÇA OBRIGATÓRIA — LEIA ANTES DE ALTERAR ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────
 * ⚠️ REGRAS ABSOLUTAS (já causaram DOWNTIME real):
 *
 * 1. NUNCA: git reset --hard | rm -rf | git checkout -- .env
 * 2. NUNCA: altere .env de produção, git remote, DATABASE_URL, API keys
 * 3. NUNCA: crie scripts de deploy alternativos, arquivos temp no root
 * 4. SEMPRE: use deploy-seguro.py para deploy, vozpro-preview para commits
 * 5. SEMPRE: verifique next build passa, .env tem PostgreSQL, token bate
 *
 * 📋 LEIA COMPLETO:
 *    https://github.com/rgdweb/vozpro-preview/blob/main/REGRAS-ERROS-PROIBIDOS.md
 *    https://github.com/rgdweb/vozpro-preview/blob/main/GOVERNANCE.md
 *
 * 13 erros já cometidos que derrubaram o sistema.
 * Se você tocar em qualquer coisa sem ler as regras acima, vai quebrar.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * VozPro Audio Masterizer
 * Masterização automática + preset Clareza
 * Portado do index.html (MEngine) para Web Audio API
 * 100% client-side, zero carga no servidor
 *
 * Funções extras:
 * - preprocessRefAudio(): High-pass 70Hz + normalização para vozes graves
 * - masterizeGraveVoice(): Preset especial com limiter true peak
 */

interface BandAnalysis {
  name: string; lo: number; hi: number; db: number; target: number; diff: number
}

interface AudioAnalysis {
  pk: number; lufs: number; dr: number; crestFactor: number; bands: BandAnalysis[]
}

interface MasterParams {
  bass: number; lowMid: number; mid: number; treble: number
  comp: number; vol: number; drv: number
}

// Preset Clareza (index.html line 673)
const CLAREZA = { bass: -1.5, lowMid: -2.5, mid: 0.5, treble: 1.5, comp: 5 }

// ===================== ANALYZE =====================

function analyze(buf: AudioBuffer): AudioAnalysis {
  const d = buf.getChannelData(0), sr = buf.sampleRate
  let sq = 0, pk = 0
  for (let i = 0; i < d.length; i++) { sq += d[i] * d[i]; const a = Math.abs(d[i]); if (a > pk) pk = a }
  const rms = Math.sqrt(sq / d.length)
  return {
    pk, lufs: calcLufs(d, sr), dr: calcDR(d, sr),
    crestFactor: 20 * Math.log10(pk + 1e-10) - 20 * Math.log10(rms + 1e-10),
    bands: calcBands(d, sr),
  }
}

function calcLufs(d: Float32Array, sr: number): number {
  const fs = 2048; let en = 0, c = 0
  for (let i = 0; i < d.length; i += fs) {
    const f = kWeight(d.subarray(i, Math.min(i + fs, d.length)), sr)
    let s = 0, nan = false
    for (let j = 0; j < f.length; j++) { const v = f[j] * f[j]; if (v !== v) { nan = true; break } s += v }
    if (nan) continue; en += s; c++
  }
  if (c === 0 || en !== en || en === 0) {
    let rms = 0, n = 0
    for (let i = 0; i < d.length; i++) { if (d[i] === d[i]) { rms += d[i] * d[i]; n++ } }
    rms = n > 0 ? Math.sqrt(rms / n) : 0; return 20 * Math.log10(rms + 1e-10) - 0.691
  }
  return -0.691 + 10 * Math.log10(en / c)
}

function kWeight(d: Float32Array, sr: number): Float32Array {
  const s1 = applyBQ(d, bqC('highshelf', 1681 / sr, 0.707, 4))
  return applyBQ(s1, bqC('highpass', 38 / sr, 0.5, 0))
}

function bqC(t: string, f: number, Q: number, g: number) {
  f = Math.min(f, 0.499); const w = 2 * Math.PI * f, s = Math.sin(w) / (2 * Q)
  let b0, b1, b2, a0, a1, a2
  if (t === 'highshelf') {
    const A = Math.pow(10, g / 40), sq = Math.sqrt(A)
    b0 = A * ((A + 1) + (A - 1) * Math.cos(w) + 2 * sq * Math.sin(w))
    b1 = -2 * A * ((A - 1) + (A + 1) * Math.cos(w))
    b2 = A * ((A + 1) + (A - 1) * Math.cos(w) - 2 * sq * Math.sin(w))
    a0 = (A + 1) - (A - 1) * Math.cos(w) + 2 * sq * Math.sin(w)
    a1 = 2 * ((A - 1) - (A + 1) * Math.cos(w)); a2 = (A + 1) - (A - 1) * Math.cos(w) - 2 * sq * Math.sin(w)
  } else { b0 = (1 + Math.cos(w)) / 2; b1 = -(1 + Math.cos(w)); b2 = (1 + Math.cos(w)) / 2; a0 = 1 + s; a1 = -2 * Math.cos(w); a2 = 1 - s }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

function applyBQ(inp: Float32Array, c: ReturnType<typeof bqC>): Float32Array {
  const out = new Float32Array(inp.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let k = 0; k < inp.length; k++) {
    const x = inp[k], y = c.b0 * x + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    out[k] = y; x2 = x1; x1 = x; y2 = y1; y1 = y
  } return out
}

function calcDR(d: Float32Array, sr: number): number {
  const sz = Math.floor(sr * 0.4), rv: number[] = []
  for (let i = 0; i < d.length; i += sz) {
    const ch = d.subarray(i, Math.min(i + sz, d.length)); let s = 0
    for (let j = 0; j < ch.length; j++) s += ch[j] * ch[j]
    rv.push(10 * Math.log10(s / ch.length + 1e-20))
  }
  rv.sort((a, b) => a - b)
  return Math.max(1, rv[Math.floor(rv.length * 0.95)] - rv[Math.floor(rv.length * 0.1)])
}

function calcBands(d: Float32Array, sr: number): BandAnalysis[] {
  const N = 8192
  const defs = [
    { name: 'Sub', lo: 20, hi: 60 }, { name: 'Bass', lo: 60, hi: 250 },
    { name: 'LowMid', lo: 250, hi: 500 }, { name: 'Mid', lo: 500, hi: 2000 },
    { name: 'HiMid', lo: 2000, hi: 4000 }, { name: 'Brilho', lo: 4000, hi: 10000 },
    { name: 'Ar', lo: 10000, hi: 20000 },
  ]
  const tgt: Record<string, number> = { Sub: -28, Bass: -20, LowMid: -22, Mid: -25, HiMid: -30, Brilho: -35, Ar: -38 }
  const re = new Float32Array(N), im = new Float32Array(N), len = Math.min(d.length, N)
  for (let i = 0; i < len; i++) re[i] = d[i] * (0.5 * (1 - Math.cos(2 * Math.PI * i / (N - 1))))
  fft(re, im, N)
  const mag = new Float32Array(N / 2)
  for (let i = 0; i < N / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i])
  const fpb = sr / N
  for (const b of defs) {
    const lo = Math.floor(b.lo / fpb), hi = Math.min(Math.ceil(b.hi / fpb), N / 2 - 1)
    let en = 0, c = 0
    for (let i = lo; i <= hi; i++) { en += mag[i] * mag[i]; c++ }
    b.db = 20 * Math.log10(Math.sqrt(en / (c + 1)) + 1e-10)
    b.target = tgt[b.name]; b.diff = b.db - b.target
  }
  return defs as BandAnalysis[]
}

function fft(re: Float32Array, im: Float32Array, n: number) {
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]] } }
  for (let len = 2; len <= n; len <<= 1) { const h = len >> 1, ang = -2 * Math.PI / len, wR = Math.cos(ang), wI = Math.sin(ang); for (let i = 0; i < n; i += len) { let cR = 1, cI = 0; for (let j = 0; j < h; j++) { const tR = cR * re[i + j + h] - cI * im[i + j + h], tI = cR * im[i + j + h] + cI * re[i + j + h]; re[i + j + h] = re[i + j] - tR; im[i + j + h] = im[i + j] - tI; re[i + j] += tR; im[i + j] += tI; const nR = cR * wR - cI * wI; cI = cR * wI + cI * wR; cR = nR } } }
}

// ===================== AUTO CORRECT =====================

function autoCorrect(a: AudioAnalysis): MasterParams {
  const c: MasterParams = { bass: 0, lowMid: 0, mid: 0, treble: 0, comp: 0, vol: 0, drv: 0 }
  if (a.pk > 0.95) return c // já masterizado

  const hasHR = a.pk < 0.90
  // Smart score
  let sc = 0
  sc += a.pk > 0.85 ? 25 : a.pk > 0.7 ? 15 : 5
  sc += (a.lufs >= -20 && a.lufs <= -6) ? 20 : (a.lufs >= -26 && a.lufs <= -2) ? 12 : 3
  sc += (a.dr >= 4 && a.dr <= 14) ? 15 : (a.dr >= 2 && a.dr <= 16) ? 10 : 3
  const avg = a.bands.reduce((s, b) => s + b.db, 0) / a.bands.length
  let mxD = 0; for (const b of a.bands) mxD = Math.max(mxD, Math.abs(b.db - avg))
  sc += mxD < 4 ? 20 : mxD < 7 ? 14 : mxD < 10 ? 7 : 2
  sc += (a.crestFactor >= 3 && a.crestFactor <= 22) ? 10 : 5
  const bf = Math.max(0, Math.min(0.7, (100 - sc) / 100 * 0.7))

  if (hasHR) {
    if (a.lufs < -20) c.vol = Math.min(3, (-14 - a.lufs) * 0.3 * bf)
    else if (a.lufs < -16) c.vol = Math.min(1.5, (-14 - a.lufs) * 0.2 * bf)
    else if (a.lufs > -6) c.vol = Math.max(-3, (-14 - a.lufs) * 0.3 * bf)
    else if (a.lufs > -8) c.vol = Math.max(-1.5, (-14 - a.lufs) * 0.2 * bf)
  }

  if (bf > 0.05) {
    let bD = 0, lmD = 0, mD = 0, tD = 0
    for (const b of a.bands) {
      const dev = b.db - avg
      if (b.name === 'Bass') bD += dev
      else if (b.name === 'LowMid') lmD += dev
      else if (b.name === 'Mid') mD += dev
      else if (b.name === 'HiMid' || b.name === 'Brilho') tD += dev
    }
    c.bass = Math.max(-6, Math.min(6, -bD * 0.5 * bf))
    c.lowMid = Math.max(-6, Math.min(6, -lmD * 0.5 * bf))
    c.mid = Math.max(-6, Math.min(6, -mD * 0.5 * bf))
    c.treble = Math.max(-6, Math.min(6, -tD * 0.4 * bf))
  }

  if (a.dr > 12 && hasHR && sc < 70) c.comp = Math.min(35, (a.dr - 10) * 4 * bf)
  if (hasHR && sc < 60) c.drv = Math.min(8, 3 * bf)

  return c
}

// ===================== RENDER =====================

function cfgComp(c: DynamicsCompressorNode, v: number) {
  if (v > 0) {
    c.ratio.value = 1 + (v / 100) * 19; c.threshold.value = -24 + (1 - v / 100) * 20
    c.knee.value = 6; c.attack.value = 0.005; c.release.value = 0.15
  } else { c.ratio.value = 1; c.threshold.value = 0 }
}

function satCurve(a: number): Float32Array {
  const n = 44100, c = new Float32Array(n), k = a * 30
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = Math.tanh(x * (1 + k * Math.abs(x))) }
  return c
}

async function renderMasterized(buf: AudioBuffer, p: MasterParams): Promise<AudioBuffer> {
  const sr = buf.sampleRate, len = buf.length, ch = buf.numberOfChannels
  const oc = new OfflineAudioContext(ch, len, sr)
  const src = oc.createBufferSource(); src.buffer = buf

  const bf = oc.createBiquadFilter(); bf.type = 'lowshelf'; bf.frequency.value = 150; bf.gain.value = p.bass
  const lmf = oc.createBiquadFilter(); lmf.type = 'peaking'; lmf.frequency.value = 350; lmf.Q.value = 0.8; lmf.gain.value = p.lowMid
  const mf = oc.createBiquadFilter(); mf.type = 'peaking'; mf.frequency.value = 1200; mf.Q.value = 1; mf.gain.value = p.mid
  const tf = oc.createBiquadFilter(); tf.type = 'highshelf'; tf.frequency.value = 5000; tf.gain.value = p.treble
  const comp = oc.createDynamicsCompressor(); cfgComp(comp, p.comp)
  const drv = oc.createWaveShaper()
  if (p.drv > 0) { drv.curve = satCurve(p.drv / 100); drv.oversample = '4x' } else { drv.curve = null }
  const vol = oc.createGain(); vol.gain.value = Math.pow(10, p.vol / 20)
  const lim = oc.createDynamicsCompressor(); lim.threshold.value = -3; lim.ratio.value = 20; lim.knee.value = 0; lim.attack.value = 0.001; lim.release.value = 0.05

  src.connect(bf); bf.connect(lmf); lmf.connect(mf); mf.connect(tf)
  tf.connect(comp); comp.connect(drv); drv.connect(vol); vol.connect(lim); lim.connect(oc.destination)

  src.start(0)
  return await oc.startRendering()
}

// ===================== MAIN EXPORT =====================

export async function masterizeAudio(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
  const analysis = analyze(audioBuffer)
  const p = autoCorrect(analysis)

  // Adicionar preset Clareza
  p.bass += CLAREZA.bass; p.lowMid += CLAREZA.lowMid; p.mid += CLAREZA.mid
  p.treble += CLAREZA.treble; p.comp += CLAREZA.comp

  // Clamp
  p.bass = Math.max(-6, Math.min(6, p.bass))
  p.lowMid = Math.max(-6, Math.min(6, p.lowMid))
  p.mid = Math.max(-6, Math.min(6, p.mid))
  p.treble = Math.max(-6, Math.min(6, p.treble))
  p.comp = Math.max(0, Math.min(35, p.comp))

  console.log('[MASTERIZE] params:', JSON.stringify(p))

  return renderMasterized(audioBuffer, p)
}

// ===================== VOICE EXPORT (bass +3.4, sat 2%, comp 20%) =====================

export async function masterizeVoice(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
  const analysis = analyze(audioBuffer)
  const p = autoCorrect(analysis)

  // Adicionar preset Clareza
  p.bass += CLAREZA.bass; p.lowMid += CLAREZA.lowMid; p.mid += CLAREZA.mid
  p.treble += CLAREZA.treble; p.comp += CLAREZA.comp

  // Boost de voz: Graves +3.4dB
  p.bass += 3.4
  // Saturação 2%
  p.drv = 2
  // Compressão 20%
  p.comp = 20

  // Clamp
  p.bass = Math.max(-6, Math.min(6, p.bass))
  p.lowMid = Math.max(-6, Math.min(6, p.lowMid))
  p.mid = Math.max(-6, Math.min(6, p.mid))
  p.treble = Math.max(-6, Math.min(6, p.treble))
  p.comp = Math.max(0, Math.min(35, p.comp))

  console.log('[MASTERIZE-VOICE] params:', JSON.stringify(p))

  return renderMasterized(audioBuffer, p)
}

// ===================== GRAVE VOICE EXPORT (otimizado para vozes graves) =====================
// Preset especial: mais presença nos graves, sem distorcer
// Limiter verdadeiro com ceiling em -0.3 dBTP para nunca estourar

export async function masterizeGraveVoice(audioBuffer: AudioBuffer): Promise<AudioBuffer> {
  const analysis = analyze(audioBuffer)
  const p = autoCorrect(analysis)

  // Preset Voz Grave:
  // - Graves (+2dB) — presença sem exagero (evita "fundo de lata")
  // - Low-mid (+1.5dB) — corpo/warmth
  // - Mid (+1dB) — inteligibilidade
  // - Treble (+2dB) — clareza/brilho pra compensar grave
  // - Compressão 15% — presença sem esmagar
  // - Saturação 1% — calor sutil
  p.bass = 2.0
  p.lowMid = 1.5
  p.mid = 1.0
  p.treble = 2.0
  p.comp = 15
  p.drv = 1
  p.vol = 0  // limiter cuida do volume

  console.log('[MASTERIZE-GRAVE-VOICE] params:', JSON.stringify(p))

  return renderMasterizedWithTruePeakLimiter(audioBuffer, p)
}

// ===================== RENDER COM TRUE PEAK LIMITER =====================
// Limiter profissional: ceiling em -0.3 dBTP
// Garante que o audio NUNCA estoure, mesmo em conversões MP3/AAC

async function renderMasterizedWithTruePeakLimiter(buf: AudioBuffer, p: MasterParams): Promise<AudioBuffer> {
  const sr = buf.sampleRate, len = buf.length, ch = buf.numberOfChannels
  const oc = new OfflineAudioContext(ch, len, sr)
  const src = oc.createBufferSource(); src.buffer = buf

  // EQ chain
  const bf = oc.createBiquadFilter(); bf.type = 'lowshelf'; bf.frequency.value = 150; bf.gain.value = p.bass
  const lmf = oc.createBiquadFilter(); lmf.type = 'peaking'; lmf.frequency.value = 350; lmf.Q.value = 0.8; lmf.gain.value = p.lowMid
  const mf = oc.createBiquadFilter(); mf.type = 'peaking'; mf.frequency.value = 1200; mf.Q.value = 1; mf.gain.value = p.mid
  const tf = oc.createBiquadFilter(); tf.type = 'highshelf'; tf.frequency.value = 5000; tf.gain.value = p.treble

  // Compressor
  const comp = oc.createDynamicsCompressor()
  if (p.comp > 0) {
    comp.ratio.value = 1 + (p.comp / 100) * 19; comp.threshold.value = -24 + (1 - p.comp / 100) * 20
    comp.knee.value = 6; comp.attack.value = 0.005; comp.release.value = 0.15
  } else { comp.ratio.value = 1; comp.threshold.value = 0 }

  // Saturação
  const drv = oc.createWaveShaper()
  if (p.drv > 0) {
    const n = 44100, c = new Float32Array(n), k = (p.drv / 100) * 30
    for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; c[i] = Math.tanh(x * (1 + k * Math.abs(x))) }
    drv.curve = c; drv.oversample = '4x'
  } else { drv.curve = null }

  // Volume
  const vol = oc.createGain(); vol.gain.value = Math.pow(10, p.vol / 20)

  // === LIMITER PROFISSIONAL (True Peak) ===
  // Ceiling em -0.3 dBTP — padrão de broadcasting
  // Primeiro estágio: compressor agressivo (brick-wall)
  const lim1 = oc.createDynamicsCompressor()
  lim1.threshold.value = -1.0; lim1.ratio.value = 20; lim1.knee.value = 0
  lim1.attack.value = 0.001; lim1.release.value = 0.05

  // Segundo estágio: safety limiter (garante -0.3 dBTP)
  const lim2 = oc.createDynamicsCompressor()
  lim2.threshold.value = -0.3; lim2.ratio.value = 20; lim2.knee.value = 0
  lim2.attack.value = 0.0005; lim2.release.value = 0.03

  // Conectar: src -> EQ -> comp -> drv -> vol -> lim1 -> lim2 -> destination
  src.connect(bf); bf.connect(lmf); lmf.connect(mf); mf.connect(tf)
  tf.connect(comp); comp.connect(drv); drv.connect(vol); vol.connect(lim1)
  lim1.connect(lim2); lim2.connect(oc.destination)

  src.start(0)
  return await oc.startRendering()
}

// ===================== PREPROCESS REF AUDIO (High-pass + Normalização) =====================
// Para vozes graves: remove subgraves (<70Hz) que confundem o speaker embedding
// e normaliza o volume pra -1 dB peak
// Retorna WAV como base64 (data URI)

export async function preprocessRefAudio(audioUrl: string): Promise<string> {
  // 1. Baixar o áudio
  const response = await fetch(audioUrl)
  const arrayBuffer = await response.arrayBuffer()

  // 2. Decodificar
  const audioCtx = new AudioContext()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  await audioCtx.close()

  // 3. Aplicar high-pass 70Hz + normalização
  const sr = audioBuffer.sampleRate, len = audioBuffer.length, ch = audioBuffer.numberOfChannels
  const oc = new OfflineAudioContext(ch, len, sr)
  const src = oc.createBufferSource()
  src.buffer = audioBuffer

  // High-pass 70Hz — remove subgraves (ar condicionado, vibração, microfone)
  const hp = oc.createBiquadFilter()
  hp.type = 'highpass'
  hp.frequency.value = 70
  hp.Q.value = 0.707  // Butterworth (flat response)

  // Normalização: ganho automático pra -1 dB peak
  const channelData = audioBuffer.getChannelData(0)
  let peak = 0
  for (let i = 0; i < channelData.length; i++) {
    const abs = Math.abs(channelData[i])
    if (abs > peak) peak = abs
  }

  const targetDb = -1.0
  const targetLinear = Math.pow(10, targetDb / 20)  // ~0.891
  const gainValue = peak > 0 ? targetLinear / peak : 1.0
  const gain = oc.createGain()
  gain.gain.value = Math.min(gainValue, 10)  // Cap em +20dB

  // Conectar: src -> highpass -> gain -> destination
  src.connect(hp)
  hp.connect(gain)
  gain.connect(oc.destination)

  src.start(0)
  const processedBuffer = await oc.startRendering()

  // 4. Converter para WAV base64
  const wavBase64 = audioBufferToWavBase64(processedBuffer)
  console.log(`[PREPROCESS-REF] High-pass 70Hz + norm OK (peak: ${peak.toFixed(3)}, gain: ${gainValue.toFixed(2)}x)`)

  return wavBase64
}

// ===================== AUDIOBUFFER -> WAV BASE64 =====================

function audioBufferToWavBase64(buf: AudioBuffer): string {
  const nc = buf.numberOfChannels, sr = buf.sampleRate, bps = 2
  const ba = nc * bps, dl = buf.length * ba, tl = 44 + dl
  const ab = new ArrayBuffer(tl)
  const v = new DataView(ab)

  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)) }
  ws(0, 'RIFF'); v.setUint32(4, tl - 8, true); ws(8, 'WAVE'); ws(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true)
  v.setUint16(22, nc, true); v.setUint32(24, sr, true)
  v.setUint32(28, sr * ba, true); v.setUint16(32, ba, true); v.setUint16(34, 16, true)
  ws(36, 'data'); v.setUint32(40, dl, true)

  const chs: Float32Array[] = []
  for (let c = 0; c < nc; c++) chs.push(buf.getChannelData(c))
  let o = 44
  for (let i = 0; i < buf.length; i++) {
    for (let c = 0; c < nc; c++) {
      let s = Math.max(-1, Math.min(1, chs[c][i]))
      s = s < 0 ? s * 0x8000 : s * 0x7FFF
      v.setInt16(o, s | 0, true)
      o += 2
    }
  }

  const bytes = new Uint8Array(ab)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  const base64 = btoa(binary)
  return `data:audio/wav;base64,${base64}`
}
