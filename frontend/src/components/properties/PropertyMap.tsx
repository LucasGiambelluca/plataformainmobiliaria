import { useEffect, useMemo, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { ExternalLink } from 'lucide-react'
import 'leaflet/dist/leaflet.css'

/**
 * Ubicación de la propiedad en el mapa (tareas 4.3 y 4.13).
 *
 * Leaflet con tiles de OpenStreetMap y no Google Maps: no pide clave de API ni
 * cuenta de facturación, así que el mapa funciona en cualquier instalación de la
 * plataforma sin que la inmobiliaria tenga que dar de alta nada.
 *
 * La política de uso de los tiles de OSM exige mantener la atribución visible.
 */

interface Props {
  lat: string | number
  lng: string | number
  title: string
  /** Se muestra bajo el mapa, para ubicarse sin leer coordenadas. */
  address?: string | null
}

const ZOOM = 16

/**
 * Marcador propio en vez del de Leaflet.
 *
 * El ícono por defecto se sirve desde una URL relativa al CSS del paquete, que
 * con un bundler no resuelve: sale el marcador roto. Un divIcon es HTML, no
 * necesita assets, y además toma el color de la marca.
 */
const marcador = L.divIcon({
  className: '',
  html: `<span style="
    display:block;width:22px;height:22px;border-radius:50% 50% 50% 0;
    transform:rotate(-45deg);background:var(--brand,#0F766E);
    border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);
  "></span>`,
  iconSize: [22, 22],
  iconAnchor: [11, 22],
})

/**
 * Habilita el zoom con la rueda recién después de un clic en el mapa.
 *
 * Sin esto, alguien que baja por la ficha con la rueda se queda atrapado
 * haciendo zoom apenas el puntero pasa por encima del mapa.
 */
function ZoomConClic() {
  const map = useMap()
  const [activo, setActivo] = useState(false)

  useEffect(() => {
    const activar = () => setActivo(true)
    map.on('click', activar)
    return () => {
      map.off('click', activar)
    }
  }, [map])

  useEffect(() => {
    if (activo) map.scrollWheelZoom.enable()
    else map.scrollWheelZoom.disable()
  }, [activo, map])

  return null
}

export default function PropertyMap({ lat, lng, title, address }: Props) {
  const centro = useMemo<[number, number] | null>(() => {
    const y = Number(lat)
    const x = Number(lng)
    // Coordenadas fuera de rango o no numéricas: no se dibuja nada. Es un dato
    // que carga a mano la inmobiliaria.
    if (!Number.isFinite(y) || !Number.isFinite(x)) return null
    if (Math.abs(y) > 90 || Math.abs(x) > 180) return null
    return [y, x]
  }, [lat, lng])

  if (!centro) return null

  const [y, x] = centro

  return (
    <div className="mt-6 border-t border-line pt-5">
      <h2 className="text-lg font-semibold tracking-base text-ink">Ubicación</h2>
      {address && <p className="mt-1 text-sm text-muted">{address}</p>}

      <div className="mt-3 overflow-hidden rounded-lg border border-line">
        <MapContainer
          center={centro}
          zoom={ZOOM}
          scrollWheelZoom={false}
          className="h-72 w-full md:h-96"
          // El mapa se anuncia solo: sin esto un lector de pantalla recorre los
          // tiles uno por uno.
          aria-label={`Mapa con la ubicación de ${title}`}
        >
          <TileLayer
            attribution='&copy; colaboradores de <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <Marker position={centro} icon={marcador} title={title} />
          <ZoomConClic />
        </MapContainer>
      </div>

      <p className="mt-2 text-xs text-muted">
        Hacé clic en el mapa para poder hacer zoom con la rueda.{' '}
        <a
          href={`https://www.openstreetmap.org/?mlat=${y}&mlon=${x}#map=${ZOOM}/${y}/${x}`}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 text-brand hover:underline"
        >
          Abrir en OpenStreetMap
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      </p>
    </div>
  )
}
