import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { eachDayOfInterval, parseISO, format, addDays, differenceInCalendarDays } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { itineraryKeys } from '@/lib/queries/itinerary'
import { limitKeys } from '@/lib/queries/limits'
import { bloqueoParaCrearViaje, type UserLimits } from '@/lib/limits'
import type { Trip } from '@/types/database'
import { toast } from 'sonner'

// Sincroniza los días del itinerario con el nuevo rango de fechas del viaje.
// Si cambia la fecha de inicio y `shiftItinerary`, primero DESPLAZA en bloque
// todos los días existentes ese mismo número de días (mismo id de día, solo
// cambia `date`): como las actividades referencian el id del día (no la fecha),
// todo el itinerario "viaja" junto automáticamente sin tocar una sola actividad.
// Sin `shiftItinerary`, los días se quedan en su fecha absoluta y las
// actividades no se mueven: es el usuario quien elige (ver TripFormDialog).
// Después, en ambos casos: añade los días que falten al nuevo rango y borra los
// que sobren SIN actividades (los que tienen se conservan, avisando).
async function reconcileItineraryDays(
  tripId: string,
  oldStartDate: string,
  newStartDate: string,
  newEndDate: string,
  shiftItinerary: boolean,
) {
  const { data: existing } = await supabase
    .from('itinerary_days').select('id, date').eq('trip_id', tripId)

  const deltaDays = shiftItinerary
    ? differenceInCalendarDays(parseISO(newStartDate), parseISO(oldStartDate))
    : 0
  if (deltaDays !== 0 && existing?.length) {
    // Se actualiza uno a uno, en el orden que evita chocar con la restricción
    // unique(trip_id, date): si el viaje se retrasa, primero el día más
    // tardío (su nueva fecha no puede coincidir con la de otro aún sin
    // mover); si se adelanta, al revés.
    const ordered = [...existing].sort((a, b) =>
      deltaDays > 0 ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date))
    for (const day of ordered) {
      const newDate = format(addDays(parseISO(day.date), deltaDays), 'yyyy-MM-dd')
      await supabase.from('itinerary_days').update({ date: newDate }).eq('id', day.id)
    }
  }

  const want = eachDayOfInterval({ start: parseISO(newStartDate), end: parseISO(newEndDate) })
    .map(d => format(d, 'yyyy-MM-dd'))
  const wantSet = new Set(want)

  const { data: afterShift } = await supabase
    .from('itinerary_days').select('id, date').eq('trip_id', tripId)
  const existingDates = new Set((afterShift ?? []).map(d => d.date))

  const toAdd = want.filter(d => !existingDates.has(d)).map(date => ({ trip_id: tripId, date, notes: null }))
  if (toAdd.length) {
    await supabase.from('itinerary_days').upsert(toAdd, { onConflict: 'trip_id,date' })
  }

  const outside = (afterShift ?? []).filter(d => !wantSet.has(d.date))
  if (outside.length) {
    const { data: acts } = await supabase
      .from('activities').select('day_id, end_day_id').eq('trip_id', tripId)
    const usedDays = new Set<string>()
    ;(acts ?? []).forEach(a => { usedDays.add(a.day_id); if (a.end_day_id) usedDays.add(a.end_day_id) })
    const deletable = outside.filter(d => !usedDays.has(d.id)).map(d => d.id)
    if (deletable.length) await supabase.from('itinerary_days').delete().in('id', deletable)
    const kept = outside.length - deletable.length
    if (kept > 0) toast.warning(`${kept} día${kept > 1 ? 's' : ''} fuera del nuevo rango con actividades: se han conservado.`)
  }
}

export const tripKeys = {
  all: ['trips'] as const,
  lists: () => [...tripKeys.all, 'list'] as const,
  detail: (id: string) => [...tripKeys.all, 'detail', id] as const,
}

export function useTrips() {
  const { user } = useAuthStore()
  return useQuery({
    queryKey: tripKeys.lists(),
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .order('start_date', { ascending: true })
      if (error) throw error
      return data
    },
  })
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: tripKeys.detail(id),
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
  })
}

export function useCreateTrip() {
  const qc = useQueryClient()
  return useMutation({
    // default_currency es opcional al crear: la BD aplica 'EUR' por defecto.
    mutationFn: async (values: Omit<Trip, 'id' | 'user_id' | 'created_at' | 'default_currency'> & { default_currency?: string }) => {
      // getSession es rápido (no hace red salvo que el token esté caducado,
      // y entonces refresca vía processLock sin colgarse).
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) throw new Error('SESSION_EXPIRED')

      // Timeout duro: si la petición se queda colgada, fallamos en vez de
      // dejar el spinner girando para siempre.
      const insert = supabase
        .from('trips')
        .insert({ ...values, user_id: session.user.id })
        .select()
        .single()
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('TIMEOUT')), 15000)
      )
      const { data, error } = await Promise.race([insert, timeout])
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() })
      toast.success('Viaje creado correctamente')
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : ''
      const code = (err as { code?: string })?.code

      // Desde la migración 050, un 42501 al crear un viaje significa DOS cosas
      // distintas: la sesión caducó, o la cuenta tiene un límite. Sin esto, a
      // quien ha llegado a su tope se le diría que vuelva a iniciar sesión, y
      // volvería a fallar igual. Los límites mandan porque son la única causa
      // que sabemos nombrar; si no hay ninguno, es la sesión.
      if (code === '42501') {
        const limites = qc.getQueryData<UserLimits>(limitKeys.mine())
        const viajes = qc.getQueryData<Trip[]>(tripKeys.lists())?.length ?? 0
        const bloqueo = bloqueoParaCrearViaje(limites, viajes)
        if (bloqueo) { toast.error(bloqueo); return }
      }

      if (msg === 'SESSION_EXPIRED' || code === '42501') {
        toast.error('Tu sesión ha caducado. Recarga la página o vuelve a iniciar sesión.')
      } else if (msg === 'TIMEOUT') {
        toast.error('La operación tardó demasiado. Comprueba tu conexión e inténtalo de nuevo.')
      } else {
        toast.error('Error al crear el viaje')
      }
    },
  })
}

export function useUpdateTrip() {
  const qc = useQueryClient()
  return useMutation({
    // `shiftItinerary` decide qué pasa con las actividades cuando se mueven las
    // fechas: true (por defecto) las adapta desplazando los días en bloque;
    // false las deja en su fecha actual.
    mutationFn: async ({ id, shiftItinerary = true, ...values }: Partial<Trip> & { id: string, shiftItinerary?: boolean }) => {
      // Si cambian las fechas, hace falta el start_date ANTERIOR para poder
      // desplazar el itinerario en bloque: se pide antes de aplicar el cambio.
      let prevStartDate: string | null = null
      if (values.start_date && values.end_date) {
        const { data: prev } = await supabase.from('trips').select('start_date').eq('id', id).single()
        prevStartDate = prev?.start_date ?? null
      }

      const { data, error } = await supabase
        .from('trips')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      // Si cambian las fechas, reconciliar (y desplazar) los días del itinerario.
      if (values.start_date && values.end_date) {
        await reconcileItineraryDays(
          id, prevStartDate ?? values.start_date, values.start_date, values.end_date, shiftItinerary,
        )
      }
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() })
      qc.invalidateQueries({ queryKey: tripKeys.detail(data.id) })
      qc.invalidateQueries({ queryKey: itineraryKeys.days(data.id) })
      qc.invalidateQueries({ queryKey: itineraryKeys.activities(data.id) })
      // El clima está cacheado por día: si las fechas se movieron, refrescar.
      qc.invalidateQueries({ queryKey: ['weather', data.id] })
      qc.invalidateQueries({ queryKey: ['weather-hourly', data.id] })
      toast.success('Viaje actualizado')
    },
    onError: () => toast.error('Error al actualizar el viaje'),
  })
}

export function useDeleteTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      // Pasa por la edge function y no por un delete a secas: borrar la fila
      // deja los FICHEROS en el storage para siempre, porque las rutas llevan
      // el id de quien subió cada uno y las filas que los referenciaban ya no
      // existen. Con los adjuntos era espacio desperdiciado; con el bucket de
      // documentos son DNI y pasaportes que seguían ahí después de que alguien
      // borrara su viaje. La función enumera, borra el viaje y luego los
      // ficheros, en ese orden.
      const { data, error } = await supabase.functions.invoke('trip-delete', {
        body: { tripId: id },
      })
      if (error || data?.error) throw new Error(data?.error ?? error?.message)
      // Los avisos son ficheros que no se pudieron borrar. El viaje SÍ se ha
      // borrado, así que para quien lo pidió la operación ha salido bien; los
      // restos los recoge scripts/limpiar-attachments.ts.
      if (data?.avisos?.length) console.warn('[trip-delete] restos sin borrar:', data.avisos)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() })
      toast.success('Viaje eliminado')
    },
    onError: () => toast.error('Error al eliminar el viaje'),
  })
}

// Duplica el viaje (itinerario, días y guías del destino) vía RPC: la
// función en BD hace todo el remapeo de ids en una sola transacción.
export function useDuplicateTrip() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('duplicate_trip', { p_trip_id: id })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: tripKeys.lists() })
      toast.success('Viaje duplicado')
    },
    onError: () => toast.error('No se pudo duplicar el viaje'),
  })
}
