import { MocapClipData } from '../types/studio';
import { parseBvhMocap } from './bvhParser';

export type BuiltInMocapStyleKey =
  | 'mocap-salsa'
  | 'mocap-ballet'
  | 'mocap-breakdance'
  | 'mocap-moonwalk'
  | 'mocap-house'
  | 'mocap-contemporary'
  | 'mocap-afrobeat'
  | 'mocap-tango'
  | 'mocap-shuffle'
  | 'mocap-kpop'
  | 'mocap-disco'
  | 'mocap-waltz';

export interface BuiltInMocapEntry {
  id: BuiltInMocapStyleKey;
  title: string;
  genre: string;
  bpmLabel: string;
  description: string;
  fileName: string;
  fps: number;
  frameCount: number;
}

export const BUILT_IN_MOCAP_LIBRARY: BuiltInMocapEntry[] = [
  {
    id: 'mocap-salsa',
    title: 'Salsa Cubana',
    genre: 'Latin Groove',
    bpmLabel: '108 BPM',
    description: 'Cuban hip figure-8 weight shifts, quick-quick-slow steps & full turn',
    fileName: 'salsa-cubana.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-ballet',
    title: 'Ballet Pirouette',
    genre: 'Classical',
    bpmLabel: '96 BPM',
    description: 'Relevé pirouette spin, sweeping port de bras & arabesque extension',
    fileName: 'ballet-pirouette-arabesque.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-breakdance',
    title: 'Breakdance Freeze',
    genre: 'B-Boy Street',
    bpmLabel: '118 BPM',
    description: 'Toprock cross-steps, low floorwork spin & angled power freeze',
    fileName: 'breakdance-toprock-freeze.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-moonwalk',
    title: 'Moonwalk Glide',
    genre: 'Funk & Pop',
    bpmLabel: '116 BPM',
    description: 'Toe-pop glide steps, shoulder isolations & crisp hat-tip hits',
    fileName: 'moonwalk-glide.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-house',
    title: 'House Jack',
    genre: 'Club House',
    bpmLabel: '124 BPM',
    description: 'Double-time torso jack wave with nimble heel-toe shuffle footwork',
    fileName: 'house-jack-footwork.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-contemporary',
    title: 'Contemporary Flow',
    genre: 'Modern Lyrical',
    bpmLabel: '88 BPM',
    description: 'Deep spinal release, sweeping overhead arcs & dynamic spiral turn',
    fileName: 'contemporary-flow.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-afrobeat',
    title: 'Afrobeat Zanku',
    genre: 'Afro Pop',
    bpmLabel: '112 BPM',
    description: 'Grounded chest bounce, Zanku legwork hops & rhythmic shoulder rolls',
    fileName: 'afrobeat-zanku.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-tango',
    title: 'Argentine Tango',
    genre: 'Ballroom',
    bpmLabel: '104 BPM',
    description: 'Poised upright frame, sharp gancho leg flicks & dramatic ocho pivots',
    fileName: 'argentine-tango.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-shuffle',
    title: 'Melbourne Shuffle',
    genre: 'EDM Festival',
    bpmLabel: '132 BPM',
    description: 'Fast T-step heel pivots, running-man drives & crisp elbow pumps',
    fileName: 'melbourne-shuffle.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-kpop',
    title: 'K-Pop Point Groove',
    genre: 'Pop Idol',
    bpmLabel: '122 BPM',
    description: 'Tight idol arm locks, synchronized point hits & crisp hip snaps',
    fileName: 'kpop-point-groove.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-disco',
    title: 'Disco Fever',
    genre: '70s Funk',
    bpmLabel: '120 BPM',
    description: 'Classic diagonal Saturday Night point up/down strikes & hustle spin',
    fileName: 'disco-fever.bvh',
    fps: 30,
    frameCount: 120,
  },
  {
    id: 'mocap-waltz',
    title: 'Viennese Waltz',
    genre: 'Classic Ballroom',
    bpmLabel: '84 BPM',
    description: 'Sweeping 3/4 rise-and-fall box sway, open ballroom hold & promenade turn',
    fileName: 'viennese-waltz.bvh',
    fps: 30,
    frameCount: 120,
  },
];

const BUILT_IN_ID_SET = new Set<string>(BUILT_IN_MOCAP_LIBRARY.map((e) => e.id));

export function isBuiltInMocapStyle(style: string | undefined): style is BuiltInMocapStyleKey {
  return Boolean(style && BUILT_IN_ID_SET.has(style));
}

export function getBuiltInMocapEntry(id: BuiltInMocapStyleKey): BuiltInMocapEntry {
  return (
    BUILT_IN_MOCAP_LIBRARY.find((entry) => entry.id === id) ?? BUILT_IN_MOCAP_LIBRARY[0]
  );
}

interface PoseChannels {
  hipsPos: [number, number, number];
  hipsRot: [number, number, number]; // Y, Z, X (deg)
  spine: [number, number, number]; // Z, X, Y
  chest: [number, number, number]; // Z, X, Y
  neck: [number, number, number]; // Z, X, Y
  head: [number, number, number]; // Z, X, Y
  lShoulder: [number, number, number]; // Y, Z, X
  lElbow: [number, number, number]; // Y, Z, X
  lWrist: [number, number, number]; // Y, Z, X
  rShoulder: [number, number, number]; // Y, Z, X
  rElbow: [number, number, number]; // Y, Z, X
  rWrist: [number, number, number]; // Y, Z, X
  lHip: [number, number, number]; // Y, Z, X
  lKnee: [number, number, number]; // X, Z, Y
  lAnkle: [number, number, number]; // X, Z, Y
  rHip: [number, number, number]; // Y, Z, X
  rKnee: [number, number, number]; // X, Z, Y
  rAnkle: [number, number, number]; // X, Z, Y
}

function smoothStep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function bellWindow(phase: number, start: number, peak: number, end: number): number {
  if (phase <= start || phase >= end) return 0;
  if (phase <= peak) return smoothStep(start, peak, phase);
  return 1 - smoothStep(peak, end, phase);
}

function solvePoseForStyle(style: BuiltInMocapStyleKey, u: number): PoseChannels {
  const tau = Math.PI * 2;
  const w1 = u * tau;
  const w2 = u * tau * 2;
  const w4 = u * tau * 4;

  if (style === 'mocap-salsa') {
    // Cuban hip figure-8, quick-quick-slow steps & smooth 360 turn on second half
    const turnEnvelope = smoothStep(0.55, 0.85, u);
    const spinY = turnEnvelope * 360;
    const hipSway = Math.sin(w2);
    const stepL = Math.max(0, Math.sin(w4));
    const stepR = Math.max(0, -Math.sin(w4));

    return {
      hipsPos: [hipSway * 5.5, 90 - Math.abs(Math.cos(w4)) * 2.5, Math.sin(w4) * 4.5],
      hipsRot: [spinY, hipSway * 9, 4],
      spine: [-hipSway * 5, 3, -hipSway * 8],
      chest: [-hipSway * 6, 4, Math.sin(w2 + 0.6) * 16],
      neck: [hipSway * 3, -2, -Math.sin(w2) * 8],
      head: [hipSway * 4, -3, -Math.sin(w2) * 6],
      lShoulder: [26 + Math.sin(w4) * 18, 56 - Math.sin(w2) * 10, -8],
      lElbow: [74 + Math.cos(w4) * 16, -42, 0],
      lWrist: [10, -14 * Math.sin(w4), 12],
      rShoulder: [-26 + Math.sin(w4) * 18, -56 - Math.sin(w2) * 10, 8],
      rElbow: [-74 + Math.cos(w4) * 16, 42, 0],
      rWrist: [-10, 14 * Math.sin(w4), -12],
      lHip: [Math.sin(w2) * 8, -4 + hipSway * 4, -18 * stepL + 6 * stepR],
      lKnee: [14 + stepL * 32, 0, 0],
      lAnkle: [-10 - stepL * 14, 0, 0],
      rHip: [Math.sin(w2) * 8, 4 + hipSway * 4, -18 * stepR + 6 * stepL],
      rKnee: [14 + stepR * 32, 0, 0],
      rAnkle: [-10 - stepR * 14, 0, 0],
    };
  }

  if (style === 'mocap-ballet') {
    // 0.00-0.28: Prep plié & fifth port de bras
    // 0.28-0.62: Relevé pirouette (360° turn with passé knee raised)
    // 0.62-0.92: Graceful arabesque extension
    // 0.92-1.00: Smooth return to first position
    const pirouetteWin = bellWindow(u, 0.24, 0.45, 0.65);
    const pirouetteSpin = smoothStep(0.28, 0.6, u) * 360;
    const arabesqueWin = bellWindow(u, 0.6, 0.77, 0.95);
    const plieWin = bellWindow(u, 0.06, 0.17, 0.28);

    const hipLift = pirouetteWin * 8 - plieWin * 11 - arabesqueWin * 4;
    const armCrown = bellWindow(u, 0.14, 0.45, 0.66);

    return {
      hipsPos: [Math.sin(w1) * 3, 92 + hipLift, Math.sin(w1) * 3],
      hipsRot: [pirouetteSpin - arabesqueWin * 55, arabesqueWin * -8, arabesqueWin * 26],
      spine: [0, arabesqueWin * -10 - plieWin * 4, 0],
      chest: [0, arabesqueWin * -12, Math.sin(w1) * 6],
      neck: [0, arabesqueWin * -14, 0],
      head: [Math.sin(w1) * 6, -6 - arabesqueWin * 10, 0],
      lShoulder: [22 + armCrown * 24 + arabesqueWin * 58, 22 - armCrown * 76 - arabesqueWin * 28, 0],
      lElbow: [36 + armCrown * 24 - arabesqueWin * 24, -18 - armCrown * 34, 0],
      lWrist: [0, -14, 8],
      rShoulder: [-22 - armCrown * 24 + arabesqueWin * 54, -22 + armCrown * 76 - arabesqueWin * 6, 0],
      rElbow: [-36 - armCrown * 24 + arabesqueWin * 24, 18 + armCrown * 34, 0],
      rWrist: [0, 14, -8],
      lHip: [-10, -8 - pirouetteWin * 6, -pirouetteWin * 68 - arabesqueWin * 8],
      lKnee: [plieWin * 36 + pirouetteWin * 96, 0, 0],
      lAnkle: [pirouetteWin * 36, 0, 0],
      rHip: [10, 8, arabesqueWin * 76 - plieWin * 10],
      rKnee: [plieWin * 36 + arabesqueWin * 8, 0, 0],
      rAnkle: [pirouetteWin * 28 + arabesqueWin * 32, 0, 0],
    };
  }

  if (style === 'mocap-breakdance') {
    // 0.00-0.38: Energetic B-boy Toprock cross-steps
    // 0.38-0.70: Drop low into floorwork spin
    // 0.70-0.92: Power Freeze (angled torso, one arm punched high, kick wide)
    // 0.92-1.00: Pop back up
    const dropWin = bellWindow(u, 0.35, 0.54, 0.72);
    const floorSpin = smoothStep(0.38, 0.68, u) * 360;
    const freezeWin = bellWindow(u, 0.68, 0.81, 0.96);
    const toprock = 1 - Math.max(dropWin, freezeWin);
    const kick = Math.sin(w4);

    return {
      hipsPos: [
        Math.sin(w2) * 8 * toprock,
        88 - dropWin * 36 - freezeWin * 24 - Math.abs(kick) * 4 * toprock,
        Math.cos(w2) * 4,
      ],
      hipsRot: [
        floorSpin + freezeWin * 35,
        freezeWin * 34 + Math.sin(w2) * 8 * toprock,
        10 + dropWin * 24 + freezeWin * 28,
      ],
      spine: [freezeWin * 12, 8 + dropWin * 16, Math.sin(w4) * 14 * toprock],
      chest: [freezeWin * 14, 10 + dropWin * 14, -Math.sin(w4) * 18 * toprock],
      neck: [-freezeWin * 14, -8, 0],
      head: [-freezeWin * 18, -10, Math.sin(w2) * 12],
      lShoulder: [
        20 * toprock + freezeWin * 10,
        34 * toprock + dropWin * 22 - freezeWin * 95,
        0,
      ],
      lElbow: [45 * toprock + dropWin * 28, -28 * toprock - freezeWin * 18, 0],
      lWrist: [0, 0, 0],
      rShoulder: [
        -20 * toprock - freezeWin * 36,
        -34 * toprock - dropWin * 28 - freezeWin * 35,
        0,
      ],
      rElbow: [-45 * toprock - dropWin * 32, 28 * toprock + freezeWin * 28, 0],
      rWrist: [0, 0, 0],
      lHip: [
        0,
        -8 - freezeWin * 36 - dropWin * 14,
        -18 * toprock - Math.max(0, kick) * 26 * toprock - dropWin * 64 - freezeWin * 48,
      ],
      lKnee: [22 * toprock + dropWin * 96 + freezeWin * 18, 0, 0],
      lAnkle: [-12, 0, 0],
      rHip: [
        0,
        8 + freezeWin * 26 + dropWin * 14,
        -18 * toprock - Math.max(0, -kick) * 26 * toprock - dropWin * 52 - freezeWin * 22,
      ],
      rKnee: [22 * toprock + dropWin * 82 + freezeWin * 68, 0, 0],
      rAnkle: [-12, 0, 0],
    };
  }

  if (style === 'mocap-moonwalk') {
    // Classic moonwalk alternating locked-straight slide leg vs popped bent knee + fedora tilt
    const stride = Math.sin(w2);
    const lPop = Math.max(0, stride);
    const rPop = Math.max(0, -stride);
    const leanPulse = Math.sin(w4);

    return {
      hipsPos: [Math.sin(w1) * 5, 89 - Math.abs(stride) * 3, Math.sin(w2) * 3],
      hipsRot: [-38 + Math.sin(w1) * 14, leanPulse * 3, 10 + Math.abs(stride) * 4],
      spine: [0, 6, Math.sin(w2) * 8],
      chest: [0, 6, -Math.sin(w2) * 12],
      neck: [0, -8 + leanPulse * 6, 0],
      head: [Math.sin(w2) * 6, -12 + leanPulse * 8, 0],
      lShoulder: [-16 * stride, 68, 0],
      lElbow: [36 + lPop * 28, -22, 0],
      lWrist: [0, -10, 0],
      rShoulder: [-34 - rPop * 18, -14 + rPop * 48, 0],
      rElbow: [-88 - rPop * 22, 68 + rPop * 14, 0],
      rWrist: [-15, 22, 0],
      lHip: [0, -4, -36 * lPop + 20 * rPop],
      lKnee: [lPop * 56 + 4, 0, 0],
      lAnkle: [-lPop * 24 + rPop * 18, 0, 0],
      rHip: [0, 4, -36 * rPop + 20 * lPop],
      rKnee: [rPop * 56 + 4, 0, 0],
      rAnkle: [-rPop * 24 + lPop * 18, 0, 0],
    };
  }

  if (style === 'mocap-house') {
    // Double-time torso jack wave + crisp heel-toe shuffle footwork
    const jackWave = Math.sin(w4);
    const jackChest = Math.sin(w4 - 0.7);
    const foot = Math.sin(w2);
    const liftL = Math.max(0, foot);
    const liftR = Math.max(0, -foot);

    return {
      hipsPos: [Math.sin(w2) * 6, 89 - Math.abs(jackWave) * 5, jackWave * 4],
      hipsRot: [Math.sin(w1) * 26, Math.sin(w2) * 6, 8 + jackWave * 9],
      spine: [Math.sin(w2) * 5, jackWave * 10, 0],
      chest: [-Math.sin(w2) * 6, jackChest * 14, -Math.sin(w2) * 14],
      neck: [0, -jackChest * 8, 0],
      head: [0, -jackChest * 10, 0],
      lShoulder: [18 - foot * 28, 52 - liftL * 14, 0],
      lElbow: [56 + Math.abs(jackWave) * 18, -32, 0],
      lWrist: [0, -12 * jackWave, 0],
      rShoulder: [-18 - foot * 28, -52 + liftR * 14, 0],
      rElbow: [-56 - Math.abs(jackWave) * 18, 32, 0],
      rWrist: [0, 12 * jackWave, 0],
      lHip: [Math.sin(w2) * 10, -8 - liftL * 12, -32 * liftL + 10 * liftR],
      lKnee: [14 + liftL * 54, 0, 0],
      lAnkle: [-10 + liftL * 16, 0, 0],
      rHip: [Math.sin(w2) * 10, 8 + liftR * 12, -32 * liftR + 10 * liftL],
      rKnee: [14 + liftR * 54, 0, 0],
      rAnkle: [-10 + liftR * 16, 0, 0],
    };
  }

  if (style === 'mocap-afrobeat') {
    // Rhythmic chest bounce + alternating Zanku legwork hops + shoulder roll accents
    const bounce = Math.abs(Math.sin(w4));
    const kick = Math.sin(w2);
    const hopL = Math.max(0, kick);
    const hopR = Math.max(0, -kick);
    const sway = Math.sin(w2);

    return {
      hipsPos: [sway * 5, 87 - bounce * 5.5 + (hopL + hopR) * 2.5, Math.sin(w4) * 3],
      hipsRot: [Math.sin(w1) * 18, sway * 7, 12 + bounce * 6],
      spine: [-sway * 5, 6 + bounce * 6, sway * 8],
      chest: [-sway * 6, 8 + bounce * 8, -sway * 12],
      neck: [0, -6, 0],
      head: [sway * 5, -8 - bounce * 5, 0],
      lShoulder: [20 + Math.sin(w4) * 18, 46 - bounce * 18, 0],
      lElbow: [78 + bounce * 16, -34, 0],
      lWrist: [0, -16 * Math.sin(w4), 10],
      rShoulder: [-20 + Math.sin(w4) * 18, -46 + bounce * 18, 0],
      rElbow: [-78 - bounce * 16, 34, 0],
      rWrist: [0, 16 * Math.sin(w4), -10],
      lHip: [hopL * 14, -10 - hopL * 14, -44 * hopL - 8],
      lKnee: [16 + hopL * 72, 0, 0],
      lAnkle: [-8 + hopL * 18, 0, 0],
      rHip: [-hopR * 14, 10 + hopR * 14, -44 * hopR - 8],
      rKnee: [16 + hopR * 72, 0, 0],
      rAnkle: [-8 + hopR * 18, 0, 0],
    };
  }

  if (style === 'mocap-tango') {
    // Sharp ocho pivots, poised upright ballroom frame & quick gancho leg flick
    const ocho = Math.sin(w1);
    const flickWin = bellWindow(u, 0.38, 0.48, 0.6);
    const sweepWin = bellWindow(u, 0.72, 0.84, 0.96);

    return {
      hipsPos: [ocho * 7, 89 - flickWin * 5, Math.sin(w2) * 3],
      hipsRot: [ocho * 42, ocho * 5, 3],
      spine: [-ocho * 4, -2, -ocho * 10],
      chest: [-ocho * 4, -3, -ocho * 14],
      neck: [ocho * 4, 2, ocho * 12],
      head: [ocho * 6, -2, ocho * 16],
      lShoulder: [44, 6, 0],
      lElbow: [74, -22, 0],
      lWrist: [10, -10, 0],
      rShoulder: [-44, -8, 0],
      rElbow: [-74, 24, 0],
      rWrist: [-10, 10, 0],
      lHip: [ocho * 12, -6 - sweepWin * 18, -14 - flickWin * 48 + sweepWin * 20],
      lKnee: [12 + flickWin * 88 + sweepWin * 12, 0, 0],
      lAnkle: [flickWin * 26, 0, 0],
      rHip: [ocho * 12, 6 + sweepWin * 12, -12 - sweepWin * 32],
      rKnee: [12 + sweepWin * 26, 0, 0],
      rAnkle: [sweepWin * 18, 0, 0],
    };
  }

  if (style === 'mocap-shuffle') {
    // High-tempo running-man + T-step pivots at double cadence
    const stride = Math.sin(w4);
    const liftL = Math.max(0, stride);
    const liftR = Math.max(0, -stride);
    const tStep = Math.sin(w2);

    return {
      hipsPos: [tStep * 7, 88 + Math.abs(Math.cos(w4)) * 4.5, 0],
      hipsRot: [tStep * 18, tStep * 5, 6],
      spine: [0, 5, -tStep * 6],
      chest: [0, 5, -stride * 12],
      neck: [0, -4, 0],
      head: [0, -6, stride * 6],
      lShoulder: [-stride * 34, 58, 0],
      lElbow: [68, -28, 0],
      lWrist: [0, 0, 0],
      rShoulder: [-stride * 34, -58, 0],
      rElbow: [-68, 28, 0],
      rWrist: [0, 0, 0],
      lHip: [0, -6 - Math.max(0, tStep) * 14, -42 * liftL + 18 * liftR],
      lKnee: [10 + liftL * 74, 0, 0],
      lAnkle: [-8 + liftL * 14, 0, 0],
      rHip: [0, 6 + Math.max(0, -tStep) * 14, -42 * liftR + 18 * liftL],
      rKnee: [10 + liftR * 74, 0, 0],
      rAnkle: [-8 + liftR * 14, 0, 0],
    };
  }

  if (style === 'mocap-kpop') {
    // Crisp quantized idol point hits, sharp head snaps & alternating hip pops
    const beat4 = Math.floor(u * 4);
    const sub = (u * 4) % 1;
    const snap = smoothStep(0, 0.25, sub);
    const hipPop = (beat4 % 2 === 0 ? 1 : -1) * Math.sin(sub * Math.PI);
    const poseA = beat4 === 0 || beat4 === 2 ? 1 : 0;
    const poseB = beat4 === 1 ? 1 : 0;
    const poseC = beat4 === 3 ? 1 : 0;

    return {
      hipsPos: [hipPop * 6, 89 - snap * 3, 0],
      hipsRot: [poseB * 18 - poseC * 18, hipPop * 8, 5],
      spine: [-hipPop * 4, 4, poseA * 8 - poseB * 8],
      chest: [-hipPop * 5, 5, poseA * 12 - poseB * 12],
      neck: [0, -4, 0],
      head: [hipPop * 7, -6, poseC * 14 - poseB * 10],
      lShoulder: [
        34 * poseA + 18 * poseB + 48 * poseC,
        24 * poseA + 58 * poseB - 28 * poseC,
        0,
      ],
      lElbow: [74 * poseA + 86 * poseB + 22 * poseC, -44 * poseA - 28 * poseB, 0],
      lWrist: [0, -14, 0],
      rShoulder: [
        -38 * poseC - 22 * poseA - 18 * poseB,
        -52 * poseA + 32 * poseB - 38 * poseC,
        0,
      ],
      rElbow: [-32 * poseA - 26 * poseB - 78 * poseC, 22 * poseA + 44 * poseB + 32 * poseC, 0],
      rWrist: [0, 14, 0],
      lHip: [0, -6 - Math.max(0, hipPop) * 8, -12 - poseB * 16],
      lKnee: [14 + poseB * 28, 0, 0],
      lAnkle: [-8, 0, 0],
      rHip: [0, 6 + Math.max(0, -hipPop) * 8, -12 - poseC * 16],
      rKnee: [14 + poseC * 28, 0, 0],
      rAnkle: [-8, 0, 0],
    };
  }

  if (style === 'mocap-disco') {
    // Classic Saturday Night diagonal point up / hip down + hustle spin
    const pointCycle = Math.sin(w2);
    const upR = Math.max(0, pointCycle);
    const upL = Math.max(0, -pointCycle);
    const hustleSpin = bellWindow(u, 0.56, 0.72, 0.9) > 0 ? smoothStep(0.56, 0.88, u) * 360 : 0;

    return {
      hipsPos: [pointCycle * 7, 90 - Math.abs(Math.cos(w4)) * 3.5, 0],
      hipsRot: [hustleSpin - pointCycle * 16, -pointCycle * 8, 4],
      spine: [pointCycle * 6, -4, pointCycle * 8],
      chest: [pointCycle * 7, -4, pointCycle * 12],
      neck: [-pointCycle * 4, 2, 0],
      head: [-pointCycle * 6, 4, -pointCycle * 10],
      lShoulder: [18 + upL * 16, 62 - upL * 122, 0],
      lElbow: [18 + (1 - upL) * 44, -12 - upL * 18, 0],
      lWrist: [0, 0, 0],
      rShoulder: [-18 - upR * 16, -62 + upR * 122, 0],
      rElbow: [-18 - (1 - upR) * 44, 12 + upR * 18, 0],
      rWrist: [0, 0, 0],
      lHip: [0, -6 - upL * 8, -10 - Math.max(0, Math.sin(w4)) * 18],
      lKnee: [12 + Math.max(0, Math.sin(w4)) * 32, 0, 0],
      lAnkle: [-8, 0, 0],
      rHip: [0, 6 + upR * 8, -10 - Math.max(0, -Math.sin(w4)) * 18],
      rKnee: [12 + Math.max(0, -Math.sin(w4)) * 32, 0, 0],
      rAnkle: [-8, 0, 0],
    };
  }

  if (style === 'mocap-waltz') {
    // Graceful 3/4 rise-and-fall sway, open ballroom arm hold & full promenade rotation
    const w3 = u * tau * 3;
    const rise = (Math.sin(w3 - Math.PI * 0.5) + 1) * 0.5;
    const sway = Math.sin(w1);
    const turn = u * 360;

    return {
      hipsPos: [sway * 8, 88 + rise * 7, Math.sin(w2) * 4],
      hipsRot: [turn, sway * 9, -2],
      spine: [sway * 5, -4, sway * 6],
      chest: [sway * 6, -6, -sway * 8],
      neck: [-sway * 4, 2, sway * 6],
      head: [-sway * 6, 2, sway * 10],
      lShoulder: [28, -4 + rise * 12, 0],
      lElbow: [52, -22, 0],
      lWrist: [10, -10, 0],
      rShoulder: [-28, 4 - rise * 12, 0],
      rElbow: [-52, 22, 0],
      rWrist: [-10, 10, 0],
      lHip: [0, -6 - Math.max(0, sway) * 10, -14 * Math.max(0, Math.sin(w3)) + 10 * Math.max(0, -Math.sin(w3))],
      lKnee: [(1 - rise) * 28 + 6, 0, 0],
      lAnkle: [rise * 22, 0, 0],
      rHip: [0, 6 + Math.max(0, -sway) * 10, -14 * Math.max(0, -Math.sin(w3)) + 10 * Math.max(0, Math.sin(w3))],
      rKnee: [(1 - rise) * 28 + 6, 0, 0],
      rAnkle: [rise * 22, 0, 0],
    };
  }

  // 'mocap-contemporary': sweeping lyrical contraction, release, spiral turn & lateral lunge
  const spiralTurn = bellWindow(u, 0.42, 0.62, 0.82) > 0 ? smoothStep(0.42, 0.78, u) * 360 : 0;
  const contract = Math.max(0, Math.sin(w1));
  const release = Math.max(0, -Math.sin(w1));
  const sway = Math.sin(w1);

  return {
    hipsPos: [sway * 10, 89 - contract * 9 + release * 3, Math.sin(w2) * 4],
    hipsRot: [spiralTurn, sway * 12, contract * 14 - release * 8],
    spine: [sway * 10, contract * 22 - release * 14, sway * 10],
    chest: [sway * 12, contract * 24 - release * 18, -sway * 14],
    neck: [-sway * 6, -release * 10 + contract * 8, 0],
    head: [-sway * 8, -release * 14 + contract * 10, 0],
    lShoulder: [28 + Math.sin(w2) * 28, -26 - release * 42 + contract * 44, 0],
    lElbow: [24 + contract * 34, -18 - release * 24, 0],
    lWrist: [10, -18 * Math.cos(w1), 0],
    rShoulder: [-28 + Math.sin(w2) * 28, 26 + release * 42 - contract * 44, 0],
    rElbow: [-24 - contract * 34, 18 + release * 24, 0],
    rWrist: [-10, 18 * Math.cos(w1), 0],
    lHip: [0, -10 - Math.max(0, sway) * 18, -14 - contract * 20],
    lKnee: [12 + contract * 44 + Math.max(0, sway) * 18, 0, 0],
    lAnkle: [release * 18, 0, 0],
    rHip: [0, 10 + Math.max(0, -sway) * 18, -14 + release * 24],
    rKnee: [12 + contract * 28 + Math.max(0, -sway) * 18, 0, 0],
    rAnkle: [release * 18, 0, 0],
  };
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function buildBvhTextForStyle(entry: BuiltInMocapEntry): string {
  const header = [
    'HIERARCHY',
    'ROOT Hips',
    '{',
    '  OFFSET 0.00 92.00 0.00',
    '  CHANNELS 6 Xposition Yposition Zposition Yrotation Zrotation Xrotation',
    '  JOINT Spine',
    '  {',
    '    OFFSET 0.00 18.00 0.00',
    '    CHANNELS 3 Zrotation Xrotation Yrotation',
    '    JOINT Chest',
    '    {',
    '      OFFSET 0.00 22.00 0.00',
    '      CHANNELS 3 Zrotation Xrotation Yrotation',
    '      JOINT Neck',
    '      {',
    '        OFFSET 0.00 16.00 0.00',
    '        CHANNELS 3 Zrotation Xrotation Yrotation',
    '        JOINT Head',
    '        {',
    '          OFFSET 0.00 12.00 0.00',
    '          CHANNELS 3 Zrotation Xrotation Yrotation',
    '          End Site',
    '          {',
    '            OFFSET 0.00 14.00 0.00',
    '          }',
    '        }',
    '      }',
    '      JOINT LeftShoulder',
    '      {',
    '        OFFSET -16.00 10.00 0.00',
    '        CHANNELS 3 Yrotation Zrotation Xrotation',
    '        JOINT LeftElbow',
    '        {',
    '          OFFSET -26.00 0.00 0.00',
    '          CHANNELS 3 Yrotation Zrotation Xrotation',
    '          JOINT LeftWrist',
    '          {',
    '            OFFSET -24.00 0.00 0.00',
    '            CHANNELS 3 Yrotation Zrotation Xrotation',
    '            End Site',
    '            {',
    '              OFFSET -8.00 0.00 0.00',
    '            }',
    '          }',
    '        }',
    '      }',
    '      JOINT RightShoulder',
    '      {',
    '        OFFSET 16.00 10.00 0.00',
    '        CHANNELS 3 Yrotation Zrotation Xrotation',
    '        JOINT RightElbow',
    '        {',
    '          OFFSET 26.00 0.00 0.00',
    '          CHANNELS 3 Yrotation Zrotation Xrotation',
    '          JOINT RightWrist',
    '          {',
    '            OFFSET 24.00 0.00 0.00',
    '            CHANNELS 3 Yrotation Zrotation Xrotation',
    '            End Site',
    '            {',
    '              OFFSET 8.00 0.00 0.00',
    '            }',
    '          }',
    '        }',
    '      }',
    '    }',
    '  }',
    '  JOINT LeftHip',
    '  {',
    '    OFFSET -11.00 -4.00 0.00',
    '    CHANNELS 3 Yrotation Zrotation Xrotation',
    '    JOINT LeftKnee',
    '    {',
    '      OFFSET 0.00 -43.00 0.00',
    '      CHANNELS 3 Xrotation Zrotation Yrotation',
    '      JOINT LeftAnkle',
    '      {',
    '        OFFSET 0.00 -42.00 0.00',
    '        CHANNELS 3 Xrotation Zrotation Yrotation',
    '        End Site',
    '        {',
    '          OFFSET 0.00 -5.00 10.00',
    '        }',
    '      }',
    '    }',
    '  }',
    '  JOINT RightHip',
    '  {',
    '    OFFSET 11.00 -4.00 0.00',
    '    CHANNELS 3 Yrotation Zrotation Xrotation',
    '    JOINT RightKnee',
    '    {',
    '      OFFSET 0.00 -43.00 0.00',
    '      CHANNELS 3 Xrotation Zrotation Yrotation',
    '      JOINT RightAnkle',
    '      {',
    '        OFFSET 0.00 -42.00 0.00',
    '        CHANNELS 3 Xrotation Zrotation Yrotation',
    '        End Site',
    '        {',
    '          OFFSET 0.00 -5.00 10.00',
    '        }',
    '      }',
    '    }',
    '  }',
    '}',
    'MOTION',
    `Frames: ${entry.frameCount}`,
    `Frame Time: ${(1 / entry.fps).toFixed(6)}`,
  ];

  const rows: string[] = [];
  for (let i = 0; i < entry.frameCount; i++) {
    const u = i / entry.frameCount;
    const p = solvePoseForStyle(entry.id, u);
    const vals = [
      ...p.hipsPos,
      ...p.hipsRot,
      ...p.spine,
      ...p.chest,
      ...p.neck,
      ...p.head,
      ...p.lShoulder,
      ...p.lElbow,
      ...p.lWrist,
      ...p.rShoulder,
      ...p.rElbow,
      ...p.rWrist,
      ...p.lHip,
      ...p.lKnee,
      ...p.lAnkle,
      ...p.rHip,
      ...p.rKnee,
      ...p.rAnkle,
    ];
    rows.push(vals.map(fmt).join(' '));
  }

  return `${header.join('\n')}\n${rows.join('\n')}\n`;
}

const bvhTextCache = new Map<BuiltInMocapStyleKey, string>();
const mocapClipCache = new Map<BuiltInMocapStyleKey, MocapClipData>();

export function getBuiltInMocapBvhText(id: BuiltInMocapStyleKey): string {
  const cached = bvhTextCache.get(id);
  if (cached) return cached;
  const entry = getBuiltInMocapEntry(id);
  const bvhText = buildBvhTextForStyle(entry);
  bvhTextCache.set(id, bvhText);
  return bvhText;
}

export function getBuiltInMocapClip(id: BuiltInMocapStyleKey): MocapClipData {
  const cached = mocapClipCache.get(id);
  if (cached) return cached;
  const entry = getBuiltInMocapEntry(id);
  const clip = parseBvhMocap(getBuiltInMocapBvhText(id), entry.fileName);
  const titledClip: MocapClipData = {
    ...clip,
    name: entry.title,
  };
  mocapClipCache.set(id, titledClip);
  return titledClip;
}

export function downloadBuiltInMocapBvh(id: BuiltInMocapStyleKey): void {
  if (typeof document === 'undefined') return;
  const entry = getBuiltInMocapEntry(id);
  const bvhText = getBuiltInMocapBvhText(id);
  const blob = new Blob([bvhText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = entry.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
