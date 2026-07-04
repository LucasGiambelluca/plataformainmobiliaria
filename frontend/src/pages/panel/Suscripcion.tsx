import { Check } from 'lucide-react'
import Button from '../../components/common/Button'
import Badge from '../../components/common/Badge'
import { subscription } from '../../data/panelMock'

const plans = [
  {
    name: 'Básico',
    price: '$ 24.900',
    features: ['Hasta 30 propiedades', '2 agentes', '5 GB', 'Web propia'],
    current: false,
  },
  {
    name: 'Pro',
    price: '$ 59.900',
    features: ['Hasta 100 propiedades', '10 agentes', '20 GB', 'Dominio propio'],
    current: true,
  },
  {
    name: 'Enterprise',
    price: '$ 119.900',
    features: ['Propiedades ilimitadas', 'Agentes ilimitados', '100 GB', 'Soporte prioritario'],
    current: false,
  },
]

export default function Suscripcion() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-base text-ink">
          Suscripción
        </h1>
        <p className="text-muted">Tu plan, uso y opciones de upgrade.</p>
      </div>

      {/* Current plan + usage */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Plan {subscription.plan}
            </h2>
            <Badge tone="success">Activo</Badge>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-base text-ink">
            {subscription.price}
          </p>
          <p className="mt-1 text-sm text-muted">
            Se renueva el {subscription.renews}
          </p>
          <Button variant="secondary" className="mt-4 w-full">
            Cancelar al fin del período
          </Button>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <h2 className="mb-4 text-lg font-semibold tracking-base text-ink">
            Uso del plan
          </h2>
          <div className="space-y-5">
            {subscription.usage.map((u) => {
              const pct = Math.min(100, Math.round((u.used / u.max) * 100))
              const unit = 'unit' in u ? ` ${u.unit}` : ''
              return (
                <div key={u.label}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-ink">{u.label}</span>
                    <span className="text-muted">
                      {u.used}
                      {unit} / {u.max}
                      {unit}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-canvas">
                    <div
                      className={`h-full rounded-full ${pct > 85 ? 'bg-accent' : 'bg-brand'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Plans */}
      <h2 className="mb-4 mt-8 text-lg font-semibold tracking-base text-ink">
        Planes disponibles
      </h2>
      <div className="grid gap-6 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`rounded-xl border bg-surface p-6 shadow-card ${
              p.current ? 'border-brand ring-1 ring-brand' : 'border-line'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold tracking-base text-ink">{p.name}</h3>
              {p.current && <Badge tone="brand">Actual</Badge>}
            </div>
            <p className="mt-2 text-2xl font-bold tracking-base text-ink">
              {p.price}
              <span className="text-sm font-normal text-muted"> / mes</span>
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-ink">
                  <Check className="h-4 w-4 text-brand" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              variant={p.current ? 'secondary' : 'primary'}
              className="mt-5 w-full"
              disabled={p.current}
            >
              {p.current ? 'Plan actual' : 'Cambiar a este plan'}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
