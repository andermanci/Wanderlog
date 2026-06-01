import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { motion } from 'framer-motion'
import { User, Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'

const schema = z.object({
  full_name: z.string().min(1, 'Nombre obligatorio'),
  default_currency: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

const CURRENCIES = ['EUR', 'USD', 'GBP', 'JPY', 'CHF', 'MXN', 'ARS', 'COP', 'BRL', 'CAD', 'AUD']

export function SettingsPage() {
  const { profile, user, setProfile } = useAuthStore()
  const [saving, setSaving] = useState(false)

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
    <div className="max-w-xl mx-auto px-6 py-8">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="font-serif text-3xl font-medium mb-8">Ajustes</h1>

        {/* Perfil */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <User size={18} style={{ color: 'var(--primary)' }} />
            <h2 className="font-serif text-xl">Perfil</h2>
          </div>

          <div className="p-6 rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
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
                style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}>
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

          <div className="p-6 rounded-xl space-y-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <div className="space-y-1.5">
              <Label>Moneda por defecto</Label>
              <Select
                value={watch('default_currency')}
                onValueChange={(v) => setValue('default_currency', v)}
              >
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Se usará como moneda por defecto en los gastos</p>
            </div>

            <Button
              onClick={handleSubmit(onSubmit)}
              disabled={saving}
              style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
            >
              {saving && <Loader2 size={14} className="animate-spin mr-2" />}
              Guardar preferencias
            </Button>
          </div>
        </section>

        <Separator className="my-8" />

        {/* Información */}
        <section>
          <div className="p-6 rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <p className="text-xs text-muted-foreground text-center">
              Wanderlog · Tu diario de viajes personal<br />
              Todos tus datos son privados y protegidos con RLS en Supabase
            </p>
          </div>
        </section>
      </motion.div>
    </div>
  )
}
