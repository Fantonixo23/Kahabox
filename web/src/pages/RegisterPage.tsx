import { useState, type FormEvent } from 'react'

import { Link } from 'react-router-dom'

import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export default function RegisterPage() {
  const [nombreTienda, setNombreTienda] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [creada, setCreada] = useState(false)
  const [emailEnUso, setEmailEnUso] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { nombre_tienda: nombreTienda.trim() },
      },
    })

    setSubmitting(false)
    if (error) {
      // Con confirmación por email deshabilitada, Supabase sí devuelve el error.
      if (/already\s+registered|already\s+exists|user\s+already/i.test(error.message)) {
        setEmailEnUso(email)
        return
      }
      setError(error.message)
      return
    }

    // Con confirmación por email habilitada, Supabase oculta el caso "email ya
    // existe" para no filtrar qué correos están registrados: devuelve un usuario
    // con la lista de identidades vacía en vez de un error.
    if (
      data.user &&
      Array.isArray(data.user.identities) &&
      data.user.identities.length === 0
    ) {
      setEmailEnUso(email)
      return
    }

    // Con confirmación por email habilitada, signUp NO devuelve sesión:
    // el usuario debe verificar el link que llega a su correo.
    setCreada(true)
  }

  if (emailEnUso) {
    return (
      <AuthShell subtitle="Ese email ya tiene una cuenta">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <AlertTriangle className="size-10 text-amber-600" />
          <p className="text-sm font-medium">
            El email{' '}
            <span className="font-medium text-foreground">{emailEnUso}</span> ya
            está en uso.
          </p>
          <p className="text-sm text-muted-foreground">
            Iniciá sesión con tu contraseña. Si no la recordás, podés
            restablecerla.
          </p>
          <Button className="mt-2 w-full" asChild>
            <Link to="/login">Iniciar sesión</Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link to="/recuperar-contrasena">Olvidé mi contraseña</Link>
          </Button>
          <button
            type="button"
            onClick={() => {
              setEmailEnUso(null)
              setPassword('')
            }}
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Probar con otro email
          </button>
        </div>
      </AuthShell>
    )
  }

  if (creada) {
    return (
      <AuthShell subtitle="Tu cuenta quedó pendiente de aprobación">
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <p className="text-sm font-medium">¡Casi listo!</p>
          <p className="text-sm text-muted-foreground">
            Te enviamos un link de verificación a{' '}
            <span className="font-medium text-foreground">{email}</span>. Entrá
            al link para activar tu cuenta y después iniciá sesión.
          </p>
          <p className="text-sm text-muted-foreground">
            Tu cuenta quedó <span className="font-medium text-foreground">pendiente de aprobación</span>:
            te avisamos cuando la habilitemos. Revisá también la carpeta de spam.
          </p>
          <Button variant="outline" className="mt-2 w-full" asChild>
            <Link to="/login">Volver al inicio de sesión</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell subtitle="Tu tienda en 2 minutos">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="reg-tienda">Nombre de tu tienda</Label>
          <Input
            id="reg-tienda"
            type="text"
            autoComplete="organization"
            placeholder="Ej.: Electrónica Jebai"
            value={nombreTienda}
            onChange={(e) => setNombreTienda(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-email">Email</Label>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            placeholder="vos@tutienda.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reg-password">Contraseña</Label>
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {!isSupabaseConfigured && (
          <p className="rounded-md border border-amber-300/50 bg-amber-50 p-2 text-xs text-amber-700">
            Falta configurar <code>VITE_SUPABASE_URL</code> y{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> en <code>web/.env</code>.
          </p>
        )}
        {error && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </Button>

        <p className="pt-1 text-center text-xs text-muted-foreground">
          ¿Ya tenés cuenta?{' '}
          <Link
            to="/login"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Iniciá sesión
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}