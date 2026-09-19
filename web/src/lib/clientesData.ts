import type { Moneda } from '@/lib/format'
import {
  actualizarClienteMock,
  crearClienteMock,
  eliminarClienteMock,
  eliminarCobroMock,
  eliminarDeudaMock,
  getMockClientes,
  getMockCobros,
  getMockDeudas,
  registrarCobroMock,
  registrarDeudaMock,
  type Cliente,
  type Cobro,
  type Deuda,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { ejecutarEscritura } from '@/lib/ejecutar'

export type EntradaCliente = {
  nombre: string
  tipo: 'fisica' | 'juridica'
  ruc?: string
  cedula?: string
  telefono?: string
  email?: string
  direccion?: string
  ciudad?: string
  notas?: string
}

export type EntradaDeuda = {
  cliente_id: string
  venta_id?: string | null
  fecha: string
  vencimiento?: string | null
  monto: number
  moneda: Moneda
}

export type EntradaCobro = {
  cliente_id: string
  fecha: string
  concepto?: string
  monto: number
  moneda: Moneda
  metodo: 'efectivo' | 'pos' | 'tarjeta' | 'transferencia'
}

function datosDe(entrada: EntradaCliente) {
  return {
    nombre: entrada.nombre,
    tipo: entrada.tipo,
    ruc: entrada.ruc?.trim() || null,
    cedula: entrada.cedula?.trim() || null,
    telefono: entrada.telefono?.trim() || null,
    email: entrada.email?.trim() || null,
    direccion: entrada.direccion?.trim() || null,
    ciudad: entrada.ciudad?.trim() || null,
    notas: entrada.notas?.trim() || null,
  }
}

export async function listarClientes(): Promise<Cliente[]> {
  if (!isSupabaseConfigured) return getMockClientes()
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .order('nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Cliente[]
}

export async function crearCliente(entrada: EntradaCliente): Promise<Cliente> {
  if (!isSupabaseConfigured) return crearClienteMock(entrada)
  const clienteId = crypto.randomUUID()
  const ahora = new Date().toISOString()
  const datos = datosDe(entrada)
  const resultado = await ejecutarEscritura<Cliente>({
    operacion: {
      tipo: 'cliente',
      accion: 'crear',
      clienteId,
      datos,
      creadoEn: ahora,
    },
    ejecutarRemoto: async () => {
      const { data, error } = await supabase
        .from('clientes')
        .insert({ id: clienteId, ...datos })
        .select()
        .single()
      if (error) throw error
      return data as Cliente
    },
  })
  if (resultado.remoto) return resultado.resultado
  return {
    id: clienteId,
    tenant_id: '',
    ...datos,
    activo: true,
    created_at: ahora,
  } as Cliente
}

export async function actualizarCliente(
  id: string,
  cambios: EntradaCliente,
): Promise<void> {
  if (!isSupabaseConfigured) {
    actualizarClienteMock(id, cambios)
    return
  }
  const datos = datosDe(cambios)
  await ejecutarEscritura({
    operacion: {
      tipo: 'cliente',
      accion: 'actualizar',
      clienteId: id,
      datos,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase.from('clientes').update(datos).eq('id', id)
      if (error) throw error
    },
  })
}

export async function eliminarCliente(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    eliminarClienteMock(id)
    return
  }
  await ejecutarEscritura({
    operacion: {
      tipo: 'cliente',
      accion: 'eliminar',
      clienteId: id,
      datos: null,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase.from('clientes').delete().eq('id', id)
      if (error) throw error
    },
  })
}

export async function listarDeudas(): Promise<Deuda[]> {
  if (!isSupabaseConfigured) return getMockDeudas()
  const { data, error } = await supabase
    .from('deudas')
    .select('*')
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Deuda[]
}

export async function crearDeuda(entrada: EntradaDeuda): Promise<Deuda> {
  if (!isSupabaseConfigured) return registrarDeudaMock(entrada)
  const deudaId = crypto.randomUUID()
  const ahora = new Date().toISOString()
  const datos = {
    cliente_id: entrada.cliente_id,
    venta_id: entrada.venta_id?.trim() || null,
    fecha: entrada.fecha,
    vencimiento: entrada.vencimiento?.trim() || null,
    monto: entrada.monto,
    moneda: entrada.moneda,
  }
  const resultado = await ejecutarEscritura<Deuda>({
    operacion: {
      tipo: 'deuda',
      accion: 'registrar',
      deudaId,
      clienteId: entrada.cliente_id,
      datos,
      creadoEn: ahora,
    },
    ejecutarRemoto: async () => {
      const { data, error } = await supabase
        .from('deudas')
        .insert({ id: deudaId, ...datos })
        .select()
        .single()
      if (error) throw error
      return data as Deuda
    },
  })
  if (resultado.remoto) return resultado.resultado
  return {
    id: deudaId,
    tenant_id: '',
    created_by: null,
    created_at: ahora,
    ...datos,
  } as Deuda
}

export async function eliminarDeuda(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    eliminarDeudaMock(id)
    return
  }
  await ejecutarEscritura({
    operacion: {
      tipo: 'deuda',
      accion: 'eliminar',
      deudaId: id,
      clienteId: null,
      datos: null,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase.from('deudas').delete().eq('id', id)
      if (error) throw error
    },
  })
}

export async function listarCobros(): Promise<Cobro[]> {
  if (!isSupabaseConfigured) return getMockCobros()
  const { data, error } = await supabase
    .from('cobros')
    .select('*')
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Cobro[]
}

export async function registrarCobro(entrada: EntradaCobro): Promise<Cobro> {
  if (!isSupabaseConfigured) return registrarCobroMock(entrada)
  const cobroId = crypto.randomUUID()
  const ahora = new Date().toISOString()
  const datos = {
    cliente_id: entrada.cliente_id,
    fecha: entrada.fecha,
    concepto: entrada.concepto?.trim() || null,
    monto: entrada.monto,
    moneda: entrada.moneda,
    metodo: entrada.metodo,
  }
  const resultado = await ejecutarEscritura<Cobro>({
    operacion: {
      tipo: 'cobro',
      accion: 'registrar',
      cobroId,
      clienteId: entrada.cliente_id,
      datos,
      creadoEn: ahora,
    },
    ejecutarRemoto: async () => {
      const { data, error } = await supabase
        .from('cobros')
        .insert({ id: cobroId, ...datos })
        .select()
        .single()
      if (error) throw error
      return data as Cobro
    },
  })
  if (resultado.remoto) return resultado.resultado
  return {
    id: cobroId,
    tenant_id: '',
    created_by: null,
    created_at: ahora,
    ...datos,
  } as Cobro
}

export async function eliminarCobro(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    eliminarCobroMock(id)
    return
  }
  await ejecutarEscritura({
    operacion: {
      tipo: 'cobro',
      accion: 'eliminar',
      cobroId: id,
      clienteId: null,
      datos: null,
      creadoEn: new Date().toISOString(),
    },
    ejecutarRemoto: async () => {
      const { error } = await supabase.from('cobros').delete().eq('id', id)
      if (error) throw error
    },
  })
}