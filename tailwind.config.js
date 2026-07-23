/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        volt: '#D7FF3E',
        ink: '#0A0A0B',
        graphite: '#151517',
        smoke: '#8A8A90',
        bone: '#F3F3EF',
      },
      fontFamily: {
        display: ['Anton', 'Impact', 'sans-serif'],
        body: ['"Space Grotesk"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': {
            opacity: '0.55',
            filter: 'drop-shadow(0 0 12px rgba(215,255,62,0.35))',
          },
          '50%': {
            opacity: '1',
            filter: 'drop-shadow(0 0 38px rgba(215,255,62,0.85))',
          },
        },
        gridScroll: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '0 80px' },
        },
      },
      animation: {
        glowPulse: 'glowPulse 2.4s ease-in-out infinite',
        gridScroll: 'gridScroll 6s linear infinite',
      },
    },
  },
  plugins: [],
};
