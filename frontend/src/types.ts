export type Operation = 'venta' | 'alquiler' | 'temporal'

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
  agency: string
}

export interface AgencyZone {
  zone: string
  cities: { name: string; count: number }[]
}
