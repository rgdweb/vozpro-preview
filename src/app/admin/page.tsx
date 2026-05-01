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
  Loader2, RefreshCw, Volume2, FileAudio
} from 'lucide-react'
import { toast } from 'sonner'
import AudioPlayer from '@/components/audio-player'

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
    name: '', description: '', gender: 'Auto', age: 'Auto', accent: 'Auto', pitch: 'Auto',
  })
  const [editingVoiceId, setEditingVoiceId] = useState<string | null>(null)
  const [voiceDialogOpen, setVoiceDialogOpen] = useState(false)

  // Variation form state (used for both create and edit)
  const [variationForm, setVariationForm] = useState({
    label: '', emoji: '', refAudioPath: '', refAudioBlobUrl: '', refAudioName: '', refText: '', instruct: 'none',
  })
  const [editingVariationId, setEditingVariationId] = useState<string | null>(null)
  const [addingVariationTo, setAddingVariationTo] = useState<string | null>(null)
  const [variationDialogOpen, setVariationDialogOpen] = useState(false)
  const [uploadingRef, setUploadingRef] = useState(false)

  // Track form state
  const [trackForm, setTrackForm] = useState({ name: '', description: '', emoji: '' })
  const [trackDialogOpen, setTrackDialogOpen] = useState(false)
  const [uploadingTrack, setUploadingTrack] = useState(false)
  const [trackFilePath, setTrackFilePath] = useState('')
  const [trackDuration, setTrackDuration] = useState(0)
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null)

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
      const [voicesRes, tracksRes] = await Promise.all([
        fetch('/api/admin/voices'),
        fetch('/api/admin/tracks'),
      ])
      if (voicesRes.ok) setVoices(await voicesRes.json())
      if (tracksRes.ok) setTracks(await tracksRes.json())
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
      setVoiceForm({ name: '', description: '', gender: 'Auto', age: 'Auto', accent: 'Auto', pitch: 'Auto' })
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
  const handleUploadRefAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingRef(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload-voice', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (data.path || data.blobUrl) {
        setVariationForm(prev => ({
          ...prev,
          refAudioPath: data.path || '',
          refAudioBlobUrl: data.blobUrl || '',
          refAudioName: data.name || file.name,
        }))
        toast.success('Áudio enviado para o servidor!')
      } else {
        toast.error(data.error || 'Falha no upload')
      }
    } catch {
      toast.error('Erro no upload do áudio')
    } finally {
      setUploadingRef(false)
    }
  }

  const handleSaveVariation = async () => {
    if (!variationForm.label.trim()) {
      toast.error('Nome da variação é obrigatório')
      return
    }

    const instructValue = variationForm.instruct === 'none' ? '' : variationForm.instruct

    try {
      if (editingVariationId) {
        // UPDATE existing variation
        const updateBody: Record<string, unknown> = {
          label: variationForm.label.trim(),
          emoji: variationForm.emoji,
          refText: variationForm.refText,
          instruct: instructValue,
        }
        // Only update audio if a new one was uploaded
        if (variationForm.refAudioPath || variationForm.refAudioBlobUrl) {
          updateBody.refAudioPath = variationForm.refAudioPath
          updateBody.refAudioBlobUrl = variationForm.refAudioBlobUrl
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
        if (!variationForm.refAudioPath && !variationForm.refAudioBlobUrl) {
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
      setVariationForm({ label: '', emoji: '', refAudioPath: '', refAudioBlobUrl: '', refAudioName: '', refText: '', instruct: 'none' })
      loadData()
    } catch {
      toast.error('Erro ao salvar variação')
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

  // Quick audio-only update for a variation
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

      const data = await res.json()
      if (data.path || data.blobUrl) {
        await fetch(`/api/variations/${variationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            refAudioPath: data.path || '',
            refAudioBlobUrl: data.blobUrl || '',
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
  const handleUploadTrackFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingTrack(true)
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/upload-track', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()
      if (data.path) {
        setTrackFilePath(data.path)
        setTrackDuration(data.duration || 0)
        toast.success('Trilha enviada!')
      } else {
        toast.error(data.error || 'Falha no upload')
      }
    } catch {
      toast.error('Erro no upload da trilha')
    } finally {
      setUploadingTrack(false)
    }
  }

  const handleSaveTrack = async () => {
    if (!trackForm.name.trim()) {
      toast.error('Nome é obrigatório')
      return
    }

    try {
      if (editingTrackId) {
        // UPDATE existing track
        const updateBody: Record<string, unknown> = {
          name: trackForm.name.trim(),
          description: trackForm.description,
          emoji: trackForm.emoji,
        }
        // Only update audio if a new one was uploaded
        if (trackFilePath) {
          updateBody.audioPath = trackFilePath
          updateBody.duration = trackDuration
        }
        await fetch(`/api/tracks/${editingTrackId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateBody),
        })
        toast.success('Trilha atualizada!')
      } else {
        // CREATE new track
        if (!trackFilePath) {
          toast.error('Arquivo de áudio é obrigatório')
          return
        }
        await fetch('/api/tracks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...trackForm,
            audioPath: trackFilePath,
            duration: trackDuration,
          }),
        })
        toast.success('Trilha criada!')
      }

      setTrackDialogOpen(false)
      setEditingTrackId(null)
      setTrackForm({ name: '', description: '', emoji: '' })
      setTrackFilePath('')
      setTrackDuration(0)
      loadData()
    } catch {
      toast.error('Erro ao salvar trilha')
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
          </TabsList>

          {/* VOICES TAB */}
          <TabsContent value="voices" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Vozes Cadastradas</h2>
              <Dialog open={voiceDialogOpen} onOpenChange={setVoiceDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingVoiceId(null)
                      setVoiceForm({ name: '', description: '', gender: 'Auto', age: 'Auto', accent: 'Auto', pitch: 'Auto' })
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

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : voices.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-12 text-center">
                  <Mic className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-400">Nenhuma voz cadastrada</p>
                  <p className="text-sm text-slate-500 mt-1">Clique em &quot;Nova Voz&quot; para começar</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {voices.map((voice) => (
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
                          <Switch
                            checked={voice.active}
                            onCheckedChange={() => handleToggleVoice(voice)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingVoiceId(voice.id)
                              setVoiceForm({
                                name: voice.name,
                                description: voice.description,
                                gender: voice.gender,
                                age: voice.age,
                                accent: voice.accent,
                                pitch: voice.pitch,
                              })
                              setVoiceDialogOpen(true)
                            }}
                            className="text-slate-400 hover:text-white"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteVoice(voice.id)}
                            className="text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Variations */}
                      <div className="border-t border-slate-700 pt-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-slate-300">
                            Variações ({voice.variations.length})
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditingVariationId(null)
                              setAddingVariationTo(voice.id)
                              setVariationForm({ label: '', emoji: '', refAudioPath: '', refAudioBlobUrl: '', refAudioName: '', refText: '', instruct: 'none' })
                              setVariationDialogOpen(true)
                            }}
                            className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Variação
                          </Button>
                        </div>

                        {voice.variations.length === 0 ? (
                          <p className="text-sm text-slate-500 italic">Nenhuma variação. Adicione variações com diferentes emoções.</p>
                        ) : (
                          <div className="space-y-2">
                            {voice.variations.map((v) => (
                              <div
                                key={v.id}
                                className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
                                  !v.active
                                    ? 'border-slate-800 bg-slate-900/20 opacity-60'
                                    : v.refAudioPath
                                      ? 'border-emerald-800/40 bg-emerald-900/10'
                                      : 'border-amber-800/40 bg-amber-900/10'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-lg shrink-0">{v.emoji || '🎙️'}</span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-sm font-medium text-slate-300">{v.label}</span>
                                      {v.refAudioPath ? (
                                        <Badge variant="outline" className="text-[10px] border-emerald-700 text-emerald-400 px-1.5 py-0">
                                          <Volume2 className="w-2.5 h-2.5 mr-0.5" /> Audio OK
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px] border-amber-700 text-amber-400 px-1.5 py-0">
                                          Sem audio
                                        </Badge>
                                      )}
                                      {!v.active && (
                                        <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-500 px-1.5 py-0">
                                          Inativa
                                        </Badge>
                                      )}
                                      {v.instruct && (
                                        <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-500 px-1.5 py-0">
                                          {v.instruct}
                                        </Badge>
                                      )}
                                    </div>
                                    {v.refAudioName && (
                                      <p className="text-[10px] text-slate-500 truncate">{v.refAudioName}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {/* Add/Update Audio */}
                                  <input
                                    type="file"
                                    accept="audio/*"
                                    onChange={(e) => handleQuickUploadAudio(v.id, e)}
                                    className="hidden"
                                    id={`quick-audio-${v.id}`}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => document.getElementById(`quick-audio-${v.id}`)?.click()}
                                    className={`h-7 px-2 text-xs gap-1 ${
                                      v.refAudioPath
                                        ? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-900/30'
                                        : 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/30'
                                    }`}
                                  >
                                    <Upload className="w-3 h-3" />
                                    {v.refAudioPath ? 'Update' : 'Add Audio'}
                                  </Button>
                                  {/* Edit variation */}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setEditingVariationId(v.id)
                                      setAddingVariationTo(null)
                                      setVariationForm({
                                        label: v.label,
                                        emoji: v.emoji,
                                        refAudioPath: '',
                                        refAudioBlobUrl: '',
                                        refAudioName: v.refAudioName,
                                        refText: v.refText,
                                        instruct: v.instruct || 'none',
                                      })
                                      setVariationDialogOpen(true)
                                    }}
                                    className="h-7 px-2 text-xs text-slate-400 hover:text-white hover:bg-slate-700 gap-1"
                                  >
                                    <Edit className="w-3 h-3" />
                                    Editar
                                  </Button>
                                  {/* Toggle active */}
                                  <Switch
                                    checked={v.active}
                                    onCheckedChange={() => handleToggleVariation(v)}
                                    className="scale-75"
                                  />
                                  {/* Delete */}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteVariation(v.id)}
                                    className="text-slate-500 hover:text-red-400 h-7 w-7"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
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
          </TabsContent>

          {/* Variation Dialog - rendered ONCE outside the map */}
          <Dialog open={variationDialogOpen} onOpenChange={(open) => {
            setVariationDialogOpen(open)
            if (!open) {
              setEditingVariationId(null)
              setAddingVariationTo(null)
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

                {/* Upload reference audio */}
                <div className="space-y-2">
                  <Label className="text-slate-300">
                    Áudio de Referência {editingVariationId ? '' : '*'} (3-10s)
                  </Label>
                  {editingVariationId && editingVariation?.refAudioPath && (
                    <p className="text-xs text-slate-500">
                      Audio atual: {editingVariation.refAudioName || 'arquivo'} — envie um novo para substituir
                    </p>
                  )}
                  <div className="relative">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={handleUploadRefAudio}
                      className="hidden"
                      id="ref-audio-upload-dialog"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => document.getElementById('ref-audio-upload-dialog')?.click()}
                      disabled={uploadingRef}
                      className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 gap-2"
                    >
                      {uploadingRef ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                      {variationForm.refAudioPath
                        ? variationForm.refAudioName
                        : editingVariationId
                          ? 'Enviar novo áudio (opcional)'
                          : 'Selecionar arquivo de áudio'
                      }
                    </Button>
                  </div>
                  {variationForm.refAudioPath && (
                    <Badge variant="outline" className="bg-emerald-900/30 border-emerald-700 text-emerald-400">
                      Novo audio enviado
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
                    Apenas valores suportados pelo OmniVoice. A emoção real vem do tom do áudio enviado.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => { setVariationDialogOpen(false); setEditingVariationId(null); setAddingVariationTo(null) }} className="text-slate-400">Cancelar</Button>
                <Button onClick={handleSaveVariation} className="bg-violet-600 hover:bg-violet-700 text-white">
                  {editingVariationId ? 'Salvar Alterações' : 'Adicionar Variação'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* TRACKS TAB */}
          <TabsContent value="tracks" className="space-y-4 mt-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Trilhas Musicais</h2>
              <Dialog open={trackDialogOpen} onOpenChange={(open) => {
                setTrackDialogOpen(open)
                if (!open) setEditingTrackId(null)
              }}>
                <DialogTrigger asChild>
                  <Button
                    onClick={() => {
                      setEditingTrackId(null)
                      setTrackForm({ name: '', description: '', emoji: '' })
                      setTrackFilePath('')
                      setTrackDuration(0)
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
                      {editingTrackId ? 'Altere os dados da trilha. Deixe o áudio vazio para manter o atual.' : 'Faça upload de uma trilha de fundo para mixar com as vozes geradas.'}
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
                      <Label className="text-slate-300">
                        Arquivo de Áudio {editingTrackId ? '' : '*'}
                      </Label>
                      {editingTrackId && (
                        <p className="text-xs text-slate-500">
                          Envie um novo arquivo para substituir o áudio atual, ou deixe vazio para manter.
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
                        onChange={handleUploadTrackFile}
                        className="hidden"
                        id="track-file-upload"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('track-file-upload')?.click()}
                        disabled={uploadingTrack}
                        className="w-full border-slate-600 text-slate-300 hover:bg-slate-700 gap-2"
                      >
                        {uploadingTrack ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        {trackFilePath ? 'Novo arquivo enviado' : editingTrackId ? 'Enviar novo áudio (opcional)' : 'Selecionar arquivo MP3/WAV/OGG'}
                      </Button>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setTrackDialogOpen(false)} className="text-slate-400">Cancelar</Button>
                    <Button onClick={handleSaveTrack} className="bg-violet-600 hover:bg-violet-700 text-white">
                      {editingTrackId ? 'Salvar' : 'Criar Trilha'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
              </div>
            ) : tracks.length === 0 ? (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="py-12 text-center">
                  <Music className="w-12 h-12 mx-auto mb-3 text-slate-600" />
                  <p className="text-slate-400">Nenhuma trilha cadastrada</p>
                  <p className="text-sm text-slate-500 mt-1">Clique em &quot;Nova Trilha&quot; para começar</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {tracks.map((track) => (
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
                          <Switch
                            checked={track.active}
                            onCheckedChange={() => handleToggleTrack(track)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingTrackId(track.id)
                              setTrackForm({
                                name: track.name,
                                description: track.description || '',
                                emoji: track.emoji || '',
                              })
                              setTrackFilePath('')
                              setTrackDuration(track.duration)
                              setTrackDialogOpen(true)
                            }}
                            className="text-slate-400 hover:text-white"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteTrack(track.id)}
                            className="text-slate-400 hover:text-red-400"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Audio Preview */}
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
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
