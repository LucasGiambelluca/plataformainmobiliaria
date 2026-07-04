import type { LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  label: string
  value: string
  delta?: string
  tone?: 'brand' | 'accent'
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  delta,
  tone = 'brand',
}: Props) {
  return (
    <div className="rounded-lg border border-line bg-surface p-5 shadow-card">
      <div className="flex items-center justify-between">
        <span
          className={`grid h-10 w-10 place-items-center rounded-lg ${
            tone === 'brand' ? 'bg-brand/10' : 'bg-accent/15'
          }`}
        >
          <Icon
            className={`h-5 w-5 ${tone === 'brand' ? 'text-brand' : 'text-accent-dark'}`}
          />
        </span>
        {delta && (
          <span className="text-xs font-medium text-emerald-600">{delta}</span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-base text-ink">{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </div>
  )
}
