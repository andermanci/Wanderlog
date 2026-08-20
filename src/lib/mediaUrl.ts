// Los MP3 de las audioguías viven en Cloudflare R2, no en Supabase Storage: el
// bucket de Supabase se comía el gigabyte del plan gratuito y el audio es lo
// único que crece sin techo (32 kbps ≈ 240 KB por minuto de guion).
//
// En la base de datos se guarda la CLAVE del objeto (`usuario/viaje/ámbito/
// parada.mp3`), NO la URL completa. Antes se guardaba la URL absoluta de
// Supabase ya materializada, y por eso mudarse costó una migración de miles de
// filas. Con la clave, el origen público es una variable de entorno: cambiar de
// `r2.dev` a un dominio propio es redesplegar, no reescribir la base de datos.
//
// Esta función acepta las dos formas a propósito. Durante la migración conviven
// filas con la URL vieja de Supabase y filas con la clave nueva, y las imágenes
// de las paradas siguen siendo URLs absolutas (Wikimedia, o el bucket de
// Supabase, que sigue guardando las WebP). Todo lo que ya sea una URL sale tal
// cual; solo lo que es una clave desnuda se resuelve contra el origen.

// Se lee en cada llamada y no en una constante de módulo: Vite sustituye
// import.meta.env en tiempo de compilación igual, y así los tests pueden
// cambiar el origen con vi.stubEnv sin pelearse con el orden de los imports.
const base = () => (import.meta.env.VITE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '')

let avisado = false

/** Clave de R2 → URL pública. Deja pasar sin tocar lo que ya es una URL. */
export function mediaUrl(v: string | null | undefined): string | null {
  if (!v) return null
  if (/^(https?:|blob:|data:)/.test(v)) return v

  const BASE = base()

  // Sin origen configurado se devuelve null, y NO la clave a secas: una ruta
  // relativa la resolvería el navegador contra el dominio de la app, donde el
  // fallback SPA de netlify.toml responde index.html con un 200. O sea, un
  // «MP3» que en realidad es HTML, que falla al reproducirse sin decir por qué.
  if (!BASE) {
    if (!avisado) {
      avisado = true
      console.error('[mediaUrl] Falta VITE_R2_PUBLIC_URL: el audio de las audioguías no se puede resolver.')
    }
    return null
  }

  return `${BASE}/${v.replace(/^\/+/, '')}`
}

/** Igual que `mediaUrl`, para donde no tener URL es un error y no un estado. */
export function mediaUrlOrThrow(v: string): string {
  const url = mediaUrl(v)
  if (!url) throw new Error(`No se puede resolver la URL de "${v}" (¿falta VITE_R2_PUBLIC_URL?)`)
  return url
}
