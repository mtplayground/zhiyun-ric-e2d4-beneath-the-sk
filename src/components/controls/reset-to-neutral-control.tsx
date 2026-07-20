import { RotateCcw } from 'lucide-react';

import { controlActions } from '@/state';

export default function ResetToNeutralControl() {
  return (
    <button
      type="button"
      className="flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-telemetry-amber/50 bg-telemetry-amber/10 px-3 py-2 text-sm font-medium text-telemetry-amber transition-colors hover:border-telemetry-amber hover:bg-telemetry-amber/15 focus:outline-none focus:ring-2 focus:ring-telemetry-amber/30"
      onClick={() => {
        controlActions.resetToNeutral();
      }}
    >
      <RotateCcw aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span>Reset to Neutral (Reopen Rest Pose)</span>
    </button>
  );
}
