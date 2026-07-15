import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Wallet, FileText } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { TripHeader } from '@/components/trips/TripHeader'
import { DocLightbox } from '@/components/documents/DocLightbox'
import { WalletPassCard, type WalletPass } from '@/components/wallet/WalletPassCard'
import { useDocuments } from '@/lib/queries/documents'
import { useTripAttachments } from '@/lib/queries/attachments'
import { useActivities } from '@/lib/queries/itinerary'
import { PERSONAL_DOC_CATEGORIES } from '@/lib/utils'

// Los adjuntos del itinerario heredan un tipo de reserva del tipo de actividad,
// para el icono y el color (igual que en la página de Documentos).
const ACTIVITY_TO_CATEGORY: Record<string, string> = {
  flight: 'flight', hotel: 'hotel', transport: 'transfer',
  restaurant: 'restaurant', activity: 'ticket', place: 'ticket', other: 'other',
}

function isPdfValue(value: string, mime?: string | null): boolean {
  if (mime) return mime === 'application/pdf'
  return /\.pdf(\?|$)/i.test(value)
}

// Los que aún no tienen fecha van al final del wallet.
const NO_DATE = '￿'

export function WalletPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: documents, isLoading: loadingDocs } = useDocuments(tripId!)
  const { data: attachments, isLoading: loadingAtt } = useTripAttachments(tripId!)
  const { data: activities } = useActivities(tripId!)
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  const passes = useMemo<WalletPass[]>(() => {
    const activityById = new Map((activities ?? []).map(a => [a.id, a]))

    // Reservas (tabla documents): vuelos, hoteles, entradas… con localizador,
    // confirmación o billete adjunto. Sin identidad personal ni seguros.
    const fromDocs: (WalletPass & { sort: string })[] = (documents ?? [])
      .filter(d => !PERSONAL_DOC_CATEGORIES.includes(d.category) && d.category !== 'insurance')
      .filter(d => d.file_url || d.locator || d.confirmation_number || d.link)
      .map(d => {
        const code = d.locator || d.confirmation_number || null
        const codeLabel = d.locator ? 'Localizador' : d.confirmation_number ? 'Confirmación' : null
        const title = d.provider || d.title
        return {
          id: `doc-${d.id}`,
          category: d.category,
          title,
          code,
          codeLabel,
          link: d.link,
          start: d.datetime_start,
          end: d.datetime_end,
          origin: d.origin,
          destination: d.destination,
          seat: d.seat,
          attachment: d.file_url
            ? { value: d.file_url, isPdf: isPdfValue(d.file_url), name: title }
            : null,
          sort: d.datetime_start || NO_DATE,
        }
      })

    // Adjuntos del itinerario (entradas/QRs subidos a una actividad): son billetes
    // escaneables por definición.
    const fromAtt: (WalletPass & { sort: string })[] = (attachments ?? []).map(att => {
      const activity = activityById.get(att.activity_id)
      const category = ACTIVITY_TO_CATEGORY[activity?.type ?? 'other'] ?? 'other'
      const title = activity?.title || att.name
      return {
        id: `att-${att.id}`,
        category,
        title,
        code: null,
        codeLabel: null,
        link: null,
        // activities.start_time es solo la hora (sin fecha), así que no vale como
        // fecha del pase; los adjuntos van sin fecha, al final.
        start: null,
        end: null,
        origin: activity?.origin ?? null,
        destination: activity?.destination ?? null,
        seat: null,
        attachment: { value: att.file_url, isPdf: isPdfValue(att.file_url, att.mime), name: att.name },
        sort: NO_DATE,
      }
    })

    return [...fromDocs, ...fromAtt]
      .sort((a, b) => a.sort.localeCompare(b.sort))
      .map(({ sort: _sort, ...pass }) => pass)
  }, [documents, attachments, activities])

  const isLoading = loadingDocs || loadingAtt

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      <TripHeader tripId={tripId!} section="Wallet" />
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-medium flex items-center gap-2">
          <Wallet size={22} style={{ color: 'var(--primary)' }} /> Wallet
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Tus reservas y billetes a mano: enseña el QR o el código de un vistazo.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-72 w-full rounded-2xl" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : !passes.length ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <FileText size={28} className="mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm text-muted-foreground mb-1">Aún no hay reservas con código o billete.</p>
          <p className="text-sm text-muted-foreground">
            Añádelas en{' '}
            <Link to={`/trips/${tripId}/documents`} className="font-medium" style={{ color: 'var(--primary)' }}>
              Documentos
            </Link>{' '}
            (localizador, confirmación o billete adjunto) y aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {passes.map((pass, i) => (
            <WalletPassCard key={pass.id} pass={pass} index={i}
              onOpenAttachment={(url, name) => setLightbox({ url, name })} />
          ))}
        </div>
      )}

      <DocLightbox
        open={!!lightbox}
        onOpenChange={(o) => !o && setLightbox(null)}
        url={lightbox?.url ?? null}
        name={lightbox?.name ?? ''}
      />
    </div>
  )
}
