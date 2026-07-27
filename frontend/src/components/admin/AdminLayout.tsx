import {
  Building2,
  Globe,
  LayoutDashboard,
  ScrollText,
  Tags,
} from 'lucide-react'
import DashShell from '../panel/DashShell'
import type { NavItem } from '../panel/Sidebar'

const items: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/inmobiliarias', label: 'Inmobiliarias', icon: Building2 },
  { to: '/admin/planes', label: 'Planes', icon: Tags },
  { to: '/admin/dominios', label: 'Dominios', icon: Globe },
  { to: '/admin/auditoria', label: 'Auditoría', icon: ScrollText },
]

export default function AdminLayout() {
  return (
    <DashShell
      brandHome="/admin"
      title="Super Admin"
      subtitle="Plataforma · Global"
      items={items}
    />
  )
}
