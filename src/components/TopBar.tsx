import {
  AudioWaveform,
  Check,
  Download,
  FolderOpen,
  Layers,
  Loader2,
  Redo2,
  Save,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { ASPECT_RATIOS, AspectRatioKey } from '../types/studio';

interface TopBarProps {
  audioFileName: string | null;
  aspectRatio: AspectRatioKey;
  clipDuration: number;
  hasAudio: boolean;
  isGeneratingDemo: boolean;
  isExporting: boolean;
  batchQueueCount: number;
  activeProjectId: string | null;
  activeProjectName: string;
  projectCount: number;
  autoSaveProjects: boolean;
  isProjectDirty: boolean;
  isSavingProject: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onOpenProjects: () => void;
  onQuickSaveProject: () => void;
  onLoadDemo: () => void;
  onOpenBatchExport: () => void;
  onExport: () => void;
}

export function TopBar({
  audioFileName,
  aspectRatio,
  clipDuration,
  hasAudio,
  isGeneratingDemo,
  isExporting,
  batchQueueCount,
  activeProjectId,
  activeProjectName,
  projectCount,
  autoSaveProjects,
  isProjectDirty,
  isSavingProject,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onOpenProjects,
  onQuickSaveProject,
  onLoadDemo,
  onOpenBatchExport,
  onExport,
}: TopBarProps) {
  const ratioInfo = ASPECT_RATIOS[aspectRatio];

  return (
    <header className="h-14 shrink-0 border-b border-white/[0.08] bg-[#121620] px-4 lg:px-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-400/30 flex items-center justify-center shrink-0 text-cyan-400">
          <AudioWaveform className="w-4 h-4" />
        </div>
        <span className="text-[15px] font-semibold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
          PulseWave Studio
        </span>

        {/* Active Project Selector + Quick Save */}
        <div className="flex items-center gap-1.5 pl-2.5 border-l border-white/[0.08] min-w-0">
          <button
            type="button"
            onClick={onOpenProjects}
            disabled={isExporting}
            title="Open saved projects"
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#090b10] hover:bg-white/[0.07] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 min-w-0 cursor-pointer disabled:opacity-40"
          >
            <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="truncate max-w-[130px]">{activeProjectName}</span>
            {projectCount > 0 && (
              <span className="font-mono tabular-nums text-[10px] text-slate-400 shrink-0">
                ({projectCount})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onQuickSaveProject}
            disabled={isSavingProject || isExporting}
            title={
              autoSaveProjects
                ? 'Projects auto-save locally (click to save immediately)'
                : activeProjectId
                ? 'Save changes to current project'
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
          className="flex items-center gap-1 pr-2 border-r border-white/[0.08]"
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
          onClick={onOpenBatchExport}
          disabled={!hasAudio || isExporting}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Layers className="w-3.5 h-3.5 text-cyan-400" />
          <span>{batchQueueCount > 0 ? `Batch (${batchQueueCount})` : 'Batch Export'}</span>
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
