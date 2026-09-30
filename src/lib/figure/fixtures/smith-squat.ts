import type { SmithSquatSpec } from '../pose/smithSquat';

/** Smith machine back squat — the M1 spike exercise. Tuned so every frame passes the validators at 150–200 cm. */
export const SMITH_SQUAT: SmithSquatSpec = {
  id: 'smith-squat',
  name: { en: 'Smith Machine Squat', zh: '史密斯机深蹲' },
  camera: { azimuthDeg: 35, elevationDeg: 6, distanceCm: 520, targetYCm: 100 },
  stance: { halfWidthCm: 16, toeOutDeg: 12, forwardOfRailCm: 8 },
  grip: {
    halfWidthCm: 42,
    wristOffsetCm: [0, -2, -4],
    knuckleOffsetCm: [0, 5, -1],
    fingerCurlDeg: [55, 65, 45],
    thumbCurlDeg: [15, 25, 20],
  },
  barRestOffsetCm: [0, -4, -8],
  headFollow: 0.4,
  frames: [
    {
      id: 'unrack',
      label: { en: 'Unrack', zh: '出杠' },
      cue: { en: 'Rotate the bar off the hooks and brace', zh: '转动杠铃脱钩，收紧核心' },
      shankDeg: 2,
      thighDeg: -3,
      arrow: 'down',
    },
    {
      id: 'bottom',
      label: { en: 'Bottom', zh: '最低点' },
      cue: { en: 'Thighs about parallel, heels down', zh: '大腿约与地面平行，脚跟踩实' },
      shankDeg: 22,
      thighDeg: -80,
    },
    {
      id: 'drive',
      label: { en: 'Drive up', zh: '起身' },
      cue: { en: 'Push the floor away', zh: '用力蹬地起身' },
      shankDeg: 12,
      thighDeg: -42,
      arrow: 'up',
    },
  ],
};
