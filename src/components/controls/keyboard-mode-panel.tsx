import { useEffect, useMemo, useState } from 'react';

import { applyControlPose } from '@/components/controls/apply-control-pose';
import { findPoseMappingById, type PoseMapping } from '@/domain/poses';
import { cn } from '@/lib/utils';
import {
  controlActions,
  useActiveControlMode,
  useActivePoseLabel,
} from '@/state';

type KeyboardModePanelProps = {
  activationCount: number;
};

type KeyboardPoseMapping = {
  key: string;
  label: string;
  pose: PoseMapping;
};

const helperLine = 'Type: n, a, i, t, e, u, v, y, s, f, b, m, q, c, p, 0';

const keyboardPoseSource = [
  ['0', 'Neu', 'au-0-neutral'],
  ['n', 'N', 'phoneme-n'],
  ['a', 'AA', 'phoneme-aa'],
  ['i', 'IY', 'phoneme-iy'],
  ['t', 'T', 'phoneme-t'],
  ['e', 'EH', 'phoneme-eh'],
  ['u', 'UW', 'phoneme-uw'],
  ['v', 'V', 'phoneme-v'],
  ['y', 'Y', 'phoneme-y'],
  ['s', 'Smile', 'expression-smile'],
  ['f', 'Frown', 'expression-frown'],
  ['b', 'Brow', 'expression-brow'],
  ['m', 'Mouth', 'expression-mouth'],
  ['q', 'Squint', 'expression-squint'],
  ['c', 'Cheek', 'expression-cheek'],
  ['p', 'Pucker', 'expression-pucker'],
] as const;

function poseById(poseId: string) {
  const pose = findPoseMappingById(poseId);

  if (!pose) {
    throw new Error(`Missing keyboard pose mapping for ${poseId}.`);
  }

  return pose;
}

const keyboardPoseMappings: readonly KeyboardPoseMapping[] =
  keyboardPoseSource.map(([key, label, poseId]) => ({
    key,
    label,
    pose: poseById(poseId),
  }));

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset'].includes(
      target.type,
    );
  }

  return (
    target.isContentEditable ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

function applyKeyboardPose(mapping: KeyboardPoseMapping) {
  applyControlPose(mapping.pose, 'keyboard');
}

export default function KeyboardModePanel({
  activationCount,
}: KeyboardModePanelProps) {
  const activePoseLabel = useActivePoseLabel();
  const activeControlMode = useActiveControlMode();
  const [keyboardEnabled, setKeyboardEnabled] = useState(
    activeControlMode === 'keyboard',
  );
  const activeKey = useMemo(
    () =>
      keyboardPoseMappings.find(
        (mapping) => mapping.pose.label === activePoseLabel,
      )?.key ?? null,
    [activePoseLabel],
  );

  useEffect(() => {
    setKeyboardEnabled(activeControlMode === 'keyboard');
  }, [activeControlMode]);

  useEffect(() => {
    if (!keyboardEnabled) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat ||
        isEditableTarget(event.target)
      ) {
        return;
      }

      const mapping = keyboardPoseMappings.find(
        (candidate) => candidate.key === event.key.toLowerCase(),
      );

      if (!mapping) {
        return;
      }

      event.preventDefault();
      applyKeyboardPose(mapping);
    }

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [keyboardEnabled]);

  return (
    <div className="grid gap-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Enable keyboard mode</span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-telemetry-green"
          checked={keyboardEnabled}
          onChange={(event) => {
            const enabled = event.target.checked;
            setKeyboardEnabled(enabled);
            controlActions.setActiveControlMode(
              enabled ? 'keyboard' : 'preset',
            );
          }}
        />
      </label>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 xl:grid-cols-4">
        {keyboardPoseMappings.map((mapping) => {
          const active = keyboardEnabled && activeKey === mapping.key;

          return (
            <button
              key={mapping.key}
              type="button"
              className={cn(
                'grid h-12 min-w-0 content-center gap-0.5 rounded-sm border px-1.5 text-center transition-colors',
                keyboardEnabled
                  ? 'border-border bg-background text-foreground hover:border-telemetry-green/60 hover:bg-telemetry-green/10'
                  : 'border-border/70 bg-background/60 text-muted-foreground',
                active &&
                  'border-telemetry-green bg-telemetry-green/15 text-telemetry-green',
              )}
              disabled={!keyboardEnabled}
              aria-pressed={active}
              onClick={() => {
                applyKeyboardPose(mapping);
              }}
            >
              <span className="font-mono text-[0.68rem] leading-none">
                [{mapping.key}]
              </span>
              <span className="truncate text-[0.68rem] leading-none">
                {mapping.label}
              </span>
            </button>
          );
        })}
      </div>

      <p className="font-mono text-xs text-muted-foreground">{helperLine}</p>
      <p className="font-mono text-xs text-muted-foreground">
        Activations tracked: {activationCount}
      </p>
    </div>
  );
}
