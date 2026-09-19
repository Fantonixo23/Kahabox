import type { Database } from '@/lib/database'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { buscarProductoMaestroMock } from '@/lib/mock'
import type { VistaStock } from '@/lib/vistaStock'

/**
 * Fila de stock tal como la ven Caja y Stock (vista según rol + producto).
 */
export type StockRemotoRow = Database['public']['Views']['stock_tienda_dueno']['Row'] & {
  producto: Database['public']['Tables']['productos_maestro']['Row'] | null
}

/**
 * Fila del catálogo maestro compartido (datos del producto, sin stock propio).
 */
export type ProductoMaestroCatalogo =
  Database['public']['Tables']['productos_maestro']['Row']

/**
 * Busca un producto en el catálogo maestro compartido por código de barras.
 * Es el respaldo del escáner cuando el código no está en el stock local: si lo
 * cargó otra tienda, ya aparece con nombre/marca/categoría. En modo demo busca
 * en el catálogo mock.
 */
export async function buscarProductoMaestroPorCodigo(
  codigo: string,
): Promise<ProductoMaestroCatalogo | null> {
  const c = codigo.trim()
  if (!c) return null
  if (!isSupabaseConfigured) return buscarProductoMaestroMock(c)
  const { data } = await supabase
    .from('productos_maestro')
    .select('*')
    .eq('codigo_barras', c)
    .maybeSingle()
  return (data as ProductoMaestroCatalogo | null) ?? null
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
    .limit(2000)
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
