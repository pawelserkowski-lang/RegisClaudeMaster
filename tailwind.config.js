/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Witcher-inspired color palette
        witcher: {
          silver: '#c0c0c0',
          gold: '#ffd700',
          blood: '#8b0000',
          dark: '#1a1a2e',
          steel: '#4a5568',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px theme(colors.amber.500)' },
          '100%': { boxShadow: '0 0 20px theme(colors.amber.500)' },
        },
      },
    },
  },
  plugins: [],
}
