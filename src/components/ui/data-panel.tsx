import * as React from 'react';

import { cn } from '@/lib/utils';

type DataPanelProps = React.ComponentProps<'section'> & {
  tone?: 'default' | 'cyan' | 'green' | 'amber';
};

const toneClasses: Record<NonNullable<DataPanelProps['tone']>, string> = {
  default: 'border-panel-border',
  cyan: 'border-telemetry-cyan/50 [--panel-indicator:hsl(var(--telemetry-cyan))]',
  green:
    'border-telemetry-green/50 [--panel-indicator:hsl(var(--telemetry-green))]',
  amber:
    'border-telemetry-amber/50 [--panel-indicator:hsl(var(--telemetry-amber))]',
};

function DataPanel({ className, tone = 'default', ...props }: DataPanelProps) {
  return (
    <section
      data-slot="data-panel"
      className={cn(
        'relative rounded-lg border bg-panel/85 text-panel-foreground shadow-panel',
        'before:absolute before:left-0 before:top-4 before:h-8 before:w-px before:bg-[var(--panel-indicator,hsl(var(--panel-accent)))]',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}

function DataPanelHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="data-panel-header"
      className={cn(
        'flex items-start justify-between gap-4 p-4 pb-3',
        className,
      )}
      {...props}
    />
  );
}

function DataPanelTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return (
    <h2
      data-slot="data-panel-title"
      className={cn(
        'text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function DataPanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="data-panel-body"
      className={cn('px-4 pb-4', className)}
      {...props}
    />
  );
}

export { DataPanel, DataPanelBody, DataPanelHeader, DataPanelTitle };
