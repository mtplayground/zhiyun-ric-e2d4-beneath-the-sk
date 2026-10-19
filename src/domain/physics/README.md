# XPBD solver core

Supply packed XYZ positions, positive finite SI masses in kilograms, explicit
packed [outer, inner] pairing records and packed edge pairs. Every node is dynamic
with inverse mass `1 / storedMass`. Zero/nonfinite masses, zero inverse mass and
incomplete or duplicate pairing are rejected. Labels belong to visualization;
they define neither mass nor mechanical role. Inputs are copied. Mutating public
inverse masses triggers recovery to the configured values.

Every node has a soft pose target. `poseCompliance` controls outer skin nodes;
`innerPoseCompliance` controls the paired inner nodes. Both must be strictly
positive; neither is a hard pin. Defaults for SI masses are edge compliance
0.0001, skin pose compliance 0.02, inner pose compliance 0.00002 (1000 times
stiffer than skin), and exponential velocity damping 12 per second. These are
initial retuned values, not a measured material calibration or a validated visual
tuning result. The panel stores stiffness in N/m (skin 50, inner 50,000, edges 10,000),
with independent positive controls, and damping in s⁻¹. The settings boundary
converts stiffness to compliance by its reciprocal.

`submitFrame({ poseTargets })` copies the complete target array and updates every
edge's rest length from those targets, once before integration. This includes
outer–outer, inner–inner and through-layer edges. Subsequent timer ticks call
`step()` without submitting the same frame again. Direct `step(frame)` is also
supported and treats that call as a new submission. There are no rigid attachment
transforms in a frame or worker message.

Each step advances exactly `timestep` seconds (default 1/60), split into 4
substeps with 5 projection iterations by default. Distance and per-axis pose
constraints use `deltaLambda = (-C - alpha * lambda) / (sum(w * gradient²) + alpha)`,
where `alpha = compliance / substepDuration²`. Multipliers reset per substep.
Constraint order is all edges, all node pose targets, then caller extensions.
Only edge compliance may be zero. Custom constraints must preserve the desired
pose equilibrium themselves.

With gravity off, positions equal to the current pose targets and zero velocity
are an exact equilibrium: every edge error and every pose error is zero. No
neutral-pose edge length competes with an expression target. Reset restores every
node to its current target and clears velocity and multipliers. Non-finite input
target coordinates retain their last finite value, and numerical faults reset to
the current finite pose. Invalid dimensions/configuration throw.

The bare solver defaults to zero acceleration; the asset-aware host initializes
SI gravity. It calls `gravityFromMetadata` once per asset: -9.81 m/s² times the
recorded vertical vector, converted with the shared length/acceleration helper.
The vector is in face-local proxy units/s², including the recorded sign and tilt.
The settings store exposes `gravityAcceleration` in m/s², default 9.81. The
settings boundary supplies the host an internal dimensionless `gravityStrength`
ratio to scale that cached vector, so it never converts length units again. Worker/fallback messages carry only the resulting
proxy acceleration. Tests may supply an explicit proxy acceleration directly.

Additional constraints implement `XpbdConstraint.reset()` and `project(context)`.
The solver uses float64 with fixed ordering and no randomness. Programming errors
from extensions propagate; non-finite numerical output triggers recovery.

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

Call `sendFrame({ poseTargets })` each render frame with **proxy node targets**
in the same space as the asset. Receive
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

`createPoseTargetMapper(surface, proxy)` captures neutral render
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
Coincident skin nodes pool their embedding contributions. If an entire group is
uncovered, a shared nearest-render fallback averages tied render accessors.

For each explicit pair, the inner target is `innerRest + outerTarget - outerRest`.
The pairing table, rather than index order or labels, identifies the two roles.
This moves the whole layer with each expression and keeps Neutral at rest.
Jaw opening comes solely from the `jawOpen` blendshape, transferred through the
outer surface and its paired inner nodes, using the same alias/clamping rules as
all other morphs. There is no pivot, angular cap or extra anatomical jaw motion.

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
slider and transition weights; malformed embeddings and pairing; all-node equilibrium;
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
`measureDisplacement` computes each node’s Euclidean pose distance in metres,
including inner nodes, and the maximum and mean over all nodes. Labels do not
select contributors. `nodePoseDistancesMetres` preserves node-index order; the
numeric readout allows selection of any index. The chart’s displacement axis
also uses metres. Snapshots include the matching `poseTargets`, so the debug
overlay draws every node-to-target residual and stores each node’s SI distance
attribute. Labels control only visual coloring, with no attachment state. Sanitized solver targets are returned on
recovery so invalid caller targets cannot contaminate telemetry.

The provider publishes immutable sample references to a separate telemetry store,
without changing activation/control state. Readout and chart consumers use those
samples; optional overlay geometry reads the latest sample on the render loop.
The overlay reverses proxy normalization and uses the original face mesh's world
matrix. Debug visibility never changes simulation state, and owned geometries are
disposed when hidden or unmounted.


## Committed FaceCap proxy

The version 3 binary is generated at the full 12 mm thickness with 984 dynamic
nodes, 492 explicit pairs, 2,940 tetrahedra and all 2,694 render embeddings.
The exact-source FaceCap profile resamples the dominant exterior surface's convex
envelope using uniform directions. This is a coarse mechanical approximation:
it bridges cavities and smooths fine concavities, while the untouched render mesh
still supplies every visible blendshape detail and the exact zero-offset pose.

A conservative mechanical eligibility mask is computed from connected components
and surface orientation; it is not fabricated anatomical annotation. Detached
oral pieces and inward-facing folds get exactly zero simulation offset. Separate
named eye/teeth primitives never receive the offset layer. Unknown source hashes
must supply explicit region data instead of inheriting the FaceCap profile.
Excluded render vertices are also omitted from uncovered-node pose fallback.
See `docs/soft-tissue-asset.md` and the source/asset hashes and complete counts in
`docs/facecap-asset-integrity.json`. The former failure report is historical;
the rejection path is still tested independently and never thins the layer.
