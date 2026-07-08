import { Facebook, Instagram, Mail, Youtube } from 'lucide-react'
import { TikTokIcon, WhatsAppIcon } from '../common/BrandIcons'

const socials = [
  { label: 'WhatsApp', href: '#', icon: <WhatsAppIcon className="h-3.5 w-3.5" /> },
  { label: 'Facebook', href: '#', icon: <Facebook className="h-3.5 w-3.5" /> },
  { label: 'Instagram', href: '#', icon: <Instagram className="h-3.5 w-3.5" /> },
  { label: 'YouTube', href: '#', icon: <Youtube className="h-3.5 w-3.5" /> },
  { label: 'Tik Tok', href: '#', icon: <TikTokIcon className="h-3.5 w-3.5" /> },
  { label: 'E-mail', href: 'mailto:', icon: <Mail className="h-3.5 w-3.5" /> },
]

// Franja superior navy con redes sociales, según ui.pdf.
export default function TopBar() {
  return (
    <div className="bg-topbar text-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-8 gap-y-1 px-4 py-1.5 text-[11px] tracking-[0.25em]">
        {socials.map((s) => (
          <a
            key={s.label}
            href={s.href}
            className="flex items-center gap-2 transition-opacity hover:opacity-75"
          >
            {s.icon}
            {s.label}
          </a>
        ))}
      </div>
    </div>
  )
}
