import { useEffect, useRef, useState } from 'react';
import {
  Activity,
  AudioWaveform,
  Bookmark,
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
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ASPECT_RATIOS,
  AspectRatioKey,
  FadeType,
  LyricLine,
  LyricStyle,
  SavedPreset,
  SidebarTab,
  StudioSettings,
  THEME_PRESETS,
  VisualizerMode,
} from '../types/studio';
import {
  createLyricId,
  formatLrcTimestamp,
  formatShortTime,
  parseLrc,
  parseTimeInput,
  serializeLrc,
} from '../utils/lrcParser';
import { downloadPresetJson, formatPresetSummary } from '../utils/presetStorage';
import { PresetThumbnail } from './PresetThumbnail';

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
  onAlbumImageSelect: (file: File | null) => void;
  albumImageName: string | null;
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
  isGeneratingCaptions: boolean;
  captionsNotice: { type: 'success' | 'error'; text: string } | null;
  onDismissCaptionsNotice: () => void;
  onAutoGenerateCaptions: () => void;
  beatMeterBarRef: React.RefObject<HTMLDivElement | null>;
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
  onAlbumImageSelect,
  albumImageName,
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
  isGeneratingCaptions,
  captionsNotice,
  onDismissCaptionsNotice,
  onAutoGenerateCaptions,
  beatMeterBarRef,
}: ControlSidebarProps) {
  const bgInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);
  const lrcInputRef = useRef<HTMLInputElement>(null);
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

  // Tap-to-Sync State
  const [rawLyricsText, setRawLyricsText] = useState('');
  const [tapMode, setTapMode] = useState(false);
  const [tapLines, setTapLines] = useState<string[]>([]);
  const [tapIndex, setTapIndex] = useState(0);

  // Saved Presets State
  const [presetNameInput, setPresetNameInput] = useState('');
  const [presetNotice, setPresetNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [appliedPresetId, setAppliedPresetId] = useState<string | null>(null);

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
    const text = await file.text();
    const parsed = parseLrc(text);
    if (parsed.length > 0) {
      onLyricsChange(parsed);
      setTapMode(false);
    }
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
              <h2 className="text-xs font-semibold text-slate-200">Audio Track</h2>
              <input
                ref={audioInputRef}
                type="file"
                accept=".mp3,.wav,.ogg,.m4a,audio/*"
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
                  <span>Upload Audio</span>
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
                {audioFileName ? `Loaded: ${audioFileName}` : 'Supports .mp3, .wav, .ogg, .m4a'}
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

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Background Image</h2>
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

              <div className="space-y-2.5 pt-1">
                <div>
                  <div className="flex justify-between text-[11px] mb-1">
                    <span className="text-slate-400">Backdrop Blur</span>
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
                    <span className="text-slate-400">Backdrop Dimness</span>
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
                        {cfg.width}×{cfg.height}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <hr className="border-white/[0.07]" />

            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-200">Export Frame Rate</h2>
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
                30 FPS exports 2× faster; 60 FPS produces ultra-smooth motion.
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
                <h2 className="text-xs font-semibold text-slate-200">Visualizer Mode</h2>
                <span className="text-[11px] font-mono text-slate-400">
                  {VISUALIZER_MODES.length} styles
                </span>
              </div>
              <div className="space-y-1.5">
                {VISUALIZER_MODES.map((mode) => {
                  const active = settings.visualizerMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => onUpdateSettings({ visualizerMode: mode.id })}
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
              <h2 className="text-xs font-semibold text-slate-200">Audio Reactivity</h2>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Sensitivity / Gain</span>
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
                  <span className="text-slate-400">Bar Count</span>
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
                  <span className="text-slate-400">Smoothing</span>
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

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Motion Blur</span>
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
                  onChange={(e) => onUpdateSettings({ motionBlur: parseFloat(e.target.value) })}
                  className="studio-range w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Blends the previous frame with transparency to create smooth kinetic trails.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Bloom Intensity</span>
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
                  onChange={(e) =>
                    onUpdateSettings({ bloomIntensity: parseFloat(e.target.value) })
                  }
                  className="studio-range w-full"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Additive lighter glow across multi-pass blur layers on reactive visuals.
                </p>
              </div>
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

              {settings.beatDetection ? (
                <div className="space-y-3 pt-0.5">
                  <div>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="text-slate-400">Burst Sensitivity</span>
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
                    drum peaks and trigger shockwave &amp; particle bursts.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] leading-relaxed text-slate-400">
                  Enable to track kick-drum peaks via a secondary 140 Hz low-pass filter and fire
                  shockwave &amp; burst animations.
                </p>
              )}
            </section>
          </>
        )}

        {/* 4. LYRICS TAB */}
        {activeTab === 'lyrics' && (
          <>
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-200">Display Style</h2>
              <div className="grid grid-cols-1 gap-1.5">
                {LYRIC_STYLES.map((style) => {
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
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">Import .LRC or Tap-to-Sync</h2>
                <input
                  ref={lrcInputRef}
                  type="file"
                  accept=".lrc,.txt"
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
                  className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                >
                  <FileText className="w-3 h-3" />
                  <span>Upload .lrc</span>
                </button>
              </div>

              {!tapMode ? (
                <div className="space-y-2">
                  <textarea
                    rows={7}
                    value={rawLyricsText}
                    onChange={(e) => setRawLyricsText(e.target.value)}
                    placeholder="Paste plain lyrics (one line per cue) to stamp timestamps in real time..."
                    className="w-full min-h-[144px] p-3 rounded-lg bg-[#090b10] border border-white/[0.09] text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-cyan-400/60 resize-y"
                  />
                  <button
                    type="button"
                    disabled={!rawLyricsText.trim()}
                    onClick={startTapToSync}
                    className="w-full py-2 px-3 rounded-lg text-xs font-semibold bg-white/[0.07] hover:bg-white/[0.12] text-slate-100 border border-white/[0.09] transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Start Tap-to-Sync Mode
                  </button>
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
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-slate-200">
                  Synced Cue List ({lyrics.length})
                </h2>
                <div className="flex items-center gap-2">
                  {lyrics.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDownloadLrc}
                      className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
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
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Cue</span>
                  </button>
                </div>
              </div>

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
            <section className="space-y-2.5">
              <h2 className="text-xs font-semibold text-slate-200">Color Presets</h2>
              <div className="grid grid-cols-2 gap-2">
                {THEME_PRESETS.map((preset) => {
                  const active = settings.themePreset === preset.key;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      onClick={() =>
                        onUpdateSettings({
                          themePreset: preset.key,
                          primaryColor: preset.primaryColor,
                          secondaryColor: preset.secondaryColor,
                          bgColor: preset.bgColor,
                        })
                      }
                      className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-cyan-500/12 border-cyan-400/45 text-slate-100'
                          : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: preset.primaryColor }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: preset.secondaryColor }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: preset.bgColor }}
                        />
                      </div>
                      <div className="text-[11px] font-medium truncate">{preset.name}</div>
                    </button>
                  );
                })}
              </div>
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
