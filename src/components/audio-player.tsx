'use client'

import { useState, useEffect, useRef } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'

interface AudioPlayerProps {
  /** Audio URL - can be a Vercel Blob URL, local path, or data URI */
  audioPath: string
  className?: string
}

/**
 * Audio player that works with any audio URL.
 * On Vercel, tracks are stored in Vercel Blob with direct-access URLs.
 * For local development, files in /public are served directly.
 */
export default function AudioPlayer({ audioPath, className = '' }: AudioPlayerProps) {
  const [error, setError] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Reset error state when audioPath changes
  useEffect(() => {
    setError(false)
  }, [audioPath])

  if (!audioPath) {
    return null
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-amber-400 ${className}`}>
        <AlertCircle className="w-4 h-4" />
        <span className="text-xs">Áudio indisponível</span>
      </div>
    )
  }

  return (
    <div className={className}>
      <audio
        ref={audioRef}
        src={audioPath}
        controls
        className="w-full h-8"
        preload="metadata"
        onError={() => setError(true)}
      />
    </div>
  )
}
