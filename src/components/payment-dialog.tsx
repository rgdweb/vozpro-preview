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


import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2, XCircle, QrCode, Download, RefreshCw, Mail } from 'lucide-react'
import { toast } from 'sonner'

type DeliveryMode = 'download' | 'email'
type PaymentFormat = 'mp3' | 'wav'
type PaymentStatus = 'idle' | 'creating' | 'pending' | 'approved' | 'sending' | 'sent' | 'error'

interface PaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaymentApproved: (format: 'mp3' | 'wav') => void
  onEmailSent?: () => void
  audioUrl: string // URL do áudio limpo (data URI)
  amount?: string // valor configurado no admin, ex: '1.00'
  isPaymentExempt?: boolean
  freeDownloads?: number
}

export default function PaymentDialog({
  open,
  onOpenChange,
  onPaymentApproved,
  onEmailSent,
  audioUrl,
  amount = '1.00',
  isPaymentExempt = false,
  freeDownloads = 0,
}: PaymentDialogProps) {

  const formatCurrency = (val: string) => {
    const num = parseFloat(val)
    return isNaN(num) ? '1,00' : num.toFixed(2).replace('.', ',')
  }
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('download')
  const [format, setFormat] = useState<PaymentFormat>('mp3')
  const [status, setStatus] = useState<PaymentStatus>('idle')
  const [paymentId, setPaymentId] = useState<string | null>(null)
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null)
  const [initPoint, setInitPoint] = useState<string | null>(null)
  const [isSandbox, setIsSandbox] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [email, setEmail] = useState('')
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null)
  const pollRef = useRef<NodeJS.Timeout | null>(null)

  // Verificar se email está configurado quando o dialog abre
  useEffect(() => {
    if (open) {
      fetch('/api/send-audio-email')
        .then(r => r.json())
        .then(data => setEmailConfigured(data.configured))
        .catch(() => setEmailConfigured(false))
    }
  }, [open])

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setStatus('idle')
      setPaymentId(null)
      setQrCodeUrl(null)
      setInitPoint(null)
      setIsSandbox(false)
      setCountdown(0)
      setEmail('')
      setDeliveryMode('download')
      setFormat('mp3')
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
            if (deliveryMode === 'email') {
              handleSendEmail()
            } else {
              onPaymentApproved(format)
              onOpenChange(false)
            }
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
  }, [format, onPaymentApproved, onOpenChange, deliveryMode])

  // Enviar áudio por email
  const handleSendEmail = useCallback(async () => {
    if (!email || !email.includes('@')) {
      toast.error('Digite um email válido')
      return
    }

    setStatus('sending')

    try {
      const res = await fetch('/api/send-audio-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          audioBase64: audioUrl,
          format,
        }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        setStatus('sent')
        toast.success(`Áudio enviado para ${email}!`)
        if (onEmailSent) onEmailSent()
      } else {
        setStatus('error')
        toast.error(data.error || 'Erro ao enviar email')
      }
    } catch {
      setStatus('error')
      toast.error('Erro de conexão ao enviar email')
    }
  }, [email, audioUrl, format, onEmailSent])

  // Ação principal: baixar ou enviar email (sem pagamento - grátis/exempt)
  const handleFreeAction = useCallback(async () => {
    if (deliveryMode === 'email') {
      handleSendEmail()
    } else {
      // Consumir crédito de download grátis se aplicável
      if (freeDownloads > 0) {
        try {
          await fetch('/api/free-download', { method: 'POST' })
        } catch { /* não bloquear download */ }
      }
      onPaymentApproved(format)
      onOpenChange(false)
    }
  }, [deliveryMode, format, onPaymentApproved, onOpenChange, handleSendEmail, freeDownloads])

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
        setStatus('pending')
        startPolling(data.id)
      } else {
        const point = data.init_point || data.sandbox_init_point
        if (point) {
          const qrRes = await fetch('/api/payment/qrcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: point }),
          })
          if (qrRes.ok) {
            const qrData = await qrRes.json()
            setQrCodeUrl(qrData.qrCode)
          } else {
            setQrCodeUrl(point)
          }
        }

        setStatus('pending')
        startPolling(data.id)
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
          if (deliveryMode === 'email') {
            handleSendEmail()
          } else {
            onPaymentApproved(format)
            onOpenChange(false)
          }
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

  const needsPayment = !isPaymentExempt && freeDownloads <= 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <QrCode className="w-5 h-5 text-emerald-400" />
            Baixar Áudio
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {needsPayment
              ? `Escolha o formato e pague R$${formatCurrency(amount)} para baixar sem marca d&apos;água`
              : 'Escolha como deseja receber seu áudio'}
          </DialogDescription>
        </DialogHeader>

        {status === 'idle' && (
          <div className="space-y-4 py-2">
            {/* Delivery mode: download vs email */}
            <div>
              <p className="text-sm text-slate-300 mb-3">Como deseja receber?</p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setDeliveryMode('download')}
                  className={`p-3 rounded-xl border-2 transition-all text-center ${
                    deliveryMode === 'download'
                      ? 'border-violet-500 bg-violet-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <Download className="w-5 h-5 mx-auto mb-1.5 text-violet-400" />
                  <p className="font-semibold text-xs">Baixar</p>
                  <p className="text-[10px] text-slate-500">No PC</p>
                </button>
                <button
                  onClick={() => setDeliveryMode('email')}
                  disabled={emailConfigured === false}
                  className={`p-3 rounded-xl border-2 transition-all text-center relative ${
                    deliveryMode === 'email'
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : emailConfigured === false
                        ? 'border-slate-700 bg-slate-800/30 opacity-50 cursor-not-allowed'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                  }`}
                >
                  <Mail className="w-5 h-5 mx-auto mb-1.5 text-emerald-400" />
                  <p className="font-semibold text-xs">E-mail</p>
                  <p className="text-[10px] text-slate-500">No email</p>
                  {emailConfigured === false && (
                    <Badge variant="outline" className="absolute -top-1 -right-1 text-[8px] px-1 py-0 bg-red-500/20 border-red-500/30 text-red-300">
                      Off
                    </Badge>
                  )}
                </button>
              </div>
              {emailConfigured === false && deliveryMode === 'email' && (
                <p className="text-[11px] text-amber-400 mt-2">Email indisponível. O admin precisa configurar SMTP.</p>
              )}
            </div>

            {/* Format selection (download mode) */}
            {deliveryMode === 'download' && (
              <div>
                <p className="text-sm text-slate-300 mb-3">Formato:</p>
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
            )}

            {/* Email input (email mode) */}
            {deliveryMode === 'email' && (
              <div className="space-y-2">
                <p className="text-sm text-slate-300">Formato:</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setFormat('mp3')}
                    className={`p-3 rounded-xl border-2 transition-all text-center ${
                      format === 'mp3'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <p className="font-semibold text-sm">MP3</p>
                    <p className="text-xs text-slate-400">Menor tamanho</p>
                  </button>
                  <button
                    onClick={() => setFormat('wav')}
                    className={`p-3 rounded-xl border-2 transition-all text-center ${
                      format === 'wav'
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                    }`}
                  >
                    <p className="font-semibold text-sm">WAV</p>
                    <p className="text-xs text-slate-400">Qualidade máxima</p>
                  </button>
                </div>
                <div className="pt-2">
                  <p className="text-sm text-slate-300 mb-2">Enviar para:</p>
                  <Input
                    type="email"
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-slate-800 border-slate-700 text-white placeholder:text-slate-500 h-11"
                  />
                </div>
              </div>
            )}

            {/* Price + Action button */}
            {!needsPayment ? (
              <Button
                onClick={handleFreeAction}
                disabled={deliveryMode === 'email' && (!email || !email.includes('@'))}
                className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-base disabled:opacity-50"
              >
                {deliveryMode === 'email' ? (
                  <><Mail className="w-4 h-4 mr-2" />Enviar por E-mail ({format.toUpperCase()})</>
                ) : (
                  <><Download className="w-4 h-4 mr-2" />Baixar {format.toUpperCase()}</>
                )}
              </Button>
            ) : (
              <>
                <div className="flex items-center justify-center py-3">
                  <div className="text-center">
                    <p className="text-3xl font-bold text-emerald-400">R$ {formatCurrency(amount)}</p>
                    <p className="text-xs text-slate-500 mt-1">pagamento único via MercadoPago</p>
                  </div>
                </div>

                <Button
                  onClick={handleCreatePayment}
                  disabled={deliveryMode === 'email' && (!email || !email.includes('@'))}
                  className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold text-base disabled:opacity-50"
                >
                  {deliveryMode === 'email' ? (
                    'Gerar QR para Enviar por E-mail'
                  ) : (
                    'Gerar QR de Pagamento'
                  )}
                </Button>
              </>
            )}

            {isPaymentExempt && (
              <p className="text-center text-xs text-emerald-400">
                Liberado — sem pagamento necessário
              </p>
            )}
            {!isPaymentExempt && freeDownloads > 0 && (
              <p className="text-center text-xs text-violet-300">
                Download grátis usando 1 dos seus {freeDownloads} créditos
              </p>
            )}
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
            <p className="text-sm text-slate-400">
              {deliveryMode === 'email' ? 'Enviando para seu email...' : 'Baixando seu áudio...'}
            </p>
          </div>
        )}

        {status === 'sending' && (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="text-slate-300">Enviando áudio para {email}...</p>
            <p className="text-xs text-slate-500">Isso pode levar alguns segundos</p>
          </div>
        )}

        {status === 'sent' && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400" />
            </div>
            <p className="text-lg font-semibold text-emerald-300">Enviado!</p>
            <p className="text-sm text-slate-400">O áudio foi enviado para <strong className="text-white">{email}</strong></p>
            <p className="text-xs text-slate-500">Verifique sua caixa de entrada e spam</p>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="mt-2 border-slate-700 text-slate-300 hover:text-white"
            >
              Fechar
            </Button>
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
