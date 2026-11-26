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
  | 'mocap-waltz'
  | 'mocap-popping'
  | 'mocap-locking'
  | 'mocap-krump'
  | 'mocap-tutting'
  | 'mocap-waving'
  | 'mocap-boogaloo'
  | 'mocap-cwalk'
  | 'mocap-jerkin'
  | 'mocap-harlem-shake'
  | 'mocap-dougie'
  | 'mocap-voguing'
  | 'mocap-waacking'
  | 'mocap-tektonik'
  | 'mocap-jumpstyle'
  | 'mocap-cutting-shapes'
  | 'mocap-hakken'
  | 'mocap-cyber-goth'
  | 'mocap-trance-flow'
  | 'mocap-robot-boogie'
  | 'mocap-bachata'
  | 'mocap-samba'
  | 'mocap-merengue'
  | 'mocap-cumbia'
  | 'mocap-reggaeton'
  | 'mocap-chacha'
  | 'mocap-rumba'
  | 'mocap-pasodoble'
  | 'mocap-dancehall'
  | 'mocap-amapiano'
  | 'mocap-foxtrot'
  | 'mocap-quickstep'
  | 'mocap-jive'
  | 'mocap-lindy-hop'
  | 'mocap-charleston'
  | 'mocap-twist'
  | 'mocap-mashed-potato'
  | 'mocap-swing-out'
  | 'mocap-flamenco'
  | 'mocap-bollywood'
  | 'mocap-bhangra'
  | 'mocap-capoeira'
  | 'mocap-irish-step'
  | 'mocap-kazachok'
  | 'mocap-bellydance'
  | 'mocap-jazz-square'
  | 'mocap-tap'
  | 'mocap-fosse'
  | 'mocap-aerial-leap'
  | 'mocap-headbang'
  | 'mocap-chill-sway';

export type BuiltInMocapFilterTag = 'high-energy' | 'slow' | 'modern' | 'classic';

export interface BuiltInMocapEntry {
  id: BuiltInMocapStyleKey;
  title: string;
  genre: string;
  bpmLabel: string;
  description: string;
  fileName: string;
  fps: number;
  frameCount: number;
  tags: BuiltInMocapFilterTag[];
  previewTime: number;
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
    tags: ['high-energy', 'classic'],
    previewTime: 0.88,
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
    tags: ['slow', 'classic'],
    previewTime: 3.08,
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
    tags: ['high-energy', 'modern'],
    previewTime: 3.24,
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
    tags: ['classic', 'modern'],
    previewTime: 1.0,
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
    tags: ['high-energy', 'modern'],
    previewTime: 0.88,
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
    tags: ['slow', 'modern'],
    previewTime: 3.0,
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
    tags: ['high-energy', 'modern'],
    previewTime: 1.0,
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
    tags: ['slow', 'classic'],
    previewTime: 1.92,
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
    tags: ['high-energy', 'modern'],
    previewTime: 1.0,
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
    tags: ['high-energy', 'modern'],
    previewTime: 1.28,
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
    tags: ['high-energy', 'classic'],
    previewTime: 1.0,
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
    tags: ['slow', 'classic'],
    previewTime: 0.56,
  },
  // 50 Additional Built-In Mocap Styles
  {
    id: 'mocap-popping',
    title: 'Popping Hit',
    genre: 'Street Funk',
    bpmLabel: '108 BPM',
    description: 'Sharp dime-stop muscle hits, chest pops & quantized funk angles',
    fileName: 'popping-hit.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.72,
  },
  {
    id: 'mocap-locking',
    title: 'Locking Point',
    genre: '70s Funk',
    bpmLabel: '114 BPM',
    description: 'Uncle Sam sky points, crisp wrist twirls & grounded knee locks',
    fileName: 'locking-point.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.15,
  },
  {
    id: 'mocap-krump',
    title: 'Krump Stomp',
    genre: 'Heavy Street',
    bpmLabel: '138 BPM',
    description: 'Explosive chest pops, heavy grounded stomps & aggressive arm swings',
    fileName: 'krump-stomp.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.92,
  },
  {
    id: 'mocap-tutting',
    title: 'King Tut Grid',
    genre: 'Geometric Street',
    bpmLabel: '102 BPM',
    description: 'Precision 90-degree forearm frames, box locks & grid isolations',
    fileName: 'king-tut-grid.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['modern', 'slow'],
    previewTime: 1.35,
  },
  {
    id: 'mocap-waving',
    title: 'Liquid Wave',
    genre: 'Popping Flow',
    bpmLabel: '96 BPM',
    description: 'Continuous sine wave passing through shoulders, spine & wrists',
    fileName: 'liquid-wave.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'modern'],
    previewTime: 1.48,
  },
  {
    id: 'mocap-boogaloo',
    title: 'Electric Boogaloo',
    genre: 'Old-School Funk',
    bpmLabel: '110 BPM',
    description: 'Rolling hip circles, knee pops & liquid neck glides',
    fileName: 'electric-boogaloo.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['classic', 'modern'],
    previewTime: 1.12,
  },
  {
    id: 'mocap-cwalk',
    title: 'C-Walk Glide',
    genre: 'West Coast',
    bpmLabel: '98 BPM',
    description: 'Crisp heel-toe V-steps, quick ankle pivots & relaxed upper posture',
    fileName: 'cwalk-glide.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['modern', 'high-energy'],
    previewTime: 0.85,
  },
  {
    id: 'mocap-jerkin',
    title: 'Reject Bounce',
    genre: 'Street Pop',
    bpmLabel: '106 BPM',
    description: 'Springy backward hops, high knee kicks & upbeat torso lean',
    fileName: 'reject-bounce.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.95,
  },
  {
    id: 'mocap-harlem-shake',
    title: 'Harlem Shoulder',
    genre: 'Club Hip-Hop',
    bpmLabel: '114 BPM',
    description: 'Rapid asymmetric shoulder shakes, torso twist & low knee bounce',
    fileName: 'harlem-shoulder.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.78,
  },
  {
    id: 'mocap-dougie',
    title: 'Smooth Dougie',
    genre: 'Hip-Hop Groove',
    bpmLabel: '94 BPM',
    description: 'Laid-back side-to-side swagger, shoulder dip & smooth hand brush',
    fileName: 'smooth-dougie.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['modern', 'slow'],
    previewTime: 1.2,
  },
  {
    id: 'mocap-voguing',
    title: 'Runway Vogue',
    genre: 'Ballroom Club',
    bpmLabel: '124 BPM',
    description: 'Dramatic face-framing hand poses, duckwalk drop & catwalk spin',
    fileName: 'runway-vogue.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 2.15,
  },
  {
    id: 'mocap-waacking',
    title: 'Whacking Whip',
    genre: 'Disco Club',
    bpmLabel: '126 BPM',
    description: 'High-speed overhead arm whips, sharp poses & runway strut',
    fileName: 'whacking-whip.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.05,
  },
  {
    id: 'mocap-tektonik',
    title: 'Electro Mill',
    genre: 'Electro Dance',
    bpmLabel: '130 BPM',
    description: 'Fast windmill arm orbits, crisp elbow snaps & agile heel pivots',
    fileName: 'electro-mill.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.88,
  },
  {
    id: 'mocap-jumpstyle',
    title: 'Hard Jumpstyle',
    genre: 'Hardstyle EDM',
    bpmLabel: '142 BPM',
    description: 'High-impact alternating forward/back leg kicks & airborne hops',
    fileName: 'hard-jumpstyle.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 1.1,
  },
  {
    id: 'mocap-cutting-shapes',
    title: 'Cutting Shapes',
    genre: 'Future House',
    bpmLabel: '126 BPM',
    description: 'Crisp criss-cross footwork glides, Charleston twists & upbeat bounce',
    fileName: 'cutting-shapes.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.96,
  },
  {
    id: 'mocap-hakken',
    title: 'Rave Hakken',
    genre: 'Gabber Festival',
    bpmLabel: '148 BPM',
    description: 'Relentless rapid-fire heel digs, hunched rave lean & tight fists',
    fileName: 'rave-hakken.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.68,
  },
  {
    id: 'mocap-cyber-goth',
    title: 'Industrial Stomp',
    genre: 'Dark Electro',
    bpmLabel: '128 BPM',
    description: 'Heavy marched boot stomps, sweeping crossed arms & dramatic head drops',
    fileName: 'industrial-stomp.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 1.42,
  },
  {
    id: 'mocap-trance-flow',
    title: 'Trance Euphoria',
    genre: 'Uplifting EDM',
    bpmLabel: '136 BPM',
    description: 'Hands-to-the-sky festival reach, buoyant bounce & euphoric spin',
    fileName: 'trance-euphoria.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['modern', 'slow'],
    previewTime: 2.05,
  },
  {
    id: 'mocap-robot-boogie',
    title: 'Servo Staccato',
    genre: 'Synth Electro',
    bpmLabel: '118 BPM',
    description: 'Step-quantized mechanical joint snaps, ticking neck & angular lock',
    fileName: 'servo-staccato.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['modern', 'classic'],
    previewTime: 1.0,
  },
  {
    id: 'mocap-bachata',
    title: 'Sensual Bachata',
    genre: 'Latin Romance',
    bpmLabel: '122 BPM',
    description: 'Three-step side glide with dramatic fourth-beat hip pop & body roll',
    fileName: 'sensual-bachata.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'classic'],
    previewTime: 1.25,
  },
  {
    id: 'mocap-samba',
    title: 'Rio Samba',
    genre: 'Brazilian Carnival',
    bpmLabel: '104 BPM',
    description: 'Bouncy knee samba bounce, rapid hip tilts & feathered carnival arms',
    fileName: 'rio-samba.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 0.92,
  },
  {
    id: 'mocap-merengue',
    title: 'Merengue March',
    genre: 'Dominican Latin',
    bpmLabel: '128 BPM',
    description: 'Crisp marching steps, swinging cuban hips & lively turn',
    fileName: 'merengue-march.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.1,
  },
  {
    id: 'mocap-cumbia',
    title: 'Cumbia Sway',
    genre: 'Colombian Folk',
    bpmLabel: '98 BPM',
    description: 'Grounded circular hip sway, alternating back-rock steps & flowing arms',
    fileName: 'cumbia-sway.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'classic'],
    previewTime: 1.32,
  },
  {
    id: 'mocap-reggaeton',
    title: 'Perreo Bounce',
    genre: 'Urbano Latin',
    bpmLabel: '96 BPM',
    description: 'Deep dembow hip drops, chest isolations & confident urban sway',
    fileName: 'perreo-bounce.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.9,
  },
  {
    id: 'mocap-chacha',
    title: 'Cha-Cha Lock',
    genre: 'Latin Ballroom',
    bpmLabel: '116 BPM',
    description: 'Syncopated chasse triple-step, sharp hip snaps & open arm styling',
    fileName: 'chacha-lock.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['classic', 'high-energy'],
    previewTime: 1.05,
  },
  {
    id: 'mocap-rumba',
    title: 'Cuban Rumba',
    genre: 'Ballroom Romance',
    bpmLabel: '100 BPM',
    description: 'Slow expressive hip settles, extended poise & sensual spin',
    fileName: 'cuban-rumba.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'classic'],
    previewTime: 1.6,
  },
  {
    id: 'mocap-pasodoble',
    title: 'Paso Doble Cape',
    genre: 'Spanish Drama',
    bpmLabel: '120 BPM',
    description: 'Arched matador chest, dramatic cape sweeps & crisp heel marches',
    fileName: 'pasodoble-cape.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.85,
  },
  {
    id: 'mocap-dancehall',
    title: 'Dancehall Wine',
    genre: 'Jamaican Groove',
    bpmLabel: '102 BPM',
    description: 'Deep waist rotations, butterfly knee bounces & high-energy shoulder hits',
    fileName: 'dancehall-wine.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 1.08,
  },
  {
    id: 'mocap-amapiano',
    title: 'Amapiano Shuffle',
    genre: 'South African Log',
    bpmLabel: '113 BPM',
    description: 'Pounce-step leg glides, relaxed log-drum bounce & shoulder roll',
    fileName: 'amapiano-shuffle.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['modern', 'high-energy'],
    previewTime: 0.94,
  },
  {
    id: 'mocap-foxtrot',
    title: 'Slow Foxtrot',
    genre: 'Classic Ballroom',
    bpmLabel: '112 BPM',
    description: 'Long gliding promenade strides, smooth rise & poised ballroom hold',
    fileName: 'slow-foxtrot.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'classic'],
    previewTime: 1.4,
  },
  {
    id: 'mocap-quickstep',
    title: 'Quickstep Dash',
    genre: 'Swing Ballroom',
    bpmLabel: '144 BPM',
    description: 'Airborne chasse hops, brisk ballroom frame & soaring promenade',
    fileName: 'quickstep-dash.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.12,
  },
  {
    id: 'mocap-jive',
    title: 'Swing Jive',
    genre: 'Rock & Roll',
    bpmLabel: '152 BPM',
    description: 'Snappy flick-ball-change kicks, springy knees & upbeat rock spin',
    fileName: 'swing-jive.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 0.9,
  },
  {
    id: 'mocap-lindy-hop',
    title: 'Lindy Hop Kick',
    genre: '1930s Swing',
    bpmLabel: '136 BPM',
    description: 'Grounded swing-out bounce, kicking steps & joyful counter-swing arms',
    fileName: 'lindy-hop-kick.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.02,
  },
  {
    id: 'mocap-charleston',
    title: 'Charleston Twist',
    genre: 'Roaring 20s',
    bpmLabel: '132 BPM',
    description: 'Inward/outward ankle twists, lively front/back kicks & wing arms',
    fileName: 'charleston-twist.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 0.88,
  },
  {
    id: 'mocap-twist',
    title: '60s Twist',
    genre: 'Retro Rock',
    bpmLabel: '128 BPM',
    description: 'Counter-rotating hips & shoulders with low bend-and-rise swivel',
    fileName: '60s-twist.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.15,
  },
  {
    id: 'mocap-mashed-potato',
    title: 'Mashed Potato',
    genre: 'Motown Soul',
    bpmLabel: '124 BPM',
    description: 'Alternating heel-swivel hops with rhythmic Motown arm swings',
    fileName: 'mashed-potato.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['classic', 'high-energy'],
    previewTime: 0.98,
  },
  {
    id: 'mocap-swing-out',
    title: 'East Coast Swing',
    genre: 'Jazz Swing',
    bpmLabel: '134 BPM',
    description: 'Rock-step triple-step cadence, bouncy torso & playful spin',
    fileName: 'east-coast-swing.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.38,
  },
  {
    id: 'mocap-flamenco',
    title: 'Flamenco Zapateo',
    genre: 'Andalusian',
    bpmLabel: '110 BPM',
    description: 'Proud arched back, circling overhead wrists & fiery heel stomps',
    fileName: 'flamenco-zapateo.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['classic', 'high-energy'],
    previewTime: 1.55,
  },
  {
    id: 'mocap-bollywood',
    title: 'Bollywood Bhangra',
    genre: 'Desi Pop',
    bpmLabel: '126 BPM',
    description: 'Expressive shoulder bounces, raised festive hands & lively side hops',
    fileName: 'bollywood-bhangra.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.0,
  },
  {
    id: 'mocap-bhangra',
    title: 'Punjabi Dhol',
    genre: 'Folk Energy',
    bpmLabel: '132 BPM',
    description: 'High knee-lift dhamaal hops, booming shoulder shakes & twin arms aloft',
    fileName: 'punjabi-dhol.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 0.85,
  },
  {
    id: 'mocap-capoeira',
    title: 'Capoeira Ginga',
    genre: 'Afro-Brazilian',
    bpmLabel: '118 BPM',
    description: 'Fluid defensive ginga lunge weave transitioning into high crescent kick',
    fileName: 'capoeira-ginga.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 2.35,
  },
  {
    id: 'mocap-irish-step',
    title: 'Celtic Step',
    genre: 'Irish Jig',
    bpmLabel: '128 BPM',
    description: 'Rigid upright torso with rapid-fire treble hops & crossed-ankle leaps',
    fileName: 'celtic-step.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 1.04,
  },
  {
    id: 'mocap-kazachok',
    title: 'Cossack Squat',
    genre: 'Slavic Folk',
    bpmLabel: '136 BPM',
    description: 'Deep crouched prisiadka kicks alternating left/right with folded arms',
    fileName: 'cossack-squat.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 0.9,
  },
  {
    id: 'mocap-bellydance',
    title: 'Oriental Shimmy',
    genre: 'World Fusion',
    bpmLabel: '104 BPM',
    description: 'Rapid hip shimmies, sinuous snake arms & isolated ribcage circles',
    fileName: 'oriental-shimmy.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'classic'],
    previewTime: 1.28,
  },
  {
    id: 'mocap-jazz-square',
    title: 'Broadway Jazz',
    genre: 'Theater Stage',
    bpmLabel: '116 BPM',
    description: 'Crisp jazz-square steps, jazz hands flare & stylized theatrical turn',
    fileName: 'broadway-jazz.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['classic', 'high-energy'],
    previewTime: 1.75,
  },
  {
    id: 'mocap-tap',
    title: 'Tap Shuffle',
    genre: 'Broadway Tap',
    bpmLabel: '124 BPM',
    description: 'Quick buffalo hops, ankle brush-backs & showman cane-swing balance',
    fileName: 'tap-shuffle.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 0.95,
  },
  {
    id: 'mocap-fosse',
    title: 'Fosse Snap',
    genre: 'Cabaret Jazz',
    bpmLabel: '106 BPM',
    description: 'Inward-turned knees, angled hat-tilt hunch & razor-sharp wrist snaps',
    fileName: 'fosse-snap.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'classic'],
    previewTime: 1.12,
  },
  {
    id: 'mocap-aerial-leap',
    title: 'Grand Jeté Leap',
    genre: 'Stage Ballet',
    bpmLabel: '94 BPM',
    description: 'Running chasse prep launching into soaring split grand jeté leap',
    fileName: 'grand-jete-leap.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'classic'],
    previewTime: 2.2,
  },
  {
    id: 'mocap-headbang',
    title: 'Arena Headbang',
    genre: 'Rock & Metal',
    bpmLabel: '140 BPM',
    description: 'Wide power stance, heavy rhythmic headbangs & triumphant fist pumps',
    fileName: 'arena-headbang.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['high-energy', 'modern'],
    previewTime: 0.85,
  },
  {
    id: 'mocap-chill-sway',
    title: 'Lo-Fi Breeze',
    genre: 'Ambient Chill',
    bpmLabel: '78 BPM',
    description: 'Unwinding slow shoulder sway, relaxed head bob & gentle weight shift',
    fileName: 'lofi-breeze.bvh',
    fps: 30,
    frameCount: 120,
    tags: ['slow', 'modern'],
    previewTime: 1.4,
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

  if (style === 'mocap-contemporary') {
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

  return solveRecipePose(style, u);
}

type ArmMode =
  | 'swing'
  | 'overhead'
  | 'vogue'
  | 'tutting'
  | 'lock'
  | 'wave'
  | 'punch'
  | 'ballroom'
  | 'flamenco'
  | 'bhangra'
  | 'chill'
  | 'hip-hands'
  | 'cape';

type LegMode =
  | 'step'
  | 'kick'
  | 'cross'
  | 'squat'
  | 'twist'
  | 'glide'
  | 'hop'
  | 'lunge'
  | 'tap'
  | 'arabesque';

interface MocapStyleRecipe {
  cycles: number;
  hipHeight: number;
  bounceAmp: number;
  swayX: number;
  swayZ: number;
  hipTwist: number;
  hipTilt: number;
  spinDeg?: number;
  spinStart?: number;
  spinEnd?: number;
  jumpStart?: number;
  jumpPeak?: number;
  jumpEnd?: number;
  jumpLift?: number;
  quantizeSteps?: number;
  spineBend: number;
  chestTwist: number;
  chestWave: number;
  headNod: number;
  headTilt: number;
  armMode: ArmMode;
  legMode: LegMode;
  armAmp: number;
  legAmp: number;
  kneeBend: number;
  stanceWidth: number;
}

const MOCAP_STYLE_RECIPES: Record<string, MocapStyleRecipe> = {
  'mocap-popping': {
    cycles: 4,
    hipHeight: 89,
    bounceAmp: 3.5,
    swayX: 4,
    swayZ: 2,
    hipTwist: 20,
    hipTilt: 6,
    quantizeSteps: 12,
    spineBend: 12,
    chestTwist: 18,
    chestWave: 14,
    headNod: 8,
    headTilt: 10,
    armMode: 'tutting',
    legMode: 'step',
    armAmp: 1.0,
    legAmp: 0.75,
    kneeBend: 18,
    stanceWidth: 10,
  },
  'mocap-locking': {
    cycles: 2,
    hipHeight: 86,
    bounceAmp: 5.5,
    swayX: 6,
    swayZ: 3,
    hipTwist: 26,
    hipTilt: 8,
    spineBend: 10,
    chestTwist: 16,
    chestWave: 8,
    headNod: 10,
    headTilt: 8,
    armMode: 'lock',
    legMode: 'step',
    armAmp: 1.2,
    legAmp: 0.95,
    kneeBend: 24,
    stanceWidth: 12,
  },
  'mocap-krump': {
    cycles: 4,
    hipHeight: 82,
    bounceAmp: 7,
    swayX: 8,
    swayZ: 6,
    hipTwist: 32,
    hipTilt: 10,
    spineBend: 22,
    chestTwist: 24,
    chestWave: 18,
    headNod: 16,
    headTilt: 12,
    armMode: 'punch',
    legMode: 'lunge',
    armAmp: 1.3,
    legAmp: 1.15,
    kneeBend: 32,
    stanceWidth: 18,
  },
  'mocap-tutting': {
    cycles: 2,
    hipHeight: 90,
    bounceAmp: 1.5,
    swayX: 3,
    swayZ: 1,
    hipTwist: 14,
    hipTilt: 3,
    quantizeSteps: 8,
    spineBend: 4,
    chestTwist: 12,
    chestWave: 6,
    headNod: 4,
    headTilt: 12,
    armMode: 'tutting',
    legMode: 'step',
    armAmp: 1.15,
    legAmp: 0.4,
    kneeBend: 12,
    stanceWidth: 8,
  },
  'mocap-waving': {
    cycles: 2,
    hipHeight: 89,
    bounceAmp: 2.5,
    swayX: 6,
    swayZ: 4,
    hipTwist: 16,
    hipTilt: 8,
    spineBend: 12,
    chestTwist: 14,
    chestWave: 18,
    headNod: 8,
    headTilt: 10,
    armMode: 'wave',
    legMode: 'glide',
    armAmp: 1.1,
    legAmp: 0.65,
    kneeBend: 16,
    stanceWidth: 10,
  },
  'mocap-boogaloo': {
    cycles: 2,
    hipHeight: 88,
    bounceAmp: 4.5,
    swayX: 8,
    swayZ: 4,
    hipTwist: 28,
    hipTilt: 14,
    spineBend: 10,
    chestTwist: 20,
    chestWave: 14,
    headNod: 6,
    headTilt: 14,
    armMode: 'wave',
    legMode: 'twist',
    armAmp: 1.0,
    legAmp: 0.9,
    kneeBend: 22,
    stanceWidth: 12,
  },
  'mocap-cwalk': {
    cycles: 4,
    hipHeight: 89,
    bounceAmp: 3,
    swayX: 7,
    swayZ: 3,
    hipTwist: 24,
    hipTilt: 6,
    spineBend: 6,
    chestTwist: 10,
    chestWave: 4,
    headNod: 6,
    headTilt: 4,
    armMode: 'chill',
    legMode: 'cross',
    armAmp: 0.55,
    legAmp: 1.1,
    kneeBend: 18,
    stanceWidth: 11,
  },
  'mocap-jerkin': {
    cycles: 4,
    hipHeight: 88,
    bounceAmp: 6.5,
    swayX: 5,
    swayZ: 6,
    hipTwist: 14,
    hipTilt: 5,
    jumpStart: 0.15,
    jumpPeak: 0.5,
    jumpEnd: 0.85,
    jumpLift: 6,
    spineBend: -12,
    chestTwist: 12,
    chestWave: 8,
    headNod: 10,
    headTilt: 6,
    armMode: 'swing',
    legMode: 'kick',
    armAmp: 0.95,
    legAmp: 1.15,
    kneeBend: 24,
    stanceWidth: 9,
  },
  'mocap-harlem-shake': {
    cycles: 4,
    hipHeight: 86,
    bounceAmp: 5,
    swayX: 6,
    swayZ: 3,
    hipTwist: 22,
    hipTilt: 10,
    spineBend: 14,
    chestTwist: 28,
    chestWave: 16,
    headNod: 10,
    headTilt: 14,
    armMode: 'punch',
    legMode: 'step',
    armAmp: 0.85,
    legAmp: 0.8,
    kneeBend: 26,
    stanceWidth: 14,
  },
  'mocap-dougie': {
    cycles: 2,
    hipHeight: 89,
    bounceAmp: 3.5,
    swayX: 8,
    swayZ: 2,
    hipTwist: 18,
    hipTilt: 10,
    spineBend: 6,
    chestTwist: 14,
    chestWave: 8,
    headNod: 8,
    headTilt: 12,
    armMode: 'chill',
    legMode: 'step',
    armAmp: 0.85,
    legAmp: 0.75,
    kneeBend: 18,
    stanceWidth: 12,
  },
  'mocap-voguing': {
    cycles: 2,
    hipHeight: 86,
    bounceAmp: 4,
    swayX: 7,
    swayZ: 4,
    hipTwist: 32,
    hipTilt: 10,
    spinDeg: 360,
    spinStart: 0.52,
    spinEnd: 0.84,
    quantizeSteps: 8,
    spineBend: -8,
    chestTwist: 22,
    chestWave: 10,
    headNod: 6,
    headTilt: 16,
    armMode: 'vogue',
    legMode: 'lunge',
    armAmp: 1.25,
    legAmp: 1.0,
    kneeBend: 24,
    stanceWidth: 10,
  },
  'mocap-waacking': {
    cycles: 4,
    hipHeight: 90,
    bounceAmp: 3.5,
    swayX: 6,
    swayZ: 3,
    hipTwist: 24,
    hipTilt: 10,
    spineBend: -6,
    chestTwist: 20,
    chestWave: 8,
    headNod: 8,
    headTilt: 10,
    armMode: 'overhead',
    legMode: 'step',
    armAmp: 1.35,
    legAmp: 0.85,
    kneeBend: 14,
    stanceWidth: 9,
  },
  'mocap-tektonik': {
    cycles: 4,
    hipHeight: 90,
    bounceAmp: 3,
    swayX: 5,
    swayZ: 3,
    hipTwist: 26,
    hipTilt: 6,
    spineBend: 6,
    chestTwist: 24,
    chestWave: 10,
    headNod: 8,
    headTilt: 8,
    armMode: 'overhead',
    legMode: 'twist',
    armAmp: 1.25,
    legAmp: 0.85,
    kneeBend: 16,
    stanceWidth: 10,
  },
  'mocap-jumpstyle': {
    cycles: 4,
    hipHeight: 89,
    bounceAmp: 7,
    swayX: 4,
    swayZ: 5,
    hipTwist: 12,
    hipTilt: 4,
    jumpStart: 0.1,
    jumpPeak: 0.5,
    jumpEnd: 0.9,
    jumpLift: 9,
    spineBend: 8,
    chestTwist: 12,
    chestWave: 6,
    headNod: 10,
    headTilt: 4,
    armMode: 'swing',
    legMode: 'kick',
    armAmp: 1.05,
    legAmp: 1.35,
    kneeBend: 22,
    stanceWidth: 8,
  },
  'mocap-cutting-shapes': {
    cycles: 4,
    hipHeight: 89,
    bounceAmp: 4.5,
    swayX: 7,
    swayZ: 3,
    hipTwist: 22,
    hipTilt: 6,
    spineBend: 6,
    chestTwist: 14,
    chestWave: 6,
    headNod: 6,
    headTilt: 6,
    armMode: 'swing',
    legMode: 'cross',
    armAmp: 0.9,
    legAmp: 1.2,
    kneeBend: 20,
    stanceWidth: 10,
  },
  'mocap-hakken': {
    cycles: 4,
    hipHeight: 85,
    bounceAmp: 6,
    swayX: 4,
    swayZ: 5,
    hipTwist: 16,
    hipTilt: 4,
    spineBend: 18,
    chestTwist: 16,
    chestWave: 6,
    headNod: 14,
    headTilt: 4,
    armMode: 'punch',
    legMode: 'hop',
    armAmp: 0.9,
    legAmp: 1.1,
    kneeBend: 28,
    stanceWidth: 10,
  },
  'mocap-cyber-goth': {
    cycles: 2,
    hipHeight: 86,
    bounceAmp: 5.5,
    swayX: 6,
    swayZ: 4,
    hipTwist: 22,
    hipTilt: 6,
    spineBend: 16,
    chestTwist: 18,
    chestWave: 10,
    headNod: 14,
    headTilt: 10,
    armMode: 'vogue',
    legMode: 'lunge',
    armAmp: 1.15,
    legAmp: 1.05,
    kneeBend: 28,
    stanceWidth: 16,
  },
  'mocap-trance-flow': {
    cycles: 2,
    hipHeight: 91,
    bounceAmp: 4.5,
    swayX: 6,
    swayZ: 3,
    hipTwist: 18,
    hipTilt: 6,
    spinDeg: 360,
    spinStart: 0.45,
    spinEnd: 0.85,
    spineBend: -10,
    chestTwist: 12,
    chestWave: 12,
    headNod: 8,
    headTilt: 6,
    armMode: 'overhead',
    legMode: 'step',
    armAmp: 1.25,
    legAmp: 0.65,
    kneeBend: 14,
    stanceWidth: 11,
  },
  'mocap-robot-boogie': {
    cycles: 4,
    hipHeight: 90,
    bounceAmp: 2,
    swayX: 3,
    swayZ: 2,
    hipTwist: 26,
    hipTilt: 4,
    quantizeSteps: 10,
    spineBend: 8,
    chestTwist: 24,
    chestWave: 4,
    headNod: 12,
    headTilt: 16,
    armMode: 'tutting',
    legMode: 'step',
    armAmp: 1.1,
    legAmp: 0.65,
    kneeBend: 14,
    stanceWidth: 12,
  },
  'mocap-bachata': {
    cycles: 2,
    hipHeight: 89,
    bounceAmp: 2.5,
    swayX: 9,
    swayZ: 3,
    hipTwist: 14,
    hipTilt: 16,
    spineBend: 4,
    chestTwist: 12,
    chestWave: 14,
    headNod: 4,
    headTilt: 8,
    armMode: 'ballroom',
    legMode: 'glide',
    armAmp: 0.85,
    legAmp: 0.85,
    kneeBend: 16,
    stanceWidth: 10,
  },
  'mocap-samba': {
    cycles: 4,
    hipHeight: 88,
    bounceAmp: 5.5,
    swayX: 6,
    swayZ: 4,
    hipTwist: 24,
    hipTilt: 14,
    spineBend: 4,
    chestTwist: 18,
    chestWave: 10,
    headNod: 6,
    headTilt: 6,
    armMode: 'bhangra',
    legMode: 'hop',
    armAmp: 1.1,
    legAmp: 0.95,
    kneeBend: 24,
    stanceWidth: 10,
  },
  'mocap-merengue': {
    cycles: 4,
    hipHeight: 89,
    bounceAmp: 3.5,
    swayX: 6,
    swayZ: 2,
    hipTwist: 20,
    hipTilt: 14,
    spinDeg: 360,
    spinStart: 0.55,
    spinEnd: 0.88,
    spineBend: 3,
    chestTwist: 14,
    chestWave: 8,
    headNod: 4,
    headTilt: 6,
    armMode: 'ballroom',
    legMode: 'step',
    armAmp: 0.85,
    legAmp: 0.85,
    kneeBend: 18,
    stanceWidth: 9,
  },
  'mocap-cumbia': {
    cycles: 2,
    hipHeight: 88,
    bounceAmp: 3,
    swayX: 8,
    swayZ: 4,
    hipTwist: 22,
    hipTilt: 12,
    spineBend: 6,
    chestTwist: 14,
    chestWave: 10,
    headNod: 4,
    headTilt: 6,
    armMode: 'wave',
    legMode: 'glide',
    armAmp: 0.95,
    legAmp: 0.8,
    kneeBend: 20,
    stanceWidth: 11,
  },
  'mocap-reggaeton': {
    cycles: 2,
    hipHeight: 85,
    bounceAmp: 6,
    swayX: 6,
    swayZ: 6,
    hipTwist: 20,
    hipTilt: 14,
    spineBend: 14,
    chestTwist: 18,
    chestWave: 18,
    headNod: 10,
    headTilt: 8,
    armMode: 'hip-hands',
    legMode: 'squat',
    armAmp: 0.85,
    legAmp: 0.8,
    kneeBend: 30,
    stanceWidth: 15,
  },
  'mocap-chacha': {
    cycles: 4,
    hipHeight: 90,
    bounceAmp: 3,
    swayX: 7,
    swayZ: 3,
    hipTwist: 24,
    hipTilt: 14,
    spineBend: 2,
    chestTwist: 18,
    chestWave: 8,
    headNod: 4,
    headTilt: 6,
    armMode: 'flamenco',
    legMode: 'cross',
    armAmp: 1.05,
    legAmp: 0.95,
    kneeBend: 16,
    stanceWidth: 9,
  },
  'mocap-rumba': {
    cycles: 2,
    hipHeight: 90,
    bounceAmp: 2,
    swayX: 9,
    swayZ: 4,
    hipTwist: 18,
    hipTilt: 16,
    spinDeg: 360,
    spinStart: 0.58,
    spinEnd: 0.92,
    spineBend: -4,
    chestTwist: 14,
    chestWave: 12,
    headNod: 4,
    headTilt: 8,
    armMode: 'wave',
    legMode: 'lunge',
    armAmp: 1.05,
    legAmp: 0.85,
    kneeBend: 14,
    stanceWidth: 11,
  },
  'mocap-pasodoble': {
    cycles: 2,
    hipHeight: 91,
    bounceAmp: 3,
    swayX: 6,
    swayZ: 5,
    hipTwist: 28,
    hipTilt: 6,
    spinDeg: 360,
    spinStart: 0.5,
    spinEnd: 0.82,
    spineBend: -12,
    chestTwist: 22,
    chestWave: 6,
    headNod: 6,
    headTilt: 12,
    armMode: 'cape',
    legMode: 'lunge',
    armAmp: 1.25,
    legAmp: 1.05,
    kneeBend: 18,
    stanceWidth: 12,
  },
  'mocap-dancehall': {
    cycles: 4,
    hipHeight: 85,
    bounceAmp: 5.5,
    swayX: 7,
    swayZ: 5,
    hipTwist: 26,
    hipTilt: 16,
    spineBend: 14,
    chestTwist: 20,
    chestWave: 16,
    headNod: 8,
    headTilt: 8,
    armMode: 'hip-hands',
    legMode: 'squat',
    armAmp: 0.95,
    legAmp: 0.95,
    kneeBend: 28,
    stanceWidth: 16,
  },
  'mocap-amapiano': {
    cycles: 2,
    hipHeight: 88,
    bounceAmp: 4.5,
    swayX: 7,
    swayZ: 3,
    hipTwist: 18,
    hipTilt: 10,
    spineBend: 8,
    chestTwist: 14,
    chestWave: 12,
    headNod: 6,
    headTilt: 8,
    armMode: 'chill',
    legMode: 'glide',
    armAmp: 0.8,
    legAmp: 1.0,
    kneeBend: 20,
    stanceWidth: 11,
  },
  'mocap-foxtrot': {
    cycles: 2,
    hipHeight: 91,
    bounceAmp: 3.5,
    swayX: 8,
    swayZ: 6,
    hipTwist: 22,
    hipTilt: 6,
    spineBend: -4,
    chestTwist: 10,
    chestWave: 4,
    headNod: 2,
    headTilt: 8,
    armMode: 'ballroom',
    legMode: 'glide',
    armAmp: 0.95,
    legAmp: 1.05,
    kneeBend: 14,
    stanceWidth: 9,
  },
  'mocap-quickstep': {
    cycles: 4,
    hipHeight: 91,
    bounceAmp: 5.5,
    swayX: 8,
    swayZ: 5,
    hipTwist: 28,
    hipTilt: 6,
    jumpStart: 0.25,
    jumpPeak: 0.5,
    jumpEnd: 0.75,
    jumpLift: 6,
    spineBend: -5,
    chestTwist: 12,
    chestWave: 4,
    headNod: 4,
    headTilt: 8,
    armMode: 'ballroom',
    legMode: 'hop',
    armAmp: 1.0,
    legAmp: 1.15,
    kneeBend: 18,
    stanceWidth: 9,
  },
  'mocap-jive': {
    cycles: 4,
    hipHeight: 88,
    bounceAmp: 6,
    swayX: 6,
    swayZ: 4,
    hipTwist: 24,
    hipTilt: 8,
    spinDeg: 360,
    spinStart: 0.62,
    spinEnd: 0.92,
    spineBend: 4,
    chestTwist: 18,
    chestWave: 6,
    headNod: 8,
    headTilt: 6,
    armMode: 'swing',
    legMode: 'kick',
    armAmp: 1.1,
    legAmp: 1.25,
    kneeBend: 24,
    stanceWidth: 10,
  },
  'mocap-lindy-hop': {
    cycles: 4,
    hipHeight: 86,
    bounceAmp: 5.5,
    swayX: 7,
    swayZ: 4,
    hipTwist: 26,
    hipTilt: 8,
    spineBend: 10,
    chestTwist: 18,
    chestWave: 6,
    headNod: 8,
    headTilt: 6,
    armMode: 'swing',
    legMode: 'kick',
    armAmp: 1.1,
    legAmp: 1.15,
    kneeBend: 28,
    stanceWidth: 12,
  },
  'mocap-charleston': {
    cycles: 4,
    hipHeight: 88,
    bounceAmp: 5,
    swayX: 6,
    swayZ: 4,
    hipTwist: 24,
    hipTilt: 8,
    spineBend: 6,
    chestTwist: 20,
    chestWave: 6,
    headNod: 8,
    headTilt: 8,
    armMode: 'swing',
    legMode: 'twist',
    armAmp: 1.15,
    legAmp: 1.2,
    kneeBend: 22,
    stanceWidth: 11,
  },
  'mocap-twist': {
    cycles: 4,
    hipHeight: 87,
    bounceAmp: 4.5,
    swayX: 5,
    swayZ: 2,
    hipTwist: 38,
    hipTilt: 10,
    spineBend: 8,
    chestTwist: -32,
    chestWave: 6,
    headNod: 6,
    headTilt: 6,
    armMode: 'lock',
    legMode: 'twist',
    armAmp: 0.95,
    legAmp: 1.0,
    kneeBend: 26,
    stanceWidth: 11,
  },
  'mocap-mashed-potato': {
    cycles: 4,
    hipHeight: 88,
    bounceAmp: 4.5,
    swayX: 5,
    swayZ: 3,
    hipTwist: 28,
    hipTilt: 8,
    spineBend: 6,
    chestTwist: 18,
    chestWave: 6,
    headNod: 6,
    headTilt: 6,
    armMode: 'swing',
    legMode: 'twist',
    armAmp: 1.0,
    legAmp: 1.05,
    kneeBend: 22,
    stanceWidth: 10,
  },
  'mocap-swing-out': {
    cycles: 2,
    hipHeight: 88,
    bounceAmp: 4.5,
    swayX: 8,
    swayZ: 5,
    hipTwist: 30,
    hipTilt: 8,
    spinDeg: 360,
    spinStart: 0.45,
    spinEnd: 0.78,
    spineBend: 6,
    chestTwist: 16,
    chestWave: 6,
    headNod: 6,
    headTilt: 6,
    armMode: 'swing',
    legMode: 'step',
    armAmp: 1.1,
    legAmp: 1.0,
    kneeBend: 22,
    stanceWidth: 11,
  },
  'mocap-flamenco': {
    cycles: 2,
    hipHeight: 90,
    bounceAmp: 3,
    swayX: 5,
    swayZ: 3,
    hipTwist: 20,
    hipTilt: 8,
    spineBend: -14,
    chestTwist: 18,
    chestWave: 8,
    headNod: 4,
    headTilt: 12,
    armMode: 'flamenco',
    legMode: 'tap',
    armAmp: 1.2,
    legAmp: 1.0,
    kneeBend: 18,
    stanceWidth: 9,
  },
  'mocap-bollywood': {
    cycles: 4,
    hipHeight: 89,
    bounceAmp: 4.5,
    swayX: 7,
    swayZ: 3,
    hipTwist: 20,
    hipTilt: 12,
    spineBend: 4,
    chestTwist: 18,
    chestWave: 12,
    headNod: 6,
    headTilt: 14,
    armMode: 'bhangra',
    legMode: 'step',
    armAmp: 1.15,
    legAmp: 0.9,
    kneeBend: 20,
    stanceWidth: 11,
  },
  'mocap-bhangra': {
    cycles: 4,
    hipHeight: 88,
    bounceAmp: 6.5,
    swayX: 6,
    swayZ: 3,
    hipTwist: 18,
    hipTilt: 10,
    jumpStart: 0.12,
    jumpPeak: 0.5,
    jumpEnd: 0.88,
    jumpLift: 6,
    spineBend: 6,
    chestTwist: 16,
    chestWave: 10,
    headNod: 8,
    headTilt: 10,
    armMode: 'bhangra',
    legMode: 'hop',
    armAmp: 1.3,
    legAmp: 1.25,
    kneeBend: 26,
    stanceWidth: 12,
  },
  'mocap-capoeira': {
    cycles: 2,
    hipHeight: 80,
    bounceAmp: 6,
    swayX: 12,
    swayZ: 8,
    hipTwist: 36,
    hipTilt: 10,
    jumpStart: 0.58,
    jumpPeak: 0.72,
    jumpEnd: 0.86,
    jumpLift: 5,
    spineBend: 20,
    chestTwist: 24,
    chestWave: 8,
    headNod: 6,
    headTilt: 10,
    armMode: 'punch',
    legMode: 'kick',
    armAmp: 1.1,
    legAmp: 1.4,
    kneeBend: 36,
    stanceWidth: 18,
  },
  'mocap-irish-step': {
    cycles: 4,
    hipHeight: 92,
    bounceAmp: 5.5,
    swayX: 3,
    swayZ: 2,
    hipTwist: 10,
    hipTilt: 3,
    jumpStart: 0.2,
    jumpPeak: 0.5,
    jumpEnd: 0.8,
    jumpLift: 6,
    spineBend: -4,
    chestTwist: 4,
    chestWave: 2,
    headNod: 2,
    headTilt: 2,
    armMode: 'chill',
    legMode: 'tap',
    armAmp: 0.18,
    legAmp: 1.3,
    kneeBend: 18,
    stanceWidth: 7,
  },
  'mocap-kazachok': {
    cycles: 4,
    hipHeight: 70,
    bounceAmp: 5,
    swayX: 4,
    swayZ: 4,
    hipTwist: 12,
    hipTilt: 4,
    spineBend: 10,
    chestTwist: 8,
    chestWave: 4,
    headNod: 6,
    headTilt: 4,
    armMode: 'hip-hands',
    legMode: 'squat',
    armAmp: 0.5,
    legAmp: 1.35,
    kneeBend: 62,
    stanceWidth: 14,
  },
  'mocap-bellydance': {
    cycles: 4,
    hipHeight: 89,
    bounceAmp: 2,
    swayX: 9,
    swayZ: 4,
    hipTwist: 26,
    hipTilt: 18,
    spineBend: -4,
    chestTwist: 16,
    chestWave: 18,
    headNod: 4,
    headTilt: 8,
    armMode: 'wave',
    legMode: 'step',
    armAmp: 1.1,
    legAmp: 0.45,
    kneeBend: 14,
    stanceWidth: 10,
  },
  'mocap-jazz-square': {
    cycles: 2,
    hipHeight: 90,
    bounceAmp: 3.5,
    swayX: 8,
    swayZ: 6,
    hipTwist: 24,
    hipTilt: 8,
    spinDeg: 360,
    spinStart: 0.56,
    spinEnd: 0.86,
    spineBend: 4,
    chestTwist: 18,
    chestWave: 8,
    headNod: 6,
    headTilt: 8,
    armMode: 'vogue',
    legMode: 'cross',
    armAmp: 1.15,
    legAmp: 1.0,
    kneeBend: 18,
    stanceWidth: 10,
  },
  'mocap-tap': {
    cycles: 4,
    hipHeight: 90,
    bounceAmp: 4,
    swayX: 5,
    swayZ: 3,
    hipTwist: 18,
    hipTilt: 6,
    spineBend: 6,
    chestTwist: 14,
    chestWave: 4,
    headNod: 6,
    headTilt: 8,
    armMode: 'swing',
    legMode: 'tap',
    armAmp: 0.9,
    legAmp: 1.25,
    kneeBend: 20,
    stanceWidth: 8,
  },
  'mocap-fosse': {
    cycles: 2,
    hipHeight: 87,
    bounceAmp: 2.5,
    swayX: 6,
    swayZ: 2,
    hipTwist: 20,
    hipTilt: 12,
    quantizeSteps: 8,
    spineBend: 12,
    chestTwist: 18,
    chestWave: 10,
    headNod: 6,
    headTilt: 16,
    armMode: 'hip-hands',
    legMode: 'twist',
    armAmp: 0.9,
    legAmp: 0.7,
    kneeBend: 26,
    stanceWidth: 8,
  },
  'mocap-aerial-leap': {
    cycles: 1,
    hipHeight: 91,
    bounceAmp: 3,
    swayX: 6,
    swayZ: 8,
    hipTwist: 16,
    hipTilt: 6,
    jumpStart: 0.35,
    jumpPeak: 0.58,
    jumpEnd: 0.82,
    jumpLift: 16,
    spineBend: -10,
    chestTwist: 12,
    chestWave: 8,
    headNod: -6,
    headTilt: 8,
    armMode: 'overhead',
    legMode: 'arabesque',
    armAmp: 1.25,
    legAmp: 1.35,
    kneeBend: 14,
    stanceWidth: 9,
  },
  'mocap-headbang': {
    cycles: 4,
    hipHeight: 84,
    bounceAmp: 5.5,
    swayX: 4,
    swayZ: 4,
    hipTwist: 12,
    hipTilt: 4,
    spineBend: 22,
    chestTwist: 12,
    chestWave: 12,
    headNod: 28,
    headTilt: 6,
    armMode: 'punch',
    legMode: 'lunge',
    armAmp: 1.15,
    legAmp: 0.65,
    kneeBend: 28,
    stanceWidth: 18,
  },
  'mocap-chill-sway': {
    cycles: 1,
    hipHeight: 90,
    bounceAmp: 2.5,
    swayX: 6,
    swayZ: 2,
    hipTwist: 10,
    hipTilt: 6,
    spineBend: 4,
    chestTwist: 8,
    chestWave: 6,
    headNod: 8,
    headTilt: 8,
    armMode: 'chill',
    legMode: 'step',
    armAmp: 0.65,
    legAmp: 0.5,
    kneeBend: 12,
    stanceWidth: 10,
  },
};

function solveRecipePose(style: BuiltInMocapStyleKey, uRaw: number): PoseChannels {
  const recipe = MOCAP_STYLE_RECIPES[style];
  const u = recipe.quantizeSteps
    ? Math.floor(uRaw * recipe.quantizeSteps) / recipe.quantizeSteps +
      smoothStep(0, 0.35, (uRaw * recipe.quantizeSteps) % 1) / recipe.quantizeSteps
    : uRaw;

  const tau = Math.PI * 2;
  const phase = u * tau * recipe.cycles;
  const halfPhase = u * tau * Math.max(1, recipe.cycles * 0.5);
  const dblPhase = u * tau * Math.min(8, recipe.cycles * 2);

  const s1 = Math.sin(phase);
  const c1 = Math.cos(phase);
  const sHalf = Math.sin(halfPhase);
  const bounce = Math.abs(Math.sin(phase));

  const spinY =
    recipe.spinDeg && recipe.spinStart !== undefined && recipe.spinEnd !== undefined
      ? smoothStep(recipe.spinStart, recipe.spinEnd, uRaw) * recipe.spinDeg
      : 0;
  const jumpEnv =
    recipe.jumpLift && recipe.jumpStart !== undefined && recipe.jumpPeak !== undefined && recipe.jumpEnd !== undefined
      ? bellWindow(uRaw, recipe.jumpStart, recipe.jumpPeak, recipe.jumpEnd)
      : 0;

  const hipY =
    recipe.hipHeight - bounce * recipe.bounceAmp + jumpEnv * (recipe.jumpLift ?? 0);

  // Arm choreography solver by mode
  let lSh: [number, number, number] = [20, 44, 0];
  let lEl: [number, number, number] = [44, -22, 0];
  let lWr: [number, number, number] = [0, -10, 0];
  let rSh: [number, number, number] = [-20, -44, 0];
  let rEl: [number, number, number] = [-44, 22, 0];
  let rWr: [number, number, number] = [0, 10, 0];
  const a = recipe.armAmp;

  switch (recipe.armMode) {
    case 'overhead': {
      const upL = Math.max(0, s1);
      const upR = Math.max(0, -s1);
      lSh = [18 * a, 58 - upL * 116 * a, 0];
      lEl = [32 + (1 - upL) * 28, -24, 0];
      rSh = [-18 * a, -58 + upR * 116 * a, 0];
      rEl = [-32 - (1 - upR) * 28, 24, 0];
      break;
    }
    case 'vogue': {
      lSh = [32 * a, 42 - Math.max(0, s1) * 96 * a, 0];
      lEl = [88 * a, -36 * c1, 0];
      lWr = [14, -26 * s1, 0];
      rSh = [-32 * a, -42 + Math.max(0, -s1) * 96 * a, 0];
      rEl = [-88 * a, 36 * c1, 0];
      rWr = [-14, 26 * s1, 0];
      break;
    }
    case 'tutting': {
      const swap = sHalf >= 0 ? 1 : -1;
      lSh = [48 * a * swap, 12 - 22 * s1 * a, 0];
      lEl = [88 * a, -88 * swap, 0];
      lWr = [0, 88 * s1, 0];
      rSh = [-48 * a * swap, -12 + 22 * s1 * a, 0];
      rEl = [-88 * a, 88 * swap, 0];
      rWr = [0, -88 * s1, 0];
      break;
    }
    case 'lock': {
      const pointUp = Math.max(0, s1);
      lSh = [30 * a, 52 - pointUp * 110 * a, 0];
      lEl = [72 * (1 - pointUp), -32, 0];
      rSh = [-30 * a, -52 + (1 - pointUp) * 80 * a, 0];
      rEl = [-68, 28, 0];
      break;
    }
    case 'wave': {
      const wA = Math.sin(phase);
      const wB = Math.sin(phase - 0.9);
      const wC = Math.sin(phase - 1.8);
      lSh = [22, 20 + wA * 48 * a, 0];
      lEl = [38, wB * 48 * a, 0];
      lWr = [0, wC * 32 * a, 0];
      rSh = [-22, -20 + wA * 48 * a, 0];
      rEl = [-38, wB * 48 * a, 0];
      rWr = [0, wC * 32 * a, 0];
      break;
    }
    case 'punch': {
      const pL = Math.max(0, s1);
      const pR = Math.max(0, -s1);
      lSh = [28 + pL * 42 * a, 54 - pL * 42 * a, 0];
      lEl = [76 * (1 - pL * 0.7), -28, 0];
      rSh = [-28 - pR * 42 * a, -54 + pR * 42 * a, 0];
      rEl = [-76 * (1 - pR * 0.7), 28, 0];
      break;
    }
    case 'ballroom': {
      lSh = [34, 8 + s1 * 10 * a, 0];
      lEl = [56, -24, 0];
      lWr = [10, -10, 0];
      rSh = [-34, -8 - s1 * 10 * a, 0];
      rEl = [-56, 24, 0];
      rWr = [-10, 10, 0];
      break;
    }
    case 'flamenco': {
      lSh = [28, -42 - s1 * 24 * a, 0];
      lEl = [54, -46, 0];
      lWr = [18, -32 * c1, 0];
      rSh = [-28, 38 - c1 * 24 * a, 0];
      rEl = [-64, 34, 0];
      rWr = [-18, 32 * s1, 0];
      break;
    }
    case 'bhangra': {
      lSh = [24 + s1 * 18 * a, -38 + bounce * 18 * a, 0];
      lEl = [78, -42, 0];
      lWr = [12, 22 * Math.sin(dblPhase), 0];
      rSh = [-24 + s1 * 18 * a, 38 - bounce * 18 * a, 0];
      rEl = [-78, 42, 0];
      rWr = [-12, -22 * Math.sin(dblPhase), 0];
      break;
    }
    case 'hip-hands': {
      lSh = [18, 48 + s1 * 14 * a, 0];
      lEl = [74, 24, 0];
      rSh = [-18, -48 + s1 * 14 * a, 0];
      rEl = [-74, -24, 0];
      break;
    }
    case 'cape': {
      lSh = [38 * a, 12 - Math.max(0, s1) * 52 * a, 0];
      lEl = [48, -22, 0];
      rSh = [-38 * a, -24 + Math.max(0, -s1) * 64 * a, 0];
      rEl = [-54, 24, 0];
      break;
    }
    case 'chill': {
      lSh = [16 + s1 * 22 * a, 58 - c1 * 10 * a, 0];
      lEl = [38 + bounce * 14 * a, -20, 0];
      rSh = [-16 + s1 * 22 * a, -58 - c1 * 10 * a, 0];
      rEl = [-38 - bounce * 14 * a, 20, 0];
      break;
    }
    default: {
      // 'swing'
      lSh = [18 - s1 * 36 * a, 52 - bounce * 14, 0];
      lEl = [56 + bounce * 16, -24, 0];
      rSh = [-18 - s1 * 36 * a, -52 + bounce * 14, 0];
      rEl = [-56 - bounce * 16, 24, 0];
      break;
    }
  }

  // Leg choreography solver by mode
  const liftL = Math.max(0, s1);
  const liftR = Math.max(0, -s1);
  const sw = recipe.stanceWidth;
  const la = recipe.legAmp;
  const kb = recipe.kneeBend;

  let lHip: [number, number, number] = [0, -sw, -12];
  let lKnee: [number, number, number] = [kb, 0, 0];
  let lAnkle: [number, number, number] = [-6, 0, 0];
  let rHip: [number, number, number] = [0, sw, -12];
  let rKnee: [number, number, number] = [kb, 0, 0];
  let rAnkle: [number, number, number] = [-6, 0, 0];

  switch (recipe.legMode) {
    case 'kick': {
      lHip = [liftL * 10, -sw - liftL * 8, -liftL * 64 * la + liftR * 16 * la];
      lKnee = [kb * (1 - liftL * 0.65) + liftR * 24, 0, 0];
      lAnkle = [liftL * 24, 0, 0];
      rHip = [-liftR * 10, sw + liftR * 8, -liftR * 64 * la + liftL * 16 * la];
      rKnee = [kb * (1 - liftR * 0.65) + liftL * 24, 0, 0];
      rAnkle = [liftR * 24, 0, 0];
      break;
    }
    case 'cross': {
      lHip = [s1 * 22 * la, -sw + s1 * 18 * la, -24 * liftL * la - 6];
      lKnee = [kb + liftL * 42 * la, 0, 0];
      lAnkle = [-6 + liftL * 14, 0, 0];
      rHip = [s1 * 22 * la, sw + s1 * 18 * la, -24 * liftR * la - 6];
      rKnee = [kb + liftR * 42 * la, 0, 0];
      rAnkle = [-6 + liftR * 14, 0, 0];
      break;
    }
    case 'squat': {
      lHip = [s1 * 12, -sw - 8, -kb * 0.65 - liftL * 38 * la];
      lKnee = [kb * 1.15 + liftL * 20, 0, 0];
      lAnkle = [-14, 0, 0];
      rHip = [s1 * 12, sw + 8, -kb * 0.65 - liftR * 38 * la];
      rKnee = [kb * 1.15 + liftR * 20, 0, 0];
      rAnkle = [-14, 0, 0];
      break;
    }
    case 'twist': {
      lHip = [s1 * 32 * la, -sw - liftL * 12, -16 - liftL * 20 * la];
      lKnee = [kb + liftL * 26, 0, 0];
      lAnkle = [s1 * 18, 0, 0];
      rHip = [s1 * 32 * la, sw + liftR * 12, -16 - liftR * 20 * la];
      rKnee = [kb + liftR * 26, 0, 0];
      rAnkle = [s1 * 18, 0, 0];
      break;
    }
    case 'glide': {
      lHip = [0, -sw - liftL * 14 * la, -32 * liftL * la + 18 * liftR * la];
      lKnee = [kb * 0.5 + liftL * 48 * la, 0, 0];
      lAnkle = [-liftL * 18 + liftR * 16, 0, 0];
      rHip = [0, sw + liftR * 14 * la, -32 * liftR * la + 18 * liftL * la];
      rKnee = [kb * 0.5 + liftR * 48 * la, 0, 0];
      rAnkle = [-liftR * 18 + liftL * 16, 0, 0];
      break;
    }
    case 'hop': {
      lHip = [0, -sw - liftL * 10, -46 * liftL * la - 6];
      lKnee = [kb + liftL * 78 * la, 0, 0];
      lAnkle = [liftL * 22, 0, 0];
      rHip = [0, sw + liftR * 10, -46 * liftR * la - 6];
      rKnee = [kb + liftR * 78 * la, 0, 0];
      rAnkle = [liftR * 22, 0, 0];
      break;
    }
    case 'lunge': {
      lHip = [s1 * 10, -sw - 10 - liftL * 14, -22 - liftL * 24 * la];
      lKnee = [kb + liftL * 32, 0, 0];
      lAnkle = [-10, 0, 0];
      rHip = [s1 * 10, sw + 10 + liftR * 14, -22 - liftR * 24 * la];
      rKnee = [kb + liftR * 32, 0, 0];
      rAnkle = [-10, 0, 0];
      break;
    }
    case 'tap': {
      const fTap = Math.max(0, Math.sin(dblPhase));
      const bTap = Math.max(0, -Math.sin(dblPhase));
      lHip = [0, -sw, -28 * fTap * la + 12 * bTap];
      lKnee = [kb + fTap * 46, 0, 0];
      lAnkle = [fTap * 28 - bTap * 18, 0, 0];
      rHip = [0, sw, -28 * bTap * la + 12 * fTap];
      rKnee = [kb + bTap * 46, 0, 0];
      rAnkle = [bTap * 28 - fTap * 18, 0, 0];
      break;
    }
    case 'arabesque': {
      lHip = [-8, -sw, -jumpEnv * 58 * la - 10];
      lKnee = [kb * (1 - jumpEnv * 0.7), 0, 0];
      lAnkle = [jumpEnv * 36, 0, 0];
      rHip = [8, sw, jumpEnv * 64 * la - 8];
      rKnee = [kb * (1 - jumpEnv * 0.7), 0, 0];
      rAnkle = [jumpEnv * 36, 0, 0];
      break;
    }
    default: {
      // 'step'
      lHip = [s1 * 8, -sw - liftL * 8 * la, -18 * liftL * la - 6];
      lKnee = [kb + liftL * 34 * la, 0, 0];
      lAnkle = [-8 + liftL * 12, 0, 0];
      rHip = [s1 * 8, sw + liftR * 8 * la, -18 * liftR * la - 6];
      rKnee = [kb + liftR * 34 * la, 0, 0];
      rAnkle = [-8 + liftR * 12, 0, 0];
      break;
    }
  }

  return {
    hipsPos: [
      s1 * recipe.swayX,
      hipY,
      c1 * recipe.swayZ,
    ],
    hipsRot: [
      spinY + sHalf * recipe.hipTwist,
      s1 * recipe.hipTilt,
      Math.max(0, recipe.spineBend * 0.25),
    ],
    spine: [
      -s1 * recipe.hipTilt * 0.55,
      recipe.spineBend * 0.55 + Math.sin(phase - 0.5) * recipe.chestWave * 0.5,
      s1 * recipe.chestTwist * 0.5,
    ],
    chest: [
      -s1 * recipe.hipTilt * 0.65,
      recipe.spineBend * 0.45 + Math.sin(phase - 1.0) * recipe.chestWave * 0.65,
      s1 * recipe.chestTwist * 0.85,
    ],
    neck: [
      s1 * recipe.headTilt * 0.5,
      -recipe.spineBend * 0.3 + Math.sin(phase) * recipe.headNod * 0.5,
      -s1 * recipe.chestTwist * 0.35,
    ],
    head: [
      s1 * recipe.headTilt,
      -recipe.spineBend * 0.35 + Math.sin(phase) * recipe.headNod,
      sHalf * recipe.headTilt * 0.6,
    ],
    lShoulder: lSh,
    lElbow: lEl,
    lWrist: lWr,
    rShoulder: rSh,
    rElbow: rEl,
    rWrist: rWr,
    lHip,
    lKnee,
    lAnkle,
    rHip,
    rKnee,
    rAnkle,
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
