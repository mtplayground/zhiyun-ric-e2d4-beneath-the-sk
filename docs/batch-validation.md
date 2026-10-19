# Deferred batch validation — 2026-10-19

Scope: every requirement in `.ideavibes/implementation.json`, the complete batch
from historical main `07e909f`, and the repair commit containing this report.
Later SI/model requirements supersede the earlier rigid attachment/jaw model.
The original attachment manifest is empty. Release status is determined by the
actual pinned-commit build/test/audit output, not by this coverage document.

## Acceptance coverage

| Issue | Review and executable evidence |
| --- | --- |
| #95 | Remote `backup/main-2026-10-19` is exactly `07e909fb27ab24e11b8d841a21e69a936130905c`; rollback procedure present; stable refs untouched. |
| #97 | Source-derived coarse mechanical surface, configurable budget, full-thickness normal offset, positive tetrahedra, edges, visual labels, exact source hash and complete embedding. Byte-exact generation test. |
| #98 | Pure deterministic solver tests cover constraints, SI mass, damping, gravity, fixed substeps, extension constraints and non-finite recovery. Superseded hard attachments removed. |
| #99 | Host/worker tests cover transfers, backpressure, lifecycle, source/count validation, startup timeout and reduced-substep fallback; browser exercises actual worker. |
| #100 | Mapping tests cover all presets, keyboard/slider mixes, Neutral, Smile and AA, aliases and relative/absolute morphs. Later pairing model replaces the rigid jaw. |
| #101 | Registry/default, residual-only embedding, live disable and no-reload tests; real browser verifies actual FaceCap. |
| #102 | Optional live SI controls and reset covered by component/store/worker/browser tests. |
| #103 | Overlay continuity/colors/residuals, SI node distances, solver metrics and dual-scale curve tests. |
| #104 | Unit/integrity/browser suites and both real committed-proxy benchmark modes are release gates. |
| #113 | Recorded explicit metre scale, plausible dimensions, signed scene-derived vertical axis, shared one-time conversions; frame/units tests. |
| #114 | Committed version 3: 984 positive SI masses, 492 explicit pairs at exactly 12 mm, 2,940 positive tetrahedra. Historical invalid recipe still fails with location-specific diagnostics rather than thinning. |
| #115 | Source-derived shared proxy topology has zero disconnected coincident forehead groups. Generic weld/local-fan and continuous-offset regression tests retained; historical crease split documented. |
| #116 | All nodes dynamic, full paired pose targets, separate soft skin/inner stiffness, all pose-relative edge lengths, morph-only jaw opening and SI gravity; exact equilibrium tests across presets/mixes. |
| #117 | SI controls/store/readout/overlay tests remove attachment semantics and cover every node's target distance. |
| #118 | Original geometry/base/morph identity and bytes preserved; only offset attribute/material owned. Shader ordering and reset/disable restoration tested; real browser compares zero-gravity canvas pixels. |
| #119 | Convex nearest-point weights, outside fade, per-vertex cap and identical positional-copy embedding. Source-derived mechanical mask excludes detached oral pieces and inward folds; separate eye/teeth primitives never get offsets. Excluded accessors cannot drive fallback targets. |
| #120 | Updated equilibrium, pairing, SI, diagnostics, seam and bounds tests; real FaceCap cycles every expression plus Smile/AA with finite values, pixel tolerance and off/on mesh identity. Benchmark asserts all 984 nodes dynamic. |

## Repair and limitations

The earlier generator treated all disconnected components of the morph-bearing
primitive as tissue and produced an invalid 12 mm layer. The replacement profile
is bound to the exact FaceCap source hash. It derives mechanical eligibility from
connectivity and orientation: 1,867 eligible vertices and 827 excluded vertices.
No anatomical annotations are fabricated. Unknown sources still require explicit
region input instead of silently inheriting this selection.

Real FaceCap browser validation also exposed an activation-normalization mismatch:
small interpolated weights removed from the readout were being interpreted as a
new user target, freezing transitions. Runtime feedback now uses the same
normalization as the control store; geometry still receives the full evaluated
weights. The real expression sweep checks exact resolved influences and catches
this regression, including Smile-to-Frown with low-weight channels.

A uniformly sampled radial convex envelope supplies the coarse simulation
surface. It bridges openings and smooths concavities; it is not a detailed
anatomical reconstruction. This approximation affects simulated residuals only:
the original FaceCap render and morph data remain untouched, and zero offsets
must match the kinematic render. The default 3,000-tetrahedron budget yields
2,940 tetrahedra, 984 nodes, 492 pairs, 4,902 edges and all 2,694 embeddings.

`facecap-asset-integrity.json` records exact GLB/binary SHA-256 hashes and counts.
The integrity suite regenerates the committed binary byte for byte, validates
all pairs and positive volumes, exclusions and positional-copy records, and the
last source vertex, mass and embedding. No byte normalization is performed.
`verify:physics` additionally uses the production loader and independently
accumulates every tetrahedron's SI mass contribution. Historical inversion
failure remains a separate negative regression, never a release-pass shortcut.

## Required commands

```sh
npm ci
npm run build:static
npm test
npm run lint
npm run verify:physics
npm run test:e2e
npm run test:e2e:physics
npm run benchmark:physics -- --substeps 4
npm run benchmark:physics -- --substeps 2
```

The two benchmark modes execute the real solver with all nodes dynamic, SI
gravity and paired layer targets. They validate finite state, zero resets and
render offsets within the thickness cap. Timing depends on hardware; no arbitrary
real-time guarantee is asserted. Final output records actual command outcomes.

## Deployment audit scope

Static React/Vite SPA with no database, object storage, upload/download API,
email/origin gates or blob URL lifecycle. URL constructor candidates refer to
assets, workers and Node test/benchmark files. Every deploy reruns source
candidate enumeration and semantic inspection; zero sites emit clean gates.
The native root watermark/share and preview-banner absence are verified in the
production bundle and browser. Only application assets enter the static build.

After all release gates pass, source is committed/pushed, uploaded to the project
Sprite, rebuilt there and restarted through its registered app service. The
remote release marker and built asset bytes must match the checked final commit.
Public reachability, watermark/share, no-preview marker, environment format and
service registration are checked before reporting deployment complete.

## Deployment URL verification repair

The browser verification stage requires `.deploy_url` in the executor workspace.
Run `bash scripts/capture-deploy-url.sh` after restarting the Sprite service and
before verification; it reads the actual Sprite response and refuses a missing
URL without overwriting a previously captured release. The metadata and browser
screenshot are ignored by Git.

Regression: `node --test scripts/capture-deploy-url.check.mjs` tests successful
capture and a malformed response using an isolated CLI fixture. Public browser
check: `NODE_PATH=/usr/local/lib/node_modules node scripts/verify-deployed-ui.cjs`
checks loaded FaceCap, computed CSS, pose/keyboard/reset controls, worker physics,
finite telemetry, watermark sharing, no preview banner, and browser/network errors.
It saves `verify-screenshot.png`. This app has no protected login or internal
route navigation; research resource buttons are explicitly disabled.
