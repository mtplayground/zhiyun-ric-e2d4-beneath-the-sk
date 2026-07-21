import { Code2, FileText, PlayCircle } from 'lucide-react';

import type { AppConfig } from '@/config/env';

type ProjectHeroProps = {
  config: AppConfig;
};

const resourceLinks = [
  {
    label: 'Paper',
    icon: FileText,
  },
  {
    label: 'Video',
    icon: PlayCircle,
  },
  {
    label: 'Code',
    icon: Code2,
  },
] as const;

export default function ProjectHero({ config }: ProjectHeroProps) {
  return (
    <header className="grid gap-5 border-b border-border pb-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
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
          <p className="text-sm font-medium text-foreground">
            Zhiyun Peng, Eugene Fiume, Michael Tao
          </p>
          <p className="max-w-4xl text-sm leading-6 text-muted-foreground">
            Interactive facial deformation workspace for inspecting pose-driven
            blendshape activation and expression formation.
          </p>
        </div>
      </div>

      <div className="grid gap-3 text-left lg:min-w-80">
        <div className="grid grid-cols-3 gap-2">
          {resourceLinks.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className="grid min-h-14 cursor-not-allowed content-center gap-1 rounded-md border border-border bg-secondary/50 px-3 py-2 text-left opacity-80"
              aria-disabled="true"
              title={`${label} coming soon!`}
              onClick={(event) => {
                event.preventDefault();
              }}
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {label}
              </span>
              <span className="font-mono text-[0.68rem] uppercase leading-none text-muted-foreground">
                coming soon!
              </span>
            </button>
          ))}
        </div>
        <p className="truncate font-mono text-xs text-muted-foreground">
          Provider: {config.deformationProvider} | Pose data:{' '}
          {config.assets.poseDataUrl}
        </p>
      </div>
    </header>
  );
}
