/**
 * VozPro Audio Masterizer
 * Masterização automática + preset Clareza
 * Portado do index.html (MEngine) para Web Audio API
 * 100% client-side, zero carga no servidor
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
