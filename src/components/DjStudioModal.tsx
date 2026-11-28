import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  AudioWaveform,
  Bookmark,
  BookmarkPlus,
  Cable,
  Disc3,
  Download,
  Eye,
  EyeOff,
  FileText,
  Film,
  Flame,
  FolderOpen,
  Grid3x3,
  Layers,
  Loader2,
  Lock,
  Magnet,
  MapPin,
  Mic,
  Monitor,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  RotateCcw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  X,
  Zap,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { MidiMappableParamKey } from '../types/midi';
import {
  ASPECT_RATIOS,
  BeatState,
  DjCuePoint,
  DjDeckEqSettings,
  DjMixTriggerMode,
  DjTrackAsset,
  DjTransitionStyle,
  DjVideoMixStyle,
  LyricLine,
  MIX_VIDEO_BLEND_MODES,
  MixVideoBlendMode,
  MocapClipData,
  MotionBlurState,
  Particle,
  SavedPreset,
  SceneTransitionState,
  SidebarTab,
  StudioSettings,
} from '../types/studio';
import {
  computeLowPassRms,
  createInitialBeatState,
  OfflineAudioAnalyzer,
  OfflineLowPassBeatTracker,
  stepBeatDetector,
} from '../utils/audioEngine';
import { renderVisualizerFrame } from '../utils/canvasRenderer';
import { resolveAutoCycledColors } from '../utils/colorHarmony';
import {
  adjustTrackFineBpm,
  analyzeDjTrackFromBuffer,
  analyzeDjTrackFromFile,
  BeatMatchPhaseComparison,
  buildCrateSetSchedule,
  buildDualDeckMixPlan,
  buildScheduleFromDualPlan,
  calculateBpmTransitionTiming,
  computeBeatMatchPhaseComparison,
  computeBeatPhaseMetrics,
  computeBpmCalibratedEqCrossovers,
  createBrickWallClipperCurve,
  createDjCuePointId,
  createDjVideoFrameResolver,
  cycleTrackDownbeatPhase,
  detectDefaultDjCuePoints,
  DJ_CUE_PRESETS,
  DjBpmTimingPreset,
  DjScheduleRenderPlan,
  DjTransitionPlan,
  DjTransitionPreviewRender,
  extractTriBandWindowPeaks,
  findBestLyricHandoffPair,
  findNearestBeat,
  generateDjDemoPair,
  getEffectiveBeatGridPoints,
  getEffectiveBpm,
  parseAndSyncDjTrackLyrics,
  renderOfflineDjSchedule,
  renderTransitionPreview5s,
  resetTrackBeatGridToAuto,
  scanAudioBufferPeakLinear,
  setTrackBeatGridOffsetMs,
  setTrackDownbeatAtTime,
  shiftTrackBeatGrid,
  snapDjLyricsToTrackBeats,
  snapTrackBeatGridToNearestTransient,
} from '../utils/djEngine';
import {
  createDjVinylScratchSession,
  DjVinylScratchSession,
} from '../utils/djScratchEngine';
import {
  cycleCamelotKey,
  detectMusicalKeyFromBuffer,
  evaluateHarmonicCompatibility,
  getCamelotEntry,
  getCompatibleCamelotKeys,
  HarmonicCompatibilityResult,
} from '../utils/djKeyDetection';
import {
  DjSpectrogramMode,
  extractSpectrogramWindow,
  frequencyPeakToColor,
  spectrogramIntensityToRgba,
} from '../utils/djSpectrogram';
import {
  computeNextQuantizedTriggerDelay,
  createInitialSamplerPads,
  extractSamplerPeaks,
  SAMPLER_PAD_META,
  SAMPLER_QUANTIZE_OPTIONS,
  SamplerPadData,
  SamplerQuantizeMode,
  SamplerRecordSource,
  sliceDeckOneShotBuffer,
  synthesizeStarterOneShot,
  trimSilentEdgesFromBuffer,
} from '../utils/djSamplerEngine';
import {
  buildTransientEnvelopeCurvePoints,
  createLiveTransientShaper,
  formatTransientDitherReadout,
  LiveTransientShaperNode,
  TransientFocusMode,
} from '../utils/djTransientShaper';
import {
  createLiveNoiseGate,
  formatNoiseGateThreshold,
  LiveNoiseGateNode,
} from '../utils/djNoiseGate';
import {
  AiAutoMixAnalysisResult,
  AiAutoMixSuggestion,
  AutoMixPreference,
  requestAiAutoMixSuggestions,
} from '../utils/djAutoMixAi';
import { MixVideoFrameResolver } from '../utils/mixEngine';
import { captureCanvasSnapshotPng } from '../utils/presetStorage';
import {
  computeTapTempoCalibration,
  TAP_TEMPO_IDLE_RESET_MS,
  TapSample,
} from '../utils/tapTempo';
import { ControlSidebar } from './ControlSidebar';
import { buildSyntheticAudioFrame } from './PresetThumbnail';
import { PreviewStage } from './PreviewStage';

export interface DjApplyMixPayload {
  audioBuffer: AudioBuffer;
  wavBlob: Blob;
  duration: number;
  waveformPeaks: number[];
  mergedLyrics: LyricLine[];
  videoResolver: MixVideoFrameResolver | null;
  trackTitle: string;
  trimStart: number;
  trimEnd: number;
  action: 'apply' | 'export' | 'batch';
}

interface DjStudioModalProps {
  isOpen: boolean;
  currentAudioBuffer: AudioBuffer | null;
  currentAudioFileName: string | null;
  currentLyrics: LyricLine[];
  ensureAudioContext: () => Promise<AudioContext | null>;
  isExporting: boolean;
  onClose: () => void;
  onApplyDjMix: (payload: DjApplyMixPayload) => Promise<void>;

  // Full Main Studio & Mixer parity controls embedded inside DJ Studio
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onLyricsChange: (lyrics: LyricLine[]) => void;
  bgImage: HTMLImageElement | null;
  bgImageName: string | null;
  onBgImageSelect: (file: File | null) => void;
  albumImage: HTMLImageElement | null;
  albumImageName: string | null;
  onAlbumImageSelect: (file: File | null) => void;
  onCopyBgToAlbum: () => void;
  onCopyAlbumToBg: () => void;
  onDownloadCoverThumbnail: (mode: 'clean-cover' | 'full-stage') => Promise<string>;
  onSetProjectThumbnailFromCover: () => Promise<void>;
  savedPresets: SavedPreset[];
  onSavePreset: (name: string) => SavedPreset;
  onApplyPreset: (preset: SavedPreset) => void;
  onDeletePreset: (id: string) => void;
  onImportPresetFile: (
    file: File
  ) => Promise<{ ok: true; preset: SavedPreset } | { ok: false; error: string }>;
  onDownloadSnapshot: (name: string, targetSettings?: StudioSettings) => Promise<string>;
  isGeneratingCaptions: boolean;
  captionsNotice: { type: 'success' | 'error'; text: string } | null;
  onDismissCaptionsNotice: () => void;
  onAutoGenerateCaptions: (overrideAudio?: {
    audioBuffer: AudioBuffer;
    trimStart: number;
    trimEnd: number;
  }) => void;
  onAutoArrange: () => void;
  autoArrangeNotice: string | null;
  midiMappingBadges?: Partial<Record<MidiMappableParamKey, string>>;
  onOpenMidiMapping: () => void;
  mocapClip: MocapClipData | null;
  onMocapFileSelect: (
    file: File
  ) => Promise<{ ok: true; clip: MocapClipData } | { ok: false; error: string }>;
  onClearMocapClip: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCaptureProjectSnapshot?: (label?: string) => void;
  onOpenProjects?: () => void;
  onOpenMixStudio?: () => void;
  mixClipCount?: number;
}

interface LiveDeckAudioChain {
  source: AudioBufferSourceNode | null;
  sourceGain: GainNode | null;
  scratchSession: DjVinylScratchSession | null;
  isScratching: boolean;
  lowEq: BiquadFilterNode;
  midEq: BiquadFilterNode;
  highEq: BiquadFilterNode;
  sweepFilter: BiquadFilterNode;
  delayDry: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  trimGain: GainNode;
  preFaderMonitorGain: GainNode;
  analyser: AnalyserNode;
  beatLowPass: BiquadFilterNode;
  beatAnalyser: AnalyserNode;
  crossfadeGain: GainNode;
  startedAtAudioTime: number;
  startedAtPerfMs: number;
  offsetSec: number;
  playbackRate: number;
  loopBeats: 0 | 4 | 8;
}

const DEFAULT_DECK_EQ: DjDeckEqSettings = {
  lowGainDb: 0,
  midGainDb: 0,
  highGainDb: 0,
  filterSweep: 0,
  trimGain: 1,
  lowCrossoverHz: 230,
  midCenterHz: 1100,
  highCrossoverHz: 4000,
};

const TRANSITION_STYLE_LABELS: Array<{ id: DjTransitionStyle; label: string }> = [
  { id: 'bass-swap', label: 'Bass Swap' },
  { id: 'filter-sweep', label: 'Filter Sweep' },
  { id: 'echo-out', label: 'Echo Out' },
  { id: 'beat-drop', label: 'Beat Drop' },
  { id: 'stutter-cut', label: 'Stutter Cut' },
];

const VIDEO_MIX_LABELS: Array<{ id: DjVideoMixStyle; label: string }> = [
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'beat-flash', label: 'Beat Flash Cut' },
  { id: 'wipe-slide', label: 'Deck Wipe' },
  { id: 'split-dual', label: 'Dual Split Screen' },
  { id: 'zoom-punch', label: 'Zoom Punch' },
];

interface LiveLoopDeckChain {
  source: AudioBufferSourceNode;
  sweepFilter: BiquadFilterNode;
  gainNode: GainNode;
  startedAtPerfMs: number;
  playbackRate: number;
  loopStartSec: number;
  loopEndSec: number;
}

interface CapturedLoopData {
  sourceLabel: string;
  sourceTitle: string;
  audioBuffer: AudioBuffer;
  captureStartSec: number;
  bpm: number;
  playbackRate: number;
  beatTimes: number[];
  windowPeaks: number[];
  accentHex: string;
}

type LoopBeatLength = 0.25 | 0.5 | 1 | 2 | 4;

const LOOP_BEAT_OPTIONS: Array<{ beats: LoopBeatLength; label: string }> = [
  { beats: 0.25, label: '1/4' },
  { beats: 0.5, label: '1/2' },
  { beats: 1, label: '1' },
  { beats: 2, label: '2' },
  { beats: 4, label: '4' },
];

type FxFilterLfoDivision = 0.5 | 1 | 2 | 4 | 8;
type FxDelayDivision = 0.125 | 0.25 | 0.375 | 0.5 | 0.75 | 1;
type FxGateDivision = 0.25 | 0.5 | 1 | 2;

const FX_FILTER_LFO_DIVISIONS: Array<{ beats: FxFilterLfoDivision; label: string }> = [
  { beats: 0.5, label: '1/2B' },
  { beats: 1, label: '1B' },
  { beats: 2, label: '2B' },
  { beats: 4, label: '4B' },
  { beats: 8, label: '8B' },
];

const FX_DELAY_DIVISIONS: Array<{ beats: FxDelayDivision; label: string }> = [
  { beats: 0.125, label: '1/8' },
  { beats: 0.25, label: '1/4' },
  { beats: 0.375, label: '3/8•' },
  { beats: 0.5, label: '1/2' },
  { beats: 0.75, label: '3/4•' },
  { beats: 1, label: '1B' },
];

const FX_GATE_DIVISIONS: Array<{ beats: FxGateDivision; label: string }> = [
  { beats: 0.25, label: '1/4' },
  { beats: 0.5, label: '1/2' },
  { beats: 1, label: '1B' },
  { beats: 2, label: '2B' },
];

interface LiveMasterFxNodes {
  inputBus: GainNode;
  sweepFilter: BiquadFilterNode;
  filterLfoOsc: OscillatorNode;
  filterLfoGain: GainNode;
  dryGain: GainNode;
  delayDampFilter: BiquadFilterNode;
  delayLeft: DelayNode;
  delayRight: DelayNode;
  delayPanLeft: StereoPannerNode;
  delayPanRight: StereoPannerNode;
  delayFeedbackGain: GainNode;
  delayWetGain: GainNode;
  gateGain: GainNode;
  gateLfoOsc: OscillatorNode;
  gateLfoGain: GainNode;
  transientShaper: LiveTransientShaperNode;
  noiseGate: LiveNoiseGateNode;
}

interface LiveMasterLimiterNodes {
  preLimiterAnalyser: AnalyserNode;
  autoTrimGain: GainNode;
  compressor: DynamicsCompressorNode;
  clipper: WaveShaperNode;
}

const LIMITER_CEILING_PRESETS = [-0.1, -0.3, -1.0, -2.0] as const;
const LIMITER_RELEASE_PRESETS = [
  { sec: 0.04, label: '40ms' },
  { sec: 0.08, label: '80ms' },
  { sec: 0.15, label: '150ms' },
  { sec: 0.25, label: '250ms' },
] as const;

interface DjTapBpmLogEntry {
  id: string;
  bpm: number;
  tapCount: number;
  timestampLabel: string;
  deltaFromPrev: number | null;
}

const MAX_DJ_TAP_BPM_LOG = 5;

function extractWindowPeaks(
  buffer: AudioBuffer,
  startSec: number,
  windowDurationSec: number,
  bars = 96
): number[] {
  const sr = buffer.sampleRate || 44100;
  const ch = buffer.getChannelData(0);
  const startIdx = Math.max(0, Math.floor(startSec * sr));
  const totalSamples = Math.max(bars, Math.floor(windowDurationSec * sr));
  const step = Math.max(1, Math.floor(totalSamples / bars));
  const out: number[] = [];
  let maxVal = 0.001;
  for (let i = 0; i < bars; i++) {
    const segStart = startIdx + i * step;
    const segEnd = Math.min(ch.length, segStart + step);
    let peak = 0;
    for (let j = segStart; j < segEnd; j += Math.max(1, Math.floor(step / 16))) {
      const a = Math.abs(ch[j] ?? 0);
      if (a > peak) peak = a;
    }
    if (peak > maxVal) maxVal = peak;
    out.push(peak);
  }
  return out.map((v) => Math.max(0.06, Math.min(1, v / maxVal)));
}

function formatDjClock(sec: number): string {
  const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

function parseDjTimeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    if (parts.length === 2) {
      const m = Number(parts[0]);
      const s = Number(parts[1]);
      if (Number.isFinite(m) && Number.isFinite(s) && m >= 0 && s >= 0) {
        return m * 60 + s;
      }
    }
    return null;
  }
  const num = Number(trimmed);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

interface MasterBeatClockState {
  phase: number;
  beatIndex: number;
}

function computeMasterBeatGlowPulse(beatPhase: number): number {
  const p = ((beatPhase % 1) + 1) % 1;
  if (p < 0.06) {
    return 0.35 + (p / 0.06) * 0.65;
  }
  const decayNorm = (p - 0.06) / 0.94;
  return Math.pow(1 - decayNorm, 2.35);
}

function drawPulsingBeatGridGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  h: number,
  rgbCore: string,
  rgbHalo: string,
  pulse: number,
  isDownbeat: boolean,
  emphasis = 1
): void {
  const scaled = Math.max(0, Math.min(1, pulse * emphasis));
  if (scaled < 0.02 || h <= 0) return;

  const haloHalfW = isDownbeat ? 5.5 + scaled * 4.5 : 3.2 + scaled * 2.8;
  const haloAlpha = (isDownbeat ? 0.24 : 0.13) * scaled;

  const grad = ctx.createLinearGradient(x - haloHalfW, 0, x + haloHalfW, 0);
  grad.addColorStop(0, `rgba(${rgbHalo}, 0)`);
  grad.addColorStop(0.5, `rgba(${rgbHalo}, ${haloAlpha.toFixed(3)})`);
  grad.addColorStop(1, `rgba(${rgbHalo}, 0)`);

  ctx.fillStyle = grad;
  ctx.fillRect(x - haloHalfW, y, haloHalfW * 2, h);

  const coreAlpha = (isDownbeat ? 0.6 : 0.34) * scaled;
  const coreW = isDownbeat ? 1.6 : 1.1;
  ctx.fillStyle = `rgba(${rgbCore}, ${coreAlpha.toFixed(3)})`;
  ctx.fillRect(x - coreW * 0.5, y, coreW, h);
}

interface TriBandWaveformCanvasProps {
  track: DjTrackAsset | null;
  playheadSec: number;
  accentHex: string;
  cueTimeSec: number | null;
  cueLabel: string;
  showBeatGrid?: boolean;
  beatGridSubdivision?: 1 | 2 | 4;
  viewMode?: 'overview' | 'zoom';
  zoomPct?: number;
  freeTransientSeek?: boolean;
  syncToBeatGrid?: boolean;
  loopWindowStartSec?: number | null;
  loopWindowEndSec?: number | null;
  nudgeAccumMs?: number;
  nudgeFlash?: { deltaMs: number; nonce: number } | null;
  harmonicCompatibility?: HarmonicCompatibilityResult | null;
  spectrogramMode?: DjSpectrogramMode;
  isGridEditMode?: boolean;
  isScratchMode?: boolean;
  isScratching?: boolean;
  scratchRate?: number | null;
  scratchSensitivitySec?: number;
  masterBeatClockRef?: { current: MasterBeatClockState };
  registerBeatPulseDraw?: (fn: () => void) => () => void;
  onDragBeatGridMs?: (deltaMs: number) => void;
  onScratchStart?: () => void;
  onScratchMove?: (deltaSec: number, velocityRate: number) => void;
  onScratchEnd?: () => void;
  onSeekOrCue: (timeSec: number) => void;
}

function computeWaveformZoomSpanSec(track: DjTrackAsset, zoomPct: number): number {
  const beatSec = 60 / Math.max(40, getEffectiveBpm(track));
  const maxSpan = Math.max(beatSec * 16, Math.min(track.duration, 40));
  const minSpan = Math.max(0.22, beatSec * 0.5);
  const norm = Math.max(0, Math.min(1, (zoomPct - 1) / 99));
  return maxSpan * Math.pow(minSpan / maxSpan, norm);
}

function TriBandWaveformCanvas({
  track,
  playheadSec,
  accentHex,
  cueTimeSec,
  cueLabel,
  showBeatGrid = true,
  beatGridSubdivision = 2,
  viewMode = 'overview',
  zoomPct = 0,
  freeTransientSeek = false,
  syncToBeatGrid = true,
  loopWindowStartSec = null,
  loopWindowEndSec = null,
  nudgeAccumMs = 0,
  nudgeFlash = null,
  harmonicCompatibility = null,
  spectrogramMode = 'overlay',
  isGridEditMode = false,
  isScratchMode = false,
  isScratching = false,
  scratchRate = null,
  scratchSensitivitySec = 1.8,
  masterBeatClockRef,
  registerBeatPulseDraw,
  onDragBeatGridMs,
  onScratchStart,
  onScratchMove,
  onScratchEnd,
  onSeekOrCue,
}: TriBandWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowLayoutRef = useRef<{
    width: number;
    height: number;
    winStart: number;
    winEnd: number;
    winSpan: number;
    beatPeriod: number;
    pxPerBeat: number;
    duration: number;
    isZoom: boolean;
    isGridEditMode: boolean;
    showBeatGrid: boolean;
    beatGridSubdivision: 1 | 2 | 4;
    gridPoints: ReturnType<typeof getEffectiveBeatGridPoints>;
    accentHex: string;
    hasNudgeActive: boolean;
  } | null>(null);
  const gridDragLastXRef = useRef<number | null>(null);
  const gridDragTotalPxRef = useRef(0);
  const dragLastTimeRef = useRef<number>(0);
  const scratchEngagedRef = useRef(false);

  const effectiveZoomPct = zoomPct > 0 ? zoomPct : viewMode === 'zoom' ? 45 : 0;
  const isZoomedView = Boolean(track && (viewMode === 'zoom' || zoomPct > 0));

  const gridPoints = useMemo(
    () => (track ? getEffectiveBeatGridPoints(track) : []),
    [track]
  );
  const gridBeatTimes = useMemo(() => gridPoints.map((p) => p.timeSec), [gridPoints]);

  const zoomBounds = useMemo(() => {
    if (!track || !isZoomedView) {
      return { start: 0, end: track?.duration ?? 1 };
    }
    const winSpan = computeWaveformZoomSpanSec(track, effectiveZoomPct);
    const halfWin = winSpan * 0.5;
    return {
      start: playheadSec - halfWin,
      end: playheadSec + halfWin,
    };
  }, [effectiveZoomPct, isZoomedView, playheadSec, track]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 420;
    const height = canvas.clientHeight || 68;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, width, height);

    if (!track) {
      ctx.fillStyle = 'rgba(148,163,184,0.35)';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Load audio or video into deck to inspect beat grid & waveform', width * 0.5, height * 0.5);
      ctx.restore();
      return;
    }

    const isZoom = isZoomedView;
    const winStart = isZoom ? zoomBounds.start : 0;
    const winEnd = isZoom ? zoomBounds.end : Math.max(0.1, track.duration);
    const winSpan = Math.max(0.05, winEnd - winStart);
    const toX = (t: number) => ((t - winStart) / winSpan) * width;

    const peakBarCount = !isZoom
      ? 112
      : effectiveZoomPct >= 75
        ? 240
        : effectiveZoomPct >= 35
          ? 184
          : 132;
    const peaks = isZoom
      ? extractTriBandWindowPeaks(track.audioBuffer, winStart, winEnd, peakBarCount)
      : track.triBandPeaks;

    const { low, mid, high, overall } = peaks;
    const n = low.length;
    const midY = height * 0.54;
    const barSlot = width / Math.max(1, n);

    const specActive = spectrogramMode !== 'off';
    const specData = specActive
      ? isZoom
        ? extractSpectrogramWindow(
            track.audioBuffer,
            winStart,
            winEnd,
            effectiveZoomPct >= 75 ? 112 : 96,
            24
          )
        : track.spectrogram ?? extractSpectrogramWindow(track.audioBuffer, 0, track.duration, 160, 24)
      : null;

    // 1. Frequency-Domain STFT Spectrogram Layer (Bass Kick -> Melodic Mid -> Snare/Hat)
    if (specData && specData.cols > 0 && specData.rows > 0) {
      const sCols = specData.cols;
      const sRows = specData.rows;
      const colW = width / sCols;
      const rowH = height / sRows;
      const alphaScale = spectrogramMode === 'full' ? 0.94 : 0.44;

      for (let c = 0; c < sCols; c++) {
        const sx = c * colW;
        const tCol = winStart + ((c + 0.5) / sCols) * winSpan;
        if (tCol < 0 || tCol > track.duration) continue;
        const colPlayed = tCol <= playheadSec;
        const playedBoost = colPlayed ? alphaScale : alphaScale * 0.68;
        const colBase = c * sRows;

        for (let r = 0; r < sRows; r++) {
          const cellNorm = specData.cells[colBase + r] / 255;
          if (cellNorm < 0.08) continue;
          const rowFrac = r / Math.max(1, sRows - 1);
          const sy = height - (r + 1) * rowH;
          ctx.fillStyle = spectrogramIntensityToRgba(rowFrac, cellNorm, playedBoost);
          ctx.fillRect(sx, sy, Math.ceil(colW) + 0.4, rowH + 0.4);
        }
      }

      // Subtle horizontal crossover guide lines separating Kick (~240 Hz) / Melodic / Snare (~2.4 kHz)
      const kickTopY = height * (1 - 0.3);
      const midTopY = height * (1 - 0.68);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.fillRect(0, kickTopY, width, 1);
      ctx.fillRect(0, midTopY, width, 1);

      if (spectrogramMode === 'full') {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.45)';
        ctx.font = '7.5px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('2.4kHz · SNARE/HAT', 5, midTopY - 2);
        ctx.fillText('240Hz · KICK', 5, kickTopY - 2);
      }
    }

    if (isZoom) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.fillRect(0, midY, width, 1);
    }

    // Active Loop Window Region Overlay
    if (
      loopWindowStartSec !== null &&
      loopWindowEndSec !== null &&
      loopWindowEndSec > loopWindowStartSec &&
      loopWindowEndSec >= winStart &&
      loopWindowStartSec <= winEnd
    ) {
      const lx0 = Math.max(0, toX(loopWindowStartSec));
      const lx1 = Math.min(width, toX(loopWindowEndSec));
      if (lx1 > lx0) {
        ctx.fillStyle = 'rgba(52, 211, 153, 0.14)';
        ctx.fillRect(lx0, 0, lx1 - lx0, height);
        ctx.fillStyle = 'rgba(52, 211, 153, 0.85)';
        ctx.fillRect(lx0, 0, 1.5, height);
        ctx.fillRect(lx1 - 1.5, 0, 1.5, height);
      }
    }

    // 2. Waveform Peak Bars (Frequency-Intensity Colored in Overlay, Envelope Contour in Full Spec, Tri-Band in Off)
    if (spectrogramMode === 'full') {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.52)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const x = i * barSlot;
        const tAtBar = winStart + (i / Math.max(1, n - 1)) * winSpan;
        if (tAtBar < 0 || tAtBar > track.duration) continue;
        const py = midY - Math.max(1.5, overall[i] * (height * 0.42));
        if (!started) {
          ctx.moveTo(x, py);
          started = true;
        } else {
          ctx.lineTo(x, py);
        }
      }
      ctx.stroke();
    } else if (spectrogramMode === 'overlay' && specData) {
      const sCols = specData.cols;
      for (let i = 0; i < n; i++) {
        const x = i * barSlot;
        const bw = Math.max(1.25, barSlot - 0.55);
        const tAtBar = winStart + (i / Math.max(1, n - 1)) * winSpan;
        if (tAtBar < 0 || tAtBar > track.duration) continue;
        const played = tAtBar <= playheadSec;

        const specIdx = Math.min(
          sCols - 1,
          Math.max(0, Math.round((i / Math.max(1, n - 1)) * (sCols - 1)))
        );
        const kickNorm = specData.kickPeaks[specIdx] / 255;
        const melodicNorm = specData.melodicPeaks[specIdx] / 255;
        const snareNorm = specData.snarePeaks[specIdx] / 255;

        const peakH = Math.max(2, overall[i] * (height * 0.42));
        ctx.fillStyle = frequencyPeakToColor(kickNorm, melodicNorm, snareNorm, overall[i], played);
        ctx.fillRect(x, midY - peakH, bw, peakH * 1.46);

        // Anchor heavy kick bottoms & sharp snare upper spikes visually
        if (kickNorm > 0.58) {
          const kickAnchorH = Math.max(2, kickNorm * height * 0.24);
          ctx.fillStyle = played ? 'rgba(251, 113, 133, 0.88)' : 'rgba(244, 63, 94, 0.45)';
          ctx.fillRect(x, midY + peakH * 0.46 - kickAnchorH, bw, kickAnchorH);
        }
        if (snareNorm > 0.54) {
          const snareTipH = Math.max(1.5, snareNorm * height * 0.16);
          ctx.fillStyle = played ? 'rgba(253, 224, 71, 0.86)' : 'rgba(250, 204, 21, 0.44)';
          ctx.fillRect(x, midY - peakH, bw, snareTipH);
        }

        if (isZoom && effectiveZoomPct >= 55 && i > 0) {
          const rise = overall[i] - overall[i - 1];
          if (rise > 0.2 && overall[i] > 0.34) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
            ctx.fillRect(x, 2, 1, 6);
          }
        }
      }
    } else {
      // Standard Tri-band bars: Low (Cyan/Blue), Mid (Emerald/Amber), High (Rose/White)
      for (let i = 0; i < n; i++) {
        const x = i * barSlot;
        const bw = Math.max(1.2, barSlot - 0.6);
        const tAtBar = winStart + (i / Math.max(1, n - 1)) * winSpan;
        if (tAtBar < 0 || tAtBar > track.duration) continue;
        const played = tAtBar <= playheadSec;

        const lowH = Math.max(2, low[i] * (height * 0.42));
        const midH = Math.max(1, mid[i] * (height * 0.34));
        const highH = Math.max(1, high[i] * (height * 0.22));

        ctx.fillStyle = played ? 'rgba(34,211,238,0.88)' : 'rgba(56,189,248,0.42)';
        ctx.fillRect(x, midY - lowH, bw, lowH * 1.45);

        ctx.fillStyle = played ? 'rgba(245,158,11,0.78)' : 'rgba(16,185,129,0.38)';
        ctx.fillRect(x, midY - midH * 0.85, bw, midH * 1.2);

        ctx.fillStyle = played ? 'rgba(244,114,182,0.72)' : 'rgba(226,232,240,0.28)';
        ctx.fillRect(x, midY - highH * 0.6, bw, highH * 0.8);

        // Highlight sharp transient attack spikes when zoomed in for tight cue/loop placement
        if (isZoom && effectiveZoomPct >= 55 && i > 0) {
          const rise = overall[i] - overall[i - 1];
          if (rise > 0.2 && overall[i] > 0.34) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
            ctx.fillRect(x, 2, 1, 6);
          }
        }
      }
    }

    // Sub-second millisecond offset ticks when zoomed closely onto transients
    if (isZoom && winSpan <= 4.5) {
      const stepSec = winSpan <= 0.8 ? 0.05 : winSpan <= 2.0 ? 0.1 : 0.25;
      const firstOffset = Math.ceil((-winSpan * 0.5) / stepSec) * stepSec;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.28)';
      ctx.font = '7.5px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (let off = firstOffset; off <= winSpan * 0.5; off += stepSec) {
        if (Math.abs(off) < 0.01) continue;
        const tx = toX(playheadSec + off);
        if (tx < 16 || tx > width - 16) continue;
        ctx.fillRect(tx, height - 4, 1, 4);
        if (Math.abs(Math.round(off / stepSec)) % 2 === 0 || winSpan <= 1.2) {
          const ms = Math.round(off * 1000);
          ctx.fillText(`${ms > 0 ? '+' : ''}${ms}ms`, tx, height - 4);
        }
      }
    }

    // Draw Visual Beat Grid Overlay (4/4 Bars, Beats, and Sub-Beat Divisions)
    if (showBeatGrid && gridPoints.length > 0) {
      const beatPeriod = 60 / Math.max(40, getEffectiveBpm(track));
      const pxPerBeat = (beatPeriod / winSpan) * width;
      const labelStepBars = pxPerBeat >= 32 ? 1 : pxPerBeat >= 12 ? 2 : pxPerBeat >= 5 ? 4 : 8;

      for (let idx = 0; idx < gridPoints.length; idx++) {
        const pt = gridPoints[idx];
        if (pt.timeSec < winStart - beatPeriod || pt.timeSec > winEnd + beatPeriod) continue;
        const bx = toX(pt.timeSec);

        // Sub-beat subdivisions (1/2, 1/4) when zoomed or spacing permits
        if (beatGridSubdivision > 1 && pxPerBeat >= 14) {
          for (let sub = 1; sub < beatGridSubdivision; sub++) {
            const subT = pt.timeSec + (sub / beatGridSubdivision) * beatPeriod;
            if (subT < winStart || subT > winEnd || subT > track.duration) continue;
            const sx = toX(subT);
            ctx.fillStyle =
              beatGridSubdivision === 4 && sub % 2 === 1
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(148, 163, 184, 0.16)';
            ctx.fillRect(sx, height * 0.18, 1, height * 0.68);
          }
        }

        if (bx < 0 || bx > width) continue;

        if (pt.isDownbeat) {
          ctx.fillStyle = isGridEditMode
            ? 'rgba(250, 204, 21, 0.96)'
            : 'rgba(250, 204, 21, 0.78)';
          ctx.fillRect(bx - (isGridEditMode ? 1 : 0.5), 0, isGridEditMode ? 2 : 1.5, height);

          if (isGridEditMode && !track.beatGridLocked) {
            // Top & bottom diamond grab handles on downbeats when editing beat grid
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.moveTo(bx, 0);
            ctx.lineTo(bx + 4, 5);
            ctx.lineTo(bx - 4, 5);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(bx, height);
            ctx.lineTo(bx + 4, height - 5);
            ctx.lineTo(bx - 4, height - 5);
            ctx.closePath();
            ctx.fill();
          }

          if (pt.barNumber % labelStepBars === 1 || labelStepBars === 1) {
            ctx.fillStyle = 'rgba(250, 204, 21, 0.94)';
            ctx.font = 'bold 8px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(
              isZoom ? `${pt.barNumber}.1` : `B${pt.barNumber}`,
              Math.min(width - 20, bx + 4),
              2
            );
          }
        } else if (pxPerBeat >= 5) {
          ctx.fillStyle = isGridEditMode
            ? 'rgba(255, 255, 255, 0.44)'
            : isZoom
              ? 'rgba(255, 255, 255, 0.28)'
              : 'rgba(255, 255, 255, 0.14)';
          ctx.fillRect(
            bx,
            isZoom || isGridEditMode ? 8 : height * 0.72,
            isGridEditMode && isZoom ? 1.25 : 1,
            isZoom || isGridEditMode ? height - 8 : height * 0.28
          );
          if (isZoom && pxPerBeat >= 34) {
            ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
            ctx.font = '8px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(`${pt.barNumber}.${pt.beatInBar}`, bx + 3, 2);
          }
        }
      }
    }

    // Draw Lyric Cue dots along top ribbon
    for (const lyric of track.lyrics) {
      if (lyric.time < winStart || lyric.time > winEnd) continue;
      const lx = toX(lyric.time);
      ctx.fillStyle = '#e879f9';
      ctx.beginPath();
      ctx.arc(lx, 12, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Drop marker
    if (track.dropTime >= winStart && track.dropTime <= winEnd) {
      const dropX = toX(track.dropTime);
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(dropX - 0.5, 0, 1.5, height);
    }

    // Draw Saved Cue Point markers along bottom edge
    if (track.cuePoints && track.cuePoints.length > 0) {
      for (const cue of track.cuePoints) {
        if (cue.timeSec < winStart || cue.timeSec > winEnd) continue;
        const qx = Math.max(2, Math.min(width - 2, toX(cue.timeSec)));
        ctx.fillStyle = cue.color || '#22d3ee';
        ctx.fillRect(qx - 0.75, height * 0.25, 1.5, height * 0.75);

        const tagText = cue.label.slice(0, 7);
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        const tagW = Math.max(22, Math.min(48, ctx.measureText(tagText).width + 6));
        const tagX = Math.min(width - tagW - 1, Math.max(1, qx - 1));
        ctx.fillStyle = cue.color || '#22d3ee';
        ctx.fillRect(tagX, height - 11, tagW, 11);
        ctx.fillStyle = '#090b10';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(tagText, tagX + 3, height - 5.2);
      }
    }

    // Draw Active Mix-Out / Mix-In Cue marker
    if (cueTimeSec !== null && cueTimeSec >= winStart && cueTimeSec <= winEnd) {
      const cx = toX(cueTimeSec);
      ctx.fillStyle = accentHex;
      ctx.fillRect(cx - 1, 0, 2, height);
      ctx.fillRect(cx - 1, 0, 44, 13);
      ctx.fillStyle = '#090b10';
      ctx.font = 'bold 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(cueLabel, Math.min(width - 42, cx + 3), 6.5);
    }

    // Playhead cursor (+ Vinyl Stylus Glow when scratching)
    const px = isZoom
      ? width * 0.5
      : Math.max(0, Math.min(width - 1, toX(playheadSec)));

    if (isScratching && scratchRate !== null) {
      const isRev = scratchRate < -0.04;
      const isHold = Math.abs(scratchRate) <= 0.04;
      const glowColor = isRev
        ? 'rgba(244, 63, 94, 0.34)'
        : isHold
          ? 'rgba(250, 204, 21, 0.28)'
          : 'rgba(34, 211, 238, 0.32)';
      const streakW = Math.min(46, Math.max(10, Math.abs(scratchRate) * 12));
      const grad = ctx.createLinearGradient(
        isRev ? px : px - streakW,
        0,
        isRev ? px + streakW : px,
        0
      );
      if (isRev) {
        grad.addColorStop(0, glowColor);
        grad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(px, 0, streakW, height);
      } else {
        grad.addColorStop(0, 'rgba(34, 211, 238, 0)');
        grad.addColorStop(1, glowColor);
        ctx.fillStyle = grad;
        ctx.fillRect(px - streakW, 0, streakW, height);
      }
      ctx.fillStyle = isRev ? '#fb7185' : isHold ? '#fde047' : '#ffffff';
      ctx.fillRect(px - 1.5, 0, 3, height);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 1, 0, 2, height);
    }

    // Grid Edit or Vinyl Scratch status badge in top-right corner
    if (isGridEditMode && track) {
      const offsetMs = track.beatGridOffsetMs ?? 0;
      const badgeText = track.beatGridLocked
        ? 'GRID LOCKED'
        : `EDIT GRID ${offsetMs >= 0 ? '+' : ''}${offsetMs.toFixed(1)}ms`;
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      const bw = ctx.measureText(badgeText).width + 10;
      ctx.fillStyle = 'rgba(9, 11, 16, 0.88)';
      ctx.fillRect(width - bw - 4, 3, bw, 13);
      ctx.strokeStyle = track.beatGridLocked ? 'rgba(148,163,184,0.6)' : 'rgba(250,204,21,0.75)';
      ctx.lineWidth = 1;
      ctx.strokeRect(width - bw - 4, 3, bw, 13);
      ctx.fillStyle = track.beatGridLocked ? '#cbd5e1' : '#fde047';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, width - 9, 9.5);
    } else if (isScratchMode && track) {
      const rateVal = scratchRate ?? 0;
      const badgeText = isScratching
        ? Math.abs(rateVal) <= 0.04
          ? 'VINYL HOLD 0.00x'
          : rateVal < 0
            ? `SCRATCH ${rateVal.toFixed(2)}x REV`
            : `SCRATCH +${rateVal.toFixed(2)}x`
        : 'DRAG TO SCRATCH';
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      const bw = ctx.measureText(badgeText).width + 10;
      ctx.fillStyle = 'rgba(9, 11, 16, 0.86)';
      ctx.fillRect(width - bw - 4, 3, bw, 13);
      ctx.strokeStyle = isScratching
        ? rateVal < -0.04
          ? 'rgba(251, 113, 133, 0.85)'
          : 'rgba(34, 211, 238, 0.85)'
        : 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(width - bw - 4, 3, bw, 13);
      ctx.fillStyle = isScratching
        ? rateVal < -0.04
          ? '#fda4af'
          : '#67e8f9'
        : 'rgba(203, 213, 225, 0.72)';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, width - 9, 9.5);
    }

    // Directional Playhead Nudge Chevron & Alignment HUD Badge
    if (track && (nudgeFlash || Math.abs(nudgeAccumMs) >= 0.5)) {
      if (nudgeFlash) {
        const isForward = nudgeFlash.deltaMs >= 0;
        ctx.fillStyle = accentHex;
        ctx.globalAlpha = 0.28;
        ctx.fillRect(isForward ? px + 1 : px - 10, 0, 9, height);
        ctx.globalAlpha = 1;

        ctx.beginPath();
        const cy = height * 0.5;
        if (isForward) {
          ctx.moveTo(px + 4, cy - 5);
          ctx.lineTo(px + 10, cy);
          ctx.lineTo(px + 4, cy + 5);
        } else {
          ctx.moveTo(px - 3, cy - 5);
          ctx.lineTo(px - 9, cy);
          ctx.lineTo(px - 3, cy + 5);
        }
        ctx.closePath();
        ctx.fillStyle = accentHex;
        ctx.fill();
      }

      const nudgeBadgeText = nudgeFlash
        ? `NUDGE ${nudgeFlash.deltaMs >= 0 ? '+' : ''}${nudgeFlash.deltaMs}ms · Σ ${nudgeAccumMs >= 0 ? '+' : ''}${nudgeAccumMs.toFixed(0)}ms`
        : `ALIGN ${nudgeAccumMs >= 0 ? '+' : ''}${nudgeAccumMs.toFixed(0)}ms`;
      ctx.font = 'bold 8px "JetBrains Mono", monospace';
      const nbw = ctx.measureText(nudgeBadgeText).width + 10;
      const nby = isGridEditMode || isScratchMode ? 19 : 3;
      ctx.fillStyle = 'rgba(9, 11, 16, 0.88)';
      ctx.fillRect(width - nbw - 4, nby, nbw, 13);
      ctx.strokeStyle = nudgeFlash ? accentHex : 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(width - nbw - 4, nby, nbw, 13);
      ctx.fillStyle = nudgeFlash ? accentHex : '#cbd5e1';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(nudgeBadgeText, width - 9, nby + 6.5);
    }

    // Camelot Wheel Harmonic Key HUD badge inside top-left of waveform view
    if (track && (track.camelotKey || track.musicalKey)) {
      const camelotEntry = getCamelotEntry(track.camelotKey);
      const keyColor = camelotEntry?.colorHex ?? accentHex;
      const keyLabel = track.camelotKey
        ? `${track.camelotKey} · ${track.musicalKey ?? camelotEntry?.musicalKey ?? ''}`
        : `${track.musicalKey}`;

      const cueOverlapsTopLeft =
        cueTimeSec !== null &&
        cueTimeSec >= winStart &&
        cueTimeSec <= winEnd &&
        toX(cueTimeSec) < 96;
      const keyBoxY = cueOverlapsTopLeft ? 17 : 3;

      ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
      const hasMatchDot = Boolean(
        harmonicCompatibility && harmonicCompatibility.tier !== 'unknown'
      );
      const textW = ctx.measureText(keyLabel).width;
      const boxW = Math.round(textW + (hasMatchDot ? 24 : 15));
      const boxX = 4;

      ctx.fillStyle = 'rgba(9, 11, 16, 0.90)';
      ctx.fillRect(boxX, keyBoxY, boxW, 13);
      ctx.strokeStyle = keyColor;
      ctx.globalAlpha = 0.72;
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX, keyBoxY, boxW, 13);
      ctx.globalAlpha = 1;

      ctx.fillStyle = keyColor;
      ctx.beginPath();
      ctx.arc(boxX + 6, keyBoxY + 6.5, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(keyLabel, boxX + 11, keyBoxY + 6.5);

      if (hasMatchDot && harmonicCompatibility) {
        ctx.fillStyle = harmonicCompatibility.accentHex;
        ctx.beginPath();
        ctx.arc(boxX + boxW - 6, keyBoxY + 6.5, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const beatPeriod = track ? 60 / Math.max(40, getEffectiveBpm(track)) : 0.5;
    const pxPerBeat = (beatPeriod / Math.max(0.05, winSpan)) * width;
    glowLayoutRef.current = {
      width,
      height,
      winStart,
      winEnd,
      winSpan,
      beatPeriod,
      pxPerBeat,
      duration: track.duration,
      isZoom,
      isGridEditMode,
      showBeatGrid,
      beatGridSubdivision,
      gridPoints,
      accentHex,
      hasNudgeActive: Boolean(nudgeFlash || isGridEditMode || Math.abs(nudgeAccumMs) >= 0.5),
    };

    ctx.restore();
  }, [
    track,
    playheadSec,
    accentHex,
    cueTimeSec,
    cueLabel,
    showBeatGrid,
    beatGridSubdivision,
    viewMode,
    effectiveZoomPct,
    isZoomedView,
    loopWindowStartSec,
    loopWindowEndSec,
    nudgeAccumMs,
    nudgeFlash,
    harmonicCompatibility,
    spectrogramMode,
    isGridEditMode,
    isScratchMode,
    isScratching,
    scratchRate,
    gridPoints,
    zoomBounds,
  ]);

  const drawGlowOverlay = useCallback(() => {
    const glowCanvas = glowCanvasRef.current;
    if (!glowCanvas) return;
    const layout = glowLayoutRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = glowCanvas.clientWidth || layout?.width || 420;
    const height = glowCanvas.clientHeight || layout?.height || 68;
    if (
      glowCanvas.width !== Math.round(width * dpr) ||
      glowCanvas.height !== Math.round(height * dpr)
    ) {
      glowCanvas.width = Math.round(width * dpr);
      glowCanvas.height = Math.round(height * dpr);
    }
    const gCtx = glowCanvas.getContext('2d');
    if (!gCtx) return;

    gCtx.save();
    gCtx.scale(dpr, dpr);
    gCtx.clearRect(0, 0, width, height);

    if (!layout || !layout.showBeatGrid || layout.gridPoints.length === 0) {
      gCtx.restore();
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = masterBeatClockRef?.current ?? { phase: 0, beatIndex: 0 };
    const pulse = reducedMotion ? 0.28 : computeMasterBeatGlowPulse(clock.phase);
    const nudgeBoost = layout.hasNudgeActive ? 1.18 : 1;
    const downbeatAccent = clock.beatIndex === 0 ? 1.2 : 1;

    const rgbPair =
      layout.accentHex.toLowerCase() === '#f59e0b'
        ? { core: '252, 211, 77', halo: '245, 158, 11' }
        : { core: '103, 232, 249', halo: '34, 211, 238' };

    gCtx.beginPath();
    gCtx.rect(1, 1, Math.max(0, width - 2), Math.max(0, height - 2));
    gCtx.clip();

    const toX = (t: number) => ((t - layout.winStart) / layout.winSpan) * width;
    for (let idx = 0; idx < layout.gridPoints.length; idx++) {
      const pt = layout.gridPoints[idx];
      if (pt.timeSec < layout.winStart - layout.beatPeriod || pt.timeSec > layout.winEnd + layout.beatPeriod) {
        continue;
      }

      if (layout.beatGridSubdivision > 1 && layout.pxPerBeat >= 20) {
        for (let sub = 1; sub < layout.beatGridSubdivision; sub++) {
          const subT = pt.timeSec + (sub / layout.beatGridSubdivision) * layout.beatPeriod;
          if (subT < layout.winStart || subT > layout.winEnd || subT > layout.duration) continue;
          const sx = toX(subT);
          drawPulsingBeatGridGlow(
            gCtx,
            sx,
            height * 0.18,
            height * 0.68,
            rgbPair.core,
            rgbPair.halo,
            pulse,
            false,
            0.34 * nudgeBoost
          );
        }
      }

      const bx = toX(pt.timeSec);
      if (bx < 0 || bx > width) continue;

      if (pt.isDownbeat) {
        drawPulsingBeatGridGlow(
          gCtx,
          bx,
          0,
          height,
          '253, 224, 71',
          '250, 204, 21',
          pulse,
          true,
          downbeatAccent * nudgeBoost
        );
      } else if (layout.pxPerBeat >= 5) {
        const y0 = layout.isZoom || layout.isGridEditMode ? 8 : height * 0.72;
        const hBar = layout.isZoom || layout.isGridEditMode ? height - 8 : height * 0.28;
        drawPulsingBeatGridGlow(
          gCtx,
          bx,
          y0,
          hBar,
          rgbPair.core,
          rgbPair.halo,
          pulse,
          false,
          0.95 * nudgeBoost
        );
      }
    }

    gCtx.restore();
  }, [masterBeatClockRef]);

  useEffect(() => {
    drawGlowOverlay();
  }, [
    drawGlowOverlay,
    track,
    playheadSec,
    showBeatGrid,
    beatGridSubdivision,
    viewMode,
    effectiveZoomPct,
    isGridEditMode,
    nudgeFlash,
  ]);

  useEffect(() => {
    if (!registerBeatPulseDraw) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    return registerBeatPulseDraw(drawGlowOverlay);
  }, [drawGlowOverlay, registerBeatPulseDraw]);

  const interactiveDragEnabled = Boolean(track && (isGridEditMode || isScratchMode));
  const useExactTransientSeek = Boolean(
    isGridEditMode ||
      freeTransientSeek ||
      (!syncToBeatGrid && isZoomedView && effectiveZoomPct >= 55)
  );
  const snapTargetBeats = gridBeatTimes.length > 0 ? gridBeatTimes : track?.beatTimes ?? [];

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          if (!interactiveDragEnabled || !track) return;
          gridDragLastXRef.current = e.clientX;
          dragLastTimeRef.current = performance.now();
          gridDragTotalPxRef.current = 0;
          scratchEngagedRef.current = false;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!interactiveDragEnabled || !track || gridDragLastXRef.current === null) return;
          const now = performance.now();
          const dx = e.clientX - gridDragLastXRef.current;
          const dtSec = Math.max(0.008, Math.min(0.08, (now - dragLastTimeRef.current) / 1000));
          gridDragLastXRef.current = e.clientX;
          dragLastTimeRef.current = now;
          gridDragTotalPxRef.current += Math.abs(dx);

          if (isGridEditMode) {
            if (track.beatGridLocked || !onDragBeatGridMs || Math.abs(dx) < 0.2) return;
            const width = e.currentTarget.clientWidth || 420;
            const winSpan = isZoomedView
              ? Math.max(0.15, zoomBounds.end - zoomBounds.start)
              : Math.min(2.4, Math.max(0.4, track.duration * 0.04));
            const deltaMs = (dx / Math.max(80, width)) * winSpan * 1000;
            onDragBeatGridMs(deltaMs);
            return;
          }

          if (isScratchMode && gridDragTotalPxRef.current >= 3.5) {
            if (!scratchEngagedRef.current) {
              scratchEngagedRef.current = true;
              onScratchStart?.();
            }
            const width = Math.max(120, e.currentTarget.clientWidth || 420);
            const deltaSec = isZoomedView
              ? -(dx / width) *
                Math.max(0.6, Math.min(3.5, zoomBounds.end - zoomBounds.start)) *
                (scratchSensitivitySec / 1.8)
              : (dx / width) * scratchSensitivitySec;
            const velocityRate = deltaSec / dtSec;
            onScratchMove?.(deltaSec, velocityRate);
          }
        }}
        onPointerUp={(e) => {
          if (!interactiveDragEnabled) return;
          const wasScratching = scratchEngagedRef.current;
          const wasClick = gridDragTotalPxRef.current < 3.5;
          gridDragLastXRef.current = null;
          gridDragTotalPxRef.current = 0;
          scratchEngagedRef.current = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
          if (wasScratching && !isGridEditMode) {
            onScratchEnd?.();
            return;
          }
          if (wasClick && track) {
            const rect = e.currentTarget.getBoundingClientRect();
            const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
            const rawTime = isZoomedView
              ? zoomBounds.start + frac * (zoomBounds.end - zoomBounds.start)
              : frac * track.duration;
            const clamped = Math.max(0, Math.min(track.duration - 0.05, rawTime));
            onSeekOrCue(
              useExactTransientSeek
                ? Number(clamped.toFixed(3))
                : findNearestBeat(snapTargetBeats, clamped)
            );
          }
        }}
        onPointerCancel={() => {
          const wasScratching = scratchEngagedRef.current;
          gridDragLastXRef.current = null;
          gridDragTotalPxRef.current = 0;
          scratchEngagedRef.current = false;
          if (wasScratching && !isGridEditMode) {
            onScratchEnd?.();
          }
        }}
        onClick={(e) => {
          if (!track || interactiveDragEnabled) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
          const rawTime = isZoomedView
            ? zoomBounds.start + frac * (zoomBounds.end - zoomBounds.start)
            : frac * track.duration;
          const clamped = Math.max(0, Math.min(track.duration - 0.05, rawTime));
          onSeekOrCue(
            useExactTransientSeek
              ? Number(clamped.toFixed(3))
              : findNearestBeat(snapTargetBeats, clamped)
          );
        }}
        title={
          !track
            ? undefined
            : isGridEditMode
              ? track.beatGridLocked
                ? 'Beat grid is locked — unlock in Grid Editor to drag'
                : 'Drag horizontally to slide beat-grid lines onto audio transients, or click to seek'
              : isScratchMode
                ? 'Drag horizontally to vinyl-scratch playback speed (forward & reverse), or click to seek'
                : useExactTransientSeek
                  ? 'Click anywhere to jump directly to exact millisecond transient (Free Seek)'
                  : 'Click anywhere to snap playhead / cue to nearest beat'
        }
        className={`w-full rounded-lg border block touch-none select-none ${
          isGridEditMode
            ? track?.beatGridLocked
              ? 'h-[86px] border-slate-500/40 cursor-not-allowed'
              : 'h-[86px] border-amber-400/55 ring-1 ring-amber-400/25 cursor-grab active:cursor-grabbing'
            : isScratchMode && track
              ? isScratching
                ? `${spectrogramMode !== 'off' ? 'h-[82px]' : 'h-[68px]'} border-cyan-400/75 ring-1 ring-cyan-400/40 cursor-grabbing`
                : `${spectrogramMode !== 'off' ? 'h-[82px]' : 'h-[68px]'} border-white/[0.1] hover:border-cyan-400/40 cursor-grab active:cursor-grabbing`
              : `${spectrogramMode !== 'off' ? 'h-[82px]' : 'h-[68px]'} border-white/[0.08] cursor-pointer`
        }`}
      />
      <canvas
        ref={glowCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full rounded-lg"
      />
    </div>
  );
}

interface SmartCrossfadeOverlapCanvasProps {
  deckA: DjTrackAsset | null;
  deckB: DjTrackAsset | null;
  plan: DjTransitionPlan | null;
  zoomMode: 'zoom' | 'full';
  playheadSec: number;
  showBeatGrid?: boolean;
  beatGridSubdivision?: 1 | 2 | 4;
  previewHighlight?: { startSec: number; endSec: number; label: string } | null;
  previewPlayheadSec?: number | null;
  masterBeatClockRef?: { current: MasterBeatClockState };
  registerBeatPulseDraw?: (fn: () => void) => () => void;
  onSeekTimeline: (timelineSec: number) => void;
}

function sampleTrackBandPeakAtTime(
  track: DjTrackAsset,
  sourceTimeSec: number
): { low: number; overall: number } {
  const n = track.triBandPeaks.overall.length;
  if (n === 0 || track.duration <= 0) return { low: 0, overall: 0 };
  const norm = sourceTimeSec / track.duration;
  if (norm < 0 || norm > 1) return { low: 0, overall: 0 };
  const idx = Math.min(n - 1, Math.max(0, Math.floor(norm * (n - 1))));
  return {
    low: track.triBandPeaks.low[idx] ?? 0,
    overall: track.triBandPeaks.overall[idx] ?? 0,
  };
}

function SmartCrossfadeOverlapCanvas({
  deckA,
  deckB,
  plan,
  zoomMode,
  playheadSec,
  showBeatGrid = true,
  beatGridSubdivision = 2,
  previewHighlight = null,
  previewPlayheadSec = null,
  masterBeatClockRef,
  registerBeatPulseDraw,
  onSeekTimeline,
}: SmartCrossfadeOverlapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridA = useMemo(() => (deckA ? getEffectiveBeatGridPoints(deckA) : []), [deckA]);
  const gridB = useMemo(() => (deckB ? getEffectiveBeatGridPoints(deckB) : []), [deckB]);
  const glowLayoutRef = useRef<{
    width: number;
    height: number;
    winStart: number;
    winEnd: number;
    winSpan: number;
    showBeatGrid: boolean;
    beatGridSubdivision: 1 | 2 | 4;
    deckA: DjTrackAsset;
    deckB: DjTrackAsset;
    plan: DjTransitionPlan;
  } | null>(null);

  const windowBounds = useMemo(() => {
    if (!deckA || !deckB || !plan) {
      return { start: 0, end: 30 };
    }
    if (zoomMode === 'full') {
      return { start: 0, end: Math.max(2, plan.totalDurationSec) };
    }
    const pad = Math.max(3.5, plan.overlapDurationSec * 0.75);
    const baseStart = Math.max(0, plan.transitionStartSec - pad);
    const baseEnd = Math.min(plan.totalDurationSec, plan.transitionEndSec + pad);
    const start = previewHighlight ? Math.min(baseStart, previewHighlight.startSec) : baseStart;
    const end = previewHighlight ? Math.max(baseEnd, previewHighlight.endSec) : baseEnd;
    return { start, end: Math.max(start + 2, end) };
  }, [deckA, deckB, plan, previewHighlight, zoomMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 720;
    const height = canvas.clientHeight || 116;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, width, height);

    if (!deckA || !deckB || !plan) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'Load Deck A and Deck B (or click Demo DJ Pair) to visualize audio waveform overlap & BPM transition curves',
        width * 0.5,
        height * 0.5
      );
      ctx.restore();
      return;
    }

    const { start: winStart, end: winEnd } = windowBounds;
    const winSpan = Math.max(0.5, winEnd - winStart);
    const toX = (t: number) => ((t - winStart) / winSpan) * width;

    const transX1 = Math.max(0, toX(plan.transitionStartSec));
    const transX2 = Math.min(width, toX(plan.transitionEndSec));
    const overlapW = Math.max(2, transX2 - transX1);

    // Shaded Overlap Region
    const grad = ctx.createLinearGradient(transX1, 0, transX2, 0);
    grad.addColorStop(0, 'rgba(34, 211, 238, 0.14)');
    grad.addColorStop(0.5, 'rgba(217, 70, 239, 0.16)');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0.14)');
    ctx.fillStyle = grad;
    ctx.fillRect(transX1, 0, overlapW, height);

    const deckATopBase = height * 0.36;
    const deckBTopBase = height * 0.68;
    const ampScale = height * 0.25;

    const cols = Math.max(80, Math.floor(width / 3));
    const colW = width / cols;

    // 1. Render Deck A Waveform (Cyan) fading out across overlap
    for (let c = 0; c < cols; c++) {
      const x = c * colW;
      const t = winStart + (c / cols) * winSpan;
      if (t > plan.deckAEndSec) continue;

      const sample = sampleTrackBandPeakAtTime(deckA, t);
      let fadeA = 1;
      if (t >= plan.transitionStartSec) {
        const frac = Math.min(1, (t - plan.transitionStartSec) / Math.max(0.1, plan.overlapDurationSec));
        fadeA = Math.max(0.08, 1 - frac);
      }

      const hBar = Math.max(1.5, sample.overall * ampScale * (0.28 + 0.72 * fadeA));
      ctx.fillStyle =
        t >= plan.transitionStartSec
          ? `rgba(34, 211, 238, ${(0.25 + 0.65 * fadeA).toFixed(2)})`
          : 'rgba(34, 211, 238, 0.72)';
      ctx.fillRect(x, deckATopBase - hBar, Math.max(1.5, colW - 0.6), hBar * 1.45);
    }

    // 2. Render Deck B Waveform (Amber) fading in from transitionStartSec
    for (let c = 0; c < cols; c++) {
      const x = c * colW;
      const t = winStart + (c / cols) * winSpan;
      if (t < plan.deckBTimelineStartSec) continue;

      const offsetB = (t - plan.deckBTimelineStartSec) * plan.deckBPlaybackRate;
      const sourceTimeB = plan.deckBInTime + offsetB;
      if (sourceTimeB > deckB.duration) continue;

      const sample = sampleTrackBandPeakAtTime(deckB, sourceTimeB);
      let fadeB = 1;
      if (t <= plan.transitionEndSec) {
        const frac = Math.min(1, (t - plan.transitionStartSec) / Math.max(0.1, plan.overlapDurationSec));
        fadeB = Math.max(0.12, frac);
      }

      const hBar = Math.max(1.5, sample.overall * ampScale * (0.28 + 0.72 * fadeB));
      ctx.fillStyle =
        t <= plan.transitionEndSec
          ? `rgba(245, 158, 11, ${(0.25 + 0.65 * fadeB).toFixed(2)})`
          : 'rgba(245, 158, 11, 0.76)';
      ctx.fillRect(x, deckBTopBase - hBar * 0.45, Math.max(1.5, colW - 0.6), hBar * 1.45);
    }

    // 3. Visual Beat-Grid Overlay (Deck A Top Rails + Deck B Synced Bottom Rails + Phase Bridges)
    if (showBeatGrid) {
      const gridA = getEffectiveBeatGridPoints(deckA);
      const gridB = getEffectiveBeatGridPoints(deckB);
      const beatSecA = 60 / Math.max(40, getEffectiveBpm(deckA));
      const pxPerBeatA = (beatSecA / winSpan) * width;

      const visibleBeatsA: Array<{ t: number; isDown: boolean }> = [];
      for (const pt of gridA) {
        if (pt.timeSec < winStart - beatSecA || pt.timeSec > Math.min(winEnd, plan.deckAEndSec)) continue;
        if (beatGridSubdivision > 1 && pxPerBeatA >= 16) {
          for (let sub = 1; sub < beatGridSubdivision; sub++) {
            const subT = pt.timeSec + (sub / beatGridSubdivision) * beatSecA;
            if (subT < winStart || subT > Math.min(winEnd, plan.deckAEndSec)) continue;
            ctx.fillStyle = 'rgba(34, 211, 238, 0.10)';
            ctx.fillRect(toX(subT), 16, 1, height * 0.34);
          }
        }
        if (pt.timeSec >= winStart && pt.timeSec <= Math.min(winEnd, plan.deckAEndSec)) {
          visibleBeatsA.push({ t: pt.timeSec, isDown: pt.isDownbeat });
          const bx = toX(pt.timeSec);
          ctx.fillStyle = pt.isDownbeat ? 'rgba(250, 204, 21, 0.80)' : 'rgba(34, 211, 238, 0.28)';
          ctx.fillRect(bx, pt.isDownbeat ? 15 : 20, pt.isDownbeat ? 1.5 : 1, height * 0.34);
        }
      }

      const beatSecBTimeline = (60 / Math.max(40, getEffectiveBpm(deckB))) / Math.max(0.5, plan.deckBPlaybackRate);
      for (const pt of gridB) {
        if (pt.timeSec < plan.deckBInTime - 0.02) continue;
        const tlB = plan.deckBTimelineStartSec + (pt.timeSec - plan.deckBInTime) / Math.max(0.5, plan.deckBPlaybackRate);
        if (tlB < winStart - beatSecBTimeline || tlB > winEnd) continue;

        if (beatGridSubdivision > 1 && pxPerBeatA >= 16) {
          for (let sub = 1; sub < beatGridSubdivision; sub++) {
            const subTl = tlB + (sub / beatGridSubdivision) * beatSecBTimeline;
            if (subTl < winStart || subTl > winEnd) continue;
            ctx.fillStyle = 'rgba(245, 158, 11, 0.11)';
            ctx.fillRect(toX(subTl), height * 0.52, 1, height * 0.44);
          }
        }

        if (tlB >= winStart && tlB <= winEnd) {
          const bx = toX(tlB);
          ctx.fillStyle = pt.isDownbeat ? 'rgba(251, 191, 36, 0.85)' : 'rgba(245, 158, 11, 0.32)';
          ctx.fillRect(bx, height * 0.52, pt.isDownbeat ? 1.5 : 1, height * 0.46);

          // Draw phase-alignment indicator on midline inside overlap
          if (tlB >= plan.transitionStartSec - 0.05 && tlB <= plan.transitionEndSec + 0.05 && visibleBeatsA.length > 0) {
            let nearestA = visibleBeatsA[0].t;
            let bestDist = Infinity;
            for (const ba of visibleBeatsA) {
              const d = Math.abs(ba.t - tlB);
              if (d < bestDist) {
                bestDist = d;
                nearestA = ba.t;
              }
            }
            const midY = height * 0.5;
            if (bestDist <= 0.012) {
              ctx.fillStyle = 'rgba(52, 211, 153, 0.9)';
              ctx.fillRect(bx - 1.5, midY - 3, 3, 6);
            } else if (bestDist <= beatSecA * 0.5) {
              const ax = toX(nearestA);
              ctx.fillStyle = bestDist <= 0.032 ? 'rgba(251, 191, 36, 0.85)' : 'rgba(251, 113, 133, 0.85)';
              ctx.fillRect(Math.min(ax, bx), midY - 1.5, Math.max(2, Math.abs(bx - ax)), 3);
            }
          }
        }
      }
    }

    // 4. Crossfade Gain Envelope Curves (Deck A Out & Deck B In)
    const curveTop = 18;
    const curveBot = height - 12;
    const curveSpan = curveBot - curveTop;

    // Deck A envelope
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(0, curveTop);
    ctx.lineTo(transX1, curveTop);
    if (plan.transitionStyle === 'beat-drop') {
      const midX = transX1 + overlapW * 0.5;
      ctx.lineTo(midX, curveTop + curveSpan * 0.3);
      ctx.lineTo(midX, curveBot);
      ctx.lineTo(transX2, curveBot);
    } else {
      ctx.lineTo(transX2, curveBot);
    }
    ctx.stroke();

    // Deck B envelope
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    ctx.moveTo(transX1, curveBot);
    if (plan.transitionStyle === 'beat-drop') {
      const midX = transX1 + overlapW * 0.5;
      ctx.lineTo(midX - 2, curveBot - curveSpan * 0.25);
      ctx.lineTo(midX + 2, curveTop);
      ctx.lineTo(transX2, curveTop);
    } else {
      ctx.lineTo(transX2, curveTop);
    }
    ctx.lineTo(width, curveTop);
    ctx.stroke();

    // 5. Overlap Boundary Borders + Badges
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(transX1 - 1, 0, 2, height);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(transX2 - 1, 0, 2, height);

    ctx.fillStyle = 'rgba(9, 11, 16, 0.88)';
    ctx.fillRect(Math.max(4, transX1 - 2), 2, 108, 15);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`OUT ${formatDjClock(plan.transitionStartSec)}`, Math.max(8, transX1 + 2), 9.5);

    const endLabelX = Math.min(width - 110, Math.max(transX1 + 114, transX2 - 102));
    ctx.fillStyle = 'rgba(9, 11, 16, 0.88)';
    ctx.fillRect(endLabelX, 2, 104, 15);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText(`LOCK ${formatDjClock(plan.transitionEndSec)}`, endLabelX + 4, 9.5);

    // Center Crossover Tag
    const midTagX = transX1 + overlapW * 0.5;
    if (overlapW > 70) {
      const tagText =
        plan.transitionStyle === 'bass-swap'
          ? 'BASS SWAP'
          : plan.transitionStyle === 'filter-sweep'
            ? 'HPF / LPF'
            : plan.transitionStyle === 'beat-drop'
              ? 'DROP CUT'
              : plan.transitionStyle === 'stutter-cut'
                ? 'STUTTER'
                : 'ECHO OUT';
      ctx.fillStyle = 'rgba(9, 11, 16, 0.86)';
      ctx.fillRect(midTagX - 36, height * 0.5 - 8, 72, 16);
      ctx.strokeStyle = 'rgba(217, 70, 239, 0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(midTagX - 36, height * 0.5 - 8, 72, 16);
      ctx.fillStyle = '#f0abfc';
      ctx.textAlign = 'center';
      ctx.fillText(tagText, midTagX, height * 0.5);
    }

    // 5s AI Auto-Mix Preview Window Bracket
    if (previewHighlight && previewHighlight.endSec > previewHighlight.startSec) {
      const pvX1 = toX(previewHighlight.startSec);
      const pvX2 = toX(previewHighlight.endSec);
      if (pvX2 > 0 && pvX1 < width) {
        const clampedX1 = Math.max(0, pvX1);
        const clampedX2 = Math.min(width, pvX2);
        const pvW = Math.max(2, clampedX2 - clampedX1);
        ctx.fillStyle = 'rgba(217, 70, 239, 0.09)';
        ctx.fillRect(clampedX1, 0, pvW, height);

        ctx.fillStyle = 'rgba(232, 121, 249, 0.85)';
        ctx.fillRect(clampedX1, 0, pvW, 2);
        ctx.fillRect(clampedX1, height - 2, pvW, 2);

        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(232, 121, 249, 0.75)';
        ctx.lineWidth = 1;
        if (pvX1 >= 0 && pvX1 <= width) {
          ctx.beginPath();
          ctx.moveTo(pvX1, 0);
          ctx.lineTo(pvX1, height);
          ctx.stroke();
        }
        if (pvX2 >= 0 && pvX2 <= width) {
          ctx.beginPath();
          ctx.moveTo(pvX2, 0);
          ctx.lineTo(pvX2, height);
          ctx.stroke();
        }
        ctx.restore();

        if (pvW > 88) {
          const badgeText = `5S PREVIEW · ${previewHighlight.label.slice(0, 18).toUpperCase()}`;
          const badgeW = Math.min(pvW - 8, 176);
          ctx.fillStyle = 'rgba(9, 11, 16, 0.9)';
          ctx.fillRect(clampedX1 + 4, height - 18, badgeW, 14);
          ctx.fillStyle = '#f0abfc';
          ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(badgeText, clampedX1 + 8, height - 11);
        }
      }
    }

    // Playhead cursor if inside visible window
    if (playheadSec >= winStart && playheadSec <= winEnd) {
      const px = toX(playheadSec);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 1, 0, 2, height);
    }

    // Active 5-second Preview Playhead
    if (
      typeof previewPlayheadSec === 'number' &&
      previewPlayheadSec >= winStart &&
      previewPlayheadSec <= winEnd
    ) {
      const pvx = toX(previewPlayheadSec);
      ctx.fillStyle = '#f0abfc';
      ctx.fillRect(pvx - 1, 0, 2, height);
      ctx.beginPath();
      ctx.moveTo(pvx - 4, 0);
      ctx.lineTo(pvx + 4, 0);
      ctx.lineTo(pvx, 6);
      ctx.closePath();
      ctx.fill();
    }

    glowLayoutRef.current = {
      width,
      height,
      winStart,
      winEnd,
      winSpan,
      showBeatGrid,
      beatGridSubdivision,
      deckA,
      deckB,
      plan,
    };

    ctx.restore();
  }, [
    deckA,
    deckB,
    plan,
    playheadSec,
    previewHighlight,
    previewPlayheadSec,
    showBeatGrid,
    beatGridSubdivision,
    windowBounds,
  ]);

  const drawGlowOverlay = useCallback(() => {
    const glowCanvas = glowCanvasRef.current;
    if (!glowCanvas) return;
    const layout = glowLayoutRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = glowCanvas.clientWidth || layout?.width || 720;
    const height = glowCanvas.clientHeight || layout?.height || 116;
    if (
      glowCanvas.width !== Math.round(width * dpr) ||
      glowCanvas.height !== Math.round(height * dpr)
    ) {
      glowCanvas.width = Math.round(width * dpr);
      glowCanvas.height = Math.round(height * dpr);
    }
    const gCtx = glowCanvas.getContext('2d');
    if (!gCtx) return;

    gCtx.save();
    gCtx.scale(dpr, dpr);
    gCtx.clearRect(0, 0, width, height);

    if (!layout || !layout.showBeatGrid) {
      gCtx.restore();
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = masterBeatClockRef?.current ?? { phase: 0, beatIndex: 0 };
    const pulse = reducedMotion ? 0.28 : computeMasterBeatGlowPulse(clock.phase);
    const downbeatAccent = clock.beatIndex === 0 ? 1.2 : 1;

    gCtx.beginPath();
    gCtx.rect(1, 1, Math.max(0, width - 2), Math.max(0, height - 2));
    gCtx.clip();

    const toX = (t: number) => ((t - layout.winStart) / layout.winSpan) * width;
    const beatSecA = 60 / Math.max(40, getEffectiveBpm(layout.deckA));
    const visibleBeatsA: Array<{ t: number; isDown: boolean }> = [];

    for (const pt of gridA) {
      if (
        pt.timeSec < layout.winStart - beatSecA ||
        pt.timeSec > Math.min(layout.winEnd, layout.plan.deckAEndSec)
      ) {
        continue;
      }
      if (pt.timeSec >= layout.winStart && pt.timeSec <= Math.min(layout.winEnd, layout.plan.deckAEndSec)) {
        visibleBeatsA.push({ t: pt.timeSec, isDown: pt.isDownbeat });
        const bx = toX(pt.timeSec);
        drawPulsingBeatGridGlow(
          gCtx,
          bx,
          pt.isDownbeat ? 15 : 20,
          height * 0.34,
          pt.isDownbeat ? '253, 224, 71' : '103, 232, 249',
          pt.isDownbeat ? '250, 204, 21' : '34, 211, 238',
          pulse,
          pt.isDownbeat,
          pt.isDownbeat ? downbeatAccent : 0.9
        );
      }
    }

    const beatSecBTimeline =
      60 / Math.max(40, getEffectiveBpm(layout.deckB)) / Math.max(0.5, layout.plan.deckBPlaybackRate);
    for (const pt of gridB) {
      if (pt.timeSec < layout.plan.deckBInTime - 0.02) continue;
      const tlB =
        layout.plan.deckBTimelineStartSec +
        (pt.timeSec - layout.plan.deckBInTime) / Math.max(0.5, layout.plan.deckBPlaybackRate);
      if (tlB < layout.winStart - beatSecBTimeline || tlB > layout.winEnd) continue;
      if (tlB >= layout.winStart && tlB <= layout.winEnd) {
        const bx = toX(tlB);
        let isAligned = false;
        if (
          tlB >= layout.plan.transitionStartSec - 0.05 &&
          tlB <= layout.plan.transitionEndSec + 0.05 &&
          visibleBeatsA.length > 0
        ) {
          let bestDist = Infinity;
          for (const ba of visibleBeatsA) {
            const d = Math.abs(ba.t - tlB);
            if (d < bestDist) bestDist = d;
          }
          isAligned = bestDist <= 0.012;
        }

        drawPulsingBeatGridGlow(
          gCtx,
          bx,
          height * 0.52,
          height * 0.46,
          isAligned
            ? '110, 231, 183'
            : pt.isDownbeat
              ? '252, 211, 77'
              : '253, 186, 116',
          isAligned
            ? '52, 211, 153'
            : pt.isDownbeat
              ? '251, 191, 36'
              : '245, 158, 11',
          pulse,
          pt.isDownbeat || isAligned,
          isAligned ? 1.25 : pt.isDownbeat ? downbeatAccent : 0.9
        );

        if (isAligned) {
          const midY = height * 0.5;
          const r = 3 + pulse * 3;
          const rad = gCtx.createRadialGradient(bx, midY, 0, bx, midY, r * 2);
          rad.addColorStop(0, `rgba(110, 231, 183, ${(0.55 * pulse).toFixed(3)})`);
          rad.addColorStop(1, 'rgba(52, 211, 153, 0)');
          gCtx.fillStyle = rad;
          gCtx.beginPath();
          gCtx.arc(bx, midY, r * 2, 0, Math.PI * 2);
          gCtx.fill();
        }
      }
    }

    gCtx.restore();
  }, [gridA, gridB, masterBeatClockRef]);

  useEffect(() => {
    drawGlowOverlay();
  }, [drawGlowOverlay, deckA, deckB, plan, showBeatGrid, beatGridSubdivision, windowBounds]);

  useEffect(() => {
    if (!registerBeatPulseDraw) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    return registerBeatPulseDraw(drawGlowOverlay);
  }, [drawGlowOverlay, registerBeatPulseDraw]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        onClick={(e) => {
          if (!deckA || !deckB || !plan) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
          const t = windowBounds.start + frac * (windowBounds.end - windowBounds.start);
          onSeekTimeline(Math.max(0, Math.min(plan.totalDurationSec, t)));
        }}
        title={plan ? 'Click anywhere along the overlap timeline to seek & audition' : undefined}
        className="w-full h-28 rounded-lg border border-white/[0.08] cursor-pointer block"
      />
      <canvas
        ref={glowCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full rounded-lg"
      />
    </div>
  );
}

interface BeatGridPhaseAlignmentCanvasProps {
  deckA: DjTrackAsset | null;
  deckB: DjTrackAsset | null;
  timeA: number;
  timeB: number;
  rateA: number;
  rateB: number;
  showBeatGrid: boolean;
  beatGridSubdivision: 1 | 2 | 4;
  phaseComparison: BeatMatchPhaseComparison | null;
  masterBeatClockRef?: { current: MasterBeatClockState };
  registerBeatPulseDraw?: (fn: () => void) => () => void;
  onDragSlipDeckBMs: (deltaMs: number) => void;
}

function BeatGridPhaseAlignmentCanvas({
  deckA,
  deckB,
  timeA,
  timeB,
  rateA,
  rateB,
  showBeatGrid,
  beatGridSubdivision,
  phaseComparison,
  masterBeatClockRef,
  registerBeatPulseDraw,
  onDragSlipDeckBMs,
}: BeatGridPhaseAlignmentCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowLayoutRef = useRef<{
    width: number;
    height: number;
    deckA: DjTrackAsset;
    deckB: DjTrackAsset;
    timeA: number;
    timeB: number;
    safeRateA: number;
    safeRateB: number;
    realHalfWinSec: number;
    showBeatGrid: boolean;
    beatGridSubdivision: 1 | 2 | 4;
    phaseComparison: BeatMatchPhaseComparison | null;
  } | null>(null);
  const dragLastXRef = useRef<number | null>(null);

  const gridA = useMemo(() => (deckA ? getEffectiveBeatGridPoints(deckA) : []), [deckA]);
  const gridB = useMemo(() => (deckB ? getEffectiveBeatGridPoints(deckB) : []), [deckB]);

  const realHalfWinSec = useMemo(() => {
    const effBpmA = deckA ? getEffectiveBpm(deckA) * Math.max(0.5, rateA) : 120;
    return 4 * (60 / Math.max(40, effBpmA));
  }, [deckA, rateA]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = canvas.clientWidth || 720;
    const height = canvas.clientHeight || 144;
    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, width, height);

    if (!deckA || !deckB) {
      ctx.fillStyle = 'rgba(148, 163, 184, 0.42)';
      ctx.font = '11px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'Load Deck A and Deck B to inspect dual zoomed beat grids & beat-match phase alignment',
        width * 0.5,
        height * 0.5
      );
      ctx.restore();
      return;
    }

    const safeRateA = Math.max(0.5, rateA);
    const safeRateB = Math.max(0.5, rateB);
    const winStartA = timeA - realHalfWinSec * safeRateA;
    const winEndA = timeA + realHalfWinSec * safeRateA;
    const winStartB = timeB - realHalfWinSec * safeRateB;
    const winEndB = timeB + realHalfWinSec * safeRateB;

    const toXA = (sourceT: number) =>
      width * 0.5 + (((sourceT - timeA) / safeRateA) / realHalfWinSec) * (width * 0.5);
    const toXB = (sourceT: number) =>
      width * 0.5 + (((sourceT - timeB) / safeRateB) / realHalfWinSec) * (width * 0.5);

    const laneAH = 62;
    const midStripY = 62;
    const midStripH = 20;
    const laneBY = 82;
    const laneBH = 62;

    // Subtle lane backgrounds
    ctx.fillStyle = 'rgba(34, 211, 238, 0.03)';
    ctx.fillRect(0, 0, width, laneAH);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(0, midStripY, width, midStripH);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.03)';
    ctx.fillRect(0, laneBY, width, laneBH);

    // 1. High-resolution Zoomed Waveforms (Deck A top, Deck B bottom)
    const bars = 136;
    const slotW = width / bars;
    const peaksA = extractTriBandWindowPeaks(deckA.audioBuffer, winStartA, winEndA, bars);
    const peaksB = extractTriBandWindowPeaks(deckB.audioBuffer, winStartB, winEndB, bars);

    const midYA = laneAH * 0.56;
    for (let i = 0; i < bars; i++) {
      const t = winStartA + (i / (bars - 1)) * (winEndA - winStartA);
      if (t < 0 || t > deckA.duration) continue;
      const x = i * slotW;
      const bw = Math.max(1.5, slotW - 0.8);
      const lowH = Math.max(1.5, peaksA.low[i] * (laneAH * 0.36));
      const midH = Math.max(1, peaksA.mid[i] * (laneAH * 0.25));
      ctx.fillStyle = t <= timeA ? 'rgba(34, 211, 238, 0.86)' : 'rgba(56, 189, 248, 0.44)';
      ctx.fillRect(x, midYA - lowH, bw, lowH * 1.55);
      ctx.fillStyle = t <= timeA ? 'rgba(226, 232, 240, 0.45)' : 'rgba(165, 243, 252, 0.24)';
      ctx.fillRect(x, midYA - midH * 0.7, bw, midH);
    }

    const midYB = laneBY + laneBH * 0.48;
    for (let i = 0; i < bars; i++) {
      const t = winStartB + (i / (bars - 1)) * (winEndB - winStartB);
      if (t < 0 || t > deckB.duration) continue;
      const x = i * slotW;
      const bw = Math.max(1.5, slotW - 0.8);
      const lowH = Math.max(1.5, peaksB.low[i] * (laneBH * 0.36));
      const midH = Math.max(1, peaksB.mid[i] * (laneBH * 0.25));
      ctx.fillStyle = t <= timeB ? 'rgba(245, 158, 11, 0.88)' : 'rgba(251, 191, 36, 0.44)';
      ctx.fillRect(x, midYB - lowH * 0.65, bw, lowH * 1.5);
      ctx.fillStyle = t <= timeB ? 'rgba(254, 243, 199, 0.45)' : 'rgba(253, 230, 138, 0.24)';
      ctx.fillRect(x, midYB - midH * 0.5, bw, midH);
    }

    // 2. Visual Beat Grid Overlays & Phase Bridges
    const beatPointsA: Array<{ x: number; isDown: boolean }> = [];
    const beatPointsB: Array<{ x: number; isDown: boolean }> = [];

    if (showBeatGrid) {
      const rawBeatSecA = 60 / Math.max(40, getEffectiveBpm(deckA));
      for (const pt of gridA) {
        if (pt.timeSec < winStartA - rawBeatSecA || pt.timeSec > winEndA + rawBeatSecA) continue;
        if (beatGridSubdivision > 1) {
          for (let sub = 1; sub < beatGridSubdivision; sub++) {
            const subT = pt.timeSec + (sub / beatGridSubdivision) * rawBeatSecA;
            if (subT < winStartA || subT > winEndA || subT > deckA.duration) continue;
            const sx = toXA(subT);
            ctx.fillStyle =
              beatGridSubdivision === 4 && sub % 2 === 1
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(34, 211, 238, 0.16)';
            ctx.fillRect(sx, 14, 1, laneAH - 14);
          }
        }
        if (pt.timeSec >= winStartA && pt.timeSec <= winEndA) {
          const x = toXA(pt.timeSec);
          beatPointsA.push({ x, isDown: pt.isDownbeat });
          ctx.fillStyle = pt.isDownbeat ? 'rgba(250, 204, 21, 0.92)' : 'rgba(34, 211, 238, 0.52)';
          ctx.fillRect(x - (pt.isDownbeat ? 0.75 : 0.5), 0, pt.isDownbeat ? 1.75 : 1, laneAH + 6);
          ctx.fillStyle = pt.isDownbeat ? '#fde047' : 'rgba(165, 243, 252, 0.72)';
          ctx.font = pt.isDownbeat
            ? 'bold 9px "JetBrains Mono", monospace'
            : '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`${pt.barNumber}.${pt.beatInBar}`, Math.min(width - 24, x + 3), 2);
        }
      }

      const rawBeatSecB = 60 / Math.max(40, getEffectiveBpm(deckB));
      for (const pt of gridB) {
        if (pt.timeSec < winStartB - rawBeatSecB || pt.timeSec > winEndB + rawBeatSecB) continue;
        if (beatGridSubdivision > 1) {
          for (let sub = 1; sub < beatGridSubdivision; sub++) {
            const subT = pt.timeSec + (sub / beatGridSubdivision) * rawBeatSecB;
            if (subT < winStartB || subT > winEndB || subT > deckB.duration) continue;
            const sx = toXB(subT);
            ctx.fillStyle =
              beatGridSubdivision === 4 && sub % 2 === 1
                ? 'rgba(255, 255, 255, 0.08)'
                : 'rgba(245, 158, 11, 0.16)';
            ctx.fillRect(sx, laneBY, 1, laneBH - 14);
          }
        }
        if (pt.timeSec >= winStartB && pt.timeSec <= winEndB) {
          const x = toXB(pt.timeSec);
          beatPointsB.push({ x, isDown: pt.isDownbeat });
          ctx.fillStyle = pt.isDownbeat ? 'rgba(251, 191, 36, 0.95)' : 'rgba(245, 158, 11, 0.56)';
          ctx.fillRect(x - (pt.isDownbeat ? 0.75 : 0.5), laneBY - 6, pt.isDownbeat ? 1.75 : 1, laneBH + 6);
          ctx.fillStyle = pt.isDownbeat ? '#fcd34d' : 'rgba(253, 230, 138, 0.72)';
          ctx.font = pt.isDownbeat
            ? 'bold 9px "JetBrains Mono", monospace'
            : '8px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${pt.barNumber}.${pt.beatInBar}`, Math.min(width - 24, x + 3), height - 2);
        }
      }

      // Draw Center Strip Phase Alignment Bridges connecting A beats to nearest B beats
      const bridgeColor =
        phaseComparison?.status === 'locked'
          ? 'rgba(52, 211, 153, 0.92)'
          : phaseComparison?.status === 'drifting'
            ? 'rgba(251, 191, 36, 0.92)'
            : 'rgba(251, 113, 133, 0.92)';

      for (const ba of beatPointsA) {
        if (beatPointsB.length === 0) break;
        let nearestB = beatPointsB[0];
        let minDx = Infinity;
        for (const bb of beatPointsB) {
          const d = Math.abs(bb.x - ba.x);
          if (d < minDx) {
            minDx = d;
            nearestB = bb;
          }
        }
        if (minDx > width * 0.16) continue;
        ctx.strokeStyle = minDx <= 4 ? 'rgba(52, 211, 153, 0.9)' : bridgeColor;
        ctx.lineWidth = ba.isDown || nearestB.isDown ? 2 : 1.25;
        ctx.beginPath();
        ctx.moveTo(ba.x, midStripY);
        ctx.lineTo(ba.x, midStripY + 6);
        ctx.lineTo(nearestB.x, midStripY + midStripH - 6);
        ctx.lineTo(nearestB.x, midStripY + midStripH);
        ctx.stroke();
      }
    }

    // Lane edge dividers
    ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.fillRect(0, midStripY, width, 1);
    ctx.fillRect(0, laneBY, width, 1);

    // Center Strip Labels
    ctx.fillStyle = 'rgba(9, 11, 16, 0.82)';
    ctx.fillRect(6, 16, 46, 13);
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('DECK A', 10, 22.5);

    ctx.fillStyle = 'rgba(9, 11, 16, 0.82)';
    ctx.fillRect(6, laneBY + 4, 46, 13);
    ctx.fillStyle = '#f59e0b';
    ctx.fillText('DECK B', 10, laneBY + 10.5);

    // Center Phase Anchor Reticle (0.0 ms)
    const cx = width * 0.5;
    const lockColor =
      phaseComparison?.status === 'locked'
        ? '#34d399'
        : phaseComparison?.status === 'drifting'
          ? '#fbbf24'
          : '#ffffff';
    ctx.fillStyle = lockColor;
    ctx.fillRect(cx - 1, 0, 2, height);

    ctx.fillStyle = 'rgba(9, 11, 16, 0.92)';
    ctx.fillRect(cx - 28, midStripY + 2, 56, midStripH - 4);
    ctx.strokeStyle = lockColor;
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - 28, midStripY + 2, 56, midStripH - 4);
    ctx.fillStyle = lockColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 8px "JetBrains Mono", monospace';
    ctx.fillText(
      phaseComparison
        ? `${phaseComparison.phaseOffsetMs >= 0 ? '+' : ''}${phaseComparison.phaseOffsetMs.toFixed(0)}ms`
        : '0ms',
      cx,
      midStripY + midStripH * 0.5
    );

    glowLayoutRef.current = {
      width,
      height,
      deckA,
      deckB,
      timeA,
      timeB,
      safeRateA,
      safeRateB,
      realHalfWinSec,
      showBeatGrid,
      beatGridSubdivision,
      phaseComparison,
    };

    ctx.restore();
  }, [
    deckA,
    deckB,
    timeA,
    timeB,
    rateA,
    rateB,
    showBeatGrid,
    beatGridSubdivision,
    phaseComparison,
    gridA,
    gridB,
    realHalfWinSec,
  ]);

  const drawGlowOverlay = useCallback(() => {
    const glowCanvas = glowCanvasRef.current;
    if (!glowCanvas) return;
    const layout = glowLayoutRef.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = glowCanvas.clientWidth || layout?.width || 720;
    const height = glowCanvas.clientHeight || layout?.height || 144;
    if (
      glowCanvas.width !== Math.round(width * dpr) ||
      glowCanvas.height !== Math.round(height * dpr)
    ) {
      glowCanvas.width = Math.round(width * dpr);
      glowCanvas.height = Math.round(height * dpr);
    }
    const gCtx = glowCanvas.getContext('2d');
    if (!gCtx) return;

    gCtx.save();
    gCtx.scale(dpr, dpr);
    gCtx.clearRect(0, 0, width, height);

    if (!layout || !layout.showBeatGrid) {
      gCtx.restore();
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clock = masterBeatClockRef?.current ?? { phase: 0, beatIndex: 0 };
    const pulse = reducedMotion ? 0.28 : computeMasterBeatGlowPulse(clock.phase);
    const downbeatAccent = clock.beatIndex === 0 ? 1.2 : 1;

    gCtx.beginPath();
    gCtx.rect(1, 1, Math.max(0, width - 2), Math.max(0, height - 2));
    gCtx.clip();

    const laneAH = 62;
    const midStripY = 62;
    const midStripH = 20;
    const laneBY = 82;
    const laneBH = 62;

    const winStartA = layout.timeA - layout.realHalfWinSec * layout.safeRateA;
    const winEndA = layout.timeA + layout.realHalfWinSec * layout.safeRateA;
    const winStartB = layout.timeB - layout.realHalfWinSec * layout.safeRateB;
    const winEndB = layout.timeB + layout.realHalfWinSec * layout.safeRateB;

    const toXA = (sourceT: number) =>
      width * 0.5 +
      (((sourceT - layout.timeA) / layout.safeRateA) / layout.realHalfWinSec) * (width * 0.5);
    const toXB = (sourceT: number) =>
      width * 0.5 +
      (((sourceT - layout.timeB) / layout.safeRateB) / layout.realHalfWinSec) * (width * 0.5);

    const rawBeatSecA = 60 / Math.max(40, getEffectiveBpm(layout.deckA));
    const beatPointsA: Array<{ x: number; isDown: boolean }> = [];
    for (const pt of gridA) {
      if (pt.timeSec < winStartA - rawBeatSecA || pt.timeSec > winEndA + rawBeatSecA) continue;
      if (layout.beatGridSubdivision > 1) {
        for (let sub = 1; sub < layout.beatGridSubdivision; sub++) {
          const subT = pt.timeSec + (sub / layout.beatGridSubdivision) * rawBeatSecA;
          if (subT < winStartA || subT > winEndA || subT > layout.deckA.duration) continue;
          drawPulsingBeatGridGlow(
            gCtx,
            toXA(subT),
            14,
            laneAH - 14,
            '103, 232, 249',
            '34, 211, 238',
            pulse,
            false,
            0.34
          );
        }
      }
      if (pt.timeSec >= winStartA && pt.timeSec <= winEndA) {
        const x = toXA(pt.timeSec);
        beatPointsA.push({ x, isDown: pt.isDownbeat });
        drawPulsingBeatGridGlow(
          gCtx,
          x,
          0,
          laneAH + 6,
          pt.isDownbeat ? '253, 224, 71' : '103, 232, 249',
          pt.isDownbeat ? '250, 204, 21' : '34, 211, 238',
          pulse,
          pt.isDownbeat,
          pt.isDownbeat ? downbeatAccent : 1
        );
      }
    }

    const rawBeatSecB = 60 / Math.max(40, getEffectiveBpm(layout.deckB));
    const beatPointsB: Array<{ x: number; isDown: boolean }> = [];
    for (const pt of gridB) {
      if (pt.timeSec < winStartB - rawBeatSecB || pt.timeSec > winEndB + rawBeatSecB) continue;
      if (layout.beatGridSubdivision > 1) {
        for (let sub = 1; sub < layout.beatGridSubdivision; sub++) {
          const subT = pt.timeSec + (sub / layout.beatGridSubdivision) * rawBeatSecB;
          if (subT < winStartB || subT > winEndB || subT > layout.deckB.duration) continue;
          drawPulsingBeatGridGlow(
            gCtx,
            toXB(subT),
            laneBY,
            laneBH - 14,
            '253, 186, 116',
            '245, 158, 11',
            pulse,
            false,
            0.34
          );
        }
      }
      if (pt.timeSec >= winStartB && pt.timeSec <= winEndB) {
        const x = toXB(pt.timeSec);
        beatPointsB.push({ x, isDown: pt.isDownbeat });
        let isNearAligned = false;
        for (const ba of beatPointsA) {
          if (Math.abs(ba.x - x) <= 4) {
            isNearAligned = true;
            break;
          }
        }
        drawPulsingBeatGridGlow(
          gCtx,
          x,
          laneBY - 6,
          laneBH + 6,
          isNearAligned
            ? '110, 231, 183'
            : pt.isDownbeat
              ? '252, 211, 77'
              : '253, 186, 116',
          isNearAligned
            ? '52, 211, 153'
            : pt.isDownbeat
              ? '251, 191, 36'
              : '245, 158, 11',
          pulse,
          pt.isDownbeat || isNearAligned,
          isNearAligned ? 1.25 : pt.isDownbeat ? downbeatAccent : 1
        );
      }
    }

    // Subtle beat-synced phase lock pulse along center reticle when locked or drifting closely
    if (layout.phaseComparison?.status === 'locked') {
      drawPulsingBeatGridGlow(
        gCtx,
        width * 0.5,
        0,
        height,
        '110, 231, 183',
        '52, 211, 153',
        pulse,
        true,
        0.78
      );
    } else if (beatPointsB.length > 0 && beatPointsA.length > 0) {
      // Pulse emerald on any aligned pair bridge inside the center strip
      for (const ba of beatPointsA) {
        let nearestB = beatPointsB[0];
        let minDx = Infinity;
        for (const bb of beatPointsB) {
          const d = Math.abs(bb.x - ba.x);
          if (d < minDx) {
            minDx = d;
            nearestB = bb;
          }
        }
        if (minDx <= 4) {
          drawPulsingBeatGridGlow(
            gCtx,
            (ba.x + nearestB.x) * 0.5,
            midStripY,
            midStripH,
            '110, 231, 183',
            '52, 211, 153',
            pulse,
            true,
            0.9
          );
        }
      }
    }

    gCtx.restore();
  }, [gridA, gridB, masterBeatClockRef]);

  useEffect(() => {
    drawGlowOverlay();
  }, [
    drawGlowOverlay,
    deckA,
    deckB,
    timeA,
    timeB,
    rateA,
    rateB,
    showBeatGrid,
    beatGridSubdivision,
    phaseComparison,
  ]);

  useEffect(() => {
    if (!registerBeatPulseDraw) return;
    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return;
    return registerBeatPulseDraw(drawGlowOverlay);
  }, [drawGlowOverlay, registerBeatPulseDraw]);

  return (
    <div className="relative w-full">
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => {
          if (!deckA || !deckB) return;
          dragLastXRef.current = e.clientX;
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (dragLastXRef.current === null || !deckA || !deckB) return;
          const dx = e.clientX - dragLastXRef.current;
          dragLastXRef.current = e.clientX;
          if (Math.abs(dx) < 0.25) return;
          const width = e.currentTarget.clientWidth || 720;
          const deltaSourceSec =
            -(dx / Math.max(100, width)) * (2 * realHalfWinSec * Math.max(0.5, rateB));
          onDragSlipDeckBMs(deltaSourceSec * 1000);
        }}
        onPointerUp={(e) => {
          dragLastXRef.current = null;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragLastXRef.current = null;
        }}
        title={
          deckA && deckB
            ? 'Drag horizontally to micro-align Deck B waveform & beat grid against Deck A'
            : undefined
        }
        className="w-full h-36 rounded-lg border border-white/[0.08] cursor-ew-resize block touch-none select-none"
      />
      <canvas
        ref={glowCanvasRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full rounded-lg"
      />
    </div>
  );
}

export function DjStudioModal({
  isOpen,
  currentAudioBuffer,
  currentAudioFileName,
  currentLyrics,
  ensureAudioContext,
  isExporting,
  onClose,
  onApplyDjMix,
  activeTab,
  onTabChange,
  settings,
  onUpdateSettings,
  onLyricsChange,
  bgImage,
  bgImageName,
  onBgImageSelect,
  albumImage,
  albumImageName,
  onAlbumImageSelect,
  onCopyBgToAlbum,
  onCopyAlbumToBg,
  onDownloadCoverThumbnail,
  onSetProjectThumbnailFromCover,
  savedPresets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onImportPresetFile,
  onDownloadSnapshot,
  isGeneratingCaptions,
  captionsNotice,
  onDismissCaptionsNotice,
  onAutoGenerateCaptions,
  onAutoArrange,
  autoArrangeNotice,
  midiMappingBadges,
  onOpenMidiMapping,
  mocapClip,
  onMocapFileSelect,
  onClearMocapClip,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCaptureProjectSnapshot,
  onOpenProjects,
  onOpenMixStudio,
  mixClipCount = 0,
}: DjStudioModalProps) {
  const [crate, setCrate] = useState<DjTrackAsset[]>([]);
  const [deckATrackId, setDeckATrackId] = useState<string | null>(null);
  const [deckBTrackId, setDeckBTrackId] = useState<string | null>(null);

  const [triggerMode, setTriggerMode] = useState<DjMixTriggerMode>('beats');
  const [transitionStyle, setTransitionStyle] = useState<DjTransitionStyle>('bass-swap');
  const [videoMixStyle, setVideoMixStyle] = useState<DjVideoMixStyle>('crossfade');
  const [videoBlendMode, setVideoBlendMode] = useState<MixVideoBlendMode>('normal');
  const [videoLayerOpacity, setVideoLayerOpacity] = useState(1);
  const [crossfadeBeats, setCrossfadeBeats] = useState<4 | 8 | 16 | 32>(8);
  const [beatMatchTempo, setBeatMatchTempo] = useState(true);
  const [alignPhaseToBeat, setAlignPhaseToBeat] = useState(true);
  const [normalizeMixAudio, setNormalizeMixAudio] = useState(true);
  const [showDjHudOnStage, setShowDjHudOnStage] = useState(true);
  const [stageView, setStageView] = useState<'console' | 'stage-split'>('stage-split');
  const [mobilePane, setMobilePane] = useState<'dj' | 'studio'>('dj');
  const [showStudioSidebar, setShowStudioSidebar] = useState(true);
  const [crossfadeZoomMode, setCrossfadeZoomMode] = useState<'zoom' | 'full'>('zoom');
  const [activeBpmPreset, setActiveBpmPreset] = useState<DjBpmTimingPreset | null>(null);
  const [showBeatGridOverlay, setShowBeatGridOverlay] = useState(true);
  const [beatGridSubdivision, setBeatGridSubdivision] = useState<1 | 2 | 4>(2);
  const [spectrogramMode, setSpectrogramMode] = useState<DjSpectrogramMode>('overlay');
  const [deckAWaveformView, setDeckAWaveformView] = useState<'overview' | 'zoom'>('overview');
  const [deckBWaveformView, setDeckBWaveformView] = useState<'overview' | 'zoom'>('overview');
  const [deckAWaveformZoomPct, setDeckAWaveformZoomPct] = useState(0); // 0 = full overview, 1..100 = granular transient zoom
  const [deckBWaveformZoomPct, setDeckBWaveformZoomPct] = useState(0);
  const [deckATransientSeek, setDeckATransientSeek] = useState(false);
  const [deckBTransientSeek, setDeckBTransientSeek] = useState(false);
  const [syncToBeatGrid, setSyncToBeatGrid] = useState(true);
  const [deckANudgeMs, setDeckANudgeMs] = useState(0);
  const [deckBNudgeMs, setDeckBNudgeMs] = useState(0);
  const [deckANudgeFlash, setDeckANudgeFlash] = useState<{ deltaMs: number; nonce: number } | null>(null);
  const [deckBNudgeFlash, setDeckBNudgeFlash] = useState<{ deltaMs: number; nonce: number } | null>(null);
  const [deckAGridEditorOpen, setDeckAGridEditorOpen] = useState(false);
  const [deckBGridEditorOpen, setDeckBGridEditorOpen] = useState(false);
  const [phaseAlignScopeMode, setPhaseAlignScopeMode] = useState<'overlap' | 'live'>('overlap');
  const [showPhaseScope, setShowPhaseScope] = useState(true);

  // Per-deck cues & EQ state
  const [deckAOutTime, setDeckAOutTime] = useState<number | null>(null);
  const [deckBInTime, setDeckBInTime] = useState<number | null>(null);
  const [deckAOutLyricId, setDeckAOutLyricId] = useState<string | null>(null);
  const [deckBInLyricId, setDeckBInLyricId] = useState<string | null>(null);

  const [eqA, setEqA] = useState<DjDeckEqSettings>({ ...DEFAULT_DECK_EQ });
  const [eqB, setEqB] = useState<DjDeckEqSettings>({ ...DEFAULT_DECK_EQ });
  const [eqAAutoXover, setEqAAutoXover] = useState(true);
  const [eqBAutoXover, setEqBAutoXover] = useState(true);
  const [crossfader, setCrossfader] = useState(0); // -1 Deck A, 0 center, +1 Deck B
  const [masterVolume, setMasterVolume] = useState(0.9);
  const [isMasterMuted, setIsMasterMuted] = useState(false);

  // Live deck play state (Manual DJ mode)
  const [deckAPlaying, setDeckAPlaying] = useState(false);
  const [deckBPlaying, setDeckBPlaying] = useState(false);
  const [deckATime, setDeckATime] = useState(0);
  const [deckBTime, setDeckBTime] = useState(0);
  const [deckALoopBeats, setDeckALoopBeats] = useState<0 | 4 | 8>(0);
  const [deckBLoopBeats, setDeckBLoopBeats] = useState<0 | 4 | 8>(0);
  const [deckAPitchPct, setDeckAPitchPct] = useState(0); // -16 to +16
  const [deckBPitchPct, setDeckBPitchPct] = useState(0);

  // Analog Vinyl Scratch state per deck
  const [deckAScratchEnabled, setDeckAScratchEnabled] = useState(true);
  const [deckBScratchEnabled, setDeckBScratchEnabled] = useState(true);
  const [deckASlipMode, setDeckASlipMode] = useState(false);
  const [deckBSlipMode, setDeckBSlipMode] = useState(false);
  const [scratchSensitivitySec, setScratchSensitivitySec] = useState<number>(1.8);
  const [deckAScratching, setDeckAScratching] = useState(false);
  const [deckBScratching, setDeckBScratching] = useState(false);
  const [deckAScratchRate, setDeckAScratchRate] = useState<number | null>(null);
  const [deckBScratchRate, setDeckBScratchRate] = useState<number | null>(null);

  // Auto-Mix Rendered Set playback & Trim state
  const [renderedSchedule, setRenderedSchedule] = useState<DjScheduleRenderPlan | null>(null);
  const [renderedMixBuffer, setRenderedMixBuffer] = useState<AudioBuffer | null>(null);
  const [renderedPeaks, setRenderedPeaks] = useState<number[]>([]);
  const [isAutoSetPlaying, setIsAutoSetPlaying] = useState(false);
  const [autoSetTime, setAutoSetTime] = useState(0);
  const [loopAutoSet, setLoopAutoSet] = useState(false);
  const [djTrimStart, setDjTrimStart] = useState(0);
  const [djTrimEnd, setDjTrimEnd] = useState(0);

  // Busy & Notice states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRenderingSet, setIsRenderingSet] = useState(false);
  const [isApplyingMix, setIsApplyingMix] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);

  // Lyric paste modal / inline editor drawer per deck
  const [lyricDrawerDeck, setLyricDrawerDeck] = useState<'A' | 'B' | null>(null);
  const [lyricDraftText, setLyricDraftText] = useState('');

  // Cue Point Manager state
  const [cueManagerDeck, setCueManagerDeck] = useState<'A' | 'B'>('A');
  const [cueDraftLabel, setCueDraftLabel] = useState('Drop');
  const [cueDraftTimeText, setCueDraftTimeText] = useState('0:00.0');
  const [cueDraftColor, setCueDraftColor] = useState('#fb7185');
  const [cueSnapToBeat, setCueSnapToBeat] = useState(true);
  const [cueAutoPlayOnJump, setCueAutoPlayOnJump] = useState(true);
  const [editingCueId, setEditingCueId] = useState<string | null>(null);
  const [editingCueLabel, setEditingCueLabel] = useState('');

  // Loop Deck state (Capture live playing section & loop indefinitely with beat-synced length)
  const [loopDeckBeats, setLoopDeckBeats] = useState<LoopBeatLength>(2);
  const [loopDeckSourceMode, setLoopDeckSourceMode] = useState<'auto' | 'A' | 'B' | 'set'>('auto');
  const [loopDeckPlaying, setLoopDeckPlaying] = useState(false);
  const [loopDeckVolume, setLoopDeckVolume] = useState(0.95);
  const [loopDeckFilterSweep, setLoopDeckFilterSweep] = useState(0);
  const [loopDeckQuantize, setLoopDeckQuantize] = useState(true);
  const [capturedLoop, setCapturedLoop] = useState<CapturedLoopData | null>(null);

  // Master BPM-Synced Filter & FX Rack state
  const [fxBpmSyncEnabled, setFxBpmSyncEnabled] = useState(true);
  const [fxBypassed, setFxBypassed] = useState(false);
  const [fxFilterMode, setFxFilterMode] = useState<'lowpass' | 'highpass'>('lowpass');
  const [fxFilterLfoBeats, setFxFilterLfoBeats] = useState<FxFilterLfoDivision>(2);
  const [fxDelayBeats, setFxDelayBeats] = useState<FxDelayDivision>(0.5);
  const [fxManualDelayMs, setFxManualDelayMs] = useState(320);
  const [fxGateBeats, setFxGateBeats] = useState<FxGateDivision>(0.5);
  const [fxTransientFocus, setFxTransientFocus] = useState<TransientFocusMode>('full');

  // AI Auto-Mix Assistant (Energy Match transition suggestions + 5s waveform preview)
  const [aiAutoMixPreference, setAiAutoMixPreference] = useState<AutoMixPreference>('balanced');
  const [aiAutoMixLoading, setAiAutoMixLoading] = useState(false);
  const [aiAutoMixError, setAiAutoMixError] = useState<string | null>(null);
  const [aiAutoMixResult, setAiAutoMixResult] = useState<AiAutoMixAnalysisResult | null>(null);
  const [activeAiSuggestionId, setActiveAiSuggestionId] = useState<string | null>(null);
  const [aiTransitionPreview, setAiTransitionPreview] = useState<DjTransitionPreviewRender | null>(null);
  const [isPreviewRendering, setIsPreviewRendering] = useState(false);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewTimeSec, setPreviewTimeSec] = useState(0);
  const [previewLoop, setPreviewLoop] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Master Output Brick-Wall Limiter & Auto Peak-Gain state
  const [limiterEnabled, setLimiterEnabled] = useState(true);
  const [limiterAutoGainEnabled, setLimiterAutoGainEnabled] = useState(true);
  const [limiterCeilingDb, setLimiterCeilingDb] = useState<number>(-0.3);
  const [limiterReleaseSec, setLimiterReleaseSec] = useState<number>(0.08);
  const [limiterPeakResetNonce, setLimiterPeakResetNonce] = useState(0);

  // DJ Tap Tempo & Last-5 Session BPM Log state
  const [tapTempoBpm, setTapTempoBpm] = useState<number | null>(null);
  const [tapTempoCount, setTapTempoCount] = useState(0);
  const [tapPulseFlash, setTapPulseFlash] = useState(false);
  const [tapBpmHistory, setTapBpmHistory] = useState<DjTapBpmLogEntry[]>([]);

  // One-Shot BPM-Quantized Sampler Deck state
  const [samplerPads, setSamplerPads] = useState<SamplerPadData[]>(() =>
    createInitialSamplerPads()
  );
  const [samplerQuantize, setSamplerQuantize] = useState<SamplerQuantizeMode>(0.25);
  const [samplerMasterVolume, setSamplerMasterVolume] = useState(0.95);
  const [samplerChokeMode, setSamplerChokeMode] = useState(false);
  const [samplerRecordSource, setSamplerRecordSource] = useState<SamplerRecordSource>('mic');
  const [samplerRecordingPadId, setSamplerRecordingPadId] = useState<string | null>(null);
  const [samplerRecordElapsedSec, setSamplerRecordElapsedSec] = useState(0);
  const [samplerMicLevel, setSamplerMicLevel] = useState(0);
  const [samplerPadQueuedState, setSamplerPadQueuedState] = useState<Record<string, boolean>>({});
  const [samplerPadPlayingState, setSamplerPadPlayingState] = useState<Record<string, boolean>>({});
  const [editingSamplerPadId, setEditingSamplerPadId] = useState<string | null>(null);
  const [editingSamplerPadName, setEditingSamplerPadName] = useState('');
  const [samplerKeyTriggersEnabled, setSamplerKeyTriggersEnabled] = useState(true);

  const [showDeckVisualizers, setShowDeckVisualizers] = useState(true);
  const [deckVisualizerTintMode, setDeckVisualizerTintMode] = useState<'deck-accent' | 'studio'>(
    'deck-accent'
  );

  // DOM & WebAudio Refs
  const deckAInputRef = useRef<HTMLInputElement | null>(null);
  const deckBInputRef = useRef<HTMLInputElement | null>(null);
  const crateInputRef = useRef<HTMLInputElement | null>(null);
  const samplerPadInputRef = useRef<HTMLInputElement | null>(null);
  const samplerTargetUploadPadIdRef = useRef<string | null>(null);
  const sidebarAudioInputRef = useRef<HTMLInputElement | null>(null);
  const deckALyricInputRef = useRef<HTMLInputElement | null>(null);
  const deckBLyricInputRef = useRef<HTMLInputElement | null>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deckACanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deckBCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const deckALowBarRef = useRef<HTMLDivElement | null>(null);
  const deckAMidBarRef = useRef<HTMLDivElement | null>(null);
  const deckAHighBarRef = useRef<HTMLDivElement | null>(null);
  const deckAMonitorModeRef = useRef<HTMLSpanElement | null>(null);
  const deckABeatBurstTextRef = useRef<HTMLSpanElement | null>(null);
  const deckABeatBorderRef = useRef<HTMLDivElement | null>(null);
  const deckBLowBarRef = useRef<HTMLDivElement | null>(null);
  const deckBMidBarRef = useRef<HTMLDivElement | null>(null);
  const deckBHighBarRef = useRef<HTMLDivElement | null>(null);
  const deckBMonitorModeRef = useRef<HTMLSpanElement | null>(null);
  const deckBBeatBurstTextRef = useRef<HTMLSpanElement | null>(null);
  const deckBBeatBorderRef = useRef<HTMLDivElement | null>(null);
  const beatMeterBarRef = useRef<HTMLDivElement | null>(null);
  const loopPlayheadBarRef = useRef<HTMLDivElement | null>(null);
  const limiterPreBarRef = useRef<HTMLDivElement | null>(null);
  const limiterOutBarRef = useRef<HTMLDivElement | null>(null);
  const limiterGrBarRef = useRef<HTMLDivElement | null>(null);
  const limiterStackPeakTextRef = useRef<HTMLSpanElement | null>(null);
  const limiterAutoGainTextRef = useRef<HTMLSpanElement | null>(null);
  const limiterGrTextRef = useRef<HTMLSpanElement | null>(null);
  const limiterOutTextRef = useRef<HTMLSpanElement | null>(null);
  const limiterStatusBadgeRef = useRef<HTMLSpanElement | null>(null);
  const mixerLimiterLedBarRef = useRef<HTMLDivElement | null>(null);
  const mixerLimiterStatusRef = useRef<HTMLSpanElement | null>(null);
  const transientAttackBarRef = useRef<HTMLDivElement | null>(null);
  const transientSustainBarRef = useRef<HTMLDivElement | null>(null);
  const transientAttackTextRef = useRef<HTMLSpanElement | null>(null);
  const transientSustainTextRef = useRef<HTMLSpanElement | null>(null);
  const noiseGateBadgeRef = useRef<HTMLSpanElement | null>(null);
  const noiseGateGrBarRef = useRef<HTMLDivElement | null>(null);

  const sessionUrlsRef = useRef<Set<string>>(new Set());
  const fxRackRef = useRef<LiveMasterFxNodes | null>(null);
  const masterLimiterNodesRef = useRef<LiveMasterLimiterNodes | null>(null);
  const loudestStackPeakRef = useRef(0);
  const lastAutoTrimGainRef = useRef(1);
  const lastLimiterMeterUpdateMsRef = useRef(0);
  const limiterEnabledRef = useRef(limiterEnabled);
  limiterEnabledRef.current = limiterEnabled;
  const limiterAutoGainEnabledRef = useRef(limiterAutoGainEnabled);
  limiterAutoGainEnabledRef.current = limiterAutoGainEnabled;
  const limiterCeilingDbRef = useRef(limiterCeilingDb);
  limiterCeilingDbRef.current = limiterCeilingDb;
  const limiterReleaseSecRef = useRef(limiterReleaseSec);
  limiterReleaseSecRef.current = limiterReleaseSec;
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const beatAnalyserRef = useRef<AnalyserNode | null>(null);

  const deckAChainRef = useRef<LiveDeckAudioChain | null>(null);
  const deckBChainRef = useRef<LiveDeckAudioChain | null>(null);
  const loopDeckChainRef = useRef<LiveLoopDeckChain | null>(null);
  const loopDeckPlayingRef = useRef(false);
  loopDeckPlayingRef.current = loopDeckPlaying;
  const loopDeckBeatsRef = useRef(loopDeckBeats);
  loopDeckBeatsRef.current = loopDeckBeats;
  const autoSetSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const autoSetStartPerfRef = useRef(0);
  const autoSetStartOffsetRef = useRef(0);
  const autoSetVideoResolverRef = useRef<MixVideoFrameResolver | null>(null);
  const previewSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const previewStartPerfRef = useRef(0);
  const previewStartOffsetRef = useRef(0);
  const previewRenderSeqRef = useRef(0);
  const masterBeatClockRef = useRef<MasterBeatClockState>({ phase: 0, beatIndex: 0 });
  const beatGridGlowSubscribersRef = useRef<Set<() => void>>(new Set());
  const registerBeatPulseDraw = useCallback((fn: () => void) => {
    beatGridGlowSubscribersRef.current.add(fn);
    return () => {
      beatGridGlowSubscribersRef.current.delete(fn);
    };
  }, []);
  const offlineSetAnalyzerRef = useRef<OfflineAudioAnalyzer | null>(null);
  const deckAOfflineAnalyzerRef = useRef<OfflineAudioAnalyzer | null>(null);
  const deckBOfflineAnalyzerRef = useRef<OfflineAudioAnalyzer | null>(null);
  const deckAOfflineBeatTrackerRef = useRef<OfflineLowPassBeatTracker | null>(null);
  const deckBOfflineBeatTrackerRef = useRef<OfflineLowPassBeatTracker | null>(null);
  const tapSamplesRef = useRef<TapSample[]>([]);
  const tapResetTimerRef = useRef<number | null>(null);
  const tapPulseTimerRef = useRef<number | null>(null);
  const tapSequenceIdRef = useRef<string>('');
  const nudgeFlashTimerRef = useRef<{ A: number | null; B: number | null }>({ A: null, B: null });
  const samplerPadsRef = useRef<SamplerPadData[]>(samplerPads);
  samplerPadsRef.current = samplerPads;
  const samplerMasterVolumeRef = useRef(samplerMasterVolume);
  samplerMasterVolumeRef.current = samplerMasterVolume;
  const samplerActiveVoicesRef = useRef<
    { padId: string; source: AudioBufferSourceNode; gainNode: GainNode }[]
  >([]);
  const samplerTimersRef = useRef<number[]>([]);
  const samplerRecorderRef = useRef<MediaRecorder | null>(null);
  const samplerMicStreamRef = useRef<MediaStream | null>(null);
  const samplerRecordIntervalRef = useRef<number | null>(null);
  const samplerRecordAutoStopRef = useRef<number | null>(null);
  const samplerMicMeterRafRef = useRef<number | null>(null);
  const samplerMicMeterCleanupRef = useRef<(() => void) | null>(null);
  const samplerStarterLoadedRef = useRef(false);
  const masterStreamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  // Visualizer & canvas state refs
  const particlesRef = useRef<Particle[]>([]);
  const deckAParticlesRef = useRef<Particle[]>([]);
  const deckBParticlesRef = useRef<Particle[]>([]);
  const motionBlurRef = useRef<MotionBlurState>({ canvas: null, hasFrame: false });
  const sceneTransRef = useRef<SceneTransitionState>({
    activeMode: null,
    fromMode: null,
    elapsed: 0,
    duration: 0.45,
  });
  const deckASceneTransRef = useRef<SceneTransitionState>({
    activeMode: null,
    fromMode: null,
    elapsed: 0,
    duration: 0.45,
  });
  const deckBSceneTransRef = useRef<SceneTransitionState>({
    activeMode: null,
    fromMode: null,
    elapsed: 0,
    duration: 0.45,
  });
  const prevVisualizerModeRef = useRef(settings.visualizerMode);
  const beatStateRef = useRef<BeatState>(createInitialBeatState());
  const deckABeatStateRef = useRef<BeatState>(createInitialBeatState());
  const deckBBeatStateRef = useRef<BeatState>(createInitialBeatState());
  const albumRotRef = useRef<{ angle: number }>({ angle: 0 });
  const deckAAlbumRotRef = useRef<{ angle: number }>({ angle: 0 });
  const deckBAlbumRotRef = useRef<{ angle: number }>({ angle: 0 });
  const showDeckVisualizersRef = useRef(showDeckVisualizers);
  showDeckVisualizersRef.current = showDeckVisualizers;
  const deckVisualizerTintModeRef = useRef(deckVisualizerTintMode);
  deckVisualizerTintModeRef.current = deckVisualizerTintMode;

  const deckATrack = useMemo(
    () => crate.find((t) => t.id === deckATrackId) ?? null,
    [crate, deckATrackId]
  );
  const deckBTrack = useMemo(
    () => crate.find((t) => t.id === deckBTrackId) ?? null,
    [crate, deckBTrackId]
  );

  // Prepare per-deck offline spectral & beat trackers when tracks load (for Auto-Mix pre-fader monitoring)
  useEffect(() => {
    deckABeatStateRef.current = createInitialBeatState();
    deckAParticlesRef.current = [];
    if (!deckATrack?.audioBuffer) {
      deckAOfflineAnalyzerRef.current = null;
      deckAOfflineBeatTrackerRef.current = null;
      return;
    }
    deckAOfflineAnalyzerRef.current = new OfflineAudioAnalyzer(deckATrack.audioBuffer, 2048);
    deckAOfflineBeatTrackerRef.current = new OfflineLowPassBeatTracker(
      deckATrack.audioBuffer,
      140,
      1.2
    );
  }, [deckATrack]);

  useEffect(() => {
    deckBBeatStateRef.current = createInitialBeatState();
    deckBParticlesRef.current = [];
    if (!deckBTrack?.audioBuffer) {
      deckBOfflineAnalyzerRef.current = null;
      deckBOfflineBeatTrackerRef.current = null;
      return;
    }
    deckBOfflineAnalyzerRef.current = new OfflineAudioAnalyzer(deckBTrack.audioBuffer, 2048);
    deckBOfflineBeatTrackerRef.current = new OfflineLowPassBeatTracker(
      deckBTrack.audioBuffer,
      140,
      1.2
    );
  }, [deckBTrack]);

  // Keep reactive refs for 60fps animation loop
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const bgImageRef = useRef(bgImage);
  bgImageRef.current = bgImage;
  const albumImageRef = useRef(albumImage);
  albumImageRef.current = albumImage;
  const mocapClipRef = useRef(mocapClip);
  mocapClipRef.current = mocapClip;
  const deckATrackRef = useRef(deckATrack);
  deckATrackRef.current = deckATrack;
  const deckBTrackRef = useRef(deckBTrack);
  deckBTrackRef.current = deckBTrack;
  const isAutoSetPlayingRef = useRef(isAutoSetPlaying);
  isAutoSetPlayingRef.current = isAutoSetPlaying;
  const autoSetTimeRef = useRef(autoSetTime);
  autoSetTimeRef.current = autoSetTime;
  const renderedScheduleRef = useRef(renderedSchedule);
  renderedScheduleRef.current = renderedSchedule;
  const loopAutoSetRef = useRef(loopAutoSet);
  loopAutoSetRef.current = loopAutoSet;
  const aiTransitionPreviewRef = useRef(aiTransitionPreview);
  aiTransitionPreviewRef.current = aiTransitionPreview;
  const isPreviewPlayingRef = useRef(isPreviewPlaying);
  isPreviewPlayingRef.current = isPreviewPlaying;
  const previewLoopRef = useRef(previewLoop);
  previewLoopRef.current = previewLoop;
  const crossfaderRef = useRef(crossfader);
  crossfaderRef.current = crossfader;
  const deckAPlayingRef = useRef(deckAPlaying);
  deckAPlayingRef.current = deckAPlaying;
  const deckBPlayingRef = useRef(deckBPlaying);
  deckBPlayingRef.current = deckBPlaying;
  const deckATimeRef = useRef(deckATime);
  deckATimeRef.current = deckATime;
  const deckAPitchPctRef = useRef(deckAPitchPct);
  deckAPitchPctRef.current = deckAPitchPct;
  const deckBPitchPctRef = useRef(deckBPitchPct);
  deckBPitchPctRef.current = deckBPitchPct;
  const deckBTimeRef = useRef(deckBTime);
  deckBTimeRef.current = deckBTime;
  const deckAScratchingRef = useRef(deckAScratching);
  deckAScratchingRef.current = deckAScratching;
  const deckBScratchingRef = useRef(deckBScratching);
  deckBScratchingRef.current = deckBScratching;
  const deckAScratchRateRef = useRef<number | null>(deckAScratchRate);
  deckAScratchRateRef.current = deckAScratchRate;
  const deckBScratchRateRef = useRef<number | null>(deckBScratchRate);
  deckBScratchRateRef.current = deckBScratchRate;
  const deckASlipModeRef = useRef(deckASlipMode);
  deckASlipModeRef.current = deckASlipMode;
  const deckBSlipModeRef = useRef(deckBSlipMode);
  deckBSlipModeRef.current = deckBSlipMode;
  const scratchStartingRef = useRef<{ A: boolean; B: boolean }>({ A: false, B: false });
  const scratchReleaseQueuedRef = useRef<{ A: boolean; B: boolean }>({ A: false, B: false });
  const scratchPendingMoveRef = useRef<{
    A: { deltaSec: number; velocityRate: number } | null;
    B: { deltaSec: number; velocityRate: number } | null;
  }>({ A: null, B: null });
  const scratchPlatterDragRef = useRef<{
    A: { lastX: number; lastTime: number } | null;
    B: { lastX: number; lastTime: number } | null;
  }>({ A: null, B: null });
  const showDjHudRef = useRef(showDjHudOnStage);
  showDjHudRef.current = showDjHudOnStage;
  const currentLyricsRef = useRef(currentLyrics);
  currentLyricsRef.current = currentLyrics;

  // Dual-deck auto-mix transition preview plan
  const dualPlan = useMemo(() => {
    if (!deckATrack || !deckBTrack) return null;
    return buildDualDeckMixPlan(deckATrack, deckBTrack, {
      triggerMode,
      transitionStyle,
      videoMixStyle,
      crossfadeBeats,
      beatMatchTempo,
      alignPhaseToBeat,
      customOutTimeA: deckAOutTime,
      customInTimeB: deckBInTime,
      outLyricIdA: deckAOutLyricId,
      inLyricIdB: deckBInLyricId,
    });
  }, [
    alignPhaseToBeat,
    beatMatchTempo,
    crossfadeBeats,
    deckAOutLyricId,
    deckAOutTime,
    deckATrack,
    deckBInLyricId,
    deckBInTime,
    deckBTrack,
    transitionStyle,
    triggerMode,
    videoMixStyle,
  ]);

  const effectivePhaseTimeA =
    phaseAlignScopeMode === 'live'
      ? deckATime
      : dualPlan?.transitionStartSec ?? deckAOutTime ?? deckATrack?.recommendedOutTime ?? 0;
  const effectivePhaseTimeB =
    phaseAlignScopeMode === 'live'
      ? deckBTime
      : dualPlan?.deckBInTime ?? deckBInTime ?? 0;
  const effectivePhaseRateA =
    phaseAlignScopeMode === 'live'
      ? Math.max(0.7, Math.min(1.35, 1 + deckAPitchPct / 100))
      : 1;
  const effectivePhaseRateB =
    phaseAlignScopeMode === 'live'
      ? Math.max(0.7, Math.min(1.35, 1 + deckBPitchPct / 100))
      : dualPlan?.deckBPlaybackRate ?? 1;

  const phaseComparison = useMemo(() => {
    if (!deckATrack || !deckBTrack) return null;
    return computeBeatMatchPhaseComparison(
      deckATrack,
      effectivePhaseTimeA,
      effectivePhaseRateA,
      deckBTrack,
      effectivePhaseTimeB,
      effectivePhaseRateB
    );
  }, [
    deckATrack,
    deckBTrack,
    effectivePhaseRateA,
    effectivePhaseRateB,
    effectivePhaseTimeA,
    effectivePhaseTimeB,
  ]);

  const deckAPhaseInfo = useMemo(
    () =>
      deckATrack
        ? computeBeatPhaseMetrics(deckATrack, deckATime, 1 + deckAPitchPct / 100)
        : null,
    [deckAPitchPct, deckATime, deckATrack]
  );

  const deckBPhaseInfo = useMemo(
    () =>
      deckBTrack
        ? computeBeatPhaseMetrics(deckBTrack, deckBTime, 1 + deckBPitchPct / 100)
        : null,
    [deckBPitchPct, deckBTime, deckBTrack]
  );

  const harmonicComparison = useMemo(
    () => evaluateHarmonicCompatibility(deckATrack?.camelotKey, deckBTrack?.camelotKey),
    [deckATrack?.camelotKey, deckBTrack?.camelotKey]
  );

  const deckACompatibleKeys = useMemo(
    () => getCompatibleCamelotKeys(deckATrack?.camelotKey),
    [deckATrack?.camelotKey]
  );

  const lastDragLiveRestartMsRef = useRef(0);

  const stopDeckChain = useCallback((deck: 'A' | 'B') => {
    const ref = deck === 'A' ? deckAChainRef : deckBChainRef;
    scratchStartingRef.current[deck] = false;
    scratchReleaseQueuedRef.current[deck] = false;
    scratchPendingMoveRef.current[deck] = null;
    const chain = ref.current;
    if (chain) {
      if (chain.scratchSession) {
        try {
          chain.scratchSession.dispose();
        } catch {
          // ignore
        }
        chain.scratchSession = null;
      }
      if (chain.source) {
        try {
          chain.source.onended = null;
          chain.source.stop();
          chain.source.disconnect();
        } catch {
          // ignore stopped source
        }
      }
      if (chain.sourceGain) {
        try {
          chain.sourceGain.disconnect();
        } catch {
          // ignore
        }
      }
      const nodesToDisconnect: AudioNode[] = [
        chain.lowEq,
        chain.midEq,
        chain.highEq,
        chain.sweepFilter,
        chain.trimGain,
        chain.delayDry,
        chain.delayNode,
        chain.delayFeedback,
        chain.delayWet,
        chain.preFaderMonitorGain,
        chain.analyser,
        chain.beatLowPass,
        chain.beatAnalyser,
        chain.crossfadeGain,
      ];
      for (const node of nodesToDisconnect) {
        try {
          node.disconnect();
        } catch {
          // ignore
        }
      }
      ref.current = null;
    }
    if (deck === 'A') {
      setDeckAPlaying(false);
      setDeckAScratching(false);
      setDeckAScratchRate(null);
    } else {
      setDeckBPlaying(false);
      setDeckBScratching(false);
      setDeckBScratchRate(null);
    }
  }, []);

  const stopAutoSetPlayback = useCallback(() => {
    if (autoSetSourceRef.current) {
      try {
        autoSetSourceRef.current.onended = null;
        autoSetSourceRef.current.stop();
        autoSetSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      autoSetSourceRef.current = null;
    }
    setIsAutoSetPlaying(false);
  }, []);

  const stopTransitionPreviewPlayback = useCallback(() => {
    if (previewSourceRef.current) {
      try {
        previewSourceRef.current.onended = null;
        previewSourceRef.current.stop();
        previewSourceRef.current.disconnect();
      } catch {
        // ignore
      }
      previewSourceRef.current = null;
    }
    setIsPreviewPlaying(false);
  }, []);

  const stopLoopDeckPlayback = useCallback(() => {
    const chain = loopDeckChainRef.current;
    if (chain) {
      try {
        chain.source.onended = null;
        chain.source.stop();
        chain.source.disconnect();
      } catch {
        // ignore stopped loop source
      }
      loopDeckChainRef.current = null;
    }
    setLoopDeckPlaying(false);
    if (loopPlayheadBarRef.current) {
      loopPlayheadBarRef.current.style.left = '0%';
    }
  }, []);

  const stopAllSamplerVoices = useCallback(() => {
    samplerTimersRef.current.forEach((tid) => window.clearTimeout(tid));
    samplerTimersRef.current = [];
    samplerActiveVoicesRef.current.forEach((v) => {
      try {
        v.source.onended = null;
        v.source.stop();
        v.source.disconnect();
        v.gainNode.disconnect();
      } catch {
        // ignore already stopped voice
      }
    });
    samplerActiveVoicesRef.current = [];
    setSamplerPadQueuedState({});
    setSamplerPadPlayingState({});
  }, []);

  const stopAllDjPlayback = useCallback(() => {
    stopDeckChain('A');
    stopDeckChain('B');
    stopAutoSetPlayback();
    stopTransitionPreviewPlayback();
    stopLoopDeckPlayback();
    stopAllSamplerVoices();
  }, [
    stopAllSamplerVoices,
    stopAutoSetPlayback,
    stopDeckChain,
    stopLoopDeckPlayback,
    stopTransitionPreviewPlayback,
  ]);

  // Live detected master BPM (follows active playing deck + live pitch, or Auto-Mix segment BPM)
  const detectedMasterBpm = useMemo(() => {
    if (isAutoSetPlaying && renderedSchedule && renderedSchedule.segments.length > 0) {
      const activeSeg =
        renderedSchedule.segments.find((seg) => {
          const segEnd =
            seg.timelineStartSec +
            seg.sourcePlayDurationSec / Math.max(0.25, seg.playbackRate || 1);
          return autoSetTime >= seg.timelineStartSec && autoSetTime <= segEnd;
        }) ?? renderedSchedule.segments[0];
      if (activeSeg?.targetBpm) {
        return Math.max(40, Math.min(240, activeSeg.targetBpm));
      }
    }
    const liveA = deckAPlaying || deckAScratching;
    const liveB = deckBPlaying || deckBScratching;
    if (liveB && !liveA && deckBTrack) {
      return Math.max(40, Math.min(240, getEffectiveBpm(deckBTrack) * (1 + deckBPitchPct / 100)));
    }
    if (crossfader > 0.35 && liveB && deckBTrack) {
      return Math.max(40, Math.min(240, getEffectiveBpm(deckBTrack) * (1 + deckBPitchPct / 100)));
    }
    if (deckATrack) {
      return Math.max(40, Math.min(240, getEffectiveBpm(deckATrack) * (1 + deckAPitchPct / 100)));
    }
    if (deckBTrack) {
      return Math.max(40, Math.min(240, getEffectiveBpm(deckBTrack) * (1 + deckBPitchPct / 100)));
    }
    return 120;
  }, [
    autoSetTime,
    crossfader,
    deckAPitchPct,
    deckAPlaying,
    deckAScratching,
    deckATrack,
    deckBPitchPct,
    deckBPlaying,
    deckBScratching,
    deckBTrack,
    isAutoSetPlaying,
    renderedSchedule,
  ]);
  const detectedMasterBpmRef = useRef(detectedMasterBpm);
  detectedMasterBpmRef.current = detectedMasterBpm;

  const fxFilterCutoff = settings.djFilterCutoff ?? 1;
  const fxFilterResonance = settings.djFilterResonance ?? 1.6;
  const fxAutoFilterDepth = settings.djAutoFilterDepth ?? 0;
  const fxDelayMix = settings.djDelayMix ?? 0;
  const fxDelayFeedback = settings.djDelayFeedback ?? 0.38;
  const fxBeatGateDepth = settings.djBeatGateDepth ?? 0;
  const fxTransientAttack = settings.djTransientAttack ?? 0;
  const fxTransientSustain = settings.djTransientSustain ?? 0;
  const fxTransientDither = settings.djTransientDither ?? 0;
  const fxNoiseGateThreshold = settings.djNoiseGateThreshold ?? -80;

  const transientCurve = useMemo(
    () => buildTransientEnvelopeCurvePoints(fxTransientAttack, fxTransientSustain, 60),
    [fxTransientAttack, fxTransientSustain]
  );

  const computedFxDelaySec = useMemo(
    () =>
      fxBpmSyncEnabled
        ? Math.min(1.9, Math.max(0.05, (60 / detectedMasterBpm) * fxDelayBeats))
        : Math.min(1.9, Math.max(0.05, fxManualDelayMs / 1000)),
    [detectedMasterBpm, fxBpmSyncEnabled, fxDelayBeats, fxManualDelayMs]
  );

  // Scan loaded buffers in the mix stack to estimate peak headroom before/during overlap
  const deckABufferPeak = useMemo(
    () => scanAudioBufferPeakLinear(deckATrack?.audioBuffer),
    [deckATrack]
  );
  const deckBBufferPeak = useMemo(
    () => scanAudioBufferPeakLinear(deckBTrack?.audioBuffer),
    [deckBTrack]
  );
  const loopBufferPeak = useMemo(
    () => scanAudioBufferPeakLinear(capturedLoop?.audioBuffer),
    [capturedLoop]
  );
  const renderedSetBufferPeak = useMemo(
    () => scanAudioBufferPeakLinear(renderedMixBuffer),
    [renderedMixBuffer]
  );

  const mixStackBaselinePeak = useMemo(() => {
    const t = (Math.max(-1, Math.min(1, crossfader)) + 1) * 0.5;
    const xA = Math.cos(t * Math.PI * 0.5);
    const xB = Math.sin(t * Math.PI * 0.5);

    const boostDbA = Math.max(0, eqA.lowGainDb, eqA.midGainDb, eqA.highGainDb);
    const boostDbB = Math.max(0, eqB.lowGainDb, eqB.midGainDb, eqB.highGainDb);
    const estA =
      deckATrack && deckABufferPeak > 0
        ? deckABufferPeak * eqA.trimGain * xA * Math.pow(10, boostDbA / 32)
        : 0;
    const estB =
      deckBTrack && deckBBufferPeak > 0
        ? deckBBufferPeak * eqB.trimGain * xB * Math.pow(10, boostDbB / 32)
        : 0;
    const estLoop =
      capturedLoop && loopDeckPlaying && loopBufferPeak > 0
        ? loopBufferPeak * loopDeckVolume
        : 0;
    const fxHeadroomFactor =
      1 +
      Math.max(0, fxDelayMix) * 0.35 +
      Math.max(0, (fxFilterResonance - 1.6) / 24);
    const liveStack = (estA + estB + estLoop) * fxHeadroomFactor * (isMasterMuted ? 0 : masterVolume);
    const autoSetStack =
      isAutoSetPlaying && renderedSetBufferPeak > 0
        ? renderedSetBufferPeak * (isMasterMuted ? 0 : masterVolume)
        : 0;
    return Math.max(liveStack, autoSetStack, renderedSetBufferPeak > 0 ? renderedSetBufferPeak * masterVolume : 0);
  }, [
    capturedLoop,
    crossfader,
    deckABufferPeak,
    deckATrack,
    deckBBufferPeak,
    deckBTrack,
    eqA.highGainDb,
    eqA.lowGainDb,
    eqA.midGainDb,
    eqA.trimGain,
    eqB.highGainDb,
    eqB.lowGainDb,
    eqB.midGainDb,
    eqB.trimGain,
    fxDelayMix,
    fxFilterResonance,
    isAutoSetPlaying,
    isMasterMuted,
    loopBufferPeak,
    loopDeckPlaying,
    loopDeckVolume,
    masterVolume,
    renderedSetBufferPeak,
  ]);

  // Seed loudest stack peak when tracks change or user triggers recalibration
  useEffect(() => {
    loudestStackPeakRef.current = mixStackBaselinePeak;
  }, [deckATrackId, deckBTrackId, limiterPeakResetNonce]);

  useEffect(() => {
    if (mixStackBaselinePeak > loudestStackPeakRef.current) {
      loudestStackPeakRef.current = mixStackBaselinePeak;
    }
  }, [mixStackBaselinePeak]);

  // Ensure shared master WebAudio bus + BPM-synced Master Filter & FX Rack + Brick-Wall Limiter exist
  const ensureMasterBus = useCallback(async () => {
    const ctx = await ensureAudioContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (
      !masterGainRef.current ||
      !fxRackRef.current ||
      !masterLimiterNodesRef.current ||
      masterGainRef.current.context !== ctx
    ) {
      fxRackRef.current?.transientShaper.dispose();
      fxRackRef.current?.noiseGate.dispose();
      const inputBus = ctx.createGain();
      inputBus.gain.value = 1;

      const noiseGate = createLiveNoiseGate(ctx);
      noiseGate.setParams({
        thresholdDb: settingsRef.current.djNoiseGateThreshold ?? -80,
        bypassed: fxBypassed,
      });

      const transientShaper = createLiveTransientShaper(ctx);
      transientShaper.setParams({
        attack: settingsRef.current.djTransientAttack ?? 0,
        sustain: settingsRef.current.djTransientSustain ?? 0,
        dither: settingsRef.current.djTransientDither ?? 0,
        focus: fxTransientFocus,
        bypassed: fxBypassed,
      });

      const sweepFilter = ctx.createBiquadFilter();
      sweepFilter.type = 'lowpass';
      sweepFilter.frequency.value = 18000;
      sweepFilter.Q.value = 1.6;

      const filterLfoOsc = ctx.createOscillator();
      filterLfoOsc.type = 'sine';
      filterLfoOsc.frequency.value = 1;
      const filterLfoGain = ctx.createGain();
      filterLfoGain.gain.value = 0;
      filterLfoOsc.connect(filterLfoGain);
      filterLfoGain.connect(sweepFilter.detune);
      filterLfoOsc.start();

      const dryGain = ctx.createGain();
      dryGain.gain.value = 1;

      // Warm Stereo Ping-Pong Delay Loop
      const delayDampFilter = ctx.createBiquadFilter();
      delayDampFilter.type = 'lowpass';
      delayDampFilter.frequency.value = 4200;
      delayDampFilter.Q.value = 0.7;

      const delayLeft = ctx.createDelay(2.0);
      delayLeft.delayTime.value = 0.25;
      const delayRight = ctx.createDelay(2.0);
      delayRight.delayTime.value = 0.25;

      const delayPanLeft = ctx.createStereoPanner();
      delayPanLeft.pan.value = -0.65;
      const delayPanRight = ctx.createStereoPanner();
      delayPanRight.pan.value = 0.65;

      const delayFeedbackGain = ctx.createGain();
      delayFeedbackGain.gain.value = 0.38;
      const delayWetGain = ctx.createGain();
      delayWetGain.gain.value = 0;

      // BPM Beat Gate / Pump stage
      const gateGain = ctx.createGain();
      gateGain.gain.value = 1;
      const gateLfoOsc = ctx.createOscillator();
      gateLfoOsc.type = 'triangle';
      gateLfoOsc.frequency.value = 2;
      const gateLfoGain = ctx.createGain();
      gateLfoGain.gain.value = 0;
      gateLfoOsc.connect(gateLfoGain);
      gateLfoGain.connect(gateGain.gain);
      gateLfoOsc.start();

      const master = ctx.createGain();
      master.gain.value = isMasterMuted ? 0 : masterVolume;

      // Pre-Limiter Analyser (measures raw mix stack peak before auto-gain & brick-wall stage)
      const preLimiterAnalyser = ctx.createAnalyser();
      preLimiterAnalyser.fftSize = 2048;
      preLimiterAnalyser.smoothingTimeConstant = 0.1;

      // Automatic Peak-Calibrated Trim Gain
      const autoTrimGain = ctx.createGain();
      autoTrimGain.gain.value = 1;

      // Brick-Wall Master Limiter (20:1 hard-knee compressor + 4x oversampled ceiling clipper)
      const ceilingLinear = Math.pow(10, limiterCeilingDbRef.current / 20);
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = limiterEnabledRef.current
        ? Math.max(-24, limiterCeilingDbRef.current - 0.6)
        : 0;
      compressor.knee.value = 0;
      compressor.ratio.value = limiterEnabledRef.current ? 20 : 1;
      compressor.attack.value = 0.001;
      compressor.release.value = limiterReleaseSecRef.current;

      const clipper = ctx.createWaveShaper();
      clipper.oversample = '4x';
      clipper.curve = limiterEnabledRef.current
        ? createBrickWallClipperCurve(ceilingLinear)
        : null;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = settingsRef.current.smoothing;

      const lowPass = ctx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 140;
      lowPass.Q.value = 1.2;

      const beatAnalyser = ctx.createAnalyser();
      beatAnalyser.fftSize = 2048;
      beatAnalyser.smoothingTimeConstant = 0.2;

      // Signal routing: Input -> Noise Gate -> Transient Shaper -> Sweep Filter -> Dry + Ping-Pong Delay -> Gate -> Master
      inputBus.connect(noiseGate.input);
      noiseGate.output.connect(transientShaper.input);
      transientShaper.output.connect(sweepFilter);
      sweepFilter.connect(dryGain);
      dryGain.connect(gateGain);

      sweepFilter.connect(delayDampFilter);
      delayDampFilter.connect(delayLeft);
      delayLeft.connect(delayRight);
      delayLeft.connect(delayPanLeft);
      delayRight.connect(delayPanRight);
      delayPanLeft.connect(delayWetGain);
      delayPanRight.connect(delayWetGain);
      delayRight.connect(delayFeedbackGain);
      delayFeedbackGain.connect(delayDampFilter);
      delayWetGain.connect(gateGain);

      gateGain.connect(master);
      master.connect(preLimiterAnalyser);
      preLimiterAnalyser.connect(autoTrimGain);
      autoTrimGain.connect(compressor);
      compressor.connect(clipper);
      clipper.connect(analyser);
      analyser.connect(ctx.destination);
      clipper.connect(lowPass);
      lowPass.connect(beatAnalyser);
      if (typeof ctx.createMediaStreamDestination === 'function') {
        const streamDest = ctx.createMediaStreamDestination();
        clipper.connect(streamDest);
        masterStreamDestRef.current = streamDest;
      } else {
        masterStreamDestRef.current = null;
      }

      fxRackRef.current = {
        inputBus,
        sweepFilter,
        filterLfoOsc,
        filterLfoGain,
        dryGain,
        delayDampFilter,
        delayLeft,
        delayRight,
        delayPanLeft,
        delayPanRight,
        delayFeedbackGain,
        delayWetGain,
        gateGain,
        gateLfoOsc,
        gateLfoGain,
        transientShaper,
        noiseGate,
      };
      masterLimiterNodesRef.current = {
        preLimiterAnalyser,
        autoTrimGain,
        compressor,
        clipper,
      };
      masterGainRef.current = master;
      analyserRef.current = analyser;
      beatAnalyserRef.current = beatAnalyser;
    }
    return { ctx, master: fxRackRef.current.inputBus };
  }, [ensureAudioContext, isMasterMuted, masterVolume]);

  // Helper: compute crossfade gain for Deck A & B using equal-power curve
  const getCrossfadeGains = useCallback((xfade: number) => {
    const t = (Math.max(-1, Math.min(1, xfade)) + 1) * 0.5; // 0 = A, 1 = B
    return {
      gainA: Math.cos(t * Math.PI * 0.5),
      gainB: Math.sin(t * Math.PI * 0.5),
    };
  }, []);

  // Sync live EQ, Filter, Crossfader & Pitch changes directly to active WebAudio nodes
  useEffect(() => {
    const { gainA, gainB } = getCrossfadeGains(crossfader);
    const applyEq = (
      chain: LiveDeckAudioChain | null,
      eq: DjDeckEqSettings,
      xfadeGain: number,
      pitchPct: number,
      track: DjTrackAsset | null
    ) => {
      if (!chain) return;
      const now = chain.lowEq.context.currentTime;
      chain.lowEq.frequency.setTargetAtTime(eq.lowCrossoverHz ?? 230, now, 0.025);
      chain.lowEq.gain.setTargetAtTime(eq.lowGainDb, now, 0.02);
      chain.midEq.frequency.setTargetAtTime(eq.midCenterHz ?? 1100, now, 0.025);
      chain.midEq.gain.setTargetAtTime(eq.midGainDb, now, 0.02);
      chain.highEq.frequency.setTargetAtTime(eq.highCrossoverHz ?? 4000, now, 0.025);
      chain.highEq.gain.setTargetAtTime(eq.highGainDb, now, 0.02);
      chain.trimGain.gain.setTargetAtTime(eq.trimGain, now, 0.02);
      chain.crossfadeGain.gain.setTargetAtTime(xfadeGain, now, 0.02);

      if (Math.abs(eq.filterSweep) < 0.03) {
        chain.sweepFilter.type = 'allpass';
        chain.sweepFilter.Q.setTargetAtTime(0.7, now, 0.02);
      } else if (eq.filterSweep < 0) {
        chain.sweepFilter.type = 'highpass';
        const norm = Math.abs(eq.filterSweep);
        const freq = 35 * Math.pow(130, norm);
        chain.sweepFilter.frequency.setTargetAtTime(freq, now, 0.02);
        chain.sweepFilter.Q.setTargetAtTime(2.6, now, 0.02);
      } else {
        chain.sweepFilter.type = 'lowpass';
        const norm = eq.filterSweep;
        const freq = 18000 * Math.pow(0.015, norm);
        chain.sweepFilter.frequency.setTargetAtTime(freq, now, 0.02);
        chain.sweepFilter.Q.setTargetAtTime(2.6, now, 0.02);
      }

      const rate = Math.max(0.7, Math.min(1.35, 1 + pitchPct / 100));
      chain.playbackRate = rate;
      chain.analyser.smoothingTimeConstant = Math.max(0.05, Math.min(0.95, settings.smoothing));
      if (chain.source) {
        chain.source.playbackRate.setTargetAtTime(rate, now, 0.02);
        if (chain.loopBeats > 0 && track) {
          const beatSec = 60 / Math.max(40, getEffectiveBpm(track));
          chain.source.loop = true;
          chain.source.loopStart = Math.max(0, chain.offsetSec);
          chain.source.loopEnd = Math.min(
            track.duration,
            chain.offsetSec + beatSec * chain.loopBeats
          );
        } else {
          chain.source.loop = false;
        }
      }
      if (chain.scratchSession) {
        chain.scratchSession.updateLiveParams(
          rate,
          chain === deckAChainRef.current ? deckASlipModeRef.current : deckBSlipModeRef.current
        );
      }
    };

    applyEq(deckAChainRef.current, eqA, gainA, deckAPitchPct, deckATrack);
    applyEq(deckBChainRef.current, eqB, gainB, deckBPitchPct, deckBTrack);
  }, [
    crossfader,
    deckALoopBeats,
    deckAPitchPct,
    deckASlipMode,
    deckATrack,
    deckBLoopBeats,
    deckBPitchPct,
    deckBSlipMode,
    deckBTrack,
    eqA,
    eqB,
    getCrossfadeGains,
    settings.smoothing,
  ]);

  // Auto-calibrate Deck A & Deck B 3-Band EQ crossover points from each deck's detected BPM
  const deckALiveBpm = useMemo(() => {
    if (!deckATrack) return null;
    return Math.max(40, Math.min(240, getEffectiveBpm(deckATrack) * (1 + deckAPitchPct / 100)));
  }, [deckAPitchPct, deckATrack]);

  const deckBLiveBpm = useMemo(() => {
    if (!deckBTrack) return null;
    return Math.max(40, Math.min(240, getEffectiveBpm(deckBTrack) * (1 + deckBPitchPct / 100)));
  }, [deckBPitchPct, deckBTrack]);

  useEffect(() => {
    if (!eqAAutoXover) return;
    const cal = computeBpmCalibratedEqCrossovers(deckALiveBpm ?? detectedMasterBpm);
    setEqA((prev) => {
      if (
        prev.lowCrossoverHz === cal.lowCrossoverHz &&
        prev.midCenterHz === cal.midCenterHz &&
        prev.highCrossoverHz === cal.highCrossoverHz
      ) {
        return prev;
      }
      return {
        ...prev,
        lowCrossoverHz: cal.lowCrossoverHz,
        midCenterHz: cal.midCenterHz,
        highCrossoverHz: cal.highCrossoverHz,
      };
    });
  }, [deckALiveBpm, detectedMasterBpm, eqAAutoXover]);

  useEffect(() => {
    if (!eqBAutoXover) return;
    const cal = computeBpmCalibratedEqCrossovers(deckBLiveBpm ?? detectedMasterBpm);
    setEqB((prev) => {
      if (
        prev.lowCrossoverHz === cal.lowCrossoverHz &&
        prev.midCenterHz === cal.midCenterHz &&
        prev.highCrossoverHz === cal.highCrossoverHz
      ) {
        return prev;
      }
      return {
        ...prev,
        lowCrossoverHz: cal.lowCrossoverHz,
        midCenterHz: cal.midCenterHz,
        highCrossoverHz: cal.highCrossoverHz,
      };
    });
  }, [deckBLiveBpm, detectedMasterBpm, eqBAutoXover]);

  const handleCalibrateDeckCrossovers = useCallback(
    (target: 'A' | 'B' | 'both') => {
      if (target === 'A' || target === 'both') {
        const bpmA = deckALiveBpm ?? detectedMasterBpm;
        const calA = computeBpmCalibratedEqCrossovers(bpmA);
        setEqAAutoXover(true);
        setEqA((prev) => ({
          ...prev,
          lowCrossoverHz: calA.lowCrossoverHz,
          midCenterHz: calA.midCenterHz,
          highCrossoverHz: calA.highCrossoverHz,
        }));
      }
      if (target === 'B' || target === 'both') {
        const bpmB = deckBLiveBpm ?? detectedMasterBpm;
        const calB = computeBpmCalibratedEqCrossovers(bpmB);
        setEqBAutoXover(true);
        setEqB((prev) => ({
          ...prev,
          lowCrossoverHz: calB.lowCrossoverHz,
          midCenterHz: calB.midCenterHz,
          highCrossoverHz: calB.highCrossoverHz,
        }));
      }
      setStatusMessage(
        target === 'both'
          ? 'Auto-calibrated 3-band EQ crossover frequencies for Deck A & Deck B from detected BPM.'
          : `Auto-calibrated Deck ${target} 3-band EQ crossovers to ${((target === 'A' ? deckALiveBpm : deckBLiveBpm) ?? detectedMasterBpm).toFixed(1)} BPM.`
      );
    },
    [deckALiveBpm, deckBLiveBpm, detectedMasterBpm]
  );

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        isMasterMuted ? 0 : masterVolume,
        masterGainRef.current.context.currentTime,
        0.02
      );
    }
  }, [isMasterMuted, masterVolume]);

  // Sync Master Brick-Wall Limiter threshold, release, ceiling curve & baseline auto-gain
  useEffect(() => {
    const nodes = masterLimiterNodesRef.current;
    if (!nodes) return;
    const now = nodes.compressor.context.currentTime;
    const ceilingLinear = Math.pow(10, limiterCeilingDb / 20);

    if (limiterEnabled) {
      nodes.compressor.threshold.setTargetAtTime(
        Math.max(-24, limiterCeilingDb - 0.6),
        now,
        0.02
      );
      nodes.compressor.knee.setTargetAtTime(0, now, 0.02);
      nodes.compressor.ratio.setTargetAtTime(20, now, 0.02);
      nodes.compressor.attack.setTargetAtTime(0.001, now, 0.02);
      nodes.compressor.release.setTargetAtTime(limiterReleaseSec, now, 0.02);
      nodes.clipper.curve = createBrickWallClipperCurve(ceilingLinear);

      if (limiterAutoGainEnabled) {
        const refPeak = Math.max(0.15, loudestStackPeakRef.current);
        let trim = 1;
        if (refPeak > ceilingLinear) {
          trim = Math.max(0.25, ceilingLinear / refPeak);
        } else if (refPeak < ceilingLinear * 0.85) {
          trim = Math.min(1.5, ceilingLinear / refPeak);
        }
        lastAutoTrimGainRef.current = trim;
        nodes.autoTrimGain.gain.setTargetAtTime(trim, now, 0.03);
      } else {
        lastAutoTrimGainRef.current = 1;
        nodes.autoTrimGain.gain.setTargetAtTime(1, now, 0.025);
      }
    } else {
      nodes.compressor.threshold.setTargetAtTime(0, now, 0.02);
      nodes.compressor.ratio.setTargetAtTime(1, now, 0.02);
      nodes.clipper.curve = null;
      lastAutoTrimGainRef.current = 1;
      nodes.autoTrimGain.gain.setTargetAtTime(1, now, 0.025);
    }
  }, [
    limiterAutoGainEnabled,
    limiterCeilingDb,
    limiterEnabled,
    limiterPeakResetNonce,
    limiterReleaseSec,
    mixStackBaselinePeak,
  ]);

  // Sync Master Filter & FX Rack parameters + BPM-locked LFOs and Delay in real time
  useEffect(() => {
    const fx = fxRackRef.current;
    if (!fx) return;
    const now = fx.sweepFilter.context.currentTime;

    fx.noiseGate.setParams({
      thresholdDb: fxNoiseGateThreshold,
      bypassed: fxBypassed,
    });
    fx.transientShaper.setParams({
      attack: fxTransientAttack,
      sustain: fxTransientSustain,
      dither: fxTransientDither,
      focus: fxTransientFocus,
      bypassed: fxBypassed,
    });

    if (fxBypassed) {
      fx.sweepFilter.type = 'lowpass';
      fx.sweepFilter.frequency.setTargetAtTime(20000, now, 0.025);
      fx.sweepFilter.Q.setTargetAtTime(0.7, now, 0.025);
      fx.filterLfoGain.gain.setTargetAtTime(0, now, 0.025);
      fx.delayWetGain.gain.setTargetAtTime(0, now, 0.025);
      fx.gateGain.gain.setTargetAtTime(1, now, 0.025);
      fx.gateLfoGain.gain.setTargetAtTime(0, now, 0.025);
      return;
    }

    const clampedCutoff = Math.max(0, Math.min(1, fxFilterCutoff));
    fx.sweepFilter.type = fxFilterMode;
    let baseFreq =
      fxFilterMode === 'lowpass'
        ? 160 * Math.pow(112.5, clampedCutoff)
        : 30 * Math.pow(160, 1 - clampedCutoff);

    if (fxAutoFilterDepth > 0.01 && fxFilterMode === 'lowpass') {
      const biasFactor = Math.pow(0.24, fxAutoFilterDepth * Math.max(0, clampedCutoff - 0.3));
      baseFreq = Math.max(160, baseFreq * biasFactor);
    }

    fx.sweepFilter.frequency.setTargetAtTime(baseFreq, now, 0.025);
    fx.sweepFilter.Q.setTargetAtTime(Math.max(0.7, Math.min(12, fxFilterResonance)), now, 0.025);

    const filterLfoHz = fxBpmSyncEnabled
      ? detectedMasterBpm / 60 / fxFilterLfoBeats
      : 0.5 / fxFilterLfoBeats;
    fx.filterLfoOsc.frequency.setTargetAtTime(
      Math.max(0.05, Math.min(18, filterLfoHz)),
      now,
      0.04
    );
    fx.filterLfoGain.gain.setTargetAtTime(
      Math.max(0, Math.min(1, fxAutoFilterDepth)) * 2600,
      now,
      0.03
    );

    fx.delayLeft.delayTime.setTargetAtTime(computedFxDelaySec, now, 0.045);
    fx.delayRight.delayTime.setTargetAtTime(computedFxDelaySec, now, 0.045);
    fx.delayWetGain.gain.setTargetAtTime(Math.max(0, Math.min(1, fxDelayMix)) * 0.85, now, 0.025);
    fx.delayFeedbackGain.gain.setTargetAtTime(
      Math.max(0, Math.min(0.85, fxDelayFeedback)),
      now,
      0.025
    );

    const gateHz = fxBpmSyncEnabled ? detectedMasterBpm / 60 / fxGateBeats : 2 / fxGateBeats;
    fx.gateLfoOsc.frequency.setTargetAtTime(Math.max(0.1, Math.min(20, gateHz)), now, 0.03);
    const gateDepth = Math.max(0, Math.min(1, fxBeatGateDepth));
    fx.gateGain.gain.setTargetAtTime(1 - gateDepth * 0.45, now, 0.025);
    fx.gateLfoGain.gain.setTargetAtTime(gateDepth * 0.45, now, 0.025);
  }, [
    computedFxDelaySec,
    detectedMasterBpm,
    fxAutoFilterDepth,
    fxBeatGateDepth,
    fxBpmSyncEnabled,
    fxBypassed,
    fxDelayFeedback,
    fxDelayMix,
    fxFilterCutoff,
    fxFilterLfoBeats,
    fxFilterMode,
    fxFilterResonance,
    fxGateBeats,
    fxNoiseGateThreshold,
    fxTransientAttack,
    fxTransientDither,
    fxTransientFocus,
    fxTransientSustain,
  ]);

  const handleResetFxRack = useCallback(() => {
    setFxBypassed(false);
    setFxFilterMode('lowpass');
    setFxBpmSyncEnabled(true);
    setFxFilterLfoBeats(2);
    setFxDelayBeats(0.5);
    setFxGateBeats(0.5);
    setFxTransientFocus('full');
    onUpdateSettings({
      djFilterCutoff: 1,
      djFilterResonance: 1.6,
      djAutoFilterDepth: 0,
      djDelayMix: 0,
      djDelayFeedback: 0.38,
      djBeatGateDepth: 0,
      djTransientAttack: 0,
      djTransientSustain: 0,
      djTransientDither: 0,
      djNoiseGateThreshold: -80,
    });
    setStatusMessage('Reset Filter & FX Rack to clean bypass state.');
  }, [onUpdateSettings]);

  const handleClearFxDelayTail = useCallback(() => {
    onUpdateSettings({ djDelayMix: 0 });
    const fx = fxRackRef.current;
    if (!fx) return;
    const now = fx.delayFeedbackGain.context.currentTime;
    fx.delayWetGain.gain.setTargetAtTime(0, now, 0.015);
    fx.delayFeedbackGain.gain.setTargetAtTime(0, now, 0.015);
    window.setTimeout(() => {
      const latest = fxRackRef.current;
      if (latest) {
        latest.delayFeedbackGain.gain.setTargetAtTime(
          settingsRef.current.djDelayFeedback ?? 0.38,
          latest.delayFeedbackGain.context.currentTime,
          0.02
        );
      }
    }, 150);
  }, [onUpdateSettings]);

  // Cleanup Tap Tempo & Nudge flash timers on unmount, and reset nudge counters on track swap
  useEffect(() => {
    setDeckANudgeMs(0);
    setDeckANudgeFlash(null);
  }, [deckATrackId]);

  useEffect(() => {
    setDeckBNudgeMs(0);
    setDeckBNudgeFlash(null);
  }, [deckBTrackId]);

  useEffect(() => {
    previewRenderSeqRef.current += 1;
    stopTransitionPreviewPlayback();
    setAiTransitionPreview(null);
    setPreviewTimeSec(0);
    setPreviewError(null);
    setIsPreviewRendering(false);
    setAiAutoMixResult(null);
    setAiAutoMixError(null);
    setActiveAiSuggestionId(null);
  }, [deckATrackId, deckBTrackId, stopTransitionPreviewPlayback]);

  useEffect(() => {
    const nudgeTimers = nudgeFlashTimerRef.current;
    return () => {
      if (tapResetTimerRef.current !== null) {
        window.clearTimeout(tapResetTimerRef.current);
      }
      if (tapPulseTimerRef.current !== null) {
        window.clearTimeout(tapPulseTimerRef.current);
      }
      if (nudgeTimers.A !== null) {
        window.clearTimeout(nudgeTimers.A);
      }
      if (nudgeTimers.B !== null) {
        window.clearTimeout(nudgeTimers.B);
      }
      fxRackRef.current?.transientShaper.dispose();
      fxRackRef.current?.noiseGate.dispose();
    };
  }, []);

  // DJ Tap Tempo calibration & Last-5 BPM session log
  const handleDjTapTempo = useCallback(() => {
    const now = performance.now();
    const prevSamples = tapSamplesRef.current;
    const lastSample = prevSamples[prevSamples.length - 1];
    const isFreshSequence = !lastSample || now - lastSample.tapTimeMs > TAP_TEMPO_IDLE_RESET_MS;

    if (isFreshSequence) {
      tapSequenceIdRef.current = `tap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const currentSample: TapSample = {
      tapTimeMs: now,
      bassRms: beatStateRef.current.lastEnergy,
      rollingRms: beatStateRef.current.rollingEnergy,
    };

    const nextSamples = isFreshSequence
      ? [currentSample]
      : [...prevSamples, currentSample].slice(-12);
    tapSamplesRef.current = nextSamples;
    setTapTempoCount(nextSamples.length);

    // Tactile pulse feedback on Tap button & visualizer beat burst
    setTapPulseFlash(true);
    beatStateRef.current.burstIntensity = Math.max(beatStateRef.current.burstIntensity, 0.7);
    if (tapPulseTimerRef.current !== null) {
      window.clearTimeout(tapPulseTimerRef.current);
    }
    tapPulseTimerRef.current = window.setTimeout(() => {
      setTapPulseFlash(false);
    }, 150);

    if (tapResetTimerRef.current !== null) {
      window.clearTimeout(tapResetTimerRef.current);
    }
    tapResetTimerRef.current = window.setTimeout(() => {
      tapSamplesRef.current = [];
      setTapTempoCount(0);
    }, TAP_TEMPO_IDLE_RESET_MS);

    const calibration = computeTapTempoCalibration(nextSamples, 1);
    if (!calibration) return;

    const detectedBpm = calibration.preciseBpm;
    setTapTempoBpm(detectedBpm);

    const seqId = tapSequenceIdRef.current || `tap-${Date.now()}`;
    const timestampLabel = new Date().toLocaleTimeString([], {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setTapBpmHistory((prev) => {
      if (prev[0]?.id === seqId) {
        const previousReading = prev[1];
        const deltaFromPrev = previousReading
          ? Number((detectedBpm - previousReading.bpm).toFixed(1))
          : null;
        return [
          {
            id: seqId,
            bpm: detectedBpm,
            tapCount: calibration.tapCount,
            timestampLabel,
            deltaFromPrev,
          },
          ...prev.slice(1),
        ];
      }

      const previousReading = prev[0];
      const deltaFromPrev = previousReading
        ? Number((detectedBpm - previousReading.bpm).toFixed(1))
        : null;
      return [
        {
          id: seqId,
          bpm: detectedBpm,
          tapCount: calibration.tapCount,
          timestampLabel,
          deltaFromPrev,
        },
        ...prev,
      ].slice(0, MAX_DJ_TAP_BPM_LOG);
    });
  }, []);

  const handleClearTapBpmHistory = useCallback(() => {
    tapSamplesRef.current = [];
    setTapTempoCount(0);
    setTapTempoBpm(null);
    setTapBpmHistory([]);
    setStatusMessage('Cleared DJ Tap Tempo session log.');
  }, []);

  const handleApplyTappedBpmToDeck = useCallback(
    (deck: 'A' | 'B', targetBpm: number) => {
      const track = deck === 'A' ? deckATrack : deckBTrack;
      if (!track) {
        setStatusMessage(`Load a track into Deck ${deck} before applying tapped BPM.`);
        return;
      }
      const baseBpm = Math.max(40, getEffectiveBpm(track));
      const pct = Number(
        Math.max(-16, Math.min(16, (targetBpm / baseBpm - 1) * 100)).toFixed(1)
      );
      if (deck === 'A') {
        setDeckAPitchPct(pct);
      } else {
        setDeckBPitchPct(pct);
      }
      setStatusMessage(
        `Applied tapped ${targetBpm.toFixed(1)} BPM to Deck ${deck} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% pitch).`
      );
    },
    [deckATrack, deckBTrack]
  );

  const tapBpmStats = useMemo(() => {
    if (tapBpmHistory.length === 0) return null;
    const values = tapBpmHistory.map((item) => item.bpm);
    const sum = values.reduce((acc, v) => acc + v, 0);
    const avgBpm = Number((sum / values.length).toFixed(1));
    const minBpm = Math.min(...values);
    const maxBpm = Math.max(...values);
    const spreadBpm = Number((maxBpm - minBpm).toFixed(1));
    const consistency: 'LOCKED' | 'STEADY' | 'DRIFTING' =
      spreadBpm <= 0.8 ? 'LOCKED' : spreadBpm <= 2.0 ? 'STEADY' : 'DRIFTING';
    return {
      avgBpm,
      minBpm,
      maxBpm,
      spreadBpm,
      consistency,
    };
  }, [tapBpmHistory]);

  // Populate Pads 1-4 with studio starter one-shots on first DJ Studio open
  useEffect(() => {
    if (!isOpen || samplerStarterLoadedRef.current) return;
    samplerStarterLoadedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const buffers = await Promise.all(
          SAMPLER_PAD_META.slice(0, 4).map((m) => synthesizeStarterOneShot(m.starterKind))
        );
        if (cancelled) return;
        setSamplerPads((prev) =>
          prev.map((pad, idx) => {
            if (idx >= 4 || pad.audioBuffer) return pad;
            const buf = buffers[idx];
            return {
              ...pad,
              audioBuffer: buf,
              peaks: extractSamplerPeaks(buf, 28),
              durationSec: buf.duration,
              sourceKind: 'synth',
            };
          })
        );
      } catch {
        // OfflineAudioContext unavailable — pads stay cleanly empty & recordable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleLoadFullSamplerStarterKit = useCallback(async () => {
    try {
      const buffers = await Promise.all(
        SAMPLER_PAD_META.map((m) => synthesizeStarterOneShot(m.starterKind))
      );
      const niceNames = [
        '808 Kick',
        'Crisp Clap',
        'Drop Horn',
        'Noise Riser',
        'Closed Hat',
        'Sub Drop',
        'Chord Stab',
        'Perc Rim',
      ];
      setSamplerPads((prev) =>
        prev.map((pad, idx) => ({
          ...pad,
          name: niceNames[idx] ?? pad.name,
          audioBuffer: buffers[idx],
          peaks: extractSamplerPeaks(buffers[idx], 28),
          durationSec: buffers[idx].duration,
          sourceKind: 'synth',
          recordedBpm: Number(detectedMasterBpm.toFixed(1)),
        }))
      );
      setStatusMessage('Loaded 8 studio DJ one-shot samples across all Sampler pads.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to synthesize starter sampler pack.'
      );
    }
  }, [detectedMasterBpm]);

  const stopActiveSamplerRecorder = useCallback(() => {
    if (samplerRecordIntervalRef.current !== null) {
      window.clearInterval(samplerRecordIntervalRef.current);
      samplerRecordIntervalRef.current = null;
    }
    if (samplerRecordAutoStopRef.current !== null) {
      window.clearTimeout(samplerRecordAutoStopRef.current);
      samplerRecordAutoStopRef.current = null;
    }
    if (samplerMicMeterRafRef.current !== null) {
      cancelAnimationFrame(samplerMicMeterRafRef.current);
      samplerMicMeterRafRef.current = null;
    }
    if (samplerMicMeterCleanupRef.current) {
      samplerMicMeterCleanupRef.current();
      samplerMicMeterCleanupRef.current = null;
    }
    if (samplerRecorderRef.current && samplerRecorderRef.current.state !== 'inactive') {
      try {
        samplerRecorderRef.current.stop();
      } catch {
        // ignore already stopped recorder
      }
    } else {
      setSamplerRecordingPadId(null);
      setSamplerRecordElapsedSec(0);
      setSamplerMicLevel(0);
    }
    if (samplerMicStreamRef.current) {
      samplerMicStreamRef.current.getTracks().forEach((t) => t.stop());
      samplerMicStreamRef.current = null;
    }
  }, []);

  // Cleanup active sampler voices & mic recorder on modal close/unmount
  useEffect(() => {
    return () => {
      stopActiveSamplerRecorder();
      stopAllSamplerVoices();
    };
  }, [stopActiveSamplerRecorder, stopAllSamplerVoices]);

  // Live update gain on active sampler voices when Sampler Master Volume or pad gain changes
  useEffect(() => {
    const padsById = new Map(samplerPads.map((p) => [p.id, p]));
    samplerActiveVoicesRef.current.forEach((voice) => {
      const pad = padsById.get(voice.padId);
      const nextGain = (pad?.gain ?? 0.95) * samplerMasterVolume;
      try {
        voice.gainNode.gain.setTargetAtTime(
          nextGain,
          voice.gainNode.context.currentTime,
          0.02
        );
      } catch {
        // ignore disconnected voice
      }
    });
  }, [samplerMasterVolume, samplerPads]);

  const handleTriggerSamplerPad = useCallback(
    async (padId: string) => {
      const pad = samplerPadsRef.current.find((p) => p.id === padId);
      if (!pad) return;
      if (!pad.audioBuffer) {
        setStatusMessage(
          `Pad "${pad.name}" is empty — click Rec or Load Audio to capture a one-shot sample.`
        );
        return;
      }

      const bus = await ensureMasterBus();
      if (!bus) return;
      const { ctx, master } = bus;

      let anchorDeck: {
        isPlaying: boolean;
        trackTimeSec: number;
        firstBeatSec: number;
        trackBpm: number;
        playbackRate: number;
      } | null = null;

      if (deckAPlayingRef.current && deckATrackRef.current) {
        const trackA = deckATrackRef.current;
        anchorDeck = {
          isPlaying: true,
          trackTimeSec: deckATimeRef.current,
          firstBeatSec: trackA.downbeatTimes[0] ?? trackA.beatTimes[0] ?? 0,
          trackBpm: getEffectiveBpm(trackA),
          playbackRate: Math.max(0.7, Math.min(1.35, 1 + deckAPitchPctRef.current / 100)),
        };
      } else if (deckBPlayingRef.current && deckBTrackRef.current) {
        const trackB = deckBTrackRef.current;
        anchorDeck = {
          isPlaying: true,
          trackTimeSec: deckBTimeRef.current,
          firstBeatSec: trackB.downbeatTimes[0] ?? trackB.beatTimes[0] ?? 0,
          trackBpm: getEffectiveBpm(trackB),
          playbackRate: Math.max(0.7, Math.min(1.35, 1 + deckBPitchPctRef.current / 100)),
        };
      } else if (isAutoSetPlayingRef.current && renderedScheduleRef.current) {
        anchorDeck = {
          isPlaying: true,
          trackTimeSec: autoSetTimeRef.current,
          firstBeatSec: renderedScheduleRef.current.beatTimesTimeline[0] ?? 0,
          trackBpm: detectedMasterBpm,
          playbackRate: 1,
        };
      }

      const q = computeNextQuantizedTriggerDelay({
        quantize: samplerQuantize,
        projectBpm: detectedMasterBpm,
        ctxCurrentTime: ctx.currentTime,
        anchorDeck,
      });

      if (samplerChokeMode) {
        stopAllSamplerVoices();
      }

      const source = ctx.createBufferSource();
      source.buffer = pad.audioBuffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = pad.gain * samplerMasterVolumeRef.current;

      source.connect(gainNode);
      gainNode.connect(master);

      const voiceEntry = { padId, source, gainNode };
      samplerActiveVoicesRef.current.push(voiceEntry);

      source.onended = () => {
        samplerActiveVoicesRef.current = samplerActiveVoicesRef.current.filter(
          (v) => v !== voiceEntry
        );
        try {
          source.disconnect();
          gainNode.disconnect();
        } catch {
          // ignore cleanup
        }
        const stillHasPadVoice = samplerActiveVoicesRef.current.some((v) => v.padId === padId);
        if (!stillHasPadVoice) {
          setSamplerPadPlayingState((prev) =>
            prev[padId] ? { ...prev, [padId]: false } : prev
          );
        }
      };

      const startAtCtx = ctx.currentTime + q.delaySec;
      source.start(startAtCtx);

      if (q.waitMs >= 16) {
        setSamplerPadQueuedState((prev) => ({ ...prev, [padId]: true }));
        const fireTid = window.setTimeout(() => {
          setSamplerPadQueuedState((prev) => ({ ...prev, [padId]: false }));
          setSamplerPadPlayingState((prev) => ({ ...prev, [padId]: true }));
          beatStateRef.current.burstIntensity = Math.max(
            beatStateRef.current.burstIntensity,
            0.6
          );
        }, q.waitMs);
        samplerTimersRef.current.push(fireTid);
      } else {
        setSamplerPadPlayingState((prev) => ({ ...prev, [padId]: true }));
        beatStateRef.current.burstIntensity = Math.max(
          beatStateRef.current.burstIntensity,
          0.6
        );
      }
    },
    [detectedMasterBpm, ensureMasterBus, samplerChokeMode, samplerQuantize, stopAllSamplerVoices]
  );

  const handleRecordSamplerPad = useCallback(
    async (padId: string) => {
      if (samplerRecordingPadId === padId) {
        stopActiveSamplerRecorder();
        return;
      }
      if (samplerRecordingPadId !== null) {
        stopActiveSamplerRecorder();
      }

      const pad = samplerPadsRef.current.find((p) => p.id === padId);
      if (!pad) return;

      const bus = await ensureMasterBus();
      if (!bus) {
        setErrorMsg('Audio engine unavailable for sampling.');
        return;
      }
      const { ctx } = bus;

      // Deck A / Deck B Beat-Synced 1-Beat Chop Capture (Instant, no Mic required)
      if (samplerRecordSource === 'deckA' || samplerRecordSource === 'deckB') {
        const track = samplerRecordSource === 'deckA' ? deckATrack : deckBTrack;
        if (!track) {
          setErrorMsg(
            `Load a track into Deck ${samplerRecordSource === 'deckA' ? 'A' : 'B'} to sample a one-shot chop.`
          );
          return;
        }
        const rawTime = samplerRecordSource === 'deckA' ? deckATimeRef.current : deckBTimeRef.current;
        const beatSec = 60 / Math.max(40, getEffectiveBpm(track));
        const snappedStart =
          track.beatTimes.length > 0
            ? Math.min(track.duration - 0.12, findNearestBeat(track.beatTimes, rawTime))
            : Math.max(0, Math.min(track.duration - 0.12, rawTime));
        const sliceDur = Math.min(1.5, Math.max(0.28, beatSec));
        const slicedBuf = sliceDeckOneShotBuffer(ctx, track.audioBuffer, snappedStart, sliceDur);
        const peaks = extractSamplerPeaks(slicedBuf, 28);
        const deckLabel = samplerRecordSource === 'deckA' ? 'Deck A Chop' : 'Deck B Chop';

        setSamplerPads((prev) =>
          prev.map((p) =>
            p.id === padId
              ? {
                  ...p,
                  name: p.sourceKind === 'empty' || p.name.startsWith('Rec Pad') ? deckLabel : p.name,
                  audioBuffer: slicedBuf,
                  peaks,
                  durationSec: slicedBuf.duration,
                  sourceKind: 'deck',
                  recordedBpm: Number(detectedMasterBpm.toFixed(1)),
                }
              : p
          )
        );
        setStatusMessage(
          `Sampled ${slicedBuf.duration.toFixed(2)}s 1-Beat chop from ${deckLabel} (${track.title}) into Pad ${pad.slotIndex + 1}.`
        );
        return;
      }

      // Live Recording via Microphone or Master Output Stream
      let stream: MediaStream | null = null;
      let isMic = samplerRecordSource === 'mic';

      if (isMic) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setErrorMsg('Microphone recording is not supported in this browser.');
          return;
        }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          setErrorMsg(
            err instanceof Error
              ? `Microphone permission error: ${err.message}`
              : 'Microphone access was denied.'
          );
          return;
        }
      } else {
        if (!masterStreamDestRef.current) {
          setErrorMsg('Master output stream recording is not supported in this browser.');
          return;
        }
        stream = masterStreamDestRef.current.stream;
      }

      if (typeof MediaRecorder === 'undefined') {
        if (isMic) stream.getTracks().forEach((t) => t.stop());
        setErrorMsg('MediaRecorder is unavailable in this browser.');
        return;
      }

      if (isMic) {
        samplerMicStreamRef.current = stream;
      }

      // Real-time level meter during capture
      try {
        const meterSource = ctx.createMediaStreamSource(stream);
        const meterAnalyser = ctx.createAnalyser();
        meterAnalyser.fftSize = 256;
        meterSource.connect(meterAnalyser);
        const meterBuf = new Uint8Array(meterAnalyser.fftSize);
        const pollLevel = () => {
          meterAnalyser.getByteTimeDomainData(meterBuf);
          let peak = 0;
          for (let i = 0; i < meterBuf.length; i++) {
            const amp = Math.abs(meterBuf[i] - 128) / 128;
            if (amp > peak) peak = amp;
          }
          setSamplerMicLevel(Math.min(1, peak * 2.4));
          samplerMicMeterRafRef.current = requestAnimationFrame(pollLevel);
        };
        samplerMicMeterRafRef.current = requestAnimationFrame(pollLevel);
        samplerMicMeterCleanupRef.current = () => {
          try {
            meterSource.disconnect();
            meterAnalyser.disconnect();
          } catch {
            // ignore disconnect
          }
        };
      } catch {
        // fallback cleanly if analyser source isn't attachable
      }

      const chunks: Blob[] = [];
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) {
        if (isMic) stream.getTracks().forEach((t) => t.stop());
        setErrorMsg(err instanceof Error ? err.message : 'Could not initialize audio recorder.');
        return;
      }

      samplerRecorderRef.current = recorder;
      setSamplerRecordingPadId(padId);
      setSamplerRecordElapsedSec(0);

      const startedPerfMs = performance.now();
      samplerRecordIntervalRef.current = window.setInterval(() => {
        setSamplerRecordElapsedSec((performance.now() - startedPerfMs) / 1000);
      }, 60);

      // Auto-stop one-shot recordings cleanly at 8 seconds max
      samplerRecordAutoStopRef.current = window.setTimeout(() => {
        stopActiveSamplerRecorder();
      }, 8000);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunks.push(ev.data);
        }
      };

      recorder.onstop = () => {
        if (samplerRecordIntervalRef.current !== null) {
          window.clearInterval(samplerRecordIntervalRef.current);
          samplerRecordIntervalRef.current = null;
        }
        if (samplerRecordAutoStopRef.current !== null) {
          window.clearTimeout(samplerRecordAutoStopRef.current);
          samplerRecordAutoStopRef.current = null;
        }
        if (samplerMicMeterRafRef.current !== null) {
          cancelAnimationFrame(samplerMicMeterRafRef.current);
          samplerMicMeterRafRef.current = null;
        }
        if (samplerMicMeterCleanupRef.current) {
          samplerMicMeterCleanupRef.current();
          samplerMicMeterCleanupRef.current = null;
        }
        if (isMic && samplerMicStreamRef.current) {
          samplerMicStreamRef.current.getTracks().forEach((t) => t.stop());
          samplerMicStreamRef.current = null;
        }
        samplerRecorderRef.current = null;
        setSamplerRecordingPadId(null);
        setSamplerRecordElapsedSec(0);
        setSamplerMicLevel(0);

        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        if (blob.size === 0) {
          setErrorMsg('No audio data captured during sampler recording.');
          return;
        }

        void (async () => {
          try {
            const arr = await blob.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arr);
            const trimmed = trimSilentEdgesFromBuffer(ctx, decoded, 0.012);
            const peaks = extractSamplerPeaks(trimmed, 28);
            const defaultTitle = isMic
              ? `Mic Shot ${pad.slotIndex + 1}`
              : `Mix Shot ${pad.slotIndex + 1}`;
            setSamplerPads((prev) =>
              prev.map((p) =>
                p.id === padId
                  ? {
                      ...p,
                      name:
                        p.sourceKind === 'empty' || p.name.startsWith('Rec Pad')
                          ? defaultTitle
                          : p.name,
                      audioBuffer: trimmed,
                      peaks,
                      durationSec: trimmed.duration,
                      sourceKind: isMic ? 'mic' : 'master',
                      recordedBpm: Number(detectedMasterBpm.toFixed(1)),
                    }
                  : p
              )
            );
            setStatusMessage(
              `Recorded ${trimmed.duration.toFixed(2)}s trimmed one-shot to Pad ${pad.slotIndex + 1} (${isMic ? 'Microphone' : 'Master Output'}).`
            );
          } catch (decodeErr) {
            setErrorMsg(
              decodeErr instanceof Error
                ? `Failed to decode recorded sample: ${decodeErr.message}`
                : 'Failed to decode recorded sample.'
            );
          }
        })();
      };

      recorder.start(100);
      setStatusMessage(
        `Recording Pad ${pad.slotIndex + 1} from ${isMic ? 'Microphone' : 'Master Output'}… click Stop when done.`
      );
    },
    [
      deckATrack,
      deckBTrack,
      detectedMasterBpm,
      ensureMasterBus,
      samplerRecordSource,
      samplerRecordingPadId,
      stopActiveSamplerRecorder,
    ]
  );

  const handleLoadAudioFileToSamplerPad = useCallback(
    async (padId: string, file: File) => {
      const bus = await ensureMasterBus();
      if (!bus) return;
      try {
        const arr = await file.arrayBuffer();
        const decoded = await bus.ctx.decodeAudioData(arr);
        const trimmed = trimSilentEdgesFromBuffer(bus.ctx, decoded, 0.008);
        const peaks = extractSamplerPeaks(trimmed, 28);
        const cleanName = file.name.replace(/\.[^/.]+$/, '').slice(0, 18) || 'Sample';
        setSamplerPads((prev) =>
          prev.map((p) =>
            p.id === padId
              ? {
                  ...p,
                  name: cleanName,
                  audioBuffer: trimmed,
                  peaks,
                  durationSec: trimmed.duration,
                  sourceKind: 'file',
                  recordedBpm: Number(detectedMasterBpm.toFixed(1)),
                }
              : p
          )
        );
        setStatusMessage(`Loaded "${cleanName}" (${trimmed.duration.toFixed(2)}s) into Sampler.`);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? `Failed to load sample: ${err.message}` : 'Unsupported audio sample file.'
        );
      }
    },
    [detectedMasterBpm, ensureMasterBus]
  );

  const handleClearSamplerPad = useCallback(
    (padId: string) => {
      samplerActiveVoicesRef.current
        .filter((v) => v.padId === padId)
        .forEach((v) => {
          try {
            v.source.stop();
            v.source.disconnect();
          } catch {
            // ignore
          }
        });
      samplerActiveVoicesRef.current = samplerActiveVoicesRef.current.filter(
        (v) => v.padId !== padId
      );
      setSamplerPadQueuedState((prev) => ({ ...prev, [padId]: false }));
      setSamplerPadPlayingState((prev) => ({ ...prev, [padId]: false }));
      setSamplerPads((prev) =>
        prev.map((p, idx) =>
          p.id === padId
            ? {
                ...p,
                name: `Rec Pad ${idx + 1}`,
                audioBuffer: null,
                peaks: [],
                durationSec: 0,
                sourceKind: 'empty',
                recordedBpm: null,
              }
            : p
        )
      );
    },
    []
  );

  // Keyboard finger-drumming shortcuts (1-8) for Sampler Pads when DJ Studio is open
  useEffect(() => {
    if (!isOpen || !samplerKeyTriggersEnabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const num = Number(e.key);
      if (Number.isInteger(num) && num >= 1 && num <= 8) {
        const pad = samplerPadsRef.current[num - 1];
        if (pad) {
          e.preventDefault();
          void handleTriggerSamplerPad(pad.id);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTriggerSamplerPad, isOpen, samplerKeyTriggersEnabled]);

  // Sync live Loop Deck parameters (volume, filter sweep, beat-synced loop length) in real time
  useEffect(() => {
    const chain = loopDeckChainRef.current;
    if (!chain || !capturedLoop) return;
    const ctx = chain.gainNode.context;
    const now = ctx.currentTime;
    chain.gainNode.gain.setTargetAtTime(loopDeckVolume, now, 0.02);

    if (Math.abs(loopDeckFilterSweep) < 0.03) {
      chain.sweepFilter.type = 'allpass';
      chain.sweepFilter.Q.setTargetAtTime(0.7, now, 0.02);
    } else if (loopDeckFilterSweep < 0) {
      chain.sweepFilter.type = 'highpass';
      const freq = 35 * Math.pow(130, Math.abs(loopDeckFilterSweep));
      chain.sweepFilter.frequency.setTargetAtTime(freq, now, 0.02);
      chain.sweepFilter.Q.setTargetAtTime(2.4, now, 0.02);
    } else {
      chain.sweepFilter.type = 'lowpass';
      const freq = 18000 * Math.pow(0.015, loopDeckFilterSweep);
      chain.sweepFilter.frequency.setTargetAtTime(freq, now, 0.02);
      chain.sweepFilter.Q.setTargetAtTime(2.4, now, 0.02);
    }

    const beatSec = 60 / Math.max(40, capturedLoop.bpm);
    const nextEnd = Math.min(
      capturedLoop.audioBuffer.duration,
      Math.max(
        capturedLoop.captureStartSec + 0.05,
        capturedLoop.captureStartSec + beatSec * loopDeckBeats
      )
    );
    chain.loopStartSec = capturedLoop.captureStartSec;
    chain.loopEndSec = nextEnd;
    chain.source.loop = true;
    chain.source.loopStart = capturedLoop.captureStartSec;
    chain.source.loopEnd = nextEnd;
  }, [capturedLoop, loopDeckBeats, loopDeckFilterSweep, loopDeckVolume]);

  // Start or re-trigger the Loop Deck from a CapturedLoopData slice
  const startLoopDeckWithCapture = useCallback(
    async (capture: CapturedLoopData, beatsOverride?: LoopBeatLength) => {
      stopLoopDeckPlayback();
      const bus = await ensureMasterBus();
      if (!bus) return;
      const { ctx, master } = bus;

      const beats = beatsOverride ?? loopDeckBeats;
      const beatSec = 60 / Math.max(40, capture.bpm);
      const safeStart = Math.max(
        0,
        Math.min(capture.audioBuffer.duration - 0.1, capture.captureStartSec)
      );
      const safeEnd = Math.min(
        capture.audioBuffer.duration,
        Math.max(safeStart + 0.05, safeStart + beatSec * beats)
      );

      const source = ctx.createBufferSource();
      source.buffer = capture.audioBuffer;
      source.playbackRate.value = capture.playbackRate;
      source.loop = true;
      source.loopStart = safeStart;
      source.loopEnd = safeEnd;

      const sweepFilter = ctx.createBiquadFilter();
      if (Math.abs(loopDeckFilterSweep) < 0.03) {
        sweepFilter.type = 'allpass';
        sweepFilter.frequency.value = 1200;
        sweepFilter.Q.value = 0.7;
      } else if (loopDeckFilterSweep < 0) {
        sweepFilter.type = 'highpass';
        sweepFilter.frequency.value = 35 * Math.pow(130, Math.abs(loopDeckFilterSweep));
        sweepFilter.Q.value = 2.4;
      } else {
        sweepFilter.type = 'lowpass';
        sweepFilter.frequency.value = 18000 * Math.pow(0.015, loopDeckFilterSweep);
        sweepFilter.Q.value = 2.4;
      }

      const gainNode = ctx.createGain();
      gainNode.gain.value = loopDeckVolume;

      source.connect(sweepFilter);
      sweepFilter.connect(gainNode);
      gainNode.connect(master);

      const chain: LiveLoopDeckChain = {
        source,
        sweepFilter,
        gainNode,
        startedAtPerfMs: performance.now(),
        playbackRate: capture.playbackRate,
        loopStartSec: safeStart,
        loopEndSec: safeEnd,
      };
      loopDeckChainRef.current = chain;
      setLoopDeckPlaying(true);

      source.onended = () => {
        if (loopDeckChainRef.current === chain) {
          loopDeckChainRef.current = null;
          setLoopDeckPlaying(false);
        }
      };

      source.start(0, safeStart);
    },
    [ensureMasterBus, loopDeckBeats, loopDeckFilterSweep, loopDeckVolume, stopLoopDeckPlayback]
  );

  // Capture a section of currently playing (or selected) audio into the Loop Deck
  const handleCaptureToLoopDeck = useCallback(async () => {
    let resolvedSource: 'A' | 'B' | 'set' = 'A';
    if (loopDeckSourceMode !== 'auto') {
      resolvedSource = loopDeckSourceMode;
    } else if (isAutoSetPlayingRef.current && renderedMixBuffer) {
      resolvedSource = 'set';
    } else if (deckAPlayingRef.current && deckBPlayingRef.current) {
      resolvedSource = crossfaderRef.current > 0 ? 'B' : 'A';
    } else if (deckBPlayingRef.current && deckBTrack) {
      resolvedSource = 'B';
    } else if (deckAPlayingRef.current && deckATrack) {
      resolvedSource = 'A';
    } else if (renderedMixBuffer) {
      resolvedSource = 'set';
    } else if (deckATrack) {
      resolvedSource = 'A';
    } else if (deckBTrack) {
      resolvedSource = 'B';
    }

    let sourceBuffer: AudioBuffer | null = null;
    let rawTime = 0;
    let bpm = 124;
    let playbackRate = 1;
    let beatTimes: number[] = [];
    let sourceLabel = 'Deck A';
    let sourceTitle = 'Track';
    let accentHex = '#22d3ee';

    if (resolvedSource === 'set' && renderedMixBuffer) {
      sourceBuffer = renderedMixBuffer;
      rawTime = autoSetTimeRef.current;
      bpm =
        renderedScheduleRef.current?.segments[0]?.targetBpm ??
        (deckATrack ? getEffectiveBpm(deckATrack) : 124);
      playbackRate = 1;
      beatTimes = renderedScheduleRef.current?.beatTimesTimeline ?? [];
      sourceLabel = 'Master Set';
      sourceTitle = settingsRef.current.trackTitle.trim() || 'DJ Mix Set';
      accentHex = '#e879f9';
    } else if (resolvedSource === 'B' && deckBTrack) {
      sourceBuffer = deckBTrack.audioBuffer;
      rawTime = deckBTimeRef.current;
      bpm = getEffectiveBpm(deckBTrack);
      playbackRate = Math.max(0.7, Math.min(1.35, 1 + deckBPitchPct / 100));
      beatTimes = deckBTrack.beatTimes;
      sourceLabel = 'Deck B';
      sourceTitle = deckBTrack.title;
      accentHex = '#f59e0b';
    } else if (deckATrack) {
      sourceBuffer = deckATrack.audioBuffer;
      rawTime = deckATimeRef.current;
      bpm = getEffectiveBpm(deckATrack);
      playbackRate = Math.max(0.7, Math.min(1.35, 1 + deckAPitchPct / 100));
      beatTimes = deckATrack.beatTimes;
      sourceLabel = 'Deck A';
      sourceTitle = deckATrack.title;
      accentHex = '#22d3ee';
    } else if (currentAudioBuffer) {
      sourceBuffer = currentAudioBuffer;
      rawTime = 0;
      bpm = 120;
      playbackRate = 1;
      beatTimes = [];
      sourceLabel = 'Studio Audio';
      sourceTitle = currentAudioFileName || 'Studio Track';
      accentHex = '#22d3ee';
    }

    if (!sourceBuffer) {
      setErrorMsg('Load or play a track first to capture a section into the Loop Deck.');
      return;
    }

    const clamped = Math.max(0, Math.min(sourceBuffer.duration - 0.25, rawTime));
    const startSec =
      loopDeckQuantize && beatTimes.length > 0
        ? Math.min(sourceBuffer.duration - 0.25, findNearestBeat(beatTimes, clamped))
        : Number(clamped.toFixed(2));
    const beatSec = 60 / Math.max(40, bpm);
    const windowPeaks = extractWindowPeaks(sourceBuffer, startSec, beatSec * 4, 96);

    const capture: CapturedLoopData = {
      sourceLabel,
      sourceTitle,
      audioBuffer: sourceBuffer,
      captureStartSec: Number(startSec.toFixed(2)),
      bpm,
      playbackRate,
      beatTimes,
      windowPeaks,
      accentHex,
    };

    setCapturedLoop(capture);
    await startLoopDeckWithCapture(capture, loopDeckBeats);
    setStatusMessage(
      `Loop Deck captured ${loopDeckBeats === 0.25 ? '1/4' : loopDeckBeats === 0.5 ? '1/2' : loopDeckBeats} beats from ${sourceLabel} (${capture.sourceTitle}) @ ${formatDjClock(capture.captureStartSec)}.`
    );
  }, [
    currentAudioBuffer,
    currentAudioFileName,
    deckAPitchPct,
    deckATrack,
    deckBPitchPct,
    deckBTrack,
    loopDeckBeats,
    loopDeckQuantize,
    loopDeckSourceMode,
    renderedMixBuffer,
    startLoopDeckWithCapture,
  ]);

  const handleShiftLoopWindow = useCallback(
    (deltaBeats: number) => {
      if (!capturedLoop) return;
      const beatSec = 60 / Math.max(40, capturedLoop.bpm);
      const nextStart = Math.max(
        0,
        Math.min(
          capturedLoop.audioBuffer.duration - beatSec * 0.5,
          capturedLoop.captureStartSec + deltaBeats * beatSec
        )
      );
      const snapped =
        loopDeckQuantize && capturedLoop.beatTimes.length > 0
          ? findNearestBeat(capturedLoop.beatTimes, nextStart)
          : Number(nextStart.toFixed(2));
      const updated: CapturedLoopData = {
        ...capturedLoop,
        captureStartSec: Number(snapped.toFixed(2)),
        windowPeaks: extractWindowPeaks(capturedLoop.audioBuffer, snapped, beatSec * 4, 96),
      };
      setCapturedLoop(updated);
      if (loopDeckPlayingRef.current) {
        void startLoopDeckWithCapture(updated, loopDeckBeats);
      }
    },
    [capturedLoop, loopDeckBeats, loopDeckQuantize, startLoopDeckWithCapture]
  );

  // Shared builder for live deck EQ / Filter / Echo / Crossfade bus
  const createDeckFilterChain = useCallback(
    (
      ctx: AudioContext,
      master: GainNode,
      deck: 'A' | 'B',
      track: DjTrackAsset,
      offsetSec: number,
      rate: number,
      eq: DjDeckEqSettings,
      loopBeats: 0 | 4 | 8
    ): LiveDeckAudioChain => {
      const { gainA, gainB } = getCrossfadeGains(crossfaderRef.current);

      const lowEq = ctx.createBiquadFilter();
      lowEq.type = 'lowshelf';
      lowEq.frequency.value = eq.lowCrossoverHz ?? 230;
      lowEq.gain.value = eq.lowGainDb;

      const midEq = ctx.createBiquadFilter();
      midEq.type = 'peaking';
      midEq.frequency.value = eq.midCenterHz ?? 1100;
      midEq.Q.value = 1.0;
      midEq.gain.value = eq.midGainDb;

      const highEq = ctx.createBiquadFilter();
      highEq.type = 'highshelf';
      highEq.frequency.value = eq.highCrossoverHz ?? 4000;
      highEq.gain.value = eq.highGainDb;

      const sweepFilter = ctx.createBiquadFilter();
      if (Math.abs(eq.filterSweep) < 0.03) {
        sweepFilter.type = 'allpass';
        sweepFilter.frequency.value = 1200;
        sweepFilter.Q.value = 0.7;
      } else if (eq.filterSweep < 0) {
        sweepFilter.type = 'highpass';
        sweepFilter.frequency.value = 35 * Math.pow(130, Math.abs(eq.filterSweep));
        sweepFilter.Q.value = 2.6;
      } else {
        sweepFilter.type = 'lowpass';
        sweepFilter.frequency.value = 18000 * Math.pow(0.015, eq.filterSweep);
        sweepFilter.Q.value = 2.6;
      }

      const trimGain = ctx.createGain();
      trimGain.gain.value = eq.trimGain;

      // Pre-fader monitor bus (post-EQ, filter, trim, & deck echo — tapped BEFORE crossfadeGain)
      const preFaderMonitorGain = ctx.createGain();
      preFaderMonitorGain.gain.value = 1;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = Math.max(0.05, Math.min(0.95, settingsRef.current.smoothing));

      const beatLowPass = ctx.createBiquadFilter();
      beatLowPass.type = 'lowpass';
      beatLowPass.frequency.value = 140;
      beatLowPass.Q.value = 1.2;

      const beatAnalyser = ctx.createAnalyser();
      beatAnalyser.fftSize = 1024;
      beatAnalyser.smoothingTimeConstant = 0.2;

      const crossfadeGain = ctx.createGain();
      crossfadeGain.gain.value = deck === 'A' ? gainA : gainB;

      // Built-in Echo FX send chain
      const beatSec = 60 / Math.max(40, getEffectiveBpm(track) * rate);
      const delayDry = ctx.createGain();
      delayDry.gain.value = 1;
      const delayNode = ctx.createDelay(2.0);
      delayNode.delayTime.value = Math.min(1.5, Math.max(0.12, beatSec * 0.75));
      const delayFeedback = ctx.createGain();
      delayFeedback.gain.value = 0.42;
      const delayWet = ctx.createGain();
      delayWet.gain.value = 0;

      lowEq.connect(midEq);
      midEq.connect(highEq);
      highEq.connect(sweepFilter);
      sweepFilter.connect(trimGain);

      trimGain.connect(delayDry);
      delayDry.connect(preFaderMonitorGain);

      trimGain.connect(delayNode);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayWet);
      delayWet.connect(preFaderMonitorGain);

      preFaderMonitorGain.connect(analyser);
      preFaderMonitorGain.connect(beatLowPass);
      beatLowPass.connect(beatAnalyser);

      preFaderMonitorGain.connect(crossfadeGain);
      crossfadeGain.connect(master);

      return {
        source: null,
        sourceGain: null,
        scratchSession: null,
        isScratching: false,
        lowEq,
        midEq,
        highEq,
        sweepFilter,
        delayDry,
        delayNode,
        delayFeedback,
        delayWet,
        trimGain,
        preFaderMonitorGain,
        analyser,
        beatLowPass,
        beatAnalyser,
        crossfadeGain,
        startedAtAudioTime: ctx.currentTime,
        startedAtPerfMs: performance.now(),
        offsetSec,
        playbackRate: rate,
        loopBeats,
      };
    },
    [getCrossfadeGains]
  );

  // Start or pause a live individual DJ Deck (Manual / Interactive DJ workflow)
  const startLiveDeckFromTime = useCallback(
    async (deck: 'A' | 'B', startTimeSec: number, overridePitchPct?: number) => {
      const track = deck === 'A' ? deckATrackRef.current : deckBTrackRef.current;
      if (!track) return;

      stopAutoSetPlayback();
      stopDeckChain(deck);

      const bus = await ensureMasterBus();
      if (!bus) return;
      const { ctx, master } = bus;

      const safeStart = Math.max(0, Math.min(track.duration - 0.05, startTimeSec));
      const eq = deck === 'A' ? eqA : eqB;
      const pitchPct = overridePitchPct ?? (deck === 'A' ? deckAPitchPct : deckBPitchPct);
      const loopBeats = deck === 'A' ? deckALoopBeats : deckBLoopBeats;
      const rate = Math.max(0.7, Math.min(1.35, 1 + pitchPct / 100));

      const source = ctx.createBufferSource();
      source.buffer = track.audioBuffer;
      source.playbackRate.value = rate;

      const sourceGain = ctx.createGain();
      sourceGain.gain.value = 1;

      if (loopBeats > 0) {
        source.loop = true;
        source.loopStart = safeStart;
        source.loopEnd = Math.min(track.duration, safeStart + (60 / getEffectiveBpm(track)) * loopBeats);
      }

      const chain = createDeckFilterChain(ctx, master, deck, track, safeStart, rate, eq, loopBeats);
      chain.source = source;
      chain.sourceGain = sourceGain;
      source.connect(sourceGain);
      sourceGain.connect(chain.lowEq);

      if (deck === 'A') {
        deckAChainRef.current = chain;
        setDeckATime(safeStart);
        setDeckAPlaying(true);
      } else {
        deckBChainRef.current = chain;
        setDeckBTime(safeStart);
        setDeckBPlaying(true);
      }

      source.onended = () => {
        const currentRef = deck === 'A' ? deckAChainRef : deckBChainRef;
        if (currentRef.current === chain && chain.source === source && !chain.isScratching) {
          currentRef.current = null;
          if (deck === 'A') setDeckAPlaying(false);
          else setDeckBPlaying(false);
        }
      };

      source.start(0, safeStart);
    },
    [
      createDeckFilterChain,
      deckALoopBeats,
      deckAPitchPct,
      deckBLoopBeats,
      deckBPitchPct,
      ensureMasterBus,
      eqA,
      eqB,
      stopAutoSetPlayback,
      stopDeckChain,
    ]
  );

  // Analog Vinyl Scratch handlers for waveform & platter dragging
  const startDeckScratch = useCallback(
    async (deck: 'A' | 'B', initialBackspinRate?: number) => {
      const track = deck === 'A' ? deckATrackRef.current : deckBTrackRef.current;
      if (!track) return;

      const ref = deck === 'A' ? deckAChainRef : deckBChainRef;
      const existingChain = ref.current;

      // If already in a live scratch/coast session, grab the needle directly without restarting AudioContext nodes
      if (existingChain?.scratchSession) {
        if (initialBackspinRate !== undefined) {
          existingChain.scratchSession.triggerBackspin(initialBackspinRate);
        } else {
          existingChain.scratchSession.holdPlatter();
        }
        existingChain.isScratching = true;
        if (deck === 'A') setDeckAScratching(true);
        else setDeckBScratching(true);
        return;
      }

      if (scratchStartingRef.current[deck]) return;
      scratchStartingRef.current[deck] = true;
      scratchReleaseQueuedRef.current[deck] = false;

      const wasPlaying =
        initialBackspinRate !== undefined
          ? false
          : deck === 'A'
            ? deckAPlayingRef.current
            : deckBPlayingRef.current;
      const curTime = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;

      stopAutoSetPlayback();

      // Stop regular AudioBufferSourceNode if currently playing
      if (existingChain?.source) {
        try {
          existingChain.source.onended = null;
          existingChain.source.stop();
          existingChain.source.disconnect();
        } catch {
          // ignore
        }
        existingChain.source = null;
      }
      if (existingChain?.sourceGain) {
        try {
          existingChain.sourceGain.disconnect();
        } catch {
          // ignore
        }
        existingChain.sourceGain = null;
      }

      const bus = await ensureMasterBus();
      if (!bus) {
        scratchStartingRef.current[deck] = false;
        return;
      }
      const { ctx, master } = bus;

      const eq = deck === 'A' ? eqA : eqB;
      const pitchPct = deck === 'A' ? deckAPitchPct : deckBPitchPct;
      const loopBeats = deck === 'A' ? deckALoopBeats : deckBLoopBeats;
      const rate = Math.max(0.7, Math.min(1.35, 1 + pitchPct / 100));
      const slip = deck === 'A' ? deckASlipModeRef.current : deckBSlipModeRef.current;

      const chain =
        existingChain ??
        createDeckFilterChain(ctx, master, deck, track, curTime, rate, eq, loopBeats);

      const loopStartSec = loopBeats > 0 ? chain.offsetSec : null;
      const loopEndSec =
        loopBeats > 0
          ? Math.min(track.duration, chain.offsetSec + (60 / getEffectiveBpm(track)) * loopBeats)
          : null;

      let lastUiRatePushMs = 0;
      const session = createDjVinylScratchSession({
        ctx,
        buffer: track.audioBuffer,
        destination: chain.lowEq,
        initialTimeSec: curTime,
        normalPlaybackRate: rate,
        wasPlaying,
        slipMode: slip,
        loopStartSec,
        loopEndSec,
        onPositionUpdate: (timeSec, velocityRate) => {
          if (deck === 'A') {
            deckATimeRef.current = timeSec;
            setDeckATime(timeSec);
          } else {
            deckBTimeRef.current = timeSec;
            setDeckBTime(timeSec);
          }
          const now = performance.now();
          if (now - lastUiRatePushMs >= 24) {
            lastUiRatePushMs = now;
            const rounded = Number(velocityRate.toFixed(2));
            if (deck === 'A') {
              deckAScratchRateRef.current = rounded;
              setDeckAScratchRate(rounded);
            } else {
              deckBScratchRateRef.current = rounded;
              setDeckBScratchRate(rounded);
            }
          }
        },
        onCoastComplete: (finalTimeSec, resumeNormalPlay) => {
          const activeChain = ref.current;
          if (activeChain?.scratchSession === session) {
            session.dispose();
            activeChain.scratchSession = null;
            activeChain.isScratching = false;
          }
          if (deck === 'A') {
            deckAScratchRateRef.current = null;
            setDeckAScratchRate(null);
            setDeckAScratching(false);
            setDeckATime(finalTimeSec);
          } else {
            deckBScratchRateRef.current = null;
            setDeckBScratchRate(null);
            setDeckBScratching(false);
            setDeckBTime(finalTimeSec);
          }
          if (resumeNormalPlay) {
            void startLiveDeckFromTime(deck, finalTimeSec);
          } else {
            if (ref.current === activeChain) {
              ref.current = null;
            }
            if (deck === 'A') setDeckAPlaying(false);
            else setDeckBPlaying(false);
          }
        },
      });

      chain.scratchSession = session;
      chain.isScratching = true;
      ref.current = chain;
      scratchStartingRef.current[deck] = false;

      if (deck === 'A') setDeckAScratching(true);
      else setDeckBScratching(true);

      if (initialBackspinRate !== undefined) {
        session.triggerBackspin(initialBackspinRate);
        return;
      }

      const pendingMove = scratchPendingMoveRef.current[deck];
      if (pendingMove) {
        scratchPendingMoveRef.current[deck] = null;
        session.nudgePositionAndVelocity(pendingMove.deltaSec, pendingMove.velocityRate);
      }

      if (scratchReleaseQueuedRef.current[deck]) {
        scratchReleaseQueuedRef.current[deck] = false;
        session.release();
      }
    },
    [
      createDeckFilterChain,
      deckALoopBeats,
      deckAPitchPct,
      deckBLoopBeats,
      deckBPitchPct,
      ensureMasterBus,
      eqA,
      eqB,
      startLiveDeckFromTime,
      stopAutoSetPlayback,
    ]
  );

  const moveDeckScratch = useCallback(
    (deck: 'A' | 'B', deltaSec: number, velocityRate: number) => {
      const ref = deck === 'A' ? deckAChainRef : deckBChainRef;
      const session = ref.current?.scratchSession;
      if (session) {
        session.nudgePositionAndVelocity(deltaSec, velocityRate);
      } else {
        scratchPendingMoveRef.current[deck] = { deltaSec, velocityRate };
        if (!scratchStartingRef.current[deck]) {
          void startDeckScratch(deck);
        }
      }
    },
    [startDeckScratch]
  );

  const endDeckScratch = useCallback((deck: 'A' | 'B') => {
    const ref = deck === 'A' ? deckAChainRef : deckBChainRef;
    const session = ref.current?.scratchSession;
    if (session) {
      session.release();
    } else if (scratchStartingRef.current[deck]) {
      scratchReleaseQueuedRef.current[deck] = true;
    } else {
      if (deck === 'A') {
        setDeckAScratching(false);
        setDeckAScratchRate(null);
      } else {
        setDeckBScratching(false);
        setDeckBScratchRate(null);
      }
    }
  }, []);

  const triggerDeckBackspin = useCallback(
    (deck: 'A' | 'B') => {
      void startDeckScratch(deck, -3.8);
      setStatusMessage(`Triggered Deck ${deck} vinyl backspin.`);
    },
    [startDeckScratch]
  );

  const toggleDeckPlay = useCallback(
    (deck: 'A' | 'B') => {
      const playing = deck === 'A' ? deckAPlayingRef.current : deckBPlayingRef.current;
      const t = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;
      if (playing) {
        stopDeckChain(deck);
      } else {
        void startLiveDeckFromTime(deck, t);
      }
    },
    [startLiveDeckFromTime, stopDeckChain]
  );

  // Micro-adjust track alignment (+/- 5ms, +/- 10ms) with click-free 8ms WebAudio crossfade when live
  const handleNudgeTrackAlignment = useCallback(
    (deck: 'A' | 'B', deltaMs: number, options?: { resetCounter?: boolean }) => {
      const track = deck === 'A' ? deckATrackRef.current : deckBTrackRef.current;
      if (!track) return;

      const deltaSec = deltaMs / 1000;
      const chainRef = deck === 'A' ? deckAChainRef : deckBChainRef;
      const chain = chainRef.current;

      const recordTelemetry = () => {
        const flashPayload = { deltaMs: Number(deltaMs.toFixed(1)), nonce: Date.now() };
        if (deck === 'A') {
          setDeckANudgeMs((prev) =>
            options?.resetCounter ? 0 : Number((prev + deltaMs).toFixed(1))
          );
          setDeckANudgeFlash(flashPayload);
          if (nudgeFlashTimerRef.current.A !== null) {
            window.clearTimeout(nudgeFlashTimerRef.current.A);
          }
          nudgeFlashTimerRef.current.A = window.setTimeout(() => {
            setDeckANudgeFlash(null);
          }, 1400);
        } else {
          setDeckBNudgeMs((prev) =>
            options?.resetCounter ? 0 : Number((prev + deltaMs).toFixed(1))
          );
          setDeckBNudgeFlash(flashPayload);
          if (nudgeFlashTimerRef.current.B !== null) {
            window.clearTimeout(nudgeFlashTimerRef.current.B);
          }
          nudgeFlashTimerRef.current.B = window.setTimeout(() => {
            setDeckBNudgeFlash(null);
          }, 1400);
        }
      };

      if (chain?.scratchSession && chain.isScratching) {
        chain.scratchSession.nudgePositionAndVelocity(deltaSec, chain.playbackRate);
        recordTelemetry();
        return;
      }

      const isPlaying = deck === 'A' ? deckAPlayingRef.current : deckBPlayingRef.current;
      if (chain && chain.source && isPlaying) {
        const ctx = chain.lowEq.context;
        const nowPerf = performance.now();
        const elapsed = ((nowPerf - chain.startedAtPerfMs) / 1000) * chain.playbackRate;
        const beatSec = 60 / Math.max(40, getEffectiveBpm(track));
        let currentLiveTime = chain.offsetSec + elapsed;
        let nextLoopAnchor = chain.offsetSec;
        let posInLoop = 0;

        if (chain.loopBeats > 0) {
          const loopDur = beatSec * chain.loopBeats;
          if (loopDur > 0.1) {
            posInLoop = ((elapsed % loopDur) + loopDur) % loopDur;
            currentLiveTime = chain.offsetSec + posInLoop;
            nextLoopAnchor = Math.max(
              0,
              Math.min(track.duration - 0.1, chain.offsetSec + deltaSec)
            );
          }
        }

        const nudgedTime = Math.max(
          0,
          Math.min(track.duration - 0.05, currentLiveTime + deltaSec)
        );

        const oldSource = chain.source;
        const oldGain = chain.sourceGain;
        const audioNow = ctx.currentTime;

        if (oldGain) {
          oldGain.gain.cancelScheduledValues(audioNow);
          oldGain.gain.setValueAtTime(oldGain.gain.value, audioNow);
          oldGain.gain.linearRampToValueAtTime(0.0001, audioNow + 0.008);
        }
        try {
          oldSource.onended = null;
          oldSource.stop(audioNow + 0.012);
        } catch {
          // ignore
        }
        window.setTimeout(() => {
          try {
            oldSource.disconnect();
            oldGain?.disconnect();
          } catch {
            // ignore
          }
        }, 24);

        const newSource = ctx.createBufferSource();
        newSource.buffer = track.audioBuffer;
        newSource.playbackRate.value = chain.playbackRate;
        if (chain.loopBeats > 0) {
          newSource.loop = true;
          newSource.loopStart = nextLoopAnchor;
          newSource.loopEnd = Math.min(
            track.duration,
            nextLoopAnchor + beatSec * chain.loopBeats
          );
        }

        const newGain = ctx.createGain();
        newGain.gain.setValueAtTime(0.0001, audioNow);
        newGain.gain.linearRampToValueAtTime(1, audioNow + 0.008);

        newSource.connect(newGain);
        newGain.connect(chain.lowEq);

        chain.source = newSource;
        chain.sourceGain = newGain;
        chain.offsetSec = chain.loopBeats > 0 ? nextLoopAnchor : nudgedTime;
        chain.startedAtAudioTime = audioNow;
        chain.startedAtPerfMs =
          chain.loopBeats > 0
            ? nowPerf - (posInLoop / Math.max(0.1, chain.playbackRate)) * 1000
            : nowPerf;

        newSource.onended = () => {
          if (chainRef.current === chain && chain.source === newSource && !chain.isScratching) {
            chainRef.current = null;
            if (deck === 'A') setDeckAPlaying(false);
            else setDeckBPlaying(false);
          }
        };

        newSource.start(audioNow, nudgedTime);

        if (deck === 'A') {
          deckATimeRef.current = nudgedTime;
          setDeckATime(nudgedTime);
        } else {
          deckBTimeRef.current = nudgedTime;
          setDeckBTime(nudgedTime);
        }

        recordTelemetry();
        return;
      }

      const curTime = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;
      const nextTime = Math.max(0, Math.min(track.duration - 0.05, curTime + deltaSec));
      if (deck === 'A') {
        deckATimeRef.current = nextTime;
        setDeckATime(nextTime);
      } else {
        deckBTimeRef.current = nextTime;
        setDeckBTime(nextTime);
      }
      recordTelemetry();
    },
    []
  );

  // Clean up on modal close & reset scene transition detector
  useEffect(() => {
    if (!isOpen) {
      stopAllDjPlayback();
      return;
    }
    setErrorMsg(null);
    setStatusMessage(null);
    setMobilePane('dj');
    prevVisualizerModeRef.current = settingsRef.current.visualizerMode;
    beatStateRef.current = createInitialBeatState();
    deckABeatStateRef.current = createInitialBeatState();
    deckBBeatStateRef.current = createInitialBeatState();
    particlesRef.current = [];
    deckAParticlesRef.current = [];
    deckBParticlesRef.current = [];
  }, [isOpen, stopAllDjPlayback]);

  // Trigger scene transition preview when visualizerMode changes inside DJ Studio
  useEffect(() => {
    if (!isOpen) return;
    const prevMode = prevVisualizerModeRef.current;
    if (prevMode !== settings.visualizerMode) {
      prevVisualizerModeRef.current = settings.visualizerMode;
      if (
        settings.sceneTransitionType !== 'none' &&
        !settings.lyricsOnly &&
        settings.displayLayer !== 'dance-only'
      ) {
        sceneTransRef.current = {
          activeMode: settings.visualizerMode,
          fromMode: prevMode,
          elapsed: 0,
          duration: Math.max(0.15, Math.min(1.5, settings.sceneTransitionDuration ?? 0.45)),
        };
      }
    }
  }, [
    isOpen,
    settings.visualizerMode,
    settings.sceneTransitionType,
    settings.sceneTransitionDuration,
    settings.lyricsOnly,
    settings.displayLayer,
  ]);

  // Revoke any video object URLs when modal unmounts
  useEffect(() => {
    const urlSet = sessionUrlsRef.current;
    return () => {
      autoSetVideoResolverRef.current?.dispose();
      for (const url of urlSet) {
        URL.revokeObjectURL(url);
      }
      urlSet.clear();
    };
  }, []);

  // Start playing rendered Auto-Mix Set from offset
  const startAutoSetFromTime = useCallback(
    async (offsetSec: number, overrideBuffer?: AudioBuffer) => {
      const buf = overrideBuffer ?? renderedMixBuffer;
      if (!buf) return;
      stopAllDjPlayback();

      const bus = await ensureMasterBus();
      if (!bus) return;
      const { ctx, master } = bus;

      const safeOffset = Math.max(0, Math.min(buf.duration - 0.05, offsetSec));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(master);

      autoSetSourceRef.current = src;
      autoSetStartOffsetRef.current = safeOffset;
      autoSetStartPerfRef.current = performance.now();
      setAutoSetTime(safeOffset);
      setIsAutoSetPlaying(true);

      src.onended = () => {
        if (autoSetSourceRef.current === src) {
          autoSetSourceRef.current = null;
          if (loopAutoSetRef.current) {
            void startAutoSetFromTime(0, buf);
          } else {
            setIsAutoSetPlaying(false);
          }
        }
      };

      src.start(0, safeOffset);
    },
    [ensureMasterBus, renderedMixBuffer, stopAllDjPlayback]
  );

  // Start playing 5-second AI Auto-Mix Transition Preview from local preview offset
  const startTransitionPreviewFromTime = useCallback(
    async (offsetSec: number, overridePreview?: DjTransitionPreviewRender | null) => {
      const target = overridePreview ?? aiTransitionPreviewRef.current;
      if (!target?.audioBuffer) return;
      stopAllDjPlayback();

      const bus = await ensureMasterBus();
      if (!bus) return;
      const { ctx, master } = bus;

      const buf = target.audioBuffer;
      const safeOffset = Math.max(0, Math.min(Math.max(0.05, buf.duration - 0.05), offsetSec));
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(master);

      previewSourceRef.current = src;
      previewStartOffsetRef.current = safeOffset;
      previewStartPerfRef.current = performance.now();
      setPreviewTimeSec(safeOffset);
      setIsPreviewPlaying(true);

      src.onended = () => {
        if (previewSourceRef.current === src) {
          previewSourceRef.current = null;
          if (previewLoopRef.current) {
            void startTransitionPreviewFromTime(0, target);
          } else {
            setIsPreviewPlaying(false);
            setPreviewTimeSec(0);
          }
        }
      };

      src.start(0, safeOffset);
    },
    [ensureMasterBus, stopAllDjPlayback]
  );

  // Import audio/video files into crate & optionally assign to Deck A / B
  const handleImportFiles = useCallback(
    async (fileList: FileList | File[], targetDeck?: 'A' | 'B') => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setErrorMsg(null);
      setIsAnalyzing(true);
      setStatusMessage(`Analyzing beats, downbeats & waveform bands for ${files.length} file${files.length > 1 ? 's' : ''}...`);

      try {
        const ctx = await ensureAudioContext();
        if (!ctx) throw new Error('Web Audio API is unavailable in this browser.');

        const analyzed: DjTrackAsset[] = [];
        for (const file of files) {
          const item = await analyzeDjTrackFromFile(
            file,
            ctx,
            settingsRef.current.beatSensitivity
          );
          if (item.objectUrl) {
            sessionUrlsRef.current.add(item.objectUrl);
          }
          analyzed.push(item);
        }

        setCrate((prev) => [...prev, ...analyzed]);

        if (targetDeck === 'A' && analyzed[0]) {
          stopDeckChain('A');
          setDeckATrackId(analyzed[0].id);
          setDeckATime(0);
          setDeckAOutTime(analyzed[0].recommendedOutTime);
          setDeckAOutLyricId(null);
        } else if (targetDeck === 'B' && analyzed[0]) {
          stopDeckChain('B');
          setDeckBTrackId(analyzed[0].id);
          setDeckBTime(0);
          setDeckBInTime(0);
          setDeckBInLyricId(null);
        } else {
          // Auto-populate empty decks first
          if (!deckATrackId && analyzed[0]) {
            setDeckATrackId(analyzed[0].id);
            setDeckATime(0);
            setDeckAOutTime(analyzed[0].recommendedOutTime);
            if (!deckBTrackId && analyzed[1]) {
              setDeckBTrackId(analyzed[1].id);
              setDeckBTime(0);
              setDeckBInTime(0);
            }
          } else if (!deckBTrackId && analyzed[0]) {
            setDeckBTrackId(analyzed[0].id);
            setDeckBTime(0);
            setDeckBInTime(0);
          }
        }

        setStatusMessage(
          `Detected ${analyzed.map((a) => `${a.title} (${a.bpm} BPM)`).join(' · ')}`
        );
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to analyze uploaded media.');
        setStatusMessage(null);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [deckATrackId, deckBTrackId, ensureAudioContext, stopDeckChain]
  );

  // Import current Studio audio + lyrics into Deck A
  const handleLoadStudioTrackToDeckA = useCallback(() => {
    if (!currentAudioBuffer) return;
    stopDeckChain('A');
    const name = currentAudioFileName || 'Studio Track.wav';
    const asset = analyzeDjTrackFromBuffer(currentAudioBuffer, name, {
      lyrics: currentLyrics,
      beatSensitivity: settingsRef.current.beatSensitivity,
      title: settingsRef.current.trackTitle.trim() || undefined,
      artist: settingsRef.current.artistName.trim() || undefined,
    });
    setCrate((prev) => [asset, ...prev]);
    setDeckATrackId(asset.id);
    setDeckATime(0);
    setDeckAOutTime(asset.recommendedOutTime);
    setDeckAOutLyricId(asset.lyrics[Math.max(0, asset.lyrics.length - 2)]?.id ?? null);
    setStatusMessage(`Loaded Studio Track into Deck A (${asset.bpm} BPM · ${asset.lyrics.length} lyric cues).`);
  }, [currentAudioBuffer, currentAudioFileName, currentLyrics, stopDeckChain]);

  // One-click Demo DJ Pair (124 BPM Synthwave + 128 BPM House with Lyric Cues!)
  const handleLoadDemoDjPair = useCallback(async () => {
    setErrorMsg(null);
    setIsAnalyzing(true);
    stopAllDjPlayback();
    try {
      const ctx = await ensureAudioContext();
      if (!ctx) throw new Error('Web Audio API unavailable.');
      const { deckA, deckB } = await generateDjDemoPair(ctx);
      setCrate((prev) => [...prev, deckA, deckB]);
      setDeckATrackId(deckA.id);
      setDeckBTrackId(deckB.id);
      setDeckATime(0);
      setDeckBTime(0);

      const handoff = findBestLyricHandoffPair(deckA, deckB);
      setDeckAOutTime(handoff.outTime);
      setDeckBInTime(handoff.inTime);
      setDeckAOutLyricId(handoff.outLyricId);
      setDeckBInLyricId(handoff.inLyricId);

      setStatusMessage(
        `Loaded Demo DJ Pair: "${deckA.title}" (${deckA.bpm} BPM) -> "${deckB.title}" (${deckB.bpm} BPM) with beat & lyric cues.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to synthesize DJ demo tracks.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [ensureAudioContext, stopAllDjPlayback]);

  // Sync BPM button on Deck B or Deck A
  const handleSyncDeckBpm = useCallback(
    (targetDeck: 'A' | 'B') => {
      if (!deckATrack || !deckBTrack) return;
      const bpmA = getEffectiveBpm(deckATrack);
      const bpmB = getEffectiveBpm(deckBTrack);
      if (targetDeck === 'B') {
        const rate = bpmA / Math.max(40, bpmB);
        const pct = Math.max(-24, Math.min(24, (rate - 1) * 100));
        setDeckBPitchPct(Number(pct.toFixed(1)));
        // Snap Deck B playhead to nearest matching beat phase if Deck A is running
        if (deckAPlayingRef.current) {
          setDeckBTime(findNearestBeat(deckBTrack.downbeatTimes, deckBTimeRef.current));
        }
        setStatusMessage(`Deck B synced to ${bpmA} BPM (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% pitch).`);
      } else {
        const rate = bpmB / Math.max(40, bpmA);
        const pct = Math.max(-24, Math.min(24, (rate - 1) * 100));
        setDeckAPitchPct(Number(pct.toFixed(1)));
        setStatusMessage(`Deck A synced to ${bpmB} BPM (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% pitch).`);
      }
    },
    [deckATrack, deckBTrack]
  );

  // Toggle half/double BPM interpretation
  const handleFactorBpm = useCallback((deck: 'A' | 'B', factor: 0.5 | 1 | 2) => {
    const id = deck === 'A' ? deckATrackId : deckBTrackId;
    if (!id) return;
    setCrate((prev) =>
      prev.map((t) => (t.id === id ? { ...t, bpmHalfDoubleFactor: factor } : t))
    );
  }, [deckATrackId, deckBTrackId]);

  // Auto-Pick creative Lyric Handoff pair
  const handleAutoPickLyricHandoff = useCallback(() => {
    if (!deckATrack || !deckBTrack) return;
    const pair = findBestLyricHandoffPair(deckATrack, deckBTrack);
    setTriggerMode('lyrics');
    setActiveBpmPreset(null);
    setDeckAOutLyricId(pair.outLyricId);
    setDeckBInLyricId(pair.inLyricId);
    setDeckAOutTime(pair.outTime);
    setDeckBInTime(pair.inTime);
    setStatusMessage('Selected optimal non-clashing vocal handoff cues on Deck A -> Deck B.');
  }, [deckATrack, deckBTrack]);

  // Auto-Calculate transition timing from detected BPMs
  const handleApplyBpmTimingPreset = useCallback(
    (preset: DjBpmTimingPreset) => {
      if (!deckATrack || !deckBTrack) return;
      const calc = calculateBpmTransitionTiming(
        deckATrack,
        deckBTrack,
        preset,
        crossfadeBeats
      );
      setTriggerMode('beats');
      setBeatMatchTempo(true);
      setAlignPhaseToBeat(true);
      setCrossfadeBeats(calc.crossfadeBeats);
      setTransitionStyle(calc.transitionStyle);
      setDeckAOutLyricId(null);
      setDeckBInLyricId(null);
      setDeckAOutTime(calc.deckAOutTime);
      setDeckBInTime(calc.deckBInTime);
      setActiveBpmPreset(preset);
      setStatusMessage(calc.summary);
    },
    [crossfadeBeats, deckATrack, deckBTrack]
  );

  // Nudge Deck A Mix-Out or Deck B Mix-In cue by exact beats
  const handleNudgeCueBeat = useCallback(
    (deck: 'A' | 'B', deltaBeats: number) => {
      if (deck === 'A' && deckATrack) {
        const beatSec = 60 / Math.max(40, getEffectiveBpm(deckATrack));
        const base = deckAOutTime ?? deckATrack.recommendedOutTime;
        const target = findNearestBeat(
          deckATrack.beatTimes,
          Math.max(1, Math.min(deckATrack.duration - 0.8, base + deltaBeats * beatSec))
        );
        setDeckAOutLyricId(null);
        setDeckAOutTime(Number(target.toFixed(2)));
        setActiveBpmPreset(null);
      } else if (deck === 'B' && deckBTrack) {
        const beatSec = 60 / Math.max(40, getEffectiveBpm(deckBTrack));
        const base = deckBInTime ?? 0;
        const target = findNearestBeat(
          deckBTrack.beatTimes,
          Math.max(0, Math.min(deckBTrack.duration - 1.5, base + deltaBeats * beatSec))
        );
        setDeckBInLyricId(null);
        setDeckBInTime(Number(target.toFixed(2)));
        setActiveBpmPreset(null);
      }
    },
    [deckAOutTime, deckATrack, deckBInTime, deckBTrack]
  );

  // Calibrate/slip a deck's beat grid onto audio transients (-/+ ms)
  const handleShiftDeckBeatGrid = useCallback(
    (deck: 'A' | 'B', deltaMs: number, silent = false) => {
      const targetId = deck === 'A' ? deckATrackId : deckBTrackId;
      if (!targetId) return;
      setCrate((prev) =>
        prev.map((t) => (t.id === targetId ? shiftTrackBeatGrid(t, deltaMs / 1000) : t))
      );
      if (!silent) {
        setStatusMessage(
          `Deck ${deck} beat grid slipped ${deltaMs >= 0 ? '+' : ''}${deltaMs.toFixed(1)} ms.`
        );
      }
    },
    [deckATrackId, deckBTrackId]
  );

  // Set exact beat-grid phase offset relative to auto-detected anchor
  const handleSetDeckGridOffsetMs = useCallback(
    (deck: 'A' | 'B', offsetMs: number) => {
      const targetId = deck === 'A' ? deckATrackId : deckBTrackId;
      if (!targetId) return;
      setCrate((prev) =>
        prev.map((t) => (t.id === targetId ? setTrackBeatGridOffsetMs(t, offsetMs) : t))
      );
    },
    [deckATrackId, deckBTrackId]
  );

  // Anchor Beat 1.1 downbeat directly onto the deck's current playhead
  const handleSetDeckDownbeatHere = useCallback(
    (deck: 'A' | 'B') => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      const playhead = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;
      if (!target) return;
      if (target.beatGridLocked) {
        setStatusMessage(`Deck ${deck} beat grid is locked. Unlock it to adjust.`);
        return;
      }
      setCrate((prev) =>
        prev.map((t) => (t.id === target.id ? setTrackDownbeatAtTime(t, playhead) : t))
      );
      setStatusMessage(`Anchored Deck ${deck} Beat 1.1 downbeat @ ${formatDjClock(playhead)}.`);
    },
    [deckATrack, deckBTrack]
  );

  // Cycle which beat in the 4/4 bar is designated Beat 1.1 (-1B / +1B)
  const handleCycleDeckDownbeat = useCallback(
    (deck: 'A' | 'B', deltaBeats: -1 | 1) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      if (target.beatGridLocked) {
        setStatusMessage(`Deck ${deck} beat grid is locked. Unlock it to adjust.`);
        return;
      }
      setCrate((prev) =>
        prev.map((t) => (t.id === target.id ? cycleTrackDownbeatPhase(t, deltaBeats) : t))
      );
      setStatusMessage(`Shifted Deck ${deck} Beat 1.1 downbeat by ${deltaBeats > 0 ? '+1' : '-1'} beat.`);
    },
    [deckATrack, deckBTrack]
  );

  // Fine-tune detected BPM (-0.5, -0.1, +0.1, +0.5 BPM)
  const handleFineBpmAdjust = useCallback(
    (deck: 'A' | 'B', deltaBpm: number) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      if (target.beatGridLocked) {
        setStatusMessage(`Deck ${deck} beat grid is locked. Unlock it to adjust.`);
        return;
      }
      const nextBpm = Number((target.bpm + deltaBpm).toFixed(1));
      setCrate((prev) =>
        prev.map((t) => (t.id === target.id ? adjustTrackFineBpm(t, nextBpm) : t))
      );
      setStatusMessage(`Deck ${deck} grid BPM calibrated to ${nextBpm.toFixed(1)} BPM.`);
    },
    [deckATrack, deckBTrack]
  );

  // Snap nearest beat grid line directly onto the strongest bass transient near playhead
  const handleSnapGridToTransient = useCallback(
    (deck: 'A' | 'B') => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      const playhead = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;
      if (!target) return;
      if (target.beatGridLocked) {
        setStatusMessage(`Deck ${deck} beat grid is locked. Unlock it to adjust.`);
        return;
      }
      const updated = snapTrackBeatGridToNearestTransient(target, playhead);
      setCrate((prev) => prev.map((t) => (t.id === target.id ? updated : t)));
      const off = updated.beatGridOffsetMs ?? 0;
      setStatusMessage(
        `Snapped Deck ${deck} beat grid onto local kick transient (${off >= 0 ? '+' : ''}${off.toFixed(1)} ms).`
      );
    },
    [deckATrack, deckBTrack]
  );

  // Toggle Beat Grid Lock for a deck
  const handleToggleDeckGridLock = useCallback(
    (deck: 'A' | 'B') => {
      const targetId = deck === 'A' ? deckATrackId : deckBTrackId;
      if (!targetId) return;
      setCrate((prev) =>
        prev.map((t) =>
          t.id === targetId ? { ...t, beatGridLocked: !t.beatGridLocked } : t
        )
      );
    },
    [deckATrackId, deckBTrackId]
  );

  // Reset a deck's beat grid back to auto-detected BPM & phase offset
  const handleResetDeckBeatGrid = useCallback(
    (deck: 'A' | 'B') => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      setCrate((prev) =>
        prev.map((t) => (t.id === target.id ? resetTrackBeatGridToAuto(t) : t))
      );
      setStatusMessage(`Reset Deck ${deck} beat grid to auto-detected timing.`);
    },
    [deckATrack, deckBTrack]
  );

  const handleAdjustDeckKey = useCallback(
    (deck: 'A' | 'B', action: 'prev' | 'next' | 'toggle-mode' | 'auto') => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      if (action === 'auto') {
        const detected = detectMusicalKeyFromBuffer(target.audioBuffer);
        setCrate((prev) =>
          prev.map((t) =>
            t.id === target.id
              ? {
                  ...t,
                  musicalKey: detected.musicalKey,
                  camelotKey: detected.camelotKey,
                  keyConfidence: detected.confidence,
                }
              : t
          )
        );
        setStatusMessage(
          `Detected Deck ${deck} harmonic key: ${detected.camelotKey} (${detected.musicalKey}).`
        );
        return;
      }
      const nextEntry = cycleCamelotKey(target.camelotKey, action);
      setCrate((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? {
                ...t,
                musicalKey: nextEntry.musicalKey,
                camelotKey: nextEntry.camelotKey,
                keyConfidence: 1,
              }
            : t
        )
      );
      setStatusMessage(
        `Set Deck ${deck} Camelot key to ${nextEntry.camelotKey} (${nextEntry.musicalKey}).`
      );
    },
    [deckATrack, deckBTrack]
  );

  // Micro-align Deck B playhead or transition cue in milliseconds
  const handlePhaseSlipDeckBMs = useCallback(
    (deltaMs: number) => {
      if (!deckBTrack) return;
      if (phaseAlignScopeMode === 'live') {
        const nextT = Math.max(
          0,
          Math.min(deckBTrack.duration - 0.05, deckBTimeRef.current + deltaMs / 1000)
        );
        setDeckBTime(nextT);
        if (deckBPlayingRef.current) {
          const now = performance.now();
          if (now - lastDragLiveRestartMsRef.current > 85) {
            lastDragLiveRestartMsRef.current = now;
            void startLiveDeckFromTime('B', nextT);
          }
        }
      } else {
        const baseIn = deckBInTime ?? dualPlan?.deckBInTime ?? 0;
        const nextIn = Math.max(0, Math.min(deckBTrack.duration - 0.5, baseIn + deltaMs / 1000));
        setAlignPhaseToBeat(false);
        setDeckBInLyricId(null);
        setDeckBInTime(Number(nextIn.toFixed(4)));
        setActiveBpmPreset(null);
      }
    },
    [deckBInTime, deckBTrack, dualPlan, phaseAlignScopeMode, startLiveDeckFromTime]
  );

  // One-click snap Deck B phase directly onto Deck A's beat grid (0.0 ms offset)
  const handleLockBeatPhase = useCallback(() => {
    if (!deckATrack || !deckBTrack || !phaseComparison) return;
    if (phaseAlignScopeMode === 'live') {
      const lockedT = Math.max(
        0,
        Math.min(
          deckBTrack.duration - 0.05,
          deckBTimeRef.current + phaseComparison.correctionSecForB
        )
      );
      setDeckBTime(lockedT);
      if (deckBPlayingRef.current) {
        void startLiveDeckFromTime('B', lockedT);
      }
      setStatusMessage(
        `Phase locked Deck B -> Deck A (${phaseComparison.phaseOffsetMs >= 0 ? '+' : ''}${phaseComparison.phaseOffsetMs.toFixed(1)} ms correction).`
      );
    } else {
      setAlignPhaseToBeat(true);
      const poolB =
        deckBTrack.downbeatTimes.length > 0
          ? deckBTrack.downbeatTimes
          : deckBTrack.beatTimes;
      const baseIn = deckBInTime ?? dualPlan?.deckBInTime ?? 0;
      const snappedIn = findNearestBeat(poolB, baseIn);
      setDeckBInTime(Number(snappedIn.toFixed(3)));
      setStatusMessage('Overlap transition locked cleanly to Deck A & Deck B beat grids (0.0 ms).');
    }
  }, [
    deckATrack,
    deckBInTime,
    deckBTrack,
    dualPlan,
    phaseAlignScopeMode,
    phaseComparison,
    startLiveDeckFromTime,
  ]);

  // Match BPM and lock beat phase in one click
  const handleSyncBpmAndLockPhase = useCallback(() => {
    if (!deckATrack || !deckBTrack) return;
    if (phaseAlignScopeMode === 'live') {
      const bpmA = getEffectiveBpm(deckATrack);
      const bpmB = getEffectiveBpm(deckBTrack);
      const rateA = Math.max(0.7, Math.min(1.35, 1 + deckAPitchPct / 100));
      const targetBpm = bpmA * rateA;
      const neededRateB = targetBpm / Math.max(40, bpmB);
      const pct = Number(Math.max(-16, Math.min(16, (neededRateB - 1) * 100)).toFixed(1));
      setDeckBPitchPct(pct);

      const cmp = computeBeatMatchPhaseComparison(
        deckATrack,
        deckATimeRef.current,
        rateA,
        deckBTrack,
        deckBTimeRef.current,
        neededRateB
      );
      const lockedT = Math.max(
        0,
        Math.min(deckBTrack.duration - 0.05, deckBTimeRef.current + cmp.correctionSecForB)
      );
      setDeckBTime(lockedT);
      if (deckBPlayingRef.current) {
        void startLiveDeckFromTime('B', lockedT, pct);
      }
      setStatusMessage(
        `Matched Deck B to ${targetBpm.toFixed(1)} BPM & locked beat phase to 0.0 ms.`
      );
    } else {
      setBeatMatchTempo(true);
      setAlignPhaseToBeat(true);
      const poolB =
        deckBTrack.downbeatTimes.length > 0
          ? deckBTrack.downbeatTimes
          : deckBTrack.beatTimes;
      const baseIn = deckBInTime ?? dualPlan?.deckBInTime ?? 0;
      setDeckBInTime(Number(findNearestBeat(poolB, baseIn).toFixed(3)));
      setStatusMessage('Matched Deck B tempo to Deck A and locked transition beat phase.');
    }
  }, [
    deckAPitchPct,
    deckATrack,
    deckBInTime,
    deckBTrack,
    dualPlan,
    phaseAlignScopeMode,
    startLiveDeckFromTime,
  ]);

  // Upload or paste lyrics for a deck & snap to beats
  const handleUploadDeckLyricsFile = useCallback(
    async (deck: 'A' | 'B', file: File) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      const content = await file.text();
      const parsed = parseAndSyncDjTrackLyrics(
        content,
        file.name,
        target,
        settingsRef.current.beatSensitivity
      );
      setCrate((prev) => prev.map((t) => (t.id === target.id ? { ...t, lyrics: parsed } : t)));
      setStatusMessage(`Synced ${parsed.length} lyric cues to ${target.title}'s beat grid.`);
    },
    [deckATrack, deckBTrack]
  );

  const handleSaveDeckLyricDraft = useCallback(() => {
    const target = lyricDrawerDeck === 'A' ? deckATrack : deckBTrack;
    if (!target) return;
    const parsed = parseAndSyncDjTrackLyrics(
      lyricDraftText,
      undefined,
      target,
      settingsRef.current.beatSensitivity
    );
    setCrate((prev) => prev.map((t) => (t.id === target.id ? { ...t, lyrics: parsed } : t)));
    setLyricDrawerDeck(null);
    setStatusMessage(`Beat-synced ${parsed.length} lyric lines onto Deck ${lyricDrawerDeck}.`);
  }, [deckATrack, deckBTrack, lyricDraftText, lyricDrawerDeck]);

  const handleSnapDeckLyricsToBeats = useCallback(
    (deck: 'A' | 'B') => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target || target.lyrics.length === 0) return;
      const aligned = snapDjLyricsToTrackBeats(target, settingsRef.current.beatSensitivity);
      setCrate((prev) => prev.map((t) => (t.id === target.id ? { ...t, lyrics: aligned } : t)));
      setStatusMessage(`Quantized ${aligned.length} lyric cues to Deck ${deck}'s strongest beats.`);
    },
    [deckATrack, deckBTrack]
  );

  // Performance FX: Vinyl Brake & Echo Out
  const handleTriggerVinylBrake = useCallback((deck: 'A' | 'B') => {
    const chain = deck === 'A' ? deckAChainRef.current : deckBChainRef.current;
    if (!chain || !chain.source) return;
    const now = chain.source.context.currentTime;
    chain.source.playbackRate.cancelScheduledValues(now);
    chain.source.playbackRate.setValueAtTime(chain.playbackRate, now);
    chain.source.playbackRate.exponentialRampToValueAtTime(0.08, now + 0.85);
    window.setTimeout(() => {
      stopDeckChain(deck);
    }, 900);
  }, [stopDeckChain]);

  const handleToggleEchoPulse = useCallback((deck: 'A' | 'B') => {
    const chain = deck === 'A' ? deckAChainRef.current : deckBChainRef.current;
    if (!chain) return;
    const now = chain.delayWet.context.currentTime;
    const currentWet = chain.delayWet.gain.value;
    chain.delayWet.gain.setTargetAtTime(currentWet > 0.1 ? 0 : 0.65, now, 0.03);
  }, []);

  const snapTimeToTrackBeatGrid = useCallback(
    (track: DjTrackAsset | null, rawTimeSec: number): number => {
      if (!track) return Math.max(0, rawTimeSec);
      const clamped = Math.max(0, Math.min(track.duration - 0.05, rawTimeSec));
      const pool = getEffectiveBeatGridPoints(track).map((p) => p.timeSec);
      const beats = pool.length > 0 ? pool : track.beatTimes;
      if (!beats || beats.length === 0) return Number(clamped.toFixed(3));
      return Math.max(0, Math.min(track.duration - 0.05, findNearestBeat(beats, clamped)));
    },
    []
  );

  const handleSnapDeckPlayheadToBeatGrid = useCallback(
    (deck: 'A' | 'B') => {
      const track = deck === 'A' ? deckATrackRef.current : deckBTrackRef.current;
      if (!track) return;
      const cur = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;
      const snapped = snapTimeToTrackBeatGrid(track, cur);
      if (deck === 'A') {
        deckATimeRef.current = snapped;
        setDeckATime(snapped);
        if (deckAPlayingRef.current) {
          void startLiveDeckFromTime('A', snapped);
        }
      } else {
        deckBTimeRef.current = snapped;
        setDeckBTime(snapped);
        if (deckBPlayingRef.current) {
          void startLiveDeckFromTime('B', snapped);
        }
      }
      setStatusMessage(`Snapped Deck ${deck} playhead to Beat Grid (${formatDjClock(snapped)}).`);
    },
    [snapTimeToTrackBeatGrid, startLiveDeckFromTime]
  );

  const handleToggleSyncToBeatGrid = useCallback(() => {
    setSyncToBeatGrid((prev) => {
      const next = !prev;
      setCueSnapToBeat(next);
      if (next) {
        setDeckATransientSeek(false);
        setDeckBTransientSeek(false);
        if (deckATrackRef.current) {
          const snappedA = snapTimeToTrackBeatGrid(deckATrackRef.current, deckATimeRef.current);
          deckATimeRef.current = snappedA;
          setDeckATime(snappedA);
          if (deckAPlayingRef.current) {
            void startLiveDeckFromTime('A', snappedA);
          }
        }
        if (deckBTrackRef.current) {
          const snappedB = snapTimeToTrackBeatGrid(deckBTrackRef.current, deckBTimeRef.current);
          deckBTimeRef.current = snappedB;
          setDeckBTime(snappedB);
          if (deckBPlayingRef.current) {
            void startLiveDeckFromTime('B', snappedB);
          }
        }
        if (
          renderedScheduleRef.current?.beatTimesTimeline.length &&
          (isAutoSetPlayingRef.current || autoSetTimeRef.current > 0.02)
        ) {
          const snappedSet = findNearestBeat(
            renderedScheduleRef.current.beatTimesTimeline,
            autoSetTimeRef.current
          );
          setAutoSetTime(snappedSet);
          if (isAutoSetPlayingRef.current) {
            void startAutoSetFromTime(snappedSet);
          }
        }
        setStatusMessage(
          'Sync to Beat Grid enabled — seeking & cueing snap to nearest beat marker.'
        );
      } else {
        setStatusMessage(
          'Sync to Beat Grid disabled — free millisecond seeking & cueing active.'
        );
      }
      return next;
    });
  }, [snapTimeToTrackBeatGrid, startAutoSetFromTime, startLiveDeckFromTime]);

  // Cue Point Manager handlers
  const handlePlaceCuePoint = useCallback(
    (
      deck: 'A' | 'B',
      overrideLabel?: string,
      overrideTimeSec?: number,
      overrideColor?: string
    ) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      const playhead = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;
      const rawSec =
        overrideTimeSec !== undefined
          ? overrideTimeSec
          : playhead;
      const clamped = Math.max(0, Math.min(target.duration - 0.05, rawSec));
      const snapCue = syncToBeatGrid || cueSnapToBeat;
      const finalTime = snapCue
        ? snapTimeToTrackBeatGrid(target, clamped)
        : Number(clamped.toFixed(2));
      const label = (overrideLabel ?? cueDraftLabel).trim() || `Cue ${(target.cuePoints?.length ?? 0) + 1}`;
      const color = overrideColor ?? cueDraftColor;

      const nextCue: DjCuePoint = {
        id: createDjCuePointId(),
        label,
        timeSec: Number(finalTime.toFixed(2)),
        color,
      };

      setCrate((prev) =>
        prev.map((t) => {
          if (t.id !== target.id) return t;
          const updated = [...(t.cuePoints ?? []), nextCue].sort(
            (a, b) => a.timeSec - b.timeSec
          );
          return { ...t, cuePoints: updated };
        })
      );
      setStatusMessage(
        `Placed "${label}" cue on Deck ${deck} at ${formatDjClock(nextCue.timeSec)}${snapCue ? ' (beat-snapped)' : ''}.`
      );
    },
    [
      cueDraftColor,
      cueDraftLabel,
      cueSnapToBeat,
      deckATrack,
      deckBTrack,
      snapTimeToTrackBeatGrid,
      syncToBeatGrid,
    ]
  );

  const handleJumpToCuePoint = useCallback(
    (deck: 'A' | 'B', cue: DjCuePoint) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      const rawTime = Math.max(0, Math.min(target.duration - 0.05, cue.timeSec));
      const safeTime = syncToBeatGrid ? snapTimeToTrackBeatGrid(target, rawTime) : rawTime;
      if (deck === 'A') {
        setDeckATime(safeTime);
        if (cueAutoPlayOnJump || deckAPlayingRef.current) {
          void startLiveDeckFromTime('A', safeTime);
        }
      } else {
        setDeckBTime(safeTime);
        if (cueAutoPlayOnJump || deckBPlayingRef.current) {
          void startLiveDeckFromTime('B', safeTime);
        }
      }
      setStatusMessage(
        `Jumped Deck ${deck} to "${cue.label}" (${formatDjClock(safeTime)}${syncToBeatGrid ? ' · beat-snapped' : ''}).`
      );
    },
    [
      cueAutoPlayOnJump,
      deckATrack,
      deckBTrack,
      snapTimeToTrackBeatGrid,
      startLiveDeckFromTime,
      syncToBeatGrid,
    ]
  );

  const handleDeleteCuePoint = useCallback(
    (deck: 'A' | 'B', cueId: string) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      setCrate((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? { ...t, cuePoints: (t.cuePoints ?? []).filter((c) => c.id !== cueId) }
            : t
        )
      );
      if (editingCueId === cueId) {
        setEditingCueId(null);
      }
    },
    [deckATrack, deckBTrack, editingCueId]
  );

  const handleStampCueToPlayhead = useCallback(
    (deck: 'A' | 'B', cueId: string) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      const raw = deck === 'A' ? deckATimeRef.current : deckBTimeRef.current;
      const snapCue = syncToBeatGrid || cueSnapToBeat;
      const nextTime = snapCue
        ? snapTimeToTrackBeatGrid(target, raw)
        : Number(raw.toFixed(2));
      setCrate((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? {
                ...t,
                cuePoints: (t.cuePoints ?? [])
                  .map((c) =>
                    c.id === cueId ? { ...c, timeSec: Number(nextTime.toFixed(2)) } : c
                  )
                  .sort((a, b) => a.timeSec - b.timeSec),
              }
            : t
        )
      );
      setStatusMessage(`Moved cue marker on Deck ${deck} to ${formatDjClock(nextTime)}.`);
    },
    [cueSnapToBeat, deckATrack, deckBTrack, snapTimeToTrackBeatGrid, syncToBeatGrid]
  );

  const handleRenameCuePoint = useCallback(
    (deck: 'A' | 'B', cueId: string, label: string) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      const clean = label.trim();
      if (!clean) {
        setEditingCueId(null);
        return;
      }
      setCrate((prev) =>
        prev.map((t) =>
          t.id === target.id
            ? {
                ...t,
                cuePoints: (t.cuePoints ?? []).map((c) =>
                  c.id === cueId ? { ...c, label: clean } : c
                ),
              }
            : t
        )
      );
      setEditingCueId(null);
    },
    [deckATrack, deckBTrack]
  );

  const handleAutoDetectCuePoints = useCallback(
    (deck: 'A' | 'B') => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      const autoCues = detectDefaultDjCuePoints(target);
      setCrate((prev) =>
        prev.map((t) => (t.id === target.id ? { ...t, cuePoints: autoCues } : t))
      );
      setStatusMessage(
        `Detected ${autoCues.length} structure cues (${autoCues.map((c) => c.label).join(', ')}) on Deck ${deck}.`
      );
    },
    [deckATrack, deckBTrack]
  );

  // Sync trim bounds when renderedMixBuffer or Deck A duration changes
  const djSetTotalDuration =
    renderedMixBuffer?.duration ?? dualPlan?.totalDurationSec ?? deckATrack?.duration ?? 0;

  useEffect(() => {
    if (!isOpen) return;
    if (djSetTotalDuration <= 0) {
      setDjTrimStart(0);
      setDjTrimEnd(0);
      return;
    }
    setDjTrimStart((prev) =>
      Math.max(0, Math.min(prev, Math.max(0, djSetTotalDuration - 0.1)))
    );
    setDjTrimEnd(Number(djSetTotalDuration.toFixed(2)));
  }, [isOpen, djSetTotalDuration]);

  const handlePreviewSceneTransition = useCallback(() => {
    const s = settingsRef.current;
    if (
      s.sceneTransitionType === 'none' ||
      s.lyricsOnly ||
      s.displayLayer === 'dance-only'
    ) {
      return;
    }
    sceneTransRef.current = {
      activeMode: s.visualizerMode,
      fromMode: s.visualizerMode,
      elapsed: 0,
      duration: Math.max(0.15, Math.min(1.5, s.sceneTransitionDuration ?? 0.45)),
    };
  }, []);

  const handleDjSnapshot = useCallback(
    async (name: string, targetSettings?: StudioSettings): Promise<string> => {
      if (
        stageCanvasRef.current &&
        (!targetSettings ||
          JSON.stringify(targetSettings) === JSON.stringify(settingsRef.current))
      ) {
        return captureCanvasSnapshotPng(stageCanvasRef.current, name);
      }
      return onDownloadSnapshot(name, targetSettings);
    },
    [onDownloadSnapshot]
  );

  // Build & Preview the full Auto-DJ Mixed Set (Beat-Mix or Lyric-Mix)
  const buildAndRenderSet = useCallback(
    async (
      mode: 'dual' | 'crate',
      autoPlayAfterRender = true,
      overrideConfig?: {
        dualPlan?: DjTransitionPlan;
        transitionStyle?: DjTransitionStyle;
        startAtSec?: number;
      }
    ) => {
      setErrorMsg(null);
      setIsRenderingSet(true);
      stopAllDjPlayback();

      try {
        let schedule: DjScheduleRenderPlan;
        const effectivePlan = overrideConfig?.dualPlan ?? dualPlan;
        const effectiveStyle = overrideConfig?.transitionStyle ?? transitionStyle;

        if (mode === 'crate' && crate.length >= 2) {
          schedule = buildCrateSetSchedule(crate, {
            triggerMode: triggerMode === 'manual' ? 'beats' : triggerMode,
            transitionStyle: effectiveStyle,
            videoMixStyle,
            videoBlendMode,
            videoLayerOpacity,
            crossfadeBeats,
            beatMatchTempo,
          });
        } else if (deckATrack && deckBTrack && effectivePlan) {
          schedule = buildScheduleFromDualPlan(deckATrack, deckBTrack, effectivePlan, {
            videoBlendMode,
            videoLayerOpacity,
          });
        } else if (deckATrack || crate[0]) {
          const single = deckATrack ?? crate[0];
          schedule = buildCrateSetSchedule([single], {
            triggerMode: 'beats',
            transitionStyle: effectiveStyle,
            videoMixStyle,
            videoBlendMode,
            videoLayerOpacity,
            crossfadeBeats,
            beatMatchTempo,
          });
        } else {
          throw new Error('Load at least one track (or click Demo DJ Pair) to build a DJ mix.');
        }

        const rendered = await renderOfflineDjSchedule(schedule, {
          normalize: normalizeMixAudio,
          limiterEnabled,
          limiterCeilingDb,
          autoGainFromPeak: limiterAutoGainEnabled,
        });

        autoSetVideoResolverRef.current?.dispose();
        autoSetVideoResolverRef.current = createDjVideoFrameResolver(schedule);
        offlineSetAnalyzerRef.current = new OfflineAudioAnalyzer(rendered.audioBuffer, 2048);

        const initialOffset = Math.max(
          0,
          Math.min(rendered.audioBuffer.duration - 0.5, overrideConfig?.startAtSec ?? 0)
        );
        setRenderedSchedule(schedule);
        setRenderedMixBuffer(rendered.audioBuffer);
        setRenderedPeaks(rendered.waveformPeaks);
        setAutoSetTime(initialOffset);
        setDjTrimStart(0);
        setDjTrimEnd(Number(rendered.audioBuffer.duration.toFixed(2)));

        if (schedule.mergedLyrics.length > 0) {
          onLyricsChange(schedule.mergedLyrics);
        }

        if (!settingsRef.current.trackTitle.trim()) {
          const title =
            schedule.segments.length >= 2
              ? `${schedule.segments[0].track.title} × ${schedule.segments[1].track.title} (DJ Mix)`
              : `${schedule.segments[0].track.title} (DJ Edit)`;
          onUpdateSettings({ trackTitle: title });
        }

        const limiterInfo = limiterEnabled
          ? ` · Brick-Wall ${limiterCeilingDb.toFixed(1)} dBFS (Auto-Gain ${rendered.appliedAutoGainDb >= 0 ? '+' : ''}${rendered.appliedAutoGainDb.toFixed(1)} dB)`
          : '';
        setStatusMessage(
          `Mixed ${schedule.segments.length} tracks (${schedule.totalDurationSec.toFixed(1)}s · ${schedule.mergedLyrics.length} synced lyrics · ${effectiveStyle}${limiterInfo}).`
        );

        if (autoPlayAfterRender) {
          await startAutoSetFromTime(initialOffset, rendered.audioBuffer);
        }

        return { schedule, rendered };
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to render DJ mix.');
        return null;
      } finally {
        setIsRenderingSet(false);
      }
    },
    [
      beatMatchTempo,
      crate,
      crossfadeBeats,
      deckATrack,
      deckBTrack,
      dualPlan,
      limiterAutoGainEnabled,
      limiterCeilingDb,
      limiterEnabled,
      normalizeMixAudio,
      onLyricsChange,
      onUpdateSettings,
      startAutoSetFromTime,
      stopAllDjPlayback,
      transitionStyle,
      triggerMode,
      videoBlendMode,
      videoLayerOpacity,
      videoMixStyle,
    ]
  );

  // Generate non-destructive 5-second transition preview render inside the waveform area
  const handleGenerateTransitionPreview = useCallback(
    async (
      proposal: {
        id: string;
        label: string;
        deckAOutSec: number;
        deckBInSec: number;
        deckBDropSec?: number;
        crossfadeBeats: 4 | 8 | 16 | 32;
        transitionStyle: DjTransitionStyle;
        videoMixStyle: DjVideoMixStyle;
        triggerMode?: DjMixTriggerMode;
        beatMatchTempo?: boolean;
        alignPhaseToBeat?: boolean;
      },
      autoPlay = true
    ) => {
      if (!deckATrack || !deckBTrack) {
        setPreviewError('Load tracks into both Deck A and Deck B first.');
        return;
      }
      const seq = ++previewRenderSeqRef.current;
      setIsPreviewRendering(true);
      setPreviewError(null);
      if (proposal.id !== 'manual-plan') {
        setActiveAiSuggestionId(proposal.id);
      }

      try {
        const renderedPreview = await renderTransitionPreview5s(
          deckATrack,
          deckBTrack,
          {
            ...proposal,
            triggerMode: proposal.triggerMode ?? 'beats',
            beatMatchTempo: proposal.beatMatchTempo ?? true,
            alignPhaseToBeat: proposal.alignPhaseToBeat ?? true,
          },
          {
            limiterEnabled,
            limiterCeilingDb,
            autoGainFromPeak: normalizeMixAudio,
            windowSeconds: 5.0,
          }
        );
        if (seq !== previewRenderSeqRef.current) return;

        setAiTransitionPreview(renderedPreview);
        setPreviewTimeSec(0);
        if (autoPlay) {
          await startTransitionPreviewFromTime(0, renderedPreview);
        } else {
          setStatusMessage(
            `5s transition preview "${renderedPreview.label}" ready in the Smart Crossfade waveform area.`
          );
        }
      } catch (err) {
        if (seq !== previewRenderSeqRef.current) return;
        setPreviewError(
          err instanceof Error ? err.message : 'Unable to generate 5-second transition preview.'
        );
      } finally {
        if (seq === previewRenderSeqRef.current) {
          setIsPreviewRendering(false);
        }
      }
    },
    [
      deckATrack,
      deckBTrack,
      limiterCeilingDb,
      limiterEnabled,
      normalizeMixAudio,
      startTransitionPreviewFromTime,
    ]
  );

  // AI Auto-Mix Assistant: analyze Deck A & Deck B energy contours via server-side Gemini API
  const handleAnalyzeAiAutoMix = useCallback(async () => {
    if (!deckATrack || !deckBTrack) {
      setAiAutoMixError('Load tracks into both Deck A and Deck B first.');
      return;
    }
    setAiAutoMixLoading(true);
    setAiAutoMixError(null);
    try {
      const result = await requestAiAutoMixSuggestions(
        deckATrack,
        deckBTrack,
        aiAutoMixPreference
      );
      setAiAutoMixResult(result);
      const topSuggestion = result.suggestions[0] ?? null;
      setActiveAiSuggestionId(topSuggestion?.id ?? null);
      setStatusMessage(
        `AI Auto-Mix analyzed ${deckATrack.title} → ${deckBTrack.title}: ${result.suggestions.length} Energy Match points ready.`
      );
      if (topSuggestion) {
        void handleGenerateTransitionPreview(topSuggestion, false);
      }
    } catch (err) {
      setAiAutoMixError(
        err instanceof Error ? err.message : 'AI Auto-Mix structure analysis failed.'
      );
    } finally {
      setAiAutoMixLoading(false);
    }
  }, [aiAutoMixPreference, deckATrack, deckBTrack, handleGenerateTransitionPreview]);

  // One-click execution of an AI Energy Match transition suggestion
  const handleExecuteAiAutoMixSuggestion = useCallback(
    async (suggestion: AiAutoMixSuggestion, autoPlay = true) => {
      if (!deckATrack || !deckBTrack) return;
      stopTransitionPreviewPlayback();
      setAiTransitionPreview(null);
      setPreviewTimeSec(0);
      setTriggerMode('beats');
      setBeatMatchTempo(true);
      setAlignPhaseToBeat(true);
      setCrossfadeBeats(suggestion.crossfadeBeats);
      setTransitionStyle(suggestion.transitionStyle);
      setVideoMixStyle(suggestion.videoMixStyle);
      setDeckAOutLyricId(null);
      setDeckBInLyricId(null);
      setDeckAOutTime(suggestion.deckAOutSec);
      setDeckBInTime(suggestion.deckBInSec);
      setActiveAiSuggestionId(suggestion.id);
      setActiveBpmPreset(null);

      const nextPlan = buildDualDeckMixPlan(deckATrack, deckBTrack, {
        triggerMode: 'beats',
        transitionStyle: suggestion.transitionStyle,
        videoMixStyle: suggestion.videoMixStyle,
        crossfadeBeats: suggestion.crossfadeBeats,
        beatMatchTempo: true,
        alignPhaseToBeat: true,
        customOutTimeA: suggestion.deckAOutSec,
        customInTimeB: suggestion.deckBInSec,
      });

      if (autoPlay) {
        const previewStart = Math.max(0, nextPlan.transitionStartSec - 2.5);
        await buildAndRenderSet('dual', true, {
          dualPlan: nextPlan,
          transitionStyle: suggestion.transitionStyle,
          startAtSec: previewStart,
        });
      } else {
        setStatusMessage(
          `Applied AI Energy Match "${suggestion.label}": Out ${suggestion.deckAOutSec.toFixed(1)}s → In ${suggestion.deckBInSec.toFixed(1)}s (${suggestion.crossfadeBeats}B ${suggestion.transitionStyle}).`
        );
      }
    },
    [buildAndRenderSet, deckATrack, deckBTrack, stopTransitionPreviewPlayback]
  );

  // Commit an auditioned 5s preview into full-set cue points and render the full mix
  const handleCommitTransitionPreview = useCallback(
    async (preview: DjTransitionPreviewRender) => {
      if (!deckATrack || !deckBTrack) return;
      const matchedSuggestion = aiAutoMixResult?.suggestions.find(
        (s) => s.id === preview.suggestionId
      );
      if (matchedSuggestion) {
        await handleExecuteAiAutoMixSuggestion(matchedSuggestion, true);
        return;
      }
      stopTransitionPreviewPlayback();
      setAiTransitionPreview(null);
      setPreviewTimeSec(0);
      setTriggerMode(preview.plan.triggerMode);
      setBeatMatchTempo(beatMatchTempo);
      setAlignPhaseToBeat(alignPhaseToBeat);
      setCrossfadeBeats(preview.crossfadeBeats);
      setTransitionStyle(preview.transitionStyle);
      setDeckAOutLyricId(null);
      setDeckBInLyricId(null);
      setDeckAOutTime(preview.deckAOutSec);
      setDeckBInTime(preview.deckBInSec);
      await buildAndRenderSet('dual', true, {
        dualPlan: preview.plan,
        transitionStyle: preview.transitionStyle,
        startAtSec: Math.max(0, preview.previewStartSec),
      });
    },
    [
      aiAutoMixResult?.suggestions,
      alignPhaseToBeat,
      beatMatchTempo,
      buildAndRenderSet,
      deckATrack,
      deckBTrack,
      handleExecuteAiAutoMixSuggestion,
      stopTransitionPreviewPlayback,
    ]
  );

  const handleDjAutoCaptions = useCallback(() => {
    const targetBuffer = renderedMixBuffer ?? deckATrack?.audioBuffer ?? deckBTrack?.audioBuffer;
    if (targetBuffer) {
      const endSec =
        renderedMixBuffer && djTrimEnd > djTrimStart
          ? Math.min(targetBuffer.duration, djTrimEnd)
          : targetBuffer.duration;
      onAutoGenerateCaptions({
        audioBuffer: targetBuffer,
        trimStart: renderedMixBuffer ? djTrimStart : 0,
        trimEnd: endSec,
      });
      return;
    }
    onAutoGenerateCaptions();
  }, [
    deckATrack,
    deckBTrack,
    djTrimEnd,
    djTrimStart,
    onAutoGenerateCaptions,
    renderedMixBuffer,
  ]);

  // Commit DJ Mix directly to Studio, Batch Queue, OR straight to Export MP4!
  const handleCommitDjMix = useCallback(
    async (action: 'apply' | 'export' | 'batch') => {
      if (isApplyingMix || isExporting) return;
      setIsApplyingMix(true);
      setErrorMsg(null);
      try {
        // Render fresh schedule so any recent beat/lyric cue edits are reflected cleanly
        const built = await buildAndRenderSet(
          crate.length > 2 ? 'crate' : 'dual',
          false
        );
        if (!built) return;

        const { schedule, rendered } = built;
        const freshVideoResolver = createDjVideoFrameResolver(schedule);
        const trackTitle =
          settingsRef.current.trackTitle.trim() ||
          (schedule.segments.length >= 2
            ? `${schedule.segments[0].track.title} x ${schedule.segments[1].track.title} DJ Mix`
            : `${schedule.segments[0]?.track.title ?? 'DJ Mix'}`);

        const finalLyrics =
          currentLyricsRef.current.length > 0
            ? currentLyricsRef.current
            : schedule.mergedLyrics;

        await onApplyDjMix({
          audioBuffer: rendered.audioBuffer,
          wavBlob: rendered.wavBlob,
          duration: rendered.duration,
          waveformPeaks: rendered.waveformPeaks,
          mergedLyrics: finalLyrics,
          videoResolver: freshVideoResolver.hasActiveVideo() ? freshVideoResolver : null,
          trackTitle,
          trimStart: Math.max(0, Math.min(djTrimStart, Math.max(0, rendered.duration - 0.1))),
          trimEnd:
            djTrimEnd > djTrimStart
              ? Math.min(rendered.duration, djTrimEnd)
              : rendered.duration,
          action,
        });
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to export DJ mix.');
      } finally {
        setIsApplyingMix(false);
      }
    },
    [
      buildAndRenderSet,
      crate.length,
      djTrimEnd,
      djTrimStart,
      isApplyingMix,
      isExporting,
      onApplyDjMix,
    ]
  );

  // 60fps Live Playhead & Canvas Visualizer / Blended Video Stage Loop
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    let lastTs = performance.now();
    const freqBuf = new Uint8Array(1024);
    const waveBuf = new Uint8Array(1024);
    const lpWaveBuf = new Uint8Array(1024);
    const deckFreqBuf = new Uint8Array(1024);
    const deckWaveBuf = new Uint8Array(1024);
    const deckLpWaveBuf = new Uint8Array(1024);
    const preFloatBuf = new Float32Array(1024);
    const postFloatBuf = new Float32Array(1024);
    let visualPrePeak = 0;
    let visualOutPeak = 0;
    waveBuf.fill(128);
    lpWaveBuf.fill(128);
    deckWaveBuf.fill(128);
    deckLpWaveBuf.fill(128);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      // Update live deck playheads (skip while active scratch session drives playhead directly)
      let liveTimeA = deckATimeRef.current;
      const chainA = deckAChainRef.current;
      if (chainA && chainA.source && !chainA.isScratching && deckAPlayingRef.current && deckATrackRef.current) {
        const elapsed = ((now - chainA.startedAtPerfMs) / 1000) * chainA.playbackRate;
        let t = chainA.offsetSec + elapsed;
        if (chainA.loopBeats > 0) {
          const loopDur = (60 / getEffectiveBpm(deckATrackRef.current)) * chainA.loopBeats;
          if (loopDur > 0.1) {
            t = chainA.offsetSec + ((elapsed % loopDur) + loopDur) % loopDur;
          }
        } else {
          t = Math.min(deckATrackRef.current.duration, t);
        }
        liveTimeA = t;
        setDeckATime(t);
      }

      let liveTimeB = deckBTimeRef.current;
      const chainB = deckBChainRef.current;
      if (chainB && chainB.source && !chainB.isScratching && deckBPlayingRef.current && deckBTrackRef.current) {
        const elapsed = ((now - chainB.startedAtPerfMs) / 1000) * chainB.playbackRate;
        let t = chainB.offsetSec + elapsed;
        if (chainB.loopBeats > 0) {
          const loopDur = (60 / getEffectiveBpm(deckBTrackRef.current)) * chainB.loopBeats;
          if (loopDur > 0.1) {
            t = chainB.offsetSec + ((elapsed % loopDur) + loopDur) % loopDur;
          }
        } else {
          t = Math.min(deckBTrackRef.current.duration, t);
        }
        liveTimeB = t;
        setDeckBTime(t);
      }

      // Update Auto-Set or 5s Preview timeline playhead
      let stageTime = autoSetTimeRef.current;
      if (isAutoSetPlayingRef.current) {
        const elapsed = (now - autoSetStartPerfRef.current) / 1000;
        stageTime = autoSetStartOffsetRef.current + elapsed;
        setAutoSetTime(stageTime);
      } else if (isPreviewPlayingRef.current && aiTransitionPreviewRef.current) {
        const elapsed = (now - previewStartPerfRef.current) / 1000;
        const localPos = Math.min(
          aiTransitionPreviewRef.current.durationSec,
          previewStartOffsetRef.current + elapsed
        );
        setPreviewTimeSec(localPos);
        stageTime = aiTransitionPreviewRef.current.previewStartSec + localPos;
      } else if (
        deckAPlayingRef.current ||
        deckBPlayingRef.current ||
        deckAScratchingRef.current ||
        deckBScratchingRef.current
      ) {
        stageTime =
          (crossfaderRef.current > 0.25 && (deckBPlayingRef.current || deckBScratchingRef.current)) ||
          (deckBScratchingRef.current && !deckAScratchingRef.current && !deckAPlayingRef.current)
            ? liveTimeB
            : liveTimeA;
      }

      // Advance Master BPM Beat-Grid Glow Clock (locked to live deck/set beat grid when playing, else phase-continuous freewheel)
      let syncedMasterClock = false;
      if (
        deckAPlayingRef.current &&
        deckATrackRef.current &&
        !(crossfaderRef.current > 0.35 && deckBPlayingRef.current && deckBTrackRef.current)
      ) {
        const trk = deckATrackRef.current;
        const anchor = trk.downbeatTimes[0] ?? trk.beatTimes[0] ?? 0;
        const rawPeriod = 60 / Math.max(40, getEffectiveBpm(trk));
        const beatFloat = (liveTimeA - anchor) / rawPeriod;
        masterBeatClockRef.current.phase = ((beatFloat % 1) + 1) % 1;
        masterBeatClockRef.current.beatIndex = ((Math.floor(beatFloat + 0.0005) % 4) + 4) % 4;
        syncedMasterClock = true;
      } else if (deckBPlayingRef.current && deckBTrackRef.current) {
        const trk = deckBTrackRef.current;
        const anchor = trk.downbeatTimes[0] ?? trk.beatTimes[0] ?? 0;
        const rawPeriod = 60 / Math.max(40, getEffectiveBpm(trk));
        const beatFloat = (liveTimeB - anchor) / rawPeriod;
        masterBeatClockRef.current.phase = ((beatFloat % 1) + 1) % 1;
        masterBeatClockRef.current.beatIndex = ((Math.floor(beatFloat + 0.0005) % 4) + 4) % 4;
        syncedMasterClock = true;
      } else if (isAutoSetPlayingRef.current && renderedScheduleRef.current) {
        const beatList = renderedScheduleRef.current.beatTimesTimeline;
        if (beatList && beatList.length >= 2) {
          let lo = 0;
          let hi = beatList.length - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (beatList[mid] <= stageTime) lo = mid;
            else hi = mid - 1;
          }
          const b0 = beatList[lo];
          const b1 = beatList[lo + 1] ?? b0 + 60 / Math.max(40, detectedMasterBpmRef.current);
          const span = Math.max(0.15, b1 - b0);
          masterBeatClockRef.current.phase = Math.max(0, Math.min(0.999, (stageTime - b0) / span));
          masterBeatClockRef.current.beatIndex = ((lo % 4) + 4) % 4;
          syncedMasterClock = true;
        }
      } else if (isPreviewPlayingRef.current && deckATrackRef.current) {
        const trk = deckATrackRef.current;
        const anchor = trk.downbeatTimes[0] ?? trk.beatTimes[0] ?? 0;
        const rawPeriod = 60 / Math.max(40, getEffectiveBpm(trk));
        const beatFloat = (stageTime - anchor) / rawPeriod;
        masterBeatClockRef.current.phase = ((beatFloat % 1) + 1) % 1;
        masterBeatClockRef.current.beatIndex = ((Math.floor(beatFloat + 0.0005) % 4) + 4) % 4;
        syncedMasterClock = true;
      }

      if (!syncedMasterClock) {
        const bpmNow = Math.max(40, Math.min(240, detectedMasterBpmRef.current || 120));
        const beatDelta = dt * (bpmNow / 60);
        const nextRaw = masterBeatClockRef.current.phase + beatDelta;
        if (nextRaw >= 1) {
          masterBeatClockRef.current.beatIndex =
            (masterBeatClockRef.current.beatIndex + Math.floor(nextRaw)) % 4;
        }
        masterBeatClockRef.current.phase = nextRaw % 1;
      }

      if (beatGridGlowSubscribersRef.current.size > 0) {
        beatGridGlowSubscribersRef.current.forEach((drawFn) => drawFn());
      }

      // Update Loop Deck playhead bar inside the 4-beat window
      const loopChain = loopDeckChainRef.current;
      if (loopChain && loopDeckPlayingRef.current && loopPlayheadBarRef.current) {
        const span = Math.max(0.03, loopChain.loopEndSec - loopChain.loopStartSec);
        const elapsed = ((now - loopChain.startedAtPerfMs) / 1000) * loopChain.playbackRate;
        const posInsideLoop = ((elapsed % span) + span) % span;
        const beatFrac = Math.min(1, posInsideLoop / Math.max(0.03, span));
        const activeWidthPct = Math.min(100, (loopDeckBeatsRef.current / 4) * 100);
        loopPlayheadBarRef.current.style.left = `${(beatFrac * activeWidthPct).toFixed(1)}%`;
      }

      // Pull FFT & beat energy
      let lowPassRms = 0;
      const isAnyPlaying =
        isAutoSetPlayingRef.current ||
        isPreviewPlayingRef.current ||
        deckAPlayingRef.current ||
        deckBPlayingRef.current ||
        deckAScratchingRef.current ||
        deckBScratchingRef.current ||
        loopDeckPlayingRef.current;
      if (analyserRef.current && isAnyPlaying) {
        analyserRef.current.getByteFrequencyData(freqBuf);
        analyserRef.current.getByteTimeDomainData(waveBuf);
        analyserRef.current.getFloatTimeDomainData(postFloatBuf);
        if (beatAnalyserRef.current) {
          beatAnalyserRef.current.getByteTimeDomainData(lpWaveBuf);
          lowPassRms = computeLowPassRms(lpWaveBuf);
        }
      } else if (offlineSetAnalyzerRef.current && renderedScheduleRef.current && stageTime > 0.02) {
        offlineSetAnalyzerRef.current.analyzeAt(
          stageTime,
          settingsRef.current.smoothing,
          freqBuf,
          waveBuf
        );
      } else {
        const syn = buildSyntheticAudioFrame(1024);
        freqBuf.set(syn.frequencyData);
        waveBuf.set(syn.timeDomainData);
      }

      // Master Output Brick-Wall Limiter Peak Sensing & Auto-Gain Tracking
      const limNodes = masterLimiterNodesRef.current;
      let instPrePeak = 0;
      let instPostPeak = 0;
      if (limNodes && isAnyPlaying) {
        limNodes.preLimiterAnalyser.getFloatTimeDomainData(preFloatBuf);
        for (let i = 0; i < preFloatBuf.length; i++) {
          const ap = Math.abs(preFloatBuf[i]);
          if (ap > instPrePeak) instPrePeak = ap;
        }
        for (let i = 0; i < postFloatBuf.length; i++) {
          const ao = Math.abs(postFloatBuf[i]);
          if (ao > instPostPeak) instPostPeak = ao;
        }
        if (instPrePeak > loudestStackPeakRef.current) {
          loudestStackPeakRef.current = instPrePeak;
        }
        if (limiterEnabledRef.current && limiterAutoGainEnabledRef.current) {
          const ceilLin = Math.pow(10, limiterCeilingDbRef.current / 20);
          const refPeak = Math.max(0.15, loudestStackPeakRef.current);
          let nextTrim = 1;
          if (refPeak > ceilLin) {
            nextTrim = Math.max(0.25, ceilLin / refPeak);
          } else if (refPeak < ceilLin * 0.85) {
            nextTrim = Math.min(1.5, ceilLin / refPeak);
          }
          if (Math.abs(nextTrim - lastAutoTrimGainRef.current) > 0.012) {
            lastAutoTrimGainRef.current = nextTrim;
            limNodes.autoTrimGain.gain.setTargetAtTime(
              nextTrim,
              limNodes.autoTrimGain.context.currentTime,
              0.015
            );
          }
        }
      }

      visualPrePeak = Math.max(instPrePeak, visualPrePeak * 0.88);
      visualOutPeak = Math.max(instPostPeak, visualOutPeak * 0.86);

      if (now - lastLimiterMeterUpdateMsRef.current >= 65) {
        lastLimiterMeterUpdateMsRef.current = now;
        const heldPeak = Math.max(loudestStackPeakRef.current, visualPrePeak);
        const stackPeakDb = heldPeak > 0.0001 ? 20 * Math.log10(heldPeak) : -60;
        const outDb = visualOutPeak > 0.0001 ? 20 * Math.log10(visualOutPeak) : -60;
        const autoGainDb = 20 * Math.log10(Math.max(0.05, lastAutoTrimGainRef.current));
        const compGrDb = limNodes ? Math.min(0, limNodes.compressor.reduction || 0) : 0;
        const preAfterTrim = instPrePeak * lastAutoTrimGainRef.current;
        const clipGrDb =
          limiterEnabledRef.current && preAfterTrim > instPostPeak + 0.005 && instPostPeak > 0.001
            ? Math.min(0, 20 * Math.log10(instPostPeak / preAfterTrim))
            : 0;
        const totalGrDb = Math.min(0, compGrDb + clipGrDb);

        const prePct = Math.max(2, Math.min(100, ((stackPeakDb + 36) / 42) * 100));
        const outPct = Math.max(2, Math.min(100, ((outDb + 36) / 36.5) * 100));
        const grPct = Math.max(0, Math.min(100, (Math.abs(totalGrDb) / 12) * 100));

        if (limiterPreBarRef.current) {
          limiterPreBarRef.current.style.width = `${prePct.toFixed(1)}%`;
        }
        if (limiterOutBarRef.current) {
          limiterOutBarRef.current.style.width = `${outPct.toFixed(1)}%`;
        }
        if (limiterGrBarRef.current) {
          limiterGrBarRef.current.style.width = `${grPct.toFixed(1)}%`;
        }
        if (mixerLimiterLedBarRef.current) {
          mixerLimiterLedBarRef.current.style.width = `${outPct.toFixed(1)}%`;
        }
        if (limiterStackPeakTextRef.current) {
          limiterStackPeakTextRef.current.textContent =
            heldPeak > 0.0001
              ? `${stackPeakDb >= 0 ? '+' : ''}${stackPeakDb.toFixed(1)} dBFS`
              : '-∞ dBFS';
        }
        if (limiterAutoGainTextRef.current) {
          limiterAutoGainTextRef.current.textContent =
            limiterEnabledRef.current && limiterAutoGainEnabledRef.current
              ? `${autoGainDb >= 0 ? '+' : ''}${autoGainDb.toFixed(1)} dB`
              : '0.0 dB';
        }
        if (limiterGrTextRef.current) {
          limiterGrTextRef.current.textContent = `${totalGrDb.toFixed(1)} dB`;
        }
        if (limiterOutTextRef.current) {
          limiterOutTextRef.current.textContent =
            visualOutPeak > 0.0001
              ? `${outDb >= 0 ? '+' : ''}${outDb.toFixed(1)} dBFS`
              : '-∞ dBFS';
        }
        const badgeText = !limiterEnabledRef.current
          ? visualOutPeak > 0.99
            ? 'CLIPPING!'
            : 'BYPASSED'
          : totalGrDb < -0.25
            ? 'LIMITING'
            : 'BRICK-WALL SAFE';
        if (limiterStatusBadgeRef.current) {
          limiterStatusBadgeRef.current.textContent = badgeText;
        }
        if (mixerLimiterStatusRef.current) {
          mixerLimiterStatusRef.current.textContent = !limiterEnabledRef.current
            ? 'OFF'
            : totalGrDb < -0.25
              ? `GR ${totalGrDb.toFixed(1)}dB`
              : `${limiterCeilingDbRef.current.toFixed(1)}dB`;
        }
        const transientSnap = fxRackRef.current?.transientShaper.getMeterSnapshot();
        if (transientSnap) {
          const attDb = transientSnap.active ? transientSnap.attackDb : 0;
          const susDb = transientSnap.active ? transientSnap.sustainDb : 0;
          if (transientAttackTextRef.current) {
            transientAttackTextRef.current.textContent =
              Math.abs(attDb) < 0.05
                ? '0.0 dB'
                : `${attDb > 0 ? '+' : ''}${attDb.toFixed(1)} dB`;
          }
          if (transientSustainTextRef.current) {
            transientSustainTextRef.current.textContent =
              Math.abs(susDb) < 0.05
                ? '0.0 dB'
                : `${susDb > 0 ? '+' : ''}${susDb.toFixed(1)} dB`;
          }
          if (transientAttackBarRef.current) {
            const norm = Math.max(-1, Math.min(1, attDb / 8));
            transientAttackBarRef.current.style.left = norm >= 0 ? '50%' : `${(50 + norm * 50).toFixed(1)}%`;
            transientAttackBarRef.current.style.width = `${(Math.abs(norm) * 50).toFixed(1)}%`;
          }
          if (transientSustainBarRef.current) {
            const norm = Math.max(-1, Math.min(1, susDb / 8));
            transientSustainBarRef.current.style.left = norm >= 0 ? '50%' : `${(50 + norm * 50).toFixed(1)}%`;
            transientSustainBarRef.current.style.width = `${(Math.abs(norm) * 50).toFixed(1)}%`;
          }
        }
        const gateSnap = fxRackRef.current?.noiseGate.getMeterSnapshot();
        if (gateSnap) {
          if (noiseGateBadgeRef.current) {
            if (!gateSnap.active) {
              noiseGateBadgeRef.current.textContent = 'BYPASS';
              noiseGateBadgeRef.current.className = 'text-[9px] font-mono font-semibold text-slate-500';
            } else if (gateSnap.isOpen) {
              noiseGateBadgeRef.current.textContent = 'OPEN';
              noiseGateBadgeRef.current.className = 'text-[9px] font-mono font-semibold text-emerald-300';
            } else {
              noiseGateBadgeRef.current.textContent = 'GATED · SILENT';
              noiseGateBadgeRef.current.className = 'text-[9px] font-mono font-semibold text-rose-300';
            }
          }
          if (noiseGateGrBarRef.current) {
            const pct = gateSnap.active
              ? Math.max(0, Math.min(100, (Math.abs(gateSnap.reductionDb) / 60) * 100))
              : 0;
            noiseGateGrBarRef.current.style.width = `${pct.toFixed(1)}%`;
          }
        }
      }

      const activeSettings = settingsRef.current;
      const { width, height } = ASPECT_RATIOS[activeSettings.aspectRatio];
      const minDim = Math.min(width, height);
      const cycled = resolveAutoCycledColors(activeSettings, stageTime);
      const step = stepBeatDetector(
        beatStateRef.current,
        lowPassRms,
        dt,
        activeSettings.beatSensitivity,
        minDim,
        cycled.primaryColor,
        cycled.secondaryColor
      );

      if (beatMeterBarRef.current) {
        const meterPct = Math.max(
          4,
          Math.min(100, Math.round(step.burstIntensity * 85 + lowPassRms * 120))
        );
        beatMeterBarRef.current.style.width = `${meterPct}%`;
      }

      const canvas = stageCanvasRef.current;
      if (canvas) {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const sched = renderedScheduleRef.current;
          const resolver = autoSetVideoResolverRef.current;
          const activeVideoFrame =
            resolver && resolver.hasActiveVideo()
              ? resolver.resolvePreviewFrame(stageTime, width, height)
              : null;

          const activeLyrics =
            currentLyricsRef.current.length > 0
              ? currentLyricsRef.current
              : (sched?.mergedLyrics ?? deckATrackRef.current?.lyrics ?? []);
          const activeBpm =
            sched?.segments[0]?.targetBpm ??
            (deckATrackRef.current ? getEffectiveBpm(deckATrackRef.current) : 124);

          renderVisualizerFrame({
            ctx,
            width,
            height,
            currentTime: stageTime,
            dt,
            frequencyData: freqBuf,
            timeDomainData: waveBuf,
            settings: activeSettings,
            lyrics: activeLyrics,
            bgImage: activeVideoFrame ?? bgImageRef.current,
            albumImage: albumImageRef.current,
            mocapClip: mocapClipRef.current,
            particles: particlesRef.current,
            isExport: false,
            albumRotationRef: albumRotRef.current,
            beatBurst: step.burstIntensity,
            beatTriggered: step.triggered,
            bpm: activeBpm,
            beatShockwaves: activeSettings.beatDetection
              ? beatStateRef.current.shockwaves
              : undefined,
            motionBlurState: motionBlurRef.current,
            sceneTransitionState: sceneTransRef.current,
            trackDuration: sched?.totalDurationSec ?? deckATrackRef.current?.duration,
          });

          // Optional crisp DJ Club HUD overlay showing active Decks, BPM & Beat Counter
          if (showDjHudRef.current && (deckATrackRef.current || deckBTrackRef.current)) {
            ctx.save();
            const padX = Math.round(width * 0.025);
            const padY = Math.round(height * 0.025);
            const pillW = Math.min(width * 0.42, 420);
            const pillH = 44;

            if (deckATrackRef.current) {
              ctx.fillStyle = 'rgba(9, 11, 16, 0.72)';
              ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.roundRect(padX, padY, pillW, pillH, 10);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#22d3ee';
              ctx.font = 'bold 11px "JetBrains Mono", monospace';
              ctx.fillText(
                `DECK A · ${getEffectiveBpm(deckATrackRef.current)} BPM`,
                padX + 12,
                padY + 16
              );
              ctx.fillStyle = '#f1f5f9';
              ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
              ctx.fillText(
                deckATrackRef.current.title.slice(0, 32),
                padX + 12,
                padY + 33
              );
            }

            if (deckBTrackRef.current) {
              const bx = width - padX - pillW;
              ctx.fillStyle = 'rgba(9, 11, 16, 0.72)';
              ctx.strokeStyle = 'rgba(245, 158, 11, 0.55)';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.roundRect(bx, padY, pillW, pillH, 10);
              ctx.fill();
              ctx.stroke();

              ctx.fillStyle = '#f59e0b';
              ctx.font = 'bold 11px "JetBrains Mono", monospace';
              ctx.textAlign = 'right';
              ctx.fillText(
                `DECK B · ${getEffectiveBpm(deckBTrackRef.current)} BPM`,
                bx + pillW - 12,
                padY + 16
              );
              ctx.fillStyle = '#f1f5f9';
              ctx.font = '600 12px "Plus Jakarta Sans", sans-serif';
              ctx.fillText(
                deckBTrackRef.current.title.slice(0, 32),
                bx + pillW - 12,
                padY + 33
              );
            }
            ctx.restore();
          }
        }
      }

      // Independent Per-Deck Pre-Fader Visualizer Outputs (Deck A & Deck B)
      if (showDeckVisualizersRef.current) {
        const aspectScale = Math.min(440 / Math.max(1, width), 300 / Math.max(1, height));
        const monW = Math.max(180, Math.round(width * aspectScale));
        const monH = Math.max(140, Math.round(height * aspectScale));
        const monMinDim = Math.min(monW, monH);
        const sched = renderedScheduleRef.current;

        const renderDeckMonitor = (deck: 'A' | 'B') => {
          const isA = deck === 'A';
          const track = isA ? deckATrackRef.current : deckBTrackRef.current;
          const chain = isA ? deckAChainRef.current : deckBChainRef.current;
          const isLive = isA
            ? deckAPlayingRef.current || deckAScratchingRef.current
            : deckBPlayingRef.current || deckBScratchingRef.current;
          const deckCanvas = isA ? deckACanvasRef.current : deckBCanvasRef.current;
          const beatState = isA ? deckABeatStateRef.current : deckBBeatStateRef.current;
          const particles = isA ? deckAParticlesRef.current : deckBParticlesRef.current;
          const albumRot = isA ? deckAAlbumRotRef.current : deckBAlbumRotRef.current;
          const sceneTrans = isA ? deckASceneTransRef.current : deckBSceneTransRef.current;
          const offlineAnalyzer = isA
            ? deckAOfflineAnalyzerRef.current
            : deckBOfflineAnalyzerRef.current;
          const offlineBeatTracker = isA
            ? deckAOfflineBeatTrackerRef.current
            : deckBOfflineBeatTrackerRef.current;
          const lowBar = isA ? deckALowBarRef.current : deckBLowBarRef.current;
          const midBar = isA ? deckAMidBarRef.current : deckBMidBarRef.current;
          const highBar = isA ? deckAHighBarRef.current : deckBHighBarRef.current;
          const modeEl = isA ? deckAMonitorModeRef.current : deckBMonitorModeRef.current;
          const beatBurstEl = isA ? deckABeatBurstTextRef.current : deckBBeatBurstTextRef.current;
          const beatBorderEl = isA ? deckABeatBorderRef.current : deckBBeatBorderRef.current;

          let deckLowPassRms = 0;
          let monitorTime = isA ? deckATimeRef.current : deckBTimeRef.current;
          let monitorStatus: 'LIVE PRE-FADER' | 'AUTO-MIX PRE' | 'STANDBY' = 'STANDBY';
          let playbackRate = isA
            ? 1 + deckAPitchPctRef.current / 100
            : 1 + deckBPitchPctRef.current / 100;

          if (isLive && chain?.analyser) {
            chain.analyser.getByteFrequencyData(deckFreqBuf);
            chain.analyser.getByteTimeDomainData(deckWaveBuf);
            chain.beatAnalyser.getByteTimeDomainData(deckLpWaveBuf);
            deckLowPassRms = computeLowPassRms(deckLpWaveBuf);
            monitorStatus = 'LIVE PRE-FADER';
          } else if (
            isAutoSetPlayingRef.current &&
            sched &&
            track &&
            offlineAnalyzer
          ) {
            const matchingSeg = sched.segments.find((seg) => {
              if (seg.track.id !== track.id) return false;
              const segEnd =
                seg.timelineStartSec +
                seg.sourcePlayDurationSec / Math.max(0.25, seg.playbackRate || 1);
              return stageTime >= seg.timelineStartSec && stageTime <= segEnd;
            });
            if (matchingSeg) {
              const rate = Math.max(0.25, matchingSeg.playbackRate || 1);
              const sourceT =
                matchingSeg.sourceOffsetSec + (stageTime - matchingSeg.timelineStartSec) * rate;
              offlineAnalyzer.analyzeAt(
                sourceT,
                activeSettings.smoothing,
                deckFreqBuf,
                deckWaveBuf
              );
              deckLowPassRms = offlineBeatTracker
                ? offlineBeatTracker.getLowPassRmsAt(sourceT, 1024)
                : 0;
              monitorTime = sourceT;
              playbackRate = rate;
              monitorStatus = 'AUTO-MIX PRE';
            } else {
              deckFreqBuf.fill(0);
              deckWaveBuf.fill(128);
            }
          } else {
            deckFreqBuf.fill(0);
            deckWaveBuf.fill(128);
          }

          // Compute pre-fader Low / Mid / High band averages directly for reactive meters
          let lowSum = 0;
          for (let i = 0; i <= 10; i++) lowSum += deckFreqBuf[i];
          const lowNorm = lowSum / (11 * 255);

          let midSum = 0;
          for (let i = 11; i <= 80; i++) midSum += deckFreqBuf[i];
          const midNorm = midSum / (70 * 255);

          let highSum = 0;
          for (let i = 81; i <= 320; i++) highSum += deckFreqBuf[i];
          const highNorm = highSum / (240 * 255);

          const useDeckTint = deckVisualizerTintModeRef.current === 'deck-accent';
          const deckSettings: StudioSettings = useDeckTint
            ? {
                ...activeSettings,
                themePreset: 'custom',
                autoCycleColor: false,
                beatColorMappingEnabled: false,
                primaryColor: isA ? '#22d3ee' : '#f59e0b',
                secondaryColor: isA ? '#38bdf8' : '#fb7185',
                lyricsOnly: false,
              }
            : {
                ...activeSettings,
                lyricsOnly: false,
              };

          const deckCycled = resolveAutoCycledColors(deckSettings, monitorTime);
          const deckStep = stepBeatDetector(
            beatState,
            deckLowPassRms,
            dt,
            deckSettings.beatSensitivity,
            monMinDim,
            deckCycled.primaryColor,
            deckCycled.secondaryColor
          );

          if (lowBar) {
            lowBar.style.transform = `scaleX(${Math.max(0.03, Math.min(1, lowNorm)).toFixed(3)})`;
          }
          if (midBar) {
            midBar.style.transform = `scaleX(${Math.max(0.03, Math.min(1, midNorm)).toFixed(3)})`;
          }
          if (highBar) {
            highBar.style.transform = `scaleX(${Math.max(0.03, Math.min(1, highNorm)).toFixed(3)})`;
          }
          if (beatBorderEl) {
            beatBorderEl.style.opacity = Math.min(
              1,
              deckStep.burstIntensity * 0.85 + deckLowPassRms * 0.45
            ).toFixed(3);
          }
          if (modeEl && modeEl.textContent !== monitorStatus) {
            modeEl.textContent = monitorStatus;
          }
          if (beatBurstEl) {
            const pct = Math.round(
              Math.min(100, deckStep.burstIntensity * 75 + deckLowPassRms * 85)
            );
            beatBurstEl.textContent = `${pct}%`;
          }

          if (deckCanvas) {
            if (deckCanvas.width !== monW || deckCanvas.height !== monH) {
              deckCanvas.width = monW;
              deckCanvas.height = monH;
            }
            const monCtx = deckCanvas.getContext('2d');
            if (monCtx) {
              renderVisualizerFrame({
                ctx: monCtx,
                width: monW,
                height: monH,
                currentTime: monitorTime,
                dt,
                frequencyData: deckFreqBuf,
                timeDomainData: deckWaveBuf,
                settings: deckSettings,
                lyrics: [],
                bgImage: bgImageRef.current,
                albumImage: albumImageRef.current,
                mocapClip: null,
                particles,
                isExport: false,
                albumRotationRef: albumRot,
                beatBurst: deckStep.burstIntensity,
                beatTriggered: deckStep.triggered,
                bpm: track ? getEffectiveBpm(track) * playbackRate : 124,
                beatShockwaves: deckSettings.beatDetection ? beatState.shockwaves : undefined,
                sceneTransitionState: sceneTrans,
                trackDuration: track?.duration,
              });
            }
          }
        };

        renderDeckMonitor('A');
        renderDeckMonitor('B');
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen]);

  if (!isOpen) return null;

  const masterBpmDisplay = deckATrack
    ? getEffectiveBpm(deckATrack)
    : deckBTrack
      ? getEffectiveBpm(deckBTrack)
      : 120;

  const isAnyDjPlaying =
    isAutoSetPlaying ||
    deckAPlaying ||
    deckBPlaying ||
    deckAScratching ||
    deckBScratching;
  const stageDisplayTime = isAutoSetPlaying
    ? autoSetTime
    : deckAPlaying || deckBPlaying || deckAScratching || deckBScratching
      ? (crossfader > 0.25 && (deckBPlaying || deckBScratching)) ||
        (!(deckAPlaying || deckAScratching) && (deckBPlaying || deckBScratching))
        ? deckBTime
        : deckATime
      : autoSetTime;
  const stageLyrics =
    currentLyrics.length > 0
      ? currentLyrics
      : (renderedSchedule?.mergedLyrics ?? deckATrack?.lyrics ?? []);
  const sidebarAudioBuffer = renderedMixBuffer ?? deckATrack?.audioBuffer ?? currentAudioBuffer;
  const sidebarAudioLabel =
    crate.length > 0
      ? `${crate.length} DJ track${crate.length > 1 ? 's' : ''} (${masterBpmDisplay} BPM)`
      : currentAudioFileName;

  return (
    <div
      className="fixed inset-0 z-40 bg-black/85 backdrop-blur-sm flex items-center justify-center p-1.5 sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dj-studio-title"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFiles(true);
      }}
      onDragLeave={() => setIsDraggingFiles(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFiles(false);
        if (e.dataTransfer.files.length > 0) {
          void handleImportFiles(e.dataTransfer.files);
        }
      }}
    >
      <div className="w-full h-full bg-[#090b10] border border-white/[0.12] rounded-xl shadow-2xl flex flex-col overflow-hidden relative">
        {isDraggingFiles && (
          <div className="absolute inset-0 z-40 bg-cyan-500/15 border-2 border-dashed border-cyan-400 rounded-xl flex items-center justify-center pointer-events-none">
            <div className="px-6 py-4 rounded-xl bg-[#0f131c] border border-cyan-400/50 text-sm font-semibold text-cyan-200">
              Drop Audio or Video tracks to detect BPM, Beat Grid &amp; Waveforms
            </div>
          </div>
        )}

        {/* Hidden File Inputs */}
        <input
          ref={deckAInputRef}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleImportFiles(e.target.files, 'A');
            e.target.value = '';
          }}
        />
        <input
          ref={deckBInputRef}
          type="file"
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleImportFiles(e.target.files, 'B');
            e.target.value = '';
          }}
        />
        <input
          ref={crateInputRef}
          type="file"
          multiple
          accept="audio/*,video/*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleImportFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={deckALyricInputRef}
          type="file"
          accept=".lrc,.srt,.vtt,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUploadDeckLyricsFile('A', f);
            e.target.value = '';
          }}
        />
        <input
          ref={deckBLyricInputRef}
          type="file"
          accept=".lrc,.srt,.vtt,.txt"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleUploadDeckLyricsFile('B', f);
            e.target.value = '';
          }}
        />
        <input
          ref={samplerPadInputRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            const padId = samplerTargetUploadPadIdRef.current;
            if (f && padId) {
              void handleLoadAudioFileToSamplerPad(padId, f);
            }
            e.target.value = '';
          }}
        />

        {/* Top DJ Console + Full Studio Toolbar */}
        <div className="h-14 shrink-0 px-3 sm:px-4 border-b border-white/[0.08] bg-[#121620] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-amber-400/20 border border-cyan-400/35 flex items-center justify-center shrink-0">
                <Disc3 className="w-4 h-4 text-cyan-300" />
              </div>
              <div>
                <h2
                  id="dj-studio-title"
                  className="text-xs sm:text-sm font-semibold text-slate-100 whitespace-nowrap"
                >
                  DJ Beat &amp; Lyric Mix Studio
                </h2>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
                    Master {masterBpmDisplay} BPM · {crate.length} Track{crate.length === 1 ? '' : 's'}
                  </p>
                  <button
                    type="button"
                    onClick={handleDjTapTempo}
                    title="Tap Tempo (click rhythmically to log session BPM)"
                    className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-wider border transition-all cursor-pointer whitespace-nowrap ${
                      tapPulseFlash
                        ? 'bg-emerald-400 text-[#090b10] border-emerald-300 scale-95'
                        : tapTempoBpm !== null
                          ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/35 hover:bg-emerald-400/25'
                          : 'bg-white/[0.06] text-slate-300 border-white/[0.12] hover:bg-white/[0.12]'
                    }`}
                  >
                    {tapTempoCount > 0 && tapTempoBpm === null
                      ? `Tap (${tapTempoCount})`
                      : tapTempoBpm !== null
                        ? `Tap ${tapTempoBpm.toFixed(1)}`
                        : 'Tap BPM'}
                  </button>
                </div>
              </div>
            </div>

            {/* Mobile Pane Switcher */}
            <div className="flex lg:hidden items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => setMobilePane('dj')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  mobilePane === 'dj'
                    ? 'bg-cyan-400 text-[#090b10] font-semibold'
                    : 'text-slate-300'
                }`}
              >
                DJ &amp; Stage
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('studio')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  mobilePane === 'studio'
                    ? 'bg-cyan-400 text-[#090b10] font-semibold'
                    : 'text-slate-300'
                }`}
              >
                Studio Features
              </button>
            </div>

            {/* Desktop Toggle for Embedded Main Studio Sidebar */}
            <button
              type="button"
              onClick={() => setShowStudioSidebar((v) => !v)}
              title={showStudioSidebar ? 'Hide Studio Features Sidebar' : 'Show Studio Features Sidebar'}
              className={`hidden lg:flex px-2 py-1.5 rounded-lg text-[11px] font-medium border items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                showStudioSidebar
                  ? 'bg-cyan-500/15 border-cyan-400/35 text-cyan-200'
                  : 'bg-white/[0.05] border-white/[0.09] text-slate-300 hover:text-white'
              }`}
            >
              {showStudioSidebar ? (
                <PanelLeftClose className="w-3.5 h-3.5 text-cyan-300" />
              ) : (
                <PanelLeftOpen className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span>Studio Panel</span>
            </button>

            {/* Quick Title Input */}
            <input
              type="text"
              value={settings.trackTitle}
              onChange={(e) => onUpdateSettings({ trackTitle: e.target.value })}
              placeholder="DJ Mix Title"
              aria-label="DJ Mix Title"
              className="hidden xl:block w-40 px-2.5 py-1 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
            />

            <button
              type="button"
              onClick={() => void handleLoadDemoDjPair()}
              disabled={isAnalyzing}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
              <span>{isAnalyzing ? 'Analyzing...' : 'Demo DJ Pair'}</span>
            </button>

            <button
              type="button"
              onClick={() => crateInputRef.current?.click()}
              disabled={isAnalyzing}
              className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.09] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
              <span>Import Media</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Undo / Redo + Snapshot + Projects + MIDI */}
            <div className="hidden sm:flex items-center gap-1 pr-1.5 border-r border-white/[0.08]">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo || isApplyingMix}
                title="Undo"
                aria-label="Undo"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 cursor-pointer"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo || isApplyingMix}
                title="Redo"
                aria-label="Redo"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 cursor-pointer"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
              {onCaptureProjectSnapshot && (
                <button
                  type="button"
                  onClick={() =>
                    onCaptureProjectSnapshot(
                      `DJ Snapshot (${settings.trackTitle.trim() || `${crate.length} tracks`})`
                    )
                  }
                  title="Save full Project State Snapshot"
                  className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-200 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <BookmarkPlus className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden 2xl:inline">Snapshot</span>
                </button>
              )}
              {onOpenProjects && (
                <button
                  type="button"
                  onClick={onOpenProjects}
                  title="Open Saved Projects & Snapshots"
                  className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-200 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-cyan-300" />
                  <span className="hidden 2xl:inline">Projects</span>
                </button>
              )}
              <button
                type="button"
                onClick={onOpenMidiMapping}
                title="Hardware MIDI Mapping"
                className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-200 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Cable className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden 2xl:inline">MIDI</span>
              </button>
              {onOpenMixStudio && (
                <button
                  type="button"
                  onClick={() => {
                    stopAllDjPlayback();
                    onOpenMixStudio();
                  }}
                  title="Switch to Multi-Track Audio & Video Mixer Studio"
                  className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-200 hover:text-white bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-fuchsia-300" />
                  <span className="hidden 2xl:inline">
                    Mixer{mixClipCount > 0 ? ` (${mixClipCount})` : ''}
                  </span>
                </button>
              )}
            </div>

            <div className="hidden md:flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
              <button
                type="button"
                onClick={() => setStageView('stage-split')}
                className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  stageView === 'stage-split' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400'
                }`}
              >
                Stage + Decks
              </button>
              <button
                type="button"
                onClick={() => setStageView('console')}
                className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  stageView === 'console' ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-400'
                }`}
              >
                Full Console
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleCommitDjMix('batch')}
              disabled={(!deckATrack && crate.length === 0) || isApplyingMix || isExporting}
              className="hidden sm:flex px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.09] items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Batch</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCommitDjMix('apply')}
              disabled={(!deckATrack && crate.length === 0) || isApplyingMix || isExporting}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.07] hover:bg-white/[0.13] text-slate-100 border border-white/[0.1] flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              {isApplyingMix ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span>Apply</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCommitDjMix('export')}
              disabled={(!deckATrack && crate.length === 0) || isApplyingMix || isExporting}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              {isApplyingMix ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Export DJ MP4</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopAllDjPlayback();
                onClose();
              }}
              aria-label="Close DJ Studio"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status / Error Ribbon */}
        {(errorMsg || statusMessage) && (
          <div
            className={`px-4 py-1.5 text-xs border-b flex items-center justify-between gap-3 shrink-0 ${
              errorMsg
                ? 'bg-rose-500/15 border-rose-500/30 text-rose-200'
                : 'bg-cyan-500/10 border-cyan-500/20 text-cyan-100'
            }`}
          >
            <span className="truncate">{errorMsg ?? statusMessage}</span>
            <button
              type="button"
              onClick={() => {
                setErrorMsg(null);
                setStatusMessage(null);
              }}
              className="text-[11px] opacity-80 hover:opacity-100 cursor-pointer shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Full Studio Body: Embedded ControlSidebar (Left) + Complete DJ Console & Stage (Right) */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Embedded Main Studio Sidebar (Visualizer, 3D Dancers & 50+ Mocap, Glow, Lyrics, Media, Presets, Style, Format) */}
          <div
            className={`${
              mobilePane === 'studio'
                ? 'flex flex-1 min-h-0'
                : showStudioSidebar
                  ? 'hidden lg:flex'
                  : 'hidden'
            } lg:w-[370px] shrink-0 min-h-0`}
          >
            <ControlSidebar
              activeTab={activeTab}
              onTabChange={onTabChange}
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              audioFileName={sidebarAudioLabel}
              duration={djSetTotalDuration}
              currentTime={stageDisplayTime}
              isPlaying={isAnyDjPlaying}
              trimStart={djTrimStart}
              trimEnd={djTrimEnd}
              onTrimChange={(start, end) => {
                setDjTrimStart(start);
                setDjTrimEnd(end);
              }}
              onAudioFileSelect={(file) => void handleImportFiles([file])}
              onLoadDemo={() => void handleLoadDemoDjPair()}
              isGeneratingDemo={isAnalyzing}
              onBgImageSelect={onBgImageSelect}
              bgImageName={bgImageName}
              hasBgImage={Boolean(bgImageName)}
              onAlbumImageSelect={onAlbumImageSelect}
              albumImageName={albumImageName}
              hasAlbumImage={Boolean(albumImageName)}
              onCopyBgToAlbum={onCopyBgToAlbum}
              onCopyAlbumToBg={onCopyAlbumToBg}
              onDownloadCoverThumbnail={onDownloadCoverThumbnail}
              onSetProjectThumbnailFromCover={onSetProjectThumbnailFromCover}
              lyrics={stageLyrics}
              onLyricsChange={onLyricsChange}
              onSeek={(t) => {
                if (isAutoSetPlaying && renderedMixBuffer) {
                  const timelineBeats = renderedScheduleRef.current?.beatTimesTimeline;
                  const snappedTimeline =
                    syncToBeatGrid && timelineBeats && timelineBeats.length > 0
                      ? findNearestBeat(timelineBeats, t)
                      : t;
                  setAutoSetTime(snappedTimeline);
                  void startAutoSetFromTime(snappedTimeline, renderedMixBuffer);
                } else if (deckATrack) {
                  const clamped = Math.min(deckATrack.duration, t);
                  const snappedDeck = syncToBeatGrid
                    ? snapTimeToTrackBeatGrid(deckATrack, clamped)
                    : clamped;
                  setAutoSetTime(snappedDeck);
                  setDeckATime(snappedDeck);
                  if (deckAPlaying) void startLiveDeckFromTime('A', snappedDeck);
                } else {
                  setAutoSetTime(t);
                }
              }}
              audioInputRef={sidebarAudioInputRef}
              savedPresets={savedPresets}
              onSavePreset={onSavePreset}
              onApplyPreset={onApplyPreset}
              onDeletePreset={onDeletePreset}
              onImportPresetFile={onImportPresetFile}
              onDownloadSnapshot={handleDjSnapshot}
              hasAudio={crate.length > 0 || Boolean(currentAudioBuffer)}
              audioBuffer={sidebarAudioBuffer}
              isGeneratingCaptions={isGeneratingCaptions}
              captionsNotice={captionsNotice}
              onDismissCaptionsNotice={onDismissCaptionsNotice}
              onAutoGenerateCaptions={handleDjAutoCaptions}
              onAutoArrange={onAutoArrange}
              autoArrangeNotice={autoArrangeNotice}
              beatMeterBarRef={beatMeterBarRef}
              currentBpm={masterBpmDisplay}
              midiMappingBadges={midiMappingBadges}
              onOpenMidiMapping={onOpenMidiMapping}
              onPreviewSceneTransition={handlePreviewSceneTransition}
              mocapClip={mocapClip}
              onMocapFileSelect={onMocapFileSelect}
              onClearMocapClip={onClearMocapClip}
              mixClipCount={mixClipCount}
              onOpenMixStudio={
                onOpenMixStudio
                  ? () => {
                      stopAllDjPlayback();
                      onOpenMixStudio();
                    }
                  : undefined
              }
              containerClassName="w-full h-full border-r border-white/[0.08] bg-[#121620] flex flex-col min-h-0"
            />
          </div>

          {/* Right Workspace: DJ Stage Preview + Smart Crossfade + Dual Decks + Crate */}
          <div
            className={`${
              mobilePane === 'dj' ? 'flex' : 'hidden lg:flex'
            } flex-1 min-w-0 min-h-0 flex-col overflow-hidden`}
          >
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
              {/* Top Row: Live Stage Canvas (with Full PreviewStage controls) + Smart Beat/Lyric Auto-Mix Strip */}
              {stageView === 'stage-split' && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
                  {/* Live Interactive PreviewStage */}
                  <div className="xl:col-span-5 bg-[#05070b] border border-white/[0.09] rounded-xl overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e121b] border-b border-white/[0.07]">
                      <span className="text-[11px] font-semibold text-slate-300">
                        Live Stage · {settings.aspectRatio} · {settings.exportResolution}
                      </span>
                      <div className="flex items-center gap-2.5">
                        <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showDjHudOnStage}
                            onChange={(e) => setShowDjHudOnStage(e.target.checked)}
                            className="accent-cyan-400"
                          />
                          <span>Deck HUD</span>
                        </label>
                      </div>
                    </div>
                    <div className="relative h-[270px] sm:h-[300px] w-full flex flex-col min-h-0">
                      <PreviewStage
                        canvasRef={stageCanvasRef}
                        aspectRatio={settings.aspectRatio}
                        hasAudio={crate.length > 0 || Boolean(renderedMixBuffer)}
                        isPlaying={isAnyDjPlaying}
                        isGeneratingDemo={isAnalyzing}
                        showSafeZone={settings.showSafeZone}
                        onToggleSafeZone={() =>
                          onUpdateSettings({ showSafeZone: !settings.showSafeZone })
                        }
                        onAutoArrange={onAutoArrange}
                        autoArrangeNotice={autoArrangeNotice}
                        onTogglePlay={() => {
                          if (isAutoSetPlaying) {
                            stopAutoSetPlayback();
                          } else if (renderedMixBuffer) {
                            void startAutoSetFromTime(
                              autoSetTime >= renderedMixBuffer.duration - 0.1 ? 0 : autoSetTime
                            );
                          } else if (deckATrack) {
                            toggleDeckPlay('A');
                          }
                        }}
                        onUploadAudioClick={() => crateInputRef.current?.click()}
                        onLoadDemo={() => void handleLoadDemoDjPair()}
                        lyrics={stageLyrics}
                        currentTime={stageDisplayTime}
                        duration={djSetTotalDuration}
                        isGeneratingCaptions={isGeneratingCaptions}
                        onLyricsChange={onLyricsChange}
                        onAutoGenerateCaptions={handleDjAutoCaptions}
                        onOpenLyricsTab={() => {
                          onTabChange('lyrics');
                          setMobilePane('studio');
                          setShowStudioSidebar(true);
                        }}
                      />
                    </div>
                  </div>

                  {/* Creative Beat / Lyric Mix Strategist & Set Transport */}
                  <div className="xl:col-span-7 bg-[#121620] border border-white/[0.09] rounded-xl p-3 flex flex-col justify-between gap-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                        {(
                          [
                            { id: 'beats', label: 'Mix by Beats' },
                            { id: 'lyrics', label: 'Mix by Lyrics' },
                            { id: 'manual', label: 'Live Manual Decks' },
                          ] as const
                        ).map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => setTriggerMode(m.id)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap cursor-pointer transition-colors ${
                              triggerMode === m.id
                                ? m.id === 'lyrics'
                                  ? 'bg-fuchsia-500 text-white'
                                  : 'bg-cyan-400 text-[#090b10]'
                                : 'text-slate-300 hover:text-white'
                            }`}
                          >
                            {m.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          aria-pressed={syncToBeatGrid}
                          onClick={handleToggleSyncToBeatGrid}
                          title="Snap playhead and cue points to the nearest beat marker when seeking or cueing"
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                            syncToBeatGrid
                              ? 'bg-cyan-500/15 border-cyan-400/45 text-cyan-200'
                              : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Magnet className="w-3 h-3" />
                          <span>Sync to Beat Grid</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBeatMatchTempo((v) => !v)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1 cursor-pointer ${
                            beatMatchTempo
                              ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                              : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                          }`}
                        >
                          {beatMatchTempo ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                          <span>BPM Sync</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setNormalizeMixAudio((v) => !v)}
                          className={`px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                            normalizeMixAudio
                              ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                              : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                          }`}
                        >
                          Auto-Level
                        </button>
                      </div>
                    </div>

                    {/* Transition Recipe & Video Layering Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">
                          Audio Transition
                        </span>
                        <select
                          value={transitionStyle}
                          onChange={(e) => setTransitionStyle(e.target.value as DjTransitionStyle)}
                          className="w-full px-2 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.1] text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                        >
                          {TRANSITION_STYLE_LABELS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">
                          Video Motion FX
                        </span>
                        <select
                          value={videoMixStyle}
                          onChange={(e) => setVideoMixStyle(e.target.value as DjVideoMixStyle)}
                          className="w-full px-2 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.1] text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                        >
                          {VIDEO_MIX_LABELS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">
                          Video Blend Mode
                        </span>
                        <select
                          value={videoBlendMode}
                          onChange={(e) => setVideoBlendMode(e.target.value as MixVideoBlendMode)}
                          className="w-full px-2 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.1] text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                        >
                          {MIX_VIDEO_BLEND_MODES.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                          <span>Video Opacity</span>
                          <span className="font-mono text-cyan-300">
                            {Math.round(videoLayerOpacity * 100)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={videoLayerOpacity}
                          onChange={(e) => setVideoLayerOpacity(parseFloat(e.target.value))}
                          className="w-full accent-cyan-400 cursor-pointer mt-2"
                        />
                      </label>

                      <label className="block space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-slate-400">
                          Crossfade Bars
                        </span>
                        <select
                          value={crossfadeBeats}
                          onChange={(e) =>
                            setCrossfadeBeats(Number(e.target.value) as 4 | 8 | 16 | 32)
                          }
                          className="w-full px-2 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.1] text-xs font-mono text-slate-100 focus:outline-none focus:border-cyan-400"
                        >
                          <option value={4}>4 Beats (1 Bar)</option>
                          <option value={8}>8 Beats (2 Bars)</option>
                          <option value={16}>16 Beats (4 Bars)</option>
                          <option value={32}>32 Beats (8 Bars)</option>
                        </select>
                      </label>

                      <div className="flex flex-col justify-end">
                        <button
                          type="button"
                          onClick={handleAutoPickLyricHandoff}
                          disabled={!deckATrack || !deckBTrack}
                          className="w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-fuchsia-200 border border-fuchsia-400/35 flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                        >
                          <Wand2 className="w-3.5 h-3.5" />
                          <span>Lyric Match</span>
                        </button>
                      </div>
                    </div>

                {/* Auto-Mix Blueprint Summary & Instant Play Mix */}
                <div className="bg-[#090b10] border border-white/[0.08] rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-300 space-y-0.5 min-w-0">
                    {dualPlan ? (
                      <>
                        <div className="font-medium text-slate-100 truncate">
                          {dualPlan.triggerMode === 'lyrics'
                            ? `Lyric Handoff: ${dualPlan.deckAOutLyricText ? `"${dualPlan.deckAOutLyricText.slice(0, 26)}..."` : `${dualPlan.deckAOutTime}s`} -> ${dualPlan.deckBInLyricText ? `"${dualPlan.deckBInLyricText.slice(0, 26)}..."` : `${dualPlan.deckBInTime}s`}`
                            : `Beat-Grid Blend @ ${dualPlan.transitionStartSec.toFixed(1)}s · ${dualPlan.overlapDurationSec.toFixed(1)}s overlap · Locked ${dualPlan.targetBpm} BPM`}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-400">
                          Total Set: {formatDjClock(dualPlan.totalDurationSec)} · Deck B Rate: {(dualPlan.deckBPlaybackRate * 100).toFixed(1)}% · Merged Lyrics: {dualPlan.mergedLyrics.length}
                        </div>
                      </>
                    ) : (
                      <div className="text-slate-400">
                        Load Deck A &amp; Deck B (or click Demo DJ Pair) to compute an automatic Beat or Lyric transition.
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {renderedMixBuffer && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isAutoSetPlaying) stopAutoSetPlayback();
                          else void startAutoSetFromTime(autoSetTime >= renderedMixBuffer.duration - 0.1 ? 0 : autoSetTime);
                        }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white/[0.09] hover:bg-white/[0.15] text-white flex items-center gap-1.5 cursor-pointer"
                      >
                        {isAutoSetPlaying ? (
                          <Pause className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span className="font-mono tabular-nums">
                          {isAutoSetPlaying ? formatDjClock(autoSetTime) : 'Play Set'}
                        </span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => void buildAndRenderSet(crate.length > 2 ? 'crate' : 'dual', true)}
                      disabled={(!deckATrack && crate.length === 0) || isRenderingSet}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-400 to-fuchsia-400 hover:brightness-110 text-[#090b10] flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                    >
                      {isRenderingSet ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5 fill-current" />
                      )}
                      <span>
                        {crate.length > 2
                          ? `Auto-Mix Crate (${crate.length})`
                          : triggerMode === 'lyrics'
                            ? 'Mix by Lyrics'
                            : 'Auto-Mix Beats'}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Rendered Auto-Mix Scrub Timeline + Combined Waveform Strip */}
                {renderedMixBuffer && (
                  <div className="space-y-1">
                    {renderedPeaks.length > 0 && (
                      <div className="h-5 flex items-end gap-[1px] px-12 opacity-80">
                        {renderedPeaks.slice(0, 110).map((pk, idx) => {
                          const frac = idx / Math.min(110, renderedPeaks.length);
                          const played =
                            frac * renderedMixBuffer.duration <= autoSetTime;
                          return (
                            <div
                              key={idx}
                              style={{ height: `${Math.max(15, Math.round(pk * 100))}%` }}
                              className={`flex-1 rounded-t-xs ${
                                played ? 'bg-cyan-400' : 'bg-white/20'
                              }`}
                            />
                          );
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono tabular-nums text-cyan-300 w-10">
                        {formatDjClock(autoSetTime)}
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0.1, renderedMixBuffer.duration)}
                        step={0.05}
                        value={Math.min(autoSetTime, renderedMixBuffer.duration)}
                        onChange={(e) => {
                          const rawNext = parseFloat(e.target.value);
                          const timelineBeats = renderedSchedule?.beatTimesTimeline;
                          const next =
                            syncToBeatGrid && timelineBeats && timelineBeats.length > 0
                              ? findNearestBeat(timelineBeats, rawNext)
                              : rawNext;
                          setAutoSetTime(next);
                          if (isAutoSetPlaying) void startAutoSetFromTime(next);
                        }}
                        aria-label="Rendered DJ set playhead"
                        className="flex-1 accent-cyan-400 cursor-pointer"
                      />
                      <span className="text-[10px] font-mono tabular-nums text-slate-400 w-10 text-right">
                        {formatDjClock(renderedMixBuffer.duration)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setLoopAutoSet((v) => !v)}
                        title="Loop rendered DJ set"
                        className={`p-1 rounded border cursor-pointer ${
                          loopAutoSet
                            ? 'bg-cyan-500/20 border-cyan-400/40 text-cyan-300'
                            : 'border-white/[0.08] text-slate-400'
                        }`}
                      >
                        <Repeat className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PER-DECK PRE-FADER VISUALIZER OUTPUT MONITORS (Deck A & Deck B) */}
          <section
            aria-label="Per-deck pre-fader visualizer output monitors"
            className="bg-[#121620] border border-white/[0.09] rounded-xl p-3 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#090b10] border border-white/[0.1] flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4 text-cyan-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-100">
                    Deck Visualizer Outputs · Pre-Fader Monitoring
                  </h3>
                  <p className="text-[10px] text-slate-400 truncate">
                    Inspect individual Deck A &amp; Deck B post-EQ reactivity before crossfading into the Master Mix
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <div
                  className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]"
                  role="group"
                  aria-label="Deck visualizer color palette mode"
                >
                  <button
                    type="button"
                    onClick={() => setDeckVisualizerTintMode('deck-accent')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      deckVisualizerTintMode === 'deck-accent'
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Deck A/B Tint
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeckVisualizerTintMode('studio')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      deckVisualizerTintMode === 'studio'
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Match Master
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowDeckVisualizers((v) => !v)}
                  className="px-2.5 py-1 rounded-lg text-[10.5px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-slate-200 border border-white/[0.1] flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {showDeckVisualizers ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                      <span>Hide Monitors</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-cyan-300" />
                      <span>Show Monitors</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {showDeckVisualizers && (() => {
              const xfadeGains = getCrossfadeGains(crossfader);
              const formatEqSummary = (eq: DjDeckEqSettings) => {
                const parts: string[] = [];
                if (Math.abs(eq.lowGainDb) >= 0.5) {
                  parts.push(`Low ${eq.lowGainDb > 0 ? '+' : ''}${eq.lowGainDb.toFixed(0)}dB`);
                }
                if (Math.abs(eq.midGainDb) >= 0.5) {
                  parts.push(`Mid ${eq.midGainDb > 0 ? '+' : ''}${eq.midGainDb.toFixed(0)}dB`);
                }
                if (Math.abs(eq.highGainDb) >= 0.5) {
                  parts.push(`High ${eq.highGainDb > 0 ? '+' : ''}${eq.highGainDb.toFixed(0)}dB`);
                }
                if (Math.abs(eq.filterSweep) >= 0.04) {
                  parts.push(eq.filterSweep < 0 ? 'HPF' : 'LPF');
                }
                return parts.length > 0 ? parts.join(' · ') : 'Flat EQ';
              };

              const deckMonitors = [
                {
                  deck: 'A' as const,
                  track: deckATrack,
                  isPlaying: deckAPlaying || deckAScratching,
                  pitchPct: deckAPitchPct,
                  eq: eqA,
                  xfadeGainPct: Math.round(xfadeGains.gainA * 100),
                  canvasRef: deckACanvasRef,
                  lowBarRef: deckALowBarRef,
                  midBarRef: deckAMidBarRef,
                  highBarRef: deckAHighBarRef,
                  modeRef: deckAMonitorModeRef,
                  beatBurstRef: deckABeatBurstTextRef,
                  beatBorderRef: deckABeatBorderRef,
                  accentText: 'text-cyan-300',
                  accentLabelBg: 'bg-cyan-400 text-[#090b10]',
                  borderClass: 'border-cyan-400/25',
                  beatRingClass: 'ring-1 ring-cyan-400/60',
                  barColor: 'bg-cyan-400',
                  midColor: 'bg-sky-400',
                  highColor: 'bg-emerald-400',
                },
                {
                  deck: 'B' as const,
                  track: deckBTrack,
                  isPlaying: deckBPlaying || deckBScratching,
                  pitchPct: deckBPitchPct,
                  eq: eqB,
                  xfadeGainPct: Math.round(xfadeGains.gainB * 100),
                  canvasRef: deckBCanvasRef,
                  lowBarRef: deckBLowBarRef,
                  midBarRef: deckBMidBarRef,
                  highBarRef: deckBHighBarRef,
                  modeRef: deckBMonitorModeRef,
                  beatBurstRef: deckBBeatBurstTextRef,
                  beatBorderRef: deckBBeatBorderRef,
                  accentText: 'text-amber-300',
                  accentLabelBg: 'bg-amber-400 text-[#090b10]',
                  borderClass: 'border-amber-400/25',
                  beatRingClass: 'ring-1 ring-amber-400/60',
                  barColor: 'bg-amber-400',
                  midColor: 'bg-orange-400',
                  highColor: 'bg-rose-400',
                },
              ];

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {deckMonitors.map((mon) => {
                    const effectiveBpm = mon.track
                      ? (getEffectiveBpm(mon.track) * (1 + mon.pitchPct / 100)).toFixed(1)
                      : null;
                    const eqLabel = formatEqSummary(mon.eq);

                    return (
                      <div
                        key={mon.deck}
                        className={`relative bg-[#090b10] border ${mon.borderClass} rounded-xl overflow-hidden flex flex-col`}
                      >
                        {/* Beat-Reactive Pre-Fader Border Glow Layer (GPU opacity only) */}
                        <div
                          ref={mon.beatBorderRef}
                          style={{ opacity: 0 }}
                          aria-hidden="true"
                          className={`pointer-events-none absolute inset-0 rounded-xl ${mon.beatRingClass}`}
                        />

                        {/* Monitor Header */}
                        <div className="relative z-10 px-3 py-2 border-b border-white/[0.07] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold tracking-wider shrink-0 ${mon.accentLabelBg}`}
                            >
                              DECK {mon.deck}
                            </span>
                            <div className="min-w-0">
                              <div className="text-[11.5px] font-semibold text-slate-100 truncate">
                                {mon.track ? mon.track.title : `No Deck ${mon.deck} Track Loaded`}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums text-slate-400 truncate">
                                <span>{effectiveBpm ? `${effectiveBpm} BPM` : '-- BPM'}</span>
                                <span aria-hidden="true">·</span>
                                <span>{mon.track?.camelotKey ?? '--'}</span>
                                <span aria-hidden="true">·</span>
                                <span className={mon.xfadeGainPct === 0 ? 'text-slate-500' : mon.accentText}>
                                  Master Send {mon.xfadeGainPct}%
                                </span>
                                <span aria-hidden="true">·</span>
                                <span ref={mon.modeRef} className="text-slate-300">
                                  {mon.isPlaying
                                    ? 'LIVE PRE-FADER'
                                    : isAutoSetPlaying
                                      ? 'AUTO-MIX PRE'
                                      : 'STANDBY'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {mon.track ? (
                              <button
                                type="button"
                                onClick={() => toggleDeckPlay(mon.deck)}
                                className="px-2 py-1 rounded-md text-[10.5px] font-medium bg-white/[0.07] hover:bg-white/[0.14] text-slate-100 border border-white/[0.1] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {mon.isPlaying ? (
                                  <Pause className="w-3 h-3" />
                                ) : (
                                  <Play className="w-3 h-3 fill-current" />
                                )}
                                <span>{mon.isPlaying ? 'Pause' : 'Monitor'}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  mon.deck === 'A'
                                    ? deckAInputRef.current?.click()
                                    : deckBInputRef.current?.click()
                                }
                                className="px-2 py-1 rounded-md text-[10.5px] font-medium bg-white/[0.07] hover:bg-white/[0.14] text-slate-100 border border-white/[0.1] flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <Upload className="w-3 h-3" />
                                <span>Load {mon.deck}</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Pre-Fader Visualizer Canvas */}
                        <div className="relative h-[180px] sm:h-[200px] w-full bg-[#05070b] flex items-center justify-center overflow-hidden">
                          <canvas
                            ref={mon.canvasRef}
                            aria-label={`Deck ${mon.deck} pre-fader visualizer output`}
                            className="max-w-full max-h-full w-auto h-full object-contain block"
                          />
                          {!mon.isPlaying && !isAutoSetPlaying && (
                            <div className="pointer-events-none absolute inset-0 bg-[#05070b]/45 flex flex-col items-center justify-center text-center px-4">
                              <span className="text-[11px] font-medium text-slate-300">
                                {mon.track
                                  ? `Press Monitor on Deck ${mon.deck} to isolate pre-fader reactivity`
                                  : `Load a track onto Deck ${mon.deck} to preview isolated output`}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Pre-Fader Tri-Band Reactivity & EQ Status Footer */}
                        <div className="relative z-10 px-3 py-2 border-t border-white/[0.07] flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono tabular-nums">
                          <div className="flex-1 min-w-[190px] grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[9px] text-slate-400">
                                <span>Low</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                                <div
                                  ref={mon.lowBarRef}
                                  style={{ transform: 'scaleX(0.03)' }}
                                  className={`h-full w-full origin-left ${mon.barColor}`}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[9px] text-slate-400">
                                <span>Mid</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                                <div
                                  ref={mon.midBarRef}
                                  style={{ transform: 'scaleX(0.03)' }}
                                  className={`h-full w-full origin-left ${mon.midColor}`}
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[9px] text-slate-400">
                                <span>High</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/[0.07] overflow-hidden">
                                <div
                                  ref={mon.highBarRef}
                                  style={{ transform: 'scaleX(0.03)' }}
                                  className={`h-full w-full origin-left ${mon.highColor}`}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-slate-400 shrink-0">
                            <span>{eqLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className={mon.accentText}>
                              Beat <span ref={mon.beatBurstRef}>0%</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </section>

          {/* AI AUTO-MIX ASSISTANT: Track Structure & Energy Match Transition Engine */}
          <div className="bg-[#121620] border border-fuchsia-400/25 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500/25 to-cyan-500/20 border border-fuchsia-400/35 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-fuchsia-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-100 flex flex-wrap items-center gap-2">
                    <span>AI Auto-Mix Assistant · Energy Match Transition Engine</span>
                    {aiAutoMixResult && (
                      <span className="text-[10px] font-mono tabular-nums text-emerald-300 font-semibold">
                        {aiAutoMixResult.harmonicSummary}
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-slate-400 truncate">
                    Analyzes outgoing energy fade &amp; incoming drop structure via AI to suggest and execute optimal Energy Match cues
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                  {(
                    [
                      { id: 'balanced', label: 'Balanced' },
                      { id: 'drop-slam', label: 'Drop Slam' },
                      { id: 'smooth-blend', label: 'Club Blend' },
                    ] as const
                  ).map((pref) => (
                    <button
                      key={pref.id}
                      type="button"
                      onClick={() => setAiAutoMixPreference(pref.id)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer transition-colors ${
                        aiAutoMixPreference === pref.id
                          ? 'bg-fuchsia-500/25 text-fuchsia-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {pref.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  disabled={!deckATrack || !deckBTrack || aiAutoMixLoading}
                  onClick={() => void handleAnalyzeAiAutoMix()}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-fuchsia-500/85 to-cyan-500/85 hover:brightness-110 text-white flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  {aiAutoMixLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {aiAutoMixLoading
                      ? 'Analyzing Structure…'
                      : aiAutoMixResult
                        ? 'Re-Analyze Energy Match'
                        : 'Analyze Energy Match'}
                  </span>
                </button>
              </div>
            </div>

            {aiAutoMixError && (
              <div className="px-2.5 py-1.5 rounded-lg bg-rose-500/12 border border-rose-400/35 text-[11px] text-rose-200 flex items-center justify-between gap-2">
                <span>{aiAutoMixError}</span>
                <button
                  type="button"
                  onClick={() => setAiAutoMixError(null)}
                  className="text-rose-300 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {aiAutoMixResult && (
              <div className="space-y-2.5">
                {/* Dual-Track Structural Energy Timeline */}
                {(aiAutoMixResult.deckAStructure.length > 0 ||
                  aiAutoMixResult.deckBStructure.length > 0) && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                    {[
                      {
                        deck: 'Deck A (Outgoing)',
                        track: deckATrack,
                        segments: aiAutoMixResult.deckAStructure,
                        markerSec:
                          aiAutoMixResult.suggestions.find((s) => s.id === activeAiSuggestionId)
                            ?.deckAOutSec ?? aiAutoMixResult.suggestions[0]?.deckAOutSec,
                        markerLabel: 'OUT',
                        barColor: 'bg-cyan-500/30 border-cyan-400/40 text-cyan-100',
                        markerColor: 'bg-cyan-400 text-[#090b10]',
                      },
                      {
                        deck: 'Deck B (Incoming)',
                        track: deckBTrack,
                        segments: aiAutoMixResult.deckBStructure,
                        markerSec:
                          aiAutoMixResult.suggestions.find((s) => s.id === activeAiSuggestionId)
                            ?.deckBDropSec ?? aiAutoMixResult.suggestions[0]?.deckBDropSec,
                        markerLabel: 'DROP',
                        barColor: 'bg-amber-500/30 border-amber-400/40 text-amber-100',
                        markerColor: 'bg-amber-400 text-[#090b10]',
                      },
                    ].map((lane) => {
                      const total = Math.max(1, lane.track?.duration ?? 1);
                      return (
                        <div
                          key={lane.deck}
                          className="bg-[#090b10] border border-white/[0.08] rounded-lg p-2 space-y-1.5"
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-slate-200 truncate">
                              {lane.deck}: {lane.track?.title ?? '--'}
                            </span>
                            {typeof lane.markerSec === 'number' && (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-mono font-bold tabular-nums ${lane.markerColor}`}
                              >
                                {lane.markerLabel} @ {formatDjClock(lane.markerSec)}
                              </span>
                            )}
                          </div>
                          <div className="relative h-7 rounded bg-white/[0.03] border border-white/[0.06] flex overflow-hidden">
                            {lane.segments.map((seg, idx) => {
                              const widthPct = Math.max(
                                8,
                                ((Math.max(0.1, seg.endSec - seg.startSec)) / total) * 100
                              );
                              return (
                                <div
                                  key={`${seg.label}-${idx}`}
                                  style={{ width: `${widthPct}%` }}
                                  title={`${seg.label}: ${formatDjClock(seg.startSec)}–${formatDjClock(seg.endSec)} (Energy ${Math.round(seg.energy)}%)`}
                                  className={`relative h-full border-r border-white/10 last:border-r-0 flex flex-col justify-end px-1 py-0.5 overflow-hidden`}
                                >
                                  <div
                                    style={{
                                      height: `${Math.max(18, Math.min(100, seg.energy))}%`,
                                    }}
                                    className={`absolute inset-x-0 bottom-0 ${lane.barColor} opacity-45`}
                                  />
                                  <span className="relative z-10 text-[8.5px] font-mono text-slate-100 truncate leading-none">
                                    {seg.label}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Ranked AI Energy Match Transition Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                  {aiAutoMixResult.suggestions.map((sug, idx) => {
                    const isSelected = sug.id === activeAiSuggestionId;
                    return (
                      <div
                        key={sug.id}
                        className={`rounded-lg border p-2.5 flex flex-col justify-between gap-2 transition-colors ${
                          isSelected
                            ? 'bg-fuchsia-500/12 border-fuchsia-400/50'
                            : 'bg-[#090b10] border-white/[0.08] hover:border-white/[0.16]'
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-100 truncate">
                              {idx === 0 ? '★ ' : ''}
                              {sug.label}
                            </span>
                            <span className="text-[10px] font-mono font-bold tabular-nums text-emerald-300 shrink-0">
                              {sug.energyMatchScore}% Match
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono tabular-nums text-slate-300">
                            <span className="text-cyan-300">
                              Out {formatDjClock(sug.deckAOutSec)}
                            </span>
                            <span className="text-slate-600">→</span>
                            <span className="text-amber-300">
                              In {formatDjClock(sug.deckBInSec)}
                            </span>
                            <span className="text-rose-300">
                              (Drop {formatDjClock(sug.deckBDropSec)})
                            </span>
                          </div>

                          <div className="text-[9.5px] font-mono text-slate-400">
                            {sug.crossfadeBeats} Beats · {sug.transitionStyle} · {sug.deckASectionLabel} → {sug.deckBSectionLabel}
                          </div>

                          <p className="text-[10px] text-slate-300 leading-relaxed">
                            {sug.rationale}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 pt-1 border-t border-white/[0.06]">
                          <button
                            type="button"
                            disabled={isPreviewRendering}
                            onClick={() => {
                              const samePreview = aiTransitionPreview?.suggestionId === sug.id;
                              if (samePreview && isPreviewPlaying) {
                                stopTransitionPreviewPlayback();
                              } else if (samePreview && aiTransitionPreview) {
                                void startTransitionPreviewFromTime(0, aiTransitionPreview);
                              } else {
                                void handleGenerateTransitionPreview(sug, true);
                              }
                            }}
                            title="Render & audition a 5-second transition preview in the waveform area before committing"
                            className={`px-2 py-1.5 rounded-md text-[10px] font-semibold border flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-40 transition-colors ${
                              aiTransitionPreview?.suggestionId === sug.id
                                ? 'bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-100'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border-white/[0.08]'
                            }`}
                          >
                            {isPreviewRendering && isSelected ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : aiTransitionPreview?.suggestionId === sug.id && isPreviewPlaying ? (
                              <Pause className="w-3 h-3 fill-current" />
                            ) : (
                              <Play className="w-3 h-3 fill-current" />
                            )}
                            <span>5s Preview</span>
                          </button>
                          <button
                            type="button"
                            disabled={isRenderingSet}
                            onClick={() => void handleExecuteAiAutoMixSuggestion(sug, true)}
                            className="flex-1 px-2.5 py-1.5 rounded-md text-[10.5px] font-semibold bg-gradient-to-r from-cyan-400 to-fuchsia-400 hover:brightness-110 text-[#090b10] flex items-center justify-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-40"
                          >
                            {isRenderingSet && isSelected ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Zap className="w-3 h-3 fill-current" />
                            )}
                            <span>Execute Auto-Mix</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleExecuteAiAutoMixSuggestion(sug, false)}
                            title="Apply transition cues to Smart Crossfade waveform without rendering audio yet"
                            className="px-2 py-1.5 rounded-md text-[10px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08] whitespace-nowrap cursor-pointer"
                          >
                            Apply Cues
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* SMART CROSSFADE: Audio Waveform Overlap Visualizer & BPM Auto-Calculate Transition Timing */}
          <div className="bg-[#121620] border border-white/[0.09] rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-amber-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
                  <AudioWaveform className="w-4 h-4 text-cyan-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-100">
                    Smart Crossfade · Waveform Overlap &amp; BPM Transition Timing
                  </h3>
                  <p className="text-[10px] font-mono tabular-nums text-slate-400 truncate">
                    {deckATrack && deckBTrack && dualPlan
                      ? `Deck A ${getEffectiveBpm(deckATrack)} BPM (${deckATrack.camelotKey ?? '--'} ${deckATrack.musicalKey ?? ''}) · Deck B ${getEffectiveBpm(deckBTrack)} BPM (${deckBTrack.camelotKey ?? '--'} ${deckBTrack.musicalKey ?? ''}) · ${harmonicComparison.label}`
                      : 'Load two tracks to visualize beat-locked waveform overlap and auto-calculate BPM transition timing'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                {/* Frequency-Domain Spectrogram Overlay Mode */}
                <div
                  className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]"
                  title="Frequency-domain spectrogram overlay: colors Bass Kicks (Crimson/Orange), Melodic (Cyan/Emerald), and Snares/Hats (Gold/Violet)"
                >
                  <span className="px-1.5 text-[9px] font-semibold text-slate-400 tracking-wide">
                    Spec
                  </span>
                  {(
                    [
                      { id: 'overlay', label: 'Overlay' },
                      { id: 'full', label: 'Full' },
                      { id: 'off', label: 'Off' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSpectrogramMode(mode.id)}
                      className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium cursor-pointer transition-colors ${
                        spectrogramMode === mode.id
                          ? 'bg-cyan-500/25 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {/* Sync Playhead & Cues to Beat Grid Toggle */}
                <button
                  type="button"
                  aria-pressed={syncToBeatGrid}
                  onClick={handleToggleSyncToBeatGrid}
                  title="Snap playhead and cue points to nearest beat marker when seeking or cueing"
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    syncToBeatGrid
                      ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
                      : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Magnet className="w-3 h-3" />
                  <span>Sync to Beat Grid</span>
                </button>

                {/* Visual Beat Grid Overlay Toggle & Subdivision */}
                <button
                  type="button"
                  onClick={() => setShowBeatGridOverlay((v) => !v)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-medium border flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                    showBeatGridOverlay
                      ? 'bg-amber-400/20 border-amber-400/45 text-amber-200'
                      : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Grid3x3 className="w-3 h-3" />
                  <span>Beat Grid</span>
                </button>

                {showBeatGridOverlay && (
                  <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                    {([1, 2, 4] as const).map((sub) => (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => setBeatGridSubdivision(sub)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                          beatGridSubdivision === sub
                            ? 'bg-amber-400 text-[#090b10] font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        1/{sub}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]"
                  title="Vinyl Scratch drag throw sensitivity"
                >
                  <span className="px-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
                    Vinyl
                  </span>
                  {(
                    [
                      { sec: 1.2, label: 'Tight' },
                      { sec: 1.8, label: '12"' },
                      { sec: 2.8, label: 'Wide' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setScratchSensitivitySec(opt.sec)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer ${
                        scratchSensitivitySec === opt.sec
                          ? 'bg-cyan-400 text-[#090b10] font-bold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setCrossfadeZoomMode('zoom')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer ${
                      crossfadeZoomMode === 'zoom'
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Zoom Overlap
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrossfadeZoomMode('full')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium cursor-pointer ${
                      crossfadeZoomMode === 'full'
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Full Timeline
                  </button>
                </div>

                <button
                  type="button"
                  disabled={!deckATrack || !deckBTrack || !dualPlan || isPreviewRendering}
                  onClick={() => {
                    if (isPreviewPlaying) {
                      stopTransitionPreviewPlayback();
                      return;
                    }
                    const selectedSug =
                      aiAutoMixResult?.suggestions.find((s) => s.id === activeAiSuggestionId) ??
                      aiAutoMixResult?.suggestions[0];
                    if (selectedSug) {
                      void handleGenerateTransitionPreview(selectedSug, true);
                      return;
                    }
                    if (!dualPlan) return;
                    void handleGenerateTransitionPreview(
                      {
                        id: 'manual-plan',
                        label: `${crossfadeBeats}B ${transitionStyle}`,
                        deckAOutSec: dualPlan.transitionStartSec,
                        deckBInSec: dualPlan.deckBInTime,
                        crossfadeBeats,
                        transitionStyle,
                        videoMixStyle,
                        triggerMode,
                        beatMatchTempo,
                        alignPhaseToBeat,
                      },
                      true
                    );
                  }}
                  title="Generate & play a 5-second preview render of the proposed transition inside the waveform area"
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/40 flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  {isPreviewRendering ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isPreviewPlaying ? (
                    <Pause className="w-3 h-3 fill-current" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>{isPreviewPlaying ? 'Pause 5s' : '5s Preview'}</span>
                </button>

                <button
                  type="button"
                  disabled={!deckATrack || !deckBTrack || !dualPlan || isRenderingSet}
                  onClick={async () => {
                    if (!dualPlan) return;
                    const res = await buildAndRenderSet('dual', false);
                    if (res?.rendered.audioBuffer) {
                      const previewStart = Math.max(0, dualPlan.transitionStartSec - 2.0);
                      await startAutoSetFromTime(previewStart, res.rendered.audioBuffer);
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-200 border border-cyan-400/35 flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Preview Crossfade</span>
                </button>
              </div>
            </div>

            {/* Waveform Overlap Visualizer Canvas with Dual Beat Grid Overlay */}
            <SmartCrossfadeOverlapCanvas
              deckA={deckATrack}
              deckB={deckBTrack}
              plan={aiTransitionPreview?.plan ?? dualPlan}
              zoomMode={crossfadeZoomMode}
              playheadSec={autoSetTime}
              showBeatGrid={showBeatGridOverlay}
              beatGridSubdivision={beatGridSubdivision}
              masterBeatClockRef={masterBeatClockRef}
              registerBeatPulseDraw={registerBeatPulseDraw}
              previewHighlight={
                aiTransitionPreview
                  ? {
                      startSec: aiTransitionPreview.previewStartSec,
                      endSec: aiTransitionPreview.previewEndSec,
                      label: aiTransitionPreview.label,
                    }
                  : null
              }
              previewPlayheadSec={
                aiTransitionPreview ? aiTransitionPreview.previewStartSec + previewTimeSec : null
              }
              onSeekTimeline={async (t) => {
                if (
                  aiTransitionPreview &&
                  t >= aiTransitionPreview.previewStartSec - 0.15 &&
                  t <= aiTransitionPreview.previewEndSec + 0.15
                ) {
                  const localSeek = Math.max(
                    0,
                    Math.min(
                      aiTransitionPreview.durationSec - 0.05,
                      t - aiTransitionPreview.previewStartSec
                    )
                  );
                  await startTransitionPreviewFromTime(localSeek, aiTransitionPreview);
                  return;
                }
                const timelineBeats = renderedSchedule?.beatTimesTimeline;
                const seekSec =
                  syncToBeatGrid && timelineBeats && timelineBeats.length > 0
                    ? findNearestBeat(timelineBeats, t)
                    : syncToBeatGrid && deckATrack
                      ? snapTimeToTrackBeatGrid(deckATrack, t)
                      : t;
                setAutoSetTime(seekSec);
                if (renderedMixBuffer) {
                  await startAutoSetFromTime(seekSec, renderedMixBuffer);
                } else if (deckATrack && deckBTrack) {
                  const res = await buildAndRenderSet('dual', false);
                  if (res?.rendered.audioBuffer) {
                    const postBeats = res.schedule?.beatTimesTimeline;
                    const finalSec =
                      syncToBeatGrid && postBeats && postBeats.length > 0
                        ? findNearestBeat(postBeats, t)
                        : seekSec;
                    setAutoSetTime(finalSec);
                    await startAutoSetFromTime(finalSec, res.rendered.audioBuffer);
                  }
                }
              }}
            />

            {/* Auto-Mix 5-Second Transition Preview Strip inside the Waveform Area */}
            {(isPreviewRendering || aiTransitionPreview || previewError) && (
              <div className="bg-[#090b10] border border-fuchsia-400/30 rounded-lg p-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 text-[10.5px]">
                    <span className="font-semibold text-fuchsia-300 whitespace-nowrap">
                      {isPreviewRendering
                        ? 'Rendering 5s Transition Preview…'
                        : `${(aiTransitionPreview?.durationSec ?? 5).toFixed(1)}s Transition Preview`}
                    </span>
                    {aiTransitionPreview && (
                      <span className="font-mono tabular-nums text-slate-300 truncate">
                        {aiTransitionPreview.label} · Out A{' '}
                        {formatDjClock(aiTransitionPreview.deckAOutSec)} → In B{' '}
                        {formatDjClock(aiTransitionPreview.deckBInSec)} ·{' '}
                        {aiTransitionPreview.crossfadeBeats}B {aiTransitionPreview.transitionStyle}
                      </span>
                    )}
                    {previewError && (
                      <span className="text-rose-300">{previewError}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                    {aiAutoMixResult && aiAutoMixResult.suggestions.length > 1 && (
                      <div className="flex items-center p-0.5 rounded bg-white/[0.04] border border-white/[0.08]">
                        {aiAutoMixResult.suggestions.map((sug, sIdx) => {
                          const isCurrent = aiTransitionPreview?.suggestionId === sug.id;
                          return (
                            <button
                              key={sug.id}
                              type="button"
                              disabled={isPreviewRendering}
                              onClick={() => void handleGenerateTransitionPreview(sug, true)}
                              title={`Audition 5s preview for #${sIdx + 1}: ${sug.label}`}
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-semibold cursor-pointer disabled:opacity-40 transition-colors ${
                                isCurrent
                                  ? 'bg-fuchsia-500/30 text-fuchsia-100'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              #{sIdx + 1}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {aiTransitionPreview && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isPreviewPlaying) {
                              stopTransitionPreviewPlayback();
                            } else {
                              const startPos =
                                previewTimeSec >= aiTransitionPreview.durationSec - 0.1
                                  ? 0
                                  : previewTimeSec;
                              void startTransitionPreviewFromTime(startPos, aiTransitionPreview);
                            }
                          }}
                          className="px-2.5 py-1 rounded text-[10px] font-semibold bg-fuchsia-500/25 hover:bg-fuchsia-500/35 text-fuchsia-100 border border-fuchsia-400/45 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                        >
                          {isPreviewPlaying ? (
                            <Pause className="w-3 h-3 fill-current" />
                          ) : (
                            <Play className="w-3 h-3 fill-current" />
                          )}
                          <span>{isPreviewPlaying ? 'Pause' : 'Play 5s'}</span>
                        </button>

                        <button
                          type="button"
                          aria-pressed={previewLoop}
                          onClick={() => setPreviewLoop((v) => !v)}
                          title="Loop the 5-second transition preview continuously"
                          className={`px-2 py-1 rounded text-[10px] font-medium border flex items-center gap-1 whitespace-nowrap cursor-pointer transition-colors ${
                            previewLoop
                              ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
                              : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          <Repeat className="w-3 h-3" />
                          <span>Loop</span>
                        </button>

                        <button
                          type="button"
                          disabled={isRenderingSet}
                          onClick={() => void handleCommitTransitionPreview(aiTransitionPreview)}
                          className="px-2.5 py-1 rounded text-[10px] font-semibold bg-gradient-to-r from-cyan-400 to-fuchsia-400 hover:brightness-110 text-[#090b10] flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-40"
                        >
                          {isRenderingSet ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Zap className="w-3 h-3 fill-current" />
                          )}
                          <span>Commit Full Mix</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        previewRenderSeqRef.current += 1;
                        stopTransitionPreviewPlayback();
                        setAiTransitionPreview(null);
                        setPreviewTimeSec(0);
                        setPreviewError(null);
                        setIsPreviewRendering(false);
                      }}
                      title="Dismiss 5s transition preview"
                      className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {aiTransitionPreview && (
                  <div className="space-y-1">
                    <div
                      role="slider"
                      tabIndex={0}
                      aria-label="5-second transition preview waveform scrubber"
                      aria-valuemin={0}
                      aria-valuemax={Number(aiTransitionPreview.durationSec.toFixed(2))}
                      aria-valuenow={Number(previewTimeSec.toFixed(2))}
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        const frac = Math.max(
                          0,
                          Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width))
                        );
                        const targetSec = frac * aiTransitionPreview.durationSec;
                        void startTransitionPreviewFromTime(targetSec, aiTransitionPreview);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowRight') {
                          e.preventDefault();
                          void startTransitionPreviewFromTime(
                            Math.min(aiTransitionPreview.durationSec - 0.1, previewTimeSec + 0.5),
                            aiTransitionPreview
                          );
                        } else if (e.key === 'ArrowLeft') {
                          e.preventDefault();
                          void startTransitionPreviewFromTime(
                            Math.max(0, previewTimeSec - 0.5),
                            aiTransitionPreview
                          );
                        } else if (e.key === ' ') {
                          e.preventDefault();
                          if (isPreviewPlaying) {
                            stopTransitionPreviewPlayback();
                          } else {
                            void startTransitionPreviewFromTime(previewTimeSec, aiTransitionPreview);
                          }
                        }
                      }}
                      title="Click anywhere along the 5-second preview waveform to scrub & audition"
                      className="relative h-12 rounded bg-[#07090e] border border-white/[0.08] overflow-hidden cursor-pointer select-none flex items-center px-0.5 gap-[1px]"
                    >
                      {aiTransitionPreview.triBandPeaks.overall.map((amp, barIdx) => {
                        const low = aiTransitionPreview.triBandPeaks.low[barIdx] ?? 0;
                        const mid = aiTransitionPreview.triBandPeaks.mid[barIdx] ?? 0;
                        const high = aiTransitionPreview.triBandPeaks.high[barIdx] ?? 0;
                        const heightPct = Math.max(10, Math.min(96, amp * 96));
                        const barFrac = barIdx / Math.max(1, aiTransitionPreview.triBandPeaks.overall.length - 1);
                        const barAbsSec =
                          aiTransitionPreview.previewStartSec +
                          barFrac * aiTransitionPreview.durationSec;
                        const inCrossover =
                          barAbsSec >= aiTransitionPreview.plan.transitionStartSec &&
                          barAbsSec <= aiTransitionPreview.plan.transitionEndSec;
                        const isPassed =
                          barFrac <= previewTimeSec / Math.max(0.1, aiTransitionPreview.durationSec);
                        const colorClass =
                          low >= mid && low >= high
                            ? inCrossover
                              ? 'bg-fuchsia-400'
                              : 'bg-cyan-400'
                            : high > mid
                              ? 'bg-amber-300'
                              : 'bg-cyan-300';

                        return (
                          <div
                            key={barIdx}
                            style={{ height: `${heightPct.toFixed(0)}%` }}
                            className={`flex-1 rounded-[1px] transition-opacity ${colorClass} ${
                              isPassed ? 'opacity-95' : 'opacity-45'
                            }`}
                          />
                        );
                      })}

                      {/* Crossover Start & Lock markers inside the 5s window */}
                      {(() => {
                        const span = Math.max(0.1, aiTransitionPreview.durationSec);
                        const startPct =
                          ((aiTransitionPreview.plan.transitionStartSec -
                            aiTransitionPreview.previewStartSec) /
                            span) *
                          100;
                        const endPct =
                          ((aiTransitionPreview.plan.transitionEndSec -
                            aiTransitionPreview.previewStartSec) /
                            span) *
                          100;
                        return (
                          <>
                            {startPct >= 0 && startPct <= 100 && (
                              <div
                                style={{ left: `${startPct.toFixed(2)}%` }}
                                className="absolute inset-y-0 w-[1.5px] bg-cyan-300/80 pointer-events-none"
                              />
                            )}
                            {endPct >= 0 && endPct <= 100 && (
                              <div
                                style={{ left: `${endPct.toFixed(2)}%` }}
                                className="absolute inset-y-0 w-[1.5px] bg-amber-300/80 pointer-events-none"
                              />
                            )}
                          </>
                        );
                      })()}

                      {/* Live 5s Preview Playhead */}
                      <div
                        style={{
                          left: `${Math.max(
                            0,
                            Math.min(
                              100,
                              (previewTimeSec / Math.max(0.1, aiTransitionPreview.durationSec)) * 100
                            )
                          ).toFixed(2)}%`,
                        }}
                        className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.9)] pointer-events-none"
                      />
                    </div>

                    <div className="flex items-center justify-between text-[9.5px] font-mono tabular-nums text-slate-400">
                      <span>
                        Window {formatDjClock(aiTransitionPreview.previewStartSec)} –{' '}
                        {formatDjClock(aiTransitionPreview.previewEndSec)} · Click waveform to scrub
                      </span>
                      <span className="text-fuchsia-200 font-semibold">
                        {previewTimeSec.toFixed(1)}s / {aiTransitionPreview.durationSec.toFixed(1)}s
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Camelot Wheel Harmonic Mixing Compatibility Strip */}
            {(deckATrack || deckBTrack) && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.08] text-[10px]">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="font-semibold uppercase tracking-wider text-[9.5px] text-slate-400">
                    Harmonic Mix
                  </span>
                  <span className="font-mono tabular-nums text-cyan-300 font-semibold">
                    A: {deckATrack?.camelotKey ?? '--'} {deckATrack?.musicalKey ?? ''}
                  </span>
                  <span className="text-slate-600">↔</span>
                  <span className="font-mono tabular-nums text-amber-300 font-semibold">
                    B: {deckBTrack?.camelotKey ?? '--'} {deckBTrack?.musicalKey ?? ''}
                  </span>
                  {deckATrack && deckBTrack && (
                    <span
                      style={{ color: harmonicComparison.accentHex }}
                      className="font-mono font-bold whitespace-nowrap flex items-center gap-1"
                    >
                      <span
                        style={{ backgroundColor: harmonicComparison.accentHex }}
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                      />
                      <span>{harmonicComparison.label}</span>
                    </span>
                  )}
                  <span className="text-slate-400 truncate hidden md:inline">
                    · {harmonicComparison.detail}
                  </span>
                </div>
                {deckACompatibleKeys.length > 0 && (
                  <div className="font-mono tabular-nums text-[9.5px] text-slate-400 whitespace-nowrap shrink-0">
                    Mix w/ A: <span className="text-slate-200">{deckACompatibleKeys.join(' · ')}</span>
                  </div>
                )}
              </div>
            )}

            {/* Visual Beat-Grid Phase Alignment Scope & Offset Meter */}
            <div className="pt-2 border-t border-white/[0.08] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowPhaseScope((v) => !v)}
                    className="text-[11px] font-semibold text-slate-200 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <Grid3x3 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Beat-Grid Phase Alignment Scope</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      {showPhaseScope ? '(Hide)' : '(Show)'}
                    </span>
                  </button>

                  <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => setPhaseAlignScopeMode('overlap')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer ${
                        phaseAlignScopeMode === 'overlap'
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Mix Overlap Lock
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhaseAlignScopeMode('live')}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap cursor-pointer ${
                        phaseAlignScopeMode === 'live'
                          ? 'bg-amber-500/20 text-amber-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Live Decks A / B
                    </button>
                  </div>
                </div>

                {/* Real-time Phase Offset Meter + Status Label */}
                <div className="flex items-center gap-2.5 flex-wrap">
                  {phaseComparison ? (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="relative w-28 h-2.5 rounded-full bg-[#090b10] border border-white/[0.1] overflow-hidden">
                          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/40 -translate-x-1/2" />
                          <div
                            style={{
                              transform: `translateX(${Math.max(-52, Math.min(52, phaseComparison.beatPhaseDelta * 104))}px)`,
                            }}
                            className={`absolute left-1/2 top-0.5 bottom-0.5 w-2 -ml-1 rounded-full transition-transform duration-100 ${
                              phaseComparison.status === 'locked'
                                ? 'bg-emerald-400'
                                : phaseComparison.status === 'drifting'
                                  ? 'bg-amber-400'
                                  : 'bg-rose-400'
                            }`}
                          />
                        </div>
                        <span
                          className={`text-[10px] font-semibold whitespace-nowrap ${
                            phaseComparison.status === 'locked'
                              ? 'text-emerald-300'
                              : phaseComparison.status === 'drifting'
                                ? 'text-amber-300'
                                : 'text-rose-300'
                          }`}
                        >
                          {phaseComparison.status === 'locked'
                            ? 'PHASE LOCKED'
                            : phaseComparison.status === 'drifting'
                              ? 'SLIGHT DRIFT'
                              : 'OUT OF PHASE'}
                        </span>
                        <span className="text-[10px] font-mono tabular-nums text-slate-300 whitespace-nowrap">
                          {phaseComparison.phaseOffsetMs >= 0 ? '+' : ''}
                          {phaseComparison.phaseOffsetMs.toFixed(1)} ms ·{' '}
                          {phaseComparison.beatPhaseDelta >= 0 ? '+' : ''}
                          {phaseComparison.beatPhaseDelta.toFixed(2)}B · ΔBPM{' '}
                          {phaseComparison.bpmDelta >= 0 ? '+' : ''}
                          {phaseComparison.bpmDelta.toFixed(1)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleSyncBpmAndLockPhase}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-emerald-400/20 hover:bg-emerald-400/30 text-emerald-200 border border-emerald-400/40 flex items-center gap-1 whitespace-nowrap cursor-pointer"
                      >
                        <Lock className="w-3 h-3" />
                        <span>
                          {Math.abs(phaseComparison.bpmDelta) > 0.15
                            ? 'Sync BPM & Lock Phase'
                            : 'Lock Phase 0ms'}
                        </span>
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-500">
                      Load two tracks to inspect phase offset
                    </span>
                  )}
                </div>
              </div>

              {showPhaseScope && (
                <>
                  <BeatGridPhaseAlignmentCanvas
                    deckA={deckATrack}
                    deckB={deckBTrack}
                    timeA={effectivePhaseTimeA}
                    timeB={effectivePhaseTimeB}
                    rateA={effectivePhaseRateA}
                    rateB={effectivePhaseRateB}
                    showBeatGrid={showBeatGridOverlay}
                    beatGridSubdivision={beatGridSubdivision}
                    phaseComparison={phaseComparison}
                    masterBeatClockRef={masterBeatClockRef}
                    registerBeatPulseDraw={registerBeatPulseDraw}
                    onDragSlipDeckBMs={handlePhaseSlipDeckBMs}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono tabular-nums">
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="font-sans font-semibold text-amber-300 mr-1">
                        Phase Nudge B:
                      </span>
                      {([-20, -5, -1, 1, 5, 20] as const).map((ms) => (
                        <button
                          key={ms}
                          type="button"
                          disabled={!deckATrack || !deckBTrack}
                          onClick={() => handlePhaseSlipDeckBMs(ms)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer disabled:opacity-35"
                        >
                          {ms > 0 ? `+${ms}ms` : `${ms}ms`}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={!deckATrack || !deckBTrack}
                        onClick={handleLockBeatPhase}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-400/35 font-sans font-semibold cursor-pointer disabled:opacity-35"
                      >
                        Snap 0ms
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-slate-400">
                      {phaseComparison && (
                        <span>
                          A {phaseComparison.phaseA.barNumber}.{phaseComparison.phaseA.beatInBar} ({phaseComparison.bpmA.toFixed(1)} BPM) · B {phaseComparison.phaseB.barNumber}.{phaseComparison.phaseB.beatInBar} ({phaseComparison.bpmB.toFixed(1)} BPM)
                        </span>
                      )}
                      <span className="font-sans text-[10px] text-slate-500">
                        Drag bottom lane to slip Deck B
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* BPM Auto-Calculate Transition Timing Buttons & Fine Beat Nudge */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
                  Auto-Calc BPM Timing:
                </span>
                {(
                  [
                    { id: 'slam-4b', label: 'Auto 4B Slam' },
                    { id: 'phrase-8b', label: 'Auto 8B Phrase' },
                    { id: 'smooth-16b', label: 'Auto 16B Blend' },
                    { id: 'club-32b', label: 'Auto 32B Club' },
                    { id: 'align-drop', label: 'Align to Drop' },
                  ] as const
                ).map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    disabled={!deckATrack || !deckBTrack}
                    onClick={() => handleApplyBpmTimingPreset(btn.id)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer disabled:opacity-35 ${
                      activeBpmPreset === btn.id
                        ? 'bg-cyan-400 text-[#090b10] border-cyan-300 font-semibold'
                        : btn.id === 'align-drop'
                          ? 'bg-rose-500/12 hover:bg-rose-500/22 text-rose-200 border-rose-400/30'
                          : 'bg-[#090b10] hover:bg-white/[0.08] text-slate-200 border-white/[0.1]'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              {/* Beat-grid Phase Nudge Controls */}
              <div className="flex items-center gap-3 text-[10px] font-mono tabular-nums">
                <div className="flex items-center gap-1">
                  <span className="text-cyan-300">Out A:</span>
                  <button
                    type="button"
                    disabled={!deckATrack}
                    onClick={() => handleNudgeCueBeat('A', -1)}
                    className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer disabled:opacity-35"
                  >
                    -1B
                  </button>
                  <span className="text-slate-200 min-w-[38px] text-center">
                    {formatDjClock(dualPlan?.deckAOutTime ?? deckAOutTime ?? deckATrack?.recommendedOutTime ?? 0)}
                  </span>
                  <button
                    type="button"
                    disabled={!deckATrack}
                    onClick={() => handleNudgeCueBeat('A', 1)}
                    className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer disabled:opacity-35"
                  >
                    +1B
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <span className="text-amber-300">In B:</span>
                  <button
                    type="button"
                    disabled={!deckBTrack}
                    onClick={() => handleNudgeCueBeat('B', -1)}
                    className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer disabled:opacity-35"
                  >
                    -1B
                  </button>
                  <span className="text-slate-200 min-w-[38px] text-center">
                    {formatDjClock(dualPlan?.deckBInTime ?? deckBInTime ?? 0)}
                  </span>
                  <button
                    type="button"
                    disabled={!deckBTrack}
                    onClick={() => handleNudgeCueBeat('B', 1)}
                    className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer disabled:opacity-35"
                  >
                    +1B
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Tap Tempo & Visual Last-5 BPM Session History Log */}
          <div className="bg-[#121620] border border-emerald-400/20 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-2.5">
              {/* Left: Tactile Tap Pad + Live BPM Readout + Quick Deck Sync */}
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handleDjTapTempo}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer select-none ${
                    tapPulseFlash
                      ? 'bg-emerald-400 text-[#090b10] border-emerald-200 shadow-[0_0_16px_rgba(52,211,153,0.45)] scale-[0.98]'
                      : 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-400/40'
                  }`}
                  title="Tap at least 2 beats to measure live BPM and add to the visual Last-5 History Log"
                >
                  <Activity className={`w-3.5 h-3.5 ${tapPulseFlash ? 'animate-ping' : ''}`} />
                  <span className="whitespace-nowrap">
                    {tapTempoCount === 1
                      ? 'Tap Beat 2…'
                      : tapTempoCount >= 2
                        ? `Tap Tempo (${tapTempoCount}t)`
                        : 'Tap Tempo'}
                  </span>
                </button>

                <div className="px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.08] flex items-center gap-2">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">
                      Tapped BPM
                    </div>
                    <div className="text-sm font-mono font-bold tabular-nums text-emerald-300 leading-tight">
                      {tapTempoBpm !== null ? `${tapTempoBpm.toFixed(1)}` : '--.-'}
                      <span className="text-[10px] font-normal text-slate-400 ml-1">BPM</span>
                    </div>
                  </div>
                  {tapTempoBpm !== null && (
                    <div className="flex items-center gap-1 pl-2 border-l border-white/[0.08]">
                      <button
                        type="button"
                        disabled={!deckATrack}
                        onClick={() => handleApplyTappedBpmToDeck('A', tapTempoBpm)}
                        title="Pitch-match Deck A to tapped BPM"
                        className="px-1.5 py-1 rounded bg-cyan-400/15 hover:bg-cyan-400/25 border border-cyan-400/35 text-[10px] font-mono text-cyan-200 disabled:opacity-35 cursor-pointer"
                      >
                        → A
                      </button>
                      <button
                        type="button"
                        disabled={!deckBTrack}
                        onClick={() => handleApplyTappedBpmToDeck('B', tapTempoBpm)}
                        title="Pitch-match Deck B to tapped BPM"
                        className="px-1.5 py-1 rounded bg-amber-400/15 hover:bg-amber-400/25 border border-amber-400/35 text-[10px] font-mono text-amber-200 disabled:opacity-35 cursor-pointer"
                      >
                        → B
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Center: Visual SVG Tempo-Consistency Sparkline & Transition Drift Comparison */}
              <div className="flex-1 min-w-0 bg-[#090b10] border border-white/[0.08] rounded-lg px-2.5 py-1.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="flex-1 min-w-[180px]">
                  <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mb-1">
                    <span className="uppercase tracking-wider font-semibold text-slate-300">
                      Visual BPM Consistency ({tapBpmHistory.length}/5)
                    </span>
                    <span className="text-slate-500">
                      {tapBpmStats
                        ? `Range ${tapBpmStats.minBpm.toFixed(1)}–${tapBpmStats.maxBpm.toFixed(1)} BPM`
                        : 'Tap 2+ bursts to plot transition drift'}
                    </span>
                  </div>
                  {(() => {
                    const chronological = [...tapBpmHistory].reverse();
                    const chartW = 240;
                    const chartH = 42;
                    const refCenter = tapBpmStats?.avgBpm ?? detectedMasterBpm;
                    const halfSpan = Math.max(
                      2.0,
                      tapBpmStats
                        ? Math.max(
                            Math.abs(tapBpmStats.maxBpm - refCenter),
                            Math.abs(tapBpmStats.minBpm - refCenter)
                          ) + 0.6
                        : 2.5
                    );
                    const yForBpm = (bpm: number) => {
                      const norm = (bpm - refCenter) / halfSpan; // -1..+1
                      const clamped = Math.max(-1, Math.min(1, norm));
                      return chartH / 2 - clamped * (chartH / 2 - 6);
                    };
                    const bandTop = yForBpm(refCenter + 0.8);
                    const bandHeight = Math.max(4, yForBpm(refCenter - 0.8) - bandTop);
                    const points = chronological.map((entry, i) => {
                      const x =
                        chronological.length === 1
                          ? chartW / 2
                          : 16 + (i / Math.max(1, chronological.length - 1)) * (chartW - 32);
                      const y = yForBpm(entry.bpm);
                      const driftFromMean = entry.bpm - refCenter;
                      const strokeColor =
                        Math.abs(driftFromMean) <= 0.5
                          ? '#34d399'
                          : Math.abs(driftFromMean) <= 1.5
                            ? '#22d3ee'
                            : '#f59e0b';
                      return { entry, x, y, strokeColor, isLatest: i === chronological.length - 1 };
                    });
                    const polyPoints = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

                    return (
                      <svg
                        viewBox={`0 0 ${chartW} ${chartH}`}
                        className="w-full h-10 overflow-visible block"
                        role="img"
                        aria-label="Visual BPM history trendline"
                      >
                        {/* ±0.8 BPM Locked Stability Zone Band */}
                        <rect
                          x={6}
                          y={bandTop}
                          width={chartW - 12}
                          height={bandHeight}
                          rx={3}
                          fill="rgba(52, 211, 153, 0.09)"
                        />
                        {/* Mean Reference Dashed Line */}
                        <line
                          x1={6}
                          y1={chartH / 2}
                          x2={chartW - 6}
                          y2={chartH / 2}
                          stroke="rgba(148, 163, 184, 0.35)"
                          strokeWidth={1}
                          strokeDasharray="3 3"
                        />
                        {/* Connecting Trendline */}
                        {points.length >= 2 && (
                          <polyline
                            fill="none"
                            stroke="rgba(52, 211, 153, 0.7)"
                            strokeWidth={1.75}
                            strokeLinejoin="round"
                            strokeLinecap="round"
                            points={polyPoints}
                          />
                        )}
                        {/* Vertical Deviation Stems & Interactive BPM Nodes */}
                        {points.map((pt) => {
                          const isSelected = tapTempoBpm === pt.entry.bpm;
                          return (
                            <g
                              key={pt.entry.id}
                              className="cursor-pointer"
                              onClick={() => setTapTempoBpm(pt.entry.bpm)}
                            >
                              <title>{`${pt.entry.bpm.toFixed(1)} BPM (${pt.entry.tapCount} taps @ ${pt.entry.timestampLabel})`}</title>
                              <line
                                x1={pt.x}
                                y1={chartH / 2}
                                x2={pt.x}
                                y2={pt.y}
                                stroke={pt.strokeColor}
                                strokeOpacity={0.55}
                                strokeWidth={2}
                              />
                              <circle
                                cx={pt.x}
                                cy={pt.y}
                                r={pt.isLatest || isSelected ? 4.5 : 3.3}
                                fill={pt.strokeColor}
                                stroke={isSelected ? '#ffffff' : '#090b10'}
                                strokeWidth={1.5}
                              />
                            </g>
                          );
                        })}
                      </svg>
                    );
                  })()}
                </div>

                {/* Live Transition Deck Delta Readout (Tapped vs Deck A / Deck B) */}
                <div className="flex sm:flex-col justify-between gap-1 text-[9.5px] font-mono tabular-nums sm:border-l sm:border-white/[0.08] sm:pl-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-cyan-300">vs A:</span>
                    <span className="text-slate-200">
                      {tapTempoBpm !== null && deckALiveBpm !== null
                        ? `${tapTempoBpm - deckALiveBpm >= 0 ? '+' : ''}${(tapTempoBpm - deckALiveBpm).toFixed(1)}`
                        : '--'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-amber-300">vs B:</span>
                    <span className="text-slate-200">
                      {tapTempoBpm !== null && deckBLiveBpm !== null
                        ? `${tapTempoBpm - deckBLiveBpm >= 0 ? '+' : ''}${(tapTempoBpm - deckBLiveBpm).toFixed(1)}`
                        : '--'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Session Tempo Consistency Summary & Clear */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.08] flex items-center gap-2.5 text-[10px] font-mono tabular-nums">
                  <div>
                    <div className="text-[9px] uppercase text-slate-500">Avg</div>
                    <div className="text-slate-200 font-semibold">
                      {tapBpmStats ? `${tapBpmStats.avgBpm.toFixed(1)}` : '--.-'}
                    </div>
                  </div>
                  <div className="pl-2 border-l border-white/[0.08]">
                    <div className="text-[9px] uppercase text-slate-500">Spread Δ</div>
                    <div className="text-slate-200 font-semibold">
                      {tapBpmStats ? `${tapBpmStats.spreadBpm.toFixed(1)}` : '--'}
                    </div>
                  </div>
                  {tapBpmStats && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider border ${
                        tapBpmStats.consistency === 'LOCKED'
                          ? 'bg-emerald-400/15 text-emerald-300 border-emerald-400/35'
                          : tapBpmStats.consistency === 'STEADY'
                            ? 'bg-cyan-400/15 text-cyan-300 border-cyan-400/35'
                            : 'bg-amber-400/15 text-amber-300 border-amber-400/35'
                      }`}
                    >
                      {tapBpmStats.consistency}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={tapBpmHistory.length === 0 && tapTempoBpm === null}
                  onClick={handleClearTapBpmHistory}
                  title="Clear Tap Tempo BPM log"
                  className="p-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-slate-400 hover:text-slate-200 disabled:opacity-35 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Rolling Last 5 Detected BPM Visual Cards with Drift Meters */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {Array.from({ length: MAX_DJ_TAP_BPM_LOG }).map((_, idx) => {
                const entry = tapBpmHistory[idx];
                if (!entry) {
                  return (
                    <div
                      key={`tap-empty-${idx}`}
                      className="px-2 py-1.5 rounded-lg bg-[#090b10]/50 border border-dashed border-white/[0.07] flex items-center justify-between text-[10px] font-mono text-slate-600"
                    >
                      <span>#{idx + 1}</span>
                      <span>--.- BPM</span>
                    </div>
                  );
                }
                const isSelected = tapTempoBpm === entry.bpm;
                const refMean = tapBpmStats?.avgBpm ?? entry.bpm;
                const meanOffset = Number((entry.bpm - refMean).toFixed(1));
                const barDeflectPct = Math.max(-50, Math.min(50, (meanOffset / 3) * 50));
                const deltaText =
                  entry.deltaFromPrev === null
                    ? 'BASE'
                    : `${entry.deltaFromPrev > 0 ? '+' : ''}${entry.deltaFromPrev.toFixed(1)}`;
                const deltaTone =
                  entry.deltaFromPrev === null
                    ? 'text-slate-400 bg-white/[0.05]'
                    : Math.abs(entry.deltaFromPrev) <= 0.5
                      ? 'text-emerald-300 bg-emerald-400/15'
                      : Math.abs(entry.deltaFromPrev) <= 1.5
                        ? 'text-cyan-300 bg-cyan-400/15'
                        : 'text-amber-300 bg-amber-400/15';
                const meterColor =
                  Math.abs(meanOffset) <= 0.5
                    ? 'bg-emerald-400'
                    : Math.abs(meanOffset) <= 1.5
                      ? 'bg-cyan-400'
                      : 'bg-amber-400';

                return (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setTapTempoBpm(entry.bpm)}
                    title={`Select ${entry.bpm.toFixed(1)} BPM (${entry.tapCount} taps at ${entry.timestampLabel})`}
                    className={`px-2 py-1.5 rounded-lg border text-left transition-colors cursor-pointer space-y-1 ${
                      idx === 0
                        ? 'bg-emerald-500/10 border-emerald-400/40 hover:bg-emerald-500/20'
                        : isSelected
                          ? 'bg-cyan-500/10 border-cyan-400/40'
                          : 'bg-[#090b10] border-white/[0.08] hover:border-white/[0.2]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] font-mono text-slate-400">
                        #{idx + 1} {idx === 0 ? 'NOW' : entry.timestampLabel}
                      </span>
                      <span className={`px-1 rounded text-[9px] font-mono tabular-nums ${deltaTone}`}>
                        {deltaText}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-mono font-bold tabular-nums text-slate-100">
                        {entry.bpm.toFixed(1)}
                      </span>
                      <span className="text-[9px] font-mono text-slate-400">
                        {entry.tapCount}t
                      </span>
                    </div>
                    {/* Centered Visual Deviation Bar vs Session Mean */}
                    <div className="relative h-1 rounded-full bg-white/[0.07] overflow-hidden">
                      <div className="absolute inset-y-0 left-1/2 w-[1px] bg-slate-500/60" />
                      <div
                        className={`absolute inset-y-0 rounded-full ${meterColor}`}
                        style={{
                          left: `${barDeflectPct >= 0 ? 50 : 50 + barDeflectPct}%`,
                          width: `${Math.max(6, Math.abs(barDeflectPct))}%`,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dual Decks + Center DJ Mixer */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* DECK A */}
            <div className="lg:col-span-5 bg-[#121620] border border-cyan-400/25 rounded-xl p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-cyan-400 text-[#090b10] text-[10px] font-bold tracking-wider">
                    DECK A
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100 truncate">
                      {deckATrack ? deckATrack.title : 'No Track Loaded'}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate font-mono tabular-nums">
                      {deckATrack
                        ? `${deckATrack.artist} · ${formatDjClock(deckATime)} / ${formatDjClock(deckATrack.duration)}`
                        : 'Import audio/video or load Studio track'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {currentAudioBuffer && (
                    <button
                      type="button"
                      onClick={handleLoadStudioTrackToDeckA}
                      title="Load active Studio track into Deck A"
                      className="px-2 py-1 rounded bg-white/[0.06] hover:bg-white/[0.12] text-[10px] font-medium text-cyan-200 border border-white/[0.08] cursor-pointer"
                    >
                      Studio Track
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deckAInputRef.current?.click()}
                    className="px-2 py-1 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-[10px] font-medium text-cyan-200 border border-cyan-400/35 cursor-pointer"
                  >
                    Load A
                  </button>
                </div>
              </div>

              {/* Platter + BPM & Transport */}
              <div className="flex items-center gap-3">
                <div
                  onPointerDown={(e) => {
                    if (!deckATrack || !deckAScratchEnabled) return;
                    scratchPlatterDragRef.current.A = {
                      lastX: e.clientX,
                      lastTime: performance.now(),
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    void startDeckScratch('A');
                  }}
                  onPointerMove={(e) => {
                    const st = scratchPlatterDragRef.current.A;
                    if (!st || !deckATrack) return;
                    const now = performance.now();
                    const dx = e.clientX - st.lastX;
                    const dtSec = Math.max(0.008, Math.min(0.08, (now - st.lastTime) / 1000));
                    st.lastX = e.clientX;
                    st.lastTime = now;
                    const deltaSec = (dx / 80) * scratchSensitivitySec;
                    moveDeckScratch('A', deltaSec, deltaSec / dtSec);
                  }}
                  onPointerUp={(e) => {
                    if (!scratchPlatterDragRef.current.A) return;
                    scratchPlatterDragRef.current.A = null;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                    endDeckScratch('A');
                  }}
                  onPointerCancel={() => {
                    if (!scratchPlatterDragRef.current.A) return;
                    scratchPlatterDragRef.current.A = null;
                    endDeckScratch('A');
                  }}
                  title={
                    deckATrack && deckAScratchEnabled
                      ? 'Hold or drag turntable platter horizontally to vinyl scratch'
                      : undefined
                  }
                  className={`relative w-20 h-20 shrink-0 rounded-full bg-[#07090e] border-2 flex items-center justify-center shadow-inner overflow-hidden touch-none select-none ${
                    deckAScratching
                      ? deckAScratchRate !== null && deckAScratchRate < -0.04
                        ? 'border-rose-400 ring-2 ring-rose-400/35 cursor-grabbing'
                        : 'border-cyan-300 ring-2 ring-cyan-400/35 cursor-grabbing'
                      : deckATrack && deckAScratchEnabled
                        ? 'border-cyan-400/45 hover:border-cyan-300/75 cursor-grab'
                        : 'border-cyan-400/45'
                  }`}
                >
                  <div
                    style={{
                      transform: `rotate(${(deckATime * 190) % 360}deg)`,
                    }}
                    className={`w-16 h-16 rounded-full border border-dashed border-cyan-400/45 flex items-center justify-center ${
                      deckAScratching ? '' : 'transition-transform duration-75'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-cyan-400/20 border border-cyan-300/60 flex items-center justify-center text-[9px] font-mono font-bold text-cyan-200">
                      {deckAScratching && deckAScratchRate !== null
                        ? `${deckAScratchRate >= 0 ? '+' : ''}${deckAScratchRate.toFixed(1)}x`
                        : deckATrack?.hasVideo
                          ? 'VID'
                          : 'A'}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-mono font-bold tabular-nums text-cyan-300">
                        {deckATrack
                          ? (getEffectiveBpm(deckATrack) * (1 + deckAPitchPct / 100)).toFixed(1)
                          : '---'}
                      </span>
                      <span className="text-[10px] text-slate-400">BPM</span>
                      {deckATrack && (
                        <div className="flex items-center gap-0.5 ml-1">
                          {([0.5, 1, 2] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => handleFactorBpm('A', f)}
                              className={`px-1 py-0.5 rounded text-[9px] font-mono cursor-pointer ${
                                deckATrack.bpmHalfDoubleFactor === f
                                  ? 'bg-cyan-400 text-[#090b10] font-bold'
                                  : 'bg-white/[0.06] text-slate-400'
                              }`}
                            >
                              {f === 0.5 ? '/2' : f === 2 ? 'x2' : '1x'}
                            </button>
                          ))}
                        </div>
                      )}
                      {deckATrack && (deckATrack.camelotKey || deckATrack.musicalKey) && (() => {
                        const cam = getCamelotEntry(deckATrack.camelotKey);
                        const confPct = deckATrack.keyConfidence
                          ? Math.round(deckATrack.keyConfidence * 100)
                          : null;
                        return (
                          <div
                            className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-white/[0.1] font-mono tabular-nums"
                            title={`Detected Harmonic Key: ${cam?.fullName ?? deckATrack.musicalKey ?? ''} (${deckATrack.camelotKey ?? ''})${confPct ? ` · ${confPct}% match` : ''}`}
                          >
                            <span
                              style={{ backgroundColor: cam?.colorHex ?? '#22d3ee' }}
                              className="w-2 h-2 rounded-full shrink-0"
                            />
                            <span
                              style={{ color: cam?.colorHex ?? '#67e8f9' }}
                              className="text-[11px] font-bold whitespace-nowrap"
                            >
                              {deckATrack.camelotKey ?? '--'}
                            </span>
                            <span className="text-[10px] text-slate-300 whitespace-nowrap">
                              {deckATrack.musicalKey ?? ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdjustDeckKey('A', 'prev')}
                              title="Step Camelot wheel -1"
                              className="px-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-[9px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustDeckKey('A', 'toggle-mode')}
                              title="Switch relative Major/Minor (A ↔ B)"
                              className="px-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-[9px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              {cam?.letter === 'A' ? 'Maj' : 'Min'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustDeckKey('A', 'next')}
                              title="Step Camelot wheel +1"
                              className="px-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-[9px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSyncDeckBpm('A')}
                      disabled={!deckATrack || !deckBTrack}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 cursor-pointer disabled:opacity-35 shrink-0"
                    >
                      SYNC
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleDeckPlay('A')}
                      disabled={!deckATrack}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      {deckAPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      <span>{deckAPlaying ? 'Pause' : 'Play A'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!deckATrack) return;
                        const dropSec = syncToBeatGrid
                          ? snapTimeToTrackBeatGrid(deckATrack, deckATrack.dropTime)
                          : deckATrack.dropTime;
                        setDeckATime(dropSec);
                        if (deckAPlaying) void startLiveDeckFromTime('A', dropSec);
                      }}
                      disabled={!deckATrack}
                      className="px-2 py-1 rounded-md text-[10px] font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-400/30 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Flame className="w-3 h-3" />
                      <span>Drop</span>
                    </button>

                    {([4, 8] as const).map((lb) => (
                      <button
                        key={lb}
                        type="button"
                        onClick={() => setDeckALoopBeats((cur) => (cur === lb ? 0 : lb))}
                        disabled={!deckATrack}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono border cursor-pointer disabled:opacity-40 ${
                          deckALoopBeats === lb
                            ? 'bg-cyan-400 text-[#090b10] border-cyan-300 font-bold'
                            : 'bg-white/[0.05] text-slate-300 border-white/[0.08]'
                        }`}
                      >
                        {lb}B Loop
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => handleTriggerVinylBrake('A')}
                      disabled={!deckAPlaying}
                      className="px-2 py-1 rounded-md text-[10px] bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                    >
                      Brake
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerDeckBackspin('A')}
                      disabled={!deckATrack}
                      title="Reverse vinyl backspin spin-down FX"
                      className="px-2 py-1 rounded-md text-[10px] bg-white/[0.05] hover:bg-white/[0.1] text-cyan-200 border border-white/[0.08] flex items-center gap-1 cursor-pointer disabled:opacity-35"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Backspin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleEchoPulse('A')}
                      disabled={!deckAPlaying}
                      className="px-2 py-1 rounded-md text-[10px] bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                    >
                      Echo
                    </button>
                  </div>
                </div>
              </div>

              {/* Deck A Beat Grid Zoom & Visual Beat-Grid Editor + Waveform */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center p-0.5 rounded bg-[#090b10] border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => {
                          setDeckAWaveformView('overview');
                          setDeckAWaveformZoomPct(0);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckAWaveformZoomPct === 0 && deckAWaveformView === 'overview'
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeckAWaveformView('zoom');
                          setDeckAWaveformZoomPct(45);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckAWaveformZoomPct > 0 || deckAWaveformView === 'zoom'
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Zoom
                      </button>
                    </div>
                    {deckAPhaseInfo && (
                      <span className="font-mono tabular-nums text-cyan-300">
                        Bar {deckAPhaseInfo.barNumber}.{deckAPhaseInfo.beatInBar}
                      </span>
                    )}
                    {deckATrack && Math.abs(deckATrack.beatGridOffsetMs ?? 0) >= 0.5 && (
                      <span className="font-mono tabular-nums text-[9px] text-amber-300">
                        ({(deckATrack.beatGridOffsetMs ?? 0) >= 0 ? '+' : ''}
                        {(deckATrack.beatGridOffsetMs ?? 0).toFixed(1)}ms)
                      </span>
                    )}
                    {spectrogramMode !== 'off' && (
                      <span className="font-mono text-[8.5px] text-slate-400 whitespace-nowrap hidden sm:inline">
                        <span className="text-rose-400">Kick</span> · <span className="text-cyan-300">Melodic</span> · <span className="text-amber-300">Snare</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[9px]">
                    <button
                      type="button"
                      disabled={!deckATrack}
                      onClick={() => {
                        setDeckAScratchEnabled((v) => !v);
                        if (deckAGridEditorOpen) setDeckAGridEditorOpen(false);
                      }}
                      title="Toggle Vinyl Scratch mode on Deck A waveform"
                      className={`px-1.5 py-0.5 rounded font-sans font-semibold border flex items-center gap-1 cursor-pointer disabled:opacity-35 ${
                        deckAScratchEnabled && !deckAGridEditorOpen
                          ? 'bg-cyan-400/20 text-cyan-200 border-cyan-400/45'
                          : 'bg-[#090b10] hover:bg-white/[0.08] text-slate-400 border-white/[0.1]'
                      }`}
                    >
                      <Disc3 className="w-2.5 h-2.5" />
                      <span>Scratch</span>
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack || !deckAScratchEnabled}
                      onClick={() => setDeckASlipMode((v) => !v)}
                      title="Slip Mode: background beat clock keeps running while scratching and snaps back on release"
                      className={`px-1.5 py-0.5 rounded font-sans font-medium border cursor-pointer disabled:opacity-35 ${
                        deckASlipMode
                          ? 'bg-fuchsia-500/25 text-fuchsia-200 border-fuchsia-400/45'
                          : 'bg-[#090b10] hover:bg-white/[0.08] text-slate-400 border-white/[0.1]'
                      }`}
                    >
                      Slip
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack || deckATrack.beatGridLocked}
                      onClick={() => handleShiftDeckBeatGrid('A', -2)}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                    >
                      -2ms
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack || deckATrack.beatGridLocked}
                      onClick={() => handleSetDeckDownbeatHere('A')}
                      className="px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/30 font-sans font-medium cursor-pointer disabled:opacity-35"
                    >
                      Set 1.1
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack || deckATrack.beatGridLocked}
                      onClick={() => handleShiftDeckBeatGrid('A', 2)}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                    >
                      +2ms
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack}
                      onClick={() => {
                        setDeckAGridEditorOpen((open) => {
                          const next = !open;
                          if (next) {
                            setDeckAWaveformView('zoom');
                            setDeckAWaveformZoomPct((z) => (z < 45 ? 55 : z));
                          }
                          return next;
                        });
                      }}
                      className={`px-2 py-0.5 rounded font-sans font-semibold border flex items-center gap-1 cursor-pointer disabled:opacity-35 ${
                        deckAGridEditorOpen
                          ? 'bg-amber-400 text-[#090b10] border-amber-300'
                          : 'bg-[#090b10] hover:bg-white/[0.08] text-slate-200 border-white/[0.12]'
                      }`}
                    >
                      <Sliders className="w-2.5 h-2.5" />
                      <span>Edit Grid</span>
                    </button>
                  </div>
                </div>

                {/* Deck A Transient Zoom Slider & Tight Loop/Cue Strip */}
                <div className="bg-[#090b10] border border-white/[0.07] rounded-lg px-2 py-1 flex flex-wrap items-center gap-2 text-[9.5px]">
                  <div className="flex items-center gap-1 flex-1 min-w-[140px]">
                    <button
                      type="button"
                      disabled={!deckATrack || deckAWaveformZoomPct <= 0}
                      onClick={() => {
                        const next = Math.max(0, deckAWaveformZoomPct - 15);
                        setDeckAWaveformZoomPct(next);
                        setDeckAWaveformView(next > 0 ? 'zoom' : 'overview');
                      }}
                      title="Zoom out waveform"
                      className="p-0.5 rounded text-slate-400 hover:text-cyan-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      disabled={!deckATrack}
                      value={deckAWaveformZoomPct}
                      aria-label="Deck A waveform transient zoom"
                      onChange={(e) => {
                        const next = parseInt(e.target.value, 10);
                        setDeckAWaveformZoomPct(next);
                        setDeckAWaveformView(next > 0 ? 'zoom' : 'overview');
                      }}
                      className="w-full accent-cyan-400 cursor-pointer disabled:opacity-40"
                    />
                    <button
                      type="button"
                      disabled={!deckATrack || deckAWaveformZoomPct >= 100}
                      onClick={() => {
                        const next = Math.min(100, deckAWaveformZoomPct + 15);
                        setDeckAWaveformZoomPct(next);
                        setDeckAWaveformView('zoom');
                      }}
                      title="Zoom in onto transients"
                      className="p-0.5 rounded text-slate-400 hover:text-cyan-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                    <span className="font-mono tabular-nums text-cyan-300 w-16 text-right shrink-0">
                      {!deckATrack || deckAWaveformZoomPct === 0
                        ? 'Full'
                        : (() => {
                            const span = computeWaveformZoomSpanSec(deckATrack, deckAWaveformZoomPct);
                            const beats = span / (60 / Math.max(40, getEffectiveBpm(deckATrack)));
                            return span < 1.5
                              ? `${Math.round(span * 1000)}ms`
                              : `${beats.toFixed(1)}B`;
                          })()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(
                      [
                        { label: 'Full', pct: 0 },
                        { label: '8B', pct: 45 },
                        { label: '2B', pct: 74 },
                        { label: '0.5B', pct: 100 },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={!deckATrack}
                        onClick={() => {
                          setDeckAWaveformZoomPct(preset.pct);
                          setDeckAWaveformView(preset.pct > 0 ? 'zoom' : 'overview');
                        }}
                        className={`px-1 py-0.5 rounded font-mono text-[8.5px] border cursor-pointer disabled:opacity-35 ${
                          Math.abs(deckAWaveformZoomPct - preset.pct) <= 3
                            ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
                            : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!deckATrack}
                      onClick={() => {
                        if (deckATransientSeek) {
                          setDeckATransientSeek(false);
                          if (!syncToBeatGrid) setSyncToBeatGrid(true);
                          handleSnapDeckPlayheadToBeatGrid('A');
                        } else {
                          setDeckATransientSeek(true);
                        }
                      }}
                      title="Toggle Beat-Grid quantized waveform seeking vs Free Millisecond seeking"
                      className={`px-1.5 py-0.5 rounded font-mono text-[8.5px] border cursor-pointer disabled:opacity-35 ${
                        deckATransientSeek || !syncToBeatGrid
                          ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                          : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                      }`}
                    >
                      {deckATransientSeek || !syncToBeatGrid ? 'Free ms' : 'Beat Snap'}
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack}
                      onClick={() => {
                        setCueManagerDeck('A');
                        handlePlaceCuePoint(
                          'A',
                          `Cue ${(deckATrack?.cuePoints?.length ?? 0) + 1}`,
                          deckATime,
                          '#22d3ee'
                        );
                      }}
                      title="Set tight cue marker at exact zoomed playhead"
                      className="px-1.5 py-0.5 rounded bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 font-semibold cursor-pointer disabled:opacity-35"
                    >
                      + Cue
                    </button>
                  </div>
                </div>

                {/* Deck A Track Alignment Nudge Bar (+/- 5ms, +/- 10ms) */}
                <div className="bg-[#090b10] border border-white/[0.07] rounded-lg px-2 py-1 flex flex-wrap items-center justify-between gap-2 text-[9.5px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-300 whitespace-nowrap">
                      Nudge Align
                    </span>
                    <span
                      className={`font-mono tabular-nums whitespace-nowrap ${
                        Math.abs(deckANudgeMs) >= 0.5
                          ? 'text-cyan-300 font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      {deckANudgeMs >= 0 ? '+' : ''}
                      {deckANudgeMs.toFixed(0)}ms
                    </span>
                    {deckAPhaseInfo && (
                      <span className="font-mono tabular-nums text-[9px] text-slate-400 whitespace-nowrap hidden sm:inline">
                        · Beat {deckAPhaseInfo.phaseMs >= 0 ? '+' : ''}
                        {deckAPhaseInfo.phaseMs.toFixed(1)}ms
                      </span>
                    )}
                    {Math.abs(deckANudgeMs) >= 0.5 && (
                      <button
                        type="button"
                        disabled={!deckATrack}
                        onClick={() =>
                          handleNudgeTrackAlignment('A', -deckANudgeMs, { resetCounter: true })
                        }
                        title="Revert cumulative track alignment nudge back to 0ms"
                        className="px-1 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-[8.5px] font-mono text-slate-300 cursor-pointer"
                      >
                        0ms
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                    <button
                      type="button"
                      disabled={!deckATrack}
                      onClick={() => handleSnapDeckPlayheadToBeatGrid('A')}
                      title="Snap Deck A playhead immediately to the nearest beat marker"
                      className="px-1.5 py-0.5 rounded text-[9px] font-sans font-semibold border bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border-cyan-400/35 flex items-center gap-1 cursor-pointer disabled:opacity-35 mr-1"
                    >
                      <Magnet className="w-2.5 h-2.5" />
                      <span>Snap Beat</span>
                    </button>
                    {([-10, -5, 5, 10] as const).map((ms) => {
                      const isActiveFlash = deckANudgeFlash?.deltaMs === ms;
                      return (
                        <button
                          key={ms}
                          type="button"
                          disabled={!deckATrack}
                          onClick={() => handleNudgeTrackAlignment('A', ms)}
                          aria-label={`Nudge Deck A track alignment by ${ms > 0 ? `+${ms}` : ms} milliseconds`}
                          title={`Micro-adjust Deck A track alignment by ${ms > 0 ? `+${ms}` : ms}ms`}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-colors cursor-pointer disabled:opacity-35 ${
                            isActiveFlash
                              ? 'bg-cyan-400 text-[#090b10] border-cyan-300'
                              : 'bg-white/[0.05] hover:bg-cyan-500/20 text-slate-200 hover:text-cyan-200 border-white/[0.09]'
                          }`}
                        >
                          {ms > 0 ? `+${ms}ms` : `${ms}ms`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <TriBandWaveformCanvas
                  track={deckATrack}
                  playheadSec={deckATime}
                  accentHex="#22d3ee"
                  cueTimeSec={deckAOutTime ?? deckATrack?.recommendedOutTime ?? null}
                  cueLabel="MIX OUT"
                  showBeatGrid={showBeatGridOverlay}
                  beatGridSubdivision={beatGridSubdivision}
                  viewMode={deckAWaveformView}
                  zoomPct={deckAWaveformZoomPct}
                  freeTransientSeek={deckATransientSeek}
                  syncToBeatGrid={syncToBeatGrid}
                  nudgeAccumMs={deckANudgeMs}
                  nudgeFlash={deckANudgeFlash}
                  harmonicCompatibility={deckATrack && deckBTrack ? harmonicComparison : null}
                  spectrogramMode={spectrogramMode}
                  loopWindowStartSec={
                    deckATrack && deckALoopBeats > 0
                      ? deckAChainRef.current?.offsetSec ?? deckATime
                      : null
                  }
                  loopWindowEndSec={
                    deckATrack && deckALoopBeats > 0
                      ? Math.min(
                          deckATrack.duration,
                          (deckAChainRef.current?.offsetSec ?? deckATime) +
                            (60 / Math.max(40, getEffectiveBpm(deckATrack))) * deckALoopBeats
                        )
                      : null
                  }
                  isGridEditMode={deckAGridEditorOpen}
                  isScratchMode={!deckAGridEditorOpen && deckAScratchEnabled}
                  isScratching={deckAScratching}
                  scratchRate={deckAScratchRate}
                  scratchSensitivitySec={scratchSensitivitySec}
                  masterBeatClockRef={masterBeatClockRef}
                  registerBeatPulseDraw={registerBeatPulseDraw}
                  onDragBeatGridMs={(deltaMs) => handleShiftDeckBeatGrid('A', deltaMs, true)}
                  onScratchStart={() => void startDeckScratch('A')}
                  onScratchMove={(deltaSec, velocityRate) =>
                    moveDeckScratch('A', deltaSec, velocityRate)
                  }
                  onScratchEnd={() => endDeckScratch('A')}
                  onSeekOrCue={(t) => {
                    setDeckATime(t);
                    setDeckAOutTime(t);
                    if (deckAPlaying) void startLiveDeckFromTime('A', t);
                  }}
                />

                {deckAGridEditorOpen && deckATrack && (
                  <div className="bg-[#090b10] border border-amber-400/30 rounded-lg p-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-200">
                          Visual Beat-Grid Editor
                        </span>
                        <span className="font-mono tabular-nums text-cyan-300">
                          Offset {(deckATrack.beatGridOffsetMs ?? 0) >= 0 ? '+' : ''}
                          {(deckATrack.beatGridOffsetMs ?? 0).toFixed(1)} ms
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deckATrack.beatGridLocked}
                          onClick={() => handleSnapGridToTransient('A')}
                          className="px-1.5 py-0.5 rounded bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/35 text-[9px] font-semibold cursor-pointer disabled:opacity-35"
                        >
                          Snap Peak
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDeckGridLock('A')}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border flex items-center gap-0.5 cursor-pointer ${
                            deckATrack.beatGridLocked
                              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                              : 'bg-white/[0.05] border-white/[0.1] text-slate-300'
                          }`}
                        >
                          {deckATrack.beatGridLocked ? (
                            <Lock className="w-2.5 h-2.5" />
                          ) : (
                            <Unlock className="w-2.5 h-2.5" />
                          )}
                          <span>{deckATrack.beatGridLocked ? 'Locked' : 'Lock'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetDeckBeatGrid('A')}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 text-[9px] cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-slate-500 shrink-0">-250ms</span>
                      <input
                        type="range"
                        min={-250}
                        max={250}
                        step={0.5}
                        disabled={deckATrack.beatGridLocked}
                        value={Math.max(-250, Math.min(250, deckATrack.beatGridOffsetMs ?? 0))}
                        onChange={(e) =>
                          handleSetDeckGridOffsetMs('A', parseFloat(e.target.value))
                        }
                        aria-label="Deck A beat grid phase offset in milliseconds"
                        className="w-full accent-amber-400 cursor-pointer disabled:opacity-40"
                      />
                      <span className="text-[9px] font-mono text-slate-500 shrink-0">+250ms</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[9px] font-mono tabular-nums">
                      <div className="flex flex-wrap items-center gap-1">
                        {([-20, -5, -1, 1, 5, 20] as const).map((ms) => (
                          <button
                            key={ms}
                            type="button"
                            disabled={deckATrack.beatGridLocked}
                            onClick={() => handleShiftDeckBeatGrid('A', ms)}
                            className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer disabled:opacity-35"
                          >
                            {ms > 0 ? `+${ms}ms` : `${ms}ms`}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deckATrack.beatGridLocked}
                          onClick={() => handleCycleDeckDownbeat('A', -1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          1.1 -1B
                        </button>
                        <button
                          type="button"
                          disabled={deckATrack.beatGridLocked}
                          onClick={() => handleCycleDeckDownbeat('A', 1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          1.1 +1B
                        </button>
                        <span className="text-slate-600 mx-0.5">|</span>
                        <button
                          type="button"
                          disabled={deckATrack.beatGridLocked}
                          onClick={() => handleFineBpmAdjust('A', -0.1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          -0.1
                        </button>
                        <span className="text-cyan-300 px-1">{deckATrack.bpm.toFixed(1)}</span>
                        <button
                          type="button"
                          disabled={deckATrack.beatGridLocked}
                          onClick={() => handleFineBpmAdjust('A', 0.1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          +0.1
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Deck A Instant Hot Cue Jump Bar */}
              <div className="flex flex-wrap items-center gap-1 bg-[#090b10] border border-white/[0.07] rounded-lg px-2 py-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-300 mr-0.5 flex items-center gap-1">
                  <Bookmark className="w-2.5 h-2.5" />
                  <span>Hot Cues</span>
                </span>
                {(deckATrack?.cuePoints ?? []).map((cue) => (
                  <button
                    key={cue.id}
                    type="button"
                    onClick={() => handleJumpToCuePoint('A', cue)}
                    style={{ borderColor: `${cue.color}66` }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] hover:bg-white/[0.12] text-slate-100 border flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span
                      style={{ backgroundColor: cue.color }}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                    />
                    <span>{cue.label}</span>
                    <span className="font-mono text-[9px] text-slate-400">
                      {formatDjClock(cue.timeSec)}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!deckATrack}
                  onClick={() => {
                    setCueManagerDeck('A');
                    handlePlaceCuePoint(
                      'A',
                      `Cue ${(deckATrack?.cuePoints?.length ?? 0) + 1}`,
                      deckATime,
                      '#22d3ee'
                    );
                  }}
                  title="Stamp cue marker at Deck A playhead"
                  className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 flex items-center gap-0.5 cursor-pointer disabled:opacity-35"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span>Stamp</span>
                </button>
              </div>

              {/* Deck A EQ + Filter + Pitch */}
              <div className="grid grid-cols-5 gap-2 bg-[#090b10] border border-white/[0.07] rounded-lg p-2">
                {(
                  [
                    { label: 'LOW', val: eqA.lowGainDb, min: -18, max: 9, step: 1, onChange: (v: number) => setEqA((p) => ({ ...p, lowGainDb: v })) },
                    { label: 'MID', val: eqA.midGainDb, min: -18, max: 9, step: 1, onChange: (v: number) => setEqA((p) => ({ ...p, midGainDb: v })) },
                    { label: 'HIGH', val: eqA.highGainDb, min: -18, max: 9, step: 1, onChange: (v: number) => setEqA((p) => ({ ...p, highGainDb: v })) },
                    { label: 'FILTER', val: eqA.filterSweep, min: -1, max: 1, step: 0.05, onChange: (v: number) => setEqA((p) => ({ ...p, filterSweep: v })) },
                    { label: 'PITCH', val: deckAPitchPct, min: -16, max: 16, step: 0.5, onChange: (v: number) => setDeckAPitchPct(v) },
                  ]
                ).map((ctrl) => (
                  <label key={ctrl.label} className="flex flex-col items-center gap-1">
                    <span className="text-[9px] font-semibold text-slate-400">{ctrl.label}</span>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={ctrl.val}
                      onChange={(e) => ctrl.onChange(parseFloat(e.target.value))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                    <span className="text-[9px] font-mono tabular-nums text-cyan-300">
                      {ctrl.label === 'PITCH' ? `${ctrl.val >= 0 ? '+' : ''}${ctrl.val}%` : ctrl.val.toFixed(ctrl.step < 1 ? 1 : 0)}
                    </span>
                  </label>
                ))}
              </div>

              {/* Deck A Lyrics & Mix-Out Cue Drawer */}
              <div className="bg-[#090b10] border border-white/[0.07] rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-slate-300 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-fuchsia-400" />
                    <span>Deck A Lyric Cues ({deckATrack?.lyrics.length ?? 0})</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!deckATrack}
                      onClick={() => deckALyricInputRef.current?.click()}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-slate-300 cursor-pointer disabled:opacity-40"
                    >
                      .LRC/.TXT
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack}
                      onClick={() => {
                        setLyricDrawerDeck('A');
                        setLyricDraftText(
                          deckATrack?.lyrics.map((l) => l.text).join('\n') ?? ''
                        );
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-slate-300 cursor-pointer disabled:opacity-40"
                    >
                      Paste
                    </button>
                    <button
                      type="button"
                      disabled={!deckATrack || deckATrack.lyrics.length === 0}
                      onClick={() => handleSnapDeckLyricsToBeats('A')}
                      className="px-1.5 py-0.5 rounded bg-fuchsia-500/15 hover:bg-fuchsia-500/25 text-[10px] text-fuchsia-200 cursor-pointer disabled:opacity-40"
                    >
                      Snap Beats
                    </button>
                  </div>
                </div>
                {deckATrack && deckATrack.lyrics.length > 0 ? (
                  <div className="max-h-20 overflow-y-auto space-y-0.5 pr-1">
                    {deckATrack.lyrics.map((line) => {
                      const isSelected = deckAOutLyricId === line.id;
                      return (
                        <button
                          key={line.id}
                          type="button"
                          onClick={() => {
                            const targetSec =
                              syncToBeatGrid && deckATrack
                                ? snapTimeToTrackBeatGrid(deckATrack, line.time)
                                : line.time;
                            setDeckAOutLyricId(line.id);
                            setDeckAOutTime(targetSec);
                            setTriggerMode('lyrics');
                            setDeckATime(targetSec);
                            if (deckAPlaying) void startLiveDeckFromTime('A', targetSec);
                          }}
                          className={`w-full text-left px-2 py-0.5 rounded text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-fuchsia-500/25 text-fuchsia-100 border border-fuchsia-400/40'
                              : 'hover:bg-white/[0.05] text-slate-300'
                          }`}
                        >
                          <span className="truncate">{line.text}</span>
                          <span className="text-[9px] font-mono tabular-nums text-slate-400 shrink-0">
                            {isSelected ? 'MIX OUT @ ' : ''}
                            {formatDjClock(line.time)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    Load .lrc / plain text lyrics to trigger beat-locked transitions on a vocal line.
                  </p>
                )}
              </div>
            </div>

            {/* CENTER DJ MIXER */}
            <div className="lg:col-span-2 bg-[#121620] border border-white/[0.09] rounded-xl p-3 flex flex-col justify-between gap-3">
              <div className="text-center space-y-1">
                <div className="text-[10px] font-bold tracking-widest uppercase text-slate-400">
                  Mixer
                </div>
                <div className="flex items-center justify-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setIsMasterMuted((m) => !m)}
                    aria-label={isMasterMuted ? 'Unmute DJ master' : 'Mute DJ master'}
                    className="p-1 rounded hover:bg-white/[0.07] cursor-pointer"
                  >
                    {isMasterMuted || masterVolume === 0 ? (
                      <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                    ) : (
                      <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMasterMuted ? 0 : masterVolume}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      setMasterVolume(v);
                      if (v > 0 && isMasterMuted) setIsMasterMuted(false);
                    }}
                    aria-label="Master DJ volume"
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </div>
                {/* Compact Master Brick-Wall Output Headroom LED */}
                <div className="pt-1 space-y-1">
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <span className="text-slate-400">OUT CEIL</span>
                    <span
                      ref={mixerLimiterStatusRef}
                      className={limiterEnabled ? 'text-emerald-300 font-semibold' : 'text-rose-300'}
                    >
                      {limiterEnabled ? `${limiterCeilingDb.toFixed(1)}dB` : 'OFF'}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#090b10] border border-white/[0.08] overflow-hidden">
                    <div
                      ref={mixerLimiterLedBarRef}
                      className={`h-full transition-[width] duration-75 ${
                        limiterEnabled
                          ? 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-amber-400'
                          : 'bg-rose-500'
                      }`}
                      style={{ width: '4%' }}
                    />
                  </div>
                </div>
              </div>

              {/* Quick EQ Kill & Reset */}
              <div className="space-y-1.5">
                <div className="text-[9px] uppercase tracking-wider text-center text-slate-500">
                  Quick Bass Swap
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEqA((p) => ({ ...p, lowGainDb: p.lowGainDb < -10 ? 0 : -16 }));
                    setEqB((p) => ({ ...p, lowGainDb: eqA.lowGainDb < -10 ? -16 : 0 }));
                  }}
                  className="w-full py-1.5 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-cyan-500/20 to-amber-500/20 hover:brightness-125 text-slate-100 border border-white/[0.12] cursor-pointer"
                >
                  Swap Bass A/B
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEqA({ ...DEFAULT_DECK_EQ });
                    setEqB({ ...DEFAULT_DECK_EQ });
                  }}
                  className="w-full py-1 rounded-lg text-[10px] text-slate-400 hover:text-white bg-white/[0.04] border border-white/[0.08] cursor-pointer"
                >
                  Reset EQs
                </button>
              </div>

              {/* Interactive Crossfader */}
              <div className="bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-cyan-400 font-bold">A</span>
                  <span className="text-slate-400">XFADE</span>
                  <span className="text-amber-400 font-bold">B</span>
                </div>
                <input
                  type="range"
                  min={-1}
                  max={1}
                  step={0.02}
                  value={crossfader}
                  onChange={(e) => setCrossfader(parseFloat(e.target.value))}
                  aria-label="DJ Crossfader"
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => setCrossfader(-1)}
                    className="py-1 rounded text-[9px] font-bold bg-cyan-500/15 text-cyan-200 cursor-pointer"
                  >
                    &lt; A
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrossfader(0)}
                    className="py-1 rounded text-[9px] font-bold bg-white/[0.08] text-slate-200 cursor-pointer"
                  >
                    50/50
                  </button>
                  <button
                    type="button"
                    onClick={() => setCrossfader(1)}
                    className="py-1 rounded text-[9px] font-bold bg-amber-500/15 text-amber-200 cursor-pointer"
                  >
                    B &gt;
                  </button>
                </div>
              </div>
            </div>

            {/* DECK B */}
            <div className="lg:col-span-5 bg-[#121620] border border-amber-400/25 rounded-xl p-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="px-2 py-0.5 rounded bg-amber-400 text-[#090b10] text-[10px] font-bold tracking-wider">
                    DECK B
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-100 truncate">
                      {deckBTrack ? deckBTrack.title : 'No Track Loaded'}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate font-mono tabular-nums">
                      {deckBTrack
                        ? `${deckBTrack.artist} · ${formatDjClock(deckBTime)} / ${formatDjClock(deckBTrack.duration)}`
                        : 'Import second audio/video track'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => deckBInputRef.current?.click()}
                  className="px-2 py-1 rounded bg-amber-500/15 hover:bg-amber-500/25 text-[10px] font-medium text-amber-200 border border-amber-400/35 cursor-pointer shrink-0"
                >
                  Load B
                </button>
              </div>

              {/* Platter + BPM & Transport */}
              <div className="flex items-center gap-3">
                <div
                  onPointerDown={(e) => {
                    if (!deckBTrack || !deckBScratchEnabled) return;
                    scratchPlatterDragRef.current.B = {
                      lastX: e.clientX,
                      lastTime: performance.now(),
                    };
                    e.currentTarget.setPointerCapture(e.pointerId);
                    void startDeckScratch('B');
                  }}
                  onPointerMove={(e) => {
                    const st = scratchPlatterDragRef.current.B;
                    if (!st || !deckBTrack) return;
                    const now = performance.now();
                    const dx = e.clientX - st.lastX;
                    const dtSec = Math.max(0.008, Math.min(0.08, (now - st.lastTime) / 1000));
                    st.lastX = e.clientX;
                    st.lastTime = now;
                    const deltaSec = (dx / 80) * scratchSensitivitySec;
                    moveDeckScratch('B', deltaSec, deltaSec / dtSec);
                  }}
                  onPointerUp={(e) => {
                    if (!scratchPlatterDragRef.current.B) return;
                    scratchPlatterDragRef.current.B = null;
                    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                      e.currentTarget.releasePointerCapture(e.pointerId);
                    }
                    endDeckScratch('B');
                  }}
                  onPointerCancel={() => {
                    if (!scratchPlatterDragRef.current.B) return;
                    scratchPlatterDragRef.current.B = null;
                    endDeckScratch('B');
                  }}
                  title={
                    deckBTrack && deckBScratchEnabled
                      ? 'Hold or drag turntable platter horizontally to vinyl scratch'
                      : undefined
                  }
                  className={`relative w-20 h-20 shrink-0 rounded-full bg-[#07090e] border-2 flex items-center justify-center shadow-inner overflow-hidden touch-none select-none ${
                    deckBScratching
                      ? deckBScratchRate !== null && deckBScratchRate < -0.04
                        ? 'border-rose-400 ring-2 ring-rose-400/35 cursor-grabbing'
                        : 'border-amber-300 ring-2 ring-amber-400/35 cursor-grabbing'
                      : deckBTrack && deckBScratchEnabled
                        ? 'border-amber-400/45 hover:border-amber-300/75 cursor-grab'
                        : 'border-amber-400/45'
                  }`}
                >
                  <div
                    style={{
                      transform: `rotate(${(deckBTime * 190) % 360}deg)`,
                    }}
                    className={`w-16 h-16 rounded-full border border-dashed border-amber-400/45 flex items-center justify-center ${
                      deckBScratching ? '' : 'transition-transform duration-75'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-full bg-amber-400/20 border border-amber-300/60 flex items-center justify-center text-[9px] font-mono font-bold text-amber-200">
                      {deckBScratching && deckBScratchRate !== null
                        ? `${deckBScratchRate >= 0 ? '+' : ''}${deckBScratchRate.toFixed(1)}x`
                        : deckBTrack?.hasVideo
                          ? 'VID'
                          : 'B'}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-base font-mono font-bold tabular-nums text-amber-300">
                        {deckBTrack
                          ? (getEffectiveBpm(deckBTrack) * (1 + deckBPitchPct / 100)).toFixed(1)
                          : '---'}
                      </span>
                      <span className="text-[10px] text-slate-400">BPM</span>
                      {deckBTrack && (
                        <div className="flex items-center gap-0.5 ml-1">
                          {([0.5, 1, 2] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => handleFactorBpm('B', f)}
                              className={`px-1 py-0.5 rounded text-[9px] font-mono cursor-pointer ${
                                deckBTrack.bpmHalfDoubleFactor === f
                                  ? 'bg-amber-400 text-[#090b10] font-bold'
                                  : 'bg-white/[0.06] text-slate-400'
                              }`}
                            >
                              {f === 0.5 ? '/2' : f === 2 ? 'x2' : '1x'}
                            </button>
                          ))}
                        </div>
                      )}
                      {deckBTrack && (deckBTrack.camelotKey || deckBTrack.musicalKey) && (() => {
                        const cam = getCamelotEntry(deckBTrack.camelotKey);
                        const confPct = deckBTrack.keyConfidence
                          ? Math.round(deckBTrack.keyConfidence * 100)
                          : null;
                        return (
                          <div
                            className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-white/[0.1] font-mono tabular-nums"
                            title={`Detected Harmonic Key: ${cam?.fullName ?? deckBTrack.musicalKey ?? ''} (${deckBTrack.camelotKey ?? ''})${confPct ? ` · ${confPct}% match` : ''}`}
                          >
                            <span
                              style={{ backgroundColor: cam?.colorHex ?? '#f59e0b' }}
                              className="w-2 h-2 rounded-full shrink-0"
                            />
                            <span
                              style={{ color: cam?.colorHex ?? '#fcd34d' }}
                              className="text-[11px] font-bold whitespace-nowrap"
                            >
                              {deckBTrack.camelotKey ?? '--'}
                            </span>
                            <span className="text-[10px] text-slate-300 whitespace-nowrap">
                              {deckBTrack.musicalKey ?? ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdjustDeckKey('B', 'prev')}
                              title="Step Camelot wheel -1"
                              className="px-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-[9px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              -
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustDeckKey('B', 'toggle-mode')}
                              title="Switch relative Major/Minor (A ↔ B)"
                              className="px-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-[9px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              {cam?.letter === 'A' ? 'Maj' : 'Min'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustDeckKey('B', 'next')}
                              title="Step Camelot wheel +1"
                              className="px-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-[9px] text-slate-400 hover:text-white cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                        );
                      })()}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSyncDeckBpm('B')}
                      disabled={!deckATrack || !deckBTrack}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 cursor-pointer disabled:opacity-35 shrink-0"
                    >
                      SYNC
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => toggleDeckPlay('B')}
                      disabled={!deckBTrack}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-400 hover:bg-amber-300 text-[#090b10] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      {deckBPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                      <span>{deckBPlaying ? 'Pause' : 'Play B'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        if (!deckBTrack) return;
                        const dropSec = syncToBeatGrid
                          ? snapTimeToTrackBeatGrid(deckBTrack, deckBTrack.dropTime)
                          : deckBTrack.dropTime;
                        setDeckBTime(dropSec);
                        if (deckBPlaying) void startLiveDeckFromTime('B', dropSec);
                      }}
                      disabled={!deckBTrack}
                      className="px-2 py-1 rounded-md text-[10px] font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-400/30 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                    >
                      <Flame className="w-3 h-3" />
                      <span>Drop</span>
                    </button>

                    {([4, 8] as const).map((lb) => (
                      <button
                        key={lb}
                        type="button"
                        onClick={() => setDeckBLoopBeats((cur) => (cur === lb ? 0 : lb))}
                        disabled={!deckBTrack}
                        className={`px-2 py-1 rounded-md text-[10px] font-mono border cursor-pointer disabled:opacity-40 ${
                          deckBLoopBeats === lb
                            ? 'bg-amber-400 text-[#090b10] border-amber-300 font-bold'
                            : 'bg-white/[0.05] text-slate-300 border-white/[0.08]'
                        }`}
                      >
                        {lb}B Loop
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={() => handleTriggerVinylBrake('B')}
                      disabled={!deckBPlaying}
                      className="px-2 py-1 rounded-md text-[10px] bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                    >
                      Brake
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerDeckBackspin('B')}
                      disabled={!deckBTrack}
                      title="Reverse vinyl backspin spin-down FX"
                      className="px-2 py-1 rounded-md text-[10px] bg-white/[0.05] hover:bg-white/[0.1] text-amber-200 border border-white/[0.08] flex items-center gap-1 cursor-pointer disabled:opacity-35"
                    >
                      <RotateCcw className="w-2.5 h-2.5" />
                      <span>Backspin</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleEchoPulse('B')}
                      disabled={!deckBPlaying}
                      className="px-2 py-1 rounded-md text-[10px] bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                    >
                      Echo
                    </button>
                  </div>
                </div>
              </div>

              {/* Deck B Beat Grid Zoom & Visual Beat-Grid Editor + Waveform */}
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center p-0.5 rounded bg-[#090b10] border border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => {
                          setDeckBWaveformView('overview');
                          setDeckBWaveformZoomPct(0);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckBWaveformZoomPct === 0 && deckBWaveformView === 'overview'
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDeckBWaveformView('zoom');
                          setDeckBWaveformZoomPct(45);
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckBWaveformZoomPct > 0 || deckBWaveformView === 'zoom'
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Zoom
                      </button>
                    </div>
                    {deckBPhaseInfo && (
                      <span className="font-mono tabular-nums text-amber-300">
                        Bar {deckBPhaseInfo.barNumber}.{deckBPhaseInfo.beatInBar}
                      </span>
                    )}
                    {deckBTrack && Math.abs(deckBTrack.beatGridOffsetMs ?? 0) >= 0.5 && (
                      <span className="font-mono tabular-nums text-[9px] text-amber-300">
                        ({(deckBTrack.beatGridOffsetMs ?? 0) >= 0 ? '+' : ''}
                        {(deckBTrack.beatGridOffsetMs ?? 0).toFixed(1)}ms)
                      </span>
                    )}
                    {spectrogramMode !== 'off' && (
                      <span className="font-mono text-[8.5px] text-slate-400 whitespace-nowrap hidden sm:inline">
                        <span className="text-rose-400">Kick</span> · <span className="text-cyan-300">Melodic</span> · <span className="text-amber-300">Snare</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1 font-mono text-[9px]">
                    <button
                      type="button"
                      disabled={!deckBTrack}
                      onClick={() => {
                        setDeckBScratchEnabled((v) => !v);
                        if (deckBGridEditorOpen) setDeckBGridEditorOpen(false);
                      }}
                      title="Toggle Vinyl Scratch mode on Deck B waveform"
                      className={`px-1.5 py-0.5 rounded font-sans font-semibold border flex items-center gap-1 cursor-pointer disabled:opacity-35 ${
                        deckBScratchEnabled && !deckBGridEditorOpen
                          ? 'bg-amber-400/20 text-amber-200 border-amber-400/45'
                          : 'bg-[#090b10] hover:bg-white/[0.08] text-slate-400 border-white/[0.1]'
                      }`}
                    >
                      <Disc3 className="w-2.5 h-2.5" />
                      <span>Scratch</span>
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack || !deckBScratchEnabled}
                      onClick={() => setDeckBSlipMode((v) => !v)}
                      title="Slip Mode: background beat clock keeps running while scratching and snaps back on release"
                      className={`px-1.5 py-0.5 rounded font-sans font-medium border cursor-pointer disabled:opacity-35 ${
                        deckBSlipMode
                          ? 'bg-fuchsia-500/25 text-fuchsia-200 border-fuchsia-400/45'
                          : 'bg-[#090b10] hover:bg-white/[0.08] text-slate-400 border-white/[0.1]'
                      }`}
                    >
                      Slip
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack || deckBTrack.beatGridLocked}
                      onClick={() => handleShiftDeckBeatGrid('B', -2)}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                    >
                      -2ms
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack || deckBTrack.beatGridLocked}
                      onClick={() => handleSetDeckDownbeatHere('B')}
                      className="px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/30 font-sans font-medium cursor-pointer disabled:opacity-35"
                    >
                      Set 1.1
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack || deckBTrack.beatGridLocked}
                      onClick={() => handleShiftDeckBeatGrid('B', 2)}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                    >
                      +2ms
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack}
                      onClick={() => {
                        setDeckBGridEditorOpen((open) => {
                          const next = !open;
                          if (next) {
                            setDeckBWaveformView('zoom');
                            setDeckBWaveformZoomPct((z) => (z < 45 ? 55 : z));
                          }
                          return next;
                        });
                      }}
                      className={`px-2 py-0.5 rounded font-sans font-semibold border flex items-center gap-1 cursor-pointer disabled:opacity-35 ${
                        deckBGridEditorOpen
                          ? 'bg-amber-400 text-[#090b10] border-amber-300'
                          : 'bg-[#090b10] hover:bg-white/[0.08] text-slate-200 border-white/[0.12]'
                      }`}
                    >
                      <Sliders className="w-2.5 h-2.5" />
                      <span>Edit Grid</span>
                    </button>
                  </div>
                </div>

                {/* Deck B Transient Zoom Slider & Tight Loop/Cue Strip */}
                <div className="bg-[#090b10] border border-white/[0.07] rounded-lg px-2 py-1 flex flex-wrap items-center gap-2 text-[9.5px]">
                  <div className="flex items-center gap-1 flex-1 min-w-[140px]">
                    <button
                      type="button"
                      disabled={!deckBTrack || deckBWaveformZoomPct <= 0}
                      onClick={() => {
                        const next = Math.max(0, deckBWaveformZoomPct - 15);
                        setDeckBWaveformZoomPct(next);
                        setDeckBWaveformView(next > 0 ? 'zoom' : 'overview');
                      }}
                      title="Zoom out waveform"
                      className="p-0.5 rounded text-slate-400 hover:text-amber-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ZoomOut className="w-3 h-3" />
                    </button>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      disabled={!deckBTrack}
                      value={deckBWaveformZoomPct}
                      aria-label="Deck B waveform transient zoom"
                      onChange={(e) => {
                        const next = parseInt(e.target.value, 10);
                        setDeckBWaveformZoomPct(next);
                        setDeckBWaveformView(next > 0 ? 'zoom' : 'overview');
                      }}
                      className="w-full accent-amber-400 cursor-pointer disabled:opacity-40"
                    />
                    <button
                      type="button"
                      disabled={!deckBTrack || deckBWaveformZoomPct >= 100}
                      onClick={() => {
                        const next = Math.min(100, deckBWaveformZoomPct + 15);
                        setDeckBWaveformZoomPct(next);
                        setDeckBWaveformView('zoom');
                      }}
                      title="Zoom in onto transients"
                      className="p-0.5 rounded text-slate-400 hover:text-amber-200 disabled:opacity-30 cursor-pointer"
                    >
                      <ZoomIn className="w-3 h-3" />
                    </button>
                    <span className="font-mono tabular-nums text-amber-300 w-16 text-right shrink-0">
                      {!deckBTrack || deckBWaveformZoomPct === 0
                        ? 'Full'
                        : (() => {
                            const span = computeWaveformZoomSpanSec(deckBTrack, deckBWaveformZoomPct);
                            const beats = span / (60 / Math.max(40, getEffectiveBpm(deckBTrack)));
                            return span < 1.5
                              ? `${Math.round(span * 1000)}ms`
                              : `${beats.toFixed(1)}B`;
                          })()}
                    </span>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {(
                      [
                        { label: 'Full', pct: 0 },
                        { label: '8B', pct: 45 },
                        { label: '2B', pct: 74 },
                        { label: '0.5B', pct: 100 },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={!deckBTrack}
                        onClick={() => {
                          setDeckBWaveformZoomPct(preset.pct);
                          setDeckBWaveformView(preset.pct > 0 ? 'zoom' : 'overview');
                        }}
                        className={`px-1 py-0.5 rounded font-mono text-[8.5px] border cursor-pointer disabled:opacity-35 ${
                          Math.abs(deckBWaveformZoomPct - preset.pct) <= 3
                            ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                            : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={!deckBTrack}
                      onClick={() => {
                        if (deckBTransientSeek) {
                          setDeckBTransientSeek(false);
                          if (!syncToBeatGrid) setSyncToBeatGrid(true);
                          handleSnapDeckPlayheadToBeatGrid('B');
                        } else {
                          setDeckBTransientSeek(true);
                        }
                      }}
                      title="Toggle Beat-Grid quantized waveform seeking vs Free Millisecond seeking"
                      className={`px-1.5 py-0.5 rounded font-mono text-[8.5px] border cursor-pointer disabled:opacity-35 ${
                        deckBTransientSeek || !syncToBeatGrid
                          ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                          : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                      }`}
                    >
                      {deckBTransientSeek || !syncToBeatGrid ? 'Free ms' : 'Beat Snap'}
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack}
                      onClick={() => {
                        setCueManagerDeck('B');
                        handlePlaceCuePoint(
                          'B',
                          `Cue ${(deckBTrack?.cuePoints?.length ?? 0) + 1}`,
                          deckBTime,
                          '#f59e0b'
                        );
                      }}
                      title="Set tight cue marker at exact zoomed playhead"
                      className="px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 font-semibold cursor-pointer disabled:opacity-35"
                    >
                      + Cue
                    </button>
                  </div>
                </div>

                {/* Deck B Track Alignment Nudge Bar (+/- 5ms, +/- 10ms) */}
                <div className="bg-[#090b10] border border-white/[0.07] rounded-lg px-2 py-1 flex flex-wrap items-center justify-between gap-2 text-[9.5px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-300 whitespace-nowrap">
                      Nudge Align
                    </span>
                    <span
                      className={`font-mono tabular-nums whitespace-nowrap ${
                        Math.abs(deckBNudgeMs) >= 0.5
                          ? 'text-amber-300 font-semibold'
                          : 'text-slate-500'
                      }`}
                    >
                      {deckBNudgeMs >= 0 ? '+' : ''}
                      {deckBNudgeMs.toFixed(0)}ms
                    </span>
                    {deckBPhaseInfo && (
                      <span className="font-mono tabular-nums text-[9px] text-slate-400 whitespace-nowrap hidden sm:inline">
                        · Beat {deckBPhaseInfo.phaseMs >= 0 ? '+' : ''}
                        {deckBPhaseInfo.phaseMs.toFixed(1)}ms
                      </span>
                    )}
                    {Math.abs(deckBNudgeMs) >= 0.5 && (
                      <button
                        type="button"
                        disabled={!deckBTrack}
                        onClick={() =>
                          handleNudgeTrackAlignment('B', -deckBNudgeMs, { resetCounter: true })
                        }
                        title="Revert cumulative track alignment nudge back to 0ms"
                        className="px-1 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-[8.5px] font-mono text-slate-300 cursor-pointer"
                      >
                        0ms
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                    <button
                      type="button"
                      disabled={!deckBTrack}
                      onClick={() => handleSnapDeckPlayheadToBeatGrid('B')}
                      title="Snap Deck B playhead immediately to the nearest beat marker"
                      className="px-1.5 py-0.5 rounded text-[9px] font-sans font-semibold border bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/35 flex items-center gap-1 cursor-pointer disabled:opacity-35 mr-1"
                    >
                      <Magnet className="w-2.5 h-2.5" />
                      <span>Snap Beat</span>
                    </button>
                    {([-10, -5, 5, 10] as const).map((ms) => {
                      const isActiveFlash = deckBNudgeFlash?.deltaMs === ms;
                      return (
                        <button
                          key={ms}
                          type="button"
                          disabled={!deckBTrack}
                          onClick={() => handleNudgeTrackAlignment('B', ms)}
                          aria-label={`Nudge Deck B track alignment by ${ms > 0 ? `+${ms}` : ms} milliseconds`}
                          title={`Micro-adjust Deck B track alignment by ${ms > 0 ? `+${ms}` : ms}ms`}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border transition-colors cursor-pointer disabled:opacity-35 ${
                            isActiveFlash
                              ? 'bg-amber-400 text-[#090b10] border-amber-300'
                              : 'bg-white/[0.05] hover:bg-amber-500/20 text-slate-200 hover:text-amber-200 border-white/[0.09]'
                          }`}
                        >
                          {ms > 0 ? `+${ms}ms` : `${ms}ms`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <TriBandWaveformCanvas
                  track={deckBTrack}
                  playheadSec={deckBTime}
                  accentHex="#f59e0b"
                  cueTimeSec={deckBInTime ?? 0}
                  cueLabel="MIX IN"
                  showBeatGrid={showBeatGridOverlay}
                  beatGridSubdivision={beatGridSubdivision}
                  viewMode={deckBWaveformView}
                  zoomPct={deckBWaveformZoomPct}
                  freeTransientSeek={deckBTransientSeek}
                  syncToBeatGrid={syncToBeatGrid}
                  nudgeAccumMs={deckBNudgeMs}
                  nudgeFlash={deckBNudgeFlash}
                  harmonicCompatibility={deckATrack && deckBTrack ? harmonicComparison : null}
                  spectrogramMode={spectrogramMode}
                  loopWindowStartSec={
                    deckBTrack && deckBLoopBeats > 0
                      ? deckBChainRef.current?.offsetSec ?? deckBTime
                      : null
                  }
                  loopWindowEndSec={
                    deckBTrack && deckBLoopBeats > 0
                      ? Math.min(
                          deckBTrack.duration,
                          (deckBChainRef.current?.offsetSec ?? deckBTime) +
                            (60 / Math.max(40, getEffectiveBpm(deckBTrack))) * deckBLoopBeats
                        )
                      : null
                  }
                  isGridEditMode={deckBGridEditorOpen}
                  isScratchMode={!deckBGridEditorOpen && deckBScratchEnabled}
                  isScratching={deckBScratching}
                  scratchRate={deckBScratchRate}
                  scratchSensitivitySec={scratchSensitivitySec}
                  masterBeatClockRef={masterBeatClockRef}
                  registerBeatPulseDraw={registerBeatPulseDraw}
                  onDragBeatGridMs={(deltaMs) => handleShiftDeckBeatGrid('B', deltaMs, true)}
                  onScratchStart={() => void startDeckScratch('B')}
                  onScratchMove={(deltaSec, velocityRate) =>
                    moveDeckScratch('B', deltaSec, velocityRate)
                  }
                  onScratchEnd={() => endDeckScratch('B')}
                  onSeekOrCue={(t) => {
                    setDeckBTime(t);
                    setDeckBInTime(t);
                    if (deckBPlaying) void startLiveDeckFromTime('B', t);
                  }}
                />

                {deckBGridEditorOpen && deckBTrack && (
                  <div className="bg-[#090b10] border border-amber-400/30 rounded-lg p-2 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-200">
                          Visual Beat-Grid Editor
                        </span>
                        <span className="font-mono tabular-nums text-amber-300">
                          Offset {(deckBTrack.beatGridOffsetMs ?? 0) >= 0 ? '+' : ''}
                          {(deckBTrack.beatGridOffsetMs ?? 0).toFixed(1)} ms
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deckBTrack.beatGridLocked}
                          onClick={() => handleSnapGridToTransient('B')}
                          className="px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/35 text-[9px] font-semibold cursor-pointer disabled:opacity-35"
                        >
                          Snap Peak
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleDeckGridLock('B')}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border flex items-center gap-0.5 cursor-pointer ${
                            deckBTrack.beatGridLocked
                              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200'
                              : 'bg-white/[0.05] border-white/[0.1] text-slate-300'
                          }`}
                        >
                          {deckBTrack.beatGridLocked ? (
                            <Lock className="w-2.5 h-2.5" />
                          ) : (
                            <Unlock className="w-2.5 h-2.5" />
                          )}
                          <span>{deckBTrack.beatGridLocked ? 'Locked' : 'Lock'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetDeckBeatGrid('B')}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 text-[9px] cursor-pointer"
                        >
                          Reset
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-slate-500 shrink-0">-250ms</span>
                      <input
                        type="range"
                        min={-250}
                        max={250}
                        step={0.5}
                        disabled={deckBTrack.beatGridLocked}
                        value={Math.max(-250, Math.min(250, deckBTrack.beatGridOffsetMs ?? 0))}
                        onChange={(e) =>
                          handleSetDeckGridOffsetMs('B', parseFloat(e.target.value))
                        }
                        aria-label="Deck B beat grid phase offset in milliseconds"
                        className="w-full accent-amber-400 cursor-pointer disabled:opacity-40"
                      />
                      <span className="text-[9px] font-mono text-slate-500 shrink-0">+250ms</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1.5 text-[9px] font-mono tabular-nums">
                      <div className="flex flex-wrap items-center gap-1">
                        {([-20, -5, -1, 1, 5, 20] as const).map((ms) => (
                          <button
                            key={ms}
                            type="button"
                            disabled={deckBTrack.beatGridLocked}
                            onClick={() => handleShiftDeckBeatGrid('B', ms)}
                            className="px-1.5 py-0.5 rounded bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 cursor-pointer disabled:opacity-35"
                          >
                            {ms > 0 ? `+${ms}ms` : `${ms}ms`}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={deckBTrack.beatGridLocked}
                          onClick={() => handleCycleDeckDownbeat('B', -1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          1.1 -1B
                        </button>
                        <button
                          type="button"
                          disabled={deckBTrack.beatGridLocked}
                          onClick={() => handleCycleDeckDownbeat('B', 1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          1.1 +1B
                        </button>
                        <span className="text-slate-600 mx-0.5">|</span>
                        <button
                          type="button"
                          disabled={deckBTrack.beatGridLocked}
                          onClick={() => handleFineBpmAdjust('B', -0.1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          -0.1
                        </button>
                        <span className="text-amber-300 px-1">{deckBTrack.bpm.toFixed(1)}</span>
                        <button
                          type="button"
                          disabled={deckBTrack.beatGridLocked}
                          onClick={() => handleFineBpmAdjust('B', 0.1)}
                          className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.12] text-slate-300 cursor-pointer disabled:opacity-35"
                        >
                          +0.1
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Deck B Instant Hot Cue Jump Bar */}
              <div className="flex flex-wrap items-center gap-1 bg-[#090b10] border border-white/[0.07] rounded-lg px-2 py-1.5">
                <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 mr-0.5 flex items-center gap-1">
                  <Bookmark className="w-2.5 h-2.5" />
                  <span>Hot Cues</span>
                </span>
                {(deckBTrack?.cuePoints ?? []).map((cue) => (
                  <button
                    key={cue.id}
                    type="button"
                    onClick={() => handleJumpToCuePoint('B', cue)}
                    style={{ borderColor: `${cue.color}66` }}
                    className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.05] hover:bg-white/[0.12] text-slate-100 border flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span
                      style={{ backgroundColor: cue.color }}
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                    />
                    <span>{cue.label}</span>
                    <span className="font-mono text-[9px] text-slate-400">
                      {formatDjClock(cue.timeSec)}
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!deckBTrack}
                  onClick={() => {
                    setCueManagerDeck('B');
                    handlePlaceCuePoint(
                      'B',
                      `Cue ${(deckBTrack?.cuePoints?.length ?? 0) + 1}`,
                      deckBTime,
                      '#f59e0b'
                    );
                  }}
                  title="Stamp cue marker at Deck B playhead"
                  className="ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/35 flex items-center gap-0.5 cursor-pointer disabled:opacity-35"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span>Stamp</span>
                </button>
              </div>

              {/* Deck B EQ + Filter + Pitch */}
              <div className="grid grid-cols-5 gap-2 bg-[#090b10] border border-white/[0.07] rounded-lg p-2">
                {(
                  [
                    { label: 'LOW', val: eqB.lowGainDb, min: -18, max: 9, step: 1, onChange: (v: number) => setEqB((p) => ({ ...p, lowGainDb: v })) },
                    { label: 'MID', val: eqB.midGainDb, min: -18, max: 9, step: 1, onChange: (v: number) => setEqB((p) => ({ ...p, midGainDb: v })) },
                    { label: 'HIGH', val: eqB.highGainDb, min: -18, max: 9, step: 1, onChange: (v: number) => setEqB((p) => ({ ...p, highGainDb: v })) },
                    { label: 'FILTER', val: eqB.filterSweep, min: -1, max: 1, step: 0.05, onChange: (v: number) => setEqB((p) => ({ ...p, filterSweep: v })) },
                    { label: 'PITCH', val: deckBPitchPct, min: -16, max: 16, step: 0.5, onChange: (v: number) => setDeckBPitchPct(v) },
                  ]
                ).map((ctrl) => (
                  <label key={ctrl.label} className="flex flex-col items-center gap-1">
                    <span className="text-[9px] font-semibold text-slate-400">{ctrl.label}</span>
                    <input
                      type="range"
                      min={ctrl.min}
                      max={ctrl.max}
                      step={ctrl.step}
                      value={ctrl.val}
                      onChange={(e) => ctrl.onChange(parseFloat(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                    <span className="text-[9px] font-mono tabular-nums text-amber-300">
                      {ctrl.label === 'PITCH' ? `${ctrl.val >= 0 ? '+' : ''}${ctrl.val}%` : ctrl.val.toFixed(ctrl.step < 1 ? 1 : 0)}
                    </span>
                  </label>
                ))}
              </div>

              {/* Deck B Lyrics & Mix-In Cue Drawer */}
              <div className="bg-[#090b10] border border-white/[0.07] rounded-lg p-2 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold text-slate-300 flex items-center gap-1">
                    <FileText className="w-3 h-3 text-amber-400" />
                    <span>Deck B Lyric Cues ({deckBTrack?.lyrics.length ?? 0})</span>
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!deckBTrack}
                      onClick={() => deckBLyricInputRef.current?.click()}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-slate-300 cursor-pointer disabled:opacity-40"
                    >
                      .LRC/.TXT
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack}
                      onClick={() => {
                        setLyricDrawerDeck('B');
                        setLyricDraftText(
                          deckBTrack?.lyrics.map((l) => l.text).join('\n') ?? ''
                        );
                      }}
                      className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-[10px] text-slate-300 cursor-pointer disabled:opacity-40"
                    >
                      Paste
                    </button>
                    <button
                      type="button"
                      disabled={!deckBTrack || deckBTrack.lyrics.length === 0}
                      onClick={() => handleSnapDeckLyricsToBeats('B')}
                      className="px-1.5 py-0.5 rounded bg-amber-500/15 hover:bg-amber-500/25 text-[10px] text-amber-200 cursor-pointer disabled:opacity-40"
                    >
                      Snap Beats
                    </button>
                  </div>
                </div>
                {deckBTrack && deckBTrack.lyrics.length > 0 ? (
                  <div className="max-h-20 overflow-y-auto space-y-0.5 pr-1">
                    {deckBTrack.lyrics.map((line) => {
                      const isSelected = deckBInLyricId === line.id;
                      return (
                        <button
                          key={line.id}
                          type="button"
                          onClick={() => {
                            const targetSec =
                              syncToBeatGrid && deckBTrack
                                ? snapTimeToTrackBeatGrid(deckBTrack, line.time)
                                : line.time;
                            setDeckBInLyricId(line.id);
                            setDeckBInTime(targetSec);
                            setTriggerMode('lyrics');
                            setDeckBTime(targetSec);
                            if (deckBPlaying) void startLiveDeckFromTime('B', targetSec);
                          }}
                          className={`w-full text-left px-2 py-0.5 rounded text-[11px] flex items-center justify-between gap-2 cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500/25 text-amber-100 border border-amber-400/40'
                              : 'hover:bg-white/[0.05] text-slate-300'
                          }`}
                        >
                          <span className="truncate">{line.text}</span>
                          <span className="text-[9px] font-mono tabular-nums text-slate-400 shrink-0">
                            {isSelected ? 'MIX IN @ ' : ''}
                            {formatDjClock(line.time)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-[10px] text-slate-500">
                    Load .lrc / plain text lyrics to align Deck B vocal entry onto Deck A&apos;s mix-out.
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* FILTER & FX RACK: BPM-Synced Auto-Filter Sweep, Ping-Pong Beat Delay & Beat Gater (MIDI-Mappable) */}
          <div className="bg-[#121620] border border-fuchsia-400/25 rounded-xl p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500/25 to-cyan-500/20 border border-fuchsia-400/35 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-fuchsia-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-100 flex flex-wrap items-center gap-2">
                    <span>Filter &amp; FX Rack · BPM Auto-Sync</span>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/15 border border-cyan-400/35 text-[9.5px] font-mono font-bold text-cyan-200 tabular-nums">
                      {detectedMasterBpm.toFixed(1)} BPM {fxBpmSyncEnabled ? 'LOCKED' : 'FREE'}
                    </span>
                    {(fxAutoFilterDepth > 0.02 ||
                      fxFilterCutoff < 0.96 ||
                      fxDelayMix > 0.02 ||
                      fxBeatGateDepth > 0.02 ||
                      Math.abs(fxTransientAttack) > 0.02 ||
                      Math.abs(fxTransientSustain) > 0.02 ||
                      fxTransientDither > 0.02 ||
                      fxNoiseGateThreshold > -79) &&
                      !fxBypassed && (
                        <span className="px-1.5 py-0.5 rounded bg-fuchsia-500/20 border border-fuchsia-400/40 text-[9px] font-mono font-bold text-fuchsia-200">
                          FX ACTIVE
                        </span>
                      )}
                  </h3>
                  <p className="text-[10px] text-slate-400 truncate">
                    Auto-syncs filter LFO sweeps, stereo ping-pong delay, transient shaper, and rhythmic gate · All knobs MIDI-mappable
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setFxBpmSyncEnabled((v) => !v)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer flex items-center gap-1 ${
                    fxBpmSyncEnabled
                      ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {fxBpmSyncEnabled ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  <span>BPM Sync</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFxBypassed((v) => !v)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                    fxBypassed
                      ? 'bg-rose-500/20 border-rose-400/45 text-rose-200'
                      : 'bg-emerald-500/15 border-emerald-400/35 text-emerald-200'
                  }`}
                >
                  {fxBypassed ? 'FX Bypassed' : 'FX Engaged'}
                </button>

                <button
                  type="button"
                  onClick={handleResetFxRack}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 border border-white/[0.08] cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenMidiMapping}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-fuchsia-500/20 hover:bg-fuchsia-500/30 text-fuchsia-200 border border-fuchsia-400/40 cursor-pointer flex items-center gap-1"
                >
                  <Cable className="w-3 h-3" />
                  <span>Map MIDI FX</span>
                </button>
              </div>
            </div>

            {/* Quick DJ FX Presets Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                  FX Macros:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFxBypassed(false);
                    setFxFilterMode('lowpass');
                    setFxBpmSyncEnabled(true);
                    setFxFilterLfoBeats(2);
                    onUpdateSettings({
                      djFilterCutoff: 0.72,
                      djFilterResonance: 4.8,
                      djAutoFilterDepth: 0.75,
                    });
                  }}
                  className="px-2 py-0.5 rounded bg-[#090b10] hover:bg-fuchsia-500/15 border border-white/[0.08] hover:border-fuchsia-400/40 text-[10px] text-slate-200 cursor-pointer"
                >
                  2-Beat LPF Sweep
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFxBypassed(false);
                    setFxBpmSyncEnabled(true);
                    setFxDelayBeats(0.5);
                    onUpdateSettings({
                      djDelayMix: 0.45,
                      djDelayFeedback: 0.55,
                    });
                  }}
                  className="px-2 py-0.5 rounded bg-[#090b10] hover:bg-cyan-500/15 border border-white/[0.08] hover:border-cyan-400/40 text-[10px] text-slate-200 cursor-pointer"
                >
                  1/2 Beat Dub Echo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFxBypassed(false);
                    setFxBpmSyncEnabled(true);
                    setFxFilterLfoBeats(4);
                    setFxGateBeats(0.5);
                    onUpdateSettings({
                      djFilterCutoff: 0.65,
                      djFilterResonance: 5.5,
                      djAutoFilterDepth: 0.6,
                      djDelayMix: 0.3,
                      djDelayFeedback: 0.45,
                      djBeatGateDepth: 0.5,
                    });
                  }}
                  className="px-2 py-0.5 rounded bg-[#090b10] hover:bg-amber-500/15 border border-white/[0.08] hover:border-amber-400/40 text-[10px] text-slate-200 cursor-pointer"
                >
                  Festival Build Pump
                </button>
              </div>
              <span className="text-[10px] font-mono tabular-nums text-slate-400">
                Delay Time: {Math.round(computedFxDelaySec * 1000)} ms · LFO:{' '}
                {(fxBpmSyncEnabled
                  ? detectedMasterBpm / 60 / fxFilterLfoBeats
                  : 0.5 / fxFilterLfoBeats
                ).toFixed(2)}{' '}
                Hz
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2.5">
              {/* Module 1: Low-Pass / High-Pass Filter Sweep & BPM Auto-LFO */}
              <div className="bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-fuchsia-300">
                    1 · Filter Sweep &amp; Auto-LFO
                  </span>
                  <div className="flex items-center gap-1">
                    {(['lowpass', 'highpass'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setFxFilterMode(mode)}
                        className={`px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold uppercase cursor-pointer border ${
                          fxFilterMode === mode
                            ? 'bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-200'
                            : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                        }`}
                      >
                        {mode === 'lowpass' ? 'LPF' : 'HPF'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter Cutoff */}
                <label className="block space-y-1">
                  <div className="flex items-center justify-between gap-1.5 text-[10px]">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>{fxFilterMode === 'lowpass' ? 'LPF Cutoff' : 'HPF Cutoff'}</span>
                      {midiMappingBadges?.djFilterCutoff && (
                        <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                          {midiMappingBadges.djFilterCutoff}
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-fuchsia-300">
                      {fxFilterCutoff >= 0.98
                        ? 'Open'
                        : (() => {
                            const hz =
                              fxFilterMode === 'lowpass'
                                ? Math.round(160 * Math.pow(112.5, fxFilterCutoff))
                                : Math.round(30 * Math.pow(160, 1 - fxFilterCutoff));
                            return hz >= 1000 ? `${(hz / 1000).toFixed(1)} kHz` : `${hz} Hz`;
                          })()}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.02}
                    value={fxFilterCutoff}
                    onChange={(e) =>
                      onUpdateSettings({ djFilterCutoff: parseFloat(e.target.value) })
                    }
                    className="w-full accent-fuchsia-400 cursor-pointer"
                  />
                </label>

                {/* Filter Resonance (Q) */}
                <label className="block space-y-1">
                  <div className="flex items-center justify-between gap-1.5 text-[10px]">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>Resonance (Q)</span>
                      {midiMappingBadges?.djFilterResonance && (
                        <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                          {midiMappingBadges.djFilterResonance}
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      Q {fxFilterResonance.toFixed(1)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.7}
                    max={12}
                    step={0.1}
                    value={fxFilterResonance}
                    onChange={(e) =>
                      onUpdateSettings({ djFilterResonance: parseFloat(e.target.value) })
                    }
                    className="w-full accent-fuchsia-400 cursor-pointer"
                  />
                </label>

                {/* BPM Auto-Sweep LFO Depth & Beat Cycle */}
                <div className="space-y-1.5 pt-0.5 border-t border-white/[0.06]">
                  <label className="block space-y-1">
                    <div className="flex items-center justify-between gap-1.5 text-[10px]">
                      <span className="text-slate-300 font-medium flex items-center gap-1.5">
                        <span>BPM Auto-Sweep LFO</span>
                        {midiMappingBadges?.djAutoFilterDepth && (
                          <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                            {midiMappingBadges.djAutoFilterDepth}
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-fuchsia-300">
                        {fxAutoFilterDepth === 0
                          ? 'Off'
                          : `${Math.round(fxAutoFilterDepth * 100)}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={fxAutoFilterDepth}
                      onChange={(e) =>
                        onUpdateSettings({ djAutoFilterDepth: parseFloat(e.target.value) })
                      }
                      className="w-full accent-fuchsia-400 cursor-pointer"
                    />
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {FX_FILTER_LFO_DIVISIONS.map((div) => (
                      <button
                        key={div.beats}
                        type="button"
                        onClick={() => setFxFilterLfoBeats(div.beats)}
                        className={`py-0.5 rounded text-[9.5px] font-mono font-semibold cursor-pointer border ${
                          fxFilterLfoBeats === div.beats
                            ? 'bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-100'
                            : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white'
                        }`}
                      >
                        {div.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Module 2: Beat-Synced Ping-Pong Delay */}
              <div className="bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                    2 · Beat-Synced Ping-Pong Delay
                  </span>
                  <button
                    type="button"
                    onClick={handleClearFxDelayTail}
                    className="px-1.5 py-0.5 rounded bg-white/[0.05] hover:bg-rose-500/20 border border-white/[0.08] hover:border-rose-400/40 text-[9.5px] text-slate-300 hover:text-rose-200 cursor-pointer"
                  >
                    Kill Tail
                  </button>
                </div>

                {/* Beat Division Selector OR Manual ms */}
                {fxBpmSyncEnabled ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span>Sync Division ({detectedMasterBpm.toFixed(0)} BPM)</span>
                      <span className="font-mono tabular-nums text-cyan-300">
                        {Math.round(computedFxDelaySec * 1000)} ms
                      </span>
                    </div>
                    <div className="grid grid-cols-6 gap-1">
                      {FX_DELAY_DIVISIONS.map((div) => (
                        <button
                          key={div.beats}
                          type="button"
                          onClick={() => setFxDelayBeats(div.beats)}
                          className={`py-1 rounded text-[9.5px] font-mono font-semibold cursor-pointer border ${
                            fxDelayBeats === div.beats
                              ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-100'
                              : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white'
                          }`}
                        >
                          {div.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <label className="block space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300 font-medium">Manual Delay Time</span>
                      <span className="font-mono tabular-nums text-cyan-300">
                        {fxManualDelayMs} ms
                      </span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={1500}
                      step={10}
                      value={fxManualDelayMs}
                      onChange={(e) => setFxManualDelayMs(parseInt(e.target.value, 10))}
                      className="w-full accent-cyan-400 cursor-pointer"
                    />
                  </label>
                )}

                {/* Delay Wet Mix */}
                <label className="block space-y-1">
                  <div className="flex items-center justify-between gap-1.5 text-[10px]">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>Delay Wet Mix</span>
                      {midiMappingBadges?.djDelayMix && (
                        <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                          {midiMappingBadges.djDelayMix}
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {fxDelayMix === 0 ? 'Dry' : `${Math.round(fxDelayMix * 100)}%`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={fxDelayMix}
                    onChange={(e) =>
                      onUpdateSettings({ djDelayMix: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </label>

                {/* Delay Feedback */}
                <label className="block space-y-1">
                  <div className="flex items-center justify-between gap-1.5 text-[10px]">
                    <span className="text-slate-300 font-medium flex items-center gap-1.5">
                      <span>Echo Feedback</span>
                      {midiMappingBadges?.djDelayFeedback && (
                        <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                          {midiMappingBadges.djDelayFeedback}
                        </span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums text-slate-300">
                      {Math.round(fxDelayFeedback * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.85}
                    step={0.05}
                    value={fxDelayFeedback}
                    onChange={(e) =>
                      onUpdateSettings({ djDelayFeedback: parseFloat(e.target.value) })
                    }
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </label>
              </div>

              {/* Module 3: BPM Beat Gater, Noise Gate & MIDI Controller Map Summary */}
              <div className="bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 flex flex-col justify-between space-y-2">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
                      3 · Beat Gater &amp; Noise Gate
                    </span>
                    <span className="text-[9.5px] font-mono text-amber-200/80">
                      {(fxBpmSyncEnabled
                        ? detectedMasterBpm / 60 / fxGateBeats
                        : 2 / fxGateBeats
                      ).toFixed(2)}{' '}
                      Hz
                    </span>
                  </div>

                  <label className="block space-y-1">
                    <div className="flex items-center justify-between gap-1.5 text-[10px]">
                      <span className="text-slate-300 font-medium flex items-center gap-1.5">
                        <span>Rhythmic Gate / Pump</span>
                        {midiMappingBadges?.djBeatGateDepth && (
                          <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                            {midiMappingBadges.djBeatGateDepth}
                          </span>
                        )}
                      </span>
                      <span className="font-mono tabular-nums text-amber-300">
                        {fxBeatGateDepth === 0
                          ? 'Off'
                          : `${Math.round(fxBeatGateDepth * 100)}%`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={fxBeatGateDepth}
                      onChange={(e) =>
                        onUpdateSettings({ djBeatGateDepth: parseFloat(e.target.value) })
                      }
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </label>

                  <div className="grid grid-cols-4 gap-1">
                    {FX_GATE_DIVISIONS.map((div) => (
                      <button
                        key={div.beats}
                        type="button"
                        onClick={() => setFxGateBeats(div.beats)}
                        className={`py-1 rounded text-[9.5px] font-mono font-semibold cursor-pointer border ${
                          fxGateBeats === div.beats
                            ? 'bg-amber-500/25 border-amber-400/50 text-amber-100'
                            : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white'
                        }`}
                      >
                        {div.label}
                      </button>
                    ))}
                  </div>

                  {/* Noise Gate Threshold Control */}
                  <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5 text-[10px]">
                      <span
                        className="text-slate-300 font-medium flex items-center gap-1.5"
                        title="Automatically silences background hiss and silent gaps below threshold"
                      >
                        <span>Noise Gate Threshold</span>
                        {midiMappingBadges?.djNoiseGateThreshold && (
                          <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                            {midiMappingBadges.djNoiseGateThreshold}
                          </span>
                        )}
                      </span>
                      <div className="flex items-center gap-2">
                        <span ref={noiseGateBadgeRef} className="text-[9px] font-mono font-semibold text-slate-500">
                          {fxNoiseGateThreshold <= -79 ? 'BYPASS' : 'OPEN'}
                        </span>
                        <button
                          type="button"
                          onClick={() => onUpdateSettings({ djNoiseGateThreshold: -80 })}
                          title="Click to disable Noise Gate (-80 dBFS)"
                          className="font-mono tabular-nums text-rose-300 hover:text-rose-200 font-semibold cursor-pointer"
                        >
                          {formatNoiseGateThreshold(fxNoiseGateThreshold)}
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={-80}
                      max={-18}
                      step={1}
                      value={fxNoiseGateThreshold}
                      onChange={(e) => {
                        setFxBypassed(false);
                        onUpdateSettings({ djNoiseGateThreshold: parseInt(e.target.value, 10) });
                      }}
                      aria-label="Noise Gate Threshold"
                      className="w-full accent-rose-400 cursor-pointer"
                    />
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1">
                        {[
                          { label: 'Off', db: -80 },
                          { label: '-60dB', db: -60 },
                          { label: '-45dB', db: -45 },
                          { label: '-30dB', db: -30 },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            onClick={() => {
                              if (preset.db > -79) setFxBypassed(false);
                              onUpdateSettings({ djNoiseGateThreshold: preset.db });
                            }}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                              Math.round(fxNoiseGateThreshold) === preset.db
                                ? 'bg-rose-500/20 border-rose-400/45 text-rose-200 font-semibold'
                                : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>
                      <div className="w-16 h-1.5 rounded bg-white/[0.06] overflow-hidden" title="Noise Gate attenuation meter">
                        <div
                          ref={noiseGateGrBarRef}
                          className="h-full bg-rose-400 transition-[width] duration-75"
                          style={{ width: '0%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Live MIDI Assignments Summary */}
                <div className="pt-2 border-t border-white/[0.06] space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-400">Active FX MIDI Bindings</span>
                    <button
                      type="button"
                      onClick={onOpenMidiMapping}
                      className="text-cyan-300 hover:text-cyan-200 font-medium cursor-pointer"
                    >
                      Configure →
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { key: 'djFilterCutoff', short: 'Cutoff' },
                        { key: 'djFilterResonance', short: 'Res Q' },
                        { key: 'djAutoFilterDepth', short: 'AutoLFO' },
                        { key: 'djDelayMix', short: 'DelayMix' },
                        { key: 'djDelayFeedback', short: 'Feedback' },
                        { key: 'djBeatGateDepth', short: 'Gate' },
                        { key: 'djNoiseGateThreshold', short: 'NoiseGate' },
                        { key: 'djTransientAttack', short: 'Attack' },
                        { key: 'djTransientSustain', short: 'Sustain' },
                        { key: 'djTransientDither', short: 'Dither' },
                      ] as const
                    ).map((item) => {
                      const badge = midiMappingBadges?.[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={onOpenMidiMapping}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono border cursor-pointer ${
                            badge
                              ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200 font-semibold'
                              : 'bg-white/[0.03] border-white/[0.07] text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {item.short}: {badge ?? '—'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Module 4: Differential Envelope Transient Shaper (Drum Attack & Sustain) */}
            <div className="bg-[#090b10] border border-emerald-400/25 rounded-lg p-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
                    4 · Transient Shaper · Drum Attack &amp; Sustain
                  </span>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400">
                    {Math.abs(fxTransientAttack) < 0.02 &&
                    Math.abs(fxTransientSustain) < 0.02 &&
                    fxTransientDither < 0.02
                      ? 'Unity Bypass (0%)'
                      : `Att ${fxTransientAttack >= 0 ? '+' : ''}${Math.round(fxTransientAttack * 100)}% · Sus ${fxTransientSustain >= 0 ? '+' : ''}${Math.round(fxTransientSustain * 100)}% · Dither ${fxTransientDither < 0.01 ? 'Off' : `${Math.round(fxTransientDither * 100)}%`}`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {(['full', 'drums'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setFxTransientFocus(mode)}
                      title={
                        mode === 'full'
                          ? 'Full-spectrum transient detector (38 Hz HPF)'
                          : 'Drum-focused sidechain detector (>95 Hz kick snap & snare crack)'
                      }
                      className={`px-2 py-0.5 rounded text-[9.5px] font-semibold border cursor-pointer ${
                        fxTransientFocus === mode
                          ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                          : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode === 'full' ? 'Full Mix' : 'Drum Focus'}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        djTransientAttack: 0,
                        djTransientSustain: 0,
                        djTransientDither: 0,
                      })
                    }
                    className="px-2 py-0.5 rounded text-[9.5px] font-medium bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-slate-300 cursor-pointer"
                  >
                    Flat 0%
                  </button>
                </div>
              </div>

              {/* Drum Shaping Macros */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[9.5px] uppercase tracking-wider text-slate-500 font-semibold">
                  Drum Macros:
                </span>
                {[
                  { label: 'Punchy Kick', attack: 0.55, sustain: -0.15 },
                  { label: 'Tight Dry Kit', attack: 0.25, sustain: -0.65 },
                  { label: 'Snappy Room', attack: 0.4, sustain: 0.45 },
                  { label: 'Soft Percussion', attack: -0.5, sustain: 0.15 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setFxBypassed(false);
                      onUpdateSettings({
                        djTransientAttack: preset.attack,
                        djTransientSustain: preset.sustain,
                      });
                    }}
                    className="px-2 py-0.5 rounded bg-white/[0.03] hover:bg-emerald-500/15 border border-white/[0.08] hover:border-emerald-400/40 text-[10px] text-slate-200 cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                {/* Envelope Shaping Curve & Real-Time Attack/Sustain Gain Meters */}
                <div className="lg:col-span-5 bg-[#06080c] border border-white/[0.07] rounded-lg p-2 space-y-2">
                  <div className="relative w-full h-[64px]">
                    <svg
                      viewBox="0 0 240 68"
                      className="w-full h-full overflow-visible"
                      aria-label="Transient Shaper drum envelope curve"
                    >
                      <line x1="0" y1="58" x2="240" y2="58" stroke="rgba(148,163,184,0.18)" strokeWidth="1" />
                      <line x1="34" y1="6" x2="34" y2="58" stroke="rgba(52,211,153,0.22)" strokeDasharray="2 2" strokeWidth="1" />
                      <text x="8" y="13" fill="rgba(52,211,153,0.75)" fontSize="8" fontFamily="monospace">
                        ATTACK
                      </text>
                      <text x="108" y="13" fill="rgba(251,191,36,0.75)" fontSize="8" fontFamily="monospace">
                        SUSTAIN TAIL
                      </text>
                      {/* Dry Reference Envelope */}
                      <polyline
                        fill="none"
                        stroke="rgba(148,163,184,0.45)"
                        strokeWidth="1.25"
                        strokeDasharray="3 2.5"
                        points={transientCurve.dryPoints
                          .map((p) => `${(p.x * 240).toFixed(1)},${(58 - p.y * 42).toFixed(1)}`)
                          .join(' ')}
                      />
                      {/* Shaped Envelope Fill */}
                      <polygon
                        fill="rgba(52,211,153,0.14)"
                        points={`0,58 ${transientCurve.shapedPoints
                          .map((p) => `${(p.x * 240).toFixed(1)},${(58 - p.y * 42).toFixed(1)}`)
                          .join(' ')} 240,58`}
                      />
                      {/* Shaped Envelope Stroke */}
                      <polyline
                        fill="none"
                        stroke="#34d399"
                        strokeWidth="2"
                        strokeLinejoin="round"
                        points={transientCurve.shapedPoints
                          .map((p) => `${(p.x * 240).toFixed(1)},${(58 - p.y * 42).toFixed(1)}`)
                          .join(' ')}
                      />
                    </svg>
                  </div>

                  {/* Live Bi-Directional Gain Deflection Meters */}
                  <div className="grid grid-cols-2 gap-2 text-[9.5px] font-mono tabular-nums">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>ATT GAIN</span>
                        <span ref={transientAttackTextRef} className="text-emerald-300 font-semibold">
                          0.0 dB
                        </span>
                      </div>
                      <div className="relative h-1.5 rounded bg-white/[0.06] overflow-hidden">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25 z-10" />
                        <div
                          ref={transientAttackBarRef}
                          className="absolute top-0 bottom-0 bg-emerald-400 transition-[width,left] duration-75"
                          style={{ left: '50%', width: '0%' }}
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>SUS GAIN</span>
                        <span ref={transientSustainTextRef} className="text-amber-300 font-semibold">
                          0.0 dB
                        </span>
                      </div>
                      <div className="relative h-1.5 rounded bg-white/[0.06] overflow-hidden">
                        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/25 z-10" />
                        <div
                          ref={transientSustainBarRef}
                          className="absolute top-0 bottom-0 bg-amber-400 transition-[width,left] duration-75"
                          style={{ left: '50%', width: '0%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Independent Attack, Sustain & Dither Sliders */}
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="bg-[#121620] border border-white/[0.07] rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5 text-[10px]">
                      <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <span>Attack</span>
                        {midiMappingBadges?.djTransientAttack && (
                          <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                            {midiMappingBadges.djTransientAttack}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ djTransientAttack: 0 })}
                        title="Click to snap Attack back to 0%"
                        className="font-mono tabular-nums text-emerald-300 hover:text-emerald-200 font-semibold cursor-pointer"
                      >
                        {fxTransientAttack === 0
                          ? '0%'
                          : `${fxTransientAttack > 0 ? '+' : ''}${Math.round(fxTransientAttack * 100)}%`}
                      </button>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={fxTransientAttack}
                      onChange={(e) => {
                        setFxBypassed(false);
                        onUpdateSettings({ djTransientAttack: parseFloat(e.target.value) });
                      }}
                      className="w-full accent-emerald-400 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                      <span>Soften</span>
                      <span>0%</span>
                      <span>Snap</span>
                    </div>
                  </div>

                  <div className="bg-[#121620] border border-white/[0.07] rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5 text-[10px]">
                      <span className="text-slate-200 font-semibold flex items-center gap-1.5">
                        <span>Sustain</span>
                        {midiMappingBadges?.djTransientSustain && (
                          <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                            {midiMappingBadges.djTransientSustain}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ djTransientSustain: 0 })}
                        title="Click to snap Sustain back to 0%"
                        className="font-mono tabular-nums text-amber-300 hover:text-amber-200 font-semibold cursor-pointer"
                      >
                        {fxTransientSustain === 0
                          ? '0%'
                          : `${fxTransientSustain > 0 ? '+' : ''}${Math.round(fxTransientSustain * 100)}%`}
                      </button>
                    </div>
                    <input
                      type="range"
                      min={-1}
                      max={1}
                      step={0.05}
                      value={fxTransientSustain}
                      onChange={(e) => {
                        setFxBypassed(false);
                        onUpdateSettings({ djTransientSustain: parseFloat(e.target.value) });
                      }}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                      <span>Tighten</span>
                      <span>0%</span>
                      <span>Bloom</span>
                    </div>
                  </div>

                  <div className="bg-[#121620] border border-white/[0.07] rounded-lg p-2.5 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5 text-[10px]">
                      <span
                        className="text-slate-200 font-semibold flex items-center gap-1.5"
                        title="High-pass TPDF dither masks quantization & low-level truncation distortion during heavy transient shaping"
                      >
                        <span>Dither (TPDF)</span>
                        {midiMappingBadges?.djTransientDither && (
                          <span className="px-1 py-0.5 rounded bg-cyan-500/20 border border-cyan-400/40 text-[9px] font-mono text-cyan-200">
                            {midiMappingBadges.djTransientDither}
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateSettings({ djTransientDither: 0 })}
                        title="Click to disable TPDF dither"
                        className="font-mono tabular-nums text-sky-300 hover:text-sky-200 font-semibold cursor-pointer"
                      >
                        {formatTransientDitherReadout(fxTransientDither)}
                      </button>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={fxTransientDither}
                      onChange={(e) => {
                        setFxBypassed(false);
                        onUpdateSettings({ djTransientDither: parseFloat(e.target.value) });
                      }}
                      aria-label="Transient Shaper Dither Control"
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                      <span>Off</span>
                      <span>HP-TPDF</span>
                      <span>Max</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Module 5: Per-Deck 3-Band EQ Sliders & BPM-Calibrated Crossover Frequencies */}
            <div className="bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">
                    5 · Per-Deck 3-Band EQ &amp; BPM Auto-Calibrated Crossovers
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Sculpts Low, Mid, High shelves with crossover points tailored to each track&apos;s BPM
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCalibrateDeckCrossovers('both')}
                    className="px-2 py-1 rounded text-[10px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-400/35 text-cyan-200 cursor-pointer flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" />
                    <span>Auto-Calibrate Both</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEqA((p) => ({ ...p, lowGainDb: 0, midGainDb: 0, highGainDb: 0 }));
                      setEqB((p) => ({ ...p, lowGainDb: 0, midGainDb: 0, highGainDb: 0 }));
                    }}
                    className="px-2 py-1 rounded text-[10px] font-medium bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.09] text-slate-300 cursor-pointer"
                  >
                    Flat Both EQs
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
                {(
                  [
                    {
                      deck: 'A' as const,
                      eq: eqA,
                      setEq: setEqA,
                      autoXover: eqAAutoXover,
                      setAutoXover: setEqAAutoXover,
                      bpm: deckALiveBpm ?? detectedMasterBpm,
                      hasTrack: Boolean(deckATrack),
                      trackTitle: deckATrack?.title,
                      accentBorder: 'border-cyan-400/25',
                      accentText: 'text-cyan-300',
                      accentRange: 'accent-cyan-400',
                      activeBtn: 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200',
                    },
                    {
                      deck: 'B' as const,
                      eq: eqB,
                      setEq: setEqB,
                      autoXover: eqBAutoXover,
                      setAutoXover: setEqBAutoXover,
                      bpm: deckBLiveBpm ?? detectedMasterBpm,
                      hasTrack: Boolean(deckBTrack),
                      trackTitle: deckBTrack?.title,
                      accentBorder: 'border-amber-400/25',
                      accentText: 'text-amber-300',
                      accentRange: 'accent-amber-400',
                      activeBtn: 'bg-amber-500/20 border-amber-400/45 text-amber-200',
                    },
                  ] as const
                ).map((cfg) => {
                  const calibration = computeBpmCalibratedEqCrossovers(cfg.bpm);
                  const lowHz = cfg.eq.lowCrossoverHz ?? calibration.lowCrossoverHz;
                  const midHz = cfg.eq.midCenterHz ?? calibration.midCenterHz;
                  const highHz = cfg.eq.highCrossoverHz ?? calibration.highCrossoverHz;

                  return (
                    <div
                      key={cfg.deck}
                      className={`bg-[#121620] border ${cfg.accentBorder} rounded-lg p-2.5 space-y-2`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-100">
                            <span className={cfg.accentText}>Deck {cfg.deck} EQ</span>
                            <span className="text-[10px] font-mono tabular-nums text-slate-400">
                              {cfg.hasTrack ? `${cfg.bpm.toFixed(1)} BPM` : 'Master Ref'}
                              <span className="mx-1 text-slate-600">·</span>
                              {calibration.voicingLabel}
                            </span>
                          </div>
                          {cfg.trackTitle && (
                            <p className="text-[9.5px] text-slate-400 truncate">
                              {cfg.trackTitle}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              if (!cfg.autoXover) {
                                handleCalibrateDeckCrossovers(cfg.deck);
                              } else {
                                cfg.setAutoXover(false);
                              }
                            }}
                            title="Automatically tune Low, Mid, and High crossover points from track BPM"
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold border cursor-pointer flex items-center gap-1 ${
                              cfg.autoXover
                                ? cfg.activeBtn
                                : 'bg-white/[0.04] border-white/[0.09] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {cfg.autoXover ? (
                              <Lock className="w-2.5 h-2.5" />
                            ) : (
                              <Unlock className="w-2.5 h-2.5" />
                            )}
                            <span>{cfg.autoXover ? 'BPM Xover' : 'Manual Hz'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              cfg.setEq((prev) => ({
                                ...prev,
                                lowGainDb: 0,
                                midGainDb: 0,
                                highGainDb: 0,
                              }))
                            }
                            className="px-1.5 py-0.5 rounded text-[9.5px] bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 cursor-pointer"
                          >
                            Flat
                          </button>
                        </div>
                      </div>

                      {/* 3-Band EQ Sliders (Low / Mid / High) */}
                      <div className="grid grid-cols-3 gap-2">
                        {(
                          [
                            {
                              band: 'LOW',
                              field: 'lowGainDb' as const,
                              val: cfg.eq.lowGainDb,
                              freqLabel: `${lowHz} Hz`,
                            },
                            {
                              band: 'MID',
                              field: 'midGainDb' as const,
                              val: cfg.eq.midGainDb,
                              freqLabel:
                                midHz >= 1000 ? `${(midHz / 1000).toFixed(2)}k` : `${midHz} Hz`,
                            },
                            {
                              band: 'HIGH',
                              field: 'highGainDb' as const,
                              val: cfg.eq.highGainDb,
                              freqLabel: `${(highHz / 1000).toFixed(2)}k`,
                            },
                          ] as const
                        ).map((item) => {
                          const isKilled = item.val <= -17.5;
                          return (
                            <div
                              key={item.band}
                              className="bg-[#090b10] border border-white/[0.06] rounded-md p-2 space-y-1"
                            >
                              <div className="flex items-center justify-between text-[9.5px]">
                                <span className="font-bold text-slate-200">{item.band}</span>
                                <span className="font-mono text-slate-500">{item.freqLabel}</span>
                              </div>
                              <input
                                type="range"
                                min={-18}
                                max={9}
                                step={0.5}
                                value={item.val}
                                aria-label={`Deck ${cfg.deck} ${item.band} EQ gain`}
                                onChange={(e) => {
                                  const next = parseFloat(e.target.value);
                                  cfg.setEq((prev) => ({ ...prev, [item.field]: next }));
                                }}
                                className={`w-full ${cfg.accentRange} cursor-pointer`}
                              />
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`text-[10px] font-mono font-semibold tabular-nums ${
                                    isKilled
                                      ? 'text-rose-300'
                                      : item.val > 0
                                        ? cfg.accentText
                                        : 'text-slate-300'
                                  }`}
                                >
                                  {isKilled
                                    ? 'KILL'
                                    : `${item.val > 0 ? '+' : ''}${item.val.toFixed(1)} dB`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    cfg.setEq((prev) => ({
                                      ...prev,
                                      [item.field]: isKilled ? 0 : -18,
                                    }))
                                  }
                                  className={`px-1.5 py-0.5 rounded text-[8.5px] font-mono font-bold border cursor-pointer ${
                                    isKilled
                                      ? 'bg-rose-500/25 border-rose-400/50 text-rose-200'
                                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-rose-200'
                                  }`}
                                >
                                  Kill
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Crossover Frequency Sliders */}
                      <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.06]">
                        <label className="space-y-0.5">
                          <div className="flex items-center justify-between text-[9px] font-mono">
                            <span className="text-slate-400">LOW XOVER</span>
                            <span className={cfg.accentText}>{lowHz} Hz</span>
                          </div>
                          <input
                            type="range"
                            min={120}
                            max={380}
                            step={5}
                            value={lowHz}
                            aria-label={`Deck ${cfg.deck} Low crossover frequency`}
                            onChange={(e) => {
                              const hz = parseInt(e.target.value, 10);
                              cfg.setAutoXover(false);
                              cfg.setEq((prev) => ({ ...prev, lowCrossoverHz: hz }));
                            }}
                            className={`w-full ${cfg.accentRange} cursor-pointer`}
                          />
                        </label>

                        <label className="space-y-0.5">
                          <div className="flex items-center justify-between text-[9px] font-mono">
                            <span className="text-slate-400">MID PEAK</span>
                            <span className={cfg.accentText}>{midHz} Hz</span>
                          </div>
                          <input
                            type="range"
                            min={600}
                            max={2000}
                            step={10}
                            value={midHz}
                            aria-label={`Deck ${cfg.deck} Mid center frequency`}
                            onChange={(e) => {
                              const hz = parseInt(e.target.value, 10);
                              cfg.setAutoXover(false);
                              cfg.setEq((prev) => ({ ...prev, midCenterHz: hz }));
                            }}
                            className={`w-full ${cfg.accentRange} cursor-pointer`}
                          />
                        </label>

                        <label className="space-y-0.5">
                          <div className="flex items-center justify-between text-[9px] font-mono">
                            <span className="text-slate-400">HIGH XOVER</span>
                            <span className={cfg.accentText}>
                              {(highHz / 1000).toFixed(2)} kHz
                            </span>
                          </div>
                          <input
                            type="range"
                            min={2600}
                            max={6500}
                            step={25}
                            value={highHz}
                            aria-label={`Deck ${cfg.deck} High crossover frequency`}
                            onChange={(e) => {
                              const hz = parseInt(e.target.value, 10);
                              cfg.setAutoXover(false);
                              cfg.setEq((prev) => ({ ...prev, highCrossoverHz: hz }));
                            }}
                            className={`w-full ${cfg.accentRange} cursor-pointer`}
                          />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* MASTER OUTPUT BRICK-WALL LIMITER & AUTO PEAK-CALIBRATED GAIN */}
          <div className="bg-[#121620] border border-emerald-400/25 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/25 to-cyan-500/20 border border-emerald-400/35 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4 text-emerald-300" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-100 flex flex-wrap items-center gap-2">
                    <span>Master Brick-Wall Limiter · Anti-Clip &amp; Auto Peak Gain</span>
                    <span
                      ref={limiterStatusBadgeRef}
                      className={`px-1.5 py-0.5 rounded border text-[9px] font-mono font-bold ${
                        limiterEnabled
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          : 'bg-rose-500/15 border-rose-400/40 text-rose-200'
                      }`}
                    >
                      {limiterEnabled ? 'BRICK-WALL SAFE' : 'BYPASSED'}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 truncate">
                    Prevents clipping across overlapping decks, Loop Deck &amp; FX and auto-calibrates trim from the loudest mix-stack peak
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setLimiterEnabled((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer flex items-center gap-1 ${
                    limiterEnabled
                      ? 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                      : 'bg-rose-500/15 border-rose-400/35 text-rose-200'
                  }`}
                >
                  <ShieldCheck className="w-3 h-3" />
                  <span>{limiterEnabled ? 'Limiter ON' : 'Limiter OFF'}</span>
                </button>

                <button
                  type="button"
                  disabled={!limiterEnabled}
                  onClick={() => setLimiterAutoGainEnabled((v) => !v)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer disabled:opacity-40 flex items-center gap-1 ${
                    limiterAutoGainEnabled
                      ? 'bg-cyan-500/20 border-cyan-400/45 text-cyan-200'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Activity className="w-3 h-3" />
                  <span>Auto Peak-Gain</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    loudestStackPeakRef.current = mixStackBaselinePeak;
                    setLimiterPeakResetNonce((n) => n + 1);
                    setStatusMessage(
                      `Recalibrated mix-stack peak detector (${
                        mixStackBaselinePeak > 0.001
                          ? `${(20 * Math.log10(mixStackBaselinePeak)).toFixed(1)} dBFS`
                          : 'baseline'
                      }).`
                    );
                  }}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Calibrate Stack</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 items-stretch">
              {/* Ceiling & Release Controls */}
              <div className="lg:col-span-5 bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 space-y-2">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-300 font-medium">Brick-Wall Ceiling</span>
                    <span className="font-mono tabular-nums text-emerald-300">
                      {limiterCeilingDb.toFixed(1)} dBFS
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {LIMITER_CEILING_PRESETS.map((db) => (
                      <button
                        key={db}
                        type="button"
                        onClick={() => setLimiterCeilingDb(db)}
                        className={`py-1 rounded text-[9.5px] font-mono font-semibold border cursor-pointer ${
                          limiterCeilingDb === db
                            ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-100'
                            : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white'
                        }`}
                      >
                        {db.toFixed(1)} dB
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-slate-300 font-medium">Limiter Release</span>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round(limiterReleaseSec * 1000)} ms
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {LIMITER_RELEASE_PRESETS.map((rel) => (
                      <button
                        key={rel.sec}
                        type="button"
                        onClick={() => setLimiterReleaseSec(rel.sec)}
                        className={`py-1 rounded text-[9.5px] font-mono font-semibold border cursor-pointer ${
                          limiterReleaseSec === rel.sec
                            ? 'bg-cyan-500/25 border-cyan-400/50 text-cyan-100'
                            : 'bg-white/[0.03] border-white/[0.07] text-slate-400 hover:text-white'
                        }`}
                      >
                        {rel.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Mix-Stack Peak, Auto-Gain & Gain Reduction Meters */}
              <div className="lg:col-span-7 bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 flex flex-col justify-between space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="rounded bg-white/[0.03] border border-white/[0.06] px-2 py-1">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">
                      Mix Stack Peak
                    </div>
                    <span
                      ref={limiterStackPeakTextRef}
                      className="text-[11px] font-mono font-bold tabular-nums text-amber-300"
                    >
                      {mixStackBaselinePeak > 0.0001
                        ? `${20 * Math.log10(mixStackBaselinePeak) >= 0 ? '+' : ''}${(20 * Math.log10(mixStackBaselinePeak)).toFixed(1)} dBFS`
                        : '-∞ dBFS'}
                    </span>
                  </div>

                  <div className="rounded bg-white/[0.03] border border-white/[0.06] px-2 py-1">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">
                      Auto-Gain Trim
                    </div>
                    <span
                      ref={limiterAutoGainTextRef}
                      className="text-[11px] font-mono font-bold tabular-nums text-cyan-300"
                    >
                      0.0 dB
                    </span>
                  </div>

                  <div className="rounded bg-white/[0.03] border border-white/[0.06] px-2 py-1">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">
                      Limiter GR
                    </div>
                    <span
                      ref={limiterGrTextRef}
                      className="text-[11px] font-mono font-bold tabular-nums text-rose-300"
                    >
                      0.0 dB
                    </span>
                  </div>

                  <div className="rounded bg-white/[0.03] border border-white/[0.06] px-2 py-1">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">
                      Master Output
                    </div>
                    <span
                      ref={limiterOutTextRef}
                      className="text-[11px] font-mono font-bold tabular-nums text-emerald-300"
                    >
                      -∞ dBFS
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[9.5px] font-mono">
                    <span className="w-20 text-slate-400 shrink-0">PRE-STACK</span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        ref={limiterPreBarRef}
                        className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-rose-500 transition-[width] duration-75"
                        style={{ width: '4%' }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9.5px] font-mono">
                    <span className="w-20 text-slate-400 shrink-0">REDUCTION</span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        ref={limiterGrBarRef}
                        className="h-full bg-gradient-to-r from-amber-400 to-rose-500 transition-[width] duration-75"
                        style={{ width: '0%' }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9.5px] font-mono">
                    <span className="w-20 text-slate-400 shrink-0">SAFE OUT</span>
                    <div className="flex-1 h-2 rounded-full bg-white/[0.05] overflow-hidden">
                      <div
                        ref={limiterOutBarRef}
                        className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-[width] duration-75"
                        style={{ width: '4%' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LOOP DECK: Capture Live Audio & Loop Indefinitely with Beat-Synced Length Controls */}
          <div className="bg-[#121620] border border-cyan-400/25 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/25 to-emerald-500/20 border border-cyan-400/35 flex items-center justify-center shrink-0">
                  <Repeat
                    className={`w-4 h-4 ${loopDeckPlaying ? 'text-emerald-300 animate-spin' : 'text-cyan-300'}`}
                    style={loopDeckPlaying ? { animationDuration: '3s' } : undefined}
                  />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-slate-100 flex items-center gap-2">
                    <span>Loop Deck · Infinite Beat-Synced Sampler</span>
                    {loopDeckPlaying && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-[9px] font-mono font-bold text-emerald-300">
                        LOOPING
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] font-mono tabular-nums text-slate-400 truncate">
                    {capturedLoop
                      ? `${capturedLoop.sourceLabel}: ${capturedLoop.sourceTitle} · Start ${formatDjClock(capturedLoop.captureStartSec)} · ${capturedLoop.bpm} BPM · ${loopDeckBeats === 0.25 ? '1/4' : loopDeckBeats === 0.5 ? '1/2' : loopDeckBeats} Beat Loop`
                      : 'Capture a section of the playing deck or master set and loop it indefinitely'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {/* Capture Source Selector */}
                <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                  {(
                    [
                      { id: 'auto', label: 'Auto' },
                      { id: 'A', label: 'Deck A' },
                      { id: 'B', label: 'Deck B' },
                      { id: 'set', label: 'Master' },
                    ] as const
                  ).map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setLoopDeckSourceMode(src.id)}
                      className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                        loopDeckSourceMode === src.id
                          ? 'bg-cyan-500/25 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setLoopDeckQuantize((v) => !v)}
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium border cursor-pointer ${
                    loopDeckQuantize
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                  }`}
                >
                  Beat Quantize
                </button>

                <button
                  type="button"
                  onClick={() => void handleCaptureToLoopDeck()}
                  disabled={!deckATrack && !deckBTrack && !renderedMixBuffer && !currentAudioBuffer}
                  className="px-3 py-1 rounded-lg text-[11px] font-semibold bg-gradient-to-r from-cyan-400 to-emerald-400 hover:brightness-110 text-[#090b10] flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  <span>{capturedLoop ? 'Re-Capture Live' : 'Capture & Loop'}</span>
                </button>
              </div>
            </div>

            {/* Loop Deck Waveform Window + Beat-Synced Length Pad Controls */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-2.5 items-center bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5">
              {/* Visual 4-Beat Loop Slice Bar */}
              <div className="xl:col-span-5 space-y-1.5">
                <div className="relative h-12 rounded-lg bg-[#05070b] border border-white/[0.08] overflow-hidden flex items-center px-1 gap-[1.5px]">
                  {capturedLoop ? (
                    capturedLoop.windowPeaks.map((pk, idx) => {
                      const frac = idx / Math.max(1, capturedLoop.windowPeaks.length - 1);
                      const inActiveLoop = frac * 4 <= loopDeckBeats;
                      return (
                        <div
                          key={idx}
                          style={{
                            height: `${Math.max(14, Math.round(pk * 90))}%`,
                            backgroundColor: inActiveLoop
                              ? capturedLoop.accentHex
                              : 'rgba(148, 163, 184, 0.2)',
                          }}
                          className="flex-1 rounded-full transition-colors duration-75"
                        />
                      );
                    })
                  ) : (
                    <div className="w-full text-center text-[10px] text-slate-500">
                      Click Capture &amp; Loop while a track plays to lock an endless beat slice
                    </div>
                  )}

                  {/* Active Loop Region Highlight Bracket */}
                  {capturedLoop && (
                    <div
                      style={{
                        width: `${Math.min(100, (loopDeckBeats / 4) * 100)}%`,
                        borderColor: capturedLoop.accentHex,
                      }}
                      className="absolute inset-y-0 left-0 bg-cyan-400/10 border-r-2 pointer-events-none transition-all duration-100"
                    />
                  )}

                  {/* Real-Time Sweeping Loop Playhead */}
                  {capturedLoop && loopDeckPlaying && (
                    <div
                      ref={loopPlayheadBarRef}
                      style={{ left: '0%' }}
                      className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_8px_#fff] pointer-events-none"
                    />
                  )}
                </div>

                {/* Window Shift & Transport */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={!capturedLoop}
                      onClick={() => handleShiftLoopWindow(-1)}
                      className="px-2 py-1 rounded text-[10px] font-mono bg-white/[0.05] hover:bg-white/[0.11] text-slate-200 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                    >
                      -1B Shift
                    </button>
                    <button
                      type="button"
                      disabled={!capturedLoop}
                      onClick={() => handleShiftLoopWindow(1)}
                      className="px-2 py-1 rounded text-[10px] font-mono bg-white/[0.05] hover:bg-white/[0.11] text-slate-200 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                    >
                      +1B Shift
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={!capturedLoop}
                      onClick={() => {
                        if (!capturedLoop) return;
                        if (loopDeckPlaying) {
                          stopLoopDeckPlayback();
                        } else {
                          void startLoopDeckWithCapture(capturedLoop, loopDeckBeats);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-35 ${
                        loopDeckPlaying
                          ? 'bg-emerald-400 text-[#090b10]'
                          : 'bg-white/[0.08] hover:bg-white/[0.15] text-slate-100'
                      }`}
                    >
                      {loopDeckPlaying ? (
                        <Pause className="w-3 h-3" />
                      ) : (
                        <Play className="w-3 h-3 fill-current" />
                      )}
                      <span>{loopDeckPlaying ? 'Pause Loop' : 'Play Loop'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!capturedLoop}
                      onClick={() => {
                        stopLoopDeckPlayback();
                        setCapturedLoop(null);
                      }}
                      className="px-2 py-1 rounded-md text-[10px] font-medium bg-rose-500/12 hover:bg-rose-500/22 text-rose-200 border border-rose-400/30 cursor-pointer disabled:opacity-35"
                    >
                      Release
                    </button>
                  </div>
                </div>
              </div>

              {/* Beat-Synced Length Selector Buttons (1/4, 1/2, 1, 2, 4 Beats) + Halve/Double */}
              <div className="xl:col-span-4 space-y-1.5">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400">
                  <span>Beat-Synced Loop Length</span>
                  {capturedLoop && (
                    <span className="font-mono text-cyan-300">
                      {((60 / Math.max(40, capturedLoop.bpm)) * loopDeckBeats * 1000).toFixed(0)} ms
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {LOOP_BEAT_OPTIONS.map((opt) => (
                    <button
                      key={opt.beats}
                      type="button"
                      onClick={() => setLoopDeckBeats(opt.beats)}
                      className={`py-2 rounded-lg text-xs font-mono font-bold border transition-colors cursor-pointer ${
                        loopDeckBeats === opt.beats
                          ? 'bg-cyan-400 text-[#090b10] border-cyan-300 shadow-sm'
                          : 'bg-[#121620] hover:bg-white/[0.08] text-slate-200 border-white/[0.1]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      const idx = LOOP_BEAT_OPTIONS.findIndex((o) => o.beats === loopDeckBeats);
                      if (idx > 0) setLoopDeckBeats(LOOP_BEAT_OPTIONS[idx - 1].beats);
                    }}
                    disabled={loopDeckBeats <= 0.25}
                    className="py-1 rounded text-[10px] font-mono font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                  >
                    ÷ 2 (Tighter Roll)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const idx = LOOP_BEAT_OPTIONS.findIndex((o) => o.beats === loopDeckBeats);
                      if (idx >= 0 && idx < LOOP_BEAT_OPTIONS.length - 1) {
                        setLoopDeckBeats(LOOP_BEAT_OPTIONS[idx + 1].beats);
                      }
                    }}
                    disabled={loopDeckBeats >= 4}
                    className="py-1 rounded text-[10px] font-mono font-semibold bg-white/[0.05] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] cursor-pointer disabled:opacity-35"
                  >
                    × 2 (Wider Bar)
                  </button>
                </div>
              </div>

              {/* Loop Deck Mix Level & Filter Sweep */}
              <div className="xl:col-span-3 grid grid-cols-2 gap-2 bg-[#121620] border border-white/[0.08] rounded-lg p-2">
                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[9px] font-semibold uppercase text-slate-400">
                    <span>Loop Level</span>
                    <span className="font-mono text-cyan-300">
                      {Math.round(loopDeckVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.4}
                    step={0.05}
                    value={loopDeckVolume}
                    onChange={(e) => setLoopDeckVolume(parseFloat(e.target.value))}
                    className="w-full accent-cyan-400 cursor-pointer"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[9px] font-semibold uppercase text-slate-400">
                    <span>HPF / LPF</span>
                    <span className="font-mono text-amber-300">
                      {loopDeckFilterSweep === 0
                        ? 'FLAT'
                        : loopDeckFilterSweep < 0
                          ? `HP ${Math.abs(loopDeckFilterSweep).toFixed(1)}`
                          : `LP ${loopDeckFilterSweep.toFixed(1)}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={loopDeckFilterSweep}
                    onChange={(e) => setLoopDeckFilterSweep(parseFloat(e.target.value))}
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* ONE-SHOT SAMPLER DECK: Record & Trigger BPM-Quantized One-Shot Samples */}
          <div className="bg-[#121620] border border-fuchsia-400/25 rounded-xl p-3 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-fuchsia-500/25 to-cyan-500/20 border border-fuchsia-400/35 flex items-center justify-center shrink-0">
                  <Mic
                    className={`w-4 h-4 ${
                      samplerRecordingPadId ? 'text-rose-400 animate-pulse' : 'text-fuchsia-300'
                    }`}
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-xs font-semibold text-slate-100">
                      One-Shot Sampler Deck
                    </h3>
                    <span className="text-[10px] font-mono tabular-nums text-slate-400">
                      {detectedMasterBpm.toFixed(1)} BPM
                      <span className="mx-1 text-slate-600">·</span>
                      Quantize:{' '}
                      <span className="text-fuchsia-300 font-semibold">
                        {samplerQuantize === 'off'
                          ? 'Free'
                          : samplerQuantize === 0.25
                            ? '1/4 Beat'
                            : samplerQuantize === 0.5
                              ? '1/2 Beat'
                              : '1 Beat'}
                      </span>
                      {samplerRecordingPadId && (
                        <>
                          <span className="mx-1 text-slate-600">·</span>
                          <span className="text-rose-300 font-semibold">
                            REC {samplerRecordElapsedSec.toFixed(1)}s / 8.0s
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 truncate">
                    Record from Mic, Master Output, or Deck Chops and trigger one-shots snapped to the active BPM beat grid (keys 1–8)
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                {/* Record Source Selector */}
                <div
                  className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]"
                  title="Select audio source for pad recording"
                >
                  {(
                    [
                      { id: 'mic', label: 'Mic' },
                      { id: 'deckA', label: 'Deck A' },
                      { id: 'deckB', label: 'Deck B' },
                      { id: 'master', label: 'Master' },
                    ] as const
                  ).map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      disabled={samplerRecordingPadId !== null}
                      onClick={() => setSamplerRecordSource(src.id)}
                      className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer disabled:opacity-45 ${
                        samplerRecordSource === src.id
                          ? 'bg-fuchsia-500/25 text-fuchsia-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>

                {/* Quantize Selector */}
                <div
                  className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]"
                  title="Quantize pad triggers to detected project BPM grid"
                >
                  {SAMPLER_QUANTIZE_OPTIONS.map((opt) => (
                    <button
                      key={String(opt.value)}
                      type="button"
                      onClick={() => setSamplerQuantize(opt.value)}
                      className={`px-2 py-1 rounded text-[10px] font-mono font-semibold cursor-pointer ${
                        samplerQuantize === opt.value
                          ? 'bg-cyan-400 text-[#090b10]'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setSamplerChokeMode((v) => !v)}
                  title="Monophonic Choke cuts previous sample when a new pad hits"
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium border cursor-pointer ${
                    samplerChokeMode
                      ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {samplerChokeMode ? 'Choke ON' : 'Poly'}
                </button>

                <button
                  type="button"
                  onClick={() => setSamplerKeyTriggersEnabled((v) => !v)}
                  title="Toggle keyboard keys 1-8 to trigger pads"
                  className={`px-2 py-1 rounded-lg text-[10px] font-medium border cursor-pointer ${
                    samplerKeyTriggersEnabled
                      ? 'bg-cyan-500/15 border-cyan-400/35 text-cyan-200'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                  }`}
                >
                  Keys 1–8
                </button>

                <button
                  type="button"
                  onClick={() => void handleLoadFullSamplerStarterKit()}
                  className="px-2 py-1 rounded-lg text-[10px] font-medium bg-white/[0.05] hover:bg-white/[0.11] text-slate-200 border border-white/[0.09] cursor-pointer"
                >
                  Load 8-Pad Kit
                </button>

                <button
                  type="button"
                  onClick={stopAllSamplerVoices}
                  className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-400/35 flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-2.5 h-2.5 fill-current" />
                  <span>Stop All</span>
                </button>
              </div>
            </div>

            {/* Live Recording VU Bar + Sampler Master Gain */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#090b10] border border-white/[0.08] rounded-lg px-2.5 py-1.5">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <span className="text-[10px] font-mono uppercase text-slate-400 shrink-0">
                  {samplerRecordingPadId ? (
                    <span className="text-rose-300 font-semibold">Live Rec Level</span>
                  ) : (
                    `Source: ${
                      samplerRecordSource === 'mic'
                        ? 'Microphone (auto-trims silence)'
                        : samplerRecordSource === 'deckA'
                          ? 'Deck A (instant 1-Beat chop @ playhead)'
                          : samplerRecordSource === 'deckB'
                            ? 'Deck B (instant 1-Beat chop @ playhead)'
                            : 'Master Output (live mix + FX)'
                    }`
                  )}
                </span>
                {samplerRecordingPadId && (
                  <div className="flex-1 max-w-[220px] h-2 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-[width] duration-75"
                      style={{ width: `${Math.max(4, Math.round(samplerMicLevel * 100))}%` }}
                    />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 shrink-0">
                <Volume2 className="w-3.5 h-3.5 text-fuchsia-300" />
                <span className="text-[10px] text-slate-300 font-medium">Sampler Out</span>
                <input
                  type="range"
                  min={0}
                  max={1.4}
                  step={0.05}
                  value={samplerMasterVolume}
                  onChange={(e) => setSamplerMasterVolume(parseFloat(e.target.value))}
                  className="w-24 accent-fuchsia-400 cursor-pointer"
                />
                <span className="text-[10px] font-mono tabular-nums text-fuchsia-300 w-9 text-right">
                  {Math.round(samplerMasterVolume * 100)}%
                </span>
              </label>
            </div>

            {/* 8 BPM-Quantized Trigger & Record Pads Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {samplerPads.map((pad) => {
                const isRecordingThis = samplerRecordingPadId === pad.id;
                const isQueued = Boolean(samplerPadQueuedState[pad.id]);
                const isPlayingThis = Boolean(samplerPadPlayingState[pad.id]);
                const hasAudio = Boolean(pad.audioBuffer);

                return (
                  <div
                    key={pad.id}
                    style={{
                      borderColor: isRecordingThis
                        ? '#fb7185'
                        : isPlayingThis || isQueued
                          ? pad.colorHex
                          : hasAudio
                            ? `${pad.colorHex}44`
                            : 'rgba(255,255,255,0.08)',
                    }}
                    className={`rounded-xl border bg-[#090b10] p-2 flex flex-col gap-1.5 transition-all ${
                      isPlayingThis
                        ? 'shadow-[0_0_16px_rgba(232,121,249,0.28)] scale-[0.99]'
                        : isQueued
                          ? 'ring-1 ring-cyan-400/70'
                          : ''
                    }`}
                  >
                    {/* Main Tactile Trigger Pad Area */}
                    <button
                      type="button"
                      onClick={() => {
                        if (isRecordingThis) {
                          void handleRecordSamplerPad(pad.id);
                        } else {
                          void handleTriggerSamplerPad(pad.id);
                        }
                      }}
                      className="w-full text-left rounded-lg bg-[#121620] hover:bg-white/[0.06] border border-white/[0.06] p-2 flex flex-col gap-1.5 cursor-pointer group"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            style={{ backgroundColor: pad.colorHex }}
                            className="w-5 h-5 rounded text-[10px] font-mono font-bold text-[#090b10] flex items-center justify-center shrink-0"
                          >
                            {pad.keyHint}
                          </span>
                          {editingSamplerPadId === pad.id ? (
                            <input
                              type="text"
                              autoFocus
                              value={editingSamplerPadName}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setEditingSamplerPadName(e.target.value)}
                              onBlur={() => {
                                const trimmed = editingSamplerPadName.trim();
                                if (trimmed) {
                                  setSamplerPads((prev) =>
                                    prev.map((p) =>
                                      p.id === pad.id ? { ...p, name: trimmed } : p
                                    )
                                  );
                                }
                                setEditingSamplerPadId(null);
                              }}
                              onKeyDown={(e) => {
                                e.stopPropagation();
                                if (e.key === 'Enter') {
                                  const trimmed = editingSamplerPadName.trim();
                                  if (trimmed) {
                                    setSamplerPads((prev) =>
                                      prev.map((p) =>
                                        p.id === pad.id ? { ...p, name: trimmed } : p
                                      )
                                    );
                                  }
                                  setEditingSamplerPadId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingSamplerPadId(null);
                                }
                              }}
                              className="w-full px-1 py-0.5 rounded bg-[#090b10] border border-cyan-400 text-[11px] text-slate-100 focus:outline-none"
                            />
                          ) : (
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingSamplerPadId(pad.id);
                                setEditingSamplerPadName(pad.name);
                              }}
                              title="Click to rename pad"
                              className="text-[11px] font-semibold text-slate-100 truncate hover:text-cyan-200"
                            >
                              {pad.name}
                            </span>
                          )}
                        </div>

                        <span className="text-[9.5px] font-mono tabular-nums shrink-0">
                          {isRecordingThis ? (
                            <span className="text-rose-400 font-bold animate-pulse">REC</span>
                          ) : isQueued ? (
                            <span className="text-cyan-300 font-bold animate-pulse">SYNC…</span>
                          ) : isPlayingThis ? (
                            <span style={{ color: pad.colorHex }} className="font-bold">
                              FIRE
                            </span>
                          ) : hasAudio ? (
                            <span className="text-slate-400">
                              {pad.durationSec.toFixed(2)}s
                            </span>
                          ) : (
                            <span className="text-slate-600">EMPTY</span>
                          )}
                        </span>
                      </div>

                      {/* Mini Waveform Bars */}
                      <div className="h-8 rounded bg-[#07090d] border border-white/[0.05] px-1 flex items-center gap-[1.5px] overflow-hidden">
                        {hasAudio && pad.peaks.length > 0 ? (
                          pad.peaks.map((pk, barIdx) => (
                            <div
                              key={barIdx}
                              style={{
                                height: `${Math.max(12, Math.round(pk * 88))}%`,
                                backgroundColor: isPlayingThis
                                  ? '#ffffff'
                                  : isQueued
                                    ? '#22d3ee'
                                    : pad.colorHex,
                                opacity: isPlayingThis ? 1 : 0.78,
                              }}
                              className="flex-1 rounded-full transition-colors duration-75"
                            />
                          ))
                        ) : (
                          <span className="w-full text-center text-[9.5px] text-slate-500">
                            {samplerRecordSource === 'mic'
                              ? 'Click Rec below to capture voice/FX'
                              : samplerRecordSource === 'master'
                                ? 'Click Rec to capture master output'
                                : `Click Chop to sample ${samplerRecordSource === 'deckA' ? 'Deck A' : 'Deck B'}`}
                          </span>
                        )}
                      </div>
                    </button>

                    {/* Pad Action Footer: Rec/Stop, Load File, Level, Clear */}
                    <div className="flex items-center justify-between gap-1 text-[10px]">
                      <button
                        type="button"
                        onClick={() => void handleRecordSamplerPad(pad.id)}
                        className={`px-2 py-1 rounded font-semibold flex items-center gap-1 cursor-pointer transition-colors ${
                          isRecordingThis
                            ? 'bg-rose-500 text-white animate-pulse'
                            : 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-400/30'
                        }`}
                        title={
                          isRecordingThis
                            ? 'Stop recording and save one-shot'
                            : samplerRecordSource === 'deckA' || samplerRecordSource === 'deckB'
                              ? 'Capture 1-Beat one-shot from playing deck'
                              : 'Record one-shot sample into this pad'
                        }
                      >
                        {isRecordingThis ? (
                          <>
                            <Square className="w-2.5 h-2.5 fill-current" />
                            <span>Stop</span>
                          </>
                        ) : (
                          <>
                            <Mic className="w-2.5 h-2.5" />
                            <span>
                              {samplerRecordSource === 'deckA' || samplerRecordSource === 'deckB'
                                ? 'Chop'
                                : 'Rec'}
                            </span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          samplerTargetUploadPadIdRef.current = pad.id;
                          samplerPadInputRef.current?.click();
                        }}
                        title="Load WAV/MP3 one-shot file"
                        className="p-1 rounded bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 border border-white/[0.08] cursor-pointer"
                      >
                        <Upload className="w-3 h-3" />
                      </button>

                      <input
                        type="range"
                        min={0.1}
                        max={1.4}
                        step={0.05}
                        value={pad.gain}
                        aria-label={`${pad.name} gain`}
                        onChange={(e) => {
                          const nextVal = parseFloat(e.target.value);
                          setSamplerPads((prev) =>
                            prev.map((p) => (p.id === pad.id ? { ...p, gain: nextVal } : p))
                          );
                        }}
                        className="flex-1 min-w-[40px] accent-fuchsia-400 cursor-pointer"
                      />

                      <button
                        type="button"
                        disabled={!hasAudio}
                        onClick={() => handleClearSamplerPad(pad.id)}
                        title="Clear pad sample"
                        className="p-1 rounded bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.08] disabled:opacity-30 cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* CUE POINT MANAGER: Place Section Markers (Intro, Drop, Bridge...) & Instant Jump */}
          {(() => {
            const activeCueTrack = cueManagerDeck === 'A' ? deckATrack : deckBTrack;
            const activeCuePlayhead = cueManagerDeck === 'A' ? deckATime : deckBTime;
            const activeCueList = activeCueTrack?.cuePoints ?? [];
            return (
              <div className="bg-[#121620] border border-white/[0.09] rounded-xl p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-rose-500/20 border border-cyan-400/30 flex items-center justify-center shrink-0">
                      <MapPin className="w-4 h-4 text-cyan-300" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-slate-100">
                        Cue Point Manager · Instant Section Markers &amp; Jump Pads
                      </h3>
                      <p className="text-[10px] font-mono tabular-nums text-slate-400 truncate">
                        {activeCueTrack
                          ? `Deck ${cueManagerDeck}: ${activeCueTrack.title} · Playhead ${formatDjClock(activeCuePlayhead)} · ${activeCueList.length} Cue${activeCueList.length === 1 ? '' : 's'}`
                          : `Select or load a track into Deck ${cueManagerDeck} to place and jump to Cue Points`}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Deck Switcher */}
                    <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                      {(['A', 'B'] as const).map((dk) => (
                        <button
                          key={dk}
                          type="button"
                          onClick={() => {
                            setCueManagerDeck(dk);
                            const t = dk === 'A' ? deckATime : deckBTime;
                            setCueDraftTimeText(formatDjClock(t));
                          }}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer transition-colors ${
                            cueManagerDeck === dk
                              ? dk === 'A'
                                ? 'bg-cyan-400 text-[#090b10]'
                                : 'bg-amber-400 text-[#090b10]'
                              : 'text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Deck {dk}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setCueSnapToBeat((v) => !v)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-medium border cursor-pointer ${
                        cueSnapToBeat
                          ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                          : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                      }`}
                    >
                      Snap to Beat
                    </button>

                    <button
                      type="button"
                      onClick={() => setCueAutoPlayOnJump((v) => !v)}
                      className={`px-2 py-1 rounded-lg text-[10px] font-medium border cursor-pointer ${
                        cueAutoPlayOnJump
                          ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                          : 'bg-white/[0.04] border-white/[0.08] text-slate-400'
                      }`}
                    >
                      Auto-Play Jump
                    </button>

                    <button
                      type="button"
                      disabled={!activeCueTrack}
                      onClick={() => handleAutoDetectCuePoints(cueManagerDeck)}
                      className="px-2 py-1 rounded-lg text-[10px] font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.09] flex items-center gap-1 cursor-pointer disabled:opacity-35"
                    >
                      <RotateCcw className="w-3 h-3 text-cyan-300" />
                      <span>Auto-Detect Cues</span>
                    </button>
                  </div>
                </div>

                {/* Place New Cue Point Form + Quick Section Presets */}
                <div className="bg-[#090b10] border border-white/[0.08] rounded-lg p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">
                      Quick Stamp @ Playhead ({formatDjClock(activeCuePlayhead)}):
                    </span>
                    {DJ_CUE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        disabled={!activeCueTrack}
                        onClick={() => {
                          setCueDraftLabel(preset.label);
                          setCueDraftColor(preset.color);
                          setCueDraftTimeText(formatDjClock(activeCuePlayhead));
                          handlePlaceCuePoint(
                            cueManagerDeck,
                            preset.label,
                            activeCuePlayhead,
                            preset.color
                          );
                        }}
                        style={{ borderColor: `${preset.color}55` }}
                        className="px-2 py-1 rounded-md text-[10px] font-semibold bg-white/[0.04] hover:bg-white/[0.1] text-slate-100 border flex items-center gap-1 cursor-pointer disabled:opacity-35"
                      >
                        <span
                          style={{ backgroundColor: preset.color }}
                          className="w-2 h-2 rounded-full"
                        />
                        <span>+ {preset.label}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-white/[0.06]">
                    <input
                      type="text"
                      value={cueDraftLabel}
                      onChange={(e) => setCueDraftLabel(e.target.value)}
                      placeholder="Marker name (e.g. Intro, Drop, Bridge)"
                      aria-label="Cue point label"
                      className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded-lg bg-[#121620] border border-white/[0.1] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                    />

                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={cueDraftTimeText}
                        onChange={(e) => setCueDraftTimeText(e.target.value)}
                        placeholder="0:00.0"
                        aria-label="Cue point timestamp"
                        className="w-24 px-2 py-1.5 rounded-lg bg-[#121620] border border-white/[0.1] text-xs font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400"
                      />
                      <button
                        type="button"
                        disabled={!activeCueTrack}
                        onClick={() => setCueDraftTimeText(formatDjClock(activeCuePlayhead))}
                        className="px-2 py-1.5 rounded-lg text-[10px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-cyan-200 border border-white/[0.09] whitespace-nowrap cursor-pointer disabled:opacity-35"
                      >
                        Use Playhead
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      {DJ_CUE_PRESETS.slice(0, 6).map((p) => (
                        <button
                          key={p.color}
                          type="button"
                          onClick={() => setCueDraftColor(p.color)}
                          aria-label={`Select cue color ${p.label}`}
                          style={{ backgroundColor: p.color }}
                          className={`w-4 h-4 rounded-full cursor-pointer transition-transform ${
                            cueDraftColor === p.color
                              ? 'ring-2 ring-white scale-110'
                              : 'opacity-65 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={!activeCueTrack}
                      onClick={() => {
                        const parsedSec = parseDjTimeInput(cueDraftTimeText);
                        handlePlaceCuePoint(
                          cueManagerDeck,
                          cueDraftLabel,
                          parsedSec ?? activeCuePlayhead,
                          cueDraftColor
                        );
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Place Cue</span>
                    </button>
                  </div>
                </div>

                {/* Cue Points Instant-Jump Cards Grid */}
                {!activeCueTrack || activeCueList.length === 0 ? (
                  <div className="py-4 text-center text-xs text-slate-400 border border-dashed border-white/[0.1] rounded-lg">
                    {activeCueTrack
                      ? `No cue markers placed on Deck ${cueManagerDeck} yet. Click a quick preset above or set a timestamp to add one.`
                      : `Load a track into Deck ${cueManagerDeck} to manage Cue Points.`}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {activeCueList.map((cue, idx) => (
                      <div
                        key={cue.id}
                        style={{ borderColor: `${cue.color}44` }}
                        className="bg-[#090b10] border rounded-lg p-2 flex flex-col justify-between gap-2"
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              style={{ backgroundColor: cue.color }}
                              className="w-5 h-5 rounded text-[10px] font-mono font-bold text-[#090b10] flex items-center justify-center shrink-0"
                            >
                              {idx + 1}
                            </span>
                            {editingCueId === cue.id ? (
                              <input
                                type="text"
                                autoFocus
                                value={editingCueLabel}
                                onChange={(e) => setEditingCueLabel(e.target.value)}
                                onBlur={() =>
                                  handleRenameCuePoint(cueManagerDeck, cue.id, editingCueLabel)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleRenameCuePoint(
                                      cueManagerDeck,
                                      cue.id,
                                      editingCueLabel
                                    );
                                  } else if (e.key === 'Escape') {
                                    setEditingCueId(null);
                                  }
                                }}
                                className="w-full px-1.5 py-0.5 rounded bg-[#121620] border border-cyan-400 text-xs text-slate-100 focus:outline-none"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCueId(cue.id);
                                  setEditingCueLabel(cue.label);
                                }}
                                title="Click to rename cue marker"
                                className="text-xs font-semibold text-slate-100 truncate text-left hover:text-cyan-200 cursor-pointer"
                              >
                                {cue.label}
                              </button>
                            )}
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-cyan-300 shrink-0">
                            {formatDjClock(cue.timeSec)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleJumpToCuePoint(cueManagerDeck, cue)}
                            className="flex-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-cyan-400/15 hover:bg-cyan-400/25 text-cyan-200 border border-cyan-400/35 flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>Jump</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (cueManagerDeck === 'A') {
                                setDeckAOutLyricId(null);
                                setDeckAOutTime(cue.timeSec);
                                setStatusMessage(
                                  `Set Deck A Mix-Out crossfade cue to "${cue.label}" (${formatDjClock(cue.timeSec)}).`
                                );
                              } else {
                                setDeckBInLyricId(null);
                                setDeckBInTime(cue.timeSec);
                                setStatusMessage(
                                  `Set Deck B Mix-In crossfade cue to "${cue.label}" (${formatDjClock(cue.timeSec)}).`
                                );
                              }
                            }}
                            title={
                              cueManagerDeck === 'A'
                                ? 'Use as Deck A Mix-Out crossfade point'
                                : 'Use as Deck B Mix-In crossfade point'
                            }
                            className="px-1.5 py-1 rounded-md text-[10px] font-medium bg-white/[0.05] hover:bg-white/[0.11] text-slate-300 border border-white/[0.08] cursor-pointer"
                          >
                            {cueManagerDeck === 'A' ? 'Mix Out' : 'Mix In'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleStampCueToPlayhead(cueManagerDeck, cue.id)}
                            title="Move marker to current playhead"
                            className="p-1 rounded-md bg-white/[0.05] hover:bg-white/[0.11] text-slate-300 border border-white/[0.08] cursor-pointer"
                          >
                            <MapPin className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteCuePoint(cueManagerDeck, cue.id)}
                            aria-label={`Delete ${cue.label} cue`}
                            className="p-1 rounded-md bg-white/[0.05] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.08] cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Inline Paste Lyrics Modal Drawer */}
          {lyricDrawerDeck && (
            <div className="bg-[#121620] border border-fuchsia-400/40 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-100">
                  Paste Plain Lyrics or LRC Timestamps for Deck {lyricDrawerDeck} (Plain lines auto-sync to detected beats!)
                </span>
                <button
                  type="button"
                  onClick={() => setLyricDrawerDeck(null)}
                  className="text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <textarea
                rows={4}
                value={lyricDraftText}
                onChange={(e) => setLyricDraftText(e.target.value)}
                placeholder={'Line 1: Midnight neon starts to glow\nLine 2: Drop into the stereo...'}
                className="w-full rounded-lg bg-[#090b10] border border-white/[0.1] p-2 text-xs text-slate-100 focus:outline-none focus:border-fuchsia-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleSaveDeckLyricDraft}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-fuchsia-500 hover:bg-fuchsia-400 text-white cursor-pointer"
                >
                  Sync Lyrics to Beat Grid
                </button>
              </div>
            </div>
          )}

          {/* DJ Track Crate & Multi-Track Auto-Set Queue */}
          <div className="bg-[#121620] border border-white/[0.09] rounded-xl p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-100">
                  DJ Crate &amp; Auto-Set Queue ({crate.length})
                </span>
                <span className="text-[11px] text-slate-400">
                  Click Deck A / B or chain all crate tracks cleanly by beats or lyrics
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => crateInputRef.current?.click()}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.08] flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Add Tracks</span>
                </button>
                {crate.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => void buildAndRenderSet('crate', true)}
                    disabled={isRenderingSet}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    <span>Auto-Mix Full Crate</span>
                  </button>
                )}
              </div>
            </div>

            {crate.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 border border-dashed border-white/[0.1] rounded-lg">
                No tracks in DJ Crate yet. Drag &amp; drop MP3 / WAV / MP4 / WebM files or click <strong>Demo DJ Pair</strong> above.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] border border-white/[0.07] rounded-lg overflow-hidden bg-[#090b10]">
                {crate.map((track, idx) => {
                  const isA = track.id === deckATrackId;
                  const isB = track.id === deckBTrackId;
                  const crateCamelot = getCamelotEntry(track.camelotKey);
                  const crateMatchWithA =
                    deckATrack && !isA && track.camelotKey && deckATrack.camelotKey
                      ? evaluateHarmonicCompatibility(deckATrack.camelotKey, track.camelotKey)
                      : null;
                  return (
                    <div
                      key={track.id}
                      className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 hover:bg-white/[0.03]"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className="text-[10px] font-mono text-slate-500 w-4">
                          {idx + 1}
                        </span>
                        {track.hasVideo ? (
                          <Film className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Music className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-slate-100 truncate">
                            {track.title}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono tabular-nums truncate">
                            {track.artist} · {getEffectiveBpm(track)} BPM
                            {(track.camelotKey || track.musicalKey) && (
                              <span
                                style={{ color: crateCamelot?.colorHex ?? '#cbd5e1' }}
                                className="font-semibold"
                              >
                                {' '}· {track.camelotKey ?? '--'} ({track.musicalKey ?? ''})
                              </span>
                            )}
                            {crateMatchWithA?.isCompatible && (
                              <span
                                style={{ color: crateMatchWithA.accentHex }}
                                className="font-semibold"
                              >
                                {' '}· Harmonic w/ A ({crateMatchWithA.label})
                              </span>
                            )}{' '}
                            · {formatDjClock(track.duration)} · {track.beatTimes.length} beats · {track.lyrics.length} lyrics
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            stopDeckChain('A');
                            setDeckATrackId(track.id);
                            setDeckATime(0);
                            setDeckAOutTime(track.recommendedOutTime);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            isA
                              ? 'bg-cyan-400 text-[#090b10]'
                              : 'bg-cyan-500/15 text-cyan-200 hover:bg-cyan-500/25'
                          }`}
                        >
                          Deck A
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            stopDeckChain('B');
                            setDeckBTrackId(track.id);
                            setDeckBTime(0);
                            setDeckBInTime(0);
                          }}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                            isB
                              ? 'bg-amber-400 text-[#090b10]'
                              : 'bg-amber-500/15 text-amber-200 hover:bg-amber-500/25'
                          }`}
                        >
                          Deck B
                        </button>
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() =>
                            setCrate((prev) => {
                              const copy = [...prev];
                              const [item] = copy.splice(idx, 1);
                              copy.splice(idx - 1, 0, item);
                              return copy;
                            })
                          }
                          aria-label="Move track up"
                          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === crate.length - 1}
                          onClick={() =>
                            setCrate((prev) => {
                              const copy = [...prev];
                              const [item] = copy.splice(idx, 1);
                              copy.splice(idx + 1, 0, item);
                              return copy;
                            })
                          }
                          aria-label="Move track down"
                          className="p-1 rounded text-slate-400 hover:text-white disabled:opacity-25 cursor-pointer"
                        >
                          <ArrowDown className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (isA) stopDeckChain('A');
                            if (isB) stopDeckChain('B');
                            if (track.objectUrl && sessionUrlsRef.current.has(track.objectUrl)) {
                              URL.revokeObjectURL(track.objectUrl);
                              sessionUrlsRef.current.delete(track.objectUrl);
                            }
                            setCrate((prev) => prev.filter((t) => t.id !== track.id));
                          }}
                          aria-label="Remove track from crate"
                          className="p-1 rounded text-slate-400 hover:text-rose-400 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
