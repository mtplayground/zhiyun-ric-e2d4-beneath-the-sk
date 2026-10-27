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

## Soft-tissue physics

`VITE_DEFORMATION_PROVIDER=kinematic-blendshape` remains the default.
Set `VITE_DEFORMATION_PROVIDER=xpbd-soft-tissue` to start with physics enabled.
The viewport's **Physics On/Off** button switches between both providers without
reloading the face mesh. Turning it off immediately restores the pure blendshape
pose. Presets, keyboard input, sliders, numeric readout and curves use the same
blendshape weights in both modes.

`VITE_SIM_PROXY_URL` selects the STP1 simulation binary. Its default is
`data/facecap-soft-tissue.bin` under Vite's configured base path; the example env
uses `./data/facecap-soft-tissue.bin`. A custom face mesh needs a matching proxy
from `npm run generate:soft-tissue -- --source ...`. The app validates the binary
against the exact mesh bytes parsed by the loader and the render vertex count.
A mismatch appears in Provider Health and leaves the kinematic pose visible.
No second mesh fetch is used for this validation.

Physics runs in a module Web Worker with transferable buffers. Worker failures
use the reduced-substep main-thread fallback, reported in Provider Health.
Disabling physics or unmounting the viewport stops the backend. Deploy the Vite
worker chunk alongside the application; SharedArrayBuffer and cross-origin
isolation headers are not required.

Rendering adds only `embedding(simulatedNodes - matchingPoseTargets)` after
blendshape evaluation. The embedding converts proxy units back to mesh accessor
units. A sample carries the targets used by its solve, so worker latency cannot
accidentally subtract a different pose. Coincident simulated/target nodes yield
zero offsets; the neutral render surface is never reconstructed from the coarse
proxy. Physics shading currently retains the blendshape normal field.

### Optional physics controls

The **Soft-tissue physics** section is visible by default. Set
`VITE_ENABLE_PHYSICS_PANEL=false` to hide it independently of provider selection.
Both switches use runtime diagnostics to show actual readiness and the active
backend, or the inactive reason; requesting physics alone never displays On.

Skin and inner-layer pose stiffness are separate soft targets in N/m. Edge
stiffness controls resistance to changes from the posed edge lengths. Damping
uses inverse seconds. Gravity defaults to 9.81 m/s² along the recorded scene
vertical vector and is converted once using the proxy's calibrated physical
scale. Zero gravity disables that force. All nodes use stored SI masses.

The Physical preset retains the SI defaults. Visible demonstration uses
98.1 m/s² gravity, skin stiffness 20, edge stiffness 200 and damping 8; the UI
labels this exaggerated mode as not physically accurate. Editing a setting
selects Custom. Magnified offsets (1×/10×/50×/100×) change only the display;
the optional heatmap measures actual residuals in millimetres.

Changes apply live to the active worker or main-thread fallback without replacing
particle state, reloading the face, or restarting the worker. They are retained
while physics is off and used when it is enabled again. **Reset simulation**
restores the current full-layer pose and clears velocities and constraint
multipliers. It leaves control activations, the selected preset, and physics
settings unchanged. Settings are session state and are not persisted across page
reloads.

### Physics diagnostics

While physics is enabled, the viewport's **Proxy Hidden/Visible** button toggles
an optional wireframe and particle overlay. Cyan identifies skin labels; amber
and pink identify inner-node labels, used for coloring only. Every node is
dynamic; there are no rigid skull or jaw attachments. Edges include the tetrahedral
interior. The overlay follows the face's complete scene transform and draws
through the surface so inner nodes remain visible. It is hidden by
default and disappears when physics is disabled.

The Live Readout reports average solver milliseconds per fixed step in the most
recent timer batch, effective completed fixed steps per wall-clock second since
backend startup, maximum node displacement relative to the matching pose target,
and mean distance across all nodes from that target. Each node's target distance
can also be inspected. Distances are in metres. Numerical resets are counted in
the solver loop, including samples
dropped by output backpressure; manual Reset simulation actions do not increment
this counter. The counter is retained across worker-to-main-thread fallback and
cleared when a new physics session starts. Fallback starts a new rate/timing window.

The Deformation Curve can show maximum displacement in pink on the right axis,
alongside activation energy in cyan on the left. Use its checkbox to hide that
series. Missing/inactive physics samples are gaps rather than invented zeros.
Both curves continue sampling during an unchanged pose, making settling visible.
