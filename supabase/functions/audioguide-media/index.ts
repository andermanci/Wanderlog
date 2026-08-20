// Supabase Edge Function: audioguide-media
// Borra los ficheros de audio de una audioguía (o de un viaje entero) de
// Cloudflare R2, y de paso los que queden del bucket antiguo de Supabase.
//
// POR QUÉ EXISTE: cuando el audio vivía en Supabase Storage, el borrado lo
// hacía el navegador con las políticas RLS del bucket. En R2 no hay RLS y el
// navegador no puede tener credenciales de escritura, así que el borrado tiene
// que pasar por aquí. Va aparte de audioguide-tts porque son verbos distintos
// con comprobaciones distintas, como el resto de funciones del proyecto.
//
// DE PASO ARREGLA UN FALLO QUE VENÍA DE ANTES: el borrado antiguo listaba por
// prefijo `{usuarioQueBorra}/{viaje}/{ámbito}`, pero la ruta lleva el id de
// QUIEN GENERÓ el audio. En un viaje compartido, si lo generaba A y lo borraba
// el editor B, el listado salía vacío: la fila desaparecía y los MP3 de A se
// quedaban en el bucket para siempre, sin nada que los referenciara. Aquí se
// borra por las claves EXACTAS que están escritas en las filas, así que da
// igual quién generara cada una. Y se acabó también el tope de 100 objetos de
// storage.list(), que dejaba restos en audioguías largas.
//
// Deploy: supabase functions deploy audioguide-media
// Secretos: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clienteR2, configR2DelEntorno, r2Delete } from '../_shared/r2.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Storage de Supabase acepta borrados por lotes; 100 no revienta la URL. */
const LOTE = 100
/** Lo que queda en el bucket viejo mientras no termine la migración. */
const PREFIJO_SUPABASE = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/audioguides\//

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
 * Reparte los valores de `audio_url`/`image_url` según dónde vive cada fichero.
 * Lo que apunta a otro sitio (Wikimedia, por ejemplo) no es nuestro: ni se toca.
 */
function repartir(valores: (string | null)[]): { r2: string[]; supabase: string[] } {
  const r2: string[] = []
  const supabase: string[] = []
  for (const v of valores) {
    if (!v) continue
    if (!/^https?:/.test(v)) r2.push(v)
    else if (PREFIJO_SUPABASE.test(v)) supabase.push(v.replace(PREFIJO_SUPABASE, '').split('?')[0])
  }
  return { r2, supabase }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const cfgR2 = configR2DelEntorno()
    if (!cfgR2) return json({ error: 'Falta la configuración de R2' }, 500)

    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !user) return json({ error: 'No autenticado' }, 401)

    const { action, audioguideId, tripId } = await req.json().catch(() => ({}))

    // Qué viaje hay que poder editar, y de qué filas hay que sacar las claves.
    let tripObjetivo: string
    let filtro: { columna: 'audioguide_id' | 'trip_id'; valor: string }

    if (action === 'delete-audioguide') {
      if (typeof audioguideId !== 'string' || !audioguideId) {
        return json({ error: 'Falta audioguideId' }, 400)
      }
      // Con el cliente del usuario: `has_trip_access` decide si esta audioguía
      // existe para él. Una de un viaje ajeno simplemente no aparece.
      const { data: guia } = await userClient
        .from('audioguides')
        .select('id, trip_id')
        .eq('id', audioguideId)
        .maybeSingle()
      if (!guia) return json({ error: 'Audioguía no encontrada' }, 404)
      tripObjetivo = guia.trip_id
      filtro = { columna: 'audioguide_id', valor: audioguideId }
    } else if (action === 'delete-trip') {
      if (typeof tripId !== 'string' || !tripId) return json({ error: 'Falta tripId' }, 400)
      const { data: viaje } = await userClient
        .from('trips')
        .select('id')
        .eq('id', tripId)
        .maybeSingle()
      if (!viaje) return json({ error: 'Viaje no encontrado' }, 404)
      tripObjetivo = tripId
      filtro = { columna: 'trip_id', valor: tripId }
    } else {
      return json({ error: 'action debe ser delete-audioguide o delete-trip' }, 400)
    }

    // Ver no es borrar. Misma función que usan las políticas de escritura.
    const { data: puedeEditar } = await userClient.rpc('can_edit_trip', { p_trip_id: tripObjetivo })
    if (puedeEditar !== true) return json({ error: 'No autorizado' }, 403)

    // A partir de aquí, service role: hay que ver TODAS las paradas, incluidas
    // las que generó otro miembro del viaje. El permiso ya está comprobado.
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const { data: stops, error: stopsErr } = await admin
      .from('audioguide_stops')
      .select('id, audio_url')
      .eq(filtro.columna, filtro.valor)
    if (stopsErr) return json({ error: `No se pudieron leer las paradas: ${stopsErr.message}` }, 500)

    const { r2: clavesR2, supabase: rutasSupabase } = repartir((stops ?? []).map((s) => s.audio_url))

    // Los ficheros, ANTES que las filas. Si algo falla se aborta sin borrar la
    // fila: mejor una audioguía que sigue ahí, y que se puede reintentar, que
    // un huérfano permanente que ya nadie sabe que existe. Es la misma doctrina
    // que documenta admin-delete-user.
    const fallos: string[] = []
    if (clavesR2.length > 0) {
      const res = await r2Delete(clienteR2(cfgR2), clavesR2)
      fallos.push(...res.fallos)
    }
    for (let i = 0; i < rutasSupabase.length; i += LOTE) {
      const lote = rutasSupabase.slice(i, i + LOTE)
      // Con service role a propósito: las políticas del bucket solo dejaban
      // borrar al dueño de la carpeta, que es justo el fallo que se arregla.
      const { error } = await admin.storage.from('audioguides').remove(lote)
      if (error) fallos.push(`supabase: ${error.message}`)
    }
    if (fallos.length > 0) {
      return json({ error: 'No se pudieron borrar todos los audios', fallos }, 502)
    }

    // Y ahora las filas. Las paradas caen por ON DELETE CASCADE (027).
    if (action === 'delete-audioguide') {
      const { error } = await userClient.from('audioguides').delete().eq('id', audioguideId)
      if (error) return json({ error: `No se pudo borrar la audioguía: ${error.message}` }, 500)
    }
    // En 'delete-trip' NO se borran filas: lo hará la cascada del viaje. Aquí
    // solo interesa que los ficheros no se queden sueltos en R2.

    return json({
      borrados: clavesR2.length + rutasSupabase.length,
      enR2: clavesR2.length,
      enSupabase: rutasSupabase.length,
    })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Error desconocido' }, 500)
  }
})
