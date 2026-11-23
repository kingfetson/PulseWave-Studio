import {
  DanceAvatarStyle,
  DancePlacement,
  DanceStyleKey,
  LyricLine,
  MocapClipData,
  StudioSettings,
} from '../types/studio';
import {
  BUILT_IN_MOCAP_LIBRARY,
  BuiltInMocapStyleKey,
  getBuiltInMocapClip,
  isBuiltInMocapStyle,
} from './builtInMocapLibrary';

export type DanceRenderCtx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

type DanceScratchCanvas = HTMLCanvasElement | OffscreenCanvas;
let danceStrobeCanvas: DanceScratchCanvas | null = null;
let danceShadowCanvas: DanceScratchCanvas | null = null;

function ensureScratchCanvas(
  existing: DanceScratchCanvas | null,
  width: number,
  height: number
): { canvas: DanceScratchCanvas; ctx: DanceRenderCtx } | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  let target = existing;
  if (!target) {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      target = c;
    } else if (typeof OffscreenCanvas !== 'undefined') {
      target = new OffscreenCanvas(w, h);
    } else {
      return null;
    }
  } else if (target.width !== w || target.height !== h) {
    target.width = w;
    target.height = h;
  }

  const sCtx = target.getContext('2d') as DanceRenderCtx | null;
  if (!sCtx) return null;
  sCtx.setTransform(1, 0, 0, 1, 0, 0);
  sCtx.clearRect(0, 0, w, h);
  return { canvas: target, ctx: sCtx };
}

function ensureDanceStrobeCanvas(
  width: number,
  height: number
): { canvas: DanceScratchCanvas; ctx: DanceRenderCtx } | null {
  const res = ensureScratchCanvas(danceStrobeCanvas, width, height);
  if (res) danceStrobeCanvas = res.canvas;
  return res;
}

function ensureDanceShadowCanvas(
  width: number,
  height: number
): { canvas: DanceScratchCanvas; ctx: DanceRenderCtx } | null {
  const res = ensureScratchCanvas(danceShadowCanvas, width, height);
  if (res) danceShadowCanvas = res.canvas;
  return res;
}

export interface DanceStyleOption {
  id: DanceStyleKey;
  label: string;
  desc: string;
  category: 'mocap-library' | 'procedural' | 'custom';
}

export const DANCE_STYLE_OPTIONS: DanceStyleOption[] = [
  ...BUILT_IN_MOCAP_LIBRARY.map((entry) => ({
    id: entry.id as DanceStyleKey,
    label: `${entry.title} (Mocap)`,
    desc: entry.description,
    category: 'mocap-library' as const,
  })),
  {
    id: 'hip-hop',
    label: 'Hip-Hop Bounce',
    desc: 'Heavy downbeat knee bounce, shoulder rock & lyric-accent arm hits',
    category: 'procedural',
  },
  {
    id: 'shuffle',
    label: 'Shuffle Step',
    desc: 'Crisp running-man footwork and synced counter-arm swings',
    category: 'procedural',
  },
  {
    id: 'robot',
    label: 'Robot Pop',
    desc: 'Quantized servo snaps locking to beat peaks and lyric transitions',
    category: 'procedural',
  },
  {
    id: 'groove',
    label: 'Smooth Groove',
    desc: 'Fluid torso wave and sweeping arm arcs driven by mid/treble flow',
    category: 'procedural',
  },
  {
    id: 'break-freeze',
    label: 'Break Freeze',
    desc: 'Wide athletic stance with dramatic power poses on lyric drops',
    category: 'procedural',
  },
  {
    id: 'mocap-custom',
    label: 'Custom Upload (.bvh / .json)',
    desc: 'Plays an uploaded .bvh or JSON motion-capture skeleton on beat',
    category: 'custom',
  },
];

export const DANCE_AVATAR_OPTIONS: Array<{
  id: DanceAvatarStyle;
  label: string;
  desc: string;
  category: 'human' | 'rig';
}> = [
  { id: 'casual', label: 'Casual', desc: 'Pullover hoodie & denim', category: 'human' },
  { id: 'formal', label: 'Formal', desc: 'Evening blazer & silk trim', category: 'human' },
  { id: 'robot', label: 'Robot', desc: 'Titanium mech & core visor', category: 'human' },
  { id: 'ninja', label: 'Ninja', desc: 'Stealth gi & flowing scarf', category: 'human' },
  { id: 'human-dancer', label: 'Studio Pop', desc: 'Tailored jacket & shades', category: 'human' },
  { id: 'human-ballerina', label: 'Ballerina', desc: 'Leotard, tutu & pointe', category: 'human' },
  { id: 'human-bboy', label: 'Street B-Boy', desc: 'Hoodie, joggers & cap', category: 'human' },
  { id: 'human-diva', label: 'Stage Diva', desc: 'Flowing hair & stage glam', category: 'human' },
  { id: 'human-suit', label: 'Tuxedo Lounge', desc: 'Formal tux & bowtie', category: 'human' },
  { id: 'human-neon', label: 'Cyber Human', desc: 'Neon techwear & visor', category: 'human' },
  { id: 'silhouette', label: 'Silhouette', desc: 'Volumetric rim-lit human', category: 'human' },
  { id: 'neon-cyber', label: 'Neon Rig', desc: 'Glowing cyber wireframe', category: 'rig' },
  { id: 'holo-wire', label: 'Holo Mocap', desc: 'Optical marker skeleton', category: 'rig' },
  { id: 'minimal-rig', label: 'Studio Rig', desc: 'Clean matte rig', category: 'rig' },
];

export interface RenderDanceParams {
  ctx: DanceRenderCtx;
  width: number;
  height: number;
  minDim: number;
  isPortrait: boolean;
  currentTime: number;
  bass: number;
  mid: number;
  treble: number;
  beatBurst: number;
  beatTriggered: boolean;
  settings: StudioSettings;
  lyrics: LyricLine[];
  mocapClip?: MocapClipData | null;
  hexToRgba: (hex: string, alpha: number) => string;
}

type Vec3 = [number, number, number];

// 17-joint humanoid rig indices
const J_PELVIS = 0;
const J_SPINE = 1;
const J_CHEST = 2;
const J_NECK = 3;
const J_HEAD = 4;
const J_L_SHOULDER = 5;
const J_L_ELBOW = 6;
const J_L_WRIST = 7;
const J_R_SHOULDER = 8;
const J_R_ELBOW = 9;
const J_R_WRIST = 10;
const J_L_HIP = 11;
const J_L_KNEE = 12;
const J_L_ANKLE = 13;
const J_R_HIP = 14;
const J_R_KNEE = 15;
const J_R_ANKLE = 16;

const HUMANOID_BONES: Array<[number, number]> = [
  [J_PELVIS, J_SPINE],
  [J_SPINE, J_CHEST],
  [J_CHEST, J_NECK],
  [J_NECK, J_HEAD],
  [J_CHEST, J_L_SHOULDER],
  [J_L_SHOULDER, J_L_ELBOW],
  [J_L_ELBOW, J_L_WRIST],
  [J_CHEST, J_R_SHOULDER],
  [J_R_SHOULDER, J_R_ELBOW],
  [J_R_ELBOW, J_R_WRIST],
  [J_PELVIS, J_L_HIP],
  [J_L_HIP, J_L_KNEE],
  [J_L_KNEE, J_L_ANKLE],
  [J_PELVIS, J_R_HIP],
  [J_R_HIP, J_R_KNEE],
  [J_R_KNEE, J_R_ANKLE],
];

interface ProjectedJoint {
  x: number;
  y: number;
  z: number;
  scale: number;
  worldY: number;
}

interface HumanoidIndices {
  pelvis: number;
  spine: number;
  chest: number;
  neck: number;
  head: number;
  lShoulder: number;
  lElbow: number;
  lWrist: number;
  lHandTip: number;
  rShoulder: number;
  rElbow: number;
  rWrist: number;
  rHandTip: number;
  lHip: number;
  lKnee: number;
  lAnkle: number;
  lToe: number;
  rHip: number;
  rKnee: number;
  rAnkle: number;
  rToe: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function findJointByPatterns(names: string[], patterns: RegExp[], fallback: number): number {
  for (const pat of patterns) {
    const idx = names.findIndex((n) => pat.test(n));
    if (idx >= 0) return idx;
  }
  return fallback;
}

function resolveHumanoidIndices(
  jointNames: string[] | null,
  jointCount: number
): HumanoidIndices | null {
  if (!jointNames || jointNames.length < 15) {
    if (jointCount === 17) {
      return {
        pelvis: J_PELVIS,
        spine: J_SPINE,
        chest: J_CHEST,
        neck: J_NECK,
        head: J_HEAD,
        lShoulder: J_L_SHOULDER,
        lElbow: J_L_ELBOW,
        lWrist: J_L_WRIST,
        lHandTip: -1,
        rShoulder: J_R_SHOULDER,
        rElbow: J_R_ELBOW,
        rWrist: J_R_WRIST,
        rHandTip: -1,
        lHip: J_L_HIP,
        lKnee: J_L_KNEE,
        lAnkle: J_L_ANKLE,
        lToe: -1,
        rHip: J_R_HIP,
        rKnee: J_R_KNEE,
        rAnkle: J_R_ANKLE,
        rToe: -1,
      };
    }
    return null;
  }

  const pelvis = findJointByPatterns(jointNames, [/^hips?$/i, /pelvis/i, /root/i], 0);
  const spine = findJointByPatterns(jointNames, [/^spine$/i, /spine1/i, /spine/i], -1);
  const chest = findJointByPatterns(jointNames, [/^chest$/i, /spine2/i, /upper.*chest/i, /torso/i], spine >= 0 ? spine : pelvis);
  const neck = findJointByPatterns(jointNames, [/^neck$/i, /neck/i], chest);
  const head = findJointByPatterns(jointNames, [/^head$/i, /head(?!_end)/i], neck);

  const lShoulder = findJointByPatterns(jointNames, [/leftshoulder/i, /l_?shoulder/i, /left.*arm/i, /clavicle.*l/i], -1);
  const lElbow = findJointByPatterns(jointNames, [/leftelbow/i, /leftforearm/i, /l_?elbow/i, /l_?forearm/i], -1);
  const lWrist = findJointByPatterns(jointNames, [/^leftwrist$/i, /^lefthand$/i, /l_?wrist/i, /l_?hand(?!_end)/i], -1);
  const lHandTip = findJointByPatterns(jointNames, [/leftwrist_end/i, /lefthand_end/i, /l_?hand_end/i], -1);

  const rShoulder = findJointByPatterns(jointNames, [/rightshoulder/i, /r_?shoulder/i, /right.*arm/i, /clavicle.*r/i], -1);
  const rElbow = findJointByPatterns(jointNames, [/rightelbow/i, /rightforearm/i, /r_?elbow/i, /r_?forearm/i], -1);
  const rWrist = findJointByPatterns(jointNames, [/^rightwrist$/i, /^righthand$/i, /r_?wrist/i, /r_?hand(?!_end)/i], -1);
  const rHandTip = findJointByPatterns(jointNames, [/rightwrist_end/i, /righthand_end/i, /r_?hand_end/i], -1);

  const lHip = findJointByPatterns(jointNames, [/lefthip/i, /leftthigh/i, /leftupleg/i, /l_?hip/i, /l_?thigh/i], -1);
  const lKnee = findJointByPatterns(jointNames, [/leftknee/i, /leftleg$/i, /leftshin/i, /l_?knee/i], -1);
  const lAnkle = findJointByPatterns(jointNames, [/^leftankle$/i, /^leftfoot$/i, /l_?ankle/i, /l_?foot(?!_end)/i], -1);
  const lToe = findJointByPatterns(jointNames, [/leftankle_end/i, /leftfoot_end/i, /lefttoe/i], -1);

  const rHip = findJointByPatterns(jointNames, [/righthip/i, /rightthigh/i, /rightupleg/i, /r_?hip/i, /r_?thigh/i], -1);
  const rKnee = findJointByPatterns(jointNames, [/rightknee/i, /rightleg$/i, /rightshin/i, /r_?knee/i], -1);
  const rAnkle = findJointByPatterns(jointNames, [/^rightankle$/i, /^rightfoot$/i, /r_?ankle/i, /r_?foot(?!_end)/i], -1);
  const rToe = findJointByPatterns(jointNames, [/rightankle_end/i, /rightfoot_end/i, /righttoe/i], -1);

  if (
    lShoulder < 0 ||
    lElbow < 0 ||
    lWrist < 0 ||
    rShoulder < 0 ||
    rElbow < 0 ||
    rWrist < 0 ||
    lHip < 0 ||
    lKnee < 0 ||
    lAnkle < 0 ||
    rHip < 0 ||
    rKnee < 0 ||
    rAnkle < 0
  ) {
    return null;
  }

  return {
    pelvis,
    spine: spine >= 0 ? spine : Math.round((pelvis + chest) * 0.5),
    chest,
    neck,
    head,
    lShoulder,
    lElbow,
    lWrist,
    lHandTip,
    rShoulder,
    rElbow,
    rWrist,
    rHandTip,
    lHip,
    lKnee,
    lAnkle,
    lToe,
    rHip,
    rKnee,
    rAnkle,
    rToe,
  };
}

function solveProceduralSkeleton(
  style: Exclude<DanceStyleKey, 'mocap-custom' | BuiltInMocapStyleKey>,
  time: number,
  bass: number,
  mid: number,
  treble: number,
  beatDrive: number,
  energy: number,
  lyricAccent: number,
  lyricIdx: number
): Vec3[] {
  const joints: Vec3[] = new Array(17);
  const w = time * Math.PI * 2 * (0.95 + 0.1 * energy);
  const halfW = w * 0.5;
  const parity = lyricIdx >= 0 && lyricIdx % 2 === 1 ? -1 : 1;

  // Base humanoid proportions (ankles near y = 0.05, head near y = 1.66)
  let hipX = 0;
  let hipY = 0.9;
  let hipZ = 0;
  let torsoLeanX = 0;
  let torsoLeanZ = 0;
  let shoulderTwist = 0;
  let headNod = 0;
  let headTilt = 0;

  let lKneePos: Vec3 = [-0.15, 0.48, 0.05];
  let rKneePos: Vec3 = [0.15, 0.48, 0.05];
  let lFootPos: Vec3 = [-0.18, 0.05, 0];
  let rFootPos: Vec3 = [0.18, 0.05, 0];
  let lElbowPos: Vec3 = [-0.36, 1.06, 0.08];
  let rElbowPos: Vec3 = [0.36, 1.06, 0.08];
  let lHandPos: Vec3 = [-0.38, 0.85, 0.18];
  let rHandPos: Vec3 = [0.38, 0.85, 0.18];

  const bounce = beatDrive * 0.1 * energy + bass * 0.045 * energy;

  if (style === 'hip-hop') {
    const sway = Math.sin(halfW);
    const groove = Math.sin(w);
    const stepCycle = Math.sin(halfW * 0.5);

    hipX = sway * 0.11 * energy;
    hipY = 0.89 - bounce - Math.abs(groove) * 0.06 * energy;
    hipZ = Math.cos(halfW) * 0.05 * energy;

    torsoLeanX = 0.08 + beatDrive * 0.1 * energy;
    torsoLeanZ = -sway * 0.11 * energy + lyricAccent * 0.09 * parity;
    shoulderTwist = sway * 0.32 * energy + lyricAccent * 0.25 * parity;
    headNod = -beatDrive * 0.14 * energy - lyricAccent * 0.12;
    headTilt = sway * 0.09;

    lKneePos = [
      -0.15 + sway * 0.06,
      0.47 - bounce * 0.52 + Math.max(0, stepCycle) * 0.12,
      0.14 + Math.max(0, stepCycle) * 0.12,
    ];
    rKneePos = [
      0.15 + sway * 0.06,
      0.47 - bounce * 0.52 + Math.max(0, -stepCycle) * 0.12,
      0.14 + Math.max(0, -stepCycle) * 0.12,
    ];
    lFootPos = [
      -0.2 + sway * 0.04,
      0.05 + Math.max(0, stepCycle) * 0.13 * energy,
      0.03 + stepCycle * 0.08,
    ];
    rFootPos = [
      0.2 + sway * 0.04,
      0.05 + Math.max(0, -stepCycle) * 0.13 * energy,
      0.03 - stepCycle * 0.08,
    ];

    const armPump = Math.sin(w + 0.5) * 0.17 * energy + beatDrive * 0.13;
    const lyricRaiseL = lyricAccent * (parity > 0 ? 0.3 : 0.1);
    const lyricRaiseR = lyricAccent * (parity < 0 ? 0.3 : 0.1);

    lElbowPos = [
      -0.35 - Math.abs(sway) * 0.07,
      1.04 - bounce * 0.45 + armPump * 0.4 + lyricRaiseL * 0.4,
      0.12 + Math.cos(halfW) * 0.12,
    ];
    rElbowPos = [
      0.35 + Math.abs(sway) * 0.07,
      1.04 - bounce * 0.45 - armPump * 0.3 + lyricRaiseR * 0.4,
      0.12 - Math.cos(halfW) * 0.12,
    ];
    lHandPos = [
      -0.24 + sway * 0.13 - lyricRaiseL * 0.14,
      1.12 - bounce * 0.25 + armPump * 0.65 + lyricRaiseL * 0.56,
      0.27 + Math.sin(w) * 0.1,
    ];
    rHandPos = [
      0.24 + sway * 0.13 + lyricRaiseR * 0.14,
      1.08 - bounce * 0.25 - armPump * 0.45 + lyricRaiseR * 0.56,
      0.25 - Math.sin(w) * 0.1,
    ];
  } else if (style === 'shuffle') {
    const run = Math.sin(w * 1.15);
    const liftL = Math.max(0, run);
    const liftR = Math.max(0, -run);
    const hop = Math.abs(Math.cos(w * 1.15)) * 0.075 * energy;

    hipX = Math.sin(halfW) * 0.06 * energy;
    hipY = 0.89 + hop - beatDrive * 0.055;
    torsoLeanX = 0.04;
    torsoLeanZ = -Math.sin(halfW) * 0.075 * energy;
    shoulderTwist = -run * 0.26 * energy + lyricAccent * 0.24 * parity;
    headNod = -beatDrive * 0.09;

    lKneePos = [-0.14, 0.49 + liftL * 0.2 * energy, 0.16 + liftL * 0.2 * energy];
    rKneePos = [0.14, 0.49 + liftR * 0.2 * energy, 0.16 + liftR * 0.2 * energy];
    lFootPos = [
      -0.16 - liftL * 0.04,
      0.05 + liftL * 0.24 * energy,
      run * 0.22 * energy,
    ];
    rFootPos = [
      0.16 + liftR * 0.04,
      0.05 + liftR * 0.24 * energy,
      -run * 0.22 * energy,
    ];

    lElbowPos = [-0.34, 1.07 + hop * 0.5, 0.04 - run * 0.2 * energy];
    rElbowPos = [0.34, 1.07 + hop * 0.5, 0.04 + run * 0.2 * energy];
    lHandPos = [
      -0.28,
      1.04 + hop * 0.5 + lyricAccent * 0.25,
      0.2 - run * 0.3 * energy,
    ];
    rHandPos = [
      0.28,
      1.04 + hop * 0.5 + lyricAccent * 0.25,
      0.2 + run * 0.3 * energy,
    ];
  } else if (style === 'robot') {
    const stepPhase = Math.floor(time * 2.2 * (0.9 + 0.2 * energy)) + (lyricIdx >= 0 ? lyricIdx : 0);
    const snapA = Math.sin(stepPhase * 1.7);
    const snapB = Math.cos(stepPhase * 2.3);
    const lockJitter = beatDrive * 0.025 * Math.sin(time * 42);

    hipX = snapA * 0.075 * energy + lockJitter;
    hipY = 0.89 - Math.abs(snapB) * 0.055 * energy - beatDrive * 0.035;
    torsoLeanZ = snapB * 0.12 * energy;
    shoulderTwist = snapA * 0.34 * energy;
    headNod = snapB * 0.14;
    headTilt = snapA * 0.2;

    lKneePos = [-0.17, 0.48, 0.08];
    rKneePos = [0.17, 0.48, 0.08];
    lFootPos = [-0.21, 0.05, snapA > 0 ? 0.08 : -0.04];
    rFootPos = [0.21, 0.05, snapA > 0 ? -0.04 : 0.08];

    const armMode = Math.abs(stepPhase) % 4;
    if (armMode === 0) {
      lElbowPos = [-0.44, 1.24, 0.05];
      lHandPos = [-0.44, 1.54, 0.12];
      rElbowPos = [0.44, 1.24, 0.05];
      rHandPos = [0.44, 0.94, 0.16];
    } else if (armMode === 1) {
      lElbowPos = [-0.44, 1.22, 0.16];
      lHandPos = [-0.14, 1.24, 0.34];
      rElbowPos = [0.44, 1.24, 0.05];
      rHandPos = [0.44, 1.56, 0.1];
    } else if (armMode === 2) {
      lElbowPos = [-0.42, 1.08, 0.1];
      lHandPos = [-0.42, 1.36, 0.22];
      rElbowPos = [0.42, 1.08, 0.1];
      rHandPos = [0.42, 1.36, 0.22];
    } else {
      lElbowPos = [-0.4, 1.26, 0.18];
      lHandPos = [-0.64, 1.26, 0.22];
      rElbowPos = [0.4, 1.26, 0.18];
      rHandPos = [0.18, 1.26, 0.36];
    }
  } else if (style === 'groove') {
    const wave1 = Math.sin(halfW);
    const wave2 = Math.sin(halfW - 0.8);
    const wave3 = Math.sin(halfW - 1.6);
    const flow = 0.7 + mid * 0.45 + treble * 0.3;

    hipX = wave1 * 0.12 * energy;
    hipY = 0.91 - Math.abs(wave1) * 0.045 * energy - beatDrive * 0.045;
    torsoLeanZ = wave2 * 0.14 * energy;
    shoulderTwist = wave3 * 0.26 * energy + lyricAccent * 0.2 * parity;
    headTilt = -wave2 * 0.14;
    headNod = Math.sin(w) * 0.06;

    lKneePos = [-0.15 + wave1 * 0.05, 0.49, 0.1];
    rKneePos = [0.15 + wave1 * 0.05, 0.49, 0.1];
    lFootPos = [-0.18, 0.05, 0.04 * wave1];
    rFootPos = [0.18, 0.05, -0.04 * wave1];

    lElbowPos = [-0.4, 1.18 + wave2 * 0.12 * flow, 0.1 + wave3 * 0.12];
    rElbowPos = [0.4, 1.18 - wave2 * 0.12 * flow, 0.1 - wave3 * 0.12];
    lHandPos = [
      -0.46 + wave3 * 0.13,
      1.26 + Math.sin(halfW - 1.9) * 0.22 * flow * energy + lyricAccent * 0.18,
      0.24 + Math.cos(halfW) * 0.15,
    ];
    rHandPos = [
      0.46 + wave3 * 0.13,
      1.26 - Math.sin(halfW - 1.9) * 0.22 * flow * energy + lyricAccent * 0.18,
      0.24 - Math.cos(halfW) * 0.15,
    ];
  } else {
    // 'break-freeze': wide low athletic stance + dramatic lyric freezes
    const poseIdx = (Math.floor(time * 1.1) + Math.max(0, lyricIdx)) % 4;
    const hit = Math.min(1, beatDrive + lyricAccent);
    const sway = Math.sin(halfW * 0.8);

    hipX = sway * 0.12 * energy;
    hipY = 0.8 - hit * 0.08 * energy;
    torsoLeanX = 0.15 + hit * 0.07;
    torsoLeanZ = (poseIdx % 2 === 0 ? -0.16 : 0.16) * energy;
    shoulderTwist = (poseIdx % 2 === 0 ? 0.34 : -0.34) * energy;
    headNod = -0.09 - hit * 0.11;
    headTilt = poseIdx % 2 === 0 ? 0.16 : -0.16;

    lKneePos = [-0.26 + sway * 0.04, 0.44, 0.16];
    rKneePos = [0.26 + sway * 0.04, 0.44, 0.16];
    lFootPos = [-0.34, 0.05, poseIdx === 1 ? 0.16 : -0.04];
    rFootPos = [0.34, 0.05, poseIdx === 3 ? 0.16 : -0.04];

    if (poseIdx === 0 || poseIdx === 2) {
      lElbowPos = [-0.44, 1.24, 0.12];
      lHandPos = [-0.62, 1.48 + hit * 0.16, 0.22];
      rElbowPos = [0.38, 0.94, 0.18];
      rHandPos = [0.22, 0.74, 0.32];
    } else {
      lElbowPos = [-0.38, 0.94, 0.18];
      lHandPos = [-0.22, 0.74, 0.32];
      rElbowPos = [0.44, 1.24, 0.12];
      rHandPos = [0.62, 1.48 + hit * 0.16, 0.22];
    }
  }

  // Spine chain
  const spineX = hipX + torsoLeanZ * 0.25;
  const spineY = hipY + 0.19;
  const spineZ = hipZ + torsoLeanX * 0.18;

  const chestX = hipX + torsoLeanZ * 0.55;
  const chestY = hipY + 0.39;
  const chestZ = hipZ + torsoLeanX * 0.34;

  const neckX = chestX + torsoLeanZ * 0.16;
  const neckY = chestY + 0.11;
  const neckZ = chestZ + torsoLeanX * 0.12;

  const headX = neckX + headTilt * 0.13;
  const headY = neckY + 0.14 + headNod * 0.07;
  const headZ = neckZ - headNod * 0.12;

  const shW = 0.2;
  const cosTw = Math.cos(shoulderTwist);
  const sinTw = Math.sin(shoulderTwist);
  const shYOff = torsoLeanZ * 0.14;

  const lShoulderPos: Vec3 = [
    chestX - shW * cosTw,
    chestY + 0.04 - shYOff,
    chestZ - shW * sinTw,
  ];
  const rShoulderPos: Vec3 = [
    chestX + shW * cosTw,
    chestY + 0.04 + shYOff,
    chestZ + shW * sinTw,
  ];

  const hipW = 0.115;
  const cosHip = Math.cos(shoulderTwist * 0.4);
  const sinHip = Math.sin(shoulderTwist * 0.4);

  joints[J_PELVIS] = [hipX, hipY, hipZ];
  joints[J_SPINE] = [spineX, spineY, spineZ];
  joints[J_CHEST] = [chestX, chestY, chestZ];
  joints[J_NECK] = [neckX, neckY, neckZ];
  joints[J_HEAD] = [headX, headY, headZ];
  joints[J_L_SHOULDER] = lShoulderPos;
  joints[J_L_ELBOW] = lElbowPos;
  joints[J_L_WRIST] = lHandPos;
  joints[J_R_SHOULDER] = rShoulderPos;
  joints[J_R_ELBOW] = rElbowPos;
  joints[J_R_WRIST] = rHandPos;
  joints[J_L_HIP] = [hipX - hipW * cosHip, hipY - 0.04, hipZ - hipW * sinHip];
  joints[J_L_KNEE] = lKneePos;
  joints[J_L_ANKLE] = lFootPos;
  joints[J_R_HIP] = [hipX + hipW * cosHip, hipY - 0.04, hipZ + hipW * sinHip];
  joints[J_R_KNEE] = rKneePos;
  joints[J_R_ANKLE] = rFootPos;

  return joints;
}

function sampleMocapSkeleton(
  clip: MocapClipData,
  time: number,
  beatDrive: number,
  energy: number,
  lyricAccent: number
): Vec3[] {
  const frameFloat =
    ((time * clip.fps * (0.9 + 0.2 * energy)) % clip.frameCount + clip.frameCount) %
    clip.frameCount;
  const f0 = Math.floor(frameFloat);
  const f1 = (f0 + 1) % clip.frameCount;
  const frac = frameFloat - f0;

  const row0 = clip.frames[f0];
  const row1 = clip.frames[f1];
  const jointCount = Math.floor(row0.length / 3);
  const out: Vec3[] = new Array(jointCount);
  const bounceY = beatDrive * 0.045 * energy + lyricAccent * 0.03;

  for (let j = 0; j < jointCount; j++) {
    const x = lerp(row0[j * 3], row1[j * 3], frac);
    const rawY = lerp(row0[j * 3 + 1], row1[j * 3 + 1], frac);
    // Ground-anchored compression: feet near y=0 stay planted while knees/hips/torso absorb the beat dip
    const groundWeight = Math.min(1, Math.max(0, rawY / 0.85));
    const y = Math.max(0.015, rawY - bounceY * groundWeight);
    const z = lerp(row0[j * 3 + 2], row1[j * 3 + 2], frac);
    out[j] = [x, y, z];
  }
  return out;
}

function drawTaperedCapsule(
  ctx: DanceRenderCtx,
  ax: number,
  ay: number,
  ra: number,
  bx: number,
  by: number,
  rb: number,
  lightColor: string,
  midColor: string,
  darkColor: string,
  outlineColor?: string,
  rimEdgeColor?: string,
  spotlightFactor?: number
): void {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) {
    ctx.fillStyle = midColor;
    ctx.beginPath();
    ctx.arc(ax, ay, Math.max(ra, rb), 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const angle = Math.atan2(dy, dx);

  // Cylindrical 3D shading across limb normal
  const midX = (ax + bx) * 0.5;
  const midY = (ay + by) * 0.5;
  const maxR = Math.max(ra, rb);
  const grad = ctx.createLinearGradient(
    midX - nx * maxR,
    midY - ny * maxR,
    midX + nx * maxR,
    midY + ny * maxR
  );
  grad.addColorStop(0, lightColor);
  grad.addColorStop(0.45, midColor);
  grad.addColorStop(1, darkColor);

  ctx.beginPath();
  ctx.arc(ax, ay, ra, angle + Math.PI * 0.5, angle - Math.PI * 0.5, false);
  ctx.arc(bx, by, rb, angle - Math.PI * 0.5, angle + Math.PI * 0.5, false);
  ctx.closePath();

  ctx.fillStyle = grad;
  ctx.fill();

  if (spotlightFactor !== undefined) {
    if (spotlightFactor < 0.98) {
      const dimAlpha = Math.min(0.62, (1 - spotlightFactor) * 0.62);
      ctx.fillStyle = `rgba(3, 5, 12, ${dimAlpha.toFixed(3)})`;
      ctx.fill();
    } else if (spotlightFactor > 1.02) {
      const boostAlpha = Math.min(0.32, (spotlightFactor - 1) * 0.28);
      const spotGrad = ctx.createLinearGradient(
        midX - nx * maxR,
        midY - ny * maxR,
        midX + nx * maxR * 0.45,
        midY + ny * maxR * 0.45
      );
      spotGrad.addColorStop(0, `rgba(255, 255, 255, ${boostAlpha.toFixed(3)})`);
      spotGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = spotGrad;
      ctx.fill();
    }
  }

  if (outlineColor) {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = Math.max(1, maxR * 0.14);
    ctx.stroke();
  } else if (rimEdgeColor) {
    ctx.strokeStyle = rimEdgeColor;
    ctx.lineWidth = Math.max(0.85, maxR * 0.095);
    ctx.stroke();
  }
}

type HumanAvatarStyle =
  | 'robot'
  | 'ninja'
  | 'casual'
  | 'formal'
  | 'human-dancer'
  | 'human-ballerina'
  | 'human-bboy'
  | 'human-diva'
  | 'human-suit'
  | 'human-neon'
  | 'silhouette';

function isHumanAvatarStyle(style: DanceAvatarStyle): style is HumanAvatarStyle {
  return (
    style === 'robot' ||
    style === 'ninja' ||
    style === 'casual' ||
    style === 'formal' ||
    style === 'human-dancer' ||
    style === 'human-ballerina' ||
    style === 'human-bboy' ||
    style === 'human-diva' ||
    style === 'human-suit' ||
    style === 'human-neon' ||
    style === 'silhouette'
  );
}

function renderHumanVolumetricDancer(params: {
  ctx: DanceRenderCtx;
  avatarStyle: HumanAvatarStyle;
  projected: ProjectedJoint[];
  indices: HumanoidIndices;
  floorY: number;
  centerX: number;
  charHeight: number;
  currentTime: number;
  beatDrive: number;
  lyricAccent: number;
  primaryColor: string;
  secondaryColor: string;
  rimLightColor: string;
  hasCustomRim: boolean;
  spotlightIntensity: number;
  danceShadowEnabled: boolean;
  hexToRgba: (hex: string, alpha: number) => string;
}): void {
  const {
    ctx,
    avatarStyle,
    projected,
    indices,
    floorY,
    charHeight,
    currentTime,
    beatDrive,
    lyricAccent,
    primaryColor,
    secondaryColor,
    rimLightColor,
    hasCustomRim,
    spotlightIntensity,
    danceShadowEnabled,
    hexToRgba,
  } = params;

  const pPelvis = projected[indices.pelvis];
  const pSpine = projected[indices.spine];
  const pChest = projected[indices.chest];
  const pNeck = projected[indices.neck];
  const pHead = projected[indices.head];
  const pLSh = projected[indices.lShoulder];
  const pLEl = projected[indices.lElbow];
  const pLWr = projected[indices.lWrist];
  const pRSh = projected[indices.rShoulder];
  const pREl = projected[indices.rElbow];
  const pRWr = projected[indices.rWrist];
  const pLHip = projected[indices.lHip];
  const pLKn = projected[indices.lKnee];
  const pLAnk = projected[indices.lAnkle];
  const pRHip = projected[indices.rHip];
  const pRKn = projected[indices.rKnee];
  const pRAnk = projected[indices.rAnkle];

  if (!pPelvis || !pChest || !pHead || !pLSh || !pRSh || !pLAnk || !pRAnk) {
    return;
  }

  // Compute true facing direction from shoulder vector in 3D camera space
  const shDx = pRSh.x - pLSh.x;
  const shDz = pRSh.z - pLSh.z;
  const rawFaceX = -shDz;
  const rawFaceZ = shDx;
  const faceLen = Math.hypot(rawFaceX, rawFaceZ) || 1;
  const faceX = rawFaceX / faceLen;
  const faceZ = rawFaceZ / faceLen; // +1 facing camera, -1 facing away

  // Resolve or extrapolate hand tips and toes
  const handReach = charHeight * 0.055;
  const resolveHandTip = (
    explicitIdx: number,
    elbow: ProjectedJoint,
    wrist: ProjectedJoint
  ): ProjectedJoint => {
    if (explicitIdx >= 0 && projected[explicitIdx]) {
      return projected[explicitIdx];
    }
    const dx = wrist.x - elbow.x;
    const dy = wrist.y - elbow.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: wrist.x + (dx / len) * handReach * wrist.scale,
      y: wrist.y + (dy / len) * handReach * wrist.scale,
      z: wrist.z,
      scale: wrist.scale,
      worldY: wrist.worldY,
    };
  };

  const footLen = charHeight * 0.088;
  const resolveToe = (
    explicitIdx: number,
    knee: ProjectedJoint,
    ankle: ProjectedJoint
  ): ProjectedJoint => {
    if (explicitIdx >= 0 && projected[explicitIdx]) {
      return projected[explicitIdx];
    }
    // Project foot forward along dancer facing + slight knee hint
    const hintX = (ankle.x - knee.x) * 0.2;
    const fwdScreenX = faceX * footLen * ankle.scale + hintX;
    const fwdScreenY = faceZ * charHeight * 0.018 * ankle.scale + charHeight * 0.016;
    return {
      x: ankle.x + fwdScreenX,
      y: Math.min(floorY, ankle.y + fwdScreenY),
      z: ankle.z + faceZ * 0.14,
      scale: ankle.scale,
      worldY: Math.max(0, ankle.worldY - 0.02),
    };
  };

  const pLHandTip = resolveHandTip(indices.lHandTip, pLEl, pLWr);
  const pRHandTip = resolveHandTip(indices.rHandTip, pREl, pRWr);
  const pLToe = resolveToe(indices.lToe, pLKn, pLAnk);
  const pRToe = resolveToe(indices.rToe, pRKn, pRAnk);

  // Persona & palette configuration
  const isSil = avatarStyle === 'silhouette';
  const isRobot = avatarStyle === 'robot';
  const isNinja = avatarStyle === 'ninja';
  const isCasual = avatarStyle === 'casual';
  const isFormal = avatarStyle === 'formal';
  const isNeonHuman = avatarStyle === 'human-neon';
  const isBallerina = avatarStyle === 'human-ballerina';
  const isBboy = avatarStyle === 'human-bboy';
  const isDiva = avatarStyle === 'human-diva';
  const isSuit = avatarStyle === 'human-suit' || isFormal;

  const skinLight = isSil
    ? '#0b101b'
    : isRobot
    ? '#e2e8f0'
    : isNinja
    ? '#1f2937'
    : isBallerina
    ? '#f7d5c2'
    : isBboy
    ? '#c78c6a'
    : isDiva
    ? '#b57452'
    : isCasual
    ? '#f0c4a8'
    : isSuit
    ? '#ecc1a4'
    : isNeonHuman
    ? '#d6a488'
    : '#f2c1a2';
  const skinMid = isSil
    ? '#080c15'
    : isRobot
    ? '#94a3b8'
    : isNinja
    ? '#111827'
    : isBallerina
    ? '#e6b8a0'
    : isBboy
    ? '#a76e4e'
    : isDiva
    ? '#95583a'
    : isCasual
    ? '#d8a07e'
    : isSuit
    ? '#d5a181'
    : isNeonHuman
    ? '#b98366'
    : '#dfa584';
  const skinDark = isSil
    ? '#05080f'
    : isRobot
    ? '#475569'
    : isNinja
    ? '#030712'
    : isBallerina
    ? '#c99379'
    : isBboy
    ? '#7d4d34'
    : isDiva
    ? '#6c3c25'
    : isCasual
    ? '#b47b5c'
    : isSuit
    ? '#aa7659'
    : isNeonHuman
    ? '#8f5f47'
    : '#b7795b';

  const jacketLight = isSil
    ? '#0d1320'
    : isRobot
    ? '#cbd5e1'
    : isNinja
    ? '#27272a'
    : isCasual
    ? primaryColor
    : isBallerina
    ? '#fce7f3'
    : isBboy
    ? '#374151'
    : isDiva
    ? '#f8fafc'
    : isFormal
    ? '#334155'
    : isSuit
    ? '#1f2937'
    : isNeonHuman
    ? '#1f293b'
    : '#f8fafc';
  const jacketMid = isSil
    ? '#080c15'
    : isRobot
    ? '#64748b'
    : isNinja
    ? '#18181b'
    : isCasual
    ? '#475569'
    : isBallerina
    ? primaryColor
    : isBboy
    ? '#1f2937'
    : isDiva
    ? secondaryColor
    : isFormal
    ? '#1e293b'
    : isSuit
    ? '#0f172a'
    : isNeonHuman
    ? '#111827'
    : '#cbd5e1';
  const jacketDark = isSil
    ? '#05080f'
    : isRobot
    ? '#1e293b'
    : isNinja
    ? '#09090b'
    : isCasual
    ? '#1e293b'
    : isBallerina
    ? '#831843'
    : isBboy
    ? '#111827'
    : isDiva
    ? '#31102f'
    : isSuit
    ? '#020617'
    : isNeonHuman
    ? '#070b12'
    : '#64748b';

  // Arms use bare skin for Ballerina & Diva (sleeveless stage outfits)
  const sleeveLight = isBallerina || isDiva ? skinLight : jacketLight;
  const sleeveMid = isBallerina || isDiva ? skinMid : jacketMid;
  const sleeveDark = isBallerina || isDiva ? skinDark : jacketDark;

  const pantsLight = isSil
    ? '#0c111d'
    : isRobot
    ? '#94a3b8'
    : isNinja
    ? '#27272a'
    : isCasual
    ? '#60a5fa'
    : isBallerina
    ? '#fde8f0'
    : isBboy
    ? '#334155'
    : isDiva
    ? '#3b2454'
    : isSuit
    ? '#1e293b'
    : isNeonHuman
    ? '#1e2436'
    : '#334155';
  const pantsMid = isSil
    ? '#080c15'
    : isRobot
    ? '#475569'
    : isNinja
    ? '#18181b'
    : isCasual
    ? '#2563eb'
    : isBallerina
    ? '#f5cad9'
    : isBboy
    ? '#1e293b'
    : isDiva
    ? '#221436'
    : isSuit
    ? '#0f172a'
    : isNeonHuman
    ? '#121622'
    : '#1e293b';
  const pantsDark = isSil
    ? '#05080f'
    : isRobot
    ? '#1e293b'
    : isNinja
    ? '#09090b'
    : isCasual
    ? '#1e3a8a'
    : isBallerina
    ? '#d9a4b7'
    : isBboy
    ? '#0f172a'
    : isDiva
    ? '#0d0718'
    : isSuit
    ? '#020617'
    : isNeonHuman
    ? '#090c14'
    : '#0f172a';

  const shoeLight = isSil
    ? '#0c111d'
    : isRobot
    ? '#cbd5e1'
    : isNinja
    ? '#27272a'
    : isBallerina
    ? '#fbcfe8'
    : isCasual
    ? '#ffffff'
    : isSuit
    ? '#334155'
    : '#f8fafc';
  const shoeMid = isSil
    ? '#080c15'
    : isRobot
    ? primaryColor
    : isNinja
    ? '#09090b'
    : isCasual
    ? '#e2e8f0'
    : isBallerina
    ? '#f472b6'
    : isBboy
    ? primaryColor
    : isDiva
    ? secondaryColor
    : isSuit
    ? '#090d16'
    : isNeonHuman
    ? primaryColor
    : '#cbd5e1';
  const shoeDark = isSil ? '#04060b' : isBallerina ? '#be185d' : '#090d16';

  const rimSpotBoost = Math.min(0.28, spotlightIntensity * 0.14);
  const rimBaseAlpha = isSil
    ? 0.56 + beatDrive * 0.32
    : isRobot
    ? 0.72 + beatDrive * 0.22
    : isNinja
    ? 0.5 + beatDrive * 0.26
    : isNeonHuman
    ? 0.68 + beatDrive * 0.24
    : isDiva
    ? 0.48 + beatDrive * 0.28
    : 0.34 + beatDrive * 0.2;
  const rimColor = hexToRgba(
    rimLightColor,
    Math.min(0.96, rimBaseAlpha + rimSpotBoost)
  );
  const capsuleRimColor = hexToRgba(
    rimLightColor,
    Math.min(
      0.9,
      (hasCustomRim ? 0.46 : 0.26) + spotlightIntensity * 0.16 + beatDrive * 0.18
    )
  );

  // Ground contact shadows directly under both feet when Dancer Shadow is enabled
  if (danceShadowEnabled) {
    const drawFootShadow = (ank: ProjectedJoint, toe: ProjectedJoint) => {
      const sx = (ank.x + toe.x) * 0.5;
      const footClearance = Math.max(0, ank.worldY - 0.04);
      const alpha = Math.max(0.08, 0.36 * Math.exp(-footClearance * 3.5));
      const rx = charHeight * 0.052 * (1 + footClearance * 0.55);
      const ry = rx * 0.26;
      ctx.save();
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(sx, floorY + 2, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawFootShadow(pLAnk, pLToe);
    drawFootShadow(pRAnk, pRToe);
  }

  // Persona-calibrated limb thicknesses
  const baseUnit = charHeight * 0.036;
  const armWidthScale = isBallerina ? 0.78 : isDiva ? 0.82 : isBboy ? 1.14 : 1.0;
  const legWidthScale = isBallerina ? 0.84 : isDiva ? 0.92 : isBboy ? 1.18 : 1.0;
  const upperArmR = baseUnit * 0.92 * armWidthScale;
  const elbowR = baseUnit * 0.78 * armWidthScale;
  const wristR = baseUnit * 0.56 * armWidthScale;
  const thighR = baseUnit * 1.46 * legWidthScale;
  const kneeR = baseUnit * 1.06 * (isBboy ? 1.24 : legWidthScale);
  const ankleR = baseUnit * 0.72 * (isBboy ? 1.16 : isBallerina ? 0.78 : 1.0);
  const neckR = baseUnit * (isBallerina || isDiva ? 0.68 : 0.78);
  const headR = charHeight * (isBallerina || isDiva ? 0.064 : 0.068);

  interface RenderPart {
    z: number;
    draw: () => void;
  }
  const parts: RenderPart[] = [];

  // Left & Right Legs
  parts.push({
    z: (pLHip.z + pLKn.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pLHip.x,
        pLHip.y,
        thighR * pLHip.scale,
        pLKn.x,
        pLKn.y,
        kneeR * pLKn.scale,
        pantsLight,
        pantsMid,
        pantsDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pLKn.z + pLAnk.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pLKn.x,
        pLKn.y,
        kneeR * 0.96 * pLKn.scale,
        pLAnk.x,
        pLAnk.y,
        ankleR * pLAnk.scale,
        pantsLight,
        pantsMid,
        pantsDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pLAnk.z + pLToe.z) * 0.5 + 0.02,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pLAnk.x,
        pLAnk.y,
        ankleR * (isBboy ? 1.18 : 1.05) * pLAnk.scale,
        pLToe.x,
        pLToe.y,
        ankleR * (isBallerina ? 0.56 : 0.78) * pLToe.scale,
        shoeLight,
        shoeMid,
        shoeDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });

  parts.push({
    z: (pRHip.z + pRKn.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pRHip.x,
        pRHip.y,
        thighR * pRHip.scale,
        pRKn.x,
        pRKn.y,
        kneeR * pRKn.scale,
        pantsLight,
        pantsMid,
        pantsDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pRKn.z + pRAnk.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pRKn.x,
        pRKn.y,
        kneeR * 0.96 * pRKn.scale,
        pRAnk.x,
        pRAnk.y,
        ankleR * pRAnk.scale,
        pantsLight,
        pantsMid,
        pantsDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pRAnk.z + pRToe.z) * 0.5 + 0.02,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pRAnk.x,
        pRAnk.y,
        ankleR * (isBboy ? 1.18 : 1.05) * pRAnk.scale,
        pRToe.x,
        pRToe.y,
        ankleR * (isBallerina ? 0.56 : 0.78) * pRToe.scale,
        shoeLight,
        shoeMid,
        shoeDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });

  // Sculpted Torso, Pelvis & Persona Wardrobe Details (Tutu, Hoodie, Blazer, Stage Top)
  parts.push({
    z: (pPelvis.z + pChest.z) * 0.5,
    draw: () => {
      const shSpan = Math.hypot(pRSh.x - pLSh.x, pRSh.y - pLSh.y);
      const minTorsoW = charHeight * (isBallerina || isDiva ? 0.056 : isBboy ? 0.075 : 0.065);
      const shoulderExt = isBboy ? 0.19 : isBallerina ? 0.08 : 0.14;
      const lShOutX = pLSh.x - (pRSh.x - pLSh.x) * shoulderExt;
      const rShOutX = pRSh.x + (pRSh.x - pLSh.x) * shoulderExt;
      const waistW = Math.max(
        minTorsoW,
        shSpan * (isBallerina || isDiva ? 0.27 : isBboy ? 0.42 : 0.34)
      );
      const waistMidX = pSpine ? pSpine.x : (pPelvis.x + pChest.x) * 0.5;
      const waistMidY = pSpine ? pSpine.y : (pPelvis.y + pChest.y) * 0.5;

      const hipMidX = pPelvis.x;
      const hipMidY = pPelvis.y + charHeight * 0.02;
      const hipSpan = Math.max(
        minTorsoW * 1.05,
        Math.hypot(pRHip.x - pLHip.x, pRHip.y - pLHip.y) * (isBboy ? 1.02 : 0.85)
      );

      const torsoGrad = ctx.createLinearGradient(
        pChest.x - waistW,
        pChest.y - charHeight * 0.06,
        pChest.x + waistW,
        hipMidY
      );
      torsoGrad.addColorStop(0, jacketLight);
      torsoGrad.addColorStop(0.55, jacketMid);
      torsoGrad.addColorStop(1, jacketDark);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lShOutX, pLSh.y - upperArmR * 0.68 * pLSh.scale);
      ctx.quadraticCurveTo(
        pChest.x,
        Math.min(pLSh.y, pRSh.y) - upperArmR * 1.12 * pChest.scale,
        rShOutX,
        pRSh.y - upperArmR * 0.68 * pRSh.scale
      );
      ctx.quadraticCurveTo(
        waistMidX + waistW,
        waistMidY,
        hipMidX + hipSpan * 0.68,
        hipMidY
      );
      ctx.quadraticCurveTo(
        hipMidX,
        hipMidY + charHeight * 0.04,
        hipMidX - hipSpan * 0.68,
        hipMidY
      );
      ctx.quadraticCurveTo(
        waistMidX - waistW,
        waistMidY,
        lShOutX,
        pLSh.y - upperArmR * 0.68 * pLSh.scale
      );
      ctx.closePath();

      ctx.fillStyle = torsoGrad;
      ctx.fill();

      // Apply overhead Spotlight Intensity key shading & Rim Light Color aura on torso
      if (spotlightIntensity < 0.98) {
        ctx.fillStyle = `rgba(3, 5, 12, ${Math.min(0.6, (1 - spotlightIntensity) * 0.6).toFixed(3)})`;
        ctx.fill();
      } else if (spotlightIntensity > 1.02) {
        const torsoSpot = ctx.createLinearGradient(
          pChest.x,
          Math.min(pLSh.y, pRSh.y) - charHeight * 0.05,
          pChest.x,
          hipMidY
        );
        torsoSpot.addColorStop(
          0,
          `rgba(255, 255, 255, ${Math.min(0.3, (spotlightIntensity - 1) * 0.26).toFixed(3)})`
        );
        torsoSpot.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = torsoSpot;
        ctx.fill();
      }

      if (!isSil && !isNeonHuman) {
        ctx.save();
        ctx.shadowColor = rimLightColor;
        ctx.shadowBlur = Math.max(4, charHeight * (0.014 + spotlightIntensity * 0.012));
        ctx.strokeStyle = capsuleRimColor;
        ctx.lineWidth = Math.max(1.2, charHeight * 0.0048);
        ctx.stroke();
        ctx.restore();
      }

      if (isNeonHuman) {
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = Math.max(1.6, charHeight * 0.006);
        ctx.stroke();

        if (faceZ > -0.1) {
          ctx.strokeStyle = hexToRgba(secondaryColor, 0.78);
          ctx.lineWidth = Math.max(1.4, charHeight * 0.005);
          ctx.beginPath();
          ctx.moveTo(pChest.x + faceX * waistW * 0.2, pChest.y - charHeight * 0.03);
          ctx.lineTo(hipMidX + faceX * waistW * 0.15, hipMidY - charHeight * 0.01);
          ctx.stroke();
        }
      } else if (isSil) {
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = Math.max(1.4, charHeight * 0.005);
        ctx.stroke();
      } else if (isRobot) {
        // Mech titanium chest panel seam + glowing beat-synced reactor core
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = Math.max(1.5, charHeight * 0.005);
        ctx.stroke();
        const coreX = pChest.x + faceX * waistW * 0.22;
        const coreY = pChest.y + charHeight * 0.015;
        const coreR = Math.max(3, charHeight * (0.02 + beatDrive * 0.008));
        ctx.save();
        ctx.shadowColor = primaryColor;
        ctx.shadowBlur = Math.max(8, coreR * 1.8);
        ctx.fillStyle = lyricAccent > 0.25 ? '#ffffff' : primaryColor;
        ctx.beginPath();
        ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, coreR * 0.28);
        ctx.stroke();
        ctx.restore();
      } else if (isNinja) {
        // Stealth wrapped chest sash & crimson/accent waist belt
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
        ctx.stroke();
        ctx.strokeStyle = primaryColor;
        ctx.lineWidth = Math.max(2.2, charHeight * 0.012);
        ctx.beginPath();
        ctx.moveTo(lShOutX, pLSh.y + charHeight * 0.01);
        ctx.lineTo(waistMidX + waistW * 0.75, waistMidY + charHeight * 0.02);
        ctx.stroke();
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.roundRect(
          waistMidX - waistW * 0.96,
          waistMidY + charHeight * 0.012,
          waistW * 1.92,
          charHeight * 0.022,
          charHeight * 0.006
        );
        ctx.fill();
      } else if (isCasual) {
        // Casual hoodie drawstrings + chest pocket accent
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
        ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
        ctx.stroke();
        if (faceZ > -0.15 && pNeck) {
          const collarShift = faceX * waistW * 0.2;
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = Math.max(1.2, charHeight * 0.005);
          ctx.beginPath();
          ctx.moveTo(pNeck.x - waistW * 0.18 + collarShift, pChest.y - charHeight * 0.03);
          ctx.lineTo(pNeck.x - waistW * 0.22 + collarShift, pChest.y + charHeight * 0.04);
          ctx.moveTo(pNeck.x + waistW * 0.18 + collarShift, pChest.y - charHeight * 0.03);
          ctx.lineTo(pNeck.x + waistW * 0.22 + collarShift, pChest.y + charHeight * 0.04);
          ctx.stroke();
        }
      } else if (isSuit) {
        // Tuxedo/Formal white V-shirt front, crisp lapels & bowtie/pocket square
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
        ctx.stroke();
        if (faceZ > -0.15 && pNeck) {
          const collarShift = faceX * waistW * 0.22;
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.moveTo(pNeck.x - waistW * 0.32 + collarShift, pChest.y - charHeight * 0.045);
          ctx.lineTo(pNeck.x + waistW * 0.32 + collarShift, pChest.y - charHeight * 0.045);
          ctx.lineTo(pChest.x + collarShift, pChest.y + charHeight * 0.08);
          ctx.closePath();
          ctx.fill();

          if (isFormal) {
            // Silk necktie + pocket square accent
            ctx.fillStyle = secondaryColor;
            ctx.beginPath();
            ctx.moveTo(pNeck.x + collarShift - charHeight * 0.007, pChest.y - charHeight * 0.035);
            ctx.lineTo(pNeck.x + collarShift + charHeight * 0.007, pChest.y - charHeight * 0.035);
            ctx.lineTo(pChest.x + collarShift, pChest.y + charHeight * 0.068);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = primaryColor;
            ctx.fillRect(
              pChest.x + waistW * 0.42 + collarShift,
              pChest.y - charHeight * 0.01,
              charHeight * 0.018,
              charHeight * 0.009
            );
          } else {
            // Bowtie accent
            const bowY = pChest.y - charHeight * 0.032;
            const bowX = pNeck.x + collarShift;
            const bowW = charHeight * 0.018;
            const bowH = charHeight * 0.008;
            ctx.fillStyle = primaryColor;
            ctx.beginPath();
            ctx.moveTo(bowX - bowW, bowY - bowH);
            ctx.lineTo(bowX + bowW, bowY + bowH);
            ctx.lineTo(bowX + bowW, bowY - bowH);
            ctx.lineTo(bowX - bowW, bowY + bowH);
            ctx.closePath();
            ctx.fill();
          }
        }
      } else if (isBallerina) {
        // Layered flowing Ballet Tutu flaring cleanly from hips
        const tutuW = Math.max(hipSpan * 1.45, charHeight * 0.145) * (1 + beatDrive * 0.06);
        const tutuDrop = charHeight * 0.068;
        const flareShift = Math.sin(currentTime * 3.2) * charHeight * 0.008;

        const tutuGrad = ctx.createRadialGradient(
          hipMidX,
          hipMidY - tutuDrop * 0.2,
          tutuW * 0.15,
          hipMidX,
          hipMidY + tutuDrop * 0.25,
          tutuW * 1.15
        );
        tutuGrad.addColorStop(0, '#ffffff');
        tutuGrad.addColorStop(0.55, hexToRgba(primaryColor, 0.72));
        tutuGrad.addColorStop(1, hexToRgba(secondaryColor, 0.35));

        ctx.fillStyle = tutuGrad;
        ctx.strokeStyle = hexToRgba('#ffffff', 0.55);
        ctx.lineWidth = Math.max(1, charHeight * 0.004);
        ctx.beginPath();
        ctx.moveTo(hipMidX - hipSpan * 0.58, hipMidY - charHeight * 0.02);
        ctx.quadraticCurveTo(
          hipMidX - tutuW * 1.05,
          hipMidY + tutuDrop * 0.55,
          hipMidX - tutuW + flareShift,
          hipMidY + tutuDrop
        );
        ctx.quadraticCurveTo(
          hipMidX,
          hipMidY + tutuDrop * 1.28,
          hipMidX + tutuW + flareShift,
          hipMidY + tutuDrop
        );
        ctx.quadraticCurveTo(
          hipMidX + tutuW * 1.05,
          hipMidY + tutuDrop * 0.55,
          hipMidX + hipSpan * 0.58,
          hipMidY - charHeight * 0.02
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (isBboy) {
        // Hoodie pocket & accent drawstring/stripe
        ctx.strokeStyle = hexToRgba(primaryColor, 0.55 + beatDrive * 0.25);
        ctx.lineWidth = Math.max(1.5, charHeight * 0.005);
        ctx.stroke();
        if (faceZ > -0.1) {
          ctx.fillStyle = hexToRgba(primaryColor, 0.75);
          ctx.beginPath();
          ctx.roundRect(
            hipMidX - waistW * 0.5 + faceX * waistW * 0.16,
            hipMidY - charHeight * 0.055,
            waistW,
            charHeight * 0.042,
            charHeight * 0.01
          );
          ctx.fill();
        }
      } else if (isDiva) {
        // Stage Diva metallic belt & shimmering neckline trim
        ctx.strokeStyle = hexToRgba(secondaryColor, 0.65 + beatDrive * 0.25);
        ctx.lineWidth = Math.max(1.4, charHeight * 0.005);
        ctx.stroke();
        ctx.fillStyle = hexToRgba(primaryColor, 0.85);
        ctx.beginPath();
        ctx.roundRect(
          waistMidX - waistW * 0.92,
          waistMidY + charHeight * 0.02,
          waistW * 1.84,
          charHeight * 0.018,
          charHeight * 0.006
        );
        ctx.fill();
      } else {
        // Studio Pop jacket lapel / tee V-neck detail
        ctx.strokeStyle = hexToRgba(primaryColor, 0.35 + beatDrive * 0.25);
        ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
        ctx.stroke();
        if (faceZ > -0.15 && pNeck) {
          const collarShift = faceX * waistW * 0.22;
          ctx.fillStyle = hexToRgba(primaryColor, 0.9);
          ctx.beginPath();
          ctx.moveTo(pNeck.x - waistW * 0.28 + collarShift, pChest.y - charHeight * 0.04);
          ctx.lineTo(pNeck.x + waistW * 0.28 + collarShift, pChest.y - charHeight * 0.04);
          ctx.lineTo(pChest.x + collarShift, pChest.y + charHeight * 0.05);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    },
  });

  // Left & Right Arms + Hands
  parts.push({
    z: (pLSh.z + pLEl.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pLSh.x,
        pLSh.y,
        upperArmR * pLSh.scale,
        pLEl.x,
        pLEl.y,
        elbowR * pLEl.scale,
        sleeveLight,
        sleeveMid,
        sleeveDark,
        isSil || isNeonHuman ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pLEl.z + pLWr.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pLEl.x,
        pLEl.y,
        elbowR * 0.94 * pLEl.scale,
        pLWr.x,
        pLWr.y,
        wristR * pLWr.scale,
        sleeveLight,
        sleeveMid,
        sleeveDark,
        isSil || isNeonHuman ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pLWr.z + pLHandTip.z) * 0.5 + 0.01,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pLWr.x,
        pLWr.y,
        wristR * 0.98 * pLWr.scale,
        pLHandTip.x,
        pLHandTip.y,
        wristR * 0.65 * pLHandTip.scale,
        skinLight,
        skinMid,
        skinDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });

  parts.push({
    z: (pRSh.z + pREl.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pRSh.x,
        pRSh.y,
        upperArmR * pRSh.scale,
        pREl.x,
        pREl.y,
        elbowR * pREl.scale,
        sleeveLight,
        sleeveMid,
        sleeveDark,
        isSil || isNeonHuman ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pREl.z + pRWr.z) * 0.5,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pREl.x,
        pREl.y,
        elbowR * 0.94 * pREl.scale,
        pRWr.x,
        pRWr.y,
        wristR * pRWr.scale,
        sleeveLight,
        sleeveMid,
        sleeveDark,
        isSil || isNeonHuman ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });
  parts.push({
    z: (pRWr.z + pRHandTip.z) * 0.5 + 0.01,
    draw: () => {
      drawTaperedCapsule(
        ctx,
        pRWr.x,
        pRWr.y,
        wristR * 0.98 * pRWr.scale,
        pRHandTip.x,
        pRHandTip.y,
        wristR * 0.65 * pRHandTip.scale,
        skinLight,
        skinMid,
        skinDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });

  // Stage Diva long flowing hair layer behind head when facing forward
  if (isDiva) {
    parts.push({
      z: pHead.z - (faceZ > 0 ? 0.08 : -0.08),
      draw: () => {
        const hr = headR * pHead.scale;
        const hx = pHead.x;
        const hy = pHead.y;
        const hairSway = Math.sin(currentTime * 3.8) * hr * 0.35 - faceX * hr * 0.45;
        ctx.save();
        ctx.fillStyle = '#140c1c';
        ctx.strokeStyle = hexToRgba(secondaryColor, 0.35);
        ctx.lineWidth = Math.max(1, hr * 0.08);
        ctx.beginPath();
        ctx.moveTo(hx - hr * 0.9, hy - hr * 0.35);
        ctx.quadraticCurveTo(
          hx - hr * 1.15 + hairSway * 0.5,
          hy + hr * 1.35,
          hx - hr * 0.55 + hairSway,
          hy + hr * 2.4
        );
        ctx.quadraticCurveTo(
          hx + hairSway * 0.8,
          hy + hr * 2.65,
          hx + hr * 0.55 + hairSway,
          hy + hr * 2.35
        );
        ctx.quadraticCurveTo(
          hx + hr * 1.15 + hairSway * 0.5,
          hy + hr * 1.35,
          hx + hr * 0.9,
          hy - hr * 0.35
        );
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      },
    });
  }

  // Neck + Sculpted Head + Persona Hair/Cap/Eyewear
  parts.push({
    z: pHead.z,
    draw: () => {
      if (pNeck) {
        drawTaperedCapsule(
          ctx,
          pNeck.x,
          pNeck.y + charHeight * 0.015,
          neckR * pNeck.scale,
          pHead.x,
          pHead.y + headR * 0.35 * pHead.scale,
          neckR * 0.85 * pHead.scale,
          skinLight,
          skinMid,
          skinDark,
          undefined,
          capsuleRimColor,
          spotlightIntensity
        );
      }

      const hr = headR * pHead.scale;
      const hx = pHead.x;
      const hy = pHead.y;

      ctx.save();
      ctx.shadowColor = isSil
        ? rimLightColor
        : hexToRgba(
            rimLightColor,
            Math.min(0.95, 0.36 + spotlightIntensity * 0.2 + beatDrive * 0.3)
          );
      ctx.shadowBlur = Math.max(
        5,
        hr * (0.35 + spotlightIntensity * 0.28 + beatDrive * 0.35)
      );

      const headGrad = ctx.createRadialGradient(
        hx - hr * 0.25 + faceX * hr * 0.25,
        hy - hr * 0.25,
        hr * 0.15,
        hx,
        hy,
        hr * 1.15
      );
      headGrad.addColorStop(0, skinLight);
      headGrad.addColorStop(0.65, skinMid);
      headGrad.addColorStop(1, skinDark);

      ctx.fillStyle = headGrad;
      ctx.beginPath();
      ctx.ellipse(hx, hy, hr * 0.84, hr * 1.04, 0, 0, Math.PI * 2);
      ctx.fill();

      if (spotlightIntensity < 0.98) {
        ctx.fillStyle = `rgba(3, 5, 12, ${Math.min(0.58, (1 - spotlightIntensity) * 0.58).toFixed(3)})`;
        ctx.fill();
      } else if (spotlightIntensity > 1.02) {
        const crownSpot = ctx.createRadialGradient(
          hx,
          hy - hr * 0.55,
          hr * 0.1,
          hx,
          hy,
          hr * 1.05
        );
        crownSpot.addColorStop(
          0,
          `rgba(255, 255, 255, ${Math.min(0.28, (spotlightIntensity - 1) * 0.24).toFixed(3)})`
        );
        crownSpot.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = crownSpot;
        ctx.fill();
      }

      if (!isSil && !isRobot) {
        ctx.strokeStyle = capsuleRimColor;
        ctx.lineWidth = Math.max(1, hr * 0.085);
        ctx.stroke();
      }

      if (isSil) {
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = Math.max(1.4, hr * 0.12);
        ctx.stroke();
      } else if (isRobot) {
        // Mech antenna pods + armored visor faceplate
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.max(1.4, hr * 0.11);
        ctx.stroke();

        // Side ear comms / antenna fin
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.roundRect(hx - hr * 1.02, hy - hr * 0.32, hr * 0.22, hr * 0.56, hr * 0.08);
        ctx.roundRect(hx + hr * 0.8, hy - hr * 0.32, hr * 0.22, hr * 0.56, hr * 0.08);
        ctx.fill();

        if (faceZ > -0.18) {
          const visAlpha = Math.min(1, (faceZ + 0.18) * 1.5);
          const visX = hx + faceX * hr * 0.44;
          const visY = hy - hr * 0.08;
          const visW = hr * 0.74 * Math.max(0.32, Math.abs(faceZ));
          const visH = hr * 0.28;
          ctx.globalAlpha = visAlpha;
          ctx.fillStyle = '#090d16';
          ctx.beginPath();
          ctx.roundRect(visX - visW, visY - visH * 0.5, visW * 2, visH, visH * 0.3);
          ctx.fill();

          ctx.shadowColor = primaryColor;
          ctx.shadowBlur = 10;
          ctx.fillStyle = lyricAccent > 0.25 ? '#ffffff' : primaryColor;
          ctx.beginPath();
          ctx.roundRect(
            visX - visW * 0.84,
            visY - visH * 0.22,
            visW * 1.68,
            visH * 0.44,
            visH * 0.2
          );
          ctx.fill();
        }
      } else if (isNinja) {
        // Shinobi hood cowl, trailing headband tails, and focused eye slit
        ctx.shadowBlur = 0;
        const scarfSway = Math.sin(currentTime * 5.4) * hr * 0.48 - faceX * hr * 0.55;
        ctx.strokeStyle = secondaryColor;
        ctx.lineWidth = Math.max(2, hr * 0.22);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hx - faceX * hr * 0.55, hy - hr * 0.42);
        ctx.quadraticCurveTo(
          hx - faceX * hr * 1.3 + scarfSway * 0.5,
          hy - hr * 0.18,
          hx - faceX * hr * 1.7 + scarfSway,
          hy + hr * 0.45
        );
        ctx.stroke();

        // Forehead band
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.roundRect(hx - hr * 0.86, hy - hr * 0.52, hr * 1.72, hr * 0.24, hr * 0.1);
        ctx.fill();

        if (faceZ > -0.18) {
          const visAlpha = Math.min(1, (faceZ + 0.18) * 1.5);
          const visX = hx + faceX * hr * 0.44;
          const visY = hy - hr * 0.1;
          const visW = hr * 0.68 * Math.max(0.32, Math.abs(faceZ));
          ctx.globalAlpha = visAlpha;
          // Narrow skin eye opening inside cowl
          ctx.fillStyle = '#e5b89c';
          ctx.beginPath();
          ctx.roundRect(visX - visW * 0.85, visY - hr * 0.14, visW * 1.7, hr * 0.28, hr * 0.1);
          ctx.fill();
          // Focused eyes
          ctx.fillStyle = '#090b10';
          const eyeSpread = visW * 0.42;
          ctx.beginPath();
          ctx.arc(visX - eyeSpread, visY, hr * 0.085, 0, Math.PI * 2);
          ctx.arc(visX + eyeSpread, visY, hr * 0.085, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.shadowBlur = 0;

        if (isBallerina) {
          // Sleek ballet bun + smooth parted hair
          ctx.fillStyle = '#271a14';
          ctx.beginPath();
          ctx.arc(hx - faceX * hr * 0.15, hy - hr * 1.12, hr * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          const hairStart = faceZ > 0 ? Math.PI * 0.96 : 0;
          const hairEnd = faceZ > 0 ? Math.PI * 2.04 : Math.PI * 2;
          ctx.ellipse(hx, hy - hr * 0.18, hr * 0.88, hr * 0.94, 0, hairStart, hairEnd);
          ctx.fill();
        } else if (isBboy) {
          // Baseball street cap with brim pointing away/side
          ctx.fillStyle = primaryColor;
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.36, hr * 0.95, hr * 0.72, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          // Brim angled slightly backward/sideways
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.ellipse(
            hx - faceX * hr * 0.72,
            hy - hr * 0.38,
            hr * 0.68,
            hr * 0.2,
            -0.12,
            0,
            Math.PI * 2
          );
          ctx.fill();
        } else {
          // Standard sculpted hair crown (Studio Pop, Casual, Formal, Tuxedo, Cyber Human, Diva top)
          const hairColor = isNeonHuman
            ? '#090d16'
            : isDiva
            ? '#140c1c'
            : isCasual
            ? '#3f2e22'
            : isSuit
            ? '#1e1b18'
            : '#18181b';
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          const hairStart = faceZ > 0 ? Math.PI * 0.92 : 0;
          const hairEnd = faceZ > 0 ? Math.PI * 2.08 : Math.PI * 2;
          ctx.ellipse(
            hx - faceX * hr * 0.08,
            hy - hr * 0.16,
            hr * 0.9,
            hr * 0.98,
            0,
            hairStart,
            hairEnd
          );
          ctx.fill();
        }

        // Facing facial detail / shades / visor
        if (faceZ > -0.18) {
          const visAlpha = Math.min(1, (faceZ + 0.18) * 1.5);
          const visX = hx + faceX * hr * 0.44;
          const visY = hy - hr * 0.08;
          const visW = hr * 0.72 * Math.max(0.32, Math.abs(faceZ));
          const visH = hr * 0.22;

          ctx.globalAlpha = visAlpha;
          if (isNeonHuman) {
            ctx.shadowColor = secondaryColor;
            ctx.shadowBlur = 10;
            ctx.fillStyle = lyricAccent > 0.25 ? '#ffffff' : secondaryColor;
            ctx.beginPath();
            ctx.roundRect(visX - visW, visY - visH * 0.5, visW * 2, visH, visH * 0.45);
            ctx.fill();
          } else if (isBallerina || isDiva) {
            // Expressive arched eyes & subtle lip accent
            ctx.fillStyle = '#18181b';
            const eyeSpread = visW * 0.48;
            ctx.beginPath();
            ctx.ellipse(visX - eyeSpread, visY, hr * 0.11, hr * 0.08, 0, 0, Math.PI * 2);
            ctx.ellipse(visX + eyeSpread, visY, hr * 0.11, hr * 0.08, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = isBallerina ? '#ec4899' : secondaryColor;
            ctx.beginPath();
            ctx.ellipse(
              visX,
              hy + hr * 0.38,
              hr * 0.2 * Math.max(0.35, Math.abs(faceZ)),
              hr * 0.075,
              0,
              0,
              Math.PI * 2
            );
            ctx.fill();
          } else if (isSuit || isCasual) {
            // Subtle crisp brows & eyes for Casual & Formal Lounge dancers
            ctx.fillStyle = '#090b10';
            const eyeSpread = visW * 0.48;
            ctx.beginPath();
            ctx.arc(visX - eyeSpread, visY, hr * 0.095, 0, Math.PI * 2);
            ctx.arc(visX + eyeSpread, visY, hr * 0.095, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Studio dark shades for Studio Pop & B-Boy
            ctx.fillStyle = '#090b10';
            ctx.strokeStyle = hexToRgba(primaryColor, 0.75);
            ctx.lineWidth = Math.max(1.2, hr * 0.07);
            ctx.beginPath();
            ctx.roundRect(visX - visW, visY - visH * 0.5, visW * 2, visH * 1.05, visH * 0.35);
            ctx.fill();
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    },
  });

  // Render all anatomical parts back-to-front by Z depth
  parts.sort((a, b) => a.z - b.z);
  for (const part of parts) {
    part.draw();
  }
}

export function renderDanceCharacter(params: RenderDanceParams): void {
  const {
    ctx,
    width,
    height,
    minDim,
    isPortrait,
    currentTime,
    bass,
    mid,
    treble,
    beatBurst,
    beatTriggered,
    settings,
    lyrics,
    mocapClip,
    hexToRgba,
  } = params;

  if (!settings.danceEnabled) return;

  const style: DanceStyleKey = settings.danceStyle ?? 'hip-hop';
  const avatarStyle: DanceAvatarStyle =
    settings.avatarStyle ?? settings.danceAvatarStyle ?? 'human-dancer';
  const placement: DancePlacement = settings.dancePlacement ?? 'center';
  const danceScale = Math.max(0.5, Math.min(1.6, settings.danceScale ?? 1));
  const danceEnergy = Math.max(0.3, Math.min(2.0, settings.danceEnergy ?? 1));
  const lyricSyncEnabled = settings.danceLyricSync !== false;

  // Determine active lyric cue & lyric transition impulse
  let activeLyricIdx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime + 0.05) {
      activeLyricIdx = i;
    } else {
      break;
    }
  }
  const activeCue = activeLyricIdx >= 0 ? lyrics[activeLyricIdx] : null;
  const lyricElapsed = activeCue ? Math.max(0, currentTime - activeCue.time) : 99;
  const lyricAccent =
    lyricSyncEnabled && activeCue ? Math.exp(-lyricElapsed * 5.2) : 0;

  const rawBeat = Math.max(beatTriggered ? 1 : 0, Math.min(1, beatBurst));
  const beatDrive = Math.max(rawBeat, bass * 0.45);

  const activeMocapClip: MocapClipData | null = isBuiltInMocapStyle(style)
    ? getBuiltInMocapClip(style)
    : style === 'mocap-custom' && mocapClip && mocapClip.frameCount > 0
    ? mocapClip
    : null;
  const useMocap = Boolean(activeMocapClip && activeMocapClip.frameCount > 0);
  const proceduralFallbackStyle: Exclude<DanceStyleKey, 'mocap-custom' | BuiltInMocapStyleKey> =
    style === 'mocap-custom' || isBuiltInMocapStyle(style) ? 'hip-hop' : style;

  const joints3D = useMocap && activeMocapClip
    ? sampleMocapSkeleton(activeMocapClip, currentTime, beatDrive, danceEnergy, lyricAccent)
    : solveProceduralSkeleton(
        proceduralFallbackStyle,
        currentTime,
        bass,
        mid,
        treble,
        beatDrive,
        danceEnergy,
        lyricAccent,
        activeLyricIdx
      );

  const bones = useMocap && activeMocapClip ? activeMocapClip.bones : HUMANOID_BONES;
  const headIdx = useMocap && activeMocapClip ? activeMocapClip.headJointIndex : J_HEAD;

  // Compute base screen placement & responsive character height
  const baseCenterX =
    placement === 'left'
      ? width * (isPortrait ? 0.24 : 0.22)
      : placement === 'right'
      ? width * (isPortrait ? 0.76 : 0.78)
      : width * 0.5;

  const baseFloorY = height * (isPortrait ? 0.66 : 0.76);
  const baseCharHeight = minDim * (isPortrait ? 0.35 : 0.46) * danceScale;

  const danceCount = Math.max(1, Math.min(3, Math.round(settings.danceCount ?? 1)));
  const danceMirror = Boolean(settings.danceMirror);

  // Build stage formation slots ordered back-to-front so lead dancer overlaps cleanly in front
  interface DancerSlot {
    centerX: number;
    floorY: number;
    charHeight: number;
    primaryColor: string;
    secondaryColor: string;
    mirror: boolean;
  }

  const edgePad = Math.max(24, baseCharHeight * 0.22);
  const clampX = (x: number) => Math.max(edgePad, Math.min(width - edgePad, x));

  let slots: DancerSlot[];
  if (danceCount === 2) {
    const spread =
      width *
      (placement === 'center'
        ? isPortrait
          ? 0.175
          : 0.145
        : isPortrait
        ? 0.115
        : 0.09);
    const leftX = clampX(baseCenterX - spread);
    const rightX = clampX(baseCenterX + spread);
    slots = [
      {
        centerX: leftX,
        floorY: baseFloorY,
        charHeight: baseCharHeight * 0.94,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        mirror: false,
      },
      {
        centerX: rightX,
        floorY: baseFloorY,
        charHeight: baseCharHeight * 0.94,
        primaryColor: settings.secondaryColor,
        secondaryColor: settings.primaryColor,
        mirror: danceMirror,
      },
    ];
  } else if (danceCount === 3) {
    const spread =
      width *
      (placement === 'center'
        ? isPortrait
          ? 0.255
          : 0.215
        : isPortrait
        ? 0.145
        : 0.115);
    const wingFloorY = baseFloorY - baseCharHeight * 0.045;
    const wingHeight = baseCharHeight * 0.85;
    slots = [
      {
        centerX: clampX(baseCenterX - spread),
        floorY: wingFloorY,
        charHeight: wingHeight,
        primaryColor: settings.secondaryColor,
        secondaryColor: settings.primaryColor,
        mirror: false,
      },
      {
        centerX: clampX(baseCenterX + spread),
        floorY: wingFloorY,
        charHeight: wingHeight,
        primaryColor: settings.secondaryColor,
        secondaryColor: settings.primaryColor,
        mirror: danceMirror,
      },
      {
        centerX: clampX(baseCenterX),
        floorY: baseFloorY,
        charHeight: baseCharHeight,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        mirror: false,
      },
    ];
  } else {
    slots = [
      {
        centerX: baseCenterX,
        floorY: baseFloorY,
        charHeight: baseCharHeight,
        primaryColor: settings.primaryColor,
        secondaryColor: settings.secondaryColor,
        mirror: danceMirror,
      },
    ];
  }

  // Subtle 3D camera yaw so choreography reads cleanly in 3D space
  const yawAmp = useMocap ? 0.11 : 0.22;
  const yaw =
    Math.sin(currentTime * 1.1) * yawAmp * danceEnergy +
    lyricAccent * (activeLyricIdx % 2 === 0 ? 0.16 : -0.16);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const fov = 3.2;

  const danceStrobe = Math.max(0, Math.min(1, settings.danceStrobe ?? 0));
  const spotlightIntensity = Math.max(
    0,
    Math.min(2, settings.danceSpotlightIntensity ?? 1)
  );
  const danceShadowEnabled = settings.danceShadow ?? true;
  const rawRimSetting =
    typeof settings.danceRimColor === 'string' ? settings.danceRimColor.trim() : '';
  const hasCustomRim = /^#[0-9a-fA-F]{3,8}$/.test(rawRimSetting);

  const strobeBuffer =
    danceStrobe > 0.005 ? ensureDanceStrobeCanvas(width, height) : null;
  const avatarCtx: DanceRenderCtx = strobeBuffer ? strobeBuffer.ctx : ctx;

  for (const slot of slots) {
    const {
      centerX,
      floorY,
      charHeight,
      primaryColor: slotPrimary,
      secondaryColor: slotSecondary,
    } = slot;
    const slotRimColor = hasCustomRim ? rawRimSetting : slotPrimary;

    // Unified 3D stage spotlight source position used by both overhead beam and floor-mapped drop shadow
    const stageCenterShift =
      (width * 0.5 - centerX) / Math.max(1, charHeight * 0.56);
    const lightWorldX = Math.max(
      -1.6,
      Math.min(1.6, stageCenterShift * 0.55 - 0.28 + Math.sin(currentTime * 0.45) * 0.08)
    );
    const lightWorldY = 3.85;
    const lightWorldZ = -0.88 + Math.cos(currentTime * 0.35) * 0.06;

    const projected: ProjectedJoint[] = joints3D.map(([jx, jy, jz]) => {
      const rx = jx * cosY + jz * sinY;
      const rz = -jx * sinY + jz * cosY;
      const depth = Math.max(1.4, fov - rz * 0.75);
      const persp = fov / depth;
      const px = centerX + rx * (charHeight * 0.56) * persp;
      const py = floorY - jy * (charHeight * 0.56) * persp;
      return { x: px, y: py, z: rz, scale: persp, worldY: jy };
    });

    // Overhead Stage Spotlight Beam + Floor Pool scaled by Spotlight Intensity
    const floorRadiusX =
      charHeight * (0.2 + spotlightIntensity * 0.045 + beatDrive * 0.08 + lyricAccent * 0.05);

    if (spotlightIntensity > 0.01) {
      const beamTopY = Math.max(0, floorY - charHeight * 1.54);
      const beamTopCenterX = centerX + lightWorldX * charHeight * 0.2;
      const beamTopHalfW = charHeight * (0.1 + spotlightIntensity * 0.03);
      const beamBotHalfW = floorRadiusX * (1.02 + spotlightIntensity * 0.14);

      ctx.save();
      const beamGrad = ctx.createLinearGradient(
        beamTopCenterX,
        beamTopY,
        centerX,
        floorY + 2
      );
      beamGrad.addColorStop(
        0,
        hexToRgba(
          slotRimColor,
          Math.min(0.36, (0.075 + beatDrive * 0.05) * spotlightIntensity)
        )
      );
      beamGrad.addColorStop(
        0.55,
        hexToRgba(
          slotPrimary,
          Math.min(0.24, (0.045 + lyricAccent * 0.04) * spotlightIntensity)
        )
      );
      beamGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(beamTopCenterX - beamTopHalfW, beamTopY);
      ctx.lineTo(beamTopCenterX + beamTopHalfW, beamTopY);
      ctx.lineTo(centerX + beamBotHalfW, floorY + 2);
      ctx.lineTo(centerX - beamBotHalfW, floorY + 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(centerX, floorY + 2);
      const floorGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, floorRadiusX * 1.35);
      floorGrad.addColorStop(
        0,
        hexToRgba(
          slotRimColor,
          Math.min(0.85, (0.24 + beatDrive * 0.32 + lyricAccent * 0.18) * spotlightIntensity)
        )
      );
      floorGrad.addColorStop(
        0.65,
        hexToRgba(
          slotSecondary,
          Math.min(0.55, (0.12 + beatDrive * 0.16) * spotlightIntensity)
        )
      );
      floorGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.scale(1, 0.28);
      ctx.fillStyle = floorGrad;
      ctx.beginPath();
      ctx.arc(0, 0, floorRadiusX * 1.35, 0, Math.PI * 2);
      ctx.fill();

      if (
        avatarStyle === 'neon-cyber' ||
        avatarStyle === 'holo-wire' ||
        avatarStyle === 'human-neon' ||
        avatarStyle === 'robot'
      ) {
        ctx.strokeStyle = hexToRgba(
          slotRimColor,
          Math.min(
            0.95,
            (0.32 + beatDrive * 0.45 + lyricAccent * 0.25) * Math.min(1.25, spotlightIntensity)
          )
        );
        ctx.lineWidth = Math.max(1.5, charHeight * 0.008);
        ctx.beginPath();
        ctx.arc(0, 0, floorRadiusX, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Floor-mapped 3D drop shadow reacting to stage lighting position & dancer pose
    if (danceShadowEnabled) {
      const shadowPoints = joints3D.map(([jx, jy, jz]) => {
        const rxRaw = jx * cosY + jz * sinY;
        const rx = slot.mirror ? -rxRaw : rxRaw;
        const rz = -jx * sinY + jz * cosY;
        const safeJy = Math.max(0, Math.min(lightWorldY - 0.6, jy));
        const rayT = lightWorldY / (lightWorldY - safeJy);
        const sx = lightWorldX + (rx - lightWorldX) * rayT;
        const sz = lightWorldZ + (rz - lightWorldZ) * rayT;
        const depth = Math.max(1.4, fov - sz * 0.75);
        const persp = fov / depth;
        return {
          x: centerX + sx * (charHeight * 0.56) * persp,
          y: floorY + 2 + sz * (charHeight * 0.115) * persp,
          scale: persp,
          rayT,
        };
      });

      const shadowAlpha = Math.min(
        0.58,
        0.22 + Math.min(1.5, spotlightIntensity) * 0.2 + beatDrive * 0.04
      );
      const humanRigIndices = isHumanAvatarStyle(avatarStyle)
        ? resolveHumanoidIndices(
            useMocap && activeMocapClip ? activeMocapClip.jointNames : null,
            shadowPoints.length
          )
        : null;

      // Soft ambient ground penumbra under projected body center
      const anchorPt = shadowPoints[0] ?? { x: centerX, y: floorY + 2, scale: 1 };
      const penumbraRx = charHeight * (0.16 + spotlightIntensity * 0.03);
      const penumbraRy = penumbraRx * 0.26;
      const penumbraX = (centerX * 0.45 + anchorPt.x * 0.55);
      const penumbraY = (floorY + 2) * 0.5 + anchorPt.y * 0.5;
      ctx.save();
      const penumbraGrad = ctx.createRadialGradient(
        penumbraX,
        penumbraY,
        1,
        penumbraX,
        penumbraY,
        penumbraRx
      );
      penumbraGrad.addColorStop(
        0,
        `rgba(2, 4, 10, ${(shadowAlpha * 0.68).toFixed(3)})`
      );
      penumbraGrad.addColorStop(1, 'rgba(2, 4, 10, 0)');
      ctx.translate(penumbraX, penumbraY);
      ctx.scale(1, penumbraRy / Math.max(1, penumbraRx));
      ctx.translate(-penumbraX, -penumbraY);
      ctx.fillStyle = penumbraGrad;
      ctx.beginPath();
      ctx.arc(penumbraX, penumbraY, penumbraRx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const shadowBuf = ensureDanceShadowCanvas(width, height);
      if (shadowBuf) {
        const { canvas: shCanvas, ctx: shCtx } = shadowBuf;
        const isWireRig = avatarStyle === 'holo-wire' || avatarStyle === 'minimal-rig';
        const baseShadowLimbW = Math.max(
          2.5,
          charHeight * (isWireRig ? 0.018 : 0.028)
        );

        shCtx.save();
        shCtx.fillStyle = '#02040a';
        shCtx.strokeStyle = '#02040a';
        shCtx.lineCap = 'round';
        shCtx.lineJoin = 'round';

        // Solid torso polygon on floor shadow when humanoid joints resolve
        if (humanRigIndices) {
          const sPelvis = shadowPoints[humanRigIndices.pelvis];
          const sLSh = shadowPoints[humanRigIndices.lShoulder];
          const sRSh = shadowPoints[humanRigIndices.rShoulder];
          if (sPelvis && sLSh && sRSh) {
            shCtx.beginPath();
            shCtx.moveTo(sLSh.x, sLSh.y);
            shCtx.lineTo(sRSh.x, sRSh.y);
            shCtx.lineTo(sPelvis.x, sPelvis.y);
            shCtx.closePath();
            shCtx.fill();
          }
        }

        // Articulated limb & spine drop shadow segments
        for (const [a, b] of bones) {
          const sa = shadowPoints[a];
          const sb = shadowPoints[b];
          if (!sa || !sb) continue;
          const isTorsoBone = !useMocap && a <= J_CHEST && b <= J_NECK;
          shCtx.lineWidth =
            baseShadowLimbW *
            (isTorsoBone ? 1.55 : 0.95) *
            ((sa.scale + sb.scale) * 0.5);
          shCtx.beginPath();
          shCtx.moveTo(sa.x, sa.y);
          shCtx.lineTo(sb.x, sb.y);
          shCtx.stroke();
        }

        // Head floor-foreshortened silhouette
        const sHead = shadowPoints[headIdx];
        if (sHead) {
          const hrx = Math.max(4, charHeight * 0.058 * sHead.scale);
          shCtx.beginPath();
          shCtx.ellipse(sHead.x, sHead.y, hrx, hrx * 0.36, 0, 0, Math.PI * 2);
          shCtx.fill();
        }
        shCtx.restore();

        ctx.save();
        ctx.globalAlpha = shadowAlpha;
        ctx.drawImage(shCanvas, 0, 0, width, height);
        ctx.restore();
      }
    }

    avatarCtx.save();
    if (slot.mirror) {
      avatarCtx.translate(centerX, 0);
      avatarCtx.scale(-1, 1);
      avatarCtx.translate(-centerX, 0);
    }

    // Volumetric Human Renderer for all human character styles + Silhouette
    if (isHumanAvatarStyle(avatarStyle)) {
      const indices = resolveHumanoidIndices(
        useMocap && activeMocapClip ? activeMocapClip.jointNames : null,
        projected.length
      );
      if (indices) {
        renderHumanVolumetricDancer({
          ctx: avatarCtx,
          avatarStyle,
          projected,
          indices,
          floorY,
          centerX,
          charHeight,
          currentTime,
          beatDrive,
          lyricAccent,
          primaryColor: slotPrimary,
          secondaryColor: slotSecondary,
          rimLightColor: slotRimColor,
          hasCustomRim,
          spotlightIntensity,
          danceShadowEnabled,
          hexToRgba,
        });
        avatarCtx.restore();
        continue;
      }
    }

    // Sort bones back-to-front by Z depth for skeletal/rig avatar styles
    const sortedBones = bones
      .map(([a, b], idx) => ({
        a,
        b,
        idx,
        midZ: ((projected[a]?.z ?? 0) + (projected[b]?.z ?? 0)) * 0.5,
      }))
      .filter((item) => projected[item.a] && projected[item.b])
      .sort((u, v) => u.midZ - v.midZ);

    const limbBaseWidth = Math.max(3, charHeight * 0.032);
    const headRadius = Math.max(6, charHeight * 0.068);
    const rigGlowFactor = 0.35 + 0.65 * Math.min(1.5, spotlightIntensity);

    if (avatarStyle === 'holo-wire') {
      avatarCtx.lineCap = 'round';
      avatarCtx.shadowColor = slotRimColor;
      avatarCtx.shadowBlur = Math.max(
        4,
        charHeight * (0.04 + beatDrive * 0.05) * rigGlowFactor
      );

      if (beatDrive > 0.12) {
        avatarCtx.save();
        avatarCtx.globalAlpha = Math.min(0.4, beatDrive * 0.35);
        const echoShift = Math.sin(currentTime * 18) * charHeight * 0.025;
        avatarCtx.strokeStyle = slotSecondary;
        avatarCtx.lineWidth = Math.max(1.5, limbBaseWidth * 0.45);
        for (const { a, b } of sortedBones) {
          const pa = projected[a];
          const pb = projected[b];
          avatarCtx.beginPath();
          avatarCtx.moveTo(pa.x + echoShift, pa.y);
          avatarCtx.lineTo(pb.x + echoShift, pb.y);
          avatarCtx.stroke();
        }
        avatarCtx.restore();
      }

      for (const { a, b, idx } of sortedBones) {
        const pa = projected[a];
        const pb = projected[b];
        avatarCtx.strokeStyle =
          idx % 2 === 0 ? slotRimColor : hasCustomRim ? slotPrimary : slotSecondary;
        avatarCtx.lineWidth = Math.max(
          2,
          limbBaseWidth * 0.52 * ((pa.scale + pb.scale) * 0.5)
        );
        avatarCtx.beginPath();
        avatarCtx.moveTo(pa.x, pa.y);
        avatarCtx.lineTo(pb.x, pb.y);
        avatarCtx.stroke();
      }

      for (let j = 0; j < projected.length; j++) {
        const p = projected[j];
        const r =
          j === headIdx
            ? headRadius * 0.78 * p.scale
            : Math.max(2.5, limbBaseWidth * 0.44 * p.scale);
        avatarCtx.fillStyle = j === headIdx ? hexToRgba(slotRimColor, 0.28) : '#f8fafc';
        avatarCtx.strokeStyle = j === headIdx ? slotRimColor : slotSecondary;
        avatarCtx.lineWidth = Math.max(1.2, r * 0.28);
        avatarCtx.beginPath();
        avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
        avatarCtx.fill();
        avatarCtx.stroke();
      }
      avatarCtx.restore();
      continue;
    }

    if (avatarStyle === 'minimal-rig') {
      avatarCtx.lineCap = 'round';
      avatarCtx.shadowColor = hasCustomRim
        ? hexToRgba(slotRimColor, 0.55)
        : 'rgba(0, 0, 0, 0.55)';
      avatarCtx.shadowBlur = Math.max(6, 10 * rigGlowFactor);
      for (const { a, b } of sortedBones) {
        const pa = projected[a];
        const pb = projected[b];
        const isTorso = !useMocap && a <= J_CHEST && b <= J_NECK;
        avatarCtx.strokeStyle = '#f1f5f9';
        avatarCtx.lineWidth = Math.max(
          2.5,
          limbBaseWidth * (isTorso ? 1.25 : 0.72) * ((pa.scale + pb.scale) * 0.5)
        );
        avatarCtx.beginPath();
        avatarCtx.moveTo(pa.x, pa.y);
        avatarCtx.lineTo(pb.x, pb.y);
        avatarCtx.stroke();
      }
      for (let j = 0; j < projected.length; j++) {
        const p = projected[j];
        const isHead = j === headIdx;
        const r = isHead
          ? headRadius * 0.9 * p.scale
          : Math.max(2.5, limbBaseWidth * 0.42 * p.scale);
        avatarCtx.fillStyle = isHead ? '#f8fafc' : slotRimColor;
        avatarCtx.beginPath();
        avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
        avatarCtx.fill();
      }
      avatarCtx.restore();
      continue;
    }

    // 'neon-cyber': luminous cybernetic dancer rig
    avatarCtx.lineCap = 'round';
    avatarCtx.lineJoin = 'round';

    for (const { a, b } of sortedBones) {
      const pa = projected[a];
      const pb = projected[b];
      const isTorso = !useMocap && a <= J_CHEST && b <= J_NECK;
      const wPx = Math.max(
        3,
        limbBaseWidth * (isTorso ? 1.48 : 0.9) * ((pa.scale + pb.scale) * 0.5)
      );

      const boneGrad = avatarCtx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      boneGrad.addColorStop(0, slotRimColor);
      boneGrad.addColorStop(1, slotSecondary);

      avatarCtx.shadowColor = slotRimColor;
      avatarCtx.shadowBlur = Math.max(
        6,
        charHeight * (0.045 + beatDrive * 0.045) * rigGlowFactor
      );
      avatarCtx.strokeStyle = boneGrad;
      avatarCtx.lineWidth = wPx;
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();

      avatarCtx.shadowBlur = 0;
      avatarCtx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
      avatarCtx.lineWidth = Math.max(1.2, wPx * 0.28);
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }

    for (let j = 0; j < projected.length; j++) {
      if (j === headIdx) continue;
      const p = projected[j];
      const r = Math.max(2.5, limbBaseWidth * 0.42 * p.scale);
      avatarCtx.fillStyle = '#ffffff';
      avatarCtx.shadowColor = slotRimColor;
      avatarCtx.shadowBlur = Math.max(6, 9 * rigGlowFactor);
      avatarCtx.beginPath();
      avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      avatarCtx.fill();
    }

    const ph = projected[headIdx];
    if (ph) {
      const hr = headRadius * ph.scale;
      avatarCtx.shadowColor = slotRimColor;
      avatarCtx.shadowBlur = Math.max(8, hr * (0.7 + beatDrive * 0.6) * rigGlowFactor);
      avatarCtx.fillStyle = '#090b10';
      avatarCtx.strokeStyle = slotRimColor;
      avatarCtx.lineWidth = Math.max(2, hr * 0.16);
      avatarCtx.beginPath();
      avatarCtx.arc(ph.x, ph.y, hr, 0, Math.PI * 2);
      avatarCtx.fill();
      avatarCtx.stroke();

      const visorOffsetX = Math.sin(yaw) * hr * 0.36;
      avatarCtx.shadowColor = slotSecondary;
      avatarCtx.strokeStyle = lyricAccent > 0.25 ? '#ffffff' : slotSecondary;
      avatarCtx.lineWidth = Math.max(2, hr * 0.22);
      avatarCtx.beginPath();
      avatarCtx.moveTo(ph.x + visorOffsetX - hr * 0.45, ph.y - hr * 0.05);
      avatarCtx.lineTo(ph.x + visorOffsetX + hr * 0.45, ph.y - hr * 0.05);
      avatarCtx.stroke();
    }

    avatarCtx.restore();
  }

  // Post-processing Dancer Strobe: rapidly dim & brighten only the avatar layer on beat peaks
  if (strobeBuffer && danceStrobe > 0.005) {
    const { canvas: sCanvas, ctx: sCtx } = strobeBuffer;
    const strobeHz = 14 + danceStrobe * 10;
    const shutterWave = Math.sin(currentTime * Math.PI * 2 * strobeHz);
    const shutterOpen = beatTriggered || rawBeat > 0.82 || shutterWave > -0.1;
    const inBeatPeak = rawBeat > 0.14;
    const peakNorm = Math.pow(rawBeat, 0.72);

    if (inBeatPeak && shutterOpen) {
      // Brighten peak pulse directly on avatar pixels via source-atop mask
      const whiteHighlight = Math.min(0.62, danceStrobe * peakNorm * 0.5);
      if (whiteHighlight > 0.01) {
        sCtx.save();
        sCtx.globalCompositeOperation = 'source-atop';
        sCtx.fillStyle = `rgba(255, 255, 255, ${whiteHighlight.toFixed(3)})`;
        sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);
        sCtx.restore();
      }

      // Base sharp avatar draw + subtle strobe rim glow
      ctx.save();
      if (danceStrobe * peakNorm > 0.28) {
        ctx.shadowColor = hasCustomRim ? rawRimSetting : settings.primaryColor;
        ctx.shadowBlur = Math.max(6, minDim * 0.022 * danceStrobe * peakNorm);
      }
      ctx.drawImage(sCanvas, 0, 0, width, height);
      ctx.restore();

      // Additive flare pass specifically on avatars for unmistakable strobe brighten pop
      const flareAlpha = Math.min(0.88, danceStrobe * peakNorm * 0.76);
      if (flareAlpha > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flareAlpha;
        ctx.drawImage(sCanvas, 0, 0, width, height);
        ctx.restore();
      }
    } else {
      // Rapid dim trough during peak shutter-off OR moody dimmed resting state between beats
      const dimShade = inBeatPeak
        ? Math.min(0.88, danceStrobe * 0.82)
        : Math.min(0.48, danceStrobe * 0.42);
      const dimCompositeAlpha = inBeatPeak
        ? Math.max(0.16, 1 - danceStrobe * 0.76)
        : Math.max(0.58, 1 - danceStrobe * 0.36);

      if (dimShade > 0.01) {
        sCtx.save();
        sCtx.globalCompositeOperation = 'source-atop';
        sCtx.fillStyle = `rgba(4, 6, 14, ${dimShade.toFixed(3)})`;
        sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);
        sCtx.restore();
      }

      ctx.save();
      ctx.globalAlpha = dimCompositeAlpha;
      ctx.drawImage(sCanvas, 0, 0, width, height);
      ctx.restore();
    }
  }
}
