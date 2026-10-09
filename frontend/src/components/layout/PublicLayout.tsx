import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import Navbar from './Navbar'
import Footer from './Footer'
import LoginModal from '../auth/LoginModal'

export default function PublicLayout() {
  const [loginOpen, setLoginOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar onLogin={() => setLoginOpen(true)} />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  )
}
