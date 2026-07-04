import { Route, Routes } from 'react-router-dom'
import PublicLayout from './components/layout/PublicLayout'
import PanelLayout from './components/panel/PanelLayout'
import Home from './pages/Home'
import SearchResults from './pages/SearchResults'
import PropertyDetail from './pages/PropertyDetail'
import Register from './pages/Register'
import ComoPublicar from './pages/ComoPublicar'
import InmobiliariasList from './pages/InmobiliariasList'
import Dashboard from './pages/panel/Dashboard'
import Properties from './pages/panel/Properties'
import Leads from './pages/panel/Leads'
import MiSitio from './pages/panel/MiSitio'
import Dominio from './pages/panel/Dominio'
import Suscripcion from './pages/panel/Suscripcion'
import AdminLayout from './components/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import Tenants from './pages/admin/Tenants'
import Plans from './pages/admin/Plans'
import AdminDomains from './pages/admin/AdminDomains'
import Audit from './pages/admin/Audit'

export default function App() {
  return (
    <Routes>
      {/* Sitio público */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/buscar" element={<SearchResults />} />
        <Route path="/propiedad/:id" element={<PropertyDetail />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/publicar" element={<ComoPublicar />} />
        <Route path="/inmobiliarias" element={<InmobiliariasList />} />
      </Route>

      {/* Panel inmobiliaria (tenant) */}
      <Route path="/panel" element={<PanelLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="propiedades" element={<Properties />} />
        <Route path="leads" element={<Leads />} />
        <Route path="mi-sitio" element={<MiSitio />} />
        <Route path="dominio" element={<Dominio />} />
        <Route path="suscripcion" element={<Suscripcion />} />
      </Route>

      {/* Panel Super Admin (global) */}
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<AdminDashboard />} />
        <Route path="inmobiliarias" element={<Tenants />} />
        <Route path="planes" element={<Plans />} />
        <Route path="dominios" element={<AdminDomains />} />
        <Route path="auditoria" element={<Audit />} />
      </Route>
    </Routes>
  )
}
