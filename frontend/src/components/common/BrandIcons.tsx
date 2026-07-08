// Iconos de marcas que lucide-react no incluye (WhatsApp, TikTok).
// Paths simplificados, heredan color vía currentColor.

interface IconProps {
  className?: string
}

export function WhatsAppIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8ZM8.9 7.2c-.2 0-.5 0-.7.3-.2.3-.9.9-.9 2.1s.9 2.5 1 2.6c.1.2 1.8 2.8 4.3 3.8 2.1.9 2.6.7 3 .7.5 0 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2l-.5-.3-1.7-.8c-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.1-.2 0-.4.1-.5l.6-.7c.1-.2.1-.3.2-.5v-.4L10 7.6c-.2-.4-.4-.4-.6-.4h-.5Z" />
    </svg>
  )
}

export function TikTokIcon({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M16.6 2h-3v13.4a2.5 2.5 0 1 1-2.5-2.5c.2 0 .5 0 .7.1V9.9a5.6 5.6 0 1 0 4.8 5.5V8.7A7.3 7.3 0 0 0 21 10V7a4.4 4.4 0 0 1-4.4-4.4V2Z" />
    </svg>
  )
}
