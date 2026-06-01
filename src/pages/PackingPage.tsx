import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Package, Trash2, Check, ChevronDown, Loader2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import {
  usePackingItems, useCreatePackingItem, useTogglePackingItem,
  useDeletePackingItem, useBulkCreatePackingItems,
} from '@/lib/queries/packing'
import { TripHeader } from '@/components/trips/TripHeader'
import type { PackingItem } from '@/types/database'

const PACKING_TEMPLATES = [
  {
    label: 'Básico',
    items: [
      { category: 'Documentación', items: ['Pasaporte', 'Billetes', 'Seguro de viaje', 'Reservas de hotel'] },
      { category: 'Ropa', items: ['Camisetas', 'Pantalones', 'Ropa interior', 'Calcetines', 'Ropa de abrigo', 'Zapatos cómodos'] },
      { category: 'Aseo', items: ['Cepillo de dientes', 'Pasta de dientes', 'Desodorante', 'Champú', 'Gel de ducha', 'Crema solar'] },
      { category: 'Electrónica', items: ['Móvil', 'Cargador', 'Adaptador de enchufe', 'Auriculares', 'Cámara'] },
      { category: 'Salud', items: ['Analgésicos', 'Antihistamínicos', 'Tiritas', 'Medicación habitual'] },
    ]
  },
  {
    label: 'Playa',
    items: [
      { category: 'Playa', items: ['Bañador', 'Toalla de playa', 'Crema solar FPS50', 'Gafas de sol', 'Sombrero', 'Chanclas', 'Bolsa de playa'] },
      { category: 'Ropa', items: ['Ropa ligera', 'Vestidos/camisas', 'Shorts'] },
    ]
  },
  {
    label: 'Montaña',
    items: [
      { category: 'Montaña', items: ['Botas de trekking', 'Bastones', 'Chubasquero', 'Mochila', 'Mapa/GPS', 'Cantimplora', 'Snacks energéticos'] },
      { category: 'Ropa técnica', items: ['Pantalones cargo', 'Camisetas transpirables', 'Forro polar', 'Guantes', 'Gorro'] },
    ]
  },
]

export function PackingPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { data: items, isLoading } = usePackingItems(tripId!)
  const createItem = useCreatePackingItem()
  const toggleItem = useTogglePackingItem()
  const deleteItem = useDeletePackingItem()
  const bulkCreate = useBulkCreatePackingItems()

  const [newCategory, setNewCategory] = useState('General')
  const [newName, setNewName] = useState('')
  const [newCatInput, setNewCatInput] = useState('')
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set())
  const [showTemplates, setShowTemplates] = useState(false)

  function addItem() {
    const name = newName.trim()
    const cat = (newCatInput.trim() || newCategory).trim()
    if (!name) return
    createItem.mutate({
      trip_id: tripId!,
      category: cat,
      name,
      is_checked: false,
      order_index: items?.filter(i => i.category === cat).length ?? 0,
    })
    setNewName('')
  }

  function applyTemplate(template: typeof PACKING_TEMPLATES[0]) {
    const allItems: Omit<PackingItem, 'id'>[] = []
    template.items.forEach(cat => {
      cat.items.forEach((name, i) => {
        allItems.push({
          trip_id: tripId!,
          category: cat.category,
          name,
          is_checked: false,
          order_index: i,
        })
      })
    })
    bulkCreate.mutate(allItems)
    setShowTemplates(false)
  }

  const grouped = items?.reduce<Record<string, PackingItem[]>>((acc, item) => {
    acc[item.category] = [...(acc[item.category] ?? []), item]
    return acc
  }, {})

  const totalItems = items?.length ?? 0
  const checkedItems = items?.filter(i => i.is_checked).length ?? 0
  const pct = totalItems > 0 ? (checkedItems / totalItems) * 100 : 0

  const categories = grouped ? Object.keys(grouped) : []

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <TripHeader tripId={tripId!} section="Equipaje" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl font-medium">Equipaje</h1>
          <p className="text-muted-foreground text-sm mt-0.5">{checkedItems} de {totalItems} items listos</p>
        </div>
        <Button
          variant="outline"
          className="gap-2 text-sm"
          onClick={() => setShowTemplates(s => !s)}
          style={{ borderColor: 'var(--border)' }}
        >
          <Copy size={14} />
          Plantillas
        </Button>
      </div>

      {/* Progreso */}
      {totalItems > 0 && (
        <div className="mb-6 p-4 rounded-xl" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">Progreso del equipaje</span>
            <span className="text-sm font-medium" style={{ color: 'var(--primary)' }}>{Math.round(pct)}%</span>
          </div>
          <Progress value={pct} className="h-2" />
        </div>
      )}

      {/* Plantillas */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden mb-6"
          >
            <div className="p-4 rounded-xl" style={{ background: 'var(--card)', border: '1px solid color-mix(in srgb, var(--primary) 20%, transparent)' }}>
              <p className="text-sm font-medium mb-3">Aplicar plantilla</p>
              <div className="flex gap-2 flex-wrap">
                {PACKING_TEMPLATES.map(t => (
                  <Button
                    key={t.label}
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    style={{ borderColor: 'var(--border)' }}
                    onClick={() => applyTemplate(t)}
                    disabled={bulkCreate.isPending}
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Form añadir */}
      <div className="flex gap-2 mb-6">
        <Input
          placeholder="Categoría"
          value={newCatInput}
          onChange={(e) => setNewCatInput(e.target.value)}
          className="w-32 text-sm"
          list="categories-list"
        />
        <datalist id="categories-list">
          {categories.map(c => <option key={c} value={c} />)}
        </datalist>
        <Input
          placeholder="Nuevo item..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addItem()}
          className="flex-1 text-sm"
        />
        <Button
          onClick={addItem}
          disabled={!newName.trim() || createItem.isPending}
          style={{ background: 'var(--gradient-primary)', color: 'var(--primary-foreground)' }}
        >
          {createItem.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32" style={{ background: 'var(--secondary)' }} />
          ))}
        </div>
      ) : !items?.length ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Package size={48} className="mb-4 text-muted-foreground" />
          <h3 className="font-serif text-xl mb-2">Lista vacía</h3>
          <p className="text-muted-foreground text-sm mb-4">Añade items o usa una plantilla para empezar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped ?? {}).map(([cat, catItems]) => {
            const collapsed = collapsedCats.has(cat)
            const checkedCat = catItems.filter(i => i.is_checked).length
            return (
              <div key={cat} className="rounded-xl overflow-hidden"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <button
                  onClick={() => setCollapsedCats(prev => {
                    const next = new Set(prev)
                    if (next.has(cat)) next.delete(cat); else next.add(cat)
                    return next
                  })}
                  className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm">{cat}</span>
                    <Badge variant="outline" className="text-xs">{checkedCat}/{catItems.length}</Badge>
                  </div>
                  <ChevronDown
                    size={16}
                    className="text-muted-foreground transition-transform"
                    style={{ transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)' }}
                  />
                </button>

                <AnimatePresence>
                  {!collapsed && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-2">
                        {catItems.map(item => (
                          <div key={item.id} className="flex items-center gap-3 group">
                            <Checkbox
                              checked={item.is_checked}
                              onCheckedChange={(checked) =>
                                toggleItem.mutate({ id: item.id, is_checked: !!checked, tripId: tripId! })
                              }
                              className="flex-shrink-0"
                              style={{ borderColor: item.is_checked ? 'var(--primary)' : 'var(--border)' }}
                            />
                            <span className={`flex-1 text-sm transition-all ${item.is_checked ? 'line-through text-muted-foreground' : ''}`}>
                              {item.name}
                            </span>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="w-6 h-6 opacity-60 hover:opacity-100 text-destructive hover:text-destructive transition-opacity"
                              onClick={() => deleteItem.mutate({ id: item.id, tripId: tripId! })}
                            >
                              <Trash2 size={11} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
