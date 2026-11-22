import { useEffect, useRef } from 'react';
import {
  ASPECT_RATIOS,
  LyricLine,
  MotionBlurState,
  Particle,
  StudioSettings,
} from '../types/studio';
import { renderVisualizerFrame } from '../utils/canvasRenderer';

interface PresetThumbnailProps {
  settings: StudioSettings;
}

const SAMPLE_LYRICS: LyricLine[] = [
  { id: 'thumb-1', time: 0.0, text: 'Midnight echoes fade' },
  { id: 'thumb-2', time: 1.0, text: 'Pulse in motion' },
  { id: 'thumb-3', time: 2.2, text: 'Neon skies awake' },
];

export function buildSyntheticAudioFrame(binCount = 1024): {
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
} {
  const frequencyData = new Uint8Array(binCount);
  const timeDomainData = new Uint8Array(binCount);

  for (let i = 0; i < binCount; i++) {
    // Rich musical spectrum curve: strong sub-bass peak, warm mid-range body, shimmering highs
    const norm = i / binCount;
    const bassPeak = Math.exp(-Math.pow((norm - 0.015) / 0.035, 2)) * 225;
    const midWave =
      Math.exp(-Math.pow((norm - 0.14) / 0.14, 2)) *
      (135 + 45 * Math.sin(i * 0.42) + 25 * Math.cos(i * 0.19));
    const highSpark =
      Math.exp(-norm * 3.5) * (70 + 35 * Math.sin(i * 0.77 + 1.2));
    frequencyData[i] = Math.max(8, Math.min(255, Math.round(bassPeak + midWave + highSpark)));

    // Smooth dual-harmonic oscilloscope waveform centered at 128
    const wave =
      Math.sin(norm * Math.PI * 6) * 0.55 +
      Math.sin(norm * Math.PI * 14 + 0.8) * 0.28 +
      Math.cos(norm * Math.PI * 24) * 0.12;
    timeDomainData[i] = Math.max(0, Math.min(255, Math.round(128 + wave * 92)));
  }

  return { frequencyData, timeDomainData };
}

export function PresetThumbnail({ settings }: PresetThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ratio = ASPECT_RATIOS[settings.aspectRatio];
  // Render at half of full HD export resolution for crisp downsampled scaling
  const renderW = Math.round(ratio.width / 2);
  const renderH = Math.round(ratio.height / 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = renderW;
    canvas.height = renderH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { frequencyData, timeDomainData } = buildSyntheticAudioFrame(1024);
    const particles: Particle[] = [];
    const motionBlurState: MotionBlurState = { canvas: null, hasFrame: false };
    const albumRotationRef = { angle: 0.45 };

    // Step multiple simulated frames for particles or motion blur trails
    const steps =
      (!settings.lyricsOnly &&
        (settings.visualizerMode === 'hybrid-particles' || settings.particleEnabled)) ||
      settings.motionBlur > 0
        ? 10
        : 1;
    const previewSettings: StudioSettings = {
      ...settings,
      trackTitle: settings.trackTitle.trim() || 'PulseWave',
      artistName: settings.artistName.trim() || 'Preset',
    };

    const minDim = Math.min(renderW, renderH);
    const sampleShockwaves = settings.beatDetection
      ? [
          {
            radius: minDim * 0.28,
            maxRadius: minDim * 0.56,
            alpha: 0.75,
            color: settings.primaryColor,
          },
          {
            radius: minDim * 0.42,
            maxRadius: minDim * 0.56,
            alpha: 0.45,
            color: settings.secondaryColor,
          },
        ]
      : undefined;

    for (let s = 0; s < steps; s++) {
      renderVisualizerFrame({
        ctx,
        width: renderW,
        height: renderH,
        currentTime: 1.25 + s * (1 / 30),
        dt: 1 / 30,
        frequencyData,
        timeDomainData,
        settings: previewSettings,
        lyrics: SAMPLE_LYRICS,
        bgImage: null,
        albumImage: null,
        particles,
        isExport: true,
        albumRotationRef,
        beatBurst: settings.beatDetection || settings.lyricBeatSync ? 0.68 : 0,
        beatTriggered: (settings.beatDetection || Boolean(settings.lyricBeatSync)) && s === 0,
        beatShockwaves: sampleShockwaves,
        motionBlurState,
      });
    }
  }, [settings, renderW, renderH]);

  return (
    <div
      className="w-[82px] h-[54px] rounded-md bg-[#05070b] border border-white/[0.08] p-1 flex items-center justify-center shrink-0 overflow-hidden"
      aria-hidden="true"
    >
      <canvas
        ref={canvasRef}
        className="max-w-full max-h-full rounded-[3px] border border-white/[0.12] block object-contain"
        style={{
          aspectRatio: `${ratio.width} / ${ratio.height}`,
        }}
      />
    </div>
  );
}
