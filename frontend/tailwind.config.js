/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Mapped to CSS variables so each tenant can re-theme at runtime.
        brand: {
          DEFAULT: 'var(--brand)',
          dark: 'var(--brand-dark)',
          light: 'var(--brand-light)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dark: 'var(--accent-dark)',
        },
        topbar: 'var(--topbar)',
        ink: 'var(--text)',
        muted: 'var(--text-secondary)',
        line: 'var(--border)',
        surface: 'var(--card)',
        canvas: 'var(--bg)',
      },
      borderRadius: {
        pill: '200px',
      },
      boxShadow: {
        card: '0px 2px 8px rgba(0, 0, 0, 0.05)',
        'card-hover': '0px 8px 16px rgba(0, 0, 0, 0.10)',
      },
      letterSpacing: {
        base: '0.5px',
      },
    },
  },
  plugins: [],
}
