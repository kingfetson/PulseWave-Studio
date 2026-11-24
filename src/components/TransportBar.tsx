import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Captions,
  Download,
  Layers,
  Loader2,
  Lock,
  Maximize2,
  Pause,
  Play,
  Repeat,
  Scissors,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { computeBufferMaxPeak, extractWaveformWindowPeaks } from '../utils/audioEngine';
import { formatLrcTimestamp, formatShortTime } from '../utils/lrcParser';

interface TransportBarProps {
  hasAudio: boolean;
  audioBuffer: AudioBuffer | null;
  duration: number;
  currentTime: number;
  trimStart: number;
  trimEnd: number;
  isPlaying: boolean;
  loopClip: boolean;
  previewTrimLoop: boolean;
  volume: number;
  isMuted: boolean;
  playbackRate: number;
  isExporting: boolean;
  batchQueueCount: number;
  isGeneratingCaptions: boolean;
  beatDetection: boolean;
  beatSensitivity: number;
  tapTempoBpm: number | null;
  tapTempoCount: number;
  waveformPeaks: number[];
  primaryColor: string;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onTrimChange: (start: number, end: number) => void;
  onToggleLoop: () => void;
  onTogglePreviewTrimLoop: () => void;
  onTapTempo: () => void;
  onVolumeChange: (volume: number) => void;
  onToggleMute: () => void;
  onPlaybackRateChange: (rate: number) => void;
  onAutoCaptions: () => void;
  onOpenBatchExport: () => void;
  onExport: () => void;
}

type DragTarget = 'playhead' | 'start' | 'end' | 'pan' | 'minimap' | null;

const RULER_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120];

function pickRulerStep(viewSpanSec: number, widthPx: number): number {
  const maxLabels = Math.max(3, Math.floor(widthPx / 76));
  for (const step of RULER_STEPS) {
    if (viewSpanSec / step <= maxLabels) {
      return step;
    }
  }
  return 120;
}

function formatRulerLabel(seconds: number, step: number): string {
  const clamped = Math.max(0, seconds);
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  if (step < 1) {
    return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
  }
  return `${mins}:${String(Math.floor(secs)).padStart(2, '0')}`;
}

export function TransportBar({
  hasAudio,
  audioBuffer,
  duration,
  currentTime,
  trimStart,
  trimEnd,
  isPlaying,
  loopClip,
  previewTrimLoop,
  volume,
  isMuted,
  playbackRate,
  isExporting,
  batchQueueCount,
  isGeneratingCaptions,
  beatDetection,
  beatSensitivity,
  tapTempoBpm,
  tapTempoCount,
  waveformPeaks,
  primaryColor,
  onTogglePlay,
  onSeek,
  onTrimChange,
  onToggleLoop,
  onTogglePreviewTrimLoop,
  onTapTempo,
  onVolumeChange,
  onToggleMute,
  onPlaybackRateChange,
  onAutoCaptions,
  onOpenBatchExport,
  onExport,
}: TransportBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const waveCanvasRef = useRef<HTMLCanvasElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const minimapCanvasRef = useRef<HTMLCanvasElement>(null);

  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [trackWidth, setTrackWidth] = useState(600);
  const [tapPulse, setTapPulse] = useState(false);
  const tapPulseTimerRef = useRef<number | null>(null);

  // Zoom & viewport window state
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const panAnchorRef = useRef<{
    clientX: number;
    initialViewStart: number;
    mode: 'wave' | 'minimap';
  } | null>(null);

  const maxZoom = useMemo(() => {
    if (!hasAudio || duration <= 1) return 1;
    return Math.min(64, Math.max(4, Math.floor(duration / 0.75)));
  }, [hasAudio, duration]);

  const safeDur = duration > 0 ? duration : 1;
  const clampedZoom = hasAudio ? Math.max(1, Math.min(maxZoom, zoom)) : 1;
  const viewSpan = safeDur / clampedZoom;
  const maxViewStart = Math.max(0, safeDur - viewSpan);
  const clampedViewStart = hasAudio ? Math.max(0, Math.min(maxViewStart, viewStart)) : 0;
  const viewEnd = Math.min(safeDur, clampedViewStart + viewSpan);

  // Keep refs fresh for non-passive wheel handler
  const viewportRef = useRef({
    hasAudio,
    duration: safeDur,
    zoom: clampedZoom,
    maxZoom,
    viewStart: clampedViewStart,
    viewSpan,
    currentTime,
  });
  viewportRef.current = {
    hasAudio,
    duration: safeDur,
    zoom: clampedZoom,
    maxZoom,
    viewStart: clampedViewStart,
    viewSpan,
    currentTime,
  };

  // Reset zoom when loading/clearing audio
  useEffect(() => {
    setZoom(1);
    setViewStart(0);
    setHoverTime(null);
    setHoverX(null);
  }, [audioBuffer, duration]);

  useEffect(() => {
    return () => {
      if (tapPulseTimerRef.current !== null) {
        window.clearTimeout(tapPulseTimerRef.current);
      }
    };
  }, []);

  const applyZoomAtAnchor = useCallback(
    (nextZoomRaw: number, anchorTime: number, anchorFractionInView = 0.5) => {
      const dur = duration > 0 ? duration : 1;
      const nextZoom = Math.max(1, Math.min(maxZoom, Number(nextZoomRaw.toFixed(2))));
      const nextSpan = dur / nextZoom;
      const nextMaxStart = Math.max(0, dur - nextSpan);
      const nextStart = Math.max(
        0,
        Math.min(nextMaxStart, anchorTime - anchorFractionInView * nextSpan)
      );
      setZoom(nextZoom);
      setViewStart(nextStart);
    },
    [duration, maxZoom]
  );

  const handleZoomByFactor = useCallback(
    (factor: number) => {
      if (!hasAudio || duration <= 0) return;
      const anchorInView =
        currentTime >= clampedViewStart && currentTime <= viewEnd
          ? (currentTime - clampedViewStart) / Math.max(0.001, viewSpan)
          : 0.5;
      const anchorTime = clampedViewStart + anchorInView * viewSpan;
      applyZoomAtAnchor(clampedZoom * factor, anchorTime, anchorInView);
    },
    [
      hasAudio,
      duration,
      currentTime,
      clampedViewStart,
      viewEnd,
      viewSpan,
      clampedZoom,
      applyZoomAtAnchor,
    ]
  );

  const handleFitTrim = useCallback(() => {
    if (!hasAudio || duration <= 0) return;
    const trimSpan = Math.max(0.5, trimEnd - trimStart);
    const paddedSpan = Math.min(duration, trimSpan * 1.24);
    const targetZoom = Math.max(1, Math.min(maxZoom, duration / paddedSpan));
    const actualSpan = duration / targetZoom;
    const trimCenter = (trimStart + trimEnd) * 0.5;
    const nextStart = Math.max(0, Math.min(duration - actualSpan, trimCenter - actualSpan * 0.5));
    setZoom(Number(targetZoom.toFixed(2)));
    setViewStart(nextStart);
  }, [hasAudio, duration, trimStart, trimEnd, maxZoom]);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
    setViewStart(0);
  }, []);

  const focusTimeInView = useCallback(
    (targetTime: number) => {
      if (!hasAudio || duration <= 0) return;
      if (clampedZoom <= 1.01) {
        onSeek(Number(targetTime.toFixed(2)));
        return;
      }
      const nextStart = Math.max(
        0,
        Math.min(maxViewStart, targetTime - viewSpan * 0.5)
      );
      setViewStart(nextStart);
      onSeek(Number(targetTime.toFixed(2)));
    },
    [hasAudio, duration, clampedZoom, maxViewStart, viewSpan, onSeek]
  );

  // Auto-follow playhead across zoomed pages during playback
  useEffect(() => {
    if (!isPlaying || !hasAudio || clampedZoom <= 1.01 || dragTarget !== null) return;
    if (currentTime > viewEnd - viewSpan * 0.04 || currentTime < clampedViewStart) {
      const nextStart = Math.max(
        0,
        Math.min(maxViewStart, currentTime - viewSpan * 0.14)
      );
      setViewStart(nextStart);
    }
  }, [
    isPlaying,
    hasAudio,
    clampedZoom,
    dragTarget,
    currentTime,
    viewEnd,
    clampedViewStart,
    viewSpan,
    maxViewStart,
  ]);

  const handleTapTempoClick = () => {
    if (!hasAudio) return;
    setTapPulse(true);
    if (tapPulseTimerRef.current !== null) {
      window.clearTimeout(tapPulseTimerRef.current);
    }
    tapPulseTimerRef.current = window.setTimeout(() => {
      setTapPulse(false);
      tapPulseTimerRef.current = null;
    }, 170);
    onTapTempo();
  };

  // Keep trackWidth updated for crisp DPR canvas waveform rendering
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => setTrackWidth(Math.max(120, el.clientWidth));
    update();
    const obs = new ResizeObserver(update);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Non-passive wheel zoom (cursor-anchored) & horizontal pan on the waveform
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      const vp = viewportRef.current;
      if (!vp.hasAudio || vp.duration <= 0) return;

      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const pointerFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));

      // Horizontal scroll or Shift+Wheel pans the zoomed window
      const isHorizontalPan =
        e.shiftKey || (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 0);
      if (isHorizontalPan && vp.zoom > 1.01) {
        const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const panSeconds = (rawDelta / Math.max(100, rect.width)) * vp.viewSpan * 0.85;
        const maxStart = Math.max(0, vp.duration - vp.viewSpan);
        setViewStart((prev) => Math.max(0, Math.min(maxStart, prev + panSeconds)));
        return;
      }

      if (Math.abs(e.deltaY) < 0.5) return;

      const zoomFactor = e.deltaY < 0 ? 1.24 : 1 / 1.24;
      const anchorTime = vp.viewStart + pointerFrac * vp.viewSpan;
      const nextZoom = Math.max(1, Math.min(vp.maxZoom, Number((vp.zoom * zoomFactor).toFixed(2))));
      const nextSpan = vp.duration / nextZoom;
      const nextMaxStart = Math.max(0, vp.duration - nextSpan);
      const nextStart = Math.max(0, Math.min(nextMaxStart, anchorTime - pointerFrac * nextSpan));

      setZoom(nextZoom);
      setViewStart(nextStart);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Compute consistent global peak amplitude for proportional zoomed waveform height
  const globalMaxPeak = useMemo(() => {
    if (!audioBuffer) return 1;
    return computeBufferMaxPeak(audioBuffer);
  }, [audioBuffer]);

  // Extract high-resolution waveform peaks for the visible [clampedViewStart, viewEnd] window
  const visiblePeaks = useMemo(() => {
    const bucketCount = Math.max(120, Math.min(460, Math.round(trackWidth / 3)));
    if (audioBuffer && duration > 0) {
      return extractWaveformWindowPeaks(
        audioBuffer,
        clampedViewStart,
        viewEnd,
        bucketCount,
        globalMaxPeak
      );
    }
    if (waveformPeaks.length === 0) {
      return new Array(140).fill(0.14);
    }
    // Fallback slice from overview peaks
    const startIdx = Math.floor((clampedViewStart / safeDur) * waveformPeaks.length);
    const endIdx = Math.max(
      startIdx + 1,
      Math.ceil((viewEnd / safeDur) * waveformPeaks.length)
    );
    return waveformPeaks.slice(startIdx, endIdx);
  }, [
    audioBuffer,
    duration,
    trackWidth,
    clampedViewStart,
    viewEnd,
    globalMaxPeak,
    waveformPeaks,
    safeDur,
  ]);

  // Draw integrated timeline ruler + zoomed waveform peaks onto canvas
  useEffect(() => {
    const canvas = waveCanvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const totalHeight = 64;
    const rulerHeight = 16;
    const waveHeight = totalHeight - rulerHeight;

    canvas.width = Math.floor(trackWidth * dpr);
    canvas.height = Math.floor(totalHeight * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, trackWidth, totalHeight);

    const span = Math.max(0.01, viewEnd - clampedViewStart);
    const timeToX = (t: number) => ((t - clampedViewStart) / span) * trackWidth;

    // 1. Ruler background + baseline
    ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
    ctx.fillRect(0, 0, trackWidth, rulerHeight);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, rulerHeight - 0.5);
    ctx.lineTo(trackWidth, rulerHeight - 0.5);
    ctx.stroke();

    if (hasAudio && duration > 0) {
      const step = pickRulerStep(span, trackWidth);
      const firstTick = Math.ceil(clampedViewStart / step) * step;

      ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.textBaseline = 'middle';

      for (let t = firstTick; t <= viewEnd + 0.0001; t += step) {
        const x = timeToX(t);
        if (x < 0 || x > trackWidth) continue;

        // Major tick
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.42)';
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, rulerHeight - 5);
        ctx.lineTo(Math.round(x) + 0.5, rulerHeight);
        ctx.stroke();

        // Subtle vertical grid line into waveform
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, rulerHeight);
        ctx.lineTo(Math.round(x) + 0.5, totalHeight);
        ctx.stroke();

        const label = formatRulerLabel(t, step);
        const labelX = Math.min(trackWidth - 34, Math.max(3, x + 3));
        ctx.fillStyle = 'rgba(148, 163, 184, 0.78)';
        ctx.fillText(label, labelX, rulerHeight * 0.5);
      }

      // Minor midpoint ticks
      const halfStep = step / 2;
      if (halfStep >= 0.05) {
        const firstHalf = Math.ceil(clampedViewStart / halfStep) * halfStep;
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
        for (let t = firstHalf; t <= viewEnd + 0.0001; t += halfStep) {
          const x = timeToX(t);
          if (x < 0 || x > trackWidth) continue;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, rulerHeight - 3);
          ctx.lineTo(Math.round(x) + 0.5, rulerHeight);
          ctx.stroke();
        }
      }
    }

    // 2. Active trim window tint in waveform zone
    if (hasAudio && duration > 0) {
      const visTrimStartX = Math.max(0, Math.min(trackWidth, timeToX(trimStart)));
      const visTrimEndX = Math.max(visTrimStartX, Math.min(trackWidth, timeToX(trimEnd)));
      if (visTrimEndX > visTrimStartX) {
        ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
        ctx.fillRect(visTrimStartX, rulerHeight, visTrimEndX - visTrimStartX, waveHeight);
      }
    }

    // 3. Waveform bars
    const count = visiblePeaks.length;
    const stepW = trackWidth / count;
    const barW = Math.max(1.25, Math.min(3.5, stepW * 0.64));
    const midY = rulerHeight + waveHeight * 0.5;

    for (let i = 0; i < count; i++) {
      const barTime = clampedViewStart + ((i + 0.5) / count) * span;
      const inTrim = barTime >= trimStart && barTime <= trimEnd;
      const isPlayed = barTime <= currentTime && inTrim;

      const amp = Math.max(0.06, visiblePeaks[i]);
      const barH = amp * (waveHeight - 8);
      const x = i * stepW + (stepW - barW) * 0.5;
      const y = midY - barH * 0.5;

      if (!hasAudio) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
      } else if (isPlayed) {
        ctx.fillStyle = primaryColor || '#22d3ee';
      } else if (inTrim) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.56)';
      } else {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, barW / 2);
      ctx.fill();
    }
  }, [
    trackWidth,
    visiblePeaks,
    duration,
    trimStart,
    trimEnd,
    currentTime,
    hasAudio,
    primaryColor,
    clampedViewStart,
    viewEnd,
  ]);

  // Draw miniature full-track overview canvas when zoomed in
  useEffect(() => {
    if (!hasAudio || clampedZoom <= 1.01) return;
    const canvas = minimapCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const height = 16;
    canvas.width = Math.floor(trackWidth * dpr);
    canvas.height = Math.floor(height * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, trackWidth, height);

    const peaks = waveformPeaks.length > 0 ? waveformPeaks : new Array(120).fill(0.2);
    const count = peaks.length;
    const stepW = trackWidth / count;
    const barW = Math.max(1, stepW * 0.65);
    const midY = height / 2;

    for (let i = 0; i < count; i++) {
      const frac = (i + 0.5) / count;
      const t = frac * safeDur;
      const inTrim = t >= trimStart && t <= trimEnd;
      const barH = Math.max(2, peaks[i] * (height - 4));
      const x = i * stepW;
      ctx.fillStyle = inTrim ? 'rgba(34, 211, 238, 0.45)' : 'rgba(148, 163, 184, 0.22)';
      ctx.fillRect(x, midY - barH * 0.5, barW, barH);
    }
  }, [hasAudio, clampedZoom, trackWidth, waveformPeaks, safeDur, trimStart, trimEnd]);

  // Pointer drag handling for Start Handle, End Handle, Playhead Scrubbing, and Viewport Panning
  useEffect(() => {
    if (!dragTarget) return;

    const handleMove = (e: PointerEvent) => {
      if (duration <= 0) return;

      if (dragTarget === 'pan' && panAnchorRef.current) {
        const el = trackRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const dx = e.clientX - panAnchorRef.current.clientX;
        const deltaSec = (dx / Math.max(1, rect.width)) * viewSpan;
        const nextStart = Math.max(
          0,
          Math.min(maxViewStart, panAnchorRef.current.initialViewStart - deltaSec)
        );
        setViewStart(nextStart);
        return;
      }

      if (dragTarget === 'minimap' && panAnchorRef.current) {
        const mini = minimapRef.current;
        if (!mini) return;
        const rect = mini.getBoundingClientRect();
        const dx = e.clientX - panAnchorRef.current.clientX;
        const deltaSec = (dx / Math.max(1, rect.width)) * duration;
        const nextStart = Math.max(
          0,
          Math.min(maxViewStart, panAnchorRef.current.initialViewStart + deltaSec)
        );
        setViewStart(nextStart);
        return;
      }

      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
      const time = clampedViewStart + frac * viewSpan;
      const minGap = Math.min(0.5, duration * 0.1);

      if (dragTarget === 'start') {
        const nextStart = Math.min(time, trimEnd - minGap);
        onTrimChange(Math.max(0, Number(nextStart.toFixed(2))), trimEnd);
      } else if (dragTarget === 'end') {
        const nextEnd = Math.max(time, trimStart + minGap);
        onTrimChange(trimStart, Math.min(duration, Number(nextEnd.toFixed(2))));
      } else if (dragTarget === 'playhead') {
        onSeek(Math.max(0, Math.min(duration, Number(time.toFixed(2)))));
      }
    };

    const handleUp = () => {
      setDragTarget(null);
      panAnchorRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [
    dragTarget,
    duration,
    trimStart,
    trimEnd,
    clampedViewStart,
    viewSpan,
    maxViewStart,
    onTrimChange,
    onSeek,
  ]);

  const timeToPct = (t: number) => ((t - clampedViewStart) / Math.max(0.01, viewSpan)) * 100;

  const rawStartPct = hasAudio ? timeToPct(trimStart) : 0;
  const rawEndPct = hasAudio ? timeToPct(trimEnd) : 100;
  const rawPlayPct = hasAudio ? timeToPct(currentTime) : 0;

  const isStartInView = hasAudio && trimStart >= clampedViewStart - 0.001 && trimStart <= viewEnd + 0.001;
  const isEndInView = hasAudio && trimEnd >= clampedViewStart - 0.001 && trimEnd <= viewEnd + 0.001;
  const isPlayInView = hasAudio && currentTime >= clampedViewStart - 0.001 && currentTime <= viewEnd + 0.001;

  const clampedStartPct = Math.max(0, Math.min(100, rawStartPct));
  const clampedEndPct = Math.max(clampedStartPct, Math.min(100, rawEndPct));
  const clipDuration = Math.max(0, trimEnd - trimStart);

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasAudio || duration <= 0) return;
    const el = trackRef.current;
    if (!el) return;

    // Middle mouse or Alt+Drag pans the zoomed waveform
    if (clampedZoom > 1.01 && (e.button === 1 || e.altKey)) {
      e.preventDefault();
      panAnchorRef.current = {
        clientX: e.clientX,
        initialViewStart: clampedViewStart,
        mode: 'wave',
      };
      setDragTarget('pan');
      return;
    }

    if (e.button !== 0) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const clickedTime = clampedViewStart + frac * viewSpan;
    onSeek(Math.max(0, Math.min(duration, Number(clickedTime.toFixed(2)))));
    setDragTarget('playhead');
  };

  const handleTrackPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasAudio || duration <= 0) return;
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const frac = x / Math.max(1, rect.width);
    setHoverX(x);
    setHoverTime(Math.max(0, Math.min(duration, clampedViewStart + frac * viewSpan)));
  };

  const handleTrimHandleKeyDown = (
    target: 'start' | 'end',
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (!hasAudio || duration <= 0) return;
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 0.25 : 0.05;
    const delta = e.key === 'ArrowLeft' ? -step : step;
    const minGap = Math.min(0.5, duration * 0.1);

    if (target === 'start') {
      const next = Math.max(0, Math.min(trimEnd - minGap, trimStart + delta));
      onTrimChange(Number(next.toFixed(2)), trimEnd);
    } else {
      const next = Math.min(duration, Math.max(trimStart + minGap, trimEnd + delta));
      onTrimChange(trimStart, Number(next.toFixed(2)));
    }
  };

  const handleSetInAtPlayhead = () => {
    if (!hasAudio || duration <= 0) return;
    const minGap = Math.min(0.5, duration * 0.1);
    const nextStart = Math.max(0, Math.min(currentTime, trimEnd - minGap));
    onTrimChange(Number(nextStart.toFixed(2)), trimEnd);
  };

  const handleSetOutAtPlayhead = () => {
    if (!hasAudio || duration <= 0) return;
    const minGap = Math.min(0.5, duration * 0.1);
    const nextEnd = Math.min(duration, Math.max(currentTime, trimStart + minGap));
    onTrimChange(trimStart, Number(nextEnd.toFixed(2)));
  };

  const handleMinimapPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!hasAudio || duration <= 0 || clampedZoom <= 1.01) return;
    const mini = minimapRef.current;
    if (!mini) return;
    const rect = mini.getBoundingClientRect();
    const clickFrac = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    const clickTime = clickFrac * duration;

    const thumbStartFrac = clampedViewStart / safeDur;
    const thumbEndFrac = viewEnd / safeDur;

    let initialStart = clampedViewStart;
    if (clickFrac < thumbStartFrac || clickFrac > thumbEndFrac) {
      initialStart = Math.max(0, Math.min(maxViewStart, clickTime - viewSpan * 0.5));
      setViewStart(initialStart);
    }

    panAnchorRef.current = {
      clientX: e.clientX,
      initialViewStart: initialStart,
      mode: 'minimap',
    };
    setDragTarget('minimap');
  };

  const thumbLeftPct = (clampedViewStart / safeDur) * 100;
  const thumbWidthPct = Math.max(2, (viewSpan / safeDur) * 100);

  return (
    <div className="shrink-0 border-t border-white/[0.08] bg-[#121620] px-5 py-2.5 flex flex-col gap-2.5">
      {/* Waveform Zoom & Precision Trim Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-slate-400 font-medium whitespace-nowrap">Waveform</span>
          <span className="text-slate-600" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums text-slate-300 whitespace-nowrap">
            {hasAudio
              ? `${formatLrcTimestamp(clampedViewStart)} – ${formatLrcTimestamp(viewEnd)}`
              : '00:00.00 – 00:00.00'}
          </span>

          {hasAudio && (
            <div className="hidden md:flex items-center gap-1.5 ml-2 pl-2 border-l border-white/[0.08]">
              <button
                type="button"
                onClick={() => focusTimeInView(trimStart)}
                title="Jump to clip start"
                className="px-1.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap"
              >
                In {formatLrcTimestamp(trimStart)}
              </button>
              <button
                type="button"
                onClick={handleSetInAtPlayhead}
                title="Set clip start to current playhead"
                className="px-1.5 py-0.5 rounded border border-white/[0.08] hover:border-cyan-400/40 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Set In
              </button>
              <span className="text-slate-700" aria-hidden="true">
                /
              </span>
              <button
                type="button"
                onClick={() => focusTimeInView(trimEnd)}
                title="Jump to clip end"
                className="px-1.5 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.09] text-slate-300 font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap"
              >
                Out {formatLrcTimestamp(trimEnd)}
              </button>
              <button
                type="button"
                onClick={handleSetOutAtPlayhead}
                title="Set clip end to current playhead"
                className="px-1.5 py-0.5 rounded border border-white/[0.08] hover:border-cyan-400/40 text-slate-400 hover:text-cyan-300 transition-colors cursor-pointer whitespace-nowrap"
              >
                Set Out
              </button>
            </div>
          )}
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center rounded-md bg-[#090b10] border border-white/[0.08] p-0.5">
            <button
              type="button"
              onClick={() => handleZoomByFactor(1 / 1.6)}
              disabled={!hasAudio || clampedZoom <= 1.01}
              aria-label="Zoom out waveform"
              title="Zoom out (scroll down over waveform)"
              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono tabular-nums text-[11px] text-cyan-300 min-w-[44px] text-center select-none">
              {clampedZoom.toFixed(1)}×
            </span>
            <button
              type="button"
              onClick={() => handleZoomByFactor(1.6)}
              disabled={!hasAudio || clampedZoom >= maxZoom - 0.05}
              aria-label="Zoom in waveform"
              title="Zoom in (scroll up over waveform)"
              className="w-6 h-6 rounded flex items-center justify-center text-slate-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={handleFitTrim}
            disabled={!hasAudio}
            title="Zoom to fit active trim selection"
            className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-slate-300 hover:text-white transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Scissors className="w-3 h-3 text-cyan-400" />
            <span>Fit Trim</span>
          </button>

          <button
            type="button"
            onClick={handleResetZoom}
            disabled={!hasAudio || clampedZoom <= 1.01}
            title="Reset zoom to full track (1.0×)"
            className="px-2 py-1 rounded-md bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] text-slate-300 hover:text-white transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer"
          >
            <Maximize2 className="w-3 h-3" />
            <span>1×</span>
          </button>
        </div>
      </div>

      {/* Waveform Scrubber + Time Ruler + Trim Handles */}
      <div className="flex flex-col gap-1">
        <div
          ref={trackRef}
          onPointerDown={handleTrackPointerDown}
          onPointerMove={handleTrackPointerMove}
          onPointerLeave={() => {
            setHoverTime(null);
            setHoverX(null);
          }}
          className={`relative h-[64px] w-full rounded-lg bg-[#090b10] border border-white/[0.08] select-none overflow-visible ${
            !hasAudio
              ? 'opacity-60 cursor-not-allowed'
              : dragTarget === 'pan'
              ? 'cursor-grabbing'
              : 'cursor-crosshair'
          }`}
        >
          <canvas ref={waveCanvasRef} className="w-full h-full block rounded-lg" />

          {hasAudio && (
            <>
              {/* Dimmed outside overlays inside visible window */}
              {clampedStartPct > 0 && (
                <div
                  className="pointer-events-none absolute top-[16px] bottom-0 left-0 bg-black/45 rounded-bl-lg"
                  style={{ width: `${clampedStartPct}%` }}
                />
              )}
              {clampedEndPct < 100 && (
                <div
                  className="pointer-events-none absolute top-[16px] bottom-0 right-0 bg-black/45 rounded-br-lg"
                  style={{ width: `${Math.max(0, 100 - clampedEndPct)}%` }}
                />
              )}

              {/* Active clip top/bottom hairline */}
              {clampedEndPct > clampedStartPct && (
                <div
                  className={`pointer-events-none absolute top-[16px] bottom-0 border-y transition-colors ${
                    previewTrimLoop
                      ? 'border-emerald-400/75 bg-emerald-400/[0.04]'
                      : 'border-cyan-400/50'
                  }`}
                  style={{
                    left: `${clampedStartPct}%`,
                    width: `${Math.max(0, clampedEndPct - clampedStartPct)}%`,
                  }}
                />
              )}

              {/* Hover crosshair & precise timestamp preview */}
              {hoverTime !== null && hoverX !== null && dragTarget === null && (
                <div
                  className="pointer-events-none absolute top-[16px] bottom-0 w-px bg-white/30 z-10"
                  style={{ left: `${hoverX}px` }}
                >
                  <div className="absolute -top-[21px] -translate-x-1/2 px-1.5 py-0.5 rounded bg-[#0d111a] border border-white/15 text-[10px] font-mono tabular-nums text-slate-200 whitespace-nowrap shadow-sm">
                    {formatLrcTimestamp(hoverTime)}
                  </div>
                </div>
              )}

              {/* Off-screen Trim Start indicator when zoomed past trimStart */}
              {!isStartInView && trimStart < clampedViewStart && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => focusTimeInView(trimStart)}
                  title={`Pan to clip start (${formatLrcTimestamp(trimStart)})`}
                  className="absolute left-1 top-[20px] z-20 px-1.5 py-0.5 rounded bg-[#0d111a]/95 border border-cyan-400/40 text-[10px] font-mono tabular-nums text-cyan-300 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
                >
                  ← In
                </button>
              )}

              {/* Off-screen Trim End indicator when zoomed before trimEnd */}
              {!isEndInView && trimEnd > viewEnd && (
                <button
                  type="button"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => focusTimeInView(trimEnd)}
                  title={`Pan to clip end (${formatLrcTimestamp(trimEnd)})`}
                  className="absolute right-1 top-[20px] z-20 px-1.5 py-0.5 rounded bg-[#0d111a]/95 border border-cyan-400/40 text-[10px] font-mono tabular-nums text-cyan-300 hover:bg-cyan-500/20 cursor-pointer whitespace-nowrap"
                >
                  Out →
                </button>
              )}

              {/* Draggable Start Trim Handle */}
              {isStartInView && (
                <div
                  role="slider"
                  aria-label="Clip start time"
                  aria-valuemin={0}
                  aria-valuemax={trimEnd}
                  aria-valuenow={trimStart}
                  tabIndex={0}
                  onKeyDown={(e) => handleTrimHandleKeyDown('start', e)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragTarget('start');
                  }}
                  style={{ left: `${Math.max(0, Math.min(100, rawStartPct))}%` }}
                  className="absolute top-[16px] bottom-0 -translate-x-1/2 w-3.5 flex items-center justify-center cursor-ew-resize group z-20 focus:outline-none"
                >
                  <div className="w-1.5 h-full bg-cyan-400 rounded-sm shadow-sm group-hover:w-2 group-focus-visible:ring-2 group-focus-visible:ring-cyan-300 transition-[width]" />
                  <div
                    className={`absolute -top-6 px-1.5 py-0.5 rounded bg-[#090b10] border border-cyan-400/45 text-[10px] font-mono tabular-nums text-cyan-300 pointer-events-none whitespace-nowrap transition-opacity ${
                      dragTarget === 'start'
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                    }`}
                  >
                    {formatLrcTimestamp(trimStart)}
                  </div>
                </div>
              )}

              {/* Draggable End Trim Handle */}
              {isEndInView && (
                <div
                  role="slider"
                  aria-label="Clip end time"
                  aria-valuemin={trimStart}
                  aria-valuemax={duration}
                  aria-valuenow={trimEnd}
                  tabIndex={0}
                  onKeyDown={(e) => handleTrimHandleKeyDown('end', e)}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    setDragTarget('end');
                  }}
                  style={{ left: `${Math.max(0, Math.min(100, rawEndPct))}%` }}
                  className="absolute top-[16px] bottom-0 -translate-x-1/2 w-3.5 flex items-center justify-center cursor-ew-resize group z-20 focus:outline-none"
                >
                  <div className="w-1.5 h-full bg-cyan-400 rounded-sm shadow-sm group-hover:w-2 group-focus-visible:ring-2 group-focus-visible:ring-cyan-300 transition-[width]" />
                  <div
                    className={`absolute -top-6 px-1.5 py-0.5 rounded bg-[#090b10] border border-cyan-400/45 text-[10px] font-mono tabular-nums text-cyan-300 pointer-events-none whitespace-nowrap transition-opacity ${
                      dragTarget === 'end'
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
                    }`}
                  >
                    {formatLrcTimestamp(trimEnd)}
                  </div>
                </div>
              )}

              {/* Playhead Needle */}
              {isPlayInView && (
                <div
                  className="pointer-events-none absolute top-[14px] bottom-0 -translate-x-1/2 w-0.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.85)] z-10"
                  style={{ left: `${Math.max(0, Math.min(100, rawPlayPct))}%` }}
                >
                  <div className="w-2.5 h-2.5 -ml-[4px] -mt-1 rounded-full bg-white border border-[#090b10]" />
                </div>
              )}
            </>
          )}
        </div>

        {/* Full-Track Overview Minimap / Pan Bar (shown when zoomed in) */}
        {hasAudio && clampedZoom > 1.01 && (
          <div
            ref={minimapRef}
            onPointerDown={handleMinimapPointerDown}
            title="Drag or click to pan across the full track"
            className="relative h-4 w-full rounded bg-[#090b10] border border-white/[0.08] overflow-hidden cursor-grab active:cursor-grabbing select-none"
          >
            <canvas ref={minimapCanvasRef} className="w-full h-full block" />
            {/* Playhead indicator on minimap */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px bg-white/85"
              style={{ left: `${Math.max(0, Math.min(100, (currentTime / safeDur) * 100))}%` }}
            />
            {/* Active viewport thumb */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 bg-cyan-400/15 border border-cyan-300/70 rounded-sm"
              style={{
                left: `${thumbLeftPct}%`,
                width: `${Math.min(100 - thumbLeftPct, thumbWidthPct)}%`,
              }}
            />
          </div>
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
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
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
            onClick={onTogglePreviewTrimLoop}
            disabled={!hasAudio}
            aria-pressed={previewTrimLoop}
            title={
              previewTrimLoop
                ? 'Preview Trim Loop enabled: playback & scrubbing are strictly locked between In and Out trim points'
                : 'Constrain & loop preview playback strictly between the current trim start and end points'
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40 ${
              previewTrimLoop
                ? 'bg-emerald-500/15 border-emerald-400/45 text-emerald-300'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Preview Trim Loop</span>
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

          <button
            type="button"
            onClick={handleTapTempoClick}
            disabled={!hasAudio}
            aria-label="Tap Tempo to calibrate beat sensitivity"
            title={
              tapTempoBpm !== null
                ? `Tap along to beat · Detected ${tapTempoBpm} BPM · Beat Sensitivity ${beatSensitivity.toFixed(2)}×${beatDetection ? '' : ' (auto-enables Beat Detection)'}`
                : `Tap along to the beat (2+ clicks) to calibrate Beat Sensitivity (currently ${beatSensitivity.toFixed(2)}×)`
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
              tapPulse
                ? 'bg-cyan-400/25 border-cyan-300 text-cyan-200'
                : tapTempoCount > 0 || tapTempoBpm !== null
                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/20'
                : 'bg-white/[0.04] hover:bg-white/[0.09] border-white/[0.08] text-slate-200'
            }`}
          >
            <Activity
              className={`w-3.5 h-3.5 transition-transform ${
                tapPulse ? 'scale-125 text-cyan-200' : 'text-cyan-400'
              }`}
            />
            <span>{tapTempoCount === 1 ? 'Tap…' : 'Tap Tempo'}</span>
            {tapTempoBpm !== null && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded bg-[#090b10]/80 border border-cyan-400/25 text-[10px] font-mono tabular-nums text-cyan-300">
                {tapTempoBpm} BPM · {beatSensitivity.toFixed(2)}×
              </span>
            )}
          </button>

          <div className="pl-2 text-xs font-mono tabular-nums text-slate-300 flex items-center gap-2 whitespace-nowrap">
            <span>{formatLrcTimestamp(currentTime)}</span>
            <span className="text-slate-600">/</span>
            <span className="text-slate-400">{formatShortTime(duration)}</span>
            {hasAudio && (
              <>
                <span className="text-slate-600" aria-hidden="true">
                  ·
                </span>
                <span className="text-cyan-400">Clip {clipDuration.toFixed(2)}s</span>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Playback Speed Multiplier */}
          <div
            role="group"
            aria-label="Playback speed"
            className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08] shrink-0"
          >
            {([0.5, 1, 1.5, 2] as const).map((rate) => {
              const active = playbackRate === rate;
              return (
                <button
                  key={rate}
                  type="button"
                  disabled={!hasAudio}
                  onClick={() => onPlaybackRateChange(rate)}
                  aria-pressed={active}
                  title={`Live preview playback speed ${rate.toFixed(1)}x`}
                  className={`px-2 py-1 rounded-md text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                    active
                      ? 'bg-cyan-400 text-[#090b10] font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {rate.toFixed(1)}x
                </button>
              );
            })}
          </div>

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
