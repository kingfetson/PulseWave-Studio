import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  Download,
  Layers,
  Loader2,
  Pause,
  Play,
  Repeat,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatShortTime } from '../utils/lrcParser';

interface TransportBarProps {
  hasAudio: boolean;
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  isPlaying: boolean;
  loopClip: boolean;
  volume: number;
  isMuted: boolean;
  isExporting: boolean;
  batchQueueCount: number;
  isGeneratingCaptions: boolean;
  waveformPeaks: number[];
  primaryColor: string;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onToggleLoop: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onAutoCaptions: () => void;
  onOpenBatchExport: () => void;
  onExport: () => void;
}

type DragTarget = 'playhead' | 'start' | 'end' | null;

export function TransportBar({
  hasAudio,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  isPlaying,
  loopClip,
  volume,
  isMuted,
  isExporting,
  batchQueueCount,
  isGeneratingCaptions,
  waveformPeaks,
  primaryColor,
  onTogglePlay,
  onSeek,
  onTrimChange,
  onToggleLoop,
  onVolumeChange,
  onToggleMute,
  onAutoCaptions,
  onOpenBatchExport,
  onExport,
}: TransportBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [trackWidth, setTrackWidth] = useState(600);

  // Keep trackWidth updated for crisp DPR canvas waveform rendering
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setTrackWidth(Math.max(100, el.clientWidth));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Draw waveform peaks & progress onto the scrubber canvas
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const height = 46;
    canvas.width = Math.floor(trackWidth * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, trackWidth, height);

    const safeDur = duration > 0 ? duration : 1;
    const startFrac = Math.max(0, Math.min(1, trimStart / safeDur));
    const endFrac = Math.max(startFrac, Math.min(1, trimEnd / safeDur));
    const playFrac = Math.max(0, Math.min(1, currentTime / safeDur));

    // Active clip background highlight
    ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.fillRect(
      startFrac * trackWidth,
      0,
      Math.max(0, (endFrac - startFrac) * trackWidth),
      height
    );

    const peaks = waveformPeaks.length > 0 ? waveformPeaks : new Array(140).fill(0.14);
    const count = peaks.length;
    const step = trackWidth / count;
    const barW = Math.max(1.5, Math.min(3.5, step * 0.62));
    const midY = height / 2;

    for (let i = 0; i < count; i++) {
      const frac = (i + 0.5) / count;
      const inTrim = frac >= startFrac && frac <= endFrac;
      const isPlayed = frac <= playFrac && inTrim;

      const amp = Math.max(0.08, peaks[i]);
      const barH = amp * (height - 10);
      const x = i * step + (step - barW) * 0.5;
      const y = midY - barH * 0.5;

      if (!hasAudio) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
      } else if (isPlayed) {
        ctx.fillStyle = primaryColor || '#22d3ee';
      } else if (inTrim) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.52)';
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, barW / 2);
      ctx.fill();
    }
  }, [
    trackWidth,
    waveformPeaks,
    duration,
    trimStart,
    trimEnd,
    currentTime,
    hasAudio,
    primaryColor,
  ]);

  // Pointer drag handling for Start Handle, End Handle, and Playhead Scrubbing
  useEffect(() => {
    if (!dragTarget) return;

    const handleMove = (e: PointerEvent) => {
      const el = trackRef.current;
      if (!el || duration <= 0) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const time = frac * duration;
      const minGap = Math.min(0.5, duration * 0.1);

      if (dragTarget === 'start') {
        const nextStart = Math.min(time, trimEnd - minGap);
        onTrimChange(Math.max(0, Number(nextStart.toFixed(2))), trimEnd);
      } else if (dragTarget === 'end') {
        const nextEnd = Math.max(time, trimStart + minGap);
        onTrimChange(trimStart, Math.min(duration, Number(nextEnd.toFixed(2))));
      } else if (dragTarget === 'playhead') {
        onSeek(Number(time.toFixed(2)));
      }
    };

    const handleUp = () => {
      setDragTarget(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [dragTarget, duration, trimStart, trimEnd, onTrimChange, onSeek]);

  const safeDur = duration > 0 ? duration : 1;
  const startPct = hasAudio ? (trimStart / safeDur) * 100 : 0;
  const endPct = hasAudio ? (trimEnd / safeDur) * 100 : 100;
  const playPct = hasAudio ? Math.max(0, Math.min(100, (currentTime / safeDur) * 100)) : 0;
  const clipDuration = Math.max(0, trimEnd - trimStart);

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasAudio || duration <= 0) return;
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(Number((frac * duration).toFixed(2)));
    setDragTarget('playhead');
  };

  return (
    <div className="shrink-0 border-t border-white/[0.08] bg-[#121620] px-5 py-3 flex flex-col gap-3">
      {/* Waveform Scrubber + Trim Handles */}
      <div
        ref={trackRef}
        onPointerDown={handleTrackPointerDown}
        className={`relative h-[46px] w-full rounded-lg bg-[#090b10] border border-white/[0.08] select-none overflow-visible ${
          hasAudio ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'
        }`}
      >
        <canvas ref={waveCanvasRef} className="w-full h-full block rounded-lg" />

        {hasAudio && (
          <>
            {/* Dimmed outside overlays */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 left-0 bg-black/45 rounded-l-lg"
              style={{ width: `${startPct}%` }}
            />
            <div
              className="pointer-events-none absolute top-0 bottom-0 right-0 bg-black/45 rounded-r-lg"
              style={{ width: `${Math.max(0, 100 - endPct)}%` }}
            />

            {/* Active clip top/bottom hairline */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 border-y border-cyan-400/50"
              style={{
                left: `${startPct}%`,
                width: `${Math.max(0, endPct - startPct)}%`,
              }}
            />

            {/* Draggable Start Trim Handle */}
            <div
              role="slider"
              aria-label="Clip start time"
              aria-valuemin={0}
              aria-valuemax={trimEnd}
              aria-valuenow={trimStart}
              tabIndex={0}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragTarget('start');
              }}
              style={{ left: `${startPct}%` }}
              className="absolute top-0 bottom-0 -translate-x-1/2 w-3.5 flex items-center justify-center cursor-ew-resize group z-20"
            >
              <div className="w-1.5 h-full bg-cyan-400 rounded-sm shadow-sm group-hover:w-2 transition-[width]" />
              <div className="absolute -top-6 px-1.5 py-0.5 rounded bg-[#090b10] border border-cyan-400/40 text-[10px] font-mono tabular-nums text-cyan-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                {formatShortTime(trimStart)}
              </div>
            </div>

            {/* Draggable End Trim Handle */}
            <div
              role="slider"
              aria-label="Clip end time"
              aria-valuemin={trimStart}
              aria-valuemax={duration}
              aria-valuenow={trimEnd}
              tabIndex={0}
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragTarget('end');
              }}
              style={{ left: `${endPct}%` }}
              className="absolute top-0 bottom-0 -translate-x-1/2 w-3.5 flex items-center justify-center cursor-ew-resize group z-20"
            >
              <div className="w-1.5 h-full bg-cyan-400 rounded-sm shadow-sm group-hover:w-2 transition-[width]" />
              <div className="absolute -top-6 px-1.5 py-0.5 rounded bg-[#090b10] border border-cyan-400/40 text-[10px] font-mono tabular-nums text-cyan-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">
                {formatShortTime(trimEnd)}
              </div>
            </div>

            {/* Playhead Needle */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 -translate-x-1/2 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)] z-10"
              style={{ left: `${playPct}%` }}
            >
              <div className="w-2.5 h-2.5 -ml-[4px] -mt-1 rounded-full bg-white border border-[#090b10]" />
            </div>
          </>
        )}
      </div>

      {/* Transport Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!hasAudio}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-9 h-9 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-slate-100 border border-white/[0.1] flex items-center justify-center transition-colors disabled:opacity-40 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onToggleLoop}
            disabled={!hasAudio}
            aria-pressed={loopClip}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40 ${
              loopClip
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Repeat className="w-3.5 h-3.5" />
            <span>Loop Clip</span>
          </button>

          <button
            type="button"
            onClick={onAutoCaptions}
            disabled={!hasAudio || isGeneratingCaptions}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-slate-200 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
          >
            {isGeneratingCaptions ? (
              <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
            ) : (
              <Captions className="w-3.5 h-3.5 text-cyan-400" />
            )}
            <span>{isGeneratingCaptions ? 'Generating...' : 'Auto Captions'}</span>
          </button>

          <div className="pl-2 text-xs font-mono tabular-nums text-slate-300 flex items-center gap-2 whitespace-nowrap">
            <span>{formatShortTime(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatShortTime(duration)}</span>
            {hasAudio && (
              <>
                <span className="text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-cyan-400">Clip {clipDuration.toFixed(1)}s</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Volume */}
          <div className="hidden sm:flex items-center gap-2 bg-[#090b10] border border-white/[0.08] rounded-lg px-2.5 py-1.5">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={isMuted ? 0 : volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              aria-label="Volume"
              className="studio-range w-20"
            />
          </div>

          <button
            type="button"
            onClick={onOpenBatchExport}
            disabled={!hasAudio || isExporting}
            className="px-3 py-2 rounded-lg text-xs font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>{batchQueueCount > 0 ? `Batch (${batchQueueCount})` : 'Batch Queue'}</span>
          </button>

          <button
            type="button"
            onClick={onExport}
            disabled={!hasAudio || isExporting}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export MP4</span>
          </button>
        </div>
      </div>
    </div>
  );
}
