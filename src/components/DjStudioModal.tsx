import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  AudioWaveform,
  Bookmark,
  BookmarkPlus,
  Cable,
  Disc3,
  Download,
  FileText,
  Film,
  Flame,
  FolderOpen,
  Grid3x3,
  Layers,
  Loader2,
  Lock,
  MapPin,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  Volume2,
  VolumeX,
  Wand2,
  X,
  Zap,
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
  createDjCuePointId,
  createDjVideoFrameResolver,
  cycleTrackDownbeatPhase,
  detectDefaultDjCuePoints,
  DJ_CUE_PRESETS,
  DjBpmTimingPreset,
  DjScheduleRenderPlan,
  DjTransitionPlan,
  extractTriBandWindowPeaks,
  findBestLyricHandoffPair,
  findNearestBeat,
  generateDjDemoPair,
  getEffectiveBeatGridPoints,
  getEffectiveBpm,
  parseAndSyncDjTrackLyrics,
  renderOfflineDjSchedule,
  resetTrackBeatGridToAuto,
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
import { MixVideoFrameResolver } from '../utils/mixEngine';
import { captureCanvasSnapshotPng } from '../utils/presetStorage';
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

interface TriBandWaveformCanvasProps {
  track: DjTrackAsset | null;
  playheadSec: number;
  accentHex: string;
  cueTimeSec: number | null;
  cueLabel: string;
  showBeatGrid?: boolean;
  beatGridSubdivision?: 1 | 2 | 4;
  viewMode?: 'overview' | 'zoom';
  isGridEditMode?: boolean;
  isScratchMode?: boolean;
  isScratching?: boolean;
  scratchRate?: number | null;
  scratchSensitivitySec?: number;
  onDragBeatGridMs?: (deltaMs: number) => void;
  onScratchStart?: () => void;
  onScratchMove?: (deltaSec: number, velocityRate: number) => void;
  onScratchEnd?: () => void;
  onSeekOrCue: (timeSec: number) => void;
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
  isGridEditMode = false,
  isScratchMode = false,
  isScratching = false,
  scratchRate = null,
  scratchSensitivitySec = 1.8,
  onDragBeatGridMs,
  onScratchStart,
  onScratchMove,
  onScratchEnd,
  onSeekOrCue,
}: TriBandWaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gridDragLastXRef = useRef<number | null>(null);
  const gridDragTotalPxRef = useRef(0);
  const dragLastTimeRef = useRef<number>(0);
  const scratchEngagedRef = useRef(false);

  const gridPoints = useMemo(
    () => (track ? getEffectiveBeatGridPoints(track) : []),
    [track]
  );

  const zoomBounds = useMemo(() => {
    if (!track || viewMode !== 'zoom') {
      return { start: 0, end: track?.duration ?? 1 };
    }
    const beatSec = 60 / Math.max(40, getEffectiveBpm(track));
    const halfWin = beatSec * 4;
    return {
      start: playheadSec - halfWin,
      end: playheadSec + halfWin,
    };
  }, [playheadSec, track, viewMode]);

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

    const isZoom = viewMode === 'zoom';
    const winStart = isZoom ? zoomBounds.start : 0;
    const winEnd = isZoom ? zoomBounds.end : Math.max(0.1, track.duration);
    const winSpan = Math.max(0.1, winEnd - winStart);
    const toX = (t: number) => ((t - winStart) / winSpan) * width;

    const peaks = isZoom
      ? extractTriBandWindowPeaks(track.audioBuffer, winStart, winEnd, 112)
      : track.triBandPeaks;

    const { low, mid, high } = peaks;
    const n = low.length;
    const midY = height * 0.54;
    const barSlot = width / Math.max(1, n);

    // Draw Tri-band bars: Low (Cyan/Blue), Mid (Emerald/Amber), High (Rose/White)
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
    isGridEditMode,
    isScratchMode,
    isScratching,
    scratchRate,
    gridPoints,
    zoomBounds,
  ]);

  const interactiveDragEnabled = Boolean(track && (isGridEditMode || isScratchMode));

  return (
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
          const winSpan =
            viewMode === 'zoom'
              ? Math.max(0.2, zoomBounds.end - zoomBounds.start)
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
          const deltaSec =
            viewMode === 'zoom'
              ? -(dx / width) *
                Math.max(0.9, Math.min(3.5, zoomBounds.end - zoomBounds.start)) *
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
          const rawTime =
            viewMode === 'zoom'
              ? zoomBounds.start + frac * (zoomBounds.end - zoomBounds.start)
              : frac * track.duration;
          const clamped = Math.max(0, Math.min(track.duration - 0.05, rawTime));
          onSeekOrCue(isGridEditMode ? clamped : findNearestBeat(track.beatTimes, clamped));
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
        const rawTime =
          viewMode === 'zoom'
            ? zoomBounds.start + frac * (zoomBounds.end - zoomBounds.start)
            : frac * track.duration;
        const clamped = Math.max(0, Math.min(track.duration - 0.05, rawTime));
        const snapped = findNearestBeat(track.beatTimes, clamped);
        onSeekOrCue(snapped);
      }}
      title={
        !track
          ? undefined
          : isGridEditMode
            ? track.beatGridLocked
              ? 'Beat grid is locked — unlock in Grid Editor to drag'
              : 'Drag horizontally to slide beat-grid lines onto audio transients, or click to seek'
            : isScratchMode
              ? 'Drag horizontally to vinyl-scratch playback speed (forward & reverse), or click to beat-seek'
              : 'Click anywhere to snap playhead / cue to nearest beat'
      }
      className={`w-full rounded-lg border block touch-none select-none ${
        isGridEditMode
          ? track?.beatGridLocked
            ? 'h-[76px] border-slate-500/40 cursor-not-allowed'
            : 'h-[76px] border-amber-400/55 ring-1 ring-amber-400/25 cursor-grab active:cursor-grabbing'
          : isScratchMode && track
            ? isScratching
              ? 'h-[68px] border-cyan-400/75 ring-1 ring-cyan-400/40 cursor-grabbing'
              : 'h-[68px] border-white/[0.1] hover:border-cyan-400/40 cursor-grab active:cursor-grabbing'
            : 'h-[68px] border-white/[0.08] cursor-pointer'
      }`}
    />
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
  onSeekTimeline,
}: SmartCrossfadeOverlapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const windowBounds = useMemo(() => {
    if (!deckA || !deckB || !plan) {
      return { start: 0, end: 30 };
    }
    if (zoomMode === 'full') {
      return { start: 0, end: Math.max(2, plan.totalDurationSec) };
    }
    const pad = Math.max(3.5, plan.overlapDurationSec * 0.75);
    const start = Math.max(0, plan.transitionStartSec - pad);
    const end = Math.min(plan.totalDurationSec, plan.transitionEndSec + pad);
    return { start, end: Math.max(start + 2, end) };
  }, [deckA, deckB, plan, zoomMode]);

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

    // Playhead cursor if inside visible window
    if (playheadSec >= winStart && playheadSec <= winEnd) {
      const px = toX(playheadSec);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px - 1, 0, 2, height);
    }

    ctx.restore();
  }, [deckA, deckB, plan, playheadSec, showBeatGrid, beatGridSubdivision, windowBounds]);

  return (
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
  onDragSlipDeckBMs,
}: BeatGridPhaseAlignmentCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
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

  return (
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
        const deltaSourceSec = -(dx / Math.max(100, width)) * (2 * realHalfWinSec * Math.max(0.5, rateB));
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
  const [deckAWaveformView, setDeckAWaveformView] = useState<'overview' | 'zoom'>('overview');
  const [deckBWaveformView, setDeckBWaveformView] = useState<'overview' | 'zoom'>('overview');
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

  // DOM & WebAudio Refs
  const deckAInputRef = useRef<HTMLInputElement | null>(null);
  const deckBInputRef = useRef<HTMLInputElement | null>(null);
  const crateInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarAudioInputRef = useRef<HTMLInputElement | null>(null);
  const deckALyricInputRef = useRef<HTMLInputElement | null>(null);
  const deckBLyricInputRef = useRef<HTMLInputElement | null>(null);
  const stageCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beatMeterBarRef = useRef<HTMLDivElement | null>(null);
  const loopPlayheadBarRef = useRef<HTMLDivElement | null>(null);

  const sessionUrlsRef = useRef<Set<string>>(new Set());
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
  const offlineSetAnalyzerRef = useRef<OfflineAudioAnalyzer | null>(null);

  // Visualizer & canvas state refs
  const particlesRef = useRef<Particle[]>([]);
  const motionBlurRef = useRef<MotionBlurState>({ canvas: null, hasFrame: false });
  const sceneTransRef = useRef<SceneTransitionState>({
    activeMode: null,
    fromMode: null,
    elapsed: 0,
    duration: 0.45,
  });
  const prevVisualizerModeRef = useRef(settings.visualizerMode);
  const beatStateRef = useRef<BeatState>(createInitialBeatState());
  const albumRotRef = useRef<{ angle: number }>({ angle: 0 });

  const deckATrack = useMemo(
    () => crate.find((t) => t.id === deckATrackId) ?? null,
    [crate, deckATrackId]
  );
  const deckBTrack = useMemo(
    () => crate.find((t) => t.id === deckBTrackId) ?? null,
    [crate, deckBTrackId]
  );

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
  const crossfaderRef = useRef(crossfader);
  crossfaderRef.current = crossfader;
  const deckAPlayingRef = useRef(deckAPlaying);
  deckAPlayingRef.current = deckAPlaying;
  const deckBPlayingRef = useRef(deckBPlaying);
  deckBPlayingRef.current = deckBPlaying;
  const deckATimeRef = useRef(deckATime);
  deckATimeRef.current = deckATime;
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

  const stopAllDjPlayback = useCallback(() => {
    stopDeckChain('A');
    stopDeckChain('B');
    stopAutoSetPlayback();
    stopLoopDeckPlayback();
  }, [stopAutoSetPlayback, stopDeckChain, stopLoopDeckPlayback]);

  // Ensure shared master WebAudio bus exists
  const ensureMasterBus = useCallback(async () => {
    const ctx = await ensureAudioContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    if (!masterGainRef.current || masterGainRef.current.context !== ctx) {
      const master = ctx.createGain();
      master.gain.value = isMasterMuted ? 0 : masterVolume;

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

      master.connect(analyser);
      analyser.connect(ctx.destination);
      master.connect(lowPass);
      lowPass.connect(beatAnalyser);

      masterGainRef.current = master;
      analyserRef.current = analyser;
      beatAnalyserRef.current = beatAnalyser;
    }
    return { ctx, master: masterGainRef.current };
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
      chain.lowEq.gain.setTargetAtTime(eq.lowGainDb, now, 0.02);
      chain.midEq.gain.setTargetAtTime(eq.midGainDb, now, 0.02);
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
  ]);

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.setTargetAtTime(
        isMasterMuted ? 0 : masterVolume,
        masterGainRef.current.context.currentTime,
        0.02
      );
    }
  }, [isMasterMuted, masterVolume]);

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
      lowEq.frequency.value = 230;
      lowEq.gain.value = eq.lowGainDb;

      const midEq = ctx.createBiquadFilter();
      midEq.type = 'peaking';
      midEq.frequency.value = 1100;
      midEq.Q.value = 1.0;
      midEq.gain.value = eq.midGainDb;

      const highEq = ctx.createBiquadFilter();
      highEq.type = 'highshelf';
      highEq.frequency.value = 4000;
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
      delayDry.connect(crossfadeGain);

      trimGain.connect(delayNode);
      delayNode.connect(delayFeedback);
      delayFeedback.connect(delayNode);
      delayNode.connect(delayWet);
      delayWet.connect(crossfadeGain);

      crossfadeGain.connect(master);

      return {
        source: null,
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

      if (loopBeats > 0) {
        source.loop = true;
        source.loopStart = safeStart;
        source.loopEnd = Math.min(track.duration, safeStart + (60 / getEffectiveBpm(track)) * loopBeats);
      }

      const chain = createDeckFilterChain(ctx, master, deck, track, safeStart, rate, eq, loopBeats);
      chain.source = source;
      source.connect(chain.lowEq);

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
        if (currentRef.current === chain && !chain.isScratching) {
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
    particlesRef.current = [];
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
      const finalTime = cueSnapToBeat
        ? findNearestBeat(target.beatTimes, clamped)
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
        `Placed "${label}" cue on Deck ${deck} at ${formatDjClock(nextCue.timeSec)}${cueSnapToBeat ? ' (beat-snapped)' : ''}.`
      );
    },
    [cueDraftColor, cueDraftLabel, cueSnapToBeat, deckATrack, deckBTrack]
  );

  const handleJumpToCuePoint = useCallback(
    (deck: 'A' | 'B', cue: DjCuePoint) => {
      const target = deck === 'A' ? deckATrack : deckBTrack;
      if (!target) return;
      const safeTime = Math.max(0, Math.min(target.duration - 0.05, cue.timeSec));
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
        `Jumped Deck ${deck} to "${cue.label}" (${formatDjClock(safeTime)}).`
      );
    },
    [cueAutoPlayOnJump, deckATrack, deckBTrack, startLiveDeckFromTime]
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
      const nextTime = cueSnapToBeat
        ? findNearestBeat(target.beatTimes, raw)
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
    [cueSnapToBeat, deckATrack, deckBTrack]
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
    async (mode: 'dual' | 'crate', autoPlayAfterRender = true) => {
      setErrorMsg(null);
      setIsRenderingSet(true);
      stopAllDjPlayback();

      try {
        let schedule: DjScheduleRenderPlan;
        if (mode === 'crate' && crate.length >= 2) {
          schedule = buildCrateSetSchedule(crate, {
            triggerMode: triggerMode === 'manual' ? 'beats' : triggerMode,
            transitionStyle,
            videoMixStyle,
            videoBlendMode,
            videoLayerOpacity,
            crossfadeBeats,
            beatMatchTempo,
          });
        } else if (deckATrack && deckBTrack && dualPlan) {
          schedule = buildScheduleFromDualPlan(deckATrack, deckBTrack, dualPlan, {
            videoBlendMode,
            videoLayerOpacity,
          });
        } else if (deckATrack || crate[0]) {
          const single = deckATrack ?? crate[0];
          schedule = buildCrateSetSchedule([single], {
            triggerMode: 'beats',
            transitionStyle,
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
        });

        autoSetVideoResolverRef.current?.dispose();
        autoSetVideoResolverRef.current = createDjVideoFrameResolver(schedule);
        offlineSetAnalyzerRef.current = new OfflineAudioAnalyzer(rendered.audioBuffer, 2048);

        setRenderedSchedule(schedule);
        setRenderedMixBuffer(rendered.audioBuffer);
        setRenderedPeaks(rendered.waveformPeaks);
        setAutoSetTime(0);
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

        setStatusMessage(
          `Mixed ${schedule.segments.length} tracks (${schedule.totalDurationSec.toFixed(1)}s · ${schedule.mergedLyrics.length} synced lyrics · ${transitionStyle}).`
        );

        if (autoPlayAfterRender) {
          await startAutoSetFromTime(0, rendered.audioBuffer);
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
    waveBuf.fill(128);
    lpWaveBuf.fill(128);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTs) / 1000));
      lastTs = now;

      // Update live deck playheads (skip while active scratch session drives playhead directly)
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
        setDeckATime(t);
      }

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
        setDeckBTime(t);
      }

      // Update Auto-Set timeline playhead
      let stageTime = autoSetTimeRef.current;
      if (isAutoSetPlayingRef.current) {
        const elapsed = (now - autoSetStartPerfRef.current) / 1000;
        stageTime = autoSetStartOffsetRef.current + elapsed;
        setAutoSetTime(stageTime);
      } else if (
        deckAPlayingRef.current ||
        deckBPlayingRef.current ||
        deckAScratchingRef.current ||
        deckBScratchingRef.current
      ) {
        stageTime =
          (crossfaderRef.current > 0.25 && (deckBPlayingRef.current || deckBScratchingRef.current)) ||
          (deckBScratchingRef.current && !deckAScratchingRef.current && !deckAPlayingRef.current)
            ? deckBTimeRef.current
            : deckATimeRef.current;
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
        deckAPlayingRef.current ||
        deckBPlayingRef.current ||
        deckAScratchingRef.current ||
        deckBScratchingRef.current ||
        loopDeckPlayingRef.current;
      if (analyserRef.current && isAnyPlaying) {
        analyserRef.current.getByteFrequencyData(freqBuf);
        analyserRef.current.getByteTimeDomainData(waveBuf);
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
    : deckAPlaying || deckBPlaying
      ? crossfader > 0.25 && deckBPlaying
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
                <p className="text-[10px] text-slate-400 font-mono tabular-nums whitespace-nowrap">
                  Master {masterBpmDisplay} BPM · {crate.length} Track{crate.length === 1 ? '' : 's'}
                </p>
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
                setAutoSetTime(t);
                if (isAutoSetPlaying && renderedMixBuffer) {
                  void startAutoSetFromTime(t, renderedMixBuffer);
                } else if (deckATrack) {
                  setDeckATime(Math.min(deckATrack.duration, t));
                  if (deckAPlaying) void startLiveDeckFromTime('A', Math.min(deckATrack.duration, t));
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
                          const next = parseFloat(e.target.value);
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
                      ? `Deck A ${getEffectiveBpm(deckATrack)} BPM (${(60 / getEffectiveBpm(deckATrack)).toFixed(3)}s/beat) · Deck B ${getEffectiveBpm(deckBTrack)} BPM (${(dualPlan.deckBPlaybackRate * 100).toFixed(1)}% sync) · Overlap ${dualPlan.overlapDurationSec.toFixed(2)}s (${crossfadeBeats} beats)`
                      : 'Load two tracks to visualize beat-locked waveform overlap and auto-calculate BPM transition timing'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
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
              plan={dualPlan}
              zoomMode={crossfadeZoomMode}
              playheadSec={autoSetTime}
              showBeatGrid={showBeatGridOverlay}
              beatGridSubdivision={beatGridSubdivision}
              onSeekTimeline={async (t) => {
                setAutoSetTime(t);
                if (renderedMixBuffer) {
                  await startAutoSetFromTime(t, renderedMixBuffer);
                } else if (deckATrack && deckBTrack) {
                  const res = await buildAndRenderSet('dual', false);
                  if (res?.rendered.audioBuffer) {
                    await startAutoSetFromTime(t, res.rendered.audioBuffer);
                  }
                }
              }}
            />

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
                    <div className="flex items-center gap-1.5">
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
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSyncDeckBpm('A')}
                      disabled={!deckATrack || !deckBTrack}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 border border-cyan-400/40 cursor-pointer disabled:opacity-35"
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
                        setDeckATime(deckATrack.dropTime);
                        if (deckAPlaying) void startLiveDeckFromTime('A', deckATrack.dropTime);
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
                        onClick={() => setDeckAWaveformView('overview')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckAWaveformView === 'overview'
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeckAWaveformView('zoom')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckAWaveformView === 'zoom'
                            ? 'bg-cyan-500/20 text-cyan-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        8B Grid
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
                          if (next) setDeckAWaveformView('zoom');
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

                <TriBandWaveformCanvas
                  track={deckATrack}
                  playheadSec={deckATime}
                  accentHex="#22d3ee"
                  cueTimeSec={deckAOutTime ?? deckATrack?.recommendedOutTime ?? null}
                  cueLabel="MIX OUT"
                  showBeatGrid={showBeatGridOverlay}
                  beatGridSubdivision={beatGridSubdivision}
                  viewMode={deckAWaveformView}
                  isGridEditMode={deckAGridEditorOpen}
                  isScratchMode={!deckAGridEditorOpen && deckAScratchEnabled}
                  isScratching={deckAScratching}
                  scratchRate={deckAScratchRate}
                  scratchSensitivitySec={scratchSensitivitySec}
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
                            setDeckAOutLyricId(line.id);
                            setDeckAOutTime(line.time);
                            setTriggerMode('lyrics');
                            setDeckATime(line.time);
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
                    <div className="flex items-center gap-1.5">
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
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSyncDeckBpm('B')}
                      disabled={!deckATrack || !deckBTrack}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 cursor-pointer disabled:opacity-35"
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
                        setDeckBTime(deckBTrack.dropTime);
                        if (deckBPlaying) void startLiveDeckFromTime('B', deckBTrack.dropTime);
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
                        onClick={() => setDeckBWaveformView('overview')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckBWaveformView === 'overview'
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Overview
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeckBWaveformView('zoom')}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-medium cursor-pointer ${
                          deckBWaveformView === 'zoom'
                            ? 'bg-amber-500/20 text-amber-200'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        8B Grid
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
                          if (next) setDeckBWaveformView('zoom');
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

                <TriBandWaveformCanvas
                  track={deckBTrack}
                  playheadSec={deckBTime}
                  accentHex="#f59e0b"
                  cueTimeSec={deckBInTime ?? 0}
                  cueLabel="MIX IN"
                  showBeatGrid={showBeatGridOverlay}
                  beatGridSubdivision={beatGridSubdivision}
                  viewMode={deckBWaveformView}
                  isGridEditMode={deckBGridEditorOpen}
                  isScratchMode={!deckBGridEditorOpen && deckBScratchEnabled}
                  isScratching={deckBScratching}
                  scratchRate={deckBScratchRate}
                  scratchSensitivitySec={scratchSensitivitySec}
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
                            setDeckBInLyricId(line.id);
                            setDeckBInTime(line.time);
                            setTriggerMode('lyrics');
                            setDeckBTime(line.time);
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
                            {track.artist} · {getEffectiveBpm(track)} BPM · {formatDjClock(track.duration)} · {track.beatTimes.length} beats · {track.lyrics.length} lyrics
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
