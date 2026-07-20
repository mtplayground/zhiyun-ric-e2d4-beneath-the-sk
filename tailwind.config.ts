import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        panel: {
          DEFAULT: 'hsl(var(--panel))',
          foreground: 'hsl(var(--panel-foreground))',
          border: 'hsl(var(--panel-border))',
          accent: 'hsl(var(--panel-accent))',
        },
        telemetry: {
          cyan: 'hsl(var(--telemetry-cyan))',
          green: 'hsl(var(--telemetry-green))',
          amber: 'hsl(var(--telemetry-amber))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      boxShadow: {
        panel:
          '0 0 0 1px hsl(var(--panel-border)), 0 18px 60px rgb(0 0 0 / 0.28)',
      },
    },
  },
};

export default config;
