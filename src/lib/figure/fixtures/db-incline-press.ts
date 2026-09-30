import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/** Seated back on the bench at 30°, feet flat in front. */
const trunk: TrunkPose = { hips: { from: 'bench.hinge', bodyCm: [0, 10, 2.5] }, pitchDeg: -60, head: { flexDeg: 10 } };
const press = (to: [number, number, number], elbow: [number, number, number], palm: [number, number, number] = [0, 0.5, 1]): ArmGoal => ({
  to: { from: 'body.shoulder_l', bodyCm: to },
  elbow,
  hand: { grip: 'bar', axis: [1, 0, 0], palm, seat: 'palm' },
});
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [27, 0, 62] }, knee: [0.2, 1, 0.4], sole: [0, -1, 0], toes: [0.2, 0, 1], contact: 'flat' });
/** Seated on the pad, back on the backrest; the thighs rest on the seat's front edge (a loose contact). */
const contacts = [
  { part: 'pelvis', on: 'bench.seat' },
  { part: 'chest', on: 'bench.back' },
  { part: 'thigh_l', on: 'bench.seat', loose: true },
  { part: 'thigh_r', on: 'bench.seat', loose: true },
] as const;

/** Incline dumbbell press (incline push): backrest at 30°, dumbbells pressed over the upper chest. */
export const DB_INCLINE_PRESS: PoseFigureSpec = {
  kind: 'pose',
  id: 'db-incline-press',
  name: { en: 'Incline Dumbbell Press', zh: '上斜哑铃卧推' },
  scene: { bench: { at: [0, 0, 0], angleDeg: 30 } },
  camera: { azimuthDeg: 70, elevationDeg: 12, distanceCm: 420, target: { from: 'bench.hinge', cm: [0, 25, 0] } },
  frames: [
    {
      id: 'start',
      label: { en: 'Press position', zh: '推起位' },
      cue: { en: 'Dumbbells over the upper chest, arms nearly straight', zh: '哑铃位于上胸上方，手臂接近伸直' },
      trunk,
      arms: bothArms(press([7, 53, 11], [1, -0.4, 0])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 1, offsetCm: [14, 0, 0] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower beside the upper chest, forearms vertical', zh: '下放至上胸两侧，前臂保持竖直' },
      trunk,
      arms: bothArms(press([16, 10, 10], [1, -0.5, 0.4], [0, -0.2, 1])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
    },
    {
      id: 'press',
      label: { en: 'Press', zh: '推起' },
      cue: { en: 'Press up and slightly in', zh: '向上并略向内推起' },
      trunk,
      arms: bothArms(press([19, 29, 9], [1, -0.5, -0.2])),
      legs,
      contacts,
      props: { dumbbells: ['l', 'r'] },
      arrow: { track: 'hand_l', toward: 0, offsetCm: [14, 0, 0] },
    },
  ],
};
