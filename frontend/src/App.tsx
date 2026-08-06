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
import AgencySite from './pages/AgencySite'
import ComoPublicar from './pages/ComoPublicar'
import InmobiliariasList from './pages/InmobiliariasList'
import Calculadoras from './pages/Calculadoras'
import Tasaciones from './pages/Tasaciones'
import EnConstruccion from './pages/EnConstruccion'
import Dashboard from './pages/panel/Dashboard'
import Properties from './pages/panel/Properties'
import Leads from './pages/panel/Leads'
import TasacionesPanel from './pages/panel/TasacionesPanel'
import Agentes from './pages/panel/Agentes'
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
import { isTenantHost } from './lib/host'

export default function App() {
  const bootstrap = useAuth((s) => s.bootstrap)

  // El host no cambia sin recargar la página, así que se lee una sola vez.
  const enWebDeInmobiliaria = isTenantHost()

  // Rehidrata la sesión una sola vez al montar: el access token vive en memoria
  // y se pierde en cada recarga, la cookie de refresh no.
  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  return (
    <Routes>
      {/* En el subdominio o el dominio propio de una inmobiliaria, la raíz es su
          web y no la home del portal (tarea 4.11). Va fuera de PublicLayout
          porque AgencySite trae su propio encabezado, su marca y su pie. */}
      {enWebDeInmobiliaria && <Route path="/" element={<AgencySite />} />}

      {/* Sitio público */}
      <Route element={<PublicLayout />}>
        {!enWebDeInmobiliaria && <Route path="/" element={<Home />} />}
        <Route path="/buscar" element={<SearchResults />} />
        <Route path="/propiedad/:id" element={<PropertyDetail />} />
        <Route path="/registro" element={<Register />} />
        <Route path="/publicar" element={<ComoPublicar />} />
        <Route path="/inmobiliarias" element={<InmobiliariasList />} />
        <Route path="/calculadoras" element={<Calculadoras />} />
        <Route path="/tasaciones" element={<Tasaciones />} />
        <Route path="/garantias" element={<EnConstruccion title="Garantías de Alquiler" />} />
        <Route path="/seguros" element={<EnConstruccion title="Seguros" />} />
      </Route>

      {/* Login: pantalla propia, sin el chrome del sitio público */}
      <Route path="/login" element={<Login />} />

      {/* Web propia de cada inmobiliaria: marca y colores del tenant, fuera
          del chrome del portal. Mañana la misma pantalla se sirve por
          subdominio o dominio propio, resolviendo el tenant por Host. */}
      <Route path="/inmobiliaria/:slug" element={<AgencySite />} />

      {/* Panel inmobiliaria (tenant) */}
      <Route element={<RequireAuth roles={['tenant_admin', 'agent']} />}>
        <Route path="/panel" element={<PanelLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="propiedades" element={<Properties />} />
          <Route path="leads" element={<Leads />} />
          <Route path="tasaciones" element={<TasacionesPanel />} />

          {/* Secciones que el backend reserva al tenant_admin. El portero se
              repite acá para que un agente que escriba la URL a mano tampoco
              entre, no solo para ocultarlas del menú. */}
          <Route element={<RequireAuth roles={['tenant_admin']} />}>
            <Route path="equipo" element={<Agentes />} />
            <Route path="mi-sitio" element={<MiSitio />} />
            <Route path="dominio" element={<Dominio />} />
            <Route path="suscripcion" element={<Suscripcion />} />
          </Route>
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
