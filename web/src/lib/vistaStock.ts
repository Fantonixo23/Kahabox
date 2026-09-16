import type { User } from '@supabase/supabase-js'

export type VistaStock = 'stock_tienda_dueno' | 'stock_tienda_vendedor'

export function vistaStock(user: User | null | undefined): VistaStock {
  return user?.app_metadata?.rol === 'vendedor'
    ? 'stock_tienda_vendedor'
    : 'stock_tienda_dueno'
}

export function esDueno(user: User | null | undefined): boolean {
  return user?.app_metadata?.rol !== 'vendedor'
}