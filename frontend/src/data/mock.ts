// Avisos ficticios para los espacios publicitarios vendibles (ui.pdf).
//
// Es lo único que queda mockeado en el frontend: la publicidad está fuera del
// alcance del plan estratégico, así que no hay módulo de backend del que
// leerla. El resto de este archivo se fue borrando a medida que cada pantalla
// se conectó a la API; el directorio de inmobiliarias fue el último (tarea 4.7).

export interface Ad {
  advertiser: string
  headline: string
  tagline: string
  cta: string
  /** Clases tailwind del fondo del banner. */
  bg: string
}

export const ads: Ad[] = [
  {
    advertiser: 'Banco del Litoral',
    headline: 'Créditos hipotecarios UVA',
    tagline: 'Tu casa propia está más cerca de lo que pensás.',
    cta: 'Simulá tu cuota',
    bg: 'bg-gradient-to-r from-brand-dark via-brand to-brand-light',
  },
  {
    advertiser: 'Litoral Seguros',
    headline: 'Protegé tu hogar desde $12.900/mes',
    tagline: 'Incendio, robo y responsabilidad civil en un solo plan.',
    cta: 'Cotizar ahora',
    bg: 'bg-gradient-to-r from-accent-deep via-accent-dark to-accent',
  },
  {
    advertiser: 'Corralón El Cimiento',
    headline: 'Todo para construir o refaccionar',
    tagline: 'Envíos sin cargo a toda la provincia de Entre Ríos.',
    cta: 'Ver catálogo',
    bg: 'bg-gradient-to-r from-ink via-[#3a3a3a] to-[#555555]',
  },
]
