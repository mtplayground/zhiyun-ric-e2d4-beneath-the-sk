export type Vec3 = readonly [number, number, number];
/** Column-major affine matrix, applied to the original node position. */
export type AttachmentTransform = readonly number[];
export type NodeLabel = 0 | 1 | 2; // skin, skull, jaw (STP1 labels)
export const IDENTITY_TRANSFORM: AttachmentTransform = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

export interface ParticleState {
  positions: Float64Array;
  velocities: Float64Array;
  inverseMasses: Float64Array;
}

export interface ConstraintContext extends ParticleState {
  readonly timestep: number;
  readonly poseTargets: Float64Array;
}

/** Multipliers reset once per substep, then accumulate across solve iterations.
 * Additional volume/contact constraints can implement this interface. Order is
 * deterministic: edges, pose targets, then caller-supplied constraints. */
export interface XpbdConstraint {
  reset(): void;
  project(context: ConstraintContext): void;
}

function nonnegative(value: number, name: string) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid ${name}`);
  return value;
}

export class DistanceConstraint implements XpbdConstraint {
  private lambda = 0;
  constructor(
    readonly a: number,
    readonly b: number,
    readonly restLength: number,
    public compliance = 0,
  ) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) throw new Error('Invalid edge indices');
    nonnegative(restLength, 'rest length');
    nonnegative(compliance, 'distance compliance');
  }
  reset() { this.lambda = 0; }
  project({ positions: p, inverseMasses: w, timestep: h }: ConstraintContext) {
    if (this.a >= w.length || this.b >= w.length) throw new Error('Edge index out of range');
    const a = this.a * 3, b = this.b * 3;
    const delta = [p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]];
    const length = Math.hypot(...delta);
    const mass = w[this.a] + w[this.b];
    if (mass === 0) return;
    // A collapsed edge uses a fixed axis, so positive rest lengths can recover.
    const direction = length > 1e-14 ? delta.map(v => v / length) : [1, 0, 0];
    const alpha = this.compliance / (h * h);
    const dl = (-(length - this.restLength) - alpha * this.lambda) / (mass + alpha);
    this.lambda += dl;
    for (let axis = 0; axis < 3; axis++) {
      p[a + axis] += w[this.a] * dl * direction[axis];
      p[b + axis] -= w[this.b] * dl * direction[axis];
    }
  }
}

export class PoseTargetConstraint implements XpbdConstraint {
  private readonly lambda = new Float64Array(3);
  constructor(readonly node: number, public compliance = 0) {
    if (!Number.isInteger(node) || node < 0) throw new Error('Invalid pose node');
    nonnegative(compliance, 'pose compliance');
  }
  reset() { this.lambda.fill(0); }
  project({ positions: p, inverseMasses: w, poseTargets: target, timestep: h }: ConstraintContext) {
    if (this.node >= w.length) throw new Error('Pose node out of range');
    if (w[this.node] === 0) return;
    const alpha = this.compliance / (h * h);
    for (let axis = 0; axis < 3; axis++) {
      const i = this.node * 3 + axis;
      const dl = (-(p[i] - target[i]) - alpha * this.lambda[axis]) / (w[this.node] + alpha);
      this.lambda[axis] += dl;
      p[i] += w[this.node] * dl;
    }
  }
}

export interface SolverSettings {
  distanceCompliance?: number;
  poseCompliance?: number;
  damping?: number;
  gravity?: Vec3;
}

export interface SolverOptions {
  positions: ArrayLike<number>;
  labels: ArrayLike<number>;
  edges?: ArrayLike<number>; // packed pairs
  inverseMasses?: ArrayLike<number>;
  distanceCompliance?: number;
  poseCompliance?: number;
  gravity?: Vec3;
  /** Exponential velocity decay rate in inverse seconds. */
  damping?: number;
  timestep?: number;
  substeps?: number;
  iterations?: number;
  constraints?: readonly XpbdConstraint[];
}
export interface SolverFrame {
  /** Packed targets for every node; only skin nodes receive pose constraints. */
  poseTargets: ArrayLike<number>;
  skullTransform?: AttachmentTransform;
  jawTransform?: AttachmentTransform;
}
export type StepResult = { reset: false } | { reset: true; reason: string };

/** One step always advances one configured fixed timestep. No wall clock, render
 * state, random values or third-party dependencies enter the solver. */
export class XpbdSolver implements ParticleState {
  readonly positions: Float64Array;
  readonly velocities: Float64Array;
  readonly inverseMasses: Float64Array;
  readonly timestep: number;
  readonly substeps: number;
  readonly iterations: number;
  private readonly rest: Float64Array;
  private readonly labels: number[];
  private readonly masses: Float64Array;
  private readonly targets: Float64Array;
  private readonly previous: Float64Array;
  private gravity: Vec3;
  private damping: number;
  private resetRequested = false;
  private readonly constraints: XpbdConstraint[];

  constructor(options: SolverOptions) {
    if (!options.positions.length || options.positions.length % 3 !== 0 || options.labels.length * 3 !== options.positions.length) throw new Error('Invalid particle dimensions');
    this.rest = Float64Array.from(options.positions);
    if (!this.rest.every(Number.isFinite)) throw new Error('Non-finite rest position');
    this.labels = Array.from(options.labels);
    if (this.labels.some(label => ![0, 1, 2].includes(label))) throw new Error('Invalid node label');
    const count = this.labels.length;
    if (options.inverseMasses && options.inverseMasses.length !== count) throw new Error('Invalid mass dimensions');
    this.masses = Float64Array.from(this.labels, (label, i) => {
      const mass = nonnegative(options.inverseMasses?.[i] ?? 1, 'inverse mass');
      return label === 0 ? mass : 0;
    });
    this.positions = this.rest.slice();
    this.velocities = new Float64Array(this.rest.length);
    this.inverseMasses = this.masses.slice();
    this.targets = this.rest.slice();
    this.previous = this.rest.slice();
    this.timestep = options.timestep ?? 1 / 60;
    this.substeps = options.substeps ?? 4;
    this.iterations = options.iterations ?? 5;
    if (!Number.isFinite(this.timestep) || this.timestep <= 0 || !Number.isFinite(this.timestep ** 2) || this.timestep ** 2 === 0) throw new Error('Invalid timestep');
    if (![this.substeps, this.iterations].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid solver iteration count');
    const h = this.timestep / this.substeps;
    if (!Number.isFinite(h) || h * h === 0) throw new Error('Invalid substep duration');
    const gravity = options.gravity ?? [0, -9.81, 0];
    this.gravity = [gravity[0], gravity[1], gravity[2]];
    if (this.gravity.length !== 3 || !this.gravity.every(Number.isFinite)) throw new Error('Invalid gravity');
    this.damping = nonnegative(options.damping ?? 1, 'damping');
    const distanceCompliance = nonnegative(options.distanceCompliance ?? 0, 'distance compliance');
    const poseCompliance = nonnegative(options.poseCompliance ?? 0.001, 'pose compliance');
    const edges = options.edges ?? [];
    if (edges.length % 2) throw new Error('Invalid edge dimensions');
    this.constraints = [];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= count || b >= count) throw new Error('Edge index out of range');
      const length = Math.hypot(...[0, 1, 2].map(axis => this.rest[a * 3 + axis] - this.rest[b * 3 + axis]));
      if (!Number.isFinite(length)) throw new Error('Non-finite rest length');
      this.constraints.push(new DistanceConstraint(a, b, length, distanceCompliance));
    }
    this.labels.forEach((label, i) => {
      if (label === 0) this.constraints.push(new PoseTargetConstraint(i, poseCompliance));
    });
    this.constraints.push(...(options.constraints ?? []));
  }

  getPoseTargets(): Float64Array { return this.targets.slice(); }

  /** Apply tunables without recreating particles or discarding velocities. */
  configure(settings: SolverSettings) {
    if (settings.distanceCompliance !== undefined) nonnegative(settings.distanceCompliance, 'distance compliance');
    if (settings.poseCompliance !== undefined) nonnegative(settings.poseCompliance, 'pose compliance');
    if (settings.damping !== undefined) nonnegative(settings.damping, 'damping');
    if (settings.gravity && (settings.gravity.length !== 3 || !settings.gravity.every(Number.isFinite))) throw new Error('Invalid gravity');
    if (settings.gravity) this.gravity = [settings.gravity[0], settings.gravity[1], settings.gravity[2]];
    if (settings.damping !== undefined) this.damping = settings.damping;
    for (const constraint of this.constraints) {
      if (constraint instanceof DistanceConstraint && settings.distanceCompliance !== undefined) constraint.compliance = settings.distanceCompliance;
      if (constraint instanceof PoseTargetConstraint && settings.poseCompliance !== undefined) constraint.compliance = settings.poseCompliance;
      constraint.reset();
    }
  }

  /** Restore the current pose and attachments, clearing velocity/multipliers. */
  reset(frame: SolverFrame): StepResult {
    this.resetRequested = true;
    try { return this.step(frame); }
    finally { this.resetRequested = false; }
  }

  private attach(skull: AttachmentTransform, jaw: AttachmentTransform) {
    this.labels.forEach((label, node) => {
      if (label === 0) return;
      const m = label === 1 ? skull : jaw, i = node * 3;
      for (let axis = 0; axis < 3; axis++) {
        this.positions[i + axis] = m[axis] * this.rest[i] + m[4 + axis] * this.rest[i + 1] + m[8 + axis] * this.rest[i + 2] + m[12 + axis];
      }
    });
  }

  private finite() {
    return this.positions.every(Number.isFinite) && this.velocities.every(Number.isFinite) && this.inverseMasses.every((w, i) => w === this.masses[i]);
  }

  step(frame: SolverFrame): StepResult {
    if (frame.poseTargets.length !== this.positions.length) throw new Error('Invalid pose target dimensions');
    let invalidTarget = false;
    // Preserve the last finite target coordinate if a caller supplies NaN/Infinity.
    // Valid coordinates from the current frame are still used for recovery.
    for (let i = 0; i < this.targets.length; i++) {
      if (Number.isFinite(frame.poseTargets[i])) this.targets[i] = frame.poseTargets[i];
      else invalidTarget = true;
    }
    const skull = frame.skullTransform ?? IDENTITY_TRANSFORM;
    const jaw = frame.jawTransform ?? IDENTITY_TRANSFORM;
    const validMatrix = (m: AttachmentTransform) => m.length === 16 && m.every(Number.isFinite) && m[3] === 0 && m[7] === 0 && m[11] === 0 && m[15] === 1;
    const matricesValid = validMatrix(skull) && validMatrix(jaw);
    const recover = (reason: string): StepResult => {
      this.positions.set(this.targets);
      this.velocities.fill(0);
      this.inverseMasses.set(this.masses);
      if (matricesValid) {
        this.attach(skull, jaw);
        // Finite matrix entries can still overflow when multiplied.
        if (!this.positions.every(Number.isFinite)) this.positions.set(this.targets);
      }
      for (const constraint of this.constraints) constraint.reset();
      return { reset: true, reason };
    };
    if (invalidTarget) return recover('Non-finite pose target; retained last finite target coordinates');
    if (!matricesValid) return recover('Invalid attachment transform');
    if (this.resetRequested) return recover('Simulation reset requested');
    if (!this.finite()) return recover('Non-finite or invalid particle state');
    const h = this.timestep / this.substeps;
    const decay = Math.exp(-this.damping * h);
    const context: ConstraintContext = { positions: this.positions, velocities: this.velocities, inverseMasses: this.inverseMasses, poseTargets: this.targets, timestep: h };
    for (let substep = 0; substep < this.substeps; substep++) {
      this.previous.set(this.positions);
      for (let node = 0; node < this.inverseMasses.length; node++) {
        if (this.inverseMasses[node] === 0) continue;
        for (let axis = 0; axis < 3; axis++) {
          const i = node * 3 + axis;
          this.velocities[i] = this.velocities[i] * decay + this.gravity[axis] * h;
          this.positions[i] += this.velocities[i] * h;
        }
      }
      this.attach(skull, jaw);
      if (!this.finite()) return recover('Non-finite integration or attachment');
      for (const constraint of this.constraints) constraint.reset();
      for (let iteration = 0; iteration < this.iterations; iteration++) {
        for (const constraint of this.constraints) {
          constraint.project(context);
        }
        if (!this.finite()) return recover('Non-finite constraint result');
        // Hard attachments take precedence even over extension constraints.
        this.attach(skull, jaw);
      }
      for (let i = 0; i < this.velocities.length; i++) {
        this.velocities[i] = this.inverseMasses[Math.floor(i / 3)] === 0 ? 0 : (this.positions[i] - this.previous[i]) / h;
      }
      if (!this.finite()) return recover('Non-finite velocity update');
    }
    return { reset: false };
  }
}
