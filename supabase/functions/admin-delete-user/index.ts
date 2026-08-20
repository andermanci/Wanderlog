// Supabase Edge Function: admin-delete-user
//
// Borra una cuenta y todo lo suyo. Va aquí y no en Netlify porque hacen falta
// dos cosas que solo tiene el service_role de Supabase: la Admin API de auth y
// el borrado en Storage.
//
// Patrón del repo: cliente de USUARIO con su JWT para VERIFICAR quién llama,
// cliente service-role para ACTUAR.
//
// EL ORDEN IMPORTA Y NO ES ARBITRARIO:
//
//   1. Verificar que quien llama es admin, con SU token. Nunca con un id que
//      venga en el cuerpo.
//   2. Negarse a borrarse a uno mismo y a borrar a otro administrador. Son las
//      dos formas de dejar la plataforma sin dueño.
//   3. Dejar rastro ANTES de tocar nada: si esto se cae a medias, al menos
//      queda escrito que se intentó y sobre quién.
//   4. Anonimizar la telemetría (no borrarla).
//   5. Reasignar `invited_by` → dueño del viaje. SIN ESTO, borrar a alguien
//      echa de viajes ajenos a las personas que esa persona invitó.
//   6. Borrar sus filas de trip_collaborators, por user_id Y por email: la FK
//      es ON DELETE SET NULL, así que sin esto su correo se queda escrito en
//      viajes de terceros con la invitación resucitable.
//   7. Borrar sus ficheros. ANTES que la cuenta: si se borrara la cuenta
//      primero y fallara Storage, quedarían ficheros huérfanos bajo el prefijo
//      de un usuario que ya no existe, imposibles de reclamar. Al revés, si
//      fallan los ficheros se aborta y la cuenta sigue intacta — un estado
//      recuperable. Una cuenta medio vacía durante treinta segundos es mucho
//      menos malo que basura permanente.
//   8. Y ahora sí: auth.users → cascada a profiles → trips → las tablas hijas.
//
// ESTO NO ES ATÓMICO, y conviene saberlo: si falla en el paso 7, los pasos
// 4-6 ya se han hecho. La persona seguiría existiendo pero habría perdido sus
// colaboraciones y su telemetría estaría anonimizada. Reintentar es seguro
// (los tres pasos son idempotentes) y es lo que hay que hacer.
//
// Se aceptó a cambio de que el fallo NO deje ficheros huérfanos, que es el
// único estado del que no se puede volver: un objeto en Storage bajo el
// prefijo de un usuario que ya no existe no se puede reclamar ni auditar.
// Hacer Storage primero evitaría el estado parcial de la base, pero
// destruiría ficheros de una cuenta viva si el resto fallara, que es peor.
//
// Si un día esto se vuelve delicado, la solución es una tabla de trabajos con
// estado, no reordenar los pasos.
//
// Deploy: supabase functions deploy admin-delete-user

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { clienteR2, configR2DelEntorno, r2Delete } from '../_shared/r2.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BUCKETS = ['trip-covers', 'documents', 'avatars', 'attachments', 'audioguides']
/** Storage acepta borrados por lotes; 100 es holgado y no revienta la URL. */
const LOTE = 100

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

interface RutaFichero { bucket_id: string; name: string; bytes: number }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    // 1) Quién llama, según SU token.
    const authHeader = req.headers.get('Authorization') ?? ''
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: yo }, error: userErr } = await userClient.auth.getUser()
    if (userErr || !yo) return json({ error: 'No autenticado' }, 401)

    const { data: soyAdmin } = await userClient.rpc('is_platform_admin')
    if (soyAdmin !== true) return json({ error: 'No autorizado' }, 403)

    const { userId, confirmEmail } = await req.json().catch(() => ({}))
    if (typeof userId !== 'string' || !userId) {
      return json({ error: 'Falta userId' }, 400)
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

    // 2) Las dos negativas.
    if (userId === yo.id) {
      return json({ error: 'No puedes borrar tu propia cuenta desde aquí.' }, 400)
    }
    const { data: esAdmin } = await admin
      .from('app_admins').select('user_id').eq('user_id', userId).maybeSingle()
    if (esAdmin) {
      return json({
        error: 'Esa persona administra la plataforma. Quítale el admin por SQL antes de borrarla.',
      }, 400)
    }

    const { data: perfil } = await admin
      .from('profiles').select('email').eq('id', userId).maybeSingle()
    const email = (perfil?.email ?? '').toLowerCase()

    // El diálogo obliga a escribir el correo completo; se vuelve a comprobar
    // aquí, porque una confirmación que solo vive en el navegador no confirma
    // nada.
    if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== email) {
      return json({ error: 'El correo de confirmación no coincide.' }, 400)
    }

    // 3) Rastro antes de tocar nada.
    await admin.rpc('admin_audit_service', {
      p_admin: yo.id,
      p_action: 'user.delete.start',
      p_target_user: userId,
      p_detail: { email },
    })

    // 4) Telemetría: anonimizar, no borrar.
    //
    // Los errores de estos dos pasos NO se ignoran. Son irreversibles en el
    // sentido contrario: si la reasignación de `invited_by` falla y seguimos,
    // el borrado echa de viajes ajenos a gente que no tiene nada que ver. Un
    // registro de auditoría lleno de ceros silenciosos es peor que no tenerlo,
    // porque parece un dato.
    const { data: anon, error: anonErr } = await admin
      .rpc('admin_anonymize_telemetry', { p_user: userId })
    if (anonErr) throw new Error(`Anonimizando la telemetría: ${anonErr.message}`)

    // 5) El arreglo del invited_by en cascada.
    const { data: reasignadas, error: reasErr } = await admin
      .rpc('admin_reassign_invites', { p_user: userId })
    if (reasErr) throw new Error(`Reasignando invitaciones: ${reasErr.message}`)

    // 6) Sus colaboraciones, por id y por correo.
    const { count: colabs, error: colabErr } = await admin
      .from('trip_collaborators')
      .delete({ count: 'exact' })
      .or(`user_id.eq.${userId}${email ? `,email.eq.${email}` : ''}`)
    if (colabErr) throw new Error(`Borrando colaboraciones: ${colabErr.message}`)

    // 7) Ficheros, en lotes. Si algo falla aquí, se lanza y la cuenta NO se
    //    borra: estado recuperable.
    // Con el cliente DEL USUARIO, no con el service_role: esta RPC lleva
    // `admin_guard()`, que mira `auth.uid()`, y el service_role no tiene
    // ninguno — la llamada fallaría con «No autorizado» por sistema. Quien
    // llama ya se verificó arriba como admin, así que su token vale.
    const { data: rutas, error: rutasErr } = await userClient
      .rpc('admin_user_storage_paths', { p_user: userId })
    if (rutasErr) throw new Error(`No se pudieron listar los ficheros: ${rutasErr.message}`)

    let ficheros = 0
    let bytes = 0
    for (const bucket of BUCKETS) {
      const delBucket = ((rutas ?? []) as RutaFichero[]).filter(r => r.bucket_id === bucket)
      for (let i = 0; i < delBucket.length; i += LOTE) {
        const lote = delBucket.slice(i, i + LOTE)
        const { error } = await admin.storage.from(bucket).remove(lote.map(r => r.name))
        if (error) throw new Error(`Storage ${bucket}: ${error.message}`)
        ficheros += lote.length
        bytes += lote.reduce((s, r) => s + Number(r.bytes ?? 0), 0)
      }
    }

    // 7-bis) El audio de sus viajes, que vive en Cloudflare R2 y por tanto NO
    //    aparece en storage.objects. Se enumera por la base de datos: sus
    //    viajes → las claves escritas en las paradas.
    //
    //    Ojo al cambio de criterio respecto al paso 7, que es deliberado. Los
    //    ficheros de storage se borran por PREFIJO DEL USUARIO, o sea todo lo
    //    que subió esté donde esté. El audio se borra por VIAJES QUE POSEE. Lo
    //    segundo es lo correcto: con el criterio antiguo, borrar a A destruía
    //    el audio que A hubiera generado en un viaje vivo de B, y B se
    //    encontraba una audioguía rota sin haber hecho nada. Ahora coincide
    //    exactamente con lo que se lleva la cascada de auth.users.
    //
    //    Antes de la cuenta, igual que el paso 7: si falla, estado recuperable.
    let audiosBorrados = 0
    const cfgR2 = configR2DelEntorno()
    if (cfgR2) {
      const { data: viajes, error: viajesErr } = await admin
        .from('trips').select('id').eq('user_id', userId)
      if (viajesErr) throw new Error(`Listando viajes: ${viajesErr.message}`)
      const idsViaje = (viajes ?? []).map((t: { id: string }) => t.id)

      if (idsViaje.length > 0) {
        const { data: stops, error: stopsErr } = await admin
          .from('audioguide_stops').select('audio_url').in('trip_id', idsViaje)
        if (stopsErr) throw new Error(`Listando audios: ${stopsErr.message}`)

        // Las filas sin migrar guardan todavía la URL de Supabase: esas ya las
        // ha borrado el paso 7, porque sí están en storage.objects.
        const claves = (stops ?? [])
          .map((s: { audio_url: string | null }) => s.audio_url)
          .filter((v: string | null): v is string => !!v && !/^https?:/.test(v))

        if (claves.length > 0) {
          const res = await r2Delete(clienteR2(cfgR2), claves)
          if (res.fallos.length > 0) {
            throw new Error(`R2: no se pudieron borrar ${res.fallos.length} audios`)
          }
          audiosBorrados = res.borradas
        }
      }
    }

    // 8) Y ahora la cuenta. La cascada se lleva profiles → trips → el resto.
    const { error: delErr } = await admin.auth.admin.deleteUser(userId)
    if (delErr) throw delErr

    await admin.rpc('admin_audit_service', {
      p_admin: yo.id,
      p_action: 'user.delete.done',
      p_target_user: userId,
      p_detail: {
        email, ficheros, bytes,
        audiosR2: audiosBorrados,
        colaboraciones: colabs ?? 0,
        invitacionesReasignadas: reasignadas ?? 0,
        visitasAnonimizadas: (anon as { visitas?: number } | null)?.visitas ?? 0,
        eventosAnonimizados: (anon as { eventos?: number } | null)?.eventos ?? 0,
      },
    })

    return json({ ok: true, ficheros, bytes, audiosR2: audiosBorrados, colaboraciones: colabs ?? 0 })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Error desconocido' }, 500)
  }
})
