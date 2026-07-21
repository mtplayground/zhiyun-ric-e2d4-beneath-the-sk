# Self-Hosted Static Deployment

Beneath the Skin builds to static files in `dist/`. The production artifact does
not require Docker, a Node server, or CI/CD; any static file host can serve the
directory.

## Build

```bash
npm ci
npm run build:static
```

`build:static` runs the Vite production build and then verifies:

- `dist/index.html` exists.
- Compiled JavaScript and CSS bundles exist under `dist/assets/`.
- The default directory-safe asset URLs are valid.
- Local configured assets such as `VITE_POSE_DATA_URL=./data/poses.json`
  resolve inside `dist/`.
- The static artifact does not require any deleted viewport image-map assets;
  the face mesh renders with the glTF asset's own default appearance.

## Environment

Set Vite variables before building. They are compiled into the static bundle.
All variables below have safe defaults, so an unset environment still produces a
working build that loads the default FaceCap mesh and bundled pose data.

```bash
VITE_STATIC_BASE_PATH=./
VITE_FACE_MESH_URL=https://threejs.org/examples/models/gltf/facecap.glb
VITE_POSE_DATA_URL=./data/poses.json
VITE_DEFORMATION_PROVIDER=kinematic-blendshape
VITE_ENABLE_READOUT_PANEL=true
VITE_ENABLE_DEFORMATION_CURVE_PANEL=true
VITE_ENABLE_PRECOMPUTE_PANEL=true
```

Use `VITE_STATIC_BASE_PATH=./` when the directory may be mounted anywhere, such
as `/var/www/beneath-the-skin/` or a nested research-project path. If the site is
always served at a known absolute path, use that path with a trailing slash, for
example `/beneath-the-skin/`.

## Serve

Copy the contents of `dist/` to the static document root.

```bash
rsync -a --delete dist/ /var/www/beneath-the-skin/
```

For nginx, serve the directory directly:

```nginx
server {
  listen 80;
  server_name example.org;
  root /var/www/beneath-the-skin;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
```

For a quick local smoke test:

```bash
npm run preview:static
```

Open `http://localhost:8080/` and confirm the viewport loads the default face
mesh cleanly, with no auxiliary viewport layers or removed rendering
diagnostics. The project header should show the configured face mesh and pose
data paths, the author order should read `Zhiyun Peng, Michael Tao, Eugene
Fiume`, and the preset/keyboard/slider controls should update the readout and
provider-health overlay.
