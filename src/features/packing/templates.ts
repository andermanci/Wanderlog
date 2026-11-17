export interface PackingTemplate {
  label: string
  /** Frase corta que se enseña en el menú. */
  hint: string
  groups: { category: string; items: string[] }[]
}

// Listas de partida. Al aplicarlas no se repite lo que ya esté en la lista.
export const PACKING_TEMPLATES: PackingTemplate[] = [
  {
    label: 'Básico',
    hint: 'Lo de cualquier viaje: papeles, ropa, aseo…',
    groups: [
      { category: 'Documentación', items: ['Pasaporte', 'Billetes', 'Seguro de viaje', 'Reservas de hotel'] },
      { category: 'Ropa', items: ['Camisetas', 'Pantalones', 'Ropa interior', 'Calcetines', 'Ropa de abrigo', 'Zapatos cómodos'] },
      { category: 'Aseo', items: ['Cepillo de dientes', 'Pasta de dientes', 'Desodorante', 'Champú', 'Gel de ducha', 'Crema solar'] },
      { category: 'Electrónica', items: ['Móvil', 'Cargador', 'Adaptador de enchufe', 'Auriculares', 'Cámara'] },
      { category: 'Salud', items: ['Analgésicos', 'Antihistamínicos', 'Tiritas', 'Medicación habitual'] },
    ],
  },
  {
    label: 'Playa',
    hint: 'Bañador, toalla, crema solar…',
    groups: [
      { category: 'Playa', items: ['Bañador', 'Toalla de playa', 'Crema solar FPS50', 'Gafas de sol', 'Sombrero', 'Chanclas', 'Bolsa de playa'] },
      { category: 'Ropa', items: ['Ropa ligera', 'Vestidos/camisas', 'Shorts'] },
    ],
  },
  {
    label: 'Montaña',
    hint: 'Botas, chubasquero, ropa técnica…',
    groups: [
      { category: 'Montaña', items: ['Botas de trekking', 'Bastones', 'Chubasquero', 'Mochila', 'Mapa/GPS', 'Cantimplora', 'Snacks energéticos'] },
      { category: 'Ropa técnica', items: ['Pantalones cargo', 'Camisetas transpirables', 'Forro polar', 'Guantes', 'Gorro'] },
    ],
  },
]
