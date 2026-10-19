import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir:'./e2e',testMatch:'physics.spec.ts',timeout:90_000,
  expect:{timeout:15_000},workers:1,retries:0,
  use:{baseURL:'http://127.0.0.1:8081',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --port 8081',url:'http://127.0.0.1:8081',reuseExistingServer:false,timeout:120_000,
    env:{VITE_STATIC_BASE_PATH:'./',VITE_ENABLE_PHYSICS_PANEL:'true',VITE_DEFORMATION_PROVIDER:'kinematic-blendshape',VITE_FACE_MESH_URL:'https://threejs.org/examples/models/gltf/facecap.glb',VITE_SIM_PROXY_URL:'./data/facecap-soft-tissue.bin'}},
  projects:[{name:'chromium-physics',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:900},deviceScaleFactor:1}}],
});
