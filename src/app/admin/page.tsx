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
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AudioWaveform, LogOut, Plus, Trash2, Edit, FileText, Upload, Music, Mic,
  Loader2, RefreshCw, Volume2, FileAudio, CheckCircle2, Settings2,
  FolderOpen, ChevronLeft, FolderPlus, Folder, Play, Pause, Users, UserPlus, Shield,
  UploadCloud, X, Download, VolumeX, CreditCard, Chrome, DollarSign, Tag
} from 'lucide-react'
import { toast } from 'sonner'
import AudioPlayer from '@/components/audio-player'

/**
 * Processamento de audio para trilhas - trima para 80s, re-encoda como MP3.
 * Tudo via Vercel proxy (sem upload direto, sem CORS).
 *
 * Regras:
 * - Arquivo <= 3.5MB e duracao <= 80s → envia original (zero perda)
 * - Arquivo > 80s → trima para 80s
 * - Re-encoda como MP3 192kbps stereo (alta qualidade, arquivo pequeno)
 * - 80s stereo 192kbps = ~1.9MB — cabe facil no Vercel
 */

const MAX_UPLOAD_SIZE = 3.5 * 1024 * 1024 // 3.5MB (margem segura do limite 4.5MB)
const MAX_DURATION = 80 // segundos maximo para trilha de propaganda
const MP3_BITRATE = 320 // kbps — qualidade maxima do MP3 (80s * 320kbps ≈ 3.0MB, dentro do limite)

/**
 * Converte AudioBuffer para MP3 usando lamejs (alta qualidade, arquivo pequeno).
 * Carrega lamejs dinamicamente do CDN para evitar problemas com bundler.
 */
async function encodeMp3(buffer: AudioBuffer, kbps: number = 320): Promise<Blob> {
  // Carregar lamejs do CDN se ainda nao foi carregado
  if (!(window as unknown as { lamejs?: object }).lamejs) {
    await new Promise<void>((resolve, reject) => {
      if (document.querySelector('script[src*="lame"]')) { resolve(); return }
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Falha ao carregar encoder MP3'))
      document.head.appendChild(script)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lamejsMod = (window as any).lamejs
  const Mp3Encoder = lamejsMod.Mp3Encoder

  const numCh = Math.min(buffer.numberOfChannels, 2)
  const sr = buffer.sampleRate
  const encoder = new Mp3Encoder(numCh, sr, kbps)

  const mp3Data: Int8Array[] = []
  const sampleBlockSize = 1152
  const left = buffer.getChannelData(0)
  const right = numCh > 1 ? buffer.getChannelData(1) : left

  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunk = new Int16Array(sampleBlockSize)
    const rightChunk = numCh > 1 ? new Int16Array(sampleBlockSize) : undefined

    for (let j = 0; j < sampleBlockSize; j++) {
      const idx = i + j
      if (idx < left.length) {
        leftChunk[j] = Math.max(-32768, Math.min(32767, Math.round(left[idx] * 32767)))
        if (rightChunk) rightChunk[j] = Math.max(-32768, Math.min(32767, Math.round(right[idx] * 32767)))
      }
    }

    const mp3buf = encoder.encodeBuffer(leftChunk, rightChunk)
    if (mp3buf.length > 0) mp3Data.push(mp3buf)
  }

  const end = encoder.flush()
  if (end.length > 0) mp3Data.push(end)

  return new Blob(mp3Data, { type: 'audio/mpeg' })
}

async function processTrackFile(file: File): Promise<{ blob: Blob; name: string; info: string }> {
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  const arrayBuffer = await file.arrayBuffer()
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
  const duration = audioBuffer.duration
  const origSizeMB = (file.size / (1024 * 1024)).toFixed(1)

  // Se o arquivo ja ta bom (tamanho OK e duracao OK), envia original
  if (file.size <= MAX_UPLOAD_SIZE && duration <= MAX_DURATION) {
    await audioCtx.close()
    return { blob: file, name: file.name, info: `${origSizeMB}MB, ${Math.round(duration)}s — original` }
  }

  // Precisa processar
  const needsTrim = duration > MAX_DURATION
  const targetDuration = needsTrim ? MAX_DURATION : duration

  // Renderizar com OfflineAudioContext (mantem sample rate e canais originais)
  const length = Math.ceil(targetDuration * audioBuffer.sampleRate)
  const numCh = Math.min(audioBuffer.numberOfChannels, 2) // MP3 suporta max 2 canais
  const offlineCtx = new OfflineAudioContext(numCh, length, audioBuffer.sampleRate)
  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer
  source.connect(offlineCtx.destination)
  source.start(0)
  const trimmed = await offlineCtx.startRendering()
  await audioCtx.close()

  // Calcular bitrate ideal: queremos o arquivo <= 3.5MB
  // Tamanho MP3 ≈ duration * bitrate / 8 (em bytes)
  const maxBitrate = Math.floor((MAX_UPLOAD_SIZE * 8) / targetDuration / 1000) // kbps
  const targetBitrate = Math.min(MP3_BITRATE, Math.max(64, maxBitrate - 10)) // margem de seguranca

  const mp3Blob = await encodeMp3(trimmed, targetBitrate)
  const finalSizeMB = (mp3Blob.size / (1024 * 1024)).toFixed(1)
  const chLabel = numCh === 1 ? 'mono' : 'stereo'
  const trimLabel = needsTrim ? `${Math.round(duration)}s → ${MAX_DURATION}s` : `${Math.round(duration)}s`
  const info = `${trimLabel}, ${audioBuffer.sampleRate}Hz ${chLabel}, ${targetBitrate}kbps MP3, ${finalSizeMB}MB`
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const name = `${baseName}.mp3`

  console.log(`[TrackProcess] ${info}`)
  return { blob: mp3Blob, name, info }
}

// ===================== VOICE AUDIO TRIMMER =====================
// Corta audio de referencia com waveform visual: auto-trim (detecta voz) ou manual (slider).

const VOICE_AUTO_TRIM_SECONDS = 10 // target de duracao apos auto-trim
const SILENCE_THRESHOLD = 0.015 // RMS absoluto para detectVoiceRange (auto-trim)
const SILENCE_DETECT_WINDOW = 40 // ms - janela fina para detectar silencios com precisao
const MIN_SILENCE_TO_CUT = 120 // ms - silencio minimo para marcar (mais sensivel)
const MICRO_GAP_MS = 30 // ms - gap entre palavras apos remover silencio (nao emenda direto)
const SILENCE_RATIO = 0.04 // silencio = RMS < 4% do pico do audio (mais sensivel)

/**
 * Detecta todas as regioes de silencio no audio usando threshold RELATIVO.
 * Compara cada janela com o pico do audio — funciona em qualquer volume.
 * Retorna array de { start, end } em segundos dos trechos de silencio.
 */
function detectSilenceRegions(audioBuffer: AudioBuffer): Array<{ start: number; end: number }> {
  const data = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate
  const winSamples = Math.floor(sr * SILENCE_DETECT_WINDOW / 1000)
  const numWins = Math.ceil(data.length / winSamples)
  
  // Calcular RMS por janela
  const rmsArr: number[] = []
  for (let i = 0; i < numWins; i++) {
    const s = i * winSamples
    const e = Math.min(s + winSamples, data.length)
    let sum = 0
    for (let j = s; j < e; j++) sum += data[j] * data[j]
    rmsArr.push(Math.sqrt(sum / (e - s)))
  }
  
  // Encontrar o pico RMS do audio (ignorando os 5% mais altos para nao ser afetado por picos isolados)
  const sorted = [...rmsArr].sort((a, b) => a - b)
  const p95idx = Math.floor(sorted.length * 0.95)
  const peakRms = Math.max(0.001, sorted[p95idx]) // minimo 0.001 para evitar divisao por zero
  
  // Threshold relativo: silencio = RMS abaixo de X% do pico
  const threshold = peakRms * SILENCE_RATIO
  // Mas nunca menor que um floor absoluto (para audios muito silenciosos)
  const finalThreshold = Math.max(threshold, 0.003)
  
  console.log(`[detectSilence] peakRms=${peakRms.toFixed(4)}, threshold=${finalThreshold.toFixed(4)} (${SILENCE_RATIO*100}% do pico)`) 
  
  // Encontrar regioes de silencio contínuo >= MIN_SILENCE_TO_CUT
  const regions: Array<{ start: number; end: number }> = []
  let silStart = -1
  const minSilWins = Math.ceil(MIN_SILENCE_TO_CUT / SILENCE_DETECT_WINDOW)
  
  for (let i = 0; i < numWins; i++) {
    if (rmsArr[i] <= finalThreshold) {
      if (silStart === -1) silStart = i
    } else {
      if (silStart !== -1) {
        const len = i - silStart
        if (len >= minSilWins) {
          regions.push({
            start: silStart * SILENCE_DETECT_WINDOW / 1000,
            end: i * SILENCE_DETECT_WINDOW / 1000
          })
        }
        silStart = -1
      }
    }
  }
  
  return regions
}

/**
 * Remove os silencios detectados e junta o audio com micro-gaps entre palavras.
 * Retorna novo AudioBuffer compacto.
 */
function removeSilenceRegions(audioBuffer: AudioBuffer, regions: Array<{ start: number; end: number }>): AudioBuffer {
  if (regions.length === 0) return audioBuffer
  
  const sr = audioBuffer.sampleRate
  const numCh = audioBuffer.numberOfChannels
  const gapSamples = Math.floor(sr * MICRO_GAP_MS / 1000)
  
  // Coletar as regioes de VOZ (o que fica entre os silencios)
  const voiceRegions: Array<{ sampleStart: number; sampleEnd: number }> = []
  let lastEnd = 0
  
  for (const sil of regions) {
    const silSampleStart = Math.floor(sil.start * sr)
    const silSampleEnd = Math.min(Math.floor(sil.end * sr), audioBuffer.length)
    if (silSampleStart > lastEnd) {
      voiceRegions.push({ sampleStart: lastEnd, sampleEnd: silSampleStart })
    }
    lastEnd = silSampleEnd
  }
  // Ultimo trecho de voz depois do ultimo silencio
  if (lastEnd < audioBuffer.length) {
    voiceRegions.push({ sampleStart: lastEnd, sampleEnd: audioBuffer.length })
  }
  
  if (voiceRegions.length === 0) return audioBuffer
  
  // Calcular tamanho total: voz + gaps entre regioes
  let totalSamples = 0
  for (const v of voiceRegions) totalSamples += (v.sampleEnd - v.sampleStart)
  totalSamples += gapSamples * (voiceRegions.length - 1) // gaps entre blocos
  
  const newBuf = new AudioBuffer({ numberOfChannels: numCh, length: totalSamples, sampleRate: sr })
  
  for (let c = 0; c < numCh; c++) {
    const src = audioBuffer.getChannelData(c)
    const dst = newBuf.getChannelData(c)
    let writePos = 0
    
    for (let i = 0; i < voiceRegions.length; i++) {
      const v = voiceRegions[i]
      for (let j = v.sampleStart; j < v.sampleEnd; j++) {
        dst[writePos++] = src[j]
      }
      // Adicionar micro-gap (fade suave) entre blocos, exceto apos o ultimo
      if (i < voiceRegions.length - 1 && gapSamples > 0) {
        for (let g = 0; g < gapSamples; g++) {
          dst[writePos++] = 0
        }
      }
    }
  }
  
  const timeSaved = audioBuffer.duration - newBuf.duration
  console.log(`[removeSilence] ${regions.length} silencios removidos: ${audioBuffer.duration.toFixed(1)}s → ${newBuf.duration.toFixed(1)}s (${timeSaved.toFixed(1)}s economizado, ${voiceRegions.length} blocos de voz com ${MICRO_GAP_MS}ms gaps)`)
  
  return newBuf
}

function detectVoiceRange(audioBuffer: AudioBuffer): { start: number; end: number } {
  const data = audioBuffer.getChannelData(0)
  const sr = audioBuffer.sampleRate
  const winMs = 150
  const winSamples = Math.floor(sr * winMs / 1000)
  const rmsArr: number[] = []
  for (let i = 0; i < data.length; i += winSamples) {
    let sum = 0; const end = Math.min(i + winSamples, data.length)
    for (let j = i; j < end; j++) sum += data[j] * data[j]
    rmsArr.push(Math.sqrt(sum / (end - i)))
  }
  let first = 0, last = rmsArr.length - 1
  for (let i = 0; i < rmsArr.length; i++) { if (rmsArr[i] > SILENCE_THRESHOLD) { first = i; break } }
  for (let i = rmsArr.length - 1; i >= 0; i--) { if (rmsArr[i] > SILENCE_THRESHOLD) { last = i; break } }
  let s = Math.max(0, (first * winMs / 1000) - 0.15)
  let e = Math.min(audioBuffer.duration, ((last + 1) * winMs / 1000) + 0.15)
  if (e - s > VOICE_AUTO_TRIM_SECONDS) {
    const c = (s + e) / 2; s = Math.max(0, c - VOICE_AUTO_TRIM_SECONDS / 2); e = s + VOICE_AUTO_TRIM_SECONDS
    if (e > audioBuffer.duration) { e = audioBuffer.duration; s = Math.max(0, e - VOICE_AUTO_TRIM_SECONDS) }
  }
  return { start: s, end: e }
}

function extractAudioRange(buf: AudioBuffer, s: number, e: number): AudioBuffer {
  const sr = buf.sampleRate, s0 = Math.max(0, Math.floor(s * sr)), s1 = Math.min(Math.floor(e * sr), buf.length)
  const len = Math.max(1, s1 - s0) // Garantir pelo menos 1 sample
  const ch = buf.numberOfChannels
  const nb = new AudioBuffer({ numberOfChannels: ch, length: len, sampleRate: sr })
  for (let c = 0; c < ch; c++) { const src = buf.getChannelData(c), dst = nb.getChannelData(c); for (let i = 0; i < len; i++) dst[i] = src[s0 + i] }
  return nb
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels, sr = buffer.sampleRate, bps = 16
  const dataBytes = buffer.length * numCh * (bps / 8)
  // Usar UM UNICO ArrayBuffer contiguo para evitar problemas com Blob multi-part
  const totalSize = 44 + dataBytes
  const ab = new ArrayBuffer(totalSize)
  const header = new Uint8Array(ab, 0, 44)
  const pcm = new Int16Array(ab, 44)

  // Preencher header WAV
  const h = new DataView(ab)
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) header[o + i] = s.charCodeAt(i) }
  w(0, 'RIFF'); h.setUint32(4, 36 + dataBytes, true); w(8, 'WAVE')
  w(12, 'fmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true)
  h.setUint16(22, numCh, true); h.setUint32(24, sr, true)
  h.setUint32(28, sr * numCh * bps / 8, true); h.setUint16(32, numCh * bps / 8, true); h.setUint16(34, bps, true)
  w(36, 'data'); h.setUint32(40, dataBytes, true)

  // Preencher dados PCM (interleaved)
  let maxAmp = 0
  for (let c = 0; c < numCh; c++) {
    const d = buffer.getChannelData(c)
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.max(-32768, Math.min(32767, Math.round(d[i] * 32767)))
      pcm[i * numCh + c] = sample
      const abs = Math.abs(sample)
      if (abs > maxAmp) maxAmp = abs
    }
  }

  console.log(`[audioBufferToWav] ${buffer.length} samples, ${numCh}ch, ${sr}Hz, ${dataBytes} bytes PCM, maxAmp=${maxAmp}, blob=${totalSize} bytes`)
  return new Blob([ab], { type: 'audio/wav' })
}

function drawVoiceWaveform(canvas: HTMLCanvasElement, buffer: AudioBuffer, rs: number, re: number, silenceRegions?: Array<{ start: number; end: number }>) {
  const ctx = canvas.getContext('2d'); if (!ctx) return
  const W = canvas.width, H = canvas.height, dur = buffer.duration, data = buffer.getChannelData(0), step = Math.max(1, Math.floor(data.length / W))
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, W, H)
  // Full waveform dimmed
  ctx.fillStyle = '#475569'
  for (let x = 0; x < W; x++) { let m = 0; for (let j = 0; j < step; j++) { const idx = x * step + j; if (idx < data.length) m = Math.max(m, Math.abs(data[idx])) } const h = m * H * 0.85; ctx.fillRect(x, (H - h) / 2, 1, h) }
  // Selected range highlighted
  const x1 = Math.floor((rs / dur) * W), x2 = Math.ceil((re / dur) * W)
  ctx.fillStyle = '#8b5cf6'
  for (let x = x1; x < x2; x++) { let m = 0; for (let j = 0; j < step; j++) { const idx = x * step + j; if (idx < data.length) m = Math.max(m, Math.abs(data[idx])) } const h = m * H * 0.85; ctx.fillRect(x, (H - h) / 2, 1, h) }
  // Dim outside
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  if (x1 > 0) ctx.fillRect(0, 0, x1, H)
  if (x2 < W) ctx.fillRect(x2, 0, W - x2, H)
  // Range borders
  ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x1, H); ctx.moveTo(x2, 0); ctx.lineTo(x2, H); ctx.stroke()
  // Time labels
  ctx.fillStyle = '#e2e8f0'; ctx.font = '11px sans-serif'
  ctx.fillText(`${rs.toFixed(1)}s`, 4, 14); ctx.fillText(`${re.toFixed(1)}s`, W - 35, 14)

  // === TRACINHOS VERMELHOS — DESENHADOS POR ULTIMO (por cima de tudo) ===
  if (silenceRegions && silenceRegions.length > 0) {
    const midY = H / 2
    for (const sil of silenceRegions) {
      const sx = Math.floor((sil.start / dur) * W)
      const ex = Math.ceil((sil.end / dur) * W)
      const isInside = sx < x2 && ex > x1

      if (isInside) {
        // DENTRO da selecao: bem visivel — fundo vermelho forte + linha horizontal
        ctx.fillStyle = 'rgba(239, 68, 68, 0.35)'
        ctx.fillRect(sx, 0, ex - sx, H)
        // Linha horizontal vermelha no meio (corta o waveform)
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(sx, midY); ctx.lineTo(ex, midY); ctx.stroke()
        ctx.setLineDash([])
        // Bordas verticais tracejadas
        ctx.strokeStyle = '#ef4444'
        ctx.lineWidth = 2
        ctx.setLineDash([4, 4])
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex, H); ctx.stroke()
        ctx.setLineDash([])
      } else {
        // FORA da selecao: sutil — fundo semi-transparente + bordas finas
        ctx.fillStyle = 'rgba(239, 68, 68, 0.15)'
        ctx.fillRect(sx, 0, ex - sx, H)
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, H); ctx.stroke()
        ctx.beginPath(); ctx.moveTo(ex, 0); ctx.lineTo(ex, H); ctx.stroke()
        ctx.setLineDash([])
      }
    }
  }
}

interface VoiceVariation {
  id: string
  label: string
  emoji: string
  refAudioPath: string
  refAudioServerUrl: string
  refAudioFilename: string
  refAudioName: string
  refText: string
  instruct: string
  order: number
  active: boolean
}

interface Voice {
  id: string
  name: string
  description: string
  gender: string
  age: string
  accent: string
  pitch: string
  category: string
  order: number
  active: boolean
  variations: VoiceVariation[]
}

interface Track {
  id: string
  name: string
  description: string
  emoji: string
  category: string
  audioPath: string
  duration: number
  order: number
  active: boolean
}

interface CategoryInfo {
  name: string
  count: number
  emoji?: string
}

interface ManagedCategory {
  name: string
  emoji: string
}

const GENDER_OPTIONS = [
  { value: 'Auto', label: 'Auto' },
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Feminino' },
]

const AGE_OPTIONS = [
  { value: 'Auto', label: 'Auto' },
  { value: 'child', label: 'Criança' },
  { value: 'teenager', label: 'Adolescente' },
  { value: 'young adult', label: 'Jovem Adulto' },
  { value: 'middle-aged', label: 'Meia-idade' },
  { value: 'elderly', label: 'Idoso' },
]

const PITCH_OPTIONS = [
  { value: 'Auto', label: 'Auto' },
  { value: 'very low pitch', label: 'Muito Grave' },
  { value: 'low pitch', label: 'Grave' },
  { value: 'moderate pitch', label: 'Moderado' },
  { value: 'high pitch', label: 'Agudo' },
  { value: 'very high pitch', label: 'Muito Agudo' },
]

const ACCENT_OPTIONS = [
  { value: 'Auto', label: 'Auto' },
  { value: 'portuguese accent', label: 'Português' },
  { value: 'american accent', label: 'Americano' },
  { value: 'british accent', label: 'Britânico' },
  { value: 'brazilian accent', label: 'Brasileiro' },
]

const INSTRUCT_OPTIONS = [
  { value: 'none', label: 'Nenhum' },
  { value: 'whisper', label: 'Sussurrado' },
  { value: 'male', label: 'Masculino' },
  { value: 'female', label: 'Feminino' },
  { value: 'young adult', label: 'Jovem' },
  { value: 'middle-aged', label: 'Meia-idade' },
  { value: 'low pitch', label: 'Grave' },
  { value: 'high pitch', label: 'Agudo' },
  { value: 'moderate pitch', label: 'Moderado' },
]

// ============================================================
// Helper: Converte URL de audio do servidor para URL do proxy
// Evita CORS/mixed-content: sempre passa pelo /api/proxy-audio
// Tambem corrige URLs do sorteiomax.com.br (dominio morto) para Oracle
// ============================================================
function toProxyAudioUrl(url: string): string {
  if (!url) return ''
  // Se ja e nosso proxy, nao duplicar
  if (url.startsWith('/api/proxy-audio')) return url
  // Corrigir URLs do sorteiomax (morto) para Oracle
  let resolvedUrl = url
  const sorteiomaxMatch = url.match(/sorteiomax\.com\.br\/omnivoice\/(.+)/i)
  if (sorteiomaxMatch) {
    resolvedUrl = `http://147.15.77.137/${sorteiomaxMatch[1]}`
  }
  // Usar proxy para qualquer URL absoluta
  return `/api/proxy-audio?url=${encodeURIComponent(resolvedUrl)}`
}

// ============================================================
// Componente: Mostra duracao do audio da variacao com indicador verde
// ============================================================
function VarDuration({ url }: { url: string }) {
  const [dur, setDur] = useState<number | null>(null)
  useEffect(() => {
    if (!url) return
    const proxyUrl = toProxyAudioUrl(url)
    const a = new Audio(proxyUrl)
    const onLoaded = () => { setDur(a.duration); URL.revokeObjectURL(a.src) }
    const onError = () => { setDur(-1); URL.revokeObjectURL(a.src) }
    a.addEventListener('loadedmetadata', onLoaded)
    a.addEventListener('error', onError)
    return () => { a.removeEventListener('loadedmetadata', onLoaded); a.removeEventListener('error', onError) }
  }, [url])

  if (dur === null) return null
  if (dur < 0) return <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-500 px-1.5 py-0">--s</Badge>

  const isOk = dur >= 3 && dur <= 12
  const secs = dur.toFixed(1)
  return (
    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 gap-0.5 ${isOk ? 'border-emerald-700 text-emerald-400' : dur < 3 ? 'border-amber-700 text-amber-400' : 'border-red-700 text-red-400'}`}>
      {isOk && <CheckCircle2 className="w-2.5 h-2.5" />}
      {secs}s
    </Badge>
  )
}

// ============================================================
// COMPONENTE: Monitor de Saúde do Sistema
// ============================================================
function HealthSection() {
  const [healthData, setHealthData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastCheck, setLastCheck] = useState<string>('')


  const checkHealth = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/health')
      const data = await res.json()
      setHealthData(data)
      setLastCheck(new Date().toLocaleTimeString('pt-BR'))
    } catch {
      setHealthData({ error: 'Erro ao conectar' })
    } finally {
      setLoading(false)
    }
  }

  const runCleanup = async () => {
    try {
      const res = await fetch('/api/health', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success('Cleanup executado!')
        checkHealth()
      }
    } catch {
      toast.error('Erro ao executar cleanup')
    }
  }

  const statusColor = (s: string) => {
    if (s === 'ok') return 'text-emerald-400'
    if (s === 'warning') return 'text-amber-400'
    return 'text-red-400'
  }

  const statusBg = (s: string) => {
    if (s === 'ok') return 'border-emerald-500/30 bg-emerald-900/10'
    if (s === 'warning') return 'border-amber-500/30 bg-amber-900/10'
    return 'border-red-500/30 bg-red-900/10'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Saúde do Sistema</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">{lastCheck && `Última: ${lastCheck}`}</span>
          <Button variant="outline" size="sm" onClick={runCleanup} disabled={loading} className="border-slate-600 text-slate-300 hover:bg-slate-700 text-xs">
            Limpar Temp
          </Button>
          <Button size="sm" onClick={checkHealth} disabled={loading} className="bg-violet-600 hover:bg-violet-700 text-white text-xs">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : '🔍'} Verificar
          </Button>
        </div>
      </div>

      {!healthData ? (
        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-12 text-center">
            <p className="text-slate-400">Clique em &quot;Verificar&quot; para diagnosticar o sistema</p>
            <p className="text-xs text-slate-600 mt-2">Verifica: banco de dados, GPU, tunnel, disco, RAM, fila, processos</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Status Geral */}
          {healthData.status && (
            <Card className={`border ${statusBg(String(healthData.status))}`}>
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{String(healthData.status) === 'ok' ? '✅' : String(healthData.status) === 'warning' ? '⚠️' : '🔴'}</span>
                  <span className={`font-semibold ${statusColor(String(healthData.status))}`}>
                    {String(healthData.status) === 'ok' ? 'Tudo normal' : String(healthData.status) === 'warning' ? 'Atenção' : 'Crítico'}
                  </span>
                </div>
                <span className="text-xs text-slate-400">{healthData.total_problemas} problema(s)</span>
              </CardContent>
            </Card>
          )}

          {/* Problemas */}
          {Array.isArray(healthData.problemas) && healthData.problemas.length > 0 && (
            <Card className="border-red-500/30 bg-red-900/10">
              <CardContent className="py-3 px-4">
                <p className="text-sm font-medium text-red-400 mb-2">Problemas detectados:</p>
                {healthData.problemas.map((p: unknown, i: number) => (
                  <p key={i} className="text-xs text-red-300">• {String(p)}</p>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Checks detalhados */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Database */}
            {healthData.checks?.database && (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-3 px-4">
                  <p className="text-xs font-medium text-slate-300 mb-2">🗄️ Database</p>
                  <div className="text-xs space-y-1 text-slate-400">
                    <p>Latência: <span className={Number((healthData.checks.database as Record<string, unknown>).latencia_ms) > 500 ? 'text-red-400' : 'text-emerald-400'}>{(healthData.checks.database as Record<string, unknown>).latencia_ms}ms</span></p>
                    <p>Usuários: {(healthData.checks.database as Record<string, unknown>).usuarios}</p>
                    <p>Vozes: {(healthData.checks.database as Record<string, unknown>).vozes}</p>
                    <p>Trilhas: {(healthData.checks.database as Record<string, unknown>).trilhas}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Fila */}
            {healthData.checks?.fila && (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-3 px-4">
                  <p className="text-xs font-medium text-slate-300 mb-2">📋 Fila de Geração</p>
                  <div className="text-xs space-y-1 text-slate-400">
                    <p>Processando: <span className={(healthData.checks.fila as Record<string, unknown>).processing > 0 ? 'text-amber-400' : 'text-emerald-400'}>{(healthData.checks.fila as Record<string, unknown>).processing}</span></p>
                    <p>Aguardando: {(healthData.checks.fila as Record<string, unknown>).waiting}</p>
                    <p>Status: {(healthData.checks.fila as Record<string, unknown>).ocupada ? '🔴 Ocupada' : '🟢 Livre'}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* PHP Server */}
            {healthData.checks?.php_server && (
              <Card className="bg-white/5 border-white/10 md:col-span-2">
                <CardContent className="py-3 px-4">
                  <p className="text-xs font-medium text-slate-300 mb-2">🖥️ Servidor PHP (GPU + Tunnel)</p>
                  <div className="text-xs space-y-1 text-slate-400">
                    <p>Latência: <span className={Number((healthData.checks.php_server as Record<string, unknown>).latencia_ms) > 2000 ? 'text-red-400' : 'text-emerald-400'}>{(healthData.checks.php_server as Record<string, unknown>).latencia_ms}ms</span></p>
                    {(healthData.checks.php_server as Record<string, unknown>)?.checks?.tunnel && (
                      <p>Tunnel: {(healthData.checks.php_server as Record<string, Record<string, unknown>>).checks?.tunnel?.ok ? '🟢 OK' : '🔴 Down'} {(healthData.checks.php_server as Record<string, Record<string, unknown>>).checks?.tunnel?.url && <span className="text-slate-600 ml-1">({String((healthData.checks.php_server as Record<string, Record<string, unknown>>).checks?.tunnel?.url).substring(0, 50)}...)</span>}</p>
                    )}
                    {(healthData.checks.php_server as Record<string, Record<string, unknown>>)?.checks?.gpu?.gpus?.map((gpu: Record<string, unknown>, i: number) => (
                      <div key={i}>
                        <p>GPU {i}: {gpu.nome} | VRAM: {gpu.vram_uso_porcento}% | Temp: {gpu.temperatura_c}°C</p>
                      </div>
                    ))}
                    {(healthData.checks.php_server as Record<string, Record<string, unknown>>)?.checks?.disco && (
                      <p>Disco: {(healthData.checks.php_server as Record<string, Record<string, unknown>>).checks?.disco?.usado_porcento}% usado ({(healthData.checks.php_server as Record<string, Record<string, unknown>>).checks?.disco?.livre_mb}MB livre)</p>
                    )}
                    {(healthData.checks.php_server as Record<string, Record<string, unknown>>)?.checks?.processos && (
                      <div>
                        <p>GPU TTS (Native): {(healthData.checks.php_server as Record<string, Record<string, unknown>>).checks?.processos?.rodando ? '🟢 Rodando' : '🔴 Parado'}</p>
                        <p>Cloudflared: {(healthData.checks.php_server as Record<string, Record<string, unknown>>).checks?.processos?.cloudflared_rodando ? '🟢 Rodando' : '🔴 Parado'}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Arquivos */}
            {healthData.checks?.php_server?.checks?.arquivos && (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-3 px-4">
                  <p className="text-xs font-medium text-slate-300 mb-2">📁 Arquivos no Servidor</p>
                  <div className="text-xs space-y-1 text-slate-400">
                    <p>Total: {healthData.checks.php_server.checks.arquivos.total_arquivos} arquivos ({healthData.checks.php_server.checks.arquivos.total_tamanho_mb}MB)</p>
                    <p>Ref: {healthData.checks.php_server.checks.arquivos.categorias?.ref?.quantidade || 0} | Track: {healthData.checks.php_server.checks.arquivos.categorias?.track?.quantidade || 0}</p>
                    <p>Chunks pendentes: <span className={healthData.checks.php_server.checks.arquivos.chunks_pendentes > 0 ? 'text-amber-400' : 'text-emerald-400'}>{healthData.checks.php_server.checks.arquivos.chunks_pendentes}</span></p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Uptime */}
            {healthData.checks?.php_server?.checks?.uptime && (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="py-3 px-4">
                  <p className="text-xs font-medium text-slate-300 mb-2">⏱️ Uptime do Servidor</p>
                  <div className="text-xs text-slate-400">
                    <p className="text-lg font-mono">{healthData.checks.php_server.checks.uptime.formatado}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>


          {/* Logs recentes */}
          {healthData.checks?.php_server?.checks?.logs_recentes?.length > 0 && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="py-3 px-4">
                <p className="text-xs font-medium text-slate-300 mb-2">📝 Últimos Logs</p>
                <div className="text-xs text-slate-500 space-y-0.5 font-mono max-h-32 overflow-y-auto">
                  {healthData.checks.php_server.checks.logs_recentes.map((log: string, i: number) => (
                    <p key={i}>{String(log).substring(0, 100)}</p>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recomendação */}
          {healthData.resumo?.recomendacao && (
            <Card className={`border ${statusBg(String(healthData.status))}`}>
              <CardContent className="py-3 px-4">
                <p className="text-xs text-slate-300">
                  <span className="font-medium">💡 Recomendação:</span> {String(healthData.resumo.recomendacao)}
                </p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

// ============================================================
// COMPONENTE: Seção de Gestão de Usuários
// ============================================================
function UsersSection({ users, loaded, onRefresh }: {
  users: Array<{ id: string; name: string; email: string; role: string; active: boolean; paymentExempt: boolean; createdAt: string }>
  loaded: boolean
  onRefresh: () => void
}) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [saving, setSaving] = useState(false)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editPassword, setEditPassword] = useState('')

  const handleCreateUser = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error('Preencha nome, email e senha')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Usuário criado com sucesso!')
        setShowAddDialog(false)
        setNewName('')
        setNewEmail('')
        setNewPassword('')
        setNewRole('user')
        onRefresh()
      } else {
        toast.error(data.error || 'Erro ao criar usuário')
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateUser = async (id: string) => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = { id, name: editName, email: editEmail, role: editRole }
      if (editPassword) body.password = editPassword

      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Usuário atualizado!')
        setEditingUser(null)
        onRefresh()
      } else {
        toast.error(data.error || 'Erro ao atualizar')
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async (id: string, name: string) => {
    if (!confirm(`Deletar usuário "${name}"?`)) return
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Usuário deletado')
        onRefresh()
      } else {
        toast.error(data.error || 'Erro ao deletar')
      }
    } catch {
      toast.error('Erro de conexão')
    }
  }

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, active: !currentActive }),
      })
      if (res.ok) {
        toast.success(currentActive ? 'Usuário desativado' : 'Usuário ativado')
        onRefresh()
      }
    } catch {
      toast.error('Erro de conexão')
    }
  }

  const handleTogglePayment = async (id: string, currentExempt: boolean) => {
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, paymentExempt: !currentExempt }),
      })
      if (res.ok) {
        toast.success(currentExempt ? 'Pagamento ativado para este usuário' : 'Usuário isento de pagamento (grátis)')
        onRefresh()
      }
    } catch {
      toast.error('Erro de conexão')
    }
  }

  const startEdit = (user: typeof users[0]) => {
    setEditingUser(user.id)
    setEditName(user.name)
    setEditEmail(user.email)
    setEditRole(user.role)
    setEditPassword('')
  }

  if (!loaded) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando usuários...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Usuários Cadastrados</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onRefresh} className="border-slate-600 text-slate-300 hover:bg-slate-700">
            <RefreshCw className="w-3 h-3 mr-1" /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setShowAddDialog(true)} className="bg-violet-600 hover:bg-violet-700 text-white">
            <UserPlus className="w-3 h-3 mr-1" /> Novo Usuário
          </Button>
        </div>
      </div>

      {/* Lista de Usuários */}
      <div className="space-y-2">
        {users.length === 0 ? (
          <p className="text-slate-500 text-center py-8">Nenhum usuário cadastrado</p>
        ) : (
          users.map(user => (
            <Card key={user.id} className="bg-white/5 border-white/10">
              <CardContent className="py-3 px-4">
                {editingUser === user.id ? (
                  /* Modo edição */
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Nome" className="bg-slate-900/50 border-slate-600 text-white text-sm" />
                    <Input value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="Email" className="bg-slate-900/50 border-slate-600 text-white text-sm" />
                    <Input value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="Nova senha (vazio = manter)" type="password" className="bg-slate-900/50 border-slate-600 text-white text-sm" />
                    <select value={editRole} onChange={e => setEditRole(e.target.value)} className="bg-slate-900/50 border-slate-600 text-white text-sm rounded-md px-3 py-1.5">
                      <option value="admin">Admin</option>
                      <option value="user">Usuário</option>
                    </select>
                    <div className="col-span-2 flex gap-2">
                      <Button size="sm" onClick={() => handleUpdateUser(user.id)} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Salvar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingUser(null)} className="border-slate-600 text-slate-300">
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Modo visualização */
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${user.role === 'admin' ? 'bg-violet-600 text-white' : 'bg-slate-600 text-slate-300'}`}>
                        {user.role === 'admin' ? <Shield className="w-4 h-4" /> : user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{user.name}</p>
                        <p className="text-xs text-slate-400">{user.email}</p>
                      </div>
                      <Badge variant="outline" className={`text-xs ml-2 ${user.role === 'admin' ? 'border-violet-500/50 text-violet-400' : 'border-slate-600 text-slate-400'}`}>
                        {user.role === 'admin' ? 'Admin' : 'Usuário'}
                      </Badge>
                      {!user.active && (
                        <Badge variant="outline" className="border-red-500/50 text-red-400 text-xs">
                          Inativo
                        </Badge>
                      )}
                      {user.paymentExempt && (
                        <Badge variant="outline" className="border-emerald-500/50 text-emerald-400 text-xs">
                          Grátis
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => handleTogglePayment(user.id, user.paymentExempt)} className={`h-8 px-2 text-xs font-bold ${user.paymentExempt ? 'text-emerald-400 hover:text-emerald-300 bg-emerald-900/30 border border-emerald-500/30' : 'text-amber-400 hover:text-amber-300 bg-amber-900/20 border border-amber-500/20'}`} title={user.paymentExempt ? 'Clique para cobrar pagamento' : 'Clique para isentar de pagamento'}>
                        {user.paymentExempt ? 'LIVRE' : 'R$'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleToggleActive(user.id, user.active)} className="text-slate-400 hover:text-white h-8 w-8 p-0" title={user.active ? 'Desativar' : 'Ativar'}>
                        {user.active ? '✓' : '○'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => startEdit(user)} className="text-slate-400 hover:text-white h-8 w-8 p-0" title="Editar">
                        <Edit className="w-3 h-3" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteUser(user.id, user.name)} className="text-slate-400 hover:text-red-400 h-8 w-8 p-0" title="Deletar">
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialog: Novo Usuário */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white">
          <DialogHeader>
            <DialogTitle>Novo Usuário</DialogTitle>
            <DialogDescription className="text-slate-400">Preencha os dados para criar um novo usuário</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" className="bg-slate-900/50 border-slate-600 text-white" />
            <Input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Email (login)" type="email" className="bg-slate-900/50 border-slate-600 text-white" />
            <Input value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Senha" type="password" className="bg-slate-900/50 border-slate-600 text-white" />
            <select value={newRole} onChange={e => setNewRole(e.target.value)} className="bg-slate-900/50 border-slate-600 text-white rounded-md px-3 py-2">
              <option value="user">Usuário</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)} className="border-slate-600 text-slate-300">Cancelar</Button>
            <Button onClick={handleCreateUser} disabled={saving} className="bg-violet-600 hover:bg-violet-700 text-white">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null} Criar Usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()
  const [voices, setVoices] = useState<Voice[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  // Voice form state
  const [voiceForm, setVoiceForm] = useState({
    name: '', description: '', gender: 'Auto', age: 'Auto', accent: 'Auto', pitch: 'Auto', category: '',
  })
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null)
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false)

  // Bulk voice upload state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false)
  const [bulkFiles, setBulkFiles] = useState<File[]>([])
  const [bulkCategory, setBulkCategory] = useState('')
  const [bulkGender, setBulkGender] = useState('Auto')
  const [bulkAccent, setBulkAccent] = useState('Auto')
  const [bulkPitch, setBulkPitch] = useState('Auto')
  const [bulkAge, setBulkAge] = useState('Auto')
  const [bulkUploading, setBulkUploading] = useState(false)
  const [bulkProgress, setBulkProgress] = useState('')
  const [bulkDragOver, setBulkDragOver] = useState(false)

  // Variation form state (used for both create and edit)
  const [variationForm, setVariationForm] = useState({
    label: '', emoji: '', refAudioPath: '', serverUrl: '', filename: '', refAudioName: '', refText: '', instruct: 'none',
  })
  const [editingVariationId, setEditingVariationId] = useState<string | null>(null)
  const [addingVariationTo, setAddingVariationTo] = useState<string | null>(null)
  const [variationDialogOpen, setVariationDialogOpen] = useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)

  // Pending files (not uploaded yet, waiting for save)
  const [pendingVoiceFile, setPendingVoiceFile] = useState<{ blob: Blob; name: string; info: string } | null>(null)
  const [voiceTrimState, setVoiceTrimState] = useState<{ buffer: AudioBuffer; duration: number; rangeStart: number; rangeEnd: number; fileName: string; silenceRegions?: Array<{ start: number; end: number }> } | null>(null)
  const [silenceCount, setSilenceCount] = useState(0)
  const waveCanvasRef = useRef<HTMLCanvasElement>(null)
  const voicePreviewCtxRef = useRef<AudioContext | null>(null)
  const voicePreviewSrcRef = useRef<AudioBufferSourceNode | null>(null)
  const [voicePreviewing, setVoicePreviewing] = useState(false)
  const [loadingExistingAudio, setLoadingExistingAudio] = useState(false)
  const [audioAlreadyUpdated, setAudioAlreadyUpdated] = useState(false)

  // Track form state
  const [trackForm, setTrackForm] = useState({ name: '', description: '', emoji: '', category: '' })
  const [trackDialogOpen, setTrackDialogOpen] = useState(false)
  const [uploadingTrack, setUploadingTrack] = useState(false)
  const [trackFilePath, setTrackFilePath] = useState('')
  const [trackFilename, setTrackFilename] = useState('')
  const [trackDuration, setTrackDuration] = useState(0)
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)
  const [audioServerConfig, setAudioServerConfig] = useState<{ url: string; apiKey: string } | null>(null)

  // Pending track file (not uploaded yet, waiting for save)
  const [pendingTrackFile, setPendingTrackFile] = useState<{ blob: Blob; name: string } | null>(null)

  // Category state
  const [trackCategories, setTrackCategories] = useState<CategoryInfo[]>([])
  const [voiceCategories, setVoiceCategories] = useState<CategoryInfo[]>([])
  const [selectedTrackCategory, setSelectedTrackCategory] = useState<string | null>(null)
  const [selectedVoiceCategory, setSelectedVoiceCategory] = useState<string | null>(null)

  // Managed categories state (from SystemSetting)
  const [managedTrackCategories, setManagedTrackCategories] = useState<ManagedCategory[]>([])
  const [managedVoiceCategories, setManagedVoiceCategories] = useState<ManagedCategory[]>([])

  // Category management dialog state
  const [trackCategoryDialogOpen, setTrackCategoryDialogOpen] = useState(false)
  const [voiceCategoryDialogOpen, setVoiceCategoryDialogOpen] = useState(false)
  const [speakerVarIds, setSpeakerVarIds] = useState<Set<string>>(new Set())
  const [speakersData, setSpeakersData] = useState<Array<{ id: string; name: string; speakerFile: string; refAudioUrl: string; refText: string }>>([])
  const [editingSpeakerId, setEditingSpeakerId] = useState<string | null>(null)
  const [speakerRefText, setSpeakerRefText] = useState('')
  const [convertingSpeakerId, setConvertingSpeakerId] = useState<string | null>(null)
  const [newCatName, setNewCatName] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('')
  const [savingCategories, setSavingCategories] = useState(false)
  // Category edit state (inline editing in list)
  const [editingCatIndex, setEditingCatIndex] = useState<{ type: 'tracks' | 'voices'; index: number } | null>(null)
  const [editingCatName, setEditingCatName] = useState('')
  const [editingCatEmoji, setEditingCatEmoji] = useState('')

  // Batch upload state (tracks)
  const [batchUploadOpen, setBatchUploadOpen] = useState(false)
  const [batchUploadCategory, setBatchUploadCategory] = useState('')
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchUploading, setBatchUploading] = useState(false)
  const [batchProgress, setBatchProgress] = useState('')

  // Batch voice upload state
  const [voiceBatchOpen, setVoiceBatchOpen] = useState(false)
  const [voiceBatchVoiceId, setVoiceBatchVoiceId] = useState('')
  const [voiceBatchFiles, setVoiceBatchFiles] = useState<File[]>([])
  const [voiceBatchUploading, setVoiceBatchUploading] = useState(false)
  const [voiceBatchProgress, setVoiceBatchProgress] = useState('')

  // Track preview state (inline play/pause)
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null)
  const trackPreviewAudioRef = useRef<HTMLAudioElement | null>(null)

  // Voice preview state (inline play/pause)
  const [previewingVoiceVarId, setPreviewingVoiceVarId] = useState<string | null>(null)
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null)

  const toggleTrackPreview = (track: Track) => {
    if (previewingTrackId === track.id) {
      trackPreviewAudioRef.current?.pause()
      trackPreviewAudioRef.current = null
      setPreviewingTrackId(null)
    } else {
      trackPreviewAudioRef.current?.pause()
      trackPreviewAudioRef.current = null
      if (track.audioPath) {
        const proxyUrl = toProxyAudioUrl(track.audioPath)
        const audio = new Audio(proxyUrl)
        audio.play().catch(() => {})
        audio.onended = () => setPreviewingTrackId(null)
        trackPreviewAudioRef.current = audio
        setPreviewingTrackId(track.id)
      }
    }
  }

  const toggleVoicePreview = (variation: VoiceVariation) => {
    if (previewingVoiceVarId === variation.id) {
      voicePreviewAudioRef.current?.pause()
      voicePreviewAudioRef.current = null
      setPreviewingVoiceVarId(null)
    } else {
      voicePreviewAudioRef.current?.pause()
      voicePreviewAudioRef.current = null
      const audioUrl = variation.refAudioServerUrl || variation.refAudioPath
      if (audioUrl) {
        const proxyUrl = toProxyAudioUrl(audioUrl)
        const audio = new Audio(proxyUrl)
        audio.play().catch(() => {})
        audio.onended = () => setPreviewingVoiceVarId(null)
        voicePreviewAudioRef.current = audio
        setPreviewingVoiceVarId(variation.id)
      }
    }
  }

  useEffect(() => {
    return () => { trackPreviewAudioRef.current?.pause(); voicePreviewAudioRef.current?.pause() }
  }, [])

  // Settings state
  const [enableVoiceUpload, setEnableVoiceUpload] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [watermarkPath, setWatermarkPath] = useState('')
  const [watermarkVolume, setWatermarkVolume] = useState(0.08)
  const [watermarkUploading, setWatermarkUploading] = useState(false)
  const [adminSettings, setAdminSettings] = useState<Record<string, string>>({})

  // Users state
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; role: string; active: boolean; paymentExempt: boolean; createdAt: string }>>([])
  const [usersLoaded, setUsersLoaded] = useState(false)

  // Check auth — SOMENTE admin pode acessar
  useEffect(() => {
    fetch('/api/auth/verify').then(res => res.json()).then(data => {
      if (!data.authenticated || data.role !== 'admin') {
        router.push('/admin/login')
      } else {
        setAuthChecked(true)
      }
    }).catch(() => router.push('/admin/login'))
  }, [router])

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [voicesRes, tracksRes, configRes, settingsRes, trackCatRes, voiceCatRes, managedCatRes] = await Promise.all([
        fetch('/api/admin/voices'),
        fetch('/api/admin/tracks'),
        fetch('/api/server-config'),
        fetch('/api/admin/settings'),
        fetch('/api/track-categories'),
        fetch('/api/voice-categories'),
        fetch('/api/categories'),
      ])
      if (voicesRes.ok) setVoices(await voicesRes.json())
      if (tracksRes.ok) setTracks(await tracksRes.json())
      if (configRes.ok) setAudioServerConfig(await configRes.json())
      if (settingsRes.ok) {
        const settingsData = await settingsRes.json()
        setEnableVoiceUpload(settingsData.enableVoiceUpload === 'true')
        setWatermarkPath(settingsData.watermarkAudioPath || '')
        setWatermarkVolume(settingsData.watermarkVolume ? parseFloat(settingsData.watermarkVolume) : 0.08)
        setAdminSettings(settingsData)
        setSettingsLoaded(true)
      }
      if (trackCatRes.ok) setTrackCategories(await trackCatRes.json())
      if (voiceCatRes.ok) setVoiceCategories(await voiceCatRes.json())
      // Fetch Locutores Oficiais para marcar variacoes
      try {
        const speakersRes = await fetch('/api/admin/speakers')
        if (speakersRes.ok) {
          const spData = await speakersRes.json()
          setSpeakersData(spData || [])
          setSpeakerVarIds(new Set((spData || []).map((s: { speakerFile: string }) => s.speakerFile)))
        }
      } catch {}
      if (managedCatRes.ok) {
        const managedData = await managedCatRes.json()
        setManagedTrackCategories(managedData.tracks || [])
        setManagedVoiceCategories(managedData.voices || [])
      }
    } catch {
      toast.error('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load users (separate since it's a different API)
  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
        setUsersLoaded(true)
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (authChecked) loadUsers()
  }, [authChecked, loadUsers])

  useEffect(() => {
    if (authChecked) loadData()
  }, [authChecked, loadData])

  const handleLogout = async () => {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/admin/login')
  }

  // --- VOICE CRUD ---
  const handleSaveVoice = async () => {
    if (!voiceForm.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }
    try {
      if (editingVoiceId) {
        await fetch(`/api/voices/${editingVoiceId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(voiceForm),
        })
        toast.success('Voz atualizada!')
      } else {
        await fetch('/api/voices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(voiceForm),
        })
        toast.success('Voz criada!')
      }
      setVoiceDialogOpen(false)
      setEditingVoiceId(null)
      setVoiceForm({ name: '', description: '', gender: 'Auto', age: 'Auto', accent: 'Auto', pitch: 'Auto', category: '' })
      loadData()
    } catch {
      toast.error('Erro ao salvar voz')
    }
  }

  // --- BULK VOICE UPLOAD ---
  const handleBulkFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      setBulkFiles(prev => [...prev, ...files])
    }
  }

  const handleBulkDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setBulkDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(f.name))
    if (files.length > 0) {
      setBulkFiles(prev => [...prev, ...files])
    } else {
      toast.error('Arraste arquivos de áudio (MP3, WAV, OGG, M4A, FLAC, WEBM)')
    }
  }

  const removeBulkFile = (index: number) => {
    setBulkFiles(prev => prev.filter((_, i) => i !== index))
  }

  const clearBulkFiles = () => {
    setBulkFiles([])
  }

  const handleBulkUpload = async () => {
    if (bulkFiles.length === 0) {
      toast.error('Selecione pelo menos um arquivo de áudio')
      return
    }
    if (!bulkCategory) {
      toast.error('Selecione uma categoria')
      return
    }

    setBulkUploading(true)
    setBulkProgress(`Enviando 0 de ${bulkFiles.length}...`)

    try {
      // Enviar arquivos um a um para evitar timeout do Vercel
      let created = 0
      let failed = 0
      const errors: string[] = []

      for (let i = 0; i < bulkFiles.length; i++) {
        const file = bulkFiles[i]
        setBulkProgress(`Enviando ${i + 1} de ${bulkFiles.length}: ${file.name}`)

        try {
          const formData = new FormData()
          formData.append('files', file)
          formData.append('category', bulkCategory)
          formData.append('gender', bulkGender)
          formData.append('accent', bulkAccent)
          formData.append('pitch', bulkPitch)
          formData.append('age', bulkAge)

          const res = await fetch('/api/admin/voices/bulk-upload', {
            method: 'POST',
            body: formData,
          })

          const data = await res.json()

          if (res.ok && data.success && data.created > 0) {
            created += data.created
          } else {
            failed++
            if (data.error) errors.push(data.error)
          }
        } catch (err) {
          failed++
          errors.push(`Erro em ${file.name}: ${err instanceof Error ? err.message : 'falha'}`)
        }
      }

      if (created > 0) {
        toast.success(`${created} voz(es) criada(s)!${failed > 0 ? ` ${failed} falha(s).` : ''}`)
        setBulkDialogOpen(false)
        setBulkFiles([])
        loadData()
      } else {
        toast.error(`Nenhuma voz criada. ${errors.length > 0 ? errors[0] : 'Verifique os arquivos e tente novamente.'}`)
      }

      if (errors.length > 1) {
        console.warn('[BulkUpload] Errors:', errors)
      }
    } catch (err) {
      toast.error(`Erro: ${err instanceof Error ? err.message : 'Erro de conexão'}`)
    } finally {
      setBulkUploading(false)
      setBulkProgress('')
    }
  }

  const handleDeleteVoice = async (id: string) => {
    if (!confirm('Excluir esta voz e todas as suas variações?')) return
    try {
      await fetch(`/api/voices/${id}`, { method: 'DELETE' })
      toast.success('Voz excluída')
      loadData()
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  // Salvar refText do Locutor Oficial
  const handleSaveSpeakerRefText = async (speakerId: string) => {
    try {
      const res = await fetch('/api/admin/speakers/ref-text', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speakerId, refText: speakerRefText }),
      })
      if (res.ok) {
        toast.success('Texto de referência salvo!')
        setEditingSpeakerId(null)
        const speakersRes = await fetch('/api/admin/speakers')
        if (speakersRes.ok) {
          const sp = await speakersRes.json()
          setSpeakersData(sp || [])
        }
      }
    } catch (err) {
      toast.error('Erro ao salvar')
    }
  }

  // Converter VARIACAO em Locutor Oficial (clone_fast) — 1 clique
  const handleToggleSpeaker = async (variation: VoiceVariation, voiceName: string) => {
    const speakerFileKey = slugify(voiceName) + '_' + slugify(variation.label) + '.wav'
    const isCurrentlySpeaker = speakerVarIds.has(speakerFileKey)
    const action = isCurrentlySpeaker ? false : true

    setConvertingSpeakerId(variation.id)
    try {
      const res = await fetch('/api/admin/speakers/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variationId: variation.id, enable: action }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erro ao converter locutor')
        return
      }

      // Toggle local state by speakerFile
      setSpeakerVarIds(prev => {
        const next = new Set(prev)
        if (action && data.speakerFile) {
          next.add(data.speakerFile)
        }
        return next
      })

      toast.success(data.message || (action ? 'Locutor Oficial ativado!' : 'Locutor Oficial removido'))

      // Refetch speakers to keep UI in sync
      if (!action) {
        const speakersRes = await fetch('/api/admin/speakers')
        if (speakersRes.ok) {
          const sp = await speakersRes.json()
          setSpeakersData(sp || [])
          setSpeakerVarIds(new Set((sp || []).map((s: { speakerFile: string }) => s.speakerFile)))
        }
      }
    } catch {
      toast.error('Erro de comunicacao com o servidor')
    } finally {
      setConvertingSpeakerId(null)
    }
  }
  const handleToggleVoice = async (voice: Voice) => {
    try {
      await fetch(`/api/voices/${voice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !voice.active }),
      })
      loadData()
    } catch {
      toast.error('Erro ao atualizar')
    }
  }

  // --- VARIATION CRUD ---
  // Select voice file → decode, show waveform, auto-detect voice range
  const handleSelectVoiceFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      toast.info('Analisando áudio...')
      const actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const ab = await file.arrayBuffer()
      const audioBuf = await actx.decodeAudioData(ab)
      await actx.close()
      const range = detectVoiceRange(audioBuf)
      // Detectar silencios para mostrar tracinhos no waveform
      const silRegions = detectSilenceRegions(audioBuf)
      setSilenceCount(silRegions.length)
      setVoiceTrimState({ buffer: audioBuf, duration: audioBuf.duration, rangeStart: range.start, rangeEnd: range.end, fileName: file.name, silenceRegions: silRegions })
      setPendingVoiceFile(null) // reset applied trim
      toast.success(`Áudio: ${audioBuf.duration.toFixed(1)}s — voz detectada: ${(range.end - range.start).toFixed(1)}s`)
    } catch (err) {
      toast.error('Erro ao processar áudio. Tente outro formato.')
      console.error('[VoiceTrim]', err)
    }
  }

  // Draw waveform whenever trim state changes
  // Mostra tracinhos de silencio em TODO o audio (dentro e fora da selecao)
  useEffect(() => {
    if (voiceTrimState && waveCanvasRef.current) {
      const canvas = waveCanvasRef.current
      const rect = canvas.getBoundingClientRect()
      canvas.width = rect.width * 2
      canvas.height = rect.height * 2
      // Contar silencios que intersectam com a selecao (para o botao)
      const intersecting = (voiceTrimState.silenceRegions || []).filter(
        sil => sil.start < voiceTrimState.rangeEnd && sil.end > voiceTrimState.rangeStart
      )
      // Se tem silencio dentro da selecao, mostrar esse numero; senao mostrar total
      const total = (voiceTrimState.silenceRegions || []).length
      setSilenceCount(intersecting.length > 0 ? intersecting.length : total)
      // Desenhar TODOS os tracinhos no audio inteiro
      drawVoiceWaveform(canvas, voiceTrimState.buffer, voiceTrimState.rangeStart, voiceTrimState.rangeEnd, voiceTrimState.silenceRegions)
    }
  }, [voiceTrimState])

  // Apply trim → so cria o WAV blob localmente, sem upload nenhum
  // O upload e update so acontecem ao clicar "Salvar Alteracoes"
  const handleApplyVoiceTrim = () => {
    if (!voiceTrimState) return
    const { buffer, rangeStart, rangeEnd, fileName } = voiceTrimState

    // Validar range
    if (rangeEnd - rangeStart < 0.1) {
      toast.error('Intervalo de corte muito curto. Ajuste os controles.')
      return
    }

    const trimmed = extractAudioRange(buffer, rangeStart, rangeEnd)

    // Verificar se o buffer cortado tem audio real (nao silencio)
    const sampleData = trimmed.getChannelData(0)
    let maxAmp = 0
    for (let i = 0; i < sampleData.length; i++) {
      const abs = Math.abs(sampleData[i])
      if (abs > maxAmp) maxAmp = abs
    }
    if (maxAmp < 0.001) {
      toast.error('O intervalo selecionado está em silêncio! Ajuste os controles para selecionar uma parte com voz.')
      console.warn('[handleApplyVoiceTrim] Bloco cortado está em silêncio. maxAmp:', maxAmp, 'range:', rangeStart, '-', rangeEnd)
      return
    }

    console.log(`[handleApplyVoiceTrim] Trim OK: ${rangeStart.toFixed(2)}s-${rangeEnd.toFixed(2)}s, ${trimmed.length} samples, ${trimmed.numberOfChannels}ch, ${trimmed.sampleRate}Hz, maxAmp=${maxAmp.toFixed(4)}`)

    const wavBlob = audioBufferToWav(trimmed)
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const dur = (rangeEnd - rangeStart).toFixed(1)

    console.log(`[handleApplyVoiceTrim] WAV blob: ${(wavBlob.size / 1024).toFixed(0)}KB, esperado header+data = ${44 + trimmed.length * trimmed.numberOfChannels * 2} bytes`)

    // Validar tamanho do blob
    const expectedSize = 44 + trimmed.length * trimmed.numberOfChannels * 2
    if (wavBlob.size !== expectedSize) {
      toast.error(`Erro interno: tamanho do blob inconsistente (${wavBlob.size} vs ${expectedSize}). Tente novamente.`)
      console.error('[handleApplyVoiceTrim] TAMANHO INCONSISTENTE!', wavBlob.size, 'vs', expectedSize)
      return
    }

    // Guardar blob para enviar ao salvar (tanto para variacao nova quanto editando)
    setPendingVoiceFile({ blob: wavBlob, name: `${baseName}.wav`, info: `${dur}s de ${buffer.duration.toFixed(1)}s — ${(wavBlob.size / 1024).toFixed(0)}KB WAV` })
    setAudioAlreadyUpdated(false)
    toast.success(`Corte aplicado: ${dur}s — clique em Salvar para enviar`)
  }

  // Preview trimmed audio (toggle play/pause) — toca direto do AudioBuffer, sem blob
  const handlePreviewVoiceTrim = async () => {
    if (!voiceTrimState) return

    // Toggle: se ja esta tocando, para
    if (voicePreviewing && voicePreviewSrcRef.current) {
      try {
        voicePreviewSrcRef.current.stop()
      } catch { /* ja parou */ }
      voicePreviewSrcRef.current = null
      if (voicePreviewCtxRef.current) { voicePreviewCtxRef.current.close(); voicePreviewCtxRef.current = null }
      setVoicePreviewing(false)
      return
    }

    const { buffer, rangeStart, rangeEnd } = voiceTrimState
    const trimmed = extractAudioRange(buffer, rangeStart, rangeEnd)

    if (trimmed.length === 0) {
      toast.error('Intervalo de corte vazio. Ajuste os controles.')
      return
    }

    // Verificar se o buffer tem audio real (nao e silencio total)
    const sampleData = trimmed.getChannelData(0)
    let maxAmp = 0
    for (let i = 0; i < sampleData.length; i++) {
      const abs = Math.abs(sampleData[i])
      if (abs > maxAmp) maxAmp = abs
    }
    if (maxAmp < 0.001) {
      toast.error('O intervalo selecionado esta em silencio. Ajuste os controles.')
      return
    }

    try {
      const ctx = new AudioContext()

      // Se o AudioContext estiver suspenso (autoplay policy), resumir
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }

      const source = ctx.createBufferSource()
      source.buffer = trimmed
      source.connect(ctx.destination)
      source.onended = () => {
        setVoicePreviewing(false)
        try { ctx.close() } catch { /* ja fechado */ }
        voicePreviewCtxRef.current = null
        voicePreviewSrcRef.current = null
      }
      source.start(0)
      voicePreviewCtxRef.current = ctx
      voicePreviewSrcRef.current = source
      setVoicePreviewing(true)
    } catch (err) {
      console.error('[VoiceTrim] Preview error:', err)
      toast.error('Erro ao reproduzir preview do corte')
      setVoicePreviewing(false)
    }
  }

  // --- LOAD EXISTING VARIATION AUDIO INTO TRIMMER ---
  // Carrega audio de referencia existente quando clica Editar, permitindo corte direto
  const handleEditVariationWithAudio = async (variation: VoiceVariation) => {
    const audioUrl = variation.refAudioServerUrl || variation.refAudioPath
    console.log('[EditVoiceAudio] Iniciando. variation.id:', variation.id, 'audioUrl:', audioUrl, 'serverUrl:', variation.refAudioServerUrl, 'path:', variation.refAudioPath)
    if (!audioUrl) {
      toast.error('Esta variação não possui áudio para editar')
      return
    }

    // Abrir dialog primeiro com dados basicos
    setEditingVariationId(variation.id)
    setAddingVariationTo(null)
    setVariationForm({
      label: variation.label,
      emoji: variation.emoji,
      refAudioPath: '',
      serverUrl: '',
      filename: '',
      refAudioName: variation.refAudioName,
      refText: variation.refText,
      instruct: variation.instruct || 'none',
    })
    setPendingVoiceFile(null)
    setVoiceTrimState(null)
    setAudioAlreadyUpdated(false)
    setVariationDialogOpen(true)

    // Carregar audio via proxy para evitar CORS
    setLoadingExistingAudio(true)
    try {
      const proxyUrl = toProxyAudioUrl(audioUrl)
      const res = await fetch(proxyUrl)

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const arrayBuffer = await res.arrayBuffer()
      console.log(`[EditVoiceAudio] Proxy OK: ${arrayBuffer.byteLength} bytes recebidos`)

      const actx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      const audioBuf = await actx.decodeAudioData(arrayBuffer)

      // Verificar amplitude maxima do audio carregado
      const checkData = audioBuf.getChannelData(0)
      let loadedMaxAmp = 0
      for (let i = 0; i < checkData.length; i++) {
        const a = Math.abs(checkData[i])
        if (a > loadedMaxAmp) loadedMaxAmp = a
      }
      console.log(`[EditVoiceAudio] Decoded: ${audioBuf.duration.toFixed(2)}s, ${audioBuf.numberOfChannels}ch, ${audioBuf.sampleRate}Hz, ${audioBuf.length} samples, maxAmp=${loadedMaxAmp.toFixed(4)}`)

      // NAO fechar o AudioContext — manter aberto para que o AudioBuffer funcione corretamente
      // em todos os browsers. Sera fechado quando o dialog fechar.

      // Detectar automaticamente o range de voz
      const range = detectVoiceRange(audioBuf)
      // Detectar silencios para tracinhos no waveform
      const silRegions = detectSilenceRegions(audioBuf)
      setSilenceCount(silRegions.length)
      setVoiceTrimState({
        buffer: audioBuf,
        duration: audioBuf.duration,
        rangeStart: range.start,
        rangeEnd: range.end,
        fileName: variation.refAudioName || 'audio_existente.wav',
        silenceRegions: silRegions,
      })
      toast.success(`Áudio carregado: ${audioBuf.duration.toFixed(1)}s — voz detectada: ${(range.end - range.start).toFixed(1)}s`)
    } catch (err) {
      console.error('[EditVoiceAudio] Erro ao carregar audio:', err)
      toast.error('Erro ao carregar áudio existente. Tente novamente.')
    } finally {
      setLoadingExistingAudio(false)
    }
  }

  // Reset trim to full audio
  const handleResetVoiceTrim = () => {
    if (!voiceTrimState) return
    setVoiceTrimState(prev => prev ? { ...prev, rangeStart: 0, rangeEnd: prev.duration } : null)
    setPendingVoiceFile(null)
  }

  // Auto-detect voice range again
  const handleAutoVoiceTrim = () => {
    if (!voiceTrimState) return
    const range = detectVoiceRange(voiceTrimState.buffer)
    setVoiceTrimState(prev => prev ? { ...prev, rangeStart: range.start, rangeEnd: range.end } : null)
    setPendingVoiceFile(null)
  }

  // Remove silencios marcados — junta o audio com micro-gaps, atualiza waveform
  const handleRemoveSilence = () => {
    if (!voiceTrimState || !voiceTrimState.silenceRegions || voiceTrimState.silenceRegions.length === 0) {
      toast.info('Nenhum silêncio detectado para remover')
      return
    }

    try {
      const { buffer, silenceRegions, fileName } = voiceTrimState

      // Extrair faixa selecionada se o usuario ajustou os sliders
      let workBuffer = buffer
      if (voiceTrimState.rangeEnd - voiceTrimState.rangeStart < buffer.duration - 0.1) {
        workBuffer = extractAudioRange(buffer, voiceTrimState.rangeStart, voiceTrimState.rangeEnd)
      }

      // Re-detectar silencios no buffer de trabalho (posicao relativa)
      const workSilRegions = detectSilenceRegions(workBuffer)
      if (workSilRegions.length === 0) {
        toast.info('Nenhum silêncio significativo encontrado nesta seleção')
        return
      }

      // Remover silencios
      const cleaned = removeSilenceRegions(workBuffer, workSilRegions)

      if (cleaned.duration < 0.1) {
        toast.error('Áudio ficou muito curto. Operação cancelada.')
        return
      }

      // Verificar amplitude
      const checkData = cleaned.getChannelData(0)
      let maxAmp = 0
      for (let i = 0; i < checkData.length; i++) { if (Math.abs(checkData[i]) > maxAmp) maxAmp = Math.abs(checkData[i]) }
      if (maxAmp < 0.001) {
        toast.error('Resultado está em silêncio. Operação cancelada.')
        return
      }

      const timeSaved = (workBuffer.duration - cleaned.duration).toFixed(1)

      // Atualizar o trim state com o buffer limpo (sem tracinhos, pronto para editar)
      setVoiceTrimState({
        buffer: cleaned,
        duration: cleaned.duration,
        rangeStart: 0,
        rangeEnd: cleaned.duration,
        fileName: fileName,
        silenceRegions: [], // sem silencios para marcar
      })
      setSilenceCount(0)
      setPendingVoiceFile(null)
      setAudioAlreadyUpdated(false)

      toast.success(`Silêncios removidos: ${workBuffer.duration.toFixed(1)}s → ${cleaned.duration.toFixed(1)}s (${timeSaved}s) — pronto para ouvir/salvar`)
    } catch (err) {
      console.error('[RemoveSilence] Erro:', err)
      toast.error('Erro ao remover silêncios')
    }
  }

  const handleSaveVariation = async () => {
    if (!variationForm.label.trim()) {
      toast.error('Nome da variação é obrigatório')
      return
    }

    const instructValue = variationForm.instruct === 'none' ? '' : variationForm.instruct
    let pendingVoiceFileData: { serverUrl: string; filename: string; refAudioName: string; refAudioPath: string } | null = null

    console.log('[handleSaveVariation] Iniciando. editingVariationId:', editingVariationId, 'pendingVoiceFile:', !!pendingVoiceFile, 'label:', variationForm.label)

    try {
      // Upload pending voice file if there is one (corte aplicado)
      if (pendingVoiceFile) {
        setUploadingRef(true)
        toast.info('Enviando áudio cortado...')

        console.log(`[handleSaveVariation] Enviando blob: ${pendingVoiceFile.name}, ${(pendingVoiceFile.blob.size / 1024).toFixed(0)}KB`)

        const formData = new FormData()
        formData.append('file', pendingVoiceFile.blob, pendingVoiceFile.name)

        const res = await fetch('/api/upload-voice', {
          method: 'POST',
          body: formData,
        })

        let data: Record<string, unknown>
        try {
          data = await res.json()
        } catch {
          toast.error('Erro no servidor de upload. Tente novamente.')
          setUploadingRef(false)
          return
        }
        console.log('[handleSaveVariation] Upload response:', JSON.stringify(data))

        if (data.serverUrl || data.path) {
          // Atualizar variationForm com as URLs do upload
          // So incluir refAudioPath se veio preenchido (HF pode falhar)
          const uploadedPath = (data.path && typeof data.path === 'string' && data.path.length > 0) ? data.path : ''
          const uploadedServerUrl = data.serverUrl || ''
          const uploadedFilename = data.filename || ''
          const uploadedName = data.name || pendingVoiceFile.name

          console.log(`[handleSaveVariation] Upload OK. serverUrl: ${uploadedServerUrl ? 'SIM' : 'NAO'}, filename: ${uploadedFilename}, path: ${uploadedPath ? 'SIM' : 'NAO'}`)

          // Validacao critica: se o PHP upload falhou (sem serverUrl), o HF path sozinho nao serve
          if (!uploadedServerUrl) {
            toast.error('Upload para o servidor falhou. O áudio não será atualizado. Tente novamente.')
            setUploadingRef(false)
            return
          }

          setVariationForm(prev => ({
            ...prev,
            refAudioPath: uploadedPath,
            serverUrl: uploadedServerUrl,
            filename: uploadedFilename,
            refAudioName: uploadedName,
          }))

          // Atualizar o pendingVoiceFile com os dados do upload
          // para que o PUT abaixo use os valores corretos
          pendingVoiceFileData = {
            serverUrl: uploadedServerUrl,
            filename: uploadedFilename,
            refAudioName: uploadedName,
            refAudioPath: uploadedPath,
          }
        } else {
          toast.error(data.error || 'Falha no upload do áudio')
          setUploadingRef(false)
          return
        }
        toast.success('Áudio enviado!')
        setUploadingRef(false)
      }

      if (editingVariationId) {
        // UPDATE existing variation
        const updateBody: Record<string, unknown> = {
          label: variationForm.label.trim(),
          emoji: variationForm.emoji,
          refText: variationForm.refText,
          instruct: instructValue,
        }
        // So atualizar campos de audio se um novo arquivo foi carregado
        // (usuario clicou em Aplicar corte antes)
        if (pendingVoiceFileData) {
          updateBody.refAudioServerUrl = pendingVoiceFileData.serverUrl
          updateBody.refAudioFilename = pendingVoiceFileData.filename
          updateBody.refAudioName = pendingVoiceFileData.refAudioName
          // NUNCA enviar refAudioPath vazio — isso apaga o path no banco
          if (pendingVoiceFileData.refAudioPath && pendingVoiceFileData.refAudioPath.length > 0) {
            updateBody.refAudioPath = pendingVoiceFileData.refAudioPath
          }
        }
        console.log('[handleSaveVariation] PUT body:', JSON.stringify(updateBody))
        const putRes = await fetch(`/api/variations/${editingVariationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        })
        const putData = await putRes.json()
        console.log('[handleSaveVariation] PUT response:', putRes.ok, JSON.stringify(putData))
        toast.success('Variação atualizada!')
      } else {
        // CREATE new variation
        // Usar pendingVoiceFileData (variavel local) em vez de variationForm.serverUrl
        // porque setVariationForm e assincrono e ainda nao refletiu o upload
        const hasAudio = variationForm.serverUrl || variationForm.refAudioPath || pendingVoiceFileData
        if (!hasAudio) {
          toast.error('Áudio de referência é obrigatório para nova variação')
          return
        }
        if (!addingVariationTo) return

        // Construir body explicitamente para nao depender do estado async do React
        const createBody: Record<string, unknown> = {
          label: variationForm.label.trim(),
          emoji: variationForm.emoji,
          refText: variationForm.refText,
          instruct: instructValue,
          refAudioPath: variationForm.refAudioPath,
          serverUrl: variationForm.serverUrl,
          filename: variationForm.filename,
          refAudioName: variationForm.refAudioName,
        }
        // Sobrescrever com dados do upload se existirem (pendingVoiceFileData e mais confiavel)
        if (pendingVoiceFileData) {
          createBody.refAudioPath = pendingVoiceFileData.refAudioPath
          createBody.serverUrl = pendingVoiceFileData.serverUrl
          createBody.filename = pendingVoiceFileData.filename
          createBody.refAudioName = pendingVoiceFileData.refAudioName
        }

        await fetch(`/api/voices/${addingVariationTo}/variations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody),
        })
        toast.success('Variação adicionada!')
      }

      setVariationDialogOpen(false)
      setEditingVariationId(null)
      setAddingVariationTo(null)
      setVariationForm({ label: '', emoji: '', refAudioPath: '', serverUrl: '', filename: '', refAudioName: '', refText: '', instruct: 'none' })
      setPendingVoiceFile(null)
      setVoiceTrimState(null)
      setAudioAlreadyUpdated(false)
      if (voicePreviewSrcRef.current) { try { voicePreviewSrcRef.current.stop() } catch { /* */ } voicePreviewSrcRef.current = null } if (voicePreviewCtxRef.current) { voicePreviewCtxRef.current.close(); voicePreviewCtxRef.current = null }
      setVoicePreviewing(false)
      loadData()
    } catch {
      toast.error('Erro ao salvar variação')
    } finally {
      setUploadingRef(false)
    }
  }

  const handleDeleteVariation = async (id: string) => {
    if (!confirm('Excluir esta variação?')) return
    try {
      await fetch(`/api/variations/${id}`, { method: 'DELETE' })
      toast.success('Variação excluída')
      loadData()
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const handleToggleVariation = async (v: VoiceVariation) => {
    try {
      await fetch(`/api/variations/${v.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !v.active }),
      })
      loadData()
    } catch {
      toast.error('Erro ao atualizar')
    }
  }

  // Quick audio-only update for a variation (kept as-is — convenience feature for inline updates)
  const handleQuickUploadAudio = async (variationId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload-voice', {
        method: 'POST',
        body: formData,
      })

      let data: Record<string, unknown>
      try {
        data = await res.json()
      } catch {
        toast.error('Erro no servidor de upload. Tente novamente.')
        return
      }
      if (data.serverUrl || data.path) {
        await fetch(`/api/variations/${variationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refAudioPath: data.path || '',
            refAudioServerUrl: data.serverUrl || '',
            refAudioFilename: data.filename || '',
            refAudioName: data.name || file.name,
          }),
        })
        toast.success('Áudio atualizado!')
        loadData()
      } else {
        toast.error(data.error || 'Falha no upload')
      }
    } catch {
      toast.error('Erro no upload do áudio')
    }
  }

  // --- TRACK CRUD ---
  // Select track file - processa no navegador (trim 80s + compressao se necessario)
  const handleSelectTrackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm']
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!validExts.includes(ext)) {
        toast.error('Formato não suportado. Use MP3, WAV, OGG, M4A, FLAC ou WEBM.')
        return
      }

      const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
      toast.info(`Processando: ${file.name} (${sizeMB}MB)...`)

      const result = await processTrackFile(file)
      setPendingTrackFile({ blob: result.blob, name: result.name })
      toast.success(`Pronto: ${result.info}`)
    } catch (err) {
      console.error('Error preparing file:', err)
      toast.error('Erro ao processar o arquivo')
      setPendingTrackFile(null)
    }
  }

  const handleSaveTrack = async () => {
    if (!trackForm.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    try {
      let audioUrl = ''
      let audioFilename = ''

      if (pendingTrackFile) {
        setUploadingTrack(true)
        toast.info('Enviando arquivo...')

        const formData = new FormData()
        formData.append('file', pendingTrackFile.blob, pendingTrackFile.name)

        const uploadRes = await fetch('/api/upload-track', {
          method: 'POST',
          body: formData,
        })

        const contentType = uploadRes.headers.get('content-type') || ''
        if (contentType.includes('application/json')) {
          const uploadData = await uploadRes.json()
          if (uploadRes.ok && (uploadData.path || uploadData.url)) {
            audioUrl = uploadData.path || uploadData.url
            audioFilename = uploadData.filename || ''
          } else {
            setUploadingTrack(false)
            toast.error(uploadData.error || 'Erro no upload do arquivo')
            return
          }
        } else {
          setUploadingTrack(false)
          toast.error(`Erro no servidor (${uploadRes.status}). Tente novamente.`)
          return
        }

        setTrackFilePath(audioUrl)
        toast.success('Arquivo enviado!')
        setUploadingTrack(false)
      }

      if (!audioUrl && !editingTrackId) {
        toast.error('Arquivo de áudio é obrigatório')
        return
      }

      if (editingTrackId) {
        // UPDATE existing track
        const updateBody: Record<string, unknown> = {
          name: trackForm.name.trim(),
          description: trackForm.description,
          emoji: trackForm.emoji,
          category: trackForm.category,
        }
        // Only update audio if a new one was uploaded
        if (audioUrl) {
          updateBody.audioPath = audioUrl
        }
        await fetch(`/api/tracks/${editingTrackId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        })
        toast.success('Trilha atualizada!')
      } else {
        // CREATE new track
        await fetch('/api/tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...trackForm,
            audioPath: audioUrl,
            duration: 0,
          }),
        })
        toast.success('Trilha criada!')
      }

      setTrackDialogOpen(false)
      setEditingTrackId(null)
      setTrackForm({ name: '', description: '', emoji: '', category: '' })
      setTrackFilePath('')
      setTrackDuration(0)
      setPendingTrackFile(null)
      loadData()
    } catch (err) {
      console.error('Track save error:', err)
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar trilha')
    } finally {
      setUploadingTrack(false)
    }
  }

  const handleDeleteTrack = async (id: string) => {
    if (!confirm('Excluir esta trilha?')) return
    try {
      await fetch(`/api/tracks/${id}`, { method: 'DELETE' })
      toast.success('Trilha excluída')
      loadData()
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const handleToggleTrack = async (track: Track) => {
    try {
      await fetch(`/api/tracks/${track.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !track.active }),
      })
      loadData()
    } catch {
      toast.error('Erro ao atualizar')
    }
  }

  // --- BATCH UPLOAD (sequential with retry + duplicate check) ---
  const handleBatchUpload = async () => {
    if (batchFiles.length === 0) {
      toast.error('Selecione pelo menos um arquivo')
      return
    }
    if (!batchUploadCategory.trim()) {
      toast.error('Informe a categoria para os arquivos')
      return
    }

    setBatchUploading(true)
    let created = 0
    let skipped = 0
    let failed = 0
    const errorMessages: string[] = []
    const skippedMessages: string[] = []
    const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm']

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    // Build a set of existing track names in this category for fast lookup (DB names have no extension)
    const existingNames = new Set(
      tracks
        .filter(t => t.category === batchUploadCategory)
        .map(t => t.name.toLowerCase())
    )
    // Within-batch dedup: use FULL filename (with extension) so .mp3 and .wav are different
    const batchFileNames = new Set<string>()

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i]
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const trackName = file.name.replace(/\.[^.]+$/, '')

      // Validate extension
      if (!validExts.includes(ext)) {
        errorMessages.push(`${file.name}: formato não suportado`)
        failed++
        continue
      }

      // Check duplicate within batch: full filename (with extension)
      if (batchFileNames.has(file.name.toLowerCase())) {
        skippedMessages.push(file.name)
        skipped++
        console.log(`[BatchUpload] Pulado (duplicata no lote): ${file.name}`)
        continue
      }
      batchFileNames.add(file.name.toLowerCase())

      // Check duplicate against DB: track name only (no extension)
      if (existingNames.has(trackName.toLowerCase())) {
        skippedMessages.push(file.name)
        skipped++
        console.log(`[BatchUpload] Pulado (já existe no BD): ${file.name}`)
        continue
      }

      setBatchProgress(`${i + 1}/${batchFiles.length} — processando ${file.name}...`)

      // Process file: trim to 80s + compress to MP3 (keeps under 3.5MB)
      let processedBlob: Blob
      let processedName: string
      try {
        const result = await processTrackFile(file)
        processedBlob = result.blob
        processedName = result.name
        console.log(`[BatchUpload] Processado: ${file.name} → ${result.info}`)
      } catch (err) {
        console.error(`[BatchUpload] Erro ao processar ${file.name}:`, err)
        errorMessages.push(`${file.name}: erro ao processar áudio`)
        failed++
        continue
      }

      setBatchProgress(`${i + 1}/${batchFiles.length} — enviando ${processedName}...`)

      // Try up to 2 retries
      let success = false
      for (let attempt = 1; attempt <= 2 && !success; attempt++) {
        try {
          // Upload processed file to server
          const formData = new FormData()
          formData.append('file', processedBlob, processedName)
          const uploadRes = await fetch('/api/upload-track', { method: 'POST', body: formData })

          // Handle non-JSON responses (e.g. Vercel 413 "Request Entity Too Large")
          let uploadData: Record<string, unknown>
          const contentType = uploadRes.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            uploadData = await uploadRes.json()
          } else {
            // Server returned HTML error page
            const textBody = await uploadRes.text()
            const shortMsg = textBody.substring(0, 120).replace(/<[^>]*>/g, '').trim()
            if (attempt === 2) errorMessages.push(`${file.name}: ${shortMsg || `erro HTTP ${uploadRes.status}`}`)
            await sleep(3000)
            continue
          }

          if (!uploadRes.ok || (!uploadData.path && !uploadData.url)) {
            if (attempt === 2) errorMessages.push(`${file.name}: ${uploadData.error || 'falha no upload'}`)
            await sleep(2000)
            continue
          }

          // Create track record in DB
          const createRes = await fetch('/api/tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: trackName,
              description: '',
              emoji: '',
              category: batchUploadCategory,
              audioPath: uploadData.path || uploadData.url,
              duration: 0,
            }),
          })

          if (!createRes.ok) {
            if (attempt === 2) errorMessages.push(`${file.name}: erro ao criar registro`)
            await sleep(2000)
            continue
          }

          created++
          existingNames.add(trackName.toLowerCase()) // Mark as existing to catch duplicates within batch
          success = true
        } catch (err) {
          if (attempt === 2) {
            const msg = (err as Error)?.message || 'erro de conexão'
            // Clean up common unhelpful error messages
            errorMessages.push(`${file.name}: ${msg.replace(/Unexpected token.*/i, 'resposta inválida do servidor')}`)
          }
          await sleep(3000)
        }
      }

      if (!success) failed++
      if (i < batchFiles.length - 1) await sleep(1000)
    }

    // Show results
    if (created > 0) toast.success(`${created} trilha(s) criada(s)!`)
    if (skipped > 0) toast.warning(`${skipped} trilha(s) ignorada(s) — já existem:\n${skippedMessages.slice(0, 5).join('\n')}${skippedMessages.length > 5 ? `\n...e mais ${skippedMessages.length - 5}` : ''}`, { duration: 10000 })
    if (failed > 0) toast.error(`${failed} falha(s):\n${errorMessages.slice(0, 5).join('\n')}${errorMessages.length > 5 ? `\n...e mais ${errorMessages.length - 5}` : ''}`, { duration: 10000 })
    if (created > 0 || skipped > 0) {
      setBatchUploadOpen(false)
      setBatchFiles([])
      setBatchUploadCategory('')
      setSelectedTrackCategory(batchUploadCategory)
      loadData()
    }

    setBatchUploading(false)
    setBatchProgress('')
  }

  // --- BATCH VOICE UPLOAD (select voice + multiple files → auto-create variations) ---
  const handleVoiceBatchUpload = async () => {
    if (voiceBatchFiles.length === 0) {
      toast.error('Selecione pelo menos um arquivo')
      return
    }
    if (!voiceBatchVoiceId) {
      toast.error('Selecione uma voz')
      return
    }

    const voice = voices.find(v => v.id === voiceBatchVoiceId)
    if (!voice) {
      toast.error('Voz não encontrada')
      return
    }

    // Build set of existing variation labels (case-insensitive) to skip duplicates
    const existingLabels = new Set(voice.variations.map(v => v.label.toLowerCase()))
    const batchFileNames = new Set<string>()

    setVoiceBatchUploading(true)
    let created = 0
    let skipped = 0
    let failed = 0
    const errorMessages: string[] = []
    const skippedMessages: string[] = []
    const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm']
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    for (let i = 0; i < voiceBatchFiles.length; i++) {
      const file = voiceBatchFiles[i]
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const label = file.name.replace(/\.[^.]+$/, '')

      // Validate extension
      if (!validExts.includes(ext)) {
        errorMessages.push(`${file.name}: formato não suportado`)
        failed++
        continue
      }

      // Check duplicate within batch: full filename
      if (batchFileNames.has(file.name.toLowerCase())) {
        skippedMessages.push(file.name)
        skipped++
        continue
      }
      batchFileNames.add(file.name.toLowerCase())

      // Check duplicate against existing variations: label (no extension)
      if (existingLabels.has(label.toLowerCase())) {
        skippedMessages.push(file.name)
        skipped++
        console.log(`[VoiceBatch] Pulado (variação já existe): ${file.name}`)
        continue
      }

      setVoiceBatchProgress(`${i + 1}/${voiceBatchFiles.length} — ${file.name}`)

      let success = false
      for (let attempt = 1; attempt <= 2 && !success; attempt++) {
        try {
          // Upload file to voice server
          const formData = new FormData()
          formData.append('file', file)
          const uploadRes = await fetch('/api/upload-voice', { method: 'POST', body: formData })

          let uploadData: Record<string, unknown>
          const contentType = uploadRes.headers.get('content-type') || ''
          if (contentType.includes('application/json')) {
            uploadData = await uploadRes.json()
          } else {
            const textBody = await uploadRes.text()
            const shortMsg = textBody.substring(0, 120).replace(/<[^>]*>/g, '').trim()
            if (attempt === 2) errorMessages.push(`${file.name}: ${shortMsg || `erro HTTP ${uploadRes.status}`}`)
            await sleep(3000)
            continue
          }

          if (!uploadRes.ok || (!uploadData.serverUrl && !uploadData.url)) {
            if (attempt === 2) errorMessages.push(`${file.name}: ${uploadData.error || 'falha no upload'}`)
            await sleep(2000)
            continue
          }

          // Create variation
          const createRes = await fetch(`/api/voices/${voiceBatchVoiceId}/variations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              label,
              emoji: '',
              refAudioPath: uploadData.path || '',
              serverUrl: uploadData.serverUrl || uploadData.url || '',
              filename: uploadData.filename || '',
              refAudioName: file.name,
              refText: '',
              instruct: '',
            }),
          })

          if (!createRes.ok) {
            if (attempt === 2) errorMessages.push(`${file.name}: erro ao criar variação`)
            await sleep(2000)
            continue
          }

          created++
          existingLabels.add(label.toLowerCase())
          success = true
        } catch (err) {
          if (attempt === 2) {
            const msg = (err as Error)?.message || 'erro de conexão'
            errorMessages.push(`${file.name}: ${msg.replace(/Unexpected token.*/i, 'resposta inválida do servidor')}`)
          }
          await sleep(3000)
        }
      }

      if (!success) failed++
      if (i < voiceBatchFiles.length - 1) await sleep(1000)
    }

    // Show results
    if (created > 0) toast.success(`${created} variação(ões) criada(s) em "${voice.name}"!`)
    if (skipped > 0) toast.warning(`${skipped} arquivo(s) ignorado(s) — duplicata:\n${skippedMessages.slice(0, 5).join('\n')}${skippedMessages.length > 5 ? `\n...e mais ${skippedMessages.length - 5}` : ''}`, { duration: 10000 })
    if (failed > 0) toast.error(`${failed} falha(s):\n${errorMessages.slice(0, 5).join('\n')}${errorMessages.length > 5 ? `\n...e mais ${errorMessages.length - 5}` : ''}`, { duration: 10000 })

    setVoiceBatchUploading(false)
    setVoiceBatchProgress('')
    if (created > 0 || skipped > 0) {
      setVoiceBatchOpen(false)
      setVoiceBatchFiles([])
      setVoiceBatchVoiceId('')
      loadData()
    }
  }

  // --- SETTINGS ---
  const handleToggleVoiceUpload = async () => {
    const newValue = !enableVoiceUpload
    try {
      await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'enableVoiceUpload', value: String(newValue) }),
      })
      setEnableVoiceUpload(newValue)
      toast.success(newValue ? 'Upload de voz ativado no painel do cliente' : 'Upload de voz desativado')
    } catch {
      toast.error('Erro ao salvar configuração')
    }
  }

  // --- CATEGORY MANAGEMENT ---
  const handleSaveManagedCategories = async (type: 'tracks' | 'voices', categories: ManagedCategory[]) => {
    setSavingCategories(true)
    try {
      const res = await fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [type]: categories }),
      })
      if (res.ok) {
        if (type === 'tracks') setManagedTrackCategories(categories)
        else setManagedVoiceCategories(categories)
        toast.success('Categorias salvas!')
        loadData() // refresh category counts
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao salvar categorias')
      }
    } catch {
      toast.error('Erro de conexão ao salvar categorias')
    } finally {
      setSavingCategories(false)
    }
  }

  const addManagedCategory = (type: 'tracks' | 'voices') => {
    if (!newCatName.trim()) {
      toast.error('Nome da categoria é obrigatório')
      return
    }
    const categories = type === 'tracks' ? managedTrackCategories : managedVoiceCategories
    const existing = categories.find(c => c.name.toUpperCase() === newCatName.trim().toUpperCase())
    if (existing) {
      toast.error(`Categoria "${existing.name}" já existe`)
      return
    }
    const newCat: ManagedCategory = { name: newCatName.trim(), emoji: newCatEmoji || '📁' }
    const updated = [...categories, newCat]
    handleSaveManagedCategories(type, updated)
    setNewCatName('')
    setNewCatEmoji('')
  }

  const removeManagedCategory = (type: 'tracks' | 'voices', index: number) => {
    const categories = type === 'tracks' ? managedTrackCategories : managedVoiceCategories
    const catName = categories[index]?.name
    const catCount = (type === 'tracks' ? trackCategories : voiceCategories).find(c => c.name === catName)?.count || 0

    if (catCount > 0) {
      if (!confirm(`A categoria "${catName}" tem ${catCount} item(ns). Excluir mesmo assim?\n\nOs itens NÃO serão excluídos, apenas perderão a categoria.`)) {
        return
      }
      // Move items to "no category" by updating their category to empty string
      const model = type === 'tracks' ? 'track' : 'voice'
      fetch(`/api/admin/${model === 'track' ? 'tracks' : 'voices'}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryName: catName, clearCategory: true }),
      }).catch(() => {})
    }

    const updated = categories.filter((_, i) => i !== index)
    handleSaveManagedCategories(type, updated)
  }

  const startEditCategory = (type: 'tracks' | 'voices', index: number) => {
    const categories = type === 'tracks' ? managedTrackCategories : managedVoiceCategories
    const cat = categories[index]
    if (!cat) return
    setEditingCatIndex({ type, index })
    setEditingCatName(cat.name)
    setEditingCatEmoji(cat.emoji || '')
  }

  const saveEditCategory = () => {
    if (!editingCatIndex || !editingCatName.trim()) {
      toast.error('Nome da categoria é obrigatório')
      return
    }
    const { type, index } = editingCatIndex
    const categories = type === 'tracks' ? managedTrackCategories : managedVoiceCategories
    // Check duplicate (excluding current)
    const duplicate = categories.find((c, i) => i !== index && c.name.toUpperCase() === editingCatName.trim().toUpperCase())
    if (duplicate) {
      toast.error(`Categoria "${duplicate.name}" já existe`)
      return
    }

    // Check if name changed — need to update items in DB
    const oldName = categories[index].name
    const newName = editingCatName.trim()
    const nameChanged = oldName.toUpperCase() !== newName.toUpperCase()

    const updated = categories.map((c, i) => {
      if (i === index) return { name: newName, emoji: editingCatEmoji || '📁' }
      return c
    })

    // Save categories first
    const doSave = async () => {
      await handleSaveManagedCategories(type, updated)
      // If name changed, update all items with the old category name
      if (nameChanged) {
        try {
          await fetch('/api/admin/rename-category', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type, oldName, newName }),
          })
        } catch {
          // Best effort — categories already saved
        }
      }
    }
    doSave()
    setEditingCatIndex(null)
    setEditingCatName('')
    setEditingCatEmoji('')
  }

  const cancelEditCategory = () => {
    setEditingCatIndex(null)
    setEditingCatName('')
    setEditingCatEmoji('')
  }

  // Build a combined list of managed + ad-hoc categories for dropdowns (with counts)
  const allTrackCategoriesForDropdown = (() => {
    const managed = managedTrackCategories.map(c => ({
      name: c.name,
      emoji: c.emoji || '📁',
      count: trackCategories.find(tc => tc.name === c.name)?.count || 0,
    }))
    const managedNames = new Set(managedTrackCategories.map(c => c.name.toUpperCase()))
    const adhoc = trackCategories
      .filter(tc => !managedNames.has(tc.name.toUpperCase()))
      .map(tc => ({ name: tc.name, emoji: tc.emoji || '📁', count: tc.count }))
    return [...managed, ...adhoc]
  })()

  const allVoiceCategoriesForDropdown = (() => {
    const managed = managedVoiceCategories.map(c => ({
      name: c.name,
      emoji: c.emoji || '📁',
      count: voiceCategories.find(vc => vc.name === c.name)?.count || 0,
    }))
    const managedNames = new Set(managedVoiceCategories.map(c => c.name.toUpperCase()))
    const adhoc = voiceCategories
      .filter(vc => !managedNames.has(vc.name.toUpperCase()))
      .map(vc => ({ name: vc.name, emoji: vc.emoji || '📁', count: vc.count }))
    return [...managed, ...adhoc]
  })()

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-8 h-8 animate-spin text-violet-500" />
      </div>
    )
  }

  const editingVariation = editingVariationId
    ? voices.flatMap(v => v.variations).find(v => v.id === editingVariationId)
    : null

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-700 bg-slate-900/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg">
              <AudioWaveform className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">VozPro</h1>
              <p className="text-xs text-slate-400">Painel Administrativo</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={loadData} className="text-slate-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-400 hover:text-red-400">
              <LogOut className="w-4 h-4 mr-1" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <Tabs defaultValue="voices" className="w-full">
          <TabsList className="bg-slate-800 border border-slate-700">
            <TabsTrigger value="voices" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white gap-2">
              <Mic className="w-4 h-4" />
              Vozes ({voices.length})
            </TabsTrigger>
            <TabsTrigger value="tracks" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white gap-2">
              <Music className="w-4 h-4" />
              Trilhas ({tracks.length})
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white gap-2">
              <Settings2 className="w-4 h-4" />
              Config
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white gap-2">
              <Users className="w-4 h-4" />
              Usuários ({users.length})
            </TabsTrigger>
            <TabsTrigger value="health" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white gap-2">
              🩺 Saúde
            </TabsTrigger>
          </TabsList>

          {/* VOICES TAB */}
          <TabsContent value="voices" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Vozes Cadastradas</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setNewCatName(''); setNewCatEmoji(''); setVoiceCategoryDialogOpen(true) }}
                  className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 gap-2"
                >
                  <FolderPlus className="w-4 h-4" />
                  Categorias
                </Button>
                <Dialog open={voiceBatchOpen} onOpenChange={(open) => { setVoiceBatchOpen(open); if (!open) { setVoiceBatchFiles([]); setVoiceBatchVoiceId('') } }}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                    <Upload className="w-4 h-4" />
                    Upload Vozes em Lote
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Upload Vozes em Lote</DialogTitle>
                    <DialogDescription className="text-slate-400">Selecione uma voz e envie múltiplos áudios. Cada arquivo será criado como uma variação.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Voz *</Label>
                      <Select value={voiceBatchVoiceId} onValueChange={setVoiceBatchVoiceId}>
                        <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                          <SelectValue placeholder="Selecionar voz..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700 max-h-60">
                          {voices.map(v => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.name} <span className="text-slate-500 text-xs ml-1">({v.variations.length} var.)</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Arquivos de Áudio * (MP3, WAV, OGG...)</Label>
                      <input type="file" accept="audio/*" multiple onChange={(e) => { if (e.target.files) setVoiceBatchFiles(Array.from(e.target.files)) }} className="hidden" id="voice-batch-file-input" />
                      <Button type="button" variant="outline" onClick={() => document.getElementById('voice-batch-file-input')?.click()} className="w-full border-slate-500 text-white hover:bg-slate-700 gap-2">
                        <FolderPlus className="w-4 h-4" />
                        {voiceBatchFiles.length > 0 ? `${voiceBatchFiles.length} arquivo(s) selecionado(s)` : 'Selecionar arquivos...'}
                      </Button>
                      {voiceBatchFiles.length > 0 && (
                        <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-slate-400">
                          {voiceBatchFiles.map((f, i) => (<p key={i}>🎤 {f.name} ({(f.size / 1024 / 1024).toFixed(1)}MB)</p>))}
                        </div>
                      )}
                    </div>
                    {voiceBatchProgress && (
                      <div className="flex items-center gap-2 text-sm text-slate-300">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {voiceBatchProgress}
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setVoiceBatchOpen(false)} className="text-slate-400">Cancelar</Button>
                    <Button onClick={handleVoiceBatchUpload} disabled={voiceBatchUploading || voiceBatchFiles.length === 0 || !voiceBatchVoiceId} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      {voiceBatchUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                      Enviar {voiceBatchFiles.length} variação(ões)
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* ====== UPLOAD EM MASSA ====== */}
              <Dialog open={bulkDialogOpen} onOpenChange={(open) => { setBulkDialogOpen(open); if (!open) { setBulkFiles([]); setBulkProgress('') }}}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => setBulkDialogOpen(true)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
                  >
                    <UploadCloud className="w-4 h-4" />
                    Upload em Massa
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[85vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <UploadCloud className="w-5 h-5 text-emerald-400" />
                      Upload de Vozes em Massa
                    </DialogTitle>
                    <DialogDescription className="text-slate-400">
                      Envie vários arquivos de áudio de uma vez. Cada arquivo vira uma voz com variação padrão.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    {/* Drop zone */}
                    <div
                      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                        bulkDragOver ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-600 hover:border-slate-500'
                      }`}
                      onDragOver={(e) => { e.preventDefault(); setBulkDragOver(true) }}
                      onDragLeave={() => setBulkDragOver(false)}
                      onDrop={handleBulkDrop}
                      onClick={() => document.getElementById('bulk-file-input')?.click()}
                    >
                      <UploadCloud className={`w-10 h-10 mx-auto mb-3 ${bulkDragOver ? 'text-emerald-400' : 'text-slate-500'}`} />
                      <p className="text-sm text-slate-300 font-medium">
                        Arraste arquivos aqui ou clique para selecionar
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        MP3, WAV, OGG, M4A, FLAC, WEBM — Máximo 50 arquivos
                      </p>
                      <input
                        id="bulk-file-input"
                        type="file"
                        multiple
                        accept="audio/*,.mp3,.wav,.ogg,.m4a,.flac,.webm"
                        onChange={handleBulkFiles}
                        className="hidden"
                      />
                    </div>

                    {/* File list */}
                    {bulkFiles.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-slate-300">
                            {bulkFiles.length} arquivo(s) selecionado(s)
                          </p>
                          <Button variant="ghost" size="sm" onClick={clearBulkFiles} className="text-slate-500 hover:text-red-400 h-7 text-xs">
                            Limpar todos
                          </Button>
                        </div>
                        <div className="max-h-40 overflow-y-auto space-y-1 bg-slate-900/50 rounded-lg p-2">
                          {bulkFiles.map((file, i) => (
                            <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-slate-800/50 group">
                              <div className="flex items-center gap-2 min-w-0">
                                <FileAudio className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                <span className="text-sm text-slate-300 truncate">{file.name}</span>
                                <span className="text-xs text-slate-600 shrink-0">({(file.size / 1024).toFixed(0)}KB)</span>
                              </div>
                              <button
                                onClick={() => removeBulkFile(i)}
                                className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Category & settings */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label className="text-slate-300 text-xs">Categoria</Label>
                        <Select value={bulkCategory} onValueChange={setBulkCategory}>
                          <SelectTrigger className="mt-1 h-9 bg-slate-900/50 border-slate-600 text-sm">
                            <SelectValue placeholder="Selecione uma categoria..." />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-600">
                            {voiceCategories.map(cat => (
                              <SelectItem key={cat.name} value={cat.name}>
                                {cat.emoji || '📁'} {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-300 text-xs">Gênero</Label>
                        <Select value={bulkGender} onValueChange={setBulkGender}>
                          <SelectTrigger className="mt-1 h-9 bg-slate-900/50 border-slate-600 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-600">
                            <SelectItem value="Auto">Auto</SelectItem>
                            <SelectItem value="Female / 女">Feminino</SelectItem>
                            <SelectItem value="Male / 男">Masculino</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-300 text-xs">Idade</Label>
                        <Select value={bulkAge} onValueChange={setBulkAge}>
                          <SelectTrigger className="mt-1 h-9 bg-slate-900/50 border-slate-600 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-600">
                            <SelectItem value="Auto">Auto</SelectItem>
                            <SelectItem value="Child / 儿童">Criança</SelectItem>
                            <SelectItem value="Young Adult / 青年">Jovem</SelectItem>
                            <SelectItem value="Middle-aged / 中年">Adulto</SelectItem>
                            <SelectItem value="Elderly / 老年">Idoso</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-300 text-xs">Tom</Label>
                        <Select value={bulkPitch} onValueChange={setBulkPitch}>
                          <SelectTrigger className="mt-1 h-9 bg-slate-900/50 border-slate-600 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-600">
                            <SelectItem value="Auto">Auto</SelectItem>
                            <SelectItem value="Low Pitch / 低音调">Grave</SelectItem>
                            <SelectItem value="Moderate Pitch / 中音调">Médio</SelectItem>
                            <SelectItem value="High Pitch / 高音调">Agudo</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-slate-300 text-xs">Sotaque</Label>
                        <Select value={bulkAccent} onValueChange={setBulkAccent}>
                          <SelectTrigger className="mt-1 h-9 bg-slate-900/50 border-slate-600 text-sm"><SelectValue /></SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-600">
                            <SelectItem value="Auto">Auto</SelectItem>
                            <SelectItem value="Portuguese Accent / 葡萄牙口音">Português</SelectItem>
                            <SelectItem value="American Accent / 美式口音">Americano</SelectItem>
                            <SelectItem value="British Accent / 英国口音">Britânico</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {bulkProgress && (
                      <div className="flex items-center gap-2 text-sm text-emerald-400">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {bulkProgress}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setBulkDialogOpen(false)} className="text-slate-400">Cancelar</Button>
                    <Button
                      onClick={handleBulkUpload}
                      disabled={bulkUploading || bulkFiles.length === 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {bulkUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UploadCloud className="w-4 h-4 mr-1" />}
                      Criar {bulkFiles.length} voz(es)
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

                <Dialog open={voiceDialogOpen} onOpenChange={setVoiceDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingVoiceId(null)
                      setVoiceForm({ name: '', description: '', gender: 'Auto', age: 'Auto', accent: 'Auto', pitch: 'Auto', category: '' })
                    }}
                    className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Voz
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                  <DialogHeader>
                    <DialogTitle>{editingVoiceId ? 'Editar Voz' : 'Nova Voz'}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      {editingVoiceId ? 'Altere os dados da voz' : 'Cadastre uma nova voz para seus clientes'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Nome *</Label>
                      <Input
                        value={voiceForm.name}
                        onChange={(e) => setVoiceForm(p => ({ ...p, name: e.target.value }))}
                        placeholder="Ex: Ana, Carlos, Maria..."
                        className="bg-slate-900/50 border-slate-600 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Descrição</Label>
                      <Textarea
                        value={voiceForm.description}
                        onChange={(e) => setVoiceForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Descrição da voz..."
                        className="bg-slate-900/50 border-slate-600 text-white resize-none"
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Gênero</Label>
                        <Select value={voiceForm.gender} onValueChange={(v) => setVoiceForm(p => ({ ...p, gender: v }))}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {GENDER_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Idade</Label>
                        <Select value={voiceForm.age} onValueChange={(v) => setVoiceForm(p => ({ ...p, age: v }))}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {AGE_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Tom</Label>
                        <Select value={voiceForm.pitch} onValueChange={(v) => setVoiceForm(p => ({ ...p, pitch: v }))}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {PITCH_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Sotaque</Label>
                        <Select value={voiceForm.accent} onValueChange={(v) => setVoiceForm(p => ({ ...p, accent: v }))}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {ACCENT_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Categoria</Label>
                      <div className="flex gap-2">
                        <Select value={voiceForm.category || '__none__'} onValueChange={(v) => setVoiceForm(p => ({ ...p, category: v === '__none__' || v === '__new__' ? '' : v }))}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white flex-1">
                            <SelectValue placeholder="Selecionar..." />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {allVoiceCategoriesForDropdown.map(c => (
                              <SelectItem key={c.name} value={c.name}>
                                <span className="mr-1.5">{c.emoji}</span>
                                {c.name}
                                {c.count > 0 && <span className="ml-1.5 text-xs text-slate-500">({c.count})</span>}
                              </SelectItem>
                            ))}
                            <SelectItem value="__new__">+ Nova categoria...</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={voiceForm.category || ''}
                          onChange={(e) => setVoiceForm(p => ({ ...p, category: e.target.value }))}
                          placeholder="Ou digite nova..."
                          className="bg-slate-900/50 border-slate-600 text-white w-48"
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setVoiceDialogOpen(false)} className="text-slate-400">Cancelar</Button>
                    <Button onClick={handleSaveVoice} className="bg-violet-600 hover:bg-violet-700 text-white">
                      {editingVoiceId ? 'Salvar' : 'Criar Voz'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : selectedVoiceCategory ? (
              /* INSIDE A VOICE CATEGORY */
              <div>
                <button
                  onClick={() => setSelectedVoiceCategory(null)}
                  className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 mb-4 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Todas as Pastas &gt; <span className="font-semibold">{selectedVoiceCategory}</span>
                </button>
                {voices.filter(v => v.category === selectedVoiceCategory).length === 0 ? (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="py-12 text-center">
                      <FolderOpen className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-slate-400">Pasta vazia</p>
                      <p className="text-sm text-slate-500 mt-1">Adicione vozes a esta categoria</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {voices.filter(v => v.category === selectedVoiceCategory).map((voice) => (
                      <Card key={voice.id} className="bg-slate-800/50 border-slate-700">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-violet-500/20 flex items-center justify-center">
                                <Mic className="w-5 h-5 text-violet-400" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold text-white">{voice.name}</h3>
                                  <Badge variant={voice.active ? 'default' : 'secondary'} className={voice.active ? 'bg-emerald-600' : 'bg-slate-600'}>
                                    {voice.active ? 'Ativa' : 'Inativa'}
                                  </Badge>
                                </div>
                                <p className="text-sm text-slate-400">{voice.description || 'Sem descrição'}</p>
                                <div className="flex gap-1 mt-1">
                                  {voice.gender !== 'Auto' && <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{voice.gender}</Badge>}
                                  {voice.age !== 'Auto' && <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{voice.age}</Badge>}
                                  {voice.pitch !== 'Auto' && <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{voice.pitch}</Badge>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Switch checked={voice.active} onCheckedChange={() => handleToggleVoice(voice)} />

                              <Button variant="ghost" size="icon" onClick={() => { setEditingVoiceId(voice.id); setVoiceForm({ name: voice.name, description: voice.description, gender: voice.gender, age: voice.age, accent: voice.accent, pitch: voice.pitch, category: voice.category || '' }); setVoiceDialogOpen(true) }} className="text-slate-400 hover:text-white"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteVoice(voice.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>
                          {/* Variations */}
                          <div className="border-t border-slate-700 pt-3">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-slate-300">Variações ({voice.variations.length})</span>
                              <Button size="sm" variant="outline" onClick={() => { setEditingVariationId(null); setAddingVariationTo(voice.id); setVariationForm({ label: '', emoji: '', refAudioPath: '', serverUrl: '', filename: '', refAudioName: '', refText: '', instruct: 'none' }); setPendingVoiceFile(null); setVariationDialogOpen(true) }} className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1"><Plus className="w-3 h-3" />Variação</Button>
                            </div>
                            {voice.variations.length === 0 ? (
                              <p className="text-sm text-slate-500 italic">Nenhuma variação.</p>
                            ) : (
                              <div className="space-y-2">
                                {voice.variations.map((v) => (
                                  <div key={v.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${!v.active ? 'border-slate-800 bg-slate-900/20 opacity-60' : (v.refAudioPath || v.refAudioServerUrl) ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-amber-800/40 bg-amber-900/10'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-lg shrink-0">{v.emoji || '🎙️'}</span>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-sm font-medium text-slate-300">{v.label}</span>
                                          {(v.refAudioPath || v.refAudioServerUrl) ? (<Badge variant="outline" className="text-[10px] border-emerald-700 text-emerald-400 px-1.5 py-0"><Volume2 className="w-2.5 h-2.5 mr-0.5" /> Audio OK</Badge>) : (<Badge variant="outline" className="text-[10px] border-amber-700 text-amber-400 px-1.5 py-0">Sem audio</Badge>)}
                                          {v.refAudioServerUrl && <VarDuration url={v.refAudioServerUrl} />}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {(v.refAudioPath || v.refAudioServerUrl) && (
                                        <button
                                          onClick={() => toggleVoicePreview(v)}
                                          className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${previewingVoiceVarId === v.id ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30 scale-110' : 'bg-violet-500/20 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300'}`}
                                          title={previewingVoiceVarId === v.id ? 'Parar' : 'Ouvir'}
                                        >
                                          {previewingVoiceVarId === v.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                                        </button>
                                      )}
                                      <input type="file" accept="audio/*" onChange={(e) => handleQuickUploadAudio(v.id, e)} className="hidden" id={`quick-audio-${selectedVoiceCategory}-${v.id}`} />
                                      {v.refAudioServerUrl && (
                                        <a href={toProxyAudioUrl(v.refAudioServerUrl)} download={v.refAudioName || undefined} target="_blank" rel="noopener noreferrer" className="h-7 px-2 text-xs gap-1 inline-flex items-center text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-md transition-colors" title="Baixar áudio de referência"><Download className="w-3 h-3" /></a>
                                      )}
                                      <Button variant="ghost" size="sm" onClick={() => document.getElementById(`quick-audio-${selectedVoiceCategory}-${v.id}`)?.click()} className={`h-7 px-2 text-xs gap-1 ${(v.refAudioPath || v.refAudioServerUrl) ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30' : 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/30'}`}><Upload className="w-3 h-3" />{(v.refAudioPath || v.refAudioServerUrl) ? 'Update' : 'Add'}</Button>
                                      <Button variant="ghost" size="sm" onClick={() => handleEditVariationWithAudio(v)} className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-700 gap-1"><Edit className="w-3 h-3" />Editar</Button>
                                      <Switch checked={v.active} onCheckedChange={() => handleToggleVariation(v)} className="scale-75" />
                                      <Button variant="ghost" size="icon" onClick={() => handleDeleteVariation(v.id)} className="text-slate-500 hover:text-red-400 h-7 w-7"><Trash2 className="w-3 h-3" /></Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : voiceCategories.length === 0 && voices.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-12 text-center">
                  <Mic className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-400">Nenhuma voz cadastrada</p>
                  <p className="text-sm text-slate-500 mt-1">Clique em &quot;Nova Voz&quot; para começar</p>
                </CardContent>
              </Card>
            ) : (
              /* FOLDER GRID VIEW */
              <div>
                {/* Uncategorized voices without a folder */}
                {voices.filter(v => !v.category).length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Sem categoria</h3>
                    <div className="space-y-2">
                      {voices.filter(v => !v.category).map((voice) => (
                        <Card key={voice.id} className="bg-slate-800/50 border-slate-700">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => {
                                    const firstActiveVar = voice.variations.find(v => v.active !== false && v.refAudioPath)
                                    if (firstActiveVar) toggleVoicePreview(firstActiveVar)
                                  }}
                                  className={`w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 transition-all duration-200 ${voice.variations.some(v => v.id === previewingVoiceVarId) ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30' : 'hover:bg-violet-500/30'}`}
                                >
                                  {voice.variations.some(v => v.id === previewingVoiceVarId) ? <Pause className="w-4 h-4" /> : <Mic className="w-4 h-4 text-violet-400" />}
                                </button>
                                <div>
                                  <span className="font-medium text-sm text-white">{voice.name}</span>
                                  <p className="text-xs text-slate-500">{voice.variations.length} variação(ões)</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {(() => { const dv = voice.variations.find(v => v.active !== false && v.refAudioServerUrl); return dv ? (
                                  <a href={toProxyAudioUrl(dv.refAudioServerUrl)} download={dv.refAudioName || undefined} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 transition-colors" title={`Baixar áudio: ${dv.label}`}><Download className="w-3.5 h-3.5" /></a>
                                ) : null })()}
                                <Switch checked={voice.active} onCheckedChange={() => handleToggleVoice(voice)} className="scale-75" />

                                <Button variant="ghost" size="icon" onClick={() => { setEditingVoiceId(voice.id); setVoiceForm({ name: voice.name, description: voice.description, gender: voice.gender, age: voice.age, accent: voice.accent, pitch: voice.pitch, category: voice.category || '' }); setVoiceDialogOpen(true) }} className="text-slate-400 hover:text-white h-8 w-8"><Edit className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteVoice(voice.id)} className="text-slate-400 hover:text-red-400 h-8 w-8"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                {/* Category folder grid */}
                {voiceCategories.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {voiceCategories.map(cat => (
                      <button
                        key={cat.name}
                        onClick={() => setSelectedVoiceCategory(cat.name)}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 hover:border-violet-500/50 hover:scale-105 transition-all duration-200 cursor-pointer group"
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">{cat.emoji || '📁'}</span>
                        <span className="text-sm font-medium text-white text-center truncate w-full">{cat.name}</span>
                        <span className="text-xs text-slate-400">{cat.count} voz(es)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Variation Dialog - rendered ONCE outside the map */}
          <Dialog open={variationDialogOpen} onOpenChange={(open) => {
            setVariationDialogOpen(open)
            if (!open) {
              setEditingVariationId(null)
              setAddingVariationTo(null)
              setPendingVoiceFile(null)
              setVoiceTrimState(null)
              setAudioAlreadyUpdated(false)
              if (voicePreviewSrcRef.current) { try { voicePreviewSrcRef.current.stop() } catch { /* */ } voicePreviewSrcRef.current = null } if (voicePreviewCtxRef.current) { voicePreviewCtxRef.current.close(); voicePreviewCtxRef.current = null }
              setVoicePreviewing(false)
            }
          }}>
            <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
              <DialogHeader>
                <DialogTitle>
                  {editingVariationId
                    ? `Editar: ${editingVariation?.label || 'Variação'}`
                    : `Nova Variação para "${voices.find(v => v.id === addingVariationTo)?.name || 'Voz'}"`
                  }
                </DialogTitle>
                <DialogDescription className="text-slate-400">
                  {editingVariationId
                    ? 'Ajuste o corte do áudio com o waveform. Clique Aplicar e depois Salvar para enviar.'
                    : 'Cada variação usa um áudio de referência diferente. A emoção vem do TOM do áudio enviado.'
                  }
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Nome da Variação *</Label>
                    <Input
                      value={variationForm.label}
                      onChange={(e) => setVariationForm(p => ({ ...p, label: e.target.value }))}
                      placeholder="Ex: Animada, Neutra..."
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Emoji</Label>
                    <Input
                      value={variationForm.emoji}
                      onChange={(e) => setVariationForm(p => ({ ...p, emoji: e.target.value }))}
                      placeholder="😊"
                      className="bg-slate-900/50 border-slate-600 text-white"
                    />
                  </div>
                </div>

                {/* Select reference audio with waveform trimmer */}
                <div className="space-y-2">
                  <Label className="text-slate-300">
                    Áudio de Referência {editingVariationId ? '' : '*'}
                    <span className="text-slate-500 ml-1">(ideal: 3-12s de voz clara)</span>
                  </Label>
                  {loadingExistingAudio && (
                    <div className="flex items-center gap-2 py-3 px-4 rounded-lg bg-slate-900/60 border border-slate-700">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                      <span className="text-sm text-slate-400">Carregando áudio existente...</span>
                    </div>
                  )}
                  {!loadingExistingAudio && editingVariationId && editingVariation?.refAudioPath && !voiceTrimState && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-500">
                        Audio atual: {editingVariation.refAudioName || 'arquivo'}
                      </p>
                      <p className="text-xs text-amber-400/80">
                        O audio nao foi carregado. Selecione um novo arquivo ou tente fechar e abrir o Editar novamente.
                      </p>
                    </div>
                  )}
                  <div className="relative">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleSelectVoiceFile}
                      className="hidden"
                      id="ref-audio-upload-dialog"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('ref-audio-upload-dialog')?.click()}
                      className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 gap-2"
                    >
                      {pendingVoiceFile ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span className="text-emerald-400">{pendingVoiceFile.name}</span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          {editingVariationId && voiceTrimState ? 'Enviar novo áudio (substituir)' : editingVariationId ? 'Selecionar arquivo de áudio' : 'Selecionar arquivo de áudio'}
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Waveform Trimmer — shows after file selection */}
                {voiceTrimState && (
                  <div className="space-y-3 rounded-lg bg-slate-900/60 p-3 border border-slate-700">
                    {/* Waveform canvas */}
                    <canvas
                      ref={waveCanvasRef}
                      className="w-full h-16 rounded cursor-crosshair"
                      style={{ imageRendering: 'pixelated' }}
                    />

                    {/* Duration info */}
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Original: {voiceTrimState.duration.toFixed(1)}s</span>
                      <span className="text-violet-400 font-medium">
                        Selecionado: {(voiceTrimState.rangeEnd - voiceTrimState.rangeStart).toFixed(1)}s
                      </span>
                    </div>

                    {/* Start / End sliders */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Início: {voiceTrimState.rangeStart.toFixed(2)}s</Label>
                        <input
                          type="range"
                          min={0}
                          max={voiceTrimState.duration}
                          step={0.05}
                          value={voiceTrimState.rangeStart}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            setVoiceTrimState(prev => prev && v < prev.rangeEnd ? { ...prev, rangeStart: v } : prev)
                            setPendingVoiceFile(null)
                            setAudioAlreadyUpdated(false)
                          }}
                          className="w-full accent-violet-500 h-2"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-slate-400">Fim: {voiceTrimState.rangeEnd.toFixed(2)}s</Label>
                        <input
                          type="range"
                          min={0}
                          max={voiceTrimState.duration}
                          step={0.05}
                          value={voiceTrimState.rangeEnd}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value)
                            setVoiceTrimState(prev => prev && v > prev.rangeStart ? { ...prev, rangeEnd: v } : prev)
                            setPendingVoiceFile(null)
                            setAudioAlreadyUpdated(false)
                          }}
                          className="w-full accent-amber-400 h-2"
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={handlePreviewVoiceTrim}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1 text-xs">
                        {voicePreviewing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                        {voicePreviewing ? 'Pausar' : 'Ouvir corte'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleAutoVoiceTrim}
                        className="border-violet-600 text-violet-400 hover:bg-violet-900/30 gap-1 text-xs">
                        <AudioWaveform className="w-3 h-3" />
                        Auto-trim voz
                      </Button>
                      {silenceCount > 0 && (
                        <Button size="sm" variant="outline" onClick={handleRemoveSilence}
                          className="border-red-500 text-red-400 hover:bg-red-900/30 gap-1 text-xs">
                          <VolumeX className="w-3 h-3" />
                          Remover silêncio ({silenceCount})
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={handleResetVoiceTrim}
                        className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1 text-xs">
                        <RefreshCw className="w-3 h-3" />
                        Usar tudo
                      </Button>
                      <Button size="sm" onClick={handleApplyVoiceTrim} disabled={!!pendingVoiceFile}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs ml-auto">
                        <CheckCircle2 className="w-3 h-3" />
                        Aplicar corte
                      </Button>
                    </div>
                  </div>
                )}

                {/* Ready badge - corte aplicado, pronto para salvar */}
                {pendingVoiceFile && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-emerald-900/30 border-emerald-700 text-emerald-400">
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Corte aplicado
                    </Badge>
                    <span className="text-xs text-slate-500">{pendingVoiceFile.info} — clique em Salvar para enviar</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-slate-300">Texto da Referência <span className="text-slate-500">(opcional)</span></Label>
                  <Textarea
                    value={variationForm.refText}
                    onChange={(e) => setVariationForm(p => ({ ...p, refText: e.target.value }))}
                    placeholder="Cole aqui o que o locutor fala no áudio de referência. Melhora muito a clonagem."
                    className="bg-slate-900/50 border-slate-600 text-white resize-none"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Instrução Adicional <span className="text-slate-500">(opcional)</span></Label>
                  <Select value={variationForm.instruct} onValueChange={(v) => setVariationForm(p => ({ ...p, instruct: v }))}>
                    <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {INSTRUCT_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-500">
                    Apenas valores suportados pelo engine TTS. A emoção real vem do tom do áudio enviado.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setVariationDialogOpen(false); setEditingVariationId(null); setAddingVariationTo(null); setPendingVoiceFile(null); setVoiceTrimState(null); setAudioAlreadyUpdated(false); if (voicePreviewSrcRef.current) { try { voicePreviewSrcRef.current.stop() } catch {} voicePreviewSrcRef.current = null } if (voicePreviewCtxRef.current) { voicePreviewCtxRef.current.close(); voicePreviewCtxRef.current = null } setVoicePreviewing(false) }} className="text-slate-400">Cancelar</Button>
                <Button onClick={handleSaveVariation} disabled={uploadingRef} className="bg-violet-600 hover:bg-violet-700 text-white">
                  {uploadingRef ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      Enviando...
                    </>
                  ) : editingVariationId ? 'Salvar Alterações' : 'Adicionar Variação'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* TRACKS TAB */}
          <TabsContent value="tracks" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Trilhas Musicais</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setNewCatName(''); setNewCatEmoji(''); setTrackCategoryDialogOpen(true) }}
                  className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 gap-2"
                >
                  <FolderPlus className="w-4 h-4" />
                  Gerenciar Categorias
                </Button>
                <Dialog open={trackDialogOpen} onOpenChange={(open) => {
                  setTrackDialogOpen(open)
                  if (!open) {
                    setEditingTrackId(null)
                    setPendingTrackFile(null)
                  }
                }}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingTrackId(null)
                      setTrackForm({ name: '', description: '', emoji: '', category: '' })
                      setTrackFilePath('')
                      setTrackDuration(0)
                      setPendingTrackFile(null)
                    }}
                    className="bg-violet-600 hover:bg-violet-700 text-white gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Trilha
                  </Button>
                </DialogTrigger>
                <DialogContent className="bg-slate-800 border-slate-700 text-white">
                  <DialogHeader>
                    <DialogTitle>{editingTrackId ? 'Editar Trilha' : 'Nova Trilha Musical'}</DialogTitle>
                    <DialogDescription className="text-slate-400">
                      {editingTrackId ? 'Altere os dados da trilha. Selecione um novo áudio para substituir o atual.' : 'Faça upload de uma trilha de fundo para mixar com as vozes geradas.'}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label className="text-slate-300">Nome *</Label>
                        <Input
                          value={trackForm.name}
                          onChange={(e) => setTrackForm(p => ({ ...p, name: e.target.value }))}
                          placeholder="Ex: Corporativa, Eletrônica..."
                          className="bg-slate-900/50 border-slate-600 text-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-slate-300">Emoji</Label>
                        <Input
                          value={trackForm.emoji}
                          onChange={(e) => setTrackForm(p => ({ ...p, emoji: e.target.value }))}
                          placeholder="🎵"
                          className="bg-slate-900/50 border-slate-600 text-white"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Descrição</Label>
                      <Textarea
                        value={trackForm.description}
                        onChange={(e) => setTrackForm(p => ({ ...p, description: e.target.value }))}
                        placeholder="Descrição da trilha..."
                        className="bg-slate-900/50 border-slate-600 text-white resize-none"
                        rows={2}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">Categoria</Label>
                      <div className="flex gap-2">
                        <Select value={trackForm.category || '__none__'} onValueChange={(v) => setTrackForm(p => ({ ...p, category: v === '__none__' || v === '__new__' ? '' : v }))}>
                          <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white flex-1">
                            <SelectValue placeholder="Selecionar..." />
                          </SelectTrigger>
                          <SelectContent className="bg-slate-800 border-slate-700">
                            {allTrackCategoriesForDropdown.map(c => (
                              <SelectItem key={c.name} value={c.name}>
                                <span className="mr-1.5">{c.emoji}</span>
                                {c.name}
                                {c.count > 0 && <span className="ml-1.5 text-xs text-slate-500">({c.count})</span>}
                              </SelectItem>
                            ))}
                            <SelectItem value="__new__">+ Nova categoria...</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          value={trackForm.category || ''}
                          onChange={(e) => setTrackForm(p => ({ ...p, category: e.target.value }))}
                          placeholder="Ou digite nova..."
                          className="bg-slate-900/50 border-slate-600 text-white w-48"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-300">
                        Arquivo de Áudio {editingTrackId ? '(opcional)' : '*'}
                      </Label>
                      {editingTrackId && (
                        <p className="text-xs text-slate-500">
                          Selecione um novo arquivo para substituir o áudio atual, ou deixe vazio para manter.
                        </p>
                      )}
                      {editingTrackId && (() => {
                        const editingTrack = tracks.find(t => t.id === editingTrackId)
                        return editingTrack?.audioPath ? (
                          <p className="text-xs text-emerald-500 flex items-center gap-1">
                            <FileAudio className="w-3 h-3" />
                            Áudio atual: {editingTrack.audioPath.split('/').pop()}
                          </p>
                        ) : null
                      })()}
                      <input
                        type="file"
                        accept="audio/*"
                        onChange={handleSelectTrackFile}
                        className="hidden"
                        id="track-file-upload"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('track-file-upload')?.click()}
                        className="w-full border-slate-500 text-white hover:bg-slate-700 gap-2"
                      >
                        {pendingTrackFile ? (
                          <>
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-emerald-400">
                              {pendingTrackFile.name} ({(pendingTrackFile.blob.size / (1024 * 1024)).toFixed(1)}MB)
                            </span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-4 h-4" />
                            {editingTrackId ? 'Selecionar novo áudio (opcional)' : 'Selecionar arquivo de áudio'}
                          </>
                        )}
                      </Button>
                      {pendingTrackFile && (
                        <Badge variant="outline" className="bg-emerald-900/30 border-emerald-700 text-emerald-400">
                          Pronto para enviar ao salvar
                        </Badge>
                      )}
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => { setTrackDialogOpen(false); setPendingTrackFile(null) }} className="text-slate-400">Cancelar</Button>
                    <Button onClick={handleSaveTrack} disabled={uploadingTrack} className="bg-violet-600 hover:bg-violet-700 text-white">
                      {uploadingTrack ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin mr-1" />
                          {editingTrackId ? 'Enviando...' : 'Enviando...'}
                        </>
                      ) : editingTrackId ? 'Salvar' : 'Criar Trilha'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            {/* Batch Upload Dialog */}
            <Dialog open={batchUploadOpen} onOpenChange={(open) => { setBatchUploadOpen(open); if (!open) { setBatchFiles([]); setBatchUploadCategory('') }}}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
                  <Upload className="w-4 h-4" />
                  Upload em Lote
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
                <DialogHeader>
                  <DialogTitle>Upload em Lote</DialogTitle>
                  <DialogDescription className="text-slate-400">Envie múltiplos arquivos de áudio de uma vez para uma categoria.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-300">Categoria *</Label>
                    <div className="flex gap-2">
                      <Select value={batchUploadCategory || '__none__'} onValueChange={(v) => setBatchUploadCategory(v === '__none__' || v === '__new__' ? '' : v)}>
                        <SelectTrigger className="bg-slate-900/50 border-slate-600 text-white flex-1">
                          <SelectValue placeholder="Selecionar..." />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-800 border-slate-700">
                          {allTrackCategoriesForDropdown.map(c => (
                            <SelectItem key={c.name} value={c.name}>
                              <span className="mr-1.5">{c.emoji}</span>
                              {c.name}
                            </SelectItem>
                          ))}
                          <SelectItem value="__new__">+ Nova...</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input value={batchUploadCategory} onChange={(e) => setBatchUploadCategory(e.target.value)} placeholder="Ou digite nova..." className="bg-slate-900/50 border-slate-600 text-white w-48" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-300">Arquivos de Áudio * (MP3, WAV, OGG...)</Label>
                    <input type="file" accept="audio/*" multiple onChange={(e) => { if (e.target.files) setBatchFiles(Array.from(e.target.files)) }} className="hidden" id="batch-file-input" />
                    <Button type="button" variant="outline" onClick={() => document.getElementById('batch-file-input')?.click()} className="w-full border-slate-500 text-white hover:bg-slate-700 gap-2">
                      <FolderPlus className="w-4 h-4" />
                      {batchFiles.length > 0 ? `${batchFiles.length} arquivo(s) selecionado(s)` : 'Selecionar arquivos...'}
                    </Button>
                    {batchFiles.length > 0 && (
                      <div className="max-h-40 overflow-y-auto space-y-1 text-xs text-slate-400">
                        {batchFiles.map((f, i) => (<p key={i}>🎵 {f.name} ({(f.size / 1024 / 1024).toFixed(1)}MB)</p>))}
                      </div>
                    )}
                  </div>
                  {batchProgress && (
                    <div className="flex items-center gap-2 text-sm text-slate-300">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {batchProgress}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setBatchUploadOpen(false)} className="text-slate-400">Cancelar</Button>
                  <Button onClick={handleBatchUpload} disabled={batchUploading || batchFiles.length === 0 || !batchUploadCategory.trim()} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    {batchUploading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    Enviar {batchFiles.length} arquivo(s)
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : selectedTrackCategory ? (
              /* INSIDE A TRACK CATEGORY */
              <div>
                <button
                  onClick={() => setSelectedTrackCategory(null)}
                  className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 mb-4 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Todas as Pastas &gt; <span className="font-semibold">{selectedTrackCategory}</span>
                </button>
                {tracks.filter(t => t.category === selectedTrackCategory).length === 0 ? (
                  <Card className="bg-slate-800/50 border-slate-700">
                    <CardContent className="py-12 text-center">
                      <FolderOpen className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                      <p className="text-slate-400">Pasta vazia</p>
                      <p className="text-sm text-slate-500 mt-1">Adicione trilhas a esta categoria</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {tracks.filter(t => t.category === selectedTrackCategory).map((track) => (
                      <Card key={track.id} className="bg-slate-800/50 border-slate-700">
                        <CardContent className="py-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleTrackPreview(track)}
                                className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${previewingTrackId === track.id ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30 scale-110' : 'bg-purple-500/20 text-purple-400 hover:bg-violet-500/20 hover:text-violet-300'}`}
                                title={previewingTrackId === track.id ? 'Parar preview' : 'Ouvir preview'}
                              >
                                {previewingTrackId === track.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                              </button>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{track.emoji || '🎵'}</span>
                                  <h3 className="font-semibold text-white">{track.name}</h3>
                                  <Badge variant={track.active ? 'default' : 'secondary'} className={track.active ? 'bg-emerald-600' : 'bg-slate-600'}>
                                    {track.active ? 'Ativa' : 'Inativa'}
                                  </Badge>
                                </div>
                                <p className="text-sm text-slate-400">{track.description || 'Sem descrição'}</p>
                                {track.duration > 0 && (
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Duração: {Math.floor(track.duration / 60)}:{String(Math.floor(track.duration % 60)).padStart(2, '0')}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {track.audioPath && (
                                <a href={track.audioPath} download={track.name || undefined} target="_blank" rel="noopener noreferrer" className="w-8 h-8 rounded-full flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 transition-colors" title="Baixar trilha"><Download className="w-4 h-4" /></a>
                              )}
                              <Switch checked={track.active} onCheckedChange={() => handleToggleTrack(track)} />
                              <Button variant="ghost" size="icon" onClick={() => { setEditingTrackId(track.id); setTrackForm({ name: track.name, description: track.description || '', emoji: track.emoji || '', category: track.category || '' }); setTrackFilePath(''); setTrackDuration(track.duration); setPendingTrackFile(null); setTrackDialogOpen(true) }} className="text-slate-400 hover:text-white"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteTrack(track.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>

                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            ) : trackCategories.length === 0 && tracks.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-12 text-center">
                  <Music className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-400">Nenhuma trilha cadastrada</p>
                  <p className="text-sm text-slate-500 mt-1">Clique em &quot;Nova Trilha&quot; ou &quot;Upload em Lote&quot; para começar</p>
                </CardContent>
              </Card>
            ) : (
              /* FOLDER GRID VIEW */
              <div>
                {/* Uncategorized tracks */}
                {tracks.filter(t => !t.category).length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-slate-400 mb-2">Sem categoria</h3>
                    <div className="space-y-2">
                      {tracks.filter(t => !t.category).map((track) => (
                        <Card key={track.id} className="bg-slate-800/50 border-slate-700">
                          <CardContent className="py-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => toggleTrackPreview(track)}
                                  className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${previewingTrackId === track.id ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30 scale-110' : 'bg-purple-500/20 text-purple-400 hover:bg-violet-500/20 hover:text-violet-300'}`}
                                  title={previewingTrackId === track.id ? 'Parar preview' : 'Ouvir preview'}
                                >
                                  {previewingTrackId === track.id ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
                                </button>
                                <div>
                                  <span className="font-medium text-sm text-white">{track.name}</span>
                                  <p className="text-xs text-slate-500">{track.description || 'Sem descrição'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                {track.audioPath && (
                                  <a href={track.audioPath} download={track.name || undefined} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full flex items-center justify-center text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 transition-colors" title="Baixar trilha"><Download className="w-3.5 h-3.5" /></a>
                                )}
                                <Switch checked={track.active} onCheckedChange={() => handleToggleTrack(track)} className="scale-75" />
                                <Button variant="ghost" size="icon" onClick={() => { setEditingTrackId(track.id); setTrackForm({ name: track.name, description: track.description || '', emoji: track.emoji || '', category: track.category || '' }); setTrackFilePath(''); setTrackDuration(track.duration); setPendingTrackFile(null); setTrackDialogOpen(true) }} className="text-slate-400 hover:text-white h-8 w-8"><Edit className="w-3.5 h-3.5" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteTrack(track.id)} className="text-slate-400 hover:text-red-400 h-8 w-8"><Trash2 className="w-3.5 h-3.5" /></Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
                {/* Category folder grid */}
                {trackCategories.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {trackCategories.map(cat => (
                      <button
                        key={cat.name}
                        onClick={() => setSelectedTrackCategory(cat.name)}
                        className="flex flex-col items-center gap-2 p-4 rounded-xl border border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 hover:border-violet-500/50 hover:scale-105 transition-all duration-200 cursor-pointer group"
                      >
                        <span className="text-3xl group-hover:scale-110 transition-transform">{cat.emoji || '📁'}</span>
                        <span className="text-sm font-medium text-white text-center truncate w-full">{cat.name}</span>
                        <span className="text-xs text-slate-400">{cat.count} trilha(s)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-4 mt-4">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-violet-400" />
                  Configurações do Sistema
                </CardTitle>
                <CardDescription className="text-slate-400">
                  Controle o que os clientes podem acessar no painel principal
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Toggle: Upload de Voz */}
                <div className="flex items-center justify-between p-4 rounded-lg bg-slate-900/50 border border-slate-700">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Upload className="w-4 h-4 text-slate-400" />
                      <Label className="text-sm font-medium text-white">Upload de Voz no Cliente</Label>
                    </div>
                    <p className="text-xs text-slate-400">
                      {enableVoiceUpload
                        ? 'Os clientes podem enviar proprios audios de referencia para clonar vozes'
                        : 'Os clientes so podem usar as vozes cadastradas pelo admin'}
                    </p>
                  </div>
                  <Switch
                    checked={settingsLoaded ? enableVoiceUpload : false}
                    onCheckedChange={handleToggleVoiceUpload}
                  />
                </div>

                {/* Marca d'água */}
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 space-y-4">
                  <div className="flex items-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    <Label className="text-sm font-medium text-white">Marca d'Água de Proteção</Label>
                  </div>
                  <p className="text-xs text-slate-400">
                    Áudio mixado no preview que o cliente escuta. Para baixar sem marca d'água, o cliente precisa pagar.
                  </p>

                  {/* Upload da marca d'água */}
                  <div className="flex items-center gap-3">
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        accept="audio/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          setWatermarkUploading(true)
                          try {
                            const form = new FormData()
                            form.append('file', file)
                            const res = await fetch('/api/upload-watermark', { method: 'POST', body: form })
                            if (!res.ok) throw new Error('Upload falhou')
                            const data = await res.json()
                            setWatermarkPath(data.path)
                            // Salvar no settings
                            await fetch('/api/admin/settings', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ key: 'watermarkAudioPath', value: data.path }),
                            })
                            toast.success('Marca d\'água enviada!')
                          } catch (err) {
                            toast.error('Erro ao enviar marca d\'água')
                          } finally {
                            setWatermarkUploading(false)
                          }
                        }}
                      />
                      <div className="flex items-center justify-center px-4 py-2 rounded-lg border border-dashed border-slate-600 hover:border-amber-500/50 hover:bg-amber-500/5 transition-all">
                        {watermarkUploading ? (
                          <Loader2 className="w-4 h-4 text-amber-400 animate-spin" />
                        ) : watermarkPath ? (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                            <span className="text-xs text-emerald-300">Arquivo carregado</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Upload className="w-4 h-4 text-slate-400" />
                            <span className="text-xs text-slate-400">Escolher áudio</span>
                          </div>
                        )}
                      </div>
                    </label>
                    {watermarkPath && (
                      <audio controls src={toProxyAudioUrl(watermarkPath)} className="h-8 w-32" />
                    )}
                  </div>

                  {/* Volume da marca d'água */}
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-xs text-slate-400">Volume da marca d'água</span>
                      <span className="text-xs text-amber-400">{Math.round(watermarkVolume * 100)}%</span>
                    </div>
                    <Slider
                      value={[watermarkVolume]}
                      onValueChange={async ([v]) => {
                        setWatermarkVolume(v)
                        try {
                          await fetch('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'watermarkVolume', value: String(v) }),
                          })
                        } catch {}
                      }}
                      min={0.01}
                      max={0.5}
                      step={0.01}
                    />
                    <div className="flex justify-between text-[10px] text-slate-600">
                      <span>Muito baixo (quase inaudível)</span>
                      <span>Muito alto</span>
                    </div>
                  </div>
                </div>

                {/* Paywall Toggle */}
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <Label className="text-sm font-medium text-white">Paywall (Cobrar por Download)</Label>
                    </div>
                    <Switch
                      checked={adminSettings.paywallEnabled === 'true'}
                      onCheckedChange={async (checked) => {
                        try {
                          await fetch('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'paywallEnabled', value: checked ? 'true' : 'false' }),
                          })
                          setAdminSettings(prev => ({ ...prev, paywallEnabled: checked ? 'true' : 'false' }))
                          toast.success(checked ? 'Paywall ativado — clientes pagarão R$1 por download' : 'Paywall desativado — download livre')
                        } catch {
                          toast.error('Erro ao salvar')
                        }
                      }}
                    />
                  </div>
                  <p className="text-xs text-slate-400">
                    {adminSettings.paywallEnabled === 'true'
                      ? 'Ativado: clientes precisam pagar via MercadoPago para baixar áudio limpo.'
                      : 'Desativado: clientes baixam áudio limpo gratuitamente.'}
                  </p>
                  {/* Downloads grátis por nova conta */}
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">Downloads grátis por nova conta</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="5"
                      defaultValue={adminSettings.freeDownloadsPerAccount || '5'}
                      className="h-9 bg-slate-800 border-slate-700 text-sm w-32"
                      onChange={async (e) => {
                        const val = parseInt(e.target.value, 10)
                        if (isNaN(val) || val < 0) return
                        try {
                          await fetch('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'freeDownloadsPerAccount', value: String(val) }),
                          })
                          setAdminSettings(prev => ({ ...prev, freeDownloadsPerAccount: String(val) }))
                        } catch {}
                      }}
                    />
                    <p className="text-[10px] text-slate-500">0 = sem downloads grátis</p>
                  </div>
                </div>

                {/* Valor do Download */}
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-emerald-400" />
                    <Label className="text-sm font-medium text-white">Valor do Download</Label>
                  </div>
                  <p className="text-xs text-slate-400">
                    Defina o valor cobrado por download de áudio via PIX.
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">Valor (R$)</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="1.00"
                      defaultValue={adminSettings.paymentAmount || '1.00'}
                      className="h-9 bg-slate-800 border-slate-700 text-sm w-32"
                      onChange={async (e) => {
                        const val = parseFloat(e.target.value)
                        if (isNaN(val) || val < 0.01) return
                        try {
                          await fetch('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'paymentAmount', value: val.toFixed(2) }),
                          })
                          setAdminSettings(prev => ({ ...prev, paymentAmount: val.toFixed(2) }))
                        } catch {}
                      }}
                    />
                  </div>
                </div>

                {/* MercadoPago Config */}
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-emerald-400" />
                    <Label className="text-sm font-medium text-white">MercadoPago (Pagamento)</Label>
                  </div>
                  <p className="text-xs text-slate-400">
                    Configure o token de acesso do MercadoPago para gerar QR de pagamento.
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">Access Token</Label>
                    <Input
                      type="password"
                      placeholder="APP_USR-xxxx..."
                      defaultValue={adminSettings.mercadopagoAccessToken || ''}
                      className="h-9 bg-slate-800 border-slate-700 text-sm"
                      onChange={async (e) => {
                        try {
                          await fetch('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'mercadopagoAccessToken', value: e.target.value }),
                          })
                        } catch {}
                      }}
                    />
                  </div>
                </div>

                {/* Google OAuth Config */}
                <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700 space-y-3">
                  <div className="flex items-center gap-2">
                    <Chrome className="w-4 h-4 text-blue-400" />
                    <Label className="text-sm font-medium text-white">Google OAuth</Label>
                  </div>
                  <p className="text-xs text-slate-400">
                    Client ID do Google Cloud Console para login com Google. 1 sessão por conta.
                  </p>
                  <div className="space-y-2">
                    <Label className="text-xs text-slate-400">Google Client ID</Label>
                    <Input
                      type="text"
                      placeholder="xxxx.apps.googleusercontent.com"
                      defaultValue={adminSettings.googleClientId || ''}
                      className="h-9 bg-slate-800 border-slate-700 text-sm"
                      onChange={async (e) => {
                        try {
                          await fetch('/api/admin/settings', {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ key: 'googleClientId', value: e.target.value }),
                          })
                        } catch {}
                      }}
                    />
                  </div>
                </div>

                {!settingsLoaded && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando configurações...
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* USERS TAB */}
          <TabsContent value="users" className="space-y-4 mt-4">
            <UsersSection
              users={users}
              loaded={usersLoaded}
              onRefresh={loadUsers}
            />
          </TabsContent>

          {/* HEALTH TAB */}
          <TabsContent value="health" className="space-y-4 mt-4">
            <HealthSection />
          </TabsContent>
        </Tabs>
</main>

      {/* Track Category Management Dialog */}
      <Dialog open={trackCategoryDialogOpen} onOpenChange={setTrackCategoryDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias de Trilhas</DialogTitle>
            <DialogDescription className="text-slate-400">
              Crie, edite ou remova categorias de trilhas. Categorias com itens serão mantidas ao excluir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {managedTrackCategories.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nenhuma categoria configurada</p>
              ) : (
                managedTrackCategories.map((cat, i) => {
                  const catCount = trackCategories.find(tc => tc.name === cat.name)?.count || 0
                  const isEditing = editingCatIndex?.type === 'tracks' && editingCatIndex?.index === i
                  return (
                    <div key={cat.name} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
                      {isEditing ? (
                        <>
                          <Input
                            value={editingCatEmoji}
                            onChange={e => setEditingCatEmoji(e.target.value)}
                            className="bg-slate-800 border-slate-600 text-white h-7 w-12 text-center text-sm px-1"
                            maxLength={4}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditCategory(); if (e.key === 'Escape') cancelEditCategory() }}
                            autoFocus
                          />
                          <Input
                            value={editingCatName}
                            onChange={e => setEditingCatName(e.target.value)}
                            className="bg-slate-800 border-slate-600 text-white h-7 flex-1 text-sm"
                            onKeyDown={e => { if (e.key === 'Enter') saveEditCategory(); if (e.key === 'Escape') cancelEditCategory() }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={saveEditCategory}
                            className="h-7 w-7 text-green-400 hover:text-green-300 shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={cancelEditCategory}
                            className="h-7 w-7 text-slate-400 hover:text-slate-300 shrink-0"
                          >
                            ✕
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-xl">{cat.emoji || '📁'}</span>
                          <span className="text-sm text-white flex-1">{cat.name}</span>
                          <span className="text-xs text-slate-400">{catCount} item(ns)</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditCategory('tracks', i)}
                            className="h-7 w-7 text-slate-400 hover:text-violet-400 shrink-0"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeManagedCategory('tracks', i)}
                            className="h-7 w-7 text-slate-400 hover:text-red-400 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Nome da categoria..."
                className="bg-slate-900/50 border-slate-600 text-white"
                onKeyDown={e => { if (e.key === 'Enter') addManagedCategory('tracks') }}
              />
              <Input
                value={newCatEmoji}
                onChange={e => setNewCatEmoji(e.target.value)}
                placeholder="Emoji"
                className="bg-slate-900/50 border-slate-600 text-white w-20"
                onKeyDown={e => { if (e.key === 'Enter') addManagedCategory('tracks') }}
              />
              <Button
                onClick={() => addManagedCategory('tracks')}
                disabled={savingCategories || !newCatName.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
              >
                {savingCategories ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Voice Category Management Dialog */}
      <Dialog open={voiceCategoryDialogOpen} onOpenChange={setVoiceCategoryDialogOpen}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Gerenciar Categorias de Vozes</DialogTitle>
            <DialogDescription className="text-slate-400">
              Crie, edite ou remova categorias de vozes. Categorias com itens serão mantidas ao excluir.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {managedVoiceCategories.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">Nenhuma categoria configurada</p>
              ) : (
                managedVoiceCategories.map((cat, i) => {
                  const catCount = voiceCategories.find(vc => vc.name === cat.name)?.count || 0
                  const isEditing = editingCatIndex?.type === 'voices' && editingCatIndex?.index === i
                  return (
                    <div key={cat.name} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
                      {isEditing ? (
                        <>
                          <Input
                            value={editingCatEmoji}
                            onChange={e => setEditingCatEmoji(e.target.value)}
                            className="bg-slate-800 border-slate-600 text-white h-7 w-12 text-center text-sm px-1"
                            maxLength={4}
                            onKeyDown={e => { if (e.key === 'Enter') saveEditCategory(); if (e.key === 'Escape') cancelEditCategory() }}
                            autoFocus
                          />
                          <Input
                            value={editingCatName}
                            onChange={e => setEditingCatName(e.target.value)}
                            className="bg-slate-800 border-slate-600 text-white h-7 flex-1 text-sm"
                            onKeyDown={e => { if (e.key === 'Enter') saveEditCategory(); if (e.key === 'Escape') cancelEditCategory() }}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={saveEditCategory}
                            className="h-7 w-7 text-green-400 hover:text-green-300 shrink-0"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={cancelEditCategory}
                            className="h-7 w-7 text-slate-400 hover:text-slate-300 shrink-0"
                          >
                            ✕
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className="text-xl">{cat.emoji || '📁'}</span>
                          <span className="text-sm text-white flex-1">{cat.name}</span>
                          <span className="text-xs text-slate-400">{catCount} item(ns)</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditCategory('voices', i)}
                            className="h-7 w-7 text-slate-400 hover:text-violet-400 shrink-0"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeManagedCategory('voices', i)}
                            className="h-7 w-7 text-slate-400 hover:text-red-400 shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  )
                })
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newCatName}
                onChange={e => setNewCatName(e.target.value)}
                placeholder="Nome da categoria..."
                className="bg-slate-900/50 border-slate-600 text-white"
                onKeyDown={e => { if (e.key === 'Enter') addManagedCategory('voices') }}
              />
              <Input
                value={newCatEmoji}
                onChange={e => setNewCatEmoji(e.target.value)}
                placeholder="Emoji"
                className="bg-slate-900/50 border-slate-600 text-white w-20"
                onKeyDown={e => { if (e.key === 'Enter') addManagedCategory('voices') }}
              />
              <Button
                onClick={() => addManagedCategory('voices')}
                disabled={savingCategories || !newCatName.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
              >
                {savingCategories ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
