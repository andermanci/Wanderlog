// De dónde se conecta la visita, según lo que diga el CDN.
//
// PURO Y CON LA FUENTE INYECTADA, para poder probarlo sin red y sin `Request`:
// lo que hay que verificar aquí no es el fetch, es qué se guarda y sobre todo
// QUÉ NO SE GUARDA de cada visita.
//
// LO QUE NO SE GUARDA, y no es un descuido:
//   · la IP, ni entera ni recortada (una IP recortada sigue siendo un dato
//     personal; una región no),
//   · la ciudad,
//   · las coordenadas,
//   · el código postal,
// aunque Netlify los mande todos juntos en el mismo objeto. Se para en la
// región a propósito: con el volumen de Wanderlog, una fila «Getxo · 1 sesión»
// al lado de la hora señala prácticamente a una persona concreta, y eso deja
// de ser medir audiencia. La región sí es agregada.
//
// El test le pasa un contexto CON ciudad y coordenadas justamente para
// demostrar que no salen.

export interface Geo {
  /** ISO de dos letras, en mayúsculas. */
  country: string | null
  /** Comunidad o provincia, legible. `null` si el CDN no la manda. */
  region: string | null
}

const VACIO: Geo = { country: null, region: null }

const pais = (v: unknown): string | null =>
  typeof v === 'string' && /^[a-z]{2}$/i.test(v.trim()) ? v.trim().toUpperCase() : null

const region = (v: unknown): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim().slice(0, 64)
  return t || null
}

/**
 * Lo que Netlify pone en `context.geo` de una edge function. Se declara aquí
 * la forma mínima en vez de importar los tipos de `@netlify/edge-functions`:
 * este módulo lo compila también `tsc -b` con el resto de `src`, y no puede
 * depender de un paquete que solo existe en el despliegue.
 */
export interface ContextoGeo {
  country?: { code?: string; name?: string }
  subdivision?: { code?: string; name?: string }
  // city, latitude, longitude y postalCode también llegan aquí. No se leen.
  [k: string]: unknown
}

/** Del contexto nativo de Netlify se cogen DOS campos y ninguno más. */
export function geoDeContexto(geo: ContextoGeo | null | undefined): Geo {
  if (!geo) return VACIO
  return {
    country: pais(geo.country?.code),
    // El NOMBRE antes que el código: esto lo lee una persona en un panel, y
    // «Bizkaia» se entiende mientras que «BI» no.
    region: region(geo.subdivision?.name) ?? region(geo.subdivision?.code),
  }
}

/**
 * Respaldo por cabeceras. `h` devuelve el valor de una cabecera, o null.
 *
 * Existe porque no está garantizado que `context.geo` venga siempre relleno,
 * y porque en local (`netlify dev`) se puede simular con cabeceras. `x-nf-geo`
 * es un JSON en base64 con TODO dentro; de ahí también se cogen dos campos.
 *
 * Se usa `atob` y no `Buffer`: este módulo corre en el navegador, en Deno y en
 * vitest, y `Buffer` solo existe en uno de los tres.
 */
export function geoDeCabeceras(h: (nombre: string) => string | null): Geo {
  const suelto: Geo = {
    country: pais(h('x-country') ?? h('x-nf-country')),
    // La región suelta suele venir como código («PV»); mejor eso que nada.
    region: region(h('x-nf-subdivision-code') ?? h('x-subdivision-code')),
  }

  const crudo = h('x-nf-geo')
  if (!crudo) return suelto.country || suelto.region ? suelto : VACIO

  try {
    // atob da bytes en un string «binario»; hay que decodificarlos como UTF-8
    // o los nombres con acento («Castilla y León») salen rotos.
    const bin = atob(crudo)
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
    const json = JSON.parse(new TextDecoder().decode(bytes)) as ContextoGeo
    const delJson = geoDeContexto(json)
    return {
      country: delJson.country ?? suelto.country,
      region: delJson.region ?? suelto.region,
    }
  } catch {
    // Base64 o JSON rotos: nos quedamos con lo que hubiera suelto. Que falte
    // la geolocalización no es un fallo, es que el CDN no lo dice.
    return suelto
  }
}
