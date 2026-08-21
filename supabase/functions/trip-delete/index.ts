// Supabase Edge Function: trip-delete
// Borra un viaje Y sus ficheros. Hasta ahora borrar un viaje era un simple
// `delete from trips`: las filas caían por cascada y los ficheros se quedaban
// en el storage para siempre, sin nada que los referenciara. En la limpieza del
// 20/08/2026 había 87 así, 165 MB.
//
// Y el espacio era lo de menos. Entre esos huérfanos hay DOCUMENTOS
// PERSONALES —DNI, pasaportes— del bucket privado. Que sigan existiendo
// después de que alguien borre su viaje no es un problema de factura, es que
// borrar no borraba.
//
// POR QUÉ NO SE HACE POR PREFIJO: las rutas son `{usuario}/{viaje}/...` con el
// id de QUIEN SUBIÓ cada fichero, no el del dueño del viaje. En un viaje
// compartido, barrer el prefijo del dueño dejaría intactos los ficheros que
// subieron los colaboradores. Es el mismo fallo que tenía el borrado de
// audioguías. Así que se enumera por la BASE DE DATOS, columna a columna, y da
// igual quién subiera qué.
//
// ORDEN: se enumera, se borra la FILA, y solo después los ficheros. Es el orden
// contrario al de admin-delete-user, y a propósito. Allí los ficheros van antes
// porque lo irreversible es la cuenta. Aquí, borrar los ficheros primero y que
// luego fallara el borrado del viaje dejaría un viaje VIVO con las imágenes
// rotas: daño visible. Al revés, lo peor que queda son ficheros huérfanos, que
// no los ve nadie y los recoge scripts/limpiar-attachments.ts.
//
// Deploy: supabase functions deploy trip-delete
// Secretos: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clienteR2, configR2DelEntorno, r2Delete } from '../_shared/r2.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const LOTE = 100
const PUBLICO = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Dónde vive lo que guarda cada columna. Se declara explícitamente y no se
 * adivina mirando el valor, porque las columnas NO son homogéneas: `documents`
 * guarda una ruta desnuda desde que el bucket pasó a privado (migración 037),
 * `audio_url` guarda una clave de R2 desde la mudanza, y el resto guardan la
 * URL pública entera. Adivinar por la forma del valor es justo como se cuela un
 * fichero sin borrar.
 */
const COLUMNAS: { tabla: string; col: string; tipo: 'url' | 'documento' | 'audio' }[] = [
  { tabla: 'trips', col: 'cover_image_url', tipo: 'url' },
  { tabla: 'activities', col: 'cover_image_url', tipo: 'url' },
  { tabla: 'activity_attachments', col: 'file_url', tipo: 'url' },
  { tabla: 'journal_photos', col: 'file_url', tipo: 'url' },
  { tabla: 'destination_guides', col: 'cover_image_url', tipo: 'url' },
  { tabla: 'documents', col: 'file_url', tipo: 'documento' },
  { tabla: 'documents', col: 'back_url', tipo: 'documento' },
  { tabla: 'audioguide_stops', col: 'image_url', tipo: 'url' },
  { tabla: 'audioguide_stops', col: 'audio_url', tipo: 'audio' },
]

interface Cosecha {
  /** bucket de Supabase -> rutas */
  supabase: Map<string, Set<string>>
  /** claves de Cloudflare R2 */
  r2: Set<string>
}

function anotar(c: Cosecha, valor: string | null, tipo: 'url' | 'documento' | 'audio') {
  if (!valor) return
  const enBucket = (bucket: string, ruta: string) => {
    const set = c.supabase.get(bucket) ?? new Set<string>()
    set.add(decodeURIComponent(ruta).split('?')[0])
    c.supabase.set(bucket, set)
  }
  const m = valor.match(PUBLICO)

  if (tipo === 'documento') {
    // Ruta desnuda, o URL pública de las de antes de que el bucket fuera privado.
    if (m) enBucket(m[1], m[2])
    else enBucket('documents', valor.split('?')[0])
    return
  }
  if (tipo === 'audio') {
    // Clave de R2, o URL de Supabase si esta parada aún no se ha migrado.
    if (m) enBucket(m[1], m[2])
    else c.r2.add(valor)
    return
  }
  // URL pública. Si no casa, es de fuera (Wikimedia, por ejemplo): no es
  // nuestra y no se toca.
  if (m) enBucket(m[1], m[2])
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { tripId } = await req.json().catch(() => ({}))
    if (typeof tripId !== 'string' || !tripId) return json({ error: 'Falta tripId' }, 400)

    // Service role para enumerar: hay que ver los ficheros que subieron TODOS
    // los miembros del viaje, no solo los de quien borra. El permiso lo decide
    // el paso siguiente, con las políticas RLS.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    const cosecha: Cosecha = { supabase: new Map(), r2: new Set() }
    for (const { tabla, col, tipo } of COLUMNAS) {
      const filtro = tabla === 'trips' ? 'id' : 'trip_id'
      const { data, error } = await admin.from(tabla).select(col).eq(filtro, tripId)
      if (error) return json({ error: `Enumerando ${tabla}.${col}: ${error.message}` }, 500)
      for (const fila of data ?? []) anotar(cosecha, (fila as unknown as Record<string, string | null>)[col], tipo)
    }

    // AHORA el viaje, y con el cliente DEL USUARIO: que autorice `trips_delete_own`
    // (solo el dueño, y no si está suspendido) en vez de reimplementar la regla
    // aquí. Si no le deja, borra 0 filas y no se ha tocado ningún fichero.
    const { data: borradas, error: delErr } = await userClient
      .from('trips').delete().eq('id', tripId).select('id')
    if (delErr) return json({ error: `No se pudo borrar el viaje: ${delErr.message}` }, 500)
    if (!borradas || borradas.length === 0) {
      return json({ error: 'No autorizado o el viaje ya no existe' }, 403)
    }

    // Y por último los ficheros. A partir de aquí nada puede "fallar" de forma
    // que el usuario tenga que reintentar: el viaje ya no está, que es lo que
    // pidió. Lo que no se pueda borrar se queda huérfano y lo recoge el script
    // de limpieza, así que se informa pero no se devuelve error.
    const avisos: string[] = []
    let ficheros = 0

    for (const [bucket, rutas] of cosecha.supabase) {
      const lista = [...rutas]
      for (let i = 0; i < lista.length; i += LOTE) {
        const lote = lista.slice(i, i + LOTE)
        const { error } = await admin.storage.from(bucket).remove(lote)
        if (error) avisos.push(`${bucket}: ${error.message}`)
        else ficheros += lote.length
      }
    }

    if (cosecha.r2.size > 0) {
      const cfg = configR2DelEntorno()
      if (!cfg) avisos.push('R2 sin configurar: el audio se queda')
      else {
        const res = await r2Delete(clienteR2(cfg), [...cosecha.r2])
        ficheros += res.borradas
        if (res.fallos.length > 0) avisos.push(`R2: ${res.fallos.length} audios sin borrar`)
      }
    }

    return json({ ok: true, ficheros, avisos })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
