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
remains a separate consumer. The host itself does not derive proxy pose targets; the XPBD provider now
connects it to the viewport and the pose-target mapper. Worker construction errors, runtime errors, message
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

## Blendshape pose targets

`createPoseTargetMapper(surface, proxy, jawSettings)` captures neutral render
accessor positions and relative morph deltas (or absolute morph targets), plus
the validated proxy embedding. `map(evaluatedBlendshapeWeights)` accepts the same
per-frame weights applied by the kinematic runtime. It reuses the kinematic
provider's alias resolution, duplicate-alias maximum, clamping and activation
threshold. It does not apply transition smoothing again. For consumers holding
an unevaluated transition, `evaluateFrame(input)` applies the provider's existing
smoothstep interpolation before mapping. There are no preset-specific branches.

The posed surface is `base + sum(weight * delta)` for relative morphs, or
`base + sum(weight * (target - base))` for absolute morphs. Evaluation stays in
accessor coordinates before the mesh node and viewport transforms. Displacements
are divided by the asset's normalization scale to enter proxy space. Surface
positions are returned alongside solver inputs for diagnostics and acceptance.

A render-to-tetrahedron embedding is not directly invertible. The mapper scatters
render displacements back to the tetrahedron's **skin** nodes using barycentric
coefficients, then normalizes each node by its total coefficient. This is a
weighted transpose transfer, not an exact inverse or a new tetrahedral solve.
It preserves constant displacements and returns exact proxy rest positions for
Neutral, including when the stored embedding projects onto a nearest tetrahedron.
Uncovered skin nodes (such as duplicate crease nodes) receive their nearest
neutral render vertex's displacement; that association is computed once and is
deterministic. Skull targets remain at rest. Jaw targets and the attachment
transform use the same rigid rotation, so numerical recovery also respects the
current jaw pose.

Jaw opening defaults to a 25-degree rotation about local X at full jaw-open
weight, around proxy-space pivot [0, 0.05, 0.02]. The positive angle moves a point
on FaceCap's forward/lower (-Y/-Z) jaw downward in Z. Pivot, axis and maximum
angle are explicit tuning parameters, not inferred anatomical measurements.
The transform is computed about the fixed pivot each frame; it never accumulates.
Smile/Neutral with no jaw-open weight keep the jaw at identity. AA uses the
existing library's 0.9 jaw-open activation, yielding 22.5 degrees.

`createMeshPoseTargetDriver(faceMesh, proxy, frame => host.sendFrame(frame))`
bridges a loaded morph face to the worker host without importing Three. Its
structural mesh interface reads decoded position/morph attributes once, then
reads current applied morph influences on each `update()`. Call `update()` after
the kinematic provider applies influences, every render frame, including idle
frames. This means presets, keyboard transitions, cached frames and sliders all
use the same surface actually displayed by the kinematic path. Pass the face
primitive used for source/count validation, excluding separate eyes and teeth.
The driver supplies solver inputs; rendering solver output is a separate step.
It does not modify geometry, controls, pose definitions or scene transforms.

Unit coverage includes Neutral, Smile and AA; every actual library/keyboard pose;
slider and transition weights; malformed embeddings; rigid pivot invariants;
and comparison to Three's CPU morph evaluator for relative and absolute targets.

## Provider integration

The `xpbd-soft-tissue` provider now connects the mapper, worker host and render
embedding. The GLB loader retains the exact parsed source bytes and exposes the
single morph-bearing face's accessor-space surface. The provider initializes the
mapper from the validated cached asset, sends targets each frame and returns
vertex offsets. Worker outputs also carry the matching target array as a second
transferable buffer. Rendering adds the embedded residual after morph evaluation
through a dedicated shader attribute. Skin base positions and morph targets stay
unchanged; switching off restores the original geometry/material immediately.
The viewport's physics toggle owns backend cleanup without reloading the GLB.

## Live controls

The opt-in physics panel uses `usePhysicsState`, shared with the viewport toggle.
The runtime translates its settings through `toSolverSettings` and calls the
provider's `configurePhysics` method. The host forwards `configure` to the worker
or fallback loop; `XpbdSolver.configure` updates built-in constraint compliance,
gravity and damping in place. Particle positions and velocities survive tuning.
Settings received during initialization are applied when the backend starts.

The independent reset request calls `resetSimulation`, clears the rendered
residual immediately, sends the latest pose to the backend, and invokes the
solver's explicit reset path. The backend reports that reset with the matching
pose target array. No simulation asset fetch, mesh reload or worker restart is
needed for either tuning or resetting.

## Telemetry and debug rendering

The loop measures only `solver.step` execution with the local performance clock.
It emits mean step cost per timer batch, completed-step/wall-time rate and a
cumulative count of numerical recovery resets. Explicit reset commands do not
increment the counter. Timing fields travel with the position/target pair through
the worker protocol; reset totals survive output coalescing and backend fallback.
`measureDisplacement` computes the maximum residual over all nodes and mean
pose-following error over skin nodes. Sanitized solver targets are returned on
recovery so invalid caller targets cannot contaminate telemetry.

The provider publishes immutable sample references to a separate telemetry store,
without changing activation/control state. Readout and chart consumers use those
samples; optional overlay geometry reads the latest sample on the render loop.
The overlay reverses proxy normalization and uses the original face mesh's world
matrix. Debug visibility never changes simulation state, and owned geometries are
disposed when hidden or unmounted.
