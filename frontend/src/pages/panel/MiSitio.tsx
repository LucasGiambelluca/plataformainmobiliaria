import { useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import Button from '../../components/common/Button'
import Input from '../../components/common/Input'

const initialImages = [
  'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=400&q=60',
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994?auto=format&fit=crop&w=400&q=60',
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=400&q=60',
]

export default function MiSitio() {
  const [primary, setPrimary] = useState('#0f3359')
  const [secondary, setSecondary] = useState('#baa67a')
  const [images, setImages] = useState(initialImages)
  const [published, setPublished] = useState(true)

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-base text-ink">
            Mi Sitio Web
          </h1>
          <p className="text-muted">Branding y contenido de tu web propia.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 accent-[var(--brand)]"
            />
            Publicado
          </label>
          <Button>Guardar cambios</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Branding */}
        <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
          <h2 className="text-lg font-semibold tracking-base text-ink">Branding</h2>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <ColorField label="Color primario" value={primary} onChange={setPrimary} />
            <ColorField label="Color secundario" value={secondary} onChange={setSecondary} />
          </div>
          <div className="mt-4 space-y-4">
            <Input label="Título del hero" defaultValue="Tu próxima propiedad te espera" />
            <Input label="Subtítulo" defaultValue="Más de 30 años acompañando a familias." />
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-ink">
                Sobre nosotros
              </span>
              <textarea
                rows={3}
                defaultValue="Somos una inmobiliaria de zona sur con foco en atención personalizada."
                className="w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-ink focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </label>
          </div>
        </div>

        {/* Redes + preview */}
        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="text-lg font-semibold tracking-base text-ink">
              Redes sociales
            </h2>
            <div className="mt-4 space-y-3">
              <Input label="Facebook" placeholder="https://facebook.com/tu-inmobiliaria" />
              <Input label="Instagram" placeholder="https://instagram.com/tu-inmobiliaria" />
              <Input label="WhatsApp" placeholder="+54 9 11 ..." />
            </div>
          </div>

          {/* Theme preview */}
          <div className="rounded-lg border border-line bg-surface p-6 shadow-card">
            <h2 className="mb-3 text-lg font-semibold tracking-base text-ink">
              Vista previa del tema
            </h2>
            <div
              className="rounded-lg p-6 text-white"
              style={{ background: primary }}
            >
              <p className="text-lg font-bold">Inmobiliaria Norte</p>
              <p className="text-sm text-white/80">Tu próxima propiedad te espera</p>
              <button
                className="mt-3 rounded-pill px-4 py-1.5 text-sm font-medium text-white"
                style={{ background: secondary }}
              >
                Ver propiedades
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Carrousel editor */}
      <div className="mt-6 rounded-lg border border-line bg-surface p-6 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-base text-ink">
            Carrousel hero
          </h2>
          <Button variant="secondary">
            <Plus className="h-4 w-4" />
            Agregar imagen
          </Button>
        </div>
        <ul className="space-y-3">
          {images.map((src, i) => (
            <li
              key={src}
              className="flex items-center gap-3 rounded-lg border border-line p-2"
            >
              <GripVertical className="h-5 w-5 cursor-grab text-muted" />
              <img src={src} alt="" className="h-14 w-20 rounded object-cover" />
              <span className="text-sm text-muted">Imagen {i + 1}</span>
              <button
                onClick={() => setImages((im) => im.filter((s) => s !== src))}
                className="ml-auto rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-600"
                aria-label="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="text-sm uppercase text-ink">{value}</span>
      </div>
    </label>
  )
}
