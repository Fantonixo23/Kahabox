import { desformatearMonto } from '@/lib/format'
import { importarStockMock, type FilaImportacion } from '@/lib/mock'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'
import { dispositivoActual } from '@/lib/auditoriaData'

// Fronteras de entrada: evitan que un archivo gigante, corrupto o malicioso
// congele la pestaña o sature la base. Son topes amistosos, no de negocio.
export const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024 // 5 MB
export const MAX_FILAS = 10_000
export const MAX_COLUMNAS = 40
export const MAX_LARGO_NOMBRE = 200
export const MAX_LARGO_TEXTO = 100

/** Campos que Kahabox sabe importar. */
export type CampoExcel =
  | 'nombre'
  | 'codigo'
  | 'sku'
  | 'variante'
  | 'marca'
  | 'categoria'
  | 'moneda'
  | 'precio'
  | 'costo'
  | 'cantidad'

export const CAMPOS_EXCEL: Array<{ campo: CampoExcel; etiqueta: string; obligatorio: boolean }> = [
  { campo: 'nombre', etiqueta: 'Nombre', obligatorio: true },
  { campo: 'codigo', etiqueta: 'Código de barras (EAN)', obligatorio: false },
  { campo: 'sku', etiqueta: 'SKU / código interno', obligatorio: false },
  { campo: 'variante', etiqueta: 'Variante', obligatorio: false },
  { campo: 'marca', etiqueta: 'Marca', obligatorio: false },
  { campo: 'categoria', etiqueta: 'Categoría', obligatorio: false },
  { campo: 'moneda', etiqueta: 'Moneda', obligatorio: false },
  { campo: 'precio', etiqueta: 'Precio de venta', obligatorio: true },
  { campo: 'costo', etiqueta: 'Costo', obligatorio: false },
  { campo: 'cantidad', etiqueta: 'Cantidad / stock', obligatorio: false },
]

// Pistas de código de barras: si el encabezado menciona alguna, es BARCODE y
// no un código interno (evita que "CODIGO DE BARRAS" caiga en SKU).
const PISTAS_BARCODE = ['barras', 'barcode', 'ean', 'upc', 'gtin', 'codbarra']

// Diccionarios multilingüe (es / en / pt). Cada sinónimo va SIN acentos,
// minúsculas y sin espacios (la normalización hace el resto).
const ALIASES: Record<CampoExcel, string[]> = {
  nombre: [
    'nombre', 'nombredeproducto', 'descripcion', 'descripciondeproducto',
    'detalle', 'articulo', 'producto', 'item', 'product', 'itemname',
    'productname', 'description', 'title', 'producto', 'produto', 'nome',
    'descricao', 'descriçao', 'descrição', 'artigo', 'name', 'article',
  ],
  codigo: [
    'codigodebarras', 'codigobarras', 'codigo de barras', 'codbarra',
    'barcode', 'barcodenumber', 'ean', 'ean13', 'ean8', 'upc', 'upca', 'gtin',
  ],
  sku: [
    'sku', 'ref', 'referencia', 'referenciadeproducto', 'referenciaproducto',
    'codigoproducto', 'codigointerno', 'codigoarticulo', 'codigo', 'id',
    'itemcode', 'item code', 'reference', 'refproducto', 'skuid',
    'codigoproduto', 'codigointerno', 'referencia',
  ],
  variante: [
    'variante', 'variedad', 'detalle', 'color', 'tamano', 'talla', 'medida',
    'variant', 'size', 'colour', 'modelo', 'talle',
  ],
  marca: ['marca', 'brand', 'brandname', 'marcama', 'marca/modelo', 'marca modelo'],
  categoria: [
    'categoria', 'rubro', 'departamento', 'seccion', 'linea', 'grupo',
    'category', 'categoryname', 'departament', 'family', 'categoria', 'linha',
    'grupp', 'gruppo',
  ],
  moneda: ['moneda', 'divisa', 'currency', 'moeda', 'divisa'],
  precio: [
    'precio', 'precioventa', 'preciodeventa', 'preciopublico', 'precio publico',
    'precio final', 'preciofinal', 'price', 'selling', 'sellingprice',
    'saleprice', 'unitprice', 'sale', 'price', 'venta', 'valorventa',
    'valorunitario', 'preçovenda', 'preçodevenda', 'preco', 'preço', 'valor',
    'sellprice', 'retailprice', 'preciounitario', 'precioventaunitario',
  ],
  costo: [
    'costo', 'costoventa', 'preciocosto', 'preciodecosto', 'costounitario',
    'purchaseprice', 'unitcost', 'costprice', 'cost', 'custo',
    'preçocusto', 'custo unitario', 'custo unitário', 'preco de custo',
  ],
  cantidad: [
    'cantidad', 'stock', 'unidades', 'existencia', 'existencias',
    'existenciasiniciales', 'stockactual', 'stock actual', 'inventario',
    'disponible', 'saldo', 'onhand', 'on hand', 'qty', 'quantity', 'units',
    'totalstock', 'quantidade', 'estoque', 'qtde', 'stockatual', 'existingen',
  ],
}

/** Normaliza un encabezado: minúsculas, sin acentos, sin separadores. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s_\-./]+/g, '')
    .trim()
}

function puntuarEncabezado(norm: string, alias: string[]): number {
  for (const a of alias) {
    if (norm === a) return 100
  }
  let mejor = 0
  for (const a of alias) {
    if (a.length >= 4 && (norm.startsWith(a) || norm.endsWith(a) || norm.includes(a))) {
      mejor = Math.max(mejor, 40 + a.length)
    }
  }
  return mejor
}

function esBarcode(norm: string): boolean {
  return PISTAS_BARCODE.some((p) => norm.includes(p))
}

export type MapeoColumnas = Record<CampoExcel, number | null>

export function mapeoSinAsignar(): MapeoColumnas {
  const m = {} as MapeoColumnas
  for (const { campo } of CAMPOS_EXCEL) m[campo] = null
  return m
}

/**
 * Detecta qué columna (índice dentro de `headers`) corresponde a cada campo.
 * Determinístico: alias exacto → pista de barcode → "contiene"/igualdad parcial.
 * Lo que no matchea queda en null y se resuelve a mano en el diálogo.
 */
export function detectarColumnas(headers: string[]): MapeoColumnas {
  const normales = headers.map((h) => normalizar(String(h ?? '')))
  const asignadas = new Set<number>()
  const resultado = mapeoSinAsignar()
  const camposPendientes = CAMPOS_EXCEL.map((c) => c.campo)

  // Pasa 1: barcode (fuerte) primero para no robarlo con sku.
  for (let i = 0; i < normales.length; i++) {
    const n = normales[i]
    if (!n || asignadas.has(i)) continue
    if (esBarcode(n) && puntuarEncabezado(n, ALIASES.codigo) >= 40) {
      resultado.codigo = i
      asignadas.add(i)
    }
  }

  // Pasa 2: exactos.
  for (const campo of camposPendientes) {
    if (resultado[campo] !== null) continue
    for (let i = 0; i < normales.length; i++) {
      const n = normales[i]
      if (!n || asignadas.has(i)) continue
      if (puntuarEncabezado(n, ALIASES[campo]) === 100) {
        resultado[campo] = i
        asignadas.add(i)
        break
      }
    }
  }

  // Pasa 3: parciales ("contiene"). Greedy por campo en orden de prioridad.
  for (const campo of camposPendientes) {
    if (resultado[campo] !== null) continue
    let mejorIdx = -1
    let mejorPuntaje = 0
    for (let i = 0; i < normales.length; i++) {
      const n = normales[i]
      if (!n || asignadas.has(i)) continue
      const p = puntuarEncabezado(n, ALIASES[campo])
      if (p > mejorPuntaje) {
        mejorPuntaje = p
        mejorIdx = i
      }
    }
    if (mejorIdx >= 0 && mejorPuntaje >= 44) {
      resultado[campo] = mejorIdx
      asignadas.add(mejorIdx)
    }
  }

  return resultado
}

export type TablaExcel = {
  nombreArchivo: string
  headers: string[]
  filas: Array<Array<unknown>>
}

/** Lee la primera hoja de un .xlsx/.xls/.csv y detecta la fila de encabezados. */
export async function leerExcel(file: File): Promise<TablaExcel> {
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
    throw new Error('El archivo debe ser .xlsx, .xls o .csv.')
  }
  if (file.size > MAX_ARCHIVO_BYTES) {
    throw new Error(
      `El archivo pesa ${(file.size / 1024 / 1024).toFixed(1)} MB. Máximo ${MAX_ARCHIVO_BYTES / 1024 / 1024} MB.`,
    )
  }

  const XLSX = await import('xlsx')
  const esCsv = /\.csv$/i.test(file.name)
  const wb = esCsv
    ? XLSX.read(await file.text(), { type: 'string' })
    : XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const hoja = wb.Sheets[wb.SheetNames[0]]
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(hoja, {
    header: 1,
    defval: null,
    raw: true,
  })

  // Fila de encabezados: la primera con ≥2 celdas llenas y al menos un campo
  // reconocible O una fila debajo con datos numéricos. Salta títulos ("INVENTARIO").
  let filaHeader = 0
  for (let i = 0; i < Math.min(aoa.length, 30); i++) {
    const fila = aoa[i] ?? []
    const llenas = fila.filter((c) => c !== null && c !== '').length
    if (llenas < 2) continue
    const puntaje = fila
      .map((c) => c === null ? 0 : puntuarEncabezado(normalizar(String(c)), Object.values(ALIASES).flat()))
      .reduce((a, b) => a + b, 0)
    if (puntaje >= 100) {
      filaHeader = i
      break
    }
  }

  const headers = (aoa[filaHeader] ?? [])
    .slice(0, MAX_COLUMNAS)
    .map((c) => (c === null ? '' : String(c)))
  const filas = aoa
    .slice(filaHeader + 1, filaHeader + 1 + MAX_FILAS)
    .filter((f) => (f ?? []).some((c) => c !== null && String(c).trim() !== ''))

  return { nombreArchivo: file.name, headers, filas }
}

function aNumero(v: unknown): number {
  if (typeof v === 'number') return v
  if (v === null || v === undefined || v === '') return NaN
  const s = String(v).trim()
  if (!s) return NaN
  if (s.toLowerCase() === 'usd' || s.toLowerCase() === 'us$') return NaN
  const n = Number(desformatearMonto(s))
  return Number.isFinite(n) ? n : NaN
}

export type FilaImportada = FilaImportacion

/**
 * Construye las filas listas para el RPC según el mapeo elegido.
 * precioDefault / monedaDefault se aplican cuando la columna no existe.
 */
export function construirFilas(opts: {
  tabla: TablaExcel
  mapeo: MapeoColumnas
  precioDefault: number | null
  monedaDefault: 'PYG' | 'USD'
}): { filas: FilaImportada[]; invalidas: number[] } {
  const { tabla, mapeo, precioDefault, monedaDefault } = opts
  const filas: FilaImportada[] = []
  const invalidas: number[] = []

  const celda = (f: Array<unknown>, campo: CampoExcel): unknown => {
    const idx = mapeo[campo]
    if (idx === null) return null
    return f[idx] ?? null
  }

  const texto = (v: unknown, largo: number): string | null => {
    const s = v === null || v === undefined ? '' : String(v).trim()
    return s ? s.slice(0, largo) : null
  }

  const monedaDe = (v: unknown): 'PYG' | 'USD' => {
    const s = String(v ?? '').toLowerCase().trim()
    if (s.includes('usd') || s.includes('us$') || s.includes('dólar') || s.includes('dolar')) {
      return 'USD'
    }
    return monedaDefault
  }

  tabla.filas.forEach((filaCruda, i) => {
    const nombre = texto(celda(filaCruda, 'nombre'), MAX_LARGO_NOMBRE)
    if (!nombre) {
      invalidas.push(i + 1)
      return
    }
    const precio = aNumero(celda(filaCruda, 'precio'))
    let precioValido = Number.isFinite(precio) && precio >= 0 ? precio : null
    if (precioValido === null && precioDefault !== null && Number.isFinite(precioDefault)) {
      precioValido = precioDefault
    }

    if (precioValido === null) {
      invalidas.push(i + 1)
      return
    }

    const cantidadRaw = aNumero(celda(filaCruda, 'cantidad'))
    const cantidad = Number.isFinite(cantidadRaw)
      ? Math.max(0, Math.floor(cantidadRaw))
      : 0
    const costoRaw = aNumero(celda(filaCruda, 'costo'))
    const costo = Number.isFinite(costoRaw) && costoRaw >= 0 ? costoRaw : null

    filas.push({
      nombre,
      codigo: texto(celda(filaCruda, 'codigo'), MAX_LARGO_TEXTO),
      marca: texto(celda(filaCruda, 'marca'), MAX_LARGO_TEXTO),
      categoria: texto(celda(filaCruda, 'categoria'), MAX_LARGO_TEXTO),
      sku: texto(celda(filaCruda, 'sku'), MAX_LARGO_TEXTO),
      variante: texto(celda(filaCruda, 'variante'), MAX_LARGO_TEXTO),
      moneda: monedaDe(celda(filaCruda, 'moneda')),
      precio: precioValido,
      costo,
      cantidad,
    })
  })

  return { filas, invalidas }
}

export type ResultadoImportacion = {
  creados: number
  actualizados: number
  sinCambios: number
  errores: Array<{ fila: number; motivo: string }>
}

const LOTE = 500

/** Ejecuta la importación en lotes (modo demo aplica en memoria). */
export async function importarStockExcel(
  filas: FilaImportada[],
  sucursalId: string | null,
  onProgreso?: (hecho: number, total: number) => void,
): Promise<ResultadoImportacion> {
  if (filas.length === 0) {
    return { creados: 0, actualizados: 0, sinCambios: 0, errores: [] }
  }

  if (!isSupabaseConfigured) {
    const res = importarStockMock(filas, sucursalId)
    return {
      creados: res.creados,
      actualizados: res.actualizados,
      sinCambios: res.sinCambios,
      errores: res.errores,
    }
  }

  const acumulado: ResultadoImportacion = { creados: 0, actualizados: 0, sinCambios: 0, errores: [] }
  const loteId = crypto.randomUUID()
  for (let desde = 0; desde < filas.length; desde += LOTE) {
    const lote = filas.slice(desde, desde + LOTE)
    const { data, error } = await supabase.rpc('importar_stock', {
      p_sucursal_id: sucursalId,
      p_filas: lote as unknown as Record<string, unknown>[],
      p_lote_id: loteId,
      p_dispositivo: dispositivoActual(),
    })
    if (error) throw error
    const r = (data ?? {}) as {
      creados?: number
      actualizados?: number
      sin_cambios?: number
      errores?: Array<{ fila?: number; motivo?: string }>
    }
    acumulado.creados += r.creados ?? 0
    acumulado.actualizados += r.actualizados ?? 0
    acumulado.sinCambios += r.sin_cambios ?? 0
    for (const e of r.errores ?? []) {
      acumulado.errores.push({ fila: e.fila ?? 0, motivo: e.motivo ?? 'Error' })
    }
    onProgreso?.(Math.min(desde + LOTE, filas.length), filas.length)
  }

  return acumulado
}