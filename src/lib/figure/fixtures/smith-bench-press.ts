import { type ArmGoal, bothArms, bothLegs, type PoseFigureSpec, type TrunkPose } from '../pose/poseSpec';

/**
 * Lying on the flat bench, head toward the back of the rack, the rail over the lower chest. The hinge is
 * 28 cm in front of the rail (`scene.bench.at`), so `cm` puts the hips back over the rail and `bodyCm`
 * slides the body along the bench by stature: the rail stays 16 cm (at 175 cm, scaled) below the shoulders.
 */
const trunk: TrunkPose = { hips: { from: 'bench.hinge', cm: [0, 0, -28], bodyCm: [0, 10, 30] }, pitchDeg: -90, head: { flexDeg: -12 } };
/** Elbows out, down and forward (about 45° from the body at the chest), so the forearms stand under the bar. */
const grip = (): ArmGoal => ({ to: { hold: 'smith-bar', alongCm: 36 }, elbow: [0.4, -1, 0.5], hand: { grip: 'bar', axis: [1, 0, 0], palm: [0, 0, 1], seat: 'palm' } });
const legs = bothLegs({ to: { from: 'body.hips', yFromFloor: true, bodyCm: [26, 0, 52] }, knee: [0.2, 1, 0.3], sole: [0, -1, 0], toes: [0.15, 0, 1], contact: 'flat' });
const contacts = [
  { part: 'pelvis', on: 'bench.seat' },
  { part: 'chest', on: 'bench.back' },
] as const;

/** Smith machine bench press (horizontal push): bench inside the rack, bar on the rails. */
export const SMITH_BENCH_PRESS: PoseFigureSpec = {
  kind: 'pose',
  id: 'smith-bench-press',
  name: { en: 'Smith Machine Bench Press', zh: '史密斯机卧推' },
  scene: { trainer: { catchHeightCm: 60 }, bench: { at: [0, 0, 28], angleDeg: 0 } },
  camera: { azimuthDeg: 28, elevationDeg: 24, distanceCm: 470, target: { from: 'smith.rail', cm: [0, 72, 18] } },
  frames: [
    {
      id: 'unrack',
      label: { en: 'Unrack', zh: '出杠' },
      cue: { en: 'Arms straight, bar over the lower chest', zh: '手臂伸直，杠铃位于下胸上方' },
      trunk,
      arms: bothArms(grip()),
      legs,
      contacts,
      props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 50, 0] } },
      arrow: { track: 'bar', toward: 1, offsetCm: [0, 0, 24] },
    },
    {
      id: 'lower',
      label: { en: 'Lower', zh: '下放' },
      cue: { en: 'Lower to the chest, elbows about 45° from the body', zh: '下放至胸部，肘部与身体约成 45°' },
      trunk,
      arms: bothArms(grip()),
      legs,
      contacts,
      props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 18, 0] } },
    },
    {
      id: 'press',
      label: { en: 'Press', zh: '推起' },
      cue: { en: 'Press up and keep your shoulder blades back', zh: '向上推起，肩胛骨保持后收' },
      trunk,
      arms: bothArms(grip()),
      legs,
      contacts,
      props: { smithBar: { from: 'body.shoulders', bodyCm: [0, 34, 0] } },
      arrow: { track: 'bar', toward: 0, offsetCm: [0, 0, 24] },
    },
  ],
};
