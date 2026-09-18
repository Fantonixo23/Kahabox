import { useSyncExternalStore } from 'react'

import {
  encolar,
  leerCola,
  marcarFallo,
  marcarSync,
  type ItemCola,
  type OperacionCola,
} from '@/lib/cola'
import { esErrorDeRed, navegadorEnLinea } from '@/lib/red'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type ResultadoEscritura<T> =
  | { remoto: true; resultado: T }
  | { remoto: false; encolado: true }

/**
 * Camino único para todas las escrituras de negocio:
 * - Con red → intenta el RPC/INSERT remoto. Si responde un error de red
 *   (corte en el peor momento), encola y responde éxito local.
 * - Sin red → encola directo.
 * - Cualquier otro error (validación, stock insuficiente, permisos) se lanza
 *   para que el diálogo lo muestre: esa operación NO se encola.
 */
export async function ejecutarEscritura<T>(opciones: {
  operacion: OperacionCola
  ejecutarRemoto: () => Promise<T>
  aplicarLocal?: () => void
}): Promise<ResultadoEscritura<T>> {
  const { operacion, ejecutarRemoto, aplicarLocal } = opciones

  if (!isSupabaseConfigured) {
    aplicarLocal?.()
    return { remoto: true, resultado: undefined as T }
  }

  if (navegadorEnLinea()) {
    try {
      const resultado = await ejecutarRemoto()
      aplicarLocal?.()
      return { remoto: true, resultado }
    } catch (e) {
      if (esErrorDeRed(e)) {
        encolar(operacion)
        aplicarLocal?.()
        return { remoto: false, encolado: true }
      }
      throw e
    }
  }

  encolar(operacion)
  aplicarLocal?.()
  return { remoto: false, encolado: true }
}

async function ejecutarOperacion(item: ItemCola): Promise<void> {
  const op = item.operacion

  switch (op.tipo) {
    case 'venta': {
      const { error } = await supabase.rpc('registrar_venta', {
        p_venta_id: op.ventaId,
        p_sucursal_id: op.sucursalId,
        p_total: op.total,
        p_items: op.items.map((i) => ({
          id: i.id,
          stock_id: i.stockId,
          cantidad: i.cantidad,
          precio_unitario: i.precioUnitario,
          precio_unitario_gs: i.precioUnitarioGs,
        })),
        p_pagos: op.pagos as unknown as Record<string, unknown>[],
        p_estado: op.estado,
        p_created_at: op.creadoEn,
      })
      if (error) throw new Error(error.message)
      return
    }

    case 'producto': {
      const { error } = await supabase.rpc('registrar_producto', {
        p_maestro_id: op.maestroId,
        p_codigo: op.codigo,
        p_nombre: op.nombre,
        p_marca: op.marca,
        p_categoria: op.categoria,
        p_linea_id: op.lineaId,
        p_sucursal_id: op.sucursalId,
        p_sku: op.sku,
        p_variante: op.variante,
        p_precio: op.precio,
        p_costo: op.costo,
        p_moneda: op.moneda,
        p_cantidad: op.cantidad,
        p_created_at: op.creadoEn,
      })
      if (error) throw new Error(error.message)
      return
    }

    case 'ajuste': {
      const { error } = await supabase.rpc('registrar_ajuste', {
        p_movimiento_id: op.movimientoId,
        p_linea_id: op.lineaId,
        p_sucursal_id: op.sucursalId,
        p_tipo: op.sentido,
        p_cantidad: op.cantidad,
        p_motivo: op.motivo,
        p_producto_nombre: op.productoNombre,
        p_codigo_barras: op.codigoBarras,
        p_sku: op.sku,
        p_created_at: op.creadoEn,
      })
      if (error) throw new Error(error.message)
      return
    }

    case 'proveedor': {
      if (op.accion === 'eliminar') {
        const { error } = await supabase
          .from('proveedores')
          .delete()
          .eq('id', op.proveedorId)
        if (error) throw new Error(error.message)
        return
      }
      const datos = op.datos ?? {
        nombre: '',
        ruc: null,
        telefono: null,
        email: null,
        direccion: null,
      }
      if (op.accion === 'crear') {
        const { error } = await supabase
          .from('proveedores')
          .upsert({ id: op.proveedorId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('proveedores')
          .update(datos)
          .eq('id', op.proveedorId)
        if (error) throw new Error(error.message)
      }
      return
    }

    case 'pagoProveedor': {
      if (op.accion === 'eliminar') {
        const { error } = await supabase
          .from('pagos_proveedores')
          .delete()
          .eq('id', op.pagoId)
        if (error) throw new Error(error.message)
        return
      }
      const datos = op.datos
      if (!datos) {
        throw new Error('Faltan datos del pago pendiente')
      }
      const { error } = await supabase
        .from('pagos_proveedores')
        .upsert({ id: op.pagoId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
      return
    }

    case 'cliente': {
      if (op.accion === 'eliminar') {
        const { error } = await supabase
          .from('clientes')
          .delete()
          .eq('id', op.clienteId)
        if (error) throw new Error(error.message)
        return
      }
      const datos = op.datos ?? {
        nombre: '',
        tipo: 'fisica',
        ruc: null,
        cedula: null,
        telefono: null,
        email: null,
        direccion: null,
        ciudad: null,
        notas: null,
      }
      if (op.accion === 'crear') {
        const { error } = await supabase
          .from('clientes')
          .upsert({ id: op.clienteId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('clientes')
          .update(datos)
          .eq('id', op.clienteId)
        if (error) throw new Error(error.message)
      }
      return
    }

    case 'deuda': {
      if (op.accion === 'eliminar') {
        const { error } = await supabase
          .from('deudas')
          .delete()
          .eq('id', op.deudaId)
        if (error) throw new Error(error.message)
        return
      }
      const datos = op.datos
      if (!datos) {
        throw new Error('Faltan datos del crédito pendiente')
      }
      const { error } = await supabase
        .from('deudas')
        .upsert({ id: op.deudaId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
      return
    }

    case 'cobro': {
      if (op.accion === 'eliminar') {
        const { error } = await supabase
          .from('cobros')
          .delete()
          .eq('id', op.cobroId)
        if (error) throw new Error(error.message)
        return
      }
      const datos = op.datos
      if (!datos) {
        throw new Error('Faltan datos del cobro pendiente')
      }
      const { error } = await supabase
        .from('cobros')
        .upsert({ id: op.cobroId, ...datos }, { onConflict: 'id', ignoreDuplicates: true })
      if (error) throw new Error(error.message)
      return
    }
  }
}

let sincronizando = false
const listenersSync = new Set<() => void>()

function notificarEstado() {
  listenersSync.forEach((l) => l())
}

export function haySincronizacion(): boolean {
  return sincronizando
}

export function useSincronizando(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listenersSync.add(cb)
      return () => listenersSync.delete(cb)
    },
    haySincronizacion,
    haySincronizacion,
  )
}

/**
 * Sube las operaciones pendientes en orden (FIFO). Si la red se corta a mitad,
 * aborta y deja el resto para el próximo disparador (online / botón manual).
 * Los errores de negocio (p. ej. stock insuficiente) marcan la operación como
 * "fallo" con su motivo, sin detener el resto.
 *
 * Por defecto NO reintenta operaciones en estado "fallo": eso evita que un
 * error de negocio (que va a seguir fallando) se reintente solo ante cada
 * cambio de conectividad. Solo el botón manual "Reintentar" / "Sincronizar
 * todo ahora" las vuelve a intentar (incluirFallos: true).
 */
export async function sincronizar(opciones?: {
  incluirFallos?: boolean
}): Promise<{ ok: number; fallos: number }> {
  if (!isSupabaseConfigured || sincronizando || !navegadorEnLinea()) {
    return { ok: 0, fallos: 0 }
  }

  sincronizando = true
  notificarEstado()
  try {
    let ok = 0
    let fallos = 0
    const pendientes = leerCola().filter(
      (i) =>
        i.estado === 'pendiente' || (opciones?.incluirFallos && i.estado === 'fallo'),
    )
    for (const item of pendientes) {
      try {
        await ejecutarOperacion(item)
        marcarSync(item.id)
        ok += 1
      } catch (e) {
        if (esErrorDeRed(e)) break
        marcarFallo(
          item.id,
          e instanceof Error ? e.message : 'Error desconocido al sincronizar',
        )
        fallos += 1
      }
    }
    return { ok, fallos }
  } finally {
    sincronizando = false
    notificarEstado()
  }
}