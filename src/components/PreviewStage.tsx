import { useEffect, useRef, useState } from 'react';
import {
  Captions,
  Check,
  Grid3x3,
  Loader2,
  Music2,
  Play,
  Plus,
  Scan,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { ASPECT_RATIOS, AspectRatioKey, LyricLine } from '../types/studio';
import {
  createLyricId,
  formatLrcTimestamp,
  parseCaptionsFile,
} from '../utils/lrcParser';

interface PreviewStageProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  aspectRatio: AspectRatioKey;
  hasAudio: boolean;
  isPlaying: boolean;
  isGeneratingDemo: boolean;
  showSafeZone: boolean;
  onToggleSafeZone: () => void;
  onAutoArrange: () => void;
  autoArrangeNotice: string | null;
  onTogglePlay: () => void;
  onUploadAudioClick: () => void;
  onLoadDemo: () => void;
  lyrics: LyricLine[];
  currentTime: number;
  duration: number;
  isGeneratingCaptions: boolean;
  onLyricsChange: (lyrics: LyricLine[]) => void;
  onAutoGenerateCaptions: () => void;
  onOpenLyricsTab: () => void;
}

export function PreviewStage({
  canvasRef,
  aspectRatio,
  hasAudio,
  isPlaying,
  isGeneratingDemo,
  showSafeZone,
  onToggleSafeZone,
  onAutoArrange,
  autoArrangeNotice,
  onTogglePlay,
  onUploadAudioClick,
  onLoadDemo,
  lyrics,
  currentTime,
  duration,
  isGeneratingCaptions,
  onLyricsChange,
  onAutoGenerateCaptions,
  onOpenLyricsTab,
}: PreviewStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageCaptionInputRef = useRef<HTMLInputElement>(null);
  const [boxSize, setBoxSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 360,
  });
  const [isCaptionsDrawerOpen, setIsCaptionsDrawerOpen] = useState(false);
  const [quickLineText, setQuickLineText] = useState('');
  const [pasteLyricsText, setPasteLyricsText] = useState('');
  const [isDraggingCaptionFile, setIsDraggingCaptionFile] = useState(false);
  const [stageCaptionNotice, setStageCaptionNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const target = ASPECT_RATIOS[aspectRatio];

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const computeSize = () => {
      const rect = el.getBoundingClientRect();
      const pad = 24;
      const availW = Math.max(160, rect.width - pad * 2);
      const availH = Math.max(160, rect.height - pad * 2);
      const targetRatio = target.width / target.height;

      let w = availW;
      let h = w / targetRatio;

      if (h > availH) {
        h = availH;
        w = h * targetRatio;
      }

      setBoxSize({
        width: Math.floor(w),
        height: Math.floor(h),
      });
    };

    computeSize();
    const observer = new ResizeObserver(computeSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, [target.width, target.height]);

  useEffect(() => {
    if (!stageCaptionNotice) return;
    const timer = window.setTimeout(() => setStageCaptionNotice(null), 3200);
    return () => window.clearTimeout(timer);
  }, [stageCaptionNotice]);

  const handleStageCaptionFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = parseCaptionsFile(
        text,
        file.name,
        duration > 0 ? duration : undefined
      );
      if (parsed.length === 0) {
        setStageCaptionNotice({
          type: 'error',
          text: `No readable captions found in "${file.name}".`,
        });
        return;
      }
      onLyricsChange(parsed);
      setIsCaptionsDrawerOpen(true);
      setStageCaptionNotice({
        type: 'success',
        text: `Loaded ${parsed.length} cues from ${file.name}`,
      });
    } catch {
      setStageCaptionNotice({
        type: 'error',
        text: 'Unable to read that caption file.',
      });
    }
  };

  const handleAddQuickCaption = () => {
    const cleaned = quickLineText.trim();
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
    setQuickLineText('');
    setStageCaptionNotice({
      type: 'success',
      text: `Added cue at [${formatLrcTimestamp(currentTime)}]`,
    });
  };

  const handleImportPastedLyrics = () => {
    if (!pasteLyricsText.trim()) return;
    const parsed = parseCaptionsFile(
      pasteLyricsText,
      undefined,
      duration > 0 ? duration : undefined
    );
    if (parsed.length === 0) return;
    onLyricsChange(parsed);
    setPasteLyricsText('');
    setStageCaptionNotice({
      type: 'success',
      text: `Added ${parsed.length} caption cues to timeline`,
    });
  };

  const sortedLyrics = [...lyrics].sort((a, b) => a.time - b.time);
  let activeCueIdx = -1;
  for (let i = 0; i < sortedLyrics.length; i++) {
    if (sortedLyrics[i].time <= currentTime + 0.05) {
      activeCueIdx = i;
    } else {
      break;
    }
  }

  return (
    <div
      ref={containerRef}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setIsDraggingCaptionFile(true);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setIsDraggingCaptionFile(false);
        }
      }}
      onDrop={(e) => {
        setIsDraggingCaptionFile(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const lower = file.name.toLowerCase();
        if (
          lower.endsWith('.lrc') ||
          lower.endsWith('.srt') ||
          lower.endsWith('.vtt') ||
          lower.endsWith('.txt')
        ) {
          e.preventDefault();
          void handleStageCaptionFile(file);
        }
      }}
      className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-[#090b10] overflow-hidden select-none"
    >
      <input
        ref={stageCaptionInputRef}
        type="file"
        accept=".lrc,.srt,.vtt,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleStageCaptionFile(f);
          e.target.value = '';
        }}
      />

      {/* Subtle grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
      />

      {/* Drag & drop caption overlay */}
      {isDraggingCaptionFile && (
        <div className="pointer-events-none absolute inset-3 z-30 rounded-xl border-2 border-dashed border-cyan-400/70 bg-cyan-500/10 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-center">
          <Captions className="w-7 h-7 text-cyan-300" />
          <p className="text-xs font-semibold text-cyan-100">
            Drop .lrc, .srt, .vtt, or .txt to load video captions
          </p>
        </div>
      )}

      {/* Stage Framing & Video Captions Controls */}
      <div className="absolute top-3 right-3 z-20 flex flex-wrap items-center justify-end gap-2 max-w-[calc(100%-1.5rem)]">
        {autoArrangeNotice && (
          <div
            role="status"
            className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium font-mono tabular-nums bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 backdrop-blur-sm flex items-center gap-1.5 whitespace-nowrap"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{autoArrangeNotice}</span>
          </div>
        )}

        <button
          type="button"
          onClick={() => setIsCaptionsDrawerOpen((open) => !open)}
          aria-expanded={isCaptionsDrawerOpen}
          title="Upload or add lyrics & captions directly on the video stage"
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1.5 backdrop-blur-sm cursor-pointer whitespace-nowrap shrink-0 ${
            isCaptionsDrawerOpen
              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.16)]'
              : 'bg-[#121620]/85 border-white/[0.1] text-slate-200 hover:text-cyan-200 hover:border-cyan-400/45 hover:bg-cyan-500/15'
          }`}
        >
          <Captions
            className={`w-3.5 h-3.5 shrink-0 ${
              isCaptionsDrawerOpen || lyrics.length > 0 ? 'text-cyan-400' : 'text-slate-400'
            }`}
          />
          <span>
            {lyrics.length > 0 ? `Lyrics (${lyrics.length})` : 'Add Lyrics'}
          </span>
        </button>

        <button
          type="button"
          onClick={onAutoArrange}
          title="Auto-Arrange visualizer scale, lyric position & bloom for this aspect ratio"
          className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium border bg-[#121620]/85 border-white/[0.1] text-slate-200 hover:text-cyan-200 hover:border-cyan-400/45 hover:bg-cyan-500/15 transition-colors flex items-center gap-1.5 backdrop-blur-sm cursor-pointer whitespace-nowrap shrink-0"
        >
          <Scan className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>Auto-Arrange</span>
        </button>

        <button
          type="button"
          onClick={onToggleSafeZone}
          aria-pressed={showSafeZone}
          title="Toggle Safe Zone Guide & 9:16 Composition Grid (S)"
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1.5 backdrop-blur-sm cursor-pointer whitespace-nowrap shrink-0 ${
            showSafeZone
              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.16)]'
              : 'bg-[#121620]/85 border-white/[0.1] text-slate-300 hover:text-white hover:border-white/[0.2]'
          }`}
        >
          <Grid3x3 className={`w-3.5 h-3.5 ${showSafeZone ? 'text-cyan-400' : 'text-slate-400'}`} />
          <span>Safe Zone Guide</span>
        </button>
      </div>

      {/* Video Stage Lyrics & Captions Drawer */}
      {isCaptionsDrawerOpen && (
        <div
          role="dialog"
          aria-label="Video Lyrics and Captions"
          className="absolute top-13 right-3 z-30 w-[calc(100%-1.5rem)] max-w-[350px] rounded-xl bg-[#10141e]/95 backdrop-blur-md border border-white/[0.14] shadow-2xl shadow-black/75 p-3.5 space-y-3 select-text"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Captions className="w-4 h-4 text-cyan-400 shrink-0" />
              <h3 className="text-xs font-semibold text-slate-100 truncate">
                Video Lyrics &amp; Captions
              </h3>
              <span className="text-[11px] font-mono tabular-nums text-cyan-300 shrink-0">
                ({lyrics.length})
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsCaptionsDrawerOpen(false);
                  onOpenLyricsTab();
                }}
                className="text-[10.5px] font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer whitespace-nowrap"
              >
                Full Studio
              </button>
              <button
                type="button"
                onClick={() => setIsCaptionsDrawerOpen(false)}
                aria-label="Close video lyrics panel"
                className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => stageCaptionInputRef.current?.click()}
              className="px-2.5 py-2 rounded-lg text-[11px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-slate-100 border border-white/[0.1] transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Upload .lrc / .srt / .vtt</span>
            </button>
            <button
              type="button"
              onClick={onAutoGenerateCaptions}
              disabled={!hasAudio || isGeneratingCaptions}
              className="px-2.5 py-2 rounded-lg text-[11px] font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {isGeneratingCaptions ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
              ) : (
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
              )}
              <span>{isGeneratingCaptions ? 'Transcribing...' : 'Auto-Captions'}</span>
            </button>
          </div>

          {stageCaptionNotice && (
            <div
              role="status"
              className={`px-2.5 py-1.5 rounded-lg border text-[11px] leading-snug ${
                stageCaptionNotice.type === 'error'
                  ? 'bg-rose-500/12 border-rose-500/30 text-rose-200'
                  : 'bg-emerald-500/12 border-emerald-500/30 text-emerald-200'
              }`}
            >
              {stageCaptionNotice.text}
            </div>
          )}

          {/* Quick-add single caption line at playhead */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px] text-slate-400">
              <span>Add caption at playhead</span>
              <span className="font-mono tabular-nums text-cyan-300">
                [{formatLrcTimestamp(currentTime)}]
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={quickLineText}
                onChange={(e) => setQuickLineText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddQuickCaption();
                  }
                }}
                placeholder="Type caption or lyric line..."
                aria-label="Quick add video caption"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.1] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
              />
              <button
                type="button"
                disabled={!quickLineText.trim()}
                onClick={handleAddQuickCaption}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-white/[0.1] hover:bg-white/[0.16] text-slate-100 border border-white/[0.1] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Bulk paste lyrics / subtitles */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px] text-slate-400">
              <span>Paste .lrc / .srt / .vtt or plain lines</span>
            </div>
            <textarea
              rows={3}
              value={pasteLyricsText}
              onChange={(e) => setPasteLyricsText(e.target.value)}
              placeholder="Paste timestamped subtitles or plain lyric lines..."
              className="w-full px-2.5 py-1.5 rounded-lg bg-[#090b10] border border-white/[0.1] text-[11.5px] leading-relaxed text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60 resize-y"
            />
            <button
              type="button"
              disabled={!pasteLyricsText.trim()}
              onClick={handleImportPastedLyrics}
              className="w-full py-1.5 px-2.5 rounded-lg text-[11px] font-medium bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-200 border border-cyan-400/35 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              Apply Pasted Lyrics / Captions
            </button>
          </div>

          {/* Active cues preview */}
          {sortedLyrics.length > 0 && (
            <div className="pt-1 border-t border-white/[0.08] space-y-1.5">
              <div className="flex items-center justify-between text-[10.5px] text-slate-400">
                <span>Timeline Cues</span>
                <button
                  type="button"
                  onClick={() => onLyricsChange([])}
                  className="text-[10.5px] text-slate-500 hover:text-rose-300 cursor-pointer"
                >
                  Clear all
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto studio-scroll space-y-1 pr-0.5">
                {sortedLyrics.map((cue, idx) => {
                  const isActive = idx === activeCueIdx;
                  return (
                    <div
                      key={cue.id}
                      className={`px-2 py-1 rounded-md border flex items-center gap-2 text-[11px] ${
                        isActive
                          ? 'bg-cyan-500/14 border-cyan-400/40 text-cyan-100'
                          : 'bg-[#090b10]/80 border-white/[0.06] text-slate-300'
                      }`}
                    >
                      <span className="font-mono tabular-nums text-[10px] text-cyan-400 shrink-0">
                        {formatLrcTimestamp(cue.time)}
                      </span>
                      <span className="flex-1 truncate">{cue.text}</span>
                      <button
                        type="button"
                        aria-label={`Delete caption ${cue.text}`}
                        onClick={() =>
                          onLyricsChange(lyrics.filter((item) => item.id !== cue.id))
                        }
                        className="text-slate-500 hover:text-rose-300 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div
        className="relative rounded-xl overflow-hidden border border-white/[0.1] bg-[#07090e] shadow-2xl shadow-black/70 transition-[width,height] duration-200"
        style={{
          width: `${boxSize.width}px`,
          height: `${boxSize.height}px`,
        }}
      >
        <canvas
          ref={canvasRef}
          width={target.width}
          height={target.height}
          onClick={hasAudio ? onTogglePlay : undefined}
          className={`w-full h-full block ${hasAudio ? 'cursor-pointer' : ''}`}
        />

        {/* Empty State Overlay when no audio is loaded */}
        {!hasAudio && (
          <div className="absolute inset-0 bg-[#090b10]/85 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-cyan-400 mb-4">
              <Music2 className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-100 mb-1.5">
              Load audio or video to start visualizing
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
              Drop in an MP3, WAV, OGG, M4A, or MP4/WebM file, upload captions, or synthesize a 32-second demo beat.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onUploadAudioClick}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.13] text-slate-100 border border-white/[0.1] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose Audio / Video</span>
              </button>
              <button
                type="button"
                onClick={() => stageCaptionInputRef.current?.click()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 border border-white/[0.1] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Captions className="w-3.5 h-3.5 text-cyan-400" />
                <span>Upload Lyrics</span>
              </button>
              <button
                type="button"
                onClick={onLoadDemo}
                disabled={isGeneratingDemo}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isGeneratingDemo ? 'Synthesizing...' : 'Load Demo Beat'}</span>
              </button>
            </div>
          </div>
        )}

        {/* Subtle paused click-to-play hint */}
        {hasAudio && !isPlaying && (
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label="Play preview"
            className="absolute bottom-3 right-3 px-2.5 py-1.5 rounded-lg bg-[#090b10]/75 hover:bg-[#090b10]/95 border border-white/[0.12] text-slate-200 text-[11px] font-medium flex items-center gap-1.5 transition-opacity cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current text-cyan-400" />
            <span>Click canvas to play</span>
          </button>
        )}
      </div>
    </div>
  );
}
