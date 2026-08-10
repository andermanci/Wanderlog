import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useSetLimits } from '@/lib/queries/admin'
import type { AdminUserRow } from '@/types/database'

const PERMISOS: { campo: PermisoBool; etiqueta: string; ayuda: string }[] = [
  { campo: 'can_create_trips', etiqueta: 'Crear viajes nuevos', ayuda: 'Los que ya tiene siguen siendo suyos.' },
  { campo: 'can_share_trips', etiqueta: 'Compartir viajes', ayuda: 'Invitar a otras personas a sus viajes.' },
  { campo: 'can_use_ai', etiqueta: 'Funciones con IA', ayuda: 'Audioguías e importar sitios: cada uso cuesta dinero.' },
]

type PermisoBool = 'can_create_trips' | 'can_share_trips' | 'can_use_ai'

export function LimitsEditor({ u }: { u: AdminUserRow }) {
  const setLimits = useSetLimits()

  // Estado local para poder cambiar varias cosas y guardar una sola vez: con
  // guardado inmediato por interruptor, quitar tres permisos serían tres
  // entradas en la auditoría de algo que fue una sola decisión.
  const [form, setForm] = useState({
    can_create_trips: u.can_create_trips,
    can_share_trips: u.can_share_trips,
    can_use_ai: u.can_use_ai,
    is_suspended: u.is_suspended,
    max_trips: u.max_trips == null ? '' : String(u.max_trips),
    notes: u.notes ?? '',
  })

  const sinTope = form.max_trips.trim() === ''
  const tope = Number(form.max_trips)
  const topeInvalido = !sinTope && (!Number.isInteger(tope) || tope < 0)

  const cambiado =
    form.can_create_trips !== u.can_create_trips ||
    form.can_share_trips !== u.can_share_trips ||
    form.can_use_ai !== u.can_use_ai ||
    form.is_suspended !== u.is_suspended ||
    form.notes !== (u.notes ?? '') ||
    (sinTope ? u.max_trips != null : tope !== u.max_trips)

  function guardar() {
    setLimits.mutate({
      p_user: u.user_id,
      p_can_create_trips: form.can_create_trips,
      p_can_share_trips: form.can_share_trips,
      p_can_use_ai: form.can_use_ai,
      p_is_suspended: form.is_suspended,
      // Vaciar el campo tiene que poder QUITAR el tope, y null en los demás
      // parámetros significa "no lo toques": hace falta una bandera explícita.
      p_max_trips: sinTope ? null : tope,
      p_clear_max_trips: sinTope,
      p_notes: form.notes.trim() || null,
    })
  }

  return (
    <section className="p-5 rounded-xl surface">
      <h3 className="font-serif text-xl mb-1">Permisos</h3>
      <p className="text-sm text-muted-foreground mb-5">
        Se aplican en la base de datos, no solo en la pantalla.
      </p>

      <div className="space-y-4">
        {PERMISOS.map(({ campo, etiqueta, ayuda }) => (
          <div key={campo} className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label htmlFor={campo} className="text-sm font-medium">{etiqueta}</Label>
              <p className="text-xs text-muted-foreground mt-0.5">{ayuda}</p>
            </div>
            <Switch
              id={campo}
              checked={form[campo]}
              onCheckedChange={v => setForm(f => ({ ...f, [campo]: v }))}
              disabled={form.is_suspended}
            />
          </div>
        ))}

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="max_trips" className="text-sm font-medium">Máximo de viajes</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vacío = sin tope. Ahora tiene {u.trips}.
            </p>
          </div>
          <Input
            id="max_trips"
            inputMode="numeric"
            className="w-24 shrink-0"
            placeholder="sin tope"
            value={form.max_trips}
            onChange={e => setForm(f => ({ ...f, max_trips: e.target.value.replace(/\D/g, '') }))}
          />
        </div>

        <div className="pt-4 border-t border-border flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Label htmlFor="is_suspended" className="text-sm font-medium text-destructive">
              Suspender la cuenta
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Podrá entrar, ver y descargar lo suyo, pero no cambiar nada.
              Suspender no borra nada.
            </p>
          </div>
          <Switch
            id="is_suspended"
            checked={form.is_suspended}
            onCheckedChange={v => setForm(f => ({ ...f, is_suspended: v }))}
          />
        </div>

        <div>
          <Label htmlFor="notes" className="text-sm font-medium">Por qué</Label>
          <p className="text-xs text-muted-foreground mt-0.5 mb-2">
            Para acordarte dentro de seis meses. Solo lo ves tú.
          </p>
          <Textarea
            id="notes"
            rows={2}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Subía fotos que no eran suyas…"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 mt-5">
        <Button
          variant="brand"
          onClick={guardar}
          disabled={!cambiado || topeInvalido || setLimits.isPending}
          className="gap-2"
        >
          {setLimits.isPending && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
          Guardar permisos
        </Button>
        {cambiado && !setLimits.isPending && (
          <span className="text-xs text-muted-foreground">Hay cambios sin guardar</span>
        )}
      </div>
    </section>
  )
}
