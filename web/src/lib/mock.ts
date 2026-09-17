import type { Session, User } from '@supabase/supabase-js'

import type { Database } from './database'
import { UMBRAL_STOCK_BAJO, type Moneda } from './format'
import type { TicketVenta } from './impresion/ticket'

type Producto = Database['public']['Tables']['productos_maestro']['Row']
type Venta = Database['public']['Tables']['ventas']['Row']
type Miembro = Database['public']['Tables']['usuarios_tenant']['Row']

export type StockRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Producto | null
}

export type VentaItemDetalle = {
  nombre: string
  codigo_barras: string | null
  sku: string | null
  variante: string | null
  cantidad: number
  precio: number
  moneda: Moneda
}

export type VentaConItems = Venta & {
  items: VentaItemDetalle[]
}

const TENANT = '11111111-1111-1111-1111-111111111111'
export const SUCURSAL = '22222222-2222-2222-2222-222222222222'
export const SUCURSAL_2 = '33333333-3333-4333-8333-333333333333'
export const DEMO_USER_ID = '99999999-9999-4999-9999-999999999999'

export type Sucursal = {
  id: string
  tenant_id: string
  nombre: string
  direccion: string | null
  telefono: string | null
}

const sucursales: Sucursal[] = [
  {
    id: SUCURSAL,
    tenant_id: TENANT,
    nombre: 'Sucursal Principal',
    direccion: 'Avda. España 1234',
    telefono: null,
  },
  {
    id: SUCURSAL_2,
    tenant_id: TENANT,
    nombre: 'Sucursal Shopping',
    direccion: 'Paseo La Galería, Local 45',
    telefono: '021 555 789',
  },
]

function hace(horas: number, minutos = 0): string {
  const fecha = new Date()
  fecha.setHours(fecha.getHours() - horas, fecha.getMinutes() - minutos, 0, 0)
  return fecha.toISOString()
}

const productos: Producto[] = [
  {
    id: 'aaaa0001-0000-0000-0000-000000000001',
    codigo_barras: '7791234000011',
    nombre: 'Auriculares Bluetooth inalámbricos',
    marca: 'Beken',
    categoria: 'electrónica',
    foto_url: null,
    creado_por_tenant_id: TENANT,
    created_at: hace(240),
  },
  {
    id: 'aaaa0002-0000-0000-0000-000000000002',
    codigo_barras: '7791234000028',
    nombre: 'Funda de celular silicona',
    marca: 'Nilkin',
    categoria: 'accesorios',
    foto_url: null,
    creado_por_tenant_id: TENANT,
    created_at: hace(200),
  },
  {
    id: 'aaaa0003-0000-0000-0000-000000000003',
    codigo_barras: '7791234000035',
    nombre: 'Cable USB-C 2m',
    marca: 'Generic',
    categoria: 'accesorios',
    foto_url: null,
    creado_por_tenant_id: TENANT,
    created_at: hace(170),
  },
  {
    id: 'aaaa0004-0000-0000-0000-000000000004',
    codigo_barras: '7791234000042',
    nombre: 'Cargador GaN 65W',
    marca: 'Baseus',
    categoria: 'electrónica',
    foto_url: null,
    creado_por_tenant_id: TENANT,
    created_at: hace(90),
  },
  {
    id: 'aaaa0005-0000-0000-0000-000000000005',
    codigo_barras: null,
    nombre: 'Remera básica algodón',
    marca: 'King Tee',
    categoria: 'indumentaria',
    foto_url: null,
    creado_por_tenant_id: TENANT,
    created_at: hace(70),
  },
  {
    id: 'aaaa0006-0000-0000-0000-000000000006',
    codigo_barras: '7791234000066',
    nombre: 'Pendrive USB 64GB',
    marca: 'SanDisk',
    categoria: 'electrónica',
    foto_url: null,
    creado_por_tenant_id: TENANT,
    created_at: hace(50),
  },
]

let stock: StockRow[] = [
  {
    id: 'bbbb0001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    producto_id: productos[0].id,
    sku: 'AUR-BT-NEGRO',
    variante: 'Negro',
    precio: 180000,
    costo: 120000,
    moneda: 'PYG',
    cantidad: 12,
    updated_at: hace(20),
    producto: productos[0],
  },
  {
    id: 'bbbb0002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    producto_id: productos[1].id,
    sku: 'FUNDA-IP14',
    variante: 'iPhone 14',
    precio: 45000,
    costo: 25000,
    moneda: 'PYG',
    cantidad: 20,
    updated_at: hace(18),
    producto: productos[1],
  },
  {
    id: 'bbbb0003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    producto_id: productos[2].id,
    sku: 'CABLE-C2M',
    variante: '2 metros',
    precio: 25000,
    costo: 12000,
    moneda: 'PYG',
    cantidad: 0,
    updated_at: hace(30),
    producto: productos[2],
  },
  {
    id: 'bbbb0004-0000-0000-0000-000000000004',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    producto_id: productos[3].id,
    sku: 'CARG-GAN65-BCO',
    variante: 'Blanco',
    precio: 120000,
    costo: 70000,
    moneda: 'PYG',
    cantidad: 3,
    updated_at: hace(6),
    producto: productos[3],
  },
  {
    id: 'bbbb0005-0000-0000-0000-000000000005',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    producto_id: productos[4].id,
    sku: 'REME-S-CEL',
    variante: 'S / Celeste',
    precio: 55000,
    costo: 35000,
    moneda: 'PYG',
    cantidad: 4,
    updated_at: hace(4),
    producto: productos[4],
  },
  {
    id: 'bbbb0006-0000-0000-0000-000000000006',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    producto_id: productos[5].id,
    sku: 'PD-64GB',
    variante: null,
    precio: 90000,
    costo: 60000,
    moneda: 'PYG',
    cantidad: 15,
    updated_at: hace(1),
    producto: productos[5],
  },
  {
    id: 'bbbb0101-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL_2,
    producto_id: productos[0].id,
    sku: 'AUR-BT-NEGRO',
    variante: 'Negro',
    precio: 180000,
    costo: 120000,
    moneda: 'PYG',
    cantidad: 4,
    updated_at: hace(2),
    producto: productos[0],
  },
  {
    id: 'bbbb0102-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL_2,
    producto_id: productos[5].id,
    sku: 'PD-64GB',
    variante: null,
    precio: 90000,
    costo: 60000,
    moneda: 'PYG',
    cantidad: 6,
    updated_at: hace(3),
    producto: productos[5],
  },
]

export type TipoMovimientoStock =
  | 'entrada'
  | 'salida'
  | 'transferencia_origen'
  | 'transferencia_destino'

export type MovimientoStock = {
  id: string
  tenant_id: string
  sucursal_id: string
  linea_id: string
  producto_nombre: string
  codigo_barras: string | null
  sku: string | null
  tipo: TipoMovimientoStock
  cantidad: number
  motivo: string | null
  ref_sucursal_id: string | null
  ref_sucursal_nombre: string | null
  created_by: string | null
  created_at: string
}

let movimientos: MovimientoStock[] = [
  {
    id: 'eeee0001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL_2,
    linea_id: 'bbbb0101-0000-0000-0000-000000000001',
    producto_nombre: 'Auriculares Bluetooth',
    codigo_barras: '7790000000010',
    sku: 'AUR-BT-NEGRO',
    tipo: 'transferencia_destino',
    cantidad: 4,
    motivo: 'Armar inventario inicial de la sucursal',
    ref_sucursal_id: SUCURSAL,
    ref_sucursal_nombre: 'Sucursal Principal',
    created_by: DEMO_USER_ID,
    created_at: hace(26),
  },
  {
    id: 'eeee0002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    linea_id: 'bbbb0001-0000-0000-0000-000000000001',
    producto_nombre: 'Auriculares Bluetooth',
    codigo_barras: '7790000000010',
    sku: 'AUR-BT-NEGRO',
    tipo: 'transferencia_origen',
    cantidad: -4,
    motivo: 'Armar inventario inicial de la sucursal',
    ref_sucursal_id: SUCURSAL_2,
    ref_sucursal_nombre: 'Sucursal Shopping',
    created_by: DEMO_USER_ID,
    created_at: hace(26),
  },
  {
    id: 'eeee0003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    linea_id: 'bbbb0003-0000-0000-0000-000000000003',
    producto_nombre: 'Cable USB-C 2m',
    codigo_barras: '7790000000027',
    sku: 'CABLE-C2M',
    tipo: 'salida',
    cantidad: -5,
    motivo: 'Merma por daño en caja',
    ref_sucursal_id: null,
    ref_sucursal_nombre: null,
    created_by: DEMO_USER_ID,
    created_at: hace(48),
  },
  {
    id: 'eeee0004-0000-0000-0000-000000000004',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    linea_id: 'bbbb0002-0000-0000-0000-000000000002',
    producto_nombre: 'Funda iPhone 14',
    codigo_barras: '7790000000003',
    sku: 'FUNDA-IP14',
    tipo: 'entrada',
    cantidad: 8,
    motivo: 'Compra a proveedor',
    ref_sucursal_id: null,
    ref_sucursal_nombre: null,
    created_by: DEMO_USER_ID,
    created_at: hace(72),
  },
  {
    id: 'eeee0005-0000-0000-0000-000000000005',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    linea_id: 'bbbb0006-0000-0000-0000-000000000006',
    producto_nombre: 'Pendrive 64GB',
    codigo_barras: '7790000000041',
    sku: 'PD-64GB',
    tipo: 'entrada',
    cantidad: 10,
    motivo: 'Reposición de stock bajo',
    ref_sucursal_id: null,
    ref_sucursal_nombre: null,
    created_by: DEMO_USER_ID,
    created_at: hace(96),
  },
]

const ventas: Venta[] = [
  {
    id: 'cccc0001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    vendedor_id: DEMO_USER_ID,
    total: 180000,
    estado: 'confirmada',
    created_at: hace(3, 20),
  },
  {
    id: 'cccc0002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    vendedor_id: DEMO_USER_ID,
    total: 45000,
    estado: 'confirmada',
    created_at: hace(2, 10),
  },
  {
    id: 'cccc0003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    vendedor_id: DEMO_USER_ID,
    total: 240000,
    estado: 'confirmada',
    created_at: hace(0, 45),
  },
  {
    id: 'cccc0004-0000-0000-0000-000000000004',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    vendedor_id: DEMO_USER_ID,
    total: 50000,
    estado: 'pendiente_sync',
    created_at: hace(0, 10),
  },
]

const miembros: Miembro[] = [
  {
    id: 'dddd0001-0000-0000-0000-000000000001',
    user_id: DEMO_USER_ID,
    tenant_id: TENANT,
    rol: 'dueño',
    created_at: hace(480),
  },
  {
    id: 'dddd0002-0000-0000-0000-000000000002',
    user_id: '88888888-8888-4888-8888-888888888888',
    tenant_id: TENANT,
    rol: 'vendedor',
    created_at: hace(300),
  },
  {
    id: 'dddd0003-0000-0000-0000-000000000003',
    user_id: '77777777-7777-4777-7777-777777777777',
    tenant_id: TENANT,
    rol: 'vendedor',
    created_at: hace(120),
  },
]

export function getMockStock(): StockRow[] {
  return [...stock].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function getMockVentas(): Venta[] {
  return [...ventas].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

const ventasItems: Array<{ ventaId: string; items: VentaItemDetalle[] }> = []
const tickets: Array<{ ventaId: string; ticket: TicketVenta }> = []

export function getMockVentasDetalle(): VentaConItems[] {
  return [...ventas]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((v) => ({
      ...v,
      items: ventasItems.find((it) => it.ventaId === v.id)?.items ?? [],
    }))
}

export function guardarTicketVentaMock(ventaId: string, ticket: TicketVenta) {
  const idx = tickets.findIndex((t) => t.ventaId === ventaId)
  if (idx >= 0) tickets[idx] = { ventaId, ticket }
  else tickets.push({ ventaId, ticket })
  guardar()
}

export function getTicketVentaMock(ventaId: string): TicketVenta | null {
  return tickets.find((t) => t.ventaId === ventaId)?.ticket ?? null
}

function detalleDeLinea(
  linea: StockRow,
  cantidad: number,
  precio: number,
): VentaItemDetalle {
  return {
    nombre: linea.producto?.nombre ?? linea.sku ?? 'Producto',
    codigo_barras: linea.producto?.codigo_barras ?? null,
    sku: linea.sku ?? null,
    variante: linea.variante ?? null,
    cantidad,
    precio,
    moneda: linea.moneda,
  }
}

export function getMockMiembros(): Miembro[] {
  return [...miembros].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function crearProductoMock(entrada: {
  nombre: string
  codigo_barras: string | null
  marca: string | null
  categoria: string | null
  variante: string | null
  sku: string | null
  precio: number
  costo: number | null
  moneda: Moneda
  cantidad: number
  sucursal_id?: string
}) {
  let maestro = productos.find(
    (p) => entrada.codigo_barras && p.codigo_barras === entrada.codigo_barras,
  )

  if (!maestro) {
    maestro = {
      id: crypto.randomUUID(),
      codigo_barras: entrada.codigo_barras,
      nombre: entrada.nombre,
      marca: entrada.marca,
      categoria: entrada.categoria,
      foto_url: null,
      creado_por_tenant_id: TENANT,
      created_at: new Date().toISOString(),
    }
    productos.unshift(maestro)
  }

  const ahora = new Date().toISOString()
  stock.unshift({
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    sucursal_id: entrada.sucursal_id ?? SUCURSAL,
    producto_id: maestro.id,
    sku: entrada.sku,
    variante: entrada.variante,
    precio: entrada.precio,
    costo: entrada.costo,
    moneda: entrada.moneda === 'USD' ? 'USD' : 'PYG',
    cantidad: entrada.cantidad,
    updated_at: ahora,
    producto: maestro,
  })
  guardar()
}

function registrarMovimiento(entrada: {
  sucursal_id: string
  linea_id: string
  nombre: string
  codigo: string | null
  sku: string | null
  tipo: TipoMovimientoStock
  cantidad: number
  motivo?: string | null
  refSucursal?: { id: string; nombre: string } | null
  createdBy?: string | null
}) {
  const m: MovimientoStock = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    sucursal_id: entrada.sucursal_id,
    linea_id: entrada.linea_id,
    producto_nombre: entrada.nombre,
    codigo_barras: entrada.codigo,
    sku: entrada.sku,
    tipo: entrada.tipo,
    cantidad: entrada.cantidad,
    motivo: entrada.motivo ?? null,
    ref_sucursal_id: entrada.refSucursal?.id ?? null,
    ref_sucursal_nombre: entrada.refSucursal?.nombre ?? null,
    created_by: entrada.createdBy ?? DEMO_USER_ID,
    created_at: new Date().toISOString(),
  }
  movimientos.unshift(m)
}

export function getMockSucursales(): Sucursal[] {
  return [...sucursales]
}

export function getSucursalNombre(id: string | null | undefined): string {
  if (!id) return '—'
  return sucursales.find((s) => s.id === id)?.nombre ?? '—'
}

export function getMockMovimientos(limite = 40): MovimientoStock[] {
  return movimientos.slice(0, limite)
}

export function reponerStockMock(
  codigoBarras: string,
  cantidad: number,
  tipo: 'entrada' | 'salida' = 'entrada',
  motivo: string | null = null,
): string | null {
  const cantidadAbs = Number.isFinite(cantidad) ? Math.floor(cantidad) : 0
  if (!codigoBarras || cantidadAbs <= 0) return null
  const linea = stock.find((s) => s.producto?.codigo_barras === codigoBarras)
  if (!linea) return null
  const delta = tipo === 'entrada' ? cantidadAbs : -cantidadAbs
  linea.cantidad = Math.max(0, linea.cantidad + delta)
  linea.updated_at = new Date().toISOString()
  registrarMovimiento({
    sucursal_id: linea.sucursal_id ?? SUCURSAL,
    linea_id: linea.id,
    nombre: linea.producto?.nombre ?? linea.sku ?? 'Producto',
    codigo: linea.producto?.codigo_barras ?? null,
    sku: linea.sku,
    tipo,
    cantidad: delta,
    motivo,
  })
  guardar()
  return linea.producto?.nombre ?? null
}

export function actualizarProductoMock(
  lineaId: string,
  datos: {
    nombre: string
    marca: string | null
    categoria: string | null
    sku: string | null
    variante: string | null
    precio: number
    costo: number | null
    moneda: Moneda
  },
): boolean {
  const linea = stock.find((s) => s.id === lineaId)
  if (!linea) return false

  linea.sku = datos.sku
  linea.variante = datos.variante
  linea.precio = datos.precio
  linea.costo = datos.costo
  linea.moneda = datos.moneda === 'USD' ? 'USD' : 'PYG'
  linea.updated_at = new Date().toISOString()

  const maestro = productos.find((p) => p.id === linea.producto_id)
  if (
    maestro &&
    (maestro.creado_por_tenant_id === null ||
      maestro.creado_por_tenant_id === TENANT)
  ) {
    maestro.nombre = datos.nombre
    maestro.marca = datos.marca
    maestro.categoria = datos.categoria
  }

  guardar()
  return true
}

export function transferirStockMock(
  origenSucursalId: string,
  destinoSucursalId: string,
  lineaId: string,
  cantidad: number,
  motivo: string | null = null,
): { ok: boolean; error?: string } {
  const cantidadAbs = Number.isFinite(cantidad) ? Math.floor(cantidad) : 0
  if (!lineaId || cantidadAbs <= 0) {
    return { ok: false, error: 'Indicá una cantidad válida.' }
  }
  if (origenSucursalId === destinoSucursalId) {
    return { ok: false, error: 'El origen y el destino son la misma sucursal.' }
  }
  const origen = stock.find(
    (s) => s.id === lineaId && s.sucursal_id === origenSucursalId,
  )
  if (!origen) {
    return { ok: false, error: 'La línea no existe en la sucursal de origen.' }
  }
  if (cantidadAbs > origen.cantidad) {
    return { ok: false, error: `Solo hay ${origen.cantidad} unidades en origen.` }
  }
  const refOrigen = getSucursalNombre(origenSucursalId)
  const refDestino = getSucursalNombre(destinoSucursalId)

  origen.cantidad -= cantidadAbs
  origen.updated_at = new Date().toISOString()
  registrarMovimiento({
    sucursal_id: origen.sucursal_id ?? SUCURSAL,
    linea_id: origen.id,
    nombre: origen.producto?.nombre ?? origen.sku ?? 'Producto',
    codigo: origen.producto?.codigo_barras ?? null,
    sku: origen.sku,
    tipo: 'transferencia_origen',
    cantidad: -cantidadAbs,
    motivo,
    refSucursal: { id: destinoSucursalId, nombre: refDestino },
  })

  let destino = stock.find(
    (s) =>
      s.sucursal_id === destinoSucursalId &&
      s.producto_id === origen.producto_id &&
      (s.sku ?? '') === (origen.sku ?? '') &&
      (s.variante ?? '') === (origen.variante ?? ''),
  )
  if (!destino) {
    destino = {
      id: crypto.randomUUID(),
      tenant_id: TENANT,
      sucursal_id: destinoSucursalId,
      producto_id: origen.producto_id,
      sku: origen.sku,
      variante: origen.variante,
      precio: origen.precio,
      costo: origen.costo,
      moneda: origen.moneda,
      cantidad: 0,
      updated_at: new Date().toISOString(),
      producto: origen.producto,
    }
    stock.push(destino)
  }
  destino.cantidad += cantidadAbs
  destino.updated_at = new Date().toISOString()
  registrarMovimiento({
    sucursal_id: destinoSucursalId,
    linea_id: destino.id,
    nombre: destino.producto?.nombre ?? destino.sku ?? 'Producto',
    codigo: destino.producto?.codigo_barras ?? null,
    sku: destino.sku,
    tipo: 'transferencia_destino',
    cantidad: cantidadAbs,
    motivo,
    refSucursal: { id: origenSucursalId, nombre: refOrigen },
  })
  guardar()
  return { ok: true }
}

export function registrarVentaMock(stockId: string, cantidad: number): Venta {
  const linea = stock.find((s) => s.id === stockId)
  if (!linea) throw new Error('La línea de stock ya no existe.')
  if (cantidad > linea.cantidad) throw new Error(`Solo hay ${linea.cantidad} unidades.`)

  linea.cantidad -= cantidad
  linea.updated_at = new Date().toISOString()

  const venta: Venta = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    vendedor_id: DEMO_USER_ID,
    total: linea.precio * cantidad,
    estado: 'confirmada',
    created_at: new Date().toISOString(),
  }
  ventas.unshift(venta)
  ventasItems.push({ ventaId: venta.id, items: [detalleDeLinea(linea, cantidad, linea.precio)] })
  guardar()
  return venta
}

export type VentaCajaItem = {
  stockLineaId: string
  cantidad: number
  precioUnitario: number
  moneda: Moneda
}

export function registrarVentaCaja(params: {
  items: VentaCajaItem[]
  totalGs: number
  estado?: Venta['estado']
}): Venta {
  const ahora = new Date().toISOString()

  const detalles: VentaItemDetalle[] = []
  params.items.forEach((item) => {
    const linea = stock.find((s) => s.id === item.stockLineaId)
    if (!linea) return
    linea.cantidad = Math.max(0, linea.cantidad - item.cantidad)
    linea.updated_at = ahora
    detalles.push(detalleDeLinea(linea, item.cantidad, item.precioUnitario))
  })

  const venta: Venta = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    vendedor_id: DEMO_USER_ID,
    total: Math.round(params.totalGs),
    estado: params.estado ?? 'confirmada',
    created_at: ahora,
  }
  ventas.unshift(venta)
  ventasItems.push({ ventaId: venta.id, items: detalles })
  guardar()
  return venta
}

export type Proveedor = {
  id: string
  tenant_id: string
  nombre: string
  ruc: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  activo: boolean
  created_at: string
}

export type PagoProveedor = {
  id: string
  tenant_id: string
  proveedor_id: string
  fecha: string
  concepto: string | null
  monto: number
  moneda: Moneda
  metodo: 'efectivo' | 'tarjeta' | 'transferencia'
  created_by: string | null
  created_at: string
}

export type PagoProveedorConProveedor = PagoProveedor & {
  proveedor: Proveedor | null
}

const proveedores: Proveedor[] = [
  {
    id: 'eeee0001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    nombre: 'Distribuidora Central SRL',
    ruc: '80012345-6',
    telefono: '(021) 450-123',
    email: 'ventas@central.com.py',
    direccion: 'Santísima Trinidad 2140',
    activo: true,
    created_at: hace(900),
  },
  {
    id: 'eeee0002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    nombre: 'Tecnology Import SA',
    ruc: '80067890-1',
    telefono: '(0985) 123-456',
    email: null,
    direccion: 'Av. Mariscal López 2890',
    activo: true,
    created_at: hace(700),
  },
  {
    id: 'eeee0003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    nombre: 'Textiles Paraguay SA',
    ruc: '80011223-4',
    telefono: null,
    email: 'hola@textilespy.com',
    direccion: null,
    activo: false,
    created_at: hace(500),
  },
]

const pagosProveedor: PagoProveedor[] = [
  {
    id: 'ffff0001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    proveedor_id: proveedores[0].id,
    fecha: hace(0, 30).slice(0, 10),
    concepto: 'Reposición de cables y fundas',
    monto: 1500000,
    moneda: 'PYG',
    metodo: 'transferencia',
    created_by: DEMO_USER_ID,
    created_at: hace(0, 30),
  },
  {
    id: 'ffff0002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    proveedor_id: proveedores[1].id,
    fecha: hace(2).slice(0, 10),
    concepto: 'Pago a cuenta cargador GaN',
    monto: 400,
    moneda: 'USD',
    metodo: 'tarjeta',
    created_by: DEMO_USER_ID,
    created_at: hace(2),
  },
  {
    id: 'ffff0003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    proveedor_id: proveedores[0].id,
    fecha: hace(5).slice(0, 10),
    concepto: 'Factura 0045',
    monto: 850000,
    moneda: 'PYG',
    metodo: 'efectivo',
    created_by: DEMO_USER_ID,
    created_at: hace(5),
  },
  {
    id: 'ffff0004-0000-0000-0000-000000000004',
    tenant_id: TENANT,
    proveedor_id: proveedores[2].id,
    fecha: hace(9).slice(0, 10),
    concepto: null,
    monto: 1200000,
    moneda: 'PYG',
    metodo: 'transferencia',
    created_by: DEMO_USER_ID,
    created_at: hace(9),
  },
]

type DemoSnapshot = {
  productos: Producto[]
  stock: StockRow[]
  movimientos: MovimientoStock[]
  ventas: Venta[]
  ventasItems: Array<{ ventaId: string; items: VentaItemDetalle[] }>
  tickets: Array<{ ventaId: string; ticket: TicketVenta }>
  miembros: Miembro[]
  proveedores: Proveedor[]
  pagosProveedor: PagoProveedor[]
}

const DEMO_KEY = 'kahabox_demo_v1'

function reemplazar<T>(destino: T[], fuente: T[]) {
  destino.splice(0, destino.length, ...fuente)
}

function cargarPersistido() {
  try {
    const raw = localStorage.getItem(DEMO_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Partial<DemoSnapshot>
    if (Array.isArray(data.productos)) reemplazar(productos, data.productos)
    if (Array.isArray(data.stock)) reemplazar(stock, data.stock)
    if (Array.isArray(data.movimientos)) reemplazar(movimientos, data.movimientos)
    if (Array.isArray(data.ventas)) reemplazar(ventas, data.ventas)
    if (Array.isArray(data.ventasItems)) reemplazar(ventasItems, data.ventasItems)
    if (Array.isArray(data.tickets)) reemplazar(tickets, data.tickets)
    if (Array.isArray(data.miembros)) reemplazar(miembros, data.miembros)
    if (Array.isArray(data.proveedores)) reemplazar(proveedores, data.proveedores)
    if (Array.isArray(data.pagosProveedor)) reemplazar(pagosProveedor, data.pagosProveedor)
  } catch {
    // Snapshot dañado: se mantiene el seed demo.
  }
}

function guardar() {
  try {
    const snapshot: DemoSnapshot = {
      productos,
      stock,
      movimientos,
      ventas,
      ventasItems,
      tickets,
      miembros,
      proveedores,
      pagosProveedor,
    }
    localStorage.setItem(DEMO_KEY, JSON.stringify(snapshot))
  } catch {
    // Sin storage (modo privado): convive en memoria, como antes.
  }
}

if (typeof localStorage !== 'undefined') cargarPersistido()

export function getMockProveedores(): Proveedor[] {
  return [...proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function getMockPagosProveedores(): PagoProveedorConProveedor[] {
  return [...pagosProveedor]
    .sort((a, b) => b.fecha.localeCompare(a.fecha))
    .map((p) => ({
      ...p,
      proveedor: proveedores.find((pr) => pr.id === p.proveedor_id) ?? null,
    }))
}

export function crearProveedorMock(entrada: {
  nombre: string
  ruc?: string
  telefono?: string
  email?: string
  direccion?: string
}): Proveedor {
  const proveedor: Proveedor = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    nombre: entrada.nombre,
    ruc: entrada.ruc?.trim() || null,
    telefono: entrada.telefono?.trim() || null,
    email: entrada.email?.trim() || null,
    direccion: entrada.direccion?.trim() || null,
    activo: true,
    created_at: new Date().toISOString(),
  }
  proveedores.unshift(proveedor)
  guardar()
  return proveedor
}

export function actualizarProveedorMock(
  id: string,
  cambios: Partial<Pick<Proveedor, 'nombre' | 'ruc' | 'telefono' | 'email' | 'direccion' | 'activo'>>,
): boolean {
  const idx = proveedores.findIndex((p) => p.id === id)
  if (idx < 0) return false
  proveedores[idx] = { ...proveedores[idx], ...cambios }
  guardar()
  return true
}

export function eliminarProveedorMock(id: string): boolean {
  const idx = proveedores.findIndex((p) => p.id === id)
  if (idx < 0) return false
  proveedores.splice(idx, 1)
  for (let i = pagosProveedor.length - 1; i >= 0; i--) {
    if (pagosProveedor[i].proveedor_id === id) pagosProveedor.splice(i, 1)
  }
  guardar()
  return true
}

export function registrarPagoProveedorMock(entrada: {
  proveedor_id: string
  fecha: string
  concepto?: string
  monto: number
  moneda: Moneda
  metodo: 'efectivo' | 'tarjeta' | 'transferencia'
}): PagoProveedor {
  const ahora = new Date().toISOString()
  const pago: PagoProveedor = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    proveedor_id: entrada.proveedor_id,
    fecha: entrada.fecha,
    concepto: entrada.concepto?.trim() || null,
    monto: entrada.monto,
    moneda: entrada.moneda,
    metodo: entrada.metodo,
    created_by: DEMO_USER_ID,
    created_at: ahora,
  }
  pagosProveedor.unshift(pago)
  guardar()
  return pago
}

export function eliminarPagoProveedorMock(id: string): boolean {
  const idx = pagosProveedor.findIndex((p) => p.id === id)
  if (idx < 0) return false
  pagosProveedor.splice(idx, 1)
  guardar()
  return true
}

export function getMockResumen() {
  const stockBajo = stock.filter(
    (s) => s.cantidad > 0 && s.cantidad <= UMBRAL_STOCK_BAJO,
  ).length
  const agotados = stock.filter((s) => s.cantidad === 0).length

  const monedas = new Set(stock.map((s) => s.moneda))
  const valorStock =
    stock.length > 0 && monedas.size === 1
      ? stock.reduce((acc, s) => acc + s.precio * s.cantidad, 0)
      : null

  const hoy = new Date().toISOString().slice(0, 10)
  const ventasHoy = ventas
    .filter((v) => v.estado === 'confirmada' && v.created_at.slice(0, 10) === hoy)
    .reduce((acc, v) => acc + v.total, 0)

  const pagosHoy = pagosProveedor
    .filter((p) => p.fecha === hoy && p.moneda === 'PYG')
    .reduce((acc, p) => acc + p.monto, 0)

  return { stockBajo, agotados, ventasHoy, valorStock, pagosHoy }
}

export const demoUser = {
  id: DEMO_USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'demo@kahabox.com',
  email_confirmed_at: hace(480),
  phone: '',
  confirmation_sent_at: null,
  confirmed_at: hace(480),
  last_sign_in_at: hace(1),
  app_metadata: {
    provider: 'demo',
    providers: ['demo'],
    tenant_id: TENANT,
    rol: 'dueño',
  },
  user_metadata: { nombre: 'Kaha Demo', nombre_tienda: 'Kaha Demo' },
  identities: [],
  created_at: hace(480),
  updated_at: hace(1),
  is_anonymous: false,
  factors: null,
} as unknown as User

export const demoSession = {
  access_token: 'demo-mode',
  token_type: 'bearer',
  expires_in: 3600 * 24,
  expires_at: Math.floor(Date.now() / 1000) + 3600 * 24,
  refresh_token: 'demo-mode-refresh',
  user: demoUser,
} as unknown as Session