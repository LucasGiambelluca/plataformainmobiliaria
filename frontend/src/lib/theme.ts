import type { CSSProperties } from 'react'

/**
 * "#0F3258" → "15 50 88".
 *
 * Las CSS variables del design system guardan canales, no hex, porque es lo
 * que Tailwind necesita para poder aplicar opacidad (ver index.css). Un color
 * que llega de la base tiene que pasar por acá antes de inyectarse.
 */
export function hexToChannels(hex: string): string | null {
  const limpio = hex.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(limpio)) return null

  const n = parseInt(limpio, 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** Oscurece un color para el estado hover/active, sin pedirle dos al usuario. */
export function darken(hex: string, amount = 0.25): string | null {
  const channels = hexToChannels(hex)
  if (!channels) return null

  return channels
    .split(' ')
    .map((c) => Math.round(Number(c) * (1 - amount)))
    .join(' ')
}

export interface TenantColors {
  primaryColor: string | null
  secondaryColor: string | null
}

/**
 * Variables CSS del tenant para aplicar en un contenedor. Al ir inline y
 * acotadas a ese subárbol, el resto de la app conserva la paleta del portal:
 * no hay estado global que limpiar al salir de la web de una inmobiliaria.
 */
export function tenantThemeStyle({
  primaryColor,
  secondaryColor,
}: TenantColors): CSSProperties {
  const style: Record<string, string> = {}

  if (primaryColor) {
    const brand = hexToChannels(primaryColor)
    const brandDark = darken(primaryColor)
    if (brand) {
      style['--brand'] = brand
      style['--topbar'] = brand
      style['--hero-overlay'] = brand
    }
    if (brandDark) style['--brand-dark'] = brandDark
  }

  if (secondaryColor) {
    const accent = hexToChannels(secondaryColor)
    const accentDark = darken(secondaryColor)
    if (accent) style['--accent'] = accent
    if (accentDark) {
      style['--accent-dark'] = accentDark
      style['--accent-deep'] = accentDark
    }
  }

  return style as CSSProperties
}
