import { useEffect, useState, type FormEvent } from 'react'

import { Link } from 'react-router-dom'

import { CheckCircle2, XCircle } from 'lucide-react'

import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { mensajeErrorSupabase } from '@/lib/mensajesError'
import { supabase } from '@/lib/supabase'

type Estado = 'cargando' | 'sin_sesion' | 'listo' | 'actualizada'

export default function RecoveryPage() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [password, setPassword] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let activo = true
    supabase.auth.getSession().then(({ data }) => {
      if (!activo) return
      setEstado(data.session ? 'listo' : 'sin_sesion')
    })
    return () => {
      activo = false
    }
  }, [])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setError(mensajeErrorSupabase(error.message))
      return
    }

    // Liberar la sesión de recuperación para volver a entrar normal.
    await supabase.auth.signOut()
    setEstado('actualizada')
  }

  if (estado === 'cargando') {
    return (
      <AuthShell subtitle="…">
        <p className="py-6 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      </AuthShell>
    )
  }

  if (estado === 'sin_sesion') {
    return (
      <AuthShell subtitle="Recuperar contraseña">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <XCircle className="size-10 text-destructive" />
          <p className="text-sm font-medium">El link no es válido o expiró</p>
          <p className="text-sm text-muted-foreground">
            Volvé a pedir el link de recuperación desde la pantalla de acceso.
          </p>
          <Button asChild className="mt-2 w-full">
            <Link to="/login">Ir al inicio de sesión</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (estado === 'actualizada') {
    return (
      <AuthShell subtitle="Recuperar contraseña">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <p className="text-sm font-medium">Contraseña actualizada</p>
          <p className="text-sm text-muted-foreground">
            Ya podés iniciar sesión con tu nueva contraseña.
          </p>
          <Button asChild className="mt-2 w-full">
            <Link to="/login">Ir al inicio de sesión</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell subtitle="Elegí tu nueva contraseña">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="rec-nueva">Nueva contraseña</Label>
          <Input
            id="rec-nueva"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rec-confirmar">Confirmar contraseña</Label>
          <Input
            id="rec-confirmar"
            type="password"
            autoComplete="new-password"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Guardando…' : 'Guardar contraseña'}
        </Button>
      </form>
    </AuthShell>
  )
}