import type { AgencyZone, Property } from '../types'

// Placeholder images from a free CDN (Unsplash). Swap for tenant media later.
const img = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=70`

export const properties: Property[] = [
  {
    id: '1',
    title: 'Casa 3 ambientes con jardín',
    operation: 'venta',
    type: 'casa',
    price: 150000000,
    currency: 'ARS',
    address: 'Calle Falsa 123',
    city: 'Lomas de Zamora',
    rooms: 3,
    bathrooms: 2,
    area: 110,
    image: img('photo-1568605114967-8130f3a36994'),
    featured: true,
    agency: 'Inmobiliaria Norte',
  },
  {
    id: '2',
    title: 'Departamento 2 amb. a estrenar',
    operation: 'venta',
    type: 'departamento',
    price: 107000000,
    currency: 'ARS',
    address: 'Av. Mitre 4500',
    city: 'Avellaneda',
    rooms: 2,
    bathrooms: 1,
    area: 55,
    image: img('photo-1512917774080-9991f1c4c750'),
    discounted: true,
    agency: 'Sur Propiedades',
  },
  {
    id: '3',
    title: 'PH reciclado con terraza',
    operation: 'alquiler',
    type: 'ph',
    price: 350000,
    currency: 'ARS',
    address: 'Belgrano 880',
    city: 'Quilmes',
    rooms: 3,
    bathrooms: 1,
    area: 78,
    image: img('photo-1570129477492-45c003edd2be'),
    featured: true,
    agency: 'Quilmes Hogar',
  },
  {
    id: '4',
    title: 'Casa quinta con pileta',
    operation: 'venta',
    type: 'casa',
    price: 252000000,
    currency: 'ARS',
    address: 'Los Aromos 50',
    city: 'Esteban Echeverría',
    rooms: 4,
    bathrooms: 3,
    area: 240,
    image: img('photo-1599809275671-b5942cabc7a2'),
    agency: 'Echeverría Estates',
  },
  {
    id: '5',
    title: 'Local comercial sobre avenida',
    operation: 'alquiler',
    type: 'local',
    price: 480000,
    currency: 'ARS',
    address: 'Av. Hipólito Yrigoyen 9000',
    city: 'Lanús',
    rooms: 0,
    bathrooms: 1,
    area: 90,
    image: img('photo-1441986300917-64674bd600d8'),
    discounted: true,
    agency: 'Lanús Comercial',
  },
  {
    id: '6',
    title: 'Departamento monoambiente luminoso',
    operation: 'temporal',
    type: 'departamento',
    price: 65000,
    currency: 'ARS',
    address: 'San Martín 120',
    city: 'Berazategui',
    rooms: 1,
    bathrooms: 1,
    area: 32,
    image: img('photo-1502672260266-1c1ef2d93688'),
    agency: 'Bera Rentas',
  },
]

export const featuredProperties = properties.filter(
  (p) => p.featured || p.discounted,
)

export const agencyZones: AgencyZone[] = [
  {
    zone: 'Zona Sur',
    cities: [
      { name: 'Almirante Brown', count: 101 },
      { name: 'Berazategui', count: 14 },
      { name: 'Avellaneda', count: 31 },
      { name: 'Esteban Echeverría', count: 90 },
      { name: 'Lanús', count: 85 },
      { name: 'Lomas de Zamora', count: 120 },
      { name: 'Quilmes', count: 15 },
      { name: 'Florencio Varela', count: 8 },
      { name: 'San Vicente', count: 12 },
      { name: 'Ezeiza', count: 35 },
    ],
  },
  {
    zone: 'Costa Atlántica',
    cities: [
      { name: 'Costa Azul', count: 2 },
      { name: 'La Lucila del Mar', count: 4 },
      { name: 'Mar de Ajó', count: 21 },
      { name: 'Pinamar', count: 8 },
      { name: 'San Bernardo', count: 35 },
      { name: 'Santa Teresita', count: 9 },
      { name: 'Mar del Tuyú', count: 15 },
      { name: 'Villa Gesell', count: 3 },
      { name: 'Las Toninas', count: 4 },
      { name: 'San Clemente', count: 4 },
    ],
  },
]

export const operationLabels: Record<string, string> = {
  venta: 'Venta',
  alquiler: 'Alquiler',
  temporal: 'Temporal',
}

export const typeLabels: Record<string, string> = {
  casa: 'Casa',
  departamento: 'Departamento',
  ph: 'PH',
  terreno: 'Terreno',
  local: 'Local',
  oficina: 'Oficina',
}

export function formatPrice(p: Property): string {
  const n = p.price.toLocaleString('es-AR')
  return p.currency === 'USD' ? `USD ${n}` : `$ ${n}`
}

// Format a raw number as Argentine pesos (e.g. 59900 -> "$ 59.900").
export function formatARS(n: number): string {
  return `$ ${n.toLocaleString('es-AR')}`
}
