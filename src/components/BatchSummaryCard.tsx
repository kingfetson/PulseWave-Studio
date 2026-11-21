import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FolderArchive,
  Loader2,
  Share2,
  X,
} from 'lucide-react';
import { BatchCompletionSummary } from '../types/studio';

interface BatchSummaryCardProps {
  summary: BatchCompletionSummary;
  hasShareableJob: boolean;
  isExportingZip: boolean;
  zipProgressPct: number;
  onShareFirst: () => void;
  onDownloadAll: () => void;
  onExportToFolder: () => void;
  onDismiss: () => void;
}

function formatDurationCompact(ms: number): string {
  const safeSec = Math.max(0, ms / 1000);
  if (safeSec < 60) {
    return `${safeSec.toFixed(1)}s`;
  }
  const mins = Math.floor(safeSec / 60);
  const remSec = Math.round(safeSec % 60);
  return `${mins}m ${String(remSec).padStart(2, '0')}s`;
}

function formatOutputSize(bytes: number): string {
  if (bytes <= 0) return '0.0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

export function BatchSummaryCard({
  summary,
  hasShareableJob,
  isExportingZip,
  zipProgressPct,
  onShareFirst,
  onDownloadAll,
  onExportToFolder,
  onDismiss,
}: BatchSummaryCardProps) {
  const totalProcessed = Math.max(1, summary.completedCount + summary.failedCount);
  const successPct = Math.round((summary.completedCount / totalProcessed) * 100);
  const failedPct = 100 - successPct;

  const timeSavedMs = Math.max(0, summary.totalClipDurationMs - summary.totalElapsedMs);
  const speedupRatio =
    summary.totalElapsedMs > 0 && summary.totalClipDurationMs > 0
      ? summary.totalClipDurationMs / summary.totalElapsedMs
      : 0;

  const allSucceeded = summary.failedCount === 0 && summary.completedCount > 0;
  const allFailed = summary.completedCount === 0 && summary.failedCount > 0;

  return (
    <section
      role="status"
      aria-label="Batch export processing summary"
      className="rounded-xl border border-white/[0.1] bg-[#090b10] overflow-hidden"
    >
      {/* Header Row */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07]">
        <div className="flex items-center gap-2.5 min-w-0">
          {allFailed ? (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : summary.failedCount > 0 ? (
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}

          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-slate-100">
              {allSucceeded
                ? 'Batch Export Summary'
                : allFailed
                ? 'Batch Processing Failed'
                : 'Batch Export Summary · Partial'}
            </h4>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums truncate">
              {totalProcessed} {totalProcessed === 1 ? 'job' : 'jobs'} processed
              {' · '}
              {formatDurationCompact(summary.totalElapsedMs)} elapsed
              {summary.desktopSent ? ' · Desktop alert sent' : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {summary.completedCount > 0 && (
            <>
              {hasShareableJob && (
                <button
                  type="button"
                  onClick={onShareFirst}
                  className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                >
                  <Share2 className="w-3 h-3" />
                  <span>Share</span>
                </button>
              )}
              <button
                type="button"
                disabled={isExportingZip}
                onClick={onExportToFolder}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-white/[0.08] hover:bg-white/[0.14] text-slate-100 border border-white/[0.14] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-60"
              >
                {isExportingZip ? (
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                ) : (
                  <FolderArchive className="w-3 h-3 text-cyan-400" />
                )}
                <span>
                  {isExportingZip ? `Zipping ${zipProgressPct}%` : 'Export to Folder'}
                </span>
              </button>
              <button
                type="button"
                disabled={isExportingZip}
                onClick={onDownloadAll}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-400 hover:bg-emerald-300 text-[#090b10] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3 h-3" />
                <span>Download All</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss batch summary card"
            className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Visual Breakdown Progress Bar (Successful vs. Failed) */}
      <div className="px-4 py-3 border-b border-white/[0.07] space-y-2">
        <div
          className="h-2 w-full rounded-full bg-white/[0.07] overflow-hidden flex"
          aria-label={`${summary.completedCount} successful, ${summary.failedCount} failed`}
        >
          {summary.completedCount > 0 && (
            <div
              className="h-full bg-emerald-400 transition-[width] duration-300"
              style={{ width: `${successPct}%` }}
            />
          )}
          {summary.failedCount > 0 && (
            <div
              className="h-full bg-rose-400 transition-[width] duration-300"
              style={{ width: `${failedPct}%` }}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-emerald-300">
              <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
              <span>
                Successful: {summary.completedCount} ({successPct}%)
              </span>
            </span>
            <span
              className={`flex items-center gap-1.5 ${
                summary.failedCount > 0 ? 'text-rose-300' : 'text-slate-500'
              }`}
            >
              <AlertTriangle
                className={`w-3 h-3 shrink-0 ${
                  summary.failedCount > 0 ? 'text-rose-400' : 'text-slate-600'
                }`}
              />
              <span>
                Failed: {summary.failedCount} ({failedPct}%)
              </span>
            </span>
          </div>

          <span className="text-slate-400">
            {summary.totalFramesRendered.toLocaleString()} frames rendered
          </span>
        </div>
      </div>

      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.07]">
        <div className="px-4 py-2.5">
          <div className="flex items-center gap-1 text-[10.5px] text-slate-400">
            <Clock className="w-3 h-3 text-cyan-400 shrink-0" />
            <span>Time Saved</span>
          </div>
          <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-cyan-300">
            {timeSavedMs > 0 ? `+${formatDurationCompact(timeSavedMs)}` : '0.0s'}
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
            {speedupRatio > 0
              ? `${speedupRatio.toFixed(1)}× vs. 1× real-time`
              : 'No clips completed'}
          </div>
        </div>

        <div className="px-4 py-2.5">
          <div className="text-[10.5px] text-slate-400">Success vs. Failed</div>
          <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-100">
            <span className="text-emerald-300">{summary.completedCount}</span>
            <span className="text-slate-500 mx-1">/</span>
            <span className={summary.failedCount > 0 ? 'text-rose-300' : 'text-slate-400'}>
              {summary.failedCount}
            </span>
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
            {successPct}% completion rate
          </div>
        </div>

        <div className="px-4 py-2.5">
          <div className="text-[10.5px] text-slate-400">Render Time</div>
          <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-100">
            {formatDurationCompact(summary.totalElapsedMs)}
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
            for {formatDurationCompact(summary.totalClipDurationMs)} video
          </div>
        </div>

        <div className="px-4 py-2.5">
          <div className="text-[10.5px] text-slate-400">Total Output</div>
          <div className="mt-1 text-sm font-semibold font-mono tabular-nums text-slate-100">
            {formatOutputSize(summary.totalOutputBytes)}
          </div>
          <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5">
            {summary.completedCount}{' '}
            {summary.completedCount === 1 ? 'video ready' : 'videos ready'}
          </div>
        </div>
      </div>
    </section>
  );
}
