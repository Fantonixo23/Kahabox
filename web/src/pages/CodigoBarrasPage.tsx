import { useEffect, useMemo, useState } from 'react'

import { Barcode, Loader2, Plus, Printer, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  armarDocumentoEtiquetas,
  generarCodigo,
  imprimirDocumento,
  svgCodigo,
  type EtiquetaCodigo,
} from '@/lib/codigoBarras'
import { isSupabaseConfigured } from '@/lib/supabase'
import { getMockStock } from '@/lib/mock'
import { cargarStockRemoto } from '@/lib/stockRemoto'
import { useAuth } from '@/components/auth/AuthContext'
import { vistaStock } from '@/lib/vistaStock'
import { cn } from 'cn'

type LineaStock = {
  id: string
  producto: {
    nombre: string | null
    marca: string | null
    codigo_barras: string | null
  } | null
}

export default function CodigoBarrasPage() {
  const { user } = useAuth()
  const vista = vistaStock(user)

  const [lineas, setLineas] = useState<LineaStock[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [query, setQuery] = useState('')
  const [seleccion, setSeleccion] = useState<LineaStock | null>(null)
  const [nombreLibre, setNombreLibre] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [etiquetas, setEtiquetas] = useState<EtiquetaCodigo[]>([])
  const [usados, setUsados] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    async function cargar() {
      try {
        const datos = isSupabaseConfigured
          ? await cargarStockRemoto(vista)
          : (getMockStock() as LineaStock[])
        if (!activo) return
        setLineas(datos)
        const codigos = new Set<string>()
        for (const l of datos) {
          const c = l.producto?.codigo_barras
          if (c && c.trim()) codigos.add(c.trim())
        }
        setUsados(codigos)
      } catch {
        if (activo) setError('No se pudo cargar el stock. Revisá la conexión.')
      } finally {
        if (activo) setCargando(false)
      }
    }
    void cargar()
    return () => {
      activo = false
    }
  }, [vista])

  const resultados = useMemo(() => {
    const t = query.trim().toLowerCase()
    if (!t) return null
    return (lineas ?? []).filter((l) =>
      [
        l.producto?.nombre,
        l.producto?.marca,
        l.producto?.codigo_barras,
      ].some((f) => f?.toLowerCase().includes(t)),
    )
  }, [lineas, query])

  const vistas = useMemo(
    () =>
      etiquetas.map((e) => ({
        ...e,
        svg: svgCodigo(e.codigo),
      })),
    [etiquetas],
  )

  function nombreSeleccion(): string {
    if (seleccion?.producto?.nombre) return seleccion.producto.nombre
    return nombreLibre.trim()
  }

  function agregarEtiqueta() {
    const nombre = nombreSeleccion()
    if (!nombre && !seleccion) {
      setError('Elegí un producto del stock o escribí un nombre.')
      return
    }
    setError(null)
    const codigo = generarCodigo(usados)
    setUsados((prev) => {
      const next = new Set(prev)
      next.add(codigo)
      return next
    })
    const etiqueta: EtiquetaCodigo = {
      codigo,
      nombre: nombre || 'Producto',
      detalle: seleccion?.producto?.marca?.trim()
        ? seleccion.producto.marca
        : undefined,
    }
    setEtiquetas((prev) => [...prev, etiqueta])
  }

  function imprimir() {
    if (etiquetas.length === 0) {
      setError('Todavía no generaste ninguna etiqueta.')
      return
    }
    setError(null)
    const lista = etiquetas.flatMap((e) =>
      Array.from({ length: cantidad }, () => e),
    )
    void imprimirDocumento(armarDocumentoEtiquetas(lista)).then((err) => {
      if (err) setError(err)
    })
  }

  function elegir(linea: LineaStock) {
    setSeleccion(linea)
    if (linea.producto?.nombre) {
      setQuery(linea.producto.nombre)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <Barcode className="size-5" />
          Códigos de barras
        </h1>
        <p className="text-sm text-muted-foreground">
          Generá códigos nuevos para productos sin código o difíciles de leer y
          mandalos a imprimir como etiquetas.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-amber-300/50 bg-amber-50 p-3 text-sm text-amber-700">
          {error}
        </p>
      )}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Elegí el producto</CardTitle>
            <CardDescription>
              Buscá en el stock de la sucursal actual. Los que ya tienen código
              pueden usarse igual para reimprimir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, marca o código…"
            />
            {cargando ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Cargando stock…
              </div>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {resultados === null
                  ? (lineas ?? []).slice(0, 30).map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => elegir(l)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                          seleccion?.id === l.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/40',
                        )}
                      >
                        <span className="min-w-0 truncate font-medium">
                          {l.producto?.nombre ?? 'Sin nombre'}
                        </span>
                        {l.producto?.codigo_barras ? (
                          <code className="shrink-0 text-xs text-muted-foreground">
                            {l.producto.codigo_barras}
                          </code>
                        ) : (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            SIN CÓDIGO
                          </span>
                        )}
                      </button>
                    ))
                  : resultados.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => elegir(l)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm',
                          seleccion?.id === l.id
                            ? 'border-primary bg-primary/5'
                            : 'hover:border-primary/40',
                        )}
                      >
                        <span className="min-w-0 truncate font-medium">
                          {l.producto?.nombre ?? 'Sin nombre'}
                        </span>
                        {l.producto?.codigo_barras ? (
                          <code className="shrink-0 text-xs text-muted-foreground">
                            {l.producto.codigo_barras}
                          </code>
                        ) : (
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            SIN CÓDIGO
                          </span>
                        )}
                      </button>
                    ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Generar etiqueta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nombre</Label>
                <Input
                  value={seleccion?.producto?.nombre ?? nombreLibre}
                  onChange={(e) => {
                    setSeleccion(null)
                    setNombreLibre(e.target.value)
                  }}
                  placeholder="Nombre del producto"
                />
                <p className="text-xs text-muted-foreground">
                  {seleccion
                    ? `Producto: ${seleccion.producto?.nombre}`
                    : 'O escribí un nombre para una etiqueta libre.'}
                </p>
              </div>

              <Button
                type="button"
                onClick={agregarEtiqueta}
                className="w-full"
              >
                <Plus />
                Generar código y agregar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                A imprimir{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({etiquetas.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid max-h-80 gap-2 overflow-y-auto">
                {vistas.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay etiquetas generadas.
                  </p>
                )}
                {vistas.map((v) => (
                  <div
                    key={v.codigo}
                    className="flex items-center gap-2 rounded-lg border p-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{v.nombre}</p>
                      <div
                        className="flex justify-center"
                        dangerouslySetInnerHTML={{ __html: v.svg }}
                      />
                      <p className="text-center font-mono text-xs">
                        {v.codigo}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setEtiquetas((prev) =>
                          prev.filter((e) => e.codigo !== v.codigo),
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Imprimir</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cb-cantidad">Copias por etiqueta</Label>
                <Input
                  id="cb-cantidad"
                  type="number"
                  min={1}
                  max={100}
                  value={cantidad}
                  onChange={(e) => {
                    const n = Math.trunc(Number(e.target.value))
                    setCantidad(Number.isFinite(n) ? n : 1)
                  }}
                />
              </div>
              <Button type="button" onClick={imprimir} className="w-full">
                <Printer />
                Imprimir etiquetas
              </Button>
              <p className="text-xs text-muted-foreground">
                Se abre el diálogo de impresión del navegador. Usá una hoja de
                etiquetas o pegatinas (medida 52 × 24 mm por etiqueta).
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}