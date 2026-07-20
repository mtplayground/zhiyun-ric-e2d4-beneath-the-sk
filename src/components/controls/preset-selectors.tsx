import { applyControlPose } from '@/components/controls/apply-control-pose';
import {
  actionUnitPoseMappings,
  expressionPoseMappings,
  phonemePoseMappings,
  type PoseMapping,
} from '@/domain/poses';
import { cn } from '@/lib/utils';
import { useActivePoseLabel } from '@/state';

type PresetDropdownProps = {
  label: string;
  placeholder: string;
  poses: readonly PoseMapping[];
  activePoseLabel: string;
};

function activePoseId(poses: readonly PoseMapping[], activePoseLabel: string) {
  return poses.find((pose) => pose.label === activePoseLabel)?.id ?? '';
}

function PresetDropdown({
  label,
  placeholder,
  poses,
  activePoseLabel,
}: PresetDropdownProps) {
  const selectedPoseId = activePoseId(poses, activePoseLabel);

  return (
    <label className="grid gap-1.5">
      <span className="font-mono text-[0.68rem] uppercase text-muted-foreground">
        {label}
      </span>
      <select
        className={cn(
          'h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition-colors',
          'focus:border-telemetry-green focus:ring-2 focus:ring-telemetry-green/25',
          selectedPoseId === '' && 'text-muted-foreground',
        )}
        value={selectedPoseId}
        onChange={(event) => {
          const pose = poses.find(
            (candidate) => candidate.id === event.target.value,
          );

          if (pose) {
            applyControlPose(pose, 'preset');
          }
        }}
      >
        <option value="">{placeholder}</option>
        {poses.map((pose) => (
          <option key={pose.id} value={pose.id}>
            {pose.code ? `${pose.code} - ${pose.label}` : pose.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function PresetSelectors() {
  const activePoseLabel = useActivePoseLabel();

  return (
    <div className="grid gap-3">
      <PresetDropdown
        label="Phoneme"
        placeholder="-- Select Phoneme --"
        poses={phonemePoseMappings}
        activePoseLabel={activePoseLabel}
      />
      <PresetDropdown
        label="FACS Action Unit"
        placeholder="-- Select FACS Action Unit --"
        poses={actionUnitPoseMappings}
        activePoseLabel={activePoseLabel}
      />
      <PresetDropdown
        label="Expressions / Emotions"
        placeholder="-- Select Expression --"
        poses={expressionPoseMappings}
        activePoseLabel={activePoseLabel}
      />
    </div>
  );
}
