import { Link, useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'

type Resultado =
  | 'aceptada'
  | 'ya-aceptada'
  | 'rechazada'
  | 'ya-rechazada'
  | 'error'
  | 'desconocido'

type Icono = 'check' | 'x' | 'alerta' | 'info'

const MENSAJES: Record<Resultado, { icono: Icono; titulo: string; detalle: string }> = {
  aceptada: {
    icono: 'check',
    titulo: 'Fue aceptada exitosamente',
    detalle: 'La tienda quedó habilitada y su dueño ya puede empezar a operar en Kahabox.',
  },
  'ya-aceptada': {
    icono: 'check',
    titulo: 'Ya estaba aprobada',
    detalle: 'Esta tienda ya estaba habilitada. Su dueño ya puede operar.',
  },
  rechazada: {
    icono: 'x',
    titulo: 'Fue rechazada',
    detalle: 'El registro quedó rechazado. El dueño verá ese estado al iniciar sesión.',
  },
  'ya-rechazada': {
    icono: 'x',
    titulo: 'Ya estaba rechazada',
    detalle: 'Esta tienda ya había sido rechazada anteriormente.',
  },
  error: {
    icono: 'alerta',
    titulo: 'Algo salió mal',
    detalle: 'Ocurrió un problema inesperado.',
  },
  desconocido: {
    icono: 'info',
    titulo: 'Aviso',
    detalle: 'Este aviso no corresponde a ninguna acción registrada.',
  },
}

function Icono({ tipo }: { tipo: Icono }) {
  const color =
    tipo === 'check'
      ? '#16a34a'
      : tipo === 'x'
        ? '#dc2626'
        : tipo === 'alerta'
          ? '#d97706'
          : '#2563eb'

  const figura = (() => {
    switch (tipo) {
      case 'check':
        return (
          <>
            <circle className="anillo" cx="40" cy="40" r="36" stroke={color} strokeWidth="6" />
            <path
              className="marca"
              d="M24 41 L35 52 L56 29"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )
      case 'x':
        return (
          <>
            <circle className="anillo" cx="40" cy="40" r="36" stroke={color} strokeWidth="6" />
            <path
              className="marca"
              d="M28 28 L52 52 M52 28 L28 52"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
            />
          </>
        )
      case 'alerta':
        return (
          <>
            <path
              className="anillo"
              d="M40 10 L68 66 H12 Z"
              stroke={color}
              strokeWidth="6"
              strokeLinejoin="round"
            />
            <path className="marca" d="M40 34 V50" stroke={color} strokeWidth="7" strokeLinecap="round" />
            <circle cx="40" cy="60" r="3.5" fill={color} />
          </>
        )
      case 'info':
        return (
          <>
            <circle className="anillo" cx="40" cy="40" r="36" stroke={color} strokeWidth="6" />
            <path className="marca" d="M40 36 V54" stroke={color} strokeWidth="7" strokeLinecap="round" />
            <circle cx="40" cy="27" r="3.5" fill={color} />
          </>
        )
    }
  })()

  return (
    <div className="mx-auto size-24">
      <svg viewBox="0 0 80 80" fill="none" aria-hidden="true" className="size-full">
        {figura}
      </svg>
    </div>
  )
}

export default function AprobacionPage() {
  const [params] = useSearchParams()
  const r = (params.get('r') ?? 'desconocido') as Resultado
  const nombre = (params.get('n') ?? '').trim().toUpperCase()
  const mensaje = params.get('m') ?? ''
  const cfg = MENSAJES[r] ?? MENSAJES.desconocido
  const detalle = r === 'error' && mensaje ? mensaje : cfg.detalle

  return (
    <div className="relative min-h-svh overflow-hidden bg-fondo-login">
      <div className="absolute inset-0 bg-neutral-950/55" />
      <div className="relative z-10 flex min-h-svh items-center justify-center p-5">
        <div className="w-full max-w-md">
          <div className="rounded-3xl bg-white p-8 text-center shadow-2xl ring-1 ring-black/5">
            <img src="/logo.png" alt="Kahabox" className="mx-auto size-12 object-contain" />
            <div className="mt-2">
              <Icono tipo={cfg.icono} />
            </div>
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight">{cfg.titulo}</h1>
            {nombre && (
              <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-neutral-400">
                {nombre}
              </p>
            )}
            <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-neutral-500">{detalle}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <Button asChild size="lg">
                <Link to="/">Ir a Kahabox</Link>
              </Button>
              <Button variant="outline" size="lg" onClick={() => window.close()}>
                Cerrar
              </Button>
            </div>
            <p className="mt-5 text-[11px] text-neutral-400">Aviso generado por Kahabox</p>
          </div>
        </div>
      </div>
    </div>
  )
}