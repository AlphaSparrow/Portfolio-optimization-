/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        fintech: {
          bg: 'var(--bg-page)',
          card: 'var(--bg-card)',
          cardHover: 'var(--bg-card-hover)',
          border: 'var(--border-color)',
          borderSubtle: 'var(--border-hover)',
          subtle: 'var(--bg-subtle)',
          muted: 'var(--bg-muted)',
          positive: 'var(--accent-emerald)',
          negative: 'var(--accent-rose)',
          benchmark: 'var(--accent-blue)',
          amber: 'var(--accent-amber)',
          purple: 'var(--accent-purple)',
          cyan: '#0891b2',
          textHeading: 'var(--text-heading)',
          textBody: 'var(--text-body)',
          textMuted: 'var(--text-muted)',
          textDim: 'var(--text-dim)',
        }
      },
      boxShadow: {
        'fintech-card': 'var(--card-shadow)',
        'fintech-hover': 'var(--card-shadow-hover)',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Courier New', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
}
