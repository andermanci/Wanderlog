#!/usr/bin/env -S deno run -A
// ============================================================
// Migración de los MP3 de las audioguías: Supabase Storage → Cloudflare R2
// ============================================================
// Uso e instrucciones completas: scripts/README.md
//
// POR QUÉ DENO Y NO NODE: para poder importar el MISMO _shared/r2.ts que usa
// la Edge Function en producción. La firma SigV4 es donde aparecen los errores
// raros y difíciles de ver; teniendo una sola implementación, este script —que
// la ejercita con miles de objetos reales— acaba siendo el mejor test de
// integración disponible de algo que vitest no puede cubrir.
//
// SEGURIDAD DE OPERACIÓN: todo va en simulacro salvo que se pase --apply, el
// borrado en Supabase es un comando aparte que además exige --confirmar BORRAR,
// y todos los comandos son idempotentes y reanudables. Se puede cortar con
// Ctrl-C en cualquier punto y relanzar el mismo comando.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clienteR2, r2Delete, r2Head, r2Put, type R2 } from '../supabase/functions/_shared/r2.ts'

const BUCKET_ORIGEN = 'audioguides'
const MIME_AUDIO = 'audio/mpeg'
const LOTE_BORRADO = 100
const CONCURRENCIA = 6

// ------------------------------------------------------------
// Entorno
// ------------------------------------------------------------

/** Lee el .env de la raíz del repo. Sin dependencias: son cuatro reglas. */
async function cargarEnv(): Promise<void> {
  const ruta = new URL('../.env', import.meta.url)
  let texto: string
  try {
    texto = await Deno.readTextFile(ruta)
  } catch {
    return // puede que las variables vengan del entorno directamente
  }
  for (const linea of texto.split('\n')) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const valor = m[2].trim().replace(/^["']|["']$/g, '')
    if (!Deno.env.get(m[1])) Deno.env.set(m[1], valor)
  }
}

function env(nombre: string, obligatoria = true): string {
  const v = Deno.env.get(nombre) ?? ''
  if (!v && obligatoria) {
    console.error(`\n  Falta ${nombre} en el .env de la raíz del proyecto.\n`)
    Deno.exit(1)
  }
  return v
}

// ------------------------------------------------------------
// Argumentos
// ------------------------------------------------------------

interface Opciones {
  comando: string
  apply: boolean
  confirmar: string
  antesDe: Date | null
  viaje: string | null
  limite: number | null
}

/** "3d" → hace tres días. También acepta una fecha ISO. */
function fecha(valor: string): Date {
  const rel = valor.match(/^(\d+)([dhm])$/)
  if (rel) {
    const n = Number(rel[1])
    const ms = rel[2] === 'd' ? 86400000 : rel[2] === 'h' ? 3600000 : 60000
    return new Date(Date.now() - n * ms)
  }
  const d = new Date(valor)
  if (isNaN(d.getTime())) {
    console.error(`\n  Fecha no válida: "${valor}". Usa 3d, 48h o 2026-08-01.\n`)
    Deno.exit(1)
  }
  return d
}

function argumentos(): Opciones {
  const args = [...Deno.args]
  const comando = args.shift() ?? ''
  const o: Opciones = { comando, apply: false, confirmar: '', antesDe: null, viaje: null, limite: null }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--apply') o.apply = true
    else if (a === '--confirmar') o.confirmar = args[++i] ?? ''
    else if (a === '--antes-de') o.antesDe = fecha(args[++i] ?? '')
    else if (a === '--viaje') o.viaje = args[++i] ?? null
    else if (a === '--limite') o.limite = Number(args[++i] ?? '0') || null
    else {
      console.error(`\n  Opción desconocida: ${a}\n`)
      Deno.exit(1)
    }
  }
  return o
}

// ------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------

function tam(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/**
 * Descarga con reintentos. Supabase Storage limita el ritmo y devuelve 429 en
 * cuanto se le piden muchos ficheros seguidos: en la primera pasada completa
 * cayeron así 32 de 1143. No es un error de verdad, es «espera un poco», así
 * que se espera y se reintenta en vez de dejarlo para una segunda pasada que
 * volvería a chocar con el mismo límite. Espera creciente, y se respeta
 * Retry-After si el servidor lo manda.
 */
async function bajarConReintentos(url: string, intentos = 5): Promise<Uint8Array<ArrayBuffer>> {
  let ultimo = ''
  for (let i = 0; i < intentos; i++) {
    try {
      const res = await fetch(url)
      if (res.ok) return new Uint8Array(await res.arrayBuffer())
      await res.body?.cancel()
      ultimo = `origen ${res.status}`
      if (res.status !== 429 && res.status < 500) throw new Error(ultimo)
      const cabecera = Number(res.headers.get('retry-after'))
      const espera = cabecera > 0 ? cabecera * 1000 : 1000 * 2 ** i
      await new Promise((r) => setTimeout(r, espera))
    } catch (err) {
      ultimo = err instanceof Error ? err.message : 'error'
      if (i === intentos - 1) break
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i))
    }
  }
  throw new Error(ultimo)
}

/** Ejecuta `tarea` sobre cada elemento con como mucho N a la vez. */
async function enParalelo<T>(items: T[], n: number, tarea: (item: T, i: number) => Promise<void>) {
  let siguiente = 0
  const obrero = async () => {
    for (let i = siguiente++; i < items.length; i = siguiente++) await tarea(items[i], i)
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, obrero))
}

function progreso(hechos: number, total: number, extra = '') {
  const ancho = 24
  const lleno = total === 0 ? 0 : Math.round((hechos / total) * ancho)
  const barra = '#'.repeat(lleno) + '.'.repeat(ancho - lleno)
  const linea = `  [${barra}] ${hechos}/${total} ${extra}`
  Deno.stdout.writeSync(new TextEncoder().encode(`\r${linea.padEnd(78)}`))
  if (hechos === total) console.log()
}

// ------------------------------------------------------------
// Datos
// ------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Supa = any

interface Objeto { name: string; bytes: number; mimetype: string | null; created_at: string }
interface Parada {
  id: string
  trip_id: string
  audio_url: string | null
  audio_bytes: number | null
  created_at: string
}

const PREFIJO_PUBLICO = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/audioguides\//

/** El valor de audio_url → clave del objeto, venga como venga. */
function claveDe(v: string): string {
  return v.replace(PREFIJO_PUBLICO, '').split('?')[0]
}

function esUrlSupabase(v: string | null): v is string {
  return !!v && PREFIJO_PUBLICO.test(v)
}

async function listarObjetos(supa: Supa): Promise<Objeto[]> {
  const todos: Objeto[] = []
  let after = ''
  for (;;) {
    const { data, error } = await supa.rpc('migracion_audio_objetos', { p_after: after, p_limit: 1000 })
    if (error) {
      console.error(`\n  No se pudo enumerar el bucket: ${error.message}`)
      console.error('  ¿Está aplicada la migración 059?\n')
      Deno.exit(1)
    }
    const pagina = (data ?? []) as Objeto[]
    todos.push(...pagina)
    if (pagina.length === 0) break
    after = pagina[pagina.length - 1].name
  }
  return todos
}

async function listarParadas(supa: Supa): Promise<Parada[]> {
  const todas: Parada[] = []
  const PAGINA = 1000
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await supa
      .from('audioguide_stops')
      .select('id, trip_id, audio_url, audio_bytes, created_at')
      .not('audio_url', 'is', null)
      .order('id')
      .range(desde, desde + PAGINA - 1)
    if (error) {
      console.error(`\n  No se pudieron leer las paradas: ${error.message}\n`)
      Deno.exit(1)
    }
    todas.push(...((data ?? []) as Parada[]))
    if ((data ?? []).length < PAGINA) break
  }
  return todas
}

function filtrar(paradas: Parada[], o: Opciones): Parada[] {
  let r = paradas
  if (o.antesDe) r = r.filter((p) => new Date(p.created_at) < o.antesDe!)
  if (o.viaje) r = r.filter((p) => p.trip_id === o.viaje)
  if (o.limite) r = r.slice(0, o.limite)
  return r
}

function descripcionFiltros(o: Opciones): string {
  const partes: string[] = []
  if (o.antesDe) partes.push(`creadas antes de ${o.antesDe.toISOString().slice(0, 16).replace('T', ' ')}`)
  if (o.viaje) partes.push(`viaje ${o.viaje}`)
  if (o.limite) partes.push(`como mucho ${o.limite}`)
  return partes.length > 0 ? `  Filtros: ${partes.join(', ')}\n` : ''
}

function simulacro(o: Opciones): boolean {
  if (o.apply) return false
  console.log('\n  SIMULACRO — no se ha modificado nada. Añade --apply para ejecutarlo de verdad.\n')
  return true
}

// ------------------------------------------------------------
// Comandos
// ------------------------------------------------------------

async function medir(supa: Supa, o: Opciones) {
  console.log('\n== MEDIR ==\n')

  const { data: resumen, error } = await supa.rpc('migracion_storage_resumen')
  if (error) {
    console.error(`  No se pudo leer el resumen: ${error.message}`)
    console.error('  ¿Está aplicada la migración 059?\n')
    Deno.exit(1)
  }

  type Fila = { bucket_id: string; mimetype: string; ficheros: number; bytes: number }
  const filas = (resumen ?? []) as Fila[]
  const total = filas.reduce((s, f) => s + Number(f.bytes), 0)
  const audio = filas
    .filter((f) => f.bucket_id === BUCKET_ORIGEN && f.mimetype === MIME_AUDIO)
    .reduce((s, f) => s + Number(f.bytes), 0)

  const porBucket = new Map<string, { ficheros: number; bytes: number }>()
  for (const f of filas) {
    const b = porBucket.get(f.bucket_id) ?? { ficheros: 0, bytes: 0 }
    porBucket.set(f.bucket_id, {
      ficheros: b.ficheros + Number(f.ficheros),
      bytes: b.bytes + Number(f.bytes),
    })
  }

  for (const [bucket, b] of [...porBucket].sort((a, z) => z[1].bytes - a[1].bytes)) {
    console.log(`  ${bucket.padEnd(16, '.')} ${String(b.ficheros).padStart(6)} ficheros  ${tam(b.bytes).padStart(9)}`)
    if (bucket !== BUCKET_ORIGEN) continue
    for (const f of filas.filter((x) => x.bucket_id === bucket).sort((a, z) => Number(z.bytes) - Number(a.bytes))) {
      const marca = f.mimetype === MIME_AUDIO ? '  <- se mueve a R2' : '  <- se queda'
      console.log(`     ${f.mimetype.padEnd(13, '.')} ${String(f.ficheros).padStart(6)} ficheros  ${tam(Number(f.bytes)).padStart(9)}${marca}`)
    }
  }
  console.log(`  ${'TOTAL'.padEnd(16, '.')} ${''.padStart(6)}           ${tam(total).padStart(9)}\n`)

  const restante = total - audio
  const LIMITE = 1024 ** 3
  console.log(`  Después de mover el audio quedarían ${tam(restante)}.`)
  console.log(restante < LIMITE
    ? '  POR DEBAJO DE 1 GB. Adelante.\n'
    : '  SIGUE POR ENCIMA DE 1 GB. Mover solo el audio NO resuelve el problema:\n' +
      '  hay que ampliar el alcance (probablemente al bucket attachments) antes de copiar nada.\n')

  // Cruce con la base de datos: qué está referenciado y qué no.
  const objetos = (await listarObjetos(supa)).filter((x) => x.mimetype === MIME_AUDIO)
  const paradas = await listarParadas(supa)
  const clavesEnBd = new Set(paradas.map((p) => p.audio_url && claveDe(p.audio_url)).filter(Boolean) as string[])
  const nombresEnBucket = new Set(objetos.map((x) => x.name))

  const huerfanos = objetos.filter((x) => !clavesEnBd.has(x.name))
  const perdidas = paradas.filter((p) => esUrlSupabase(p.audio_url) && !nombresEnBucket.has(claveDe(p.audio_url!)))

  console.log('  Cruce con audioguide_stops:')
  console.log(`     objetos con fila ....... ${String(objetos.length - huerfanos.length).padStart(5)}  ${tam(objetos.reduce((s, x) => s + x.bytes, 0) - huerfanos.reduce((s, x) => s + x.bytes, 0))}`)
  console.log(`     huérfanos (sin fila) ... ${String(huerfanos.length).padStart(5)}  ${tam(huerfanos.reduce((s, x) => s + x.bytes, 0))}`)
  console.log(`     filas sin objeto ....... ${String(perdidas.length).padStart(5)}`)
  if (huerfanos.length > 0) {
    // Restos del fallo antiguo: se borraba listando el prefijo del usuario que
    // pulsaba borrar, no el de quien había generado el audio. Se borran sin
    // copiarlos, que para eso no los referencia nadie.
    await Deno.writeTextFile('scripts/informe-huerfanos.txt', huerfanos.map((x) => x.name).join('\n'))
    console.log('     -> scripts/informe-huerfanos.txt')
  }
  if (perdidas.length > 0) {
    await Deno.writeTextFile('scripts/informe-perdidos.txt', perdidas.map((p) => `${p.id} ${p.audio_url}`).join('\n'))
    console.log('     -> scripts/informe-perdidos.txt (paradas cuyo MP3 ya no existe)')
  }

  const enFiltro = filtrar(paradas.filter((p) => esUrlSupabase(p.audio_url)), o)
  console.log(`\n  Pendientes de migrar con los filtros dados: ${enFiltro.length}`)
  console.log(descripcionFiltros(o))
}

/** Paradas que hay que copiar, con su clave y el objeto de origen. */
async function pendientesDeCopia(supa: Supa, o: Opciones) {
  const objetos = new Map((await listarObjetos(supa)).map((x) => [x.name, x]))
  const paradas = filtrar(await listarParadas(supa), o)
  const trabajos: { parada: Parada; clave: string; bytes: number }[] = []
  for (const p of paradas) {
    if (!p.audio_url) continue
    const clave = claveDe(p.audio_url)
    const obj = objetos.get(clave)
    if (!obj || obj.mimetype !== MIME_AUDIO) continue
    trabajos.push({ parada: p, clave, bytes: obj.bytes })
  }
  return trabajos
}

async function copiar(supa: Supa, r2: R2, o: Opciones, supabaseUrl: string) {
  console.log('\n== COPIAR ==\n')
  const trabajos = await pendientesDeCopia(supa, o)
  const bytesTotal = trabajos.reduce((s, t) => s + t.bytes, 0)
  console.log(`  ${trabajos.length} objetos (${tam(bytesTotal)}) hacia r2://${r2.bucket}`)
  console.log(descripcionFiltros(o))
  if (trabajos.length === 0) return
  if (simulacro(o)) return

  let hechos = 0, copiados = 0, saltados = 0, bytesCopiados = 0
  const fallos: string[] = []
  const registro = await Deno.open('scripts/.migracion-r2.jsonl', { create: true, append: true, write: true })

  await enParalelo(trabajos, CONCURRENCIA, async (t) => {
    try {
      // R2 es el punto de control: si el objeto ya está con el mismo tamaño, se
      // salta. Por eso reanudar es relanzar el mismo comando, sin estado local.
      const yaEsta = await r2Head(r2, t.clave)
      if (yaEsta && yaEsta.bytes === t.bytes) {
        saltados++
      } else {
        const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET_ORIGEN}/${t.clave}`
        const bytes = await bajarConReintentos(url)
        if (bytes.length !== t.bytes) throw new Error(`tamaño ${bytes.length} != ${t.bytes}`)
        await r2Put(r2, t.clave, bytes, MIME_AUDIO)
        copiados++
        bytesCopiados += bytes.length
      }
      await registro.write(new TextEncoder().encode(
        JSON.stringify({ clave: t.clave, stop: t.parada.id, bytes: t.bytes }) + '\n',
      ))
    } catch (err) {
      fallos.push(`${t.clave}: ${err instanceof Error ? err.message : 'error'}`)
    }
    progreso(++hechos, trabajos.length, tam(bytesCopiados))
  })
  registro.close()

  console.log(`\n  Copiados: ${copiados}   Ya estaban: ${saltados}   Fallos: ${fallos.length}`)
  if (fallos.length > 0) {
    await Deno.writeTextFile('scripts/informe-fallos-copia.txt', fallos.join('\n'))
    console.log('  -> scripts/informe-fallos-copia.txt. Relanza el mismo comando: reintenta solo lo que falta.\n')
    Deno.exit(1)
  }
  console.log('  Siguiente paso: verificar\n')
}

async function verificar(supa: Supa, r2: R2, o: Opciones): Promise<boolean> {
  console.log('\n== VERIFICAR ==\n')
  const trabajos = await pendientesDeCopia(supa, o)
  let hechos = 0, coinciden = 0
  const malas: string[] = []

  await enParalelo(trabajos, CONCURRENCIA, async (t) => {
    const en = await r2Head(r2, t.clave).catch(() => null)
    if (en && en.bytes === t.bytes) coinciden++
    else malas.push(`${t.clave}: ${en ? `${en.bytes} != ${t.bytes}` : 'no está en R2'}`)
    progreso(++hechos, trabajos.length)
  })

  console.log(`\n  Verificados ${trabajos.length}.  Coinciden: ${coinciden}.  Discrepancias: ${malas.length}.`)
  if (malas.length > 0) {
    await Deno.writeTextFile('scripts/informe-discrepancias.txt', malas.join('\n'))
    console.log('  -> scripts/informe-discrepancias.txt')
    console.log('  NO CONTINÚES. Relanza `copiar --apply` y vuelve a verificar.\n')
    return false
  }
  console.log('  Todo cuadra. Siguiente paso: reescribir\n')
  return true
}

async function reescribir(supa: Supa, r2: R2, o: Opciones) {
  console.log('\n== REESCRIBIR ==\n')

  // Nunca se reescribe algo que no esté verificado en R2: sería dejar a alguien
  // sin audio a cambio de nada.
  if (!(await verificar(supa, r2, o))) Deno.exit(1)

  const trabajos = (await pendientesDeCopia(supa, o)).filter((t) => esUrlSupabase(t.parada.audio_url))
  console.log(`  Se cambiarán ${trabajos.length} filas de audioguide_stops.`)
  if (trabajos.length > 0) {
    console.log(`    antes:   ${trabajos[0].parada.audio_url}`)
    console.log(`    después: ${trabajos[0].clave}`)
  }
  console.log(descripcionFiltros(o))
  if (trabajos.length === 0) return
  if (simulacro(o)) return

  let hechos = 0
  const fallos: string[] = []
  await enParalelo(trabajos, CONCURRENCIA, async (t) => {
    const { error } = await supa
      .from('audioguide_stops')
      .update({ audio_url: t.clave, audio_bytes: t.bytes })
      .eq('id', t.parada.id)
      .like('audio_url', 'http%')   // guardia: no pisa lo ya migrado
    if (error) fallos.push(`${t.parada.id}: ${error.message}`)
    progreso(++hechos, trabajos.length)
  })

  console.log(`\n  Filas reescritas: ${trabajos.length - fallos.length}.  Fallos: ${fallos.length}.`)
  if (fallos.length > 0) {
    console.log(`  ${fallos.slice(0, 5).join('\n  ')}\n`)
    Deno.exit(1)
  }
  console.log('\n  La app ya sirve estos audios desde R2.')
  console.log('  Abre una audioguía en el móvil antes de seguir. Luego: comprobar-app\n')
}

async function comprobarApp(supa: Supa, o: Opciones, publica: string) {
  console.log('\n== COMPROBAR-APP ==\n')
  const paradas = filtrar(await listarParadas(supa), o).filter((p) => p.audio_url && !/^https?:/.test(p.audio_url))
  console.log(`  ${paradas.length} URLs contra ${publica}`)
  if (paradas.length === 0) {
    console.log('  No hay ninguna fila migrada todavía.\n')
    return
  }

  let hechos = 0, ok = 0
  const fallos: string[] = []
  await enParalelo(paradas, CONCURRENCIA, async (p) => {
    const url = `${publica}/${p.audio_url}`
    try {
      const res = await fetch(url, { method: 'HEAD' })
      if (res.ok) ok++
      else fallos.push(`${res.status} ${url}`)
    } catch (err) {
      fallos.push(`${err instanceof Error ? err.message : 'error'} ${url}`)
    }
    progreso(++hechos, paradas.length)
  })

  console.log(`\n  200 OK: ${ok}   Fallos: ${fallos.length}`)
  if (fallos.length > 0) {
    await Deno.writeTextFile('scripts/informe-fallos-app.txt', fallos.join('\n'))
    console.log('  -> scripts/informe-fallos-app.txt\n')
  }

  // Las dos cabeceras de las que depende que la app funcione de verdad, y que
  // no se ven mirando la app: sin CORS solo falla la descarga sin conexión, y
  // sin Range iOS no reproduce bien. Fallan en silencio las dos.
  const muestra = `${publica}/${paradas[0].audio_url}`
  const cors = await fetch(muestra, { method: 'HEAD', headers: { Origin: 'http://localhost:5173' } })
  const rango = await fetch(muestra, { headers: { Range: 'bytes=0-99' } })
  await rango.body?.cancel()
  console.log(`  CORS:  ${cors.headers.get('access-control-allow-origin') ?? 'AUSENTE - la descarga offline fallará'}`)
  console.log(`  Range: ${rango.status === 206 ? `206 ${rango.headers.get('content-range')}` : `${rango.status} - iOS puede no reproducir`}\n`)
}

async function borrarSupabase(supa: Supa, r2: R2, o: Opciones) {
  console.log('\n== BORRAR EN SUPABASE ==\n')
  if (o.confirmar !== 'BORRAR') {
    console.log('  Este comando es IRREVERSIBLE y exige confirmación explícita:')
    console.log('    deno run -A scripts/migrar-audio-r2.ts borrar-supabase --apply --confirmar BORRAR\n')
    return
  }

  const objetos = (await listarObjetos(supa)).filter((x) => x.mimetype === MIME_AUDIO)
  const paradas = await listarParadas(supa)
  const clavesVivas = new Set(paradas.map((p) => p.audio_url && claveDe(p.audio_url)).filter(Boolean) as string[])

  const huerfanos = objetos.filter((x) => !clavesVivas.has(x.name))
  const referenciados = objetos.filter((x) => clavesVivas.has(x.name))

  console.log(`  Se van a BORRAR ${objetos.length} objetos (${tam(objetos.reduce((s, x) => s + x.bytes, 0))}) del bucket ${BUCKET_ORIGEN}.`)
  console.log(`  Las imágenes WebP de las paradas NO se tocan.`)
  console.log('\n  Verificando que cada uno está en R2 antes de borrar...')

  let hechos = 0
  const sinCopia: string[] = []
  await enParalelo(referenciados, CONCURRENCIA, async (x) => {
    const en = await r2Head(r2, x.name).catch(() => null)
    if (!en || en.bytes !== x.bytes) sinCopia.push(x.name)
    progreso(++hechos, referenciados.length)
  })

  if (sinCopia.length > 0) {
    await Deno.writeTextFile('scripts/informe-sin-copia.txt', sinCopia.join('\n'))
    console.log(`\n  ${sinCopia.length} objetos NO están copiados en R2. No se borra nada.`)
    console.log('  -> scripts/informe-sin-copia.txt\n')
    Deno.exit(1)
  }
  console.log(`  Verificación previa: ${referenciados.length}/${referenciados.length} presentes en R2 (+${huerfanos.length} huérfanos, se borran sin copiar)`)
  if (simulacro(o)) return

  const todas = objetos.map((x) => x.name)
  let borrados = 0
  for (let i = 0; i < todas.length; i += LOTE_BORRADO) {
    const lote = todas.slice(i, i + LOTE_BORRADO)
    const { error } = await supa.storage.from(BUCKET_ORIGEN).remove(lote)
    if (error) {
      console.error(`\n  Error borrando: ${error.message}\n`)
      Deno.exit(1)
    }
    borrados += lote.length
    progreso(borrados, todas.length)
  }
  console.log(`\n  Borrados ${borrados} objetos.`)
  console.log('  Mira el uso de almacenamiento en el panel de Supabase dentro de unos minutos.\n')
}

async function revertir(supa: Supa, o: Opciones, supabaseUrl: string) {
  console.log('\n== REVERTIR ==\n')
  console.log('  Solo tiene sentido si NO se ha ejecutado borrar-supabase: devuelve\n' +
              '  audio_url a la URL de Supabase, que es donde seguirían los ficheros.\n')

  const paradas = filtrar(await listarParadas(supa), o).filter((p) => p.audio_url && !/^https?:/.test(p.audio_url))
  console.log(`  Se devolverán ${paradas.length} filas a la URL de Supabase.`)
  console.log(descripcionFiltros(o))
  if (paradas.length === 0) return
  if (simulacro(o)) return

  let hechos = 0
  const fallos: string[] = []
  await enParalelo(paradas, CONCURRENCIA, async (p) => {
    const url = `${supabaseUrl}/storage/v1/object/public/${BUCKET_ORIGEN}/${p.audio_url}`
    const { error } = await supa.from('audioguide_stops').update({ audio_url: url }).eq('id', p.id)
    if (error) fallos.push(`${p.id}: ${error.message}`)
    progreso(++hechos, paradas.length)
  })
  console.log(`\n  Revertidas: ${paradas.length - fallos.length}.  Fallos: ${fallos.length}.\n`)
}

// ------------------------------------------------------------

const AYUDA = `
Migración de los MP3 de las audioguías a Cloudflare R2.

  deno run -A scripts/migrar-audio-r2.ts <comando> [--apply] [filtros]

Comandos
  medir             Qué hay, cuánto ocupa y cuántos huérfanos. Solo lee.
  copiar            Copia los MP3 a R2. Idempotente y reanudable.
  verificar         Compara tamaños objeto a objeto.
  reescribir        audio_url: URL absoluta -> clave del objeto.
  comprobar-app     HEAD a la URL pública final de cada fila.
  borrar-supabase   IRREVERSIBLE. Exige --confirmar BORRAR.
  revertir          La vuelta atrás de reescribir.

Filtros
  --antes-de FECHA  Solo paradas creadas antes (3d, 48h o 2026-08-01).
  --viaje UUID      Solo un viaje.
  --limite N        Corta después de N.

Sin --apply, todo lo que escribiría se limita a contarlo por pantalla.
Instrucciones completas: scripts/README.md
`

async function main() {
  await cargarEnv()
  const o = argumentos()
  if (!o.comando || o.comando === '--help' || o.comando === '-h') {
    console.log(AYUDA)
    Deno.exit(0)
  }

  const supabaseUrl = env('SUPABASE_URL').replace(/\/+$/, '')
  const supa = createClient(supabaseUrl, env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false },
  })

  // El cliente de R2 solo hace falta para los comandos que lo tocan: `medir` y
  // `revertir` funcionan sin credenciales de Cloudflare, y eso permite medir
  // antes de tener nada montado.
  const necesitaR2 = ['copiar', 'verificar', 'reescribir', 'borrar-supabase'].includes(o.comando)
  const r2 = necesitaR2
    ? clienteR2({
        accountId: env('R2_ACCOUNT_ID'),
        accessKeyId: env('R2_ACCESS_KEY_ID'),
        secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
        bucket: env('R2_BUCKET'),
        jurisdiction: env('R2_JURISDICTION', false) || undefined,
      })
    : (null as unknown as R2)

  switch (o.comando) {
    case 'medir': await medir(supa, o); break
    case 'copiar': await copiar(supa, r2, o, supabaseUrl); break
    case 'verificar': await verificar(supa, r2, o); break
    case 'reescribir': await reescribir(supa, r2, o); break
    case 'comprobar-app':
      await comprobarApp(supa, o, (env('VITE_R2_PUBLIC_URL', false) || env('R2_PUBLIC_URL')).replace(/\/+$/, ''))
      break
    case 'borrar-supabase': await borrarSupabase(supa, r2, o); break
    case 'revertir': await revertir(supa, o, supabaseUrl); break
    default:
      console.error(`\n  Comando desconocido: ${o.comando}`)
      console.log(AYUDA)
      Deno.exit(1)
  }
}

await main()
