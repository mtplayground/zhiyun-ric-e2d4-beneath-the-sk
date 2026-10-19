import type { SolverTiming } from './physics-telemetry';
import { XpbdSolver, type SolverFrame, type SolverOptions, type SolverSettings, type StepResult } from './xpbd-solver';

/** Timer delivery is variable; simulation increments are always fixed. Long
 * background pauses are dropped rather than causing unbounded catch-up work. */
export function startPhysicsLoop(
  options: SolverOptions,
  output: (positions: Float64Array, result: StepResult, poseTargets: Float64Array, timing: SolverTiming) => void,
  error: (error: unknown) => void,
) {
  const solver = new XpbdSolver(options);
  let frame: SolverFrame = { poseTargets: solver.positions.slice() };
  let previous = performance.now();
  let accumulator = 0;
  const started = previous;
  let totalSteps = 0, nonFiniteResets = 0;
  let lastSolverMs = 0;
  const timing = (): SolverTiming => ({
    solverTimeMs: lastSolverMs,
    simulationRateHz: totalSteps / Math.max((performance.now()-started)/1000, 1e-6),
    nonFiniteResets,
  });
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    const now = performance.now();
    accumulator = Math.min(accumulator + Math.max(0, now - previous) / 1000, solver.timestep * 4);
    previous = now;
    let result: StepResult = { reset: false };
    let steps = 0, elapsed = 0;
    try {
      while (accumulator + 1e-12 >= solver.timestep) {
        const stepStart = performance.now();
        const next = solver.step(frame);
        elapsed += performance.now()-stepStart;
        steps++; totalSteps++;
        if (next.reset) nonFiniteResets++;
        if (next.reset) result = next;
        accumulator = Math.max(0, accumulator - solver.timestep);

      }
      if (steps) {
        lastSolverMs = elapsed / steps;
        output(solver.positions.slice(), result, solver.getPoseTargets(), timing());
      }
    } catch (cause) {
      stopped = true;
      clearInterval(timer);
      error(cause);
    }
  }, Math.max(1, options.timestep ? options.timestep * 1000 : 1000 / 60));
  return {
    setFrame(next: SolverFrame) {
      if (stopped) return;
      if (next.poseTargets.length !== solver.positions.length) throw new Error('Invalid pose target dimensions');
      frame = {
        poseTargets: Float64Array.from(next.poseTargets),
        skullTransform: next.skullTransform && [...next.skullTransform],
        jawTransform: next.jawTransform && [...next.jawTransform],
      };
    },
    configure(settings: SolverSettings) { if (!stopped) solver.configure(settings); },
    reset() {
      if (stopped) return;
      accumulator = 0; previous = performance.now();
      const result = solver.reset(frame);
      output(solver.positions.slice(), result, solver.getPoseTargets(), timing());
    },
    stop() { stopped = true; clearInterval(timer); },
  };
}
