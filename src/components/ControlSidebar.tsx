import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  ArrowLeftRight,
  AudioWaveform,
  Bookmark,
  Cable,
  Camera,
  Captions,
  Check,
  Download,
  FileJson,
  FileText,
  Image as ImageIcon,
  LayoutTemplate,
  Loader2,
  Mic2,
  Palette,
  Plus,
  Repeat,
  RotateCcw,
  Scan,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { MidiMappableParamKey } from '../types/midi';
import {
  ASPECT_RATIOS,
  AspectRatioKey,
  BackgroundFitMode,
  CoverCardPosition,
  CoverCardSource,
  DanceAvatarStyle,
  DanceMedleyTriggerMode,
  DancePlacement,
  DanceStyleKey,
  ExportResolution,
  FadeType,
  LyricFontKey,
  LyricLine,
  LyricsOnlyLayout,
  LyricStyle,
  MocapClipData,
  MotionBlurPresetKey,
  resolveExportDimensions,
  SavedPreset,
  SidebarTab,
  StudioSettings,
  VisualizerMode,
} from '../types/studio';
import {
  DANCE_AVATAR_OPTIONS,
  DANCE_MEDLEY_PRESETS,
  DANCE_STYLE_OPTIONS,
} from '../utils/danceRenderer';
import {
  BUILT_IN_MOCAP_LIBRARY,
  downloadBuiltInMocapBvh,
  isBuiltInMocapStyle,
} from '../utils/builtInMocapLibrary';
import {
  BLOOM_PRESETS,
  DEFAULT_BLOOM_SHADER_PARAMS,
  getBloomPresetPatch,
  resolveActiveBloomPreset,
} from '../utils/bloomPresets';
import {
  getMotionBlurPresetPatch,
  MOTION_BLUR_PRESETS,
  resolveActiveMotionBlurPreset,
} from '../utils/motionBlurPresets';
import {
  createLyricId,
  formatLrcTimestamp,
  formatShortTime,
  parseCaptionsFile,
  parseTimeInput,
  serializeLrc,
} from '../utils/lrcParser';
import {
  LYRIC_FONT_OPTIONS,
  resolveLyricFontFamily,
} from '../utils/lyricDisplayRenderer';
import {
  analyzeBeatsFromAudioBuffer,
  autoAlignLyricsToAmplitudePeaks,
  BeatDetectionAnalysis,
  LyricBeatSuggestion,
  suggestBeatSyncedTimestamps,
  suggestTimestampsForPlainLyrics,
} from '../utils/lyricBeatAutoSync';
import { downloadPresetJson, formatPresetSummary } from '../utils/presetStorage';
import { resolveAutoCycledColors } from '../utils/colorHarmony';
import { ColorHarmonyPanel } from './ColorHarmonyPanel';
import { ParticleSystemPanel } from './ParticleSystemPanel';
import { PresetThumbnail } from './PresetThumbnail';
import { SceneTransitionPanel } from './SceneTransitionPanel';

interface ControlSidebarProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  audioFileName: string | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  onAudioFileSelect: (file: File) => void;
  onLoadDemo: () => void;
  isGeneratingDemo: boolean;
  onBgImageSelect: (file: File | null) => void;
  bgImageName: string | null;
  hasBgImage?: boolean;
  onAlbumImageSelect: (file: File | null) => void;
  albumImageName: string | null;
  hasAlbumImage?: boolean;
  onCopyBgToAlbum?: () => void;
  onCopyAlbumToBg?: () => void;
  onDownloadCoverThumbnail?: (mode: 'clean-cover' | 'full-stage') => Promise<string>;
  onSetProjectThumbnailFromCover?: () => Promise<void>;
  lyrics: LyricLine[];
  onLyricsChange: (lyrics: LyricLine[]) => void;
  onSeek: (time: number) => void;
  audioInputRef: React.RefObject<HTMLInputElement | null>;
  savedPresets: SavedPreset[];
  onSavePreset: (name: string) => SavedPreset;
  onApplyPreset: (preset: SavedPreset) => void;
  onDeletePreset: (id: string) => void;
  onImportPresetFile: (
    file: File
  ) => Promise<{ ok: true; preset: SavedPreset } | { ok: false; error: string }>;
  onDownloadSnapshot: (name: string, targetSettings?: StudioSettings) => Promise<string>;
  hasAudio: boolean;
  audioBuffer: AudioBuffer | null;
  isGeneratingCaptions: boolean;
  captionsNotice: { type: 'success' | 'error'; text: string } | null;
  onDismissCaptionsNotice: () => void;
  onAutoGenerateCaptions: () => void;
  onAutoArrange: () => void;
  autoArrangeNotice: string | null;
  beatMeterBarRef: React.RefObject<HTMLDivElement | null>;
  midiMappingBadges?: Partial<Record<MidiMappableParamKey, string>>;
  onOpenMidiMapping?: () => void;
  onPreviewSceneTransition?: () => void;
  mocapClip?: MocapClipData | null;
  onMocapFileSelect?: (
    file: File
  ) => Promise<{ ok: true; clip: MocapClipData } | { ok: false; error: string }>;
  onClearMocapClip?: () => void;
}

const TABS: Array<{ id: SidebarTab; label: string; icon: typeof Sliders }> = [
  { id: 'media', label: 'Media', icon: AudioWaveform },
  { id: 'format', label: 'Format', icon: LayoutTemplate },
  { id: 'visualizer', label: 'Visuals', icon: Sliders },
  { id: 'lyrics', label: 'Lyrics', icon: Mic2 },
  { id: 'style', label: 'Style', icon: Palette },
  { id: 'presets', label: 'Presets', icon: Bookmark },
];

const VISUALIZER_MODES: Array<{
  id: VisualizerMode;
  name: string;
  desc: string;
  category?: '3d' | 'unique';
}> = [
  {
    id: 'mirrored-bars',
    name: 'Mirrored Vertical Bars',
    desc: 'Symmetrical rounded bars with smooth decay',
  },
  {
    id: 'circular-ring',
    name: 'Circular Ring Spectrum',
    desc: 'Bass-reactive radial spectrum & center art',
  },
  {
    id: 'neon-wave',
    name: 'Neon Smooth Wave',
    desc: 'Dual-layered oscilloscope time-domain curves',
  },
  {
    id: 'hybrid-particles',
    name: 'Hybrid Ring + Particles',
    desc: 'Circular spectrum with bass-triggered particles',
  },
  {
    id: 'dual-ribbon',
    name: 'Aurora Frequency Ribbons',
    desc: 'Layered spline terrain waves with glowing crests',
  },
  {
    id: 'led-matrix',
    name: 'Segmented LED Matrix',
    desc: 'Studio rack brick meters with peak-hold caps',
  },
  {
    id: 'harmonic-orb',
    name: 'Harmonic Orbital Mandala',
    desc: 'Concentric geometric rings, splines & orbiting nodes',
  },
  {
    id: 'stereo-prism',
    name: 'Perspective Stereo Prism',
    desc: 'Horizon grid with mirrored diamond spectrum blades',
  },
  {
    id: 'cube-3d',
    name: '3D Cube Mesh',
    desc: 'Rotating 3D cube with frequency-reactive faces',
    category: '3d',
  },
  {
    id: 'galaxy-spiral',
    name: 'Galaxy Vortex Spiral',
    desc: 'Rotating spiral arms & pulsing cosmic starfield',
  },
  {
    id: 'cyber-tunnel',
    name: '3D Warp Tunnel',
    desc: 'Infinite perspective rings & laser rails synced to bass',
    category: '3d',
  },
  {
    id: 'seismic-ridges',
    name: 'Seismic Ridge Stack',
    desc: 'Stacked 3D topographic spectrum waves with depth occlusion',
  },
  {
    id: 'dna-helix',
    name: 'Double Helix Strand',
    desc: 'Twisting twin wave strands & frequency-reactive base rungs',
  },
  {
    id: 'radar-sonar',
    name: 'Sonar Pulse Radar',
    desc: 'Rotating sweep beam lighting up radial spectrum blips',
  },
  {
    id: 'lissajous-scope',
    name: 'Lissajous Phase Scope',
    desc: 'Harmonic X-Y phase-orbit curves & glowing studio reticle',
  },
  {
    id: 'rain-matrix',
    name: 'Digital Rain Waterfall',
    desc: 'Cascading neon glyph columns synced to frequency bands',
  },
  {
    id: 'flower-mandala',
    name: 'Sacred Lotus Mandala',
    desc: 'Layered symmetrical petal geometry blooming with bass & mids',
  },
  {
    id: 'vortex-rings',
    name: '3D Torus Gyroscope',
    desc: 'Nested 3D gimbal rings with orbiting spectrum beads',
    category: '3d',
  },
  {
    id: 'isometric-city',
    name: 'Isometric Equalizer',
    desc: '3D isometric prism skyline pulsing in depth-sorted rows',
    category: '3d',
  },
  {
    id: 'analog-vu',
    name: 'Dual Analog VU Meters',
    desc: 'Twin studio needle dials with dB arcs & peak indicators',
  },
  {
    id: 'kaleido-shards',
    name: 'Kaleidoscope Shards',
    desc: '8-fold mirrored geometric crystal facets pulsing to beats',
  },
  {
    id: 'flame-corona',
    name: 'Solar Plasma Corona',
    desc: 'Eclipse core surrounded by multi-octave plasma flares',
  },
  {
    id: 'radial-bars-inward',
    name: 'Implosion Ring',
    desc: 'Inward-pointing radial spectrum converging on a bass core',
  },
  {
    id: 'spectrum-waterfall',
    name: 'Neon Waterfall',
    desc: 'Receding perspective waveform sheets cascading to the horizon',
  },
  {
    id: 'pendulum-wave',
    name: 'Harmonic Pendulum',
    desc: 'Coupled phase-shifted swinging bobs synced to frequency bands',
  },
  {
    id: 'constellation-net',
    name: 'Constellation Net',
    desc: 'Drifting star-mesh nodes connected by reactive energy filaments',
  },
  {
    id: 'waveform-mirror',
    name: 'Mirrored Scope',
    desc: 'Symmetrical top-and-bottom time-domain oscilloscope ribbons',
  },
  {
    id: 'hex-hive',
    name: 'Hex Honeycomb',
    desc: 'Audio-illuminated hexagonal lattice cells pulsing to the beat',
  },
  {
    id: 'plasma-field',
    name: 'EM Flux Field',
    desc: 'Flowing vector field needles deflected by bass & mid energy',
  },
  {
    id: 'laser-fan',
    name: 'Concert Laser Fan',
    desc: 'Sweeping arena spotlight beams rising with spectrum intensity',
  },
  {
    id: 'synth-grid',
    name: 'Synthwave Horizon',
    desc: 'Retro sunset disc above a scrolling 3D perspective grid floor',
  },
  {
    id: 'orbit-atoms',
    name: 'Atomic Orbital',
    desc: 'Tilted elliptical electron tracks & glowing orbital nodes',
  },
  {
    id: 'bar-arc',
    name: 'Archway EQ',
    desc: 'Semi-circular stadium arch equalizer bars with radiant core',
  },
  {
    id: 'dot-equalizer',
    name: 'LED Dot Matrix',
    desc: 'Crisp quantized dot-grid equalizer columns with floating caps',
  },
  {
    id: 'lightning-bolts',
    name: 'Tesla Arcs',
    desc: 'High-voltage jagged lightning discharges cracking on transients',
  },
  {
    id: 'pixel-mosaic',
    name: 'Pixel Mosaic',
    desc: 'Reactive checkerboard tiles scaling luminance with audio bands',
  },
  {
    id: 'ripple-pond',
    name: 'Acoustic Ripples',
    desc: 'Concentric water-like resonance waves radiating from center',
  },
  {
    id: 'spiral-bars',
    name: 'Fibonacci Spiral',
    desc: 'Golden-angle phyllotaxis spiral bars blooming with volume',
  },
  {
    id: 'pyramid-3d',
    name: '3D Wire Pyramid',
    desc: 'Spinning 3D wireframe octahedron & pyramid reactive to bass',
    category: '3d',
  },
  {
    id: 'heartbeat-ecg',
    name: 'Pulse ECG Trace',
    desc: 'Biometric cardiogram trace with rhythmic R-peak beat spikes',
  },
  {
    id: 'ribbon-knot',
    name: 'Toroidal Knot',
    desc: 'Continuous 3D Lissajous torus knot modulating with frequency',
    category: '3d',
  },
  {
    id: 'starburst-rays',
    name: 'Hypernova Rays',
    desc: 'Rotating angular light rays & glowing core flare',
  },
  {
    id: 'glass-shards',
    name: 'Prismatic Shards',
    desc: 'Fractured floating crystal triangles spinning to treble hits',
  },
  {
    id: 'vinyl-grooves',
    name: 'Vinyl Resonance',
    desc: 'Spinning micro-groove record tracks pulsing with waveform modulation',
  },
  {
    id: 'staircase-eq',
    name: 'Stepped Skyline',
    desc: 'Cascading architectural silhouette blocks driven by spectrum height',
  },
  {
    id: 'infinity-loop',
    name: 'Infinity Loop',
    desc: 'Lemniscate figure-eight ribbon tracing harmonic beads',
  },
  {
    id: 'chromatic-rings',
    name: 'Chromatic Halo',
    desc: 'Layered concentric frequency halos offset by stereo phase',
  },
  {
    id: 'sound-curtain',
    name: 'Acoustic Curtain',
    desc: 'Swaying vertical silk strings vibrating like plucked harp chords',
  },
  {
    id: 'cyber-compass',
    name: 'HUD Compass',
    desc: 'Aerospace rotating azimuth ticks and counter-spinning arcs',
  },
  {
    id: 'nebula-clouds',
    name: 'Cosmic Nebula',
    desc: 'Soft volumetric plasma clouds drifting amid sparkling starlight',
  },
  // 25 New 3D Visualizer Modes
  {
    id: 'torus-3d',
    name: '3D Torus Knot Matrix',
    desc: 'Spinning 3D perspective torus mesh with frequency-pulsing tube rings',
    category: '3d',
  },
  {
    id: 'icosahedron-3d',
    name: '3D Geodesic Icosahedron',
    desc: 'Depth-sorted 20-face polyhedron with spectrum-extruded vertices',
    category: '3d',
  },
  {
    id: 'octahedron-3d',
    name: '3D Dual Octahedron',
    desc: 'Counter-rotating nested 3D crystal octahedrons with beat sheen',
    category: '3d',
  },
  {
    id: 'sphere-dots-3d',
    name: '3D Fibonacci Sphere',
    desc: '110-node 3D spherical point cloud pulsing radially across bands',
    category: '3d',
  },
  {
    id: 'cylinder-eq-3d',
    name: '3D Cylinder Equalizer',
    desc: 'Rotating 3D ring of depth-sorted spectrum columns',
    category: '3d',
  },
  {
    id: 'helix-double-3d',
    name: '3D Perspective Helix',
    desc: 'True 3D rotating double helix ladder reactive to bass & mids',
    category: '3d',
  },
  {
    id: 'terrain-mesh-3d',
    name: '3D Audio Terrain',
    desc: 'Perspective wireframe heightmap landscape sculpted by audio bands',
    category: '3d',
  },
  {
    id: 'prism-stack-3d',
    name: '3D Prism Cascade',
    desc: 'Vertically stacked rotating 3D hexagonal prisms scaling per band',
    category: '3d',
  },
  {
    id: 'dodecahedron-3d',
    name: '3D Dodecahedron Core',
    desc: '12-pentagon 3D wireframe cage surrounding a pulsing energy core',
    category: '3d',
  },
  {
    id: 'saturn-rings-3d',
    name: '3D Planetary Rings',
    desc: 'Shaded 3D sphere orbited by tilted segmented frequency rings',
    category: '3d',
  },
  {
    id: 'cube-lattice-3d',
    name: '3D Voxel Cube Matrix',
    desc: '3×3×3 array of rotating 3D micro-cubes breathing in Z-depth',
    category: '3d',
  },
  {
    id: 'ribbon-mobius-3d',
    name: '3D Mobius Ribbon',
    desc: 'Twisted 3D perspective Möbius strip undulating with audio',
    category: '3d',
  },
  {
    id: 'cone-vortex-3d',
    name: '3D Funnel Vortex',
    desc: 'Descending 3D perspective spiral rings tapering into a core',
    category: '3d',
  },
  {
    id: 'diamond-cut-3d',
    name: '3D Faceted Diamond',
    desc: 'Spinning brilliant-cut 3D gemstone with beat-reactive glints',
    category: '3d',
  },
  {
    id: 'city-blocks-3d',
    name: '3D Perspective Skyline',
    desc: 'Depth-sorted 3D grid of extruded frequency towers & lit caps',
    category: '3d',
  },
  {
    id: 'wave-tunnel-3d',
    name: '3D Hex Warp Tunnel',
    desc: 'Perspective hexagonal tunnel gates flying continuously in Z-depth',
    category: '3d',
  },
  {
    id: 'atom-cage-3d',
    name: '3D Orbital Gyro Cage',
    desc: 'Multi-axis 3D gimbal rings with fast orbiting electron spheres',
    category: '3d',
  },
  {
    id: 'ribbon-helix-3d',
    name: '3D Spiral Ribbon',
    desc: 'Twin 3D perspective ribbons spiraling around a vertical axis',
    category: '3d',
  },
  {
    id: 'star-poly-3d',
    name: '3D Stellated Star',
    desc: 'Spiked 3D polyhedron shooting reactive crystal spires outward',
    category: '3d',
  },
  {
    id: 'arch-bridge-3d',
    name: '3D Perspective Archway',
    desc: 'Receding 3D parabolic arches scaling dynamically to spectrum',
    category: '3d',
  },
  {
    id: 'dna-spiral-3d',
    name: '3D Twisted Ladder',
    desc: 'Horizontal 3D perspective twisted ladder spanning the stage',
    category: '3d',
  },
  {
    id: 'crystal-cluster-3d',
    name: '3D Quartz Cluster',
    desc: 'Radial cluster of 3D hexagonal crystal spires growing with bass',
    category: '3d',
  },
  {
    id: 'radar-dome-3d',
    name: '3D Wireframe Dome',
    desc: 'Tilted 3D geodesic hemisphere with sweeping radar meridian arc',
    category: '3d',
  },
  {
    id: 'portal-gate-3d',
    name: '3D Dimensional Gate',
    desc: 'Nested tilting 3D octagonal portals pulsing with energy',
    category: '3d',
  },
  {
    id: 'hypercube-4d',
    name: '4D Tesseract 3D',
    desc: 'Four-dimensional hypercube projected into rotating 3D perspective',
    category: '3d',
  },
  // 10 New Unique Visualizer Modes
  {
    id: 'origami-fold',
    name: 'Origami Fold',
    desc: 'Unique · Paper-craft triangular fans folding & blooming to beats',
    category: 'unique',
  },
  {
    id: 'vinyl-turntable',
    name: 'Spinning Turntable',
    desc: 'Unique · Detailed vinyl deck with strobe rim, grooves & tonearm',
    category: 'unique',
  },
  {
    id: 'pendulum-clockwork',
    name: 'Clockwork Escapement',
    desc: 'Unique · Interlocking mechanical gear wheels & sweeping timer hand',
    category: 'unique',
  },
  {
    id: 'aurora-curtains',
    name: 'Polar Aurora Borealis',
    desc: 'Unique · Shimmering vertical magnetic curtains swaying smoothly',
    category: 'unique',
  },
  {
    id: 'seismic-circular',
    name: 'Circular Seismograph',
    desc: 'Unique · Concentric ink-style tremor rings etched by waveform',
    category: 'unique',
  },
  {
    id: 'bioluminescent-jelly',
    name: 'Bioluminescent Jelly',
    desc: 'Unique · Translucent pulsing dome & undulating audio tentacles',
    category: 'unique',
  },
  {
    id: 'stained-glass',
    name: 'Gothic Rose Window',
    desc: 'Unique · Symmetrical cathedral rose stained-glass jewel facets',
    category: 'unique',
  },
  {
    id: 'sonar-ripples',
    name: 'Echolocation Arcs',
    desc: 'Unique · Dual-source acoustic sonar waves colliding mid-stage',
    category: 'unique',
  },
  {
    id: 'magnetic-ferrofluid',
    name: 'Ferrofluid Spikes',
    desc: 'Unique · Organic liquid-metal core sprouting magnetic spikes',
    category: 'unique',
  },
  {
    id: 'kaleido-tunnels',
    name: 'Kaleido Fractals',
    desc: 'Unique · Recursive hexagram star polygons spinning in opposition',
    category: 'unique',
  },
];

const LYRIC_STYLES: Array<{
  id: LyricStyle;
  name: string;
  desc: string;
}> = [
  {
    id: 'karaoke',
    name: 'Karaoke Highlight',
    desc: 'Previous, scaled active, and upcoming lines',
  },
  {
    id: 'single-pop',
    name: 'Single-Line Pop',
    desc: 'Beat-synced bounce inside a dark pill frame',
  },
  {
    id: 'subtitle-bar',
    name: 'Subtitle Bar',
    desc: 'Clean bottom-anchored social caption box',
  },
  {
    id: 'neon-outline',
    name: 'Neon Outline',
    desc: 'Hollow uppercase stroke typography with glowing neon rim',
  },
  {
    id: 'typewriter',
    name: 'Typewriter Reveal',
    desc: 'Monospace character-by-character typing with blinking cursor',
  },
  {
    id: 'cinematic-serif',
    name: 'Cinematic Serif',
    desc: 'Editorial serif display framed by hairline accent dividers',
  },
  {
    id: 'word-sweep',
    name: 'Word Sweep Fill',
    desc: 'Left-to-right gradient sweep filling each line in sync',
  },
  {
    id: 'glass-card',
    name: 'Frosted Glass Card',
    desc: 'Translucent glass panel with left accent bar and crisp shadow',
  },
  {
    id: 'bold-impact',
    name: 'Bold Impact',
    desc: 'Heavy uppercase headline punch reacting to bass peaks',
  },
  {
    id: 'split-reveal',
    name: 'Split Accent',
    desc: 'Alternating primary-colored words with expanding underline',
  },
  {
    id: 'ticker-ribbon',
    name: 'Broadcast Ribbon',
    desc: 'Full-width lower-third gradient banner with neon border strips',
  },
  {
    id: 'floating-cloud',
    name: 'Floating Stack',
    desc: '5-line depth-faded vertical stack centered on active lyric',
  },
  {
    id: 'cyber-hud',
    name: 'Cyber HUD Bracket',
    desc: 'Monospace telemetry frame with glowing corner brackets',
  },
  {
    id: 'retro-arcade',
    name: 'Retro Arcade',
    desc: 'Bold monospace text with dual-offset chromatic 8-bit shadows',
  },
  {
    id: 'editorial-quote',
    name: 'Editorial Quote',
    desc: 'Italic magazine pull-quote with vertical bar and quote glyph',
  },
  {
    id: 'vinyl-sleeve',
    name: 'Minimal Sleeve',
    desc: 'Liner-note layout with live timestamp pill and clean left text',
  },
  {
    id: 'glitch-flash',
    name: 'Chromatic Glitch',
    desc: 'Beat-jittered RGB chromatic split on entrances and bass hits',
  },
  {
    id: 'duotone-badge',
    name: 'Duotone Badge',
    desc: 'Vibrant gradient capsule with high-contrast dark knockout type',
  },
  {
    id: 'vertical-spine',
    name: 'Vertical Spine',
    desc: 'Central glowing timeline spine with alternating left/right lines',
  },
  {
    id: 'wave-bounce',
    name: 'Wave Bounce',
    desc: 'Per-word sine-wave bounce pulsing rhythmically with bass',
  },
];

const FADE_TYPES: Array<{
  id: FadeType;
  label: string;
  desc: string;
  curvePath: string;
}> = [
  {
    id: 'linear',
    label: 'Linear',
    desc: 'Constant-rate 0.15s gain ramp at clip start and end on export.',
    curvePath: 'M1 9 L15 1',
  },
  {
    id: 'logarithmic',
    label: 'Logarithmic',
    desc: 'Fast initial rise with a smooth taper into full level (0.15s export fade).',
    curvePath: 'M1 9 Q 3.5 2, 15 1',
  },
  {
    id: 'exponential',
    label: 'Exponential',
    desc: 'Gentle swell from silence with a deep fade-out tail (0.15s export fade).',
    curvePath: 'M1 9 Q 12 8.5, 15 1',
  },
];

const BACKDROP_LOOK_PRESETS: Array<{
  id: string;
  label: string;
  patch: Partial<StudioSettings>;
}> = [
  {
    id: 'natural',
    label: 'Natural',
    patch: {
      bgBlur: 0,
      bgDim: 0.25,
      bgBrightness: 1,
      bgContrast: 1,
      bgSaturation: 1,
      bgTintStrength: 0,
      bgVignette: 0.15,
    },
  },
  {
    id: 'cinema-dark',
    label: 'Cinema',
    patch: {
      bgBlur: 6,
      bgDim: 0.55,
      bgBrightness: 0.9,
      bgContrast: 1.2,
      bgSaturation: 0.92,
      bgTintStrength: 0.12,
      bgVignette: 0.65,
    },
  },
  {
    id: 'dreamy-bokeh',
    label: 'Bokeh',
    patch: {
      bgBlur: 18,
      bgDim: 0.42,
      bgBrightness: 1.05,
      bgContrast: 0.96,
      bgSaturation: 1.22,
      bgTintStrength: 0.24,
      bgVignette: 0.4,
    },
  },
  {
    id: 'noir-bw',
    label: 'Noir B&W',
    patch: {
      bgBlur: 4,
      bgDim: 0.48,
      bgBrightness: 0.96,
      bgContrast: 1.32,
      bgSaturation: 0,
      bgTintStrength: 0,
      bgVignette: 0.72,
    },
  },
  {
    id: 'neon-grade',
    label: 'Neon Tint',
    patch: {
      bgBlur: 10,
      bgDim: 0.5,
      bgBrightness: 0.95,
      bgContrast: 1.18,
      bgSaturation: 1.38,
      bgTintStrength: 0.36,
      bgVignette: 0.52,
    },
  },
];

export function ControlSidebar({
  activeTab,
  onTabChange,
  settings,
  onUpdateSettings,
  audioFileName,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  onTrimChange,
  onAudioFileSelect,
  onLoadDemo,
  isGeneratingDemo,
  onBgImageSelect,
  bgImageName,
  hasBgImage,
  onAlbumImageSelect,
  albumImageName,
  hasAlbumImage,
  onCopyBgToAlbum,
  onCopyAlbumToBg,
  onDownloadCoverThumbnail,
  onSetProjectThumbnailFromCover,
  lyrics,
  onLyricsChange,
  onSeek,
  audioInputRef,
  savedPresets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onImportPresetFile,
  onDownloadSnapshot,
  hasAudio,
  audioBuffer,
  isGeneratingCaptions,
  captionsNotice,
  onDismissCaptionsNotice,
  onAutoGenerateCaptions,
  onAutoArrange,
  autoArrangeNotice,
  beatMeterBarRef,
  midiMappingBadges,
  onOpenMidiMapping,
  onPreviewSceneTransition,
  mocapClip = null,
  onMocapFileSelect,
  onClearMocapClip,
}: ControlSidebarProps) {
  const bgInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);
  const mediaCaptionInputRef = useRef<HTMLInputElement>(null);
  const mocapInputRef = useRef<HTMLInputElement>(null);
  const presetJsonInputRef = useRef<HTMLInputElement>(null);
  const autoCaptionsSectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (activeTab === 'lyrics' && (isGeneratingCaptions || captionsNotice)) {
      autoCaptionsSectionRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [activeTab, isGeneratingCaptions, captionsNotice]);

  // Local text state for trim inputs
  const [startInput, setStartInput] = useState(formatShortTime(trimStart));
  const [endInput, setEndInput] = useState(formatShortTime(trimEnd));

  useEffect(() => {
    setStartInput(formatShortTime(trimStart));
  }, [trimStart]);

  useEffect(() => {
    setEndInput(formatShortTime(trimEnd));
  }, [trimEnd]);

  // Tap-to-Sync & Caption Upload State
  const [rawLyricsText, setRawLyricsText] = useState('');
  const [quickMediaCaption, setQuickMediaCaption] = useState('');
  const [captionUploadNotice, setCaptionUploadNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [tapMode, setTapMode] = useState(false);
  const [tapLines, setTapLines] = useState<string[]>([]);
  const [tapIndex, setTapIndex] = useState(0);

  // Saved Presets State
  const [presetNameInput, setPresetNameInput] = useState('');
  const [presetNotice, setPresetNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [modeQuery, setModeQuery] = useState('');
  const [modeCategory, setModeCategory] = useState<'all' | '3d' | 'unique'>('all');
  const [lyricStyleQuery, setLyricStyleQuery] = useState('');
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);
  const [showBloomShaderParams, setShowBloomShaderParams] = useState(false);
  const [coverThumbStatus, setCoverThumbStatus] = useState<
    'clean-cover' | 'full-stage' | 'project-thumb' | null
  >(null);
  const [isSettingProjectThumb, setIsSettingProjectThumb] = useState(false);
  const [mocapNotice, setMocapNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Beat Auto-Sync State
  const [autoSyncPreview, setAutoSyncPreview] = useState<{
    source: 'existing' | 'plain';
    analysis: BeatDetectionAnalysis;
    suggestions: LyricBeatSuggestion[];
    snapWindowSec: number;
    beatsPerLine: 1 | 2 | 4;
  } | null>(null);
  const [autoSyncNotice, setAutoSyncNotice] = useState<string | null>(null);

  const commitStartInput = () => {
    const parsed = parseTimeInput(startInput);
    if (parsed === null || duration <= 0) {
      setStartInput(formatShortTime(trimStart));
      return;
    }
    const clamped = Math.max(0, Math.min(parsed, trimEnd - 0.5));
    onTrimChange(Number(clamped.toFixed(2)), trimEnd);
  };

  const commitEndInput = () => {
    const parsed = parseTimeInput(endInput);
    if (parsed === null || duration <= 0) {
      setEndInput(formatShortTime(trimEnd));
      return;
    }
    const clamped = Math.min(duration, Math.max(parsed, trimStart + 0.5));
    onTrimChange(trimStart, Number(clamped.toFixed(2)));
  };

  const applyDurationPreset = (seconds: number | 'full') => {
    if (duration <= 0) return;
    if (seconds === 'full') {
      onTrimChange(0, Number(duration.toFixed(2)));
      return;
    }
    const targetLen = Math.min(duration, seconds);
    let nextStart = trimStart;
    if (nextStart + targetLen > duration) {
      nextStart = Math.max(0, duration - targetLen);
    }
    const nextEnd = Math.min(duration, nextStart + targetLen);
    onTrimChange(Number(nextStart.toFixed(2)), Number(nextEnd.toFixed(2)));
  };

  const handleLrcUpload = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCaptionsFile(
        text,
        file.name,
        duration > 0 ? duration : undefined
      );
      if (parsed.length > 0) {
        onLyricsChange(parsed);
        setTapMode(false);
        setCaptionUploadNotice({
          type: 'success',
          text: `Loaded ${parsed.length} cues from ${file.name}`,
        });
      } else {
        setCaptionUploadNotice({
          type: 'error',
          text: `No readable lyrics or captions found in ${file.name}.`,
        });
      }
    } catch {
      setCaptionUploadNotice({
        type: 'error',
        text: 'Unable to read that caption file.',
      });
    }
  };

  const handleQuickAddMediaCaption = () => {
    const cleaned = quickMediaCaption.trim();
    if (!cleaned) return;
    const next = [
      ...lyrics,
      {
        id: createLyricId(),
        time: Number(currentTime.toFixed(2)),
        text: cleaned,
      },
    ].sort((a, b) => a.time - b.time);
    onLyricsChange(next);
    setQuickMediaCaption('');
    setCaptionUploadNotice({
      type: 'success',
      text: `Added cue at [${formatLrcTimestamp(currentTime)}]`,
    });
  };

  const startTapToSync = () => {
    const cleanedLines = rawLyricsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (cleanedLines.length === 0) return;

    setTapLines(cleanedLines);
    setTapIndex(0);
    setTapMode(true);
    onLyricsChange([]);
  };

  const stampCurrentLine = () => {
    if (!tapMode || tapIndex >= tapLines.length) return;
    const newLine: LyricLine = {
      id: createLyricId(),
      time: Number(currentTime.toFixed(2)),
      text: tapLines[tapIndex],
    };
    const nextLyrics = [...lyrics, newLine].sort((a, b) => a.time - b.time);
    onLyricsChange(nextLyrics);

    if (tapIndex + 1 >= tapLines.length) {
      setTapMode(false);
    } else {
      setTapIndex(tapIndex + 1);
    }
  };

  // Spacebar shortcut while Tap-to-Sync is active
  useEffect(() => {
    if (!tapMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        stampCurrentLine();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleDownloadLrc = () => {
    if (lyrics.length === 0) return;
    const lrcText = serializeLrc(lyrics);
    const blob = new Blob([lrcText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(settings.trackTitle || 'lyrics').toLowerCase().replace(/\s+/g, '-')}.lrc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runAutoSyncExisting = (snapWindowSec = 0.45) => {
    if (!audioBuffer || lyrics.length === 0) return;
    setAutoSyncNotice(null);
    const analysis = analyzeBeatsFromAudioBuffer(audioBuffer, {
      startSec: 0,
      endSec: audioBuffer.duration,
      beatSensitivity: settings.beatSensitivity,
    });
    const suggestions = suggestBeatSyncedTimestamps(lyrics, analysis, snapWindowSec);
    setAutoSyncPreview({
      source: 'existing',
      analysis,
      suggestions,
      snapWindowSec,
      beatsPerLine: 2,
    });
  };

  const runAutoAlignAll = () => {
    if (!audioBuffer || lyrics.length === 0) return;
    setAutoSyncPreview(null);
    const result = autoAlignLyricsToAmplitudePeaks(lyrics, audioBuffer, {
      beatSensitivity: settings.beatSensitivity,
      maxSnapSec: 0.55,
    });
    onLyricsChange(result.alignedLyrics);
    const bpmText = result.estimatedBpm ? ` (~${result.estimatedBpm} BPM)` : '';
    if (result.alignedCount > 0) {
      setAutoSyncNotice(
        `Auto-aligned ${result.alignedCount} of ${result.totalCount} lyric cues to nearest high-energy beats${bpmText}.`
      );
    } else {
      setAutoSyncNotice(
        `All ${result.totalCount} lyric cues are already aligned with high-energy beat peaks${bpmText}.`
      );
    }
  };

  const runAutoSyncPlainText = (beatsPerLine: 1 | 2 | 4 = 2) => {
    if (!audioBuffer) return;
    const cleanedLines = rawLyricsText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (cleanedLines.length === 0) return;

    setAutoSyncNotice(null);
    const analysis = analyzeBeatsFromAudioBuffer(audioBuffer, {
      startSec: trimStart,
      endSec: trimEnd > trimStart + 0.5 ? trimEnd : audioBuffer.duration,
      beatSensitivity: settings.beatSensitivity,
    });
    const suggestions = suggestTimestampsForPlainLyrics(cleanedLines, analysis, beatsPerLine);
    setAutoSyncPreview({
      source: 'plain',
      analysis,
      suggestions,
      snapWindowSec: 0.45,
      beatsPerLine,
    });
  };

  const updateAutoSyncSnapWindow = (nextSnapSec: number) => {
    if (!autoSyncPreview || autoSyncPreview.source !== 'existing') return;
    const suggestions = suggestBeatSyncedTimestamps(
      lyrics,
      autoSyncPreview.analysis,
      nextSnapSec
    );
    setAutoSyncPreview({
      ...autoSyncPreview,
      snapWindowSec: nextSnapSec,
      suggestions,
    });
  };

  const updateAutoSyncBeatsPerLine = (nextBeatsPerLine: 1 | 2 | 4) => {
    if (!autoSyncPreview || autoSyncPreview.source !== 'plain') return;
    const cleanedLines = autoSyncPreview.suggestions.map((s) => s.text);
    const suggestions = suggestTimestampsForPlainLyrics(
      cleanedLines,
      autoSyncPreview.analysis,
      nextBeatsPerLine
    );
    setAutoSyncPreview({
      ...autoSyncPreview,
      beatsPerLine: nextBeatsPerLine,
      suggestions,
    });
  };

  const applyAllAutoSyncSuggestions = () => {
    if (!autoSyncPreview) return;
    if (autoSyncPreview.source === 'existing') {
      const suggestionById = new Map(autoSyncPreview.suggestions.map((s) => [s.id, s]));
      const nextLyrics = lyrics
        .map((cue) => {
          const s = suggestionById.get(cue.id);
          return s ? { ...cue, time: s.suggestedTime } : cue;
        })
        .sort((a, b) => a.time - b.time);
      onLyricsChange(nextLyrics);
      const changedCount = autoSyncPreview.suggestions.filter(
        (s) => Math.abs(s.deltaMs) >= 10
      ).length;
      setAutoSyncNotice(
        `Aligned ${changedCount} of ${autoSyncPreview.suggestions.length} cues to detected beats.`
      );
    } else {
      const nextLyrics: LyricLine[] = autoSyncPreview.suggestions
        .map((s) => ({
          id: s.id,
          time: s.suggestedTime,
          text: s.text,
        }))
        .sort((a, b) => a.time - b.time);
      onLyricsChange(nextLyrics);
      setAutoSyncNotice(
        `Auto-synced ${nextLyrics.length} lyric lines to ${
          autoSyncPreview.analysis.estimatedBpm
            ? `~${autoSyncPreview.analysis.estimatedBpm} BPM `
            : ''
        }beats.`
      );
    }
    setAutoSyncPreview(null);
  };

  const applySingleAutoSyncSuggestion = (suggestion: LyricBeatSuggestion) => {
    if (!autoSyncPreview || autoSyncPreview.source !== 'existing') return;
    const nextLyrics = lyrics
      .map((cue) =>
        cue.id === suggestion.id ? { ...cue, time: suggestion.suggestedTime } : cue
      )
      .sort((a, b) => a.time - b.time);
    onLyricsChange(nextLyrics);
    const remaining = autoSyncPreview.suggestions.filter((s) => s.id !== suggestion.id);
    if (remaining.length === 0) {
      setAutoSyncPreview(null);
      setAutoSyncNotice('Applied beat-aligned timestamp.');
    } else {
      setAutoSyncPreview({
        ...autoSyncPreview,
        suggestions: remaining,
      });
    }
  };

  return (
    <aside className="w-full lg:w-[370px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.08] bg-[#121620] flex flex-col min-h-0 max-h-[46vh] lg:max-h-none">
      {/* Segmented Tab Navigation */}
      <nav
        aria-label="Studio sections"
        className="p-2 border-b border-white/[0.08] grid grid-cols-6 gap-1 shrink-0"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`py-2 px-0.5 rounded-lg text-[10.5px] font-medium flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Scrollable Tab Content */}
      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-5">
        {/* 1. MEDIA & TRIM TAB */}
        {activeTab === 'media' && (
          <>
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-200">Audio &amp; Video Track</h2>
              <input
                ref={audioInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.m4a,.mp4,.webm,.mov,audio/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAudioFileSelect(f);
                  e.target.value = '';
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => audioInputRef.current?.click()}
                  className="px-3 py-2.5 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.05] text-slate-200 border border-white/[0.09] transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Upload Audio / Video</span>
                </button>
                <button
                  type="button"
                  onClick={onLoadDemo}
                  disabled={isGeneratingDemo}
                  className="px-3 py-2.5 rounded-lg text-xs font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isGeneratingDemo ? 'Creating...' : 'Load Demo Beat'}</span>
                </button>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                {audioFileName
                  ? `Loaded: ${audioFileName}`
                  : 'Supports .mp3, .wav, .ogg, .m4a, .mp4, .webm, .mov'}
              </p>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Clip Trim & Duration</h2>
                <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                  {Math.max(0, trimEnd - trimStart).toFixed(1)}s selected
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Start Time</span>
                  <input
                    type="text"
                    value={startInput}
                    disabled={duration <= 0}
                    onChange={(e) => setStartInput(e.target.value)}
                    onBlur={commitStartInput}
                    onKeyDown={(e) => e.key === 'Enter' && commitStartInput()}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400/60 disabled:opacity-40"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">End Time</span>
                  <input
                    type="text"
                    value={endInput}
                    disabled={duration <= 0}
                    onChange={(e) => setEndInput(e.target.value)}
                    onBlur={commitEndInput}
                    onKeyDown={(e) => e.key === 'Enter' && commitEndInput()}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400/60 disabled:opacity-40"
                  />
                </label>
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { label: 'Full Song', val: 'full' },
                    { label: '15s Clip', val: 15 },
                    { label: '30s Clip', val: 30 },
                    { label: '60s Clip', val: 60 },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={duration <= 0}
                    onClick={() => applyDurationPreset(preset.val)}
                    className="px-2 py-1.5 rounded-md text-[11px] font-medium bg-[#090b10] hover:bg-white/[0.07] text-slate-300 border border-white/[0.08] transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">Fade Type</span>
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    0.15s auto-fade
                  </span>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Export fade curve type"
                  className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]"
                >
                  {FADE_TYPES.map((option) => {
                    const active = settings.fadeType === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onUpdateSettings({ fadeType: option.id })}
                        className={`py-1.5 px-1.5 rounded-md text-[11px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-cyan-400 text-[#090b10] font-semibold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <svg
                          viewBox="0 0 16 10"
                          className="w-3.5 h-2.5 shrink-0"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d={option.curvePath}
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                        <span>{option.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  {FADE_TYPES.find((f) => f.id === settings.fadeType)?.desc}
                </p>
              </div>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-200">
                  Video Lyrics &amp; Captions
                </h2>
                <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                  {lyrics.length} {lyrics.length === 1 ? 'cue' : 'cues'}
                </span>
              </div>
              <input
                ref={mediaCaptionInputRef}
                type="file"
                accept=".lrc,.srt,.vtt,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleLrcUpload(f);
                  e.target.value = '';
                }}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => mediaCaptionInputRef.current?.click()}
                  className="px-2.5 py-2 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.05] text-slate-200 border border-white/[0.09] transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Upload Captions</span>
                </button>
                <button
                  type="button"
                  onClick={onAutoGenerateCaptions}
                  disabled={!hasAudio || isGeneratingCaptions}
                  className="px-2.5 py-2 rounded-lg text-xs font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isGeneratingCaptions ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : (
                    <Captions className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span>{isGeneratingCaptions ? 'Working...' : 'Auto-Captions'}</span>
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={quickMediaCaption}
                  onChange={(e) => setQuickMediaCaption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleQuickAddMediaCaption();
                    }
                  }}
                  placeholder={`Add lyric at [${formatLrcTimestamp(currentTime)}]...`}
                  aria-label="Quick add video lyric or caption"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
                <button
                  type="button"
                  disabled={!quickMediaCaption.trim()}
                  onClick={handleQuickAddMediaCaption}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.08] hover:bg-white/[0.14] text-slate-100 border border-white/[0.09] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Add</span>
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
                <span>Supports .lrc, .srt, .vtt, .txt</span>
                <button
                  type="button"
                  onClick={() => onTabChange('lyrics')}
                  className="text-cyan-400 hover:text-cyan-300 font-medium cursor-pointer whitespace-nowrap"
                >
                  Open Lyrics Studio →
                </button>
              </div>
              {captionUploadNotice && (
                <div
                  role="status"
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                    captionUploadNotice.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <span className="truncate">{captionUploadNotice.text}</span>
                  <button
                    type="button"
                    onClick={() => setCaptionUploadNotice(null)}
                    className="text-[10px] opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Background Image</h2>
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        bgFit: 'cover',
                        bgScale: 1,
                        bgOffsetX: 0,
                        bgOffsetY: 0,
                        bgBlur: 8,
                        bgDim: 0.45,
                        bgBrightness: 1,
                        bgContrast: 1,
                        bgSaturation: 1,
                        bgTintStrength: 0,
                        bgVignette: 0,
                      })
                    }
                    className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                    title="Reset backdrop look & framing"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                  {bgImageName && (
                    <button
                      type="button"
                      onClick={() => onBgImageSelect(null)}
                      className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={bgInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onBgImageSelect(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.05] text-slate-300 border border-white/[0.09] transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2 truncate">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{bgImageName || 'Choose backdrop image...'}</span>
                </span>
                <span className="text-[11px] text-cyan-400 shrink-0 ml-2">Browse</span>
              </button>

              {/* Pro Backdrop Looks */}
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Pro Look Presets</span>
                  <span className="text-[10px] text-slate-500">1-Click Grade</span>
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {BACKDROP_LOOK_PRESETS.map((look) => (
                    <button
                      key={look.id}
                      type="button"
                      onClick={() => onUpdateSettings(look.patch)}
                      className="px-1.5 py-1.5 rounded-md text-[10px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-slate-300 hover:text-cyan-200 border border-white/[0.08] hover:border-cyan-500/40 transition-colors cursor-pointer truncate"
                    >
                      {look.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fit & Framing */}
              <div className="rounded-lg bg-[#090b10]/70 border border-white/[0.07] p-2.5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-300">Fit &amp; Framing</span>
                  <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                    {(settings.bgScale ?? 1).toFixed(2)}×
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'cover', label: 'Fill Crop' },
                      { id: 'contain-blur', label: 'Blur Frame' },
                      { id: 'stretch', label: 'Stretch' },
                    ] as Array<{ id: BackgroundFitMode; label: string }>
                  ).map((opt) => {
                    const active = (settings.bgFit ?? 'cover') === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onUpdateSettings({ bgFit: opt.id })}
                        className={`px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                          active
                            ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                            : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Zoom Scale</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {(settings.bgScale ?? 1).toFixed(2)}×
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.02}
                    value={settings.bgScale ?? 1}
                    onChange={(e) => onUpdateSettings({ bgScale: Number(e.target.value) })}
                    className="studio-range w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Pan X</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {(settings.bgOffsetX ?? 0) > 0 ? '+' : ''}
                        {Math.round(settings.bgOffsetX ?? 0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={settings.bgOffsetX ?? 0}
                      onChange={(e) => onUpdateSettings({ bgOffsetX: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Pan Y</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {(settings.bgOffsetY ?? 0) > 0 ? '+' : ''}
                        {Math.round(settings.bgOffsetY ?? 0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-50}
                      max={50}
                      step={1}
                      value={settings.bgOffsetY ?? 0}
                      onChange={(e) => onUpdateSettings({ bgOffsetY: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Atmosphere & Color Grading */}
              <div className="rounded-lg bg-[#090b10]/70 border border-white/[0.07] p-2.5 space-y-2.5">
                <div className="text-[11px] font-medium text-slate-300">
                  Color Grading &amp; Atmosphere
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">
                        Blur
                        {midiMappingBadges?.bgBlur && (
                          <span className="ml-1 font-mono text-[10px] text-cyan-400/85">
                            · {midiMappingBadges.bgBlur}
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-slate-300">{settings.bgBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={30}
                      step={1}
                      value={settings.bgBlur}
                      onChange={(e) => onUpdateSettings({ bgBlur: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">
                        Dimness
                        {midiMappingBadges?.bgDim && (
                          <span className="ml-1 font-mono text-[10px] text-cyan-400/85">
                            · {midiMappingBadges.bgDim}
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {Math.round(settings.bgDim * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.9}
                      step={0.05}
                      value={settings.bgDim}
                      onChange={(e) => onUpdateSettings({ bgDim: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Brightness</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {Math.round((settings.bgBrightness ?? 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.4}
                      max={1.6}
                      step={0.02}
                      value={settings.bgBrightness ?? 1}
                      onChange={(e) => onUpdateSettings({ bgBrightness: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Contrast</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {Math.round((settings.bgContrast ?? 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1.6}
                      step={0.02}
                      value={settings.bgContrast ?? 1}
                      onChange={(e) => onUpdateSettings({ bgContrast: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Saturation</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {Math.round((settings.bgSaturation ?? 1) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={2}
                      step={0.05}
                      value={settings.bgSaturation ?? 1}
                      onChange={(e) => onUpdateSettings({ bgSaturation: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Theme Tint</span>
                      <span className="font-mono tabular-nums text-slate-300">
                        {Math.round((settings.bgTintStrength ?? 0) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.65}
                      step={0.02}
                      value={settings.bgTintStrength ?? 0}
                      onChange={(e) => onUpdateSettings({ bgTintStrength: Number(e.target.value) })}
                      className="studio-range w-full"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Cinematic Edge Vignette</span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {Math.round((settings.bgVignette ?? 0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settings.bgVignette ?? 0}
                    onChange={(e) => onUpdateSettings({ bgVignette: Number(e.target.value) })}
                    className="studio-range w-full"
                  />
                </div>
              </div>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">
                  Cover Image &amp; Thumbnail
                </h2>
                <span className="text-[10px] font-medium text-cyan-400/90">Stage &amp; Export</span>
              </div>

              {/* Insert / Copy between Backdrop and Center Cover Art */}
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={!hasBgImage}
                  onClick={() => onCopyBgToAlbum?.()}
                  className="px-2.5 py-2 rounded-lg text-[11px] font-medium bg-[#090b10] hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-white/[0.09] hover:border-cyan-500/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Copy Background Image into Center Cover Art"
                >
                  <ArrowLeftRight className="w-3 h-3 text-cyan-400 shrink-0" />
                  <span className="truncate">Use BG as Cover</span>
                </button>
                <button
                  type="button"
                  disabled={!hasAlbumImage}
                  onClick={() => onCopyAlbumToBg?.()}
                  className="px-2.5 py-2 rounded-lg text-[11px] font-medium bg-[#090b10] hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed text-slate-200 border border-white/[0.09] hover:border-cyan-500/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  title="Copy Center Cover Art into Background Image"
                >
                  <ArrowLeftRight className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">Use Cover as BG</span>
                </button>
              </div>

              {/* Floating Cover Card overlay toggle */}
              <div className="rounded-lg bg-[#090b10]/70 border border-white/[0.07] p-2.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] font-medium text-slate-200">
                      Insert Cover Card on Stage
                    </div>
                    <p className="text-[10px] text-slate-500">
                      Pin crisp framed artwork into the video &amp; cover export.
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(settings.showCoverCard)}
                    onClick={() => onUpdateSettings({ showCoverCard: !settings.showCoverCard })}
                    className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors cursor-pointer ${
                      settings.showCoverCard ? 'bg-cyan-500' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform mt-0.5 ${
                        settings.showCoverCard ? 'translate-x-4.5' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {settings.showCoverCard && (
                  <div className="space-y-2.5 pt-1 border-t border-white/[0.06]">
                    <div>
                      <div className="text-[11px] text-slate-400 mb-1">Card Image Source</div>
                      <div className="grid grid-cols-3 gap-1">
                        {(
                          [
                            { id: 'auto', label: 'Auto' },
                            { id: 'bg', label: 'Background' },
                            { id: 'album', label: 'Album Art' },
                          ] as Array<{ id: CoverCardSource; label: string }>
                        ).map((opt) => {
                          const active = (settings.coverCardSource ?? 'auto') === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onUpdateSettings({ coverCardSource: opt.id })}
                              className={`px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                                  : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-400 mb-1">Stage Placement</div>
                      <div className="grid grid-cols-3 gap-1">
                        {(
                          [
                            { id: 'top-left', label: 'Top Left' },
                            { id: 'top-center', label: 'Top Center' },
                            { id: 'center', label: 'Center' },
                          ] as Array<{ id: CoverCardPosition; label: string }>
                        ).map((opt) => {
                          const active = (settings.coverCardPosition ?? 'top-left') === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => onUpdateSettings({ coverCardPosition: opt.id })}
                              className={`px-2 py-1.5 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                                  : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Card Size</span>
                          <span className="font-mono tabular-nums text-slate-300">
                            {(settings.coverCardSize ?? 1).toFixed(2)}×
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.6}
                          max={1.4}
                          step={0.05}
                          value={settings.coverCardSize ?? 1}
                          onChange={(e) =>
                            onUpdateSettings({ coverCardSize: Number(e.target.value) })
                          }
                          className="studio-range w-full"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">Corner Radius</span>
                          <span className="font-mono tabular-nums text-slate-300">
                            {Math.round(settings.coverCardRadius ?? 14)}px
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={32}
                          step={2}
                          value={settings.coverCardRadius ?? 14}
                          onChange={(e) =>
                            onUpdateSettings({ coverCardRadius: Number(e.target.value) })
                          }
                          className="studio-range w-full"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Download Cover PNG / Stage Thumbnail / Set Project Thumbnail */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!onDownloadCoverThumbnail) return;
                      await onDownloadCoverThumbnail('clean-cover');
                      setCoverThumbStatus('clean-cover');
                      window.setTimeout(() => {
                        setCoverThumbStatus((prev) => (prev === 'clean-cover' ? null : prev));
                      }, 2200);
                    }}
                    className="px-2.5 py-2 rounded-lg text-[11px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-slate-200 border border-white/[0.09] hover:border-cyan-500/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Download clean Cover PNG (Graded backdrop + Cover Card + Title/Artist)"
                  >
                    {coverThumbStatus === 'clean-cover' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {coverThumbStatus === 'clean-cover' ? 'Saved Cover!' : 'Clean Cover PNG'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      if (!onDownloadCoverThumbnail) return;
                      await onDownloadCoverThumbnail('full-stage');
                      setCoverThumbStatus('full-stage');
                      window.setTimeout(() => {
                        setCoverThumbStatus((prev) => (prev === 'full-stage' ? null : prev));
                      }, 2200);
                    }}
                    className="px-2.5 py-2 rounded-lg text-[11px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-slate-200 border border-white/[0.09] hover:border-cyan-500/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    title="Download full preview frame as Thumbnail PNG"
                  >
                    {coverThumbStatus === 'full-stage' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Camera className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate">
                      {coverThumbStatus === 'full-stage' ? 'Saved PNG!' : 'Stage Thumbnail'}
                    </span>
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isSettingProjectThumb}
                  onClick={async () => {
                    if (!onSetProjectThumbnailFromCover) return;
                    setIsSettingProjectThumb(true);
                    try {
                      await onSetProjectThumbnailFromCover();
                      setCoverThumbStatus('project-thumb');
                      window.setTimeout(() => {
                        setCoverThumbStatus((prev) => (prev === 'project-thumb' ? null : prev));
                      }, 2400);
                    } finally {
                      setIsSettingProjectThumb(false);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg text-[11px] font-medium bg-cyan-500/12 hover:bg-cyan-500/20 disabled:opacity-60 text-cyan-200 border border-cyan-500/35 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isSettingProjectThumb ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  ) : coverThumbStatus === 'project-thumb' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <Bookmark className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  )}
                  <span>
                    {coverThumbStatus === 'project-thumb'
                      ? 'Project Cover Thumbnail Saved!'
                      : 'Set Graded Cover as Project Thumbnail'}
                  </span>
                </button>
              </div>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Center Album Art</h2>
                {albumImageName && (
                  <button
                    type="button"
                    onClick={() => onAlbumImageSelect(null)}
                    className="text-[11px] text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={albumInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAlbumImageSelect(f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => albumInputRef.current?.click()}
                className="w-full px-3 py-2 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.05] text-slate-300 border border-white/[0.09] transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2 truncate">
                  <ImageIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{albumImageName || 'Choose square cover art...'}</span>
                </span>
                <span className="text-[11px] text-cyan-400 shrink-0 ml-2">Browse</span>
              </button>
              <p className="text-[11px] text-slate-500">
                Displayed inside Circular Ring, Hybrid Particle &amp; Harmonic Orbital visualizers.
              </p>
            </section>
          </>
        )}

        {/* 2. FORMAT TAB */}
        {activeTab === 'format' && (
          <>
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-200">Aspect Ratio Preset</h2>
              <div className="space-y-2">
                {(['16:9', '9:16', '1:1'] as AspectRatioKey[]).map((key) => {
                  const cfg = ASPECT_RATIOS[key];
                  const dims = resolveExportDimensions(key, settings.exportResolution);
                  const active = settings.aspectRatio === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onUpdateSettings({ aspectRatio: key })}
                      className={`w-full p-3 rounded-lg border text-left transition-colors flex items-center justify-between cursor-pointer ${
                        active
                          ? 'bg-cyan-500/12 border-cyan-400/45 text-slate-100'
                          : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold">{cfg.label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">{cfg.platformHint}</div>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {dims.width}×{dims.height}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Smart Framing</h2>
                <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                  {settings.aspectRatio}
                </span>
              </div>
              <button
                type="button"
                onClick={onAutoArrange}
                className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/40 transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Scan className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span>Auto-Arrange for {settings.aspectRatio}</span>
              </button>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Optimizes visualizer scale, lyric vertical position, and bloom intensity for{' '}
                {settings.aspectRatio} framing.
              </p>
              {autoArrangeNotice && (
                <div
                  role="status"
                  className="px-2.5 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] font-mono tabular-nums text-emerald-200 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="truncate">{autoArrangeNotice}</span>
                </div>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Export Resolution &amp; FPS</h2>
                <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                  {(() => {
                    const d = resolveExportDimensions(
                      settings.aspectRatio,
                      settings.exportResolution
                    );
                    return `${d.width}×${d.height}`;
                  })()}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]">
                {(['720p', '1080p', '1440p'] as ExportResolution[]).map((res) => (
                  <button
                    key={res}
                    type="button"
                    onClick={() => onUpdateSettings({ exportResolution: res })}
                    className={`py-1.5 rounded-md text-xs font-mono tabular-nums transition-colors cursor-pointer ${
                      settings.exportResolution === res
                        ? 'bg-cyan-400 text-[#090b10] font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {res}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]">
                {([30, 60] as const).map((fps) => (
                  <button
                    key={fps}
                    type="button"
                    onClick={() => onUpdateSettings({ exportFps: fps })}
                    className={`py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                      settings.exportFps === fps
                        ? 'bg-cyan-400 text-[#090b10] font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {fps} FPS
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-500">
                30 FPS exports 2× faster; save full resolution &amp; bitrate combos as Export Profiles in the Export modal.
              </p>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-200">Preview Safe-Zone Guide</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Overlay social UI margins (hidden on export)
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.showSafeZone}
                onClick={() => onUpdateSettings({ showSafeZone: !settings.showSafeZone })}
                className={`w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                  settings.showSafeZone ? 'bg-cyan-400' : 'bg-white/[0.14]'
                }`}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-[#090b10] transition-transform ${
                    settings.showSafeZone ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </section>
          </>
        )}

        {/* 3. VISUALIZER TAB */}
        {activeTab === 'visualizer' && (
          <>
            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Display Layer</h2>
                <span className="text-[11px] font-mono text-slate-400">
                  {settings.lyricsOnly ? 'Lyrics Only' : 'Visualizer + Lyrics'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ lyricsOnly: false })}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    !settings.lyricsOnly
                      ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                      : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                  }`}
                >
                  Visualizer + Lyrics
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateSettings({ lyricsOnly: true })}
                  className={`px-2.5 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                    settings.lyricsOnly
                      ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-200'
                      : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                  }`}
                >
                  Lyrics Only
                </button>
              </div>
              {settings.lyricsOnly && (
                <div className="p-2.5 rounded-lg bg-cyan-500/10 border border-cyan-400/25 space-y-2.5">
                  <p className="text-[11px] leading-relaxed text-slate-300">
                    Visualizer modes, bloom, and particles are hidden. Background art, track info, and synced lyrics remain active.
                  </p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10.5px] text-slate-300">
                      <span className="font-medium">Visible Lyrics</span>
                      <span className="font-mono text-cyan-300">
                        {(settings.lyricsOnlyLayout ?? 'full-verse') === 'half-verse'
                          ? 'Half Verse'
                          : (settings.lyricsOnlyLayout ?? 'full-verse') === 'full-lyrics'
                          ? 'Full Lyrics'
                          : 'Full Verse'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {(
                        [
                          { id: 'half-verse', label: 'Half Verse' },
                          { id: 'full-verse', label: 'Full Verse' },
                          { id: 'full-lyrics', label: 'Full Lyrics' },
                        ] as const
                      ).map((opt) => {
                        const active =
                          (settings.lyricsOnlyLayout ?? 'full-verse') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({ lyricsOnlyLayout: opt.id })
                            }
                            className={`px-2 py-1.5 rounded-md border text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-100'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onTabChange('lyrics')}
                      className="flex-1 px-2.5 py-1.5 rounded-md bg-[#090b10] hover:bg-white/[0.06] border border-white/[0.1] text-[11px] font-medium text-cyan-300 transition-colors cursor-pointer"
                    >
                      Open Lyrics Tab
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ lyricsOnly: false })}
                      className="px-2.5 py-1.5 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-[11px] font-medium text-cyan-200 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Enable Visualizer
                    </button>
                  </div>
                </div>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-200">Visualizer Mode</h2>
                <div className="flex items-center gap-1.5">
                  {settings.lyricsOnly && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-[10px] font-medium text-amber-200">
                      Hidden
                    </span>
                  )}
                  <span className="text-[11px] font-mono tabular-nums text-slate-400">
                    {VISUALIZER_MODES.length} styles
                  </span>
                </div>
              </div>
              <div
                role="tablist"
                aria-label="Visualizer style categories"
                className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]"
              >
                {(
                  [
                    { id: 'all', label: `All (${VISUALIZER_MODES.length})` },
                    {
                      id: '3d',
                      label: `3D (${VISUALIZER_MODES.filter((m) => m.category === '3d').length})`,
                    },
                    {
                      id: 'unique',
                      label: `Unique (${VISUALIZER_MODES.filter((m) => m.category === 'unique').length})`,
                    },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={modeCategory === cat.id}
                    onClick={() => setModeCategory(cat.id)}
                    className={`py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      modeCategory === cat.id
                        ? 'bg-cyan-500/15 text-cyan-200 border border-cyan-400/35'
                        : 'text-slate-400 hover:text-slate-200 border border-transparent'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
              <input
                type="search"
                value={modeQuery}
                onChange={(e) => setModeQuery(e.target.value)}
                placeholder="Filter visualizer styles..."
                aria-label="Filter visualizer styles"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.08] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
              <div
                className={`space-y-1.5 max-h-[296px] overflow-y-auto studio-scroll pr-0.5 transition-opacity ${
                  settings.lyricsOnly ? 'opacity-50' : ''
                }`}
              >
                {VISUALIZER_MODES.filter((mode) => {
                  if (modeCategory !== 'all' && mode.category !== modeCategory) {
                    return false;
                  }
                  const q = modeQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    mode.name.toLowerCase().includes(q) ||
                    mode.desc.toLowerCase().includes(q) ||
                    mode.id.toLowerCase().includes(q)
                  );
                }).map((mode) => {
                  const active = !settings.lyricsOnly && settings.visualizerMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({ visualizerMode: mode.id, lyricsOnly: false })
                      }
                      className={`w-full px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-cyan-500/12 border-cyan-400/45 text-slate-100'
                          : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{mode.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{mode.desc}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-200">Audio Reactivity</h2>
                {onOpenMidiMapping && (
                  <button
                    type="button"
                    onClick={onOpenMidiMapping}
                    title="Bind physical MIDI controller faders and knobs"
                    className="px-2 py-1 rounded-md text-[10.5px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-cyan-300 border border-white/[0.08] hover:border-cyan-400/35 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Cable className="w-3 h-3 text-cyan-400" />
                    <span>MIDI Map</span>
                  </button>
                )}
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">
                    Visualizer Scale
                    {midiMappingBadges?.visualizerScale && (
                      <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                        · {midiMappingBadges.visualizerScale}
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {Math.round(settings.visualizerScale * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.55}
                  max={1.5}
                  step={0.05}
                  value={settings.visualizerScale}
                  onChange={(e) =>
                    onUpdateSettings({ visualizerScale: parseFloat(e.target.value) })
                  }
                  className="studio-range w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">
                    Sensitivity / Gain
                    {midiMappingBadges?.sensitivity && (
                      <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                        · {midiMappingBadges.sensitivity}
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {settings.sensitivity.toFixed(2)}×
                  </span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.5}
                  step={0.05}
                  value={settings.sensitivity}
                  onChange={(e) => onUpdateSettings({ sensitivity: parseFloat(e.target.value) })}
                  className="studio-range w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">
                    Bar Count
                    {midiMappingBadges?.barCount && (
                      <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                        · {midiMappingBadges.barCount}
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-cyan-400">{settings.barCount}</span>
                </div>
                <input
                  type="range"
                  min={32}
                  max={160}
                  step={4}
                  value={settings.barCount}
                  onChange={(e) => onUpdateSettings({ barCount: parseInt(e.target.value, 10) })}
                  className="studio-range w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">
                    Smoothing
                    {midiMappingBadges?.smoothing && (
                      <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                        · {midiMappingBadges.smoothing}
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {settings.smoothing.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={0.95}
                  step={0.05}
                  value={settings.smoothing}
                  onChange={(e) => onUpdateSettings({ smoothing: parseFloat(e.target.value) })}
                  className="studio-range w-full"
                />
              </div>

              <div className="space-y-2.5">
                {(() => {
                  const activeMotionBlurPreset = resolveActiveMotionBlurPreset(settings);
                  const activeMotionBlurConfig = MOTION_BLUR_PRESETS.find(
                    (p) => p.key === activeMotionBlurPreset
                  );

                  return (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="motion-blur-preset-select"
                            className="text-[11px] font-medium text-slate-300"
                          >
                            Motion Blur Preset
                          </label>
                          <span className="font-mono text-[10px] text-cyan-400/90">
                            {activeMotionBlurConfig?.name ?? 'None'}
                          </span>
                        </div>
                        <select
                          id="motion-blur-preset-select"
                          aria-label="Motion Blur Preset"
                          value={activeMotionBlurPreset}
                          onChange={(e) => {
                            const nextPreset = e.target.value as MotionBlurPresetKey;
                            onUpdateSettings(
                              getMotionBlurPresetPatch(nextPreset, settings.motionBlur)
                            );
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 focus:outline-none focus:border-cyan-400/60 cursor-pointer"
                        >
                          {MOTION_BLUR_PRESETS.map((preset) => (
                            <option key={preset.key} value={preset.key} className="bg-[#090b10]">
                              {preset.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">
                            Motion Blur Intensity
                            {midiMappingBadges?.motionBlur && (
                              <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                                · {midiMappingBadges.motionBlur}
                              </span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums text-cyan-400">
                            {settings.motionBlur === 0
                              ? 'Off'
                              : `${Math.round((settings.motionBlur / 0.85) * 100)}%`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={0.85}
                          step={0.05}
                          value={settings.motionBlur}
                          onChange={(e) => {
                            const nextVal = parseFloat(e.target.value);
                            const currentPreset = settings.motionBlurPreset ?? 'none';
                            onUpdateSettings({
                              motionBlur: nextVal,
                              motionBlurPreset:
                                nextVal <= 0.005
                                  ? 'none'
                                  : currentPreset === 'none'
                                  ? 'trails'
                                  : currentPreset,
                            });
                          }}
                          className="studio-range w-full"
                        />
                        <p className="text-[10px] text-slate-500 mt-1">
                          {activeMotionBlurConfig?.description}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="space-y-2.5">
                {(() => {
                  const activeBloomPreset = resolveActiveBloomPreset(settings);
                  const activeBloomConfig = BLOOM_PRESETS.find((p) => p.key === activeBloomPreset);
                  const radiusVal = settings.bloomRadius ?? DEFAULT_BLOOM_SHADER_PARAMS.bloomRadius;
                  const spreadVal = settings.bloomSpread ?? DEFAULT_BLOOM_SHADER_PARAMS.bloomSpread;
                  const satVal =
                    settings.bloomSaturation ?? DEFAULT_BLOOM_SHADER_PARAMS.bloomSaturation;

                  return (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-slate-300">
                            Bloom Preset
                          </span>
                          <div className="flex items-center gap-2 shrink-0">
                            {activeBloomPreset === 'custom' && (
                              <span className="text-[10px] font-mono text-amber-300/90">
                                Custom
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setShowBloomShaderParams((v) => !v)}
                              className="text-[10.5px] font-medium text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
                            >
                              {showBloomShaderParams ? 'Hide Shader' : 'Tune Shader'}
                            </button>
                          </div>
                        </div>

                        <div
                          role="radiogroup"
                          aria-label="Bloom Preset"
                          className="grid grid-cols-5 gap-1"
                        >
                          {BLOOM_PRESETS.map((preset) => {
                            const isSelected = activeBloomPreset === preset.key;
                            return (
                              <button
                                key={preset.key}
                                type="button"
                                role="radio"
                                aria-checked={isSelected}
                                title={`${preset.name}: ${preset.description} (Intensity ${Math.round(
                                  preset.bloomIntensity * 100
                                )}% · Radius ${preset.bloomRadius.toFixed(
                                  2
                                )}× · Spread ${Math.round(preset.bloomSpread * 100)}%)`}
                                onClick={() => onUpdateSettings(getBloomPresetPatch(preset.key))}
                                className={`px-1 py-1.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                                    : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05] hover:text-slate-100'
                                }`}
                              >
                                {preset.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className="text-slate-400">
                            Bloom Intensity
                            {midiMappingBadges?.bloomIntensity && (
                              <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                                · {midiMappingBadges.bloomIntensity}
                              </span>
                            )}
                          </span>
                          <span className="font-mono tabular-nums text-cyan-400">
                            {settings.bloomIntensity === 0
                              ? 'Off'
                              : `${Math.round(settings.bloomIntensity * 100)}%`}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.05}
                          value={settings.bloomIntensity}
                          onChange={(e) => {
                            const nextVal = parseFloat(e.target.value);
                            onUpdateSettings({
                              bloomIntensity: nextVal,
                              bloomPreset: nextVal <= 0.005 ? 'off' : 'custom',
                            });
                          }}
                          className="studio-range w-full"
                        />
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 mt-1">
                          <span className="truncate">
                            {activeBloomConfig
                              ? activeBloomConfig.description
                              : 'Custom intensity & multi-pass shader parameters.'}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-400 mt-0.5">
                          Radius {radiusVal.toFixed(2)}× · Haze {Math.round(spreadVal * 100)}% · Sat{' '}
                          {Math.round(satVal * 100)}%
                        </div>
                      </div>

                      {showBloomShaderParams && (
                        <div className="p-2.5 rounded-lg bg-[#090b10] border border-white/[0.07] space-y-2.5">
                          <div>
                            <div className="flex justify-between text-[10.5px] mb-1">
                              <span className="text-slate-400">Blur Kernel Radius</span>
                              <span className="font-mono tabular-nums text-cyan-400">
                                {radiusVal.toFixed(2)}×
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.5}
                              max={2.2}
                              step={0.05}
                              aria-label="Blur Kernel Radius"
                              value={radiusVal}
                              onChange={(e) =>
                                onUpdateSettings({
                                  bloomRadius: parseFloat(e.target.value),
                                  bloomPreset: 'custom',
                                })
                              }
                              className="studio-range w-full"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[10.5px] mb-1">
                              <span className="text-slate-400">Atmospheric Haze Spread</span>
                              <span className="font-mono tabular-nums text-cyan-400">
                                {Math.round(spreadVal * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={1}
                              step={0.02}
                              aria-label="Atmospheric Haze Spread"
                              value={spreadVal}
                              onChange={(e) =>
                                onUpdateSettings({
                                  bloomSpread: parseFloat(e.target.value),
                                  bloomPreset: 'custom',
                                })
                              }
                              className="studio-range w-full"
                            />
                          </div>

                          <div>
                            <div className="flex justify-between text-[10.5px] mb-1">
                              <span className="text-slate-400">Glow Saturation Drive</span>
                              <span className="font-mono tabular-nums text-cyan-400">
                                {Math.round(satVal * 100)}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.7}
                              max={1.8}
                              step={0.02}
                              aria-label="Glow Saturation Drive"
                              value={satVal}
                              onChange={(e) =>
                                onUpdateSettings({
                                  bloomSaturation: parseFloat(e.target.value),
                                  bloomPreset: 'custom',
                                })
                              }
                              className="studio-range w-full"
                            />
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <label htmlFor="visualizer-global-glow-slider" className="text-slate-400">
                    Global Glow
                  </label>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {(settings.globalGlow ?? 0) <= 0.005
                      ? 'Off'
                      : `${Math.round((settings.globalGlow ?? 0) * 100)}%`}
                  </span>
                </div>
                <input
                  id="visualizer-global-glow-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Global Glow"
                  value={settings.globalGlow ?? 0}
                  onChange={(e) =>
                    onUpdateSettings({ globalGlow: parseFloat(e.target.value) })
                  }
                  className="studio-range w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Controls uniform emission and atmospheric light glow across the entire visualizer scene.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">
                    Glitch Intensity
                    {midiMappingBadges?.glitchIntensity && (
                      <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                        · {midiMappingBadges.glitchIntensity}
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {(settings.glitchIntensity ?? 0) === 0
                      ? 'Off'
                      : `${Math.round((settings.glitchIntensity ?? 0) * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Glitch Intensity"
                  value={settings.glitchIntensity ?? 0}
                  onChange={(e) =>
                    onUpdateSettings({ glitchIntensity: parseFloat(e.target.value) })
                  }
                  className="studio-range w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Triggers randomized frame-dropping, RGB chromatic aberration, and slice tears on
                  heavy drum hits.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">
                    Bass Shake
                    {midiMappingBadges?.bassShake && (
                      <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                        · {midiMappingBadges.bassShake}
                      </span>
                    )}
                  </span>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {(settings.bassShake ?? 0) === 0
                      ? 'Off'
                      : `${Math.round((settings.bassShake ?? 0) * 100)}%`}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Bass Shake"
                  value={settings.bassShake ?? 0}
                  onChange={(e) =>
                    onUpdateSettings({ bassShake: parseFloat(e.target.value) })
                  }
                  className="studio-range w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Subtly oscillates and punches the canvas camera on heavy 140 Hz bass hits.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <label htmlFor="visualizer-beat-shake-slider" className="text-slate-400">
                    Beat Shake
                    {midiMappingBadges?.beatShake && (
                      <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                        · {midiMappingBadges.beatShake}
                      </span>
                    )}
                  </label>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {(settings.beatShake ?? 0) <= 0.005
                      ? 'Off'
                      : `${Math.round((settings.beatShake ?? 0) * 100)}%`}
                  </span>
                </div>
                <input
                  id="visualizer-beat-shake-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Beat Shake"
                  value={settings.beatShake ?? 0}
                  onChange={(e) =>
                    onUpdateSettings({ beatShake: parseFloat(e.target.value) })
                  }
                  className="studio-range w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Triggers a rapid, subtle screen-shake on every detected beat for a kinetic feel.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <label htmlFor="visualizer-scanline-slider" className="text-slate-400">
                    Scanline
                  </label>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {(settings.scanlineIntensity ?? 0) <= 0.005
                      ? 'Off'
                      : `${Math.round((settings.scanlineIntensity ?? 0) * 100)}%`}
                  </span>
                </div>
                <input
                  id="visualizer-scanline-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  aria-label="Scanline"
                  value={settings.scanlineIntensity ?? 0}
                  onChange={(e) =>
                    onUpdateSettings({ scanlineIntensity: parseFloat(e.target.value) })
                  }
                  className="studio-range w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Overlays a vintage CRT scanline and phosphor texture that reacts to frame
                  brightness.
                </p>
              </div>

              {(() => {
                const rawScanColor = (settings.scanlineColor ?? 'auto').trim();
                const isAutoScanColor =
                  !rawScanColor || rawScanColor.toLowerCase() === 'auto';
                const toHex6 = (hex: string, fallback = '#22d3ee') => {
                  const clean = hex.trim();
                  if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean;
                  if (/^#[0-9a-fA-F]{3}$/.test(clean)) {
                    return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
                  }
                  return fallback;
                };
                const resolvedScanHex = isAutoScanColor
                  ? toHex6(settings.primaryColor, '#22d3ee')
                  : toHex6(rawScanColor, '#22d3ee');
                const isGreenPhosphor =
                  !isAutoScanColor && resolvedScanHex.toLowerCase() === '#22c55e';
                const isAmberPhosphor =
                  !isAutoScanColor && resolvedScanHex.toLowerCase() === '#f59e0b';

                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <label
                        htmlFor="visualizer-scanline-color-picker"
                        className="text-slate-400"
                      >
                        Scanline Color
                      </label>
                      <span className="font-mono tabular-nums text-slate-300 uppercase">
                        {isAutoScanColor ? 'Theme Auto' : resolvedScanHex}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <label className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#090b10] border border-white/[0.09] hover:border-white/[0.18] transition-colors cursor-pointer shrink-0">
                        <input
                          id="visualizer-scanline-color-picker"
                          type="color"
                          aria-label="Scanline Color"
                          value={resolvedScanHex}
                          onChange={(e) =>
                            onUpdateSettings({ scanlineColor: e.target.value })
                          }
                          className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                        />
                        <span className="text-[10.5px] font-mono tabular-nums text-slate-300 uppercase">
                          {resolvedScanHex}
                        </span>
                      </label>
                      <div className="grid grid-cols-3 gap-1 flex-1 min-w-0">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ scanlineColor: 'auto' })
                          }
                          className={`px-1.5 py-1.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                            isAutoScanColor
                              ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                              : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                          }`}
                          title="Match active visualizer theme primary color"
                        >
                          Theme
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ scanlineColor: '#22c55e' })
                          }
                          className={`px-1.5 py-1.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                            isGreenPhosphor
                              ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                              : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                          }`}
                          title="Classic P1 green phosphor CRT"
                        >
                          Green
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({ scanlineColor: '#f59e0b' })
                          }
                          className={`px-1.5 py-1.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                            isAmberPhosphor
                              ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                              : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                          }`}
                          title="Vintage amber monochrome CRT"
                        >
                          Amber
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {(() => {
                const hueRot = Math.max(0, Math.min(360, Math.round(settings.globalHueRotation ?? 0)));
                const shiftedPalette = resolveAutoCycledColors(
                  { ...settings, autoCycleColor: false, globalHueRotation: hueRot },
                  0
                );
                return (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <label
                        htmlFor="visualizer-global-hue-slider"
                        className="text-slate-400"
                      >
                        Global Hue Rotation
                      </label>
                      <div className="flex items-center gap-2 shrink-0">
                        {hueRot > 0 && (
                          <div className="flex items-center gap-1" aria-hidden="true">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/25"
                              style={{ backgroundColor: shiftedPalette.primaryColor }}
                            />
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-white/25"
                              style={{ backgroundColor: shiftedPalette.secondaryColor }}
                            />
                          </div>
                        )}
                        <span className="font-mono tabular-nums text-cyan-400">
                          {hueRot}°
                        </span>
                        {hueRot > 0 && (
                          <button
                            type="button"
                            onClick={() => onUpdateSettings({ globalHueRotation: 0 })}
                            className="text-[10px] font-medium text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      id="visualizer-global-hue-slider"
                      type="range"
                      min={0}
                      max={360}
                      step={1}
                      aria-label="Global Hue Rotation"
                      value={hueRot}
                      onChange={(e) =>
                        onUpdateSettings({
                          globalHueRotation: parseInt(e.target.value, 10),
                        })
                      }
                      className="studio-range w-full"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Shifts all active theme palette colors around the color wheel by 0–360°.
                    </p>
                  </div>
                );
              })()}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  <h2 className="text-xs font-semibold text-slate-200">Beat Detection Mode</h2>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.beatDetection}
                  onClick={() =>
                    onUpdateSettings({ beatDetection: !settings.beatDetection })
                  }
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    settings.beatDetection ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.beatDetection ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Beat Flash Toggle */}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-200">Beat Flash</div>
                  <p className="text-[10.5px] text-slate-400 leading-snug">
                    Briefly invert and flash the background with primary/secondary colors on each beat trigger.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Beat Flash"
                  aria-checked={Boolean(settings.beatFlash)}
                  onClick={() =>
                    onUpdateSettings({
                      beatFlash: !settings.beatFlash,
                    })
                  }
                  className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    settings.beatFlash ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                      settings.beatFlash ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.beatDetection || settings.beatFlash ? (
                <div className="space-y-3 pt-0.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">
                        Burst Sensitivity
                        {midiMappingBadges?.beatSensitivity && (
                          <span className="ml-1.5 font-mono text-[10px] text-cyan-400/85">
                            · {midiMappingBadges.beatSensitivity}
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-cyan-400">
                        {settings.beatSensitivity.toFixed(2)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.8}
                      max={2.0}
                      step={0.05}
                      value={settings.beatSensitivity}
                      onChange={(e) =>
                        onUpdateSettings({ beatSensitivity: parseFloat(e.target.value) })
                      }
                      className="studio-range w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Low-Pass Bass Meter (140 Hz)</span>
                      <span className="font-mono text-[10px] text-slate-500">LPF Peak</span>
                    </div>
                    <div className="h-2 w-full rounded bg-[#0d1118] border border-white/[0.07] overflow-hidden">
                      <div
                        ref={beatMeterBarRef}
                        className="h-full w-full origin-left transition-none bg-gradient-to-r from-cyan-400 to-fuchsia-500"
                        style={{ transform: 'scaleX(0)' }}
                      />
                    </div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Routes audio through a secondary 140 Hz low-pass filter node to isolate bass
                    drum peaks and trigger shockwave, burst &amp; flash animations.
                  </p>

                  {settings.beatDetection && (
                    <div className="pt-2.5 mt-1 border-t border-white/[0.06] space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                            <Palette className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                            <span>Beat Color Mapping</span>
                          </div>
                          <p className="text-[10.5px] text-slate-400 leading-snug mt-0.5">
                            Interpolate visualizer colors across low, mid &amp; high frequency ranges by beat energy.
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-label="Beat Color Mapping"
                          aria-checked={Boolean(settings.beatColorMappingEnabled)}
                          onClick={() =>
                            onUpdateSettings({
                              beatColorMappingEnabled: !settings.beatColorMappingEnabled,
                            })
                          }
                          className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                            settings.beatColorMappingEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                          }`}
                        >
                          <span
                            className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                              settings.beatColorMappingEnabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {settings.beatColorMappingEnabled && (() => {
                        const lowColor = settings.beatColorLow ?? '#f43f5e';
                        const midColor = settings.beatColorMid ?? '#a855f7';
                        const highColor = settings.beatColorHigh ?? '#22d3ee';
                        const isCustom =
                          lowColor.toLowerCase() !== '#f43f5e' ||
                          midColor.toLowerCase() !== '#a855f7' ||
                          highColor.toLowerCase() !== '#22d3ee';

                        return (
                          <div className="rounded-lg bg-[#0d1118]/90 border border-white/[0.07] p-2.5 space-y-2.5">
                            <div className="grid grid-cols-3 gap-2">
                              <label className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-[10px] font-medium text-slate-400">
                                  Low (Bass)
                                </span>
                                <div className="flex items-center gap-1.5 rounded bg-white/[0.04] border border-white/[0.08] px-1.5 py-1 hover:border-white/[0.18] transition-colors">
                                  <input
                                    type="color"
                                    aria-label="Low frequency color"
                                    value={lowColor}
                                    onChange={(e) =>
                                      onUpdateSettings({ beatColorLow: e.target.value })
                                    }
                                    className="w-5 h-5 rounded border-0 bg-transparent p-0 cursor-pointer shrink-0"
                                  />
                                  <span className="font-mono text-[10px] text-slate-300 uppercase truncate">
                                    {lowColor}
                                  </span>
                                </div>
                              </label>

                              <label className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-[10px] font-medium text-slate-400">
                                  Mid
                                </span>
                                <div className="flex items-center gap-1.5 rounded bg-white/[0.04] border border-white/[0.08] px-1.5 py-1 hover:border-white/[0.18] transition-colors">
                                  <input
                                    type="color"
                                    aria-label="Mid frequency color"
                                    value={midColor}
                                    onChange={(e) =>
                                      onUpdateSettings({ beatColorMid: e.target.value })
                                    }
                                    className="w-5 h-5 rounded border-0 bg-transparent p-0 cursor-pointer shrink-0"
                                  />
                                  <span className="font-mono text-[10px] text-slate-300 uppercase truncate">
                                    {midColor}
                                  </span>
                                </div>
                              </label>

                              <label className="flex flex-col gap-1 cursor-pointer">
                                <span className="text-[10px] font-medium text-slate-400">
                                  High (Treble)
                                </span>
                                <div className="flex items-center gap-1.5 rounded bg-white/[0.04] border border-white/[0.08] px-1.5 py-1 hover:border-white/[0.18] transition-colors">
                                  <input
                                    type="color"
                                    aria-label="High frequency color"
                                    value={highColor}
                                    onChange={(e) =>
                                      onUpdateSettings({ beatColorHigh: e.target.value })
                                    }
                                    className="w-5 h-5 rounded border-0 bg-transparent p-0 cursor-pointer shrink-0"
                                  />
                                  <span className="font-mono text-[10px] text-slate-300 uppercase truncate">
                                    {highColor}
                                  </span>
                                </div>
                              </label>
                            </div>

                            <div className="space-y-1">
                              <div
                                className="h-2 w-full rounded-full border border-white/[0.08]"
                                style={{
                                  background: `linear-gradient(to right, ${lowColor}, ${midColor}, ${highColor})`,
                                }}
                              />
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>Low → Mid → High energy blend</span>
                                {isCustom && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onUpdateSettings({
                                        beatColorLow: '#f43f5e',
                                        beatColorMid: '#a855f7',
                                        beatColorHigh: '#22d3ee',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                  >
                                    <RotateCcw className="w-2.5 h-2.5" />
                                    <span>Reset</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Enable to track kick-drum peaks via a secondary 140 Hz low-pass filter and fire
                  shockwave, burst &amp; background flash animations.
                </p>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <ParticleSystemPanel
              settings={settings}
              onUpdateSettings={onUpdateSettings}
            />

            <hr className="border-white/[0.07]" />

            {/* Dance & Motion Capture */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Dance &amp; Motion Capture</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Built-in .bvh mocap animations &amp; beat-synced choreography
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={Boolean(settings.danceEnabled)}
                  aria-label="Character Dance Animation"
                  onClick={() =>
                    onUpdateSettings({ danceEnabled: !settings.danceEnabled })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                    settings.danceEnabled
                      ? 'bg-cyan-500/35 border-cyan-400/60'
                      : 'bg-white/[0.07] border-white/[0.12]'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                      settings.danceEnabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {settings.danceEnabled ? (
                <div className="space-y-3 pt-1">
                  {/* Built-In Motion Capture Library */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-300">
                        Built-In Mocap Library (.bvh){' '}
                        <span className="text-slate-500 font-normal">
                          · {BUILT_IN_MOCAP_LIBRARY.length}
                        </span>
                      </span>
                      {isBuiltInMocapStyle(settings.danceStyle) && (
                        <button
                          type="button"
                          onClick={() =>
                            downloadBuiltInMocapBvh(settings.danceStyle as typeof BUILT_IN_MOCAP_LIBRARY[number]['id'])
                          }
                          className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:text-cyan-200 whitespace-nowrap transition-colors cursor-pointer"
                          title="Download active built-in BVH motion capture file"
                        >
                          <Download className="w-3 h-3" />
                          <span>Save .bvh</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-0.5">
                      {BUILT_IN_MOCAP_LIBRARY.map((entry) => {
                        const active = settings.danceStyle === entry.id;
                        return (
                          <button
                            key={entry.id}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({ danceStyle: entry.id })
                            }
                            className={`text-left px-2.5 py-2 rounded-md border transition-colors cursor-pointer ${
                              active
                                ? 'bg-cyan-500/18 border-cyan-400/60 text-slate-100'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05] hover:border-white/[0.15]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="text-[11px] font-semibold truncate">
                                {entry.title}
                              </span>
                              {active && (
                                <Check className="w-3 h-3 text-cyan-300 shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 truncate font-mono tabular-nums">
                              {entry.genre} · {entry.bpmLabel}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="dance-style-select"
                      className="block text-[11px] text-slate-400 mb-1"
                    >
                      All Animation Styles (Mocap &amp; Procedural)
                    </label>
                    <select
                      id="dance-style-select"
                      value={settings.danceStyle ?? 'hip-hop'}
                      onChange={(e) =>
                        onUpdateSettings({
                          danceStyle: e.target.value as DanceStyleKey,
                        })
                      }
                      className="w-full px-2.5 py-1.5 rounded-md bg-[#090b10] border border-white/[0.1] text-xs text-slate-200 focus:outline-none focus:border-cyan-400/60"
                    >
                      <optgroup label="Built-In Motion Capture (.bvh)">
                        {DANCE_STYLE_OPTIONS.filter(
                          (opt) => opt.category === 'mocap-library'
                        ).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Procedural Beat Choreography">
                        {DANCE_STYLE_OPTIONS.filter(
                          (opt) => opt.category === 'procedural'
                        ).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Custom File">
                        {DANCE_STYLE_OPTIONS.filter(
                          (opt) => opt.category === 'custom'
                        ).map((opt) => (
                          <option key={opt.id} value={opt.id}>
                            {!mocapClip
                              ? `${opt.label} — Upload below`
                              : `${opt.label} (${mocapClip.name})`}
                          </option>
                        ))}
                      </optgroup>
                    </select>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {
                        DANCE_STYLE_OPTIONS.find(
                          (opt) => opt.id === (settings.danceStyle ?? 'hip-hop')
                        )?.desc
                      }
                    </p>
                  </div>

                  {/* Auto-Cycle / Medley Mode */}
                  {(() => {
                    const medleyEnabled = Boolean(settings.danceMedleyEnabled);
                    const medleyMoves = settings.danceMedleyStyles ?? [
                      'hip-hop',
                      'mocap-salsa',
                      'mocap-kpop',
                      'mocap-breakdance',
                    ];
                    const medleyTrigger: DanceMedleyTriggerMode =
                      settings.danceMedleyTrigger ?? 'beats';
                    const intervalBeats = settings.danceMedleyIntervalBeats ?? 8;
                    const intervalSeconds = settings.danceMedleyIntervalSeconds ?? 8;
                    const blendDuration = settings.danceMedleyBlendDuration ?? 0.45;
                    const selectableMoves = DANCE_STYLE_OPTIONS.filter(
                      (opt) => opt.id !== 'mocap-custom' || Boolean(mocapClip)
                    );

                    const toggleMedleyMove = (moveId: DanceStyleKey) => {
                      const exists = medleyMoves.includes(moveId);
                      const next = exists
                        ? medleyMoves.filter((id) => id !== moveId)
                        : [...medleyMoves, moveId];
                      onUpdateSettings({ danceMedleyStyles: next });
                    };

                    return (
                      <div className="rounded-lg bg-[#0d1118]/90 border border-white/[0.08] p-2.5 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                              <Repeat className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                              <span>Auto-Cycle / Medley Mode</span>
                              {medleyEnabled && (
                                <span className="font-mono text-[10px] text-cyan-300/90">
                                  · {medleyMoves.length}
                                </span>
                              )}
                            </div>
                            <p className="text-[10.5px] text-slate-400 leading-snug mt-0.5">
                              Rotate through a set of moves with smooth 3D pose blending.
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-label="Auto-Cycle / Medley Mode"
                            aria-checked={medleyEnabled}
                            onClick={() =>
                              onUpdateSettings({
                                danceMedleyEnabled: !medleyEnabled,
                              })
                            }
                            className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                              medleyEnabled ? 'bg-cyan-500' : 'bg-slate-700'
                            }`}
                          >
                            <span
                              className={`block w-4 h-4 rounded-full bg-white transition-transform ${
                                medleyEnabled ? 'translate-x-4' : 'translate-x-0'
                              }`}
                            />
                          </button>
                        </div>

                        {medleyEnabled && (
                          <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                            {/* Switch Trigger Selector */}
                            <div>
                              <span className="block text-[10.5px] text-slate-400 mb-1">
                                Switch Move Every
                              </span>
                              <div className="grid grid-cols-3 gap-1">
                                {(
                                  [
                                    { id: 'beats', label: 'N Beats' },
                                    { id: 'seconds', label: 'N Seconds' },
                                    { id: 'lyrics', label: 'Lyric Cue' },
                                  ] as Array<{ id: DanceMedleyTriggerMode; label: string }>
                                ).map((opt) => {
                                  const active = medleyTrigger === opt.id;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() =>
                                        onUpdateSettings({ danceMedleyTrigger: opt.id })
                                      }
                                      className={`px-2 py-1.5 rounded-md border text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                                        active
                                          ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                                          : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Conditional Interval Control */}
                            {medleyTrigger === 'beats' && (
                              <div>
                                <div className="flex justify-between text-[11px] mb-1">
                                  <label
                                    htmlFor="dance-medley-beats-slider"
                                    className="text-slate-400"
                                  >
                                    Beats per Move
                                  </label>
                                  <span className="font-mono tabular-nums text-cyan-400">
                                    {intervalBeats} beats
                                  </span>
                                </div>
                                <input
                                  id="dance-medley-beats-slider"
                                  type="range"
                                  min={2}
                                  max={32}
                                  step={2}
                                  aria-label="Beats per Move"
                                  value={intervalBeats}
                                  onChange={(e) =>
                                    onUpdateSettings({
                                      danceMedleyIntervalBeats: parseInt(e.target.value, 10),
                                    })
                                  }
                                  className="studio-range w-full"
                                />
                                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5 font-mono">
                                  {[4, 8, 16, 24].map((b) => (
                                    <button
                                      key={b}
                                      type="button"
                                      onClick={() =>
                                        onUpdateSettings({ danceMedleyIntervalBeats: b })
                                      }
                                      className={`cursor-pointer hover:text-cyan-300 ${
                                        intervalBeats === b ? 'text-cyan-400' : ''
                                      }`}
                                    >
                                      {b}b
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {medleyTrigger === 'seconds' && (
                              <div>
                                <div className="flex justify-between text-[11px] mb-1">
                                  <label
                                    htmlFor="dance-medley-seconds-slider"
                                    className="text-slate-400"
                                  >
                                    Seconds per Move
                                  </label>
                                  <span className="font-mono tabular-nums text-cyan-400">
                                    {intervalSeconds.toFixed(1).replace(/\.0$/, '')}s
                                  </span>
                                </div>
                                <input
                                  id="dance-medley-seconds-slider"
                                  type="range"
                                  min={2}
                                  max={30}
                                  step={1}
                                  aria-label="Seconds per Move"
                                  value={intervalSeconds}
                                  onChange={(e) =>
                                    onUpdateSettings({
                                      danceMedleyIntervalSeconds: parseFloat(e.target.value),
                                    })
                                  }
                                  className="studio-range w-full"
                                />
                                <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5 font-mono">
                                  {[4, 8, 12, 16].map((sec) => (
                                    <button
                                      key={sec}
                                      type="button"
                                      onClick={() =>
                                        onUpdateSettings({ danceMedleyIntervalSeconds: sec })
                                      }
                                      className={`cursor-pointer hover:text-cyan-300 ${
                                        Math.abs(intervalSeconds - sec) < 0.1
                                          ? 'text-cyan-400'
                                          : ''
                                      }`}
                                    >
                                      {sec}s
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {medleyTrigger === 'lyrics' && (
                              <p className="text-[10.5px] leading-snug text-slate-400">
                                {lyrics.length > 0
                                  ? `Advances to the next selected move on every lyric cue (${lyrics.length} cues loaded).`
                                  : 'Add or auto-generate lyrics in the Lyrics tab so moves advance on each lyric transition.'}
                              </p>
                            )}

                            {/* Pose Blend Smoothness */}
                            <div>
                              <div className="flex justify-between text-[11px] mb-1">
                                <label
                                  htmlFor="dance-medley-blend-slider"
                                  className="text-slate-400"
                                >
                                  Pose Blend Smoothness
                                </label>
                                <span className="font-mono tabular-nums text-cyan-400">
                                  {blendDuration.toFixed(2)}s
                                </span>
                              </div>
                              <input
                                id="dance-medley-blend-slider"
                                type="range"
                                min={0.15}
                                max={1.5}
                                step={0.05}
                                aria-label="Pose Blend Smoothness"
                                value={blendDuration}
                                onChange={(e) =>
                                  onUpdateSettings({
                                    danceMedleyBlendDuration: parseFloat(e.target.value),
                                  })
                                }
                                className="studio-range w-full"
                              />
                            </div>

                            {/* Quick Mix Presets & Move Selection */}
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[10.5px] font-medium text-slate-300">
                                  Medley Move Set ({medleyMoves.length} selected)
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    onUpdateSettings({
                                      danceMedleyStyles: selectableMoves.map((m) => m.id),
                                    })
                                  }
                                  className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
                                >
                                  Select All
                                </button>
                              </div>

                              <div className="flex flex-wrap gap-1">
                                {DANCE_MEDLEY_PRESETS.map((preset) => (
                                  <button
                                    key={preset.id}
                                    type="button"
                                    title={preset.desc}
                                    onClick={() =>
                                      onUpdateSettings({
                                        danceMedleyStyles: [...preset.styles],
                                      })
                                    }
                                    className="px-2 py-0.5 rounded border border-white/[0.08] bg-[#090b10] text-[10px] text-slate-300 hover:border-cyan-400/50 hover:text-cyan-200 transition-colors cursor-pointer"
                                  >
                                    {preset.label}
                                  </button>
                                ))}
                              </div>

                              <div className="grid grid-cols-2 gap-1 max-h-40 overflow-y-auto pr-0.5 pt-0.5">
                                {selectableMoves.map((opt) => {
                                  const orderIdx = medleyMoves.indexOf(opt.id);
                                  const selected = orderIdx >= 0;
                                  const shortLabel = opt.label.replace(' (Mocap)', '');
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      onClick={() => toggleMedleyMove(opt.id)}
                                      className={`flex items-center justify-between gap-1.5 px-2 py-1.5 rounded border text-left transition-colors cursor-pointer ${
                                        selected
                                          ? 'bg-cyan-500/18 border-cyan-400/55 text-cyan-100'
                                          : 'bg-[#090b10] border-white/[0.07] text-slate-400 hover:text-slate-200 hover:border-white/[0.15]'
                                      }`}
                                    >
                                      <span className="text-[10.5px] truncate">{shortLabel}</span>
                                      {selected && (
                                        <span className="text-[9.5px] font-mono tabular-nums text-cyan-300 shrink-0">
                                          #{orderIdx + 1}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>

                              {medleyMoves.length < 2 && (
                                <p className="text-[10px] text-amber-300/90">
                                  Pick at least 2 moves to cycle through during playback.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-300">
                        Dancer Character
                      </span>
                      <span className="text-[10.5px] font-mono tabular-nums text-cyan-400">
                        {DANCE_AVATAR_OPTIONS.find(
                          (opt) =>
                            opt.id ===
                            (settings.avatarStyle ?? settings.danceAvatarStyle ?? 'human-dancer')
                        )?.label ?? 'Studio Pop'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {DANCE_AVATAR_OPTIONS.filter(
                        (opt) => opt.category === 'human'
                      ).map((opt) => {
                        const active =
                          (settings.avatarStyle ??
                            settings.danceAvatarStyle ??
                            'human-dancer') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({
                                avatarStyle: opt.id as DanceAvatarStyle,
                                danceAvatarStyle: opt.id as DanceAvatarStyle,
                              })
                            }
                            className={`text-left px-2.5 py-1.5 rounded-md border transition-colors cursor-pointer ${
                              active
                                ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-100'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[11px] font-semibold truncate">
                                {opt.label}
                              </span>
                              {active && (
                                <Check className="w-3 h-3 text-cyan-300 shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate mt-0.5">
                              {opt.desc}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <span className="block text-[11px] text-slate-400 pt-0.5">
                      Skeleton &amp; Mocap Rigs
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {DANCE_AVATAR_OPTIONS.filter(
                        (opt) => opt.category === 'rig'
                      ).map((opt) => {
                        const active =
                          (settings.avatarStyle ??
                            settings.danceAvatarStyle ??
                            'human-dancer') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({
                                avatarStyle: opt.id as DanceAvatarStyle,
                                danceAvatarStyle: opt.id as DanceAvatarStyle,
                              })
                            }
                            className={`px-2 py-1.5 rounded-md border text-[11px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                              active
                                ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                            }`}
                            title={opt.desc}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] text-slate-400 mb-1.5">
                      Stage Placement
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['left', 'center', 'right'] as DancePlacement[]).map((pos) => {
                        const active = (settings.dancePlacement ?? 'center') === pos;
                        return (
                          <button
                            key={pos}
                            type="button"
                            onClick={() => onUpdateSettings({ dancePlacement: pos })}
                            className={`px-2 py-1.5 rounded-md border text-[11px] font-medium capitalize whitespace-nowrap transition-colors cursor-pointer ${
                              active
                                ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                            }`}
                          >
                            {pos}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <label htmlFor="dance-count-slider" className="text-slate-400">
                        Dancer Count
                      </label>
                      <span className="font-mono tabular-nums text-slate-300">
                        {Math.max(1, Math.min(3, Math.round(settings.danceCount ?? 1)))}{' '}
                        {Math.round(settings.danceCount ?? 1) === 1
                          ? 'Dancer'
                          : Math.round(settings.danceCount ?? 1) === 2
                          ? 'Duo'
                          : 'Crew'}
                      </span>
                    </div>
                    <input
                      id="dance-count-slider"
                      type="range"
                      min={1}
                      max={3}
                      step={1}
                      aria-label="Dancer Count"
                      value={Math.max(1, Math.min(3, Math.round(settings.danceCount ?? 1)))}
                      onChange={(e) =>
                        onUpdateSettings({ danceCount: parseInt(e.target.value, 10) })
                      }
                      className="studio-range w-full"
                    />
                    <div className="flex justify-between text-[10px] text-slate-500 mt-0.5 font-mono tabular-nums">
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ danceCount: 1 })}
                        className="hover:text-slate-300 cursor-pointer"
                      >
                        1 Solo
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ danceCount: 2 })}
                        className="hover:text-slate-300 cursor-pointer"
                      >
                        2 Duo
                      </button>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ danceCount: 3 })}
                        className="hover:text-slate-300 cursor-pointer"
                      >
                        3 Crew
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Size</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {(settings.danceScale ?? 1).toFixed(2)}×
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.5}
                        max={1.6}
                        step={0.05}
                        value={settings.danceScale ?? 1}
                        onChange={(e) =>
                          onUpdateSettings({ danceScale: parseFloat(e.target.value) })
                        }
                        className="studio-range w-full"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <span className="text-slate-400">Energy</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          {(settings.danceEnergy ?? 1).toFixed(2)}×
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0.3}
                        max={2.0}
                        step={0.05}
                        value={settings.danceEnergy ?? 1}
                        onChange={(e) =>
                          onUpdateSettings({ danceEnergy: parseFloat(e.target.value) })
                        }
                        className="studio-range w-full"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <label htmlFor="dance-strobe-slider" className="text-slate-400">
                        Dancer Strobe
                      </label>
                      <span className="font-mono tabular-nums text-slate-300">
                        {(settings.danceStrobe ?? 0) <= 0.005
                          ? 'Off'
                          : `${Math.round((settings.danceStrobe ?? 0) * 100)}%`}
                      </span>
                    </div>
                    <input
                      id="dance-strobe-slider"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      aria-label="Dancer Strobe"
                      value={settings.danceStrobe ?? 0}
                      onChange={(e) =>
                        onUpdateSettings({ danceStrobe: parseFloat(e.target.value) })
                      }
                      className="studio-range w-full"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Rapidly dims and brightens dancing avatars on beat detection peaks
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 py-1">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200">
                        Sync Hits to Lyric Cues
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Accentuate arm hits &amp; poses when each lyric line drops
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.danceLyricSync ?? true}
                      aria-label="Sync Hits to Lyric Cues"
                      onClick={() =>
                        onUpdateSettings({
                          danceLyricSync: !(settings.danceLyricSync ?? true),
                        })
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                        (settings.danceLyricSync ?? true)
                          ? 'bg-cyan-500/35 border-cyan-400/60'
                          : 'bg-white/[0.07] border-white/[0.12]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          (settings.danceLyricSync ?? true)
                            ? 'translate-x-4'
                            : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 py-1">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-slate-200">
                        Mirror Dancers
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Horizontally flip avatars for a symmetric stage formation
                      </div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={Boolean(settings.danceMirror)}
                      aria-label="Mirror Dancers"
                      onClick={() =>
                        onUpdateSettings({
                          danceMirror: !settings.danceMirror,
                        })
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                        settings.danceMirror
                          ? 'bg-cyan-500/35 border-cyan-400/60'
                          : 'bg-white/[0.07] border-white/[0.12]'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                          settings.danceMirror ? 'translate-x-4' : 'translate-x-0.5'
                        }`}
                      />
                    </button>
                  </div>

                  <div className="border-t border-white/[0.07] pt-3 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-slate-200">
                        Dancer Lighting
                      </span>
                      {((settings.danceSpotlightIntensity ?? 1) !== 1 ||
                        (settings.danceRimColor ?? 'auto') !== 'auto') && (
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateSettings({
                              danceSpotlightIntensity: 1,
                              danceRimColor: 'auto',
                            })
                          }
                          className="text-[10.5px] font-medium text-slate-400 hover:text-cyan-300 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                        >
                          Reset Lighting
                        </button>
                      )}
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1">
                        <label htmlFor="dance-spotlight-slider" className="text-slate-400">
                          Spotlight Intensity
                        </label>
                        <span className="font-mono tabular-nums text-slate-300">
                          {(settings.danceSpotlightIntensity ?? 1) <= 0.005
                            ? 'Off'
                            : `${Math.round((settings.danceSpotlightIntensity ?? 1) * 100)}%`}
                        </span>
                      </div>
                      <input
                        id="dance-spotlight-slider"
                        type="range"
                        min={0}
                        max={2}
                        step={0.05}
                        aria-label="Spotlight Intensity"
                        value={settings.danceSpotlightIntensity ?? 1}
                        onChange={(e) =>
                          onUpdateSettings({
                            danceSpotlightIntensity: parseFloat(e.target.value),
                          })
                        }
                        className="studio-range w-full"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Controls overhead stage beam, floor light pool, and key illumination
                      </p>
                    </div>

                    {(() => {
                      const rawRim = (settings.danceRimColor ?? 'auto').trim();
                      const isAutoRim =
                        !rawRim || rawRim.toLowerCase() === 'auto';
                      const toHex6 = (hex: string, fallback = '#22d3ee') => {
                        const clean = hex.trim();
                        if (/^#[0-9a-fA-F]{6}$/.test(clean)) return clean;
                        if (/^#[0-9a-fA-F]{3}$/.test(clean)) {
                          return `#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`;
                        }
                        return fallback;
                      };
                      const resolvedRimHex = isAutoRim
                        ? toHex6(settings.primaryColor, '#22d3ee')
                        : toHex6(rawRim, '#22d3ee');
                      const secHex = toHex6(settings.secondaryColor, '#a855f7');
                      const isSecondaryRim =
                        !isAutoRim &&
                        resolvedRimHex.toLowerCase() === secHex.toLowerCase();
                      const isWhiteRim =
                        !isAutoRim && resolvedRimHex.toLowerCase() === '#f8fafc';

                      return (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <label
                              htmlFor="dance-rim-color-picker"
                              className="text-slate-400"
                            >
                              Rim Light Color
                            </label>
                            <span className="font-mono tabular-nums text-slate-300 uppercase">
                              {isAutoRim ? 'Theme Auto' : resolvedRimHex}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <label className="flex items-center gap-2 px-2 py-1 rounded-md bg-[#090b10] border border-white/[0.09] hover:border-white/[0.18] transition-colors cursor-pointer shrink-0">
                              <input
                                id="dance-rim-color-picker"
                                type="color"
                                aria-label="Rim Light Color"
                                value={resolvedRimHex}
                                onChange={(e) =>
                                  onUpdateSettings({ danceRimColor: e.target.value })
                                }
                                className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
                              />
                              <span className="text-[10.5px] font-mono tabular-nums text-slate-300 uppercase">
                                {resolvedRimHex}
                              </span>
                            </label>
                            <div className="grid grid-cols-3 gap-1 flex-1 min-w-0">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSettings({ danceRimColor: 'auto' })
                                }
                                className={`px-1.5 py-1.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                                  isAutoRim
                                    ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                                    : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                                }`}
                                title="Automatically follow active visualizer theme colors"
                              >
                                Theme
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSettings({ danceRimColor: secHex })
                                }
                                className={`px-1.5 py-1.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                                  isSecondaryRim
                                    ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                                    : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                                }`}
                                title="Use visualizer secondary theme color for rim separation"
                              >
                                Accent
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateSettings({ danceRimColor: '#f8fafc' })
                                }
                                className={`px-1.5 py-1.5 rounded-md border text-[10.5px] font-medium whitespace-nowrap truncate transition-colors cursor-pointer ${
                                  isWhiteRim
                                    ? 'bg-cyan-500/20 border-cyan-400/55 text-cyan-200'
                                    : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:bg-white/[0.05]'
                                }`}
                                title="Use neutral studio white rim light"
                              >
                                White
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between gap-3 pt-1">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-200">
                          Dancer Shadow
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Floor-mapped drop shadow reacting to stage lighting position
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={settings.danceShadow ?? true}
                        aria-label="Dancer Shadow"
                        onClick={() =>
                          onUpdateSettings({
                            danceShadow: !(settings.danceShadow ?? true),
                          })
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                          (settings.danceShadow ?? true)
                            ? 'bg-cyan-500/35 border-cyan-400/60'
                            : 'bg-white/[0.07] border-white/[0.12]'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            (settings.danceShadow ?? true)
                              ? 'translate-x-4'
                              : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[#090b10] border border-white/[0.08] space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-slate-300">
                        Motion Capture File (.bvh / .json)
                      </span>
                      <input
                        ref={mocapInputRef}
                        type="file"
                        accept=".bvh,.json,application/json,text/plain"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = '';
                          if (!file || !onMocapFileSelect) return;
                          setMocapNotice(null);
                          const res = await onMocapFileSelect(file);
                          if (res.ok) {
                            setMocapNotice({
                              type: 'success',
                              text: `Loaded ${res.clip.name} (${res.clip.frames.length} frames @ ${res.clip.fps} fps)`,
                            });
                          } else {
                            setMocapNotice({
                              type: 'error',
                              text: res.error,
                            });
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => mocapInputRef.current?.click()}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.12] text-[11px] font-medium text-slate-200 whitespace-nowrap transition-colors cursor-pointer"
                      >
                        <Upload className="w-3 h-3 text-cyan-400" />
                        <span>Upload Mocap</span>
                      </button>
                    </div>

                    {mocapClip ? (
                      <div className="flex items-center justify-between gap-2 pt-0.5 text-[11px]">
                        <span className="text-slate-300 truncate font-mono tabular-nums">
                          {mocapClip.name} · {mocapClip.frames.length}f · {mocapClip.fps}fps
                        </span>
                        {onClearMocapClip && (
                          <button
                            type="button"
                            onClick={() => {
                              setMocapNotice(null);
                              onClearMocapClip();
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-white/[0.1] text-slate-400 hover:text-rose-300 hover:border-rose-400/40 whitespace-nowrap transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Clear</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Optional: import standard <span className="font-mono text-slate-300">.bvh</span> or skeleton{' '}
                        <span className="font-mono text-slate-300">.json</span> mocap clips. Without a file, procedural choreography dances on every beat.
                      </p>
                    )}

                    {mocapNotice && (
                      <p
                        className={`text-[11px] leading-snug ${
                          mocapNotice.type === 'success'
                            ? 'text-emerald-300'
                            : 'text-rose-300'
                        }`}
                      >
                        {mocapNotice.text}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Enable to add a 3D animated dancer that reacts to bass beats, audio energy, and lyric drops—or upload your own <span className="font-mono text-slate-300">.bvh</span> motion-capture clip.
                </p>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <SceneTransitionPanel
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onPreviewTransition={onPreviewSceneTransition}
            />
          </>
        )}

        {/* 4. LYRICS TAB */}
        {activeTab === 'lyrics' && (
          <>
            <section className="space-y-2">
              <div className="p-2.5 rounded-lg bg-[#090b10] border border-white/[0.08] space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-200">
                      Lyrics-Only Mode
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Hide visualizer modes and show half verse, full verse, or full lyrics
                    </div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(settings.lyricsOnly)}
                    aria-label="Toggle Lyrics-Only Mode"
                    onClick={() => onUpdateSettings({ lyricsOnly: !settings.lyricsOnly })}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer ${
                      settings.lyricsOnly
                        ? 'bg-cyan-500/35 border-cyan-400/60'
                        : 'bg-white/[0.07] border-white/[0.12]'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                        settings.lyricsOnly ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </div>

                {settings.lyricsOnly && (
                  <div className="pt-2 border-t border-white/[0.07] space-y-1.5">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">Visible Lyrics</span>
                      <span className="font-mono text-cyan-300">
                        {(settings.lyricsOnlyLayout ?? 'full-verse') === 'half-verse'
                          ? '~5 lines'
                          : (settings.lyricsOnlyLayout ?? 'full-verse') === 'full-lyrics'
                          ? `${lyrics.length} lines`
                          : 'Active verse'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'half-verse', label: 'Half Verse' },
                          { id: 'full-verse', label: 'Full Verse' },
                          { id: 'full-lyrics', label: 'Full Lyrics' },
                        ] as const
                      ).map((opt) => {
                        const active =
                          (settings.lyricsOnlyLayout ?? 'full-verse') === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({
                                lyricsOnlyLayout: opt.id as LyricsOnlyLayout,
                              })
                            }
                            className={`px-2 py-1.5 rounded-md border text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-cyan-500/18 border-cyan-400/50 text-cyan-100'
                                : 'bg-[#111520] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Display Style</h2>
                <span className="text-[11px] font-mono tabular-nums text-slate-400">
                  {LYRIC_STYLES.length} styles
                </span>
              </div>
              <input
                type="search"
                value={lyricStyleQuery}
                onChange={(e) => setLyricStyleQuery(e.target.value)}
                placeholder="Filter display styles..."
                aria-label="Filter display styles"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.08] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
              <div className="space-y-1.5 max-h-[296px] overflow-y-auto studio-scroll pr-0.5">
                {LYRIC_STYLES.filter((style) => {
                  const q = lyricStyleQuery.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    style.name.toLowerCase().includes(q) ||
                    style.desc.toLowerCase().includes(q) ||
                    style.id.toLowerCase().includes(q)
                  );
                }).map((style) => {
                  const active = settings.lyricStyle === style.id;
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => onUpdateSettings({ lyricStyle: style.id })}
                      className={`w-full px-3 py-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-cyan-500/12 border-cyan-400/45 text-slate-100'
                          : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{style.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{style.desc}</div>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="lyric-font-select"
                  className="text-xs font-semibold text-slate-200"
                >
                  Lyric Font
                </label>
                <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                  {LYRIC_FONT_OPTIONS.find((f) => f.id === (settings.lyricFont ?? 'auto'))
                    ?.shortLabel ?? 'Default'}
                </span>
              </div>
              <select
                id="lyric-font-select"
                aria-label="Lyric Font"
                value={settings.lyricFont ?? 'auto'}
                onChange={(e) =>
                  onUpdateSettings({ lyricFont: e.target.value as LyricFontKey })
                }
                className="w-full px-2.5 py-2 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs font-medium text-slate-100 focus:outline-none focus:border-cyan-400/60 cursor-pointer"
              >
                {LYRIC_FONT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#090b10] text-slate-100">
                    {opt.label}
                  </option>
                ))}
              </select>
              <div
                className="px-3 py-2 rounded-lg bg-[#090b10] border border-white/[0.07] text-xs text-slate-200 truncate"
                style={{
                  fontFamily: resolveLyricFontFamily(settings.lyricFont),
                  letterSpacing: `${(settings.lyricLetterSpacing ?? 0).toFixed(2)}em`,
                }}
              >
                Midnight rhythm · Live caption preview
              </div>
              <p className="text-[10.5px] text-slate-500 leading-relaxed">
                {LYRIC_FONT_OPTIONS.find((f) => f.id === (settings.lyricFont ?? 'auto'))?.desc}
              </p>
            </section>

            {/* Letter Spacing / Kerning */}
            <section className="space-y-2.5">
              {(() => {
                const spacingVal = settings.lyricLetterSpacing ?? 0;
                const formatted =
                  Math.abs(spacingVal) < 0.005
                    ? 'Normal'
                    : `${spacingVal > 0 ? '+' : ''}${spacingVal.toFixed(2)}em`;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="lyric-letter-spacing-slider"
                        className="text-xs font-semibold text-slate-200"
                      >
                        Letter Spacing
                      </label>
                      <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                        {formatted}
                      </span>
                    </div>
                    <input
                      id="lyric-letter-spacing-slider"
                      type="range"
                      aria-label="Letter Spacing"
                      min={-0.06}
                      max={0.3}
                      step={0.01}
                      value={spacingVal}
                      onChange={(e) =>
                        onUpdateSettings({
                          lyricLetterSpacing: parseFloat(e.target.value),
                        })
                      }
                      className="studio-range w-full"
                    />
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { label: 'Tight', val: -0.04 },
                          { label: 'Normal', val: 0 },
                          { label: 'Wide', val: 0.1 },
                          { label: 'Cinema', val: 0.22 },
                        ] as const
                      ).map((preset) => {
                        const active = Math.abs(spacingVal - preset.val) < 0.008;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({ lyricLetterSpacing: preset.val })
                            }
                            className={`px-2 py-1 rounded-md text-[10.5px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-200'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10.5px] text-slate-500 leading-relaxed">
                      Adjust horizontal tracking between characters to refine display, serif, or uppercase typography.
                    </p>
                  </>
                );
              })()}
            </section>

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200">
                  Vertical Position
                  {midiMappingBadges?.lyricPosition && (
                    <span className="ml-1.5 font-mono text-[10px] font-normal text-cyan-400/85">
                      · {midiMappingBadges.lyricPosition}
                    </span>
                  )}
                </span>
                <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                  {settings.lyricPosition}% from top
                </span>
              </div>
              <input
                type="range"
                min={15}
                max={92}
                step={1}
                value={settings.lyricPosition}
                onChange={(e) =>
                  onUpdateSettings({ lyricPosition: parseInt(e.target.value, 10) })
                }
                className="studio-range w-full"
              />
              <div className="grid grid-cols-4 gap-1.5">
                {(
                  [
                    { label: 'Top', val: 22 },
                    { label: 'Mid', val: 50 },
                    { label: '9:16 Safe', val: 74 },
                    { label: 'Bottom', val: 84 },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => onUpdateSettings({ lyricPosition: preset.val })}
                    className={`px-2 py-1 rounded-md text-[10.5px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      settings.lyricPosition === preset.val
                        ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-200'
                        : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </section>

            {/* Lyric Shadow Intensity */}
            <section className="space-y-2.5">
              {(() => {
                const shadowVal = settings.lyricShadowIntensity ?? 1;
                return (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-200">
                        Shadow Intensity
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                        {shadowVal <= 0.01 ? 'Off' : `${Math.round(shadowVal * 100)}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      aria-label="Shadow Intensity"
                      min={0}
                      max={2}
                      step={0.05}
                      value={shadowVal}
                      onChange={(e) =>
                        onUpdateSettings({
                          lyricShadowIntensity: parseFloat(e.target.value),
                        })
                      }
                      className="studio-range w-full"
                    />
                    <div className="grid grid-cols-4 gap-1.5">
                      {(
                        [
                          { label: 'Off', val: 0 },
                          { label: 'Soft', val: 0.5 },
                          { label: 'Standard', val: 1 },
                          { label: 'Deep', val: 1.8 },
                        ] as const
                      ).map((preset) => {
                        const active = Math.abs(shadowVal - preset.val) < 0.03;
                        return (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() =>
                              onUpdateSettings({ lyricShadowIntensity: preset.val })
                            }
                            className={`px-2 py-1 rounded-md text-[10.5px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                              active
                                ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-200'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10.5px] text-slate-500 leading-relaxed">
                      Boosts drop-shadow depth and contrast behind lyrics over bright or complex backgrounds.
                    </p>
                  </>
                );
              })()}
            </section>

            {/* Lyric Beat Sync & Pulse Intensity */}
            <section className="space-y-3">
              {(() => {
                const beatSyncEnabled = Boolean(settings.lyricBeatSync);
                const pulseVal = settings.lyricPulseIntensity ?? 1;
                return (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <h2 className="text-xs font-semibold text-slate-200">Lyric Beat Sync</h2>
                        <p className="text-[11px] text-slate-400">
                          Scale up and glow active lyrics on every detected beat.
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-label="Lyric Beat Sync"
                        aria-checked={beatSyncEnabled}
                        onClick={() =>
                          onUpdateSettings({ lyricBeatSync: !beatSyncEnabled })
                        }
                        className={`w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                          beatSyncEnabled ? 'bg-cyan-400' : 'bg-white/[0.14]'
                        }`}
                      >
                        <span
                          className={`block w-4 h-4 rounded-full bg-[#090b10] transition-transform ${
                            beatSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    <div
                      className={`space-y-2 transition-opacity ${
                        beatSyncEnabled ? 'opacity-100' : 'opacity-65'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200">
                          Lyric Pulse Intensity
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                          {pulseVal <= 0.01 ? 'Off' : `${Math.round(pulseVal * 100)}%`}
                        </span>
                      </div>
                      <input
                        type="range"
                        aria-label="Lyric Pulse Intensity"
                        min={0}
                        max={2}
                        step={0.05}
                        value={pulseVal}
                        onChange={(e) => {
                          const nextVal = parseFloat(e.target.value);
                          onUpdateSettings({
                            lyricPulseIntensity: nextVal,
                            ...(nextVal > 0 && !beatSyncEnabled
                              ? { lyricBeatSync: true }
                              : {}),
                          });
                        }}
                        className="studio-range w-full"
                      />
                      <div className="grid grid-cols-4 gap-1.5">
                        {(
                          [
                            { label: 'Subtle', val: 0.5 },
                            { label: 'Standard', val: 1 },
                            { label: 'Punch', val: 1.5 },
                            { label: 'Max', val: 2 },
                          ] as const
                        ).map((preset) => {
                          const active =
                            beatSyncEnabled && Math.abs(pulseVal - preset.val) < 0.03;
                          return (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() =>
                                onUpdateSettings({
                                  lyricBeatSync: true,
                                  lyricPulseIntensity: preset.val,
                                })
                              }
                              className={`px-2 py-1 rounded-md text-[10.5px] font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                                active
                                  ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-200'
                                  : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {preset.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                );
              })()}
            </section>

            <hr className="border-white/[0.07]" />

            <SceneTransitionPanel
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              onPreviewTransition={onPreviewSceneTransition}
            />

            <hr className="border-white/[0.07]" />

            <section ref={autoCaptionsSectionRef} className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-200">Automatic Captions</h2>
              <button
                type="button"
                onClick={onAutoGenerateCaptions}
                disabled={!hasAudio || isGeneratingCaptions}
                className="w-full py-2.5 px-3 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
              >
                {isGeneratingCaptions ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Captions className="w-3.5 h-3.5" />
                )}
                <span>
                  {isGeneratingCaptions
                    ? 'Transcribing & Syncing Captions...'
                    : 'Auto-Generate Captions'}
                </span>
              </button>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Analyzes the active trimmed audio clip to generate timestamped captions automatically.
              </p>

              {captionsNotice && (
                <div
                  role="status"
                  className={`px-3 py-2 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                    captionsNotice.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <span className="leading-snug">{captionsNotice.text}</span>
                  <button
                    type="button"
                    onClick={onDismissCaptionsNotice}
                    className="text-[10px] opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-200">
                  Import Captions or Tap-to-Sync
                </h2>
                <input
                  ref={lrcInputRef}
                  type="file"
                  accept=".lrc,.srt,.vtt,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleLrcUpload(f);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => lrcInputRef.current?.click()}
                  className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <FileText className="w-3 h-3" />
                  <span>Upload .lrc / .srt / .vtt</span>
                </button>
              </div>
              {captionUploadNotice && (
                <div
                  role="status"
                  className={`px-3 py-2 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                    captionUploadNotice.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <span className="leading-snug">{captionUploadNotice.text}</span>
                  <button
                    type="button"
                    onClick={() => setCaptionUploadNotice(null)}
                    className="text-[10px] opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {!tapMode ? (
                <div className="space-y-2">
                  <textarea
                    rows={7}
                    value={rawLyricsText}
                    onChange={(e) => setRawLyricsText(e.target.value)}
                    placeholder="Paste plain lyrics (one line per cue) to stamp timestamps in real time..."
                    className="w-full min-h-[144px] p-3 rounded-lg bg-[#090b10] border border-white/[0.09] text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400/60 resize-y"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!rawLyricsText.trim()}
                      onClick={startTapToSync}
                      className="py-2 px-2.5 rounded-lg text-xs font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-slate-100 border border-white/[0.09] transition-colors disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      Tap-to-Sync
                    </button>
                    <button
                      type="button"
                      disabled={!hasAudio || !rawLyricsText.trim()}
                      onClick={() => runAutoSyncPlainText(2)}
                      title="Analyze audio beats and suggest timestamps for pasted lyrics"
                      className="py-2 px-2.5 rounded-lg text-xs font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      <Activity className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span>Auto-Sync Beats</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  data-tap-sync="true"
                  className="p-3 rounded-lg bg-[#090b10] border border-cyan-400/40 space-y-3"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-cyan-300 font-semibold">
                      Tap-to-Sync ({tapIndex + 1} / {tapLines.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setTapMode(false)}
                      className="text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      Exit
                    </button>
                  </div>

                  <div className="p-2.5 rounded bg-white/[0.04] text-xs font-medium text-slate-100">
                    {tapLines[tapIndex]}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={stampCurrentLine}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors cursor-pointer"
                    >
                      Tap to Stamp [{formatLrcTimestamp(currentTime)}]
                    </button>
                    {tapIndex > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTapIndex(Math.max(0, tapIndex - 1));
                          onLyricsChange(lyrics.slice(0, -1));
                        }}
                        title="Undo last stamp"
                        className="p-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Press Spacebar or click the button while playback runs.
                  </p>
                </div>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-xs font-semibold text-slate-200">
                  Synced Cue List ({lyrics.length})
                </h2>
                <div className="flex items-center gap-2 shrink-0">
                  {lyrics.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadLrc}
                      className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer whitespace-nowrap"
                    >
                      Save .lrc
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [
                        ...lyrics,
                        {
                          id: createLyricId(),
                          time: Number(currentTime.toFixed(2)),
                          text: 'New lyric line',
                        },
                      ].sort((a, b) => a.time - b.time);
                      onLyricsChange(next);
                    }}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Cue</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!hasAudio || lyrics.length === 0}
                  onClick={runAutoAlignAll}
                  title="Use audio amplitude peaks to snap all lyric cues to the nearest high-energy beats"
                  className="py-1.5 px-2.5 rounded-lg text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <AudioWaveform className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Auto-Align</span>
                </button>
                <button
                  type="button"
                  disabled={!hasAudio || lyrics.length === 0}
                  onClick={() => runAutoSyncExisting(0.45)}
                  title="Preview and adjust beat alignment suggestions per lyric cue"
                  className="py-1.5 px-2.5 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.1] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Activity className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  <span>Review Beats</span>
                </button>
              </div>

              {autoSyncNotice && (
                <div
                  role="status"
                  className="px-3 py-2 rounded-lg border bg-emerald-500/10 border-emerald-500/30 text-[11px] text-emerald-200 flex items-center justify-between gap-2"
                >
                  <span className="leading-snug">{autoSyncNotice}</span>
                  <button
                    type="button"
                    onClick={() => setAutoSyncNotice(null)}
                    className="text-[10px] opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {autoSyncPreview && (
                <div
                  role="region"
                  aria-label="Beat Auto-Sync timestamp suggestions"
                  className="p-3 rounded-lg bg-[#090b10] border border-cyan-400/40 space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-cyan-300">
                        Auto-Sync Suggestions
                      </div>
                      <div className="text-[10.5px] font-mono tabular-nums text-slate-400 mt-0.5">
                        {autoSyncPreview.analysis.beats.length} beats detected
                        {autoSyncPreview.analysis.estimatedBpm
                          ? ` · ~${autoSyncPreview.analysis.estimatedBpm} BPM`
                          : ''}
                        {' · '}
                        {autoSyncPreview.suggestions.filter((s) => s.matchedBeat).length}/
                        {autoSyncPreview.suggestions.length} beat-locked
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAutoSyncPreview(null)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>

                  {autoSyncPreview.source === 'existing' ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] text-slate-400">Snap Window</span>
                      <div className="grid grid-cols-3 gap-1">
                        {([0.25, 0.45, 0.7] as const).map((win) => (
                          <button
                            key={win}
                            type="button"
                            onClick={() => updateAutoSyncSnapWindow(win)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums border transition-colors cursor-pointer ${
                              autoSyncPreview.snapWindowSec === win
                                ? 'bg-cyan-400 text-[#090b10] border-cyan-400 font-semibold'
                                : 'bg-[#121620] text-slate-300 border-white/[0.08] hover:border-white/[0.18]'
                            }`}
                          >
                            ±{Math.round(win * 1000)}ms
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10.5px] text-slate-400">Beat Spacing</span>
                      <div className="grid grid-cols-3 gap-1">
                        {([1, 2, 4] as const).map((step) => (
                          <button
                            key={step}
                            type="button"
                            onClick={() => updateAutoSyncBeatsPerLine(step)}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums border transition-colors cursor-pointer whitespace-nowrap ${
                              autoSyncPreview.beatsPerLine === step
                                ? 'bg-cyan-400 text-[#090b10] border-cyan-400 font-semibold'
                                : 'bg-[#121620] text-slate-300 border-white/[0.08] hover:border-white/[0.18]'
                            }`}
                          >
                            {step === 1 ? '1 Beat' : `${step} Beats`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="max-h-[196px] overflow-y-auto studio-scroll space-y-1 pr-0.5">
                    {autoSyncPreview.suggestions.map((item) => {
                      const hasDelta =
                        item.originalTime !== null && Math.abs(item.deltaMs) >= 10;
                      const deltaStr =
                        item.originalTime === null
                          ? item.matchedBeat
                            ? 'beat'
                            : 'grid'
                          : hasDelta
                          ? `${item.deltaMs > 0 ? '+' : ''}${item.deltaMs}ms`
                          : 'aligned';

                      return (
                        <div
                          key={item.id}
                          className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#121620] border border-white/[0.07] text-[11px]"
                        >
                          <button
                            type="button"
                            onClick={() => onSeek(item.suggestedTime)}
                            title="Jump preview to suggested beat timestamp"
                            className="font-mono tabular-nums text-cyan-300 hover:text-cyan-200 shrink-0 cursor-pointer"
                          >
                            [{formatLrcTimestamp(item.suggestedTime)}]
                          </button>
                          <span
                            className={`font-mono tabular-nums text-[10px] shrink-0 ${
                              hasDelta
                                ? 'text-amber-300'
                                : item.matchedBeat
                                ? 'text-emerald-400'
                                : 'text-slate-500'
                            }`}
                          >
                            {deltaStr}
                          </span>
                          <span className="flex-1 min-w-0 truncate text-slate-200">
                            {item.text}
                          </span>
                          {autoSyncPreview.source === 'existing' && (
                            <button
                              type="button"
                              onClick={() => applySingleAutoSyncSuggestion(item)}
                              title="Apply this suggestion"
                              aria-label={`Apply beat timestamp to ${item.text}`}
                              className="p-0.5 rounded text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 cursor-pointer shrink-0"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={applyAllAutoSyncSuggestions}
                    className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>
                      Apply All Timestamps ({autoSyncPreview.suggestions.length})
                    </span>
                  </button>
                </div>
              )}

              {lyrics.length === 0 ? (
                <p className="text-[11px] text-slate-500 py-3 text-center border border-dashed border-white/[0.08] rounded-lg">
                  No synced lyrics yet. Upload an .lrc file, use Tap-to-Sync, or load the Demo Beat.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {(() => {
                    let activeId: string | null = null;
                    for (let i = 0; i < lyrics.length; i++) {
                      if (lyrics[i].time <= currentTime + 0.06) {
                        activeId = lyrics[i].id;
                      } else {
                        break;
                      }
                    }
                    return lyrics.map((line) => (
                      <LyricCueRow
                        key={line.id}
                        line={line}
                        isActive={line.id === activeId}
                        onSeek={() => onSeek(line.time)}
                        onUpdate={(updated) => {
                          const next = lyrics
                            .map((l) => (l.id === line.id ? updated : l))
                            .sort((a, b) => a.time - b.time);
                          onLyricsChange(next);
                        }}
                        onDelete={() =>
                          onLyricsChange(lyrics.filter((l) => l.id !== line.id))
                        }
                      />
                    ));
                  })()}
                </div>
              )}
            </section>
          </>
        )}

        {/* 5. STYLE & TEXT TAB */}
        {activeTab === 'style' && (
          <>
            <ColorHarmonyPanel
              settings={settings}
              onUpdateSettings={onUpdateSettings}
            />

            <hr className="border-white/[0.07]" />

            {/* Auto-Cycle Color */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-xs font-semibold text-slate-200">Auto-Cycle Color</h2>
                  <p className="text-[11px] text-slate-400">
                    Rotate primary &amp; secondary hues smoothly across track progress.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="Auto-Cycle Color"
                  aria-checked={Boolean(settings.autoCycleColor)}
                  onClick={() =>
                    onUpdateSettings({ autoCycleColor: !settings.autoCycleColor })
                  }
                  className={`w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    settings.autoCycleColor ? 'bg-cyan-400' : 'bg-white/[0.14]'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-[#090b10] transition-transform ${
                      settings.autoCycleColor ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {settings.autoCycleColor &&
                (() => {
                  const cycleSpeed = settings.colorCycleSpeed ?? 1;
                  const cycled = resolveAutoCycledColors(
                    settings,
                    currentTime,
                    duration > 0 ? duration : undefined
                  );
                  const progressPct =
                    duration > 0 ? Math.round(cycled.progress * 100) : 0;

                  return (
                    <div className="rounded-lg bg-[#090b10]/80 border border-white/[0.08] p-2.5 space-y-2.5">
                      {/* Live Rotated Palette Readout */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/25 shrink-0"
                            style={{ backgroundColor: cycled.primaryColor }}
                            title={`Live Primary ${cycled.primaryColor}`}
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/25 shrink-0"
                            style={{ backgroundColor: cycled.secondaryColor }}
                            title={`Live Secondary ${cycled.secondaryColor}`}
                          />
                          <span className="text-[11px] font-mono tabular-nums text-slate-300 truncate">
                            +{Math.round(cycled.hueShiftDeg)}° shift
                          </span>
                        </div>
                        <span className="text-[10.5px] font-mono tabular-nums text-cyan-400 shrink-0">
                          {duration > 0 ? `${progressPct}% track` : 'Loop 30s'}
                        </span>
                      </div>

                      <div
                        className="h-1.5 rounded-full w-full"
                        style={{
                          background: `linear-gradient(90deg, ${cycled.primaryColor} 0%, ${cycled.secondaryColor} 100%)`,
                        }}
                      />

                      {/* Cycle Speed Slider & Quick Presets */}
                      <div className="space-y-1.5 pt-0.5">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-slate-400">Cycle Speed (Rotations / Track)</span>
                          <span className="font-mono tabular-nums text-cyan-400">
                            {cycleSpeed.toFixed(2).replace(/\.00$/, '')}×
                          </span>
                        </div>
                        <input
                          type="range"
                          aria-label="Color Cycle Speed"
                          min={0.25}
                          max={8}
                          step={0.25}
                          value={cycleSpeed}
                          onChange={(e) =>
                            onUpdateSettings({
                              colorCycleSpeed: parseFloat(e.target.value),
                            })
                          }
                          className="studio-range w-full"
                        />
                        <div className="grid grid-cols-4 gap-1 pt-0.5">
                          {[0.5, 1, 2, 4].map((presetSpeed) => {
                            const active = Math.abs(cycleSpeed - presetSpeed) < 0.01;
                            return (
                              <button
                                key={presetSpeed}
                                type="button"
                                onClick={() =>
                                  onUpdateSettings({ colorCycleSpeed: presetSpeed })
                                }
                                className={`py-1 rounded-md text-[10.5px] font-mono tabular-nums border transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                                    : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {presetSpeed}×
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-slate-200">Custom Palette</h2>
              <div className="grid grid-cols-3 gap-2">
                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Primary</span>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09]">
                    <input
                      type="color"
                      value={settings.primaryColor}
                      onChange={(e) =>
                        onUpdateSettings({
                          themePreset: 'custom',
                          primaryColor: e.target.value,
                        })
                      }
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <span className="text-[10px] font-mono text-slate-300 uppercase">
                      {settings.primaryColor}
                    </span>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Secondary</span>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09]">
                    <input
                      type="color"
                      value={settings.secondaryColor}
                      onChange={(e) =>
                        onUpdateSettings({
                          themePreset: 'custom',
                          secondaryColor: e.target.value,
                        })
                      }
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <span className="text-[10px] font-mono text-slate-300 uppercase">
                      {settings.secondaryColor}
                    </span>
                  </div>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] text-slate-400">Backdrop</span>
                  <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09]">
                    <input
                      type="color"
                      value={settings.bgColor}
                      onChange={(e) =>
                        onUpdateSettings({
                          themePreset: 'custom',
                          bgColor: e.target.value,
                        })
                      }
                      className="w-5 h-5 rounded cursor-pointer bg-transparent border-0 p-0"
                    />
                    <span className="text-[10px] font-mono text-slate-300 uppercase">
                      {settings.bgColor}
                    </span>
                  </div>
                </label>
              </div>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Track Metadata Overlay</h2>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.showTrackOverlay}
                  onClick={() =>
                    onUpdateSettings({ showTrackOverlay: !settings.showTrackOverlay })
                  }
                  className={`w-10 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
                    settings.showTrackOverlay ? 'bg-cyan-400' : 'bg-white/[0.14]'
                  }`}
                >
                  <span
                    className={`block w-4 h-4 rounded-full bg-[#090b10] transition-transform ${
                      settings.showTrackOverlay ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <label className="block space-y-1">
                <span className="text-[11px] text-slate-400">Track Title</span>
                <input
                  type="text"
                  value={settings.trackTitle}
                  onChange={(e) => onUpdateSettings({ trackTitle: e.target.value })}
                  placeholder="e.g. Midnight Signal"
                  className="w-full px-2.5 py-2 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-[11px] text-slate-400">Artist Name</span>
                <input
                  type="text"
                  value={settings.artistName}
                  onChange={(e) => onUpdateSettings({ artistName: e.target.value })}
                  placeholder="e.g. Studio Waves"
                  className="w-full px-2.5 py-2 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </label>
            </section>
          </>
        )}

        {/* 6. SAVED PRESETS TAB */}
        {activeTab === 'presets' && (
          <>
            <section className="space-y-3">
              <h2 className="text-xs font-semibold text-slate-200">Save Current Configuration</h2>
              <label className="block space-y-1">
                <span className="text-[11px] text-slate-400">Preset Name</span>
                <input
                  type="text"
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const created = onSavePreset(presetNameInput);
                      setPresetNameInput('');
                      setAppliedPresetId(created.id);
                      setPresetNotice({
                        type: 'success',
                        text: `Saved "${created.name}" to your presets.`,
                      });
                    }
                  }}
                  placeholder="e.g. Vertical Neon 9:16"
                  className="w-full px-2.5 py-2 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                />
              </label>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    const created = onSavePreset(presetNameInput);
                    setPresetNameInput('');
                    setAppliedPresetId(created.id);
                    setPresetNotice({
                      type: 'success',
                      text: `Saved "${created.name}" to your presets.`,
                    });
                  }}
                  className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>Save Preset</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const name =
                        presetNameInput.trim() ||
                        settings.trackTitle.trim() ||
                        'PulseWave Preset';
                      const fileName = downloadPresetJson(name, settings);
                      setPresetNotice({
                        type: 'success',
                        text: `Exported "${fileName}".`,
                      });
                    }}
                    className="py-2 px-2.5 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.05] text-slate-200 border border-white/[0.09] transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Save JSON</span>
                  </button>

                  <button
                    type="button"
                    onClick={async () => {
                      const name =
                        presetNameInput.trim() ||
                        settings.trackTitle.trim() ||
                        'PulseWave Snapshot';
                      try {
                        const fileName = await onDownloadSnapshot(name);
                        setPresetNotice({
                          type: 'success',
                          text: `Saved snapshot "${fileName}".`,
                        });
                      } catch (err) {
                        setPresetNotice({
                          type: 'error',
                          text:
                            err instanceof Error
                              ? err.message
                              : 'Failed to generate snapshot image.',
                        });
                      }
                    }}
                    className="py-2 px-2.5 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.05] text-slate-200 border border-white/[0.09] transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Save Snapshot</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Save complete StudioSettings as .json or capture a shareable .png visual snapshot of the preview canvas.
              </p>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-200">Load Preset from JSON</h2>
              <input
                ref={presetJsonInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  const result = await onImportPresetFile(file);
                  if (result.ok) {
                    setAppliedPresetId(result.preset.id);
                    setPresetNotice({
                      type: 'success',
                      text: `Loaded "${result.preset.name}" from JSON.`,
                    });
                  } else {
                    setPresetNotice({
                      type: 'error',
                      text: result.error,
                    });
                  }
                }}
              />
              <button
                type="button"
                onClick={() => presetJsonInputRef.current?.click()}
                className="w-full py-2.5 px-3 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.05] text-slate-200 border border-white/[0.09] transition-colors flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <FileJson className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>Import .json preset file...</span>
                </span>
                <span className="text-[11px] text-cyan-400 shrink-0">Browse</span>
              </button>

              {presetNotice && (
                <div
                  role="status"
                  className={`px-3 py-2 rounded-lg border text-[11px] flex items-center justify-between gap-2 ${
                    presetNotice.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <span className="leading-snug">{presetNotice.text}</span>
                  <button
                    type="button"
                    onClick={() => setPresetNotice(null)}
                    className="text-[10px] opacity-75 hover:opacity-100 shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">
                  Saved Presets ({savedPresets.length})
                </h2>
              </div>

              {savedPresets.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-white/[0.08] text-center space-y-1">
                  <p className="text-xs font-medium text-slate-300">No saved presets yet</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Save your current setup above or import a .json configuration file.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedPresets.map((preset) => {
                    const isApplied = appliedPresetId === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className={`p-3 rounded-lg border transition-colors ${
                          isApplied
                            ? 'bg-cyan-500/10 border-cyan-400/40'
                            : 'bg-[#090b10] border-white/[0.08] hover:border-white/[0.15]'
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-2.5">
                          <PresetThumbnail settings={preset.settings} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-100 truncate">
                                {preset.name}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono tabular-nums mt-0.5 truncate">
                              {formatPresetSummary(preset.settings)}
                            </div>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-white/20"
                                style={{ backgroundColor: preset.settings.primaryColor }}
                                title={`Primary ${preset.settings.primaryColor}`}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-white/20"
                                style={{ backgroundColor: preset.settings.secondaryColor }}
                                title={`Secondary ${preset.settings.secondaryColor}`}
                              />
                              <span
                                className="w-2.5 h-2.5 rounded-full border border-white/20"
                                style={{ backgroundColor: preset.settings.bgColor }}
                                title={`Backdrop ${preset.settings.bgColor}`}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              onApplyPreset(preset);
                              setAppliedPresetId(preset.id);
                              setPresetNotice({
                                type: 'success',
                                text: `Applied "${preset.name}".`,
                              });
                            }}
                            className="flex-1 py-1.5 px-2.5 rounded-md text-[11px] font-semibold bg-white/[0.07] hover:bg-cyan-400 hover:text-[#090b10] text-slate-100 transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
                          >
                            {isApplied && <Check className="w-3 h-3" />}
                            <span>{isApplied ? 'Applied' : 'Load Preset'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const fileName = await onDownloadSnapshot(
                                  preset.name,
                                  preset.settings
                                );
                                setPresetNotice({
                                  type: 'success',
                                  text: `Saved snapshot "${fileName}".`,
                                });
                              } catch (err) {
                                setPresetNotice({
                                  type: 'error',
                                  text:
                                    err instanceof Error
                                      ? err.message
                                      : 'Failed to generate snapshot image.',
                                });
                              }
                            }}
                            title="Save visual snapshot (.png)"
                            aria-label={`Save visual snapshot of ${preset.name} as PNG`}
                            className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 border border-white/[0.07] transition-colors cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const fileName = downloadPresetJson(preset.name, preset.settings);
                              setPresetNotice({
                                type: 'success',
                                text: `Exported "${fileName}".`,
                              });
                            }}
                            title="Export preset as JSON"
                            aria-label={`Export ${preset.name} as JSON`}
                            className="p-1.5 rounded-md bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 border border-white/[0.07] transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              onDeletePreset(preset.id);
                              if (appliedPresetId === preset.id) setAppliedPresetId(null);
                            }}
                            title="Delete saved preset"
                            aria-label={`Delete ${preset.name}`}
                            className="p-1.5 rounded-md bg-white/[0.04] hover:bg-rose-500/15 text-slate-400 hover:text-rose-400 border border-white/[0.07] transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </aside>
  );
}

interface LyricCueRowProps {
  line: LyricLine;
  isActive: boolean;
  onSeek: () => void;
  onUpdate: (line: LyricLine) => void;
  onDelete: () => void;
}

function LyricCueRow({ line, isActive, onSeek, onUpdate, onDelete }: LyricCueRowProps) {
  const [timeStr, setTimeStr] = useState(formatLrcTimestamp(line.time));

  useEffect(() => {
    setTimeStr(formatLrcTimestamp(line.time));
  }, [line.time]);

  const commitTime = () => {
    const parsed = parseTimeInput(timeStr);
    if (parsed === null) {
      setTimeStr(formatLrcTimestamp(line.time));
      return;
    }
    onUpdate({ ...line, time: Number(parsed.toFixed(2)) });
  };

  return (
    <div
      className={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-colors ${
        isActive
          ? 'bg-cyan-500/10 border-cyan-400/35'
          : 'bg-[#090b10] border-white/[0.07]'
      }`}
    >
      <input
        type="text"
        value={timeStr}
        onChange={(e) => setTimeStr(e.target.value)}
        onBlur={commitTime}
        onKeyDown={(e) => e.key === 'Enter' && commitTime()}
        onDoubleClick={onSeek}
        title="Timestamp [MM:SS.xx] (double-click to jump)"
        className="w-[74px] shrink-0 px-1.5 py-1 rounded bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono tabular-nums text-cyan-300 focus:outline-none focus:border-cyan-400/60"
      />
      <input
        type="text"
        value={line.text}
        onChange={(e) => onUpdate({ ...line, text: e.target.value })}
        className="flex-1 min-w-0 px-1.5 py-1 rounded bg-transparent text-xs text-slate-200 focus:outline-none focus:bg-white/[0.04]"
      />
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete lyric cue"
        className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
