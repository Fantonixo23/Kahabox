import { useCallback } from 'react'
import type { User } from '@supabase/supabase-js'

import { actualizarConfig, useConfig } from '@/lib/config'
import {
  actualizarSucursalMock,
  crearSucursalMock,
  eliminarSucursalMock,
  getMockStock,
  getMockSucursales,
  type Sucursal,
} from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

export type DatosSucursal = {
  nombre: string
  direccion: string
  telefono: string
}

export async function listarSucursales(): Promise<Sucursal[]> {
  if (!isSupabaseConfigured) return getMockSucursales()
  const { data, error } = await supabase
    .from('sucursales')
    .select('*')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as Sucursal[]
}

export async function crearSucursal(datos: DatosSucursal): Promise<void> {
  if (!isSupabaseConfigured) {
    crearSucursalMock(datos)
    return
  }
  const { error } = await supabase.rpc('crear_sucursal', {
    p_nombre: datos.nombre,
    p_direccion: datos.direccion || null,
    p_telefono: datos.telefono || null,
  })
  if (error) throw new Error(error.message)
}

export async function actualizarSucursal(
  id: string,
  datos: DatosSucursal,
): Promise<void> {
  if (!isSupabaseConfigured) {
    actualizarSucursalMock(id, datos)
    return
  }
  const { error } = await supabase.rpc('actualizar_sucursal', {
    p_id: id,
    p_nombre: datos.nombre,
    p_direccion: datos.direccion || null,
    p_telefono: datos.telefono || null,
  })
  if (error) throw new Error(error.message)
}

export async function eliminarSucursal(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    const resultado = eliminarSucursalMock(id)
    if (!resultado.ok) {
      throw new Error(resultado.error ?? 'No se pudo eliminar la sucursal.')
    }
    return
  }
  const { error } = await supabase.rpc('eliminar_sucursal', { p_id: id })
  if (error) throw new Error(error.message)
}

export type ConteoLineas = Record<string, number>

export async function contarLineasPorSucursal(): Promise<ConteoLineas> {
  if (!isSupabaseConfigured) {
    return getMockStock().reduce<ConteoLineas>((acc, r) => {
      const id = r.sucursal_id ?? ''
      acc[id] = (acc[id] ?? 0) + 1
      return acc
    }, {})
  }
  const { data, error } = await supabase
    .from('stock_tienda_dueno')
    .select('sucursal_id')
  if (error) throw new Error(error.message)
  return (data ?? []).reduce<ConteoLineas>((acc, r) => {
    const id = r.sucursal_id ?? ''
    acc[id] = (acc[id] ?? 0) + 1
    return acc
  }, {})
}

/** Sucursal asignada al usuario en su claim (mismo lugar que rol/tenant). */
export function sucursalIdDeClaim(user: User | null | undefined): string | null {
  const id = user?.app_metadata?.sucursal_id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/**
 * Sucursal vigente para operar: la que el dueño eligió explícitamente (config)
 * o, si no hay, la asignada al usuario en el claim. Las dos pueden faltar.
 */
export function useSucursalActual(user: User | null | undefined) {
  const config = useConfig()
  const cambiarSucursal = useCallback((id: string | null) => {
    actualizarConfig({ sucursalId: id })
  }, [])
  return {
    sucursalId: config.sucursalId ?? sucursalIdDeClaim(user),
    cambiarSucursal,
  }
}