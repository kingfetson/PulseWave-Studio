import {
  ASPECT_RATIOS,
  BeatShockwave,
  LyricLine,
  MotionBlurState,
  Particle,
  StudioSettings,
} from '../types/studio';

export interface RenderFrameParams {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  currentTime: number; // absolute track time in seconds (for lyric matching)
  dt: number; // delta time in seconds for particle motion
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: HTMLImageElement | null;
  albumImage: HTMLImageElement | null;
  particles: Particle[];
  isExport?: boolean;
  albumRotationRef?: { angle: number };
  beatBurst?: number; // 0..1 decaying bass-drum impulse
  beatTriggered?: boolean;
  beatShockwaves?: BeatShockwave[];
  motionBlurState?: MotionBlurState;
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(34, 211, 238, ${alpha})`;
}

/**
 * Word-wraps text cleanly to never exceed maxWidth on narrow 9:16 or wide canvases
 */
export function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  if (words.length === 0 || (words.length === 1 && words[0] === '')) return [];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const testLine = `${currentLine} ${word}`;
    if (ctx.measureText(testLine).width <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  width: number,
  height: number,
  overscan = 0
): void {
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  if (!imgW || !imgH) return;

  const targetW = width + overscan * 2;
  const targetH = height + overscan * 2;
  const imgRatio = imgW / imgH;
  const targetRatio = targetW / targetH;

  let drawW: number;
  let drawH: number;
  let offsetX: number;
  let offsetY: number;

  if (imgRatio > targetRatio) {
    drawH = targetH;
    drawW = targetH * imgRatio;
    offsetX = -overscan - (drawW - targetW) / 2;
    offsetY = -overscan;
  } else {
    drawW = targetW;
    drawH = targetW / imgRatio;
    offsetX = -overscan;
    offsetY = -overscan - (drawH - targetH) / 2;
  }

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

function computeBands(frequencyData: Uint8Array, sensitivity: number) {
  const len = frequencyData.length;
  if (len === 0) return { bass: 0, mid: 0, treble: 0 };

  let bassSum = 0;
  const bassEnd = Math.min(len, 12);
  for (let i = 1; i < bassEnd; i++) bassSum += frequencyData[i];
  const bass = Math.min(1.5, ((bassSum / Math.max(1, bassEnd - 1)) / 255) * sensitivity);

  let midSum = 0;
  const midStart = 12;
  const midEnd = Math.min(len, 90);
  for (let i = midStart; i < midEnd; i++) midSum += frequencyData[i];
  const mid = Math.min(1.5, ((midSum / Math.max(1, midEnd - midStart)) / 255) * sensitivity);

  let trebSum = 0;
  const trebStart = 90;
  const trebEnd = Math.min(len, 280);
  for (let i = trebStart; i < trebEnd; i++) trebSum += frequencyData[i];
  const treble = Math.min(1.5, ((trebSum / Math.max(1, trebEnd - trebStart)) / 255) * sensitivity);

  return { bass, mid, treble };
}

function getPerceptualBarValue(
  frequencyData: Uint8Array,
  index: number,
  total: number,
  sensitivity: number
): number {
  const usableBins = Math.floor(frequencyData.length * 0.52);
  const t0 = Math.pow(index / total, 1.45);
  const t1 = Math.pow((index + 1) / total, 1.45);
  const b0 = Math.min(usableBins - 1, Math.floor(t0 * usableBins));
  const b1 = Math.max(b0 + 1, Math.min(usableBins, Math.ceil(t1 * usableBins)));

  let sum = 0;
  for (let b = b0; b < b1; b++) {
    sum += frequencyData[b];
  }
  const avg = sum / Math.max(1, b1 - b0);
  return Math.min(1, (avg / 255) * sensitivity);
}

// Reusable offscreen scratch canvases for zero-GC iterative bloom blur passes
let bloomLayerCanvas: HTMLCanvasElement | null = null;
let bloomHalfCanvas: HTMLCanvasElement | null = null;
let bloomQuarterCanvas: HTMLCanvasElement | null = null;

function ensureScratchCanvas(
  existing: HTMLCanvasElement | null,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = existing ?? document.createElement('canvas');
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

export function renderVisualizerFrame(params: RenderFrameParams): void {
  const {
    ctx,
    width,
    height,
    currentTime,
    dt,
    frequencyData,
    timeDomainData,
    settings,
    lyrics,
    bgImage,
    albumImage,
    particles,
    isExport = false,
    albumRotationRef,
    beatBurst = 0,
    beatTriggered = false,
    beatShockwaves,
    motionBlurState,
  } = params;

  const minDim = Math.min(width, height);
  const isPortrait = height > width;
  const safePadX = width * 0.075;
  const safePadY = height * 0.065;

  // 1. Background Fill & Optional Cover Image
  ctx.save();
  ctx.fillStyle = settings.bgColor;
  ctx.fillRect(0, 0, width, height);

  if (bgImage && bgImage.complete && bgImage.naturalWidth > 0) {
    ctx.save();
    if (settings.bgBlur > 0) {
      ctx.filter = `blur(${settings.bgBlur}px)`;
    }
    drawCoverImage(ctx, bgImage, width, height, settings.bgBlur * 1.6);
    ctx.restore();

    if (settings.bgDim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${settings.bgDim})`;
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    // Subtle atmospheric radial gradient behind visualizer so solid backgrounds feel deep
    const ambient = ctx.createRadialGradient(
      width * 0.5,
      height * 0.48,
      minDim * 0.04,
      width * 0.5,
      height * 0.48,
      Math.max(width, height) * 0.72
    );
    ambient.addColorStop(0, hexToRgba(settings.primaryColor, 0.11));
    ambient.addColorStop(0.45, hexToRgba(settings.secondaryColor, 0.05));
    ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, width, height);
  }

  // 1b. Motion Blur: Draw the previous frame with slight transparency before rendering current frame
  const motionBlurAlpha = Math.max(0, Math.min(0.85, settings.motionBlur || 0));
  if (
    motionBlurAlpha > 0 &&
    motionBlurState?.canvas &&
    motionBlurState.hasFrame &&
    motionBlurState.canvas.width === width &&
    motionBlurState.canvas.height === height
  ) {
    ctx.save();
    ctx.globalAlpha = motionBlurAlpha;
    ctx.drawImage(motionBlurState.canvas, 0, 0, width, height);
    ctx.restore();
  }

  const { bass, mid } = computeBands(frequencyData, settings.sensitivity);

  // Advance album rotation subtly with bass
  if (albumRotationRef) {
    albumRotationRef.angle += dt * (0.18 + bass * 0.35);
  }

  // 2. Visualizer Modes & Beat-Detection Bursts (with optional additive Bloom passes)
  const visCenterY = isPortrait ? height * 0.42 : height * 0.46;
  const beatBoost = settings.beatDetection ? beatBurst : 0;
  const bloom = Math.max(0, Math.min(1.5, settings.bloomIntensity ?? 0));
  const burstCenterY =
    settings.visualizerMode === 'circular-ring' ||
    settings.visualizerMode === 'hybrid-particles'
      ? isPortrait
        ? height * 0.41
        : height * 0.45
      : visCenterY;

  const isCircularMode =
    settings.visualizerMode === 'circular-ring' ||
    settings.visualizerMode === 'hybrid-particles';
  const circularCx = width * 0.5;
  const circularCy = isPortrait ? height * 0.41 : height * 0.45;
  const circularBaseRadius =
    minDim * (isPortrait ? 0.21 : 0.22) * (1 + bass * 0.13 + beatBoost * 0.1);
  const circularArtRadius = circularBaseRadius * 0.87;

  const drawVisualizerLayer = (vCtx: CanvasRenderingContext2D) => {
    // Beat-Detection Ambient Flash & Expanding Shockwaves
    if (settings.beatDetection && beatBoost > 0.01) {
      vCtx.save();
      const flash = vCtx.createRadialGradient(
        width * 0.5,
        burstCenterY,
        minDim * 0.02,
        width * 0.5,
        burstCenterY,
        minDim * 0.62
      );
      flash.addColorStop(0, hexToRgba(settings.primaryColor, beatBoost * 0.24));
      flash.addColorStop(0.5, hexToRgba(settings.secondaryColor, beatBoost * 0.1));
      flash.addColorStop(1, 'rgba(0, 0, 0, 0)');
      vCtx.fillStyle = flash;
      vCtx.fillRect(0, 0, width, height);
      vCtx.restore();
    }

    if (settings.beatDetection && beatShockwaves && beatShockwaves.length > 0) {
      vCtx.save();
      for (const sw of beatShockwaves) {
        vCtx.beginPath();
        vCtx.arc(width * 0.5, burstCenterY, sw.radius, 0, Math.PI * 2);
        vCtx.strokeStyle = hexToRgba(sw.color, sw.alpha * 0.72);
        vCtx.lineWidth = Math.max(1.5, minDim * 0.004 * (sw.alpha + 0.25));
        vCtx.shadowColor = sw.color;
        vCtx.shadowBlur = minDim * 0.02;
        vCtx.stroke();
      }
      vCtx.restore();
    }

    // Beat-triggered burst particle spawning across all visualizer modes
    if (settings.beatDetection && beatTriggered) {
      const burstCount = 18;
      const isLinearMode =
        settings.visualizerMode === 'mirrored-bars' ||
        settings.visualizerMode === 'neon-wave';
      for (let s = 0; s < burstCount; s++) {
        if (particles.length >= 180) break;
        const angle = (s / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.28;
        const speed = minDim * (0.24 + Math.random() * 0.28);
        const spawnX = isLinearMode
          ? safePadX + Math.random() * (width - safePadX * 2)
          : width * 0.5 + Math.cos(angle) * (minDim * 0.14);
        const spawnY = isLinearMode
          ? burstCenterY + (Math.random() - 0.5) * 8
          : burstCenterY + Math.sin(angle) * (minDim * 0.14);
        const vx = isLinearMode ? (Math.random() - 0.5) * minDim * 0.22 : Math.cos(angle) * speed;
        const vy = isLinearMode
          ? (Math.random() > 0.5 ? 1 : -1) * (minDim * (0.18 + Math.random() * 0.25))
          : Math.sin(angle) * speed;

        particles.push({
          x: spawnX,
          y: spawnY,
          vx,
          vy,
          radius: Math.max(2, minDim * (0.0035 + Math.random() * 0.0045)),
          alpha: 0.96,
          color: s % 2 === 0 ? settings.primaryColor : settings.secondaryColor,
          life: 0,
          maxLife: 0.55 + Math.random() * 0.45,
        });
      }
    }

    // Update & draw particles once when either hybrid-particles or beatDetection has active particles
    if (particles.length > 0 && settings.visualizerMode !== 'hybrid-particles') {
      vCtx.save();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (
          p.life >= p.maxLife ||
          p.x < -20 ||
          p.x > width + 20 ||
          p.y < -20 ||
          p.y > height + 20
        ) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.965;
        p.vy *= 0.965;
        const lifeProgress = p.life / p.maxLife;
        const alpha = (1 - lifeProgress) * 0.88;

        vCtx.beginPath();
        vCtx.arc(p.x, p.y, p.radius * (1 - lifeProgress * 0.35), 0, Math.PI * 2);
        vCtx.fillStyle = hexToRgba(p.color, alpha);
        vCtx.shadowColor = p.color;
        vCtx.shadowBlur = minDim * 0.014;
        vCtx.fill();
      }
      vCtx.restore();
    }

    if (settings.visualizerMode === 'mirrored-bars') {
      const barCount = settings.barCount;
      const totalW = width - safePadX * 2;
      const step = totalW / barCount;
      const barW = Math.max(2, step * 0.62);
      const maxHalfH = (isPortrait ? height * 0.16 : height * 0.24) * (1 + beatBoost * 0.16);

      const grad = vCtx.createLinearGradient(0, visCenterY - maxHalfH, 0, visCenterY + maxHalfH);
      grad.addColorStop(0, settings.primaryColor);
      grad.addColorStop(0.5, settings.secondaryColor);
      grad.addColorStop(1, settings.primaryColor);

      vCtx.save();
      vCtx.fillStyle = grad;
      vCtx.shadowColor = hexToRgba(settings.primaryColor, 0.55 + beatBoost * 0.35);
      vCtx.shadowBlur = minDim * (0.018 + beatBoost * 0.015);

      // Subtle center horizon line
      vCtx.fillRect(safePadX, visCenterY - 1, totalW, 2);

      for (let i = 0; i < barCount; i++) {
        // Symmetrical spectrum from center outward looks balanced across 16:9, 9:16, 1:1
        const mirrorIdx = Math.abs(i - (barCount - 1) / 2) / ((barCount - 1) / 2);
        const val = getPerceptualBarValue(
          frequencyData,
          Math.floor(mirrorIdx * (barCount * 0.72)),
          barCount,
          settings.sensitivity
        );
        const h = Math.max(4, Math.pow(val, 1.15) * maxHalfH);
        const x = safePadX + i * step + (step - barW) * 0.5;
        const y = visCenterY - h;
        const radius = Math.min(barW / 2, h);

        vCtx.beginPath();
        vCtx.roundRect(x, y, barW, h * 2, radius);
        vCtx.fill();
      }
      vCtx.restore();
    } else if (settings.visualizerMode === 'neon-wave') {
      const waveWidth = width - safePadX * 2;
      const maxAmp = (isPortrait ? height * 0.13 : height * 0.19) * (1 + beatBoost * 0.18);

      const drawWaveLayer = (
        color: string,
        ampScale: number,
        phaseShift: number,
        lineWidth: number,
        alpha: number,
        fillUnder: boolean
      ) => {
        vCtx.save();
        vCtx.beginPath();
        const points = 128;
        for (let i = 0; i <= points; i++) {
          const progress = i / points;
          const sampleIdx = Math.min(
            timeDomainData.length - 1,
            Math.floor(((i + phaseShift) % points) / points * (timeDomainData.length * 0.6))
          );
          const raw = (timeDomainData[sampleIdx] - 128) / 128;
          // Taper smoothly at edges
          const edgeFade = Math.sin(progress * Math.PI);
          const x = safePadX + progress * waveWidth;
          const y = visCenterY + raw * maxAmp * ampScale * settings.sensitivity * edgeFade;

          if (i === 0) {
            vCtx.moveTo(x, y);
          } else {
            const prevProgress = (i - 1) / points;
            const prevX = safePadX + prevProgress * waveWidth;
            const midX = (prevX + x) * 0.5;
            vCtx.quadraticCurveTo(prevX, y, midX, y);
          }
        }

        vCtx.strokeStyle = hexToRgba(color, alpha);
        vCtx.lineWidth = lineWidth;
        vCtx.lineCap = 'round';
        vCtx.lineJoin = 'round';
        vCtx.shadowColor = hexToRgba(color, 0.75 + beatBoost * 0.25);
        vCtx.shadowBlur = minDim * (0.025 + beatBoost * 0.015);
        vCtx.stroke();

        if (fillUnder) {
          vCtx.lineTo(safePadX + waveWidth, visCenterY);
          vCtx.lineTo(safePadX, visCenterY);
          vCtx.closePath();
          const fillGrad = vCtx.createLinearGradient(0, visCenterY - maxAmp, 0, visCenterY + maxAmp);
          fillGrad.addColorStop(0, hexToRgba(color, 0.16));
          fillGrad.addColorStop(0.5, hexToRgba(color, 0.03));
          fillGrad.addColorStop(1, hexToRgba(color, 0.14));
          vCtx.shadowBlur = 0;
          vCtx.fillStyle = fillGrad;
          vCtx.fill();
        }
        vCtx.restore();
      };

      // Secondary echo curve
      drawWaveLayer(settings.secondaryColor, 0.82, 18, Math.max(2.5, minDim * 0.0045), 0.78, false);
      // Primary foreground curve
      drawWaveLayer(settings.primaryColor, 1.05, 0, Math.max(3.5, minDim * 0.0065), 0.98, true);
    } else {
      // circular-ring OR hybrid-particles
      const cx = circularCx;
      const cy = circularCy;
      const baseRadius = circularBaseRadius;
      const maxBarLen = minDim * (isPortrait ? 0.15 : 0.16) * (1 + beatBoost * 0.16);
      const barCount = settings.barCount;

      // Hybrid particles emission & update
      if (settings.visualizerMode === 'hybrid-particles') {
        if (bass > 0.42) {
          const spawnCount = Math.min(8, Math.floor(bass * 6));
          for (let s = 0; s < spawnCount; s++) {
            if (particles.length >= 150) break;
            const angle = Math.random() * Math.PI * 2;
            const speed = (minDim * 0.18) * (0.6 + Math.random() * 0.9 + bass * 0.6);
            particles.push({
              x: cx + Math.cos(angle) * baseRadius,
              y: cy + Math.sin(angle) * baseRadius,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              radius: Math.max(1.8, minDim * (0.003 + Math.random() * 0.0045)),
              alpha: 0.92,
              color: Math.random() > 0.45 ? settings.primaryColor : settings.secondaryColor,
              life: 0,
              maxLife: 0.75 + Math.random() * 0.85,
            });
          }
        }

        vCtx.save();
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life += dt;
          if (
            p.life >= p.maxLife ||
            p.x < -20 ||
            p.x > width + 20 ||
            p.y < -20 ||
            p.y > height + 20
          ) {
            particles.splice(i, 1);
            continue;
          }
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.975;
          p.vy *= 0.975;
          const lifeProgress = p.life / p.maxLife;
          const alpha = (1 - lifeProgress) * 0.85;

          vCtx.beginPath();
          vCtx.arc(p.x, p.y, p.radius * (1 - lifeProgress * 0.4), 0, Math.PI * 2);
          vCtx.fillStyle = hexToRgba(p.color, alpha);
          vCtx.shadowColor = p.color;
          vCtx.shadowBlur = minDim * 0.012;
          vCtx.fill();
        }
        vCtx.restore();
      }

      // Outer glow halo
      vCtx.save();
      const halo = vCtx.createRadialGradient(
        cx,
        cy,
        baseRadius * 0.65,
        cx,
        cy,
        baseRadius + maxBarLen
      );
      halo.addColorStop(0, hexToRgba(settings.primaryColor, 0.14 + bass * 0.15));
      halo.addColorStop(0.6, hexToRgba(settings.secondaryColor, 0.06));
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = halo;
      vCtx.beginPath();
      vCtx.arc(cx, cy, baseRadius + maxBarLen, 0, Math.PI * 2);
      vCtx.fill();
      vCtx.restore();

      // Radial spectrum bars around circumference (mirrored left-right symmetry)
      vCtx.save();
      const halfBars = Math.max(16, Math.floor(barCount / 2));
      const barThickness = Math.max(2, ((2 * Math.PI * baseRadius) / barCount) * 0.58);
      vCtx.lineCap = 'round';
      vCtx.lineWidth = barThickness;

      for (let i = 0; i < barCount; i++) {
        // Map symmetric index so left & right halves pulse evenly
        const sym = i < halfBars ? i : barCount - 1 - i;
        const val = getPerceptualBarValue(frequencyData, sym, halfBars, settings.sensitivity);
        const len = Math.max(minDim * 0.008, Math.pow(val, 1.15) * maxBarLen);

        const angle = (i / barCount) * Math.PI * 2 - Math.PI * 0.5;
        const x1 = cx + Math.cos(angle) * baseRadius;
        const y1 = cy + Math.sin(angle) * baseRadius;
        const x2 = cx + Math.cos(angle) * (baseRadius + len);
        const y2 = cy + Math.sin(angle) * (baseRadius + len);

        const mix = sym / Math.max(1, halfBars - 1);
        const strokeGrad = vCtx.createLinearGradient(x1, y1, x2, y2);
        strokeGrad.addColorStop(0, mix < 0.5 ? settings.primaryColor : settings.secondaryColor);
        strokeGrad.addColorStop(1, mix < 0.5 ? settings.secondaryColor : settings.primaryColor);

        vCtx.strokeStyle = strokeGrad;
        vCtx.shadowColor = hexToRgba(settings.primaryColor, 0.45);
        vCtx.shadowBlur = minDim * 0.012;
        vCtx.beginPath();
        vCtx.moveTo(x1, y1);
        vCtx.lineTo(x2, y2);
        vCtx.stroke();
      }
      vCtx.restore();

      // Glowing outer rim ring (bloomed along with bars)
      vCtx.save();
      vCtx.beginPath();
      vCtx.arc(cx, cy, circularArtRadius, 0, Math.PI * 2);
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.78);
      vCtx.lineWidth = Math.max(2, minDim * 0.0038);
      vCtx.shadowColor = settings.primaryColor;
      vCtx.shadowBlur = minDim * 0.015;
      vCtx.stroke();
      vCtx.restore();
    }
  };

  if (bloom > 0.005) {
    bloomLayerCanvas = ensureScratchCanvas(bloomLayerCanvas, width, height);
    const layerCtx = bloomLayerCanvas.getContext('2d');
    if (layerCtx) {
      layerCtx.clearRect(0, 0, width, height);
      drawVisualizerLayer(layerCtx);

      // Draw crisp base visualizer layer
      ctx.drawImage(bloomLayerCanvas, 0, 0, width, height);

      // Prepare multi-resolution downsampled buffers for iterative blur passes
      const halfW = Math.max(64, Math.round(width * 0.5));
      const halfH = Math.max(64, Math.round(height * 0.5));
      const quarterW = Math.max(32, Math.round(width * 0.25));
      const quarterH = Math.max(32, Math.round(height * 0.25));

      bloomHalfCanvas = ensureScratchCanvas(bloomHalfCanvas, halfW, halfH);
      bloomQuarterCanvas = ensureScratchCanvas(bloomQuarterCanvas, quarterW, quarterH);
      const halfCtx = bloomHalfCanvas.getContext('2d');
      const quarterCtx = bloomQuarterCanvas.getContext('2d');

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Iterative Blur Pass 1: Tight core bloom
      const blur1 = Math.max(2, Math.round(minDim * (0.007 + bloom * 0.005)));
      ctx.filter = `blur(${blur1}px)`;
      ctx.globalAlpha = Math.min(0.85, bloom * 0.45);
      ctx.drawImage(bloomLayerCanvas, 0, 0, width, height);

      // Iterative Blur Pass 2: Medium neon halo via half-res pass
      if (halfCtx) {
        halfCtx.clearRect(0, 0, halfW, halfH);
        halfCtx.save();
        halfCtx.filter = `blur(${Math.max(2, Math.round(minDim * 0.008))}px)`;
        halfCtx.drawImage(bloomLayerCanvas, 0, 0, halfW, halfH);
        halfCtx.restore();

        const blur2 = Math.max(4, Math.round(minDim * (0.015 + bloom * 0.01)));
        ctx.filter = `blur(${blur2}px)`;
        ctx.globalAlpha = Math.min(0.75, bloom * 0.36);
        ctx.drawImage(bloomHalfCanvas, 0, 0, width, height);
      }

      // Iterative Blur Pass 3: Wide atmospheric bloom via quarter-res pass
      if (quarterCtx && halfCtx) {
        quarterCtx.clearRect(0, 0, quarterW, quarterH);
        quarterCtx.save();
        quarterCtx.filter = `blur(${Math.max(3, Math.round(minDim * 0.012))}px)`;
        quarterCtx.drawImage(bloomHalfCanvas, 0, 0, quarterW, quarterH);
        quarterCtx.restore();

        const blur3 = Math.max(8, Math.round(minDim * (0.028 + bloom * 0.018)));
        ctx.filter = `blur(${blur3}px)`;
        ctx.globalAlpha = Math.min(0.68, bloom * 0.28);
        ctx.drawImage(bloomQuarterCanvas, 0, 0, width, height);
      }

      ctx.restore();
    } else {
      drawVisualizerLayer(ctx);
    }
  } else {
    drawVisualizerLayer(ctx);
  }

  // Center Album Art / Vinyl Disc rendered crisply above bloom passes
  if (isCircularMode) {
    const cx = circularCx;
    const cy = circularCy;
    const artRadius = circularArtRadius;

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, artRadius, 0, Math.PI * 2);
    ctx.clip();

    if (albumImage && albumImage.complete && albumImage.naturalWidth > 0) {
      ctx.save();
      ctx.translate(cx, cy);
      if (albumRotationRef) {
        ctx.rotate(albumRotationRef.angle * 0.35);
      }
      const imgW = albumImage.naturalWidth || albumImage.width;
      const imgH = albumImage.naturalHeight || albumImage.height;
      const scale = (artRadius * 2) / Math.min(imgW, imgH);
      ctx.drawImage(
        albumImage,
        (-imgW * scale) / 2,
        (-imgH * scale) / 2,
        imgW * scale,
        imgH * scale
      );
      ctx.restore();
    } else {
      // Sleek geometric disc center
      const discGrad = ctx.createLinearGradient(
        cx - artRadius,
        cy - artRadius,
        cx + artRadius,
        cy + artRadius
      );
      discGrad.addColorStop(0, '#141926');
      discGrad.addColorStop(1, '#090b10');
      ctx.fillStyle = discGrad;
      ctx.fillRect(cx - artRadius, cy - artRadius, artRadius * 2, artRadius * 2);

      // Subtle vinyl grooves
      ctx.strokeStyle = hexToRgba(settings.primaryColor, 0.18 + mid * 0.18);
      ctx.lineWidth = 1.5;
      for (const rFactor of [0.75, 0.55, 0.34]) {
        ctx.beginPath();
        ctx.arc(cx, cy, artRadius * rFactor, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(cx, cy, artRadius * 0.14, 0, Math.PI * 2);
      ctx.fillStyle = settings.primaryColor;
      ctx.fill();
    }
    ctx.restore();

    // Crisp outer rim stroke over disc edge
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, artRadius, 0, Math.PI * 2);
    ctx.strokeStyle = hexToRgba(settings.primaryColor, 0.78);
    ctx.lineWidth = Math.max(2, minDim * 0.0035);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Track Title & Artist Name Overlay
  if (settings.showTrackOverlay && (settings.trackTitle.trim() || settings.artistName.trim())) {
    ctx.save();
    const titleSize = Math.round(minDim * (isPortrait ? 0.04 : 0.036));
    const artistSize = Math.round(minDim * (isPortrait ? 0.028 : 0.024));

    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 10;

    if (isPortrait) {
      ctx.textAlign = 'center';
      const topY = safePadY * 1.1;
      if (settings.trackTitle.trim()) {
        ctx.font = `700 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(settings.trackTitle.trim(), width * 0.5, topY, width - safePadX * 2);
      }
      if (settings.artistName.trim()) {
        ctx.font = `500 ${artistSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = hexToRgba('#e2e8f0', 0.76);
        ctx.fillText(
          settings.artistName.trim(),
          width * 0.5,
          topY + titleSize * 1.28,
          width - safePadX * 2
        );
      }
    } else {
      ctx.textAlign = 'left';
      const topX = safePadX;
      const topY = safePadY;
      if (settings.trackTitle.trim()) {
        ctx.font = `700 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(settings.trackTitle.trim(), topX, topY, width * 0.55);
      }
      if (settings.artistName.trim()) {
        ctx.font = `500 ${artistSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = hexToRgba('#e2e8f0', 0.74);
        ctx.fillText(settings.artistName.trim(), topX, topY + titleSize * 1.25, width * 0.55);
      }
    }
    ctx.restore();
  }

  // 4. Synced Lyrics Overlay
  renderLyrics(ctx, width, height, minDim, isPortrait, safePadX, currentTime, bass, settings, lyrics);

  // Store current frame (before editor-only safe-zone guide) for next-frame motion blur
  if (motionBlurState) {
    if (motionBlurAlpha > 0) {
      if (!motionBlurState.canvas) {
        motionBlurState.canvas = document.createElement('canvas');
      }
      if (
        motionBlurState.canvas.width !== width ||
        motionBlurState.canvas.height !== height
      ) {
        motionBlurState.canvas.width = width;
        motionBlurState.canvas.height = height;
      }
      const prevCtx = motionBlurState.canvas.getContext('2d', { alpha: false });
      if (prevCtx) {
        prevCtx.drawImage(ctx.canvas, 0, 0, width, height);
        motionBlurState.hasFrame = true;
      }
    } else {
      motionBlurState.hasFrame = false;
    }
  }

  // 5. Optional Safe-Zone & Composition Grid Guide (Preview only)
  if (!isExport && settings.showSafeZone) {
    renderSafeZoneGuide(ctx, width, height, minDim, isPortrait, settings.aspectRatio);
  }

  ctx.restore();
}

function renderSafeZoneGuide(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minDim: number,
  isPortrait: boolean,
  aspectRatio: StudioSettings['aspectRatio']
): void {
  ctx.save();
  const labelSize = Math.max(10, Math.round(minDim * 0.0155));
  ctx.font = `600 ${labelSize}px "JetBrains Mono", monospace`;
  ctx.textBaseline = 'top';

  // 1. Rule-of-Thirds Composition Grid Lines
  ctx.strokeStyle = 'rgba(248, 250, 252, 0.16)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 6]);
  for (const frac of [1 / 3, 2 / 3]) {
    const gx = Math.round(width * frac) + 0.5;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, height);
    ctx.stroke();

    const gy = Math.round(height * frac) + 0.5;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(width, gy);
    ctx.stroke();
  }

  // 2. Center Alignment Crosshairs
  const cx = Math.round(width * 0.5) + 0.5;
  const cy = Math.round(height * 0.5) + 0.5;
  ctx.strokeStyle = 'rgba(34, 211, 238, 0.28)';
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(cx, 0);
  ctx.lineTo(cx, height);
  ctx.moveTo(0, cy);
  ctx.lineTo(width, cy);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(6, minDim * 0.014), 0, Math.PI * 2);
  ctx.stroke();

  if (isPortrait) {
    // 3a. 9:16 Vertical Social-UI Composition Margins (TikTok / Reels / Shorts)
    const topBandH = height * 0.12;
    const bottomBandY = height * 0.81;
    const rightRailX = width * 0.86;
    const rightRailTop = height * 0.42;

    // Lightly tint social UI danger zones
    ctx.fillStyle = 'rgba(244, 63, 94, 0.08)';
    ctx.fillRect(0, 0, width, topBandH);
    ctx.fillRect(0, bottomBandY, width, height - bottomBandY);
    ctx.fillRect(rightRailX, rightRailTop, width - rightRailX, bottomBandY - rightRailTop);

    // Safe Zone Frame excluding top header, bottom captions, and right action buttons
    const szX = width * 0.06;
    const szY = topBandH;
    const szW = rightRailX - szX;
    const szH = bottomBandY - szY;

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.58)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 5]);
    ctx.strokeRect(szX, szY, szW, szH);

    // Lyric alignment guideline inside safe area
    const lyricLineY = Math.round(height * 0.76) + 0.5;
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(szX, lyricLineY);
    ctx.lineTo(szX + szW, lyricLineY);
    ctx.stroke();

    // Corner registration ticks on safe frame
    const tick = Math.max(12, minDim * 0.025);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.88)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Top-left
    ctx.moveTo(szX, szY + tick);
    ctx.lineTo(szX, szY);
    ctx.lineTo(szX + tick, szY);
    // Top-right
    ctx.moveTo(szX + szW - tick, szY);
    ctx.lineTo(szX + szW, szY);
    ctx.lineTo(szX + szW, szY + tick);
    // Bottom-left
    ctx.moveTo(szX, szY + szH - tick);
    ctx.lineTo(szX, szY + szH);
    ctx.lineTo(szX + tick, szY + szH);
    // Bottom-right
    ctx.moveTo(szX + szW - tick, szY + szH);
    ctx.lineTo(szX + szW, szY + szH);
    ctx.lineTo(szX + szW, szY + szH - tick);
    ctx.stroke();

    // Micro labels
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
    ctx.fillText('9:16 SAFE ZONE', szX + 8, szY + 8);

    ctx.fillStyle = 'rgba(248, 250, 252, 0.45)';
    ctx.fillText('TOP UI', szX, topBandH * 0.35);
    ctx.fillText('CAPTIONS / SOCIAL UI', szX, bottomBandY + 10);
    ctx.fillText('LYRIC LINE', szX + 8, lyricLineY - labelSize - 4);

    ctx.textAlign = 'right';
    ctx.fillText('ACTIONS', width - 10, rightRailTop + 8);
  } else {
    // 3b. 16:9 / 1:1 Safe Title Margin + Center 9:16 Vertical Crop Guide
    const szX = width * 0.08;
    const szY = height * 0.08;
    const szW = width - szX * 2;
    const szH = height - szY * 2;

    ctx.strokeStyle = 'rgba(34, 211, 238, 0.48)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(szX, szY, szW, szH);

    // 9:16 vertical center-crop reference bounds
    const cropW = height * (9 / 16);
    if (cropW < width - 20) {
      const cropX = (width - cropW) * 0.5;
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.38)';
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(cropX, 2, cropW, height - 4);

      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(251, 191, 36, 0.72)';
      ctx.fillText('9:16 CROP', width * 0.5, 10);
    }

    ctx.setLineDash([]);
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(34, 211, 238, 0.78)';
    ctx.fillText(
      `SAFE ZONE · ${ASPECT_RATIOS[aspectRatio].label.toUpperCase()}`,
      szX + 8,
      szY + 8
    );
  }

  ctx.restore();
}

function renderLyrics(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minDim: number,
  isPortrait: boolean,
  safePadX: number,
  currentTime: number,
  bass: number,
  settings: StudioSettings,
  lyrics: LyricLine[]
): void {
  if (lyrics.length === 0) return;

  // Find active lyric index (last line whose time <= currentTime + 0.06s)
  let activeIdx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime + 0.06) {
      activeIdx = i;
    } else {
      break;
    }
  }

  const maxTextWidth = width - safePadX * 2.2;

  if (settings.lyricStyle === 'karaoke') {
    const activeFontSize = Math.round(minDim * (isPortrait ? 0.044 : 0.042));
    const sideFontSize = Math.round(activeFontSize * 0.74);
    const anchorY = isPortrait ? height * 0.77 : height * 0.81;

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const prevLine = activeIdx > 0 ? lyrics[activeIdx - 1] : null;
    const currLine = activeIdx >= 0 ? lyrics[activeIdx] : null;
    const nextLine = activeIdx + 1 < lyrics.length ? lyrics[activeIdx + 1] : null;

    // Active line
    let activeBlockHeight = activeFontSize * 1.3;
    if (currLine) {
      const elapsed = Math.max(0, currentTime - currLine.time);
      const pop = elapsed < 0.16 ? 0.94 + (elapsed / 0.16) * 0.06 : 1;
      const scale = pop * (1 + Math.min(0.045, bass * 0.04));

      ctx.save();
      ctx.translate(width * 0.5, anchorY);
      ctx.scale(scale, scale);

      ctx.font = `700 ${activeFontSize}px "Plus Jakarta Sans", sans-serif`;
      const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth);
      const lineH = activeFontSize * 1.24;
      activeBlockHeight = wrapped.length * lineH;

      const textGrad = ctx.createLinearGradient(-maxTextWidth * 0.4, 0, maxTextWidth * 0.4, 0);
      textGrad.addColorStop(0, '#ffffff');
      textGrad.addColorStop(0.5, settings.primaryColor);
      textGrad.addColorStop(1, '#ffffff');

      ctx.fillStyle = textGrad;
      ctx.shadowColor = hexToRgba(settings.primaryColor, 0.55);
      ctx.shadowBlur = 16;

      const startY = -((wrapped.length - 1) * lineH) * 0.5;
      wrapped.forEach((line, idx) => {
        ctx.fillText(line, 0, startY + idx * lineH);
      });
      ctx.restore();
    }

    // Previous line
    if (prevLine) {
      ctx.font = `500 ${sideFontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 6;
      const prevWrapped = wrapTextLines(ctx, prevLine.text, maxTextWidth);
      const displayPrev = prevWrapped[prevWrapped.length - 1] || prevLine.text;
      ctx.fillText(displayPrev, width * 0.5, anchorY - activeBlockHeight * 0.5 - sideFontSize * 1.35);
    }

    // Upcoming line
    if (nextLine) {
      ctx.font = `500 ${sideFontSize}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillStyle = 'rgba(226, 232, 240, 0.46)';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
      ctx.shadowBlur = 6;
      const nextWrapped = wrapTextLines(ctx, nextLine.text, maxTextWidth);
      const displayNext = nextWrapped[0] || nextLine.text;
      ctx.fillText(displayNext, width * 0.5, anchorY + activeBlockHeight * 0.5 + sideFontSize * 1.35);
    }

    ctx.restore();
    return;
  }

  if (activeIdx < 0) return;
  const currLine = lyrics[activeIdx];

  if (settings.lyricStyle === 'single-pop') {
    const fontSize = Math.round(minDim * (isPortrait ? 0.048 : 0.045));
    const anchorY = isPortrait ? height * 0.76 : height * 0.80;
    const elapsed = Math.max(0, currentTime - currLine.time);
    const introScale = elapsed < 0.14 ? 0.86 + (elapsed / 0.14) * 0.14 : 1;
    const beatScale = introScale * (1 + Math.min(0.08, bass * 0.07));

    ctx.save();
    ctx.font = `700 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.88);
    const lineH = fontSize * 1.26;
    const maxLineW = wrapped.reduce((acc, l) => Math.max(acc, ctx.measureText(l).width), 0);

    const padX = fontSize * 0.75;
    const padY = fontSize * 0.45;
    const boxW = maxLineW + padX * 2;
    const boxH = wrapped.length * lineH + padY * 2;

    ctx.translate(width * 0.5, anchorY);
    ctx.scale(beatScale, beatScale);

    // Pill/card backdrop
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = 'rgba(9, 11, 16, 0.78)';
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, Math.min(20, fontSize * 0.48));
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = hexToRgba(settings.primaryColor, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = -((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((line, idx) => {
      ctx.fillText(line, 0, startY + idx * lineH);
    });

    ctx.restore();
    return;
  }

  // subtitle-bar
  const fontSize = Math.round(minDim * (isPortrait ? 0.039 : 0.036));
  const bottomMargin = isPortrait ? height * 0.13 : height * 0.08;

  ctx.save();
  ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
  const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.88);
  const lineH = fontSize * 1.3;
  const maxLineW = wrapped.reduce((acc, l) => Math.max(acc, ctx.measureText(l).width), 0);

  const padX = fontSize * 0.85;
  const padY = fontSize * 0.45;
  const boxW = Math.min(width - safePadX * 1.4, maxLineW + padX * 2);
  const boxH = wrapped.length * lineH + padY * 2;
  const boxX = (width - boxW) * 0.5;
  const boxY = height - bottomMargin - boxH;

  ctx.fillStyle = 'rgba(9, 11, 16, 0.84)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 12);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = '#f8fafc';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const centerY = boxY + boxH * 0.5;
  const startY = centerY - ((wrapped.length - 1) * lineH) * 0.5;
  wrapped.forEach((line, idx) => {
    ctx.fillText(line, width * 0.5, startY + idx * lineH);
  });
  ctx.restore();
}
