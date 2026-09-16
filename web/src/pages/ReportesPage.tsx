import { useEffect, useState } from 'react'

import { AlertTriangle, CalendarDays, PackageX, Scale, WalletCards } from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UMBRAL_STOCK_BAJO, formatMoney, type Moneda } from '@/lib/format'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { vistaStock } from '@/lib/vistaStock'
import { getMockResumen } from '@/lib/mock'

type Resumen = {
  stockBajo: number | null
  agotados: number | null
  ventasHoy: number | null
  valorStock: number | null
  pagosHoy: number | null
}

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
            <CardTitle className="text-sm font-medium">
              Pagos a proveedores
            </CardTitle>
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
    </div>
  )
}