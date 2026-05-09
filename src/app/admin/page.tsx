'use client'

import { useState, useEffect, useCallback } from 'react'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  AudioWaveform, LogOut, Plus, Trash2, Edit, Upload, Music, Mic,
  Loader2, RefreshCw, Volume2, FileAudio, CheckCircle2, Settings2,
  FolderOpen, ChevronLeft, FolderPlus, Folder
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
const MP3_BITRATE = 192 // kbps — alta qualidade pra musica

/**
 * Converte AudioBuffer para MP3 usando lamejs (alta qualidade, arquivo pequeno).
 * Carrega lamejs dinamicamente do CDN para evitar problemas com bundler.
 */
async function encodeMp3(buffer: AudioBuffer, kbps: number = 192): Promise<Blob> {
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

interface VoiceVariation {
  id: string
  label: string
  emoji: string
  refAudioPath: string
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

  // Variation form state (used for both create and edit)
  const [variationForm, setVariationForm] = useState({
    label: '', emoji: '', refAudioPath: '', serverUrl: '', filename: '', refAudioName: '', refText: '', instruct: 'none',
  })
  const [editingVariationId, setEditingVariationId] = useState<string | null>(null)
  const [addingVariationTo, setAddingVariationTo] = useState<string | null>(null)
  const [variationDialogOpen, setVariationDialogOpen] = useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)

  // Pending files (not uploaded yet, waiting for save)
  const [pendingVoiceFile, setPendingVoiceFile] = useState<File | null>(null)

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
  const [newCatName, setNewCatName] = useState('')
  const [newCatEmoji, setNewCatEmoji] = useState('')
  const [savingCategories, setSavingCategories] = useState(false)

  // Batch upload state
  const [batchUploadOpen, setBatchUploadOpen] = useState(false)
  const [batchUploadCategory, setBatchUploadCategory] = useState('')
  const [batchFiles, setBatchFiles] = useState<File[]>([])
  const [batchUploading, setBatchUploading] = useState(false)
  const [batchProgress, setBatchProgress] = useState('')

  // Settings state
  const [enableVoiceUpload, setEnableVoiceUpload] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  // Check auth
  useEffect(() => {
    fetch('/api/auth/verify').then(res => res.json()).then(data => {
      if (!data.authenticated) {
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
        setSettingsLoaded(true)
      }
      if (trackCatRes.ok) setTrackCategories(await trackCatRes.json())
      if (voiceCatRes.ok) setVoiceCategories(await voiceCatRes.json())
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
  // Select voice file (NO upload — just store in state for later upload on save)
  const handleSelectVoiceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingVoiceFile(file)
    toast.success(`Arquivo pronto: ${file.name} (${(file.size / 1024).toFixed(0)}KB)`)
  }

  const handleSaveVariation = async () => {
    if (!variationForm.label.trim()) {
      toast.error('Nome da variação é obrigatório')
      return
    }

    const instructValue = variationForm.instruct === 'none' ? '' : variationForm.instruct

    try {
      // Upload pending voice file if there is one
      if (pendingVoiceFile) {
        setUploadingRef(true)
        toast.info('Enviando arquivo de áudio...')

        const formData = new FormData()
        formData.append('file', pendingVoiceFile)

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
        if (data.serverUrl || data.path) {
          setVariationForm(prev => ({
            ...prev,
            refAudioPath: data.path || '',
            serverUrl: data.serverUrl || '',
            filename: data.filename || '',
            refAudioName: data.name || pendingVoiceFile.name,
          }))
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
        // Only update audio if a new one was uploaded
        if (variationForm.serverUrl || variationForm.refAudioPath) {
          updateBody.refAudioPath = variationForm.refAudioPath
          updateBody.refAudioServerUrl = variationForm.serverUrl
          updateBody.refAudioFilename = variationForm.filename
          updateBody.refAudioName = variationForm.refAudioName
        }
        await fetch(`/api/variations/${editingVariationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        })
        toast.success('Variação atualizada!')
      } else {
        // CREATE new variation
        if (!variationForm.serverUrl && !variationForm.refAudioPath) {
          toast.error('Áudio de referência é obrigatório para nova variação')
          return
        }
        if (!addingVariationTo) return

        await fetch(`/api/voices/${addingVariationTo}/variations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...variationForm,
            instruct: instructValue,
          }),
        })
        toast.success('Variação adicionada!')
      }

      setVariationDialogOpen(false)
      setEditingVariationId(null)
      setAddingVariationTo(null)
      setVariationForm({ label: '', emoji: '', refAudioPath: '', serverUrl: '', filename: '', refAudioName: '', refText: '', instruct: 'none' })
      setPendingVoiceFile(null)
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

  // --- BATCH UPLOAD (sequential with retry to avoid server overload) ---
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
    let failed = 0
    const errorMessages: string[] = []
    const validExts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.webm']

    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

    for (let i = 0; i < batchFiles.length; i++) {
      const file = batchFiles[i]
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!validExts.includes(ext)) {
        errorMessages.push(`${file.name}: formato não suportado`)
        failed++
        continue
      }

      setBatchProgress(`${i + 1}/${batchFiles.length} — ${file.name}`)

      // Try up to 2 retries
      let success = false
      for (let attempt = 1; attempt <= 2 && !success; attempt++) {
        try {
          // Upload file to server
          const formData = new FormData()
          formData.append('file', file)
          const uploadRes = await fetch('/api/upload-track', { method: 'POST', body: formData })
          const uploadData = await uploadRes.json()

          if (!uploadRes.ok || (!uploadData.path && !uploadData.url)) {
            if (attempt === 2) errorMessages.push(`${file.name}: ${uploadData.error || 'falha no upload'}`)
            await sleep(2000)
            continue
          }

          // Create track record in DB
          const trackName = file.name.replace(/\.[^.]+$/, '')
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
          success = true
        } catch (err) {
          if (attempt === 2) {
            errorMessages.push(`${file.name}: ${(err as Error)?.message || 'erro de conexão'}`)
          }
          await sleep(3000) // Longer pause after connection error
        }
      }

      if (!success) failed++

      // Small pause between files to avoid server overload
      if (i < batchFiles.length - 1) await sleep(1000)
    }

    // Show results
    if (created > 0) toast.success(`${created} trilha(s) criada(s)!`)
    if (failed > 0) {
      toast.error(`${failed} falha(s):\n${errorMessages.slice(0, 5).join('\n')}${errorMessages.length > 5 ? `\n...e mais ${errorMessages.length - 5}` : ''}`, { duration: 10000 })
    }
    if (created > 0) {
      setBatchUploadOpen(false)
      setBatchFiles([])
      setBatchUploadCategory('')
      setSelectedTrackCategory(batchUploadCategory)
      loadData()
    }

    setBatchUploading(false)
    setBatchProgress('')
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
                  Gerenciar Categorias
                </Button>
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
                              <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
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
                                  <div key={v.id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${!v.active ? 'border-slate-800 bg-slate-900/20 opacity-60' : v.refAudioPath ? 'border-emerald-800/40 bg-emerald-900/10' : 'border-amber-800/40 bg-amber-900/10'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-lg shrink-0">{v.emoji || '🎙️'}</span>
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="text-sm font-medium text-slate-300">{v.label}</span>
                                          {v.refAudioPath ? (<Badge variant="outline" className="text-[10px] border-emerald-700 text-emerald-400 px-1.5 py-0"><Volume2 className="w-2.5 h-2.5 mr-0.5" /> Audio OK</Badge>) : (<Badge variant="outline" className="text-[10px] border-amber-700 text-amber-400 px-1.5 py-0">Sem audio</Badge>)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <input type="file" accept="audio/*" onChange={(e) => handleQuickUploadAudio(v.id, e)} className="hidden" id={`quick-audio-${selectedVoiceCategory}-${v.id}`} />
                                      <Button variant="ghost" size="sm" onClick={() => document.getElementById(`quick-audio-${selectedVoiceCategory}-${v.id}`)?.click()} className={`h-7 px-2 text-xs gap-1 ${v.refAudioPath ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30' : 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/30'}`}><Upload className="w-3 h-3" />{v.refAudioPath ? 'Update' : 'Add'}</Button>
                                      <Button variant="ghost" size="sm" onClick={() => { setEditingVariationId(v.id); setAddingVariationTo(null); setVariationForm({ label: v.label, emoji: v.emoji, refAudioPath: '', serverUrl: '', filename: '', refAudioName: v.refAudioName, refText: v.refText, instruct: v.instruct || 'none' }); setPendingVoiceFile(null); setVariationDialogOpen(true) }} className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-700 gap-1"><Edit className="w-3 h-3" />Editar</Button>
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
                                <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center"><Mic className="w-4 h-4 text-violet-400" /></div>
                                <div>
                                  <span className="font-medium text-sm text-white">{voice.name}</span>
                                  <p className="text-xs text-slate-500">{voice.variations.length} variação(ões)</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
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
                    ? 'Altere os dados da variação. Deixe o áudio vazio para manter o atual.'
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

                {/* Select reference audio (upload happens on save) */}
                <div className="space-y-2">
                  <Label className="text-slate-300">
                    Áudio de Referência {editingVariationId ? '' : '*'} (3-10s)
                  </Label>
                  {editingVariationId && editingVariation?.refAudioPath && (
                    <p className="text-xs text-slate-500">
                      Audio atual: {editingVariation.refAudioName || 'arquivo'} — selecione um novo para substituir
                    </p>
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
                          <span className="text-emerald-400">
                            {pendingVoiceFile.name} ({(pendingVoiceFile.size / 1024).toFixed(0)}KB)
                          </span>
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          {editingVariationId
                            ? 'Enviar novo áudio (opcional)'
                            : 'Selecionar arquivo de áudio'
                          }
                        </>
                      )}
                    </Button>
                  </div>
                  {pendingVoiceFile && (
                    <Badge variant="outline" className="bg-emerald-900/30 border-emerald-700 text-emerald-400">
                      Pronto para enviar ao salvar
                    </Badge>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="text-slate-300">Texto da Referência <span className="text-slate-500">(opcional)</span></Label>
                  <Textarea
                    value={variationForm.refText}
                    onChange={(e) => setVariationForm(p => ({ ...p, refText: e.target.value }))}
                    placeholder="Transcrição do áudio. Deixe vazio para transcrição automática."
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
                <Button variant="ghost" onClick={() => { setVariationDialogOpen(false); setEditingVariationId(null); setAddingVariationTo(null); setPendingVoiceFile(null) }} className="text-slate-400">Cancelar</Button>
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
                              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                                <Music className="w-5 h-5 text-purple-400" />
                              </div>
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
                              <Switch checked={track.active} onCheckedChange={() => handleToggleTrack(track)} />
                              <Button variant="ghost" size="icon" onClick={() => { setEditingTrackId(track.id); setTrackForm({ name: track.name, description: track.description || '', emoji: track.emoji || '', category: track.category || '' }); setTrackFilePath(''); setTrackDuration(track.duration); setPendingTrackFile(null); setTrackDialogOpen(true) }} className="text-slate-400 hover:text-white"><Edit className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteTrack(track.id)} className="text-slate-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>
                          {track.audioPath && (
                            <div className="mt-2 rounded-lg bg-slate-900/50 border border-slate-700 p-2">
                              <div className="flex items-center gap-2 mb-1">
                                <Volume2 className="w-3.5 h-3.5 text-purple-400" />
                                <span className="text-xs text-slate-400">Preview</span>
                              </div>
                              <AudioPlayer audioPath={track.audioPath} />
                            </div>
                          )}
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
                                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center"><Music className="w-4 h-4 text-purple-400" /></div>
                                <div>
                                  <span className="font-medium text-sm text-white">{track.name}</span>
                                  <p className="text-xs text-slate-500">{track.description || 'Sem descrição'}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
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

                {!settingsLoaded && (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Carregando configurações...
                  </div>
                )}
              </CardContent>
            </Card>
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
                  return (
                    <div key={cat.name} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
                      <span className="text-xl">{cat.emoji || '📁'}</span>
                      <span className="text-sm text-white flex-1">{cat.name}</span>
                      <span className="text-xs text-slate-400">{catCount} item(ns)</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeManagedCategory('tracks', i)}
                        className="h-7 w-7 text-slate-400 hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
                  return (
                    <div key={cat.name} className="flex items-center gap-2 bg-slate-900/50 rounded-lg px-3 py-2">
                      <span className="text-xl">{cat.emoji || '📁'}</span>
                      <span className="text-sm text-white flex-1">{cat.name}</span>
                      <span className="text-xs text-slate-400">{catCount} item(ns)</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeManagedCategory('voices', i)}
                        className="h-7 w-7 text-slate-400 hover:text-red-400 shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
