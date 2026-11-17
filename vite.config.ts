import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

function buildCommit() {
  const configured = process.env.VITE_BUILD_COMMIT || process.env.VITE_COMMIT_SHA || process.env.GIT_COMMIT_SHA || process.env.COMMIT_SHA;
  if (configured?.trim()) return configured.trim();
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function buildDate() {
  const configured = process.env.BUILD_DATE;
  if (configured?.trim()) return configured.trim();
  if (process.env.SOURCE_DATE_EPOCH) {
    const timestamp = Number(process.env.SOURCE_DATE_EPOCH);
    if (Number.isFinite(timestamp)) return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function normalizeStaticBasePath(value: string | undefined) {
  const basePath = value?.trim() || './';

  if (basePath === './' || basePath === '/') {
    return basePath;
  }

  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const fullCommit = buildCommit();
  const shortCommit = fullCommit ? fullCommit.slice(0, 7) : '';
  const date = buildDate();

  return {
    base: normalizeStaticBasePath(env.VITE_STATIC_BASE_PATH),
    plugins: [react(), tailwindcss()],
    define: {
      __BUILD_COMMIT__: JSON.stringify(shortCommit),
      __BUILD_DATE__: JSON.stringify(date),
    },
    build: {
      rollupOptions: {
        plugins: [{
          name: 'write-release-marker',
          writeBundle() {
            writeFileSync(path.resolve(process.cwd(), 'dist', 'release.json'), `${JSON.stringify({ commit: fullCommit || 'unknown', date })}\n`);
          },
        }],
      },
    },
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
      allowedHosts: true,
    },
    test: {
      exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    },
  };
});
