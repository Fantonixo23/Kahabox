import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'

import { LoaderCircle, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import {
  buscarContribuyentesDnit,
  MIN_CARACTERES_DNIT,
  type ContribuyenteDnit,
} from '@/lib/dnit'

type Props = {
  onSeleccionar: (contribuyente: ContribuyenteDnit) => void
  autoFocus?: boolean
}

const ESPERA_MS = 350

function soloDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Coincide exactamente por RUC completo (con guion) o número de documento. */
function esCoincidenciaExacta(
  contribuyente: ContribuyenteDnit,
  consulta: string,
): boolean {
  const q = consulta.trim().toLowerCase()
  const digitos = soloDigitos(consulta)
  if (!q) return false
  if (contribuyente.ruc.toLowerCase() === q) return true
  return digitos.length > 0 && String(contribuyente.doc) === digitos
}

export default function BuscadorDnit({ onSeleccionar, autoFocus }: Props) {
  const [consulta, setConsulta] = useState('')
  const [resultados, setResultados] = useState<ContribuyenteDnit[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const controladorRef = useRef<AbortController | null>(null)

  const seleccionar = useCallback(
    (contribuyente: ContribuyenteDnit) => {
      onSeleccionar(contribuyente)
      setConsulta('')
      setResultados(null)
      setError(null)
    },
    [onSeleccionar],
  )

  /**
   * Ejecuta la búsqueda ya (sin esperar el debounce). Con `autoseleccionar`
   * elige solo si hay un único resultado o una coincidencia exacta de RUC/doc.
   */
  const ejecutarBusqueda = useCallback(
    async (valor: string, autoseleccionar: boolean) => {
      const q = valor.trim()
      if (q.length < MIN_CARACTERES_DNIT) return

      controladorRef.current?.abort()
      const controlador = new AbortController()
      controladorRef.current = controlador
      setCargando(true)
      setError(null)

      try {
        const res = await buscarContribuyentesDnit(q, controlador.signal)
        if (controlador.signal.aborted) return
        setResultados(res)
        if (autoseleccionar) {
          const exacto = res.find((c) => esCoincidenciaExacta(c, q))
          if (exacto) seleccionar(exacto)
          else if (res.length === 1) seleccionar(res[0])
        }
      } catch (e) {
        if (controlador.signal.aborted) return
        setResultados(null)
        setError(
          e instanceof Error ? e.message : 'No se pudo consultar la DNIT.',
        )
      } finally {
        if (!controlador.signal.aborted) setCargando(false)
      }
    },
    [seleccionar],
  )

  useEffect(() => {
    const q = consulta.trim()
    controladorRef.current?.abort()

    if (q.length < MIN_CARACTERES_DNIT) {
      setResultados(null)
      setCargando(false)
      setError(null)
      return
    }

    const temporizador = setTimeout(() => {
      void ejecutarBusqueda(q, false)
    }, ESPERA_MS)

    return () => {
      clearTimeout(temporizador)
      controladorRef.current?.abort()
    }
  }, [consulta, ejecutarBusqueda])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    const q = consulta.trim()
    if (q.length < MIN_CARACTERES_DNIT) return

    const exacto = resultados?.find((c) => esCoincidenciaExacta(c, q))
    if (exacto) {
      seleccionar(exacto)
      return
    }
    if (resultados?.length === 1) {
      seleccionar(resultados[0])
      return
    }
    void ejecutarBusqueda(q, true)
  }
  const q = consulta.trim()

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="RUC, cédula o nombre (mín. 3)"
          className="pl-8"
          autoFocus={autoFocus}
          autoComplete="off"
          inputMode="search"
        />
        {cargando && (
          <LoaderCircle className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {!error && q.length > 0 && q.length < MIN_CARACTERES_DNIT && (
        <p className="text-xs text-muted-foreground">
          Escribí al menos {MIN_CARACTERES_DNIT} caracteres.
        </p>
      )}

      {!error && resultados !== null && (
        resultados.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Sin resultados en la DNIT.
          </p>
        ) : (
          <>
            <ul className="max-h-56 divide-y overflow-y-auto rounded-md border">
              {resultados.map((c) => (
                <li key={`${c.ruc || c.doc}-${c.razonSocial}`}>
                  <button
                    type="button"
                    onClick={() => seleccionar(c)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {c.razonSocial}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        RUC {c.ruc || c.doc}
                      </span>
                    </span>
                    <EstadoBadge estado={c.estado} />
                  </button>
                </li>
              ))}
            </ul>
            {resultados.length > 1 && (
              <p className="text-xs text-muted-foreground">
                {resultados.length} resultados. Escribí el RUC o cédula exactos
                y apretá Enter, o elegí de la lista.
              </p>
            )}
          </>
        )
      )}
    </div>
  )
}

function EstadoBadge({ estado }: { estado: string }) {
  const activo = estado.toUpperCase() === 'ACTIVO'
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        activo
          ? 'bg-emerald-100 text-emerald-700'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {estado || 'S/D'}
    </span>
  )
}
