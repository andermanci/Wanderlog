import { useState, useEffect } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { User, Globe, Loader2, LogOut, Bell, BellOff, Sun, Moon, Monitor, Type, Download, Share, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencySelect } from '@/components/CurrencySelect'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useA11yStore } from '@/store/a11yStore'
import { useSignOut } from '@/hooks/useAuth'
import { enablePush, disablePush, getPushStatus, type PushStatus } from '@/lib/push'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { clearAllOffline, offlineUsageBytes } from '@/lib/offlineIndex'
import { formatBytes } from '@/lib/audioCache'
import { toast } from 'sonner'

const schema = z.object({
  full_name: z.string().min(1, 'Nombre obligatorio'),
  default_currency: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export function SettingsPage() {
  const { profile, user, setProfile } = useAuthStore()
  const { theme, textSize, setTheme, setTextSize } = useA11yStore()
  const signOut = useSignOut()
  const [saving, setSaving] = useState(false)
  const pwa = usePwaInstall()

  // Notificaciones push
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => { getPushStatus().then(setPushStatus) }, [])

  // Lo descargado para usar la app sin conexión
  const qc = useQueryClient()
  const [usage, setUsage] = useState<number | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  useEffect(() => { offlineUsageBytes().then(setUsage) }, [])

  async function clearOffline() {
    setConfirmClear(false)
    setClearing(true)
    await clearAllOffline(qc).catch(() => {})
    setUsage(await offlineUsageBytes())
    setClearing(false)
    toast.success('Descargas borradas de este dispositivo')
  }

  async function togglePush() {
    if (!user) return
    setPushBusy(true)
    try {
      const next = pushStatus === 'enabled' ? await disablePush() : await enablePush(user.id)
      setPushStatus(next)
      if (next === 'enabled') toast.success('Notificaciones activadas')
      else if (next === 'denied') toast.error('Permiso denegado en el navegador')
      else if (next === 'unconfigured') toast.error('Push no configurado en el servidor')
    } catch {
      toast.error('No se pudieron cambiar las notificaciones')
    } finally {
      setPushBusy(false)
    }
  }

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
    defaultValues: {
      full_name: profile?.full_name ?? '',
      default_currency: profile?.default_currency ?? 'EUR',
    },
  })

  async function onSubmit(values: FormValues) {
    if (!user) return
    setSaving(true)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(values)
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      setProfile(data)
      toast.success('Perfil actualizado')
    } catch {
      toast.error('Error al guardar los cambios')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto px-4 sm:px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-serif text-3xl font-medium mb-8">Ajustes</h1>

        {/* Perfil */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Perfil</h2>
          </div>

          <div className="p-6 rounded-xl surface">
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="w-16 h-16 ring-2 ring-border">
                <AvatarImage src={profile?.avatar_url ?? undefined} />
                <AvatarFallback style={{ background: 'var(--secondary)', color: 'var(--primary)', fontSize: '1.5rem' }}>
                  {profile?.full_name?.[0] ?? user?.email?.[0] ?? 'U'}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="font-medium">{profile?.full_name ?? 'Sin nombre'}</p>
                <p className="text-sm text-muted-foreground">{profile?.email}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Avatar sincronizado con Google</p>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Nombre completo</Label>
                <Input {...register('full_name')} />
                {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input value={profile?.email ?? ''} disabled className="opacity-50" />
                <p className="text-xs text-muted-foreground">El email está vinculado a tu cuenta de Google</p>
              </div>

              <Button type="submit" disabled={saving}
                variant="brand">
                {saving && <Loader2 size={14} className="animate-spin mr-2" />}
                Guardar cambios
              </Button>
            </form>
          </div>
        </section>

        <Separator className="mb-8" />

        {/* Preferencias */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Globe size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Preferencias</h2>
          </div>

          <div className="p-6 rounded-xl space-y-4 surface">
            <div className="space-y-1.5">
              <Label>Moneda por defecto</Label>
              <CurrencySelect
                value={watch('default_currency')}
                onChange={(v) => setValue('default_currency', v)}
                className="w-56"
              />
              <p className="text-xs text-muted-foreground">Se usará para mostrar los totales de tus gastos. Cada viaje puede tener su propia divisa para anotarlos.</p>
            </div>

            <Button
              onClick={handleSubmit(onSubmit)}
              disabled={saving}
              variant="brand"
            >
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Guardar preferencias
            </Button>
          </div>
        </section>

        <Separator className="my-8" />

        {/* Apariencia y accesibilidad */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Type size={18} style={{ color: 'var(--primary)' }} aria-hidden="true" />
            <h2 className="font-serif text-xl">Apariencia</h2>
          </div>
          <div className="p-6 rounded-xl space-y-5 surface">
            {/* Tema */}
            <div className="space-y-2">
              <Label>Tema</Label>
              <div className="grid grid-cols-3 gap-2 max-w-sm">
                {([
                  { v: 'system', label: 'Automático', Icon: Monitor },
                  { v: 'light', label: 'Claro', Icon: Sun },
                  { v: 'dark', label: 'Oscuro', Icon: Moon },
                ] as const).map(({ v, label, Icon }) => (
                  <button key={v} type="button" onClick={() => setTheme(v)} aria-pressed={theme === v}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors"
                    style={{
                      borderColor: theme === v ? 'var(--primary)' : 'var(--border)',
                      background: theme === v ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                      color: theme === v ? 'var(--primary)' : 'var(--muted-foreground)',
                    }}>
                    <Icon size={18} aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">«Automático» sigue el tema de tu dispositivo.</p>
            </div>

            {/* Tamaño de texto */}
            <div className="space-y-2">
              <Label>Tamaño del texto</Label>
              <div className="grid grid-cols-2 gap-2 max-w-sm">
                {([
                  { v: 'normal', label: 'Normal' },
                  { v: 'large', label: 'Grande' },
                ] as const).map(({ v, label }) => (
                  <button key={v} type="button" onClick={() => setTextSize(v)} aria-pressed={textSize === v}
                    className="py-3 rounded-lg border font-medium transition-colors"
                    style={{
                      borderColor: textSize === v ? 'var(--primary)' : 'var(--border)',
                      background: textSize === v ? 'color-mix(in srgb, var(--primary) 10%, transparent)' : 'transparent',
                      color: textSize === v ? 'var(--primary)' : 'var(--muted-foreground)',
                      fontSize: v === 'large' ? '1.05rem' : undefined,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">Aumenta el tamaño de toda la interfaz para leer más cómodo.</p>
            </div>
          </div>
        </section>

        <Separator className="my-8" />

        {/* Notificaciones */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Bell size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Notificaciones</h2>
          </div>
          <div className="p-6 rounded-xl surface">
            {pushStatus === 'unsupported' ? (
              <p className="text-sm text-muted-foreground">Tu navegador no admite notificaciones push.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">Avisos del viaje</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Recibe recordatorios (vuelos, check-in…) aunque la app esté cerrada.
                    </p>
                  </div>
                  <Button
                    variant={pushStatus === 'enabled' ? 'outline' : 'brand'}
                    className="gap-1.5 flex-shrink-0"
                    disabled={pushBusy || pushStatus === 'denied'}
                    onClick={togglePush}
                  >
                    {pushBusy ? <Loader2 size={15} className="animate-spin" /> : pushStatus === 'enabled' ? <BellOff size={15} /> : <Bell size={15} />}
                    {pushStatus === 'enabled' ? 'Desactivar' : 'Activar'}
                  </Button>
                </div>
                {pushStatus === 'denied' && (
                  <p className="text-xs text-destructive mt-3">Has bloqueado las notificaciones; actívalas en los ajustes del navegador.</p>
                )}
                <p className="text-[11px] text-muted-foreground mt-3">
                  En iPhone, instala antes la app en la pantalla de inicio (requiere iOS 16.4+).
                </p>
              </>
            )}
          </div>
        </section>

        <Separator className="mb-8" />

        {/* Aplicación */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Download size={18} style={{ color: 'var(--primary)' }} aria-hidden="true" />
            <h2 className="font-serif text-xl">Aplicación</h2>
          </div>
          <div className="p-6 rounded-xl surface">
            {pwa.installed ? (
              <p className="text-sm text-muted-foreground">Ya estás usando Wanderlog como app instalada. ✦</p>
            ) : pwa.canInstall ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm">Instalar en este dispositivo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Ábrela como una app, con icono propio y soporte offline.
                  </p>
                </div>
                <Button variant="brand" className="gap-1.5 flex-shrink-0" onClick={pwa.promptInstall}>
                  <Download size={15} /> Instalar
                </Button>
              </div>
            ) : pwa.isIos ? (
              <p className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                Para instalarla, toca <Share size={14} className="inline flex-shrink-0" aria-label="Compartir" /> Compartir
                en Safari y elige «Añadir a pantalla de inicio».
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Instálala desde el menú del navegador («Instalar aplicación») para usarla con icono propio y offline.
              </p>
            )}

            <div className="mt-5 pt-5 border-t border-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm">Datos descargados</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {usage != null && `Wanderlog ocupa unos ${formatBytes(usage)} en este dispositivo. `}
                  Libera el sitio de las fotos, audios, documentos y viajes que hayas guardado
                  para consultarlos sin conexión.
                </p>
              </div>
              <Button
                variant="outline"
                className="gap-1.5 flex-shrink-0 text-destructive hover:text-destructive"
                disabled={clearing}
                onClick={() => setConfirmClear(true)}
              >
                {clearing ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                Borrar
              </Button>
            </div>
          </div>
        </section>

        <Separator className="mb-8" />

        {/* Sesión */}
        <section className="mb-8">
          <Button
            variant="outline"
            className="w-full gap-2 text-destructive hover:text-destructive"
            onClick={signOut}
          >
            <LogOut size={15} />
            Cerrar sesión
          </Button>
        </section>

        {/* Información */}
        <section>
          <div className="p-6 rounded-xl surface">
            <p className="text-xs text-muted-foreground text-center">
              Wanderlog · Tu diario de viajes personal<br />
              Todos tus datos son privados y protegidos con RLS en Supabase
            </p>
          </div>
        </section>
      </motion.div>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent className="surface">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif">¿Borrar todo lo descargado?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borran de este dispositivo las fotos, los audios, los documentos y los datos de
              los viajes que hayas guardado para verlos sin conexión. Tus viajes siguen en tu
              cuenta y se vuelven a cargar solos en cuanto haya conexión, pero hasta entonces la
              app se queda sin nada que enseñar: si estás sin cobertura, mejor espera.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void clearOffline()}
              style={{ background: 'var(--destructive)', color: 'white' }}
            >
              Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
