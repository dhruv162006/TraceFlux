import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0b0d',
          surface: '#111318',
          elevated: '#1a1d24',
          hover: '#22262f',
        },
        border: '#2a2f3a',
        text: {
          primary: '#e8eaf0',
          secondary: '#8b91a1',
          muted: '#555c6e',
        },
        accent: {
          blue: '#4f8ef7',
          teal: '#2dd4bf',
          amber: '#fbbf24',
          red: '#f87171',
          purple: '#a78bfa',
          green: '#4ade80',
        },
      },
    },
  },
  plugins: [],
};

export default config;
