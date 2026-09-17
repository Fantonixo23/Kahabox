import type { Database } from '@/lib/database'
import { supabase } from '@/lib/supabase'
import type { VistaStock } from '@/lib/vistaStock'

/**
 * Fila de stock tal como la ven Caja y Stock (vista según rol + producto).
 */
export type StockRemotoRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
}

/**
 * Baja el stock real del tenant/sucursal desde Supabase. Es la misma fuente que
 * usan app/stock y app/caja, para que el escáner no dependa del stock mock.
 */
export async function cargarStockRemoto(
  vista: VistaStock,
): Promise<StockRemotoRow[]> {
  const { data, error } = await supabase
    .from(vista)
    .select('*, producto:productos_maestro(*)')
    .order('updated_at', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data as StockRemotoRow[] | null) ?? []
}

export function buscarLineaPorCodigo(
  lista: StockRemotoRow[],
  codigo: string,
): StockRemotoRow | null {
  const c = codigo.trim()
  if (!c) return null
  return lista.find((s) => s.producto?.codigo_barras === c) ?? null
}
