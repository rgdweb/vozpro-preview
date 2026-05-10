'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, AudioWaveform, Loader2, Mail, Eye, EyeOff, ArrowRight, Sparkles, Shield, Zap, Settings } from 'lucide-react'
import { toast } from 'sonner'
import Image from 'next/image'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Animação de entrada
  useEffect(() => {
    setMounted(true)
  }, [])

  // Verificar se já está logado
  useEffect(() => {
    fetch('/api/auth/verify').then(res => res.json()).then(data => {
      if (data.authenticated) {
        router.push('/')
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
        toast.success(`Bem-vindo, ${data.name || 'Usuário'}!`)
        router.push('/')
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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* ====== LADO ESQUERDO - Branding ====== */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700">
        {/* Background decoration */}
        <div className="absolute inset-0">
          {/* Gradient orbs */}
          <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-400/20 blur-3xl animate-pulse" />
          <div className="absolute bottom-[-15%] left-[-5%] w-[400px] h-[400px] rounded-full bg-violet-400/20 blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="absolute top-[40%] left-[30%] w-[200px] h-[200px] rounded-full bg-indigo-400/15 blur-2xl animate-pulse" style={{ animationDelay: '2s' }} />

          {/* Grid pattern overlay */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)`,
              backgroundSize: '50px 50px',
            }}
          />

          {/* Floating sound wave bars */}
          <div className="absolute bottom-12 left-12 flex items-end gap-1.5 opacity-60">
            {[40, 65, 45, 80, 55, 70, 35, 60, 50, 75, 42, 68, 58].map((h, i) => (
              <div
                key={i}
                className="w-1 bg-white/40 rounded-full animate-pulse"
                style={{
                  height: `${h}px`,
                  animationDelay: `${i * 150}ms`,
                  animationDuration: `${1.5 + (i % 3) * 0.5}s`,
                }}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 xl:px-20">
          {/* Logo */}
          <div
            className={`transition-all duration-1000 ease-out ${
              mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
            }`}
          >
            <div className="flex items-center gap-4 mb-10">
              <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-2xl">
                <Image src="/logo.jpg" alt="VozPro" width={40} height={40} className="rounded" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white tracking-tight">VozPro</h1>
                <p className="text-purple-200 text-sm font-medium">by OmniVoice</p>
              </div>
            </div>

            {/* Tagline */}
            <div className="max-w-lg">
              <h2 className="text-4xl xl:text-5xl font-bold text-white leading-tight mb-6">
                Sintetizador de voz
                <span className="block text-transparent bg-clip-text bg-gradient-to-r from-purple-200 to-pink-200">
                  com inteligência artificial
                </span>
              </h2>
              <p className="text-lg text-purple-100/80 leading-relaxed mb-12">
                Crie vozes profissionais, clonagem vocal, controle de emoções e trilhas musicais para seus projetos.
              </p>
            </div>

            {/* Feature cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
              {[
                { icon: Sparkles, title: 'IA Avançada', desc: 'Vozes naturais e realistas' },
                { icon: Shield, title: 'Seguro', desc: 'Seus dados protegidos' },
                { icon: Zap, title: 'Rápido', desc: 'Geração em segundos' },
                { icon: AudioWaveform, title: 'Qualidade Pro', desc: 'Áudio profissional' },
              ].map((feature, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-3 p-4 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 transition-all duration-700 ${
                    mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
                  }`}
                  style={{ transitionDelay: `${300 + i * 100}ms` }}
                >
                  <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <feature.icon className="w-4.5 h-4.5 text-purple-200" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{feature.title}</p>
                    <p className="text-xs text-purple-200/70">{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ====== LADO DIREITO - Login Form ====== */}
      <div className="flex-1 flex items-center justify-center bg-slate-950 px-6 py-12 lg:px-12 xl:px-20 relative">
        {/* Subtle bg pattern for mobile feel */}
        <div className="absolute inset-0 lg:hidden">
          <div className="absolute top-[-20%] right-[-20%] w-[400px] h-[400px] rounded-full bg-violet-600/10 blur-3xl" />
          <div className="absolute bottom-[-20%] left-[-20%] w-[300px] h-[300px] rounded-full bg-purple-600/10 blur-3xl" />
        </div>

        <div className={`w-full max-w-md relative z-10 transition-all duration-700 ease-out ${
          mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
        }`}>
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Image src="/logo.jpg" alt="VozPro" width={28} height={28} className="rounded" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">VozPro</h1>
              <p className="text-slate-500 text-xs">by OmniVoice</p>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Bem-vindo de volta</h2>
            <p className="text-slate-400">
              Faça login para acessar o painel de síntese de voz
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium text-slate-300">
                Email
              </Label>
              <div className="relative group">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-11 h-12 bg-slate-900/80 border-slate-800 text-white placeholder:text-slate-600 rounded-xl focus:border-violet-500/50 focus:ring-violet-500/20 transition-all text-[15px]"
                  autoFocus
                  autoComplete="email"
                />
              </div>
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium text-slate-300">
                Senha
              </Label>
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-slate-500 group-focus-within:text-violet-400 transition-colors" />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-11 pr-11 h-12 bg-slate-900/80 border-slate-800 text-white placeholder:text-slate-600 rounded-xl focus:border-violet-500/50 focus:ring-violet-500/20 transition-all text-[15px]"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-violet-500/20 hover:shadow-violet-500/30 transition-all duration-300 text-[15px] mt-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 mr-2 animate-spin" />
                  Verificando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4.5 h-4.5 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Footer info */}
          <div className="mt-10 pt-6 border-t border-slate-800/50">
            <p className="text-center text-xs text-slate-600">
              OmniVoice &copy; {new Date().getFullYear()} — Plataforma de síntese de voz com IA
            </p>
            <div className="mt-4 text-center">
              <a
                href="/admin/login"
                className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
              >
                <Settings className="w-3 h-3" />
                Painel Administrativo
              </a>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
