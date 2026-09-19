import type { User } from '@supabase/supabase-js'

import type { RolApp } from '@/lib/config'

export type VistaStock = 'stock_tienda_dueno' | 'stock_tienda_vendedor'

export function rolUsuario(user: User | null | undefined): RolApp | null {
  const rol = user?.app_metadata?.rol as RolApp | undefined
  return rol === 'dueño' || rol === 'administrador' || rol === 'vendedor'
    ? rol
    : null
}

export function vistaStock(user: User | null | undefined): VistaStock {
  return rolUsuario(user) === 'vendedor'
    ? 'stock_tienda_vendedor'
    : 'stock_tienda_dueno'
}

// Dueño o administrador: acceso a reportes, auditoría, proveedores y costos.
export function esJefe(user: User | null | undefined): boolean {
  const rol = rolUsuario(user)
  return rol === 'dueño' || rol === 'administrador'
}

export function esAdministrador(user: User | null | undefined): boolean {
  return rolUsuario(user) === 'administrador'
}

export function esDueno(user: User | null | undefined): boolean {
  return rolUsuario(user) === 'dueño'
}