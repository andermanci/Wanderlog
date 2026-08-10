// Comprobación de `can_use_ai` para las funciones que gastan cuota de pago
// (Google TTS y Gemini).
//
// POR QUÉ NO SE PUEDE HACER CON RLS: `can_use_ai` no corresponde a ninguna
// escritura en una tabla. Generar audio o llamar a Gemini son llamadas
// salientes a un tercero que factura; no hay ninguna fila cuyo INSERT se
// pueda bloquear. Así que se comprueba aquí, que es el único sitio por el que
// pasan de verdad.
//
// Se usa el cliente DEL USUARIO, no el service_role: la política
// `user_limits_select_own` permite exactamente esta lectura, así que no hace
// falta ningún privilegio extra para hacerla.

// Solo la parte del cliente de Supabase que se usa aquí. Evita importar el
// tipo entero de supabase-js y que este módulo dependa de su versión.
interface ClienteMinimo {
  from(tabla: string): {
    select(cols: string): {
      eq(col: string, val: string): {
        maybeSingle(): Promise<{ data: unknown; error: { code?: string } | null }>
      }
    }
  }
}

/**
 * Devuelve el motivo por el que NO puede usar la IA, o null si puede.
 *
 * Falla hacia PERMITIDO: si la tabla no existe todavía (migración sin aplicar)
 * o la consulta se cae, se deja pasar. Lo contrario dejaría a todo el mundo
 * sin audioguías por un error de red, que es mucho peor que dejar que alguien
 * bloqueado genere una de más.
 */
export async function bloqueoIA(
  userClient: ClienteMinimo,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await userClient
      .from('user_limits')
      .select('can_use_ai, is_suspended')
      .eq('user_id', userId)
      .maybeSingle()

    if (error || !data) return null   // sin fila = todo permitido

    const l = data as { can_use_ai: boolean; is_suspended: boolean }
    if (l.is_suspended) return 'Tu cuenta está suspendida.'
    if (!l.can_use_ai) return 'Las funciones con inteligencia artificial están desactivadas en tu cuenta.'
    return null
  } catch {
    return null
  }
}
