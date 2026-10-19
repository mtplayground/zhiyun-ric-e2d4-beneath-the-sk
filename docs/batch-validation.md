# Deferred batch validation — 2026-10-19

Release decision: FAILED; do not publish this batch. The production frontend
build succeeds, but the real FaceCap physics acceptance and benchmark cannot run
with the retained version 1 proxy. The runtime correctly requires version 3.

The checkout reviewed starts at `c950402f9dd2ba028a30a5959d3e9796ed168d1b`.
Review scope is the complete batch diff from `07e909f`, including all requirements
in `.ideavibes/implementation.json`; later SI/model requirements supersede the
original hard attachments and rigid jaw requirements. The final validation commit
contains this report, the test correction, command/frame race guard and explicit
release asset verifier. No original attachments were supplied: manifest `[]`.

## Acceptance review

| Issue | Evidence and remaining condition |
| --- | --- |
| #95 | Remote backup branch is exactly `07e909fb27ab24e11b8d841a21e69a936130905c`; rollback instructions present; stable refs untouched. |
| #97 | Generator/embedding integrity tests exist and run; final committed proxy remains incompatible with current loader. Failed integration. |
| #98 | Superseded solver model covered by deterministic SI, constraint, finite recovery and equilibrium tests. |
| #99 | Worker transfer, fallback, disposal, startup and mismatch tests pass; actual asset initialization fails. |
| #100 | Mapper tests cover all presets, keyboard and slider mixes; paired inner displacement and morph-only jaw opening. |
| #101 | Registry, residual embedding and disable tests pass; real FaceCap physics provider cannot activate with legacy asset. |
| #102 | Optional settings panel, live tuning and reset pass fixture browser checks; actual asset integration incomplete. |
| #103 | SI readout, residual overlay and curve tests pass; actual FaceCap telemetry unavailable. |
| #104 | Automated unit tests and browser fixture checks run; real-asset benchmark fails version validation. |
| #113 | Explicit unit scale and signed scene-derived vertical axis; conversion, frame and plausibility tests pass. |
| #114 | FAILED: reproduced inverted layer cell at proxy triangle 0 / nearest source triangle 7 at exactly 12 mm. No valid regenerated binary. |
| #115 | Weld/topology and synthetic forehead continuity tests pass; final volume and real visual seam continuity remain unverified. |
| #116 | Dynamic inverse SI masses, full paired targets, pose-relative edges, no rigid jaw, SI gravity and exact equilibrium tests pass. |
| #117 | SI settings/readout/debug tests pass; fixture browser settings and telemetry checks pass. |
| #118 | Geometry/morph buffer identity, shader ordering, material/culling restoration and byte integrity tests pass. Fixed stale loader test expecting a copy. Real FaceCap physics pixel parity cannot execute without valid proxy. |
| #119 | Bounded embedding and exclusion tests pass on fixtures. Source-bound anatomical labels are absent; committed asset lacks version 3 bounds. FAILED overall; user must supply authoritative region annotations. |
| #120 | Corrected model tests run; real FaceCap browser case and all-node benchmark fail. FAILED acceptance. |

## Reproducible gates

- `npm ci`: succeeds.
- `npm run build:static`: production TypeScript/Vite build and static verification succeed.
- `npm test`: 126 tests across 26 files pass after correcting the stale geometry-copy assertion.
- `npm run lint`: succeeds with two existing Fast Refresh warnings.
- `npm run test:e2e`: initial run 3 passed / 1 failed (preset activation sweep).
  A synchronous-store guard now prevents an old frame from overwriting a command
  before React captures it; final browser outcomes are recorded in deploy output.
- `npm run test:e2e:physics`: initial run 3 fixture cases pass; real FaceCap case
  fails with the explicit unsupported version 1 diagnostic, before pixel comparison.
- `npm run generate:soft-tissue -- --metres-per-source-unit 0.0000194938469`:
  fails at the exact recorded 12 mm location; retained asset bytes unchanged.
- `npm run benchmark:physics`: fails requiring version 3; no timing result claimed.
- `npm run verify:physics`: explicit release integrity gate fails on version 1.
  Unlike the unit test for legacy rejection, this command requires a usable asset.
  With version 3 it checks exact source bytes, every pair's 12 mm thickness,
  independently accumulated SI mass for every node, and complete embeddings
  including the last render vertex, through the production loader.

The generator integrity test re-fetches and SHA-256 verifies the source GLB,
checks all 2,694 render vertices including the last, the complete recorded failure
and topology report, and the retained binary hash. No normalization of source
bytes is performed. Passing reproduction of a documented failure is not release
acceptance.

Required external data for #119: a JSON object with `sourceHash` equal to the
FaceCap GLB SHA-256 recorded in `soft-tissue-generation-failure.json` and exactly
2,694 ordered `regions` entries, each `skin`, `teeth`, `inner-mouth` or `eyes`.
Use `--regions PATH`. No anatomical labels are inferred or fabricated. Supplying
annotations alone does not resolve the independent inverted-cell code/geometry
failure; the agent must repair that and rerun all affected gates.

## Deployment audits

Fresh audit: static React/Vite SPA, no database or app API, no object storage
prefix/calls, upload/download router, blob URL lifecycle, email or origin gate.
URL constructors in candidate files refer to assets, workers or test files;
none builds an API share/download URL. No error middleware returns a generic 500.
Storage prefix and streaming audits are skipped by their capability gates.
Other audits have zero applicable call sites. No patches were needed in those
audits, so step 4.8 has not run.

The production bundle contains the unique root watermark and Share control;
Chromium verifies the Ideavibes link and clipboard behavior. Preview banner
markers are absent. Original attachment metadata stays outside the build.
Authoritative frontend environment keys were appended and strict KEY=VALUE
validation passes. No service credentials were fabricated.

Sprite existence, Node/npm runtime and durable `/data` were checked. Publication,
service replacement, heartbeat changes and writing a successful `.deploy_url` /
`.progress` are withheld by the mandatory pre-publication acceptance gate.
A previous deployment, if reachable, is not evidence that this checked commit
has been deployed. Never report Deployment Ready for this attempt.
