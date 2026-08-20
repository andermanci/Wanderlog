#!/usr/bin/env -S deno run -A
// ============================================================
// Limpieza del bucket `attachments`
// ============================================================
// Tras mudar el audio a R2, `attachments` pasó a ser el bucket dominante: 417 MB
// de los 455 MB que quedaban en Supabase. Pero al mirarlo de cerca casi todo es
// evitable, así que no hace falta mudarlo a ninguna parte —cosa que además sería
// cara, porque estos ficheros los sube el navegador y en R2 harían falta URLs
// prefirmadas—. Basta con dejar de guardar lo que no hay que guardar:
//
//   · 87 ficheros (165 MB) que no referencia ninguna fila. Son secuela de que
//     borrar un viaje NO limpia el storage: las filas caen por cascada y los
//     ficheros se quedan. Mientras eso no se arregle, esto hay que repasarlo.
//
//   · 213 portadas de Google Places a 1,67 MB de media. place-photo las
//     rehospeda a 1600 px SIN recomprimir, mientras que las fotos del diario sí
//     pasan por compressImage (1280 px, WebP, calidad 0,6) antes de subirse.
//     Con el mismo trato ocupan una décima parte y se ven igual.
//
// SEGURIDAD: simulacro salvo --apply, y TODO lo que se va a destruir o
// sobrescribir se copia antes a scripts/.respaldo-attachments/.
//
// Uso e instrucciones: scripts/README.md

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const BUCKET = 'attachments'
const LOTE_BORRADO = 100
const CONCURRENCIA = 4
const RESPALDO = 'scripts/.respaldo-attachments'

// Los mismos números que usa la app para las fotos del diario
// (src/lib/photoCache.ts): si a esas les vale, a una portada también.
const LADO_MAX = 1280
const CALIDAD = 60
/** Por debajo de esto no merece la pena tocar nada. */
const UMBRAL_BYTES = 300 * 1024

// Tablas con contenido escrito por personas. Se escanea CUALQUIER campo de
// texto y no unas columnas elegidas a mano: lo que se busca es justamente una
// referencia en un sitio donde no la esperamos (una imagen pegada en markdown
// dentro de una guía, por ejemplo). Borrar por una lista incompleta sería
// destruir algo que sí se ve.
const TABLAS = [
  'profiles', 'trips', 'itinerary_days', 'day_alerts', 'journal_photos', 'activities',
  'documents', 'travelers', 'destination_guides', 'favorite_places', 'reminders',
  'packing_items', 'expenses', 'activity_attachments', 'audioguides', 'audioguide_stops',
  'trip_collaborators',
]

// deno-lint-ignore no-explicit-any
type Supa = any
interface Objeto { path: string; size: number; mime: string }

async function cargarEnv() {
  try {
    const texto = await Deno.readTextFile(new URL('../.env', import.meta.url))
    for (const linea of texto.split('\n')) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (m && !Deno.env.get(m[1])) Deno.env.set(m[1], m[2].trim().replace(/^["']|["']$/g, ''))
    }
  } catch { /* puede venir del entorno */ }
}

function tam(b: number): string {
  return b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`
}

async function enParalelo<T>(items: T[], n: number, tarea: (x: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (let j = i++; j < items.length; j = i++) await tarea(items[j])
  }))
}

function progreso(hechos: number, total: number, extra = '') {
  const lleno = total === 0 ? 0 : Math.round((hechos / total) * 24)
  const linea = `  [${'#'.repeat(lleno)}${'.'.repeat(24 - lleno)}] ${hechos}/${total} ${extra}`
  Deno.stdout.writeSync(new TextEncoder().encode(`\r${linea.padEnd(78)}`))
  if (hechos === total) console.log()
}

/** El listado del storage no es recursivo y pagina de 100 en 100. */
async function listar(s: Supa, prefijo = ''): Promise<Objeto[]> {
  const out: Objeto[] = []
  for (let off = 0; ; off += 100) {
    const { data } = await s.storage.from(BUCKET).list(prefijo, { limit: 100, offset: off })
    if (!data?.length) break
    for (const e of data) {
      const p = prefijo ? `${prefijo}/${e.name}` : e.name
      if (e.id === null) out.push(...await listar(s, p))
      else out.push({ path: p, size: e.metadata?.size ?? 0, mime: e.metadata?.mimetype ?? '' })
    }
    if (data.length < 100) break
  }
  return out
}

/** Todo lo que la base de datos menciona, mire donde mire. */
async function referenciadas(s: Supa): Promise<Set<string>> {
  const set = new Set<string>()
  for (const t of TABLAS) {
    const { data, error } = await s.from(t).select('*')
    if (error) { console.log(`  (aviso: no se pudo leer ${t}: ${error.message})`); continue }
    for (const fila of data ?? []) {
      for (const m of JSON.stringify(fila).matchAll(/attachments\/([^"'\\)\s]+)/g)) {
        set.add(decodeURIComponent(m[1]).split('?')[0])
      }
    }
  }
  return set
}

async function respaldar(s: Supa, objetos: Objeto[], etiqueta: string) {
  const dir = `${RESPALDO}/${etiqueta}`
  await Deno.mkdir(dir, { recursive: true })
  console.log(`\n  Respaldando ${objetos.length} ficheros en ${dir}/ ...`)
  let n = 0
  await enParalelo(objetos, CONCURRENCIA, async (o) => {
    const { data } = await s.storage.from(BUCKET).download(o.path)
    if (data) {
      const destino = `${dir}/${o.path.replaceAll('/', '__')}`
      await Deno.writeFile(destino, new Uint8Array(await data.arrayBuffer()))
    }
    progreso(++n, objetos.length)
  })
}

// ------------------------------------------------------------

async function medir(s: Supa) {
  console.log('\n== MEDIR ==\n')
  const objetos = await listar(s)
  const refs = await referenciadas(s)
  const huerfanos = objetos.filter((o) => !refs.has(o.path))
  const gordas = objetos.filter((o) => refs.has(o.path) && o.mime.startsWith('image/') && o.size > UMBRAL_BYTES)
  const total = objetos.reduce((a, o) => a + o.size, 0)
  const bh = huerfanos.reduce((a, o) => a + o.size, 0)
  const bg = gordas.reduce((a, o) => a + o.size, 0)

  console.log(`  Objetos ................. ${String(objetos.length).padStart(4)}  ${tam(total).padStart(9)}`)
  console.log(`  Huérfanos ............... ${String(huerfanos.length).padStart(4)}  ${tam(bh).padStart(9)}  -> comando 'huerfanos'`)
  console.log(`  Imágenes recomprimibles . ${String(gordas.length).padStart(4)}  ${tam(bg).padStart(9)}  -> comando 'recomprimir'`)
  console.log(`\n  Estimación al terminar: ~${tam(total - bh - bg * 0.88)} (recomprimir suele dejar ~1/8)\n`)
}

async function huerfanosCmd(s: Supa, apply: boolean) {
  console.log('\n== HUÉRFANOS ==\n')
  const objetos = await listar(s)
  const refs = await referenciadas(s)
  const huerfanos = objetos.filter((o) => !refs.has(o.path))
  const bytes = huerfanos.reduce((a, o) => a + o.size, 0)

  console.log(`  ${huerfanos.length} ficheros (${tam(bytes)}) sin ninguna fila que los referencie.`)
  console.log(`  Comprobado contra CUALQUIER campo de texto de ${TABLAS.length} tablas, no solo las columnas de URL.`)
  for (const o of huerfanos.slice(0, 5)) console.log(`    ${tam(o.size).padStart(8)}  ${o.path}`)
  if (huerfanos.length > 5) console.log(`    ... y ${huerfanos.length - 5} más`)
  if (huerfanos.length === 0) return
  if (!apply) {
    console.log('\n  SIMULACRO — no se ha borrado nada. Añade --apply.\n')
    return
  }

  await respaldar(s, huerfanos, 'huerfanos')
  const rutas = huerfanos.map((o) => o.path)
  let borrados = 0
  for (let i = 0; i < rutas.length; i += LOTE_BORRADO) {
    const lote = rutas.slice(i, i + LOTE_BORRADO)
    const { error } = await s.storage.from(BUCKET).remove(lote)
    if (error) { console.error(`\n  Error borrando: ${error.message}\n`); Deno.exit(1) }
    borrados += lote.length
    progreso(borrados, rutas.length)
  }
  console.log(`\n  Borrados ${borrados} ficheros, ${tam(bytes)} liberados.`)
  console.log(`  Copia en ${RESPALDO}/huerfanos/ por si acaso.\n`)
}

/** Dimensiones con sips, que viene con macOS. */
async function dimensiones(fichero: string): Promise<{ w: number; h: number } | null> {
  const p = new Deno.Command('sips', { args: ['-g', 'pixelWidth', '-g', 'pixelHeight', fichero], stdout: 'piped', stderr: 'null' })
  const { stdout } = await p.output()
  const t = new TextDecoder().decode(stdout)
  const w = Number(t.match(/pixelWidth:\s*(\d+)/)?.[1])
  const h = Number(t.match(/pixelHeight:\s*(\d+)/)?.[1])
  return w && h ? { w, h } : null
}

async function recomprimir(s: Supa, apply: boolean) {
  console.log('\n== RECOMPRIMIR ==\n')
  const objetos = await listar(s)
  const refs = await referenciadas(s)
  const gordas = objetos.filter((o) => refs.has(o.path) && o.mime.startsWith('image/') && o.size > UMBRAL_BYTES)
  const bytes = gordas.reduce((a, o) => a + o.size, 0)

  console.log(`  ${gordas.length} imágenes por encima de ${tam(UMBRAL_BYTES)} (${tam(bytes)} en total).`)
  console.log(`  Se reducen a ${LADO_MAX} px de lado mayor y WebP calidad ${CALIDAD}, igual que compressImage.`)
  console.log(`  Se sobrescribe cada una EN SU MISMA RUTA, así que ninguna URL de la base de datos cambia.`)
  if (gordas.length === 0) return
  if (!apply) {
    console.log('\n  SIMULACRO — no se ha tocado nada. Añade --apply.\n')
    return
  }

  await respaldar(s, gordas, 'originales')
  await Deno.mkdir('/tmp/wl-recomp', { recursive: true })

  let n = 0, cambiadas = 0, antes = 0, despues = 0
  const fallos: string[] = []
  await enParalelo(gordas, CONCURRENCIA, async (o) => {
    const base = `/tmp/wl-recomp/${o.path.replaceAll('/', '__')}`
    try {
      const { data, error } = await s.storage.from(BUCKET).download(o.path)
      if (error || !data) throw new Error(error?.message ?? 'sin datos')
      await Deno.writeFile(base, new Uint8Array(await data.arrayBuffer()))

      const dim = await dimensiones(base)
      const args = ['-q', String(CALIDAD), '-quiet']
      // -resize con un 0 mantiene la proporción. Solo se toca el lado que se
      // pasa: encoger un lado corto agrandaría la foto, no la reduciría.
      if (dim && Math.max(dim.w, dim.h) > LADO_MAX) {
        args.push('-resize', ...(dim.w >= dim.h ? [String(LADO_MAX), '0'] : ['0', String(LADO_MAX)]))
      }
      args.push(base, '-o', `${base}.webp`)
      const { code } = await new Deno.Command('cwebp', { args, stdout: 'null', stderr: 'null' }).output()
      if (code !== 0) throw new Error('cwebp falló')

      const nuevo = await Deno.readFile(`${base}.webp`)
      // La misma guardia que compressImage: si no sale más pequeño, se deja lo
      // que había. Recomprimir por recomprimir solo degrada.
      if (nuevo.length < o.size) {
        const { error: subErr } = await s.storage.from(BUCKET)
          .upload(o.path, nuevo, { contentType: 'image/webp', upsert: true })
        if (subErr) throw new Error(subErr.message)
        cambiadas++
        antes += o.size
        despues += nuevo.length
      }
      await Deno.remove(base).catch(() => {})
      await Deno.remove(`${base}.webp`).catch(() => {})
    } catch (err) {
      fallos.push(`${o.path}: ${err instanceof Error ? err.message : 'error'}`)
    }
    progreso(++n, gordas.length, `${tam(despues)} / ${tam(antes)}`)
  })

  console.log(`\n  Recomprimidas ${cambiadas} de ${gordas.length}.  Fallos: ${fallos.length}.`)
  if (antes > 0) console.log(`  ${tam(antes)} -> ${tam(despues)}   (${Math.round((1 - despues / antes) * 100)}% menos)`)
  if (fallos.length > 0) {
    await Deno.writeTextFile('scripts/informe-recompresion.txt', fallos.join('\n'))
    console.log('  -> scripts/informe-recompresion.txt')
  }
  console.log(`  Originales en ${RESPALDO}/originales/\n`)
}

// ------------------------------------------------------------

const AYUDA = `
Limpieza del bucket attachments de Supabase.

  deno run -A scripts/limpiar-attachments.ts <comando> [--apply]

  medir         Qué hay, cuántos huérfanos y cuánto se ahorraría. Solo lee.
  huerfanos     Borra los ficheros que no referencia ninguna fila.
  recomprimir   Reduce a ${LADO_MAX} px y WebP las imágenes grandes, en su misma ruta.

Sin --apply, todo se limita a contar lo que haría.
Lo que se borra o sobrescribe se respalda antes en ${RESPALDO}/
`

await cargarEnv()
const args = Deno.args
const comando = args[0] ?? ''
const apply = args.includes('--apply')
const supa = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
)

switch (comando) {
  case 'medir': await medir(supa); break
  case 'huerfanos': await huerfanosCmd(supa, apply); break
  case 'recomprimir': await recomprimir(supa, apply); break
  default: console.log(AYUDA)
}
