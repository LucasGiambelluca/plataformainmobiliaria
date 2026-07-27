/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      // Mapeados a CSS variables para re-tematizar por tenant en runtime.
      //
      // El envoltorio rgb(... / <alpha-value>) no es decorativo: es lo que
      // permite que funcionen los modificadores de opacidad. Con 'var(--brand)'
      // a secas, Tailwind emite la clase bg-brand/80 SIN la transparencia y no
      // avisa. Por eso las variables de index.css guardan canales, no hex.
      colors: {
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          dark: 'rgb(var(--brand-dark) / <alpha-value>)',
          light: 'rgb(var(--brand-light) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dark: 'rgb(var(--accent-dark) / <alpha-value>)',
          deep: 'rgb(var(--accent-deep) / <alpha-value>)',
        },
        topbar: 'rgb(var(--topbar) / <alpha-value>)',
        'hero-overlay': 'rgb(var(--hero-overlay) / <alpha-value>)',
        ad: 'rgb(var(--ad) / <alpha-value>)',
        ink: 'rgb(var(--text) / <alpha-value>)',
        muted: 'rgb(var(--text-secondary) / <alpha-value>)',
        line: 'rgb(var(--border) / <alpha-value>)',
        surface: 'rgb(var(--card) / <alpha-value>)',
        canvas: 'rgb(var(--bg) / <alpha-value>)',
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
