export interface Lead {
  id: string
  name: string
  email: string
  phone: string
  property: string
  message: string
  status: 'new' | 'contacted' | 'closed'
  date: string
}

export interface CustomDomain {
  id: string
  domain: string
  status: 'pending' | 'verifying' | 'active' | 'failed'
  dnsTarget: string
}

export const leads: Lead[] = [
  {
    id: 'l1',
    name: 'Martín Pérez',
    email: 'martin.perez@mail.com',
    phone: '+54 11 5555-1234',
    property: 'Casa 3 ambientes con jardín',
    message: 'Hola, quería coordinar una visita para el fin de semana.',
    status: 'new',
    date: '2026-06-11',
  },
  {
    id: 'l2',
    name: 'Lucía Fernández',
    email: 'lucia.f@mail.com',
    phone: '+54 11 4444-9876',
    property: 'Departamento 2 amb. a estrenar',
    message: '¿Acepta crédito hipotecario? Me interesa mucho.',
    status: 'contacted',
    date: '2026-06-10',
  },
  {
    id: 'l3',
    name: 'Diego Sosa',
    email: 'diego.sosa@mail.com',
    phone: '+54 11 3333-4567',
    property: 'PH reciclado con terraza',
    message: 'Consulta por expensas y disponibilidad.',
    status: 'closed',
    date: '2026-06-08',
  },
  {
    id: 'l4',
    name: 'Carla Méndez',
    email: 'carla.mendez@mail.com',
    phone: '+54 11 2222-8910',
    property: 'Casa quinta con pileta',
    message: '¿Sigue disponible? Quiero más fotos del interior.',
    status: 'new',
    date: '2026-06-12',
  },
]

export const domains: CustomDomain[] = [
  {
    id: 'd1',
    domain: 'www.inmobiliaria-norte.com',
    status: 'active',
    dnsTarget: 'cname.inmohub.com',
  },
  {
    id: 'd2',
    domain: 'propiedades.norte.com.ar',
    status: 'verifying',
    dnsTarget: 'cname.inmohub.com',
  },
]

export const subscription = {
  plan: 'Pro',
  price: '$ 59.900 / mes',
  status: 'active' as const,
  renews: '2026-07-01',
  usage: [
    { label: 'Propiedades', used: 38, max: 100 },
    { label: 'Usuarios / agentes', used: 4, max: 10 },
    { label: 'Almacenamiento', used: 6.2, max: 20, unit: 'GB' },
  ],
}

export const leadStatusLabels: Record<Lead['status'], string> = {
  new: 'Nuevo',
  contacted: 'Contactado',
  closed: 'Cerrado',
}

export const domainStatusLabels: Record<CustomDomain['status'], string> = {
  pending: 'Pendiente',
  verifying: 'Verificando',
  active: 'Activo',
  failed: 'Fallido',
}
