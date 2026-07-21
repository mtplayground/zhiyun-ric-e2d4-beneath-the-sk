import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const distDir = path.resolve(
  projectRoot,
  process.env.STATIC_DIST_DIR ?? 'dist',
);
const envFiles = [
  '.env.example',
  '.env',
  '.env.local',
  '.env.production',
  '.env.production.local',
];
const defaultEnv = {
  VITE_FACE_MESH_URL: 'https://threejs.org/examples/models/gltf/facecap.glb',
  VITE_POSE_DATA_URL: './data/poses.json',
  VITE_STATIC_BASE_PATH: './',
};
const removedViewportEnvNames = [
  'VITE_SKIN_TEXTURE_URL',
  'VITE_EYE_TEXTURE_URL',
  'VITE_ORAL_TEXTURE_URL',
  'VITE_SKIN_COLOR',
  'VITE_FACE_MATERIAL_TRANSFER',
  'VITE_SKIN_PROJECTION_OFFSET_X',
  'VITE_SKIN_PROJECTION_OFFSET_Y',
  'VITE_SKIN_PROJECTION_SCALE',
  'VITE_SKIN_PROJECTION_ROTATION_Y',
  'VITE_ENABLE_PROJECTION_ALIGNMENT_PANEL',
  'VITE_HAIR_MESH_URL',
];
const removedEnvSourceFiles = [
  '.env.example',
  'docs/self-hosting.md',
  'docs/system-overleaf.tex',
  'src/config/env.ts',
];

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');

        if (separatorIndex === -1) {
          return null;
        }

        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1).trim();

        return [key, value.replace(/^['"]|['"]$/g, '')];
      })
      .filter((entry) => entry && entry[0].startsWith('VITE_')),
  );
}

function loadViteEnv() {
  const fileEnv = envFiles.reduce(
    (env, fileName) => ({
      ...env,
      ...parseEnvFile(path.resolve(projectRoot, fileName)),
    }),
    { ...defaultEnv },
  );

  return { ...fileEnv, ...process.env };
}

function normalizeBasePath(value) {
  const basePath = value?.trim() || './';

  if (basePath === './' || basePath === '/') {
    return basePath;
  }

  return basePath.endsWith('/') ? basePath : `${basePath}/`;
}

function fail(message) {
  console.error(`static verify failed: ${message}`);
  process.exitCode = 1;
}

function assertFile(filePath, label) {
  if (!existsSync(filePath)) {
    fail(`${label} missing at ${path.relative(projectRoot, filePath)}`);
    return false;
  }

  return true;
}

function resolveAssetUrl(value, basePath) {
  const baseUrl = new URL(
    normalizeBasePath(basePath),
    'https://self-host.local/',
  );

  try {
    return new URL(value, baseUrl);
  } catch {
    fail(`asset URL "${value}" does not resolve against base ${baseUrl.href}`);
    return null;
  }
}

function localDistPath(url) {
  if (url.origin !== 'https://self-host.local') {
    return null;
  }

  return path.join(
    distDir,
    decodeURIComponent(url.pathname.replace(/^\/+/, '')),
  );
}

const env = loadViteEnv();
const staticBasePath = normalizeBasePath(env.VITE_STATIC_BASE_PATH);
const indexPath = path.join(distDir, 'index.html');
const assetsDir = path.join(distDir, 'assets');

if (!assertFile(indexPath, 'static entrypoint')) {
  process.exit();
}

if (!assertFile(assetsDir, 'compiled assets directory')) {
  process.exit();
}

const indexHtml = readFileSync(indexPath, 'utf8');
const assetFiles = readdirSync(assetsDir);

if (!assetFiles.some((fileName) => fileName.endsWith('.js'))) {
  fail('compiled assets directory has no JavaScript bundle');
}

if (!assetFiles.some((fileName) => fileName.endsWith('.css'))) {
  fail('compiled assets directory has no CSS bundle');
}

for (const relativeFilePath of removedEnvSourceFiles) {
  const sourcePath = path.resolve(projectRoot, relativeFilePath);

  if (!existsSync(sourcePath)) {
    continue;
  }

  const source = readFileSync(sourcePath, 'utf8');
  const lingeringEnvNames = removedViewportEnvNames.filter((envName) =>
    source.includes(envName),
  );

  if (lingeringEnvNames.length > 0) {
    fail(
      `${relativeFilePath} still references removed viewport env variables: ${lingeringEnvNames.join(
        ', ',
      )}`,
    );
  }
}

if (staticBasePath === './' && !indexHtml.includes('./assets/')) {
  fail('index.html does not use relative ./assets/ URLs for directory hosting');
}

for (const [envName, value] of [
  ['VITE_FACE_MESH_URL', env.VITE_FACE_MESH_URL],
  ['VITE_POSE_DATA_URL', env.VITE_POSE_DATA_URL],
]) {
  const resolvedUrl = resolveAssetUrl(value, staticBasePath);

  if (!resolvedUrl) {
    continue;
  }

  const filePath = localDistPath(resolvedUrl);

  if (filePath && !assertFile(filePath, `${envName} local asset`)) {
    continue;
  }

  console.log(`${envName} -> ${resolvedUrl.href}`);
}

if (process.exitCode) {
  process.exit();
}

console.log(`Static build verified in ${path.relative(projectRoot, distDir)}`);
