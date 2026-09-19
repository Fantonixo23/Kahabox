import { useSyncExternalStore } from 'react'

import type { Moneda } from '@/lib/format'

export type MetodoPagoVenta =
  | 'efectivo'
  | 'pos'
  | 'tarjeta'
  | 'transferencia'
  | 'fiado'

export type ItemVentaCola = {
  ventaId: string
  sucursalId: string | null
  total: number
  estado: 'pendiente_sync' | 'confirmada'
  creadoEn: string
  items: {
    id: string
    stockId: string
    cantidad: number
    precioUnitario: number
    /** Precio unitario ya convertido a guaraníes (para validar el total en el RPC). */
    precioUnitarioGs: number
  }[]
  pagos: {
    id: string
    metodo: MetodoPagoVenta
    moneda: Moneda
    monto: number
    detalle?: string
  }[]
}

export type ItemProductoCola = {
  maestroId: string
  lineaId: string
  codigo: string | null
  nombre: string
  marca: string | null
  categoria: string | null
  sucursalId: string | null
  sku: string | null
  variante: string | null
  precio: number
  costo: number | null
  moneda: 'PYG' | 'USD'
  cantidad: number
  creadoEn: string
}

export type ItemAjusteCola = {
  movimientoId: string
  lineaId: string
  sucursalId: string | null
  sentido: 'entrada' | 'salida'
  cantidad: number
  motivo: string | null
  productoNombre: string
  codigoBarras: string | null
  sku: string | null
  creadoEn: string
}

export type ItemProveedorCola = {
  accion: 'crear' | 'actualizar' | 'eliminar'
  proveedorId: string
  datos: {
    nombre: string
    ruc: string | null
    telefono: string | null
    email: string | null
    direccion: string | null
  } | null
  creadoEn: string
}

export type ItemPagoProveedorCola = {
  accion: 'registrar' | 'eliminar'
  pagoId: string
  proveedorId: string | null
  datos: {
    proveedor_id: string
    fecha: string
    concepto: string | null
    monto: number
    moneda: Moneda
    metodo: 'efectivo' | 'tarjeta' | 'transferencia'
  } | null
  creadoEn: string
}

export type ItemClienteCola = {
  accion: 'crear' | 'actualizar' | 'eliminar'
  clienteId: string
  datos: {
    nombre: string
    tipo: 'fisica' | 'juridica'
    ruc: string | null
    cedula: string | null
    telefono: string | null
    email: string | null
    direccion: string | null
    ciudad: string | null
    notas: string | null
  } | null
  creadoEn: string
}

export type ItemDeudaCola = {
  accion: 'registrar' | 'eliminar'
  deudaId: string
  clienteId: string | null
  datos: {
    cliente_id: string
    venta_id: string | null
    fecha: string
    vencimiento: string | null
    monto: number
    moneda: Moneda
  } | null
  creadoEn: string
}

export type ItemCobroCola = {
  accion: 'registrar' | 'eliminar'
  cobroId: string
  clienteId: string | null
  datos: {
    cliente_id: string
    fecha: string
    concepto: string | null
    monto: number
    moneda: Moneda
    metodo: 'efectivo' | 'pos' | 'tarjeta' | 'transferencia'
  } | null
  creadoEn: string
}

export type OperacionCola =
  | { tipo: 'venta' } & ItemVentaCola
  | { tipo: 'producto' } & ItemProductoCola
  | { tipo: 'ajuste' } & ItemAjusteCola
  | { tipo: 'proveedor' } & ItemProveedorCola
  | { tipo: 'pagoProveedor' } & ItemPagoProveedorCola
  | { tipo: 'cliente' } & ItemClienteCola
  | { tipo: 'deuda' } & ItemDeudaCola
  | { tipo: 'cobro' } & ItemCobroCola

export type EstadoCola = 'pendiente' | 'sync' | 'fallo'

export type ItemCola = {
  id: string
  estado: EstadoCola
  error: string | null
  intentos: number
  creadoEn: string
  operacion: OperacionCola
}

const CLAVE = 'kahabox:cola:v1'
const MAX_ITEMS = 500

function cargar(): ItemCola[] {
  try {
    const raw = localStorage.getItem(CLAVE)
    if (!raw) return []
    const lista = JSON.parse(raw) as ItemCola[]
    return Array.isArray(lista)
      ? lista.filter((i) => i && i.operacion && typeof i.id === 'string')
      : []
  } catch {
    return []
  }
}

let cola: ItemCola[] = cargar()
const listeners = new Set<() => void>()

function notificar() {
  listeners.forEach((l) => l())
}

function guardar() {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(cola.slice(0, MAX_ITEMS)))
  } catch {
    // Sin storage: la cola vive en memoria.
  }
  notificar()
}

export function leerCola(): ItemCola[] {
  return cola
}

export function pendientesCount(): number {
  return cola.filter((i) => i.estado !== 'sync').length
}

export function encolar(operacion: OperacionCola): ItemCola {
  const item: ItemCola = {
    id: crypto.randomUUID(),
    estado: 'pendiente',
    error: null,
    intentos: 0,
    creadoEn: new Date().toISOString(),
    operacion,
  }
  cola = [...cola, item].slice(-MAX_ITEMS)
  guardar()
  return item
}

export function marcarSync(id: string) {
  cola = cola.map((i) =>
    i.id === id ? { ...i, estado: 'sync' as const, error: null } : i,
  )
  guardar()
}

export function marcarFallo(id: string, error: string) {
  cola = cola.map((i) =>
    i.id === id
      ? {
          ...i,
          estado: 'fallo' as const,
          error,
          intentos: i.intentos + 1,
        }
      : i,
  )
  guardar()
}

export function reintentar(id: string) {
  cola = cola.map((i) =>
    i.id === id ? { ...i, estado: 'pendiente' as const, error: null } : i,
  )
  guardar()
}

export function eliminarItem(id: string) {
  cola = cola.filter((i) => i.id !== id)
  guardar()
}

export function limpiarSincronizados() {
  cola = cola.filter((i) => i.estado !== 'sync')
  guardar()
}

export function useCola(): ItemCola[] {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    leerCola,
    leerCola,
  )
}

const ETIQUETAS: Record<OperacionCola['tipo'], string> = {
  venta: 'Venta',
  producto: 'Alta de producto',
  ajuste: 'Ajuste de stock',
  proveedor: 'Proveedor',
  pagoProveedor: 'Pago a proveedor',
  cliente: 'Cliente',
  deuda: 'Crédito a cliente',
  cobro: 'Cobro de cliente',
}

export function etiquetaOperacion(op: OperacionCola): string {
  if (op.tipo === 'venta') return `Venta · Gs ${op.total.toLocaleString('es')}`
  if (op.tipo === 'producto') return `Alta de producto · ${op.nombre}`
  if (op.tipo === 'ajuste') {
    return `${op.sentido === 'entrada' ? 'Entrada' : 'Salida'} · ${op.productoNombre}`
  }
  if (op.tipo === 'proveedor') {
    const a = op.accion
    return `Proveedor · ${a === 'crear' ? 'nuevo' : a === 'eliminar' ? 'eliminado' : 'editado'}`
  }
  if (op.tipo === 'pagoProveedor') {
    const a = op.accion
    return `Pago a proveedor · ${a === 'eliminar' ? 'eliminado' : 'registrado'}`
  }
  if (op.tipo === 'cliente') {
    const a = op.accion
    return `Cliente · ${a === 'crear' ? 'nuevo' : a === 'eliminar' ? 'eliminado' : 'editado'}`
  }
  if (op.tipo === 'deuda') {
    const a = op.accion
    return `Crédito a cliente · ${a === 'eliminar' ? 'eliminado' : 'registrado'}`
  }
  const a = op.accion
  return `Cobro de cliente · ${a === 'eliminar' ? 'eliminado' : 'registrado'}`
}

export function etiquetaTipo(tipo: OperacionCola['tipo']): string {
  return ETIQUETAS[tipo]
}