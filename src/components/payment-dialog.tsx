'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, QrCode, Download, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaymentApproved: (format: 'mp3' | 'wav') => void
  audioUrl: string // URL do áudio limpo (data URI)
}

type PaymentFormat = 'mp3' | 'wav'
type PaymentStatus = 'idle' | 'creating' | 'pending' | 'approved' | 'error'

export default function PaymentDialog({
  open,
  onOpenChange,
  onPaymentApproved,
  audioUrl,
}: PaymentDialogProps) {
  const [format, setFormat] = useState<PaymentFormat>('mp3')
  const [status, setStatus] = useState<PaymentStatus>('idle')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [initPoint, setInitPoint] = useState<string | null>(null)
  const [isSandbox, setIsSandbox] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStatus('idle')
      setPaymentId(null)
      setQrCodeUrl(null)
      setInitPoint(null)
      setIsSandbox(false)
      setCountdown(0)
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open])

  // Poll payment status
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current)

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status?id=${id}`)
        const data = await res.json()

        if (data.status === 'approved') {
          setStatus('approved')
          if (pollRef.current) clearInterval(pollRef.current)
          // Auto-download after short delay
          setTimeout(() => {
            onPaymentApproved(format)
            onOpenChange(false)
          }, 1500)
        } else if (data.status === 'rejected' || data.status === 'cancelled') {
          setStatus('error')
          if (pollRef.current) clearInterval(pollRef.current)
          toast.error('Pagamento recusado ou cancelado')
        }
      } catch {
        // Silently retry
      }
    }, 3000) // Check every 3 seconds
  }, [format, onPaymentApproved, onOpenChange])

  // Create payment
  const handleCreatePayment = async () => {
    setStatus('creating')

    try {
      const res = await fetch('/api/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      })

      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'Erro ao criar pagamento')
        setStatus('error')
        return
      }

      setPaymentId(data.id)
      setIsSandbox(!!data.sandbox)
      setInitPoint(data.init_point || data.sandbox_init_point || null)

      if (data.sandbox) {
        // Modo sandbox - mostrar instrução de aprovação manual
        setStatus('pending')
        startPolling(data.id)
      } else {
        // Modo real - gerar QR code
        const point = data.init_point || data.sandbox_init_point
        if (point) {
          // Gerar QR code usando API
          const qrRes = await fetch('/api/payment/qrcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: point }),
          })
          if (qrRes.ok) {
            const qrData = await qrRes.json()
            setQrCodeUrl(qrData.qrCode)
          } else {
            setQrCodeUrl(point) // fallback: abrir URL direto
          }
        }

        setStatus('pending')
        startPolling(data.id)

        // Countdown para expirar (10 minutos)
        setCountdown(600)
      }
    } catch {
      toast.error('Erro de conexão')
      setStatus('error')
    }
  }

  // Sandbox approve
  const handleSandboxApprove = async () => {
    if (!paymentId) return
    try {
      const res = await fetch('/api/payment/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId }),
      })
      if (res.ok) {
        setStatus('approved')
        toast.success('Pagamento aprovado (sandbox)')
        setTimeout(() => {
          onPaymentApproved(format)
          onOpenChange(false)
        }, 1500)
      }
    } catch {
      toast.error('Erro ao aprovar')
    }
  }

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  const formatCountdown = (s: number) => {
    const min = Math.floor(s / 60)
    const sec = s % 60
    return `${min}:${String(sec).padStart(2, '0')}`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <QrCode className="w-5 h-5 text-emerald-400" />
            Baixar Áudio
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Escolha o formato e pague R$1 para baixar seu áudio sem marca d&apos;água
          </DialogDescription>
        </DialogHeader>

        {status === 'idle' && (
          <div className="space-y-4 py-2">
            {/* Format selection */}
            <div>
              <p className="text-sm text-slate-300 mb-3">Escolha o formato:</p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setFormat('mp3')}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    format === 'mp3'
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <Download className="w-6 h-6 mx-auto mb-2 text-violet-400" />
                  <p className="font-semibold text-sm">MP3</p>
                  <p className="text-xs text-slate-400">Menor tamanho</p>
                </button>
                <button
                  onClick={() => setFormat('wav')}
                  className={`p-4 rounded-xl border-2 transition-all text-center ${
                    format === 'wav'
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <Download className="w-6 h-6 mx-auto mb-2 text-emerald-400" />
                  <p className="font-semibold text-sm">WAV</p>
                  <p className="text-xs text-slate-400">Qualidade máxima</p>
                </button>
              </div>
            </div>

            {/* Price */}
            <div className="flex items-center justify-center py-3">
              <div className="text-center">
                <p className="text-3xl font-bold text-emerald-400">R$ 1,00</p>
                <p className="text-xs text-slate-500 mt-1">pagamento único via MercadoPago</p>
              </div>
            </div>

            <Button
              onClick={handleCreatePayment}
              className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-base"
            >
              Gerar QR de Pagamento
            </Button>
          </div>
        )}

        {status === 'creating' && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="w-10 h-10 text-violet-400 animate-spin" />
            <p className="text-slate-300">Gerando pagamento...</p>
          </div>
        )}

        {status === 'pending' && (
          <div className="space-y-4 py-2">
            {isSandbox ? (
              /* Sandbox mode */
              <div className="text-center space-y-4">
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
                  <p className="text-amber-300 text-sm font-medium">Modo Sandbox</p>
                  <p className="text-amber-200/70 text-xs mt-1">
                    MercadoPago não configurado. Configure MERCADOPAGO_ACCESS_TOKEN no painel.
                  </p>
                </div>
                <Button
                  onClick={handleSandboxApprove}
                  className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold"
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Aprovar Pagamento (Teste)
                </Button>
              </div>
            ) : (
              /* Real payment with QR */
              <>
                {qrCodeUrl ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 bg-white rounded-xl">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={qrCodeUrl}
                        alt="QR Code de pagamento"
                        className="w-52 h-52 rounded-lg"
                      />
                    </div>
                    <p className="text-sm text-slate-400 text-center">
                      Escaneie o QR Code com seu app de banco
                    </p>
                  </div>
                ) : initPoint ? (
                  <div className="text-center space-y-3">
                    <p className="text-sm text-slate-400">Abra o link para pagar:</p>
                    <a
                      href={initPoint}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-violet-400 hover:text-violet-300 underline text-sm break-all"
                    >
                      {initPoint}
                    </a>
                  </div>
                ) : null}

                {countdown > 0 && (
                  <p className="text-xs text-slate-500 text-center">
                    Expira em {formatCountdown(countdown)}
                  </p>
                )}

                <div className="flex items-center gap-2 justify-center">
                  <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span className="text-sm text-emerald-300">Aguardando pagamento...</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-slate-700 text-slate-400 hover:text-white"
                  onClick={handleCreatePayment}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Gerar novo QR
                </Button>
              </>
            )}
          </div>
        )}

        {status === 'approved' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <p className="text-lg font-semibold text-emerald-300">Pagamento aprovado!</p>
            <p className="text-sm text-slate-400">Baixando seu áudio...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-6 gap-4">
            <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-sm text-red-300">Erro no pagamento</p>
            <Button
              variant="outline"
              onClick={() => setStatus('idle')}
              className="border-slate-700 text-slate-300 hover:text-white"
            >
              <RefreshCw className="w-4 h-4 mr-1.5" />
              Tentar novamente
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
