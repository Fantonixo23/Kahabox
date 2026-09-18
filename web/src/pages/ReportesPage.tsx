import { useEffect, useState } from 'react'

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  PackageX,
  ReceiptText,
  Scale,
  Ticket,
  TrendingUp,
  WalletCards,
} from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { UMBRAL_STOCK_BAJO, formatMoney, type Moneda } from '@/lib/format'
import { tasasBase } from '@/lib/cotizaciones'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { vistaStock } from '@/lib/vistaStock'
import {
  getMockResumen,
  getMockTopProductos,
  type ResumenPeriodo,
  type TopProductoReporte,
} from '@/lib/mock'

type Resumen = {
  stockBajo: number | null
  agotados: number | null
  ventasHoy: number | null
  valorStock: number | null
  pagosHoy: number | null
}

const PERIODOS = [
  { dias: 7, etiqueta: '7 días' },
  { dias: 30, etiqueta: '30 días' },
  { dias: 90, etiqueta: '90 días' },
] as const

export default function ReportesPage() {
  const { user } = useAuth()
  const vista = vistaStock(user)
  const [resumen, setResumen] = useState<Resumen>({
    stockBajo: null,
    agotados: null,
    ventasHoy: null,
    valorStock: null,
    pagosHoy: null,
  })
  const [dias, setDias] = useState(7)
  const [periodo, setPeriodo] = useState<ResumenPeriodo | null>(null)
  const [porUnidades, setPorUnidades] = useState<TopProductoReporte[] | null>(null)
  const [porIngresos, setPorIngresos] = useState<TopProductoReporte[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setResumen(getMockResumen())
      setError(null)
      return
    }

    let activo = true

    async function cargar() {
      try {
        const bajos = await supabase
          .from(vista)
          .select('id', { count: 'exact', head: true })
          .lte('cantidad', UMBRAL_STOCK_BAJO)
          .gt('cantidad', 0)

        const agotados = await supabase
          .from(vista)
          .select('id', { count: 'exact', head: true })
          .eq('cantidad', 0)

        const lineasRes = await supabase
          .from(vista)
          .select('cantidad, precio, moneda')
          .limit(5000)

        const ventasRes = await supabase
          .from('ventas')
          .select('total')
          .eq('estado', 'confirmada')
          .gte('created_at', new Date().toISOString().slice(0, 10))

        if (!activo) return
        if (bajos.error) throw bajos.error
        if (agotados.error) throw agotados.error
        if (lineasRes.error) throw lineasRes.error
        if (ventasRes.error) throw ventasRes.error

        const lineas = (lineasRes.data ?? []) as Array<{
          cantidad: number
          precio: number
          moneda: Moneda
        }>
        const monedas = new Set(lineas.map((l) => l.moneda))
        const valorStock =
          lineas.length > 0 && monedas.size === 1
            ? lineas.reduce((acc, l) => acc + l.precio * l.cantidad, 0)
            : null

        const ventas = ventasRes.data as Array<{ total: number }>
        const ventasHoy = ventas.reduce((acc, v) => acc + v.total, 0)

        setResumen({
          stockBajo: bajos.count ?? 0,
          agotados: agotados.count ?? 0,
          ventasHoy,
          valorStock,
          pagosHoy: null,
        })
        setError(null)
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'Error al cargar reportes')
      }
    }

    void cargar()
    return () => {
      activo = false
    }
  }, [vista])

  useEffect(() => {
    let activo = true

    async function cargar() {
      setError(null)
      try {
        if (!isSupabaseConfigured) {
          const mock = getMockTopProductos(dias)
          if (!activo) return
          setPeriodo(mock.resumenPeriodo)
          setPorUnidades(mock.porUnidades)
          setPorIngresos(mock.porIngresos)
          return
        }

        const tasas = tasasBase()
        const desde = new Date(Date.now() - dias * 86400000).toISOString()

        const { data: ventasRes, error: errVentas } = await supabase
          .from('ventas')
          .select('id, total')
          .eq('estado', 'confirmada')
          .gte('created_at', desde)
          .order('created_at', { ascending: false })
          .limit(5000)
        if (errVentas) throw errVentas

        const ventas = (ventasRes ?? []) as Array<{ id: string; total: number }>
        const ventasGs = ventas.reduce((acc, v) => acc + v.total, 0)
        const tickets = ventas.length

        const mapa = new Map<
          string,
          { nombre: string; variante: string | null; unidades: number; ventas: number; ingresosGs: number }
        >()
        if (ventas.length > 0) {
          const { data: itemsRes, error: errItems } = await supabase
            .from('venta_items')
            .select(
              `cantidad, precio_unitario, stock:${vista}(sku, variante, moneda, producto:productos_maestro(nombre))`,
            )
            .in('venta_id', ventas.map((v) => v.id))
            .limit(50000)

          if (errItems) throw errItems

          for (const it of (itemsRes ?? []) as unknown as Array<{
            cantidad: number
            precio_unitario: number
            stock: {
              sku: string | null
              variante: string | null
              moneda: Moneda | null
              producto: { nombre: string | null } | null
            } | null
          }>) {
            const nombre = it.stock?.producto?.nombre ?? 'Producto'
            const variante = it.stock?.variante ?? null
            if (nombre === 'Producto') continue
            const clave = variante ? `${nombre} (${variante})` : nombre
            const moneda: Moneda = it.stock?.moneda ?? 'PYG'
            const ingresoGs = it.cantidad * it.precio_unitario * tasas[moneda]

            const entrada =
              mapa.get(clave) ?? { nombre: clave, variante, unidades: 0, ventas: 0, ingresosGs: 0 }
            entrada.unidades += it.cantidad
            entrada.ventas += 1
            entrada.ingresosGs += ingresoGs
            mapa.set(clave, entrada)
          }
        }

        const top = [...mapa.values()]
        const ordenUnidades = [...top].sort(
          (a, b) => b.unidades - a.unidades || b.ingresosGs - a.ingresosGs,
        )
        const ordenIngresos = [...top].sort((a, b) => b.ingresosGs - a.ingresosGs)

        if (!activo) return
        setPeriodo({ ventasGs, tickets, promedioGs: tickets > 0 ? ventasGs / tickets : 0 })
        setPorUnidades(ordenUnidades.slice(0, 8))
        setPorIngresos(ordenIngresos.slice(0, 8))
      } catch (e) {
        if (activo) setError(e instanceof Error ? e.message : 'Error al cargar reportes')
      }
    }

    void cargar()
    return () => {
      activo = false
    }
  }, [vista, dias])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Lo mínimo para decidir: nada de dashboards decorativos.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <AlertTriangle className="size-4 text-amber-600" />
            <CardTitle className="text-sm font-medium">Stock bajo</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {resumen.stockBajo ?? '…'}
            </p>
            <CardDescription>Líneas con {`≤ ${UMBRAL_STOCK_BAJO} unidades`}</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <PackageX className="size-4 text-destructive" />
            <CardTitle className="text-sm font-medium">Agotados</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {resumen.agotados ?? '…'}
            </p>
            <CardDescription>Líneas sin stock</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CalendarDays className="size-4" />
            <CardTitle className="text-sm font-medium">Ventas de hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {resumen.ventasHoy != null
                ? resumen.ventasHoy.toLocaleString('es-PY')
                : '…'}
            </p>
            <CardDescription>Total confirmado del día</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <WalletCards className="size-4" />
            <CardTitle className="text-sm font-medium">Pagos a proveedores</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {resumen.pagosHoy != null
                ? formatMoney(resumen.pagosHoy, 'PYG')
                : '…'}
            </p>
            <CardDescription>Egresos del día</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Scale className="size-4" />
            <CardTitle className="text-sm font-medium">Valor del stock</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {resumen.valorStock != null
                ? formatMoney(resumen.valorStock, 'PYG')
                : resumen.valorStock === null && isSupabaseConfigured
                  ? 'Gs/US$'
                  : '…'}
            </p>
            <CardDescription>
              Solo si hay una sola moneda en el stock
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Productos más vendidos</h2>
          <p className="text-xs text-muted-foreground">
            Ventas confirmadas. Ingresos aproximados a la cotización actual.
          </p>
        </div>
        <div className="flex rounded-lg border p-0.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              className={cn(
                'rounded-md px-3 py-1 text-xs font-semibold',
                dias === p.dias
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground',
              )}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <TrendingUp className="size-4 text-emerald-600" />
            <CardTitle className="text-sm font-medium">Ventas del período</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {periodo != null ? formatMoney(periodo.ventasGs, 'PYG') : '…'}
            </p>
            <CardDescription>Guaraníes en {PERIODOS.find((p) => p.dias === dias)?.etiqueta}</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Ticket className="size-4" />
            <CardTitle className="text-sm font-medium">Tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {periodo != null ? periodo.tickets.toLocaleString('es-PY') : '…'}
            </p>
            <CardDescription>Ventas confirmadas del período</CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <ReceiptText className="size-4" />
            <CardTitle className="text-sm font-medium">Ticket promedio</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">
              {periodo != null ? formatMoney(periodo.promedioGs, 'PYG') : '…'}
            </p>
            <CardDescription>Promedio por venta confirmada</CardDescription>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <ArrowUpRight className="size-4" />
            <CardTitle className="text-sm font-medium">Por unidades</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {porUnidades == null && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {porUnidades != null && porUnidades.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin ventas confirmadas en el período.
              </p>
            )}
            {porUnidades?.map((p, i) => <Fila key={p.nombre} p={p} i={i} />)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <ArrowDownRight className="size-4" />
            <CardTitle className="text-sm font-medium">Por ingresos (Gs)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {porIngresos == null && <p className="text-sm text-muted-foreground">Cargando…</p>}
            {porIngresos != null && porIngresos.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Sin ventas confirmadas en el período.
              </p>
            )}
            {porIngresos?.map((p, i) => <Fila key={p.nombre} p={p} i={i} />)}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Fila({ p, i }: { p: TopProductoReporte; i: number }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold',
          i < 3 ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground',
        )}
      >
        {i + 1}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{p.nombre}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {p.unidades} un. · {p.ventas} venta{p.ventas !== 1 && 's'}
        </p>
      </div>
      <p className="shrink-0 text-sm font-semibold tabular-nums">
        {formatMoney(p.ingresosGs, 'PYG')}
      </p>
    </div>
  )
}