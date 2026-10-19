import { innerNodeMask } from './node-pairing';

export type Vec3 = readonly [number, number, number];
export const SOLVER_DEFAULTS = Object.freeze({ distanceCompliance: 0.0001, poseCompliance: 0.02, innerPoseCompliance: 0.00002, damping: 12 });

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

function positiveCompliance(value: number, name: string) {
  if (nonnegative(value, name) === 0) throw new Error(`Invalid ${name}: pose targets must be soft`);
  return value;
}

export class DistanceConstraint implements XpbdConstraint {
  private lambda = 0;
  constructor(
    readonly a: number,
    readonly b: number,
    public restLength: number,
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
  innerPoseCompliance?: number;
  damping?: number;
  gravity?: Vec3;
}

export interface SolverOptions {
  positions: ArrayLike<number>;
  masses: ArrayLike<number>; // kilograms, including inner nodes
  pairs: ArrayLike<number>; // packed [outer, inner] records
  edges?: ArrayLike<number>; // packed pairs
  distanceCompliance?: number;
  poseCompliance?: number;
  innerPoseCompliance?: number;
  gravity?: Vec3;
  /** Exponential velocity decay rate in inverse seconds. */
  damping?: number;
  timestep?: number;
  substeps?: number;
  iterations?: number;
  constraints?: readonly XpbdConstraint[];
}
export interface SolverFrame {
  /** Packed targets for every node; all nodes receive soft pose constraints. */
  poseTargets: ArrayLike<number>;
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
  private readonly inner: Uint8Array;
  private readonly edgeConstraints: DistanceConstraint[] = [];
  private invalidTarget = false;
  private readonly configuredInverseMasses: Float64Array;
  private readonly targets: Float64Array;
  private readonly previous: Float64Array;
  private gravity: Vec3;
  private damping: number;
  private readonly constraints: XpbdConstraint[];

  constructor(options: SolverOptions) {
    if (!options.positions.length || options.positions.length % 3 !== 0) throw new Error('Invalid particle dimensions');
    this.rest = Float64Array.from(options.positions);
    if (!this.rest.every(Number.isFinite)) throw new Error('Non-finite rest position');
    const count = this.rest.length / 3;
    this.inner = innerNodeMask(options.pairs, count);
    if (options.masses.length !== count) throw new Error('Invalid mass dimensions');
    this.configuredInverseMasses = Float64Array.from(options.masses, mass => {
      if (!Number.isFinite(mass) || mass <= 0 || !Number.isFinite(1 / mass) || 1 / mass <= 0) throw new Error('Invalid SI mass');
      return 1 / mass;
    });
    this.positions = this.rest.slice();
    this.velocities = new Float64Array(this.rest.length);
    this.inverseMasses = this.configuredInverseMasses.slice();
    this.targets = this.rest.slice();
    this.previous = this.rest.slice();
    this.timestep = options.timestep ?? 1 / 60;
    this.substeps = options.substeps ?? 4;
    this.iterations = options.iterations ?? 5;
    if (!Number.isFinite(this.timestep) || this.timestep <= 0 || !Number.isFinite(this.timestep ** 2) || this.timestep ** 2 === 0) throw new Error('Invalid timestep');
    if (![this.substeps, this.iterations].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('Invalid solver iteration count');
    const h = this.timestep / this.substeps;
    if (!Number.isFinite(h) || h * h === 0) throw new Error('Invalid substep duration');
    const gravity = options.gravity ?? [0, 0, 0];
    this.gravity = [gravity[0], gravity[1], gravity[2]];
    if (this.gravity.length !== 3 || !this.gravity.every(Number.isFinite)) throw new Error('Invalid gravity');
    this.damping = nonnegative(options.damping ?? SOLVER_DEFAULTS.damping, 'damping');
    const distanceCompliance = nonnegative(options.distanceCompliance ?? SOLVER_DEFAULTS.distanceCompliance, 'distance compliance');
    const poseCompliance = positiveCompliance(options.poseCompliance ?? SOLVER_DEFAULTS.poseCompliance, 'pose compliance');
    const innerPoseCompliance = positiveCompliance(options.innerPoseCompliance ?? SOLVER_DEFAULTS.innerPoseCompliance, 'inner pose compliance');
    const edges = options.edges ?? [];
    if (edges.length % 2) throw new Error('Invalid edge dimensions');
    this.constraints = [];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i], b = edges[i + 1];
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= count || b >= count) throw new Error('Edge index out of range');
      const length = Math.hypot(...[0, 1, 2].map(axis => this.rest[a * 3 + axis] - this.rest[b * 3 + axis]));
      if (!Number.isFinite(length)) throw new Error('Non-finite rest length');
      const constraint = new DistanceConstraint(a, b, length, distanceCompliance);
      this.edgeConstraints.push(constraint);
      this.constraints.push(constraint);
    }
    for (let node = 0; node < count; node++) this.constraints.push(new PoseTargetConstraint(node, this.inner[node] ? innerPoseCompliance : poseCompliance));
    this.constraints.push(...(options.constraints ?? []));
  }

  getPoseTargets(): Float64Array { return this.targets.slice(); }

  /** Apply tunables without recreating particles or discarding velocities. */
  configure(settings: SolverSettings) {
    if (settings.distanceCompliance !== undefined) nonnegative(settings.distanceCompliance, 'distance compliance');
    if (settings.poseCompliance !== undefined) positiveCompliance(settings.poseCompliance, 'pose compliance');
    if (settings.innerPoseCompliance !== undefined) positiveCompliance(settings.innerPoseCompliance, 'inner pose compliance');
    if (settings.damping !== undefined) nonnegative(settings.damping, 'damping');
    if (settings.gravity && (settings.gravity.length !== 3 || !settings.gravity.every(Number.isFinite))) throw new Error('Invalid gravity');
    if (settings.gravity) this.gravity = [settings.gravity[0], settings.gravity[1], settings.gravity[2]];
    if (settings.damping !== undefined) this.damping = settings.damping;
    for (const constraint of this.constraints) {
      if (constraint instanceof DistanceConstraint && settings.distanceCompliance !== undefined) constraint.compliance = settings.distanceCompliance;
      if (constraint instanceof PoseTargetConstraint) {
        const compliance = this.inner[constraint.node] ? settings.innerPoseCompliance : settings.poseCompliance;
        if (compliance !== undefined) constraint.compliance = compliance;
      }
      constraint.reset();
    }
  }

  /** Copy a submitted pose and update ALL edge targets once, before substeps. */
  submitFrame(frame: SolverFrame) {
    if (frame.poseTargets.length !== this.positions.length) throw new Error('Invalid pose target dimensions');
    this.invalidTarget = false;
    for (let i = 0; i < this.targets.length; i++) {
      if (Number.isFinite(frame.poseTargets[i])) this.targets[i] = frame.poseTargets[i];
      else this.invalidTarget = true;
    }
    for (const edge of this.edgeConstraints) {
      const length = Math.hypot(...[0, 1, 2].map(axis => this.targets[edge.a * 3 + axis] - this.targets[edge.b * 3 + axis]));
      if (Number.isFinite(length)) edge.restLength = length;
      else this.invalidTarget = true;
    }
  }

  private recover(reason: string): StepResult {
    this.positions.set(this.targets);
    this.velocities.fill(0);
    this.inverseMasses.set(this.configuredInverseMasses);
    for (const constraint of this.constraints) constraint.reset();
    this.invalidTarget = false;
    return { reset: true, reason };
  }

  /** Explicit recovery starts exactly at the current pose with zero velocity. */
  reset(frame?: SolverFrame): StepResult {
    if (frame) this.submitFrame(frame);
    return this.recover('Simulation reset requested');
  }

  private finite() {
    return this.positions.every(Number.isFinite) && this.velocities.every(Number.isFinite) && this.inverseMasses.every((w, i) => w === this.configuredInverseMasses[i]);
  }

  step(frame?: SolverFrame): StepResult {
    if (frame) this.submitFrame(frame);
    if (this.invalidTarget) return this.recover('Non-finite pose target or edge length; retained finite target coordinates');
    if (!this.finite()) return this.recover('Non-finite or invalid particle state');
    const h = this.timestep / this.substeps;
    const decay = Math.exp(-this.damping * h);
    const context: ConstraintContext = { positions: this.positions, velocities: this.velocities, inverseMasses: this.inverseMasses, poseTargets: this.targets, timestep: h };
    for (let substep = 0; substep < this.substeps; substep++) {
      this.previous.set(this.positions);
      for (let node = 0; node < this.inverseMasses.length; node++) {
        for (let axis = 0; axis < 3; axis++) {
          const i = node * 3 + axis;
          this.velocities[i] = this.velocities[i] * decay + this.gravity[axis] * h;
          this.positions[i] += this.velocities[i] * h;
        }
      }
      if (!this.finite()) return this.recover('Non-finite integration');
      for (const constraint of this.constraints) constraint.reset();
      for (let iteration = 0; iteration < this.iterations; iteration++) {
        for (const constraint of this.constraints) {
          constraint.project(context);
        }
        if (!this.finite()) return this.recover('Non-finite constraint result');
      }
      for (let i = 0; i < this.velocities.length; i++) {
        this.velocities[i] = (this.positions[i] - this.previous[i]) / h;
      }
      if (!this.finite()) return this.recover('Non-finite velocity update');
    }
    return { reset: false };
  }
}
