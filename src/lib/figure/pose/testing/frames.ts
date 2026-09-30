import { bothArms, bothLegs, type PoseFrame } from '../poseSpec';

const T = { en: 'Test', zh: '测试' };

/**
 * A standing frame for the synthetic skeleton (175 cm, `syntheticSkeleton()`): soft knees, feet flat,
 * a dumbbell grip in each hand at the sides. Tests change one thing at a time from here.
 */
export const STAND: PoseFrame = {
  id: 'stand',
  label: T,
  cue: T,
  trunk: { hips: { bodyCm: [0, 89.5, 0] } },
  arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [5, -52, 6] }, elbow: [0, 0, -1], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } }),
  legs: bothLegs({ to: { bodyCm: [10, 0, 14] }, knee: [0, 0, 1], sole: [0, -1, 0], toes: [0, 0, 1], contact: 'flat' }),
};

/** `STAND` with some fields replaced. */
export const stand = (over: Partial<PoseFrame>): PoseFrame => ({ ...STAND, ...over });
