import JsBarcode from 'jsbarcode'

export type EtiquetaCodigo = {
  codigo: string
  nombre: string
  detalle?: string
  precio?: string
}

const PREFIJO = '900'
const LONGITUD = 13

export function generarCodigo(codigosEnUso: Set<string>): string {
  let codigo = ''
  let intentos = 0
  do {
    const cuerpo = Array.from({ length: LONGITUD - PREFIJO.length }, () =>
      Math.floor(Math.random() * 10).toString(),
    ).join('')
    codigo = PREFIJO + cuerpo
    intentos += 1
    if (intentos > 1000) codigo = `${PREFIJO}${Date.now() % 1000000000}`
  } while (codigosEnUso.has(codigo))
  return codigo
}

export function svgCodigo(codigo: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  JsBarcode(svg, codigo, {
    format: 'CODE128',
    lineColor: '#000',
    background: '#fff',
    width: 2,
    height: 58,
    displayValue: true,
    fontSize: 14,
    font: 'monospace',
    margin: 4,
    marginTop: 6,
    marginBottom: 2,
  })
  return svg.outerHTML
}

export function armarEtiquetaHtml(e: EtiquetaCodigo): string {
  const detalle = e.detalle
    ? `<span class="eta-detalle">${escaparHtml(e.detalle)}</span>`
    : ''
  const precio = e.precio
    ? `<span class="eta-precio">${escaparHtml(e.precio)}</span>`
    : ''
  return `<div class="etiqueta">
  <div class="eta-nombre">${escaparHtml(e.nombre)}</div>
  ${detalle}
  <div class="eta-barra">${svgCodigo(e.codigo)}</div>
  <div class="eta-codigo">${escaparHtml(e.codigo)}</div>
  ${precio}
</div>`
}

export function armarDocumentoEtiquetas(etiquetas: EtiquetaCodigo[]): string {
  const cuerpo = etiquetas.map((e) => armarEtiquetaHtml(e)).join('\n')
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Etiquetas de código</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: auto; margin: 6mm; }
  body { font-family: Arial, Helvetica, sans-serif; }
  .hoja { display: flex; flex-wrap: wrap; gap: 4mm; }
  .etiqueta {
    width: 52mm;
    min-height: 24mm;
    border: 0.3mm solid #000;
    border-radius: 1mm;
    padding: 1.5mm 2mm;
    display: flex;
    flex-direction: column;
    page-break-inside: avoid;
    overflow: hidden;
  }
  .eta-nombre { font-size: 9px; font-weight: 700; line-height: 1.1; }
  .eta-detalle { font-size: 8px; color: #333; line-height: 1.1; }
  .eta-barra { display: flex; justify-content: center; padding: 1mm 0; }
  .eta-barra svg { max-width: 100%; height: auto; }
  .eta-codigo { text-align: center; font-family: monospace; font-size: 11px; font-weight: 700; }
  .eta-precio { text-align: center; font-size: 10px; font-weight: 700; margin-top: 0.5mm; }
</style>
</head>
<body>
  <div class="hoja">
${cuerpo}
  </div>
</body>
</html>`
}

export async function imprimirDocumento(doc: string): Promise<string | null> {
  try {
    const iframe = document.createElement('iframe')
    iframe.setAttribute('aria-hidden', 'true')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    iframe.srcdoc = doc
    document.body.appendChild(iframe)

    await Promise.race([
      new Promise<void>((resolve) => {
        iframe.addEventListener('load', () => resolve(), { once: true })
      }),
      new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
    ])

    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    window.setTimeout(() => iframe.remove(), 60_000)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : 'No se pudo abrir la impresión.'
  }
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}