import { useEffect, useState, type FormEvent } from 'react'

import { Link, useSearchParams } from 'react-router-dom'

import { AlertTriangle, CheckCircle2, Hourglass, UserPlus } from 'lucide-react'

import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { obtenerInvitacion, unirseInvitacion } from '@/lib/equipoData'
import type { InvitacionPublica } from '@/lib/mock'

type Pantalla =
  | 'cargando'
  | 'error'
  | 'bienvenido'
  | 'pendiente'
  | 'email_en_uso'

const TITULOS_POR_ROL: Record<string, string> = {
  administrador: 'Administrador',
  vendedor: 'Empleado',
}

export default function UnirsePage() {
  const [params] = useSearchParams()
  const token = (params.get('invitacion') ?? '').trim()

  const [pantalla, setPantalla] = useState<Pantalla>('cargando')
  const [invitacion, setInvitacion] = useState<InvitacionPublica | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pendiente, setPendiente] = useState<{ empresa: string; nombre: string } | null>(null)
  const [emailEnUso, setEmailEnUso] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    async function cargar() {
      if (!token) {
        setPantalla('error')
        return
      }
      try {
        const data = await obtenerInvitacion(token)
        if (!activo) return
        if (!data || data.valida === false) {
          setPantalla('error')
          return
        }
        setInvitacion(data)
        setPantalla('bienvenido')
      } catch {
        if (activo) setPantalla('error')
      }
    }
    void cargar()
    return () => {
      activo = false
    }
  }, [token])

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)
    setEmailEnUso(null)
    try {
      const resultado = await unirseInvitacion(token, email, password)
      setPendiente(resultado)
      setPantalla('pendiente')
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Ocurrió un error inesperado.'
      if (/ya tiene una cuenta|already/i.test(mensaje)) {
        setEmailEnUso(email)
        setPantalla('email_en_uso')
      } else {
        setError(mensaje)
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (pantalla === 'cargando') {
    return (
      <AuthShell subtitle="Cargando invitación…">
        <div className="py-4 text-center">
          <Hourglass className="mx-auto size-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">Un momento…</p>
        </div>
      </AuthShell>
    )
  }

  if (pantalla === 'error') {
    return (
      <AuthShell subtitle="Invite no válido">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertTriangle className="size-10 text-amber-600" />
          <p className="text-sm font-medium">Este link no funciona</p>
          <p className="text-sm text-muted-foreground">
            La invitación no existe, venció o ya fue usada. Pedile al dueño que
            te envíe un link nuevo.
          </p>
          <Button variant="outline" className="mt-2 w-full" asChild>
            <Link to="/login">Ir al inicio</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (pantalla === 'pendiente' && pendiente) {
    return (
      <AuthShell subtitle="Tu alta está en revisión">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <p className="text-sm font-medium">¡Listo, {pendiente.nombre}!</p>
          <p className="text-sm text-muted-foreground">
            Quedamos pendientes a la confirmación de {pendiente.empresa}. Aguardá
            un momento mientras el dueño habilita tu cuenta.
          </p>
          <Button variant="outline" className="mt-2 w-full" asChild>
            <Link to="/login">Volver al inicio de sesión</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  if (pantalla === 'email_en_uso') {
    return (
      <AuthShell subtitle="Ese email ya tiene una cuenta">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertTriangle className="size-10 text-amber-600" />
          <p className="text-sm font-medium">
            El email <span className="text-foreground">{emailEnUso}</span> ya
            está en uso.
          </p>
          <p className="text-sm text-muted-foreground">
            Si ya sos parte de una tienda, entrá con tu cuenta.
          </p>
          <Button className="mt-2 w-full" asChild>
            <Link to="/login">Iniciar sesión</Link>
          </Button>
          <button
            type="button"
            onClick={() => {
              setEmailEnUso(null)
              setPassword('')
              setPantalla('bienvenido')
            }}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Probar con otro email
          </button>
        </div>
      </AuthShell>
    )
  }

  const rol = (invitacion?.rol ?? null) as 'administrador' | 'vendedor' | null

  return (
    <AuthShell subtitle={`Vas a ser ${TITULOS_POR_ROL[rol ?? 'vendedor'] ?? 'Empleado'} de la tienda`}>
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <UserPlus className="size-8 text-karton" />
          <p className="text-sm font-medium">
            ¡Bienvenido, {invitacion?.nombre_invitado}!
          </p>
          <p className="text-sm text-muted-foreground">
            {invitacion?.empresa_nombre} quiere que formes parte del equipo.
            Poné tu correo y una contraseña para arrancar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="unirme-email">Email</Label>
            <Input
              id="unirme-email"
              type="email"
              autoComplete="email"
              placeholder="tu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="unirme-password">Contraseña</Label>
            <Input
              id="unirme-password"
              type="password"
              autoComplete="new-password"
              placeholder="Mínimo 6 caracteres"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Creando tu cuenta…' : 'Quiero unirme'}
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}