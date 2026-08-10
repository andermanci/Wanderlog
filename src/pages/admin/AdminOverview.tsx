import { Link } from 'react-router-dom'
import { Users, Map, BarChart3, Activity, ScrollText, type LucideIcon } from 'lucide-react'
import { useAdminMetrics } from '@/lib/queries/admin'
import { AdminHeader, Dato, TablaSkeleton } from '@/components/admin/AdminShell'
import { formatBytes } from '@/lib/formatBytes'
import { STATUS_LABELS } from '@/lib/utils'

const ATAJOS: { to: string; icon: LucideIcon; titulo: string; texto: string }[] = [
  { to: '/admin/usuarios', icon: Users, titulo: 'Usuarios', texto: 'Quién está registrado y qué puede hacer.' },
  { to: '/admin/viajes', icon: Map, titulo: 'Viajes', texto: 'Todos los viajes y cuánto ocupan.' },
  { to: '/admin/visitas', icon: BarChart3, titulo: 'Visitas', texto: 'Cuánta gente entra y qué mira.' },
  { to: '/admin/eventos', icon: Activity, titulo: 'Eventos', texto: 'Qué se usa, incluido lo que cuesta dinero.' },
  { to: '/admin/auditoria', icon: ScrollText, titulo: 'Auditoría', texto: 'Todo lo que se hace desde aquí.' },
]

export function AdminOverviewPage() {
  const { data: m, isLoading } = useAdminMetrics(30)

  const almacenamiento = Object.values(m?.almacenamiento ?? {}).reduce((s, n) => s + n, 0)

  return (
    <div>
      <AdminHeader titulo="Resumen" subtitulo="Las cifras de la plataforma. Los «nuevos» son de los últimos 30 días." />

      {isLoading || !m ? (
        <TablaSkeleton filas={2} />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Dato valor={m.usuarios} etiqueta="Personas registradas"
              sub={`${m.usuarios_nuevos} nuevas · ${m.usuarios_con_viaje} con algún viaje`} />
            <Dato valor={m.viajes} etiqueta="Viajes" sub={`${m.viajes_nuevos} nuevos`} />
            <Dato valor={m.actividades} etiqueta="Actividades" sub={`${m.gastos} gastos apuntados`} />
            <Dato valor={formatBytes(almacenamiento)} etiqueta="Almacenamiento"
              sub={`${m.fotos} fotos · ${m.documentos} documentos`} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
            <Dato valor={m.audioguias} etiqueta="Audioguías generadas" sub="cada una cuesta dinero" />
            <Dato valor={m.colaboraciones} etiqueta="Viajes compartidos"
              sub={`${m.invitaciones_pendientes} sin aceptar`} />
            {Object.entries(m.viajes_por_estado).slice(0, 2).map(([estado, n]) => (
              <Dato key={estado} valor={n} etiqueta={STATUS_LABELS[estado] ?? estado} />
            ))}
          </div>

          {m.top_destinos.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
                Adónde va la gente
              </h3>
              <ul className="space-y-1.5">
                {m.top_destinos.map(d => (
                  <li key={d.destino} className="flex items-center justify-between gap-4 text-sm px-4 py-2 rounded-xl surface">
                    <span className="truncate">{d.destino}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">
                      {d.n} viaje{d.n === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-3">
              Almacenamiento por sitio
            </h3>
            <ul className="space-y-1.5">
              {Object.entries(m.almacenamiento)
                .sort((a, b) => b[1] - a[1])
                .map(([bucket, bytes]) => (
                  <li key={bucket} className="flex items-center justify-between gap-4 text-sm px-4 py-2 rounded-xl surface">
                    <span className="truncate">{bucket}</span>
                    <span className="tabular-nums text-muted-foreground shrink-0">{formatBytes(bytes)}</span>
                  </li>
                ))}
            </ul>
          </section>
        </>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
        {ATAJOS.map(({ to, icon: Icon, titulo, texto }) => (
          <Link key={to} to={to}
            className="p-5 rounded-xl surface flex items-start gap-3 transition-colors hover:border-primary">
            <Icon size={18} className="mt-0.5 shrink-0" style={{ color: 'var(--primary)' }} aria-hidden="true" />
            <div>
              <p className="font-serif text-lg">{titulo}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{texto}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
