import { useEffect } from 'react'
import { Route, Routes } from 'react-router-dom'
import PublicLayout from './components/layout/PublicLayout'
import PanelLayout from './components/panel/PanelLayout'
import RequireAuth from './components/auth/RequireAuth'
import Home from './pages/Home'
import SearchResults from './pages/SearchResults'
import PropertyDetail from './pages/PropertyDetail'
import Register from './pages/Register'
import Login from './pages/Login'
import ComoPublicar from './pages/ComoPublicar'
import InmobiliariasList from './pages/InmobiliariasList'
import EnConstruccion from './pages/EnConstruccion'
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
import { useAuth } from './store/auth'

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)

  // Rehidrata la sesión una sola vez al montar: el access token vive en memoria
  // y se pierde en cada recarga, la cookie de refresh no.
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

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
        <Route path="/calculadoras" element={<EnConstruccion title="Calculadoras" />} />
        <Route path="/tasaciones" element={<EnConstruccion title="Tasaciones Online" />} />
        <Route path="/garantias" element={<EnConstruccion title="Garantías de Alquiler" />} />
        <Route path="/seguros" element={<EnConstruccion title="Seguros" />} />
      </Route>

      {/* Login: pantalla propia, sin el chrome del sitio público */}
      <Route path="/login" element={<Login />} />

      {/* Panel inmobiliaria (tenant) */}
      <Route element={<RequireAuth roles={['tenant_admin', 'agent']} />}>
        <Route path="/panel" element={<PanelLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="propiedades" element={<Properties />} />
          <Route path="leads" element={<Leads />} />
          <Route path="mi-sitio" element={<MiSitio />} />
          <Route path="dominio" element={<Dominio />} />
          <Route path="suscripcion" element={<Suscripcion />} />
        </Route>
      </Route>

      {/* Panel Super Admin (global) */}
      <Route element={<RequireAuth roles={['super_admin']} />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="inmobiliarias" element={<Tenants />} />
          <Route path="planes" element={<Plans />} />
          <Route path="dominios" element={<AdminDomains />} />
          <Route path="auditoria" element={<Audit />} />
        </Route>
      </Route>
    </Routes>
  )
}
