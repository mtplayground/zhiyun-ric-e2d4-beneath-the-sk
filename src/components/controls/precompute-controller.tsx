import { CheckCircle2, Loader2, Play } from 'lucide-react';
import { useMemo, useState } from 'react';

import { appConfig } from '@/config/env';
import {
  initializeKeyboardTransitionCache,
  precomputeKeyboardTransitionCache,
  type TransitionPrecomputeProgress,
  type TransitionPrecomputeResult,
} from '@/domain/precompute';
import { cn } from '@/lib/utils';

type PrecomputeStatus =
  'idle' | 'initialized' | 'running' | 'completed' | 'error';

function statusLabel(status: PrecomputeStatus) {
  if (status === 'initialized') {
    return 'Initialized';
  }

  if (status === 'running') {
    return 'Precomputing';
  }

  if (status === 'completed') {
    return 'Completed';
  }

  if (status === 'error') {
    return 'Error';
  }

  return 'Standby';
}

export default function PrecomputeController() {
  const [status, setStatus] = useState<PrecomputeStatus>('idle');
  const [progress, setProgress] = useState<TransitionPrecomputeProgress | null>(
    null,
  );
  const [result, setResult] = useState<TransitionPrecomputeResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const progressPercent = Math.round((progress?.progress ?? 0) * 100);
  const initializedSummary = useMemo(
    () => initializeKeyboardTransitionCache(appConfig.deformationProvider),
    [],
  );

  return (
    <div className="grid gap-3 rounded-md border border-border bg-secondary/50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="text-sm font-medium">Initialize Simulation</p>
          <p className="font-mono text-xs text-muted-foreground">
            {initializedSummary.poseCount} poses |{' '}
            {initializedSummary.transitionCount} transitions
          </p>
        </div>
        <span
          className={cn(
            'rounded-sm border px-2 py-1 font-mono text-[0.68rem] uppercase leading-none',
            status === 'completed'
              ? 'border-telemetry-green/40 text-telemetry-green'
              : status === 'running'
                ? 'border-telemetry-cyan/40 text-telemetry-cyan'
                : status === 'error'
                  ? 'border-destructive/50 text-destructive'
                  : 'border-border text-muted-foreground',
          )}
        >
          {statusLabel(status)}
        </span>
      </div>

      <div className="grid gap-2">
        <button
          type="button"
          className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:border-telemetry-cyan/60 hover:bg-telemetry-cyan/10 focus:outline-none focus:ring-2 focus:ring-telemetry-cyan/25 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === 'running'}
          onClick={() => {
            setErrorMessage(null);
            setResult(
              initializeKeyboardTransitionCache(appConfig.deformationProvider),
            );
            setProgress(null);
            setStatus('initialized');
          }}
        >
          <Play aria-hidden="true" className="h-4 w-4 shrink-0" />
          <span>Initialize Simulation</span>
        </button>
        <button
          type="button"
          className="flex min-h-9 items-center justify-center gap-2 rounded-md border border-telemetry-green/50 bg-telemetry-green/10 px-3 py-2 text-sm font-medium text-telemetry-green transition-colors hover:border-telemetry-green hover:bg-telemetry-green/15 focus:outline-none focus:ring-2 focus:ring-telemetry-green/25 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === 'running'}
          onClick={async () => {
            try {
              setStatus('running');
              setErrorMessage(null);
              setResult(null);
              setProgress({
                completedTransitions: 0,
                totalTransitions: initializedSummary.transitionCount,
                progress: 0,
                currentTransitionLabel: 'Starting',
              });

              const precomputeResult = await precomputeKeyboardTransitionCache({
                providerId: appConfig.deformationProvider,
                onProgress: setProgress,
              });

              setResult(precomputeResult);
              setStatus('completed');
            } catch (error) {
              console.error('Failed to precompute keyboard transitions', error);
              setStatus('error');
              setErrorMessage(
                error instanceof Error
                  ? error.message
                  : 'Unable to precompute keyboard transitions.',
              );
            }
          }}
        >
          {status === 'running' ? (
            <Loader2
              aria-hidden="true"
              className="h-4 w-4 shrink-0 animate-spin"
            />
          ) : (
            <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
          )}
          <span>Precompute All Keyboard Transitions (Fix First-Time Lag)</span>
        </button>
      </div>

      <div className="grid gap-1.5">
        <div
          className="h-2 overflow-hidden rounded-sm bg-background"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={status === 'completed' ? 100 : progressPercent}
        >
          <div
            className="h-full bg-telemetry-green transition-all"
            style={{
              width: `${status === 'completed' ? 100 : progressPercent}%`,
            }}
          />
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {status === 'completed' && result
            ? `Completed: ${result.transitionCount} transitions / ${result.frameCount} frames cached`
            : progress
              ? `${progress.completedTransitions}/${progress.totalTransitions} ${progress.currentTransitionLabel}`
              : 'Cache standby'}
        </p>
        {errorMessage ? (
          <p className="font-mono text-xs text-destructive">{errorMessage}</p>
        ) : null}
      </div>
    </div>
  );
}
