/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Lora', 'Georgia', 'serif'],
      },
      colors: {
        // Mapeados a CSS variables para re-tematizar por tenant en runtime.
        brand: {
          DEFAULT: 'var(--brand)',
          dark: 'var(--brand-dark)',
          light: 'var(--brand-light)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          dark: 'var(--accent-dark)',
          deep: 'var(--accent-deep)',
        },
        topbar: 'var(--topbar)',
        'hero-overlay': 'var(--hero-overlay)',
        ad: 'var(--ad)',
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
