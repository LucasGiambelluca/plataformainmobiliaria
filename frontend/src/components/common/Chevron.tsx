/**
 * El chevron naranja chico del diseño M2Prop (7×4 en el hero, 4,6×2,8 en el
 * nav). Es un trazo propio y no el de lucide: el de lucide trae un viewBox de
 * 24 con margen, y a este tamaño queda más fino y corrido del texto.
 */
export default function Chevron({
  className = 'h-[4.3px] w-[7px]',
  open = false,
}: {
  className?: string
  open?: boolean
}) {
  return (
    <svg
      viewBox="0 0 7 4.3"
      aria-hidden
      className={`shrink-0 text-accent transition-transform ${open ? 'rotate-180' : ''} ${className}`}
    >
      <polyline
        points="0.7,0.7 3.5,3.5 6.3,0.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
