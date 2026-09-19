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

export type VentaPagoDetalle = {
  metodo: 'efectivo' | 'pos' | 'transferencia' | 'fiado'
  moneda: Moneda
  monto: number
  detalle: string | null
}

export type VentaConItems = Venta & {
  items: VentaItemDetalle[]
  pagos: VentaPagoDetalle[]
}

const TENANT = '11111111-1111-1111-1111-111111111111'
export const SUCURSAL = '22222222-2222-2222-2222-222222222222'
export const SUCURSAL_2 = '33333333-3333-4333-8333-333333333333'
export const SUCURSAL_3 = '44444444-4444-4444-8444-444444444444'
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
  {
    id: SUCURSAL_3,
    tenant_id: TENANT,
    nombre: 'Sucursal Mercado',
    direccion: 'Mercado 4, Pasillo 12',
    telefono: '021 444 123',
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
    sucursal_id: SUCURSAL,
    rol: 'dueño',
    estado: 'activo',
    nombre: 'Kaha Demo',
    created_at: hace(480),
  },
  {
    id: 'dddd0002-0000-0000-0000-000000000002',
    user_id: '88888888-8888-4888-8888-888888888888',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    rol: 'administrador',
    estado: 'activo',
    nombre: 'Marcelo',
    created_at: hace(300),
  },
  {
    id: 'dddd0003-0000-0000-0000-000000000003',
    user_id: '77777777-7777-4777-7777-777777777777',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL_2,
    rol: 'vendedor',
    estado: 'activo',
    nombre: 'Lucía',
    created_at: hace(120),
  },
  {
    id: 'dddd0004-0000-0000-0000-000000000004',
    user_id: '66666666-6666-4666-6666-666666666666',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL_2,
    rol: 'vendedor',
    estado: 'pendiente',
    nombre: 'Marcos',
    created_at: hace(3),
  },
]

export function getMockStock(): StockRow[] {
  return [...stock].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export function buscarProductoMaestroMock(codigo: string): Producto | null {
  const c = (codigo ?? '').trim()
  if (!c) return null
  return productos.find((p) => p.codigo_barras === c) ?? null
}

export function getMockVentas(): Venta[] {
  return [...ventas].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

const ventasItems: Array<{ ventaId: string; items: VentaItemDetalle[] }> = []
const ventaPagos: Array<{ ventaId: string; pagos: VentaPagoDetalle[] }> = []
const tickets: Array<{ ventaId: string; ticket: TicketVenta }> = []

export function getMockVentasDetalle(): VentaConItems[] {
  return [...ventas]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((v) => ({
      ...v,
      items: ventasItems.find((it) => it.ventaId === v.id)?.items ?? [],
      pagos: ventaPagos.find((p) => p.ventaId === v.id)?.pagos ?? [],
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

type Invitacion = Database['public']['Tables']['invitaciones']['Row']

const invitaciones: Invitacion[] = [
  {
    id: 'ffff0001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL_2,
    empresa_nombre: 'Kaha Demo',
    nombre_invitado: 'Marcos',
    rol: 'vendedor',
    token: 'token-demo-marcos',
    estado: 'registrado',
    creado_por: DEMO_USER_ID,
    expira_at: hacemosExpira(2),
    created_at: hace(3),
    updated_at: hace(2),
  },
  {
    id: 'ffff0002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    sucursal_id: SUCURSAL,
    empresa_nombre: 'Kaha Demo',
    nombre_invitado: 'Nadia',
    rol: 'administrador',
    token: 'token-demo-nadia',
    estado: 'pendiente',
    creado_por: DEMO_USER_ID,
    expira_at: hacemosExpira(6),
    created_at: hace(1),
    updated_at: hace(1),
  },
]

function hacemosExpira(dias: number): string {
  const fecha = new Date()
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString()
}

export function getMockInvitaciones(): Invitacion[] {
  return [...invitaciones].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function crearInvitacionMock(entrada: {
  nombre: string
  rol: 'administrador' | 'vendedor'
  sucursalId?: string | null
}): { id: string; token: string; expira_at: string } {
  const invitacion: Invitacion = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    sucursal_id: entrada.sucursalId ?? null,
    empresa_nombre: 'Kaha Demo',
    nombre_invitado: entrada.nombre.trim(),
    rol: entrada.rol,
    token: `demo-${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`,
    estado: 'pendiente',
    creado_por: DEMO_USER_ID,
    expira_at: hacemosExpira(7),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  invitaciones.push(invitacion)
  return { id: invitacion.id, token: invitacion.token, expira_at: invitacion.expira_at }
}

export type InvitacionPublica = {
  valida: boolean | null
  estado: string | null
  empresa_nombre: string | null
  nombre_invitado: string | null
  rol: string | null
  expira_at: string | null
}

export function obtenerInvitacionMock(token: string): InvitacionPublica | null {
  const invitacion = invitaciones.find((inv) => inv.token === token)
  if (!invitacion) return null
  return {
    valida: invitacion.estado === 'pendiente' && new Date(invitacion.expira_at).getTime() > Date.now(),
    estado: invitacion.estado,
    empresa_nombre: invitacion.empresa_nombre,
    nombre_invitado: invitacion.nombre_invitado,
    rol: invitacion.rol,
    expira_at: invitacion.expira_at,
  }
}

export function cancelarInvitacionMock(id: string): void {
  const invitacion = invitaciones.find((inv) => inv.id === id)
  if (invitacion) invitacion.estado = 'cancelada'
}

export function confirmarMiembroMock(id: string, sucursalId?: string | null): void {
  const miembro = miembros.find((m) => m.id === id)
  if (miembro) {
    miembro.estado = 'activo'
    if (sucursalId !== undefined) miembro.sucursal_id = sucursalId
    invitaciones.forEach((inv) => {
      if (inv.nombre_invitado === miembro.nombre && inv.estado === 'registrado') {
        inv.estado = 'cancelada'
      }
    })
  }
}

export function rechazarMiembroMock(id: string): void {
  const miembro = miembros.find((m) => m.id === id)
  if (miembro) miembro.estado = 'rechazado'
}

export function setRolMiembroMock(id: string, rol: 'administrador' | 'vendedor'): void {
  const miembro = miembros.find((m) => m.id === id)
  if (miembro && miembro.rol !== 'dueño') miembro.rol = rol
}

export function quitarMiembroMock(id: string): void {
  const idx = miembros.findIndex((m) => m.id === id)
  if (idx >= 0 && miembros[idx].rol !== 'dueño') miembros.splice(idx, 1)
}

export async function miEstadoEquipoMock(): Promise<'activo' | 'pendiente' | 'rechazado' | null> {
  const miembro = miembros.find((m) => m.user_id === DEMO_USER_ID)
  return miembro?.estado ?? null
}

export function demoUserPorRol(rol: 'dueño' | 'administrador' | 'vendedor'): User {
  const base = { ...demoUser }
  base.app_metadata = { ...demoUser.app_metadata, rol }
  return base
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

export function getSucursalMock(id: string): Sucursal | null {
  return sucursales.find((s) => s.id === id) ?? null
}

export function crearSucursalMock(entrada: {
  nombre: string
  direccion?: string | null
  telefono?: string | null
}): string {
  if (sucursales.length >= 3) {
    throw new Error('Kahabox admite hasta 3 sucursales por comercio.')
  }
  const sucursal: Sucursal = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    nombre: entrada.nombre.trim(),
    direccion: entrada.direccion?.trim() || null,
    telefono: entrada.telefono?.trim() || null,
  }
  sucursales.push(sucursal)
  return sucursal.id
}

export function actualizarSucursalMock(
  id: string,
  entrada: { nombre: string; direccion?: string | null; telefono?: string | null },
): void {
  const sucursal = sucursales.find((s) => s.id === id)
  if (!sucursal) throw new Error('La sucursal no existe.')
  sucursal.nombre = entrada.nombre.trim()
  sucursal.direccion = entrada.direccion?.trim() || null
  sucursal.telefono = entrada.telefono?.trim() || null
}

export function eliminarSucursalMock(id: string): { ok: boolean; error?: string } {
  const idx = sucursales.findIndex((s) => s.id === id)
  if (idx < 0) return { ok: false, error: 'La sucursal no existe.' }
  if (sucursales.length <= 1) {
    return { ok: false, error: 'No podés eliminar la única sucursal del comercio.' }
  }
  const conStock = stock.some((s) => s.sucursal_id === id)
  const conVentas = ventas.some((v) => v.sucursal_id === id)
  const conMiembros = miembros.some((m) => m.sucursal_id === id)
  if (conStock || conVentas || conMiembros) {
    return {
      ok: false,
      error: 'La sucursal tiene stock, ventas o miembros asignados. Reasignalos antes de eliminarla.',
    }
  }
  sucursales.splice(idx, 1)
  return { ok: true }
}

export function setSucursalMiembroMock(id: string, sucursalId: string | null): void {
  const miembro = miembros.find((m) => m.id === id)
  if (miembro) miembro.sucursal_id = sucursalId
}

export type FilaImportacion = {
  nombre: string
  codigo: string | null
  marca: string | null
  categoria: string | null
  sku: string | null
  variante: string | null
  moneda: Moneda
  precio: number
  costo: number | null
  cantidad: number
}

export function importarStockMock(
  filas: FilaImportacion[],
  sucursalId: string | null,
): { creados: number; actualizados: number; sinCambios: number; errores: Array<{ fila: number; motivo: string }> } {
  let creados = 0
  let actualizados = 0
  let sinCambios = 0
  const errores: Array<{ fila: number; motivo: string }> = []
  const suc = sucursalId ?? SUCURSAL

  filas.forEach((f, i) => {
    try {
      const nombre = f.nombre.trim()
      if (!nombre) {
        errores.push({ fila: i + 1, motivo: 'Falta el nombre' })
        return
      }
      const cantidad = Math.max(0, Math.floor(f.cantidad))
      if (!Number.isFinite(f.precio) || f.precio < 0) {
        errores.push({ fila: i + 1, motivo: 'Precio inválido' })
        return
      }

      let maestro = f.codigo
        ? productos.find((p) => p.codigo_barras === f.codigo)
        : undefined
      if (!maestro) {
        maestro = productos.find(
          (p) =>
            p.nombre.toLowerCase() === nombre.toLowerCase() &&
            (p.marca ?? '').toLowerCase() === (f.marca ?? '').toLowerCase() &&
            (p.categoria ?? '').toLowerCase() === (f.categoria ?? '').toLowerCase(),
        )
      }
      if (!maestro) {
        maestro = {
          id: crypto.randomUUID(),
          codigo_barras: f.codigo,
          nombre,
          marca: f.marca,
          categoria: f.categoria,
          foto_url: null,
          creado_por_tenant_id: TENANT,
          created_at: new Date().toISOString(),
        }
        productos.unshift(maestro)
      }

      const linea = stock.find(
        (s) =>
          s.producto_id === maestro.id &&
          (s.sucursal_id ?? SUCURSAL) === suc &&
          (s.sku ?? '') === (f.sku ?? '') &&
          (s.variante ?? '') === (f.variante ?? ''),
      )

      const ahora = new Date().toISOString()
      let lineaId: string | null = null
      if (!linea) {
        lineaId = crypto.randomUUID()
        stock.unshift({
          id: lineaId,
          tenant_id: TENANT,
          sucursal_id: suc,
          producto_id: maestro.id,
          sku: f.sku,
          variante: f.variante,
          precio: f.precio,
          costo: f.costo,
          moneda: f.moneda === 'USD' ? 'USD' : 'PYG',
          cantidad,
          updated_at: ahora,
          producto: maestro,
        })
        creados += 1
        if (cantidad > 0) {
          registrarMovimiento({
            sucursal_id: suc,
            linea_id: lineaId,
            nombre,
            codigo: f.codigo,
            sku: f.sku,
            tipo: 'entrada',
            cantidad,
            motivo: 'Importación desde Excel',
          })
        }
      } else {
        const prev = linea.cantidad
        linea.precio = f.precio
        linea.costo = f.costo
        linea.moneda = f.moneda === 'USD' ? 'USD' : 'PYG'
        linea.cantidad = cantidad
        linea.updated_at = ahora
        if (prev === cantidad) {
          sinCambios += 1
        } else {
          actualizados += 1
          const delta = cantidad - prev
          if (delta !== 0) {
            registrarMovimiento({
              sucursal_id: suc,
              linea_id: linea.id,
              nombre,
              codigo: f.codigo,
              sku: f.sku,
              tipo: delta < 0 ? 'salida' : 'entrada',
              cantidad: delta,
              motivo: 'Importación desde Excel',
            })
          }
        }
      }
    } catch (e) {
      errores.push({
        fila: i + 1,
        motivo: e instanceof Error ? e.message : 'Error al importar la fila',
      })
    }
  })

  guardar()
  return { creados, actualizados, sinCambios, errores }
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

export function borrarProductoMock(lineaId: string): boolean {
  const indice = stock.findIndex((s) => s.id === lineaId)
  if (indice < 0) return false
  stock.splice(indice, 1)
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
    sucursal_id: linea.sucursal_id ?? SUCURSAL,
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
  pagos?: VentaPagoDetalle[]
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
  ventaPagos.push({ ventaId: venta.id, pagos: params.pagos ?? [] })
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

export type Cliente = {
  id: string
  tenant_id: string
  nombre: string
  tipo: 'fisica' | 'juridica'
  ruc: string | null
  cedula: string | null
  telefono: string | null
  email: string | null
  direccion: string | null
  ciudad: string | null
  notas: string | null
  activo: boolean
  created_at: string
}

export type Deuda = {
  id: string
  tenant_id: string
  cliente_id: string
  venta_id: string | null
  fecha: string
  vencimiento: string | null
  monto: number
  moneda: Moneda
  created_by: string | null
  created_at: string
}

export type Cobro = {
  id: string
  tenant_id: string
  cliente_id: string
  fecha: string
  concepto: string | null
  monto: number
  moneda: Moneda
  metodo: 'efectivo' | 'pos' | 'transferencia'
  created_by: string | null
  created_at: string
}

export type Auditoria = {
  id: string
  tenant_id: string
  usuario_id: string | null
  usuario_nombre: string | null
  rol: 'dueño' | 'vendedor' | null
  sucursal_id: string | null
  entidad: string
  entidad_id: string | null
  entidad_nombre: string | null
  comando: string
  descripcion: string | null
  antes: Record<string, unknown> | null
  despues: Record<string, unknown> | null
  lote_id: string | null
  ip: string | null
  dispositivo: string | null
  created_at: string
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

function enDias(dias: number): string {
  return new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10)
}

const clientes: Cliente[] = [
  {
    id: 'aaaa1001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    nombre: 'María González',
    tipo: 'fisica',
    ruc: '1234567-8',
    cedula: '1234567',
    telefono: '(0985) 555-010',
    email: 'mariagz@example.com',
    direccion: 'Microcentro, Av. San Blas 321',
    ciudad: 'Ciudad del Este',
    notas: 'Cliente frecuente. Límite de crédito 500.000 Gs.',
    activo: true,
    created_at: hace(1200),
  },
  {
    id: 'aaaa1002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    nombre: 'Comercial San Blas SRL',
    tipo: 'juridica',
    ruc: '80054321-0',
    cedula: null,
    telefono: '(061) 500-123',
    email: 'ventas@comercialsanblas.com.py',
    direccion: 'Av. San Blas 1001',
    ciudad: 'Ciudad del Este',
    notas: 'Compra al mayor. Paga a 15 días.',
    activo: true,
    created_at: hace(1000),
  },
  {
    id: 'aaaa1003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    nombre: 'Juan Pérez',
    tipo: 'fisica',
    ruc: null,
    cedula: '9876543',
    telefono: '(0971) 222-333',
    email: null,
    direccion: null,
    ciudad: 'Minga Guazú',
    notas: null,
    activo: true,
    created_at: hace(800),
  },
  {
    id: 'aaaa1004-0000-0000-0000-000000000004',
    tenant_id: TENANT,
    nombre: 'Ferretería Los Hermanos SA',
    tipo: 'juridica',
    ruc: '80011122-3',
    cedula: null,
    telefono: '(061) 611-222',
    email: 'contacto@loshermanos.com.py',
    direccion: 'Barrio Obrero, Calle 12',
    ciudad: 'Ciudad del Este',
    notas: null,
    activo: false,
    created_at: hace(600),
  },
]

const deudas: Deuda[] = [
  {
    id: 'aaaa2001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    cliente_id: clientes[0].id,
    venta_id: null,
    fecha: hace(8).slice(0, 10),
    vencimiento: enDias(5),
    monto: 350000,
    moneda: 'PYG',
    created_by: DEMO_USER_ID,
    created_at: hace(8),
  },
  {
    id: 'aaaa2002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    cliente_id: clientes[1].id,
    venta_id: null,
    fecha: hace(15).slice(0, 10),
    vencimiento: enDias(10),
    monto: 400,
    moneda: 'USD',
    created_by: DEMO_USER_ID,
    created_at: hace(15),
  },
  {
    id: 'aaaa2003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    cliente_id: clientes[2].id,
    venta_id: null,
    fecha: hace(2).slice(0, 10),
    vencimiento: null,
    monto: 120000,
    moneda: 'PYG',
    created_by: DEMO_USER_ID,
    created_at: hace(2),
  },
]

const cobros: Cobro[] = [
  {
    id: 'aaaa3001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    cliente_id: clientes[0].id,
    fecha: hace(1).slice(0, 10),
    concepto: 'Pago a cuenta venta a crédito',
    monto: 100000,
    moneda: 'PYG',
    metodo: 'efectivo',
    created_by: DEMO_USER_ID,
    created_at: hace(1),
  },
  {
    id: 'aaaa3002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    cliente_id: clientes[1].id,
    fecha: hace(12).slice(0, 10),
    concepto: 'Abono cuenta corriente',
    monto: 200,
    moneda: 'USD',
    metodo: 'transferencia',
    created_by: DEMO_USER_ID,
    created_at: hace(12),
  },
]

const auditorias: Auditoria[] = [
  {
    id: 'aaee0001-0000-0000-0000-000000000001',
    tenant_id: TENANT,
    usuario_id: DEMO_USER_ID,
    usuario_nombre: 'Marcelo',
    rol: 'vendedor',
    sucursal_id: SUCURSAL,
    entidad: 'ventas',
    entidad_id: '99990001-0000-0000-0000-000000000001',
    entidad_nombre: 'Venta',
    comando: 'venta',
    descripcion: 'Venta por Gs 450.000',
    antes: null,
    despues: { total: 450000, items: 3, pagos: 1, estado: 'confirmada', sucursal_id: SUCURSAL },
    lote_id: null,
    ip: null,
    dispositivo: 'Android · Chrome Mobile',
    created_at: hace(2),
  },
  {
    id: 'aaee0002-0000-0000-0000-000000000002',
    tenant_id: TENANT,
    usuario_id: DEMO_USER_ID,
    usuario_nombre: 'Marcelo',
    rol: 'vendedor',
    sucursal_id: SUCURSAL,
    entidad: 'ventas',
    entidad_id: '99990002-0000-0000-0000-000000000002',
    entidad_nombre: 'Venta',
    comando: 'anular',
    descripcion: 'Anuló la venta de Gs 180.000',
    antes: { total: 180000, estado: 'confirmada' },
    despues: { total: 180000, estado: 'anulada' },
    lote_id: null,
    ip: null,
    dispositivo: 'Windows · Chrome',
    created_at: hace(5),
  },
  {
    id: 'aaee0003-0000-0000-0000-000000000003',
    tenant_id: TENANT,
    usuario_id: DEMO_USER_ID,
    usuario_nombre: 'Marcelo',
    rol: 'vendedor',
    sucursal_id: SUCURSAL,
    entidad: 'stock_tienda',
    entidad_id: '99990003-0000-0000-0000-000000000003',
    entidad_nombre: 'Auriculares BT inalámbricos',
    comando: 'ajuste',
    descripcion: 'Ajuste de stock (entrada)',
    antes: { cantidad: 5 },
    despues: { cantidad: 17, tipo: 'entrada' },
    lote_id: null,
    ip: null,
    dispositivo: 'Android · Chrome Mobile',
    created_at: hace(26),
  },
  {
    id: 'aaee0004-0000-0000-0000-000000000004',
    tenant_id: TENANT,
    usuario_id: DEMO_USER_ID,
    usuario_nombre: 'Kaha Demo',
    rol: 'dueño',
    sucursal_id: SUCURSAL,
    entidad: 'stock_tienda',
    entidad_id: '99990004-0000-0000-0000-000000000004',
    entidad_nombre: 'Auriculares BT inalámbricos',
    comando: 'editar',
    descripcion: 'Editó el producto «Auriculares BT inalámbricos»',
    antes: { precio: 150000, costo: 90000, moneda: 'PYG' },
    despues: { precio: 180000, costo: 90000, moneda: 'PYG' },
    lote_id: null,
    ip: null,
    dispositivo: 'Windows · Chrome',
    created_at: hace(72),
  },
  {
    id: 'aaee0005-0000-0000-0000-000000000005',
    tenant_id: TENANT,
    usuario_id: DEMO_USER_ID,
    usuario_nombre: 'Marcelo',
    rol: 'vendedor',
    sucursal_id: SUCURSAL,
    entidad: 'deudas',
    entidad_id: '99990005-0000-0000-0000-000000000005',
    entidad_nombre: 'Deuda',
    comando: 'eliminar',
    descripcion: null,
    antes: { monto: 250000, moneda: 'PYG', fecha: hace(90).slice(0, 10), vencimiento: null },
    despues: null,
    lote_id: null,
    ip: null,
    dispositivo: 'Android · Chrome Mobile',
    created_at: hace(96),
  },
  {
    id: 'aaee0006-0000-0000-0000-000000000006',
    tenant_id: TENANT,
    usuario_id: DEMO_USER_ID,
    usuario_nombre: 'Kaha Demo',
    rol: 'dueño',
    sucursal_id: SUCURSAL,
    entidad: 'stock_tienda',
    entidad_id: null,
    entidad_nombre: 'Importación de stock',
    comando: 'importar',
    descripcion: 'Importó 320 productos desde Excel',
    antes: null,
    despues: { creados: 214, actualizados: 106, sin_cambios: 0, errores: 0, filas: 320 },
    lote_id: '33330000-0000-0000-0000-000000000001',
    ip: null,
    dispositivo: 'Windows · Chrome',
    created_at: hace(144),
  },
  {
    id: 'aaee0007-0000-0000-0000-000000000007',
    tenant_id: TENANT,
    usuario_id: DEMO_USER_ID,
    usuario_nombre: 'Marcelo',
    rol: 'vendedor',
    sucursal_id: SUCURSAL,
    entidad: 'stock_tienda',
    entidad_id: '99990006-0000-0000-0000-000000000006',
    entidad_nombre: 'Funda de celular',
    comando: 'editar_stock_directo',
    descripcion: null,
    antes: { cantidad: 50, precio: 45000, costo: 20000, moneda: 'PYG' },
    despues: { cantidad: 42, precio: 45000, costo: 20000, moneda: 'PYG' },
    lote_id: null,
    ip: null,
    dispositivo: 'Android · Chrome Mobile',
    created_at: hace(150),
  },
  {
    id: 'aaee0008-0000-0000-0000-000000000008',
    tenant_id: TENANT,
    usuario_id: null,
    usuario_nombre: 'Lucía',
    rol: 'vendedor',
    sucursal_id: SUCURSAL_2,
    entidad: 'cobros',
    entidad_id: '99990007-0000-0000-0000-000000000007',
    entidad_nombre: 'Cobro',
    comando: 'crear',
    descripcion: null,
    antes: null,
    despues: { monto: 100000, moneda: 'PYG', metodo: 'efectivo', fecha: hace(20).slice(0, 10) },
    lote_id: null,
    ip: null,
    dispositivo: 'Android · Chrome Mobile',
    created_at: hace(20),
  },
]

type DemoSnapshot = {
  productos: Producto[]
  stock: StockRow[]
  movimientos: MovimientoStock[]
  ventas: Venta[]
  ventasItems: Array<{ ventaId: string; items: VentaItemDetalle[] }>
  ventaPagos: Array<{ ventaId: string; pagos: VentaPagoDetalle[] }>
  tickets: Array<{ ventaId: string; ticket: TicketVenta }>
  miembros: Miembro[]
  proveedores: Proveedor[]
  pagosProveedor: PagoProveedor[]
  clientes: Cliente[]
  deudas: Deuda[]
  cobros: Cobro[]
  auditorias: Auditoria[]
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
    if (Array.isArray(data.ventaPagos)) reemplazar(ventaPagos, data.ventaPagos)
    if (Array.isArray(data.tickets)) reemplazar(tickets, data.tickets)
    if (Array.isArray(data.miembros)) reemplazar(miembros, data.miembros)
    if (Array.isArray(data.proveedores)) reemplazar(proveedores, data.proveedores)
    if (Array.isArray(data.pagosProveedor)) reemplazar(pagosProveedor, data.pagosProveedor)
    if (Array.isArray(data.clientes)) reemplazar(clientes, data.clientes)
    if (Array.isArray(data.deudas)) reemplazar(deudas, data.deudas)
    if (Array.isArray(data.cobros)) reemplazar(cobros, data.cobros)
    if (Array.isArray(data.auditorias)) reemplazar(auditorias, data.auditorias)
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
      ventaPagos,
      tickets,
      miembros,
      proveedores,
      pagosProveedor,
      clientes,
      deudas,
      cobros,
      auditorias,
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

export function getMockClientes(): Cliente[] {
  return [...clientes].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

export function getMockDeudas(): Deuda[] {
  return [...deudas].sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export function getMockCobros(): Cobro[] {
  return [...cobros].sort((a, b) => b.fecha.localeCompare(a.fecha))
}

export function getMockAuditorias(): Auditoria[] {
  return [...auditorias].sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export function crearClienteMock(entrada: {
  nombre: string
  tipo: 'fisica' | 'juridica'
  ruc?: string
  cedula?: string
  telefono?: string
  email?: string
  direccion?: string
  ciudad?: string
  notas?: string
}): Cliente {
  const cliente: Cliente = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    nombre: entrada.nombre,
    tipo: entrada.tipo,
    ruc: entrada.ruc?.trim() || null,
    cedula: entrada.cedula?.trim() || null,
    telefono: entrada.telefono?.trim() || null,
    email: entrada.email?.trim() || null,
    direccion: entrada.direccion?.trim() || null,
    ciudad: entrada.ciudad?.trim() || null,
    notas: entrada.notas?.trim() || null,
    activo: true,
    created_at: new Date().toISOString(),
  }
  clientes.unshift(cliente)
  guardar()
  return cliente
}

export function actualizarClienteMock(
  id: string,
  cambios: Partial<
    Pick<
      Cliente,
      | 'nombre'
      | 'tipo'
      | 'ruc'
      | 'cedula'
      | 'telefono'
      | 'email'
      | 'direccion'
      | 'ciudad'
      | 'notas'
      | 'activo'
    >
  >,
): boolean {
  const idx = clientes.findIndex((c) => c.id === id)
  if (idx < 0) return false
  clientes[idx] = { ...clientes[idx], ...cambios }
  guardar()
  return true
}

export function eliminarClienteMock(id: string): boolean {
  const idx = clientes.findIndex((c) => c.id === id)
  if (idx < 0) return false
  clientes.splice(idx, 1)
  for (let i = deudas.length - 1; i >= 0; i--) {
    if (deudas[i].cliente_id === id) deudas.splice(i, 1)
  }
  for (let i = cobros.length - 1; i >= 0; i--) {
    if (cobros[i].cliente_id === id) cobros.splice(i, 1)
  }
  guardar()
  return true
}

export function registrarDeudaMock(entrada: {
  cliente_id: string
  venta_id?: string | null
  fecha: string
  vencimiento?: string | null
  monto: number
  moneda: Moneda
}): Deuda {
  const ahora = new Date().toISOString()
  const deuda: Deuda = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    cliente_id: entrada.cliente_id,
    venta_id: entrada.venta_id?.trim() || null,
    fecha: entrada.fecha,
    vencimiento: entrada.vencimiento?.trim() || null,
    monto: entrada.monto,
    moneda: entrada.moneda,
    created_by: DEMO_USER_ID,
    created_at: ahora,
  }
  deudas.unshift(deuda)
  guardar()
  return deuda
}

export function eliminarDeudaMock(id: string): boolean {
  const idx = deudas.findIndex((d) => d.id === id)
  if (idx < 0) return false
  deudas.splice(idx, 1)
  guardar()
  return true
}

export function registrarCobroMock(entrada: {
  cliente_id: string
  fecha: string
  concepto?: string
  monto: number
  moneda: Moneda
  metodo: 'efectivo' | 'pos' | 'transferencia'
}): Cobro {
  const ahora = new Date().toISOString()
  const cobro: Cobro = {
    id: crypto.randomUUID(),
    tenant_id: TENANT,
    cliente_id: entrada.cliente_id,
    fecha: entrada.fecha,
    concepto: entrada.concepto?.trim() || null,
    monto: entrada.monto,
    moneda: entrada.moneda,
    metodo: entrada.metodo,
    created_by: DEMO_USER_ID,
    created_at: ahora,
  }
  cobros.unshift(cobro)
  guardar()
  return cobro
}

export function eliminarCobroMock(id: string): boolean {
  const idx = cobros.findIndex((c) => c.id === id)
  if (idx < 0) return false
  cobros.splice(idx, 1)
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

export type TopProductoReporte = {
  nombre: string
  variante: string | null
  unidades: number
  ventas: number
  ingresosGs: number
}

export type ResumenPeriodo = {
  ventasGs: number
  tickets: number
  promedioGs: number
}

export function getMockTopProductos(dias: number): {
  resumenPeriodo: ResumenPeriodo
  porUnidades: TopProductoReporte[]
  porIngresos: TopProductoReporte[]
} {
  const desde = hace(dias * 24)
  const confirmadas = ventas.filter(
    (v) => v.estado === 'confirmada' && v.created_at >= desde,
  )
  const ventasGs = confirmadas.reduce((acc, v) => acc + v.total, 0)
  const tickets = confirmadas.length

  const hash = (str: string) =>
    str.split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0) >>> 0

  const filas = stock
    .map((s) => {
      const nombre = s.producto?.nombre ?? s.sku ?? 'Producto'
      if (nombre === 'Producto') return null
      const estable = Math.abs(hash(s.sku ?? s.id))
      const unidades = (estable % 30) + Math.min(12, Math.max(1, Math.ceil(dias / 7)))
      const precioGs = s.moneda === 'PYG' ? s.precio : s.precio * 7000
      return {
        nombre,
        variante: s.variante,
        unidades,
        ventas: Math.max(1, Math.round(unidades / 2)),
        ingresosGs: unidades * precioGs,
      }
    })
    .filter((f): f is TopProductoReporte => f !== null)

  const porUnidades = [...filas]
    .sort((a, b) => b.unidades - a.unidades || b.ingresosGs - a.ingresosGs)
    .slice(0, 8)
  const porIngresos = [...filas]
    .sort((a, b) => b.ingresosGs - a.ingresosGs)
    .slice(0, 8)

  return {
    resumenPeriodo: {
      ventasGs,
      tickets,
      promedioGs: tickets > 0 ? ventasGs / tickets : 0,
    },
    porUnidades,
    porIngresos,
  }
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
    sucursal_id: SUCURSAL,
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