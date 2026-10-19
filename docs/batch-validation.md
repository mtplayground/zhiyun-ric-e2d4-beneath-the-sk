# Physics batch validation

Scope: issues #95, #97–#104, reviewed against `.ideavibes/implementation.json`
and the complete batch diff from `07e909f`.

- #95: published `backup/main-2026-10-19` at the exact historical main tip;
  verified the full remote SHA and updated the rollback procedure.
- #97: generator tests regenerate the committed proxy byte for byte from the
  SHA-256 verified FaceCap source. Milestone tests validate all sections,
  positive tetrahedra and every embedding, including the last render vertex.
- #98: constraint/solver tests cover compliance, attachments, fixed substeps,
  gravity, damping, determinism, extension constraints and non-finite recovery.
- #99: host/worker tests cover transfers, lifecycle, validation, backpressure,
  startup timeout and reduced-substep fallback.
- #100: mapper tests compare relative/absolute morphs with Three and exercise
  Neutral, Smile and AA, jaw transforms, aliases and untouched skull nodes.
- #101: provider and shader tests verify residual-only embedding, default
  kinematic behavior, immediate disable and no mesh reload.
- #102: settings, optional panel and browser tests cover live tuning and reset.
- #103: geometry/readout/telemetry and browser tests cover colors, transforms,
  solver metrics, displacement curves and reset counts.
- #104: unit, integrity, browser suites and both documented benchmark modes run
  as deployment gates. Browser physics fixtures exercise actual workers/WebGL;
  default-mesh regression and deployment smoke cover the real FaceCap pipeline.

Commands: `npm ci`, `npm run build:static`, `npm test`, `npm run lint`,
`npm run test:e2e`, `npm run test:e2e:physics`, and
`npm run benchmark:physics -- --substeps 4` / `--substeps 2`.

Benchmark on this executor (AMD EPYC, Node 20): 120 measured steps after 30
warmup steps, five constraint iterations. Four-substep solver p95 was 39.27 ms;
two-substep solver p95 was 17.12 ms. Both had zero numerical resets and finite
output. No real-time hardware guarantee or arbitrary performance gate is claimed.

Deployment audits: static SPA, no database, object storage, upload/download,
email API, same-origin gate or blob URL lifecycle. No fabricated credentials.
Platform watermark/share remain at the application root; no preview banner.
