import { Lock } from 'lucide-react'
import { useMyLimits } from '@/lib/queries/limits'
import { bloqueoParaEditar } from '@/lib/limits'

// Una cuenta suspendida sigue pudiendo entrar, leer y descargar sus viajes;
// lo que no puede es cambiar nada. Sin este aviso, la persona iría
// descubriéndolo botón a botón, y cada fallo parecería una avería de la
// aplicación en vez de una decisión que alguien tomó.
export function CuentaSuspendidaBanner() {
  const { data: limites } = useMyLimits()
  // El texto sale de `limits.ts` y no está escrito aquí: es el mismo módulo
  // que decide si el botón se deshabilita, así que no pueden discrepar.
  const motivo = bloqueoParaEditar(limites)
  if (!motivo) return null

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 px-4 py-2.5 text-sm border-b"
      style={{
        background: 'color-mix(in srgb, var(--destructive) 12%, var(--background))',
        borderColor: 'color-mix(in srgb, var(--destructive) 30%, transparent)',
      }}
    >
      <Lock size={15} className="mt-0.5 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden="true" />
      <p className="text-foreground">
        {motivo} Escríbenos si crees que es un error.
      </p>
    </div>
  )
}
