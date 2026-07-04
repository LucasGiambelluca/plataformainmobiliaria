import type { ReactNode } from 'react'

type Tone = 'brand' | 'accent' | 'success' | 'warning' | 'neutral' | 'danger'

const tones: Record<Tone, string> = {
  brand: 'bg-brand/10 text-brand-dark',
  accent: 'bg-accent/15 text-accent-dark',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  neutral: 'bg-line/60 text-muted',
  danger: 'bg-red-100 text-red-700',
}

export default function Badge({
  tone = 'neutral',
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
