import { XpbdSolver, type SolverFrame, type SolverOptions, type SolverSettings, type StepResult } from './xpbd-solver';

/** Timer delivery is variable; simulation increments are always fixed. Long
 * background pauses are dropped rather than causing unbounded catch-up work. */
export function startPhysicsLoop(
  options: SolverOptions,
  output: (positions: Float64Array, result: StepResult, poseTargets: Float64Array) => void,
  error: (error: unknown) => void,
) {
  const solver = new XpbdSolver(options);
  let frame: SolverFrame = { poseTargets: solver.positions.slice() };
  let previous = performance.now();
  let accumulator = 0;
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped) return;
    const now = performance.now();
    accumulator = Math.min(accumulator + Math.max(0, now - previous) / 1000, solver.timestep * 4);
    previous = now;
    let result: StepResult = { reset: false };
    let stepped = false;
    try {
      while (accumulator + 1e-12 >= solver.timestep) {
        const next = solver.step(frame);
        if (next.reset) result = next;
        accumulator = Math.max(0, accumulator - solver.timestep);
        stepped = true;
      }
      if (stepped) output(solver.positions.slice(), result, Float64Array.from(frame.poseTargets));
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
      output(solver.positions.slice(), result, Float64Array.from(frame.poseTargets));
    },
    stop() { stopped = true; clearInterval(timer); },
  };
}
