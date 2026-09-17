export type CacheStock<T> = {
  guardadoEn: number
  filas: T[]
}

/**
 * Snapshot de lecturas para operar sin conexión. Con la red caída la Caja y el
 * Stock siguen funcionando con la última carga exitosa en lugar de una lista
 * vacía.
 */
export function guardarCacheStock<T>(clave: string, filas: T[]): void {
  try {
    localStorage.setItem(
      `kahabox:stock-cache:v1:${clave}`,
      JSON.stringify({ guardadoEn: Date.now(), filas } satisfies CacheStock<T>),
    )
  } catch {
    // Sin storage: solo memoria.
  }
}

export function leerCacheStock<T>(clave: string): T[] | null {
  try {
    const raw = localStorage.getItem(`kahabox:stock-cache:v1:${clave}`)
    if (!raw) return null
    const datos = JSON.parse(raw) as CacheStock<T>
    return Array.isArray(datos?.filas) ? datos.filas : null
  } catch {
    return null
  }
}