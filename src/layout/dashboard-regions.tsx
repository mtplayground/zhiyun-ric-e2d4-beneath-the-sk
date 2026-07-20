import {
  DataPanel,
  DataPanelBody,
  DataPanelHeader,
  DataPanelTitle,
} from '@/components/ui/data-panel';
import type { AppConfig } from '@/config/env';
import { cn } from '@/lib/utils';

type RegionProps = {
  config: AppConfig;
};

function StatusPill({
  children,
  tone = 'default',
}: {
  children: string;
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
  return (
    <DataPanel tone="cyan" className="min-h-[28rem] overflow-hidden">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>3D Viewport</DataPanelTitle>
        <StatusPill tone="cyan">Standby</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="grid min-h-[23rem] place-items-center p-6">
        <div className="grid w-full max-w-md gap-5 text-center">
          <div className="mx-auto aspect-square w-44 rounded-full border border-dashed border-telemetry-cyan/35 bg-accent/20" />
          <div className="grid gap-2">
            <p className="text-lg font-semibold">Neutral viewport region</p>
            <p className="truncate font-mono text-xs text-muted-foreground">
              Mesh asset: {config.assets.faceMeshUrl}
            </p>
          </div>
        </div>
      </DataPanelBody>
    </DataPanel>
  );
}

function ControlPanelRegion({ config }: RegionProps) {
  const featureRows = [
    ['Readout', config.features.readoutPanel],
    ['Curve', config.features.deformationCurvePanel],
    ['Precompute', config.features.precomputePanel],
  ] as const;

  return (
    <DataPanel tone="green" className="min-h-[18rem]">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Control Panel</DataPanelTitle>
        <StatusPill tone="green">Regions</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="grid gap-4 p-4">
        <div className="grid gap-2">
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <p className="text-sm font-medium">Preset selectors</p>
            <p className="font-mono text-xs text-muted-foreground">
              Phoneme / FACS / Expression
            </p>
          </div>
          <div className="rounded-md border border-border bg-secondary/50 p-3">
            <p className="text-sm font-medium">Keyboard and slider controls</p>
            <p className="font-mono text-xs text-muted-foreground">
              Reserved panel area
            </p>
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
  return (
    <DataPanel tone="amber" className="min-h-40">
      <DataPanelHeader className="border-b border-border/70">
        <DataPanelTitle>Live Readout</DataPanelTitle>
        <StatusPill tone="amber">Frame 0</StatusPill>
      </DataPanelHeader>
      <DataPanelBody className="grid gap-3 p-4">
        <p className="font-mono text-sm text-foreground">
          Current Pose: Neutral | Frame: 0
        </p>
        <div className="grid grid-cols-3 gap-2 font-mono text-xs text-muted-foreground">
          <span>AU 0</span>
          <span>Jaw</span>
          <span>Lip</span>
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
