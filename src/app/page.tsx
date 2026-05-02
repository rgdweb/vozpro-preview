'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  AudioWaveform, Sparkles, Loader2, Download, Play, Pause, Square,
  Volume2, Music, Mic, ChevronRight, Settings2, Globe, Bug, Copy, ChevronDown
} from 'lucide-react'
import { toast } from 'sonner'
import AudioPlayer from '@/components/audio-player'

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
  order: number
  active: boolean
  variations: VoiceVariation[]
}

interface Track {
  id: string
  name: string
  description: string
  emoji: string
  audioPath: string
  duration: number
  order: number
  active: boolean
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

/**
 * Mix voice audio (base64 data URI) with track audio (URL) using Web Audio API.
 * Returns a base64 data URI of the mixed audio.
 */
async function mixAudioClientSide(
  voiceDataUri: string,
  trackUrl: string,
  trackVolume: number
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

  // Duration = voice duration (shortest)
  const duration = voiceBuffer.duration
  const sampleRate = voiceBuffer.sampleRate
  const length = Math.ceil(duration * sampleRate)

  // Create offline context for mixing
  const offlineCtx = new OfflineAudioContext(
    Math.max(voiceBuffer.numberOfChannels, trackBuffer.numberOfChannels),
    length,
    sampleRate
  )

  // Voice source (full volume)
  const voiceSource = offlineCtx.createBufferSource()
  voiceSource.buffer = voiceBuffer
  voiceSource.connect(offlineCtx.destination)
  voiceSource.start(0)

  // Track source (with volume control)
  const trackSource = offlineCtx.createBufferSource()
  trackSource.buffer = trackBuffer
  const gainNode = offlineCtx.createGain()
  gainNode.gain.value = Math.max(0, Math.min(1, trackVolume))
  trackSource.connect(gainNode)
  gainNode.connect(offlineCtx.destination)
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
  const [voices, setVoices] = useState<Voice[]>([])
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)

  // Selections
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('')
  const [selectedVariationId, setSelectedVariationId] = useState<string>('')
  const [selectedTrackId, setSelectedTrackId] = useState<string>('')
  const [language, setLanguage] = useState('Portuguese')

  // Settings
  const [text, setText] = useState('')
  const [trackEnabled, setTrackEnabled] = useState(false)
  const [trackVolume, setTrackVolume] = useState(0.3)
  const [speed, setSpeed] = useState(1.0)
  const [numStep, setNumStep] = useState(20)
  const [guidanceScale, setGuidanceScale] = useState(1.5)
  const [showAdvanced, setShowAdvanced] = useState(false)

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

  const resultAudioRef = useRef<HTMLAudioElement | null>(null)

  // Get selected voice and variation
  const selectedVoice = voices.find(v => v.id === selectedVoiceId)
  const selectedVariation = selectedVoice?.variations.find(v => v.id === selectedVariationId)
  const selectedTrack = tracks.find(t => t.id === selectedTrackId)

  // Load voices and tracks
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [voicesRes, tracksRes, configRes] = await Promise.all([
          fetch('/api/voices'),
          fetch('/api/tracks'),
          fetch('/api/generate-config'),
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
        }
      } catch {
        toast.error('Erro ao carregar dados')
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

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
    if (!selectedVariationId) {
      toast.error('Selecione uma variação de voz')
      return
    }

    setIsGenerating(true)
    setAudioUrl(null)
    setMixedAudioUrl(null)
    setIsMixed(false)
    setGeneratingTime(0)

    // Timer para mostrar tempo decorrido ao usuario
    const genStartTime = Date.now()
    const timerInterval = setInterval(() => {
      setGeneratingTime(Math.floor((Date.now() - genStartTime) / 1000))
    }, 1000)

    // Timeout de seguranca do frontend (cancela se demorar mais de 10 min - CPU pode ser lenta)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 600000)

    try {
      // Montar instruct a partir dos metadados da voz
      const voice = selectedVoice
      const instructParts: string[] = []
      if (voice && voice.gender !== 'Auto') instructParts.push(voice.gender.toLowerCase())
      if (voice && voice.age !== 'Auto') instructParts.push(voice.age.toLowerCase())
      if (voice && voice.pitch !== 'Auto') instructParts.push(voice.pitch.toLowerCase())
      if (voice && voice.accent !== 'Auto') instructParts.push(voice.accent.toLowerCase())
      if (selectedVariation?.instruct && selectedVariation.instruct.trim()) instructParts.push(selectedVariation.instruct.trim())
      const instructStr = instructParts.join(', ')

      // CORPO DA REQUISICAO - todos os dados que o PHP precisa
      const body: Record<string, unknown> = {
        text: text.trim(),
        language,
        refAudioUrl: selectedVariation?.refAudioServerUrl || '',
        refAudioPath: selectedVariation?.refAudioPath || '',
        refText: selectedVariation?.refText || '',
        instruct: instructStr,
        refAudioName: selectedVariation?.refAudioName || 'ref_audio.wav',
        speed,
        numStep,
        guidanceScale,
      }

      let res: Response

      if (usePhpGenerate) {
        // ===== PHP DIRETO: browser -> PHP (bypass Vercel timeout!) =====
        // 1. Obter token HMAC do Vercel (rapido, <1s)
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

        // 2. Chamar PHP diretamente (sem Vercel no meio!)
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
        // ===== Vercei API direta (sem PHP) =====
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

      // Mixagem client-side com trilha (funciona tanto com PHP quanto Vercel)
      if (trackEnabled && selectedTrack?.audioPath) {
        console.log('[VozPro] Client-side mixing, mixing voice + track...')
        toast.info('Mixando voz com trilha...')

        try {
          const mixedDataUri = await mixAudioClientSide(
            data.audioUrl,
            selectedTrack.audioPath,
            trackVolume
          )
          setAudioUrl(data.audioUrl)
          setMixedAudioUrl(mixedDataUri)
          setIsMixed(true)
          toast.success(`Audio gerado com trilha "${selectedTrack.name}"!${data.viaDirectPhp ? ' (PHP direto)' : data.viaPhp ? ' (via PHP)' : ''}`)
        } catch (mixErr) {
          console.error('[VozPro] Client-side mixing failed:', mixErr)
          setAudioUrl(data.audioUrl)
          toast.warning('Não foi possível mixar a trilha. Reproduzindo apenas a voz.')
        }
      } else {
        // No track - just voice
        setAudioUrl(data.audioUrl)

        if (data.mixedAudio) {
          setMixedAudioUrl(data.mixedAudio)
          setIsMixed(true)
        }

        toast.success('Áudio gerado com sucesso!')
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
  }, [text, selectedVariationId, language, speed, numStep, guidanceScale, trackEnabled, selectedTrackId, trackVolume])

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

  const handleDownload = useCallback(() => {
    const url = mixedAudioUrl || audioUrl
    if (!url) return

    if (url.startsWith('data:')) {
      // Base64 audio - convert to blob
      const byteString = atob(url.split(',')[1])
      const mimeString = url.split(',')[0].split(':')[1].split(';')[0]
      const ab = new ArrayBuffer(byteString.length)
      const ia = new Uint8Array(ab)
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i)
      }
      const blob = new Blob([ab], { type: mimeString })
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = `vozpro_${Date.now()}.wav`
      a.click()
      URL.revokeObjectURL(blobUrl)
    } else {
      const a = document.createElement('a')
      a.href = url
      a.download = `vozpro_${Date.now()}.wav`
      a.click()
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
          <Badge variant="outline" className="border-violet-500/30 text-violet-300 gap-1">
            <Globe className="w-3 h-3" />
            Online
          </Badge>
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
                ) : (
                  <>
                    {/* Voice cards */}
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
                            <span className={`font-medium text-sm ${selectedVoiceId === voice.id ? 'text-violet-200' : 'text-slate-300'}`}>
                              {voice.name}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-1">{voice.description}</p>
                        </button>
                      ))}
                    </div>

                    {/* Emotion/Style Variations */}
                    {selectedVoice && selectedVoice.variations.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-slate-300 mb-2">Estilo / Emoção</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedVoice.variations.map((v) => (
                            <button
                              key={v.id}
                              onClick={() => setSelectedVariationId(v.id)}
                              className={`px-4 py-2 rounded-full border text-sm transition-all flex items-center gap-1.5 ${
                                selectedVariationId === v.id
                                  ? 'border-violet-500 bg-violet-500/20 text-violet-200'
                                  : 'border-white/10 bg-white/5 text-slate-400 hover:border-white/20'
                              }`}
                            >
                              <span>{v.emoji || '🎙️'}</span>
                              <span>{v.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
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
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Digite o texto que deseja que a voz fale... Ex: Na compra de qualquer produto, ganhe 50% de desconto! Aproveite essa promoção exclusiva!"
                    rows={4}
                    className="bg-white/5 border-white/10 text-white placeholder:text-slate-600 resize-none focus:border-violet-500"
                  />
                </div>

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
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {tracks.map((track) => (
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
                              <span className={`text-sm font-medium ${selectedTrackId === track.id ? 'text-purple-200' : 'text-slate-300'}`}>
                                {track.name}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-1">{track.description}</p>
                          </button>
                        ))}
                      </div>

                      {/* Volume control */}
                      {selectedTrack && (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm text-slate-400">Volume da Trilha</label>
                            <span className="text-xs text-slate-500">{Math.round(trackVolume * 100)}%</span>
                          </div>
                          <Slider
                            value={[trackVolume]}
                            onValueChange={([v]) => setTrackVolume(v)}
                            min={0}
                            max={1}
                            step={0.05}
                            className="w-full"
                          />
                          {/* Preview track */}
                          <AudioPlayer audioPath={selectedTrack.audioPath} />
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
              disabled={isGenerating || !text.trim() || !selectedVariationId}
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
                        Baixar
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
          <p>Powered by OmniVoice</p>
        </div>
      </footer>
    </div>
  )
}
