'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Loader2, Mail, Eye, EyeOff, ArrowRight, Shield } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

function AdminLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    fetch('/api/auth/verify').then(res => res.json()).then(data => {
      if (data.authenticated) router.push('/admin')
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
    <div className={`min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-4 transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
      {/* Background subtle glow */}
      <div className="fixed top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-violet-600/5 blur-3xl pointer-events-none" />
      <div className="fixed bottom-[-20%] right-[-10%] w-[400px] h-[400px] rounded-full bg-purple-600/5 blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/20 mb-4">
            <Image src="/logo.svg" alt="VozPro" width={32} height={32} />
          </div>
          <h1 className="text-xl font-bold text-white">VozPro Admin</h1>
          <div className="flex items-center justify-center gap-1.5 mt-1.5">
            <Shield className="w-3 h-3 text-violet-400" />
            <span className="text-xs text-violet-400 font-medium">Acesso restrito</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
          <p className="text-sm text-slate-400 text-center mb-6">
            Apenas administradores podem acessar
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="admin-email" className="text-xs font-medium text-slate-400">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="admin-email"
                  type="email"
                  placeholder="admin@vozpro.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 h-10 bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-600 rounded-lg text-sm focus:border-violet-500/50 focus:ring-violet-500/20"
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="admin-password" className="text-xs font-medium text-slate-400">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Senha de administrador"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-9 pr-9 h-10 bg-slate-800/80 border-slate-700 text-white placeholder:text-slate-600 rounded-lg text-sm focus:border-violet-500/50 focus:ring-violet-500/20"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-lg text-sm mt-1"
            >
              {loading ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Verificando...</>
              ) : (
                <><span>Entrar</span><ArrowRight className="w-3.5 h-3.5 ml-1.5" /></>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-slate-500">Carregando...</div>
      </div>
    }>
      <AdminLoginForm />
    </Suspense>
  )
}
