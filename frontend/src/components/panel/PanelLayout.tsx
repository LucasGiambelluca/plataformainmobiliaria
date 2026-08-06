import {
  ClipboardList,
  Building2,
  CreditCard,
  Globe,
  Inbox,
  LayoutDashboard,
  Users,
} from 'lucide-react'
import DashShell from './DashShell'
import type { NavItem } from './Sidebar'
import { useAuth } from '../../store/auth'

const items: NavItem[] = [
  { to: '/panel', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/panel/propiedades', label: 'Propiedades', icon: Building2 },
  { to: '/panel/leads', label: 'Leads', icon: Inbox },
  { to: '/panel/tasaciones', label: 'Tasaciones', icon: ClipboardList },
  { to: '/panel/equipo', label: 'Equipo', icon: Users, adminOnly: true },
  { to: '/panel/mi-sitio', label: 'Mi Sitio Web', icon: Globe, adminOnly: true },
  { to: '/panel/dominio', label: 'Dominio Propio', icon: Globe, adminOnly: true },
  { to: '/panel/suscripcion', label: 'Suscripción', icon: CreditCard, adminOnly: true },
]

export default function PanelLayout() {
  const role = useAuth((s) => s.user?.role)

  // Un agente no ve las secciones que el backend le va a negar: mostrarlas
  // sería ofrecerle cuatro pantallas que responden 403.
  const visibles = role === 'tenant_admin' ? items : items.filter((i) => !i.adminOnly)

  // El nombre de la inmobiliaria todavía no se puede mostrar: no existe un
  // endpoint que devuelva el perfil del tenant de la sesión (módulo sites).
  return (
    <DashShell
      brandHome="/panel"
      title="Inmobiliaria"
      subtitle="Panel de gestión"
      items={visibles}
    />
  )
}
