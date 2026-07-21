import type { ReactNode } from 'react';

import {
  DataPanel,
  DataPanelBody,
  DataPanelHeader,
  DataPanelTitle,
} from '@/components/ui/data-panel';
import KeyboardModePanel from '@/components/controls/keyboard-mode-panel';
import MuscleSliderPanel from '@/components/controls/muscle-slider-panel';
import PrecomputeController from '@/components/controls/precompute-controller';
import PresetSelectors from '@/components/controls/preset-selectors';
import ProjectionAlignmentPanel from '@/components/controls/projection-alignment-panel';
import ResetToNeutralControl from '@/components/controls/reset-to-neutral-control';
import ProjectHero from '@/components/hero/project-hero';
import DeformationCurvePanel from '@/components/readout/deformation-curve-panel';
import LiveNumericReadout from '@/components/readout/live-numeric-readout';
import FaceViewport from '@/components/viewport/face-viewport';
import type {
  AppConfig,
  FaceTextureConfig,
  ProjectionAlignmentConfig,
} from '@/config/env';
import { cn } from '@/lib/utils';
import {
  useActivationValues,
  useActiveControlMode,
  useActivePoseLabel,
  useCurrentFrameIndex,
} from '@/state';

type RegionProps = {
  config: AppConfig;
};

type ViewportRegionProps = RegionProps & {
  textureConfig: FaceTextureConfig;
};

type ControlPanelRegionProps = RegionProps & {
  projectionAlignment: ProjectionAlignmentConfig;
  onProjectionAlignmentChange: (value: ProjectionAlignmentConfig) => void;
  onProjectionAlignmentReset: () => void;
};

function StatusPill({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: 'default' | 'cyan' | 'green' | 'amber';
}) {
  return (
    <span
      className={cn(
        'rounded-sm border px-2 py-1 font-mono text-[0.68rem] uppercase leading-none text-muted-foreground',
        tone === 'cyan' && 'border-telemetry-cyan/40 text-telemetry-cyan',
        tone === 'green' && 'border-telemetry-green/40 text-telemetry-green',
        tone === 'amber' && 'border-telemetry-amber/40 text-telemetry-amber',
        tone === 'default' && 'border-border',
      )}
    >
      {children}
    </span>
  );
}

function DashboardHeader({ config }: RegionProps) {
  return <ProjectHero config={config} />;
}

function ViewportRegion({ config, textureConfig }: ViewportRegionProps) {
  const activePoseLabel = useActivePoseLabel();

  return (
    <DataPanel tone="cyan" className="min-h-[28rem] overflow-hidden">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>3D Viewport</DataPanelTitle>
        <StatusPill tone="cyan">{activePoseLabel}</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="min-h-[23rem] p-0">
        <FaceViewport
          activePoseLabel={activePoseLabel}
          assetUrl={config.assets.faceMeshUrl}
          textureConfig={textureConfig}
        />
      </DataPanelBody>
    </DataPanel>
  );
}

function ControlPanelRegion({
  config,
  projectionAlignment,
  onProjectionAlignmentChange,
  onProjectionAlignmentReset,
}: ControlPanelRegionProps) {
  const activeControlMode = useActiveControlMode();
  const activationValues = useActivationValues();
  const featureRows = [
    ['Readout', config.features.readoutPanel],
    ['Curve', config.features.deformationCurvePanel],
    ['Precompute', config.features.precomputePanel],
    ['Projection', config.features.projectionAlignmentPanel],
  ] as const;
  const activationCount = Object.keys(activationValues).length;

  return (
    <DataPanel tone="green" className="min-h-[18rem]">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Control Panel</DataPanelTitle>
        <StatusPill tone="green">{activeControlMode}</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="grid gap-4 p-4">
        <ResetToNeutralControl />
        <div className="grid gap-2">
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <PresetSelectors />
          </div>
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <KeyboardModePanel activationCount={activationCount} />
          </div>
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <MuscleSliderPanel />
          </div>
          {config.features.projectionAlignmentPanel ? (
            <div className="rounded-md border border-border bg-secondary/50 p-3">
              <ProjectionAlignmentPanel
                value={projectionAlignment}
                onChange={onProjectionAlignmentChange}
                onReset={onProjectionAlignmentReset}
              />
            </div>
          ) : null}
        </div>
        {config.features.precomputePanel ? <PrecomputeController /> : null}
        <div className="grid gap-2">
          {featureRows.map(([label, enabled]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-3 font-mono text-xs"
            >
              <span className="text-muted-foreground">{label}</span>
              <span
                className={cn(
                  'rounded-sm border px-2 py-1 uppercase',
                  enabled
                    ? 'border-telemetry-green/40 text-telemetry-green'
                    : 'border-border text-muted-foreground',
                )}
              >
                {enabled ? 'On' : 'Off'}
              </span>
            </div>
          ))}
        </div>
      </DataPanelBody>
    </DataPanel>
  );
}

function LiveReadoutRegion() {
  const currentFrameIndex = useCurrentFrameIndex();

  return (
    <DataPanel tone="amber" className="min-h-40">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Live Readout</DataPanelTitle>
        <StatusPill tone="amber">Frame {currentFrameIndex}</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="p-4">
        <LiveNumericReadout />
      </DataPanelBody>
    </DataPanel>
  );
}

function DeformationCurveRegion() {
  const currentFrameIndex = useCurrentFrameIndex();

  return (
    <DataPanel tone="cyan" className="min-h-56">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Deformation Curve</DataPanelTitle>
        <StatusPill tone="cyan">Frame {currentFrameIndex}</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="p-4">
        <DeformationCurvePanel />
      </DataPanelBody>
    </DataPanel>
  );
}

export {
  ControlPanelRegion,
  DashboardHeader,
  DeformationCurveRegion,
  LiveReadoutRegion,
  ViewportRegion,
};
