'use client'

import { useState, useRef, useEffect } from 'react'
import { Play, Pause, Loader2 } from 'lucide-react'

interface VoicePreviewButtonProps {
  /** Audio URL - previewUrl from voice, or refAudioServerUrl from first variation */
  audioUrl?: string
  /** Currently playing voice id - only one preview plays at a time */
  currentlyPlayingId: string | null
  voiceId: string
  onPlayStart: (id: string) => void
  onPlayEnd: () => void
  className?: string
}

/**
 * Mini play/pause button for voice preview on voice cards.
 * Only one preview plays at a time across all cards (managed by parent).
 */
export default function VoicePreviewButton({
  audioUrl,
  currentlyPlayingId,
  voiceId,
  onPlayStart,
  onPlayEnd,
  className = '',
}: VoicePreviewButtonProps) {
  const [loading, setLoading] = useState(false)
  const [audioReady, setAudioReady] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const isPlaying = currentlyPlayingId === voiceId

  // Create audio element when audioUrl is available
  useEffect(() => {
    if (!audioUrl) return

    const audio = new Audio()
    audio.preload = 'metadata'
    audio.src = audioUrl

    audio.addEventListener('canplaythrough', () => {
      setAudioReady(true)
      setLoading(false)
    })

    audio.addEventListener('error', () => {
      console.warn('[VoicePreview] Error loading audio')
      setAudioReady(false)
      setLoading(false)
    })

    audio.addEventListener('ended', () => {
      onPlayEnd()
    })

    audioRef.current = audio

    return () => {
      audio.pause()
      audio.src = ''
      audioRef.current = null
      setAudioReady(false)
    }
  }, [audioUrl])

  // Handle play/pause toggle
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation() // Don't trigger voice card selection

    if (!audioUrl || !audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      onPlayEnd()
    } else {
      if (!audioReady) {
        setLoading(true)
      }
      onPlayStart(voiceId)
      audioRef.current.play().catch(() => {
        setLoading(false)
        onPlayEnd()
      })
    }
  }

  if (!audioUrl) return null

  return (
    <button
      onClick={handleToggle}
      className={`flex items-center justify-center w-7 h-7 rounded-full transition-all duration-200 flex-shrink-0 ${
        isPlaying
          ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/30 scale-110'
          : 'bg-white/10 text-slate-400 hover:bg-violet-500/20 hover:text-violet-300'
      } ${className}`}
      title={isPlaying ? 'Parar preview' : 'Ouvir preview'}
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : isPlaying ? (
        <Pause className="w-3 h-3" />
      ) : (
        <Play className="w-3 h-3 ml-0.5" />
      )}
    </button>
  )
}
