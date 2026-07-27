import {
  Building2,
  CreditCard,
  Globe,
  Inbox,
  LayoutDashboard,
} from 'lucide-react'
import DashShell from './DashShell'
import type { NavItem } from './Sidebar'

const items: NavItem[] = [
  { to: '/panel', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/panel/propiedades', label: 'Propiedades', icon: Building2 },
  { to: '/panel/leads', label: 'Leads', icon: Inbox },
  { to: '/panel/mi-sitio', label: 'Mi Sitio Web', icon: Globe },
  { to: '/panel/dominio', label: 'Dominio Propio', icon: Globe },
  { to: '/panel/suscripcion', label: 'Suscripción', icon: CreditCard },
]

export default function PanelLayout() {
  // El nombre de la inmobiliaria todavía no se puede mostrar: no existe un
  // endpoint que devuelva el perfil del tenant de la sesión (módulo sites).
  return (
    <DashShell
      brandHome="/panel"
      title="Inmobiliaria"
      subtitle="Panel de gestión"
      items={items}
    />
  )
}
