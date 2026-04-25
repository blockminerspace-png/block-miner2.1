/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0F19', // Dark background
        surface: '#1A1F2C', // Card background
        primary: '#3B82F6', // Brand blue
        accent: '#8B5CF6', // Purple accent
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(28px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(28px, -24px) scale(1.06)' },
          '66%': { transform: 'translate(-22px, 16px) scale(0.94)' },
        },
        gridPulse: {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.55' },
        },
        logoRing: {
          '0%, 100%': {
            boxShadow:
              '0 0 0 0 rgba(59, 130, 246, 0.35), 0 10px 25px -5px rgba(59, 130, 246, 0.22)',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow:
              '0 0 24px 2px rgba(59, 130, 246, 0.28), 0 14px 32px -5px rgba(59, 130, 246, 0.38)',
            transform: 'scale(1.03)',
          },
        },
        logoFloat: {
          '0%, 100%': { transform: 'translateY(0) scale(1)' },
          '50%': { transform: 'translateY(-2px) scale(1.04)' },
        },
        logoShimmer: {
          '0%': { backgroundPosition: '200% center' },
          '100%': { backgroundPosition: '-200% center' },
        },
        logoBlockPulse: {
          '0%, 100%': { opacity: '1', filter: 'brightness(1)' },
          '50%': { opacity: '0.92', filter: 'brightness(1.08)' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.9s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        fadeIn: 'fadeIn 1.2s ease-out forwards',
        blob: 'blob 20s ease-in-out infinite',
        'blob-slow': 'blob 28s ease-in-out infinite',
        'blob-delay': 'blob 24s ease-in-out infinite 3s',
        gridPulse: 'gridPulse 8s ease-in-out infinite',
        'logo-ring': 'logoRing 3.2s ease-in-out infinite',
        'logo-float': 'logoFloat 4s ease-in-out infinite',
        'logo-shimmer': 'logoShimmer 3.5s linear infinite',
        'logo-block-pulse': 'logoBlockPulse 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

