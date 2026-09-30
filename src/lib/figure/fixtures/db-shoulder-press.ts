import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Seated upright, back against the backrest at 90°. */
const trunk: TrunkPose = { hips: { from: 'bench.hinge', bodyCm: [0, 10, 11] }, pitchDeg: -4 };
const press = (to: [number, number, number], elbow: [number, number, number], shrugDeg = 0): ArmGoal => ({
  to: { from: 'body.shoulder_l', bodyCm: to },
  elbow,
  hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' },
  shrugDeg,
});
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [27, 0, 58] }, knee: [0.2, 0.3, 1], sole: [0, -1, 0], toes: [0.2, 0, 1], contact: 'flat' });
/** Seated on the pad, back on the backrest; the thighs rest on the seat's front edge (a loose contact). */
const contacts = [
  { part: 'pelvis', on: 'bench.seat' },
  { part: 'chest', on: 'bench.back' },
  { part: 'thigh_l', on: 'bench.seat', loose: true },
  { part: 'thigh_r', on: 'bench.seat', loose: true },
] as const;

/** Seated dumbbell shoulder press (vertical push): upright backrest, dumbbells from shoulder height to overhead. */
export const DB_SHOULDER_PRESS: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-shoulder-press',
  name: { en: 'Seated Dumbbell Shoulder Press', zh: '坐姿哑铃肩推' },
  scene: { bench: { at: [0, 0, 0], angleDeg: 90 } },
  camera: { azimuthDeg: 40, elevationDeg: 8, distanceCm: 440, target: { from: 'bench.hinge', cm: [0, 50, 20] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Start', zh: '起始' },
      cue: { en: 'Dumbbells at shoulder height, forearms vertical', zh: '哑铃位于肩部高度，前臂竖直' },
      trunk,
      arms: bothArms(press([20, 14, 4], [1, -0.8, -0.1])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [14, 0, 0] },
    },
    {
      id: 'press',
      label: { en: 'Press', zh: '推举' },
      cue: { en: 'Press overhead without arching your back', zh: '向上推举，背部不要拱起' },
      trunk,
      arms: bothArms(press([1, 55, 4], [1, -0.2, 0], 12)),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower with control back to shoulder height', zh: '有控制地下放回肩部高度' },
      trunk,
      arms: bothArms(press([19, 31, 2], [1, -0.5, 0], 5)),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [14, 0, 0] },
    },
  ],
};
