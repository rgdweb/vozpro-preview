/**
 * analyze-all-voices.ts
 * 
 * Script one-time: analisa TODAS as variações com áudio e salva defaultSpeed no banco.
 * Roda no servidor Oracle com: npx tsx scripts/analyze-all-voices.ts
 * 
 * Não altera schema, não altera permissões, não reinicia nada.
 * Apenas UPDATE no campo defaultSpeed das variações existentes.
 */

import { PrismaClient } from '@prisma/client'

const db = new PrismaClient({ log: ['error'] })

// ============================================================
// VOICE ANALYZER (inline — mesmo código de lib/voice-analyzer.ts)
// Adaptado para Node.js puro (sem browser APIs)
// ============================================================

interface VoiceAnalysisResult {
  fundamentalFreq: number
  classification: string
  recommendedSpeed: number
  summary: string
}

function analyzeWavBuffer(buffer: Buffer): VoiceAnalysisResult | null {
  try {
    // Verificar header WAV
    if (buffer.length < 44) return null
    const header = buffer.toString('ascii', 0, 4)
    if (header !== 'RIFF') return null

    const channels = buffer.readUInt16LE(22)
    const sampleRate = buffer.readUInt32LE(24)
    const bitsPerSample = buffer.readUInt16LE(34)

    // Só suporta PCM 16-bit
    if (bitsPerSample !== 16) return null

    // Dados de áudio começam no byte 44
    const pcmData = buffer.slice(44)
    const int16Samples = [] as number[]
    for (let i = 0; i < pcmData.length - 1; i += 2) {
      int16Samples.push(pcmData.readInt16LE(i))
    }

    if (int16Samples.length < 1024) return null

    // Converter para float normalizado
    const floatSamples: number[] = []
    if (channels === 2) {
      for (let i = 0; i < int16Samples.length - 1; i += 2) {
        floatSamples.push(((int16Samples[i] + int16Samples[i + 1]) / 2) / 32767)
      }
    } else {
      for (const s of int16Samples) {
        floatSamples.push(s / 32767)
      }
    }

    // Estimar F0
    const f0 = estimateF0(floatSamples, sampleRate)
    if (f0 <= 0) return null

    // Energia por banda
    const segLen = Math.min(floatSamples.length, Math.floor(2 * sampleRate))
    const segment = floatSamples.slice(0, segLen)
    const windowed = applyHanning(segment)
    const fft = simpleFFT(windowed)
    const magnitudes = fft.map(Math.abs)

    let grave = 0, total = 0
    for (let i = 0; i < magnitudes.length; i++) {
      const freq = (i * sampleRate) / magnitudes.length
      const e = magnitudes[i] * magnitudes[i]
      if (freq < 255) grave += e
      total += e
    }
    const bassRatio = total > 0 ? grave / total : 0.3

    // Classificar e calcular speed
    const classification = classifyVoice(f0, bassRatio)
    const recommendedSpeed = calculateSpeed(f0, bassRatio)

    return {
      fundamentalFreq: f0,
      classification,
      recommendedSpeed,
      summary: `${classification} | F0: ${Math.round(f0)}Hz | Bass: ${(bassRatio * 100).toFixed(0)}% | Speed: ${recommendedSpeed}`,
    }
  } catch {
    return null
  }
}

function estimateF0(samples: number[], sampleRate: number): number {
  const segSamples = Math.floor(0.4 * sampleRate)
  const freqs: number[] = []
  const maxAnalyze = Math.min(samples.length, Math.floor(3.5 * sampleRate))

  for (let i = 0; i < maxAnalyze - segSamples; i += segSamples) {
    const seg = samples.slice(i, i + segSamples)
    const win = applyHanning(seg)
    const freq = detectPitchACF(win, sampleRate)
    if (freq > 60 && freq < 600) freqs.push(freq)
  }

  if (freqs.length === 0) return 0
  freqs.sort((a, b) => a - b)
  const mid = Math.floor(freqs.length / 2)
  return freqs.length % 2 === 0 ? (freqs[mid - 1] + freqs[mid]) / 2 : freqs[mid]
}

function detectPitchACF(samples: number[], sampleRate: number): number {
  const len = samples.length
  let rms = 0
  for (let i = 0; i < len; i++) rms += samples[i] * samples[i]
  rms = Math.sqrt(rms / len)
  if (rms < 0.01) return 0

  const norm = samples.map(s => s / rms)
  const minLag = Math.floor(sampleRate / 600)
  const maxLag = Math.min(Math.floor(sampleRate / 60), Math.floor(len / 2))

  let bestLag = minLag, bestCorr = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    for (let i = 0; i < len - lag; i++) corr += norm[i] * norm[i + lag]
    corr /= (len - lag)
    if (corr > bestCorr) { bestCorr = corr; bestLag = lag }
  }

  return sampleRate / bestLag
}

function classifyVoice(f0: number, bassRatio: number): string {
  const bw = bassRatio > 0.4 ? 1 : 0
  if (f0 < 130 || (f0 < 170 && bw)) return 'muito-grave'
  if (f0 < 180 || (f0 < 220 && bw)) return 'grave'
  if (f0 < 280) return 'media'
  if (f0 < 380) return 'aguda'
  return 'muito-aguda'
}

function calculateSpeed(f0: number, bassRatio: number): number {
  let score = 0
  if (f0 < 130) score += 0
  else if (f0 < 180) score += 20
  else if (f0 < 220) score += 40
  else if (f0 < 300) score += 65
  else if (f0 < 400) score += 85
  else score += 100

  if (bassRatio > 0.5) score -= 15
  else if (bassRatio > 0.35) score -= 8

  score = Math.max(0, Math.min(100, score))

  if (score <= 15) return 1.3
  if (score <= 30) return 1.2
  if (score <= 55) return 1.1
  if (score <= 80) return 1.0
  return 0.95
}

function applyHanning(samples: number[]): number[] {
  const len = samples.length
  return samples.map((s, i) => s * 0.5 * (1 - Math.cos((2 * Math.PI * i) / (len - 1))))
}

function simpleFFT(samples: number[]): number[] {
  const n = nextPow2(samples.length)
  const real = new Float64Array(n)
  const imag = new Float64Array(n)
  for (let i = 0; i < samples.length; i++) real[i] = samples[i]

  let j = 0
  for (let i = 0; i < n; i++) {
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]]
      [imag[i], imag[j]] = [imag[j], imag[i]]
    }
    let m = n >> 1
    while (m >= 1 && j >= m) { j -= m; m >>= 1 }
    j += m
  }

  for (let size = 2; size <= n; size *= 2) {
    const half = size >> 1
    const angle = -2 * Math.PI / size
    const wR = Math.cos(angle), wI = Math.sin(angle)
    for (let i = 0; i < n; i += size) {
      let cR = 1, cI = 0
      for (let k = 0; k < half; k++) {
        const tR = cR * real[i + k + half] - cI * imag[i + k + half]
        const tI = cR * imag[i + k + half] + cI * real[i + k + half]
        real[i + k + half] = real[i + k] - tR
        imag[i + k + half] = imag[i + k] - tI
        real[i + k] += tR
        imag[i + k] += tI
        const nR = cR * wR - cI * wI
        cI = cR * wI + cI * wR
        cR = nR
      }
    }
  }

  const mags: number[] = []
  for (let i = 0; i <= n / 2; i++) mags.push(real[i])
  return mags
}

function nextPow2(n: number): number {
  let p = 1
  while (p < n) p <<= 1
  return p
}

// ============================================================
// MAIN — Batch analysis
// ============================================================

async function main() {
  console.log('=== ANALISE VOCAL BATCH - Todas as variações ===')
  console.log('Data:', new Date().toISOString())
  console.log('')

  // Buscar TODAS as variações que têm áudio
  const variations = await db.voiceVariation.findMany({
    where: {
      refAudioServerUrl: { not: '' },
      active: true,
    },
    include: {
      voice: { select: { name: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  console.log(`Total de variações com áudio: ${variations.length}`)
  console.log('')

  let updated = 0
  let failed = 0
  let skipped = 0
  const results: { voice: string; label: string; f0: number; speed: number; class: string }[] = []

  for (const v of variations) {
    const voiceName = v.voice.name
    const label = v.label || '(sem label)'

    try {
      // Baixar áudio (timeout curto — 10s)
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 10000)

      const res = await fetch(v.refAudioServerUrl, {
        signal: controller.signal,
        redirect: 'follow',
      })
      clearTimeout(timeout)

      if (!res.ok) {
        console.log(`  [SKIP] ${voiceName} - ${label}: HTTP ${res.status}`)
        skipped++
        continue
      }

      const arrayBuffer = await res.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Analisar
      const analysis = analyzeWavBuffer(buffer)

      if (!analysis) {
        console.log(`  [SKIP] ${voiceName} - ${label}: não conseguiu analisar (formato?)`)
        skipped++
        continue
      }

      // Atualizar no banco (apenas se speed != 1.0, para não salvar desnecessariamente)
      if (analysis.recommendedSpeed !== 1.0) {
        await db.voiceVariation.update({
          where: { id: v.id },
          data: { defaultSpeed: analysis.recommendedSpeed },
        })
        console.log(`  [OK]   ${voiceName} - ${label}: Speed ${analysis.recommendedSpeed} (${analysis.classification})`)
        updated++
      } else {
        console.log(`  [OK]   ${voiceName} - ${label}: Speed 1.0 (natural, sem salvar)`)
        updated++
      }

      results.push({
        voice: voiceName,
        label,
        f0: Math.round(analysis.fundamentalFreq),
        speed: analysis.recommendedSpeed,
        class: analysis.classification,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  [ERR]  ${voiceName} - ${label}: ${msg}`)
      failed++
    }
  }

  console.log('')
  console.log('=== RESUMO ===')
  console.log(`Analisadas com sucesso: ${updated}`)
  console.log(`Puladas (formato/erro): ${skipped + failed}`)
  console.log(`Total: ${variations.length}`)
  console.log('')

  // Mostrar distribuição
  const bySpeed: Record<number, number> = {}
  const byClass: Record<string, number> = {}
  for (const r of results) {
    bySpeed[r.speed] = (bySpeed[r.speed] || 0) + 1
    byClass[r.class] = (byClass[r.class] || 0) + 1
  }

  console.log('=== DISTRIBUIÇÃO POR SPEED ===')
  for (const [speed, count] of Object.entries(bySpeed).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  Speed ${speed}x: ${count} vozes`)
  }

  console.log('')
  console.log('=== DISTRIBUIÇÃO POR CLASSIFICAÇÃO ===')
  for (const [cls, count] of Object.entries(byClass)) {
    console.log(`  ${cls}: ${count} vozes`)
  }

  // Listar vozes que precisam de speed != 1.0
  console.log('')
  console.log('=== VOZES COM SPEED AJUSTADO !== ')
  const adjusted = results.filter(r => r.speed !== 1.0)
  if (adjusted.length === 0) {
    console.log('  Nenhuma voz precisou de ajuste')
  } else {
    for (const r of adjusted) {
      console.log(`  ${r.voice} (${r.label}): F0=${r.f0}Hz → Speed ${r.speed}x`)
    }
  }

  await db.$disconnect()
}

main().catch(async (err) => {
  console.error('FATAL:', err)
  await db.$disconnect()
  process.exit(1)
})
