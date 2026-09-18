import { useState, type FormEvent } from 'react'

import { Eye, EyeOff } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AuthShell } from '@/components/auth/AuthShell'
import { useAuth } from '@/components/auth/AuthContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

type Modo = 'entrar' | 'recuperar'

export default function LoginPage() {
  const { entrarDemo } = useAuth()
  const [modo, setModo] = useState<Modo>('entrar')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Error típico cuando el email no fue confirmado.
  const requiereVerificacion = error?.toLowerCase().includes('email not confirmed')

  async function reenviarVerificacion() {
    if (!email.trim()) {
      setError('Ingresá tu email para reenviar el link de verificación.')
      return
    }
    setSubmitting(true)
    setError(null)
    setInfo(null)
    const { error } = await supabase.auth.resend({ type: 'signup', email })
    setSubmitting(false)
    if (error) {
      setError(error.message)
    } else {
      setInfo(`Te volvimos a enviar el link de verificación a ${email}.`)
    }
  }

  async function handleEntrar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setSubmitting(false)
    }
  }

  async function handleRecuperar(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setInfo(null)
    setSubmitting(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/recuperar-contrasena`,
    })

    setSubmitting(false)
    if (error) {
      setError(error.message)
    } else {
      setInfo(
        `Te enviamos un link para recuperar la contraseña a ${email}. Revisá también el spam.`,
      )
    }
  }

  return (
    <AuthShell subtitle="Gestión de stock para tu tienda">
      {modo === 'entrar' ? (
        <form onSubmit={handleEntrar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="vos@tutienda.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-password">Contraseña</Label>
            <div className="relative">
              <Input
                id="login-password"
                type={verPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                aria-label={verPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setVerPassword((v) => !v)}
              >
                {verPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {!isSupabaseConfigured && (
            <>
              <p className="rounded-md border border-amber-300/50 bg-amber-50 p-2 text-xs text-amber-700">
                Modo demo: no hay <code>web/.env</code> con ningún proyecto de
                Supabase conectado, así que podés recorrer la app con datos de
                ejemplo.
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={entrarDemo}
              >
                Entrar en modo demo
              </Button>
            </>
          )}
          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {requiereVerificacion && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={submitting}
              onClick={reenviarVerificacion}
            >
              {submitting ? 'Enviando…' : 'Reenviar link de verificación'}
            </Button>
          )}
          {info && (
            <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-2 text-xs text-emerald-700">
              {info}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Entrando…' : 'Entrar'}
          </Button>

          <p className="pt-1 text-center text-sm">
            <Link
              to="/register"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Registrarse
            </Link>
          </p>
          <p className="text-center text-xs text-muted-foreground">
            ¿Olvidó su contraseña?{' '}
            <button
              type="button"
              className="underline underline-offset-4 hover:text-foreground"
              onClick={() => setModo('recuperar')}
            >
              Haga click aquí
            </button>
          </p>
        </form>
      ) : (
        <form onSubmit={handleRecuperar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="recuperar-email">Email</Label>
            <Input
              id="recuperar-email"
              type="email"
              autoComplete="email"
              placeholder="vos@tutienda.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-2 text-xs text-emerald-700">
              {info}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Enviando…' : 'Enviar link a mi email'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
            onClick={() => {
              setModo('entrar')
              setError(null)
              setInfo(null)
            }}
          >
            Volver a entrar
          </Button>
        </form>
      )}
    </AuthShell>
  )
}