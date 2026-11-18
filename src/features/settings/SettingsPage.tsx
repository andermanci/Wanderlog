import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  AtSign, Bell, BellOff, BookOpen, Check, ChevronRight, Coins, Download, HardDriveDownload, LockKeyhole, LogOut,
  Monitor, Moon, Palette, Share, Smartphone, Sun, Trash2, Type, UserRound, type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import { Avatar, Button, Confirm, Field, Input, Notice, Page, Select, Stack, SwitchRow } from '@/design'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useA11yStore, type Theme } from '@/store/a11yStore'
import { useSignOut } from '@/hooks/useAuth'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { enablePush, disablePush, getPushStatus, type PushStatus } from '@/lib/push'
import { clearAllOffline, offlineUsageBytes } from '@/lib/offlineIndex'
import { formatBytes } from '@/lib/audioCache'
import { useCurrencyCodes } from '@/lib/queries/rates'
import { cn, currencyName } from '@/lib/utils'

const TEMAS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Automático', icon: Monitor },
]

/** Ajustes de la persona (no de un viaje): perfil, preferencias, aspecto, avisos y la app. */
export function SettingsPage() {
  const { profile, user, setProfile } = useAuthStore()
  const { theme, textSize, setTheme, setTextSize } = useA11yStore()
  const signOut = useSignOut()
  const pwa = usePwaInstall()

  // --- Perfil y preferencias ------------------------------------------------
  const [nombre, setNombre] = useState(profile?.full_name ?? '')
  const [errorNombre, setErrorNombre] = useState<string | null>(null)
  const [guardando, setGuardando] = useState<'nombre' | 'moneda' | null>(null)
  const moneda = profile?.default_currency ?? 'EUR'
  const codigos = useCurrencyCodes()
  // La divisa actual sale en la lista aunque los tipos de cambio aún no hayan cargado.
  const divisas = codigos.includes(moneda) ? codigos : [moneda, ...codigos]

  async function guardar(
    values: { full_name: string } | { default_currency: string },
    que: 'nombre' | 'moneda',
    hecho: string,
  ) {
    if (!user) return
    setGuardando(que)
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(values)
        .eq('id', user.id)
        .select()
        .single()
      if (error) throw error
      setProfile(data)
      toast.success(hecho)
    } catch {
      toast.error('No se pudieron guardar los cambios')
    } finally {
      setGuardando(null)
    }
  }

  function guardarNombre(e: FormEvent) {
    e.preventDefault()
    const limpio = nombre.trim()
    if (!limpio) { setErrorNombre('Escribe tu nombre.'); return }
    setErrorNombre(null)
    void guardar({ full_name: limpio }, 'nombre', 'Nombre guardado')
  }

  // --- Notificaciones push --------------------------------------------------
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null)
  const [pushBusy, setPushBusy] = useState(false)
  useEffect(() => { getPushStatus().then(setPushStatus) }, [])

  async function togglePush() {
    if (!user) return
    setPushBusy(true)
    try {
      const next = pushStatus === 'enabled' ? await disablePush() : await enablePush(user.id)
      setPushStatus(next)
      if (next === 'enabled') toast.success('Avisos activados')
      else if (next === 'denied') toast.error('El navegador ha denegado el permiso')
      else if (next === 'unconfigured') toast.error('Los avisos no están configurados en el servidor')
    } catch {
      toast.error('No se pudieron cambiar los avisos')
    } finally {
      setPushBusy(false)
    }
  }

  // --- Lo descargado para usar la app sin conexión --------------------------
  const qc = useQueryClient()
  const [usage, setUsage] = useState<number | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  useEffect(() => { offlineUsageBytes().then(setUsage) }, [])

  async function clearOffline() {
    setClearing(true)
    await clearAllOffline(qc).catch(() => {})
    setUsage(await offlineUsageBytes())
    setClearing(false)
    setConfirmClear(false)
    toast.success('Descargas borradas de este dispositivo')
  }

  const nombreVisible = profile?.full_name ?? 'Sin nombre'
  const correo = profile?.email ?? user?.email ?? ''

  return (
    <Page width="narrow">
      {/* Cabecera: quién eres, en grande. */}
      <header className="mb-8 flex items-center gap-4 md:mb-10 md:gap-6">
        <Avatar
          size="lg"
          name={profile?.full_name ?? correo}
          src={profile?.avatar_url}
          className="size-20 font-serif text-3xl font-medium md:size-24"
        />
        <div className="min-w-0">
          <p className="eyebrow">Ajustes</p>
          <h1 className="title-hero truncate">{nombreVisible}</h1>
          <p className="mt-1 truncate text-[0.9375rem] text-muted-foreground">{correo}</p>
        </div>
      </header>

      <Stack gap="lg">
        <Grupo titulo="Perfil">
          <Ajuste icon={UserRound}>
            <form onSubmit={guardarNombre} className="space-y-3">
              <Field label="Nombre" error={errorNombre ?? undefined} hint="Así te verán las personas con las que compartas un viaje.">
                <Input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <Button type="submit" variant="primary" loading={guardando === 'nombre'}>
                Guardar nombre
              </Button>
            </form>
          </Ajuste>
          <Ajuste icon={AtSign}>
            <p className="text-[0.9375rem] font-medium">Correo</p>
            <p className="break-all text-[0.9375rem] text-muted-foreground">{correo}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Es el correo con el que entras; no se puede cambiar. La foto viene de tu cuenta de Google.
            </p>
          </Ajuste>
        </Grupo>

        <Grupo titulo="Preferencias">
          <Ajuste icon={Coins}>
            <Field
              label="Moneda por defecto"
              hint="En esta moneda verás los totales de tus gastos. Cada viaje puede tener la suya. Se guarda al elegirla."
            >
              <Select
                value={moneda}
                disabled={guardando === 'moneda'}
                onChange={e => void guardar({ default_currency: e.target.value }, 'moneda', 'Moneda guardada')}
              >
                {divisas.map(c => (
                  <option key={c} value={c}>{c} · {currencyName(c)}</option>
                ))}
              </Select>
            </Field>
          </Ajuste>
        </Grupo>

        <Grupo titulo="Apariencia">
          <Ajuste icon={Palette}>
            <p id="rotulo-tema" className="text-[0.9375rem] font-medium">Tema</p>
            <div role="radiogroup" aria-labelledby="rotulo-tema" className="mt-2.5 grid grid-cols-3 gap-2.5">
              {TEMAS.map(t => {
                const activo = theme === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={activo}
                    onClick={() => setTheme(t.value)}
                    className={cn(
                      'relative min-w-0 rounded-xl border p-1.5 text-left transition-[border-color,box-shadow,background-color] duration-150',
                      activo ? 'border-primary bg-primary-soft ring-2 ring-primary/25' : 'border-border-strong hover:bg-secondary',
                    )}
                  >
                    <span aria-hidden="true" className="flex h-16 overflow-hidden rounded-lg border border-border md:h-20">
                      {t.value !== 'dark' && <VistaTema />}
                      {t.value !== 'light' && <VistaTema oscuro />}
                    </span>
                    <span className="flex min-h-9 items-center gap-1.5 px-0.5 pt-1.5 text-xs font-medium sm:px-1 sm:text-sm">
                      <t.icon className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
                      <span className="min-w-0 truncate">{t.label}</span>
                    </span>
                    {activo && (
                      <span aria-hidden="true" className="absolute right-2.5 top-2.5 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground shadow-card">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">«Automático» sigue el tema de tu dispositivo.</p>
          </Ajuste>
          <Ajuste icon={Type}>
            <SwitchRow
              label="Texto grande"
              description="Aumenta el tamaño de toda la aplicación para leer más cómodo."
              checked={textSize === 'large'}
              onCheckedChange={on => setTextSize(on ? 'large' : 'normal')}
            />
          </Ajuste>
        </Grupo>

        <Grupo titulo="Notificaciones">
          <Ajuste icon={pushStatus === 'unsupported' ? BellOff : Bell}>
            {pushStatus === 'unsupported' ? (
              <p className="text-[0.9375rem] text-muted-foreground">
                Este navegador no puede recibir avisos. En iPhone, instala antes la app en la
                pantalla de inicio (hace falta iOS 16.4 o posterior).
              </p>
            ) : (
              <div className="space-y-3">
                <SwitchRow
                  label="Avisos del viaje"
                  description="Recibe tus recordatorios (vuelos, check-in…) aunque la app esté cerrada."
                  checked={pushStatus === 'enabled'}
                  disabled={pushStatus === null || pushBusy || pushStatus === 'denied'}
                  onCheckedChange={() => void togglePush()}
                />
                {pushStatus === 'denied' && (
                  <Notice tone="warning" title="Has bloqueado los avisos">
                    Actívalos en los ajustes del navegador, en los permisos de esta página, y vuelve aquí.
                  </Notice>
                )}
                <p className="text-sm text-muted-foreground">
                  En iPhone, instala antes la app en la pantalla de inicio (hace falta iOS 16.4 o posterior).
                </p>
              </div>
            )}
          </Ajuste>
        </Grupo>

        <Grupo titulo="Aplicación">
          <Ajuste icon={Smartphone}>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-[0.9375rem] font-medium">Instalar Wanderlog</p>
                <p className="text-sm text-muted-foreground">
                  {pwa.installed ? (
                    'Ya la estás usando como app instalada.'
                  ) : pwa.canInstall ? (
                    'Ábrela como una app, con su icono, también sin conexión.'
                  ) : pwa.isIos ? (
                    <>
                      Toca <Share className="inline size-4 align-text-bottom" aria-hidden="true" /> Compartir
                      en Safari y elige «Añadir a pantalla de inicio».
                    </>
                  ) : (
                    'Busca «Instalar aplicación» en el menú del navegador para tenerla con su icono y sin conexión.'
                  )}
                </p>
              </div>
              {!pwa.installed && pwa.canInstall && (
                <Button variant="soft" onClick={pwa.promptInstall}>
                  <Download aria-hidden="true" />
                  Instalar
                </Button>
              )}
            </div>
          </Ajuste>
          <Ajuste icon={HardDriveDownload}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4">
              <p className="text-[0.9375rem] font-medium">Datos descargados</p>
              {usage != null && (
                <p className="font-serif text-xl font-medium tabular-nums tracking-tight">{formatBytes(usage)}</p>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {usage != null && 'Es lo que ocupa Wanderlog en este dispositivo. '}
              Son las fotos, los audios, los documentos y los viajes guardados para verlos sin conexión.
            </p>
            <Button variant="danger-ghost" loading={clearing} onClick={() => setConfirmClear(true)} className="-ml-3 mt-1.5">
              {!clearing && <Trash2 aria-hidden="true" />}
              Borrar todo lo descargado
            </Button>
          </Ajuste>
        </Grupo>

        <Grupo titulo="Información">
          <Ajuste icon={BookOpen}>
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              Wanderlog es tu cuaderno de viajes. Lo que guardas es privado: solo lo ves tú y
              las personas con las que compartes cada viaje.
            </p>
          </Ajuste>
          <Link
            to="/privacidad"
            className="flex min-h-14 items-center gap-3.5 px-4 py-3 text-[0.9375rem] font-medium transition-colors hover:bg-secondary/70"
          >
            <LockKeyhole className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1">Privacidad: qué se guarda de ti</span>
            <ChevronRight className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </Link>
        </Grupo>

        {/* Cerrar sesión: al final y sin ruido. */}
        <footer className="flex flex-col items-center gap-1 border-t border-border pt-6 text-center">
          <p className="text-sm text-muted-foreground">
            Has entrado como <span className="break-all font-medium text-foreground">{correo}</span>.
          </p>
          <Button variant="ghost" onClick={signOut}>
            <LogOut aria-hidden="true" />
            Cerrar sesión
          </Button>
        </footer>
      </Stack>

      <Confirm
        danger
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="¿Borrar todo lo descargado?"
        description="Se borran de este dispositivo las fotos, los audios, los documentos y los datos de los viajes que hayas guardado para verlos sin conexión. Tus viajes siguen en tu cuenta y se vuelven a cargar solos en cuanto haya conexión, pero hasta entonces la app se queda sin nada que enseñar: si estás sin cobertura, mejor espera."
        confirmLabel="Borrar todo"
        loading={clearing}
        onConfirm={() => void clearOffline()}
      />
    </Page>
  )
}

/** Un grupo de ajustes: rótulo pequeño y una lista limpia debajo. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="eyebrow mb-2 px-1 font-sans">{titulo}</h2>
      <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
        {children}
      </div>
    </section>
  )
}

/** Una línea de la lista: su icono a la izquierda y el ajuste a la derecha. */
function Ajuste({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="flex gap-3.5 px-4 py-4">
      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

// Mini-pantalla de la app en claro u oscuro. No hay tokens «del otro tema», así
// que el papel y la tinta se cruzan: en modo oscuro, `foreground` es el claro.
function VistaTema({ oscuro }: { oscuro?: boolean }) {
  const papel = oscuro ? 'bg-foreground dark:bg-background' : 'bg-background dark:bg-foreground'
  const tinta = oscuro ? 'bg-background dark:bg-foreground' : 'bg-foreground dark:bg-background'
  return (
    <span className={cn('flex min-w-0 flex-1 flex-col gap-1 p-2', papel)}>
      <span className={cn('h-1.5 w-3/5 rounded-full opacity-80', tinta)} />
      <span className={cn('h-1 w-4/5 rounded-full opacity-30', tinta)} />
      <span className={cn('h-1 w-2/5 rounded-full opacity-30', tinta)} />
      <span className="mt-auto h-2.5 w-1/2 max-w-8 rounded-full bg-primary" />
    </span>
  )
}
