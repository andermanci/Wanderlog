import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Download, LogOut, Monitor, Moon, Share, Sun, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Avatar, Button, Card, Confirm, Field, Input, Notice, Page, Section, Segmented, Select, Stack, SwitchRow,
} from '@/design'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { useA11yStore, type Theme } from '@/store/a11yStore'
import { useSignOut } from '@/hooks/useAuth'
import { usePwaInstall } from '@/hooks/usePwaInstall'
import { enablePush, disablePush, getPushStatus, type PushStatus } from '@/lib/push'
import { clearAllOffline, offlineUsageBytes } from '@/lib/offlineIndex'
import { formatBytes } from '@/lib/audioCache'
import { useCurrencyCodes } from '@/lib/queries/rates'
import { currencyName } from '@/lib/utils'

const TEMAS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Automático', icon: Monitor },
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
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
    <Page title="Ajustes" subtitle="Tu cuenta y cómo quieres ver Wanderlog." width="narrow">
      <Stack>
        <Section title="Perfil">
          <Card className="space-y-5">
            <div className="flex items-center gap-4">
              <Avatar size="lg" name={profile?.full_name ?? correo} src={profile?.avatar_url} />
              <div className="min-w-0">
                <p className="title-card truncate">{nombreVisible}</p>
                <p className="truncate text-sm text-muted-foreground">{correo}</p>
              </div>
            </div>
            <form onSubmit={guardarNombre} className="space-y-4">
              <Field label="Nombre" error={errorNombre ?? undefined} hint="Así te verán las personas con las que compartas un viaje.">
                <Input
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                  autoComplete="name"
                />
              </Field>
              <div>
                <p className="text-sm font-medium">Correo</p>
                <p className="mt-1 break-all text-[0.9375rem] text-muted-foreground">{correo}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Es el correo con el que entras; no se puede cambiar. La foto viene de tu cuenta de Google.
                </p>
              </div>
              <Button type="submit" variant="primary" loading={guardando === 'nombre'}>
                Guardar nombre
              </Button>
            </form>
          </Card>
        </Section>

        <Section title="Preferencias">
          <Card>
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
          </Card>
        </Section>

        <Section title="Apariencia">
          <Card className="space-y-5">
            <div className="space-y-2">
              <p className="text-[0.9375rem] font-medium">Tema</p>
              <Segmented label="Tema" block value={theme} onChange={setTheme} options={TEMAS} />
              <p className="text-sm text-muted-foreground">«Automático» sigue el tema de tu dispositivo.</p>
            </div>
            <div className="border-t border-border pt-4">
              <SwitchRow
                label="Texto grande"
                description="Aumenta el tamaño de toda la aplicación para leer más cómodo."
                checked={textSize === 'large'}
                onCheckedChange={on => setTextSize(on ? 'large' : 'normal')}
              />
            </div>
          </Card>
        </Section>

        <Section title="Notificaciones">
          <Card className="space-y-4">
            {pushStatus === 'unsupported' ? (
              <p className="text-[0.9375rem] text-muted-foreground">
                Este navegador no puede recibir avisos. En iPhone, instala antes la app en la
                pantalla de inicio (hace falta iOS 16.4 o posterior).
              </p>
            ) : (
              <>
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
              </>
            )}
          </Card>
        </Section>

        <Section title="Aplicación">
          <Card className="space-y-5">
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

            <div className="space-y-3 border-t border-border pt-5">
              <div>
                <p className="text-[0.9375rem] font-medium">Datos descargados</p>
                <p className="text-sm text-muted-foreground">
                  {usage != null && <>Wanderlog ocupa unos <strong className="font-semibold text-foreground">{formatBytes(usage)}</strong> en este dispositivo. </>}
                  Son las fotos, los audios, los documentos y los viajes guardados para verlos sin conexión.
                </p>
              </div>
              <Button variant="danger-ghost" loading={clearing} onClick={() => setConfirmClear(true)} className="-ml-3">
                {!clearing && <Trash2 aria-hidden="true" />}
                Borrar todo lo descargado
              </Button>
            </div>
          </Card>
        </Section>

        <Section title="Sesión">
          <Card className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <p className="min-w-0 flex-1 basis-56 text-sm text-muted-foreground">
              Has entrado como <span className="break-all font-medium text-foreground">{correo}</span>.
            </p>
            <Button variant="outline" onClick={signOut}>
              <LogOut aria-hidden="true" />
              Cerrar sesión
            </Button>
          </Card>
        </Section>

        <Section title="Información">
          <Card pad="none" className="overflow-hidden">
            <p className="px-5 pt-5 text-[0.9375rem] leading-relaxed text-muted-foreground">
              Wanderlog es tu cuaderno de viajes. Lo que guardas es privado: solo lo ves tú y
              las personas con las que compartes cada viaje.
            </p>
            <Link
              to="/privacidad"
              className="mt-3 flex min-h-13 items-center justify-between gap-3 border-t border-border px-5 py-3 text-[0.9375rem] font-medium transition-colors hover:bg-secondary/70"
            >
              Privacidad: qué se guarda de ti
              <ChevronRight className="size-4.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </Card>
        </Section>
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
