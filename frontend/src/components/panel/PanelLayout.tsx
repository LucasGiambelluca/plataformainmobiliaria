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
  return (
    <DashShell
      brandHome="/panel"
      title="Inmobiliaria"
      subtitle="Inmobiliaria Norte"
      items={items}
      userName="Ana Gómez"
      userRole="Admin · Inmobiliaria Norte"
    />
  )
}
