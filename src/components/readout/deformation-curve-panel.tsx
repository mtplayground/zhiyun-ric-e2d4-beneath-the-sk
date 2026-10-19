import { usePhysicsState } from '@/state/physics-state';
import { usePhysicsTelemetry } from '@/state/physics-telemetry-state';
import { useEffect, useMemo, useRef, useState } from 'react';
import uPlot, { type AlignedData, type Options } from 'uplot';
import 'uplot/dist/uPlot.min.css';

import { cn } from '@/lib/utils';
import {
  useActivationValues,
  useActivePoseLabel,
  useCurrentFrameIndex,
} from '@/state';

export type CurveSample = {
  frameIndex: number;
  energy: number;
  displacement: number | null;
};

const maxSamples = 160;
const chartHeight = 144;

function computeActivationEnergy(activationValues: Record<string, number>) {
  const values = Object.values(activationValues);

  if (values.length === 0) {
    return 0;
  }

  const squaredSum = values.reduce((sum, value) => sum + value * value, 0);

  return Math.min(1, Math.sqrt(squaredSum / values.length));
}

export function toChartData(samples: readonly CurveSample[]): AlignedData {
  if (samples.length === 0) {
    return [[0], [0], [null]];
  }

  return [
    samples.map((sample) => sample.frameIndex),
    samples.map((sample) => Number(sample.energy.toFixed(4))),
    samples.map(sample => sample.displacement),
  ];
}

export function createChartOptions(width: number): Options {
  return {
    width,
    height: chartHeight,
    class: 'deformation-uplot',
    padding: [10, 10, 18, 36],
    cursor: {
      show: false,
    },
    legend: {
      show: false,
    },
    scales: {
      displacement: { range: (_plot, _min, max) => [0, Math.max(max ?? 0, 0.001) * 1.1] },
      x: {
        time: false,
      },
      y: {
        range: [0, 1],
      },
    },
    axes: [
      {
        stroke: 'rgba(148, 163, 184, 0.72)',
        grid: { stroke: 'rgba(39, 39, 42, 0.78)', width: 1 },
        ticks: { stroke: 'rgba(148, 163, 184, 0.3)', width: 1 },
        size: 18,
        values: (_, ticks) => ticks.map((tick) => `${Math.round(tick)}`),
      },
      {
        stroke: 'rgba(148, 163, 184, 0.72)',
        grid: { stroke: 'rgba(39, 39, 42, 0.72)', width: 1 },
        ticks: { stroke: 'rgba(148, 163, 184, 0.3)', width: 1 },
        size: 34,
        values: (_, ticks) => ticks.map((tick) => tick.toFixed(1)),
      },
      {
        scale: 'displacement', side: 1, size: 58,
        stroke: '#f472b6', grid: { show: false },
        values: (_, ticks) => ticks.map(tick => tick.toFixed(3)),
      },
    ],
    series: [
      {},
      {
        label: 'Activation energy',
        stroke: '#38bdf8',
        width: 2,
        fill: 'rgba(56, 189, 248, 0.12)',
        points: { show: false },
      },
      {
        label: 'Max simulated displacement', scale: 'displacement',
        stroke: '#f472b6', width: 2, points: { show: false }, spanGaps: false,
      },
    ],
  };
}

export default function DeformationCurvePanel() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const samplesRef = useRef<CurveSample[]>([]);
  const summaryRef = useRef({ sampleCount: 0, peakEnergy: 0 });
  const currentFrameIndex = useCurrentFrameIndex();
  const activePoseLabel = useActivePoseLabel();
  const activationValues = useActivationValues();
  const physicsEnabled = usePhysicsState(state => state.enabled);
  const displacement = usePhysicsTelemetry(state => state.snapshot?.telemetry.maxDisplacement ?? null);
  const [showDisplacement, setShowDisplacement] = useState(true);
  const energy = useMemo(
    () => computeActivationEnergy(activationValues),
    [activationValues],
  );

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const initialWidth = Math.max(container.clientWidth, 280);
    const plot = new uPlot(
      createChartOptions(initialWidth),
      toChartData(samplesRef.current),
      container,
    );

    plotRef.current = plot;

    const resizeObserver = new ResizeObserver((entries) => {
      const width = Math.max(
        Math.floor(entries[0]?.contentRect.width ?? initialWidth),
        280,
      );

      plot.setSize({ width, height: chartHeight });
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      plot.destroy();
      plotRef.current = null;
    };
  }, []);

  useEffect(() => {
    const samples = samplesRef.current;
    if (samples.length && currentFrameIndex < samples.at(-1)!.frameIndex) samples.length = 0;
    const lastSample = samples.at(-1);
    const simulatedDisplacement = physicsEnabled ? displacement : null;

    if (lastSample?.frameIndex === currentFrameIndex) {
      lastSample.energy = energy;
      lastSample.displacement = simulatedDisplacement;
    } else {
      samples.push({ frameIndex: currentFrameIndex, energy, displacement: simulatedDisplacement });
    }

    if (samples.length > maxSamples) {
      samples.splice(0, samples.length - maxSamples);
    }

    plotRef.current?.setSeries(2, { show: physicsEnabled && showDisplacement });
    plotRef.current?.setData(toChartData(samples));
    summaryRef.current = {
      sampleCount: samples.length,
      peakEnergy: samples.reduce(
        (peak, sample) => Math.max(peak, sample.energy),
        0,
      ),
    };
  }, [currentFrameIndex, energy, displacement, physicsEnabled, showDisplacement]);

  const { sampleCount, peakEnergy } = summaryRef.current;

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
        <span className="text-telemetry-cyan">Activation energy (left axis)</span>
        {physicsEnabled ? <label className="flex items-center gap-2 text-pink-400">
          <input type="checkbox" checked={showDisplacement} onChange={event=>setShowDisplacement(event.currentTarget.checked)} />
          Max displacement (right axis, face extents)
        </label> : null}
      </div>
      <div className="min-h-36 overflow-hidden rounded-md border border-border bg-background/70 p-2">
        <div ref={containerRef} className="h-36 w-full" aria-hidden="true" />
      </div>
      <div className="grid gap-2 font-mono text-xs sm:grid-cols-3">
        <div className="rounded-sm border border-border bg-background/60 px-2 py-1.5">
          <span className="block text-[0.68rem] uppercase text-muted-foreground">
            Pose
          </span>
          <span className="truncate text-foreground">{activePoseLabel}</span>
        </div>
        <div className="rounded-sm border border-border bg-background/60 px-2 py-1.5">
          <span className="block text-[0.68rem] uppercase text-muted-foreground">
            Energy
          </span>
          <span
            className={cn(
              'text-foreground',
              energy >= 0.5 && 'text-telemetry-cyan',
            )}
          >
            {energy.toFixed(3)}
          </span>
        </div>
        <div className="rounded-sm border border-border bg-background/60 px-2 py-1.5">
          <span className="block text-[0.68rem] uppercase text-muted-foreground">
            Samples / Peak
          </span>
          <span className="text-foreground">
            {sampleCount} / {peakEnergy.toFixed(3)}
          </span>
        </div>
      </div>
    </div>
  );
}
