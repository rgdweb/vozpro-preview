'use client'

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


import { useState, useEffect, useRef } from 'react'
import { Loader2, AlertCircle, Play, Pause } from 'lucide-react'

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
  const [loading, setLoading] = useState(true)
  const [canPlay, setCanPlay] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Reset state when audioPath changes
  useEffect(() => {
    setError(false)
    setLoading(true)
    setCanPlay(false)
  }, [audioPath])

  // Retry on error with reload
  const handleRetry = () => {
    setError(false)
    setLoading(true)
    if (audioRef.current) {
      audioRef.current.load()
    }
  }

  if (!audioPath) {
    return null
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          onClick={handleRetry}
          className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors"
        >
          <AlertCircle className="w-4 h-4" />
          <span className="text-xs">Áudio indisponível — clique para tentar novamente</span>
        </button>
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
        preload="auto"
        onError={() => {
          console.warn('[AudioPlayer] Error loading:', audioPath?.substring(0, 80))
          // Only show error if we haven't loaded at all yet
          if (!canPlay) {
            setError(true)
          }
        }}
        onCanPlay={() => {
          setLoading(false)
          setCanPlay(true)
        }}
        onLoadedData={() => {
          setLoading(false)
          setCanPlay(true)
        }}
        onStalled={() => {
          // Don't immediately error on stall — the browser may recover
          console.warn('[AudioPlayer] Stalled, waiting...')
        }}
        onAbort={() => {
          // Don't error on abort (user navigated away, etc)
        }}
      />
      {loading && (
        <div className="flex items-center gap-2 text-slate-500 mt-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span className="text-[10px]">Carregando áudio...</span>
        </div>
      )}
    </div>
  )
}
