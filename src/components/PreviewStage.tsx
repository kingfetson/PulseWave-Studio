import { useEffect, useRef, useState } from 'react';
import { Grid3x3, Music2, Play, Sparkles, Upload } from 'lucide-react';
import { ASPECT_RATIOS, AspectRatioKey } from '../types/studio';

interface PreviewStageProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  aspectRatio: AspectRatioKey;
  hasAudio: boolean;
  isPlaying: boolean;
  isGeneratingDemo: boolean;
  showSafeZone: boolean;
  onToggleSafeZone: () => void;
  onTogglePlay: () => void;
  onUploadAudioClick: () => void;
  onLoadDemo: () => void;
}

export function PreviewStage({
  canvasRef,
  aspectRatio,
  hasAudio,
  isPlaying,
  isGeneratingDemo,
  showSafeZone,
  onToggleSafeZone,
  onTogglePlay,
  onUploadAudioClick,
  onLoadDemo,
}: PreviewStageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [boxSize, setBoxSize] = useState<{ width: number; height: number }>({
    width: 640,
    height: 360,
  });

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

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-h-0 w-full flex items-center justify-center bg-[#090b10] overflow-hidden select-none"
    >
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

      {/* Safe Zone Guide Overlay Toggle */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleSafeZone}
          aria-pressed={showSafeZone}
          title="Toggle Safe Zone Guide & 9:16 Composition Grid (S)"
          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors flex items-center gap-1.5 backdrop-blur-sm cursor-pointer ${
            showSafeZone
              ? 'bg-cyan-500/20 border-cyan-400/50 text-cyan-200 shadow-[0_0_12px_rgba(34,211,238,0.16)]'
              : 'bg-[#121620]/85 border-white/[0.1] text-slate-300 hover:text-white hover:border-white/[0.2]'
          }`}
        >
          <Grid3x3 className={`w-3.5 h-3.5 ${showSafeZone ? 'text-cyan-400' : 'text-slate-400'}`} />
          <span>Safe Zone Guide</span>
        </button>
      </div>

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
              Load audio to start visualizing
            </h2>
            <p className="text-xs text-slate-400 max-w-xs mb-5 leading-relaxed">
              Drop in an MP3, WAV, OGG, or M4A track, or synthesize a 32-second demo beat with pre-synced lyrics.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={onUploadAudioClick}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-white/[0.08] hover:bg-white/[0.13] text-slate-100 border border-white/[0.1] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Choose Audio File</span>
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
