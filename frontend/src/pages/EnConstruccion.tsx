interface Props {
  title: string
}

// Stub para secciones del nav (ui.pdf) cuyo contenido llega en fases
// posteriores: Calculadoras, Tasaciones Online, Garantías, Seguros.
export default function EnConstruccion({ title }: Props) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-24 text-center">
      <h1 className="font-serif text-3xl text-brand">{title}</h1>
      <p className="mt-3 text-muted">
        Esta sección está en construcción. Muy pronto vas a poder usarla.
      </p>
    </div>
  )
}
