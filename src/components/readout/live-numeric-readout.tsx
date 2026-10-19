import { usePhysicsState } from '@/state/physics-state';
import { usePhysicsTelemetry } from '@/state/physics-telemetry-state';
import type { PhysicsTelemetry } from '@/domain/physics/physics-telemetry';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { useControlReadout } from '@/state';

type ActivationRow = {
  label: string;
  value: number;
};

function formatActivationValue(value: number) {
  return value.toFixed(2);
}

function getActivationRows(
  activationValues: Record<string, number>,
): ActivationRow[] {
  return Object.entries(activationValues)
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => {
      const valueSort = right.value - left.value;

      if (valueSort !== 0) {
        return valueSort;
      }

      return left.label.localeCompare(right.label);
    });
}

export function PhysicsTelemetryReadout({ telemetry }: { telemetry: PhysicsTelemetry }) {
  const rows = [
    ['Solver time / step', `${telemetry.solverTimeMs.toFixed(2)} ms`],
    ['Effective simulation rate', `${telemetry.simulationRateHz.toFixed(1)} Hz`],
    ['Maximum simulated displacement', `${telemetry.maxDisplacement.toFixed(5)} face extents`],
    ['Mean pose-following error', `${telemetry.meanPoseError.toFixed(5)} face extents`],
    ['Non-finite resets', String(telemetry.nonFiniteResets)],
  ];
  return <dl data-testid="physics-telemetry" className="grid gap-2 border-t border-border pt-3 font-mono text-xs">
    {rows.map(([label,value])=><div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right text-foreground">{value}</dd></div>)}
  </dl>;
}

export default function LiveNumericReadout() {
  const readout = useControlReadout();
  const physicsEnabled = usePhysicsState(state => state.enabled);
  const telemetry = usePhysicsTelemetry(state => state.snapshot?.telemetry);
  const activationRows = useMemo(
    () => getActivationRows(readout.activationValues),
    [readout.activationValues],
  );

  return (
    <div className="grid gap-4" aria-live="polite">
      <div className="grid gap-1">
        <p className="font-mono text-sm text-foreground">
          Current Pose: {readout.activePoseLabel} | Frame:{' '}
          {readout.currentFrameIndex}
        </p>
        <p className="font-mono text-xs uppercase text-muted-foreground">
          Mode: {readout.activeControlMode} | Activations:{' '}
          {activationRows.length}
        </p>
      </div>

      <div className="grid gap-2 font-mono text-xs">
        {activationRows.length > 0 ? (
          activationRows.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3"
            >
              <div className="grid min-w-0 gap-1">
                <span className="truncate text-muted-foreground">
                  {row.label}
                </span>
                <span className="h-1.5 overflow-hidden rounded-sm bg-background">
                  <span
                    className="block h-full rounded-sm bg-telemetry-amber"
                    style={{ width: `${Math.round(row.value * 100)}%` }}
                  />
                </span>
              </div>
              <span
                className={cn(
                  'text-right text-foreground',
                  row.value >= 0.75 && 'text-telemetry-amber',
                )}
              >
                {formatActivationValue(row.value)}
              </span>
            </div>
          ))
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
            <div className="grid min-w-0 gap-1">
              <span className="truncate text-muted-foreground">Neutral</span>
              <span className="h-1.5 rounded-sm bg-background" />
            </div>
            <span className="text-right text-foreground">0.00</span>
          </div>
        )}
      </div>
      {physicsEnabled && telemetry ? <PhysicsTelemetryReadout telemetry={telemetry} /> : null}
    </div>
  );
}
