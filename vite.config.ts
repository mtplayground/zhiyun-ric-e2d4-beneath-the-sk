import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

function normalizeStaticBasePath(value: string | undefined) {
  const basePath = value?.trim() || './';

  if (basePath === './' || basePath === '/') {
    return basePath;
  }

  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: normalizeStaticBasePath(env.VITE_STATIC_BASE_PATH),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 8080,
    },
    preview: {
      host: '0.0.0.0',
      port: 8080,
    },
    test: {
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
  };
});
