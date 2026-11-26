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
  height: number,
  skipClear = false
): { canvas: DanceScratchCanvas; ctx: DanceRenderCtx } | null {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  let target = existing;
  let justReset = false;
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
    justReset = true;
  } else if (target.width !== w || target.height !== h) {
    target.width = w;
    target.height = h;
    justReset = true;
  }

  const sCtx = target.getContext('2d') as DanceRenderCtx | null;
  if (!sCtx) return null;
  sCtx.setTransform(1, 0, 0, 1, 0, 0);
  if (!skipClear && !justReset) {
    sCtx.clearRect(0, 0, w, h);
  }
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
  const res = ensureScratchCanvas(danceShadowCanvas, width, height, true);
  if (res) danceShadowCanvas = res.canvas;
  return res;
}

export type DanceFilterTag = 'high-energy' | 'slow' | 'modern' | 'classic';

export const DANCE_FILTER_TAG_LABELS: Record<DanceFilterTag, string> = {
  'high-energy': 'High-Energy',
  slow: 'Slow',
  modern: 'Modern',
  classic: 'Classic',
};

export const DANCE_STYLE_FILTER_CHIPS: Array<{
  id: 'all' | DanceFilterTag;
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'high-energy', label: 'High-Energy' },
  { id: 'slow', label: 'Slow' },
  { id: 'modern', label: 'Modern' },
  { id: 'classic', label: 'Classic' },
];

export const DANCE_CHARACTER_FILTER_CHIPS: Array<{
  id: 'all' | DanceFilterTag | 'rig';
  label: string;
}> = [
  { id: 'all', label: 'All' },
  { id: 'high-energy', label: 'High-Energy' },
  { id: 'slow', label: 'Slow' },
  { id: 'modern', label: 'Modern' },
  { id: 'classic', label: 'Classic' },
  { id: 'rig', label: 'Rigs' },
];

const MOCAP_STYLE_TAGS: Record<string, DanceFilterTag[]> = Object.fromEntries(
  BUILT_IN_MOCAP_LIBRARY.map((entry) => [entry.id, entry.tags])
);

export interface DanceStyleOption {
  id: DanceStyleKey;
  label: string;
  desc: string;
  category: 'mocap-library' | 'procedural' | 'custom';
  tags: DanceFilterTag[];
}

export const DANCE_STYLE_OPTIONS: DanceStyleOption[] = [
  ...BUILT_IN_MOCAP_LIBRARY.map((entry) => ({
    id: entry.id as DanceStyleKey,
    label: `${entry.title} (Mocap)`,
    desc: entry.description,
    category: 'mocap-library' as const,
    tags: MOCAP_STYLE_TAGS[entry.id] ?? ['modern'],
  })),
  {
    id: 'hip-hop',
    label: 'Hip-Hop Bounce',
    desc: 'Heavy downbeat knee bounce, shoulder rock & lyric-accent arm hits',
    category: 'procedural',
    tags: ['high-energy', 'modern'],
  },
  {
    id: 'shuffle',
    label: 'Shuffle Step',
    desc: 'Crisp running-man footwork and synced counter-arm swings',
    category: 'procedural',
    tags: ['high-energy', 'modern'],
  },
  {
    id: 'robot',
    label: 'Robot Pop',
    desc: 'Quantized servo snaps locking to beat peaks and lyric transitions',
    category: 'procedural',
    tags: ['modern', 'classic'],
  },
  {
    id: 'groove',
    label: 'Smooth Groove',
    desc: 'Fluid torso wave and sweeping arm arcs driven by mid/treble flow',
    category: 'procedural',
    tags: ['slow', 'modern'],
  },
  {
    id: 'break-freeze',
    label: 'Break Freeze',
    desc: 'Wide athletic stance with dramatic power poses on lyric drops',
    category: 'procedural',
    tags: ['high-energy', 'modern'],
  },
  {
    id: 'mocap-custom',
    label: 'Custom Upload (.bvh / .json)',
    desc: 'Plays an uploaded .bvh or JSON motion-capture skeleton on beat',
    category: 'custom',
    tags: ['modern'],
  },
];

export interface DanceAvatarOption {
  id: DanceAvatarStyle;
  label: string;
  desc: string;
  category: 'human' | 'rig';
  tags: DanceFilterTag[];
  styleKeywords: string;
}

export const DANCE_AVATAR_OPTIONS: DanceAvatarOption[] = [
  {
    id: 'casual',
    label: 'Casual',
    desc: 'Pullover hoodie & denim',
    category: 'human',
    tags: ['modern', 'slow'],
    styleKeywords: 'hip-hop groove relaxed street chill',
  },
  {
    id: 'formal',
    label: 'Formal',
    desc: 'Evening blazer & silk trim',
    category: 'human',
    tags: ['classic', 'slow'],
    styleKeywords: 'tango waltz ballroom jazz smooth lounge',
  },
  {
    id: 'robot',
    label: 'Robot',
    desc: 'Titanium mech & core visor',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'robot pop edm electronic house dubstep',
  },
  {
    id: 'ninja',
    label: 'Ninja',
    desc: 'Stealth gi & flowing scarf',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'breakdance freeze acrobatics action street',
  },
  {
    id: 'human-dancer',
    label: 'Studio Pop',
    desc: 'Tailored jacket & shades',
    category: 'human',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'kpop pop idol funk moonwalk disco stage',
  },
  {
    id: 'human-ballerina',
    label: 'Ballerina',
    desc: 'Leotard, tutu & pointe',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'ballet contemporary lyrical pirouette waltz graceful',
  },
  {
    id: 'human-bboy',
    label: 'Street B-Boy',
    desc: 'Hoodie, joggers & cap',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'breakdance hip-hop shuffle street toprock freeze',
  },
  {
    id: 'human-diva',
    label: 'Stage Diva',
    desc: 'Flowing hair & stage glam',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'pop disco salsa afrobeat kpop performance',
  },
  {
    id: 'human-suit',
    label: 'Tuxedo Lounge',
    desc: 'Formal tux & bowtie',
    category: 'human',
    tags: ['classic', 'slow'],
    styleKeywords: 'waltz tango ballroom swing smooth formal',
  },
  {
    id: 'human-neon',
    label: 'Cyber Human',
    desc: 'Neon techwear & visor',
    category: 'human',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'shuffle house edm rave synthwave futuristic',
  },
  {
    id: 'silhouette',
    label: 'Silhouette',
    desc: 'Volumetric rim-lit human',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'contemporary lyrical minimalist shadow ambient',
  },
  {
    id: 'human-skater',
    label: 'Skater Kid',
    desc: 'Backwards cap & cargo',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'skate street hip-hop punk pop energy',
  },
  {
    id: 'human-graffiti',
    label: 'Graffiti Writer',
    desc: 'Beanie, hoodie & neon kicks',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'street urban hip-hop breakdance aerosol',
  },
  {
    id: 'human-dj',
    label: 'Club DJ',
    desc: 'Studio headphones & bomber',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'house edm club electronic mix shuffle',
  },
  {
    id: 'human-raver',
    label: 'Neon Raver',
    desc: 'Glow cuffs & LED visor',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'rave trance edm techno festival shuffle',
  },
  {
    id: 'human-kpop',
    label: 'K-Pop Idol',
    desc: 'Varsity crop & sleek visor',
    category: 'human',
    tags: ['high-energy', 'modern'],
    styleKeywords: 'kpop idol choreography pop group stage',
  },
  {
    id: 'human-tracksuit',
    label: 'Retro Track',
    desc: 'Track jacket & bucket hat',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'oldschool hip-hop funk breakdance 80s 90s',
  },
  {
    id: 'human-punk',
    label: 'Punk Rebel',
    desc: 'Spiked mohawk & leather',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'punk rock grunge metal mosh energy',
  },
  {
    id: 'human-rockstar',
    label: 'Rock Legend',
    desc: 'Open vest & stage shades',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'rock arena guitar anthem headbang classic',
  },
  {
    id: 'human-android',
    label: 'Chrome Android',
    desc: 'Mirror alloy & optic lens',
    category: 'human',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'android scifi electro robot chrome future',
  },
  {
    id: 'human-astronaut',
    label: 'Spacewalker',
    desc: 'Orbital suit & gold visor',
    category: 'human',
    tags: ['modern', 'slow'],
    styleKeywords: 'space moonwalk ambient cosmic synth scifi',
  },
  {
    id: 'human-cyborg',
    label: 'Cyborg Striker',
    desc: 'Armored chest & scanner',
    category: 'human',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'cyborg cyberpunk dubstep action synth',
  },
  {
    id: 'human-valkyrie',
    label: 'Star Valkyrie',
    desc: 'Energy wings & halo crest',
    category: 'human',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'fantasy angel wings euphoria trance epic',
  },
  {
    id: 'human-phantom',
    label: 'Stage Phantom',
    desc: 'Flowing cape & half-mask',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'dramatic opera masquerade waltz gothic cape',
  },
  {
    id: 'human-samurai',
    label: 'Cyber Ronin',
    desc: 'Armored hakama & crest',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'samurai katana martial action trap bass',
  },
  {
    id: 'human-laser-mage',
    label: 'Prism Mystic',
    desc: 'Luminous robe & star halo',
    category: 'human',
    tags: ['modern', 'slow'],
    styleKeywords: 'mystic chill ambient psytrance ethereal glow',
  },
  {
    id: 'human-mecha-pilot',
    label: 'Mecha Pilot',
    desc: 'Aero plugsuit & flight helm',
    category: 'human',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'anime mecha eurobeat future fast rhythm',
  },
  {
    id: 'human-disco',
    label: 'Disco Fever',
    desc: 'Afro, flare collar & gold',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'disco funk soul boogie 70s groove',
  },
  {
    id: 'human-synthwave',
    label: 'Synthwave Rider',
    desc: 'Outrun jacket & laser shades',
    category: 'human',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'synthwave retrowave 80s outrun neon drive',
  },
  {
    id: 'human-glam',
    label: 'Glam Star',
    desc: 'Sequined suit & star crown',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'glam pop arena disco sparkle showman',
  },
  {
    id: 'human-jazz-cat',
    label: 'Jazz Cat',
    desc: 'Pinstripe vest & fedora',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'jazz swing blues smooth moonwalk lounge',
  },
  {
    id: 'human-flapper',
    label: 'Roaring 20s',
    desc: 'Fringe dress & feather band',
    category: 'human',
    tags: ['high-energy', 'classic'],
    styleKeywords: 'swing charleston electroswing vintage gatsby',
  },
  {
    id: 'human-mariachi',
    label: 'Fiesta Charro',
    desc: 'Trimmed bolero & sombrero',
    category: 'human',
    tags: ['classic', 'high-energy'],
    styleKeywords: 'latin salsa fiesta folk vibrant festive',
  },
  {
    id: 'human-cowboy',
    label: 'Country Outlaw',
    desc: 'Fringe vest & cowboy hat',
    category: 'human',
    tags: ['classic', 'high-energy'],
    styleKeywords: 'country western linedance folk acoustic',
  },
  {
    id: 'human-matador',
    label: 'Stage Matador',
    desc: 'Gold bolero & crimson cape',
    category: 'human',
    tags: ['classic', 'high-energy'],
    styleKeywords: 'tango flamenco paso latin dramatic',
  },
  {
    id: 'human-kimono',
    label: 'Silk Kimono',
    desc: 'Obi sash & floral kimono',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'traditional japanese fan graceful silk',
  },
  {
    id: 'human-contemporary',
    label: 'Lyrical Soloist',
    desc: 'Draped tunic & barefoot',
    category: 'human',
    tags: ['slow', 'modern'],
    styleKeywords: 'contemporary modern expressive acoustic ballad',
  },
  {
    id: 'human-opera',
    label: 'Opera Prima',
    desc: 'Velvet gown & jeweled tiara',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'opera classical waltz orchestra dramatic',
  },
  {
    id: 'human-gothic',
    label: 'Dark Romantic',
    desc: 'Velvet coat & dark lace',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'goth darkwave postpunk moody nocturnal',
  },
  {
    id: 'human-monarch',
    label: 'Royal Monarch',
    desc: 'Regal cape & gold crown',
    category: 'human',
    tags: ['classic', 'slow'],
    styleKeywords: 'royal anthem orchestral grand majestic',
  },
  {
    id: 'human-zen',
    label: 'Zen Monk',
    desc: 'Flowing robe & calm aura',
    category: 'human',
    tags: ['slow', 'classic'],
    styleKeywords: 'meditation lofi ambient chill spiritual',
  },
  {
    id: 'neon-cyber',
    label: 'Neon Rig',
    desc: 'Glowing cyber wireframe',
    category: 'rig',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'edm shuffle house robot wireframe rig',
  },
  {
    id: 'holo-wire',
    label: 'Holo Mocap',
    desc: 'Optical marker skeleton',
    category: 'rig',
    tags: ['modern', 'slow'],
    styleKeywords: 'mocap bvh skeleton optical contemporary rig',
  },
  {
    id: 'minimal-rig',
    label: 'Studio Rig',
    desc: 'Clean matte rig',
    category: 'rig',
    tags: ['classic', 'slow'],
    styleKeywords: 'mocap studio reference clean rig',
  },
  {
    id: 'prism-rig',
    label: 'Prism Rig',
    desc: 'Chromatic split wireframe',
    category: 'rig',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'prism rainbow rgb glitch rig electronic',
  },
  {
    id: 'laser-frame',
    label: 'Laser Frame',
    desc: 'Razor beam & diamond rig',
    category: 'rig',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'laser vector sharp techno rave rig',
  },
  {
    id: 'chrome-doll',
    label: 'Mannequin',
    desc: 'Ball-jointed chrome doll',
    category: 'rig',
    tags: ['classic', 'slow'],
    styleKeywords: 'mannequin articulated doll sculpture rig',
  },
  {
    id: 'pulse-nodes',
    label: 'Pulse Nodes',
    desc: 'Equalizer ring joints',
    category: 'rig',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'pulse beat rings audio nodes rig',
  },
  {
    id: 'shadow-wire',
    label: 'Shadow Wire',
    desc: 'Obsidian ink & rim wire',
    category: 'rig',
    tags: ['slow', 'modern'],
    styleKeywords: 'shadow dark ink noir minimal rig',
  },
  {
    id: 'voxel-rig',
    label: 'Voxel Mech',
    desc: 'Blocky geometric rig',
    category: 'rig',
    tags: ['modern', 'high-energy'],
    styleKeywords: 'voxel pixel cube retro 8bit rig',
  },
];

export interface DanceMedleyPreset {
  id: string;
  label: string;
  desc: string;
  styles: DanceStyleKey[];
}

export const DANCE_MEDLEY_PRESETS: DanceMedleyPreset[] = [
  {
    id: 'street-mix',
    label: 'Street Mix',
    desc: 'Hip-Hop, Breakdance, Moonwalk & Shuffle',
    styles: ['hip-hop', 'mocap-breakdance', 'mocap-moonwalk', 'mocap-shuffle'],
  },
  {
    id: 'club-edm',
    label: 'Club & EDM',
    desc: 'House Jack, Melbourne Shuffle, Disco & Robot',
    styles: ['mocap-house', 'mocap-shuffle', 'mocap-disco', 'robot'],
  },
  {
    id: 'pop-idol',
    label: 'Pop Showcase',
    desc: 'K-Pop, Afrobeat, Salsa & Smooth Groove',
    styles: ['mocap-kpop', 'mocap-afrobeat', 'mocap-salsa', 'groove'],
  },
  {
    id: 'ballroom-flow',
    label: 'Ballroom & Flow',
    desc: 'Contemporary, Ballet, Tango & Waltz',
    styles: ['mocap-contemporary', 'mocap-ballet', 'mocap-tango', 'mocap-waltz'],
  },
];

export interface RenderDanceParams {
  ctx: DanceRenderCtx;
  width: number;
  height: number;
  minDim: number;
  isPortrait: boolean;
  currentTime: number;
  dt?: number;
  bass: number;
  mid: number;
  treble: number;
  beatBurst: number;
  beatTriggered: boolean;
  bpm?: number | null;
  isExport?: boolean;
  settings: StudioSettings;
  lyrics: LyricLine[];
  mocapClip?: MocapClipData | null;
  hexToRgba: (hex: string, alpha: number) => string;
}

export interface DanceStrobeTiming {
  effectiveBpm: number;
  subdivision: 1 | 2 | 4 | 8;
  subdivisionLabel: '1/4' | '1/8' | '1/16' | '1/32';
  strobeHz: number;
}

export function getDanceStrobeTiming(
  danceStrobe: number,
  bpm?: number | null
): DanceStrobeTiming {
  const effectiveBpm =
    typeof bpm === 'number' && Number.isFinite(bpm) && bpm > 0
      ? Math.max(40, Math.min(240, bpm))
      : 120;
  const clamped = Math.max(0, Math.min(1, danceStrobe));
  const subdivision: 1 | 2 | 4 | 8 =
    clamped < 0.25 ? 1 : clamped < 0.5 ? 2 : clamped < 0.75 ? 4 : 8;
  const subdivisionLabel: '1/4' | '1/8' | '1/16' | '1/32' =
    subdivision === 1
      ? '1/4'
      : subdivision === 2
      ? '1/8'
      : subdivision === 4
      ? '1/16'
      : '1/32';
  const strobeHz = (effectiveBpm / 60) * subdivision;
  return {
    effectiveBpm,
    subdivision,
    subdivisionLabel,
    strobeHz,
  };
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

interface EvaluatedPose {
  joints3D: Vec3[];
  bones: Array<[number, number]>;
  headIdx: number;
  useMocap: boolean;
  jointNames: string[] | null;
}

function evaluateStylePose(
  style: DanceStyleKey,
  currentTime: number,
  bass: number,
  mid: number,
  treble: number,
  beatDrive: number,
  danceEnergy: number,
  lyricAccent: number,
  activeLyricIdx: number,
  mocapClip: MocapClipData | null | undefined
): EvaluatedPose {
  const activeMocapClip: MocapClipData | null = isBuiltInMocapStyle(style)
    ? getBuiltInMocapClip(style)
    : style === 'mocap-custom' && mocapClip && mocapClip.frameCount > 0
    ? mocapClip
    : null;
  const useMocap = Boolean(activeMocapClip && activeMocapClip.frameCount > 0);
  const proceduralFallbackStyle: Exclude<DanceStyleKey, 'mocap-custom' | BuiltInMocapStyleKey> =
    style === 'mocap-custom' || isBuiltInMocapStyle(style) ? 'hip-hop' : style;

  const joints3D =
    useMocap && activeMocapClip
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

  return {
    joints3D,
    bones: useMocap && activeMocapClip ? activeMocapClip.bones : HUMANOID_BONES,
    headIdx: useMocap && activeMocapClip ? activeMocapClip.headJointIndex : J_HEAD,
    useMocap,
    jointNames: useMocap && activeMocapClip ? activeMocapClip.jointNames : null,
  };
}

function toCanonical17Joints(pose: EvaluatedPose): Vec3[] | null {
  if (!pose.useMocap && pose.joints3D.length === 17) {
    return pose.joints3D;
  }
  const idx = resolveHumanoidIndices(pose.jointNames, pose.joints3D.length);
  if (!idx) return null;
  const get = (i: number, fallback: Vec3): Vec3 => pose.joints3D[i] ?? fallback;
  const pelvis = get(idx.pelvis, [0, 0.9, 0]);
  const chest = get(idx.chest, [0, 1.3, 0]);
  const spine = get(idx.spine, [
    (pelvis[0] + chest[0]) * 0.5,
    (pelvis[1] + chest[1]) * 0.5,
    (pelvis[2] + chest[2]) * 0.5,
  ]);
  const neck = get(idx.neck, [chest[0], chest[1] + 0.11, chest[2]]);
  const head = get(idx.head, [neck[0], neck[1] + 0.14, neck[2]]);
  const out: Vec3[] = new Array(17);
  out[J_PELVIS] = pelvis;
  out[J_SPINE] = spine;
  out[J_CHEST] = chest;
  out[J_NECK] = neck;
  out[J_HEAD] = head;
  out[J_L_SHOULDER] = get(idx.lShoulder, [chest[0] - 0.2, chest[1] + 0.04, chest[2]]);
  out[J_L_ELBOW] = get(idx.lElbow, [chest[0] - 0.36, chest[1] - 0.12, chest[2]]);
  out[J_L_WRIST] = get(idx.lWrist, [chest[0] - 0.38, chest[1] - 0.34, chest[2]]);
  out[J_R_SHOULDER] = get(idx.rShoulder, [chest[0] + 0.2, chest[1] + 0.04, chest[2]]);
  out[J_R_ELBOW] = get(idx.rElbow, [chest[0] + 0.36, chest[1] - 0.12, chest[2]]);
  out[J_R_WRIST] = get(idx.rWrist, [chest[0] + 0.38, chest[1] - 0.34, chest[2]]);
  out[J_L_HIP] = get(idx.lHip, [pelvis[0] - 0.115, pelvis[1] - 0.04, pelvis[2]]);
  out[J_L_KNEE] = get(idx.lKnee, [pelvis[0] - 0.15, pelvis[1] * 0.52, pelvis[2]]);
  out[J_L_ANKLE] = get(idx.lAnkle, [pelvis[0] - 0.18, 0.05, pelvis[2]]);
  out[J_R_HIP] = get(idx.rHip, [pelvis[0] + 0.115, pelvis[1] - 0.04, pelvis[2]]);
  out[J_R_KNEE] = get(idx.rKnee, [pelvis[0] + 0.15, pelvis[1] * 0.52, pelvis[2]]);
  out[J_R_ANKLE] = get(idx.rAnkle, [pelvis[0] + 0.18, 0.05, pelvis[2]]);
  return out;
}

function blendEvaluatedPoses(poseA: EvaluatedPose, poseB: EvaluatedPose, rawT: number): EvaluatedPose {
  const t = Math.max(0, Math.min(1, rawT));
  const eased = t * t * (3 - 2 * t); // cubic smoothstep for natural easing
  if (eased <= 0.001) return poseA;
  if (eased >= 0.999) return poseB;

  if (
    poseA.joints3D.length === poseB.joints3D.length &&
    poseA.bones.length === poseB.bones.length &&
    poseA.headIdx === poseB.headIdx
  ) {
    const joints3D: Vec3[] = poseA.joints3D.map((ja, idx) => {
      const jb = poseB.joints3D[idx] ?? ja;
      return [
        lerp(ja[0], jb[0], eased),
        lerp(ja[1], jb[1], eased),
        lerp(ja[2], jb[2], eased),
      ];
    });
    return {
      joints3D,
      bones: eased < 0.5 ? poseA.bones : poseB.bones,
      headIdx: poseB.headIdx,
      useMocap: eased < 0.5 ? poseA.useMocap : poseB.useMocap,
      jointNames: eased < 0.5 ? poseA.jointNames : poseB.jointNames,
    };
  }

  const canonA = toCanonical17Joints(poseA);
  const canonB = toCanonical17Joints(poseB);
  if (canonA && canonB) {
    const joints3D: Vec3[] = canonA.map((ja, idx) => {
      const jb = canonB[idx] ?? ja;
      return [
        lerp(ja[0], jb[0], eased),
        lerp(ja[1], jb[1], eased),
        lerp(ja[2], jb[2], eased),
      ];
    });
    return {
      joints3D,
      bones: HUMANOID_BONES,
      headIdx: J_HEAD,
      useMocap: eased < 0.5 ? poseA.useMocap : poseB.useMocap,
      jointNames: null,
    };
  }

  return eased < 0.5 ? poseA : poseB;
}

interface MedleyBeatTrackerState {
  lastTime: number;
  lastIsExport: boolean;
  movesKey: string;
  intervalBeats: number;
  beatCount: number;
  activeIdx: number;
  fromStyle: DanceStyleKey | null;
  blendElapsed: number;
}

const medleyBeatTracker: MedleyBeatTrackerState = {
  lastTime: -1,
  lastIsExport: false,
  movesKey: '',
  intervalBeats: 8,
  beatCount: 0,
  activeIdx: 0,
  fromStyle: null,
  blendElapsed: 0,
};

function resolveMedleyTransition(
  settings: StudioSettings,
  currentTime: number,
  dt: number,
  beatTriggered: boolean,
  isExport: boolean,
  activeLyricIdx: number,
  lyrics: LyricLine[],
  mocapClip: MocapClipData | null | undefined
): {
  primaryStyle: DanceStyleKey;
  fromStyle: DanceStyleKey | null;
  blendAlpha: number;
} {
  const fallbackStyle: DanceStyleKey = settings.danceStyle ?? 'hip-hop';
  if (!settings.danceMedleyEnabled) {
    return { primaryStyle: fallbackStyle, fromStyle: null, blendAlpha: 1 };
  }

  const hasCustomMocap = Boolean(mocapClip && mocapClip.frameCount > 0);
  const rawMoves = (settings.danceMedleyStyles ?? []).filter(
    (s) => s !== 'mocap-custom' || hasCustomMocap
  );
  if (rawMoves.length === 0) {
    return { primaryStyle: fallbackStyle, fromStyle: null, blendAlpha: 1 };
  }
  if (rawMoves.length === 1) {
    return { primaryStyle: rawMoves[0], fromStyle: null, blendAlpha: 1 };
  }

  const trigger = settings.danceMedleyTrigger ?? 'beats';
  const blendDuration = Math.max(0.15, Math.min(1.5, settings.danceMedleyBlendDuration ?? 0.45));

  if (trigger === 'seconds') {
    const intervalSec = Math.max(2, Math.min(30, settings.danceMedleyIntervalSeconds ?? 8));
    const effectiveBlend = Math.min(blendDuration, intervalSec * 0.85);
    const safeTime = Math.max(0, currentTime);
    const slot = Math.floor(safeTime / intervalSec);
    const localT = safeTime - slot * intervalSec;
    const toIdx = slot % rawMoves.length;
    if (slot > 0 && localT < effectiveBlend) {
      const fromIdx = (slot - 1) % rawMoves.length;
      return {
        primaryStyle: rawMoves[toIdx],
        fromStyle: rawMoves[fromIdx],
        blendAlpha: localT / effectiveBlend,
      };
    }
    return { primaryStyle: rawMoves[toIdx], fromStyle: null, blendAlpha: 1 };
  }

  if (trigger === 'lyrics') {
    if (activeLyricIdx < 0 || lyrics.length === 0) {
      return { primaryStyle: rawMoves[0], fromStyle: null, blendAlpha: 1 };
    }
    const toIdx = activeLyricIdx % rawMoves.length;
    const cueElapsed = Math.max(0, currentTime - lyrics[activeLyricIdx].time);
    if (activeLyricIdx > 0 && cueElapsed < blendDuration) {
      const fromIdx = (activeLyricIdx - 1) % rawMoves.length;
      return {
        primaryStyle: rawMoves[toIdx],
        fromStyle: rawMoves[fromIdx],
        blendAlpha: cueElapsed / blendDuration,
      };
    }
    return { primaryStyle: rawMoves[toIdx], fromStyle: null, blendAlpha: 1 };
  }

  // 'beats' trigger mode
  const intervalBeats = Math.max(2, Math.min(32, Math.round(settings.danceMedleyIntervalBeats ?? 8)));
  const movesKey = rawMoves.join('|');
  const jumpedOrReset =
    medleyBeatTracker.lastIsExport !== isExport ||
    medleyBeatTracker.movesKey !== movesKey ||
    medleyBeatTracker.intervalBeats !== intervalBeats ||
    medleyBeatTracker.lastTime < 0 ||
    currentTime < medleyBeatTracker.lastTime - 0.08 ||
    Math.abs(currentTime - medleyBeatTracker.lastTime) > 1.25;

  if (jumpedOrReset) {
    medleyBeatTracker.lastIsExport = isExport;
    medleyBeatTracker.movesKey = movesKey;
    medleyBeatTracker.intervalBeats = intervalBeats;
    medleyBeatTracker.beatCount = 0;
    medleyBeatTracker.activeIdx = 0;
    medleyBeatTracker.fromStyle = null;
    medleyBeatTracker.blendElapsed = 0;
  }

  const safeDt = currentTime === medleyBeatTracker.lastTime ? 0 : Math.max(0, Math.min(0.25, dt));
  medleyBeatTracker.lastTime = currentTime;

  if (beatTriggered) {
    medleyBeatTracker.beatCount += 1;
    const nextIdx = Math.floor(medleyBeatTracker.beatCount / intervalBeats) % rawMoves.length;
    if (nextIdx !== medleyBeatTracker.activeIdx) {
      medleyBeatTracker.fromStyle = rawMoves[medleyBeatTracker.activeIdx] ?? rawMoves[0];
      medleyBeatTracker.activeIdx = nextIdx;
      medleyBeatTracker.blendElapsed = 0;
    }
  }

  if (medleyBeatTracker.fromStyle !== null) {
    medleyBeatTracker.blendElapsed += safeDt;
    if (medleyBeatTracker.blendElapsed >= blendDuration) {
      medleyBeatTracker.fromStyle = null;
      medleyBeatTracker.blendElapsed = 0;
    }
  }

  const activeStyle = rawMoves[medleyBeatTracker.activeIdx % rawMoves.length];
  if (medleyBeatTracker.fromStyle && medleyBeatTracker.fromStyle !== activeStyle) {
    return {
      primaryStyle: activeStyle,
      fromStyle: medleyBeatTracker.fromStyle,
      blendAlpha: Math.max(0, Math.min(1, medleyBeatTracker.blendElapsed / blendDuration)),
    };
  }

  return { primaryStyle: activeStyle, fromStyle: null, blendAlpha: 1 };
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

  if (spotlightFactor !== undefined && (spotlightFactor < 0.98 || spotlightFactor > 1.02)) {
    if (spotlightFactor < 0.98) {
      const dimAlpha = Math.min(0.62, (1 - spotlightFactor) * 0.62);
      ctx.fillStyle = `rgba(3, 5, 12, ${dimAlpha.toFixed(3)})`;
      ctx.fill();
    } else {
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
  | 'silhouette'
  | 'human-skater'
  | 'human-graffiti'
  | 'human-dj'
  | 'human-raver'
  | 'human-kpop'
  | 'human-tracksuit'
  | 'human-punk'
  | 'human-rockstar'
  | 'human-android'
  | 'human-astronaut'
  | 'human-cyborg'
  | 'human-valkyrie'
  | 'human-phantom'
  | 'human-samurai'
  | 'human-laser-mage'
  | 'human-mecha-pilot'
  | 'human-disco'
  | 'human-synthwave'
  | 'human-glam'
  | 'human-jazz-cat'
  | 'human-flapper'
  | 'human-mariachi'
  | 'human-cowboy'
  | 'human-matador'
  | 'human-kimono'
  | 'human-contemporary'
  | 'human-opera'
  | 'human-gothic'
  | 'human-monarch'
  | 'human-zen';

type ColorToken = 'primary' | 'secondary' | string;

type TorsoStyle =
  | 'silhouette'
  | 'reactor'
  | 'cyber-core'
  | 'ninja'
  | 'hoodie'
  | 'bboy'
  | 'tux-tie'
  | 'tux-bow'
  | 'pinstripe'
  | 'tutu'
  | 'diva-belt'
  | 'lapel'
  | 'neon-seam'
  | 'track-stripe'
  | 'armor-plate'
  | 'kimono'
  | 'bolero'
  | 'cape'
  | 'wings'
  | 'punk-studs';

type HeadgearStyle =
  | 'none'
  | 'cap'
  | 'beanie'
  | 'bucket-hat'
  | 'bun'
  | 'afro'
  | 'mohawk'
  | 'fedora'
  | 'cowboy'
  | 'sombrero'
  | 'crown'
  | 'halo'
  | 'headphones'
  | 'robot-ears'
  | 'hood-cowl'
  | 'helmet'
  | 'bandeau-feather'
  | 'samurai-crest'
  | 'sculpted';

type EyewearStyle =
  | 'none'
  | 'eyes'
  | 'expressive'
  | 'shades'
  | 'visor'
  | 'neon-visor'
  | 'cyber-eye'
  | 'half-mask'
  | 'ninja-slit';

interface HumanAvatarProfile {
  skin: [ColorToken, ColorToken, ColorToken];
  jacket: [ColorToken, ColorToken, ColorToken];
  pants: [ColorToken, ColorToken, ColorToken];
  shoe: [ColorToken, ColorToken, ColorToken];
  hairColor?: ColorToken;
  sleeveless?: boolean;
  isSilhouette?: boolean;
  isNeonFrame?: boolean;
  rimBase?: number;
  rimBeat?: number;
  armScale?: number;
  legScale?: number;
  kneeScale?: number;
  ankleScale?: number;
  shoulderExt?: number;
  waistScale?: number;
  hipScale?: number;
  minTorsoMult?: number;
  neckMult?: number;
  headMult?: number;
  toeTipMult?: number;
  shoeAnkleMult?: number;
  torsoStyle: TorsoStyle;
  headgear: HeadgearStyle;
  eyewear: EyewearStyle;
  backLayer?: 'none' | 'diva-hair' | 'cape' | 'wings' | 'kimono-collar';
  lipColor?: ColorToken;
  accentColor?: ColorToken;
}

const HUMAN_AVATAR_PROFILES: Record<HumanAvatarStyle, HumanAvatarProfile> = {
  silhouette: {
    skin: ['#0b101b', '#080c15', '#05080f'],
    jacket: ['#0d1320', '#080c15', '#05080f'],
    pants: ['#0c111d', '#080c15', '#05080f'],
    shoe: ['#0c111d', '#080c15', '#04060b'],
    isSilhouette: true,
    rimBase: 0.56,
    rimBeat: 0.32,
    torsoStyle: 'silhouette',
    headgear: 'none',
    eyewear: 'none',
  },
  robot: {
    skin: ['#e2e8f0', '#94a3b8', '#475569'],
    jacket: ['#cbd5e1', '#64748b', '#1e293b'],
    pants: ['#94a3b8', '#475569', '#1e293b'],
    shoe: ['#cbd5e1', 'primary', '#090d16'],
    rimBase: 0.72,
    rimBeat: 0.22,
    torsoStyle: 'reactor',
    headgear: 'robot-ears',
    eyewear: 'visor',
  },
  ninja: {
    skin: ['#1f2937', '#111827', '#030712'],
    jacket: ['#27272a', '#18181b', '#09090b'],
    pants: ['#27272a', '#18181b', '#09090b'],
    shoe: ['#27272a', '#09090b', '#090d16'],
    rimBase: 0.5,
    rimBeat: 0.26,
    torsoStyle: 'ninja',
    headgear: 'hood-cowl',
    eyewear: 'ninja-slit',
  },
  casual: {
    skin: ['#f0c4a8', '#d8a07e', '#b47b5c'],
    jacket: ['primary', '#475569', '#1e293b'],
    pants: ['#60a5fa', '#2563eb', '#1e3a8a'],
    shoe: ['#ffffff', '#e2e8f0', '#090d16'],
    hairColor: '#3f2e22',
    torsoStyle: 'hoodie',
    headgear: 'sculpted',
    eyewear: 'eyes',
  },
  formal: {
    skin: ['#ecc1a4', '#d5a181', '#aa7659'],
    jacket: ['#334155', '#1e293b', '#020617'],
    pants: ['#1e293b', '#0f172a', '#020617'],
    shoe: ['#334155', '#090d16', '#090d16'],
    hairColor: '#1e1b18',
    torsoStyle: 'tux-tie',
    headgear: 'sculpted',
    eyewear: 'eyes',
  },
  'human-dancer': {
    skin: ['#f2c1a2', '#dfa584', '#b7795b'],
    jacket: ['#f8fafc', '#cbd5e1', '#64748b'],
    pants: ['#334155', '#1e293b', '#0f172a'],
    shoe: ['#f8fafc', '#cbd5e1', '#090d16'],
    hairColor: '#18181b',
    torsoStyle: 'lapel',
    headgear: 'sculpted',
    eyewear: 'shades',
  },
  'human-ballerina': {
    skin: ['#f7d5c2', '#e6b8a0', '#c99379'],
    jacket: ['#fce7f3', 'primary', '#831843'],
    pants: ['#fde8f0', '#f5cad9', '#d9a4b7'],
    shoe: ['#fbcfe8', '#f472b6', '#be185d'],
    hairColor: '#271a14',
    sleeveless: true,
    armScale: 0.78,
    legScale: 0.84,
    ankleScale: 0.78,
    shoulderExt: 0.08,
    waistScale: 0.27,
    minTorsoMult: 0.056,
    neckMult: 0.68,
    headMult: 0.064,
    toeTipMult: 0.56,
    torsoStyle: 'tutu',
    headgear: 'bun',
    eyewear: 'expressive',
    lipColor: '#ec4899',
  },
  'human-bboy': {
    skin: ['#c78c6a', '#a76e4e', '#7d4d34'],
    jacket: ['#374151', '#1f2937', '#111827'],
    pants: ['#334155', '#1e293b', '#0f172a'],
    shoe: ['#f8fafc', 'primary', '#090d16'],
    armScale: 1.14,
    legScale: 1.18,
    kneeScale: 1.24,
    ankleScale: 1.16,
    shoulderExt: 0.19,
    waistScale: 0.42,
    hipScale: 1.02,
    minTorsoMult: 0.075,
    shoeAnkleMult: 1.18,
    torsoStyle: 'bboy',
    headgear: 'cap',
    eyewear: 'shades',
  },
  'human-diva': {
    skin: ['#b57452', '#95583a', '#6c3c25'],
    jacket: ['#f8fafc', 'secondary', '#31102f'],
    pants: ['#3b2454', '#221436', '#0d0718'],
    shoe: ['#f8fafc', 'secondary', '#090d16'],
    hairColor: '#140c1c',
    sleeveless: true,
    rimBase: 0.48,
    rimBeat: 0.28,
    armScale: 0.82,
    legScale: 0.92,
    waistScale: 0.27,
    minTorsoMult: 0.056,
    neckMult: 0.68,
    headMult: 0.064,
    torsoStyle: 'diva-belt',
    headgear: 'sculpted',
    eyewear: 'expressive',
    backLayer: 'diva-hair',
    lipColor: 'secondary',
  },
  'human-suit': {
    skin: ['#ecc1a4', '#d5a181', '#aa7659'],
    jacket: ['#1f2937', '#0f172a', '#020617'],
    pants: ['#1e293b', '#0f172a', '#020617'],
    shoe: ['#334155', '#090d16', '#090d16'],
    hairColor: '#1e1b18',
    torsoStyle: 'tux-bow',
    headgear: 'sculpted',
    eyewear: 'eyes',
  },
  'human-neon': {
    skin: ['#d6a488', '#b98366', '#8f5f47'],
    jacket: ['#1f293b', '#111827', '#070b12'],
    pants: ['#1e2436', '#121622', '#090c14'],
    shoe: ['#f8fafc', 'primary', '#090d16'],
    hairColor: '#090d16',
    isNeonFrame: true,
    rimBase: 0.68,
    rimBeat: 0.24,
    torsoStyle: 'neon-seam',
    headgear: 'sculpted',
    eyewear: 'neon-visor',
  },
  // 30 New Human Personas
  'human-skater': {
    skin: ['#f0c1a0', '#d69d79', '#ad7354'],
    jacket: ['#fde047', '#eab308', '#854d0e'],
    pants: ['#57534e', '#44403c', '#1c1917'],
    shoe: ['#ffffff', '#ef4444', '#090d16'],
    armScale: 1.05,
    legScale: 1.12,
    kneeScale: 1.16,
    shoulderExt: 0.16,
    waistScale: 0.38,
    torsoStyle: 'bboy',
    headgear: 'cap',
    eyewear: 'shades',
  },
  'human-graffiti': {
    skin: ['#c48866', '#a26849', '#77472e'],
    jacket: ['secondary', '#312e81', '#1e1b4b'],
    pants: ['#1e293b', '#0f172a', '#020617'],
    shoe: ['#f8fafc', 'primary', '#090d16'],
    armScale: 1.08,
    legScale: 1.14,
    shoulderExt: 0.17,
    waistScale: 0.39,
    torsoStyle: 'hoodie',
    headgear: 'beanie',
    eyewear: 'half-mask',
  },
  'human-dj': {
    skin: ['#b87a58', '#985d3e', '#6d3f27'],
    jacket: ['#1e293b', 'primary', '#090d16'],
    pants: ['#18181b', '#09090b', '#020617'],
    shoe: ['#e2e8f0', 'secondary', '#090d16'],
    hairColor: '#09090b',
    rimBase: 0.5,
    rimBeat: 0.24,
    torsoStyle: 'track-stripe',
    headgear: 'headphones',
    eyewear: 'neon-visor',
  },
  'human-raver': {
    skin: ['#eabaa0', '#cf9677', '#a36e51'],
    jacket: ['#0f172a', 'secondary', '#05080f'],
    pants: ['#1e1b4b', '#0f172a', '#020617'],
    shoe: ['#f8fafc', 'primary', '#090d16'],
    hairColor: 'primary',
    sleeveless: true,
    isNeonFrame: true,
    rimBase: 0.72,
    rimBeat: 0.26,
    armScale: 0.9,
    torsoStyle: 'diva-belt',
    headgear: 'headphones',
    eyewear: 'neon-visor',
  },
  'human-kpop': {
    skin: ['#f6d4c0', '#e3b69d', '#c49074'],
    jacket: ['primary', '#f8fafc', '#1e293b'],
    pants: ['#18181b', '#09090b', '#020617'],
    shoe: ['#ffffff', 'secondary', '#090d16'],
    hairColor: '#3b82f6',
    armScale: 0.92,
    legScale: 0.94,
    waistScale: 0.3,
    torsoStyle: 'lapel',
    headgear: 'sculpted',
    eyewear: 'neon-visor',
  },
  'human-tracksuit': {
    skin: ['#b57452', '#95583a', '#6c3c25'],
    jacket: ['#ef4444', '#b91c1c', '#450a0a'],
    pants: ['#ef4444', '#991b1b', '#450a0a'],
    shoe: ['#ffffff', '#f8fafc', '#1e293b'],
    armScale: 1.08,
    legScale: 1.1,
    shoulderExt: 0.16,
    waistScale: 0.38,
    torsoStyle: 'track-stripe',
    headgear: 'bucket-hat',
    eyewear: 'shades',
  },
  'human-punk': {
    skin: ['#f3cbb4', '#dda88c', '#b47f64'],
    jacket: ['#27272a', '#18181b', '#09090b'],
    pants: ['#991b1b', '#450a0a', '#18181b'],
    shoe: ['#27272a', '#09090b', '#020617'],
    hairColor: '#ef4444',
    torsoStyle: 'punk-studs',
    headgear: 'mohawk',
    eyewear: 'eyes',
  },
  'human-rockstar': {
    skin: ['#ecc0a3', '#d29c7b', '#a87153'],
    jacket: ['#3f3f46', '#18181b', '#09090b'],
    pants: ['#27272a', '#18181b', '#09090b'],
    shoe: ['#3f3f46', '#09090b', '#020617'],
    hairColor: '#18181b',
    sleeveless: true,
    backLayer: 'diva-hair',
    torsoStyle: 'lapel',
    headgear: 'sculpted',
    eyewear: 'shades',
  },
  'human-android': {
    skin: ['#f8fafc', '#cbd5e1', '#64748b'],
    jacket: ['#e2e8f0', '#94a3b8', '#334155'],
    pants: ['#cbd5e1', '#64748b', '#1e293b'],
    shoe: ['#f8fafc', 'secondary', '#1e293b'],
    rimBase: 0.7,
    rimBeat: 0.24,
    torsoStyle: 'cyber-core',
    headgear: 'robot-ears',
    eyewear: 'cyber-eye',
  },
  'human-astronaut': {
    skin: ['#f1f5f9', '#cbd5e1', '#64748b'],
    jacket: ['#f8fafc', '#e2e8f0', '#94a3b8'],
    pants: ['#f8fafc', '#cbd5e1', '#64748b'],
    shoe: ['#cbd5e1', '#475569', '#0f172a'],
    armScale: 1.15,
    legScale: 1.15,
    shoulderExt: 0.18,
    waistScale: 0.4,
    torsoStyle: 'armor-plate',
    headgear: 'helmet',
    eyewear: 'visor',
    accentColor: '#f59e0b',
  },
  'human-cyborg': {
    skin: ['#d8a98e', '#b68468', '#875b44'],
    jacket: ['#334155', '#1e293b', '#090d16'],
    pants: ['#1e293b', '#0f172a', '#020617'],
    shoe: ['#64748b', 'primary', '#090d16'],
    hairColor: '#0f172a',
    rimBase: 0.65,
    rimBeat: 0.25,
    torsoStyle: 'cyber-core',
    headgear: 'sculpted',
    eyewear: 'cyber-eye',
  },
  'human-valkyrie': {
    skin: ['#f6d4c2', '#e4b7a0', '#c28d73'],
    jacket: ['#fef3c7', 'primary', '#78350f'],
    pants: ['#f8fafc', '#cbd5e1', '#64748b'],
    shoe: ['#fef3c7', '#f59e0b', '#78350f'],
    hairColor: '#fef08a',
    sleeveless: true,
    isNeonFrame: true,
    rimBase: 0.72,
    rimBeat: 0.24,
    armScale: 0.86,
    legScale: 0.9,
    waistScale: 0.28,
    torsoStyle: 'wings',
    headgear: 'halo',
    eyewear: 'expressive',
    backLayer: 'wings',
    lipColor: '#fb7185',
  },
  'human-phantom': {
    skin: ['#f1f5f9', '#cbd5e1', '#64748b'],
    jacket: ['#1e1b4b', '#0f172a', '#020617'],
    pants: ['#18181b', '#09090b', '#020617'],
    shoe: ['#27272a', '#09090b', '#020617'],
    rimBase: 0.48,
    rimBeat: 0.22,
    torsoStyle: 'cape',
    headgear: 'hood-cowl',
    eyewear: 'half-mask',
    backLayer: 'cape',
  },
  'human-samurai': {
    skin: ['#e8bba0', '#cb987a', '#9f6e52'],
    jacket: ['#991b1b', '#450a0a', '#18181b'],
    pants: ['#18181b', '#09090b', '#020617'],
    shoe: ['#27272a', '#09090b', '#020617'],
    armScale: 1.08,
    legScale: 1.15,
    shoulderExt: 0.2,
    torsoStyle: 'armor-plate',
    headgear: 'samurai-crest',
    eyewear: 'eyes',
    accentColor: '#fbbf24',
  },
  'human-laser-mage': {
    skin: ['#e6c5b3', '#c89f8a', '#9c7461'],
    jacket: ['#312e81', 'primary', '#0f172a'],
    pants: ['#1e1b4b', '#0f172a', '#020617'],
    shoe: ['#cbd5e1', 'secondary', '#090d16'],
    hairColor: '#e2e8f0',
    isNeonFrame: true,
    rimBase: 0.74,
    rimBeat: 0.24,
    torsoStyle: 'neon-seam',
    headgear: 'halo',
    eyewear: 'eyes',
    backLayer: 'cape',
  },
  'human-mecha-pilot': {
    skin: ['#f2c5aa', '#d9a184', '#ae765a'],
    jacket: ['#f8fafc', 'secondary', '#1e293b'],
    pants: ['#f1f5f9', 'primary', '#0f172a'],
    shoe: ['#f8fafc', 'primary', '#090d16'],
    rimBase: 0.65,
    rimBeat: 0.25,
    armScale: 0.9,
    legScale: 0.94,
    torsoStyle: 'cyber-core',
    headgear: 'robot-ears',
    eyewear: 'visor',
  },
  'human-disco': {
    skin: ['#a46543', '#844a2c', '#5a2f19'],
    jacket: ['#fef08a', '#eab308', '#713f12'],
    pants: ['#f8fafc', '#cbd5e1', '#64748b'],
    shoe: ['#fef08a', '#ca8a04', '#422006'],
    hairColor: '#18181b',
    legScale: 1.12,
    kneeScale: 1.18,
    ankleScale: 1.24,
    torsoStyle: 'lapel',
    headgear: 'afro',
    eyewear: 'shades',
  },
  'human-synthwave': {
    skin: ['#eebda2', '#d2997c', '#a66d52'],
    jacket: ['#f472b6', '#9d174d', '#31102f'],
    pants: ['#1e1b4b', '#0f172a', '#020617'],
    shoe: ['#f472b6', '#22d3ee', '#090d16'],
    hairColor: '#0f172a',
    rimBase: 0.66,
    rimBeat: 0.26,
    torsoStyle: 'lapel',
    headgear: 'sculpted',
    eyewear: 'shades',
  },
  'human-glam': {
    skin: ['#f3cab3', '#dba588', '#b1795e'],
    jacket: ['#fae8ff', 'primary', '#4a044e'],
    pants: ['#f0abfc', 'secondary', '#4a044e'],
    shoe: ['#f8fafc', '#e879f9', '#701a75'],
    hairColor: '#fcd34d',
    armScale: 0.88,
    waistScale: 0.29,
    torsoStyle: 'diva-belt',
    headgear: 'crown',
    eyewear: 'expressive',
    lipColor: '#db2777',
  },
  'human-jazz-cat': {
    skin: ['#9c5e3e', '#7c4529', '#542c17'],
    jacket: ['#475569', '#1e293b', '#090d16'],
    pants: ['#334155', '#1e293b', '#090d16'],
    shoe: ['#f8fafc', '#18181b', '#020617'],
    torsoStyle: 'pinstripe',
    headgear: 'fedora',
    eyewear: 'shades',
  },
  'human-flapper': {
    skin: ['#f5d2be', '#dfb096', '#ba856a'],
    jacket: ['#fef08a', '#eab308', '#713f12'],
    pants: ['#fde047', '#ca8a04', '#713f12'],
    shoe: ['#fef08a', '#ca8a04', '#422006'],
    hairColor: '#1c1917',
    sleeveless: true,
    armScale: 0.8,
    legScale: 0.86,
    waistScale: 0.28,
    torsoStyle: 'tutu',
    headgear: 'bandeau-feather',
    eyewear: 'expressive',
    lipColor: '#dc2626',
  },
  'human-mariachi': {
    skin: ['#d9a07e', '#b97e5c', '#8b573b'],
    jacket: ['#18181b', '#09090b', '#020617'],
    pants: ['#18181b', '#09090b', '#020617'],
    shoe: ['#27272a', '#09090b', '#020617'],
    torsoStyle: 'bolero',
    headgear: 'sombrero',
    eyewear: 'eyes',
    accentColor: '#fbbf24',
  },
  'human-cowboy': {
    skin: ['#e8b698', '#cb9272', '#9d684c'],
    jacket: ['#b45309', '#78350f', '#451a03'],
    pants: ['#3b82f6', '#1d4ed8', '#1e3a8a'],
    shoe: ['#92400e', '#451a03', '#1c1917'],
    torsoStyle: 'bolero',
    headgear: 'cowboy',
    eyewear: 'eyes',
    accentColor: '#f59e0b',
  },
  'human-matador': {
    skin: ['#e5b293', '#c78e6e', '#996449'],
    jacket: ['#dc2626', '#991b1b', '#450a0a'],
    pants: ['#dc2626', '#7f1d1d', '#450a0a'],
    shoe: ['#18181b', '#09090b', '#020617'],
    hairColor: '#18181b',
    torsoStyle: 'bolero',
    headgear: 'sculpted',
    eyewear: 'eyes',
    backLayer: 'cape',
    accentColor: '#fbbf24',
  },
  'human-kimono': {
    skin: ['#f6d8c7', '#e5bba4', '#c59279'],
    jacket: ['#fda4af', 'primary', '#881337'],
    pants: ['#fb7185', '#e11d48', '#881337'],
    shoe: ['#ffffff', '#cbd5e1', '#475569'],
    hairColor: '#18181b',
    armScale: 1.1,
    legScale: 1.08,
    waistScale: 0.34,
    torsoStyle: 'kimono',
    headgear: 'bun',
    eyewear: 'expressive',
    lipColor: '#e11d48',
  },
  'human-contemporary': {
    skin: ['#ecc1a4', '#d5a181', '#aa7659'],
    jacket: ['#f8fafc', '#e2e8f0', '#94a3b8'],
    pants: ['#f1f5f9', '#cbd5e1', '#64748b'],
    shoe: ['#ecc1a4', '#d5a181', '#aa7659'],
    hairColor: '#451a03',
    sleeveless: true,
    armScale: 0.86,
    legScale: 0.9,
    waistScale: 0.29,
    torsoStyle: 'diva-belt',
    headgear: 'sculpted',
    eyewear: 'eyes',
  },
  'human-opera': {
    skin: ['#f7d6c4', '#e5b9a1', '#c79278'],
    jacket: ['#7f1d1d', '#450a0a', '#18181b'],
    pants: ['#991b1b', '#450a0a', '#18181b'],
    shoe: ['#fef08a', '#ca8a04', '#422006'],
    hairColor: '#1c1917',
    armScale: 0.84,
    waistScale: 0.27,
    torsoStyle: 'tutu',
    headgear: 'crown',
    eyewear: 'expressive',
    backLayer: 'diva-hair',
    lipColor: '#be123c',
  },
  'human-gothic': {
    skin: ['#f1e4e8', '#d6c3cb', '#a8919c'],
    jacket: ['#27272a', '#18181b', '#050507'],
    pants: ['#18181b', '#09090b', '#020617'],
    shoe: ['#18181b', '#09090b', '#020617'],
    hairColor: '#09090b',
    torsoStyle: 'cape',
    headgear: 'sculpted',
    eyewear: 'half-mask',
    backLayer: 'cape',
    lipColor: '#881337',
  },
  'human-monarch': {
    skin: ['#d9a282', '#ba8060', '#8d593e'],
    jacket: ['#6d28d9', '#4c1d95', '#1e1b4b'],
    pants: ['#312e81', '#1e1b4b', '#090d16'],
    shoe: ['#fbbf24', '#b45309', '#451a03'],
    hairColor: '#18181b',
    torsoStyle: 'cape',
    headgear: 'crown',
    eyewear: 'eyes',
    backLayer: 'cape',
    accentColor: '#fbbf24',
  },
  'human-zen': {
    skin: ['#e8baa0', '#ca9679', '#9f6c51'],
    jacket: ['#fb923c', '#c2410c', '#7c2d12'],
    pants: ['#ea580c', '#9a3412', '#431407'],
    shoe: ['#f8fafc', '#cbd5e1', '#64748b'],
    rimBase: 0.44,
    rimBeat: 0.2,
    torsoStyle: 'kimono',
    headgear: 'none',
    eyewear: 'eyes',
  },
};

function isHumanAvatarStyle(style: DanceAvatarStyle): style is HumanAvatarStyle {
  return style in HUMAN_AVATAR_PROFILES;
}

function resolveColorToken(
  token: ColorToken,
  primaryColor: string,
  secondaryColor: string
): string {
  if (token === 'primary') return primaryColor;
  if (token === 'secondary') return secondaryColor;
  return token;
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

  const profile = HUMAN_AVATAR_PROFILES[avatarStyle] ?? HUMAN_AVATAR_PROFILES['human-dancer'];
  const isSil = Boolean(profile.isSilhouette);
  const isNeonFrame = Boolean(profile.isNeonFrame);
  const res = (tok: ColorToken) => resolveColorToken(tok, primaryColor, secondaryColor);

  const skinLight = res(profile.skin[0]);
  const skinMid = res(profile.skin[1]);
  const skinDark = res(profile.skin[2]);

  const jacketLight = res(profile.jacket[0]);
  const jacketMid = res(profile.jacket[1]);
  const jacketDark = res(profile.jacket[2]);

  const sleeveLight = profile.sleeveless ? skinLight : jacketLight;
  const sleeveMid = profile.sleeveless ? skinMid : jacketMid;
  const sleeveDark = profile.sleeveless ? skinDark : jacketDark;

  const pantsLight = res(profile.pants[0]);
  const pantsMid = res(profile.pants[1]);
  const pantsDark = res(profile.pants[2]);

  const shoeLight = res(profile.shoe[0]);
  const shoeMid = res(profile.shoe[1]);
  const shoeDark = res(profile.shoe[2]);

  const hairColor = res(profile.hairColor ?? '#18181b');
  const accentColor = res(profile.accentColor ?? primaryColor);

  const rimSpotBoost = Math.min(0.28, spotlightIntensity * 0.14);
  const rimBaseAlpha =
    (profile.rimBase ?? 0.34) + beatDrive * (profile.rimBeat ?? 0.2);
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
  const armWidthScale = profile.armScale ?? 1.0;
  const legWidthScale = profile.legScale ?? 1.0;
  const upperArmR = baseUnit * 0.92 * armWidthScale;
  const elbowR = baseUnit * 0.78 * armWidthScale;
  const wristR = baseUnit * 0.56 * armWidthScale;
  const thighR = baseUnit * 1.46 * legWidthScale;
  const kneeR = baseUnit * 1.06 * (profile.kneeScale ?? legWidthScale);
  const ankleR = baseUnit * 0.72 * (profile.ankleScale ?? 1.0);
  const neckR = baseUnit * (profile.neckMult ?? 0.78);
  const headR = charHeight * (profile.headMult ?? 0.068);
  const shoeAnkleMult = profile.shoeAnkleMult ?? 1.05;
  const toeTipMult = profile.toeTipMult ?? 0.78;

  interface RenderPart {
    z: number;
    draw: () => void;
  }
  const parts: RenderPart[] = [];

  // Optional back-layered cape or wings behind torso & arms
  if (profile.backLayer === 'cape' || profile.backLayer === 'wings') {
    parts.push({
      z: Math.min(pPelvis.z, pChest.z) - (faceZ >= 0 ? 0.14 : -0.14),
      draw: () => {
        ctx.save();
        const shMidX = (pLSh.x + pRSh.x) * 0.5;
        const shMidY = (pLSh.y + pRSh.y) * 0.5;
        const sway = Math.sin(currentTime * 3.4) * charHeight * 0.035 - faceX * charHeight * 0.04;
        if (profile.backLayer === 'wings') {
          const wingSpread = charHeight * (0.28 + beatDrive * 0.05);
          const wingTop = shMidY - charHeight * 0.14;
          const wingMid = shMidY + charHeight * 0.06;
          ctx.shadowColor = rimLightColor;
          ctx.shadowBlur = Math.max(8, charHeight * 0.035);
          const drawWing = (dir: -1 | 1) => {
            const wGrad = ctx.createLinearGradient(
              shMidX,
              shMidY,
              shMidX + dir * wingSpread,
              wingTop
            );
            wGrad.addColorStop(0, hexToRgba('#ffffff', 0.85));
            wGrad.addColorStop(0.55, hexToRgba(primaryColor, 0.7));
            wGrad.addColorStop(1, hexToRgba(secondaryColor, 0.28));
            ctx.fillStyle = wGrad;
            ctx.strokeStyle = hexToRgba('#ffffff', 0.65);
            ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
            ctx.beginPath();
            ctx.moveTo(shMidX + dir * charHeight * 0.02, shMidY);
            ctx.quadraticCurveTo(
              shMidX + dir * wingSpread * 0.65,
              wingTop - charHeight * 0.05,
              shMidX + dir * wingSpread + sway * 0.4,
              wingTop + charHeight * 0.02
            );
            ctx.quadraticCurveTo(
              shMidX + dir * wingSpread * 0.72 + sway * 0.3,
              wingMid,
              shMidX + dir * charHeight * 0.04,
              pPelvis.y + charHeight * 0.02
            );
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          };
          drawWing(-1);
          drawWing(1);
        } else {
          // Flowing stage/royal cape
          const capeColorA = jacketMid;
          const capeColorB =
            avatarStyle === 'human-matador'
              ? '#991b1b'
              : avatarStyle === 'human-monarch'
              ? '#4c1d95'
              : '#09090b';
          const cGrad = ctx.createLinearGradient(shMidX, shMidY, shMidX + sway, pAnkMidY());
          cGrad.addColorStop(0, capeColorA);
          cGrad.addColorStop(1, capeColorB);
          ctx.fillStyle = cGrad;
          ctx.strokeStyle = hexToRgba(
            avatarStyle === 'human-monarch' || avatarStyle === 'human-matador'
              ? accentColor
              : rimLightColor,
            0.48
          );
          ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
          ctx.beginPath();
          ctx.moveTo(pLSh.x, pLSh.y);
          ctx.lineTo(pRSh.x, pRSh.y);
          ctx.quadraticCurveTo(
            pRSh.x + charHeight * 0.09 + sway * 0.6,
            pPelvis.y + charHeight * 0.14,
            pRSh.x + charHeight * 0.14 + sway,
            pAnkMidY()
          );
          ctx.quadraticCurveTo(
            shMidX + sway,
            pAnkMidY() + charHeight * 0.03,
            pLSh.x - charHeight * 0.14 + sway,
            pAnkMidY()
          );
          ctx.quadraticCurveTo(
            pLSh.x - charHeight * 0.09 + sway * 0.6,
            pPelvis.y + charHeight * 0.14,
            pLSh.x,
            pLSh.y
          );
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        ctx.restore();
      },
    });
  }

  function pAnkMidY(): number {
    return Math.min(floorY - charHeight * 0.04, (pLAnk.y + pRAnk.y) * 0.5);
  }

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
        ankleR * shoeAnkleMult * pLAnk.scale,
        pLToe.x,
        pLToe.y,
        ankleR * toeTipMult * pLToe.scale,
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
        ankleR * shoeAnkleMult * pRAnk.scale,
        pRToe.x,
        pRToe.y,
        ankleR * toeTipMult * pRToe.scale,
        shoeLight,
        shoeMid,
        shoeDark,
        isSil ? rimColor : undefined,
        capsuleRimColor,
        spotlightIntensity
      );
    },
  });

  // Sculpted Torso, Pelvis & Persona Wardrobe Details
  parts.push({
    z: (pPelvis.z + pChest.z) * 0.5,
    draw: () => {
      const shSpan = Math.hypot(pRSh.x - pLSh.x, pRSh.y - pLSh.y);
      const minTorsoW = charHeight * (profile.minTorsoMult ?? 0.065);
      const shoulderExt = profile.shoulderExt ?? 0.14;
      const lShOutX = pLSh.x - (pRSh.x - pLSh.x) * shoulderExt;
      const rShOutX = pRSh.x + (pRSh.x - pLSh.x) * shoulderExt;
      const waistW = Math.max(minTorsoW, shSpan * (profile.waistScale ?? 0.34));
      const waistMidX = pSpine ? pSpine.x : (pPelvis.x + pChest.x) * 0.5;
      const waistMidY = pSpine ? pSpine.y : (pPelvis.y + pChest.y) * 0.5;

      const hipMidX = pPelvis.x;
      const hipMidY = pPelvis.y + charHeight * 0.02;
      const hipSpan = Math.max(
        minTorsoW * 1.05,
        Math.hypot(pRHip.x - pLHip.x, pRHip.y - pLHip.y) * (profile.hipScale ?? 0.85)
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

      if (!isSil && !isNeonFrame) {
        ctx.save();
        ctx.shadowColor = rimLightColor;
        ctx.shadowBlur = Math.max(4, charHeight * (0.014 + spotlightIntensity * 0.012));
        ctx.strokeStyle = capsuleRimColor;
        ctx.lineWidth = Math.max(1.2, charHeight * 0.0048);
        ctx.stroke();
        ctx.restore();
      }

      const tStyle = profile.torsoStyle;
      if (tStyle === 'neon-seam') {
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
      } else if (tStyle === 'silhouette') {
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = Math.max(1.4, charHeight * 0.005);
        ctx.stroke();
      } else if (tStyle === 'reactor' || tStyle === 'cyber-core') {
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
        if (tStyle === 'cyber-core') {
          ctx.moveTo(coreX, coreY - coreR * 1.15);
          ctx.lineTo(coreX + coreR * 1.05, coreY);
          ctx.lineTo(coreX, coreY + coreR * 1.15);
          ctx.lineTo(coreX - coreR * 1.05, coreY);
          ctx.closePath();
        } else {
          ctx.arc(coreX, coreY, coreR, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, coreR * 0.28);
        ctx.stroke();
        ctx.restore();
      } else if (tStyle === 'ninja') {
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
      } else if (tStyle === 'hoodie') {
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
      } else if (tStyle === 'tux-tie' || tStyle === 'tux-bow') {
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

          if (tStyle === 'tux-tie') {
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
      } else if (tStyle === 'pinstripe') {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.32)';
        ctx.lineWidth = Math.max(1, charHeight * 0.003);
        for (const frac of [-0.45, -0.15, 0.15, 0.45]) {
          ctx.beginPath();
          ctx.moveTo(pChest.x + waistW * frac, pChest.y - charHeight * 0.04);
          ctx.lineTo(hipMidX + waistW * frac * 0.85, hipMidY - charHeight * 0.01);
          ctx.stroke();
        }
      } else if (tStyle === 'tutu') {
        const isFlapper = avatarStyle === 'human-flapper';
        const isOpera = avatarStyle === 'human-opera';
        const tutuW =
          Math.max(hipSpan * (isOpera ? 1.65 : 1.45), charHeight * (isOpera ? 0.165 : 0.145)) *
          (1 + beatDrive * 0.06);
        const tutuDrop = charHeight * (isOpera ? 0.14 : isFlapper ? 0.095 : 0.068);
        const flareShift = Math.sin(currentTime * 3.2) * charHeight * 0.008;

        const tutuGrad = ctx.createRadialGradient(
          hipMidX,
          hipMidY - tutuDrop * 0.2,
          tutuW * 0.15,
          hipMidX,
          hipMidY + tutuDrop * 0.25,
          tutuW * 1.15
        );
        tutuGrad.addColorStop(0, isOpera ? '#991b1b' : isFlapper ? '#fef08a' : '#ffffff');
        tutuGrad.addColorStop(
          0.55,
          isOpera
            ? '#450a0a'
            : isFlapper
            ? 'rgba(234, 179, 8, 0.82)'
            : hexToRgba(primaryColor, 0.72)
        );
        tutuGrad.addColorStop(
          1,
          isOpera ? '#18181b' : hexToRgba(secondaryColor, 0.35)
        );

        ctx.fillStyle = tutuGrad;
        ctx.strokeStyle = hexToRgba(isFlapper ? '#fef9c3' : '#ffffff', 0.55);
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
      } else if (tStyle === 'bboy') {
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
      } else if (tStyle === 'diva-belt') {
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
      } else if (tStyle === 'track-stripe') {
        ctx.strokeStyle = hexToRgba('#f8fafc', 0.4);
        ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(
          waistMidX - waistW * 0.85,
          pChest.y - charHeight * 0.01,
          waistW * 1.7,
          charHeight * 0.011
        );
        ctx.fillStyle = accentColor;
        ctx.fillRect(
          waistMidX - waistW * 0.85,
          pChest.y + charHeight * 0.006,
          waistW * 1.7,
          charHeight * 0.008
        );
      } else if (tStyle === 'armor-plate') {
        ctx.strokeStyle = hexToRgba(accentColor, 0.65);
        ctx.lineWidth = Math.max(1.4, charHeight * 0.005);
        ctx.stroke();
        if (faceZ > -0.15) {
          const shift = faceX * waistW * 0.18;
          ctx.fillStyle = hexToRgba(accentColor, 0.85);
          ctx.beginPath();
          ctx.roundRect(
            pChest.x - waistW * 0.48 + shift,
            pChest.y - charHeight * 0.028,
            waistW * 0.96,
            charHeight * 0.045,
            charHeight * 0.008
          );
          ctx.fill();
        }
      } else if (tStyle === 'kimono') {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
        ctx.stroke();
        if (faceZ > -0.2) {
          const shift = faceX * waistW * 0.15;
          ctx.strokeStyle = '#f8fafc';
          ctx.lineWidth = Math.max(2, charHeight * 0.008);
          ctx.beginPath();
          ctx.moveTo((pNeck?.x ?? pChest.x) - waistW * 0.3 + shift, pChest.y - charHeight * 0.04);
          ctx.lineTo(waistMidX + waistW * 0.25 + shift, waistMidY);
          ctx.moveTo((pNeck?.x ?? pChest.x) + waistW * 0.3 + shift, pChest.y - charHeight * 0.04);
          ctx.lineTo(waistMidX - waistW * 0.1 + shift, waistMidY);
          ctx.stroke();
        }
        // Wide obi sash
        ctx.fillStyle = secondaryColor;
        ctx.beginPath();
        ctx.roundRect(
          waistMidX - waistW * 0.98,
          waistMidY - charHeight * 0.01,
          waistW * 1.96,
          charHeight * 0.042,
          charHeight * 0.006
        );
        ctx.fill();
      } else if (tStyle === 'bolero') {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = Math.max(1.6, charHeight * 0.006);
        ctx.stroke();
        if (faceZ > -0.15 && pNeck) {
          const shift = faceX * waistW * 0.18;
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.moveTo(pNeck.x - waistW * 0.25 + shift, pChest.y - charHeight * 0.04);
          ctx.lineTo(pNeck.x + waistW * 0.25 + shift, pChest.y - charHeight * 0.04);
          ctx.lineTo(pChest.x + shift, pChest.y + charHeight * 0.055);
          ctx.closePath();
          ctx.fill();
        }
      } else if (tStyle === 'punk-studs') {
        ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
        ctx.lineWidth = Math.max(1.2, charHeight * 0.004);
        ctx.stroke();
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = Math.max(2, charHeight * 0.009);
        ctx.beginPath();
        ctx.moveTo(lShOutX + waistW * 0.15, pLSh.y);
        ctx.lineTo(hipMidX + waistW * 0.65, hipMidY - charHeight * 0.02);
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        for (let s = 0; s < 4; s++) {
          const t = (s + 0.5) / 4;
          const sx = (lShOutX + waistW * 0.15) * (1 - t) + (hipMidX + waistW * 0.65) * t;
          const sy = pLSh.y * (1 - t) + (hipMidY - charHeight * 0.02) * t;
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(1.5, charHeight * 0.005), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (tStyle === 'cape' || tStyle === 'wings') {
        ctx.strokeStyle = hexToRgba(accentColor, 0.65);
        ctx.lineWidth = Math.max(1.5, charHeight * 0.005);
        ctx.stroke();
        if (faceZ > -0.15) {
          ctx.fillStyle = accentColor;
          ctx.beginPath();
          ctx.arc(pChest.x + faceX * waistW * 0.18, pChest.y - charHeight * 0.015, Math.max(2.5, charHeight * 0.012), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // 'lapel' (Studio Pop & variants)
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
        isSil || isNeonFrame ? rimColor : undefined,
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
        isSil || isNeonFrame ? rimColor : undefined,
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
        isSil || isNeonFrame ? rimColor : undefined,
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
        isSil || isNeonFrame ? rimColor : undefined,
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

  // Flowing back hair layer when profile enables 'diva-hair'
  if (profile.backLayer === 'diva-hair') {
    parts.push({
      z: pHead.z - (faceZ > 0 ? 0.08 : -0.08),
      draw: () => {
        const hr = headR * pHead.scale;
        const hx = pHead.x;
        const hy = pHead.y;
        const hairSway = Math.sin(currentTime * 3.8) * hr * 0.35 - faceX * hr * 0.45;
        ctx.save();
        ctx.fillStyle = hairColor;
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

      const hGear = profile.headgear;
      const eWear = profile.eyewear;

      if (!isSil && hGear !== 'robot-ears' && hGear !== 'helmet') {
        ctx.strokeStyle = capsuleRimColor;
        ctx.lineWidth = Math.max(1, hr * 0.085);
        ctx.stroke();
      }

      if (isSil) {
        ctx.strokeStyle = rimColor;
        ctx.lineWidth = Math.max(1.4, hr * 0.12);
        ctx.stroke();
      } else if (hGear === 'robot-ears') {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = Math.max(1.4, hr * 0.11);
        ctx.stroke();

        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.roundRect(hx - hr * 1.02, hy - hr * 0.32, hr * 0.22, hr * 0.56, hr * 0.08);
        ctx.roundRect(hx + hr * 0.8, hy - hr * 0.32, hr * 0.22, hr * 0.56, hr * 0.08);
        ctx.fill();
      } else if (hGear === 'helmet') {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#f8fafc';
        ctx.lineWidth = Math.max(1.6, hr * 0.14);
        ctx.stroke();
      } else if (hGear === 'hood-cowl') {
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

        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.roundRect(hx - hr * 0.86, hy - hr * 0.52, hr * 1.72, hr * 0.24, hr * 0.1);
        ctx.fill();
      } else {
        ctx.shadowBlur = 0;

        if (hGear === 'bun') {
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          ctx.arc(hx - faceX * hr * 0.15, hy - hr * 1.12, hr * 0.44, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          const hairStart = faceZ > 0 ? Math.PI * 0.96 : 0;
          const hairEnd = faceZ > 0 ? Math.PI * 2.04 : Math.PI * 2;
          ctx.ellipse(hx, hy - hr * 0.18, hr * 0.88, hr * 0.94, 0, hairStart, hairEnd);
          ctx.fill();
        } else if (hGear === 'cap') {
          ctx.fillStyle = primaryColor;
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.36, hr * 0.95, hr * 0.72, 0, Math.PI, Math.PI * 2);
          ctx.fill();
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
        } else if (hGear === 'beanie') {
          ctx.fillStyle = secondaryColor;
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.44, hr * 0.95, hr * 0.82, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.roundRect(hx - hr * 0.94, hy - hr * 0.54, hr * 1.88, hr * 0.28, hr * 0.1);
          ctx.fill();
        } else if (hGear === 'bucket-hat') {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.45, hr * 0.9, hr * 0.65, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.42, hr * 1.32, hr * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
        } else if (hGear === 'afro') {
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          ctx.arc(hx, hy - hr * 0.38, hr * 1.38, Math.PI * 0.85, Math.PI * 2.15);
          ctx.fill();
        } else if (hGear === 'mohawk') {
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          ctx.moveTo(hx - hr * 0.22, hy - hr * 0.55);
          ctx.lineTo(hx - hr * 0.08, hy - hr * 1.75);
          ctx.lineTo(hx + hr * 0.16, hy - hr * 1.65);
          ctx.lineTo(hx + hr * 0.22, hy - hr * 0.55);
          ctx.closePath();
          ctx.fill();
        } else if (hGear === 'fedora' || hGear === 'cowboy' || hGear === 'sombrero') {
          const brimMult = hGear === 'sombrero' ? 2.15 : hGear === 'cowboy' ? 1.75 : 1.45;
          const hatBody = hGear === 'cowboy' ? '#78350f' : '#18181b';
          const bandCol = hGear === 'fedora' ? '#f8fafc' : accentColor;
          ctx.fillStyle = hatBody;
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.62, hr * 0.92, hr * 0.66, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.55, hr * brimMult, hr * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = bandCol;
          ctx.lineWidth = Math.max(1.4, hr * 0.14);
          ctx.beginPath();
          ctx.moveTo(hx - hr * 0.85, hy - hr * 0.62);
          ctx.lineTo(hx + hr * 0.85, hy - hr * 0.62);
          ctx.stroke();
        } else if (hGear === 'crown') {
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          const hairStart = faceZ > 0 ? Math.PI * 0.94 : 0;
          const hairEnd = faceZ > 0 ? Math.PI * 2.06 : Math.PI * 2;
          ctx.ellipse(hx, hy - hr * 0.16, hr * 0.9, hr * 0.96, 0, hairStart, hairEnd);
          ctx.fill();
          ctx.fillStyle = '#fbbf24';
          ctx.beginPath();
          ctx.moveTo(hx - hr * 0.62, hy - hr * 0.78);
          ctx.lineTo(hx - hr * 0.5, hy - hr * 1.42);
          ctx.lineTo(hx - hr * 0.2, hy - hr * 1.05);
          ctx.lineTo(hx, hy - hr * 1.52);
          ctx.lineTo(hx + hr * 0.2, hy - hr * 1.05);
          ctx.lineTo(hx + hr * 0.5, hy - hr * 1.42);
          ctx.lineTo(hx + hr * 0.62, hy - hr * 0.78);
          ctx.closePath();
          ctx.fill();
        } else if (hGear === 'halo') {
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          const hairStart = faceZ > 0 ? Math.PI * 0.94 : 0;
          const hairEnd = faceZ > 0 ? Math.PI * 2.06 : Math.PI * 2;
          ctx.ellipse(hx, hy - hr * 0.16, hr * 0.9, hr * 0.96, 0, hairStart, hairEnd);
          ctx.fill();
          ctx.save();
          ctx.shadowColor = rimLightColor;
          ctx.shadowBlur = 10;
          ctx.strokeStyle = primaryColor;
          ctx.lineWidth = Math.max(1.8, hr * 0.15);
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 1.38, hr * 0.88, hr * 0.22, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (hGear === 'headphones') {
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          const hairStart = faceZ > 0 ? Math.PI * 0.94 : 0;
          const hairEnd = faceZ > 0 ? Math.PI * 2.06 : Math.PI * 2;
          ctx.ellipse(hx, hy - hr * 0.16, hr * 0.9, hr * 0.96, 0, hairStart, hairEnd);
          ctx.fill();
          ctx.strokeStyle = '#e2e8f0';
          ctx.lineWidth = Math.max(2, hr * 0.18);
          ctx.beginPath();
          ctx.arc(hx, hy - hr * 0.12, hr * 1.02, Math.PI * 1.05, Math.PI * 1.95);
          ctx.stroke();
          ctx.fillStyle = primaryColor;
          ctx.beginPath();
          ctx.roundRect(hx - hr * 1.12, hy - hr * 0.34, hr * 0.28, hr * 0.62, hr * 0.12);
          ctx.roundRect(hx + hr * 0.84, hy - hr * 0.34, hr * 0.28, hr * 0.62, hr * 0.12);
          ctx.fill();
        } else if (hGear === 'bandeau-feather') {
          ctx.fillStyle = hairColor;
          ctx.beginPath();
          const hairStart = faceZ > 0 ? Math.PI * 0.94 : 0;
          const hairEnd = faceZ > 0 ? Math.PI * 2.06 : Math.PI * 2;
          ctx.ellipse(hx, hy - hr * 0.16, hr * 0.9, hr * 0.96, 0, hairStart, hairEnd);
          ctx.fill();
          ctx.fillStyle = '#fef08a';
          ctx.fillRect(hx - hr * 0.85, hy - hr * 0.62, hr * 1.7, hr * 0.16);
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.ellipse(hx + hr * 0.68, hy - hr * 1.08, hr * 0.18, hr * 0.56, 0.38, 0, Math.PI * 2);
          ctx.fill();
        } else if (hGear === 'samurai-crest') {
          ctx.fillStyle = '#18181b';
          ctx.beginPath();
          ctx.ellipse(hx, hy - hr * 0.34, hr * 1.02, hr * 0.78, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = Math.max(2, hr * 0.16);
          ctx.beginPath();
          ctx.moveTo(hx - hr * 0.65, hy - hr * 1.25);
          ctx.quadraticCurveTo(hx, hy - hr * 0.75, hx + hr * 0.65, hy - hr * 1.25);
          ctx.stroke();
        } else if (hGear === 'sculpted') {
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
      }

      // Facing facial detail / shades / visor / eyes
      if (!isSil && faceZ > -0.18) {
        const visAlpha = Math.min(1, (faceZ + 0.18) * 1.5);
        const visX = hx + faceX * hr * 0.44;
        const visY = hy - hr * 0.08;
        const visW = hr * 0.72 * Math.max(0.32, Math.abs(faceZ));
        const visH = hr * 0.22;

        ctx.globalAlpha = visAlpha;
        if (eWear === 'visor') {
          const vW = hr * 0.74 * Math.max(0.32, Math.abs(faceZ));
          const vH = hr * 0.28;
          ctx.fillStyle = '#090d16';
          ctx.beginPath();
          ctx.roundRect(visX - vW, visY - vH * 0.5, vW * 2, vH, vH * 0.3);
          ctx.fill();
          ctx.shadowColor = hGear === 'helmet' ? '#f59e0b' : primaryColor;
          ctx.shadowBlur = 10;
          ctx.fillStyle =
            lyricAccent > 0.25
              ? '#ffffff'
              : hGear === 'helmet'
              ? '#fbbf24'
              : primaryColor;
          ctx.beginPath();
          ctx.roundRect(
            visX - vW * 0.84,
            visY - vH * 0.22,
            vW * 1.68,
            vH * 0.44,
            vH * 0.2
          );
          ctx.fill();
        } else if (eWear === 'ninja-slit') {
          const vW = hr * 0.68 * Math.max(0.32, Math.abs(faceZ));
          ctx.fillStyle = '#e5b89c';
          ctx.beginPath();
          ctx.roundRect(visX - vW * 0.85, hy - hr * 0.1 - hr * 0.14, vW * 1.7, hr * 0.28, hr * 0.1);
          ctx.fill();
          ctx.fillStyle = '#090b10';
          const eyeSpread = vW * 0.42;
          ctx.beginPath();
          ctx.arc(visX - eyeSpread, hy - hr * 0.1, hr * 0.085, 0, Math.PI * 2);
          ctx.arc(visX + eyeSpread, hy - hr * 0.1, hr * 0.085, 0, Math.PI * 2);
          ctx.fill();
        } else if (eWear === 'neon-visor') {
          ctx.shadowColor = secondaryColor;
          ctx.shadowBlur = 10;
          ctx.fillStyle = lyricAccent > 0.25 ? '#ffffff' : secondaryColor;
          ctx.beginPath();
          ctx.roundRect(visX - visW, visY - visH * 0.5, visW * 2, visH, visH * 0.45);
          ctx.fill();
        } else if (eWear === 'cyber-eye') {
          ctx.fillStyle = '#090b10';
          const eyeSpread = visW * 0.46;
          ctx.beginPath();
          ctx.arc(visX - eyeSpread, visY, hr * 0.09, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowColor = primaryColor;
          ctx.shadowBlur = 10;
          ctx.fillStyle = lyricAccent > 0.25 ? '#ffffff' : primaryColor;
          ctx.beginPath();
          ctx.arc(visX + eyeSpread, visY, hr * 0.14, 0, Math.PI * 2);
          ctx.fill();
        } else if (eWear === 'half-mask') {
          ctx.fillStyle = '#f8fafc';
          ctx.beginPath();
          ctx.ellipse(visX, visY - hr * 0.02, visW * 0.92, hr * 0.26, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#090b10';
          const eyeSpread = visW * 0.45;
          ctx.beginPath();
          ctx.arc(visX - eyeSpread, visY, hr * 0.09, 0, Math.PI * 2);
          ctx.arc(visX + eyeSpread, visY, hr * 0.09, 0, Math.PI * 2);
          ctx.fill();
        } else if (eWear === 'expressive') {
          ctx.fillStyle = '#18181b';
          const eyeSpread = visW * 0.48;
          ctx.beginPath();
          ctx.ellipse(visX - eyeSpread, visY, hr * 0.11, hr * 0.08, 0, 0, Math.PI * 2);
          ctx.ellipse(visX + eyeSpread, visY, hr * 0.11, hr * 0.08, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = res(profile.lipColor ?? 'secondary');
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
        } else if (eWear === 'eyes') {
          ctx.fillStyle = '#090b10';
          const eyeSpread = visW * 0.48;
          ctx.beginPath();
          ctx.arc(visX - eyeSpread, visY, hr * 0.095, 0, Math.PI * 2);
          ctx.arc(visX + eyeSpread, visY, hr * 0.095, 0, Math.PI * 2);
          ctx.fill();
        } else if (eWear === 'shades') {
          ctx.fillStyle = '#090b10';
          ctx.strokeStyle = hexToRgba(primaryColor, 0.75);
          ctx.lineWidth = Math.max(1.2, hr * 0.07);
          ctx.beginPath();
          ctx.roundRect(visX - visW, visY - visH * 0.5, visW * 2, visH * 1.05, visH * 0.35);
          ctx.fill();
          ctx.stroke();
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
    dt = 1 / 60,
    bass,
    mid,
    treble,
    beatBurst,
    beatTriggered,
    bpm,
    isExport = false,
    settings,
    lyrics,
    mocapClip,
    hexToRgba,
  } = params;

  if (!settings.danceEnabled) return;

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

  const medley = resolveMedleyTransition(
    settings,
    currentTime,
    dt,
    beatTriggered,
    isExport,
    activeLyricIdx,
    lyrics,
    mocapClip
  );

  const targetPose = evaluateStylePose(
    medley.primaryStyle,
    currentTime,
    bass,
    mid,
    treble,
    beatDrive,
    danceEnergy,
    lyricAccent,
    activeLyricIdx,
    mocapClip
  );

  let finalPose = targetPose;
  let yawAmp = targetPose.useMocap ? 0.11 : 0.22;

  if (medley.fromStyle && medley.blendAlpha < 1) {
    const sourcePose = evaluateStylePose(
      medley.fromStyle,
      currentTime,
      bass,
      mid,
      treble,
      beatDrive,
      danceEnergy,
      lyricAccent,
      activeLyricIdx,
      mocapClip
    );
    finalPose = blendEvaluatedPoses(sourcePose, targetPose, medley.blendAlpha);
    const eased =
      medley.blendAlpha * medley.blendAlpha * (3 - 2 * medley.blendAlpha);
    yawAmp = lerp(
      sourcePose.useMocap ? 0.11 : 0.22,
      targetPose.useMocap ? 0.11 : 0.22,
      eased
    );
  }

  const { joints3D, bones, headIdx, useMocap } = finalPose;

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
  const yaw =
    Math.sin(currentTime * 1.1) * yawAmp * danceEnergy +
    lyricAccent * (activeLyricIdx % 2 === 0 ? 0.16 : -0.16);
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const fov = 3.2;

  const danceStrobe = Math.max(0, Math.min(1, settings.danceStrobe ?? 0));
  const danceGlow = Math.max(0, Math.min(1.5, settings.danceGlow ?? 0));
  const spotlightIntensity = Math.max(
    0,
    Math.min(2, settings.danceSpotlightIntensity ?? 1)
  );
  const danceShadowEnabled = settings.danceShadow ?? true;
  const rawRimSetting =
    typeof settings.danceRimColor === 'string' ? settings.danceRimColor.trim() : '';
  const hasCustomRim = /^#[0-9a-fA-F]{3,8}$/.test(rawRimSetting);

  const strobeBuffer =
    danceStrobe > 0.005 || danceGlow > 0.005
      ? ensureDanceStrobeCanvas(width, height)
      : null;
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
        avatarStyle === 'robot' ||
        avatarStyle === 'prism-rig' ||
        avatarStyle === 'laser-frame' ||
        avatarStyle === 'pulse-nodes' ||
        avatarStyle === 'human-raver' ||
        avatarStyle === 'human-valkyrie' ||
        avatarStyle === 'human-laser-mage' ||
        avatarStyle === 'human-synthwave' ||
        avatarStyle === 'human-android' ||
        avatarStyle === 'human-cyborg'
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
        ? resolveHumanoidIndices(finalPose.jointNames, shadowPoints.length)
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
      if (shadowBuf && shadowPoints.length > 0) {
        const { canvas: shCanvas, ctx: shCtx } = shadowBuf;
        const isWireRig =
          avatarStyle === 'holo-wire' ||
          avatarStyle === 'minimal-rig' ||
          avatarStyle === 'prism-rig' ||
          avatarStyle === 'laser-frame' ||
          avatarStyle === 'pulse-nodes' ||
          avatarStyle === 'shadow-wire';
        const baseShadowLimbW = Math.max(
          2.5,
          charHeight * (isWireRig ? 0.018 : 0.028)
        );

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < shadowPoints.length; i++) {
          const sp = shadowPoints[i];
          if (sp.x < minX) minX = sp.x;
          if (sp.x > maxX) maxX = sp.x;
          if (sp.y < minY) minY = sp.y;
          if (sp.y > maxY) maxY = sp.y;
        }
        const sHead = shadowPoints[headIdx];
        const headPad = sHead ? Math.max(4, charHeight * 0.058 * sHead.scale) : 0;
        const pad = Math.ceil(Math.max(baseShadowLimbW * 2.5, headPad) + 8);
        const bx = Math.max(0, Math.floor(minX - pad));
        const by = Math.max(0, Math.floor(minY - pad));
        const bx2 = Math.min(width, Math.ceil(maxX + pad));
        const by2 = Math.min(height, Math.ceil(maxY + pad));
        const bw = bx2 - bx;
        const bh = by2 - by;

        if (bw > 0 && bh > 0) {
          shCtx.save();
          shCtx.beginPath();
          shCtx.rect(bx, by, bw, bh);
          shCtx.clip();
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
          if (sHead) {
            const hrx = Math.max(4, charHeight * 0.058 * sHead.scale);
            shCtx.beginPath();
            shCtx.ellipse(sHead.x, sHead.y, hrx, hrx * 0.36, 0, 0, Math.PI * 2);
            shCtx.fill();
          }
          shCtx.restore();

          ctx.save();
          ctx.globalAlpha = shadowAlpha;
          ctx.drawImage(shCanvas, bx, by, bw, bh, bx, by, bw, bh);
          ctx.restore();

          // Clear only the tight bounding rect so full-frame buffer stays spotless for next slot/frame
          shCtx.clearRect(bx, by, bw, bh);
        }
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
      const indices = resolveHumanoidIndices(finalPose.jointNames, projected.length);
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
    renderRigSkeleton({
      ctx: avatarCtx,
      avatarStyle,
      projected,
      bones,
      headIdx,
      useMocap,
      charHeight,
      currentTime,
      beatDrive,
      lyricAccent,
      yaw,
      primaryColor: slotPrimary,
      secondaryColor: slotSecondary,
      rimLightColor: slotRimColor,
      hasCustomRim,
      spotlightIntensity,
      hexToRgba,
    });

    avatarCtx.restore();
  }

  // Precompute tempo-synced strobe state when Dancer Strobe is active
  const strobeActive = Boolean(strobeBuffer && danceStrobe > 0.005);
  let strobeOpen = true;
  let strobePeakNorm = 0;
  let strobeDimContrast = 0;
  let strobeDimCompositeAlpha = 1;

  if (strobeActive) {
    const { strobeHz } = getDanceStrobeTiming(danceStrobe, bpm);
    const shutterWave = Math.sin(currentTime * Math.PI * 2 * strobeHz);
    strobeOpen = beatTriggered || shutterWave > 0;
    const energyLift = Math.max(rawBeat, bass * 0.65);
    const tempoPulse = Math.min(1, 0.48 + 0.52 * energyLift);
    strobePeakNorm = Math.pow(tempoPulse, 0.8);
    strobeDimContrast = 0.65 + 0.35 * Math.min(1, rawBeat * 1.2);
    strobeDimCompositeAlpha = Math.max(0.18, 1 - danceStrobe * 0.74 * strobeDimContrast);
  }

  // Soft Dancer Glow aura pass (rendered before strobe pixel-masking mutates sCanvas)
  if (strobeBuffer && danceGlow > 0.005) {
    const { canvas: sCanvas } = strobeBuffer;
    const glowScale = strobeActive ? (strobeOpen ? 1 : strobeDimCompositeAlpha) : 1;
    const glowPulse = 1 + beatDrive * 0.24 + lyricAccent * 0.14;
    const primaryGlowColor = hasCustomRim ? rawRimSetting : settings.primaryColor;
    const secondaryGlowColor = hasCustomRim ? rawRimSetting : settings.secondaryColor;

    // 1. Wide soft atmospheric halo for dark scene visibility
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = Math.min(0.92, danceGlow * 0.42 * glowPulse) * glowScale;
    ctx.shadowColor = primaryGlowColor;
    ctx.shadowBlur = Math.max(10, minDim * 0.052 * (0.4 + danceGlow * 0.85) * glowPulse);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(sCanvas, 0, 0, width, height);
    ctx.restore();

    // 2. Tight luminous rim bloom around character edges
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(0.84, danceGlow * 0.35 * glowPulse) * glowScale;
    ctx.shadowColor = secondaryGlowColor;
    ctx.shadowBlur = Math.max(5, minDim * 0.02 * (0.35 + danceGlow * 0.75) * glowPulse);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(sCanvas, 0, 0, width, height);
    ctx.restore();

    // If strobe is off, draw the crisp character silhouette on top with subtle ambient lift
    if (!strobeActive) {
      ctx.drawImage(sCanvas, 0, 0, width, height);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.22, danceGlow * 0.14);
      ctx.drawImage(sCanvas, 0, 0, width, height);
      ctx.restore();
    }
  }

  // Post-processing Dancer Strobe: sync strobe shutter frequency to current BPM & boost on beat peaks
  if (strobeBuffer && strobeActive) {
    const { canvas: sCanvas, ctx: sCtx } = strobeBuffer;

    if (strobeOpen) {
      // Brighten tempo-synced pulse directly on avatar pixels via source-atop mask
      const whiteHighlight = Math.min(0.62, danceStrobe * strobePeakNorm * 0.5);
      if (whiteHighlight > 0.01) {
        sCtx.save();
        sCtx.globalCompositeOperation = 'source-atop';
        sCtx.fillStyle = `rgba(255, 255, 255, ${whiteHighlight.toFixed(3)})`;
        sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);
        sCtx.restore();
      }

      // Base sharp avatar draw + subtle strobe rim glow
      ctx.save();
      if (danceStrobe * strobePeakNorm > 0.24) {
        ctx.shadowColor = hasCustomRim ? rawRimSetting : settings.primaryColor;
        ctx.shadowBlur = Math.max(6, minDim * 0.022 * danceStrobe * strobePeakNorm);
      }
      ctx.drawImage(sCanvas, 0, 0, width, height);
      ctx.restore();

      // Additive flare pass specifically on avatars for unmistakable strobe brighten pop
      const flareAlpha = Math.min(0.88, danceStrobe * strobePeakNorm * 0.76);
      if (flareAlpha > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flareAlpha;
        ctx.drawImage(sCanvas, 0, 0, width, height);
        ctx.restore();
      }
    } else {
      // Tempo-synced shutter-off dim trough between flashes
      const dimShade = Math.min(0.88, danceStrobe * 0.8 * strobeDimContrast);

      if (dimShade > 0.01) {
        sCtx.save();
        sCtx.globalCompositeOperation = 'source-atop';
        sCtx.fillStyle = `rgba(4, 6, 14, ${dimShade.toFixed(3)})`;
        sCtx.fillRect(0, 0, sCanvas.width, sCanvas.height);
        sCtx.restore();
      }

      ctx.save();
      ctx.globalAlpha = strobeDimCompositeAlpha;
      ctx.drawImage(sCanvas, 0, 0, width, height);
      ctx.restore();
    }
  }
}

function renderRigSkeleton(params: {
  ctx: DanceRenderCtx;
  avatarStyle: DanceAvatarStyle;
  projected: ProjectedJoint[];
  bones: Array<[number, number]>;
  headIdx: number;
  useMocap: boolean;
  charHeight: number;
  currentTime: number;
  beatDrive: number;
  lyricAccent: number;
  yaw: number;
  primaryColor: string;
  secondaryColor: string;
  rimLightColor: string;
  hasCustomRim: boolean;
  spotlightIntensity: number;
  hexToRgba: (hex: string, alpha: number) => string;
}): void {
  const {
    ctx: avatarCtx,
    avatarStyle,
    projected,
    bones,
    headIdx,
    useMocap,
    charHeight,
    currentTime,
    beatDrive,
    lyricAccent,
    yaw,
    primaryColor: slotPrimary,
    secondaryColor: slotSecondary,
    rimLightColor: slotRimColor,
    hasCustomRim,
    spotlightIntensity,
    hexToRgba,
  } = params;

  const sortedBones = bones
    .map(([a, b], idx) => ({
      a,
      b,
      idx,
      midZ: ((projected[a]?.z ?? 0) + (projected[b]?.z ?? 0)) * 0.5,
    }))
    .filter((item) => projected[item.a] && projected[item.b])
    .sort((u, v) => u.midZ - v.midZ);

  const limbBaseWidth = Math.max(2, charHeight * 0.032);
  const headRadius = Math.max(4, charHeight * 0.068);
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
        1.75,
        limbBaseWidth * 0.52 * ((pa.scale + pb.scale) * 0.5)
      );
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }

    if (projected.length > 0) {
      avatarCtx.fillStyle = '#f8fafc';
      avatarCtx.strokeStyle = slotSecondary;
      avatarCtx.lineWidth = Math.max(1, limbBaseWidth * 0.44 * 0.28);
      avatarCtx.beginPath();
      for (let j = 0; j < projected.length; j++) {
        if (j === headIdx) continue;
        const p = projected[j];
        const r = Math.max(2, limbBaseWidth * 0.44 * p.scale);
        avatarCtx.moveTo(p.x + r, p.y);
        avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      }
      avatarCtx.fill();
      avatarCtx.stroke();

      const ph = projected[headIdx];
      if (ph) {
        const r = headRadius * 0.78 * ph.scale;
        avatarCtx.fillStyle = hexToRgba(slotRimColor, 0.28);
        avatarCtx.strokeStyle = slotRimColor;
        avatarCtx.lineWidth = Math.max(1.2, r * 0.28);
        avatarCtx.beginPath();
        avatarCtx.arc(ph.x, ph.y, r, 0, Math.PI * 2);
        avatarCtx.fill();
        avatarCtx.stroke();
      }
    }
    return;
  }

  if (avatarStyle === 'minimal-rig') {
    avatarCtx.lineCap = 'round';
    avatarCtx.shadowColor = hasCustomRim
      ? hexToRgba(slotRimColor, 0.55)
      : 'rgba(0, 0, 0, 0.55)';
    avatarCtx.shadowBlur = Math.max(4, 10 * rigGlowFactor);
    for (const { a, b } of sortedBones) {
      const pa = projected[a];
      const pb = projected[b];
      const isTorso = !useMocap && a <= J_CHEST && b <= J_NECK;
      avatarCtx.strokeStyle = '#f1f5f9';
      avatarCtx.lineWidth = Math.max(
        2,
        limbBaseWidth * (isTorso ? 1.25 : 0.72) * ((pa.scale + pb.scale) * 0.5)
      );
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }
    avatarCtx.fillStyle = slotRimColor;
    avatarCtx.beginPath();
    for (let j = 0; j < projected.length; j++) {
      if (j === headIdx) continue;
      const p = projected[j];
      const r = Math.max(2, limbBaseWidth * 0.42 * p.scale);
      avatarCtx.moveTo(p.x + r, p.y);
      avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    avatarCtx.fill();
    const phMin = projected[headIdx];
    if (phMin) {
      avatarCtx.fillStyle = '#f8fafc';
      avatarCtx.beginPath();
      avatarCtx.arc(phMin.x, phMin.y, headRadius * 0.9 * phMin.scale, 0, Math.PI * 2);
      avatarCtx.fill();
    }
    return;
  }

  if (avatarStyle === 'prism-rig') {
    avatarCtx.lineCap = 'round';
    const split = Math.max(2, charHeight * (0.008 + beatDrive * 0.01));
    avatarCtx.shadowColor = slotPrimary;
    avatarCtx.shadowBlur = Math.max(5, 10 * rigGlowFactor);
    for (const [shift, col] of [
      [-split, slotPrimary],
      [split, slotSecondary],
      [0, '#ffffff'],
    ] as Array<[number, string]>) {
      avatarCtx.strokeStyle = col;
      avatarCtx.lineWidth = Math.max(1.4, limbBaseWidth * (shift === 0 ? 0.42 : 0.55));
      for (const { a, b } of sortedBones) {
        const pa = projected[a];
        const pb = projected[b];
        avatarCtx.beginPath();
        avatarCtx.moveTo(pa.x + shift, pa.y);
        avatarCtx.lineTo(pb.x + shift, pb.y);
        avatarCtx.stroke();
      }
    }
    const phP = projected[headIdx];
    if (phP) {
      const r = headRadius * 0.85 * phP.scale;
      avatarCtx.strokeStyle = '#ffffff';
      avatarCtx.lineWidth = Math.max(1.5, r * 0.22);
      avatarCtx.beginPath();
      avatarCtx.moveTo(phP.x, phP.y - r);
      avatarCtx.lineTo(phP.x + r * 0.95, phP.y + r * 0.75);
      avatarCtx.lineTo(phP.x - r * 0.95, phP.y + r * 0.75);
      avatarCtx.closePath();
      avatarCtx.stroke();
    }
    return;
  }

  if (avatarStyle === 'laser-frame') {
    avatarCtx.lineCap = 'butt';
    avatarCtx.shadowColor = slotRimColor;
    avatarCtx.shadowBlur = Math.max(6, 14 * rigGlowFactor);
    for (const { a, b } of sortedBones) {
      const pa = projected[a];
      const pb = projected[b];
      avatarCtx.strokeStyle = slotRimColor;
      avatarCtx.lineWidth = Math.max(1.4, limbBaseWidth * 0.36);
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }
    avatarCtx.fillStyle = '#ffffff';
    for (let j = 0; j < projected.length; j++) {
      const p = projected[j];
      const r = (j === headIdx ? headRadius * 0.88 : limbBaseWidth * 0.52) * p.scale;
      avatarCtx.beginPath();
      avatarCtx.moveTo(p.x, p.y - r);
      avatarCtx.lineTo(p.x + r, p.y);
      avatarCtx.lineTo(p.x, p.y + r);
      avatarCtx.lineTo(p.x - r, p.y);
      avatarCtx.closePath();
      avatarCtx.fill();
    }
    return;
  }

  if (avatarStyle === 'chrome-doll') {
    avatarCtx.lineCap = 'round';
    for (const { a, b } of sortedBones) {
      const pa = projected[a];
      const pb = projected[b];
      const isTorso = !useMocap && a <= J_CHEST && b <= J_NECK;
      const wPx = Math.max(
        2.5,
        limbBaseWidth * (isTorso ? 1.55 : 0.95) * ((pa.scale + pb.scale) * 0.5)
      );
      const grad = avatarCtx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
      grad.addColorStop(0, '#f8fafc');
      grad.addColorStop(0.5, '#94a3b8');
      grad.addColorStop(1, '#334155');
      avatarCtx.strokeStyle = grad;
      avatarCtx.lineWidth = wPx;
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }
    for (let j = 0; j < projected.length; j++) {
      const p = projected[j];
      const r = (j === headIdx ? headRadius * 0.95 : limbBaseWidth * 0.54) * p.scale;
      const jGrad = avatarCtx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
      jGrad.addColorStop(0, '#ffffff');
      jGrad.addColorStop(0.6, '#cbd5e1');
      jGrad.addColorStop(1, '#1e293b');
      avatarCtx.fillStyle = jGrad;
      avatarCtx.beginPath();
      avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      avatarCtx.fill();
    }
    return;
  }

  if (avatarStyle === 'pulse-nodes') {
    avatarCtx.lineCap = 'round';
    avatarCtx.strokeStyle = hexToRgba(slotPrimary, 0.72);
    avatarCtx.lineWidth = Math.max(1.5, limbBaseWidth * 0.42);
    for (const { a, b } of sortedBones) {
      const pa = projected[a];
      const pb = projected[b];
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }
    const pulseGrow = 1 + beatDrive * 0.48;
    avatarCtx.shadowColor = slotSecondary;
    avatarCtx.shadowBlur = Math.max(6, 12 * rigGlowFactor);
    for (let j = 0; j < projected.length; j++) {
      const p = projected[j];
      const r = (j === headIdx ? headRadius * 0.92 : limbBaseWidth * 0.56) * p.scale * pulseGrow;
      avatarCtx.strokeStyle = j % 2 === 0 ? slotRimColor : slotSecondary;
      avatarCtx.lineWidth = Math.max(1.4, r * 0.25);
      avatarCtx.beginPath();
      avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      avatarCtx.stroke();
      avatarCtx.fillStyle = '#ffffff';
      avatarCtx.beginPath();
      avatarCtx.arc(p.x, p.y, r * 0.36, 0, Math.PI * 2);
      avatarCtx.fill();
    }
    return;
  }

  if (avatarStyle === 'shadow-wire') {
    avatarCtx.lineCap = 'round';
    avatarCtx.shadowColor = slotRimColor;
    avatarCtx.shadowBlur = Math.max(6, 12 * rigGlowFactor);
    for (const { a, b } of sortedBones) {
      const pa = projected[a];
      const pb = projected[b];
      const isTorso = !useMocap && a <= J_CHEST && b <= J_NECK;
      avatarCtx.strokeStyle = '#090b10';
      avatarCtx.lineWidth = Math.max(
        2.4,
        limbBaseWidth * (isTorso ? 1.45 : 0.85) * ((pa.scale + pb.scale) * 0.5)
      );
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }
    const phS = projected[headIdx];
    if (phS) {
      avatarCtx.fillStyle = '#090b10';
      avatarCtx.strokeStyle = slotRimColor;
      avatarCtx.lineWidth = Math.max(1.5, limbBaseWidth * 0.35);
      avatarCtx.beginPath();
      avatarCtx.arc(phS.x, phS.y, headRadius * 0.9 * phS.scale, 0, Math.PI * 2);
      avatarCtx.fill();
      avatarCtx.stroke();
    }
    return;
  }

  if (avatarStyle === 'voxel-rig') {
    avatarCtx.lineCap = 'square';
    avatarCtx.shadowColor = slotPrimary;
    avatarCtx.shadowBlur = Math.max(4, 10 * rigGlowFactor);
    for (const { a, b, idx } of sortedBones) {
      const pa = projected[a];
      const pb = projected[b];
      const isTorso = !useMocap && a <= J_CHEST && b <= J_NECK;
      avatarCtx.strokeStyle = idx % 2 === 0 ? slotPrimary : slotSecondary;
      avatarCtx.lineWidth = Math.max(
        3,
        limbBaseWidth * (isTorso ? 1.55 : 0.95) * ((pa.scale + pb.scale) * 0.5)
      );
      avatarCtx.beginPath();
      avatarCtx.moveTo(pa.x, pa.y);
      avatarCtx.lineTo(pb.x, pb.y);
      avatarCtx.stroke();
    }
    for (let j = 0; j < projected.length; j++) {
      const p = projected[j];
      const s = (j === headIdx ? headRadius * 1.6 : limbBaseWidth * 0.95) * p.scale;
      avatarCtx.fillStyle = j === headIdx ? '#f8fafc' : slotRimColor;
      avatarCtx.fillRect(p.x - s * 0.5, p.y - s * 0.5, s, s);
    }
    return;
  }

  // 'neon-cyber': luminous cybernetic dancer rig
  avatarCtx.lineCap = 'round';
  avatarCtx.lineJoin = 'round';

  for (const { a, b } of sortedBones) {
    const pa = projected[a];
    const pb = projected[b];
    const isTorso = !useMocap && a <= J_CHEST && b <= J_NECK;
    const wPx = Math.max(
      2.2,
      limbBaseWidth * (isTorso ? 1.48 : 0.9) * ((pa.scale + pb.scale) * 0.5)
    );

    const boneGrad = avatarCtx.createLinearGradient(pa.x, pa.y, pb.x, pb.y);
    boneGrad.addColorStop(0, slotRimColor);
    boneGrad.addColorStop(1, slotSecondary);

    avatarCtx.shadowColor = slotRimColor;
    avatarCtx.shadowBlur = Math.max(
      4,
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
    avatarCtx.lineWidth = Math.max(1, wPx * 0.28);
    avatarCtx.beginPath();
    avatarCtx.moveTo(pa.x, pa.y);
    avatarCtx.lineTo(pb.x, pb.y);
    avatarCtx.stroke();
  }

  avatarCtx.fillStyle = '#ffffff';
  avatarCtx.shadowColor = slotRimColor;
  avatarCtx.shadowBlur = Math.max(4, 9 * rigGlowFactor);
  avatarCtx.beginPath();
  for (let j = 0; j < projected.length; j++) {
    if (j === headIdx) continue;
    const p = projected[j];
    const r = Math.max(2, limbBaseWidth * 0.42 * p.scale);
    avatarCtx.moveTo(p.x + r, p.y);
    avatarCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
  }
  avatarCtx.fill();

  const ph = projected[headIdx];
  if (ph) {
    const hr = headRadius * ph.scale;
    avatarCtx.shadowColor = slotRimColor;
    avatarCtx.shadowBlur = Math.max(6, hr * (0.7 + beatDrive * 0.6) * rigGlowFactor);
    avatarCtx.fillStyle = '#090b10';
    avatarCtx.strokeStyle = slotRimColor;
    avatarCtx.lineWidth = Math.max(1.5, hr * 0.16);
    avatarCtx.beginPath();
    avatarCtx.arc(ph.x, ph.y, hr, 0, Math.PI * 2);
    avatarCtx.fill();
    avatarCtx.stroke();

    const visorOffsetX = Math.sin(yaw) * hr * 0.36;
    avatarCtx.shadowColor = slotSecondary;
    avatarCtx.strokeStyle = lyricAccent > 0.25 ? '#ffffff' : slotSecondary;
    avatarCtx.lineWidth = Math.max(1.5, hr * 0.22);
    avatarCtx.beginPath();
    avatarCtx.moveTo(ph.x + visorOffsetX - hr * 0.45, ph.y - hr * 0.05);
    avatarCtx.lineTo(ph.x + visorOffsetX + hr * 0.45, ph.y - hr * 0.05);
    avatarCtx.stroke();
  }
}

function previewHexToRgba(hex: string, alpha: number): string {
  const clean = (hex || '#22d3ee').trim().replace('#', '');
  let full = clean;
  if (clean.length === 3) {
    full = `${clean[0]}${clean[0]}${clean[1]}${clean[1]}${clean[2]}${clean[2]}`;
  }
  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    return `rgba(34, 211, 238, ${alpha})`;
  }
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SIGNATURE_PREVIEW_TIMES: Partial<Record<DanceStyleKey, number>> = {
  ...Object.fromEntries(
    BUILT_IN_MOCAP_LIBRARY.map((entry) => [entry.id, entry.previewTime])
  ),
  'hip-hop': 0.65,
  shuffle: 0.55,
  robot: 0.85,
  groove: 1.1,
  'break-freeze': 0.9,
};

export function getSignaturePreviewTime(
  style: DanceStyleKey,
  mocapClip?: MocapClipData | null
): number {
  if (style === 'mocap-custom') {
    if (mocapClip && mocapClip.frameCount > 0 && mocapClip.fps > 0) {
      return (mocapClip.frameCount / mocapClip.fps) * 0.35;
    }
    return 0.7;
  }
  return SIGNATURE_PREVIEW_TIMES[style] ?? 0.9;
}

export interface RenderMocapPreviewParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  style: DanceStyleKey;
  avatarStyle?: DanceAvatarStyle;
  primaryColor?: string;
  secondaryColor?: string;
  rimColor?: string;
  mocapClip?: MocapClipData | null;
}

export function renderMocapPreviewThumbnail(params: RenderMocapPreviewParams): void {
  const {
    ctx,
    width,
    height,
    style,
    avatarStyle = 'human-dancer',
    primaryColor = '#22d3ee',
    secondaryColor = '#a855f7',
    rimColor,
    mocapClip,
  } = params;

  if (width <= 0 || height <= 0) return;

  const isMissingCustomClip =
    style === 'mocap-custom' && (!mocapClip || mocapClip.frameCount === 0);
  const rawRim = typeof rimColor === 'string' ? rimColor.trim() : '';
  const hasCustomRim = /^#[0-9a-fA-F]{3,8}$/.test(rawRim);
  const resolvedRim = hasCustomRim ? rawRim : primaryColor;

  ctx.save();
  ctx.clearRect(0, 0, width, height);

  // Studio stage vignette backdrop
  const bgGrad = ctx.createRadialGradient(
    width * 0.5,
    height * 0.38,
    width * 0.06,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.78
  );
  bgGrad.addColorStop(0, previewHexToRgba(resolvedRim, 0.16));
  bgGrad.addColorStop(0.55, '#0b111d');
  bgGrad.addColorStop(1, '#05070c');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle floor grid perspective line & spotlight pool
  const baseFloorY = height * 0.86;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(6, baseFloorY);
  ctx.lineTo(width - 6, baseFloorY);
  ctx.stroke();

  const floorGlow = ctx.createRadialGradient(
    width * 0.5,
    baseFloorY,
    2,
    width * 0.5,
    baseFloorY,
    width * 0.38
  );
  floorGlow.addColorStop(0, previewHexToRgba(resolvedRim, 0.28));
  floorGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.translate(width * 0.5, baseFloorY);
  ctx.scale(1, 0.28);
  ctx.translate(-width * 0.5, -baseFloorY);
  ctx.fillStyle = floorGlow;
  ctx.beginPath();
  ctx.arc(width * 0.5, baseFloorY, width * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const previewTime = getSignaturePreviewTime(style, mocapClip);
  const pose = evaluateStylePose(
    style,
    previewTime,
    0.7,
    0.6,
    0.52,
    0.68,
    1.0,
    0.35,
    0,
    mocapClip
  );

  const yaw = -0.26;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const fov = 3.2;

  const projectAt = (
    cx: number,
    fy: number,
    ch: number
  ): ProjectedJoint[] =>
    pose.joints3D.map(([jx, jy, jz]) => {
      const rx = jx * cosY + jz * sinY;
      const rz = -jx * sinY + jz * cosY;
      const depth = Math.max(1.4, fov - rz * 0.75);
      const persp = fov / depth;
      return {
        x: cx + rx * (ch * 0.56) * persp,
        y: fy - jy * (ch * 0.56) * persp,
        z: rz,
        scale: persp,
        worldY: jy,
      };
    });

  // First pass projection to auto-fit wide poses (e.g. breakdance freeze / arabesque) inside thumbnail
  const trialHeight = height * 0.68;
  const trialProj = projectAt(width * 0.5, baseFloorY, trialHeight);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < trialProj.length; i++) {
    const p = trialProj[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const headMargin = trialHeight * 0.13;
  const limbMargin = trialHeight * 0.09;
  minX -= limbMargin;
  maxX += limbMargin;
  minY -= headMargin;
  maxY += limbMargin * 0.5;

  const spanX = Math.max(12, maxX - minX);
  const spanY = Math.max(12, maxY - minY);
  const availW = Math.max(24, width - 16);
  const availH = Math.max(24, height - 16);
  const fitScale = Math.min(1.08, availW / spanX, availH / spanY);

  const charHeight = trialHeight * fitScale;
  const rawMidX = (minX + maxX) * 0.5;
  const centerX = width * 0.5 + (width * 0.5 - rawMidX) * fitScale;
  const floorY = baseFloorY + (height * 0.87 - baseFloorY) * fitScale;
  const projected = projectAt(centerX, floorY, charHeight);

  // Soft contact shadow under feet
  ctx.fillStyle = 'rgba(2, 4, 10, 0.55)';
  ctx.beginPath();
  ctx.ellipse(centerX, floorY + 1, charHeight * 0.22, charHeight * 0.045, 0, 0, Math.PI * 2);
  ctx.fill();

  const renderStyle: DanceAvatarStyle = isMissingCustomClip ? 'holo-wire' : avatarStyle;
  if (isMissingCustomClip) {
    ctx.globalAlpha = 0.42;
  }

  if (isHumanAvatarStyle(renderStyle)) {
    const indices = resolveHumanoidIndices(pose.jointNames, projected.length);
    if (indices) {
      renderHumanVolumetricDancer({
        ctx,
        avatarStyle: renderStyle,
        projected,
        indices,
        floorY,
        centerX,
        charHeight,
        currentTime: previewTime,
        beatDrive: 0.45,
        lyricAccent: 0.2,
        primaryColor,
        secondaryColor,
        rimLightColor: resolvedRim,
        hasCustomRim,
        spotlightIntensity: 1.15,
        danceShadowEnabled: false,
        hexToRgba: previewHexToRgba,
      });
      ctx.restore();
      return;
    }
  }

  renderRigSkeleton({
    ctx,
    avatarStyle: renderStyle,
    projected,
    bones: pose.bones,
    headIdx: pose.headIdx,
    useMocap: pose.useMocap,
    charHeight,
    currentTime: previewTime,
    beatDrive: 0.45,
    lyricAccent: 0.2,
    yaw,
    primaryColor,
    secondaryColor,
    rimLightColor: resolvedRim,
    hasCustomRim,
    spotlightIntensity: 1.15,
    hexToRgba: previewHexToRgba,
  });

  ctx.restore();
}

