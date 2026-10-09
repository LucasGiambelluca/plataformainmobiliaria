import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import LoginModal from '../auth/LoginModal'

// Provisorio: en producción se muestra solo el header hasta que el resto del
// sitio tenga la marca M2Prop. El modal de login queda para no dejar afuera a
// las inmobiliarias.
const SOLO_HEADER = import.meta.env.VITE_SOLO_HEADER === 'true'

export default function PublicLayout() {
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar onLogin={() => setLoginOpen(true)} />
      {!SOLO_HEADER && (
        <>
          <main className="flex-1">
            <Outlet />
          </main>
          <Footer />
        </>
      )}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  )
}
