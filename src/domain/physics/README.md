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
