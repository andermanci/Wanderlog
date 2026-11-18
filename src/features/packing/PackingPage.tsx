import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ChevronDown, Luggage, Sparkles } from 'lucide-react'
import { Button, Empty, Menu, Page, Skeleton, Stack } from '@/design'
import { dedupeAgainst } from '@/lib/packing/suggest'
import {
  useBulkCreatePackingItems, useCreatePackingItem, useDeletePackingItem, usePackingItems, useTogglePackingItem,
} from '@/lib/queries/packing'
import { canEditRole, useTripRole } from '@/lib/queries/sharing'
import { useTrip } from '@/lib/queries/trips'
import type { PackingItem } from '@/types/database'
import { PackingAdd } from './PackingAdd'
import { PackingCategory } from './PackingCategory'
import { PackingRing } from './PackingRing'
import { SuggestPanel } from './SuggestPanel'
import { PACKING_TEMPLATES, type PackingTemplate } from './templates'

export function PackingPage() {
  const { tripId = '' } = useParams<{ tripId: string }>()
  const { data: itemData, isLoading } = usePackingItems(tripId)
  const { data: trip } = useTrip(tripId)
  const { data: role } = useTripRole(tripId)
  const canEdit = canEditRole(role)
  const createItem = useCreatePackingItem()
  const toggleItem = useTogglePackingItem()
  const deleteItem = useDeletePackingItem()
  const bulkCreate = useBulkCreatePackingItems()
  const [suggestOpen, setSuggestOpen] = useState(false)

  const items: PackingItem[] = itemData ?? []
  const grouped = new Map<string, PackingItem[]>()
  for (const item of items) grouped.set(item.category, [...(grouped.get(item.category) ?? []), item])
  const categories = [...grouped.keys()]

  const total = items.length
  const done = items.filter(i => i.is_checked).length
  const allDone = total > 0 && done === total

  function addItem(name: string, category: string) {
    createItem.mutate({
      trip_id: tripId,
      category,
      name,
      is_checked: false,
      order_index: grouped.get(category)?.length ?? 0,
    })
  }

  function applyTemplate(template: PackingTemplate) {
    const proposals = template.groups.flatMap(g => g.items.map(name => ({ category: g.category, name })))
    // Sin repetir lo que ya está: aplicar dos veces la misma plantilla no duplica nada.
    const fresh = dedupeAgainst(proposals, items).map((s, i) => ({
      trip_id: tripId, category: s.category, name: s.name, is_checked: false, order_index: i,
    }))
    if (fresh.length === 0) {
      toast.info('Ya tienes en la lista todo lo de esa plantilla')
      return
    }
    bulkCreate.mutate(fresh)
  }

  const templatesMenu = (
    <Menu
      trigger={<Button variant="outline" disabled={bulkCreate.isPending}>Plantillas <ChevronDown aria-hidden="true" /></Button>}
      items={PACKING_TEMPLATES.map(t => ({ label: t.label, hint: t.hint, onSelect: () => applyTemplate(t) }))}
    />
  )
  const suggestButton = (variant: 'primary' | 'soft') => (
    <Button variant={variant} disabled={!trip} onClick={() => setSuggestOpen(true)}>
      <Sparkles aria-hidden="true" /> Sugerir
    </Button>
  )

  return (
    <Page
      title="Equipaje"
      subtitle="Lo que te llevas. Márcalo según lo metas en la maleta."
      back={{ to: `/trips/${tripId}`, label: 'Inicio del viaje' }}
      actions={canEdit && <>{templatesMenu}{suggestButton('primary')}</>}
    >
      <Stack>
        {total > 0 && (
          <section aria-label="Cómo va la maleta" className="flex items-center gap-5 md:gap-8">
            <PackingRing done={done} total={total} tone={allDone ? 'success' : 'primary'} />
            <div className="min-w-0 flex-1">
              <p className="eyebrow">En la maleta</p>
              <p data-tone={allDone ? 'success' : undefined} className={allDone ? 'title-page text-tone' : 'title-page'}>
                {allDone ? 'Todo listo' : total - done === 1 ? 'Falta 1 cosa' : `Faltan ${total - done} cosas`}
              </p>
              {/* Cómo va cada categoría, de un vistazo. */}
              <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {categories.map(cat => {
                  const list = grouped.get(cat)!
                  const ready = list.filter(i => i.is_checked).length
                  return (
                    <li key={cat} className={ready === list.length ? 'text-success' : 'text-muted-foreground'}>
                      {cat} <span className="font-medium tabular-nums">{ready}/{list.length}</span>
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>
        )}

        {canEdit && <PackingAdd categories={categories} saving={createItem.isPending} onAdd={addItem} />}

        {isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 rounded-md" />)}
          </div>
        ) : total === 0 ? (
          <Empty
            icon={Luggage}
            title="La lista está vacía"
            description={canEdit
              ? 'Escribe arriba lo primero que te llevas, parte de una plantilla o pide una sugerencia pensada para este viaje.'
              : 'Cuando alguien del viaje prepare la lista, la verás aquí.'}
          >
            {canEdit && suggestButton('soft')}
          </Empty>
        ) : (
          <div className="gap-x-12 md:columns-2 [&>*]:mb-8">
            {categories.map(cat => (
              <PackingCategory
                key={cat}
                name={cat}
                items={grouped.get(cat)!}
                canEdit={canEdit}
                onToggle={(item, checked) => toggleItem.mutate({ id: item.id, is_checked: checked, tripId })}
                onDelete={item => deleteItem.mutate({ id: item.id, tripId })}
              />
            ))}
          </div>
        )}
      </Stack>

      {trip && <SuggestPanel open={suggestOpen} onOpenChange={setSuggestOpen} trip={trip} existing={items} />}
    </Page>
  )
}
