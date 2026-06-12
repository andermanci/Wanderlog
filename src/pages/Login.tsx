import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signInWithGoogle } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

export function LoginPage() {
  const navigate = useNavigate()
  const { session } = useAuthStore()

  useEffect(() => {
    if (session) navigate('/dashboard', { replace: true })
  }, [session, navigate])

  async function handleGoogleLogin() {
    try {
      await signInWithGoogle()
    } catch {
      toast.error('Error al iniciar sesión con Google')
    }
  }

  return (
    <div className="min-h-dvh flex relative overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Fondo editorial cálido: manchas suaves del acento + trama de puntos */}
      <div
        className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--primary) 14%, transparent)' }}
      />
      <div
        className="absolute -bottom-40 -right-32 w-[560px] h-[560px] rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--chart-4) 16%, transparent)' }}
      />
      <div
        className="absolute top-1/3 right-1/4 w-72 h-72 rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--chart-2) 10%, transparent)' }}
      />
      <div className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: `radial-gradient(circle at 25% 25%, var(--primary) 1px, transparent 1px),
            radial-gradient(circle at 75% 75%, var(--primary) 1px, transparent 1px)`,
          backgroundSize: '72px 72px',
        }}
      />

      <div className="relative z-10 flex flex-col items-center justify-center w-full px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="glass rounded-2xl p-10 w-full max-w-md flex flex-col items-center gap-8"
        >
          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'var(--gradient-primary-subtle)', border: '1px solid color-mix(in srgb, var(--primary) 27%, transparent)' }}
            >
              <Compass className="w-8 h-8" style={{ color: 'var(--primary)' }} />
            </motion.div>
            <h1 className="text-4xl font-semibold tracking-tight text-gold-gradient">
              Wanderlog
            </h1>
            <p className="text-muted-foreground text-sm text-center leading-relaxed">
              Tu diario de viajes personal.<br />
              Planifica, organiza y recuerda cada aventura.
            </p>
          </div>

          {/* Separador */}
          <div className="w-full flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">Acceder</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Botón Google */}
          <Button
            onClick={handleGoogleLogin}
            className="w-full h-12 text-base font-medium gap-3 transition-all hover:scale-[1.02]"
            style={{
              background: 'var(--gradient-primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#ffffff" opacity=".8"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#ffffff" opacity=".8"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#ffffff" opacity=".8"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#ffffff" opacity=".8"/>
            </svg>
            Continuar con Google
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Al continuar, aceptas el uso de tu cuenta de Google para autenticarte.<br />
            Tus datos son privados y solo tú puedes verlos.
          </p>
        </motion.div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="relative z-10 mt-8 text-xs text-muted-foreground"
        >
          Wanderlog — Tu compañero de viajes
        </motion.p>
      </div>
    </div>
  )
}
