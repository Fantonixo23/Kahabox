import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  EyeOff,
  FileDown,
  FilterX,
  Printer,
  ShieldCheck,
  Undo2,
} from 'lucide-react'

import { useAuth } from '@/components/auth/AuthContext'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  aplicarFiltrosAuditoria,
  calcularAlertas,
  diffParaMostrar,
  fraseAuditoria,
  HORARIO_FIN,
  HORARIO_INICIO,
  listarAuditoria,
  UMBRAL_BORRADOS_EN_5_MIN,
  type AlertaAuditoria,
  type FiltrosAuditoria,
} from '@/lib/auditoriaData'
import { formatFecha } from '@/lib/format'
import { anularImportacion } from '@/lib/importarExcel'
import {
  getMockSucursales,
  getSucursalNombre,
  type Auditoria,
  type Sucursal,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { esDueno, esJefe } from '@/lib/vistaStock'
import { cn } from 'cn'

const ETIQUETAS_ENTIDAD: Record<string, string> = {
  stock_tienda: 'Stock',
  ventas: 'Ventas',
  productos_maestro: 'Productos',
  clientes: 'Clientes',
  deudas: 'Deudas',
  cobros: 'Cobros',
  proveedores: 'Proveedores',
  pagos_proveedores: 'Pagos a proveedores',
  usuarios_tenant: 'Usuarios',
}

const ETIQUETAS_COMANDO: Record<string, string> = {
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  venta: 'Venta',
  anular: 'Anular',
  ajuste: 'Ajuste stock',
  importar: 'Importar',
  anular_importacion: 'Deshacer importación',
  editar_stock_directo: 'Stock directo',
}

const NIVEL_ALERTA: Record<AlertaAuditoria['nivel'], string> = {
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
}

const TIPO_ALERTA: Record<AlertaAuditoria['tipo'], string> = {
  borrado_masivo: 'Borrado masivo',
  stock_directo: 'Stock sin documento',
  fuera_horario: 'Fuera de horario',
  venta_noche: 'Venta nocturna',
}

function filtroVacio(): FiltrosAuditoria {
  return { desde: null, hasta: null, usuarioId: null, entidad: null, comando: null, sucursalId: null }
}

function etiquetaDia(iso: string): string {
  const hoy = new Date()
  const fecha = new Date(iso)
  const mismoDia = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (mismoDia(hoy, fecha)) return 'Hoy'
  const ayer = new Date(hoy)
  ayer.setDate(hoy.getDate() - 1)
  if (mismoDia(ayer, fecha)) return 'Ayer'
  return fecha.toLocaleDateString('es-PY', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default function AuditoriaPage() {
  const { user } = useAuth()
  const [eventos, setEventos] = useState<Auditoria[] | null>(null)
  const [sucursales, setSucursales] = useState<Sucursal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [tab, setTab] = useState<'historial' | 'alertas'>('historial')
  const [filtros, setFiltros] = useState<FiltrosAuditoria>(filtroVacio)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [deshaciendoId, setDeshaciendoId] = useState<string | null>(null)

  const cargarSucursales = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setSucursales(getMockSucursales())
      return
    }
    try {
      const { data } = await supabase.from('sucursales').select('id, nombre').order('nombre')
      setSucursales((data ?? []) as unknown as Sucursal[])
    } catch {
      setSucursales([])
    }
  }, [])

  const recargar = useCallback(async () => {
    try {
      const lista = await listarAuditoria()
      setEventos(lista)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los movimientos.')
    }
  }, [])

  useEffect(() => {
    void recargar()
    void cargarSucursales()
  }, [recargar, cargarSucursales])

  const filtrados = useMemo(
    () => aplicarFiltrosAuditoria(eventos ?? [], filtros),
    [eventos, filtros],
  )

  const alertas = useMemo(() => calcularAlertas(filtrados), [filtrados])

  const actores = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const e of eventos ?? []) {
      const id = e.usuario_id ?? e.usuario_nombre ?? ''
      if (!id) continue
      mapa.set(id, e.usuario_nombre ?? 'Usuario')
    }
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'))
  }, [eventos])

  const entidades = useMemo(
    () => [...new Set((eventos ?? []).map((e) => e.entidad))].sort(),
    [eventos],
  )
  const comandos = useMemo(
    () => [...new Set((eventos ?? []).map((e) => e.comando))].sort(),
    [eventos],
  )

  const porDia = useMemo(() => {
    const grupos = new Map<string, Auditoria[]>()
    for (const e of filtrados) {
      const dia = e.created_at.slice(0, 10)
      const arr = grupos.get(dia) ?? []
      arr.push(e)
      grupos.set(dia, arr)
    }
    return [...grupos.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([dia, lista]) => ({
        dia,
        eventos: lista.sort((a, b) => b.created_at.localeCompare(a.created_at)),
      }))
  }, [filtrados])

  function toggleExpandir(id: string) {
    setExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function setFiltro(clave: keyof FiltrosAuditoria, valor: string | null) {
    setFiltros((f) => ({ ...f, [clave]: valor || null }))
  }

  function limpiarFiltros() {
    setFiltros(filtroVacio())
  }

  const lotesRevertidos = useMemo(
    () =>
      new Set(
        (eventos ?? [])
          .filter((e) => e.comando === 'anular_importacion' && e.lote_id)
          .map((e) => e.lote_id as string),
      ),
    [eventos],
  )

  async function deshacerImportacion(e: Auditoria) {
    if (!e.lote_id) return
    if (
      !window.confirm(
        '¿Deshacer esta importación? Se restaura el stock como estaba antes de importar.',
      )
    ) {
      return
    }
    setDeshaciendoId(e.id)
    setError(null)
    try {
      const r = await anularImportacion(e.lote_id)
      setAviso(
        `Importación deshecha: ${r.restauradas} restauradas, ${r.eliminadas} eliminadas` +
          (r.saltadas > 0 ? `, ${r.saltadas} con ventas no se tocaron.` : '.'),
      )
      await recargar()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudo deshacer la importación.',
      )
    } finally {
      setDeshaciendoId(null)
    }
  }

  function aplicarAlerta(alerta: AlertaAuditoria) {
    setFiltros((f) => ({
      ...f,
      comando: alerta.filtro?.comando ?? f.comando,
      entidad: alerta.filtro?.entidad ?? f.entidad,
    }))
    setTab('historial')
  }

  async function exportarCsv() {
    const filas = filtrados.map((e) => ({
      Fecha: e.created_at,
      Usuario: e.usuario_nombre ?? e.usuario_id ?? 'Sistema',
      Rol: e.rol ?? '—',
      Módulo: ETIQUETAS_ENTIDAD[e.entidad] ?? e.entidad,
      Acción: ETIQUETAS_COMANDO[e.comando] ?? e.comando,
      Detalle: fraseAuditoria(e),
      Sucursal: getSucursalNombre(e.sucursal_id),
      'Antes': JSON.stringify(e.antes ?? {}),
      'Después': JSON.stringify(e.despues ?? {}),
      Dispositivo: e.dispositivo ?? '',
    }))
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Auditoría')
    XLSX.writeFile(wb, `auditoria-${new Date().toISOString().slice(0, 10)}.xlsx`)
    setAviso(`Exportado ${filas.length} movimientos.`)
  }

  function exportarPdf() {
    const filas = filtrados
      .map(
        (e) => `<tr>
          <td>${formatFecha(e.created_at)}</td>
          <td>${e.usuario_nombre ?? e.usuario_id ?? 'Sistema'}</td>
          <td>${ETIQUETAS_ENTIDAD[e.entidad] ?? e.entidad}</td>
          <td>${ETIQUETAS_COMANDO[e.comando] ?? e.comando}</td>
          <td>${fraseAuditoria(e)}</td>
        </tr>`,
      )
      .join('')
    const html = `<html><head><meta charset="utf-8"><title>Auditoría</title>
      <style>
        body { font-family: system-ui, sans-serif; font-size: 12px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        .sub { color: #666; margin-bottom: 16px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
        th { background: #f5f5f5; }
      </style></head>
      <body><h1>Auditoría</h1>
      <div class="sub">Generado el ${new Date().toLocaleString('es-PY')} · ${filtrados.length} movimientos</div>
      <table><thead><tr><th>Fecha</th><th>Usuario</th><th>Módulo</th><th>Acción</th><th>Detalle</th></tr></thead>
      <tbody>${filas}</tbody></table></body></html>`
    const ventana = window.open('', '_blank')
    if (!ventana) {
      setError('Tu navegador bloqueó la ventana para imprimir.')
      return
    }
    ventana.document.write(html)
    ventana.document.close()
    ventana.focus()
    ventana.print()
  }

  if (user && !esJefe(user)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-10 text-center">
        <EyeOff className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Solo el dueño puede ver la auditoría</p>
        <p className="text-sm text-muted-foreground">
          Esta sección está reservada para el administrador de la tienda.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Auditoría</h1>
          <p className="text-sm text-muted-foreground">
            Registro de quién hizo cada cambio y cuándo, con alertas de anomalías.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={filtrados.length === 0} onClick={exportarCsv}>
            <FileDown />
            Exportar XLSX / CSV
          </Button>
          <Button variant="outline" size="sm" disabled={filtrados.length === 0} onClick={exportarPdf}>
            <Printer />
            Exportar PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Badge variant="secondary">{filtrados.length} movimientos</Badge>
        <Badge variant={alertas.length > 0 ? 'destructive' : 'outline'}>
          {alertas.length} alertas
        </Badge>
        <Badge variant="outline" className="gap-1">
          <ShieldCheck className="size-3.5" /> Solo dueño
        </Badge>
        <Badge variant="outline" className="gap-1">
          <AlertTriangle className="size-3.5" /> Horario {String(HORARIO_INICIO).padStart(2, '0')}:00–{String(HORARIO_FIN).padStart(2, '0')}:00
        </Badge>
      </div>

      {aviso && (
        <p className="rounded-md border border-emerald-300/50 bg-emerald-50 p-3 text-sm text-emerald-700">
          {aviso}
        </p>
      )}
      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2 border-b">
        {(['historial', 'alertas'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === t
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'historial' ? 'Historial' : `Alertas (${alertas.length})`}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-md border p-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Desde</label>
          <Input
            type="date"
            className="h-9 w-40"
            value={filtros.desde ?? ''}
            onChange={(e) => setFiltro('desde', e.target.value || null)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Hasta</label>
          <Input
            type="date"
            className="h-9 w-40"
            value={filtros.hasta ?? ''}
            onChange={(e) => setFiltro('hasta', e.target.value || null)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Usuario</label>
          <Select
            value={filtros.usuarioId ?? 'todos'}
            onValueChange={(v) => setFiltro('usuarioId', v === 'todos' ? null : v)}
          >
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {actores.map(([id, nombre]) => (
                <SelectItem key={id} value={id}>
                  {nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Módulo</label>
          <Select
            value={filtros.entidad ?? 'todos'}
            onValueChange={(v) => setFiltro('entidad', v === 'todos' ? null : v)}
          >
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {entidades.map((ent) => (
                <SelectItem key={ent} value={ent}>
                  {ETIQUETAS_ENTIDAD[ent] ?? ent}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Acción</label>
          <Select
            value={filtros.comando ?? 'todos'}
            onValueChange={(v) => setFiltro('comando', v === 'todos' ? null : v)}
          >
            <SelectTrigger className="h-9 w-44">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {comandos.map((c) => (
                <SelectItem key={c} value={c}>
                  {ETIQUETAS_COMANDO[c] ?? c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Sucursal</label>
          <Select
            value={filtros.sucursalId ?? 'todos'}
            onValueChange={(v) => setFiltro('sucursalId', v === 'todos' ? null : v)}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" className="h-9" onClick={limpiarFiltros}>
          <FilterX />
          Limpiar
        </Button>
      </div>

      {eventos === null ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : tab === 'alertas' ? (
        <div className="space-y-3">
          {alertas.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center">
              <CalendarClock className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">Sin alertas para este filtro</p>
              <p className="text-sm text-muted-foreground">
                Si ocurren borrados masivos, stock sin documento o ventas fuera del
                horario, aparecen acá.
              </p>
            </div>
          ) : (
            alertas.map((alerta) => (
              <button
                key={alerta.id}
                onClick={() => aplicarAlerta(alerta)}
                className="block w-full rounded-md border bg-card p-4 text-left hover:bg-muted/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      alerta.nivel === 'alta'
                        ? 'destructive'
                        : alerta.nivel === 'media'
                          ? 'default'
                          : 'outline'
                    }
                  >
                    {NIVEL_ALERTA[alerta.nivel]}
                  </Badge>
                  {alerta.tipo === 'borrado_masivo' && (
                    <Badge variant="outline">&gt;{UMBRAL_BORRADOS_EN_5_MIN}/5min</Badge>
                  )}
                  <Badge variant="secondary">{TIPO_ALERTA[alerta.tipo]}</Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    <AlertTriangle className="mr-1 inline size-3" />
                    {formatFecha(alerta.creadoEn)}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium">{alerta.titulo}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{alerta.detalle}</p>
              </button>
            ))
          )}
        </div>
      ) : porDia.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center">
          <CalendarClock className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No hay movimientos para este filtro</p>
          <p className="text-sm text-muted-foreground">Probá ampliar las fechas o quitar filtros.</p>
        </div>
      ) : (
        porDia.map((grupo) => (
          <div key={grupo.dia} className="space-y-2">
            <div className="flex items-center gap-2 pt-1">
              <CalendarClock className="size-4 text-muted-foreground" />
              <span className="text-sm font-semibold capitalize">{etiquetaDia(grupo.dia)}</span>
              <span className="text-xs text-muted-foreground">{grupo.eventos.length} mov.</span>
            </div>
            <div className="space-y-2">
              {grupo.eventos.map((e) => {
                const hayDiff = diffParaMostrar(e.antes, e.despues).length > 0
                const abierta = expandidas.has(e.id)
                return (
                  <div key={e.id} className="rounded-md border bg-card">
                    <div className="flex items-start">
                    <button
                      className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left"
                      onClick={() => hayDiff && toggleExpandir(e.id)}
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase">
                        {(e.usuario_nombre ?? '?').charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm">
                          <span className="font-medium">{e.usuario_nombre ?? e.usuario_id ?? 'Sistema'}</span>
                          <span className="text-muted-foreground">
                            {' '}· {fraseAuditoria(e)}
                          </span>
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge variant="secondary">
                            {ETIQUETAS_COMANDO[e.comando] ?? e.comando}
                          </Badge>
                          <Badge variant="outline">{ETIQUETAS_ENTIDAD[e.entidad] ?? e.entidad}</Badge>
                          {e.sucursal_id && (
                            <span className="text-xs text-muted-foreground">
                              {getSucursalNombre(e.sucursal_id)}
                            </span>
                          )}
                          {e.dispositivo && (
                            <span className="hidden text-xs text-muted-foreground sm:inline">
                              {e.dispositivo}
                            </span>
                          )}
                        </span>
                      </span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {new Date(e.created_at).toLocaleTimeString('es-PY', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {hayDiff &&
                          (abierta ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />)}
                      </span>
                    </button>
                    {esDueno(user) &&
                      e.comando === 'importar' &&
                      e.lote_id &&
                      !lotesRevertidos.has(e.lote_id) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-2 mr-2 shrink-0"
                          disabled={deshaciendoId !== null}
                          onClick={() => void deshacerImportacion(e)}
                        >
                          <Undo2 />
                          {deshaciendoId === e.id ? 'Deshaciendo…' : 'Deshacer'}
                        </Button>
                      )}
                    </div>
                    {abierta && hayDiff && (
                      <div className="border-t px-3 py-3 text-sm">
                        <div className="overflow-x-auto rounded-md border">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-muted/50">
                              <tr className="text-muted-foreground">
                                <th className="px-3 py-2 font-medium">Campo</th>
                                <th className="px-3 py-2 font-medium">Antes</th>
                                <th className="px-3 py-2 font-medium">Después</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diffParaMostrar(e.antes, e.despues).map((d) => (
                                <tr key={d.campo} className="border-t">
                                  <td className="px-3 py-2 font-medium">{d.campo}</td>
                                  <td className="px-3 py-2 text-muted-foreground">{d.antes}</td>
                                  <td className="px-3 py-2">{d.despues}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))
      )}
    </div>
  )
}