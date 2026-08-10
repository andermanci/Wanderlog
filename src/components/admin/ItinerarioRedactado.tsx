import { EyeOff, MapPin, Paperclip, Check } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, ACTIVITY_LABELS, ACTIVITY_COLORS } from '@/lib/utils'
import type { AdminItineraryRow } from '@/types/database'

// El itinerario tal y como puede verlo quien administra: la forma del viaje,
// sin lo que escribió su dueño.
//
// Lo que NO se muestra no es una decisión de esta pantalla, es que la RPC
// `admin_trip_itinerary` no lo devuelve: descripciones, notas, diario,
// coordenadas, enlaces y precios no llegan siquiera al navegador. De las
// notas y el diario solo llega CUÁNTO se escribió, que es lo que sirve para
// diagnosticar («este día tiene 4.000 caracteres y no carga»).

function agruparPorDia(filas: AdminItineraryRow[]) {
  const dias = new Map<string, { fila: AdminItineraryRow; actividades: AdminItineraryRow[] }>()
  for (const f of filas) {
    let d = dias.get(f.day_id)
    if (!d) { d = { fila: f, actividades: [] }; dias.set(f.day_id, d) }
    // Un día sin actividades llega como una fila con los campos de actividad
    // a null (es un left join): no es una actividad, es un día vacío.
    if (f.activity_id) d.actividades.push(f)
  }
  return [...dias.values()]
}

export function ItinerarioRedactado({ filas, cargando }: {
  filas: AdminItineraryRow[] | undefined
  cargando: boolean
}) {
  if (cargando) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" style={{ background: 'var(--secondary)' }} />
        ))}
      </div>
    )
  }

  const dias = agruparPorDia(filas ?? [])

  return (
    <div>
      <div className="flex items-start gap-2.5 p-3 rounded-xl surface mb-4">
        <EyeOff size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} aria-hidden="true" />
        <p className="text-xs text-muted-foreground">
          El contenido personal de este viaje no se muestra: ni el diario, ni las descripciones,
          ni las notas, ni los documentos, ni las fotos, ni los importes. De las notas y el diario
          solo se ve cuánto se escribió.
        </p>
      </div>

      {!dias.length ? (
        <p className="text-sm text-muted-foreground">Este viaje todavía no tiene días en el itinerario.</p>
      ) : (
        <ol className="space-y-3">
          {dias.map(({ fila: d, actividades }) => (
            <li key={d.day_id} className="p-4 rounded-xl surface">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-3">
                <h4 className="font-serif text-lg">{formatDate(d.day_date, "EEEE d 'de' MMMM")}</h4>
                <p className="text-xs text-muted-foreground">
                  {actividades.length} actividad{actividades.length === 1 ? '' : 'es'}
                  {d.day_cities > 0 && <> · {d.day_cities} ciudad{d.day_cities === 1 ? '' : 'es'}</>}
                  {d.has_journal && <> · diario de {d.journal_chars} caracteres</>}
                  {d.notes_chars > 0 && <> · notas de {d.notes_chars} caracteres</>}
                </p>
              </div>

              {!actividades.length ? (
                <p className="text-sm text-muted-foreground">Día sin actividades.</p>
              ) : (
                <ul className="space-y-1.5">
                  {actividades.map(a => (
                    <li key={a.activity_id} className="flex items-start gap-3 text-sm">
                      <span className="w-12 shrink-0 tabular-nums text-muted-foreground pt-0.5">
                        {a.start_time ? a.start_time.slice(0, 5) : '—'}
                      </span>
                      <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                        style={{ background: ACTIVITY_COLORS[a.activity_type ?? 'other'] }} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className={a.done ? 'line-through text-muted-foreground' : ''}>{a.title}</span>
                          {a.done && <Check size={13} className="text-muted-foreground shrink-0" aria-label="Hecha" />}
                          {a.has_coords && <MapPin size={12} className="text-muted-foreground shrink-0" aria-label="Con coordenadas" />}
                          {!!a.attachments && (
                            <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                              <Paperclip size={11} aria-hidden="true" />{a.attachments}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground block">
                          {ACTIVITY_LABELS[a.activity_type ?? 'other'] ?? a.activity_type}
                          {a.address && <> · {a.address}</>}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
