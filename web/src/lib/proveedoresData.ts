import type { Moneda } from '@/lib/format'
import {
  actualizarProveedorMock,
  crearProveedorMock,
  eliminarPagoProveedorMock,
  eliminarProveedorMock,
  getMockPagosProveedores,
  getMockProveedores,
  registrarPagoProveedorMock,
  type PagoProveedorConProveedor,
  type Proveedor,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { ejecutarEscritura } from '@/lib/ejecutar'

export type EntradaProveedor = {
  nombre: string
  ruc?: string
  telefono?: string
  email?: string
  direccion?: string
}

export type EntradaPago = {
  proveedor_id: string
  fecha: string
  concepto?: string
  monto: number
  moneda: Moneda
  metodo: 'efectivo' | 'tarjeta' | 'transferencia'
}

export async function listarProveedores(): Promise<Proveedor[]> {
  if (!isSupabaseConfigured) return getMockProveedores()
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Proveedor[]
}

export async function crearProveedor(entrada: EntradaProveedor): Promise<Proveedor> {
  if (!isSupabaseConfigured) return crearProveedorMock(entrada)
  const proveedorId = crypto.randomUUID()
  const ahora = new Date().toISOString()
  const datos = {
    nombre: entrada.nombre,
    ruc: entrada.ruc?.trim() || null,
    telefono: entrada.telefono?.trim() || null,
    email: entrada.email?.trim() || null,
    direccion: entrada.direccion?.trim() || null,
  }
  const resultado = await ejecutarEscritura<Proveedor>({
    operacion: {
      tipo: 'proveedor',
      accion: 'crear',
      proveedorId,
      datos,
      creadoEn: ahora,
    },
    ejecutarRemoto: async () => {
      const { data, error } = await supabase
        .from('proveedores')
        .insert({ id: proveedorId, ...datos })
        .select()
        .single()
      if (error) throw error
      return data as Proveedor
    },
  })
  if (resultado.remoto) return resultado.resultado
  return {
    id: proveedorId,
    ...datos,
    created_at: ahora,
  } as Proveedor
}

export async function actualizarProveedor(
  id: string,
  cambios: EntradaProveedor,
): Promise<void> {
  if (!isSupabaseConfigured) {
    actualizarProveedorMock(id, cambios)
    return
  }
  const datos = {
    nombre: cambios.nombre,
    ruc: cambios.ruc?.trim() || null,
    telefono: cambios.telefono?.trim() || null,
    email: cambios.email?.trim() || null,
    direccion: cambios.direccion?.trim() || null,
  }
  await ejecutarEscritura({
    operacion: {
      tipo: 'proveedor',
      accion: 'actualizar',
      proveedorId: id,
      datos,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase.from('proveedores').update(datos).eq('id', id)
      if (error) throw error
    },
  })
}

export async function eliminarProveedor(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    eliminarProveedorMock(id)
    return
  }
  await ejecutarEscritura({
    operacion: {
      tipo: 'proveedor',
      accion: 'eliminar',
      proveedorId: id,
      datos: null,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase.from('proveedores').delete().eq('id', id)
      if (error) throw error
    },
  })
}

export async function listarPagos(): Promise<PagoProveedorConProveedor[]> {
  if (!isSupabaseConfigured) return getMockPagosProveedores()
  const { data, error } = await supabase
    .from('pagos_proveedores')
    .select('*, proveedor:proveedores(*)')
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as PagoProveedorConProveedor[]
}

export async function registrarPago(entrada: EntradaPago): Promise<void> {
  if (!isSupabaseConfigured) {
    registrarPagoProveedorMock(entrada)
    return
  }
  const pagoId = crypto.randomUUID()
  const datos = {
    proveedor_id: entrada.proveedor_id,
    fecha: entrada.fecha,
    concepto: entrada.concepto?.trim() || null,
    monto: entrada.monto,
    moneda: entrada.moneda,
    metodo: entrada.metodo,
  }
  await ejecutarEscritura({
    operacion: {
      tipo: 'pagoProveedor',
      accion: 'registrar',
      pagoId,
      proveedorId: entrada.proveedor_id,
      datos,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase
        .from('pagos_proveedores')
        .insert({ id: pagoId, ...datos })
      if (error) throw error
    },
  })
}

export async function eliminarPago(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    eliminarPagoProveedorMock(id)
    return
  }
  await ejecutarEscritura({
    operacion: {
      tipo: 'pagoProveedor',
      accion: 'eliminar',
      pagoId: id,
      proveedorId: null,
      datos: null,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase.from('pagos_proveedores').delete().eq('id', id)
      if (error) throw error
    },
  })
}