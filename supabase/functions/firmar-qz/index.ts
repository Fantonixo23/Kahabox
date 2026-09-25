// Kahabox - firmar-qz
// Firma los pedidos de QZ Tray (certificado autofirmado propio) del lado del
// servidor. El navegador nunca ve la clave privada: manda el `toSign` que pide
// QZ y esta funcion devuelve la firma RSA (SHA512withRSA = RSASSA-PKCS1-v1_5
// con SHA-512) en base64.
//
// Autenticacion: la plataforma verifica el JWT del usuario por defecto
// (verify_jwt = true). El cliente la llama con supabase.functions.invoke, que
// adjunta el Authorization. No desactivar esa verificacion: si quedara publica,
// cualquiera podria pedir firmas con la clave del comercio.
//
// Secrets:
//   QZ_PRIVATE_KEY  (obligatorio) base64 del DER (PKCS8) de la clave privada.
//   Tambien se acepta el PEM original (con cabeceras) por compatibilidad.

function base64DeBytes(bytes: Uint8Array): string {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binario += String.fromCharCode(bytes[i])
  }
  return btoa(binario)
}

function decodificarBase64(base64: string): Uint8Array {
  const binario = atob(base64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i += 1) {
    bytes[i] = binario.charCodeAt(i)
  }
  return bytes
}

// Convierte un PEM PKCS8 (con cabeceras de texto) en los bytes DER de la clave.
function pemADer(pem: string): Uint8Array {
  const lineas = pem.trim().split('\n')
  const cuerpo = lineas
    .filter((l) => !l.startsWith('-----') && l.trim() !== '')
    .join('')
  return decodificarBase64(cuerpo)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Metodo no permitido', { status: 405 })
  }

  const pem = Deno.env.get('QZ_PRIVATE_KEY') ?? ''
  if (!pem) {
    console.error('No esta seteado QZ_PRIVATE_KEY')
    return new Response('La clave privada no esta configurada', {
      status: 500,
    })
  }

  let toSign = ''
  try {
    const body = (await req.json()) as { toSign?: unknown }
    toSign = typeof body.toSign === 'string' ? body.toSign : ''
  } catch {
    return new Response('Cuerpo invalido', { status: 400 })
  }

  if (!toSign) {
    return new Response('Falta toSign', { status: 400 })
  }

  try {
    const secreto = pem.trim()
    const der = secreto.startsWith('-----')
      ? pemADer(secreto)
      : decodificarBase64(secreto)
    const key = await crypto.subtle.importKey(
      'pkcs8',
      der as BufferSource,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' },
      false,
      ['sign'],
    )
    const firma = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(toSign),
    )
    return new Response(base64DeBytes(new Uint8Array(firma)), {
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (e) {
    console.error(`Error al firmar: ${e instanceof Error ? e.message : String(e)}`)
    return new Response('No se pudo firmar', { status: 500 })
  }
})