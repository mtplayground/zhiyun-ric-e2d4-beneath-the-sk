# XPBD solver core

`XpbdSolver` has no runtime imports. Supply packed XYZ positions, packed edge
pairs, and STP1 labels (0 skin, 1 skull, 2 jaw). Inputs are copied. Skin inverse
masses default to 1; attached inverse masses are always zero. Public particle
arrays expose current positions, velocities and inverse masses. Inverse masses
are configuration: changing them after construction triggers recovery.

Each `step` advances exactly `timestep` seconds (default 1/60), split into
`substeps` (default 4), with `iterations` (default 5) per substep. The caller owns
any wall-clock accumulator. Gravity is an acceleration vector in mesh units per
second squared, so its magnitude and direction are configurable. Damping is an
exponential velocity decay rate per second. Default gravity is [0, -9.81, 0];
callers must supply gravity in the proxy coordinate system (FaceCap local Z is up).

Pass packed per-frame `poseTargets` for all nodes plus optional column-major
skull/jaw affine matrices. Matrices transform the original rest positions, never
the previous frame's attached positions. Missing transforms mean identity.
Attachments are hard, applied before projections and after every iteration;
their stored velocity is zero. Pose constraints apply only to skin nodes.
Zero-inverse-mass skin nodes remain fixed.

Distance and per-axis pose constraints use XPBD's
`deltaLambda = (-C - alpha * lambda) / (sum(w * gradient²) + alpha)`, where
`alpha = compliance / substepDuration²`. Multipliers reset each substep and
accumulate across iterations. Zero compliance is hard. Pose compliance defaults
to 0.001; distance compliance defaults to zero. All constraints run in a fixed
order: edges, skin targets, then supplied extensions. Solve order can affect
competing constraints; hard attachments have final precedence.

Additional constraints implement `XpbdConstraint.reset()` and `project(context)`
and are supplied in `constraints`. No changes to integration are needed to add
volume/contact constraints later. Extensions must honor inverse masses and only
modify particle state, not pose targets. Own one constraint instance per solver,
since multipliers are mutable. Programming errors thrown by extensions propagate;
numerical non-finite results trigger recovery.

`step` returns `{ reset: false }` or `{ reset: true, reason }`. Recovery resets
positions to the current targets, clears velocities and multipliers, restores
configured masses, and reapplies valid attachments. Non-finite target coordinates
retain their last finite target value (initially rest position), and report a
reset. Invalid transforms or overflowing attachment calculations fall back to
finite pose targets. Malformed array dimensions and invalid constructor inputs
throw. Determinism assumes identical inputs and extension behavior on the same
JavaScript numeric implementation; the solver uses float64 and no randomness.

## Worker host

`createPhysicsHost` loads the simulation binary once per URL and validates it
against the **exact bytes used for the loaded render GLB** and its face primitive
vertex count. Pass these as `sourceMesh` and `renderVertexCount`; do not separately
fetch a potentially changed mesh to validate against. `ready` rejects with an
`asset-error` diagnostic on mismatch or load failure. It resolves when asset
validation and backend initialization have been dispatched; backend readiness is
reported by a `worker` or `fallback` diagnostic. Physics never starts on mismatch.

The host owns a module worker bundled by Vite's standard
`new Worker(new URL(..., import.meta.url), { type: 'module' })` pattern. No special
worker configuration or cross-origin isolation is required. The worker advances
a fixed-timestep accumulator independently of render callbacks, limits catch-up
to four steps after background pauses, and transfers float64 position buffers.
Only one output waits for acknowledgement. Per-frame inputs are coalesced while
an earlier frame is in flight. Arrays sent by callers are copied before transfer,
so caller-owned targets and cached simulation data are never detached.

Call `sendFrame({ poseTargets, jawTransform, skullTransform })` each render frame
with **proxy node targets** and transforms in the same space as the asset. Receive
node positions and reset reports via `onPositions`; render embedding/deformation
remains a separate consumer. This module does not change the blendshape viewport
or derive proxy pose targets. Worker construction errors, runtime errors, message
errors and a five-second startup timeout switch to main-thread physics, normally
two substeps instead of four (one is the minimum). Diagnostics report that switch.

Call `dispose()` when physics is disabled or the viewport unmounts. It is
idempotent, cancels timer/startup work, terminates the worker and suppresses late
callbacks, including if asset loading is still pending. `usePhysicsHost(enabled,
options)` provides this cleanup through a React effect and returns a stable
`sendFrame` callback for a viewport's frame loop. Keep solver options, source byte
buffer and worker factory stable to avoid restarting the host unnecessarily.
The hook loads nothing while disabled. Failed asset fetches may be retried;
successful fetches remain cached across enable/disable cycles, but validation
runs for each new loaded face.
