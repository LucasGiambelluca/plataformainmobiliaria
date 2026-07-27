export type Operation = 'venta' | 'alquiler' | 'temporal'

// Categorías especiales del portal (ui.pdf): además de la operación,
// una propiedad puede pertenecer a emprendimiento / countries / campo.
export type PropertyCategory = 'emprendimiento' | 'countries' | 'campo'

// Estado de avance de un emprendimiento (sub-filtros de ui.pdf).
export type DevelopmentStatus =
  | 'en_pozo'
  | 'en_construccion'
  | 'terminado'
  | 'fideicomiso'

export type PropertyType =
  | 'casa'
  | 'departamento'
  | 'ph'
  | 'terreno'
  | 'local'
  | 'oficina'

export interface Property {
  id: string
  title: string
  operation: Operation
  type: PropertyType
  price: number
  currency: 'USD' | 'ARS'
  address: string
  city: string
  rooms: number
  bathrooms: number
  area: number
  image: string
  featured?: boolean
  discounted?: boolean
  category?: PropertyCategory
  developmentStatus?: DevelopmentStatus
  agency: string
}

export interface AgencyZone {
  zone: string
  cities: { name: string; count: number }[]
}

// Inmobiliaria del directorio público (a futuro: tenant de la plataforma).
export interface Agency {
  id: string
  name: string
  city: string
  zone: string
  address: string
  phone: string
  propertiesCount: number
}
