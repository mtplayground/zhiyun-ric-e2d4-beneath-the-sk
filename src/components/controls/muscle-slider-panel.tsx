import { useEffect, useMemo, useState } from 'react';

import { appConfig } from '@/config/env';
import { actionUnitPoseMappings, getPoseWeights } from '@/domain/poses';
import type { BlendshapeWeights } from '@/domain/providers';
import { cn } from '@/lib/utils';
import {
  controlActions,
  useActivationValues,
  useActiveControlMode,
} from '@/state';

type SliderValues = Record<string, number>;

type MuscleSliderControl = {
  id: string;
  code: string;
  label: string;
  description: string;
  weights: BlendshapeWeights;
};

const sliderPoseLabel = 'Slider Mix';
const activationEpsilon = 0.001;

function clampSliderValue(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function composeActivationValues(
  sliderValues: SliderValues,
  controls: readonly MuscleSliderControl[],
): BlendshapeWeights {
  const composedWeights = new Map<string, number>();

  controls.forEach((control) => {
    const intensity = clampSliderValue(sliderValues[control.id] ?? 0);

    if (intensity <= activationEpsilon) {
      return;
    }

    Object.entries(control.weights).forEach(([blendshapeName, basisWeight]) => {
      const nextValue =
        (composedWeights.get(blendshapeName) ?? 0) +
        clampSliderValue(basisWeight) * intensity;

      composedWeights.set(blendshapeName, clampSliderValue(nextValue));
    });
  });

  return Object.fromEntries(
    [...composedWeights.entries()]
      .filter(([, value]) => value > activationEpsilon)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

export default function MuscleSliderPanel() {
  const activeControlMode = useActiveControlMode();
  const activationValues = useActivationValues();
  const [sliderValues, setSliderValues] = useState<SliderValues>({});
  const controls = useMemo(
    () =>
      actionUnitPoseMappings
        .map<MuscleSliderControl>((pose) => ({
          id: pose.id,
          code: pose.code,
          label: pose.label.replace(/^AU \d+\s*/, ''),
          description: pose.description,
          weights: getPoseWeights(pose, appConfig.deformationProvider),
        }))
        .filter((control) => Object.keys(control.weights).length > 0),
    [],
  );
  const activeSliderCount = Object.values(sliderValues).filter(
    (value) => value > activationEpsilon,
  ).length;
  const activationCount = Object.keys(activationValues).length;

  useEffect(() => {
    if (activeControlMode !== 'slider') {
      setSliderValues({});
    }
  }, [activeControlMode]);

  function applySliderValues(nextSliderValues: SliderValues) {
    const composedWeights = composeActivationValues(nextSliderValues, controls);
    const nextPoseLabel =
      Object.keys(composedWeights).length > 0 ? sliderPoseLabel : 'Neutral';

    controlActions.setActivePose(nextPoseLabel, {
      mode: 'slider',
      frameIndex: 0,
      activationValues: composedWeights,
    });
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium">Muscle / AU Sliders</p>
          <p className="font-mono text-xs text-muted-foreground">
            {activationCount} live weights | {activeSliderCount} active AU
          </p>
        </div>
        <span
          className={cn(
            'rounded-sm border px-2 py-1 font-mono text-[0.68rem] uppercase leading-none',
            activeControlMode === 'slider'
              ? 'border-telemetry-green/40 text-telemetry-green'
              : 'border-border text-muted-foreground',
          )}
        >
          Slider
        </span>
      </div>

      <div className="grid max-h-80 gap-3 overflow-y-auto pr-1">
        {controls.map((control) => {
          const value = clampSliderValue(sliderValues[control.id] ?? 0);

          return (
            <label key={control.id} className="grid min-w-0 gap-1.5">
              <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-sm text-foreground">
                  <span className="font-mono text-xs text-telemetry-cyan">
                    {control.code}
                  </span>{' '}
                  {control.label}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {value.toFixed(2)}
                </span>
              </span>
              <input
                aria-label={`${control.code} ${control.label}`}
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={value}
                className="h-2 w-full cursor-pointer accent-telemetry-green"
                title={control.description}
                onChange={(event) => {
                  const nextSliderValues = {
                    ...sliderValues,
                    [control.id]: clampSliderValue(event.target.valueAsNumber),
                  };

                  setSliderValues(nextSliderValues);
                  applySliderValues(nextSliderValues);
                }}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
