// build: 9869573-revert-stable
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  AudioWaveform, Sparkles, Loader2, Download, Play, Pause, Square,
  Volume2, Music, Mic, ChevronRight, Settings2, Globe, Bug, Copy, ChevronDown,
  Upload, CheckCircle2, Zap, FolderOpen, ChevronLeft, Folder
} from 'lucide-react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import VoicePreviewButton from '@/components/voice-preview-button'
import { optimizePronunciation, processControlTags, containsSSML, type TTSEngine } from '@/lib/pronunciation-optimizer'
import { preprocessTTS } from '@/lib/tts-text-preprocessor'

interface TrackControlsProps {
  selectedTrack: { id: string; name: string; audioPath: string; [key: string]: unknown } | null
  trackVolume: number
  duckVolume: number
  fadeInMs: number
  duckFadeMs: number
  unduckFadeMs: number
  fadeOutMs: number
  musicStartLeadMs: number
  showDuckingSettings: boolean
  onTrackVolumeChange: (v: number) => void
  onDuckVolumeChange: (v: number) => void
  onFadeInMsChange: (v: number) => void
  onDuckFadeMsChange: (v: number) => void
  onUnduckFadeMsChange: (v: number) => void
  onFadeOutMsChange: (v: number) => void
  onMusicStartLeadMsChange: (v: number) => void
  onToggleDuckingSettings: () => void
}

function TrackControls({
  selectedTrack,
  trackVolume,
  duckVolume,
  fadeInMs,
  duckFadeMs,
  unduckFadeMs,
  fadeOutMs,
  musicStartLeadMs,
  showDuckingSettings,
  onTrackVolumeChange,
  onDuckVolumeChange,
  onFadeInMsChange,
  onDuckFadeMsChange,
  onUnduckFadeMsChange,
  onFadeOutMsChange,
  onMusicStartLeadMsChange,
  onToggleDuckingSettings,
}: TrackControlsProps) {
  if (!selectedTrack) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm text-slate-400">Volume da Trilha</label>
        <span className="text-xs text-slate-500">{Math.round(trackVolume * 100)}%</span>
      </div>
      <Slider value={[trackVolume]} onValueChange={([v]) => onTrackVolumeChange(v)} min={0} max={1} step={0.05} className="w-full" />
      <div className="pt-3 border-t border-white/10">
        <button onClick={onToggleDuckingSettings} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors w-full">
          <Volume2 className="w-4 h-4" />
          Controles de Ducking
          <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showDuckingSettings ? 'rotate-180' : ''}`} />
        </button>
        {showDuckingSettings && (
          <div className="mt-3 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-slate-400">Volume durante a voz</label>
                <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{Math.round(duckVolume * 100)}%</Badge>
              </div>
              <Slider value={[duckVolume]} onValueChange={([v]) => onDuckVolumeChange(v)} min={0} max={1} step={0.01} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-slate-400">Fade-in inicial</label>
                <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{fadeInMs / 1000}s</Badge>
              </div>
              <Slider value={[fadeInMs]} onValueChange={([v]) => onFadeInMsChange(v)} min={0} max={5000} step={100} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-slate-400">Música antes da voz</label>
                <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{(musicStartLeadMs / 1000).toFixed(1)}s</Badge>
              </div>
              <Slider value={[musicStartLeadMs]} onValueChange={([v]) => onMusicStartLeadMsChange(v)} min={0} max={10000} step={100} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-slate-400">Transição Duck</label>
                <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{duckFadeMs / 1000}s</Badge>
              </div>
              <Slider value={[duckFadeMs]} onValueChange={([v]) => onDuckFadeMsChange(v)} min={0} max={3000} step={50} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-slate-400">Transição Unduck</label>
                <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{unduckFadeMs / 1000}s</Badge>
              </div>
              <Slider value={[unduckFadeMs]} onValueChange={([v]) => onUnduckFadeMsChange(v)} min={0} max={3000} step={50} />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <label className="text-xs text-slate-400">Fade-out final</label>
                <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{fadeOutMs / 1000}s</Badge>
              </div>
              <Slider value={[fadeOutMs]} onValueChange={([v]) => onFadeOutMsChange(v)} min={0} max={8000} step={100} />
            </div>
            <div className="pt-2 border-t border-white/10">
              <p className="text-[10px] text-slate-500 mb-2">Timeline do áudio:</p>
              <div className="flex items-center gap-1 text-[10px]">
                <div className="bg-purple-500/30 border border-purple-500/50 rounded px-2 py-1 text-purple-300">Música {(musicStartLeadMs / 1000).toFixed(1)}s</div>
                <span className="text-slate-600">→</span>
                <div className="bg-green-500/30 border border-green-500/50 rounded px-2 py-1 text-green-300">Voz {duckFadeMs / 1000}s fade</div>
                <span className="text-slate-600">→</span>
                <div className="bg-blue-500/30 border border-blue-500/50 rounded px-2 py-1 text-blue-300">Música volta</div>
                <span className="text-slate-600">→</span>
                <div className="bg-orange-500/30 border border-orange-500/50 rounded px-2 py-1 text-orange-300">Fade {fadeOutMs / 1000}s</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
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
  previewUrl: string
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

interface DuckingConfig {
  duckVolume: number      // volume da música ENQUANTO a voz fala (0-1)
  fadeInMs: number        // tempo de fade-in inicial da música (antes da voz)
  duckFadeMs: number      // tempo de transição (fade) ao reduzir a música quando a voz entra
   unduckFadeMs: number    // tempo de transição ao voltar a música quando a voz termina
  fadeOutMs: number        // tempo de fade-out final da música (após a voz)
  musicStartLeadMs: number // tempo de música ANTES da voz começar
}

const DEFAULT_DUCKING: DuckingConfig = {
  duckVolume: 0.10,
  fadeInMs: 1100,
  duckFadeMs: 500,
  unduckFadeMs: 800,
  fadeOutMs: 2000,
  musicStartLeadMs: 3000,
}

const LANGUAGES = [
  { value: 'Auto', label: 'Auto Detectar' },
  { value: 'Portuguese', label: 'Português' },
  { value: 'English', label: 'Inglês' },
  { value: 'Spanish', label: 'Espanhol' },
  { value: 'French', label: 'Francês' },
  { value: 'German', label: 'Alemão' },
  { value: 'Italian', label: 'Italiano' },
  { value: 'Chinese', label: 'Chinês' },
  { value: 'Japanese', label: 'Japonês' },
  { value: 'Korean', label: 'Coreano' },
  { value: 'Russian', label: 'Russo' },
  { value: 'Arabic', label: 'Árabe' },
  { value: 'Hindi', label: 'Hindi' },
]

// Pronunciation optimization moved to src/lib/pronunciation-optimizer.ts
// (pipeline completa com regex expandido, dicionário PT-BR, e LLM fallback)

/**
 * Converte descrição em texto do Voice Design para os parâmetros estruturados do VozPro.
 * VozPro _design_fn usa dropdowns (gender, age, pitch, style, accent), não texto livre.
 */
function parseVoiceDesignToParams(text: string): { gender: string; age: string; pitch: string; style: string; accent: string } {
  const t = text.toLowerCase().trim()

  let gender = 'Auto'
  if (t.includes('female') || t.includes('mulher') || t.includes('feminina') || t.includes('fêmea')) gender = 'Female / 女'
  else if (t.includes('male') || t.includes('homem') || t.includes('masculino') || t.includes('macho')) gender = 'Male / 男'

  let age = 'Auto'
  if (t.includes('child') || t.includes('criança') || t.includes('crianca')) age = 'Child / 儿童'
  else if (t.includes('teen') || t.includes('adolescente')) age = 'Teenager / 少年'
  else if (t.includes('young') || t.includes('jovem')) age = 'Young Adult / 青年'
  else if (t.includes('middle-aged') || t.includes('meia-idade') || t.includes('meia idade')) age = 'Middle-aged / 中年'
  else if (t.includes('elderly') || t.includes('idoso') || t.includes('velho') || t.includes('old')) age = 'Elderly / 老年'

  let pitch = 'Auto'
  if (t.includes('very low pitch') || t.includes('muito grave')) pitch = 'Very Low Pitch / 极低音调'
  else if (t.includes('low pitch') || t.includes('grave')) pitch = 'Low Pitch / 低音调'
  else if (t.includes('moderate pitch') || t.includes('tom médio') || t.includes('tom medio')) pitch = 'Moderate Pitch / 中音调'
  else if (t.includes('high pitch') || t.includes('agudo')) pitch = 'High Pitch / 高音调'
  else if (t.includes('very high pitch') || t.includes('muito agudo')) pitch = 'Very High Pitch / 极高音调'

  // Style só aceita "Auto" e "Whisper" no VozPro
  let style = 'Auto'
  if (t.includes('whisper') || t.includes('sussurr') || t.includes('sussurro') || t.includes('segredo')) style = 'Whisper / 耳语'

  let accent = 'Auto'
  if (t.includes('american') || t.includes('americano') || t.includes('eua')) accent = 'American Accent / 美式口音'
  else if (t.includes('british') || t.includes('britânico') || t.includes('britanico') || t.includes('inglês') || t.includes('ingles')) accent = 'British Accent / 英国口音'
  else if (t.includes('australian') || t.includes('australiano')) accent = 'Australian Accent / 澳大利亚口音'
  else if (t.includes('brazilian') || t.includes('brasileiro') || t.includes('portuguese') || t.includes('português') || t.includes('portugues') || t.includes('pt-br')) accent = 'Portuguese Accent / 葡萄牙口音'
  else if (t.includes('canadian') || t.includes('canadense')) accent = 'Canadian Accent / 加拿大口音'
  else if (t.includes('indian')) accent = 'Indian Accent / 印度口音'
  else if (t.includes('korean') || t.includes('coreano')) accent = 'Korean Accent / 韩国口音'
  else if (t.includes('japanese') || t.includes('japonês') || t.includes('japones')) accent = 'Japanese Accent / 日本口音'
  else if (t.includes('russian') || t.includes('russo')) accent = 'Russian Accent / 俄罗斯口音'
  else if (t.includes('chinese') || t.includes('chinês') || t.includes('chines')) accent = 'Chinese Accent / 中国口音'

  return { gender, age, pitch, style, accent }
}

/** Get the preview audio URL for a voice, respecting the selected variation */
function getVoicePreviewUrl(voice: Voice, selectedVarId?: string): string | undefined {
  if (voice.previewUrl) return voice.previewUrl
  // If a variation is selected for this voice, use its audio
  if (selectedVarId) {
    const selectedVar = voice.variations.find(v => v.id === selectedVarId)
    if (selectedVar) {
      return selectedVar.refAudioServerUrl || selectedVar.refAudioPath || undefined
    }
  }
  // Fallback to first active variation
  const firstVariation = voice.variations.find(v => v.active !== false)
  return firstVariation?.refAudioServerUrl || firstVariation?.refAudioPath || undefined
}

/**
 * Mix voice audio (base64 data URI) with track audio (URL) using Web Audio API.
 * Com DUCKING: música começa alta, reduz quando a voz entra, volta alta, fade-out final.
 * Returns a base64 data URI of the mixed audio.
 */
async function mixAudioClientSide(
  voiceDataUri: string,
  trackUrl: string,
  trackVolume: number,
  ducking: DuckingConfig = DEFAULT_DUCKING
): Promise<string> {
  const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

  // Fetch and decode voice audio
  const voiceResponse = await fetch(voiceDataUri)
  const voiceArrayBuffer = await voiceResponse.arrayBuffer()
  const voiceBuffer = await audioCtx.decodeAudioData(voiceArrayBuffer)

  // Fetch and decode track audio
  const trackResponse = await fetch(trackUrl)
  const trackArrayBuffer = await trackResponse.arrayBuffer()
  const trackBuffer = await audioCtx.decodeAudioData(trackArrayBuffer)

  // Cálculo da duração total:
  // [lead de música] + [fade-in] + [voz] + [unduck fade] + [fade-out final]
  const leadIn = ducking.musicStartLeadMs / 1000
  const voiceDuration = voiceBuffer.duration
  const tailOut = ducking.unduckFadeMs / 1000 + ducking.fadeOutMs / 1000
  const totalDuration = leadIn + voiceDuration + tailOut + 0.5 // +0.5s buffer
  const sampleRate = voiceBuffer.sampleRate
  const length = Math.round(totalDuration * sampleRate)

  // Force MONO output
  const offlineCtx = new OfflineAudioContext(1, length, sampleRate)

  // Compressor
  const compressor = offlineCtx.createDynamicsCompressor()
  compressor.threshold.value = -12
  compressor.knee.value = 10
  compressor.ratio.value = 4
  compressor.attack.value = 0.003
  compressor.release.value = 0.15
  compressor.connect(offlineCtx.destination)

  // ========== VOZ (full volume, começa após o lead-in) ==========
  const voiceSource = offlineCtx.createBufferSource()
  voiceSource.buffer = voiceBuffer
  const voiceGain = offlineCtx.createGain()
  voiceGain.gain.value = 1.0
  voiceSource.connect(voiceGain)
  voiceGain.connect(compressor)
  voiceSource.start(leadIn) // voz começa após o lead de música

  // ========== MÚSICA com DUCKING ==========
  const trackSource = offlineCtx.createBufferSource()
  trackSource.buffer = trackBuffer
  const trackGain = offlineCtx.createGain()
  const fullVolume = Math.max(0, Math.min(0.7, trackVolume * 0.7))
  const duckVol = Math.max(0, Math.min(ducking.duckVolume, fullVolume))

  // Timeline da música (usando setValueAtTime + linearRampToValueAtTime):
  // t=0              → volume = 0 (fade-in)
  // t=fadeIn          → volume = fullVolume (música alta)
  // t=voiceStart     → começa a reduzir (duck)
  // t=voiceStart+duck→ volume = duckVol (música baixa enquanto a voz fala)
  // t=voiceEnd       → começa a subir (unduck)
  // t=voiceEnd+unduck→ volume = fullVolume (música alta de novo)
  // t=musicEnd       → fade-out até 0

  const voiceStart = leadIn
  const voiceEnd = leadIn + voiceDuration
  const musicFadeOutEnd = voiceEnd + ducking.unduckFadeMs / 1000 + ducking.fadeOutMs / 1000
  const fadeInEnd = Math.min(ducking.fadeInMs / 1000, voiceStart * 0.8) // fade-in não ultrapassa início da voz

  const t = offlineCtx.currentTime
  trackGain.gain.setValueAtTime(0, t)
  // Fade-in inicial
  trackGain.gain.linearRampToValueAtTime(fullVolume, t + fadeInEnd)
  // Permanece alta até a voz começar
  trackGain.gain.setValueAtTime(fullVolume, t + voiceStart)
  // Duck: reduz quando a voz entra
  trackGain.gain.linearRampToValueAtTime(duckVol, t + voiceStart + ducking.duckFadeMs / 1000)
  // Permanece baixa enquanto a voz fala
  trackGain.gain.setValueAtTime(duckVol, t + voiceEnd)
  // Unduck: volta alta quando a voz termina
  trackGain.gain.linearRampToValueAtTime(fullVolume, t + voiceEnd + ducking.unduckFadeMs / 1000)
  // Fade-out final
  trackGain.gain.linearRampToValueAtTime(0, t + musicFadeOutEnd)

  trackSource.connect(trackGain)
  trackGain.connect(compressor)
  trackSource.start(0)

  // Render mixed audio
  const mixedBuffer = await offlineCtx.startRendering()

  // Convert AudioBuffer to WAV
  const wavDataUri = audioBufferToWav(mixedBuffer)

  // Cleanup
  await audioCtx.close()

  return wavDataUri
}

/**
 * Convert an AudioBuffer to a WAV data URI.
 */
function audioBufferToWav(buffer: AudioBuffer): string {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const format = 1 // PCM
  const bitDepth = 16

  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const dataSize = buffer.length * blockAlign
  const headerSize = 44
  const totalSize = headerSize + dataSize

  const arrayBuffer = new ArrayBuffer(totalSize)
  const view = new DataView(arrayBuffer)

  // Write WAV header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, format, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * blockAlign, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitDepth, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Write audio data (interleaved)
  const channels: Float32Array[] = []
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch))
  }

  let offset = 44
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, intSample, true)
      offset += 2
    }
  }

  // Convert to base64
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  const base64 = btoa(binary)

  return `data:audio/wav;base64,${base64}`
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

export default function VozProClient() {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [voices, setVoices] = useState<Voice[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [voiceCategories, setVoiceCategories] = useState<CategoryInfo[]>([])
  const [trackCategories, setTrackCategories] = useState<CategoryInfo[]>([])
  const [selectedVoiceCategory, setSelectedVoiceCategory] = useState<string | null>(null)
  const [selectedTrackCategory, setSelectedTrackCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Selections
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('')
  const [selectedVariationId, setSelectedVariationId] = useState<string>('')
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null)
  const [previewingTrackId, setPreviewingTrackId] = useState<string | null>(null)
  const [selectedTrackId, setSelectedTrackId] = useState<string>('')
  const [trackShowLimit, setTrackShowLimit] = useState(15)
  const [language, setLanguage] = useState('Portuguese')

  // Settings
  const [text, setText] = useState('')
  const [trackEnabled, setTrackEnabled] = useState(false)
  const [trackVolume, setTrackVolume] = useState(0.4)
  const [duckVolume, setDuckVolume] = useState(DEFAULT_DUCKING.duckVolume)
  const [fadeInMs, setFadeInMs] = useState(DEFAULT_DUCKING.fadeInMs)
  const [duckFadeMs, setDuckFadeMs] = useState(DEFAULT_DUCKING.duckFadeMs)
  const [unduckFadeMs, setUnduckFadeMs] = useState(DEFAULT_DUCKING.unduckFadeMs)
  const [fadeOutMs, setFadeOutMs] = useState(DEFAULT_DUCKING.fadeOutMs)
  const [musicStartLeadMs, setMusicStartLeadMs] = useState(DEFAULT_DUCKING.musicStartLeadMs)
  const [showDuckingSettings, setShowDuckingSettings] = useState(false)
  const [speed, setSpeed] = useState(1.0)
  const [numStep, setNumStep] = useState(20)
  const [guidanceScale, setGuidanceScale] = useState(1.5)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pronunciationOptimization, setPronunciationOptimization] = useState(true) // Agente IA de pronúncia (ligado por padrão)
  const [llmPreprocess, setLlmPreprocess] = useState(false) // LLM pré-processador (opcional)

  // Generation state
  const [isGenerating, setIsGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [mixedAudioUrl, setMixedAudioUrl] = useState<string | null>(null)
  const [isMixed, setIsMixed] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [generatingTime, setGeneratingTime] = useState(0)

  // Debug state
  const [lastGenResponse, setLastGenResponse] = useState<Record<string, unknown> | null>(null)
  const [debugOpen, setDebugOpen] = useState(false)
  const [usePhpGenerate, setUsePhpGenerate] = useState(false)
  const [useTunnelGenerate, setUseTunnelGenerate] = useState(true) // GPU local via tunnel (padrao)
  const [ttsModel, setTtsModel] = useState<'f5tts' | 'omnivoice'>('f5tts') // F5-TTS (padrao) ou VozPro (rapido)
  const [omnivoicePhpUrl, setOmnivoicePhpUrl] = useState<string | null>(null) // PHP direto disponivel pro VozPro?

  // Voice mode: clone (ref_audio) | design (instruct only) | auto (random)
  const [voiceMode, setVoiceMode] = useState<'clone' | 'design' | 'auto'>('clone')
  const [omnivoiceAvailable, setOmnivoiceAvailable] = useState(false) // VozPro server disponível?
  const [voiceDesignInstruct, setVoiceDesignInstruct] = useState('')
  const [enableFrontendUpload, setEnableFrontendUpload] = useState(false) // liberado via admin
  const [uploadedVoiceFile, setUploadedVoiceFile] = useState<File | null>(null)
  const [uploadedVoiceUrl, setUploadedVoiceUrl] = useState<string | null>(null)

  const resultAudioRef = useRef<HTMLAudioElement | null>(null)

  // Get selected voice and variation
  const selectedVoice = voices.find(v => v.id === selectedVoiceId)
  const selectedVariation = selectedVoice?.variations.find(v => v.id === selectedVariationId)
  const selectedTrack = tracks.find(t => t.id === selectedTrackId)

  // Check auth — redireciona para /login se não autenticado
  useEffect(() => {
    fetch('/api/auth/verify').then(res => res.json()).then(data => {
      if (!data.authenticated) {
        router.push('/login')
      } else {
        setAuthChecked(true)
      }
    }).catch(() => router.push('/login'))
  }, [router])

  // Load voices and tracks
  useEffect(() => {
    if (!authChecked) return
    const loadData = async () => {
      setLoading(true)
      try {
        const [voicesRes, tracksRes, configRes, settingsRes, trackCatRes, voiceCatRes] = await Promise.all([
          fetch('/api/voices'),
          fetch('/api/tracks'),
          fetch('/api/generate-config'),
          fetch('/api/settings'),
          fetch('/api/track-categories'),
          fetch('/api/voice-categories'),
        ])
        if (voicesRes.ok) {
          const voicesData = await voicesRes.json()
          // Filter out variations without audio for the client
          const filteredVoices = voicesData.map((v: Voice) => ({
            ...v,
            variations: v.variations.filter((varr: VoiceVariation) => varr.refAudioPath),
          })).filter((v: Voice) => v.variations.length > 0)
          setVoices(filteredVoices)
          if (filteredVoices.length > 0) {
            setSelectedVoiceId(filteredVoices[0].id)
          }
        }
        if (tracksRes.ok) {
          const tracksData = await tracksRes.json()
          setTracks(tracksData)
        }
        if (configRes.ok) {
          const configData = await configRes.json()
          setUsePhpGenerate(!!configData.phpServerUrl)
          setUseTunnelGenerate(true)
          // Verificar se VozPro PHP direto esta disponivel
          if (configData.phpServerUrl) {
            try {
              const ovTokenRes = await fetch('/api/omnivoice-token')
              if (ovTokenRes.ok) {
                const ovTokenData = await ovTokenRes.json()
                if (ovTokenData.generateUrl) setOmnivoicePhpUrl(ovTokenData.generateUrl)
              }
            } catch { /* VozPro PHP nao disponivel */ }
          }
        }
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json()
          setEnableFrontendUpload(!!settingsData.enableVoiceUpload)
        }
        if (trackCatRes.ok) setTrackCategories(await trackCatRes.json())
        if (voiceCatRes.ok) setVoiceCategories(await voiceCatRes.json())
        // Verificar se VozPro server esta disponivel
        try {
          const ovRes = await fetch('/api/omnivoice-generate')
          if (ovRes.ok) {
            const ovData = await ovRes.json()
            if (ovData.reachable) setOmnivoiceAvailable(true)
          }
        } catch { /* VozPro nao disponivel, tudo bem */ }
      } catch {
        toast.error('Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [authChecked])

  // Auto-select first variation when voice changes
  useEffect(() => {
    if (selectedVoice && selectedVoice.variations.length > 0) {
      setSelectedVariationId(selectedVoice.variations[0].id)
    } else {
      setSelectedVariationId('')
    }
  }, [selectedVoiceId, selectedVoice])

  // Generate audio
  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      toast.error('Digite o texto para sintetizar')
      return
    }

    // Validar baseado no modo de voz
    if (voiceMode === 'clone' && !selectedVariationId && !uploadedVoiceUrl) {
      toast.error('Selecione uma voz ou faça upload de um áudio de referência')
      return
    }
    // Verificar se a variação selecionada realmente existe na voz selecionada
    if (selectedVariationId && selectedVoice) {
      const variationExists = selectedVoice.variations.some(v => v.id === selectedVariationId)
      if (!variationExists) {
        toast.error('Selecione uma variação de voz válida')
        return
      }
    }
    if (voiceMode === 'design' && !voiceDesignInstruct.trim()) {
      // OK - sem descrição, VozPro vai usar todos os params como Auto
    }
    // Voice Design e Auto Voice so funcionam com VozPro
    if ((voiceMode === 'design' || voiceMode === 'auto') && ttsModel !== 'omnivoice') {
      toast.error('Voice Design e Auto Voice só funcionam com VozPro. Troque o modelo TTS.')
      return
    }

    setIsGenerating(true)
    setAudioUrl(null)
    setMixedAudioUrl(null)
    setIsMixed(false)
    setGeneratingTime(0)
    setPreviewingVoiceId(null)

    // ===== OTIMIZAÇÃO DE PRONÚNCIA (pipeline completo) =====
    let textToSend = text.trim()

    // Se contém SSML, remover todas as tags (abandonado — apenas strip limpo)
    if (containsSSML(textToSend)) {
      textToSend = textToSend.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      console.log('[Pipeline] SSML removido, texto limpo enviado ao TTS')
    }

    // Pipeline normal (sem SSML)
    const engine: TTSEngine = ttsModel === 'omnivoice' ? 'vozpro' : 'f5tts'

    // 1. Control tags (sempre ativo)
    textToSend = processControlTags(textToSend, engine)

    // 1b. H MUDO — remover ANTES de qualquer preprocessamento
    // Palavras problemáticas que o TTS reinventa H mesmo após remoção
    // Usamos [pronúncia] que o VozPro interpreta como pronúncia forçada
    if (pronunciationOptimization) {
      textToSend = textToSend.replace(/\b[Hh]oje\b/gi, '[oje]')
      textToSend = textToSend.replace(/\b[Hh]ora\b/gi, '[ora]')
      textToSend = textToSend.replace(/\b[Hh]omem\b/gi, '[omem]')
      textToSend = textToSend.replace(/\b[Hh]onesto\b/gi, '[onesto]')
      // H mudo geral — remove H de todas as outras palavras
      textToSend = textToSend.replace(/\b[Hh]([aeiouáàãâéèêíïóôõúü])/g, (_, v) => v)
    }

    // 2. Text preprocessor (pontuação, spacing)
    if (pronunciationOptimization) {
      textToSend = preprocessTTS(textToSend)
    }

    // 3. Regex + dictionary pipeline
    if (pronunciationOptimization) {
      textToSend = optimizePronunciation(textToSend)
    }

    // 4. LLM pre-processor (opcional, só quando toggle ativo)
    if (llmPreprocess && textToSend.length > 20) {
      try {
        const res = await fetch('/api/optimize-pronunciation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend }),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.optimized && data.changed) {
            textToSend = data.optimized
          }
        }
      } catch {
        // Fallback silencioso — nunca bloqueia a geração
        console.log('[LLM Pre-process] Falha, usando texto original')
      }
    }

    // Timer para mostrar tempo decorrido ao usuario
    const genStartTime = Date.now()
    const timerInterval = setInterval(() => {
      setGeneratingTime(Math.floor((Date.now() - genStartTime) / 1000))
    }, 1000)

    // Timeout de seguranca do frontend (cancela se demorar mais de 10 min - CPU pode ser lenta)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 600000)

    // Guarda o body e URL da requisição para possível retry ASR
    let lastRequestBody: Record<string, unknown> | null = null
    let lastRequestUrl = ''

    try {
      // Montar instruct a partir dos metadados da voz
      // IMPORTANTE: só usar instruct se a variação pertence à voz selecionada
      const voice = selectedVoice
      const variationBelongsToVoice = selectedVoice?.variations.some(v => v.id === selectedVariationId)
      const instructParts: string[] = []
      if (voice && voice.gender !== 'Auto') instructParts.push(voice.gender.toLowerCase())
      if (voice && voice.age !== 'Auto') instructParts.push(voice.age.toLowerCase())
      if (voice && voice.pitch !== 'Auto') instructParts.push(voice.pitch.toLowerCase())
      if (voice && voice.accent !== 'Auto') instructParts.push(voice.accent.toLowerCase())
      // Só adicionar instruct da variação se ela realmente pertence à voz selecionada
      if (variationBelongsToVoice && selectedVariation?.instruct && selectedVariation.instruct.trim()) {
        instructParts.push(selectedVariation.instruct.trim())
      }
      const instructStr = instructParts.join(', ')

      // CORPO DA REQUISICAO - todos os dados que o PHP precisa
      const body: Record<string, unknown> = {
        text: textToSend,
        language,
        refAudioUrl: selectedVariation?.refAudioServerUrl || '',
        refAudioPath: selectedVariation?.refAudioPath || '',
        refText: selectedVariation?.refText || '',  // usa texto preenchido pelo admin; vazio = Whisper auto-transcreve (pode errar)
        instruct: instructStr,
        refAudioName: selectedVariation?.refAudioName || 'ref_audio.wav',
        speed,
        numStep,
        guidanceScale,
      }

      let res: Response

      // ===== VOZPRO TURBO: Modelo rapido (RTF 0.025) =====
      if (ttsModel === 'omnivoice') {
        // Design: parseia texto para dropdowns do VozPro. Auto: tudo Auto. Clone: não usa.
        const isAutoMode = voiceMode === 'auto'
        const isDesignMode = voiceMode === 'design'
        const designParams = isDesignMode ? parseVoiceDesignToParams(voiceDesignInstruct) : { gender: 'Auto', age: 'Auto', pitch: 'Auto', style: 'Auto', accent: 'Auto' }

        const ovBody: Record<string, unknown> = {
          text: textToSend,
          mode: voiceMode,
          instruct: '', // _design_fn não usa instruct (usa dropdowns)
          referenceAudioUrl: voiceMode === 'clone' ? (uploadedVoiceUrl || selectedVariation?.refAudioServerUrl || '') : '',
          referenceAudioName: voiceMode === 'clone' ? (uploadedVoiceFile?.name || selectedVariation?.refAudioName || 'ref_audio.wav') : '',
          refText: selectedVariation?.refText || '',
          numStep: 32, // VozPro: 32 = qualidade (padrao), 16 = rapido mas pode errar palavras
          speed,
          language: language, // usa o idioma selecionado pelo usuario (Portuguese, Auto, etc)
          // Voice Design params (usados pelo _design_fn endpoint)
          gender: isAutoMode ? 'Auto' : (isDesignMode ? designParams.gender : 'Auto'),
          age: isAutoMode ? 'Auto' : (isDesignMode ? designParams.age : 'Auto'),
          pitch: isAutoMode ? 'Auto' : (isDesignMode ? designParams.pitch : 'Auto'),
          style: isAutoMode ? 'Auto' : (isDesignMode ? designParams.style : 'Auto'),
          accent: isAutoMode ? 'Auto' : (isDesignMode ? designParams.accent : 'Auto'),
        }

        if (omnivoicePhpUrl) {
          // ===== OMNIVOICE PHP DIRETO: browser -> PHP sorteiomax -> tunnel -> GPU (ZERO Vercel) =====
          console.log('[VozPro] Gerando via VozPro PHP direto (bypassa Vercel)...')
          const tokenRes = await fetch('/api/omnivoice-token')
          if (!tokenRes.ok) {
            toast.error('Erro ao obter token VozPro')
            return
          }
          const { generateUrl: phpDirectUrl, token } = await tokenRes.json()
          lastRequestBody = ovBody

          if (!phpDirectUrl || !token) {
            toast.error('VozPro PHP nao configurado, usando Vercel...')
            // Fallback pra Vercel
            lastRequestUrl = '/api/omnivoice-generate'
            res = await fetch('/api/omnivoice-generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(ovBody),
              signal: controller.signal,
            })
          } else {
            lastRequestUrl = phpDirectUrl
            res = await fetch(phpDirectUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Generate-Token': token,
              },
              body: JSON.stringify(ovBody),
              signal: controller.signal,
            })
          }
        } else {
          // ===== OMNIVOICE VIA VERCEL (fallback) =====
          console.log('[VozPro] Gerando via VozPro via Vercel (sem PHP direto)...')
          lastRequestBody = ovBody
          lastRequestUrl = '/api/omnivoice-generate'
          res = await fetch('/api/omnivoice-generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ovBody),
            signal: controller.signal,
          })
        }
      } else if (useTunnelGenerate) {
        // ===== TUNNEL DIRETO: Vercel -> GPU local via cloudflared =====
        console.log(`[VozPro] Gerando via tunnel (GPU local)... modo: ${voiceMode}`)

        // Determinar instruct baseado no modo
        let finalInstruct = instructStr
        if (voiceMode === 'design') {
          finalInstruct = voiceDesignInstruct
        }

        // Determinar audio de referencia
        let refUrl = selectedVariation?.refAudioServerUrl || body.refAudioUrl
        let refName = body.refAudioName || 'ref_audio.wav'

        // Se tem upload de voz do frontend, usa ele
        if (voiceMode === 'clone' && uploadedVoiceUrl) {
          refUrl = uploadedVoiceUrl
          refName = uploadedVoiceFile?.name || 'uploaded_voice.wav'
        }

        const tunnelBody = {
          ...body,
          referenceAudioUrl: voiceMode !== 'clone' ? undefined : refUrl,
          referenceAudioName: voiceMode !== 'clone' ? undefined : refName,
          instruct: finalInstruct,
          voiceMode,
          useChunking: true,  // modo prosódia: gera frase por frase com pausas reais
        }
        res = await fetch('/api/tunnel-generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tunnelBody),
          signal: controller.signal,
        })
      } else if (usePhpGenerate) {
        // ===== PHP DIRETO: browser -> PHP (bypass Vercel timeout!) =====
        const tokenRes = await fetch('/api/generate-token')
        if (!tokenRes.ok) {
          toast.error('Erro ao obter token de geracao')
          return
        }
        const { generateUrl: phpDirectUrl, token } = await tokenRes.json()

        if (!phpDirectUrl || !token) {
          toast.error('Servidor PHP nao configurado corretamente')
          return
        }

        console.log('[VozPro] Gerando via PHP direto (sem Vercel proxy)...')

        res = await fetch(phpDirectUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Generate-Token': token,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      } else {
        // ===== Vercel API direta (HF Space) =====
        res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
      }

      if (!res.ok) {
        let errorMsg = `Erro do servidor (${res.status})`
        let debugData = null

        // Tenta ler como JSON, depois como texto (Vercel 504 retorna HTML)
        try {
          const errText = await res.text()
          try {
            const errData = JSON.parse(errText)
            errorMsg = errData.erro || errData.error || errorMsg
            debugData = errData.debug || null
          } catch {
            // Nao e JSON (provavelmente HTML do Vercel em caso de 504)
            if (errText.length > 10 && errText.length < 1000) {
              errorMsg = `Erro ${res.status}: ${errText.substring(0, 300)}`
            }
          }
        } catch {}

        // Mensagem especifica para 504 (timeout do Vercel ou PHP)
        if (res.status === 504) {
          errorMsg = 'A geracao de voz demorou demais e excedeu o tempo limite.'
        }

        // Mensagem especifica para 401 (token invalido/expirado)
        if (res.status === 401) {
          errorMsg = 'Token de geracao invalido. Tente novamente.'
        }

        console.error('[VozPro] Generate error:', errorMsg, { debugData })

        // SEMPRE mostra debug, mesmo sem dados do servidor
        if (debugData) {
          setLastGenResponse({ debug: debugData, error: errorMsg })
        } else {
          setLastGenResponse({
            error: errorMsg,
            debug: {
              totalDuration: Date.now() - genStartTime,
              steps: [
                { time: new Date().toISOString(), step: 'Erro HTTP ' + res.status, status: 'error', detail: errorMsg, duration: Date.now() - genStartTime }
              ]
            }
          })
        }

        toast.error(errorMsg, {
          description: res.status === 504
            ? 'O servidor de IA esta lento. Tente um texto mais curto ou aguarde alguns minutos.'
            : res.status === 401
              ? 'Recarregue a pagina e tente novamente.'
              : 'Aguarde alguns segundos e tente novamente.'
        })
        return
      }

      const data = await res.json()
      console.log('[VozPro] Generate response:', { hasAudioUrl: !!data.audioUrl, hasTrackUrl: !!data.trackUrl, clientMix: data.clientMix })

      if (data.error || data.erro) {
        const errMsg = data.erro || data.error
        console.error('[VozPro] API returned error:', errMsg)
        if (data.debug) setLastGenResponse({ debug: data.debug, error: errMsg })
        toast.error(errMsg, { description: 'Aguarde alguns segundos e tente novamente.' })
        return
      }

      // Store full response for debugging
      setLastGenResponse(data)

      if (!data.audioUrl) {
        console.error('[VozPro] No audio returned from API', data)
        toast.error('Nenhum áudio foi retornado. Verifique o console para detalhes.')
        return
      }

      // ===== ASR RETRY AUTOMÁTICO (VozPro) =====
      // Valida pronúncia e refaz automaticamente se errou
      let finalAudioUrl = data.audioUrl
      const maxAsrRetries = ttsModel === 'omnivoice' ? 2 : 0 // Só VozPro faz retry (é rápido)
      const originalTextForCompare = textToSend.replace(/\[.*?\]/g, '') // Remove colchetes de pronúncia pra comparar

      if (maxAsrRetries > 0 && originalTextForCompare.split(/\s+/).length >= 5) {
        for (let retryAttempt = 0; retryAttempt < maxAsrRetries; retryAttempt++) {
          try {
            // Extrair base64 do data URI
            const base64Data = finalAudioUrl.includes(',')
              ? finalAudioUrl.split(',')[1]
              : finalAudioUrl

            const validateRes = await fetch('/api/asr-validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                audioBase64: base64Data,
                text: originalTextForCompare,
              }),
            })

            if (validateRes.ok) {
              const validation = await validateRes.json()
              if (validation.skipped || validation.valid) {
                console.log('[VozPro] ASR validou:', validation.skipped ? validation.reason : `OK (${validation.wordCoverage}% cobertura)`)
                break // Áudio OK, segue
              }

              // ASR rejeitou — tentar regerar
              console.log('[VozPro] ASR rejeitou, retry', retryAttempt + 1, '— palavras perdidas:', validation.missedWords?.join(', '))
              if (retryAttempt < maxAsrRetries - 1 && lastRequestBody && lastRequestUrl) {
                toast.info('Ajustando pronúncia...', { description: 'Regenerando para melhor qualidade.', duration: 2000 })

                // Regenerar com a mesma chamada
                const retryHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
                if (lastRequestUrl.includes('sorteiomax')) {
                  // PHP direto precisa de token novo
                  try {
                    const newTokenRes = await fetch('/api/omnivoice-token')
                    if (newTokenRes.ok) {
                      const { token: newToken } = await newTokenRes.json()
                      if (newToken) retryHeaders['X-Generate-Token'] = newToken
                    }
                  } catch { /* sem token, tenta sem */ }
                }

                const retryRes = await fetch(lastRequestUrl, {
                  method: 'POST',
                  headers: retryHeaders,
                  body: JSON.stringify(lastRequestBody),
                  signal: controller.signal,
                })

                if (retryRes.ok) {
                  const retryData = await retryRes.json()
                  if (retryData.audioUrl) {
                    finalAudioUrl = retryData.audioUrl
                    continue // Tenta validar de novo
                  }
                }
                break // Retry falhou, usa o que tem
              }
            }
          } catch (asrErr) {
            console.warn('[VozPro] ASR retry falhou, usando áudio:', asrErr)
            break
          }
        }
      }

      // Mixagem client-side com trilha (funciona tanto com PHP quanto Vercel)
      if (trackEnabled && selectedTrack?.audioPath) {
        console.log('[VozPro] Client-side mixing, mixing voice + track...')
        toast.info('Mixando voz com trilha...')

        try {
          const mixedDataUri = await mixAudioClientSide(
            finalAudioUrl,
            selectedTrack.audioPath,
            trackVolume,
            { duckVolume, fadeInMs, duckFadeMs, unduckFadeMs, fadeOutMs, musicStartLeadMs }
          )
          setAudioUrl(finalAudioUrl)
          setMixedAudioUrl(mixedDataUri)
          setIsMixed(true)
          toast.success(`Audio gerado com trilha "${selectedTrack.name}"!${data.viaDirectPhp ? ' (PHP direto)' : data.viaPhp ? ' (via PHP)' : ''}`)
        } catch (mixErr) {
          console.error('[VozPro] Client-side mixing failed:', mixErr)
          setAudioUrl(finalAudioUrl)
          toast.warning('Não foi possível mixar a trilha. Reproduzindo apenas a voz.')
        }
      } else {
        // No track - just voice
        setAudioUrl(finalAudioUrl)

        if (data.mixedAudio) {
          setMixedAudioUrl(data.mixedAudio)
          setIsMixed(true)
        }

        toast.success('Áudio gerado com sucesso!')
      }

      // Feedback do ASR Validator (camada 2 de qualidade)
      if (data.asrWarning) {
        toast.warning('Qualidade da voz', {
          description: data.asrMessage || 'O audio pode conter imperfeicoes. Tente outra voz ou texto mais curto.',
          duration: 6000,
        })
      } else if (data.asrValidation && !data.asrValidation.valid) {
        // ASR rejeitou mas não houve retry (texto curto, etc)
        console.warn('[VozPro] ASR rejeitou:', data.asrValidation)
      } else if (data.asrValidation?.attempts > 1) {
        // ASR regenerou automaticamente (tudo ok agora)
        toast.success('Qualidade verificada', {
          description: `Audio regenerado automaticamente (${data.asrValidation.attempts} tentativas).`,
          duration: 4000,
        })
      }

      if (data.warning) {
        toast.warning(data.warning)
      }
    } catch (err) {
      console.error('[VozPro] Generate exception:', err)
      const elapsed = Date.now() - genStartTime

      if (err instanceof DOMException && err.name === 'AbortError') {
        // Timeout do frontend (10 min - CPU HF Space)
        toast.error('Tempo limite excedido', { description: 'A geracao demorou mais de 10 minutos. Tente um texto mais curto.' })
        setLastGenResponse({
          error: 'Timeout do frontend (10 min CPU) — abortado automaticamente',
          debug: {
            totalDuration: elapsed,
            steps: [
              { time: new Date().toISOString(), step: 'Timeout Frontend', status: 'error', detail: `AbortController abortou apos 10min CPU (${(elapsed / 1000).toFixed(0)}s decorridos).`, duration: elapsed }
            ]
          }
        })
      } else {
        toast.error('Erro de conexão com o servidor')
        setLastGenResponse({
          error: err instanceof Error ? err.message : 'Erro desconhecido',
          debug: {
            totalDuration: elapsed,
            steps: [
              { time: new Date().toISOString(), step: 'Exceção', status: 'error', detail: err instanceof Error ? err.message : String(err), duration: elapsed }
            ]
          }
        })
      }
    } finally {
      clearInterval(timerInterval)
      clearTimeout(timeoutId)
      setIsGenerating(false)
      setGeneratingTime(0)
    }
  }, [text, selectedVariationId, language, speed, numStep, guidanceScale, trackEnabled, selectedTrackId, trackVolume, duckVolume, fadeInMs, duckFadeMs, unduckFadeMs, fadeOutMs, musicStartLeadMs, omnivoicePhpUrl, ttsModel, voiceMode, uploadedVoiceUrl, pronunciationOptimization, llmPreprocess])

  // Get the active audio URL
  const activeAudioUrl = mixedAudioUrl || audioUrl

  // Sync playback state with result audio element
  useEffect(() => {
    const el = resultAudioRef.current
    if (!el) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onEnded = () => setIsPlaying(false)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    el.addEventListener('ended', onEnded)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
      el.removeEventListener('ended', onEnded)
    }
  }, [activeAudioUrl])

  const togglePlayback = useCallback(() => {
    const el = resultAudioRef.current
    if (!el) return
    if (el.paused) {
      el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [])

  const stopPlayback = useCallback(() => {
    const el = resultAudioRef.current
    if (el) {
      el.pause()
      el.currentTime = 0
      setIsPlaying(false)
    }
  }, [])

  const handleDownload = useCallback(async () => {
    const url = mixedAudioUrl || audioUrl
    if (!url) return

    toast.info('Convertendo para MP3...')

    try {
      let audioBuffer: AudioBuffer

      if (url.startsWith('data:')) {
        // Base64 audio
        const byteString = atob(url.split(',')[1])
        const ab = new ArrayBuffer(byteString.length)
        const ia = new Uint8Array(ab)
        for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i)
        const blob = new Blob([ab], { type: url.split(',')[0].split(':')[1].split(';')[0] })
        const arrayBuffer = await blob.arrayBuffer()
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        await audioCtx.close()
      } else {
        // Remote URL
        const response = await fetch(url)
        const arrayBuffer = await response.arrayBuffer()
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
        await audioCtx.close()
      }

      // Encode to MP3 using lamejs
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
      const numCh = Math.min(audioBuffer.numberOfChannels, 2)
      const sr = audioBuffer.sampleRate
      const encoder = new Mp3Encoder(numCh, sr, 320)
      const mp3Data: Int8Array[] = []
      const sampleBlockSize = 1152
      const left = audioBuffer.getChannelData(0)
      const right = numCh > 1 ? audioBuffer.getChannelData(1) : left

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

      const blob = new Blob(mp3Data, { type: 'audio/mpeg' })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `vozpro_${Date.now()}.mp3`
      a.click()
      URL.revokeObjectURL(blobUrl)
      toast.success('MP3 baixado com sucesso!')
    } catch (err) {
      console.error('MP3 encode error:', err)
      // Fallback: download as original
      const a = document.createElement('a')
      a.href = url
      a.download = `vozpro_${Date.now()}.wav`
      a.click()
      toast.error('Erro ao converter MP3, baixando WAV original.')
    }
  }, [mixedAudioUrl, audioUrl])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950">
        <div className="text-center">
          <AudioWaveform className="w-12 h-12 mx-auto mb-4 text-violet-400 animate-pulse" />
          <p className="text-violet-300">Carregando VozPro...</p>
        </div>
      </div>
    )
  }

  // Aguardar verificação de autenticação
  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950">
        <div className="text-center text-slate-400">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p>Verificando acesso...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-violet-950 via-slate-900 to-slate-950">

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-slate-900/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <AudioWaveform className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">VozPro</h1>
              <p className="text-xs text-violet-300/70">Vozes Profissionais com IA</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-violet-500/30 text-violet-300 gap-1">
              <Globe className="w-3 h-3" />
              Online
            </Badge>
            <button
              onClick={async () => {
                await fetch('/api/auth', { method: 'DELETE' })
                router.push('/login')
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
              title="Sair"
            >
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 container mx-auto px-4 py-6 max-w-6xl">
        {/* Hero */}
        <div className="mb-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-2">
            Crie Vozes <span className="bg-gradient-to-r from-violet-400 to-purple-400 bg-clip-text text-transparent">Profissionais</span>
          </h2>
          <p className="text-slate-400 max-w-xl mx-auto">
            Escolha uma voz, selecione a emoção, digite seu texto e gere áudios incríveis para propagandas, vídeos e conteúdo.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Panel - Voice & Track Selection */}
          <div className="lg:col-span-3 space-y-5">
            {/* TTS Model Selector */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-5 h-5 text-amber-400" />
                  <h3 className="text-lg font-bold text-white">Modelo TTS</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTtsModel('f5tts')}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      ttsModel === 'f5tts'
                        ? 'border-violet-500 bg-violet-500/20 shadow-lg shadow-violet-500/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="text-2xl mb-1">🎙️</div>
                    <div className={`text-xs font-medium ${ttsModel === 'f5tts' ? 'text-violet-200' : 'text-slate-400'}`}>
                      F5-TTS
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">Clonagem fiel, chunking</div>
                  </button>
                  <button
                    onClick={() => setTtsModel('omnivoice')}
                    disabled={!omnivoiceAvailable}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      ttsModel === 'omnivoice'
                        ? 'border-amber-500 bg-amber-500/20 shadow-lg shadow-amber-500/10'
                        : omnivoiceAvailable
                          ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
                          : 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-2xl mb-1">⚡</div>
                    <div className={`text-xs font-medium ${ttsModel === 'omnivoice' ? 'text-amber-200' : 'text-slate-400'}`}>
                      VozPro Turbo
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">
                      {omnivoiceAvailable ? 'RTF 0.025, 600+ idiomas' : 'Servidor offline'}
                    </div>
                  </button>
                </div>
                {ttsModel === 'omnivoice' && (
                  <p className="text-[10px] text-amber-400/80">
                    VozPro suporta: Voice Design, pronúncia CMU [B EY1 S], símbolos [laughter], e 600+ idiomas.
                    Voice Design e Auto Voice funcionam melhor no VozPro.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Voice Selection */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-lg">
                  <Mic className="w-5 h-5 text-violet-400" />
                  Escolha a Voz
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {voices.length === 0 ? (
                  <p className="text-slate-400 text-center py-6">Nenhuma voz disponível no momento</p>
                ) : selectedVoiceCategory ? (
                  /* INSIDE A VOICE CATEGORY */
                  <>
                    <button
                      onClick={() => { setSelectedVoiceCategory(null); setSelectedVoiceId(''); setSelectedVariationId('') }}
                      className="flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Todas &gt; <span className="font-semibold">{selectedVoiceCategory}</span>
                    </button>
                    {voices.filter(v => v.category === selectedVoiceCategory).length === 0 ? (
                      <div className="text-center py-6">
                        <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <p className="text-slate-500 text-sm">Pasta vazia</p>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {voices.filter(v => v.category === selectedVoiceCategory).map((voice) => (
                            <button
                              key={voice.id}
                              onClick={() => setSelectedVoiceId(voice.id)}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                selectedVoiceId === voice.id
                                  ? 'border-violet-500 bg-violet-500/20 shadow-lg shadow-violet-500/10'
                                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Mic className={`w-4 h-4 ${selectedVoiceId === voice.id ? 'text-violet-400' : 'text-slate-500'}`} />
                                <span className={`font-medium text-sm flex-1 min-w-0 ${selectedVoiceId === voice.id ? 'text-violet-200' : 'text-slate-300'}`}>
                                  {voice.name}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-1">{voice.description}</p>
                            </button>
                          ))}
                        </div>
                        {selectedVoice && selectedVoice.variations.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-slate-300 mb-2">Estilo / Emoção</p>
                            <div className="flex flex-wrap gap-2">
                              {selectedVoice.variations.map((v) => {
                                const varAudioUrl = v.refAudioServerUrl || v.refAudioPath || ''
                                return (
                                  <button key={v.id} onClick={() => setSelectedVariationId(v.id)} className={`px-4 py-2 rounded-full border text-sm transition-all flex items-center gap-1.5 ${selectedVariationId === v.id ? 'border-violet-500 bg-violet-500/20 text-violet-200' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'}`}>
                                    <VoicePreviewButton
                                      audioUrl={varAudioUrl}
                                      voiceId={v.id}
                                      currentlyPlayingId={previewingVoiceId}
                                      onPlayStart={setPreviewingVoiceId}
                                      onPlayEnd={() => setPreviewingVoiceId(null)}
                                    />
                                    <span>{v.emoji || '🎙️'}</span>
                                    <span>{v.label}</span>
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : voiceCategories.length > 0 ? (
                  /* FOLDER GRID VIEW */
                  <>
                    {/* Uncategorized voices */}
                    {voices.filter(v => !v.category).length > 0 && (
                      <div className="mb-4">
                        <p className="text-xs text-slate-500 mb-2">Sem categoria</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {voices.filter(v => !v.category).map((voice) => (
                            <button
                              key={voice.id}
                              onClick={() => setSelectedVoiceId(voice.id)}
                              className={`p-3 rounded-xl border text-left transition-all ${
                                selectedVoiceId === voice.id
                                  ? 'border-violet-500 bg-violet-500/20 shadow-lg shadow-violet-500/10'
                                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                              }`}
                            >
                              <div className="flex items-center gap-2 mb-1">
                                <Mic className={`w-4 h-4 ${selectedVoiceId === voice.id ? 'text-violet-400' : 'text-slate-500'}`} />
                                <span className={`font-medium text-sm flex-1 min-w-0 ${selectedVoiceId === voice.id ? 'text-violet-200' : 'text-slate-300'}`}>
                                  {voice.name}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 line-clamp-1">{voice.description}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {voiceCategories.map(cat => (
                        <button
                          key={cat.name}
                          onClick={() => { setSelectedVoiceCategory(cat.name); setSelectedVoiceId(''); setSelectedVariationId('') }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-violet-500/10 hover:border-violet-500/50 transition-all duration-200 cursor-pointer group"
                        >
                          <span className="text-base group-hover:scale-110 transition-transform">{cat.emoji || '📁'}</span>
                          <span className="text-sm font-medium text-white whitespace-nowrap">{cat.name}</span>
                          <span className="text-xs text-slate-500 bg-white/5 px-1.5 py-0.5 rounded-md">{cat.count}</span>
                        </button>
                      ))}
                    </div>
                    {/* Show variations for uncategorized voices if selected */}
                    {selectedVoice && !selectedVoice.category && selectedVoice.variations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-slate-300 mb-2">Estilo / Emoção</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedVoice.variations.map((v) => {
                            const varAudioUrl = v.refAudioServerUrl || v.refAudioPath || ''
                            return (
                              <button key={v.id} onClick={() => setSelectedVariationId(v.id)} className={`px-4 py-2 rounded-full border text-sm transition-all flex items-center gap-1.5 ${selectedVariationId === v.id ? 'border-violet-500 bg-violet-500/20 text-violet-200' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'}`}>
                                <VoicePreviewButton
                                  audioUrl={varAudioUrl}
                                  voiceId={v.id}
                                  currentlyPlayingId={previewingVoiceId}
                                  onPlayStart={setPreviewingVoiceId}
                                  onPlayEnd={() => setPreviewingVoiceId(null)}
                                />
                                <span>{v.emoji || '🎙️'}</span>
                                <span>{v.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* No categories - show flat list as before */
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {voices.map((voice) => (
                        <button
                          key={voice.id}
                          onClick={() => setSelectedVoiceId(voice.id)}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            selectedVoiceId === voice.id
                              ? 'border-violet-500 bg-violet-500/20 shadow-lg shadow-violet-500/10'
                              : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Mic className={`w-4 h-4 ${selectedVoiceId === voice.id ? 'text-violet-400' : 'text-slate-500'}`} />
                            <span className={`font-medium text-sm flex-1 min-w-0 ${selectedVoiceId === voice.id ? 'text-violet-200' : 'text-slate-300'}`}>
                              {voice.name}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1">{voice.description}</p>
                        </button>
                      ))}
                    </div>
                    {selectedVoice && selectedVoice.variations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-slate-300 mb-2">Estilo / Emoção</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedVoice.variations.map((v) => {
                            const varAudioUrl = v.refAudioServerUrl || v.refAudioPath || ''
                            return (
                              <button key={v.id} onClick={() => setSelectedVariationId(v.id)} className={`px-4 py-2 rounded-full border text-sm transition-all flex items-center gap-1.5 ${selectedVariationId === v.id ? 'border-violet-500 bg-violet-500/20 text-violet-200' : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'}`}>
                                <VoicePreviewButton
                                  audioUrl={varAudioUrl}
                                  voiceId={v.id}
                                  currentlyPlayingId={previewingVoiceId}
                                  onPlayStart={setPreviewingVoiceId}
                                  onPlayEnd={() => setPreviewingVoiceId(null)}
                                />
                                <span>{v.emoji || '🎙️'}</span>
                                <span>{v.label}</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Voice Mode Selector + Upload + Design */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-lg">
                  <Mic className="w-5 h-5 text-purple-400" />
                  Modo de Voz
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mode buttons */}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setVoiceMode('clone')}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      voiceMode === 'clone'
                        ? 'border-violet-500 bg-violet-500/20'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="text-lg mb-1">🎙️</div>
                    <div className={`text-xs font-medium ${voiceMode === 'clone' ? 'text-violet-200' : 'text-slate-400'}`}>
                      Clonar Voz
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">Usa áudio de referência</div>
                  </button>
                  <button
                    onClick={() => setVoiceMode('design')}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      voiceMode === 'design'
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="text-lg mb-1">✨</div>
                    <div className={`text-xs font-medium ${voiceMode === 'design' ? 'text-purple-200' : 'text-slate-400'}`}>
                      Voice Design
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">Cria voz com descrição</div>
                  </button>
                  <button
                    onClick={() => setVoiceMode('auto')}
                    className={`p-3 rounded-xl border text-center transition-all ${
                      voiceMode === 'auto'
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="text-lg mb-1">🎲</div>
                    <div className={`text-xs font-medium ${voiceMode === 'auto' ? 'text-blue-200' : 'text-slate-400'}`}>
                      Voz Auto
                    </div>
                    <div className="text-[10px] text-slate-600 mt-1">Modelo escolhe sozinho</div>
                  </button>
                </div>

                {/* Voice Design input */}
                {voiceMode === 'design' && (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <label className="text-sm text-slate-400">Descreva a voz desejada</label>
                    <Input
                      value={voiceDesignInstruct}
                      onChange={(e) => setVoiceDesignInstruct(e.target.value)}
                      placeholder="female, young, low pitch, whisper, british accent"
                      className="bg-white/5 border-white/10 text-white"
                    />
                    <p className="text-[10px] text-slate-600">
                      Atributos: <b>gender</b> (male/female), <b>age</b> (child/teen/young/old), <b>pitch</b> (low/moderate/high), <b>style</b> (whisper), <b>accent</b> (brazilian/british/american/japanese)
                    </p>
                  </div>
                )}

                {/* Auto mode hint */}
                {voiceMode === 'auto' && (
                  <div className="pt-2 border-t border-white/10">
                    <p className="text-xs text-blue-300/70 text-center">
                      O VozPro vai criar uma voz aleatória. Cada geração será diferente!
                    </p>
                  </div>
                )}

                {/* Upload voz (no modo clone) - somente se liberado pelo admin */}
                {voiceMode === 'clone' && enableFrontendUpload && (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <label className="text-sm text-slate-400">Upload de Voz (opcional)</label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-sm text-slate-300 transition-colors">
                        <input
                          key={uploadedVoiceUrl || 'upload-input'}
                          type="file"
                          accept="audio/*"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            // Limpar upload anterior
                            setUploadedVoiceUrl(null)
                            setUploadedVoiceFile(null)
                            // Limpar seleção de voz (upload substitui a seleção)
                            setSelectedVoiceId('')
                            setSelectedVariationId('')
                            setUploadedVoiceFile(file)
                            toast.info('Enviando áudio...')
                            const formData = new FormData()
                            formData.append('file', file)
                            try {
                              const res = await fetch('/api/upload-voice', {
                                method: 'POST',
                                body: formData,
                              })
                              const data = await res.json()
                              if (data.serverUrl) {
                                setUploadedVoiceUrl(data.serverUrl)
                                toast.success(`Áudio "${file.name}" carregado!`) 
                              } else {
                                toast.error(data.error || 'Falha no upload')
                                setUploadedVoiceFile(null)
                              }
                            } catch {
                              toast.error('Erro ao enviar áudio')
                              setUploadedVoiceFile(null)
                            }
                          }}
                          className="hidden"
                        />
                        <Upload className="w-4 h-4 inline mr-1" />
                        Enviar Áudio
                      </label>
                      {uploadedVoiceUrl && (
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <span className="text-xs text-green-300 truncate max-w-[150px]">
                            {uploadedVoiceFile?.name}
                          </span>
                          <button
                            onClick={() => { setUploadedVoiceUrl(null); setUploadedVoiceFile(null) }}
                            className="text-slate-500 hover:text-red-400 text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-600">Áudio de 3-10 segundos. Substitui a voz selecionada acima.</p>
                  </div>
                )}

                {/* Pronúncia CMU */}
                <div className="space-y-2 pt-2 border-t border-white/10">
                  <label className="text-sm text-slate-400">Dica: Controle de Pronúncia</label>
                  <p className="text-[10px] text-slate-600">
                    Use colchetes para corrigir pronúncia: "He plays the [B EY1 S] guitar"
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Text Input */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="pt-5 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-slate-300">Texto para Sintetizar</label>
                    <span className="text-xs text-slate-500">{text.length} caracteres</span>
                  </div>
                  <Textarea
                    id="tts-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Digite o texto que deseja que a voz fale... Ex: Na compra de qualquer produto, ganhe 50% de desconto! Aproveite essa promoção exclusiva!"
                    rows={4}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none focus:border-violet-500"
                  />
                </div>

                {/* Pronunciation Optimization Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-xs text-slate-400">Otimização de pronúncia IA</span>
                  </div>
                  <Switch
                    checked={pronunciationOptimization}
                    onCheckedChange={setPronunciationOptimization}
                  />
                </div>

                {/* LLM Pre-processor Toggle */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="llm-preprocess"
                      checked={llmPreprocess}
                      onCheckedChange={setLlmPreprocess}
                    />
                    <Label htmlFor="llm-preprocess" className="text-xs text-slate-400 cursor-pointer">
                      IA Pré-processamento (lento, mais preciso)
                    </Label>
                  </div>
                </div>

                {/* Emotion presets - insert control tags into text */}
                {pronunciationOptimization && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-slate-500">Prosódia:</span>
                    {[
                      { label: '📖 Normal', insert: '' },
                      { label: '🤫 Sussurro', insert: ' ', action: 'whisper' as const },
                      { label: '⚡ Rápido', insert: ' ', action: 'fast' as const },
                      { label: '🐢 Devagar', insert: ' ', action: 'slow' as const },
                      { label: '⏸️ Pausa longa', insert: '... ' },
                      { label: '⏸️ Pausa curta', insert: '.. ' },
                    ].map(preset => (
                      <button
                        key={preset.label}
                        onClick={() => {
                          const textarea = document.getElementById('tts-text') as HTMLTextAreaElement
                          if (!textarea) return
                          const start = textarea.selectionStart
                          const end = textarea.selectionEnd
                          const currentText = textarea.value
                          if ('action' in preset && preset.action) {
                            const selected = currentText.substring(start, end)
                            if (selected) {
                              const newText = currentText.substring(0, start) + `{{${preset.action}}}${selected}{{/${preset.action}}}` + currentText.substring(end)
                              setText(newText)
                            } else {
                              toast.info('Selecione o texto no campo acima primeiro')
                            }
                          } else if (preset.insert) {
                            const newText = currentText.substring(0, start) + preset.insert + currentText.substring(end)
                            setText(newText)
                          }
                        }}
                        className="px-2 py-0.5 rounded-full text-xs border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white transition-colors"
                        title={'action' in preset && preset.action ? `Selecione texto e clique para ${preset.action}` : 'Insere pausa no cursor'}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}

                {/* Language */}
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-slate-300 whitespace-nowrap">Idioma</label>
                  <Select value={language} onValueChange={setLanguage}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-slate-700">
                      {LANGUAGES.map(l => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Music Track */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2 text-lg">
                    <Music className="w-5 h-5 text-purple-400" />
                    Trilha Musical
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">Com trilha</span>
                    <Switch
                      checked={trackEnabled}
                      onCheckedChange={setTrackEnabled}
                    />
                  </div>
                </div>
              </CardHeader>
              {trackEnabled && (
                <CardContent className="space-y-3">
                  {tracks.length === 0 ? (
                    <p className="text-slate-500 text-sm">Nenhuma trilha disponível</p>
                  ) : selectedTrackCategory ? (
                    /* INSIDE A TRACK CATEGORY */
                    <>
                      <button
                        onClick={() => setSelectedTrackCategory(null)}
                        className="flex items-center gap-2 text-sm text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Todas &gt; <span className="font-semibold">{selectedTrackCategory}</span>
                      </button>
                      {tracks.filter(t => t.category === selectedTrackCategory).length === 0 ? (
                        <div className="text-center py-6">
                          <FolderOpen className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                          <p className="text-slate-500 text-sm">Pasta vazia</p>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {tracks.filter(t => t.category === selectedTrackCategory).slice(0, trackShowLimit).map((track) => (
                              <button
                                key={track.id}
                                onClick={() => setSelectedTrackId(track.id)}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                  selectedTrackId === track.id
                                    ? 'border-purple-500 bg-purple-500/20'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-lg">{track.emoji || '🎵'}</span>
                                  <span className={`text-sm font-medium flex-1 min-w-0 ${selectedTrackId === track.id ? 'text-purple-200' : 'text-slate-300'}`}>
                                    {track.name}
                                  </span>
                                  <VoicePreviewButton
                                    audioUrl={track.audioPath || undefined}
                                    voiceId={track.id}
                                    currentlyPlayingId={previewingTrackId}
                                    onPlayStart={setPreviewingTrackId}
                                    onPlayEnd={() => setPreviewingTrackId(null)}
                                  />
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-1">{track.description}</p>
                              </button>
                            ))}
                          </div>
                          {(() => { const remaining = tracks.filter(t => t.category === selectedTrackCategory).length - trackShowLimit; if (remaining > 0) return (
                            <button onClick={() => setTrackShowLimit(prev => prev + 15)} className="w-full text-center text-sm text-purple-400 hover:text-purple-300 py-2 rounded-lg border border-white/5 hover:border-purple-500/30 transition-all">
                              Ver mais {remaining}
                            </button>
                          ); return null; })()}
                          {selectedTrack && (
                            <TrackControls
                              selectedTrack={selectedTrack}
                              trackVolume={trackVolume}
                              duckVolume={duckVolume}
                              fadeInMs={fadeInMs}
                              duckFadeMs={duckFadeMs}
                              unduckFadeMs={unduckFadeMs}
                              fadeOutMs={fadeOutMs}
                              musicStartLeadMs={musicStartLeadMs}
                              showDuckingSettings={showDuckingSettings}
                              onTrackVolumeChange={setTrackVolume}
                              onDuckVolumeChange={setDuckVolume}
                              onFadeInMsChange={setFadeInMs}
                              onDuckFadeMsChange={setDuckFadeMs}
                              onUnduckFadeMsChange={setUnduckFadeMs}
                              onFadeOutMsChange={setFadeOutMs}
                              onMusicStartLeadMsChange={setMusicStartLeadMs}
                              onToggleDuckingSettings={() => setShowDuckingSettings(!showDuckingSettings)}
                            />
                          )}
                        </>
                      )}
                    </>
                  ) : trackCategories.length > 0 ? (
                    /* FOLDER GRID VIEW */
                    <>
                      {tracks.filter(t => !t.category).length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs text-slate-500 mb-2">Sem categoria</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {tracks.filter(t => !t.category).slice(0, trackShowLimit).map((track) => (
                              <button
                                key={track.id}
                                onClick={() => setSelectedTrackId(track.id)}
                                className={`p-3 rounded-xl border text-left transition-all ${
                                  selectedTrackId === track.id
                                    ? 'border-purple-500 bg-purple-500/20'
                                    : 'border-white/10 bg-white/5 hover:border-white/20'
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-lg">{track.emoji || '🎵'}</span>
                                  <span className={`text-sm font-medium flex-1 min-w-0 ${selectedTrackId === track.id ? 'text-purple-200' : 'text-slate-300'}`}>
                                    {track.name}
                                  </span>
                                  <VoicePreviewButton
                                    audioUrl={track.audioPath || undefined}
                                    voiceId={track.id}
                                    currentlyPlayingId={previewingTrackId}
                                    onPlayStart={setPreviewingTrackId}
                                    onPlayEnd={() => setPreviewingTrackId(null)}
                                  />
                                </div>
                                <p className="text-xs text-slate-500 line-clamp-1">{track.description}</p>
                              </button>
                            ))}
                          </div>
                          {(() => { const remaining = tracks.filter(t => !t.category).length - trackShowLimit; if (remaining > 0) return (
                            <button onClick={() => setTrackShowLimit(prev => prev + 15)} className="w-full text-center text-sm text-purple-400 hover:text-purple-300 py-2 rounded-lg border border-white/5 hover:border-purple-500/30 transition-all">
                              Ver mais {remaining}
                            </button>
                          ); return null; })()}
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {trackCategories.map(cat => (
                          <button
                            key={cat.name}
                            onClick={() => setSelectedTrackCategory(cat.name)}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-purple-500/10 hover:border-purple-500/50 transition-all duration-200 cursor-pointer group"
                          >
                            <span className="text-base group-hover:scale-110 transition-transform">{cat.emoji || '📁'}</span>
                            <span className="text-sm font-medium text-white whitespace-nowrap">{cat.name}</span>
                            <span className="text-xs text-slate-500 bg-white/5 px-1.5 py-0.5 rounded-md">{cat.count}</span>
                          </button>
                        ))}
                      </div>
                      {selectedTrack && !selectedTrack.category && (
                        <TrackControls
                          selectedTrack={selectedTrack}
                          trackVolume={trackVolume}
                          duckVolume={duckVolume}
                          fadeInMs={fadeInMs}
                          duckFadeMs={duckFadeMs}
                          unduckFadeMs={unduckFadeMs}
                          fadeOutMs={fadeOutMs}
                          musicStartLeadMs={musicStartLeadMs}
                          showDuckingSettings={showDuckingSettings}
                          onTrackVolumeChange={setTrackVolume}
                          onDuckVolumeChange={setDuckVolume}
                          onFadeInMsChange={setFadeInMs}
                          onDuckFadeMsChange={setDuckFadeMs}
                          onUnduckFadeMsChange={setUnduckFadeMs}
                          onFadeOutMsChange={setFadeOutMs}
                          onMusicStartLeadMsChange={setMusicStartLeadMs}
                          onToggleDuckingSettings={() => setShowDuckingSettings(!showDuckingSettings)}
                        />
                      )}
                    </>
                  ) : (
                    /* No categories - flat list */
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {tracks.slice(0, trackShowLimit).map((track) => (
                          <button
                            key={track.id}
                            onClick={() => setSelectedTrackId(track.id)}
                            className={`p-3 rounded-xl border text-left transition-all ${
                              selectedTrackId === track.id
                                ? 'border-purple-500 bg-purple-500/20'
                                : 'border-white/10 bg-white/5 hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-lg">{track.emoji || '🎵'}</span>
                              <span className={`text-sm font-medium flex-1 min-w-0 ${selectedTrackId === track.id ? 'text-purple-200' : 'text-slate-300'}`}>
                                {track.name}
                              </span>
                              <VoicePreviewButton
                                audioUrl={track.audioPath || undefined}
                                voiceId={track.id}
                                currentlyPlayingId={previewingTrackId}
                                onPlayStart={setPreviewingTrackId}
                                onPlayEnd={() => setPreviewingTrackId(null)}
                              />
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-1">{track.description}</p>
                          </button>
                        ))}
                      </div>
                      {(() => { const remaining = tracks.length - trackShowLimit; if (remaining > 0) return (
                        <button onClick={() => setTrackShowLimit(prev => prev + 15)} className="w-full text-center text-sm text-purple-400 hover:text-purple-300 py-2 rounded-lg border border-white/5 hover:border-purple-500/30 transition-all">
                          Ver mais {remaining}
                        </button>
                      ); return null; })()}
                      {selectedTrack && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-400">Volume da Trilha</label>
                            <span className="text-xs text-slate-500">{Math.round(trackVolume * 100)}%</span>
                          </div>
                          <Slider value={[trackVolume]} onValueChange={([v]) => setTrackVolume(v)} min={0} max={1} step={0.05} className="w-full" />
                          <div className="pt-3 border-t border-white/10">
                            <button onClick={() => setShowDuckingSettings(!showDuckingSettings)} className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-300 transition-colors w-full">
                              <Volume2 className="w-4 h-4" />
                              Controles de Ducking
                              <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showDuckingSettings ? 'rotate-180' : ''}`} />
                            </button>
                            {showDuckingSettings && (
                              <div className="mt-3 space-y-3">
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <label className="text-xs text-slate-400">Volume durante a voz</label>
                                    <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{Math.round(duckVolume * 100)}%</Badge>
                                  </div>
                                  <Slider value={[duckVolume]} onValueChange={([v]) => setDuckVolume(v)} min={0} max={1} step={0.01} />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <label className="text-xs text-slate-400">Fade-in inicial</label>
                                    <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{fadeInMs / 1000}s</Badge>
                                  </div>
                                  <Slider value={[fadeInMs]} onValueChange={([v]) => setFadeInMs(v)} min={0} max={5000} step={100} />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <label className="text-xs text-slate-400">Música antes da voz</label>
                                    <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{(musicStartLeadMs / 1000).toFixed(1)}s</Badge>
                                  </div>
                                  <Slider value={[musicStartLeadMs]} onValueChange={([v]) => setMusicStartLeadMs(v)} min={0} max={10000} step={100} />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <label className="text-xs text-slate-400">Transição Duck</label>
                                    <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{duckFadeMs / 1000}s</Badge>
                                  </div>
                                  <Slider value={[duckFadeMs]} onValueChange={([v]) => setDuckFadeMs(v)} min={0} max={3000} step={50} />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <label className="text-xs text-slate-400">Transição Unduck</label>
                                    <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{unduckFadeMs / 1000}s</Badge>
                                  </div>
                                  <Slider value={[unduckFadeMs]} onValueChange={([v]) => setUnduckFadeMs(v)} min={0} max={3000} step={50} />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <label className="text-xs text-slate-400">Fade-out final</label>
                                    <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{fadeOutMs / 1000}s</Badge>
                                  </div>
                                  <Slider value={[fadeOutMs]} onValueChange={([v]) => setFadeOutMs(v)} min={0} max={8000} step={100} />
                                </div>
                                <div className="pt-2 border-t border-white/10">
                                  <p className="text-[10px] text-slate-500 mb-2">Timeline do áudio:</p>
                                  <div className="flex items-center gap-1 text-[10px]">
                                    <div className="bg-purple-500/30 border border-purple-500/50 rounded px-2 py-1 text-purple-300">Música {(musicStartLeadMs / 1000).toFixed(1)}s</div>
                                    <span className="text-slate-600">→</span>
                                    <div className="bg-green-500/30 border border-green-500/50 rounded px-2 py-1 text-green-300">Voz {duckFadeMs / 1000}s fade</div>
                                    <span className="text-slate-600">→</span>
                                    <div className="bg-blue-500/30 border border-blue-500/50 rounded px-2 py-1 text-blue-300">Música volta</div>
                                    <span className="text-slate-600">→</span>
                                    <div className="bg-orange-500/30 border border-orange-500/50 rounded px-2 py-1 text-orange-300">Fade {fadeOutMs / 1000}s</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                </CardContent>
              )}
            </Card>

            {/* Advanced Settings */}
            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer text-sm text-slate-400 hover:text-slate-300 transition-colors">
                <Settings2 className="w-4 h-4" />
                Configurações Avançadas
                <ChevronRight className="w-3 h-3 transition-transform group-open:rotate-90" />
              </summary>
              <Card className="mt-2 bg-white/5 border-white/10 backdrop-blur">
                <CardContent className="pt-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-xs text-slate-400">Passos</label>
                        <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{numStep}</Badge>
                      </div>
                      <Slider value={[numStep]} onValueChange={([v]) => setNumStep(v)} min={4} max={64} step={1} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <label className="text-xs text-slate-400">Guia (CFG)</label>
                        <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{guidanceScale.toFixed(1)}</Badge>
                      </div>
                      <Slider value={[guidanceScale]} onValueChange={([v]) => setGuidanceScale(v)} min={0} max={4} step={0.1} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <label className="text-xs text-slate-400">Velocidade</label>
                      <Badge variant="outline" className="text-xs border-white/10 text-slate-500">{speed.toFixed(2)}x</Badge>
                    </div>
                    <Slider value={[speed]} onValueChange={([v]) => setSpeed(v)} min={0.5} max={1.5} step={0.05} />
                  </div>
                </CardContent>
              </Card>
            </details>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || !text.trim() || (!selectedVariationId && !uploadedVoiceUrl)}
              className="w-full h-14 text-lg font-bold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-xl shadow-violet-500/25 disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 mr-2" />
                  Gerar Voz
                </>
              )}
            </Button>
          </div>

          {/* Right Panel - Output */}
          <div className="lg:col-span-2 space-y-5">
            <Card className="bg-white/5 border-white/10 backdrop-blur sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-lg">
                  <Volume2 className="w-5 h-5 text-violet-400" />
                  Resultado
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(audioUrl || mixedAudioUrl) ? (
                  <div className="space-y-4">
                    {/* Audio player */}
                    <div className="bg-gradient-to-br from-violet-500/10 to-purple-500/10 rounded-xl p-4 border border-violet-500/20">
                      <audio
                        ref={resultAudioRef}
                        src={mixedAudioUrl || audioUrl || undefined}
                        className="w-full"
                        controls
                        autoPlay
                      />
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-wrap gap-2">
                      {selectedVoice && (
                        <Badge variant="outline" className="border-violet-500/30 text-violet-300">
                          {selectedVoice.name}
                        </Badge>
                      )}
                      {selectedVariation && (
                        <Badge variant="outline" className="border-purple-500/30 text-purple-300">
                          {selectedVariation.emoji} {selectedVariation.label}
                        </Badge>
                      )}
                      {isMixed && selectedTrack && (
                        <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
                          <Music className="w-3 h-3 mr-1" />
                          {selectedTrack.name}
                        </Badge>
                      )}
                    </div>

                    {/* Controls */}
                    <div className="flex gap-2">
                      <Button
                        onClick={togglePlayback}
                        variant="outline"
                        className="flex-1 border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/20 text-violet-100 hover:text-white gap-1.5"
                      >
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        {isPlaying ? 'Pausar' : 'Reproduzir'}
                      </Button>
                      <Button
                        onClick={stopPlayback}
                        variant="outline"
                        className="border-slate-500/40 bg-slate-500/10 hover:bg-slate-500/20 text-slate-200 hover:text-white"
                      >
                        <Square className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={handleDownload}
                        className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white gap-1.5"
                      >
                        <Download className="w-4 h-4" />
                        Baixar MP3
                      </Button>
                    </div>

                    {/* Switch between voice-only and mixed */}
                    {isMixed && audioUrl && mixedAudioUrl && (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Ouvindo:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            const el = resultAudioRef.current
                            if (el) {
                              const wasPlaying = !el.paused
                              el.src = mixedAudioUrl
                              if (wasPlaying) el.play().catch(() => {})
                            }
                          }}
                        >
                          Com trilha
                        </Button>
                        <span>|</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => {
                            const el = resultAudioRef.current
                            if (el) {
                              const wasPlaying = !el.paused
                              el.src = audioUrl
                              if (wasPlaying) el.play().catch(() => {})
                            }
                          }}
                        >
                          Somente voz
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="w-20 h-20 rounded-full bg-violet-500/10 flex items-center justify-center mb-4">
                      {isGenerating ? (
                        <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
                      ) : (
                        <AudioWaveform className="w-10 h-10 text-violet-500/50" />
                      )}
                    </div>
                    <p className="text-slate-400">
                      {isGenerating ? 'Gerando seu áudio...' : 'Nenhum áudio gerado ainda'}
                    </p>
                    {isGenerating && (
                      <div className="space-y-1">
                        <p className="text-xs text-slate-500 mt-2">
                          {generatingTime < 5
                            ? 'Iniciando geração...'
                            : generatingTime < 45
                              ? `Processando há ${generatingTime}s...`
                              : `Ainda processando... ${generatingTime}s`}
                        </p>
                        {generatingTime >= 45 && (
                          <p className="text-[10px] text-yellow-500/70">
                            A geracao pode levar alguns minutos, dependendo do texto e servidor.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Info card */}
            <Card className="bg-white/5 border-white/10 backdrop-blur">
              <CardContent className="pt-5">
                <div className="space-y-3 text-sm text-slate-400">
                  <h3 className="font-medium text-slate-300">Como funciona</h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="border-violet-500/30 text-violet-400 shrink-0 mt-0.5">1</Badge>
                      <p>Escolha uma voz e o estilo/emissão desejado</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="border-violet-500/30 text-violet-400 shrink-0 mt-0.5">2</Badge>
                      <p>Digite o texto que deseja sintetizar</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="border-violet-500/30 text-violet-400 shrink-0 mt-0.5">3</Badge>
                      <p>Opcionalmente, adicione uma trilha musical de fundo</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="border-violet-500/30 text-violet-400 shrink-0 mt-0.5">4</Badge>
                      <p>Clique em &quot;Gerar Voz&quot; e aguarde o resultado</p>
                    </div>
                  </div>
                  <Separator className="bg-white/10" />
                  <p className="text-xs text-slate-500">
                    A emoção da voz vem do áudio de referência usado na clonagem.
                    Cada variação de emoção usa um áudio diferente, capturando o tom e a entonação automaticamente.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Debug/Developer Panel */}
            <details open={debugOpen} className="group">
              <summary
                onClick={() => setDebugOpen(!debugOpen)}
                className="flex items-center gap-2 cursor-pointer text-sm text-slate-500 hover:text-slate-400 transition-colors"
              >
                <Bug className="w-4 h-4" />
                Painel de Debug
                <ChevronDown className={`w-3 h-3 transition-transform ${debugOpen ? 'rotate-180' : ''}`} />
              </summary>
              <Card className="mt-2 bg-white/5 border-white/10 backdrop-blur">
                <CardContent className="pt-5 space-y-3">
                  {/* Debug Steps Timeline */}
                  {(lastGenResponse as Record<string, unknown>)?.debug && 
                    typeof (lastGenResponse as Record<string, unknown>)?.debug === 'object' && 
                    ((lastGenResponse as Record<string, unknown>)?.debug as Record<string, unknown>)?.steps ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Log de Geração</span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-500">
                            {(((lastGenResponse as Record<string, unknown>)?.debug as Record<string, unknown>)?.totalDuration as number / 1000).toFixed(1)}s total
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-slate-500 hover:text-white"
                            onClick={() => { navigator.clipboard.writeText(JSON.stringify(lastGenResponse, null, 2)); toast.success('Debug copiado!') }}
                          >
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-1 max-h-60 overflow-auto">
                        {(((lastGenResponse as Record<string, unknown>)?.debug as Record<string, unknown>)?.steps as Array<Record<string, string>>).map((step: Record<string, string>, i: number) => (
                          <div key={i} className={`flex items-start gap-2 text-[11px] font-mono px-2 py-1 rounded ${
                            step.status === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                            step.status === 'ok' ? 'bg-green-500/5' :
                            step.status === 'warn' ? 'bg-yellow-500/5' :
                            'bg-slate-800/30'
                          }`}>
                            <span className="text-slate-600 shrink-0">{step.time}</span>
                            <span className={`shrink-0 w-2 h-2 mt-0.5 rounded-full ${
                              step.status === 'error' ? 'bg-red-500' :
                              step.status === 'ok' ? 'bg-green-500' :
                              step.status === 'warn' ? 'bg-yellow-500' :
                              'bg-blue-500'
                            }`} />
                            <span className={`shrink-0 ${
                              step.status === 'error' ? 'text-red-400' :
                              step.status === 'ok' ? 'text-green-400' :
                              step.status === 'warn' ? 'text-yellow-400' :
                              'text-blue-400'
                            }`}>{step.step}</span>
                            {step.detail && (
                              <span className="text-slate-500 break-all">{step.detail}</span>
                            )}
                            {step.duration !== undefined && (
                              <span className="text-slate-600 shrink-0 ml-auto">+{Number(step.duration)}ms</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* Error highlight */}
                      {(lastGenResponse as Record<string, unknown>)?.error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded p-2 text-xs text-red-400">
                          <span className="font-semibold">Erro: </span>{String((lastGenResponse as Record<string, unknown>).error)}
                        </div>
                      )}
                    </div>
                  ) : lastGenResponse ? (
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-slate-400">Last API Response:</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 px-1.5 text-slate-500 hover:text-white"
                          onClick={() => { navigator.clipboard.writeText(JSON.stringify(lastGenResponse, null, 2)); toast.success('Resposta copiada!') }}
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                      <pre className="bg-slate-900/50 border border-white/10 rounded p-2 text-[10px] text-slate-400 max-h-40 overflow-auto whitespace-pre-wrap break-all">
{JSON.stringify(lastGenResponse, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Nenhuma geração realizada ainda.</p>
                  )}
                </CardContent>
              </Card>
            </details>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-slate-900/80 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between text-xs text-slate-500">
          <p>VozPro — Vozes Profissionais com IA</p>
          <p>Powered by VozPro</p>
        </div>
      </footer>
    </div>
  )
}
