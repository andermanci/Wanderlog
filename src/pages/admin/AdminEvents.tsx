import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { Button } from '@/components/ui/button'
import { AdminHeader, Dato, TablaSkeleton } from '@/components/admin/AdminShell'
import { EmptyState } from '@/components/EmptyState'
import { useAdminEvents } from '@/lib/queries/admin'
import { formatDate } from '@/lib/utils'

const VENTANAS = [7, 30, 90]

// Nombres legibles. Un mapa explícito, no un formateo automático del
// identificador: esto se lee para decidir cosas, y «ai.audioguide_tts» obliga a
// traducir mentalmente cada vez.
const NOMBRES: Record<string, string> = {
  'trip.created': 'Crearon un viaje',
  'activity.created': 'Añadieron una actividad',
  'expense.added': 'Apuntaron un gasto',
  'document.uploaded': 'Subieron un documento',
  'collaborator.invited': 'Invitaron a alguien',
  'invite.accepted': 'Aceptaron una invitación',
  'trip.offline_downloaded': 'Descargaron un viaje',
  'trip.offline_deleted': 'Borraron la copia sin conexión',
  'ics.imported': 'Importaron un .ics',
  'pwa.installed': 'Instalaron la aplicación',
  'push.subscribed': 'Activaron los avisos',
  'audioguide.played': 'Escucharon una audioguía',
  'audioguide.map_opened': 'Abrieron el mapa de una audioguía',
  'ai.audioguide_tts': 'Generaron audio (Google TTS)',
  'ai.import': 'Importaron un sitio (Gemini)',
}

const esIA = (e: string) => e.startsWith('ai.')

export function AdminEventsPage() {
  const [dias, setDias] = useState(30)
  const { data, isLoading } = useAdminEvents(dias)

  return (
    <div>
      <AdminHeader
        titulo="Eventos"
        subtitulo="Qué se usa de verdad. Los que empiezan por IA cuestan dinero."
      >
        <div className="flex gap-1">
          {VENTANAS.map(d => (
            <Button key={d} size="sm" variant={d === dias ? 'brand' : 'outline'}
              onClick={() => setDias(d)}>{d} días</Button>
          ))}
        </div>
      </AdminHeader>

      {isLoading || !data ? (
        <TablaSkeleton filas={3} />
      ) : !data.total ? (
        <EmptyState
          icon={Activity}
          title="Sin eventos todavía"
          description="Se registran solos a medida que se use la aplicación. Si llevas días con tráfico y esto sigue vacío, revisa que la migración 052 esté aplicada."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <Dato valor={data.total} etiqueta="Acciones registradas" />
            <Dato valor={data.personas} etiqueta="Personas distintas" />
            <Dato
              valor={data.porEvento.filter(e => esIA(e.evento)).reduce((s, e) => s + e.n, 0)}
              etiqueta="Usos de IA"
              sub="cada uno se factura"
            />
          </div>

          {data.porDia.length > 1 && (
            <section className="mt-8">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
                Por día
              </h3>
              <div className="p-4 rounded-xl surface">
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={data.porDia} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id="gradEventos" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="dia" tickLine={false} axisLine={false} minTickGap={24}
                      tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }}
                      tickFormatter={(d: string) => formatDate(d, 'd MMM')} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--card)', border: '1px solid var(--border)',
                        borderRadius: 12, fontSize: 12,
                      }}
                      labelFormatter={(d: unknown) => formatDate(String(d), "EEEE d 'de' MMMM")}
                      formatter={(v: unknown) => [Number(v), 'acciones']}
                    />
                    <Area type="monotone" dataKey="n" stroke="var(--primary)"
                      strokeWidth={2} fill="url(#gradEventos)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}

          {data.gastoIA.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
                Quién gasta la cuota de IA
              </h3>
              <ul className="space-y-1">
                {data.gastoIA.map(u => (
                  <li key={u.user_id}>
                    <Link to={`/admin/usuarios/${u.user_id}`}
                      className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl surface text-sm transition-colors hover:border-primary">
                      <span className="truncate">{u.email ?? 'cuenta borrada'}</span>
                      <span className="tabular-nums text-muted-foreground shrink-0">
                        {u.usos} usos · {u.unidades.toLocaleString('es-ES')} unidades
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">
                «Unidades» son caracteres sintetizados en las audioguías (que es como
                factura Google) y llamadas en el resto. Desde la ficha de cada persona
                puedes quitarle las funciones con IA.
              </p>
            </section>
          )}

          <section className="mt-8">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
              Qué se hace
            </h3>
            <ul className="space-y-1">
              {data.porEvento.map(e => (
                <li key={e.evento}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 rounded-xl surface text-sm">
                  <span className="truncate">
                    {NOMBRES[e.evento] ?? e.evento}
                    {esIA(e.evento) && (
                      <span className="ml-2 text-xs" style={{ color: 'var(--primary)' }}>€</span>
                    )}
                  </span>
                  <span className="tabular-nums text-muted-foreground shrink-0">
                    {e.n} · {e.personas} persona{e.personas === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-xs text-muted-foreground mt-8">
            Lo que se corresponde con una fila de la base lo registra un disparador y
            no se puede falsear. Lo que no deja huella —descargar un viaje, instalar la
            aplicación— lo manda el navegador, así que alguien podría inflar sus propios
            contadores; los de coste van todos por el servidor. Nunca se guardan importes
            ni el contenido de nada. Se conservan un año.
          </p>
        </>
      )}
    </div>
  )
}
