import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bell,
  BellOff,
  BellRing,
  Bookmark,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  Film,
  FolderArchive,
  Layers,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Scissors,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  ASPECT_RATIOS,
  AspectRatioKey,
  AudioBitrateKbps,
  BatchCompletionSummary,
  BatchExportJob,
  EXPORT_BITRATE_PRESETS,
  ExportProfile,
  ExportProgressState,
  ExportResolution,
  FadeType,
  LyricStyle,
  resolveExportDimensions,
  SavedPreset,
  StudioSettings,
  VisualizerMode,
} from '../types/studio';
import { computeAutoArrangeFraming } from '../utils/autoArrange';
import { exportCompletedBatchToZip } from '../utils/batchZipExport';
import type { BrowserNotificationPermission } from '../utils/batchNotifications';
import {
  estimateMp4SizeMb,
  exportProfileToSettingsPatch,
  findMatchingExportProfile,
  formatExportProfileMeta,
} from '../utils/exportProfiles';
import { formatShortTime, parseTimeInput } from '../utils/lrcParser';
import { sanitizeFileName } from '../utils/mp4Exporter';
import {
  BrowserExportCapabilities,
  probeBrowserExportCapabilities,
} from '../utils/videoMimeSupport';
import { BatchSummaryCard } from './BatchSummaryCard';

export type ExportModalView = 'single' | 'batch';

interface ExportModalProps {
  isOpen: boolean;
  view: ExportModalView;
  onViewChange: (view: ExportModalView) => void;
  state: ExportProgressState;
  onCancel: () => void;
  onClose: () => void;
  duration: number;
  currentTrimStart: number;
  currentTrimEnd: number;
  currentSettings: StudioSettings;
  savedPresets: SavedPreset[];
  exportProfiles: ExportProfile[];
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onApplyExportProfile: (
    profile: ExportProfile,
    autoArrangeOnRatioChange?: boolean
  ) => void;
  onSaveExportProfile: (name: string, targetSettings: StudioSettings) => ExportProfile;
  onDeleteExportProfile: (id: string) => void;
  batchJobs: BatchExportJob[];
  isBatchRunning: boolean;
  autoDownloadBatch: boolean;
  onToggleAutoDownloadBatch: (value: boolean) => void;
  notifyOnBatchComplete: boolean;
  notificationPermission: BrowserNotificationPermission;
  batchCompletionBanner: BatchCompletionSummary | null;
  onToggleNotifyOnBatchComplete: (value: boolean) => void;
  onRequestNotificationPermission: () => void;
  onDismissBatchCompletionBanner: () => void;
  onAddBatchJobs: (
    jobs: Array<{
      label: string;
      trimStart: number;
      trimEnd: number;
      settings: StudioSettings;
    }>
  ) => void;
  onUpdateBatchJob: (
    id: string,
    patch: Partial<
      Pick<BatchExportJob, 'label' | 'trimStart' | 'trimEnd' | 'settings' | 'status'>
    >
  ) => void;
  onMoveBatchJob: (id: string, direction: 'up' | 'down') => void;
  onDuplicateBatchJob: (id: string) => void;
  onRemoveBatchJob: (id: string) => void;
  onPreviewBatchJob: (job: BatchExportJob) => void;
  onClearBatchJobs: (scope: 'completed' | 'all') => void;
  onStartBatchExport: () => void;
  onDownloadAllBatch: () => void;
  onStartSingleExport: () => void;
  onShareSingle: () => void;
  onShareBatchJob: (job: BatchExportJob) => void;
}

const VISUALIZER_OPTIONS: Array<{ id: VisualizerMode; label: string }> = [
  { id: 'mirrored-bars', label: 'Mirrored Bars' },
  { id: 'circular-ring', label: 'Circular Ring' },
  { id: 'neon-wave', label: 'Neon Wave' },
  { id: 'hybrid-particles', label: 'Hybrid + Particles' },
  { id: 'dual-ribbon', label: 'Aurora Ribbons' },
  { id: 'led-matrix', label: 'LED Matrix' },
  { id: 'harmonic-orb', label: 'Harmonic Orbital' },
  { id: 'stereo-prism', label: 'Stereo Prism' },
  { id: 'cube-3d', label: '3D Cube' },
  { id: 'galaxy-spiral', label: 'Galaxy Vortex' },
  { id: 'cyber-tunnel', label: 'Warp Tunnel' },
  { id: 'seismic-ridges', label: 'Seismic Ridges' },
  { id: 'dna-helix', label: 'DNA Helix' },
  { id: 'radar-sonar', label: 'Sonar Radar' },
  { id: 'lissajous-scope', label: 'Lissajous Scope' },
  { id: 'rain-matrix', label: 'Digital Rain' },
  { id: 'flower-mandala', label: 'Lotus Mandala' },
  { id: 'vortex-rings', label: '3D Gyroscope' },
  { id: 'isometric-city', label: 'Iso Equalizer' },
  { id: 'analog-vu', label: 'Dual VU Meters' },
  { id: 'kaleido-shards', label: 'Kaleidoscope' },
  { id: 'flame-corona', label: 'Solar Corona' },
];

const LYRIC_STYLE_OPTIONS: Array<{ id: LyricStyle; label: string }> = [
  { id: 'karaoke', label: 'Karaoke' },
  { id: 'single-pop', label: 'Single Pop' },
  { id: 'subtitle-bar', label: 'Subtitle Bar' },
];

const FADE_TYPE_LABELS: Record<FadeType, string> = {
  linear: 'Linear',
  logarithmic: 'Logarithmic',
  exponential: 'Exponential',
};

function buildSuggestedJobFileName(job: BatchExportJob, index: number): string {
  const base = sanitizeFileName(job.label || job.settings.trackTitle || `clip-${index + 1}`);
  const ratioSlug = job.settings.aspectRatio.replace(':', 'x');
  return `${base}-${ratioSlug}.mp4`;
}

interface BatchJobRowProps {
  job: BatchExportJob;
  index: number;
  total: number;
  duration: number;
  globalSettings: StudioSettings;
  isBatchRunning: boolean;
  savedPresets: SavedPreset[];
  exportProfiles: ExportProfile[];
  onUpdate: (
    patch: Partial<
      Pick<BatchExportJob, 'label' | 'trimStart' | 'trimEnd' | 'settings' | 'status'>
    >
  ) => void;
  onMove: (direction: 'up' | 'down') => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onPreview: () => void;
  onShare: () => void;
}

function BatchJobRow({
  job,
  index,
  total,
  duration,
  globalSettings,
  isBatchRunning,
  savedPresets,
  exportProfiles,
  onUpdate,
  onMove,
  onDuplicate,
  onRemove,
  onPreview,
  onShare,
}: BatchJobRowProps) {
  const [startText, setStartText] = useState(formatShortTime(job.trimStart));
  const [endText, setEndText] = useState(formatShortTime(job.trimEnd));

  useEffect(() => {
    setStartText(formatShortTime(job.trimStart));
  }, [job.trimStart]);

  useEffect(() => {
    setEndText(formatShortTime(job.trimEnd));
  }, [job.trimEnd]);

  const isLocked = isBatchRunning || job.status === 'rendering' || job.status === 'completed';
  const clipLen = Math.max(0, job.trimEnd - job.trimStart);
  const ratioDims = resolveExportDimensions(
    job.settings.aspectRatio,
    job.settings.exportResolution
  );
  const matchedProfile = findMatchingExportProfile(job.settings, exportProfiles);

  const commitStart = () => {
    const parsed = parseTimeInput(startText);
    if (parsed === null) {
      setStartText(formatShortTime(job.trimStart));
      return;
    }
    const maxStart = Math.max(0, job.trimEnd - 0.5);
    const clamped = Number(Math.max(0, Math.min(parsed, maxStart)).toFixed(2));
    onUpdate({ trimStart: clamped });
    setStartText(formatShortTime(clamped));
  };

  const commitEnd = () => {
    const parsed = parseTimeInput(endText);
    if (parsed === null) {
      setEndText(formatShortTime(job.trimEnd));
      return;
    }
    const minEnd = Math.min(duration, job.trimStart + 0.5);
    const clamped = Number(Math.max(minEnd, Math.min(parsed, duration)).toFixed(2));
    onUpdate({ trimEnd: clamped });
    setEndText(formatShortTime(clamped));
  };

  const filePreview = job.downloadFileName || buildSuggestedJobFileName(job, index);

  return (
    <div
      className={`rounded-lg border p-3 transition-colors ${
        job.status === 'rendering'
          ? 'bg-cyan-500/[0.06] border-cyan-400/40'
          : job.status === 'completed'
          ? 'bg-emerald-500/[0.04] border-emerald-500/25'
          : job.status === 'error'
          ? 'bg-rose-500/[0.05] border-rose-500/30'
          : 'bg-[#090b10] border-white/[0.08]'
      }`}
    >
      {/* Top Row: Status + Editable Label + Actions */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div
            className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 text-[11px] font-mono tabular-nums ${
              job.status === 'rendering'
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                : job.status === 'completed'
                ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                : job.status === 'error'
                ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                : 'bg-[#121620] border-white/[0.08] text-slate-400'
            }`}
          >
            {job.status === 'rendering' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : job.status === 'completed' ? (
              <CheckCircle2 className="w-3.5 h-3.5" />
            ) : job.status === 'error' ? (
              <AlertTriangle className="w-3.5 h-3.5" />
            ) : (
              index + 1
            )}
          </div>

          <div className="min-w-0 flex-1 flex items-center gap-2">
            <input
              type="text"
              value={job.label}
              disabled={isLocked}
              onChange={(e) => onUpdate({ label: e.target.value })}
              aria-label={`Job ${index + 1} label`}
              placeholder={`Export Item ${index + 1}`}
              className="w-full max-w-[240px] bg-transparent border border-transparent hover:border-white/[0.08] focus:border-cyan-400/50 focus:bg-[#121620] rounded px-1.5 py-0.5 text-xs font-medium text-slate-100 outline-none disabled:opacity-80"
            />
            <span className="hidden sm:inline-block text-[10px] font-mono text-slate-500 truncate">
              {filePreview}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] font-mono tabular-nums text-cyan-400 mr-1.5">
            {clipLen.toFixed(1)}s
          </span>

          {job.status === 'completed' && job.downloadUrl && job.downloadFileName && (
            <>
              <button
                type="button"
                onClick={onShare}
                title="Share to YouTube, TikTok, Facebook, Instagram, X"
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Share2 className="w-3 h-3" />
                <span>Share</span>
              </button>
              <a
                href={job.downloadUrl}
                download={job.downloadFileName}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-400 hover:bg-emerald-300 text-[#090b10] transition-colors flex items-center gap-1"
              >
                <Download className="w-3 h-3" />
                <span>MP4</span>
              </a>
            </>
          )}

          {(job.status === 'error' || job.status === 'cancelled') && !isBatchRunning && (
            <button
              type="button"
              onClick={() => onUpdate({ status: 'queued' })}
              title="Re-queue this item"
              className="px-2 py-1 rounded-md text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Retry</span>
            </button>
          )}

          {!isBatchRunning && (
            <>
              <button
                type="button"
                onClick={onPreview}
                title="Apply this job's trim and settings to the main canvas"
                className="px-2 py-1 rounded-md text-[11px] font-medium bg-cyan-500/12 hover:bg-cyan-500/22 text-cyan-300 border border-cyan-400/30 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
              >
                <Eye className="w-3 h-3" />
                <span>Preview Job</span>
              </button>
              <button
                type="button"
                onClick={() => onMove('up')}
                disabled={index === 0}
                title="Move up"
                aria-label="Move job up"
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMove('down')}
                disabled={index === total - 1}
                title="Move down"
                aria-label="Move job down"
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] disabled:opacity-25 disabled:pointer-events-none cursor-pointer"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDuplicate}
                title="Duplicate item"
                aria-label="Duplicate job"
                className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.07] cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onRemove}
                title="Remove from queue"
                aria-label="Remove job"
                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Config Row */}
      <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-6 gap-2 items-center">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Start</span>
          <input
            type="text"
            value={startText}
            disabled={isLocked}
            onChange={(e) => setStartText(e.target.value)}
            onBlur={commitStart}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitStart();
            }}
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-2 py-1 text-[11px] font-mono tabular-nums text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">End</span>
          <input
            type="text"
            value={endText}
            disabled={isLocked}
            onChange={(e) => setEndText(e.target.value)}
            onBlur={commitEnd}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitEnd();
            }}
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-2 py-1 text-[11px] font-mono tabular-nums text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          />
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Ratio</span>
          <select
            value={job.settings.aspectRatio}
            disabled={isLocked}
            onChange={(e) =>
              onUpdate({
                settings: {
                  ...job.settings,
                  aspectRatio: e.target.value as AspectRatioKey,
                },
              })
            }
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-1.5 py-1 text-[11px] text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
            <option value="1:1">1:1</option>
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Visualizer</span>
          <select
            value={job.settings.visualizerMode}
            disabled={isLocked}
            onChange={(e) =>
              onUpdate({
                settings: {
                  ...job.settings,
                  visualizerMode: e.target.value as VisualizerMode,
                },
              })
            }
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-1.5 py-1 text-[11px] text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          >
            {VISUALIZER_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Lyrics</span>
          <select
            value={job.settings.lyricStyle}
            disabled={isLocked}
            onChange={(e) =>
              onUpdate({
                settings: {
                  ...job.settings,
                  lyricStyle: e.target.value as LyricStyle,
                },
              })
            }
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-1.5 py-1 text-[11px] text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          >
            {LYRIC_STYLE_OPTIONS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Variant Options</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isLocked}
              onClick={() =>
                onUpdate({
                  settings: {
                    ...job.settings,
                    beatDetection: !job.settings.beatDetection,
                  },
                })
              }
              title="Toggle beat detection bursts"
              className={`px-2 py-1 rounded border text-[10px] font-medium transition-colors cursor-pointer disabled:opacity-55 ${
                job.settings.beatDetection
                  ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                  : 'bg-[#121620] border-white/[0.08] text-slate-400'
              }`}
            >
              {job.settings.beatDetection ? 'Beat On' : 'Beat Off'}
            </button>

            <select
              value={job.settings.fadeType}
              disabled={isLocked}
              aria-label="Boundary fade curve"
              title="0.15s boundary fade curve"
              onChange={(e) =>
                onUpdate({
                  settings: {
                    ...job.settings,
                    fadeType: e.target.value as FadeType,
                  },
                })
              }
              className="rounded bg-[#121620] border border-white/[0.08] px-1 py-1 text-[10px] text-slate-300 focus:border-cyan-400/60 outline-none disabled:opacity-55"
            >
              <option value="linear">Linear</option>
              <option value="logarithmic">Log</option>
              <option value="exponential">Exp</option>
            </select>

            <div
              className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-[#121620] border border-white/[0.08]"
              title={`${ratioDims.width}×${ratioDims.height} · ${job.settings.exportFps}fps · ${job.settings.videoBitrateMbps} Mbps`}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm border border-white/15"
                style={{ backgroundColor: job.settings.primaryColor }}
              />
              <span
                className="w-2.5 h-2.5 rounded-sm border border-white/15"
                style={{ backgroundColor: job.settings.secondaryColor }}
              />
            </div>

            {savedPresets.length > 0 && (
              <select
                value=""
                disabled={isLocked}
                aria-label="Apply saved preset to job"
                onChange={(e) => {
                  const found = savedPresets.find((p) => p.id === e.target.value);
                  if (found) {
                    onUpdate({
                      settings: {
                        ...found.settings,
                        trackTitle:
                          job.settings.trackTitle || found.settings.trackTitle,
                        artistName:
                          job.settings.artistName || found.settings.artistName,
                      },
                    });
                  }
                }}
                className="w-full min-w-0 rounded bg-[#121620] border border-white/[0.08] px-1 py-1 text-[10px] text-slate-300 focus:border-cyan-400/60 outline-none disabled:opacity-55"
              >
                <option value="">Visual…</option>
                {savedPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Encoding Profile / Resolution / FPS / Bitrate Row */}
      <div className="mt-2 pt-2 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-12 gap-2 items-center">
        <div className="col-span-2 sm:col-span-5 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Export Profile</span>
          <select
            value={matchedProfile?.id ?? ''}
            disabled={isLocked}
            aria-label={`Job ${index + 1} export profile`}
            onChange={(e) => {
              const found = exportProfiles.find((p) => p.id === e.target.value);
              if (found) {
                onUpdate({
                  settings: {
                    ...job.settings,
                    ...exportProfileToSettingsPatch(found),
                  },
                });
              }
            }}
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-1.5 py-1 text-[11px] text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          >
            <option value="">Custom ({ratioDims.width}×{ratioDims.height})</option>
            {exportProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        <label className="sm:col-span-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Resolution</span>
          <select
            value={job.settings.exportResolution}
            disabled={isLocked}
            onChange={(e) =>
              onUpdate({
                settings: {
                  ...job.settings,
                  exportResolution: e.target.value as ExportResolution,
                },
              })
            }
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-1.5 py-1 text-[11px] font-mono tabular-nums text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          >
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="1440p">1440p</option>
          </select>
        </label>

        <label className="sm:col-span-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Frame Rate</span>
          <select
            value={job.settings.exportFps}
            disabled={isLocked}
            onChange={(e) =>
              onUpdate({
                settings: {
                  ...job.settings,
                  exportFps: Number(e.target.value) === 60 ? 60 : 30,
                },
              })
            }
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-1.5 py-1 text-[11px] font-mono tabular-nums text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          >
            <option value={30}>30 FPS</option>
            <option value={60}>60 FPS</option>
          </select>
        </label>

        <label className="col-span-2 sm:col-span-3 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">
            Bitrate ({ratioDims.width}×{ratioDims.height})
          </span>
          <select
            value={job.settings.bitratePreset}
            disabled={isLocked}
            onChange={(e) => {
              const presetId = e.target.value as Exclude<StudioSettings['bitratePreset'], 'custom'>;
              const found = EXPORT_BITRATE_PRESETS.find((b) => b.id === presetId);
              if (found) {
                onUpdate({
                  settings: {
                    ...job.settings,
                    bitratePreset: found.id,
                    videoBitrateMbps: found.videoBitrateMbps,
                    audioBitrateKbps: found.audioBitrateKbps,
                  },
                });
              }
            }}
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-1.5 py-1 text-[11px] font-mono tabular-nums text-slate-200 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          >
            {EXPORT_BITRATE_PRESETS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label} ({b.videoBitrateMbps}M)
              </option>
            ))}
            {job.settings.bitratePreset === 'custom' && (
              <option value="custom">Custom ({job.settings.videoBitrateMbps}M)</option>
            )}
          </select>
        </label>
      </div>

      {/* Per-Job Track Metadata Override Row */}
      <div className="mt-2 pt-2 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div className="sm:col-span-5 flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`batch-title-${job.id}`}
              className="text-[10px] text-slate-500"
            >
              Track Title Override
            </label>
            {job.settings.trackTitle !== globalSettings.trackTitle && !isLocked && (
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    settings: {
                      ...job.settings,
                      trackTitle: globalSettings.trackTitle,
                    },
                  })
                }
                className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          <input
            id={`batch-title-${job.id}`}
            type="text"
            value={job.settings.trackTitle}
            disabled={isLocked}
            onChange={(e) =>
              onUpdate({
                settings: {
                  ...job.settings,
                  trackTitle: e.target.value,
                },
              })
            }
            placeholder={globalSettings.trackTitle || 'Override track title...'}
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          />
        </div>

        <div className="sm:col-span-5 flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-2">
            <label
              htmlFor={`batch-artist-${job.id}`}
              className="text-[10px] text-slate-500"
            >
              Artist Name Override
            </label>
            {job.settings.artistName !== globalSettings.artistName && !isLocked && (
              <button
                type="button"
                onClick={() =>
                  onUpdate({
                    settings: {
                      ...job.settings,
                      artistName: globalSettings.artistName,
                    },
                  })
                }
                className="text-[10px] text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          <input
            id={`batch-artist-${job.id}`}
            type="text"
            value={job.settings.artistName}
            disabled={isLocked}
            onChange={(e) =>
              onUpdate({
                settings: {
                  ...job.settings,
                  artistName: e.target.value,
                },
              })
            }
            placeholder={globalSettings.artistName || 'Override artist name...'}
            className="w-full rounded bg-[#121620] border border-white/[0.08] px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 outline-none disabled:opacity-60"
          />
        </div>

        <div className="sm:col-span-2 flex flex-col gap-0.5">
          <span className="text-[10px] text-slate-500">Text Overlay</span>
          <button
            type="button"
            disabled={isLocked}
            onClick={() =>
              onUpdate({
                settings: {
                  ...job.settings,
                  showTrackOverlay: !job.settings.showTrackOverlay,
                },
              })
            }
            title="Show or hide track title and artist overlay for this export"
            className={`w-full px-2 py-1 rounded border text-[10px] font-medium transition-colors cursor-pointer whitespace-nowrap disabled:opacity-55 ${
              job.settings.showTrackOverlay
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                : 'bg-[#121620] border-white/[0.08] text-slate-400'
            }`}
          >
            {job.settings.showTrackOverlay ? 'Shown' : 'Hidden'}
          </button>
        </div>
      </div>

      {/* Per-Job Progress / Status Footer */}
      {(job.status === 'rendering' ||
        job.status === 'completed' ||
        job.status === 'error' ||
        job.status === 'cancelled') && (
        <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
          {job.status === 'error' ? (
            <p className="text-[11px] text-rose-300">
              {job.error || 'Encoding failed for this job.'}
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="text-slate-300 truncate pr-2">{job.message}</span>
                <span className="font-mono tabular-nums text-cyan-300 shrink-0">
                  {job.percentage}%
                  {job.totalFrames > 0 && ` · ${job.currentFrame}/${job.totalFrames}f`}
                  {job.elapsedMs !== undefined && ` · ${(job.elapsedMs / 1000).toFixed(1)}s`}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden">
                <div
                  className={`h-full transition-[width] duration-150 ${
                    job.status === 'completed'
                      ? 'bg-emerald-400'
                      : job.status === 'cancelled'
                      ? 'bg-slate-500'
                      : 'bg-cyan-400'
                  }`}
                  style={{ width: `${job.percentage}%` }}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function ExportModal({
  isOpen,
  view,
  onViewChange,
  state,
  onCancel,
  onClose,
  duration,
  currentTrimStart,
  currentTrimEnd,
  currentSettings,
  savedPresets,
  exportProfiles,
  onUpdateSettings,
  onApplyExportProfile,
  onSaveExportProfile,
  onDeleteExportProfile,
  batchJobs,
  isBatchRunning,
  autoDownloadBatch,
  onToggleAutoDownloadBatch,
  notifyOnBatchComplete,
  notificationPermission,
  batchCompletionBanner,
  onToggleNotifyOnBatchComplete,
  onRequestNotificationPermission,
  onDismissBatchCompletionBanner,
  onAddBatchJobs,
  onUpdateBatchJob,
  onMoveBatchJob,
  onDuplicateBatchJob,
  onRemoveBatchJob,
  onPreviewBatchJob,
  onClearBatchJobs,
  onStartBatchExport,
  onDownloadAllBatch,
  onStartSingleExport,
  onShareSingle,
  onShareBatchJob,
}: ExportModalProps) {
  const [profileNameInput, setProfileNameInput] = useState('');
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [autoArrangeOnProfileRatio, setAutoArrangeOnProfileRatio] = useState(true);
  const [exportCaps, setExportCaps] = useState<BrowserExportCapabilities | null>(null);
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [zipProgressPct, setZipProgressPct] = useState(0);
  const [zipNotice, setZipNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void probeBrowserExportCapabilities().then((caps) => {
      if (!cancelled) setExportCaps(caps);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!profileNotice) return;
    const t = window.setTimeout(() => setProfileNotice(null), 2600);
    return () => window.clearTimeout(t);
  }, [profileNotice]);

  if (!isOpen) return null;

  const activeContainerLabel = exportCaps
    ? exportCaps.extension.toUpperCase()
    : 'MP4';
  const activeFormatSummary = exportCaps
    ? exportCaps.label
    : 'MP4 (H.264 + AAC)';

  const isSingleRunning =
    state.status === 'preparing' ||
    state.status === 'rendering' ||
    state.status === 'muxing';
  const isAnyRunning = isSingleRunning || isBatchRunning || isExportingZip;
  const matchedActiveProfile = findMatchingExportProfile(currentSettings, exportProfiles);
  const resolvedSingleDims = resolveExportDimensions(
    currentSettings.aspectRatio,
    currentSettings.exportResolution
  );
  const clipDurationSec = Math.max(0, currentTrimEnd - currentTrimStart);
  const estimatedSizeMb = estimateMp4SizeMb(
    clipDurationSec,
    currentSettings.videoBitrateMbps,
    currentSettings.audioBitrateKbps
  );

  const pendingBatchJobs = batchJobs.filter(
    (j) => j.status === 'queued' || j.status === 'error' || j.status === 'cancelled'
  );
  const completedBatchJobs = batchJobs.filter(
    (j) => j.status === 'completed' && Boolean(j.downloadUrl)
  );

  // Overall batch progress calculation
  const batchTotalPct =
    batchJobs.length > 0
      ? Math.round(
          batchJobs.reduce((acc, j) => {
            if (j.status === 'completed') return acc + 100;
            if (j.status === 'rendering') return acc + j.percentage;
            return acc;
          }, 0) / batchJobs.length
        )
      : 0;
  const activeBatchIndex = batchJobs.findIndex((j) => j.status === 'rendering');

  const handleAddCurrentSetup = () => {
    const startLabel = formatShortTime(currentTrimStart);
    const endLabel = formatShortTime(currentTrimEnd);
    const modeLabel =
      VISUALIZER_OPTIONS.find((v) => v.id === currentSettings.visualizerMode)?.label ??
      currentSettings.visualizerMode;
    onAddBatchJobs([
      {
        label: `${modeLabel} (${startLabel}-${endLabel})`,
        trimStart: currentTrimStart,
        trimEnd: currentTrimEnd,
        settings: { ...currentSettings },
      },
    ]);
  };

  const handleAddAllVisualizers = () => {
    onAddBatchJobs(
      VISUALIZER_OPTIONS.map((v) => ({
        label: v.label,
        trimStart: currentTrimStart,
        trimEnd: currentTrimEnd,
        settings: {
          ...currentSettings,
          visualizerMode: v.id,
        },
      }))
    );
  };

  const handleAddAllAspectRatios = () => {
    const ratios: AspectRatioKey[] = ['16:9', '9:16', '1:1'];
    onAddBatchJobs(
      ratios.map((ratio) => ({
        label: ASPECT_RATIOS[ratio].label,
        trimStart: currentTrimStart,
        trimEnd: currentTrimEnd,
        settings: {
          ...currentSettings,
          aspectRatio: ratio,
        },
      }))
    );
  };

  const handleSplitSegments = (segmentSec: number) => {
    if (duration <= 0) return;
    const jobs: Array<{
      label: string;
      trimStart: number;
      trimEnd: number;
      settings: StudioSettings;
    }> = [];
    let cursor = 0;
    let part = 1;
    while (cursor < duration - 0.5 && jobs.length < 24) {
      const nextEnd = Math.min(duration, Number((cursor + segmentSec).toFixed(2)));
      if (nextEnd - cursor >= 0.5) {
        jobs.push({
          label: `Part ${part} (${formatShortTime(cursor)}-${formatShortTime(nextEnd)})`,
          trimStart: Number(cursor.toFixed(2)),
          trimEnd: nextEnd,
          settings: { ...currentSettings },
        });
      }
      cursor = nextEnd;
      part += 1;
    }
    if (jobs.length > 0) {
      onAddBatchJobs(jobs);
    }
  };

  const handleSaveCurrentProfile = () => {
    const created = onSaveExportProfile(profileNameInput, currentSettings);
    setProfileNameInput('');
    setProfileNotice(`Saved profile "${created.name}"`);
  };

  const handleQueueWithProfile = (profile: ExportProfile) => {
    const ratioChanged = profile.aspectRatio !== currentSettings.aspectRatio;
    const baseSettings: StudioSettings = {
      ...currentSettings,
      ...exportProfileToSettingsPatch(profile),
    };
    const finalSettings =
      ratioChanged && autoArrangeOnProfileRatio
        ? {
            ...baseSettings,
            ...computeAutoArrangeFraming(baseSettings, false).patch,
          }
        : baseSettings;
    onAddBatchJobs([
      {
        label: profile.name,
        trimStart: currentTrimStart,
        trimEnd: currentTrimEnd,
        settings: finalSettings,
      },
    ]);
  };

  const handleExportBatchToFolder = async () => {
    if (isExportingZip || isBatchRunning || completedBatchJobs.length === 0) return;
    setIsExportingZip(true);
    setZipProgressPct(0);
    setZipNotice(null);
    try {
      const result = await exportCompletedBatchToZip({
        jobs: completedBatchJobs,
        trackTitle: currentSettings.trackTitle,
        onProgress: (p) => {
          setZipProgressPct(p.percentage);
        },
      });
      const sizeMb = (result.totalBytes / (1024 * 1024)).toFixed(1);
      setZipNotice({
        type: 'success',
        text: `Archived ${result.fileCount} ${
          result.fileCount === 1 ? 'video' : 'videos'
        } into ${result.zipFileName} (${sizeMb} MB)`,
      });
    } catch (err) {
      setZipNotice({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Failed to create ZIP archive of completed videos.',
      });
    } finally {
      setIsExportingZip(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div
        className={`w-full rounded-xl bg-[#121620] border border-white/[0.1] shadow-2xl flex flex-col max-h-[90vh] transition-[max-width] duration-150 ${
          view === 'batch' ? 'max-w-4xl' : 'max-w-xl'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 ${
                view === 'single' && state.status === 'error'
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                  : view === 'single' && state.status === 'completed'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-cyan-500/10 border-cyan-400/30 text-cyan-400'
              }`}
            >
              {view === 'batch' ? (
                <Layers className="w-4 h-4" />
              ) : state.status === 'error' ? (
                <AlertTriangle className="w-4 h-4" />
              ) : state.status === 'completed' ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <Film className="w-4 h-4" />
              )}
            </div>
            <div className="min-w-0">
              <h3 id="export-modal-title" className="text-sm font-semibold text-slate-100">
                {view === 'batch'
                  ? 'Batch Export Queue'
                  : state.status === 'completed'
                  ? `${
                      state.downloadFileName?.toLowerCase().endsWith('.webm')
                        ? 'WebM'
                        : 'MP4'
                    } Export Complete`
                  : state.status === 'error'
                  ? 'Export Failed'
                  : state.status === 'cancelled'
                  ? 'Export Cancelled'
                  : state.status === 'idle'
                  ? `Export ${activeContainerLabel}`
                  : `Rendering Offline ${activeContainerLabel}`}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {view === 'batch'
                  ? `${batchJobs.length} ${
                      batchJobs.length === 1 ? 'item' : 'items'
                    } queued · Sequential ${activeFormatSummary}`
                  : state.status === 'completed'
                  ? state.downloadFileName
                  : `${
                      exportCaps?.pipeline === 'mediarecorder'
                        ? 'MediaRecorder compatibility pipeline'
                        : 'WebCodecs hardware pipeline'
                    } · ${activeFormatSummary}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Mode Switcher (locked while an export is actively running) */}
            {!isAnyRunning && (
              <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => onViewChange('single')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                    view === 'single'
                      ? 'bg-white/[0.1] text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Single
                </button>
                <button
                  type="button"
                  onClick={() => onViewChange('batch')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    view === 'batch'
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Batch Queue</span>
                  {batchJobs.length > 0 && (
                    <span className="font-mono tabular-nums text-[10px] text-cyan-400">
                      ({batchJobs.length})
                    </span>
                  )}
                </button>
              </div>
            )}

            {!isAnyRunning && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close export modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        {view === 'single' ? (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="flex-1 min-h-0 overflow-y-auto studio-scroll p-5 space-y-4">
              {state.status === 'idle' && (
                <>
                  {/* Export Profiles Picker & Save */}
                  <section className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <Bookmark className="w-3.5 h-3.5 text-cyan-400" />
                        <h4 className="text-xs font-semibold text-slate-200">
                          Export Profiles
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400 truncate">
                        {matchedActiveProfile
                          ? matchedActiveProfile.name
                          : 'Custom Configuration'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-[168px] overflow-y-auto studio-scroll pr-0.5">
                      {exportProfiles.map((profile) => {
                        const isActive = matchedActiveProfile?.id === profile.id;
                        return (
                          <div
                            key={profile.id}
                            className={`rounded-lg border transition-colors flex items-stretch ${
                              isActive
                                ? 'bg-cyan-500/12 border-cyan-400/45 text-slate-100'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                onApplyExportProfile(profile, autoArrangeOnProfileRatio);
                                setProfileNotice(`Applied "${profile.name}"`);
                              }}
                              className="flex-1 min-w-0 px-2.5 py-2 text-left cursor-pointer"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold truncate">
                                  {profile.name}
                                </span>
                                <span className="text-[10px] text-slate-500 shrink-0">
                                  {profile.isBuiltIn ? 'Preset' : 'Saved'}
                                </span>
                              </div>
                              <div className="text-[10.5px] font-mono tabular-nums text-slate-400 mt-0.5 truncate">
                                {formatExportProfileMeta(profile)}
                              </div>
                            </button>

                            {!profile.isBuiltIn && (
                              <button
                                type="button"
                                onClick={() => {
                                  onDeleteExportProfile(profile.id);
                                  setProfileNotice(`Removed "${profile.name}"`);
                                }}
                                title={`Delete profile ${profile.name}`}
                                aria-label={`Delete export profile ${profile.name}`}
                                className="px-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 border-l border-white/[0.06] transition-colors cursor-pointer shrink-0"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={autoArrangeOnProfileRatio}
                          onChange={(e) => setAutoArrangeOnProfileRatio(e.target.checked)}
                          className="accent-cyan-400 rounded cursor-pointer"
                        />
                        <span>Auto-arrange framing when aspect ratio changes</span>
                      </label>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={profileNameInput}
                        onChange={(e) => setProfileNameInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveCurrentProfile();
                        }}
                        placeholder="New profile name (e.g. TikTok 1080p 60fps)..."
                        className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                      />
                      <button
                        type="button"
                        onClick={handleSaveCurrentProfile}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.07] hover:bg-white/[0.12] text-slate-100 border border-white/[0.1] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Save Profile</span>
                      </button>
                    </div>

                    {profileNotice && (
                      <div
                        role="status"
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[11px] text-emerald-200 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="truncate">{profileNotice}</span>
                      </div>
                    )}
                  </section>

                  <hr className="border-white/[0.07]" />

                  {/* Resolution, FPS, Bitrate & Fade Controls */}
                  <section className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
                        <h4 className="text-xs font-semibold text-slate-200">
                          Resolution &amp; Bitrate Settings
                        </h4>
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-cyan-400">
                        {resolvedSingleDims.width}×{resolvedSingleDims.height}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="space-y-1">
                        <span className="text-[10.5px] text-slate-400">Aspect Ratio</span>
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]">
                          {(['16:9', '9:16', '1:1'] as AspectRatioKey[]).map((ratio) => (
                            <button
                              key={ratio}
                              type="button"
                              onClick={() => onUpdateSettings({ aspectRatio: ratio })}
                              className={`py-1 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                                currentSettings.aspectRatio === ratio
                                  ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {ratio}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10.5px] text-slate-400">Resolution</span>
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]">
                          {(['720p', '1080p', '1440p'] as ExportResolution[]).map((res) => (
                            <button
                              key={res}
                              type="button"
                              onClick={() => onUpdateSettings({ exportResolution: res })}
                              className={`py-1 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                                currentSettings.exportResolution === res
                                  ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {res}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10.5px] text-slate-400">Frame Rate</span>
                        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]">
                          {([30, 60] as const).map((fps) => (
                            <button
                              key={fps}
                              type="button"
                              onClick={() => onUpdateSettings({ exportFps: fps })}
                              className={`py-1 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                                currentSettings.exportFps === fps
                                  ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {fps}fps
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400">Video Bitrate Preset</span>
                        <span className="font-mono tabular-nums text-cyan-400">
                          {currentSettings.videoBitrateMbps} Mbps H.264
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {EXPORT_BITRATE_PRESETS.map((preset) => {
                          const active =
                            currentSettings.bitratePreset === preset.id &&
                            currentSettings.videoBitrateMbps === preset.videoBitrateMbps;
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() =>
                                onUpdateSettings({
                                  bitratePreset: preset.id,
                                  videoBitrateMbps: preset.videoBitrateMbps,
                                  audioBitrateKbps: preset.audioBitrateKbps,
                                })
                              }
                              className={`px-2 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                                active
                                  ? 'bg-cyan-500/15 border-cyan-400/45 text-slate-100'
                                  : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                              }`}
                            >
                              <div className="text-[11px] font-semibold whitespace-nowrap">
                                {preset.label}
                              </div>
                              <div className="text-[10px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
                                {preset.videoBitrateMbps}M / {preset.audioBitrateKbps}k
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <input
                        type="range"
                        min={2}
                        max={35}
                        step={1}
                        aria-label="Video bitrate in Mbps"
                        value={currentSettings.videoBitrateMbps}
                        onChange={(e) => {
                          const mbps = parseInt(e.target.value, 10);
                          const matchedPreset = EXPORT_BITRATE_PRESETS.find(
                            (b) => b.videoBitrateMbps === mbps
                          );
                          onUpdateSettings({
                            videoBitrateMbps: mbps,
                            bitratePreset: matchedPreset ? matchedPreset.id : 'custom',
                          });
                        }}
                        className="studio-range w-full"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <span className="text-[10.5px] text-slate-400">Audio Bitrate</span>
                        <div className="grid grid-cols-4 gap-1 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]">
                          {([128, 192, 256, 320] as AudioBitrateKbps[]).map((kbps) => (
                            <button
                              key={kbps}
                              type="button"
                              onClick={() => onUpdateSettings({ audioBitrateKbps: kbps })}
                              className={`py-1 rounded text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                                currentSettings.audioBitrateKbps === kbps
                                  ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {kbps}k
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10.5px] text-slate-400">0.15s Boundary Fade</span>
                        <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#090b10] border border-white/[0.08]">
                          {(['linear', 'logarithmic', 'exponential'] as FadeType[]).map((ft) => (
                            <button
                              key={ft}
                              type="button"
                              onClick={() => onUpdateSettings({ fadeType: ft })}
                              className={`py-1 rounded text-[11px] transition-colors cursor-pointer whitespace-nowrap ${
                                currentSettings.fadeType === ft
                                  ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                  : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {ft === 'logarithmic'
                                ? 'Log'
                                : ft === 'exponential'
                                ? 'Exp'
                                : 'Linear'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Output Summary */}
                  <div className="p-3.5 rounded-lg bg-[#090b10] border border-white/[0.08] space-y-1.5">
                    <div className="flex justify-between text-xs gap-2">
                      <span className="text-slate-400">Active Clip</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        {formatShortTime(currentTrimStart)} → {formatShortTime(currentTrimEnd)} (
                        {clipDurationSec.toFixed(1)}s)
                      </span>
                    </div>
                    <div className="flex justify-between text-xs gap-2">
                      <span className="text-slate-400">Output Stream</span>
                      <span className="font-mono tabular-nums text-slate-200 text-right">
                        {resolvedSingleDims.width}×{resolvedSingleDims.height} ·{' '}
                        {currentSettings.exportFps}fps · {currentSettings.videoBitrateMbps} Mbps ·{' '}
                        {currentSettings.audioBitrateKbps}k · {activeFormatSummary}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs gap-2">
                      <span className="text-slate-400">Estimated Size &amp; Fade</span>
                      <span className="font-mono tabular-nums text-slate-200">
                        ~{estimatedSizeMb.toFixed(1)} MB · {FADE_TYPE_LABELS[currentSettings.fadeType]}
                      </span>
                    </div>
                  </div>
                </>
              )}

              {(isSingleRunning || state.status === 'completed') && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-300 font-medium">{state.message}</span>
                    <span className="font-mono tabular-nums text-cyan-400 font-semibold">
                      {state.percentage}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-white/[0.07] overflow-hidden">
                    <div
                      className={`h-full transition-[width] duration-150 ${
                        state.status === 'completed' ? 'bg-emerald-400' : 'bg-cyan-400'
                      }`}
                      style={{ width: `${state.percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono tabular-nums mt-2">
                    <span>
                      Frame {state.currentFrame} / {state.totalFrames}
                    </span>
                    {state.elapsedMs !== undefined && (
                      <span>Elapsed {(state.elapsedMs / 1000).toFixed(1)}s</span>
                    )}
                  </div>
                </div>
              )}

              {state.status === 'error' && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/25 text-xs text-rose-200 leading-relaxed">
                  {state.error || 'An unexpected error occurred during WebCodecs encoding.'}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0d1118] shrink-0 flex items-center justify-end gap-2.5">
              {isSingleRunning ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              ) : (
                <>
                  {state.status === 'idle' && (
                    <button
                      type="button"
                      onClick={onStartSingleExport}
                      className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Render {activeContainerLabel}</span>
                    </button>
                  )}
                  {state.status === 'completed' &&
                    state.downloadUrl &&
                    state.downloadFileName && (
                      <>
                        <button
                          type="button"
                          onClick={onShareSingle}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.14] text-cyan-200 border border-cyan-400/35 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Share to Socials</span>
                        </button>
                        <a
                          href={state.downloadUrl}
                          download={state.downloadFileName}
                          className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>
                            Download{' '}
                            {state.downloadFileName.toLowerCase().endsWith('.webm')
                              ? 'WebM'
                              : 'MP4'}
                          </span>
                        </a>
                      </>
                    )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Batch Queue Quick-Add Toolbar */}
            <div className="px-5 py-3 border-b border-white/[0.07] bg-[#0d1118] flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={isBatchRunning}
                onClick={handleAddCurrentSetup}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-400/30 transition-colors flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Current Clip</span>
              </button>

              <button
                type="button"
                disabled={isBatchRunning}
                onClick={handleAddAllVisualizers}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>+ {VISUALIZER_OPTIONS.length} Visualizers</span>
              </button>

              <button
                type="button"
                disabled={isBatchRunning}
                onClick={handleAddAllAspectRatios}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 disabled:opacity-40 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>+ 3 Ratios</span>
              </button>

              <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#121620] overflow-hidden">
                <span className="px-2 py-1 text-[10px] text-slate-400 flex items-center gap-1 border-r border-white/[0.08]">
                  <Scissors className="w-3 h-3 text-cyan-400" />
                  <span>Split</span>
                </span>
                {[15, 30, 60].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    disabled={isBatchRunning || duration <= 0.5}
                    onClick={() => handleSplitSegments(sec)}
                    className="px-2 py-1 text-[11px] font-mono tabular-nums text-slate-300 hover:text-white hover:bg-white/[0.07] border-r last:border-r-0 border-white/[0.06] disabled:opacity-40 cursor-pointer"
                  >
                    {sec}s
                  </button>
                ))}
              </div>

              <select
                value=""
                disabled={isBatchRunning}
                aria-label="Queue with Export Profile"
                onChange={(e) => {
                  const found = exportProfiles.find((p) => p.id === e.target.value);
                  if (found) {
                    handleQueueWithProfile(found);
                  }
                }}
                className="rounded-lg bg-[#121620] border border-cyan-400/30 px-2.5 py-1.5 text-[11px] text-cyan-200 outline-none focus:border-cyan-400/60 disabled:opacity-40 cursor-pointer"
              >
                <option value="">+ Export Profile…</option>
                {exportProfiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name} ({profile.resolution} · {profile.fps}fps · {profile.videoBitrateMbps}M)
                  </option>
                ))}
              </select>

              {savedPresets.length > 0 && (
                <select
                  value=""
                  disabled={isBatchRunning}
                  aria-label="Queue from saved visual preset"
                  onChange={(e) => {
                    const found = savedPresets.find((p) => p.id === e.target.value);
                    if (found) {
                      onAddBatchJobs([
                        {
                          label: found.name,
                          trimStart: currentTrimStart,
                          trimEnd: currentTrimEnd,
                          settings: {
                            ...found.settings,
                            trackTitle:
                              found.settings.trackTitle || currentSettings.trackTitle,
                            artistName:
                              found.settings.artistName || currentSettings.artistName,
                          },
                        },
                      ]);
                    }
                  }}
                  className="rounded-lg bg-[#121620] border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-slate-200 outline-none focus:border-cyan-400/50 disabled:opacity-40 cursor-pointer"
                >
                  <option value="">+ Visual Preset…</option>
                  {savedPresets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Scrollable Queue List */}
            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2.5">
              {batchCompletionBanner && !isBatchRunning && (
                <BatchSummaryCard
                  summary={batchCompletionBanner}
                  hasShareableJob={Boolean(completedBatchJobs[0])}
                  isExportingZip={isExportingZip}
                  zipProgressPct={zipProgressPct}
                  onShareFirst={() => {
                    if (completedBatchJobs[0]) {
                      onShareBatchJob(completedBatchJobs[0]);
                    }
                  }}
                  onDownloadAll={onDownloadAllBatch}
                  onExportToFolder={() => void handleExportBatchToFolder()}
                  onDismiss={onDismissBatchCompletionBanner}
                />
              )}

              {batchJobs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-white/[0.1] bg-[#090b10]/60 p-8 text-center">
                  <Layers className="w-7 h-7 text-cyan-400/70 mx-auto mb-2.5" />
                  <p className="text-xs font-medium text-slate-200">
                    No renders queued yet
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1 max-w-md mx-auto leading-relaxed">
                    Queue multiple trim segments (e.g. 15s / 30s splits), all {VISUALIZER_OPTIONS.length} visualizer modes,
                    or multi-platform aspect ratios to render MP4 files sequentially.
                  </p>
                </div>
              ) : (
                batchJobs.map((job, idx) => (
                  <BatchJobRow
                    key={job.id}
                    job={job}
                    index={idx}
                    total={batchJobs.length}
                    duration={duration}
                    globalSettings={currentSettings}
                    isBatchRunning={isBatchRunning}
                    savedPresets={savedPresets}
                    exportProfiles={exportProfiles}
                    onUpdate={(patch) => onUpdateBatchJob(job.id, patch)}
                    onMove={(dir) => onMoveBatchJob(job.id, dir)}
                    onDuplicate={() => onDuplicateBatchJob(job.id)}
                    onRemove={() => onRemoveBatchJob(job.id)}
                    onPreview={() => onPreviewBatchJob(job)}
                    onShare={() => onShareBatchJob(job)}
                  />
                ))
              )}
            </div>

            {/* Batch Footer */}
            <div className="px-5 py-3.5 border-t border-white/[0.08] bg-[#0d1118] shrink-0 space-y-3">
              {isBatchRunning && (
                <div>
                  <div className="flex items-center justify-between text-[11px] mb-1.5">
                    <span className="text-slate-300 font-medium">
                      {activeBatchIndex >= 0
                        ? `Rendering item ${activeBatchIndex + 1} of ${batchJobs.length}`
                        : 'Preparing batch pipeline...'}
                    </span>
                    <span className="font-mono tabular-nums text-cyan-400 font-semibold">
                      {batchTotalPct}% overall
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-white/[0.07] overflow-hidden">
                    <div
                      className="h-full bg-cyan-400 transition-[width] duration-150"
                      style={{ width: `${batchTotalPct}%` }}
                    />
                  </div>
                </div>
              )}

              {zipNotice && !isBatchRunning && (
                <div
                  role="status"
                  className={`rounded-lg border px-3 py-2 text-[11px] flex items-center justify-between gap-2 ${
                    zipNotice.type === 'error'
                      ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  }`}
                >
                  <span className="truncate font-mono tabular-nums">{zipNotice.text}</span>
                  <button
                    type="button"
                    onClick={() => setZipNotice(null)}
                    className="text-[10px] opacity-80 hover:opacity-100 shrink-0 cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoDownloadBatch}
                      disabled={isBatchRunning}
                      onChange={(e) => onToggleAutoDownloadBatch(e.target.checked)}
                      className="accent-cyan-400 rounded cursor-pointer"
                    />
                    <span>Auto-download each MP4</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={notifyOnBatchComplete}
                      onChange={(e) => onToggleNotifyOnBatchComplete(e.target.checked)}
                      className="accent-cyan-400 rounded cursor-pointer"
                    />
                    <span>Notify when ready</span>
                  </label>

                  {notifyOnBatchComplete && notificationPermission === 'default' && (
                    <button
                      type="button"
                      onClick={onRequestNotificationPermission}
                      className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-400/30 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                    >
                      <Bell className="w-3 h-3" />
                      <span>Enable Desktop Alerts</span>
                    </button>
                  )}

                  {notifyOnBatchComplete && notificationPermission === 'granted' && (
                    <span className="text-[10px] text-emerald-400/90 flex items-center gap-1 whitespace-nowrap">
                      <BellRing className="w-3 h-3" />
                      <span>Desktop alerts on</span>
                    </span>
                  )}

                  {notifyOnBatchComplete && notificationPermission === 'denied' && (
                    <span
                      className="text-[10px] text-amber-300/80 flex items-center gap-1 whitespace-nowrap"
                      title="Browser desktop notifications are blocked in site settings; sound chime and tab alert will still trigger."
                    >
                      <BellOff className="w-3 h-3" />
                      <span>Alerts blocked (chime active)</span>
                    </span>
                  )}

                  {!isBatchRunning && completedBatchJobs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onClearBatchJobs('completed')}
                      className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Clear Completed
                    </button>
                  )}

                  {!isBatchRunning && batchJobs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onClearBatchJobs('all')}
                      className="text-[11px] text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {isBatchRunning ? (
                    <button
                      type="button"
                      onClick={onCancel}
                      className="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Cancel Batch
                    </button>
                  ) : (
                    <>
                      {completedBatchJobs.length > 0 && (
                        <>
                          <button
                            type="button"
                            disabled={isExportingZip}
                            onClick={() => void handleExportBatchToFolder()}
                            title="Package all completed videos into a single ZIP folder archive"
                            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-white/[0.07] hover:bg-white/[0.12] text-slate-100 border border-white/[0.14] transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                          >
                            {isExportingZip ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                            ) : (
                              <FolderArchive className="w-3.5 h-3.5 text-cyan-400" />
                            )}
                            <span>
                              {isExportingZip
                                ? `Zipping ${zipProgressPct}%...`
                                : `Export to Folder (${completedBatchJobs.length})`}
                            </span>
                          </button>

                          <button
                            type="button"
                            disabled={isExportingZip}
                            onClick={onDownloadAllBatch}
                            className="px-3.5 py-2 rounded-lg text-xs font-medium bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/35 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download All ({completedBatchJobs.length})</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        disabled={pendingBatchJobs.length === 0 || isExportingZip}
                        onClick={onStartBatchExport}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          Render Batch ({pendingBatchJobs.length})
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={isExportingZip}
                        onClick={onClose}
                        className="px-3.5 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50"
                      >
                        Close
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
