import { useState } from 'react'
import { Button, Card, Field, Input, Section, SwitchRow, Textarea } from '@/design'
import { useSetLimits } from '@/lib/queries/admin'
import type { AdminUserRow } from '@/types/database'

type PermisoBool = 'can_create_trips' | 'can_share_trips' | 'can_use_ai'

const PERMISOS: { campo: PermisoBool; etiqueta: string; ayuda: string }[] = [
  { campo: 'can_create_trips', etiqueta: 'Crear viajes nuevos', ayuda: 'Los que ya tiene siguen siendo suyos.' },
  { campo: 'can_share_trips', etiqueta: 'Compartir viajes', ayuda: 'Invitar a otras personas a sus viajes.' },
  { campo: 'can_use_ai', etiqueta: 'Funciones con IA', ayuda: 'Audioguías e importar sitios: cada uso cuesta dinero.' },
]

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
      // parámetros significa «no lo toques»: hace falta una bandera explícita.
      p_max_trips: sinTope ? null : tope,
      p_clear_max_trips: sinTope,
      p_notes: form.notes.trim() || null,
    })
  }

  return (
    <Section title="Permisos" description="Se aplican en la base de datos, no solo en la pantalla.">
      <Card className="space-y-4">
        {PERMISOS.map(({ campo, etiqueta, ayuda }) => (
          <SwitchRow
            key={campo}
            label={etiqueta}
            description={ayuda}
            checked={form[campo]}
            onCheckedChange={v => setForm(f => ({ ...f, [campo]: v }))}
            disabled={form.is_suspended}
          />
        ))}

        <Field
          label="Máximo de viajes"
          hint={`Déjalo vacío para no poner tope. Ahora tiene ${u.trips}.`}
          error={topeInvalido ? 'Tiene que ser un número entero.' : undefined}
          className="max-w-xs"
        >
          <Input
            inputMode="numeric"
            placeholder="sin tope"
            value={form.max_trips}
            onChange={e => setForm(f => ({ ...f, max_trips: e.target.value.replace(/\D/g, '') }))}
          />
        </Field>

        <div className="border-t border-border pt-4">
          <SwitchRow
            label={<span className="text-destructive">Suspender la cuenta</span>}
            description="Podrá entrar, ver y descargar lo suyo, pero no cambiar nada. Suspender no borra nada."
            checked={form.is_suspended}
            onCheckedChange={v => setForm(f => ({ ...f, is_suspended: v }))}
          />
        </div>

        <Field label="Por qué" hint="Para acordarte dentro de seis meses. Solo lo ves tú." optional>
          <Textarea
            rows={2}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Subía fotos que no eran suyas…"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button
            variant="primary"
            onClick={guardar}
            disabled={!cambiado || topeInvalido}
            loading={setLimits.isPending}
          >
            Guardar permisos
          </Button>
          {cambiado && !setLimits.isPending && (
            <span className="text-xs text-muted-foreground">Hay cambios sin guardar</span>
          )}
        </div>
      </Card>
    </Section>
  )
}
