import { bothArms, bothLegs, type LegGoal, type PoseFigureSpec } from '../pose/poseSpec';

const stance: LegGoal = { to: { bodyCm: [12, 0, 13] }, knee: [0.15, 0, 1], sole: [0, -1, 0], toes: [0.12, 0, 1], contact: 'flat' };

/** Standing dumbbell curl (elbow flexion): palms forward, elbows at the sides. */
export const DB_CURL: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-curl',
  name: { en: 'Dumbbell Curl', zh: '哑铃弯举' },
  scene: {},
  camera: { azimuthDeg: 55, elevationDeg: 6, distanceCm: 380, target: { bodyCm: [0, 100, 0] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Arms long, palms forward, elbows by your sides', zh: '手臂伸直，掌心向前，肘部贴近身体' },
      trunk: { hips: { bodyCm: [0, 94.4, 0] } },
      arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [9, -57, 11] }, elbow: [0, 0, -1], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1] } }),
      legs: bothLegs(stance),
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [12, 0, 6] },
    },
    {
      id: 'top',
      label: { en: 'Top', zh: '顶端' },
      cue: { en: 'Curl up without moving the elbows forward', zh: '向上弯举，肘部不要前移' },
      trunk: { hips: { bodyCm: [0, 94.4, 0] } },
      arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [1, -10, 22] }, elbow: [0, -1, -0.3], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0.4, -1] } }),
      legs: bothLegs(stance),
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower slowly to straight arms', zh: '慢慢下放至手臂伸直' },
      trunk: { hips: { bodyCm: [0, 94.4, 0] } },
      arms: bothArms({ to: { from: 'body.shoulder_l', bodyCm: [2, -32, 30] }, elbow: [0, -1, -0.2], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 1, 0] } }),
      legs: bothLegs(stance),
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [12, 0, 6] },
    },
  ],
};
