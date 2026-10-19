# Corrected physics model acceptance and benchmark

These are executable acceptance specifications. No test, build, browser session,
benchmark run or performance result was executed during implementation.

## Committed source-derived proxy

The committed version 3 proxy now generates at the full 12 mm thickness with
984 nodes, 2,940 tetrahedra and all 2,694 render embeddings. Its source-bound
mechanical eligibility mask excludes detached components and inward-facing folds,
without inventing anatomical annotation values. The coarse radial convex envelope
is a mechanical approximation; the original detailed render/morph geometry stays
unchanged. See `soft-tissue-asset.md` and `facecap-asset-integrity.json`.
The old inversion report remains historical regression evidence. Real FaceCap
browser acceptance and all-node benchmarks use the actual committed version 3
asset; no fixture or failure-rejection test can qualify it for release.

## Unit and integrity coverage

`npm test` includes the following corrected-model regressions:

- Named Neutral, Smile, AA and slider-mix cases construct the solver at full
  pose targets with gravity off. Repeated steps must preserve every position
  exactly and leave every velocity zero. Broader cases cover every preset,
  keyboard entry and 21 deterministic slider mixes.
- Every explicit pair gets exactly `innerRest + outerTarget - outerRest`.
  All inverse masses are positive reciprocals of stored SI masses. Both layers
  have soft targets with independent stiffness; no hard attachment is expected.
- Jaw targets change only through morph displacement. Frames contain targets and
  diagnostic surface positions, with no extra transform, pivot or angular cap.
- A planar 0.5 m² triangle extruded 0.012 m has analytic total mass 6 kg at
  1000 kg/m³, and incidence masses [1.5, 1, 0.5, 0.5, 1, 1.5] kg. These values
  independently check the tetrahedral lumping calculation through the last node.
- Gravity matches -9.81 m/s² along the full recorded vertical axis at both a
  known test scale and the exact committed FaceCap normalization/scale.
- Valid geometry extrudes at the converted 12 mm thickness. The actual FaceCap
  failure must reproduce location, source/proxy indices, centroid, normal and
  requested physical/proxy thickness. The integrity case hashes the exact
  upstream bytes, checks counts and the last source vertex, and compares the
  complete recorded topology and diagnostic.
- Smooth forehead duplicate fans weld to shared nodes. A generated smooth patch
  explicitly checks the forehead candidate area, shared embeddings, continuous
  offsets and local-thickness limits. The real source report independently
  checks that all 16 old forehead crease groups disappear.
- Rendering retains original geometry/base/morph accessors and exact shared
  backing-buffer hashes across zero-offset enable/disable cycles. Materials,
  culling and only the owned offset attribute are restored on cleanup.
- Outside flags, nearest-point convex weights, distance fading, anatomical
  exclusions, duplicate positions, float32-safe offset caps, malformed policy
  rejection, last records, and byte-exact encoding are covered separately.

The original-files manifest is empty. These tests do not recreate user source
content or publish original attachments.

## Real browser and real FaceCap

After installing Playwright Chromium, run `npm run test:e2e:physics`. The dedicated
server uses port 8081 with the physics panel visible, real FaceCap URL configured,
and the kinematic provider selected initially. The real-FaceCap test does not
intercept GLB or proxy responses and never calls `servePhysicsFixture`.

It requires the actual 2,694-vertex morph face, enables physics with gravity set
to zero, and visits every expression option plus Neutral, Smile and AA. For each
pose it waits for the actual morph influences to match the library's evaluated
weights, resets to equilibrium, and checks finite node/target/distance/offset
values, zero numerical resets, a bounded offset and a clean WebGL error state.

For each pose it captures the real canvas with physics on, disables physics and
captures the kinematic canvas. Pixel comparison uses 256×256 RGBA samples from
the scene canvas, excluding changing DOM telemetry. At most 0.1% of pixels may
differ by more than 2/255 in any RGB channel; mean per-pixel maximum channel
error must be at most 0.1/255. Full canvas PNGs are attached for both modes.

A dev-server-only test helper reads the same R3F/Three/store modules as the app.
It records geometry, attribute and material references plus SHA-256 hashes of
all unique backing buffers. Each off/on cycle must retain geometry/base/morph
identity and bytes, remove the offset attribute on disable, restore original
material/culling and successfully restart physics. Page errors, console errors,
WebGL warnings/errors and GL error codes fail acceptance. The mesh must be fetched
once despite repeated toggles. There are no production test hooks.

The existing small generated GLB tests remain as separate worker/fallback,
settings, reset, telemetry and source-mismatch integration cases. They do not
satisfy the real-FaceCap acceptance case. Browser traces are retained on failure.

## All-node benchmark

Run against the committed version 3 asset:

```sh
npm run benchmark:physics -- --warmup 30 --steps 120 --substeps 4 --iterations 5 --output /tmp/physics-benchmark.json
```

`--asset PATH` can select another deliberately generated version 3 artifact; the
report records its binary/source hashes. No fallback mesh is fabricated. The
benchmark uses the real TypeScript solver through Vite, SI gravity along the
recorded axis, retuned defaults, and spatially varying paired-layer pose pulses.
All edge-target updates are included in the timed `step(frame)` operation.

Every node must retain a finite positive inverse mass exactly equal to the
reciprocal of its stored SI mass, before and after all steps. The report includes
all dynamic/outer/inner counts, zero pinned nodes, total mass in kg, actual gravity
vector, configuration, environment, binary/source hashes and final-state hash.
It reports solver and embedding mean/median/p95/max durations, numerical resets,
maximum node residual in metres, maximum render offset in metres and largest
fraction of the configured cap. Exceeding a render cap or corrupting a mass fails
immediately. `--max-p95-ms N` remains an optional explicit hardware budget;
non-finite results or numerical resets make the benchmark fail.
