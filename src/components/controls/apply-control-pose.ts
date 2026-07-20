import { appConfig } from '@/config/env';
import { getPoseWeights, type PoseMapping } from '@/domain/poses';
import { controlActions, type ControlMode } from '@/state';

export function applyControlPose(pose: PoseMapping, mode: ControlMode) {
  controlActions.setActivePose(pose.label, {
    mode,
    frameIndex: 0,
    activationValues: getPoseWeights(pose, appConfig.deformationProvider),
  });
}
