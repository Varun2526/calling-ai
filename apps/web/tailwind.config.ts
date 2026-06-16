import type { Config } from 'tailwindcss';

const config: Config = {
  // Scan app routes, feature slices, shared components, and the design system source.
  content: [
    './app/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Maps to the shadcn-style CSS variables in app/globals.css.
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border))',
        primary: 'hsl(var(--primary))',
      },
    },
  },
  plugins: [],
};

export default config;
