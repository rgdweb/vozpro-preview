'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Lock, AudioWaveform, Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'

function AdminLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  // Verificar se já está logado
  useEffect(() => {
    fetch('/api/auth/verify').then(res => res.json()).then(data => {
      if (data.authenticated) {
        router.push('/admin')
      }
    }).catch(() => {})
  }, [router])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) {
      toast.error('Preencha email e senha')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (res.ok && data.success) {
        toast.success('Login realizado!')
        const from = searchParams.get('from') || '/admin'
        router.push(from)
      } else {
        toast.error(data.error || 'Email ou senha incorretos')
      }
    } catch {
      toast.error('Erro de conexão')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
          <AudioWaveform className="w-7 h-7 text-white" />
        </div>
        <CardTitle className="text-2xl text-white">OmniVoice Admin</CardTitle>
        <CardDescription className="text-slate-400">
          Digite email e senha para acessar o painel
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-slate-300">Email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                id="email"
                type="email"
                placeholder="admin@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
                autoFocus
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="password" className="text-slate-300">Senha</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                id="password"
                type="password"
                placeholder="Senha de acesso"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Entrando...
              </>
            ) : (
              'Entrar'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function AdminLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Suspense fallback={<div className="w-full max-w-md"><div className="text-center text-slate-400">Carregando...</div></div>}>
        <AdminLoginForm />
      </Suspense>
    </div>
  )
}
