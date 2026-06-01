import { createClient, processLock } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Faltan las variables de entorno VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY')
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Lock en memoria en vez de navigator.locks (que puede quedarse
    // bloqueado entre pestañas y colgar storage/queries indefinidamente).
    lock: processLock,
  },
})

// Solo en desarrollo: expone el cliente para diagnóstico desde la consola.
if (import.meta.env.DEV) {
  ;(window as unknown as { supabase: typeof supabase }).supabase = supabase
}
