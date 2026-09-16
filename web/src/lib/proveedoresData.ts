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
  const { data, error } = await supabase
    .from('proveedores')
    .insert({
      nombre: entrada.nombre,
      ruc: entrada.ruc?.trim() || null,
      telefono: entrada.telefono?.trim() || null,
      email: entrada.email?.trim() || null,
      direccion: entrada.direccion?.trim() || null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as Proveedor
}

export async function actualizarProveedor(
  id: string,
  cambios: EntradaProveedor,
): Promise<void> {
  if (!isSupabaseConfigured) {
    actualizarProveedorMock(id, cambios)
    return
  }
  const { error } = await supabase
    .from('proveedores')
    .update({
      nombre: cambios.nombre,
      ruc: cambios.ruc?.trim() || null,
      telefono: cambios.telefono?.trim() || null,
      email: cambios.email?.trim() || null,
      direccion: cambios.direccion?.trim() || null,
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function eliminarProveedor(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    eliminarProveedorMock(id)
    return
  }
  const { error } = await supabase.from('proveedores').delete().eq('id', id)
  if (error) throw new Error(error.message)
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
  const { error } = await supabase.from('pagos_proveedores').insert({
    proveedor_id: entrada.proveedor_id,
    fecha: entrada.fecha,
    concepto: entrada.concepto?.trim() || null,
    monto: entrada.monto,
    moneda: entrada.moneda,
    metodo: entrada.metodo,
  })
  if (error) throw new Error(error.message)
}

export async function eliminarPago(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    eliminarPagoProveedorMock(id)
    return
  }
  const { error } = await supabase.from('pagos_proveedores').delete().eq('id', id)
  if (error) throw new Error(error.message)
}