/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FACE_MESH_URL?: string;
  readonly VITE_POSE_DATA_URL?: string;
  readonly VITE_DEFORMATION_PROVIDER?: string;
  readonly VITE_STATIC_BASE_PATH?: string;
  readonly VITE_ENABLE_READOUT_PANEL?: string;
  readonly VITE_ENABLE_DEFORMATION_CURVE_PANEL?: string;
  readonly VITE_ENABLE_PRECOMPUTE_PANEL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
