import type { ReactNode } from 'react';

import {
  DataPanel,
  DataPanelBody,
  DataPanelHeader,
  DataPanelTitle,
} from '@/components/ui/data-panel';
import KeyboardModePanel from '@/components/controls/keyboard-mode-panel';
import PresetSelectors from '@/components/controls/preset-selectors';
import FaceViewport from '@/components/viewport/face-viewport';
import type { AppConfig } from '@/config/env';
import { cn } from '@/lib/utils';
import {
  useActivationValues,
  useActiveControlMode,
  useActivePoseLabel,
  useControlReadout,
} from '@/state';

type RegionProps = {
  config: AppConfig;
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
  return (
    <header className="grid gap-5 border-b border-border pb-5 lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="grid gap-3">
        <p className="font-mono text-xs uppercase text-telemetry-cyan">
          Research dashboard
        </p>
        <div className="grid gap-2">
          <h1
            id="app-title"
            className="text-3xl font-semibold leading-none tracking-normal text-foreground md:text-5xl"
          >
            Beneath the Skin
          </h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Responsive telemetry workspace for facial deformation research.
          </p>
        </div>
      </div>
      <div className="grid gap-2 text-left lg:min-w-72">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="green">{config.deformationProvider}</StatusPill>
          <StatusPill tone="cyan">Layout ready</StatusPill>
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">
          Pose data: {config.assets.poseDataUrl}
        </p>
      </div>
    </header>
  );
}

function ViewportRegion({ config }: RegionProps) {
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
        />
      </DataPanelBody>
    </DataPanel>
  );
}

function ControlPanelRegion({ config }: RegionProps) {
  const activeControlMode = useActiveControlMode();
  const activationValues = useActivationValues();
  const featureRows = [
    ['Readout', config.features.readoutPanel],
    ['Curve', config.features.deformationCurvePanel],
    ['Precompute', config.features.precomputePanel],
  ] as const;
  const activationCount = Object.keys(activationValues).length;

  return (
    <DataPanel tone="green" className="min-h-[18rem]">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Control Panel</DataPanelTitle>
        <StatusPill tone="green">{activeControlMode}</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="grid gap-4 p-4">
        <div className="grid gap-2">
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <PresetSelectors />
          </div>
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <KeyboardModePanel activationCount={activationCount} />
          </div>
        </div>
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
  const readout = useControlReadout();
  const activationRows = Object.entries(readout.activationValues).slice(0, 3);

  return (
    <DataPanel tone="amber" className="min-h-40">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Live Readout</DataPanelTitle>
        <StatusPill tone="amber">Frame {readout.currentFrameIndex}</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="grid gap-3 p-4">
        <p className="font-mono text-sm text-foreground">
          Current Pose: {readout.activePoseLabel} | Frame:{' '}
          {readout.currentFrameIndex}
        </p>
        <div className="grid grid-cols-3 gap-2 font-mono text-xs text-muted-foreground">
          {activationRows.length > 0 ? (
            activationRows.map(([label, value]) => (
              <span key={label}>
                {label}: {value.toFixed(2)}
              </span>
            ))
          ) : (
            <>
              <span>AU 0: 0.00</span>
              <span>Jaw: 0.00</span>
              <span>Lip: 0.00</span>
            </>
          )}
        </div>
      </DataPanelBody>
    </DataPanel>
  );
}

function DeformationCurveRegion() {
  return (
    <DataPanel tone="cyan" className="min-h-56">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Deformation Curve</DataPanelTitle>
        <StatusPill>Idle</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="p-4">
        <div className="grid h-36 grid-cols-8 items-end gap-2 rounded-md border border-border bg-background/70 p-3">
          {[18, 32, 26, 48, 42, 64, 52, 70].map((height, index) => (
            <div
              key={index}
              className="rounded-sm bg-telemetry-cyan/45"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
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
