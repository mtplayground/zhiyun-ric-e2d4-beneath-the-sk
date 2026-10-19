# Physics milestone acceptance and benchmark

This milestone supplies executable tests and a benchmark. No test, build,
benchmark result or hardware performance claim is recorded by the implementation.

## Unit and integrity coverage

Run `npm test` for the unit suite. Physics coverage includes XPBD distance/pose
compliance, attachment transforms, fixed substeps, gravity, damping, deterministic
outputs, live tuning, explicit reset, and recovery from non-finite state. Mapper
coverage uses Neutral, Smile and AA from the existing pose library and compares
relative/absolute morph evaluation to Three. Host/worker tests cover transferable
ownership, coalescing, failure/timeout fallback, lifecycle cleanup, settings,
reset and telemetry. Rendering tests cover residual-only embedding and immediate
restoration of kinematic geometry/materials.

`physics-milestone.test.ts` reads the committed binary directly. It checks all
section counts, every tetrahedron's positive volume, every embedding including
the last render vertex, zero residual at rest, finite/deterministic repeated
transitions at worker/fallback substep counts, fixed skull attachment and settling
of a disturbed skin node. This test is offline. The separate generator integrity
test regenerates the asset byte-for-byte from its recorded source, validates the
source SHA-256, and requires network access. No attachment/source data is copied
or recreated in these tests.

## Browser acceptance

Run `npm run test:e2e:physics` after installing Playwright Chromium. Its dedicated
configuration starts the app on port 8081 with the physics panel enabled and the
kinematic provider initially selected. It does not alter the default E2E server
or optional-panel defaults. The ordinary `npm run test:e2e` suite remains the
kinematic regression suite.

The physics suite intercepts only the configured model/proxy URLs with a small
generated GLB and a correctly source-hashed STP1 asset. This isolates browser
acceptance from third-party downloads and Basis texture transcoding. The tests
exercise the actual application, actual worker module and WebGL rendering:

- Neutral, Smile and AA selection; keyboard and slider input while physics runs.
- Live settings, nonzero displacement and finite telemetry.
- Canvas pixels changing under simulation, with before/after PNG attachments.
- Debug overlay visibility/legend and displacement curve selection.
- Reset without incrementing numerical-reset counts.
- Repeated off/on cycles with workers terminated on disable, one model fetch and
  one cached proxy fetch, plus document unload.
- Main-thread fallback when Worker is unavailable.
- Source-hash mismatch diagnostics while kinematic controls remain usable.

These generated browser fixtures test integration, not FaceCap anatomy or a visual
reference image. The original FaceCap proxy is exercised by the unit/integrity
suite and benchmark. Review actual FaceCap Neutral/Smile/AA screenshots on the
intended deployment as part of the executor's live verification. Browser traces
are retained on failure. There are no hardware-dependent time assertions in E2E.

## Reproducible benchmark

Run:

```sh
npm run benchmark:physics -- --warmup 30 --steps 120 --substeps 4 --iterations 5 --output /tmp/physics-benchmark.json
npm run benchmark:physics -- --warmup 30 --steps 120 --substeps 2 --iterations 5 --output /tmp/physics-fallback-benchmark.json
```

The script loads the actual TypeScript solver through Vite's SSR module loader,
without copying its implementation or compiling an application build. It reads
the committed binary directly. Module loading, asset decoding and warmup are
excluded from measured samples. Target generation and telemetry are also outside
solver/embedding timing windows. A deterministic synthetic skin pulse drives the
real topology under the provider's default compliance and gravity values. This
is a solver/embedding throughput workload, not an anatomical pose evaluation,
worker messaging benchmark, browser FPS test or realtime guarantee.

JSON includes Node/CPU/platform information, binary SHA-256, recorded source-mesh
hash and mesh counts; timestep/substeps/iterations and sample counts; solver and
embedding mean/median/p95/maximum milliseconds; numerical resets, maximum residual
and final state fingerprint. The recorded source hash is metadata, not independent
source verification; use the integrity test for that. Warmup resets still fail the
benchmark. All node/offset values must remain finite. No timing result is fabricated
or stored in source. Compare distributions on the same host/configuration, with
other workloads minimized, and run several times before drawing conclusions.

An optional explicit gate is available:

```sh
npm run benchmark:physics -- --steps 120 --max-p95-ms 16.67
```

This exits nonzero for a numerical reset, non-finite output or a solver p95 above
the requested budget. The value is caller-selected; no default device performance
budget is asserted. A 16.67 ms solver budget alone does not include rendering,
pose mapping, worker transfer, browser scheduling or other application work.
