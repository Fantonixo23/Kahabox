import type { Moneda } from '@/lib/format'
import { formatMoney } from '@/lib/format'
import { getMockAuditorias, type Auditoria } from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type FiltrosAuditoria = {
  desde?: string | null
  hasta?: string | null
  usuarioId?: string | null
  entidad?: string | null
  comando?: string | null
  sucursalId?: string | null
}

export function dispositivoActual(): string {
  if (typeof navigator === 'undefined') return ''
  return (navigator.userAgent ?? '').slice(0, 140)
}

export async function listarAuditoria(filtros: FiltrosAuditoria = {}): Promise<Auditoria[]> {
  if (!isSupabaseConfigured) return aplicarFiltrosAuditoria(getMockAuditorias(), filtros)

  let q = supabase
    .from('auditoria')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500)

  if (filtros.desde) q = q.gte('created_at', filtros.desde)
  if (filtros.hasta) q = q.lte('created_at', `${filtros.hasta}T23:59:59`)
  if (filtros.usuarioId) q = q.eq('usuario_id', filtros.usuarioId)
  if (filtros.entidad) q = q.eq('entidad', filtros.entidad)
  if (filtros.comando) q = q.eq('comando', filtros.comando)
  if (filtros.sucursalId) q = q.eq('sucursal_id', filtros.sucursalId)

  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []) as Auditoria[]
}

export function aplicarFiltrosAuditoria(
  rows: Auditoria[],
  f: FiltrosAuditoria,
): Auditoria[] {
  return rows.filter((e) => {
    if (f.desde && e.created_at < f.desde) return false
    if (f.hasta && e.created_at > `${f.hasta}T23:59:59`) return false
    if (f.usuarioId && e.usuario_id !== f.usuarioId) return false
    if (f.entidad && e.entidad !== f.entidad) return false
    if (f.comando && e.comando !== f.comando) return false
    if (f.sucursalId && e.sucursal_id !== f.sucursalId) return false
    return true
  })
}

export const UMBRAL_BORRADOS_EN_5_MIN = 20
export const HORARIO_INICIO = 8
export const HORARIO_FIN = 21

export type AlertaAuditoria = {
  id: string
  nivel: 'alta' | 'media' | 'baja'
  tipo: 'borrado_masivo' | 'stock_directo' | 'fuera_horario' | 'venta_noche'
  titulo: string
  detalle: string
  creadoEn: string
  filtro?: { comando?: string; entidad?: string }
}

export function calcularAlertas(entradas: Auditoria[]): AlertaAuditoria[] {
  const alertas: AlertaAuditoria[] = []
  const ordenadas = [...entradas].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const VENTANA_MIN = 5

  const borradosPorUsuario = new Map<string, Auditoria[]>()
  for (const e of ordenadas) {
    if (e.comando !== 'eliminar') continue
    const k = e.usuario_id ?? e.usuario_nombre ?? 'desconocido'
    const arr = borradosPorUsuario.get(k) ?? []
    arr.push(e)
    borradosPorUsuario.set(k, arr)
  }
  for (const [clave, eventos] of borradosPorUsuario) {
    const t = eventos.map((e) => new Date(e.created_at).getTime())
    for (let i = 0; i < t.length; i++) {
      const limite = t[i] + VENTANA_MIN * 60000
      let fin = i
      while (fin < t.length && t[fin] <= limite) fin++
      const n = fin - i
      if (n >= UMBRAL_BORRADOS_EN_5_MIN) {
        const nombre = eventos[i].usuario_nombre ?? 'Usuario'
        const desde = new Date(t[i]).toLocaleTimeString('es-PY', {
          hour: '2-digit',
          minute: '2-digit',
        })
        const hasta = new Date(Math.min(limite, t[t.length - 1])).toLocaleTimeString('es-PY', {
          hour: '2-digit',
          minute: '2-digit',
        })
        alertas.push({
          id: `borrado-${clave}-${i}`,
          nivel: 'alta',
          tipo: 'borrado_masivo',
          titulo: `${nombre} eliminó ${n} registros en menos de ${VENTANA_MIN} minutos`,
          detalle: `Se eliminaron ${n} ítems de «${eventos[i].entidad}» entre ${desde} y ${hasta}.`,
          creadoEn: eventos[i].created_at,
          filtro: { comando: 'eliminar', entidad: eventos[i].entidad },
        })
        break
      }
    }
  }

  for (const e of ordenadas) {
    if (e.comando === 'editar_stock_directo') {
      const nombre = e.usuario_nombre ?? 'Usuario'
      const antes = (e.antes ?? {}) as Record<string, unknown>
      const despues = (e.despues ?? {}) as Record<string, unknown>
      const de = valorCantidad(antes.cantidad)
      const a = valorCantidad(despues.cantidad)
      alertas.push({
        id: `stock-${e.id}`,
        nivel: 'media',
        tipo: 'stock_directo',
        titulo: `${nombre} modificó el stock de «${e.entidad_nombre ?? e.entidad}» sin documento`,
        detalle:
          de === a
            ? 'Cambió otros datos del producto directamente.'
            : `Cantidad ${de} → ${a} sin registro de entrada/salida.`,
        creadoEn: e.created_at,
        filtro: { comando: 'editar_stock_directo' },
      })
    }
    if (e.comando === 'venta') {
      const h = new Date(e.created_at).getHours()
      if (h < HORARIO_INICIO || h >= HORARIO_FIN) {
        const nombre = e.usuario_nombre ?? 'Usuario'
        const hora = new Date(e.created_at).toLocaleTimeString('es-PY', {
          hour: '2-digit',
          minute: '2-digit',
        })
        const d = (e.despues ?? {}) as Record<string, unknown>
        const monto = typeof d.total === 'number' ? formatMoneyLocal(d.total) : ''
        alertas.push({
          id: `horario-${e.id}`,
          nivel: e.comando === 'venta' ? 'baja' : 'media',
          tipo: 'fuera_horario',
          titulo: `${nombre} vendió ${monto ? `por ${monto}` : ''} fuera del horario comercial`,
          detalle: `Venta registrada a las ${hora} (horario: ${HHMM(HORARIO_INICIO)}–${HHMM(HORARIO_FIN)}).`,
          creadoEn: e.created_at,
          filtro: { comando: 'venta' },
        })
      }
    }
  }

  return alertas.sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
}

export function fraseAuditoria(e: Auditoria): string {
  const quien = e.usuario_nombre ?? (e.usuario_id ? 'Usuario' : 'Sistema')
  const nombre = e.entidad_nombre ?? e.entidad
  const antes = (e.antes ?? {}) as Record<string, unknown>
  const despues = (e.despues ?? {}) as Record<string, unknown>

  switch (e.comando) {
    case 'venta': {
      const total = typeof despues.total === 'number' ? formatMoneyLocal(despues.total) : ''
      const items = typeof despues.items === 'number' ? ` · ${despues.items} ítems` : ''
      return `${quien} realizó una venta por ${total || '…'}${items}`
    }
    case 'anular': {
      const total = typeof antes.total === 'number' ? formatMoneyLocal(antes.total) : '…'
      return `${quien} anuló una venta de ${total}`
    }
    case 'ajuste': {
      const tipo = despues.tipo === 'entrada' ? 'repuso' : 'descontó'
      const cantidad = valorCantidad(despues.cantidad ?? antes.cantidad)
      return `${quien} ${tipo} ${cantidad} uds. de «${nombre}»`
    }
    case 'importar':
      return `${quien} ${e.descripcion ?? `importó productos desde Excel (${loteDetalle(despues)})`}`
    case 'eliminar':
      return `${quien} eliminó «${nombre}»`
    case 'editar': {
      const cambios = camposCambiados(antes, despues)
      if (cambios.length === 0) return `${quien} editó «${nombre}»`
      return `${quien} cambió ${cambios.join(', ')} de «${nombre}»`
    }
    case 'editar_stock_directo': {
      const de = valorCantidad(antes.cantidad)
      const a = valorCantidad(despues.cantidad)
      return de === a
        ? `${quien} modificó «${nombre}» directamente`
        : `${quien} modificó directamente el stock de «${nombre}» (${de} → ${a})`
    }
    case 'crear':
      return `${quien} creó «${nombre}»`
    default:
      return `${quien} ${e.descripcion ?? `realizó ${e.comando} en «${nombre}»`}`
  }
}

function loteDetalle(despues: Record<string, unknown>): string {
  const creados = despues.creados ?? 0
  const actualizados = despues.actualizados ?? 0
  return `creados ${creados}, actualizados ${actualizados}`
}

function camposCambiados(antes: Record<string, unknown>, despues: Record<string, unknown>): string[] {
  const claves = new Set([...Object.keys(antes), ...Object.keys(despues)])
  const salidas: string[] = []
  for (const k of claves) {
    if (directKey(k)) continue
    if (JSON.stringify(antes[k]) === JSON.stringify(despues[k])) continue
    let de = valorLegible(antes[k])
    let a = valorLegible(despues[k])
    if (k === 'precio' || k === 'costo') {
      de = formatMoneyLocal(antes[k])
      a = formatMoneyLocal(despues[k])
    }
    salidas.push(`${etiquetaCampo(k)} ${de} → ${a}`)
  }
  return salidas
}

function directKey(k: string): boolean {
  return k === 'created_at' || k === 'updated_at' || k === 'tenant_id' || k === 'usuario_id'
}

const ETIQUETAS: Record<string, string> = {
  nombre: 'nombre',
  marca: 'marca',
  categoria: 'categoría',
  sku: 'SKU',
  variante: 'variante',
  precio: 'precio',
  costo: 'costo',
  moneda: 'moneda',
  cantidad: 'cantidad',
  activo: 'estado',
  telefono: 'teléfono',
  direccion: 'dirección',
  email: 'email',
  vencimiento: 'vencimiento',
}

function etiquetaCampo(k: string): string {
  return ETIQUETAS[k] ?? k
}

function valorLegible(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'activo' : 'inactivo'
  if (typeof v === 'number') return formatMoneyLocal(v as number)
  return String(v)
}

function valorCantidad(v: unknown): string {
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string' && !Number.isNaN(Number(v))) return String(Number(v))
  return '—'
}

export function formatMoneyLocal(monto: unknown): string {
  if (monto === null || monto === undefined) return '—'
  if (typeof monto === 'string' && !Number.isNaN(Number(monto))) monto = Number(monto)
  if (typeof monto !== 'number') return String(monto)
  const moneda: Moneda = Math.floor(monto) === monto ? 'PYG' : 'USD'
  return formatMoney(monto, moneda)
}

export function diffParaMostrar(
  antes: Record<string, unknown> | null,
  despues: Record<string, unknown> | null,
): Array<{ campo: string; antes: string; despues: string }> {
  const a = antes ?? {}
  const d = despues ?? {}
  const claves = new Set([...Object.keys(a), ...Object.keys(d)])
  const filas: Array<{ campo: string; antes: string; despues: string }> = []
  for (const k of claves) {
    if (directKey(k)) continue
    if (JSON.stringify(a[k]) === JSON.stringify(d[k])) continue
    let de = valorLegible(a[k])
    let deF = de
    if (k === 'precio' || k === 'costo') deF = formatMoneyLocal(a[k])
    const da = valorLegible(d[k])
    let daF = da
    if (k === 'precio' || k === 'costo') daF = formatMoneyLocal(d[k])
    filas.push({ campo: etiquetaCampo(k), antes: deF, despues: daF })
  }
  return filas
}

function HHMM(h: number): string {
  return `${String(h).padStart(2, '0')}:00`
}