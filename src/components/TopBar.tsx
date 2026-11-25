import { useEffect, useRef, useState } from 'react';
import {
  AudioWaveform,
  BookmarkPlus,
  Cable,
  Check,
  Clock,
  Download,
  FolderOpen,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Music,
  Redo2,
  RotateCcw,
  Save,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Undo2,
} from 'lucide-react';
import type { HistoryTimelineItem } from '../hooks/useStudioHistory';
import {
  AspectRatioKey,
  ExportResolution,
  SnapshotKind,
  resolveExportDimensions,
} from '../types/studio';

interface TopBarProps {
  audioFileName: string | null;
  aspectRatio: AspectRatioKey;
  exportResolution: ExportResolution;
  clipDuration: number;
  hasAudio: boolean;
  isGeneratingDemo: boolean;
  isExporting: boolean;
  batchQueueCount: number;
  shareableCount: number;
  activeProjectId: string | null;
  activeProjectName: string;
  activeProjectCompleted: boolean;
  projectCount: number;
  autoSaveProjects: boolean;
  isProjectDirty: boolean;
  isSavingProject: boolean;
  canUndo: boolean;
  canRedo: boolean;
  historyEntries: HistoryTimelineItem[];
  currentHistoryEntryId: string;
  midiActiveCount: number;
  midiConnectedCount: number;
  midiEnabled: boolean;
  mixClipCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onJumpToHistory: (entryId: string) => void;
  onCaptureProjectSnapshot: (label?: string) => void;
  onOpenProjects: () => void;
  onQuickSaveProject: () => void;
  onLoadDemo: () => void;
  onOpenMixStudio: () => void;
  onOpenMidi: () => void;
  onOpenBatchExport: () => void;
  onOpenShare: () => void;
  onExport: () => void;
}

const KIND_BADGE_MAP: Record<
  SnapshotKind,
  { text: string; className: string }
> = {
  'project-state': {
    text: 'Project State',
    className: 'bg-cyan-500/15 text-cyan-300 border-cyan-400/35',
  },
  media: {
    text: 'Media',
    className: 'bg-emerald-500/12 text-emerald-300 border-emerald-500/30',
  },
  lyrics: {
    text: 'Lyrics',
    className: 'bg-amber-500/12 text-amber-300 border-amber-500/30',
  },
  settings: {
    text: 'Settings',
    className: 'bg-white/[0.06] text-slate-300 border-white/[0.12]',
  },
};

function formatHistoryTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TopBar({
  audioFileName,
  aspectRatio,
  exportResolution,
  clipDuration,
  hasAudio,
  isGeneratingDemo,
  isExporting,
  batchQueueCount,
  shareableCount,
  activeProjectId,
  activeProjectName,
  activeProjectCompleted,
  projectCount,
  autoSaveProjects,
  isProjectDirty,
  isSavingProject,
  canUndo,
  canRedo,
  historyEntries,
  currentHistoryEntryId,
  midiActiveCount,
  midiConnectedCount,
  midiEnabled,
  mixClipCount,
  onUndo,
  onRedo,
  onJumpToHistory,
  onCaptureProjectSnapshot,
  onOpenProjects,
  onQuickSaveProject,
  onLoadDemo,
  onOpenMixStudio,
  onOpenMidi,
  onOpenBatchExport,
  onOpenShare,
  onExport,
}: TopBarProps) {
  const ratioInfo = resolveExportDimensions(aspectRatio, exportResolution);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const historyMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isHistoryOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        historyMenuRef.current &&
        !historyMenuRef.current.contains(e.target as Node)
      ) {
        setIsHistoryOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isHistoryOpen]);

  const orderedEntries = [...historyEntries].reverse();

  const handleCaptureSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onCaptureProjectSnapshot(snapshotLabel.trim() || undefined);
    setSnapshotLabel('');
  };

  return (
    <header className="h-14 shrink-0 border-b border-white/[0.08] bg-[#121620] px-4 lg:px-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 text-cyan-400">
          <AudioWaveform className="w-4 h-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          PulseWave Studio
        </span>

        {/* Projects Library Selector + Quick Save */}
        <div className="flex items-center gap-1.5 pl-2.5 border-l border-white/[0.08] min-w-0">
          <button
            type="button"
            onClick={onOpenProjects}
            disabled={isExporting}
            title={`Projects — Completed & Non-Completed (${activeProjectName})`}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.07] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 min-w-0 cursor-pointer disabled:opacity-40"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="font-semibold text-slate-100 shrink-0">Projects</span>
            {projectCount > 0 && (
              <span className="font-mono tabular-nums text-[10px] text-cyan-300 bg-cyan-500/12 border border-cyan-400/25 rounded px-1 py-0.2 shrink-0">
                {projectCount}
              </span>
            )}
            <span className="hidden md:inline text-slate-500 shrink-0">·</span>
            <span
              className={`hidden md:inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                activeProjectCompleted ? 'bg-emerald-400' : 'bg-amber-400'
              }`}
              title={activeProjectCompleted ? 'Completed project' : 'Non-completed project'}
            />
            <span className="hidden md:inline truncate max-w-[110px] text-slate-300">
              {activeProjectName}
            </span>
          </button>

          <button
            type="button"
            onClick={onQuickSaveProject}
            disabled={isSavingProject || isExporting}
            title={
              autoSaveProjects
                ? 'Projects auto-save locally (click to save immediately & record version snapshot)'
                : activeProjectId
                ? 'Save changes & record version snapshot'
                : 'Save project locally'
            }
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 ${
              activeProjectId && !isProjectDirty
                ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                : 'bg-white/[0.05] hover:bg-white/[0.09] border-white/[0.08] text-slate-200'
            }`}
          >
            {isSavingProject ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : activeProjectId && !isProjectDirty ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Save className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span className="hidden sm:inline">
              {isSavingProject
                ? 'Saving...'
                : activeProjectId && !isProjectDirty
                ? autoSaveProjects
                  ? 'Auto-saved'
                  : 'Saved'
                : 'Save'}
            </span>
          </button>
        </div>

        {audioFileName && (
          <div className="hidden xl:flex items-center gap-2 text-xs text-slate-400 min-w-0 pl-2 border-l border-white/[0.08]">
            <span className="truncate max-w-[180px] text-slate-300 font-medium">
              {audioFileName}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums whitespace-nowrap">
              {ratioInfo.width}×{ratioInfo.height}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums whitespace-nowrap">
              {clipDuration.toFixed(1)}s
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div
          ref={historyMenuRef}
          className="relative flex items-center gap-1 pr-2 border-r border-white/[0.08]"
          role="group"
          aria-label="History controls"
        >
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo || isExporting}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] border border-transparent hover:border-white/[0.08] transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo || isExporting}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] border border-transparent hover:border-white/[0.08] transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
          >
            <Redo2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsHistoryOpen((o) => !o)}
            disabled={isExporting}
            aria-expanded={isHistoryOpen}
            title="Project State Snapshots & Undo/Redo Timeline"
            className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40 ${
              isHistoryOpen
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                : 'bg-[#090b10] hover:bg-white/[0.07] border-white/[0.08] text-slate-300'
            }`}
          >
            <History className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden lg:inline">Snapshots</span>
            <span className="font-mono tabular-nums text-[10px] text-slate-400">
              {historyEntries.length}
            </span>
          </button>

          {isHistoryOpen && (
            <div className="absolute right-0 top-full mt-2 w-[360px] max-w-[92vw] rounded-xl bg-[#121620] border border-white/[0.12] shadow-2xl z-50 overflow-hidden flex flex-col">
              <div className="px-3.5 py-2.5 border-b border-white/[0.08] bg-[#0b0e16] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-100">
                      Project State &amp; History
                    </p>
                    <p className="text-[10.5px] text-slate-400">
                      Restore settings, lyrics &amp; media assignments
                    </p>
                  </div>
                  <span className="text-[10px] font-mono tabular-nums text-slate-400">
                    {historyEntries.length} states
                  </span>
                </div>

                <form onSubmit={handleCaptureSubmit} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={snapshotLabel}
                    onChange={(e) => setSnapshotLabel(e.target.value)}
                    placeholder="Snapshot name (optional)..."
                    className="flex-1 min-w-0 rounded-lg bg-[#090b10] border border-white/[0.09] px-2.5 py-1 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/50"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer shrink-0"
                  >
                    <BookmarkPlus className="w-3 h-3" />
                    <span>Capture</span>
                  </button>
                </form>
              </div>

              <div className="max-h-72 overflow-y-auto studio-scroll p-2 space-y-1.5">
                {orderedEntries.map((entry) => {
                  const isCurrent = entry.id === currentHistoryEntryId;
                  const badge = KIND_BADGE_MAP[entry.kind];
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        if (!isCurrent) {
                          onJumpToHistory(entry.id);
                        }
                      }}
                      className={`w-full text-left p-2 rounded-lg border transition-colors flex flex-col gap-1 cursor-pointer ${
                        isCurrent
                          ? 'bg-cyan-500/12 border-cyan-400/40'
                          : entry.position === 'future'
                          ? 'bg-[#090b10]/50 border-white/[0.06] opacity-70 hover:opacity-100 hover:border-white/[0.14]'
                          : 'bg-[#090b10] border-white/[0.08] hover:border-white/[0.18]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9.5px] font-medium border shrink-0 ${badge.className}`}
                          >
                            {badge.text}
                          </span>
                          <span className="text-[11px] font-medium text-slate-100 truncate">
                            {entry.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0 flex items-center gap-1">
                          {isCurrent ? (
                            <span className="text-cyan-300 font-semibold">Current</span>
                          ) : (
                            <>
                              <RotateCcw className="w-2.5 h-2.5 text-cyan-400" />
                              <span>{formatHistoryTime(entry.timestamp)}</span>
                            </>
                          )}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[10px] text-slate-400">
                        <span className="text-slate-300 truncate max-w-[130px]">
                          {entry.projectName}
                        </span>
                        <span className="inline-flex items-center gap-1 truncate max-w-[130px]">
                          <Music className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                          <span>{entry.audioFileName || 'No audio'}</span>
                        </span>
                        {(entry.bgImageName || entry.albumImageName) && (
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon className="w-2.5 h-2.5 text-slate-500 shrink-0" />
                            <span>
                              {[
                                entry.bgImageName ? 'BG' : null,
                                entry.albumImageName ? 'Cover' : null,
                              ]
                                .filter(Boolean)
                                .join('+')}
                            </span>
                          </span>
                        )}
                        <span className="font-mono tabular-nums">
                          {entry.lyricsCount}L · {entry.visualizerMode}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="px-3 py-1.5 border-t border-white/[0.08] bg-[#0b0e16] flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Ctrl+Z Undo · Ctrl+Y Redo
                </span>
                <span>Click any state to restore</span>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onLoadDemo}
          disabled={isGeneratingDemo || isExporting}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden md:inline">
            {isGeneratingDemo ? 'Synthesizing...' : 'Load Demo Beat'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenMixStudio}
          disabled={isExporting}
          title="Mix multiple audio and video files into one combined MP4"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 cursor-pointer ${
            mixClipCount > 0
              ? 'bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
              : 'bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border-white/[0.08]'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden md:inline">
            {mixClipCount > 0 ? `Mix (${mixClipCount})` : 'Mix Audio/Video'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenMidi}
          disabled={isExporting}
          title={
            midiConnectedCount > 0
              ? `MIDI Mapping (${midiConnectedCount} controller connected · ${midiActiveCount} active bindings)`
              : 'Configure physical MIDI controller fader & knob mappings'
          }
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
            midiEnabled && midiActiveCount > 0
              ? 'bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
              : 'bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border-white/[0.08]'
          }`}
        >
          <Cable className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden md:inline">
            {midiActiveCount > 0 ? `MIDI (${midiActiveCount})` : 'MIDI'}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenBatchExport}
          disabled={!hasAudio || isExporting}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>{batchQueueCount > 0 ? `Batch (${batchQueueCount})` : 'Batch Export'}</span>
        </button>

        <button
          type="button"
          onClick={onOpenShare}
          disabled={(!hasAudio && shareableCount === 0) || isExporting}
          title="Share finished MP4 to YouTube, TikTok, Facebook, Instagram, X, and LinkedIn"
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
            shareableCount > 0
              ? 'bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border-cyan-400/35'
              : 'bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border-white/[0.08]'
          }`}
        >
          <Share2 className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">
            {shareableCount > 0 ? `Share (${shareableCount})` : 'Share'}
          </span>
        </button>

        <button
          type="button"
          onClick={onExport}
          disabled={!hasAudio || isExporting}
          className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export MP4</span>
        </button>
      </div>
    </header>
  );
}
