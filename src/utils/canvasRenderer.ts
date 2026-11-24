import {
  ASPECT_RATIOS,
  BeatShockwave,
  LyricLine,
  LyricsOnlyLayout,
  MocapClipData,
  MotionBlurPresetKey,
  MotionBlurState,
  Particle,
  ParticleShape,
  SceneTransitionState,
  SceneTransitionType,
  StudioSettings,
  VisualizerMode,
} from '../types/studio';
import { resolveAutoCycledColors, resolveBeatMappedColors } from './colorHarmony';
import { renderDanceCharacter } from './danceRenderer';
import { renderExtraVisualizerMode } from './extraVisualizers';
import {
  applyLyricLetterSpacing,
  applyLyricTextShadow,
  drawLyricDarkBackdropShadow,
  getLyricsOnlyStyleSpec,
  renderExtraLyricStyle,
  resolveLyricFontFamily,
} from './lyricDisplayRenderer';
import { sampleParticleFlowMap } from './particleFlowMap';

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
export type RenderContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type RenderImageSource = HTMLImageElement | ImageBitmap;

export interface RenderFrameParams {
  ctx: RenderContext2D;
  width: number;
  height: number;
  currentTime: number; // absolute track time in seconds (for lyric matching)
  dt: number; // delta time in seconds for particle motion
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  settings: StudioSettings;
  lyrics: LyricLine[];
  bgImage: RenderImageSource | null;
  albumImage: RenderImageSource | null;
  particles: Particle[];
  isExport?: boolean;
  albumRotationRef?: { angle: number; cubeX?: number; cubeY?: number; cubeZ?: number };
  beatBurst?: number; // 0..1 decaying bass-drum impulse
  beatTriggered?: boolean;
  beatShockwaves?: BeatShockwave[];
  motionBlurState?: MotionBlurState;
  sceneTransitionState?: SceneTransitionState;
  trackDuration?: number;
  mocapClip?: MocapClipData | null;
}

function getImageDimensions(
  img: RenderImageSource | null
): { width: number; height: number } | null {
  if (!img) return null;
  if ('naturalWidth' in img) {
    if (!img.complete || img.naturalWidth <= 0) return null;
    return {
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
    };
  }
  return img.width > 0 && img.height > 0 ? { width: img.width, height: img.height } : null;
}

const hexRgbCache = new Map<string, readonly [number, number, number]>();
const rgbaStringCache = new Map<string, string>();

function parseHexRgbTuple(hex: string): readonly [number, number, number] {
  const cached = hexRgbCache.get(hex);
  if (cached) return cached;

  const clean = hex.charCodeAt(0) === 35 ? hex.slice(1) : hex.replace('#', '');
  let tuple: readonly [number, number, number];
  if (clean.length === 3) {
    tuple = [
      parseInt(clean[0] + clean[0], 16) || 0,
      parseInt(clean[1] + clean[1], 16) || 0,
      parseInt(clean[2] + clean[2], 16) || 0,
    ];
  } else if (clean.length >= 6) {
    tuple = [
      parseInt(clean.slice(0, 2), 16) || 0,
      parseInt(clean.slice(2, 4), 16) || 0,
      parseInt(clean.slice(4, 6), 16) || 0,
    ];
  } else {
    tuple = [34, 211, 238];
  }

  if (hexRgbCache.size > 256) hexRgbCache.clear();
  hexRgbCache.set(hex, tuple);
  return tuple;
}

function hexToRgba(hex: string, alpha: number): string {
  const clamped = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  const qAlpha = Math.round(clamped * 255);
  const cacheKey = `${hex}|${qAlpha}`;
  const cached = rgbaStringCache.get(cacheKey);
  if (cached) return cached;

  const [r, g, b] = parseHexRgbTuple(hex);
  const str = `rgba(${r}, ${g}, ${b}, ${(qAlpha / 255).toFixed(3)})`;
  if (rgbaStringCache.size > 2048) rgbaStringCache.clear();
  rgbaStringCache.set(cacheKey, str);
  return str;
}

const particleSpriteCache = new Map<string, RenderCanvas>();
const PARTICLE_SPRITE_SIZE = 48;
const PARTICLE_SPRITE_BASE_R = 10;

function getParticleSprite(
  color: string,
  shape: ParticleShape,
  glowEnabled: boolean
): RenderCanvas | null {
  const key = `${shape}|${color}|${glowEnabled ? 1 : 0}`;
  const existing = particleSpriteCache.get(key);
  if (existing) return existing;

  const sprite = createRenderCanvas(PARTICLE_SPRITE_SIZE, PARTICLE_SPRITE_SIZE);
  const sCtx = getContext2d(sprite);
  if (!sCtx) return null;

  const half = PARTICLE_SPRITE_SIZE * 0.5;
  sCtx.save();
  sCtx.translate(half, half);
  sCtx.fillStyle = color;
  sCtx.strokeStyle = color;
  if (glowEnabled) {
    sCtx.shadowColor = color;
    sCtx.shadowBlur = 9;
  }

  const r = PARTICLE_SPRITE_BASE_R;
  sCtx.beginPath();
  if (shape === 'circle') {
    sCtx.arc(0, 0, r, 0, Math.PI * 2);
    sCtx.fill();
  } else if (shape === 'ring') {
    sCtx.arc(0, 0, r * 1.1, 0, Math.PI * 2);
    sCtx.lineWidth = Math.max(1.8, r * 0.42);
    sCtx.stroke();
  } else if (shape === 'square') {
    const s = r * 1.65;
    sCtx.rect(-s * 0.5, -s * 0.5, s, s);
    sCtx.fill();
  } else if (shape === 'diamond') {
    const rx = r * 1.45;
    const ry = r * 0.88;
    sCtx.moveTo(rx, 0);
    sCtx.lineTo(0, ry);
    sCtx.lineTo(-rx, 0);
    sCtx.lineTo(0, -ry);
    sCtx.closePath();
    sCtx.fill();
  } else if (shape === 'triangle') {
    sCtx.moveTo(r * 1.35, 0);
    sCtx.lineTo(-r * 0.72 * 1.35, r * 0.78 * 1.35);
    sCtx.lineTo(-r * 0.72 * 1.35, -r * 0.78 * 1.35);
    sCtx.closePath();
    sCtx.fill();
  } else if (shape === 'star') {
    const outerR = r * 1.35;
    const innerR = outerR * 0.46;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = k % 2 === 0 ? outerR : innerR;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (k === 0) sCtx.moveTo(px, py);
      else sCtx.lineTo(px, py);
    }
    sCtx.closePath();
    sCtx.fill();
  }
  sCtx.restore();

  if (particleSpriteCache.size > 64) particleSpriteCache.clear();
  particleSpriteCache.set(key, sprite);
  return sprite;
}

function drawParticleShape(
  vCtx: RenderContext2D,
  x: number,
  y: number,
  radius: number,
  angle: number,
  shape: ParticleShape
): void {
  if (shape === 'circle') {
    vCtx.beginPath();
    vCtx.arc(x, y, radius, 0, Math.PI * 2);
    vCtx.fill();
    return;
  }

  if (shape === 'ring') {
    vCtx.beginPath();
    vCtx.arc(x, y, radius * 1.1, 0, Math.PI * 2);
    vCtx.lineWidth = Math.max(1.2, radius * 0.42);
    vCtx.stroke();
    return;
  }

  vCtx.save();
  vCtx.translate(x, y);
  vCtx.rotate(angle);
  vCtx.beginPath();

  if (shape === 'square') {
    const s = radius * 1.65;
    vCtx.rect(-s * 0.5, -s * 0.5, s, s);
  } else if (shape === 'diamond') {
    const rx = radius * 1.45;
    const ry = radius * 0.88;
    vCtx.moveTo(rx, 0);
    vCtx.lineTo(0, ry);
    vCtx.lineTo(-rx, 0);
    vCtx.lineTo(0, -ry);
    vCtx.closePath();
  } else if (shape === 'triangle') {
    const r = radius * 1.35;
    vCtx.moveTo(r, 0);
    vCtx.lineTo(-r * 0.72, r * 0.78);
    vCtx.lineTo(-r * 0.72, -r * 0.78);
    vCtx.closePath();
  } else if (shape === 'star') {
    const outerR = radius * 1.35;
    const innerR = outerR * 0.46;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = k % 2 === 0 ? outerR : innerR;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (k === 0) vCtx.moveTo(px, py);
      else vCtx.lineTo(px, py);
    }
    vCtx.closePath();
  }

  vCtx.fill();
  vCtx.restore();
}

const wrapTextCache = new Map<string, string[]>();

/**
 * Word-wraps text cleanly to never exceed maxWidth on narrow 9:16 or wide canvases
 */
export function wrapTextLines(
  ctx: RenderContext2D,
  text: string,
  maxWidth: number
): string[] {
  const anyCtx = ctx as unknown as { letterSpacing?: string };
  const lsKey = anyCtx.letterSpacing ?? '';
  const cacheKey = `${ctx.font}|${lsKey}|${Math.round(maxWidth)}|${text}`;
  const cached = wrapTextCache.get(cacheKey);
  if (cached) return cached;

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

  if (wrapTextCache.size > 384) wrapTextCache.clear();
  wrapTextCache.set(cacheKey, lines);
  return lines;
}

function drawCoverImage(
  ctx: RenderContext2D,
  img: RenderImageSource,
  width: number,
  height: number,
  overscan = 0,
  scale = 1,
  offsetXPct = 0,
  offsetYPct = 0
): void {
  const dims = getImageDimensions(img);
  if (!dims) return;
  const { width: imgW, height: imgH } = dims;

  const targetW = width + overscan * 2;
  const targetH = height + overscan * 2;
  const imgRatio = imgW / imgH;
  const targetRatio = targetW / targetH;

  let drawW: number;
  let drawH: number;

  if (imgRatio > targetRatio) {
    drawH = targetH * scale;
    drawW = drawH * imgRatio;
  } else {
    drawW = targetW * scale;
    drawH = drawW / imgRatio;
  }

  const extraX = Math.max(0, drawW - targetW);
  const extraY = Math.max(0, drawH - targetH);
  const offsetX = -overscan - extraX * 0.5 - (offsetXPct / 100) * extraX;
  const offsetY = -overscan - extraY * 0.5 - (offsetYPct / 100) * extraY;

  ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
}

function drawContainFramedImage(
  ctx: RenderContext2D,
  img: RenderImageSource,
  width: number,
  height: number,
  scale = 1,
  offsetXPct = 0,
  offsetYPct = 0
): void {
  const dims = getImageDimensions(img);
  if (!dims) return;
  const { width: imgW, height: imgH } = dims;

  const padW = width * 0.88;
  const padH = height * 0.84;
  const baseScale = Math.min(padW / imgW, padH / imgH) * Math.max(0.75, Math.min(1.5, scale));
  const drawW = imgW * baseScale;
  const drawH = imgH * baseScale;
  const dx = (width - drawW) * 0.5 + (offsetXPct / 100) * (width * 0.2);
  const dy = (height - drawH) * 0.5 + (offsetYPct / 100) * (height * 0.2);
  const r = Math.min(18, Math.min(drawW, drawH) * 0.04);

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  ctx.shadowBlur = 32;
  ctx.fillStyle = '#090b10';
  ctx.beginPath();
  ctx.roundRect(dx, dy, drawW, drawH, r);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(dx, dy, drawW, drawH, r);
  ctx.clip();
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(dx, dy, drawW, drawH, r);
  ctx.stroke();
  ctx.restore();
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

const perceptualBinCache = new Map<
  string,
  { b0: Uint16Array; b1: Uint16Array }
>();

function getPerceptualBarValue(
  frequencyData: Uint8Array,
  index: number,
  total: number,
  sensitivity: number
): number {
  const usableBins = Math.max(1, Math.floor(frequencyData.length * 0.52));
  const safeTotal = Math.max(1, total);
  const safeIdx = index < 0 ? 0 : index >= safeTotal ? safeTotal - 1 : index;

  const key = `${usableBins}:${safeTotal}`;
  let table = perceptualBinCache.get(key);
  if (!table) {
    const b0Arr = new Uint16Array(safeTotal);
    const b1Arr = new Uint16Array(safeTotal);
    for (let i = 0; i < safeTotal; i++) {
      const t0 = Math.pow(i / safeTotal, 1.45);
      const t1 = Math.pow((i + 1) / safeTotal, 1.45);
      const b0 = Math.min(usableBins - 1, Math.floor(t0 * usableBins));
      const b1 = Math.max(b0 + 1, Math.min(usableBins, Math.ceil(t1 * usableBins)));
      b0Arr[i] = b0;
      b1Arr[i] = b1;
    }
    if (perceptualBinCache.size > 64) perceptualBinCache.clear();
    table = { b0: b0Arr, b1: b1Arr };
    perceptualBinCache.set(key, table);
  }

  const b0 = table.b0[safeIdx];
  const b1 = table.b1[safeIdx];
  let sum = 0;
  for (let b = b0; b < b1; b++) {
    sum += frequencyData[b];
  }
  const avg = sum / Math.max(1, b1 - b0);
  const val = (avg / 255) * sensitivity;
  return val > 1 ? 1 : val;
}

// Reusable offscreen scratch canvases for zero-GC iterative bloom blur passes, background caching & glitch FX
let bloomLayerCanvas: RenderCanvas | null = null;
let bloomHalfCanvas: RenderCanvas | null = null;
let bloomQuarterCanvas: RenderCanvas | null = null;
let bloomEighthCanvas: RenderCanvas | null = null;
let globalGlowQuarterCanvas: RenderCanvas | null = null;
let globalGlowEighthCanvas: RenderCanvas | null = null;
let glitchHoldCanvas: RenderCanvas | null = null;
let glitchHoldHasFrame = false;
let glitchWorkCanvas: RenderCanvas | null = null;
let glitchTintCanvas: RenderCanvas | null = null;
let sceneFromCanvas: RenderCanvas | null = null;
let sceneToCanvas: RenderCanvas | null = null;
let lyricFromCanvas: RenderCanvas | null = null;
let lyricToCanvas: RenderCanvas | null = null;
let scanlineSampleCanvas: RenderCanvas | null = null;
let scanlineGapTileCanvas: RenderCanvas | null = null;
let scanlineOverlayTileCanvas: RenderCanvas | null = null;
let scanlineCachedKey = '';
let scanlineSampleFrameCounter = 0;
let scanlineLastLuma = { avgLuma: 0.32, peakLuma: 0.48 };
const scanlinePatternCache = new WeakMap<
  RenderContext2D,
  { key: string; overlayPattern: CanvasPattern | null; gapPattern: CanvasPattern | null }
>();

let cachedBaseBgCanvas: RenderCanvas | null = null;
let cachedBaseBgKey = '';
let cachedBaseBgImageRef: RenderImageSource | null = null;

let cachedBgCanvas: RenderCanvas | null = null;
let cachedBgKey = '';
let cachedBgImageRef: RenderImageSource | null = null;

function easeInOutCubic(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function compositeSceneTransition(
  ctx: RenderContext2D,
  fromCanvas: RenderCanvas | null,
  toCanvas: RenderCanvas,
  width: number,
  height: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  transitionType: SceneTransitionType,
  easedProgress: number,
  rawProgress: number,
  accentColor: string
): void {
  const p = Math.max(0, Math.min(1, easedProgress));

  if (transitionType === 'crossfade') {
    if (fromCanvas && 1 - p > 0.005) {
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.restore();
    }
    if (p > 0.005) {
      ctx.save();
      ctx.globalAlpha = p;
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.restore();
    }
    return;
  }

  // Directional wipes across [rx, ry, rw, rh]
  if (transitionType === 'wipe-right') {
    const splitX = rx + rw * p;
    if (fromCanvas && splitX < width) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, width - splitX, height);
      ctx.clip();
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.restore();
    }
    if (splitX > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, height);
      ctx.clip();
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.restore();
    }
    const seamAlpha = Math.sin(Math.PI * Math.max(0, Math.min(1, rawProgress))) * 0.55;
    if (seamAlpha > 0.02) {
      ctx.save();
      ctx.fillStyle = hexToRgba(accentColor, seamAlpha);
      ctx.fillRect(splitX - 1.5, ry, 3, rh);
      ctx.restore();
    }
    return;
  }

  if (transitionType === 'wipe-left') {
    const splitX = rx + rw * (1 - p);
    if (fromCanvas && splitX > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, height);
      ctx.clip();
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.restore();
    }
    if (splitX < width) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(splitX, 0, width - splitX, height);
      ctx.clip();
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.restore();
    }
    const seamAlpha = Math.sin(Math.PI * Math.max(0, Math.min(1, rawProgress))) * 0.55;
    if (seamAlpha > 0.02) {
      ctx.save();
      ctx.fillStyle = hexToRgba(accentColor, seamAlpha);
      ctx.fillRect(splitX - 1.5, ry, 3, rh);
      ctx.restore();
    }
    return;
  }

  if (transitionType === 'wipe-down') {
    const splitY = ry + rh * p;
    if (fromCanvas && splitY < height) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, splitY, width, height - splitY);
      ctx.clip();
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.restore();
    }
    if (splitY > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, splitY);
      ctx.clip();
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.restore();
    }
    const seamAlpha = Math.sin(Math.PI * Math.max(0, Math.min(1, rawProgress))) * 0.55;
    if (seamAlpha > 0.02) {
      ctx.save();
      ctx.fillStyle = hexToRgba(accentColor, seamAlpha);
      ctx.fillRect(rx, splitY - 1.5, rw, 3);
      ctx.restore();
    }
    return;
  }

  if (transitionType === 'wipe-up') {
    const splitY = ry + rh * (1 - p);
    if (fromCanvas && splitY > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width, splitY);
      ctx.clip();
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.restore();
    }
    if (splitY < height) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, splitY, width, height - splitY);
      ctx.clip();
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.restore();
    }
    const seamAlpha = Math.sin(Math.PI * Math.max(0, Math.min(1, rawProgress))) * 0.55;
    if (seamAlpha > 0.02) {
      ctx.save();
      ctx.fillStyle = hexToRgba(accentColor, seamAlpha);
      ctx.fillRect(rx, splitY - 1.5, rw, 3);
      ctx.restore();
    }
    return;
  }

  ctx.drawImage(toCanvas, 0, 0, width, height);
}

function glitchRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

function renderBeatGlitchEffect(
  ctx: RenderContext2D,
  width: number,
  height: number,
  currentTime: number,
  glitchIntensity: number,
  beatBurst: number,
  beatTriggered: boolean
): void {
  const intensity = Math.max(0, Math.min(1, glitchIntensity));
  if (intensity <= 0.005) {
    glitchHoldHasFrame = false;
    return;
  }

  const impulse = Math.max(beatTriggered ? 0.92 : 0, Math.min(1, beatBurst));
  const frameBucket = Math.floor(currentTime * 42);

  // Maintain held frame buffer on non-dropped beats for authentic frame-drop stutter
  if (impulse <= 0.24) {
    glitchHoldCanvas = ensureScratchCanvas(glitchHoldCanvas, width, height);
    const holdCtx = getContext2d(glitchHoldCanvas, { alpha: false });
    if (holdCtx) {
      holdCtx.drawImage(ctx.canvas, 0, 0, width, height);
      glitchHoldHasFrame = true;
    }
    return;
  }

  const hitDrive = Math.pow(impulse, 1.15) * intensity;

  // 1. Short, randomized frame-dropping / stutter hold on heavy drum transients
  const canDropFrame =
    glitchHoldHasFrame &&
    glitchHoldCanvas !== null &&
    glitchHoldCanvas.width === width &&
    glitchHoldCanvas.height === height &&
    hitDrive > 0.2 &&
    frameBucket % 3 !== 0;

  if (canDropFrame && glitchHoldCanvas) {
    const dropRoll = glitchRand(frameBucket * 1.37 + 9.1);
    if (dropRoll < 0.16 + intensity * 0.34) {
      const jitterX = (glitchRand(frameBucket * 3.13 + 2.7) - 0.5) * width * 0.016 * hitDrive;
      const jitterY = (glitchRand(frameBucket * 5.71 + 4.3) - 0.5) * height * 0.008 * hitDrive;
      ctx.save();
      ctx.drawImage(glitchHoldCanvas, jitterX, jitterY, width, height);
      ctx.restore();
    } else {
      const holdCtx = getContext2d(glitchHoldCanvas, { alpha: false });
      holdCtx?.drawImage(ctx.canvas, 0, 0, width, height);
    }
  } else {
    glitchHoldCanvas = ensureScratchCanvas(glitchHoldCanvas, width, height);
    const holdCtx = getContext2d(glitchHoldCanvas, { alpha: false });
    if (holdCtx) {
      holdCtx.drawImage(ctx.canvas, 0, 0, width, height);
      glitchHoldHasFrame = true;
    }
  }

  if (hitDrive <= 0.14) return;

  glitchWorkCanvas = ensureScratchCanvas(glitchWorkCanvas, width, height);
  const workCtx = getContext2d(glitchWorkCanvas, { alpha: false });
  if (!workCtx) return;
  workCtx.drawImage(ctx.canvas, 0, 0, width, height);

  // 2. Randomized Horizontal Tear Slices
  const sliceCount = Math.max(2, Math.round(2 + intensity * 6 * Math.min(1, impulse + 0.25)));
  ctx.save();
  for (let s = 0; s < sliceCount; s++) {
    const seed = frameBucket * 17.3 + s * 3.91;
    const sy = Math.floor(glitchRand(seed + 0.5) * height * 0.9);
    const sh = Math.max(6, Math.floor((0.015 + glitchRand(seed + 1.2) * 0.055) * height));
    const maxShift = width * (0.014 + hitDrive * 0.052);
    const dx = (glitchRand(seed + 2.4) - 0.5) * 2 * maxShift;

    ctx.drawImage(glitchWorkCanvas, 0, sy, width, sh, dx, sy, width, sh);

    if (glitchRand(seed + 4.8) > 0.45) {
      ctx.fillStyle =
        s % 2 === 0
          ? `rgba(255, 36, 92, ${Math.min(0.28, hitDrive * 0.3)})`
          : `rgba(34, 211, 238, ${Math.min(0.28, hitDrive * 0.3)})`;
      ctx.fillRect(0, sy, width, Math.max(1.5, sh * 0.12));
    }
  }
  ctx.restore();

  // 3. GPU-composited RGB Chromatic Aberration Split (red/magenta & cyan channels)
  glitchTintCanvas = ensureScratchCanvas(glitchTintCanvas, width, height);
  const tintCtx = getContext2d(glitchTintCanvas, { alpha: false });
  if (tintCtx) {
    const shiftMag = Math.max(3, Math.round(width * (0.004 + hitDrive * 0.022)));
    const dirSign = glitchRand(frameBucket * 2.11) > 0.5 ? 1 : -1;
    const shiftX = shiftMag * dirSign;
    const shiftY = Math.round((glitchRand(frameBucket * 4.73) - 0.5) * shiftMag * 0.45);
    const channelAlpha = Math.min(0.58, 0.14 + hitDrive * 0.44);

    // Red / Magenta channel fringe
    tintCtx.save();
    tintCtx.globalCompositeOperation = 'source-over';
    tintCtx.drawImage(glitchWorkCanvas, 0, 0, width, height);
    tintCtx.globalCompositeOperation = 'multiply';
    tintCtx.fillStyle = '#ff1e56';
    tintCtx.fillRect(0, 0, width, height);
    tintCtx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = channelAlpha;
    ctx.drawImage(glitchTintCanvas, -shiftX, shiftY, width, height);
    ctx.restore();

    // Cyan / Electric Blue channel fringe
    tintCtx.save();
    tintCtx.globalCompositeOperation = 'source-over';
    tintCtx.drawImage(glitchWorkCanvas, 0, 0, width, height);
    tintCtx.globalCompositeOperation = 'multiply';
    tintCtx.fillStyle = '#00e5ff';
    tintCtx.fillRect(0, 0, width, height);
    tintCtx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = channelAlpha * 0.92;
    ctx.drawImage(glitchTintCanvas, shiftX, -shiftY, width, height);
    ctx.restore();
  }
}

function sampleFrameVideoBrightness(
  ctx: RenderContext2D,
  beatBurst: number,
  isExport: boolean
): { avgLuma: number; peakLuma: number } {
  if (isExport) {
    scanlineSampleFrameCounter++;
    if (scanlineSampleFrameCounter % 3 !== 1 && beatBurst < 0.72) {
      return scanlineLastLuma;
    }
  }

  const sampleSize = 8;
  scanlineSampleCanvas = ensureScratchCanvas(
    scanlineSampleCanvas,
    sampleSize,
    sampleSize
  );
  const sampleCtx = getContext2d(scanlineSampleCanvas, {
    alpha: false,
    willReadFrequently: true,
  });
  if (!sampleCtx) {
    const fallback = Math.min(1, 0.28 + Math.max(0, Math.min(1, beatBurst)) * 0.45);
    return { avgLuma: fallback, peakLuma: Math.min(1, fallback * 1.35) };
  }

  try {
    sampleCtx.drawImage(ctx.canvas, 0, 0, sampleSize, sampleSize);
    const { data } = sampleCtx.getImageData(0, 0, sampleSize, sampleSize);
    let sumLuma = 0;
    let peakLuma = 0;
    const pixelCount = sampleSize * sampleSize;
    for (let i = 0; i < data.length; i += 4) {
      const luma =
        (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      sumLuma += luma;
      if (luma > peakLuma) peakLuma = luma;
    }
    const result = {
      avgLuma: sumLuma / pixelCount,
      peakLuma,
    };
    scanlineLastLuma = result;
    return result;
  } catch {
    const fallback = Math.min(1, 0.28 + Math.max(0, Math.min(1, beatBurst)) * 0.45);
    return { avgLuma: fallback, peakLuma: Math.min(1, fallback * 1.35) };
  }
}

function parseScanlineHexRgb(hex: string): { r: number; g: number; b: number } {
  const [r, g, b] = parseHexRgbTuple(hex);
  return { r, g, b };
}

function ensureCrtScanlineTiles(
  linePitch: number,
  tintColor: string,
  isCustomColor: boolean
): {
  cacheKey: string;
  gapTile: RenderCanvas;
  overlayTile: RenderCanvas;
} {
  const cacheKey = `${linePitch}:${tintColor.toLowerCase()}:${isCustomColor ? '1' : '0'}`;
  if (
    scanlineGapTileCanvas &&
    scanlineOverlayTileCanvas &&
    scanlineCachedKey === cacheKey
  ) {
    return {
      cacheKey,
      gapTile: scanlineGapTileCanvas,
      overlayTile: scanlineOverlayTileCanvas,
    };
  }

  const { r, g, b } = parseScanlineHexRgb(tintColor);
  const tileW = 3;
  const gapH = Math.max(1, Math.round(linePitch * 0.42));
  const scanH = Math.max(1, linePitch - gapH);

  scanlineGapTileCanvas = ensureScratchCanvas(
    scanlineGapTileCanvas,
    tileW,
    linePitch
  );
  const gapCtx = getContext2d(scanlineGapTileCanvas);
  if (gapCtx) {
    gapCtx.clearRect(0, 0, tileW, linePitch);
    // Subtle colored phosphor sheen on active line + dark CRT raster gap below
    gapCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${isCustomColor ? '0.14' : '0.05'})`;
    gapCtx.fillRect(0, 0, tileW - 1, scanH);
    gapCtx.fillStyle = 'rgba(4, 6, 14, 0.24)';
    gapCtx.fillRect(tileW - 1, 0, 1, scanH);
    gapCtx.fillStyle = `rgba(${Math.round(r * 0.05)}, ${Math.round(g * 0.05)}, ${Math.round(
      b * 0.05
    )}, 0.92)`;
    gapCtx.fillRect(0, scanH, tileW, gapH);
  }

  scanlineOverlayTileCanvas = ensureScratchCanvas(
    scanlineOverlayTileCanvas,
    tileW,
    linePitch
  );
  const ovCtx = getContext2d(scanlineOverlayTileCanvas);
  if (ovCtx) {
    ovCtx.clearRect(0, 0, tileW, linePitch);
    if (isCustomColor) {
      // Custom CRT phosphor tint across scanline row with bright center core
      const coreR = Math.min(255, Math.round(r * 0.72 + 255 * 0.28));
      const coreG = Math.min(255, Math.round(g * 0.72 + 255 * 0.28));
      const coreB = Math.min(255, Math.round(b * 0.72 + 255 * 0.28));
      ovCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.94)`;
      ovCtx.fillRect(0, 0, 1, scanH);
      ovCtx.fillStyle = `rgba(${coreR}, ${coreG}, ${coreB}, 0.96)`;
      ovCtx.fillRect(1, 0, 1, scanH);
      ovCtx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.94)`;
      ovCtx.fillRect(2, 0, 1, scanH);
    } else {
      // Classic RGB phosphor triad subtly warmed toward active theme color
      const mixR = (base: number) => Math.min(255, Math.round(base * 0.82 + r * 0.18));
      const mixG = (base: number) => Math.min(255, Math.round(base * 0.82 + g * 0.18));
      const mixB = (base: number) => Math.min(255, Math.round(base * 0.82 + b * 0.18));
      ovCtx.fillStyle = `rgba(${mixR(255)}, ${mixG(224)}, ${mixB(224)}, 0.92)`;
      ovCtx.fillRect(0, 0, 1, scanH);
      ovCtx.fillStyle = `rgba(${mixR(224)}, ${mixG(255)}, ${mixB(232)}, 0.92)`;
      ovCtx.fillRect(1, 0, 1, scanH);
      ovCtx.fillStyle = `rgba(${mixR(224)}, ${mixG(236)}, ${mixB(255)}, 0.92)`;
      ovCtx.fillRect(2, 0, 1, scanH);
    }
    // Darker inter-line valley in overlay contrast
    ovCtx.fillStyle = `rgba(${Math.round(10 + r * 0.04)}, ${Math.round(
      14 + g * 0.04
    )}, ${Math.round(22 + b * 0.04)}, 0.88)`;
    ovCtx.fillRect(0, scanH, tileW, gapH);
  }

  scanlineCachedKey = cacheKey;
  return {
    cacheKey,
    gapTile: scanlineGapTileCanvas,
    overlayTile: scanlineOverlayTileCanvas,
  };
}

function renderGlobalGlowEffect(
  ctx: RenderContext2D,
  width: number,
  height: number,
  minDim: number,
  globalGlowIntensity: number
): void {
  const glow = Math.max(0, Math.min(1, globalGlowIntensity));
  if (glow <= 0.005) return;

  const qW = Math.max(48, Math.round(width * 0.25));
  const qH = Math.max(48, Math.round(height * 0.25));
  const eW = Math.max(24, Math.round(width * 0.125));
  const eH = Math.max(24, Math.round(height * 0.125));

  globalGlowQuarterCanvas = ensureScratchCanvas(globalGlowQuarterCanvas, qW, qH);
  const qCtx = getContext2d(globalGlowQuarterCanvas, { alpha: false });
  if (!qCtx) return;

  const qBlurPx = Math.max(2, Math.round(minDim * (0.0045 + glow * 0.0065)));
  const brightPct = Math.round(88 + glow * 26);
  const contrastPct = Math.round(118 + glow * 34);
  const satPct = Math.round(112 + glow * 36);

  qCtx.save();
  qCtx.filter = `blur(${qBlurPx}px) brightness(${brightPct}%) contrast(${contrastPct}%) saturate(${satPct}%)`;
  qCtx.drawImage(ctx.canvas, 0, 0, qW, qH);
  qCtx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = Math.min(0.72, glow * 0.56);
  ctx.drawImage(globalGlowQuarterCanvas, 0, 0, width, height);

  globalGlowEighthCanvas = ensureScratchCanvas(globalGlowEighthCanvas, eW, eH);
  const eCtx = getContext2d(globalGlowEighthCanvas, { alpha: false });
  if (eCtx) {
    const eBlurPx = Math.max(2, Math.round(minDim * (0.006 + glow * 0.0085)));
    eCtx.save();
    eCtx.filter = `blur(${eBlurPx}px)`;
    eCtx.drawImage(globalGlowQuarterCanvas, 0, 0, eW, eH);
    eCtx.restore();

    ctx.globalAlpha = Math.min(0.45, glow * 0.34);
    ctx.drawImage(globalGlowEighthCanvas, 0, 0, width, height);
  }
  ctx.restore();
}

function renderCrtScanlineEffect(
  ctx: RenderContext2D,
  width: number,
  height: number,
  minDim: number,
  currentTime: number,
  scanlineIntensity: number,
  scanlineColorSetting: string | undefined,
  themePrimaryColor: string,
  beatBurst: number,
  isExport: boolean
): void {
  const intensity = Math.max(0, Math.min(1, scanlineIntensity));
  if (intensity <= 0.005) return;

  const rawColor =
    typeof scanlineColorSetting === 'string' ? scanlineColorSetting.trim() : '';
  const isCustomColor = /^#[0-9a-fA-F]{3,8}$/.test(rawColor);
  const resolvedTint = isCustomColor ? rawColor : themePrimaryColor;
  const { r, g, b } = parseScanlineHexRgb(resolvedTint);

  const { avgLuma, peakLuma } = sampleFrameVideoBrightness(ctx, beatBurst, isExport);
  // React scanline contrast, phosphor bloom & rolling refresh beam to real-time frame brightness
  const brightnessDrive = Math.min(1, avgLuma * 0.72 + peakLuma * 0.45);
  const linePitch = Math.max(3, Math.min(6, Math.round(minDim / 185)));
  const { cacheKey, gapTile, overlayTile } = ensureCrtScanlineTiles(
    linePitch,
    resolvedTint,
    isCustomColor
  );

  let patterns = scanlinePatternCache.get(ctx);
  if (!patterns || patterns.key !== cacheKey) {
    patterns = {
      key: cacheKey,
      overlayPattern: ctx.createPattern(overlayTile, 'repeat'),
      gapPattern: ctx.createPattern(gapTile, 'repeat'),
    };
    scanlinePatternCache.set(ctx, patterns);
  }

  ctx.save();

  // 1. Pixel-brightness-reactive phosphor triad & raster contrast ('overlay' preserves dark blacks & pops brights)
  if (patterns.overlayPattern) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = Math.min(
      0.76,
      intensity * (0.28 + brightnessDrive * 0.46)
    );
    ctx.fillStyle = patterns.overlayPattern;
    ctx.fillRect(0, 0, width, height);
  }

  // 2. Vintage CRT dark raster inter-line mask & subtle phosphor row tint (deepens crisply as frame luminance rises)
  if (patterns.gapPattern) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = Math.min(
      0.62,
      intensity * ((isCustomColor ? 0.24 : 0.16) + brightnessDrive * 0.36)
    );
    ctx.fillStyle = patterns.gapPattern;
    ctx.fillRect(0, 0, width, height);
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(2, 4, 10, ${(intensity * (0.14 + brightnessDrive * 0.28)).toFixed(3)})`;
    const gapH = Math.max(1, Math.round(linePitch * 0.42));
    for (let y = linePitch - gapH; y < height; y += linePitch) {
      ctx.fillRect(0, y, width, gapH);
    }
  }

  // 3. Subtle rolling CRT vertical retrace hum bar tinted with Scanline Color and reacting to bright frames
  const bandH = Math.max(24, height * 0.11);
  const sweepFrac = ((currentTime * 0.18) % 1.25) - 0.125;
  const bandY = sweepFrac * height;
  const bandGrad = ctx.createLinearGradient(0, bandY, 0, bandY + bandH);
  const bandAlpha = intensity * ((isCustomColor ? 0.04 : 0.02) + brightnessDrive * 0.075);
  bandGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
  bandGrad.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${bandAlpha.toFixed(3)})`);
  bandGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  ctx.fillStyle = bandGrad;
  ctx.fillRect(0, bandY, width, bandH);

  // 4. Gentle CRT glass edge curvature vignette
  const cx = width * 0.5;
  const cy = height * 0.5;
  const outerR = Math.hypot(cx, cy);
  const tubeVig = ctx.createRadialGradient(cx, cy, outerR * 0.48, cx, cy, outerR);
  tubeVig.addColorStop(0, 'rgba(0, 0, 0, 0)');
  tubeVig.addColorStop(
    1,
    `rgba(2, 4, 10, ${Math.min(0.45, intensity * (0.28 - brightnessDrive * 0.08)).toFixed(3)})`
  );
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = tubeVig;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

function createRenderCanvas(width: number, height: number): RenderCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  return new OffscreenCanvas(width, height);
}

function ensureScratchCanvas(
  existing: RenderCanvas | null,
  width: number,
  height: number
): RenderCanvas {
  const canvas = existing ?? createRenderCanvas(width, height);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return canvas;
}

function getContext2d(
  canvas: RenderCanvas,
  options?: CanvasRenderingContext2DSettings
): RenderContext2D | null {
  return canvas.getContext('2d', options) as RenderContext2D | null;
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
    settings: rawSettings,
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
    sceneTransitionState,
    trackDuration,
    mocapClip,
  } = params;

  const hasGlobalHueRotation = Math.abs(rawSettings.globalHueRotation ?? 0) > 0.05;
  const resolvedColors =
    rawSettings.autoCycleColor || hasGlobalHueRotation
      ? resolveAutoCycledColors(rawSettings, currentTime, trackDuration)
      : null;
  let settings: StudioSettings = resolvedColors
    ? {
        ...rawSettings,
        primaryColor: resolvedColors.primaryColor,
        secondaryColor: resolvedColors.secondaryColor,
        bgColor: resolvedColors.bgColor,
        ...(resolvedColors.danceRimColor !== undefined
          ? { danceRimColor: resolvedColors.danceRimColor }
          : {}),
        ...(resolvedColors.scanlineColor !== undefined
          ? { scanlineColor: resolvedColors.scanlineColor }
          : {}),
      }
    : rawSettings;

  const { bass, mid, treble } = computeBands(frequencyData, settings.sensitivity);
  const beatBoost = settings.beatDetection ? beatBurst : 0;

  if (settings.beatDetection && settings.beatColorMappingEnabled) {
    const beatEnergy = Math.max(beatTriggered ? 1 : 0, Math.min(1, beatBurst));
    const mapped = resolveBeatMappedColors({
      lowColor: settings.beatColorLow ?? '#f43f5e',
      midColor: settings.beatColorMid ?? '#a855f7',
      highColor: settings.beatColorHigh ?? '#22d3ee',
      bass,
      mid,
      treble,
      beatEnergy,
      hueShiftDeg: resolvedColors?.hueShiftDeg ?? (rawSettings.globalHueRotation ?? 0),
    });
    settings = {
      ...settings,
      primaryColor: mapped.primaryColor,
      secondaryColor: mapped.secondaryColor,
    };
  }

  const minDim = Math.min(width, height);
  const isPortrait = height > width;
  const safePadX = width * 0.075;
  const safePadY = height * 0.065;

  // 1. Background Fill & Optional Cover Image (cached across frames for fast export & 60fps playback)
  ctx.save();

  // 1a. Bass Shake & Beat Shake camera transforms on detected beat hits
  const bassShakeIntensity = Math.max(0, Math.min(1, settings.bassShake ?? 0));
  const beatShakeIntensity = Math.max(0, Math.min(1, settings.beatShake ?? 0));
  const shakeImpulse = Math.max(beatTriggered ? 1 : 0, Math.min(1, beatBurst));
  const bassShakeDrive =
    bassShakeIntensity > 0.005 && shakeImpulse > 0.02
      ? Math.pow(shakeImpulse, 1.35) * bassShakeIntensity
      : 0;
  const beatShakeDrive =
    beatShakeIntensity > 0.005 && shakeImpulse > 0.02
      ? Math.pow(shakeImpulse, 2.0) * beatShakeIntensity
      : 0;

  ctx.save();
  if (bassShakeDrive > 0.002 || beatShakeDrive > 0.002) {
    let shakeX = 0;
    let shakeY = 0;
    let shakeRot = 0;
    let shakeScale = 1;

    if (bassShakeDrive > 0.002) {
      const maxShift = minDim * 0.018 * bassShakeDrive;
      shakeX +=
        (Math.sin(currentTime * 47.0) * 0.65 + Math.cos(currentTime * 83.0) * 0.35) * maxShift;
      shakeY +=
        (Math.cos(currentTime * 53.0) * 0.65 + Math.sin(currentTime * 97.0) * 0.35) *
        maxShift *
        0.85;
      shakeRot += Math.sin(currentTime * 38.0) * 0.0085 * bassShakeDrive;
      shakeScale += 0.052 * bassShakeDrive;
    }

    if (beatShakeDrive > 0.002) {
      const maxBeatShift = minDim * 0.011 * beatShakeDrive;
      shakeX +=
        (Math.sin(currentTime * 137.0) * 0.55 + Math.cos(currentTime * 223.0) * 0.45) *
        maxBeatShift;
      shakeY +=
        (Math.cos(currentTime * 163.0) * 0.55 + Math.sin(currentTime * 251.0) * 0.45) *
        maxBeatShift *
        0.9;
      shakeRot += Math.sin(currentTime * 191.0) * 0.0042 * beatShakeDrive;
      shakeScale += 0.024 * beatShakeDrive;
    }

    ctx.translate(width * 0.5 + shakeX, height * 0.5 + shakeY);
    ctx.rotate(shakeRot);
    ctx.scale(shakeScale, shakeScale);
    ctx.translate(-width * 0.5, -height * 0.5);
  }

  const bgDims = getImageDimensions(bgImage);
  const bgFit = settings.bgFit ?? 'cover';
  const bgScale = Math.max(1, Math.min(2, settings.bgScale ?? 1));
  const bgOffsetX = Math.max(-50, Math.min(50, settings.bgOffsetX ?? 0));
  const bgOffsetY = Math.max(-50, Math.min(50, settings.bgOffsetY ?? 0));
  const bgBrightness = Math.max(0.4, Math.min(1.6, settings.bgBrightness ?? 1));
  const bgContrast = Math.max(0.5, Math.min(1.6, settings.bgContrast ?? 1));
  const bgSaturation = Math.max(0, Math.min(2, settings.bgSaturation ?? 1));
  const bgVignette = Math.max(0, Math.min(1, settings.bgVignette ?? 0));
  const bgTintStrength = Math.max(0, Math.min(0.65, settings.bgTintStrength ?? 0));

  const bgTintKey =
    bgTintStrength > 0 ? `${settings.primaryColor}|${settings.secondaryColor}` : 'no-tint';
  const baseBgKey = `${width}x${height}|${settings.bgColor}|${settings.bgBlur}|${bgFit}|${bgScale}|${bgOffsetX}|${bgOffsetY}|${bgBrightness}|${bgContrast}|${bgSaturation}|${bgDims ? `${bgDims.width}x${bgDims.height}` : 'none'}`;
  const bgKey = `${baseBgKey}|${settings.bgDim}|${bgVignette}|${bgTintStrength}|${bgTintKey}`;

  if (cachedBgCanvas && cachedBgKey === bgKey && cachedBgImageRef === bgImage) {
    ctx.drawImage(cachedBgCanvas, 0, 0, width, height);
  } else {
    // Stage A: expensive blurred & tone-filtered photo is cached independently of auto-cycled tint colors
    const hasBaseCache =
      cachedBaseBgCanvas &&
      cachedBaseBgKey === baseBgKey &&
      cachedBaseBgImageRef === bgImage;

    if (!hasBaseCache) {
      cachedBaseBgCanvas = ensureScratchCanvas(cachedBaseBgCanvas, width, height);
      const baseCtx = getContext2d(cachedBaseBgCanvas, { alpha: false });
      if (baseCtx) {
        baseCtx.fillStyle = settings.bgColor;
        baseCtx.fillRect(0, 0, width, height);

        if (bgDims && bgImage) {
          const toneFilters: string[] = [];
          if (Math.abs(bgBrightness - 1) > 0.01) {
            toneFilters.push(`brightness(${Math.round(bgBrightness * 100)}%)`);
          }
          if (Math.abs(bgContrast - 1) > 0.01) {
            toneFilters.push(`contrast(${Math.round(bgContrast * 100)}%)`);
          }
          if (Math.abs(bgSaturation - 1) > 0.01) {
            toneFilters.push(`saturate(${Math.round(bgSaturation * 100)}%)`);
          }

          if (bgFit === 'contain-blur') {
            const ambientBlur = Math.max(18, settings.bgBlur + 14);
            baseCtx.save();
            baseCtx.filter = [`blur(${ambientBlur}px)`, ...toneFilters].join(' ');
            drawCoverImage(baseCtx, bgImage, width, height, ambientBlur * 1.6, 1.08, 0, 0);
            baseCtx.restore();

            baseCtx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.88, 0.32 + settings.bgDim * 0.6)})`;
            baseCtx.fillRect(0, 0, width, height);

            baseCtx.save();
            const fgFilters = [
              ...(settings.bgBlur > 0 ? [`blur(${Math.round(settings.bgBlur * 0.4)}px)`] : []),
              ...toneFilters,
            ];
            if (fgFilters.length > 0) {
              baseCtx.filter = fgFilters.join(' ');
            }
            drawContainFramedImage(baseCtx, bgImage, width, height, bgScale, bgOffsetX, bgOffsetY);
            baseCtx.restore();
          } else {
            baseCtx.save();
            const allFilters = [
              ...(settings.bgBlur > 0 ? [`blur(${settings.bgBlur}px)`] : []),
              ...toneFilters,
            ];
            if (allFilters.length > 0) {
              baseCtx.filter = allFilters.join(' ');
            }
            if (bgFit === 'stretch') {
              const overscan = settings.bgBlur * 1.6;
              const sw = (width + overscan * 2) * bgScale;
              const sh = (height + overscan * 2) * bgScale;
              const sx = (width - sw) * 0.5 - (bgOffsetX / 100) * Math.max(0, sw - width);
              const sy = (height - sh) * 0.5 - (bgOffsetY / 100) * Math.max(0, sh - height);
              baseCtx.drawImage(bgImage, sx, sy, sw, sh);
            } else {
              drawCoverImage(
                baseCtx,
                bgImage,
                width,
                height,
                settings.bgBlur * 1.6,
                bgScale,
                bgOffsetX,
                bgOffsetY
              );
            }
            baseCtx.restore();
          }
        }
        cachedBaseBgKey = baseBgKey;
        cachedBaseBgImageRef = bgImage;
      }
    }

    // Stage B: composite fast tint/dim/vignette over cached base background
    cachedBgCanvas = ensureScratchCanvas(cachedBgCanvas, width, height);
    const bgCtx = getContext2d(cachedBgCanvas, { alpha: false });
    if (bgCtx) {
      if (cachedBaseBgCanvas) {
        bgCtx.drawImage(cachedBaseBgCanvas, 0, 0, width, height);
      } else {
        bgCtx.fillStyle = settings.bgColor;
        bgCtx.fillRect(0, 0, width, height);
      }

      if (bgDims && bgImage) {
        if (bgTintStrength > 0.005) {
          bgCtx.save();
          const tintGrad = bgCtx.createLinearGradient(0, 0, width, height);
          tintGrad.addColorStop(0, hexToRgba(settings.primaryColor, bgTintStrength));
          tintGrad.addColorStop(1, hexToRgba(settings.secondaryColor, bgTintStrength));
          bgCtx.globalCompositeOperation = 'color';
          bgCtx.fillStyle = tintGrad;
          bgCtx.fillRect(0, 0, width, height);
          bgCtx.globalCompositeOperation = 'source-over';
          bgCtx.fillStyle = hexToRgba(settings.primaryColor, bgTintStrength * 0.28);
          bgCtx.fillRect(0, 0, width, height);
          bgCtx.restore();
        }

        if (settings.bgDim > 0 && bgFit !== 'contain-blur') {
          bgCtx.fillStyle = `rgba(0, 0, 0, ${settings.bgDim})`;
          bgCtx.fillRect(0, 0, width, height);
        } else if (settings.bgDim > 0 && bgFit === 'contain-blur') {
          bgCtx.fillStyle = `rgba(0, 0, 0, ${settings.bgDim * 0.55})`;
          bgCtx.fillRect(0, 0, width, height);
        }
      } else {
        const ambient = bgCtx.createRadialGradient(
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
        bgCtx.fillStyle = ambient;
        bgCtx.fillRect(0, 0, width, height);
      }

      if (bgVignette > 0.005) {
        const vig = bgCtx.createRadialGradient(
          width * 0.5,
          height * 0.5,
          minDim * 0.24,
          width * 0.5,
          height * 0.5,
          Math.hypot(width, height) * 0.56
        );
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(0.55, `rgba(0, 0, 0, ${(bgVignette * 0.34).toFixed(3)})`);
        vig.addColorStop(1, `rgba(0, 0, 0, ${(bgVignette * 0.88).toFixed(3)})`);
        bgCtx.fillStyle = vig;
        bgCtx.fillRect(0, 0, width, height);
      }

      cachedBgKey = bgKey;
      cachedBgImageRef = bgImage;
      ctx.drawImage(cachedBgCanvas, 0, 0, width, height);
    }
  }

  // 1a-2. Beat Flash: briefly invert background and flash toward primary/secondary colors on beat trigger
  if (settings.beatFlash) {
    const flashImpulse = Math.max(beatTriggered ? 1 : 0, Math.min(1, beatBurst));
    if (flashImpulse > 0.015) {
      const swapColors = (beatShockwaves?.length ?? 0) % 2 === 1;
      const flashStart = swapColors ? settings.secondaryColor : settings.primaryColor;
      const flashEnd = swapColors ? settings.primaryColor : settings.secondaryColor;

      // Brief contrast inversion pulse on sharp beat onset
      const invertAlpha = Math.pow(flashImpulse, 2.1) * 0.44;
      if (invertAlpha > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'difference';
        ctx.fillStyle = `rgba(255, 255, 255, ${invertAlpha.toFixed(3)})`;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      // Primary / secondary color background flash wash
      const washAlpha = Math.pow(flashImpulse, 1.3) * 0.56;
      const flashGrad = ctx.createLinearGradient(0, 0, width, height);
      flashGrad.addColorStop(0, hexToRgba(flashStart, washAlpha));
      flashGrad.addColorStop(0.5, hexToRgba(flashEnd, washAlpha * 0.82));
      flashGrad.addColorStop(1, hexToRgba(flashStart, washAlpha * 0.92));
      ctx.save();
      ctx.fillStyle = flashGrad;
      ctx.fillRect(0, 0, width, height);

      // Center radial impact highlight
      const radialFlash = ctx.createRadialGradient(
        width * 0.5,
        height * 0.5,
        minDim * 0.02,
        width * 0.5,
        height * 0.5,
        Math.hypot(width, height) * 0.6
      );
      radialFlash.addColorStop(0, hexToRgba(flashStart, washAlpha * 0.55));
      radialFlash.addColorStop(0.6, hexToRgba(flashEnd, washAlpha * 0.22));
      radialFlash.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = radialFlash;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }

  // 1b. Motion Blur: Apply preset-specific blur kernel using accumulated frame buffer(s)
  const motionBlurAlpha = Math.max(0, Math.min(0.85, settings.motionBlur || 0));
  const rawMotionBlurPreset =
    settings.motionBlurPreset ?? (motionBlurAlpha > 0.005 ? 'trails' : 'none');
  const activeMotionBlurPreset: MotionBlurPresetKey =
    motionBlurAlpha <= 0.005 || rawMotionBlurPreset === 'none' ? 'none' : rawMotionBlurPreset;

  if (motionBlurState && motionBlurState.lastPreset !== activeMotionBlurPreset) {
    motionBlurState.frameIndex = 0;
    if (activeMotionBlurPreset === 'none') {
      motionBlurState.hasFrame = false;
    }
    motionBlurState.lastPreset = activeMotionBlurPreset;
  }

  if (
    activeMotionBlurPreset !== 'none' &&
    motionBlurState?.canvas &&
    motionBlurState.hasFrame &&
    motionBlurState.canvas.width === width &&
    motionBlurState.canvas.height === height
  ) {
    const strengthNorm = motionBlurAlpha / 0.85;
    if (activeMotionBlurPreset === 'trails') {
      const trailBlurPx = Math.max(1, Math.round(minDim * 0.0024 * strengthNorm));
      const zoomScale = 1 + 0.007 * strengthNorm;
      const zw = width * zoomScale;
      const zh = height * zoomScale;
      const zx = (width - zw) * 0.5;
      const zy = (height - zh) * 0.5;
      ctx.save();
      ctx.globalAlpha = motionBlurAlpha;
      ctx.filter = `blur(${trailBlurPx}px)`;
      ctx.drawImage(motionBlurState.canvas, zx, zy, zw, zh);
      ctx.restore();
    } else if (activeMotionBlurPreset === 'ghosting') {
      const drift = Math.max(3, minDim * 0.009 * strengthNorm);
      const blur1 = Math.max(1, Math.round(minDim * 0.002 * strengthNorm));
      const blur2 = Math.max(2, Math.round(minDim * 0.0048 * strengthNorm));

      ctx.save();
      ctx.globalAlpha = motionBlurAlpha * 0.65;
      ctx.filter = `blur(${blur1}px)`;
      ctx.drawImage(motionBlurState.canvas, -drift * 0.55, -drift * 0.35, width, height);
      ctx.restore();

      const secondary = motionBlurState.secondaryCanvas;
      if (secondary && secondary.width === width && secondary.height === height) {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = Math.min(0.62, motionBlurAlpha * 0.48);
        ctx.filter = `blur(${blur2}px) saturate(135%)`;
        ctx.drawImage(secondary, drift * 1.1, drift * 0.5, width, height);
        ctx.restore();
      }
    } else if (activeMotionBlurPreset === 'stutter') {
      const frameIdx = motionBlurState.frameIndex ?? 0;
      const stutterBlurPx = Math.max(1, Math.round(minDim * 0.003 * strengthNorm));
      const shutterShift = Math.sin(frameIdx * 1.65) * minDim * 0.005 * strengthNorm;

      ctx.save();
      ctx.globalAlpha = Math.min(0.9, motionBlurAlpha * 1.02);
      ctx.filter = `blur(${stutterBlurPx}px)`;
      ctx.drawImage(motionBlurState.canvas, shutterShift, 0, width, height);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = motionBlurAlpha * 0.3;
      ctx.drawImage(motionBlurState.canvas, -shutterShift * 1.6, 0, width, height);
      ctx.restore();
    }
  }

  // Advance album rotation subtly with bass, and 3D cube rotation scaled by beat intensity
  const cubeSpeedMult = 1 + beatBoost * 3.4 + bass * 0.95;
  if (albumRotationRef) {
    albumRotationRef.angle += dt * (0.18 + bass * 0.35);
    albumRotationRef.cubeX = (albumRotationRef.cubeX ?? 0.48) + dt * 0.44 * cubeSpeedMult;
    albumRotationRef.cubeY = (albumRotationRef.cubeY ?? 0.68) + dt * 0.72 * cubeSpeedMult;
    albumRotationRef.cubeZ = (albumRotationRef.cubeZ ?? 0.18) + dt * 0.24 * cubeSpeedMult;
  }

  // 2. Visualizer Modes & Beat-Detection Bursts (with optional additive Bloom passes)
  const visCenterY = isPortrait ? height * 0.42 : height * 0.46;
  const visScale = Math.max(0.55, Math.min(1.5, settings.visualizerScale ?? 1));
  const lyricPosFrac = Math.max(
    0.15,
    Math.min(0.92, (settings.lyricPosition ?? (isPortrait ? 77 : 81)) / 100)
  );
  const linearSpanFactor = Math.min(1.08, 0.45 + visScale * 0.55);
  const linW = (width - safePadX * 2) * linearSpanFactor;
  const linPadX = (width - linW) * 0.5;
  const bloom = Math.max(0, Math.min(1.5, settings.bloomIntensity ?? 0));
  const globalGlow = Math.max(0, Math.min(1, settings.globalGlow ?? 0));
  const isCircularModeFor = (mode: VisualizerMode) =>
    mode === 'circular-ring' || mode === 'hybrid-particles' || mode === 'harmonic-orb';

  const circularCx = width * 0.5;
  const circularCy = isPortrait ? height * 0.41 : height * 0.45;
  const circularBaseRadius =
    minDim * (isPortrait ? 0.21 : 0.22) * visScale * (1 + bass * 0.13 + beatBoost * 0.1);
  const circularArtRadius = circularBaseRadius * 0.87;

  let particlesUpdatedThisFrame = false;
  const particleVelMult = Math.max(0.2, Math.min(3.0, settings.particleVelocity ?? 1.0));
  const particleLifeSec = Math.max(0.3, Math.min(3.5, settings.particleLifespan ?? 1.2));
  const particleShape: ParticleShape = settings.particleShape ?? 'circle';

  const drawVisualizerLayer = (vCtx: RenderContext2D, mode: VisualizerMode) => {
    const modeIsCircular = isCircularModeFor(mode);
    const burstCenterY = modeIsCircular
      ? isPortrait
        ? height * 0.41
        : height * 0.45
      : visCenterY;
    const enableElemShadow = bloom <= 0.005;
    const glowShadowScale = 1 + globalGlow * 0.65;
    const applyShadow = (color: string, blurPx: number) => {
      if (enableElemShadow) {
        vCtx.shadowColor = color;
        vCtx.shadowBlur = blurPx * glowShadowScale;
      } else {
        vCtx.shadowBlur = 0;
      }
    };

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
        applyShadow(sw.color, minDim * 0.02);
        vCtx.stroke();
      }
      vCtx.restore();
    }

    // Unified Particle System spawning & physics (runs once per frame even during scene transitions)
    if (!particlesUpdatedThisFrame) {
      particlesUpdatedThisFrame = true;
      const maxParticles = 240;

      // 1. Beat-triggered burst particle spawning across all visualizer modes
      if (settings.beatDetection && beatTriggered) {
        const burstCount = 18;
        const isLinearMode = !modeIsCircular;
        for (let s = 0; s < burstCount; s++) {
          if (particles.length >= maxParticles) break;
          const angle = (s / burstCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.28;
          const speed = minDim * (0.24 + Math.random() * 0.28) * particleVelMult;
          const spawnX = isLinearMode
            ? safePadX + Math.random() * (width - safePadX * 2)
            : width * 0.5 + Math.cos(angle) * (minDim * 0.14);
          const spawnY = isLinearMode
            ? burstCenterY + (Math.random() - 0.5) * 8
            : burstCenterY + Math.sin(angle) * (minDim * 0.14);
          const vx = isLinearMode
            ? (Math.random() - 0.5) * minDim * 0.22 * particleVelMult
            : Math.cos(angle) * speed;
          const vy = isLinearMode
            ? (Math.random() > 0.5 ? 1 : -1) *
              (minDim * (0.18 + Math.random() * 0.25)) *
              particleVelMult
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
            maxLife: particleLifeSec * (0.72 + Math.random() * 0.5),
          });
        }
      }

      // 2. Hybrid-particles radial emitter
      if (mode === 'hybrid-particles' && bass > 0.42) {
        const spawnCount = Math.min(8, Math.floor(bass * 6));
        for (let s = 0; s < spawnCount; s++) {
          if (particles.length >= maxParticles) break;
          const angle = Math.random() * Math.PI * 2;
          const speed =
            minDim * 0.18 * (0.6 + Math.random() * 0.9 + bass * 0.6) * particleVelMult;
          particles.push({
            x: circularCx + Math.cos(angle) * circularBaseRadius,
            y: circularCy + Math.sin(angle) * circularBaseRadius,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            radius: Math.max(1.8, minDim * (0.003 + Math.random() * 0.0045)),
            alpha: 0.92,
            color: Math.random() > 0.45 ? settings.primaryColor : settings.secondaryColor,
            life: 0,
            maxLife: particleLifeSec * (0.78 + Math.random() * 0.62),
          });
        }
      }

      // 3. Ambient Particle System continuous stream (when enabled in Particle System panel)
      if (settings.particleEnabled) {
        const energy = Math.min(1.5, bass * 0.65 + mid * 0.35 + beatBoost * 0.4);
        const ambientQuota = Math.max(1, Math.min(6, Math.round(1 + energy * 3.5)));
        for (let s = 0; s < ambientQuota; s++) {
          if (particles.length >= maxParticles) break;
          const spawnX = safePadX * 0.5 + Math.random() * (width - safePadX);
          const spawnY =
            burstCenterY + (Math.random() - 0.5) * height * 0.58;
          const { fx, fy } = sampleParticleFlowMap(
            settings.particleFlowMap,
            spawnX / Math.max(1, width),
            spawnY / Math.max(1, height)
          );
          const flowMag = Math.hypot(fx, fy);
          const baseSpeed = minDim * (0.12 + energy * 0.14) * particleVelMult;
          const angle = Math.random() * Math.PI * 2;
          const vx =
            flowMag > 0.05
              ? fx * baseSpeed + (Math.random() - 0.5) * minDim * 0.04
              : Math.cos(angle) * baseSpeed * 0.65;
          const vy =
            flowMag > 0.05
              ? fy * baseSpeed + (Math.random() - 0.5) * minDim * 0.04
              : Math.sin(angle) * baseSpeed * 0.65 - minDim * 0.04 * particleVelMult;

          particles.push({
            x: spawnX,
            y: spawnY,
            vx,
            vy,
            radius: Math.max(1.8, minDim * (0.0028 + Math.random() * 0.0042)),
            alpha: 0.9,
            color:
              s % 3 === 0
                ? settings.secondaryColor
                : settings.primaryColor,
            life: 0,
            maxLife: particleLifeSec * (0.7 + Math.random() * 0.6),
          });
        }
      }

      // Advance particle kinematics & steer with painted Flow Map vectors
      const flowForceScale = minDim * 0.42 * particleVelMult;
      const damping = Math.pow(0.968, Math.max(0.25, dt * 60));
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (
          p.life >= p.maxLife ||
          p.x < -24 ||
          p.x > width + 24 ||
          p.y < -24 ||
          p.y > height + 24
        ) {
          particles.splice(i, 1);
          continue;
        }

        const { fx, fy } = sampleParticleFlowMap(
          settings.particleFlowMap,
          p.x / Math.max(1, width),
          p.y / Math.max(1, height)
        );
        if (Math.abs(fx) > 0.01 || Math.abs(fy) > 0.01) {
          p.vx += fx * flowForceScale * dt * 2.4;
          p.vy += fy * flowForceScale * dt * 2.4;
        }

        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= damping;
        p.vy *= damping;
      }
    }

    // Draw active particles using pre-rendered glow sprites (eliminates up to 240 Gaussian shadow blurs per frame)
    if (particles.length > 0) {
      vCtx.save();
      const spriteSizeRatio = PARTICLE_SPRITE_SIZE / (PARTICLE_SPRITE_BASE_R * 2);
      const isRotatedShape =
        particleShape !== 'circle' && particleShape !== 'ring';

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const lifeProgress = Math.max(0, Math.min(1, p.life / Math.max(0.05, p.maxLife)));
        const fadeIn = Math.min(1, lifeProgress * 6);
        const alpha = (1 - lifeProgress) * fadeIn * 0.88;
        if (alpha <= 0.01) continue;
        const r = Math.max(1, p.radius * (1 - lifeProgress * 0.35));
        const sprite = getParticleSprite(p.color, particleShape, enableElemShadow);

        if (sprite) {
          const drawSize = r * 2 * spriteSizeRatio;
          vCtx.globalAlpha = alpha;
          if (isRotatedShape) {
            const speedMag = Math.hypot(p.vx, p.vy);
            const angle = speedMag > 4 ? Math.atan2(p.vy, p.vx) : p.life * 2.4;
            vCtx.save();
            vCtx.translate(p.x, p.y);
            vCtx.rotate(angle);
            vCtx.drawImage(sprite, -drawSize * 0.5, -drawSize * 0.5, drawSize, drawSize);
            vCtx.restore();
          } else {
            vCtx.drawImage(
              sprite,
              p.x - drawSize * 0.5,
              p.y - drawSize * 0.5,
              drawSize,
              drawSize
            );
          }
        } else {
          const speedMag = Math.hypot(p.vx, p.vy);
          const angle = speedMag > 4 ? Math.atan2(p.vy, p.vx) : p.life * 2.4;
          const colorRgba = hexToRgba(p.color, alpha);
          vCtx.fillStyle = colorRgba;
          vCtx.strokeStyle = colorRgba;
          drawParticleShape(vCtx, p.x, p.y, r, angle, particleShape);
        }
      }
      vCtx.restore();
    }

    if (mode === 'mirrored-bars') {
      const barCount = settings.barCount;
      const totalW = linW;
      const step = totalW / barCount;
      const barW = Math.max(2, step * 0.62);
      const maxHalfH =
        (isPortrait ? height * 0.16 : height * 0.24) * visScale * (1 + beatBoost * 0.16);

      const grad = vCtx.createLinearGradient(0, visCenterY - maxHalfH, 0, visCenterY + maxHalfH);
      grad.addColorStop(0, settings.primaryColor);
      grad.addColorStop(0.5, settings.secondaryColor);
      grad.addColorStop(1, settings.primaryColor);

      vCtx.save();
      vCtx.fillStyle = grad;
      applyShadow(hexToRgba(settings.primaryColor, 0.55 + beatBoost * 0.35), minDim * (0.018 + beatBoost * 0.015));

      // Subtle center horizon line + batched bars in a single fill pass
      vCtx.beginPath();
      vCtx.rect(linPadX, visCenterY - 1, totalW, 2);
      const barHalfBase = (step - barW) * 0.5;
      const halfCenter = (barCount - 1) * 0.5;
      for (let i = 0; i < barCount; i++) {
        const mirrorIdx = Math.abs(i - halfCenter) / Math.max(1, halfCenter);
        const val = getPerceptualBarValue(
          frequencyData,
          Math.floor(mirrorIdx * (barCount * 0.72)),
          barCount,
          settings.sensitivity
        );
        const h = Math.max(4, Math.pow(val, 1.15) * maxHalfH);
        const x = linPadX + i * step + barHalfBase;
        const y = visCenterY - h;
        const radius = Math.min(barW * 0.5, h);
        vCtx.roundRect(x, y, barW, h * 2, radius);
      }
      vCtx.fill();
      vCtx.restore();
    } else if (mode === 'neon-wave') {
      const waveWidth = linW;
      const maxAmp =
        (isPortrait ? height * 0.13 : height * 0.19) * visScale * (1 + beatBoost * 0.18);

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
          const x = linPadX + progress * waveWidth;
          const y = visCenterY + raw * maxAmp * ampScale * settings.sensitivity * edgeFade;

          if (i === 0) {
            vCtx.moveTo(x, y);
          } else {
            const prevProgress = (i - 1) / points;
            const prevX = linPadX + prevProgress * waveWidth;
            const midX = (prevX + x) * 0.5;
            vCtx.quadraticCurveTo(prevX, y, midX, y);
          }
        }

        vCtx.strokeStyle = hexToRgba(color, alpha);
        vCtx.lineWidth = lineWidth;
        vCtx.lineCap = 'round';
        vCtx.lineJoin = 'round';
        applyShadow(hexToRgba(color, 0.75 + beatBoost * 0.25), minDim * (0.025 + beatBoost * 0.015));
        vCtx.stroke();

        if (fillUnder) {
          vCtx.lineTo(linPadX + waveWidth, visCenterY);
          vCtx.lineTo(linPadX, visCenterY);
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
    } else if (mode === 'dual-ribbon') {
      // Aurora Frequency Ribbons: smooth overlapping spline terrain waves with glowing crests
      const spanW = linW;
      const pointCount = Math.max(36, Math.min(72, Math.round(settings.barCount * 0.6)));
      const maxRibbonH =
        (isPortrait ? height * 0.165 : height * 0.24) * visScale * (1 + beatBoost * 0.18);

      const drawRibbon = (
        color: string,
        direction: 1 | -1,
        ampScale: number,
        freqShift: number,
        phaseSpeed: number,
        fillAlpha: number
      ) => {
        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i <= pointCount; i++) {
          const progress = i / pointCount;
          const symProgress = 1 - Math.abs(progress * 2 - 1);
          const binIdx = Math.min(
            pointCount - 1,
            Math.floor(Math.abs(progress * 2 - 1) * pointCount * 0.72) + freqShift
          );
          const specVal = getPerceptualBarValue(
            frequencyData,
            Math.max(0, Math.min(pointCount - 1, binIdx)),
            pointCount,
            settings.sensitivity
          );
          const waveRipple =
            0.5 +
            0.5 *
              Math.sin(
                progress * Math.PI * 5 + currentTime * phaseSpeed + freqShift * 0.4
              );
          const edgeEnvelope = Math.pow(Math.sin(progress * Math.PI), 0.65);
          const amplitude =
            (Math.pow(specVal, 1.08) * 0.82 + waveRipple * (0.08 + mid * 0.14)) *
            maxRibbonH *
            ampScale *
            (0.35 + 0.65 * symProgress) *
            edgeEnvelope;

          pts.push({
            x: linPadX + progress * spanW,
            y: visCenterY + direction * Math.max(3, amplitude),
          });
        }

        vCtx.save();
        vCtx.beginPath();
        vCtx.moveTo(pts[0].x, visCenterY);
        vCtx.lineTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const midX = (prev.x + curr.x) * 0.5;
          const midY = (prev.y + curr.y) * 0.5;
          vCtx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
        const last = pts[pts.length - 1];
        vCtx.lineTo(last.x, last.y);
        vCtx.lineTo(last.x, visCenterY);
        vCtx.closePath();

        const ribbonGrad = vCtx.createLinearGradient(
          0,
          visCenterY,
          0,
          visCenterY + direction * maxRibbonH * ampScale
        );
        ribbonGrad.addColorStop(0, hexToRgba(color, fillAlpha * 0.12));
        ribbonGrad.addColorStop(0.55, hexToRgba(color, fillAlpha * 0.55));
        ribbonGrad.addColorStop(1, hexToRgba(color, fillAlpha));
        vCtx.fillStyle = ribbonGrad;
        vCtx.fill();

        // Luminous crest outline
        vCtx.beginPath();
        vCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          const prev = pts[i - 1];
          const curr = pts[i];
          const midX = (prev.x + curr.x) * 0.5;
          const midY = (prev.y + curr.y) * 0.5;
          vCtx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
        vCtx.lineTo(last.x, last.y);
        vCtx.strokeStyle = hexToRgba(color, 0.94);
        vCtx.lineWidth = Math.max(2, minDim * 0.0042);
        vCtx.lineCap = 'round';
        applyShadow(color, minDim * (0.022 + beatBoost * 0.015));
        vCtx.stroke();
        vCtx.restore();
      };

      // Back depth ribbons
      drawRibbon(settings.secondaryColor, -1, 0.84, 4, 2.4, 0.34);
      drawRibbon(settings.primaryColor, 1, 0.78, 5, -2.1, 0.3);
      // Foreground dominant ribbons
      drawRibbon(settings.primaryColor, -1, 1.04, 0, 3.1, 0.48);
      drawRibbon(settings.secondaryColor, 1, 0.96, 1, -2.8, 0.42);

      // Subtle horizontal aurora axis
      vCtx.save();
      const axisGrad = vCtx.createLinearGradient(linPadX, 0, width - linPadX, 0);
      axisGrad.addColorStop(0, 'rgba(255,255,255,0)');
      axisGrad.addColorStop(0.2, hexToRgba(settings.primaryColor, 0.55));
      axisGrad.addColorStop(0.5, hexToRgba('#ffffff', 0.8));
      axisGrad.addColorStop(0.8, hexToRgba(settings.secondaryColor, 0.55));
      axisGrad.addColorStop(1, 'rgba(255,255,255,0)');
      vCtx.fillStyle = axisGrad;
      vCtx.fillRect(linPadX, visCenterY - 1, spanW, 2);
      vCtx.restore();
    } else if (mode === 'led-matrix') {
      // Segmented LED Spectrum: batched by tier/color for crisp hardware meter bricks with minimal draw calls
      const cols = Math.max(20, Math.min(56, Math.round(settings.barCount * 0.48)));
      const totalW = linW;
      const colStep = totalW / cols;
      const cellW = Math.max(4, colStep * 0.72);
      const baseLineY = visCenterY + (isPortrait ? height * 0.075 : height * 0.115) * visScale;
      const maxMeterH =
        (isPortrait ? height * 0.22 : height * 0.32) * visScale * (1 + beatBoost * 0.14);
      const rows = isPortrait ? 14 : 16;
      const rowStep = maxMeterH / rows;
      const cellH = Math.max(3, rowStep * 0.64);
      const cellRadius = Math.max(1.5, Math.min(4, cellH * 0.28));

      vCtx.save();
      vCtx.fillStyle = hexToRgba(settings.primaryColor, 0.38);
      vCtx.fillRect(linPadX, baseLineY, totalW, Math.max(2, minDim * 0.0028));

      const litCols = new Uint8Array(cols);
      const peakCols = new Uint8Array(cols);
      const colX = new Float32Array(cols);
      for (let c = 0; c < cols; c++) {
        const val = getPerceptualBarValue(frequencyData, c, cols, settings.sensitivity);
        const litRows = Math.max(1, Math.min(rows, Math.round(Math.pow(val, 1.05) * rows)));
        const peakRow =
          val > 0.06
            ? Math.min(rows - 1, Math.max(litRows, Math.round(Math.min(1, val * 1.12 + 0.08) * rows)))
            : 255;
        litCols[c] = litRows;
        peakCols[c] = peakRow;
        colX[c] = linPadX + c * colStep + (colStep - cellW) * 0.5;
      }

      // 1. Batch all unlit sockets in a single fill
      vCtx.fillStyle = 'rgba(255, 255, 255, 0.045)';
      vCtx.beginPath();
      for (let c = 0; c < cols; c++) {
        const x = colX[c];
        const litRows = litCols[c];
        const peakRow = peakCols[c];
        for (let r = litRows; r < rows; r++) {
          if (r === peakRow) continue;
          const y = baseLineY - (r + 1) * rowStep + (rowStep - cellH) * 0.5;
          vCtx.roundRect(x, y, cellW, cellH, cellRadius);
        }
      }
      vCtx.fill();

      // 2. Batch all peak-hold bricks in a single fill
      vCtx.fillStyle = hexToRgba('#ffffff', 0.88);
      vCtx.beginPath();
      for (let c = 0; c < cols; c++) {
        const peakRow = peakCols[c];
        if (peakRow >= rows || peakRow < litCols[c]) continue;
        const y = baseLineY - (peakRow + 1) * rowStep + (rowStep - cellH) * 0.5;
        vCtx.roundRect(colX[c], y, cellW, cellH, cellRadius);
      }
      vCtx.fill();

      // 3. Batch lit rows by row tier (each row shares exact same color & alpha across all columns)
      for (let r = 0; r < rows; r++) {
        const heightRatio = r / Math.max(1, rows - 1);
        const tierColor = heightRatio > 0.62 ? settings.secondaryColor : settings.primaryColor;
        const y = baseLineY - (r + 1) * rowStep + (rowStep - cellH) * 0.5;
        vCtx.fillStyle = hexToRgba(tierColor, 0.72 + heightRatio * 0.28);
        vCtx.beginPath();
        let anyLit = false;
        for (let c = 0; c < cols; c++) {
          if (r < litCols[c]) {
            vCtx.roundRect(colX[c], y, cellW, cellH, cellRadius);
            anyLit = true;
          }
        }
        if (anyLit) vCtx.fill();
      }

      // 4. Batch console reflection rows (4 rows total)
      for (let rr = 0; rr < 4; rr++) {
        const ry = baseLineY + 5 + rr * rowStep;
        const rAlpha = (1 - rr / 4) * 0.22;
        vCtx.fillStyle = hexToRgba(settings.primaryColor, rAlpha);
        vCtx.beginPath();
        let anyRefl = false;
        for (let c = 0; c < cols; c++) {
          if (rr < litCols[c]) {
            vCtx.roundRect(colX[c], ry, cellW, cellH, cellRadius);
            anyRefl = true;
          }
        }
        if (anyRefl) vCtx.fill();
      }
      vCtx.restore();
    } else if (mode === 'stereo-prism') {
      // Perspective Spectrum Horizon: retro-futurist horizon core + mirrored geometric prism blades
      const spanW = linW;
      const bladeCount = Math.max(24, Math.min(72, Math.round(settings.barCount * 0.65)));
      const halfBlades = Math.floor(bladeCount / 2);
      const step = spanW / bladeCount;
      const maxSpikeH =
        (isPortrait ? height * 0.16 : height * 0.24) * visScale * (1 + beatBoost * 0.2);

      vCtx.save();
      const floorDepth = (isPortrait ? height * 0.14 : height * 0.2) * visScale;
      const rayCount = 11;
      vCtx.strokeStyle = hexToRgba(settings.secondaryColor, 0.18 + bass * 0.16);
      vCtx.lineWidth = Math.max(1, minDim * 0.0018);
      vCtx.beginPath();
      for (let r = 0; r < rayCount; r++) {
        const t = r / (rayCount - 1) - 0.5;
        const topX = width * 0.5 + t * (spanW * 0.34);
        const botX = width * 0.5 + t * (spanW * 1.25);
        vCtx.moveTo(topX, visCenterY);
        vCtx.lineTo(botX, visCenterY + floorDepth);
      }
      const floorPadX = Math.max(0, linPadX * 0.7);
      for (let hLine = 1; hLine <= 4; hLine++) {
        const p = Math.pow(hLine / 4, 1.55);
        const ly = visCenterY + p * floorDepth;
        vCtx.moveTo(floorPadX, ly);
        vCtx.lineTo(width - floorPadX, ly);
      }
      vCtx.stroke();

      // Luminous center prism halo
      const coreR = minDim * (0.065 + bass * 0.025 + beatBoost * 0.02) * visScale;
      const coreGrad = vCtx.createRadialGradient(
        width * 0.5,
        visCenterY,
        0,
        width * 0.5,
        visCenterY,
        coreR * 2.2
      );
      coreGrad.addColorStop(0, hexToRgba(settings.primaryColor, 0.34));
      coreGrad.addColorStop(0.55, hexToRgba(settings.secondaryColor, 0.12));
      coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = coreGrad;
      vCtx.beginPath();
      vCtx.arc(width * 0.5, visCenterY, coreR * 2.2, 0, Math.PI * 2);
      vCtx.fill();

      // Batched symmetrical diamond/prism blades using a single vertical gradient & 2 shadow groups
      const bladeHalfW = Math.max(2, step * 0.42);
      const bladeGrad = vCtx.createLinearGradient(
        0,
        visCenterY - maxSpikeH,
        0,
        visCenterY + maxSpikeH * 0.72
      );
      bladeGrad.addColorStop(0, settings.secondaryColor);
      bladeGrad.addColorStop(0.58, settings.primaryColor);
      bladeGrad.addColorStop(1, settings.secondaryColor);
      vCtx.fillStyle = bladeGrad;

      const bladeGlow = minDim * (0.015 + beatBoost * 0.012);
      for (const isInnerGroup of [false, true]) {
        vCtx.beginPath();
        let anyInGroup = false;
        for (let i = 0; i < bladeCount; i++) {
          const distFromCenter = Math.abs(i - (bladeCount - 1) / 2) / Math.max(1, halfBlades);
          if ((distFromCenter < 0.35) !== isInnerGroup) continue;
          const val = getPerceptualBarValue(
            frequencyData,
            Math.floor(distFromCenter * (bladeCount * 0.65)),
            bladeCount,
            settings.sensitivity
          );
          const bladeH = Math.max(minDim * 0.014, Math.pow(val, 1.12) * maxSpikeH);
          const cx = linPadX + i * step + step * 0.5;
          vCtx.moveTo(cx, visCenterY - bladeH);
          vCtx.lineTo(cx + bladeHalfW, visCenterY);
          vCtx.lineTo(cx, visCenterY + bladeH * 0.72);
          vCtx.lineTo(cx - bladeHalfW, visCenterY);
          vCtx.closePath();
          anyInGroup = true;
        }
        if (anyInGroup) {
          applyShadow(
            isInnerGroup ? settings.primaryColor : settings.secondaryColor,
            bladeGlow
          );
          vCtx.fill();
        }
      }

      // Crisp horizon beam
      const beamGrad = vCtx.createLinearGradient(linPadX, 0, width - linPadX, 0);
      beamGrad.addColorStop(0, 'rgba(255,255,255,0)');
      beamGrad.addColorStop(0.5, '#ffffff');
      beamGrad.addColorStop(1, 'rgba(255,255,255,0)');
      applyShadow(settings.primaryColor, minDim * 0.02);
      vCtx.fillStyle = beamGrad;
      vCtx.fillRect(linPadX, visCenterY - 1.2, spanW, 2.4);
      vCtx.restore();
    } else if (mode === 'harmonic-orb') {
      // Harmonic Orbital Mandala: concentric closed audio-spline rings, rotating polygon lattice & orbiting nodes
      const cx = circularCx;
      const cy = circularCy;
      const baseRadius = circularBaseRadius;
      const outerReach =
        minDim * (isPortrait ? 0.14 : 0.155) * visScale * (1 + beatBoost * 0.16);

      // Ambient orbital aura
      vCtx.save();
      const aura = vCtx.createRadialGradient(cx, cy, baseRadius * 0.7, cx, cy, baseRadius + outerReach);
      aura.addColorStop(0, hexToRgba(settings.primaryColor, 0.18 + bass * 0.16));
      aura.addColorStop(0.55, hexToRgba(settings.secondaryColor, 0.08 + mid * 0.08));
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = aura;
      vCtx.beginPath();
      vCtx.arc(cx, cy, baseRadius + outerReach, 0, Math.PI * 2);
      vCtx.fill();
      vCtx.restore();

      // Rotating polygonal geometric halos outside center art
      const drawPolyRing = (
        sides: number,
        radius: number,
        rot: number,
        color: string,
        lineW: number,
        alpha: number
      ) => {
        vCtx.save();
        vCtx.beginPath();
        for (let i = 0; i <= sides; i++) {
          const a = (i / sides) * Math.PI * 2 + rot;
          const x = cx + Math.cos(a) * radius;
          const y = cy + Math.sin(a) * radius;
          if (i === 0) vCtx.moveTo(x, y);
          else vCtx.lineTo(x, y);
        }
        vCtx.closePath();
        vCtx.strokeStyle = hexToRgba(color, alpha);
        vCtx.lineWidth = lineW;
        applyShadow(color, minDim * 0.016);
        vCtx.stroke();
        vCtx.restore();
      };

      drawPolyRing(
        8,
        baseRadius * (1.06 + bass * 0.1),
        currentTime * 0.35,
        settings.primaryColor,
        Math.max(1.8, minDim * 0.0032),
        0.72
      );
      drawPolyRing(
        6,
        baseRadius * (1.14 + mid * 0.12),
        -currentTime * 0.28,
        settings.secondaryColor,
        Math.max(1.6, minDim * 0.0028),
        0.58
      );

      // Smooth closed harmonic wave petals (dual phase)
      const drawOrbitalSpline = (
        color: string,
        radiusOffset: number,
        ampScale: number,
        rotOffset: number,
        lineW: number,
        fillAlpha: number
      ) => {
        const segments = 96;
        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < segments; i++) {
          const sym = i < segments / 2 ? i : segments - i;
          const spec = getPerceptualBarValue(
            frequencyData,
            Math.floor((sym / (segments / 2)) * 42),
            48,
            settings.sensitivity
          );
          const tdIdx = Math.floor((i / segments) * (timeDomainData.length * 0.5));
          const wave = ((timeDomainData[tdIdx] ?? 128) - 128) / 128;
          const harmonic = Math.sin((i / segments) * Math.PI * 6 + currentTime * 2.2) * (0.06 + treble * 0.12);
          const r =
            baseRadius +
            radiusOffset +
            (Math.pow(spec, 1.1) * 0.78 + Math.abs(wave) * 0.25 + harmonic) * outerReach * ampScale;
          const angle = (i / segments) * Math.PI * 2 - Math.PI * 0.5 + rotOffset;
          pts.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
          });
        }

        vCtx.save();
        vCtx.beginPath();
        const last = pts[pts.length - 1];
        const first = pts[0];
        vCtx.moveTo((last.x + first.x) * 0.5, (last.y + first.y) * 0.5);
        for (let i = 0; i < pts.length; i++) {
          const curr = pts[i];
          const next = pts[(i + 1) % pts.length];
          vCtx.quadraticCurveTo(curr.x, curr.y, (curr.x + next.x) * 0.5, (curr.y + next.y) * 0.5);
        }
        vCtx.closePath();

        if (fillAlpha > 0) {
          vCtx.fillStyle = hexToRgba(color, fillAlpha);
          vCtx.fill();
        }
        vCtx.strokeStyle = hexToRgba(color, 0.92);
        vCtx.lineWidth = lineW;
        applyShadow(color, minDim * (0.02 + beatBoost * 0.015));
        vCtx.stroke();
        vCtx.restore();
      };

      drawOrbitalSpline(
        settings.secondaryColor,
        minDim * 0.016,
        0.92,
        -currentTime * 0.15,
        Math.max(2.2, minDim * 0.0042),
        0.09
      );
      drawOrbitalSpline(
        settings.primaryColor,
        minDim * 0.004,
        1.05,
        currentTime * 0.12,
        Math.max(2.8, minDim * 0.0054),
        0.13
      );

      // Orbiting frequency beads along outer halo (batched into 2 paths)
      const nodeCount = Math.max(12, Math.min(36, Math.round(settings.barCount * 0.3)));
      vCtx.save();
      for (const parity of [0, 1]) {
        const nodeColor = parity === 0 ? settings.primaryColor : settings.secondaryColor;
        vCtx.beginPath();
        for (let n = parity; n < nodeCount; n += 2) {
          const sym = n < nodeCount / 2 ? n : nodeCount - 1 - n;
          const val = getPerceptualBarValue(frequencyData, sym, Math.max(8, nodeCount / 2), settings.sensitivity);
          const angle = (n / nodeCount) * Math.PI * 2 + currentTime * 0.42;
          const dist = baseRadius + outerReach * (0.48 + val * 0.68);
          const nx = cx + Math.cos(angle) * dist;
          const ny = cy + Math.sin(angle) * dist;
          const nodeR = Math.max(2, minDim * (0.0032 + val * 0.0055));
          vCtx.moveTo(nx + nodeR, ny);
          vCtx.arc(nx, ny, nodeR, 0, Math.PI * 2);
        }
        vCtx.fillStyle = hexToRgba(nodeColor, 0.85);
        applyShadow(nodeColor, minDim * 0.014);
        vCtx.fill();
      }
      vCtx.restore();

      // Inner rim stroke
      vCtx.save();
      vCtx.beginPath();
      vCtx.arc(cx, cy, circularArtRadius, 0, Math.PI * 2);
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.78);
      vCtx.lineWidth = Math.max(2, minDim * 0.0038);
      applyShadow(settings.primaryColor, minDim * 0.015);
      vCtx.stroke();
      vCtx.restore();
    } else if (mode === 'cube-3d') {
      // 3D Cube Mesh: perspective-projected rotating cube with 6 frequency-reactive faces
      const cx = width * 0.5;
      const cy = visCenterY;
      const baseHalf =
        minDim * (isPortrait ? 0.145 : 0.165) * visScale * (1 + beatBoost * 0.1);
      const focalLen = minDim * 1.45;
      const camDist = baseHalf * 5.2;

      const rotX = albumRotationRef?.cubeX ?? 0.48 + currentTime * 0.44 * cubeSpeedMult;
      const rotY = albumRotationRef?.cubeY ?? 0.68 + currentTime * 0.72 * cubeSpeedMult;
      const rotZ = albumRotationRef?.cubeZ ?? 0.18 + currentTime * 0.24 * cubeSpeedMult;

      const cosX = Math.cos(rotX);
      const sinX = Math.sin(rotX);
      const cosY = Math.cos(rotY);
      const sinY = Math.sin(rotY);
      const cosZ = Math.cos(rotZ);
      const sinZ = Math.sin(rotZ);

      type Vec3 = [number, number, number];
      const rotatePoint = (vx: number, vy: number, vz: number): Vec3 => {
        // Rotate X
        const y1 = vy * cosX - vz * sinX;
        const z1 = vy * sinX + vz * cosX;
        // Rotate Y
        const x2 = vx * cosY + z1 * sinY;
        const z2 = -vx * sinY + z1 * cosY;
        // Rotate Z
        const x3 = x2 * cosZ - y1 * sinZ;
        const y3 = x2 * sinZ + y1 * cosZ;
        return [x3, y3, z2];
      };

      const projectPoint = (p: Vec3) => {
        const depth = Math.max(baseHalf * 1.2, camDist - p[2]);
        const scale = focalLen / depth;
        return {
          x: cx + p[0] * scale,
          y: cy + p[1] * scale,
          z: p[2],
        };
      };

      // Ambient radial glow behind the 3D cube
      vCtx.save();
      const cubeGlow = vCtx.createRadialGradient(cx, cy, baseHalf * 0.25, cx, cy, baseHalf * 2.4);
      cubeGlow.addColorStop(0, hexToRgba(settings.primaryColor, 0.2 + bass * 0.22 + beatBoost * 0.12));
      cubeGlow.addColorStop(0.55, hexToRgba(settings.secondaryColor, 0.08 + mid * 0.08));
      cubeGlow.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = cubeGlow;
      vCtx.beginPath();
      vCtx.arc(cx, cy, baseHalf * 2.4, 0, Math.PI * 2);
      vCtx.fill();
      vCtx.restore();

      // Inner frequency-pulsing wireframe core cube for structural depth
      const coreHalf = baseHalf * (0.46 + bass * 0.2 + beatBoost * 0.12);
      const coreProj = [
        [-1, -1, -1],
        [1, -1, -1],
        [1, 1, -1],
        [-1, 1, -1],
        [-1, -1, 1],
        [1, -1, 1],
        [1, 1, 1],
        [-1, 1, 1],
      ].map(([x, y, z]) => projectPoint(rotatePoint(x * coreHalf, y * coreHalf, z * coreHalf)));
      const coreEdges: Array<[number, number]> = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
      ];

      vCtx.save();
      vCtx.strokeStyle = hexToRgba(settings.secondaryColor, 0.45 + treble * 0.35);
      vCtx.lineWidth = Math.max(1.2, minDim * 0.0024);
      applyShadow(settings.secondaryColor, minDim * 0.014);
      vCtx.beginPath();
      for (const [a, b] of coreEdges) {
        vCtx.moveTo(coreProj[a].x, coreProj[a].y);
        vCtx.lineTo(coreProj[b].x, coreProj[b].y);
      }
      vCtx.stroke();
      vCtx.restore();

      // 6 faces mapped to 6 distinct frequency bands (sub-bass -> high treble)
      const faceSpecs: Array<{
        normal: Vec3;
        uAxis: Vec3;
        vAxis: Vec3;
        bandIndex: number;
      }> = [
        { normal: [0, 0, 1], uAxis: [1, 0, 0], vAxis: [0, 1, 0], bandIndex: 0 },   // Front (+Z) -> Sub-Bass
        { normal: [0, -1, 0], uAxis: [1, 0, 0], vAxis: [0, 0, 1], bandIndex: 1 },  // Top (-Y) -> Bass Punch
        { normal: [1, 0, 0], uAxis: [0, 0, -1], vAxis: [0, 1, 0], bandIndex: 2 },  // Right (+X) -> Low-Mid
        { normal: [-1, 0, 0], uAxis: [0, 0, 1], vAxis: [0, 1, 0], bandIndex: 3 },  // Left (-X) -> High-Mid
        { normal: [0, 1, 0], uAxis: [1, 0, 0], vAxis: [0, 0, -1], bandIndex: 4 },  // Bottom (+Y) -> Presence
        { normal: [0, 0, -1], uAxis: [-1, 0, 0], vAxis: [0, 1, 0], bandIndex: 5 }, // Back (-Z) -> Brilliance
      ];

      const subdiv = settings.barCount >= 96 ? 3 : settings.barCount >= 64 ? 2 : 1;

      const projectedFaces = faceSpecs.map((spec) => {
        const bandVal = getPerceptualBarValue(
          frequencyData,
          spec.bandIndex,
          6,
          settings.sensitivity
        );
        // Each face's physical size (width & height) and outward displacement scale with its band
        const faceHalf = baseHalf * (0.72 + Math.pow(bandVal, 0.95) * 0.56);
        const faceOffset = baseHalf * (0.98 + Math.pow(bandVal, 1.05) * 0.36);

        const buildCorner = (su: number, sv: number, scaleFactor = 1) => {
          const lx =
            spec.normal[0] * faceOffset +
            (spec.uAxis[0] * su + spec.vAxis[0] * sv) * faceHalf * scaleFactor;
          const ly =
            spec.normal[1] * faceOffset +
            (spec.uAxis[1] * su + spec.vAxis[1] * sv) * faceHalf * scaleFactor;
          const lz =
            spec.normal[2] * faceOffset +
            (spec.uAxis[2] * su + spec.vAxis[2] * sv) * faceHalf * scaleFactor;
          return projectPoint(rotatePoint(lx, ly, lz));
        };

        const corners = [
          buildCorner(-1, -1),
          buildCorner(1, -1),
          buildCorner(1, 1),
          buildCorner(-1, 1),
        ];

        const innerFactor = 0.42 + bandVal * 0.28;
        const innerCorners = [
          buildCorner(-1, -1, innerFactor),
          buildCorner(1, -1, innerFactor),
          buildCorner(1, 1, innerFactor),
          buildCorner(-1, 1, innerFactor),
        ];

        const gridLines: Array<[ReturnType<typeof buildCorner>, ReturnType<typeof buildCorner>]> = [];
        if (subdiv > 1) {
          for (let g = 1; g < subdiv; g++) {
            const t = -1 + (2 * g) / subdiv;
            gridLines.push([buildCorner(t, -1), buildCorner(t, 1)]);
            gridLines.push([buildCorner(-1, t), buildCorner(1, t)]);
          }
        }

        const rotNormal = rotatePoint(spec.normal[0], spec.normal[1], spec.normal[2]);
        const avgZ = (corners[0].z + corners[1].z + corners[2].z + corners[3].z) * 0.25;
        // Key-light shading dot product for 3D surface readability
        const lightDot = Math.max(
          0,
          rotNormal[0] * 0.35 + rotNormal[1] * -0.58 + rotNormal[2] * 0.73
        );
        const isFrontFacing = rotNormal[2] > -0.15;

        return {
          spec,
          bandVal,
          corners,
          innerCorners,
          gridLines,
          avgZ,
          lightDot,
          isFrontFacing,
        };
      });

      // Painter's algorithm: sort back-to-front by view-space Z depth
      projectedFaces.sort((a, b) => a.avgZ - b.avgZ);

      for (const face of projectedFaces) {
        const { corners, innerCorners, gridLines, bandVal, lightDot, isFrontFacing, spec } = face;
        const usePrimary = spec.bandIndex % 2 === 0;
        const faceColor = usePrimary ? settings.primaryColor : settings.secondaryColor;
        const accentColor = usePrimary ? settings.secondaryColor : settings.primaryColor;

        const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
        const maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
        const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
        const maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);

        vCtx.save();
        vCtx.beginPath();
        vCtx.moveTo(corners[0].x, corners[0].y);
        vCtx.lineTo(corners[1].x, corners[1].y);
        vCtx.lineTo(corners[2].x, corners[2].y);
        vCtx.lineTo(corners[3].x, corners[3].y);
        vCtx.closePath();

        const baseAlpha = (isFrontFacing ? 0.16 : 0.06) + bandVal * 0.24 + lightDot * 0.12;
        const faceGrad = vCtx.createLinearGradient(minX, minY, maxX, maxY);
        faceGrad.addColorStop(0, hexToRgba(faceColor, Math.min(0.65, baseAlpha * 1.15)));
        faceGrad.addColorStop(1, hexToRgba(accentColor, Math.min(0.5, baseAlpha * 0.65)));
        vCtx.fillStyle = faceGrad;
        vCtx.fill();

        // Optional mesh subdivision wireframe inside face when barCount is higher
        if (gridLines.length > 0) {
          vCtx.strokeStyle = hexToRgba(faceColor, isFrontFacing ? 0.26 + bandVal * 0.25 : 0.1);
          vCtx.lineWidth = Math.max(0.8, minDim * 0.0014);
          vCtx.beginPath();
          for (const [p1, p2] of gridLines) {
            vCtx.moveTo(p1.x, p1.y);
            vCtx.lineTo(p2.x, p2.y);
          }
          vCtx.stroke();
        }

        // Inner reactive frequency quad outline
        vCtx.beginPath();
        vCtx.moveTo(innerCorners[0].x, innerCorners[0].y);
        vCtx.lineTo(innerCorners[1].x, innerCorners[1].y);
        vCtx.lineTo(innerCorners[2].x, innerCorners[2].y);
        vCtx.lineTo(innerCorners[3].x, innerCorners[3].y);
        vCtx.closePath();
        vCtx.strokeStyle = hexToRgba(accentColor, (isFrontFacing ? 0.48 : 0.18) + bandVal * 0.35);
        vCtx.lineWidth = Math.max(1.2, minDim * 0.0022);
        vCtx.stroke();

        // Crisp neon outer edge stroke
        vCtx.beginPath();
        vCtx.moveTo(corners[0].x, corners[0].y);
        vCtx.lineTo(corners[1].x, corners[1].y);
        vCtx.lineTo(corners[2].x, corners[2].y);
        vCtx.lineTo(corners[3].x, corners[3].y);
        vCtx.closePath();
        vCtx.strokeStyle = hexToRgba(
          faceColor,
          (isFrontFacing ? 0.72 : 0.28) + bandVal * 0.28
        );
        vCtx.lineWidth = Math.max(
          1.8,
          minDim * (isFrontFacing ? 0.0038 + bandVal * 0.0026 : 0.002)
        );
        vCtx.lineJoin = 'round';
        applyShadow(faceColor, minDim * (isFrontFacing ? 0.018 + beatBoost * 0.015 : 0.006));
        vCtx.stroke();

        // Luminous vertex nodes on front-facing panels
        if (isFrontFacing) {
          const nodeR = Math.max(2, minDim * (0.0034 + bandVal * 0.0032));
          vCtx.fillStyle = '#ffffff';
          for (const c of corners) {
            vCtx.beginPath();
            vCtx.arc(c.x, c.y, nodeR, 0, Math.PI * 2);
            vCtx.fill();
          }
        }
        vCtx.restore();
      }
    } else if (mode === 'galaxy-spiral') {
      // Galaxy Vortex Spiral: logarithmic spiral arms with frequency-reactive starfield nodes & core aura
      const cx = width * 0.5;
      const cy = visCenterY;
      const maxR =
        minDim * (isPortrait ? 0.37 : 0.42) * visScale * (1 + beatBoost * 0.12);
      const innerCoreR = maxR * (0.1 + bass * 0.05 + beatBoost * 0.04);
      const armCount = settings.barCount >= 112 ? 4 : 3;
      const nodesPerArm = Math.max(
        18,
        Math.min(44, Math.round(settings.barCount * 0.36))
      );
      const spin =
        currentTime * (0.45 + beatBoost * 0.7) + (albumRotationRef?.angle ?? 0) * 0.5;

      // Ambient galactic core glow
      vCtx.save();
      const galGlow = vCtx.createRadialGradient(
        cx,
        cy,
        innerCoreR * 0.25,
        cx,
        cy,
        maxR * 1.15
      );
      galGlow.addColorStop(
        0,
        hexToRgba(settings.primaryColor, 0.34 + bass * 0.22 + beatBoost * 0.14)
      );
      galGlow.addColorStop(
        0.42,
        hexToRgba(settings.secondaryColor, 0.14 + mid * 0.1)
      );
      galGlow.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = galGlow;
      vCtx.beginPath();
      vCtx.arc(cx, cy, maxR * 1.15, 0, Math.PI * 2);
      vCtx.fill();
      vCtx.restore();

      for (let arm = 0; arm < armCount; arm++) {
        const armBaseAngle = (arm / armCount) * Math.PI * 2 + spin;
        const pts: Array<{ x: number; y: number; val: number; t: number }> = [];

        for (let i = 0; i < nodesPerArm; i++) {
          const t = i / (nodesPerArm - 1);
          const val = getPerceptualBarValue(
            frequencyData,
            i,
            nodesPerArm,
            settings.sensitivity
          );
          const waveOffset =
            Math.sin(t * Math.PI * 3.5 - currentTime * 3.2 + arm) *
            val *
            minDim *
            0.015;
          const angle = armBaseAngle + t * Math.PI * 2.35 + val * 0.24;
          const radius = innerCoreR + t * (maxR - innerCoreR) * (0.86 + val * 0.22);
          const perpAngle = angle + Math.PI * 0.5;

          pts.push({
            x: cx + Math.cos(angle) * radius + Math.cos(perpAngle) * waveOffset,
            y: cy + Math.sin(angle) * radius + Math.sin(perpAngle) * waveOffset,
            val,
            t,
          });
        }

        // Luminous spiral filament curve
        vCtx.save();
        const first = pts[0];
        const last = pts[pts.length - 1];
        const armGrad = vCtx.createLinearGradient(first.x, first.y, last.x, last.y);
        armGrad.addColorStop(0, hexToRgba(settings.primaryColor, 0.85));
        armGrad.addColorStop(0.55, hexToRgba(settings.secondaryColor, 0.75));
        armGrad.addColorStop(1, hexToRgba(settings.secondaryColor, 0.08));

        vCtx.beginPath();
        vCtx.moveTo(first.x, first.y);
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) * 0.5;
          const midY = (pts[i].y + pts[i + 1].y) * 0.5;
          vCtx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
        }
        vCtx.lineTo(last.x, last.y);
        vCtx.strokeStyle = armGrad;
        vCtx.lineWidth = Math.max(1.6, minDim * (0.003 + bass * 0.002));
        vCtx.lineCap = 'round';
        applyShadow(settings.primaryColor, minDim * 0.014);
        vCtx.stroke();
        vCtx.restore();

        // Frequency-scaled glowing star nodes along each arm (batched by color & alpha tier)
        vCtx.save();
        const starAlphas = [0.55, 0.78, 0.98];
        const starBuckets: Array<Array<{ x: number; y: number; r: number }>> = [
          [], [], [], [], [], [],
        ];
        const whiteCores: Array<{ x: number; y: number; r: number }> = [];
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const nodeR = Math.max(
            1.6,
            minDim * (0.0022 + Math.pow(p.val, 1.35) * 0.0075) * (1 - p.t * 0.25)
          );
          const colorIdx = p.t < 0.45 ? 0 : 1;
          const tier = p.val > 0.66 ? 2 : p.val > 0.33 ? 1 : 0;
          starBuckets[colorIdx * 3 + tier].push({ x: p.x, y: p.y, r: nodeR });
          if (p.val > 0.58) {
            whiteCores.push({ x: p.x, y: p.y, r: nodeR * 0.42 });
          }
        }
        const starGlowBlur = minDim * 0.012;
        for (let cIdx = 0; cIdx < 2; cIdx++) {
          const nodeColor = cIdx === 0 ? settings.primaryColor : settings.secondaryColor;
          applyShadow(nodeColor, starGlowBlur);
          for (let tier = 0; tier < 3; tier++) {
            const list = starBuckets[cIdx * 3 + tier];
            if (list.length === 0) continue;
            vCtx.fillStyle = hexToRgba(nodeColor, starAlphas[tier]);
            vCtx.beginPath();
            for (let k = 0; k < list.length; k++) {
              const s = list[k];
              vCtx.moveTo(s.x + s.r, s.y);
              vCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            }
            vCtx.fill();
          }
        }
        if (whiteCores.length > 0) {
          vCtx.shadowBlur = 0;
          vCtx.fillStyle = 'rgba(255,255,255,0.88)';
          vCtx.beginPath();
          for (let k = 0; k < whiteCores.length; k++) {
            const wc = whiteCores[k];
            vCtx.moveTo(wc.x + wc.r, wc.y);
            vCtx.arc(wc.x, wc.y, wc.r, 0, Math.PI * 2);
          }
          vCtx.fill();
        }
        vCtx.restore();
      }

      // Inner orbital core ring & star center
      vCtx.save();
      vCtx.beginPath();
      vCtx.arc(cx, cy, innerCoreR, 0, Math.PI * 2);
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.72 + treble * 0.25);
      vCtx.lineWidth = Math.max(1.8, minDim * 0.0034);
      applyShadow(settings.primaryColor, minDim * 0.016);
      vCtx.stroke();

      vCtx.beginPath();
      vCtx.arc(cx, cy, innerCoreR * 0.28, 0, Math.PI * 2);
      vCtx.fillStyle = '#ffffff';
      vCtx.fill();
      vCtx.restore();
    } else if (mode === 'cyber-tunnel') {
      // 3D Warp Tunnel: infinite rushing perspective rings + radial laser rails
      const cx = width * 0.5;
      const cy = visCenterY;
      const outerR = Math.max(width, height) * 0.62 * (0.68 + visScale * 0.34);
      const ringCount = 14;
      const sides = Math.max(8, Math.min(20, Math.round(settings.barCount * 0.16)));
      const travelSpeed = 0.68 + bass * 0.55 + beatBoost * 0.95;
      const travelOffset = (currentTime * travelSpeed) % 1;

      // Vanishing point core flare
      vCtx.save();
      const coreFlare = vCtx.createRadialGradient(
        cx,
        cy,
        0,
        cx,
        cy,
        minDim * (0.2 + bass * 0.08 + beatBoost * 0.06)
      );
      coreFlare.addColorStop(0, hexToRgba('#ffffff', 0.42 + beatBoost * 0.25));
      coreFlare.addColorStop(0.28, hexToRgba(settings.primaryColor, 0.28 + bass * 0.18));
      coreFlare.addColorStop(0.68, hexToRgba(settings.secondaryColor, 0.1));
      coreFlare.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = coreFlare;
      vCtx.beginPath();
      vCtx.arc(cx, cy, minDim * 0.28, 0, Math.PI * 2);
      vCtx.fill();
      vCtx.restore();

      // Radial perspective laser rails
      vCtx.save();
      const railRot = Math.sin(currentTime * 0.32) * 0.18;
      vCtx.lineWidth = Math.max(1, minDim * 0.002);
      for (let s = 0; s < sides; s++) {
        const angle = (s / sides) * Math.PI * 2 + railRot;
        const bandVal = getPerceptualBarValue(
          frequencyData,
          s % Math.max(1, Math.floor(sides / 2)),
          Math.max(4, Math.floor(sides / 2)),
          settings.sensitivity
        );
        const railGrad = vCtx.createLinearGradient(
          cx,
          cy,
          cx + Math.cos(angle) * outerR,
          cy + Math.sin(angle) * outerR
        );
        railGrad.addColorStop(0, hexToRgba(settings.secondaryColor, 0.04));
        railGrad.addColorStop(
          0.6,
          hexToRgba(
            s % 2 === 0 ? settings.primaryColor : settings.secondaryColor,
            0.16 + bandVal * 0.24
          )
        );
        railGrad.addColorStop(1, hexToRgba(settings.primaryColor, 0.35 + bandVal * 0.3));
        vCtx.strokeStyle = railGrad;
        vCtx.beginPath();
        vCtx.moveTo(cx + Math.cos(angle) * (minDim * 0.018), cy + Math.sin(angle) * (minDim * 0.018));
        vCtx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
        vCtx.stroke();
      }
      vCtx.restore();

      // Perspective rings rushing toward viewer (far-to-near)
      for (let rIdx = 0; rIdx < ringCount; rIdx++) {
        const depthPhase = (rIdx + travelOffset) / ringCount;
        const p = Math.pow(depthPhase, 2.2);
        const bandIdx = Math.max(
          0,
          Math.min(ringCount - 1, Math.round((1 - depthPhase) * (ringCount - 1)))
        );
        const bandVal = getPerceptualBarValue(
          frequencyData,
          bandIdx,
          ringCount,
          settings.sensitivity
        );
        const ringBaseR =
          minDim * 0.02 + p * outerR * (0.94 + bandVal * 0.18 + beatBoost * 0.08);
        const ringRot = railRot + Math.sin(currentTime * 0.55 - depthPhase * 2.2) * 0.12;

        const alpha =
          depthPhase < 0.12
            ? (depthPhase / 0.12) * 0.6
            : depthPhase > 0.9
            ? ((1 - depthPhase) / 0.1) * 0.92
            : 0.42 + depthPhase * 0.5;
        const ringColor =
          rIdx % 2 === 0 ? settings.primaryColor : settings.secondaryColor;

        vCtx.save();
        vCtx.beginPath();
        for (let v = 0; v <= sides; v++) {
          const vertIdx = v % sides;
          const symVert = vertIdx < sides / 2 ? vertIdx : sides - vertIdx;
          const vertSpec = getPerceptualBarValue(
            frequencyData,
            symVert,
            Math.max(4, Math.floor(sides / 2) + 1),
            settings.sensitivity
          );
          const rMod = ringBaseR * (1 + vertSpec * 0.14 * (0.35 + depthPhase * 0.65));
          const a = (vertIdx / sides) * Math.PI * 2 + ringRot;
          const vx = cx + Math.cos(a) * rMod;
          const vy = cy + Math.sin(a) * rMod;
          if (v === 0) vCtx.moveTo(vx, vy);
          else vCtx.lineTo(vx, vy);
        }
        vCtx.closePath();

        vCtx.strokeStyle = hexToRgba(ringColor, Math.min(0.95, alpha));
        vCtx.lineWidth = Math.max(1.2, minDim * (0.0018 + depthPhase * 0.0042 + bandVal * 0.002));
        applyShadow(ringColor, minDim * (0.008 + depthPhase * 0.016));
        vCtx.stroke();
        vCtx.restore();
      }
    } else if (mode === 'seismic-ridges') {
      // Seismic Ridge Stack: stacked 3D topographic spectrum ridges with occluded silhouette fills
      const stackW = linW;
      const stackH = (isPortrait ? height * 0.42 : height * 0.5) * visScale;
      const topY = visCenterY - stackH * 0.46;
      const ridgeCount = 14;
      const sampleCount = Math.max(36, Math.min(88, Math.round(settings.barCount * 0.85)));
      const maxPeakH =
        minDim * (isPortrait ? 0.115 : 0.145) * visScale * (1 + beatBoost * 0.18);

      for (let row = 0; row < ridgeCount; row++) {
        const rowFrac = row / (ridgeCount - 1); // 0 = farthest back, 1 = closest front
        const rowW = stackW * (0.74 + rowFrac * 0.26);
        const rowStartX = (width - rowW) * 0.5;
        const baseY = topY + rowFrac * stackH;
        const phaseOffset = row * 0.55 - currentTime * 2.1;

        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < sampleCount; i++) {
          const xFrac = i / (sampleCount - 1);
          // Symmetrical spectrum lookup centered around middle of ridge
          const symDist = Math.abs(xFrac - 0.5) * 2;
          const binIdx = Math.floor(symDist * (sampleCount * 0.55));
          const val = getPerceptualBarValue(
            frequencyData,
            binIdx,
            Math.max(12, Math.floor(sampleCount * 0.6)),
            settings.sensitivity
          );

          // Bell-curve horizon taper so outer edges anchor smoothly while central peaks soar
          const bellTaper = Math.pow(Math.sin(xFrac * Math.PI), 1.45);
          const harmonic =
            0.5 +
            0.5 *
              Math.sin(
                xFrac * Math.PI * (4 + (row % 3)) + phaseOffset
              );
          const rowDepthGain = 0.72 + rowFrac * 0.45;
          const displacement =
            (Math.pow(val, 1.08) * (0.68 + harmonic * 0.42) + bass * 0.14 * harmonic) *
            bellTaper *
            maxPeakH *
            rowDepthGain;

          pts.push({
            x: rowStartX + xFrac * rowW,
            y: baseY - displacement,
          });
        }

        // Draw opaque silhouette mask below ridge line so foreground peaks cleanly occlude rear ridges
        vCtx.save();
        vCtx.beginPath();
        vCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) * 0.5;
          const yc = (pts[i].y + pts[i + 1].y) * 0.5;
          vCtx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        const lastPt = pts[pts.length - 1];
        vCtx.lineTo(lastPt.x, lastPt.y);

        const maskBottom = baseY + minDim * 0.085;
        vCtx.lineTo(lastPt.x, maskBottom);
        vCtx.lineTo(pts[0].x, maskBottom);
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(settings.bgColor, 0.94);
        vCtx.fill();
        vCtx.restore();

        // Stroke crisp glowing ridge crest
        vCtx.save();
        vCtx.beginPath();
        vCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) * 0.5;
          const yc = (pts[i].y + pts[i + 1].y) * 0.5;
          vCtx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
        }
        vCtx.lineTo(lastPt.x, lastPt.y);

        const ridgeGrad = vCtx.createLinearGradient(
          rowStartX,
          0,
          rowStartX + rowW,
          0
        );
        const edgeColor = rowFrac > 0.45 ? settings.secondaryColor : settings.primaryColor;
        const centerColor = rowFrac > 0.45 ? settings.primaryColor : settings.secondaryColor;
        const strokeAlpha = 0.35 + rowFrac * 0.62;
        ridgeGrad.addColorStop(0, hexToRgba(edgeColor, strokeAlpha * 0.55));
        ridgeGrad.addColorStop(0.5, hexToRgba(centerColor, strokeAlpha));
        ridgeGrad.addColorStop(1, hexToRgba(edgeColor, strokeAlpha * 0.55));

        vCtx.strokeStyle = ridgeGrad;
        vCtx.lineWidth = Math.max(1.3, minDim * (0.0018 + rowFrac * 0.0022));
        vCtx.lineCap = 'round';
        applyShadow(centerColor, minDim * (0.008 + rowFrac * 0.012));
        vCtx.stroke();
        vCtx.restore();
      }
    } else if (mode === 'dna-helix') {
      // Double Helix Strand: 3D-projected twisting twin strands with frequency-reactive rungs
      const spanW = linW;
      const startX = linPadX;
      const cy = visCenterY;
      const nodeCount = Math.max(20, Math.min(56, Math.round(settings.barCount * 0.45)));
      const maxAmp =
        (isPortrait ? height * 0.14 : height * 0.22) * visScale * (1 + beatBoost * 0.16);
      const twistCycles = 2.6;
      const phaseSpin = currentTime * (2.2 + bass * 1.4 + beatBoost * 1.6);

      const strandA: Array<{ x: number; y: number; z: number; val: number }> = [];
      const strandB: Array<{ x: number; y: number; z: number; val: number }> = [];

      for (let i = 0; i < nodeCount; i++) {
        const t = i / (nodeCount - 1);
        const symBin = Math.round(Math.abs(t - 0.5) * 2 * (nodeCount * 0.55));
        const val = getPerceptualBarValue(
          frequencyData,
          symBin,
          Math.max(12, Math.floor(nodeCount * 0.6)),
          settings.sensitivity
        );
        const angle = t * Math.PI * 2 * twistCycles - phaseSpin;
        const amp = maxAmp * (0.42 + Math.pow(val, 1.05) * 0.72);
        const x = startX + t * spanW;
        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);

        strandA.push({ x, y: cy + sinA * amp, z: cosA, val });
        strandB.push({ x, y: cy - sinA * amp, z: -cosA, val });
      }

      // Draw connecting base-pair rungs sorted by depth
      vCtx.save();
      for (let i = 0; i < nodeCount; i++) {
        const a = strandA[i];
        const b = strandB[i];
        const rungAlpha = 0.22 + a.val * 0.55;
        const rungGrad = vCtx.createLinearGradient(a.x, a.y, b.x, b.y);
        rungGrad.addColorStop(0, hexToRgba(settings.primaryColor, rungAlpha));
        rungGrad.addColorStop(0.5, hexToRgba('#ffffff', rungAlpha * 0.85));
        rungGrad.addColorStop(1, hexToRgba(settings.secondaryColor, rungAlpha));

        vCtx.strokeStyle = rungGrad;
        vCtx.lineWidth = Math.max(1.2, minDim * (0.002 + a.val * 0.003));
        vCtx.beginPath();
        vCtx.moveTo(a.x, a.y);
        vCtx.lineTo(b.x, b.y);
        vCtx.stroke();
      }
      vCtx.restore();

      const drawStrand = (
        pts: Array<{ x: number; y: number; z: number; val: number }>,
        color: string
      ) => {
        vCtx.save();
        vCtx.beginPath();
        vCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 0; i < pts.length - 1; i++) {
          const mx = (pts[i].x + pts[i + 1].x) * 0.5;
          const my = (pts[i].y + pts[i + 1].y) * 0.5;
          vCtx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        }
        vCtx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
        vCtx.strokeStyle = hexToRgba(color, 0.85);
        vCtx.lineWidth = Math.max(2, minDim * 0.0042);
        applyShadow(color, minDim * 0.015);
        vCtx.stroke();

        for (const p of pts) {
          const depthScale = 0.65 + (p.z + 1) * 0.35;
          const r = Math.max(
            2,
            minDim * (0.0036 + p.val * 0.0052) * depthScale
          );
          vCtx.beginPath();
          vCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
          vCtx.fillStyle = hexToRgba(color, 0.45 + depthScale * 0.45);
          vCtx.fill();
        }
        vCtx.restore();
      };

      drawStrand(strandA, settings.primaryColor);
      drawStrand(strandB, settings.secondaryColor);
    } else if (mode === 'radar-sonar') {
      // Sonar Pulse Radar: tactical concentric rings, rotating phosphor sweep & lit frequency blips
      const cx = width * 0.5;
      const cy = visCenterY;
      const maxR =
        minDim * (isPortrait ? 0.36 : 0.4) * visScale * (1 + beatBoost * 0.08);
      const sweepAngle = currentTime * (1.55 + beatBoost * 0.6) - Math.PI * 0.5;

      // Range rings & crosshair reticle
      vCtx.save();
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.2 + bass * 0.12);
      vCtx.lineWidth = Math.max(1, minDim * 0.0018);
      for (let r = 1; r <= 4; r++) {
        vCtx.beginPath();
        vCtx.arc(cx, cy, (maxR * r) / 4, 0, Math.PI * 2);
        vCtx.stroke();
      }
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.14);
      vCtx.beginPath();
      vCtx.moveTo(cx - maxR, cy);
      vCtx.lineTo(cx + maxR, cy);
      vCtx.moveTo(cx, cy - maxR);
      vCtx.lineTo(cx, cy + maxR);
      vCtx.stroke();
      vCtx.restore();

      // Trailing sweep wedge
      vCtx.save();
      const trailSteps = 14;
      const sweepSpan = 0.85;
      for (let s = 0; s < trailSteps; s++) {
        const a0 = sweepAngle - (s / trailSteps) * sweepSpan;
        const a1 = sweepAngle - ((s + 1) / trailSteps) * sweepSpan;
        const wedgeAlpha = (1 - s / trailSteps) * (0.22 + bass * 0.12);
        vCtx.beginPath();
        vCtx.moveTo(cx, cy);
        vCtx.arc(cx, cy, maxR, a1, a0);
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(settings.primaryColor, wedgeAlpha);
        vCtx.fill();
      }

      // Crisp leading radar beam
      vCtx.beginPath();
      vCtx.moveTo(cx, cy);
      vCtx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.95);
      vCtx.lineWidth = Math.max(2, minDim * 0.0036);
      applyShadow(settings.primaryColor, minDim * 0.018);
      vCtx.stroke();
      vCtx.restore();

      // Radial spectrum blips illuminated proportionally to angular proximity behind sweep
      const blipCount = Math.max(24, Math.min(72, Math.round(settings.barCount * 0.6)));
      vCtx.save();
      for (let i = 0; i < blipCount; i++) {
        const angle = (i / blipCount) * Math.PI * 2 - Math.PI * 0.5;
        const val = getPerceptualBarValue(
          frequencyData,
          i % Math.max(12, Math.floor(blipCount / 2)),
          Math.max(12, Math.floor(blipCount / 2)),
          settings.sensitivity
        );
        const dist = maxR * (0.18 + Math.pow(val, 0.95) * 0.8);
        let delta = (sweepAngle - angle) % (Math.PI * 2);
        if (delta < 0) delta += Math.PI * 2;
        const decayGlow = Math.max(0.18, 1 - delta / (Math.PI * 1.65));

        const bx = cx + Math.cos(angle) * dist;
        const by = cy + Math.sin(angle) * dist;
        const blipR = Math.max(2, minDim * (0.0032 + val * 0.0065) * (0.65 + decayGlow * 0.45));
        const blipColor = val > 0.55 ? settings.secondaryColor : settings.primaryColor;

        vCtx.beginPath();
        vCtx.arc(bx, by, blipR, 0, Math.PI * 2);
        vCtx.fillStyle = hexToRgba(blipColor, Math.min(1, decayGlow * (0.55 + val * 0.5)));
        applyShadow(blipColor, minDim * 0.014 * decayGlow);
        vCtx.fill();
      }
      vCtx.restore();
    } else if (mode === 'lissajous-scope') {
      // Lissajous Phase Scope: harmonic X-Y phase figure driven by audio bands & time-domain data
      const cx = width * 0.5;
      const cy = visCenterY;
      const scopeR =
        minDim * (isPortrait ? 0.34 : 0.38) * visScale * (1 + beatBoost * 0.1);
      const ptsCount = Math.max(180, Math.min(360, settings.barCount * 3));

      // Subtle phase calibration reticle
      vCtx.save();
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.14);
      vCtx.lineWidth = Math.max(1, minDim * 0.0016);
      vCtx.beginPath();
      vCtx.arc(cx, cy, scopeR, 0, Math.PI * 2);
      vCtx.stroke();
      vCtx.beginPath();
      vCtx.arc(cx, cy, scopeR * 0.5, 0, Math.PI * 2);
      vCtx.stroke();
      vCtx.restore();

      const drawLissajousLoop = (
        freqX: number,
        freqY: number,
        phaseShift: number,
        scaleMod: number,
        color: string,
        lineW: number,
        alpha: number
      ) => {
        vCtx.save();
        vCtx.beginPath();
        for (let i = 0; i <= ptsCount; i++) {
          const t = (i / ptsCount) * Math.PI * 2;
          const tdIdxA = Math.floor((i / ptsCount) * (timeDomainData.length * 0.5));
          const tdIdxB = (tdIdxA + Math.floor(timeDomainData.length * 0.18)) % timeDomainData.length;
          const tdA = ((timeDomainData[tdIdxA] ?? 128) - 128) / 128;
          const tdB = ((timeDomainData[tdIdxB] ?? 128) - 128) / 128;

          const radialMod = 1 + (tdA * 0.22 + tdB * 0.22) * settings.sensitivity;
          const x =
            cx +
            Math.sin(t * freqX + phaseShift) *
              scopeR *
              scaleMod *
              (0.78 + bass * 0.24) *
              radialMod;
          const y =
            cy +
            Math.sin(t * freqY + currentTime * 0.5) *
              scopeR *
              scaleMod *
              (0.78 + mid * 0.24) *
              radialMod;

          if (i === 0) vCtx.moveTo(x, y);
          else vCtx.lineTo(x, y);
        }
        vCtx.closePath();
        vCtx.strokeStyle = hexToRgba(color, alpha);
        vCtx.lineWidth = lineW;
        applyShadow(color, minDim * (0.016 + beatBoost * 0.012));
        vCtx.stroke();
        vCtx.restore();
      };

      const phase = currentTime * (0.9 + bass * 0.8);
      drawLissajousLoop(
        3,
        4,
        phase * 0.7 + 0.6,
        0.92,
        settings.secondaryColor,
        Math.max(2, minDim * 0.0036),
        0.72
      );
      drawLissajousLoop(
        2,
        3,
        phase,
        0.86,
        settings.primaryColor,
        Math.max(2.6, minDim * 0.0048),
        0.95
      );
    } else if (mode === 'rain-matrix') {
      // Digital Rain Waterfall: cascading spectrum-synced neon columns (batched per color/alpha tier)
      const colCount = Math.max(24, Math.min(64, Math.round(settings.barCount * 0.6)));
      const spanW = linW;
      const colStep = spanW / colCount;
      const glyphW = Math.max(3, colStep * 0.56);
      const areaH = (isPortrait ? height * 0.56 : height * 0.68) * visScale;
      const topY = visCenterY - areaH * 0.5;
      const dropSegs = 12;
      const glyphStepY = areaH / 18;
      const segH = Math.max(2.5, glyphStepY * 0.62);
      const segRadius = Math.min(3, glyphW * 0.35);

      const headBuckets: Array<Array<{ x: number; y: number }>> = [[], []];
      const tailAlphas = [0.22, 0.45, 0.68, 0.9];
      // 2 colors (0=primary, 1=secondary) x 4 alpha tiers = 8 buckets max
      const tailBuckets: Array<Array<{ x: number; y: number }>> = [
        [], [], [], [], [], [], [], [],
      ];

      for (let c = 0; c < colCount; c++) {
        const symIdx = c < colCount / 2 ? c : colCount - 1 - c;
        const val = getPerceptualBarValue(
          frequencyData,
          symIdx,
          Math.max(8, Math.floor(colCount / 2)),
          settings.sensitivity
        );
        const seed = Math.sin(c * 12.9898 + 4.1414) * 43758.5453;
        const fracSeed = seed - Math.floor(seed);
        const speed = 0.28 + fracSeed * 0.45 + val * 0.42 + beatBoost * 0.25;
        const headFrac = (currentTime * speed + fracSeed * 3.7) % 1.25;
        const headY = topY + headFrac * areaH;
        const x = linPadX + c * colStep + (colStep - glyphW) * 0.5;
        const activeLen = Math.max(4, Math.round(4 + val * dropSegs));
        const colIdx = c % 3 === 0 ? 1 : 0;

        for (let s = 0; s < activeLen; s++) {
          const gy = headY - s * glyphStepY;
          if (gy < topY || gy > topY + areaH) continue;
          if (s === 0) {
            headBuckets[colIdx].push({ x, y: gy });
          } else {
            const tailFade = 1 - s / activeLen;
            const alpha = tailFade * (0.28 + val * 0.72);
            const tier = Math.min(3, Math.max(0, Math.floor(alpha * 4)));
            tailBuckets[colIdx * 4 + tier].push({ x, y: gy });
          }
        }
      }

      vCtx.save();
      vCtx.shadowBlur = 0;
      for (let colIdx = 0; colIdx < 2; colIdx++) {
        const colColor = colIdx === 0 ? settings.primaryColor : settings.secondaryColor;
        for (let tier = 0; tier < 4; tier++) {
          const items = tailBuckets[colIdx * 4 + tier];
          if (items.length === 0) continue;
          vCtx.fillStyle = hexToRgba(colColor, tailAlphas[tier]);
          vCtx.beginPath();
          for (let k = 0; k < items.length; k++) {
            vCtx.roundRect(items[k].x, items[k].y, glyphW, segH, segRadius);
          }
          vCtx.fill();
        }
      }

      const headGlow = minDim * 0.014;
      vCtx.fillStyle = 'rgba(255, 255, 255, 0.92)';
      for (let colIdx = 0; colIdx < 2; colIdx++) {
        const items = headBuckets[colIdx];
        if (items.length === 0) continue;
        applyShadow(colIdx === 0 ? settings.primaryColor : settings.secondaryColor, headGlow);
        vCtx.beginPath();
        for (let k = 0; k < items.length; k++) {
          vCtx.roundRect(items[k].x, items[k].y, glyphW, segH, segRadius);
        }
        vCtx.fill();
      }
      vCtx.restore();
    } else if (mode === 'flower-mandala') {
      // Sacred Lotus Mandala: multi-ring symmetrical petal curves blooming outward with frequency bands
      const cx = width * 0.5;
      const cy = visCenterY;
      const maxR =
        minDim * (isPortrait ? 0.36 : 0.4) * visScale * (1 + beatBoost * 0.12);

      const drawPetalLayer = (
        petals: number,
        innerR: number,
        outerReach: number,
        rot: number,
        bandOffset: number,
        color: string,
        fillAlpha: number,
        lineW: number
      ) => {
        vCtx.save();
        for (let p = 0; p < petals; p++) {
          const angle = (p / petals) * Math.PI * 2 + rot;
          const val = getPerceptualBarValue(
            frequencyData,
            (p + bandOffset) % Math.max(6, Math.floor(petals / 2) + 2),
            Math.max(8, petals),
            settings.sensitivity
          );
          const tipR = innerR + outerReach * (0.45 + Math.pow(val, 1.05) * 0.72);
          const spread = (Math.PI / petals) * (0.68 + val * 0.28);

          const baseLeftX = cx + Math.cos(angle - spread * 0.45) * innerR;
          const baseLeftY = cy + Math.sin(angle - spread * 0.45) * innerR;
          const baseRightX = cx + Math.cos(angle + spread * 0.45) * innerR;
          const baseRightY = cy + Math.sin(angle + spread * 0.45) * innerR;
          const ctrlLeftX = cx + Math.cos(angle - spread) * (innerR + (tipR - innerR) * 0.62);
          const ctrlLeftY = cy + Math.sin(angle - spread) * (innerR + (tipR - innerR) * 0.62);
          const ctrlRightX = cx + Math.cos(angle + spread) * (innerR + (tipR - innerR) * 0.62);
          const ctrlRightY = cy + Math.sin(angle + spread) * (innerR + (tipR - innerR) * 0.62);
          const tipX = cx + Math.cos(angle) * tipR;
          const tipY = cy + Math.sin(angle) * tipR;

          vCtx.beginPath();
          vCtx.moveTo(baseLeftX, baseLeftY);
          vCtx.quadraticCurveTo(ctrlLeftX, ctrlLeftY, tipX, tipY);
          vCtx.quadraticCurveTo(ctrlRightX, ctrlRightY, baseRightX, baseRightY);
          vCtx.closePath();

          vCtx.fillStyle = hexToRgba(color, fillAlpha + val * 0.14);
          vCtx.fill();
          vCtx.strokeStyle = hexToRgba(color, 0.55 + val * 0.45);
          vCtx.lineWidth = lineW;
          applyShadow(color, minDim * 0.014);
          vCtx.stroke();
        }
        vCtx.restore();
      };

      const baseSpin = currentTime * 0.18;
      drawPetalLayer(
        16,
        maxR * 0.24,
        maxR * 0.72,
        -baseSpin * 0.7,
        2,
        settings.secondaryColor,
        0.08,
        Math.max(1.4, minDim * 0.0024)
      );
      drawPetalLayer(
        12,
        maxR * 0.18,
        maxR * 0.62,
        baseSpin,
        1,
        settings.primaryColor,
        0.12,
        Math.max(1.8, minDim * 0.0032)
      );
      drawPetalLayer(
        8,
        maxR * 0.1,
        maxR * 0.4,
        -baseSpin * 1.4,
        0,
        '#ffffff',
        0.08,
        Math.max(1.5, minDim * 0.0026)
      );

      // Luminous lotus seed core
      vCtx.save();
      vCtx.beginPath();
      vCtx.arc(cx, cy, maxR * (0.09 + bass * 0.04), 0, Math.PI * 2);
      vCtx.fillStyle = hexToRgba(settings.primaryColor, 0.85);
      applyShadow(settings.primaryColor, minDim * 0.02);
      vCtx.fill();
      vCtx.restore();
    } else if (mode === 'vortex-rings') {
      // 3D Torus Gyroscope: nested 3D gimbal rings rotating in perspective with orbiting spectrum beads
      const cx = width * 0.5;
      const cy = visCenterY;
      const maxR =
        minDim * (isPortrait ? 0.34 : 0.38) * visScale * (1 + beatBoost * 0.1);
      const ringCount = 5;
      const focal = minDim * 1.6;
      const camZ = maxR * 3.8;
      const segs = 64;

      for (let r = 0; r < ringCount; r++) {
        const ringFrac = r / (ringCount - 1);
        const val = getPerceptualBarValue(
          frequencyData,
          r,
          ringCount,
          settings.sensitivity
        );
        const radius = maxR * (0.36 + ringFrac * 0.62) * (1 + val * 0.1);
        const rx = currentTime * (0.55 + r * 0.16) * (1 + beatBoost * 0.45) + r * 0.8;
        const ry = currentTime * (0.42 - r * 0.12) * (1 + bass * 0.35) + r * 1.1;
        const rz = currentTime * 0.25 + r * 0.5;

        const cosX = Math.cos(rx);
        const sinX = Math.sin(rx);
        const cosY = Math.cos(ry);
        const sinY = Math.sin(ry);
        const cosZ = Math.cos(rz);
        const sinZ = Math.sin(rz);

        const projectRingPt = (theta: number, rMod: number) => {
          const lx = Math.cos(theta) * rMod;
          const ly = Math.sin(theta) * rMod;
          const lz = 0;
          const y1 = ly * cosX - lz * sinX;
          const z1 = ly * sinX + lz * cosX;
          const x2 = lx * cosY + z1 * sinY;
          const z2 = -lx * sinY + z1 * cosY;
          const x3 = x2 * cosZ - y1 * sinZ;
          const y3 = x2 * sinZ + y1 * cosZ;
          const pScale = focal / Math.max(maxR, camZ - z2);
          return { x: cx + x3 * pScale, y: cy + y3 * pScale, z: z2 };
        };

        const ringColor = r % 2 === 0 ? settings.primaryColor : settings.secondaryColor;
        vCtx.save();
        vCtx.beginPath();
        for (let s = 0; s <= segs; s++) {
          const theta = (s / segs) * Math.PI * 2;
          const waveBump =
            Math.sin(theta * (4 + r) + currentTime * 3) * val * maxR * 0.045;
          const pt = projectRingPt(theta, radius + waveBump);
          if (s === 0) vCtx.moveTo(pt.x, pt.y);
          else vCtx.lineTo(pt.x, pt.y);
        }
        vCtx.closePath();
        vCtx.strokeStyle = hexToRgba(ringColor, 0.55 + val * 0.42);
        vCtx.lineWidth = Math.max(1.8, minDim * (0.0028 + val * 0.0036));
        applyShadow(ringColor, minDim * 0.015);
        vCtx.stroke();

        // Orbiting energy nodes on each gimbal ring
        const beadTheta = currentTime * (1.2 + r * 0.35) + r * 2.1;
        for (const offset of [0, Math.PI]) {
          const bead = projectRingPt(beadTheta + offset, radius);
          const beadR = Math.max(2.5, minDim * (0.0045 + val * 0.0055));
          vCtx.beginPath();
          vCtx.arc(bead.x, bead.y, beadR, 0, Math.PI * 2);
          vCtx.fillStyle = '#ffffff';
          vCtx.fill();
        }
        vCtx.restore();
      }
    } else if (mode === 'isometric-city') {
      // Isometric Equalizer: 3D isometric depth-sorted prism skyline
      const gridCols = Math.max(6, Math.min(12, Math.round(settings.barCount * 0.1)));
      const gridRows = 5;
      const cx = width * 0.5;
      const baseCy = visCenterY + (isPortrait ? height * 0.1 : height * 0.14);
      const tileW =
        (linW / (gridCols + gridRows)) * 0.92;
      const tileH = tileW * 0.52;
      const maxColH =
        (isPortrait ? height * 0.24 : height * 0.32) * visScale * (1 + beatBoost * 0.18);

      // Painter's algorithm back-to-front: ascending (row + col)
      const cells: Array<{ r: number; c: number }> = [];
      for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
          cells.push({ r, c });
        }
      }
      cells.sort((a, b) => a.r + a.c - (b.r + b.c));

      const halfSpan = (gridCols - gridRows) * 0.5;
      for (const { r, c } of cells) {
        const bandIdx = Math.floor(
          ((c + r * 0.6) / (gridCols + gridRows * 0.6)) * Math.max(8, gridCols)
        );
        const val = getPerceptualBarValue(
          frequencyData,
          bandIdx,
          Math.max(8, gridCols),
          settings.sensitivity
        );
        const colH = Math.max(minDim * 0.016, Math.pow(val, 1.12) * maxColH);
        const isoX = cx + ((c - r) - halfSpan) * tileW;
        const isoY = baseCy + (c + r - (gridCols + gridRows) * 0.5) * tileH * 0.95;

        const hw = tileW * 0.44;
        const hh = tileH * 0.44;
        const topY = isoY - colH;

        const usePrimary = (c + r) % 2 === 0;
        const mainCol = usePrimary ? settings.primaryColor : settings.secondaryColor;
        const altCol = usePrimary ? settings.secondaryColor : settings.primaryColor;

        vCtx.save();
        // Left shaded face
        vCtx.beginPath();
        vCtx.moveTo(isoX - hw, topY);
        vCtx.lineTo(isoX, topY + hh);
        vCtx.lineTo(isoX, isoY + hh);
        vCtx.lineTo(isoX - hw, isoY);
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(mainCol, 0.35 + val * 0.42);
        vCtx.fill();

        // Right medium-lit face
        vCtx.beginPath();
        vCtx.moveTo(isoX + hw, topY);
        vCtx.lineTo(isoX, topY + hh);
        vCtx.lineTo(isoX, isoY + hh);
        vCtx.lineTo(isoX + hw, isoY);
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(altCol, 0.22 + val * 0.35);
        vCtx.fill();

        // Bright top diamond cap
        vCtx.beginPath();
        vCtx.moveTo(isoX, topY - hh);
        vCtx.lineTo(isoX + hw, topY);
        vCtx.lineTo(isoX, topY + hh);
        vCtx.lineTo(isoX - hw, topY);
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(mainCol, 0.72 + val * 0.28);
        applyShadow(mainCol, minDim * 0.01);
        vCtx.fill();
        vCtx.strokeStyle = hexToRgba('#ffffff', 0.35 + val * 0.4);
        vCtx.lineWidth = Math.max(0.8, minDim * 0.0014);
        vCtx.stroke();
        vCtx.restore();
      }
    } else if (mode === 'analog-vu') {
      // Dual Analog VU Meters: twin studio needle dials with dB arc ticks & segmented peak strips
      const stacked = isPortrait;
      const meterW = stacked
        ? linW * 0.86
        : linW * 0.46;
      const meterH = meterW * 0.62;
      const gap = stacked ? meterH * 0.24 : linW * 0.06;

      const leftLevel = Math.min(1, bass * 0.72 + mid * 0.42 + beatBoost * 0.22);
      const rightLevel = Math.min(1, mid * 0.68 + treble * 0.55 + beatBoost * 0.18);

      const drawMeter = (
        mx: number,
        my: number,
        level: number,
        label: string,
        accent: string
      ) => {
        const pivotX = mx;
        const pivotY = my + meterH * 0.36;
        const arcR = meterW * 0.42;
        const startAng = -Math.PI * 0.78;
        const endAng = -Math.PI * 0.22;

        vCtx.save();
        // Sleek brushed dark instrument bezel
        vCtx.beginPath();
        vCtx.roundRect(mx - meterW * 0.5, my - meterH * 0.5, meterW, meterH, minDim * 0.02);
        vCtx.fillStyle = 'rgba(9, 11, 16, 0.72)';
        vCtx.fill();
        vCtx.strokeStyle = hexToRgba(accent, 0.38);
        vCtx.lineWidth = Math.max(1.5, minDim * 0.0026);
        vCtx.stroke();

        // Scale arc & red +dB overload zone
        const splitAng = startAng + (endAng - startAng) * 0.72;
        vCtx.beginPath();
        vCtx.arc(pivotX, pivotY, arcR, startAng, splitAng);
        vCtx.strokeStyle = hexToRgba(accent, 0.65);
        vCtx.lineWidth = Math.max(2, minDim * 0.0032);
        vCtx.stroke();

        vCtx.beginPath();
        vCtx.arc(pivotX, pivotY, arcR, splitAng, endAng);
        vCtx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
        vCtx.lineWidth = Math.max(2.4, minDim * 0.0038);
        vCtx.stroke();

        // Tick marks
        const tickCount = 13;
        for (let t = 0; t < tickCount; t++) {
          const tf = t / (tickCount - 1);
          const ta = startAng + (endAng - startAng) * tf;
          const innerTick = arcR * (t % 2 === 0 ? 0.88 : 0.93);
          vCtx.beginPath();
          vCtx.moveTo(pivotX + Math.cos(ta) * innerTick, pivotY + Math.sin(ta) * innerTick);
          vCtx.lineTo(pivotX + Math.cos(ta) * arcR, pivotY + Math.sin(ta) * arcR);
          vCtx.strokeStyle =
            tf > 0.72 ? 'rgba(244, 63, 94, 0.85)' : hexToRgba('#e2e8f0', 0.58);
          vCtx.lineWidth = Math.max(1, minDim * 0.0018);
          vCtx.stroke();
        }

        // Needle with slight harmonic shimmer
        const needleLevel = Math.max(
          0,
          Math.min(1, level + Math.sin(currentTime * 14) * 0.015 * level)
        );
        const needleAng = startAng + (endAng - startAng) * needleLevel;
        const needleLen = arcR * 1.04;
        vCtx.beginPath();
        vCtx.moveTo(pivotX, pivotY);
        vCtx.lineTo(
          pivotX + Math.cos(needleAng) * needleLen,
          pivotY + Math.sin(needleAng) * needleLen
        );
        vCtx.strokeStyle = needleLevel > 0.76 ? '#fb7185' : '#ffffff';
        vCtx.lineWidth = Math.max(2, minDim * 0.0034);
        vCtx.lineCap = 'round';
        applyShadow(needleLevel > 0.76 ? '#f43f5e' : accent, minDim * 0.016);
        vCtx.stroke();

        // Pivot cap & channel label
        vCtx.beginPath();
        vCtx.arc(pivotX, pivotY, minDim * 0.014, 0, Math.PI * 2);
        vCtx.fillStyle = accent;
        vCtx.fill();

        vCtx.fillStyle = hexToRgba('#cbd5e1', 0.78);
        vCtx.font = `600 ${Math.max(11, Math.round(meterW * 0.058))}px "JetBrains Mono", monospace`;
        vCtx.textAlign = 'center';
        vCtx.textBaseline = 'middle';
        vCtx.fillText(label, mx, my + meterH * 0.22);

        // Segmented peak LED bar inside bottom bezel
        const ledSegs = 12;
        const barW = meterW * 0.72;
        const segGap = 3;
        const segW = (barW - segGap * (ledSegs - 1)) / ledSegs;
        const litSegs = Math.round(needleLevel * ledSegs);
        const ledX0 = mx - barW * 0.5;
        const ledY = my + meterH * 0.39;
        for (let s = 0; s < ledSegs; s++) {
          const isLit = s < litSegs;
          const isPeak = s >= 9;
          vCtx.fillStyle = isLit
            ? isPeak
              ? '#f43f5e'
              : accent
            : 'rgba(255,255,255,0.08)';
          vCtx.shadowBlur = 0;
          vCtx.fillRect(ledX0 + s * (segW + segGap), ledY, segW, Math.max(3, minDim * 0.005));
        }
        vCtx.restore();
      };

      if (stacked) {
        drawMeter(width * 0.5, visCenterY - (meterH + gap) * 0.45, leftLevel, 'CH L · VU', settings.primaryColor);
        drawMeter(width * 0.5, visCenterY + (meterH + gap) * 0.45, rightLevel, 'CH R · VU', settings.secondaryColor);
      } else {
        drawMeter(width * 0.5 - (meterW + gap) * 0.5, visCenterY, leftLevel, 'CH L · VU', settings.primaryColor);
        drawMeter(width * 0.5 + (meterW + gap) * 0.5, visCenterY, rightLevel, 'CH R · VU', settings.secondaryColor);
      }
    } else if (mode === 'kaleido-shards') {
      // Kaleidoscope Shards: 8-fold mirrored geometric crystal facets pulsing to beats
      const cx = width * 0.5;
      const cy = visCenterY;
      const maxR =
        minDim * (isPortrait ? 0.36 : 0.41) * visScale * (1 + beatBoost * 0.14);
      const folds = 8;
      const rings = 4;
      const rot = currentTime * (0.34 + beatBoost * 0.55);

      vCtx.save();
      for (let r = rings - 1; r >= 0; r--) {
        const innerR = maxR * (r / rings) * 0.85;
        const layerReach = maxR * ((r + 1) / rings);
        const val = getPerceptualBarValue(
          frequencyData,
          r * 2,
          rings * 2,
          settings.sensitivity
        );
        const layerRot = rot * (r % 2 === 0 ? 1 : -0.8) + r * 0.35;
        const shardColor =
          r % 2 === 0 ? settings.primaryColor : settings.secondaryColor;

        for (let f = 0; f < folds; f++) {
          const baseAng = (f / folds) * Math.PI * 2 + layerRot;
          const halfWedge = (Math.PI / folds) * (0.72 + val * 0.25);
          const tipR = layerReach * (0.75 + val * 0.32);

          const p0x = cx + Math.cos(baseAng) * innerR;
          const p0y = cy + Math.sin(baseAng) * innerR;
          const p1x = cx + Math.cos(baseAng - halfWedge) * (innerR + (tipR - innerR) * 0.52);
          const p1y = cy + Math.sin(baseAng - halfWedge) * (innerR + (tipR - innerR) * 0.52);
          const p2x = cx + Math.cos(baseAng) * tipR;
          const p2y = cy + Math.sin(baseAng) * tipR;
          const p3x = cx + Math.cos(baseAng + halfWedge) * (innerR + (tipR - innerR) * 0.52);
          const p3y = cy + Math.sin(baseAng + halfWedge) * (innerR + (tipR - innerR) * 0.52);

          vCtx.beginPath();
          vCtx.moveTo(p0x, p0y);
          vCtx.lineTo(p1x, p1y);
          vCtx.lineTo(p2x, p2y);
          vCtx.lineTo(p3x, p3y);
          vCtx.closePath();

          vCtx.fillStyle = hexToRgba(shardColor, 0.14 + val * 0.32);
          vCtx.fill();
          vCtx.strokeStyle = hexToRgba(shardColor, 0.55 + val * 0.42);
          vCtx.lineWidth = Math.max(1.2, minDim * 0.0024);
          applyShadow(shardColor, minDim * 0.012);
          vCtx.stroke();
        }
      }
      vCtx.restore();
    } else if (mode === 'flame-corona') {
      // Solar Plasma Corona: dark eclipse core surrounded by multi-octave radial plasma flares
      const cx = width * 0.5;
      const cy = visCenterY;
      const coreR =
        minDim * (isPortrait ? 0.17 : 0.19) * visScale * (1 + bass * 0.08 + beatBoost * 0.08);
      const flareReach =
        minDim * (isPortrait ? 0.17 : 0.2) * visScale * (1 + beatBoost * 0.2);
      const segs = 96;

      // Ambient solar glow
      vCtx.save();
      const solarGlow = vCtx.createRadialGradient(
        cx,
        cy,
        coreR * 0.85,
        cx,
        cy,
        coreR + flareReach * 1.4
      );
      solarGlow.addColorStop(0, hexToRgba(settings.primaryColor, 0.48 + bass * 0.25));
      solarGlow.addColorStop(0.5, hexToRgba(settings.secondaryColor, 0.2 + mid * 0.12));
      solarGlow.addColorStop(1, 'rgba(0,0,0,0)');
      vCtx.fillStyle = solarGlow;
      vCtx.beginPath();
      vCtx.arc(cx, cy, coreR + flareReach * 1.4, 0, Math.PI * 2);
      vCtx.fill();
      vCtx.restore();

      const drawCoronaRing = (
        ampMult: number,
        freqMult: number,
        speed: number,
        color: string,
        fillAlpha: number,
        strokeW: number
      ) => {
        const pts: Array<{ x: number; y: number }> = [];
        for (let i = 0; i < segs; i++) {
          const sym = i < segs / 2 ? i : segs - i;
          const val = getPerceptualBarValue(
            frequencyData,
            Math.floor((sym / (segs / 2)) * 36),
            40,
            settings.sensitivity
          );
          const angle = (i / segs) * Math.PI * 2;
          const turbulence =
            0.55 +
            0.25 * Math.sin(angle * (5 * freqMult) + currentTime * speed) +
            0.2 * Math.cos(angle * (9 * freqMult) - currentTime * (speed * 1.35));
          const r =
            coreR +
            Math.pow(val, 1.05) * flareReach * ampMult * (0.65 + turbulence * 0.6);
          pts.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
          });
        }

        vCtx.save();
        vCtx.beginPath();
        const lastPt = pts[pts.length - 1];
        const firstPt = pts[0];
        vCtx.moveTo((lastPt.x + firstPt.x) * 0.5, (lastPt.y + firstPt.y) * 0.5);
        for (let i = 0; i < pts.length; i++) {
          const cPt = pts[i];
          const nPt = pts[(i + 1) % pts.length];
          vCtx.quadraticCurveTo(cPt.x, cPt.y, (cPt.x + nPt.x) * 0.5, (cPt.y + nPt.y) * 0.5);
        }
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(color, fillAlpha);
        vCtx.fill();
        vCtx.strokeStyle = hexToRgba(color, 0.85);
        vCtx.lineWidth = strokeW;
        applyShadow(color, minDim * 0.018);
        vCtx.stroke();
        vCtx.restore();
      };

      drawCoronaRing(1.08, 1.0, 2.4, settings.secondaryColor, 0.14, Math.max(1.8, minDim * 0.003));
      drawCoronaRing(0.84, 1.4, -3.1, settings.primaryColor, 0.22, Math.max(2.2, minDim * 0.0038));
      drawCoronaRing(0.55, 2.0, 4.2, '#ffffff', 0.12, Math.max(1.2, minDim * 0.002));

      // Dark eclipse disc + glowing corona rim
      vCtx.save();
      vCtx.beginPath();
      vCtx.arc(cx, cy, coreR, 0, Math.PI * 2);
      vCtx.fillStyle = settings.bgColor;
      vCtx.fill();
      vCtx.strokeStyle = hexToRgba('#ffffff', 0.85);
      vCtx.lineWidth = Math.max(1.6, minDim * 0.003);
      applyShadow(settings.primaryColor, minDim * 0.02);
      vCtx.stroke();
      vCtx.restore();
    } else if (mode === 'circular-ring' || mode === 'hybrid-particles') {
      const cx = circularCx;
      const cy = circularCy;
      const baseRadius = circularBaseRadius;
      const maxBarLen =
        minDim * (isPortrait ? 0.15 : 0.16) * visScale * (1 + beatBoost * 0.16);
      const barCount = settings.barCount;

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

      // Radial spectrum bars around circumference (batched into 2 radial-gradient passes)
      vCtx.save();
      const halfBars = Math.max(16, Math.floor(barCount / 2));
      const barThickness = Math.max(2, ((2 * Math.PI * baseRadius) / barCount) * 0.58);
      vCtx.lineCap = 'round';
      vCtx.lineWidth = barThickness;

      const gradOuterR = Math.max(baseRadius + 1, baseRadius + maxBarLen * 0.78);
      const primaryOutGrad = vCtx.createRadialGradient(cx, cy, baseRadius, cx, cy, gradOuterR);
      primaryOutGrad.addColorStop(0, settings.primaryColor);
      primaryOutGrad.addColorStop(1, settings.secondaryColor);

      const secondaryOutGrad = vCtx.createRadialGradient(cx, cy, baseRadius, cx, cy, gradOuterR);
      secondaryOutGrad.addColorStop(0, settings.secondaryColor);
      secondaryOutGrad.addColorStop(1, settings.primaryColor);

      const primarySegs: number[] = [];
      const secondarySegs: number[] = [];
      for (let i = 0; i < barCount; i++) {
        const sym = i < halfBars ? i : barCount - 1 - i;
        const val = getPerceptualBarValue(frequencyData, sym, halfBars, settings.sensitivity);
        const len = Math.max(minDim * 0.008, Math.pow(val, 1.15) * maxBarLen);
        const angle = (i / barCount) * Math.PI * 2 - Math.PI * 0.5;
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const x1 = cx + cosA * baseRadius;
        const y1 = cy + sinA * baseRadius;
        const x2 = cx + cosA * (baseRadius + len);
        const y2 = cy + sinA * (baseRadius + len);
        const mix = sym / Math.max(1, halfBars - 1);
        const target = mix < 0.5 ? primarySegs : secondarySegs;
        target.push(x1, y1, x2, y2);
      }

      applyShadow(hexToRgba(settings.primaryColor, 0.45), minDim * 0.012);
      if (primarySegs.length > 0) {
        vCtx.strokeStyle = primaryOutGrad;
        vCtx.beginPath();
        for (let k = 0; k < primarySegs.length; k += 4) {
          vCtx.moveTo(primarySegs[k], primarySegs[k + 1]);
          vCtx.lineTo(primarySegs[k + 2], primarySegs[k + 3]);
        }
        vCtx.stroke();
      }
      if (secondarySegs.length > 0) {
        vCtx.strokeStyle = secondaryOutGrad;
        vCtx.beginPath();
        for (let k = 0; k < secondarySegs.length; k += 4) {
          vCtx.moveTo(secondarySegs[k], secondarySegs[k + 1]);
          vCtx.lineTo(secondarySegs[k + 2], secondarySegs[k + 3]);
        }
        vCtx.stroke();
      }
      vCtx.restore();

      // Glowing outer rim ring (bloomed along with bars)
      vCtx.save();
      vCtx.beginPath();
      vCtx.arc(cx, cy, circularArtRadius, 0, Math.PI * 2);
      vCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.78);
      vCtx.lineWidth = Math.max(2, minDim * 0.0038);
      applyShadow(settings.primaryColor, minDim * 0.015);
      vCtx.stroke();
      vCtx.restore();
    } else {
      renderExtraVisualizerMode(mode, {
        vCtx,
        width,
        height,
        minDim,
        isPortrait,
        visCenterY,
        visScale,
        linW,
        linPadX,
        currentTime,
        bass,
        mid,
        treble,
        beatBoost,
        frequencyData,
        timeDomainData,
        settings,
        applyShadow,
        hexToRgba,
        getPerceptualBarValue,
        albumRotationRef,
      });
    }
  };

  const renderVisualizerScene = (targetCtx: RenderContext2D, mode: VisualizerMode) => {
    if (bloom > 0.005) {
      const bloomRadius = Math.max(0.5, Math.min(2.2, settings.bloomRadius ?? 1.0));
      const bloomSpread = Math.max(0, Math.min(1, settings.bloomSpread ?? 0.5));
      const bloomSaturation = Math.max(0.7, Math.min(1.8, settings.bloomSaturation ?? 1.05));

      bloomLayerCanvas = ensureScratchCanvas(bloomLayerCanvas, width, height);
      const layerCtx = getContext2d(bloomLayerCanvas);
      if (layerCtx) {
        layerCtx.clearRect(0, 0, width, height);
        drawVisualizerLayer(layerCtx, mode);

        // Draw crisp base visualizer layer
        targetCtx.drawImage(bloomLayerCanvas, 0, 0, width, height);

        // Multi-resolution downsampled buffers: blur inside downsampled canvases & bilinearly upscale
        // (avoids expensive full-resolution ctx.filter Gaussian passes per frame)
        const halfW = Math.max(64, Math.round(width * 0.5));
        const halfH = Math.max(64, Math.round(height * 0.5));
        const quarterW = Math.max(32, Math.round(width * 0.25));
        const quarterH = Math.max(32, Math.round(height * 0.25));
        const eighthW = Math.max(24, Math.round(width * 0.125));
        const eighthH = Math.max(24, Math.round(height * 0.125));

        bloomHalfCanvas = ensureScratchCanvas(bloomHalfCanvas, halfW, halfH);
        bloomQuarterCanvas = ensureScratchCanvas(bloomQuarterCanvas, quarterW, quarterH);
        bloomEighthCanvas = ensureScratchCanvas(bloomEighthCanvas, eighthW, eighthH);
        const halfCtx = getContext2d(bloomHalfCanvas);
        const quarterCtx = getContext2d(bloomQuarterCanvas);
        const eighthCtx = getContext2d(bloomEighthCanvas);

        targetCtx.save();
        targetCtx.globalCompositeOperation = 'lighter';

        // Iterative Blur Pass 1: Tight core bloom + chromatic saturation extraction
        if (halfCtx) {
          const pass1BlurPx = Math.max(
            2,
            Math.round(minDim * (0.0042 + bloom * 0.0032) * bloomRadius)
          );
          const satPct = Math.round(bloomSaturation * 100);
          const brightPct = Math.max(
            85,
            Math.min(145, Math.round(96 + (bloomSaturation - 1) * 34))
          );

          halfCtx.clearRect(0, 0, halfW, halfH);
          halfCtx.save();
          halfCtx.filter = `blur(${pass1BlurPx}px) saturate(${satPct}%) brightness(${brightPct}%)`;
          halfCtx.drawImage(bloomLayerCanvas, 0, 0, halfW, halfH);
          halfCtx.restore();

          const coreAlpha = Math.min(0.92, bloom * (0.6 - bloomSpread * 0.26));
          targetCtx.globalAlpha = coreAlpha;
          targetCtx.drawImage(bloomHalfCanvas, 0, 0, width, height);

          // Specular flare overdrive pass for Neon Bloom / Aggressive Flare
          const overdriveBoost = Math.max(
            0,
            (bloom - 0.9) * 0.26 + (bloomSaturation - 1.25) * 0.18
          );
          if (overdriveBoost > 0.02) {
            targetCtx.globalAlpha = Math.min(0.5, overdriveBoost);
            targetCtx.drawImage(bloomHalfCanvas, 0, 0, width, height);
          }
        }

        // Iterative Blur Pass 2: Medium neon halo via quarter-res buffer
        if (quarterCtx && halfCtx) {
          const pass2BlurPx = Math.max(
            2,
            Math.round(minDim * (0.0062 + bloom * 0.0044) * bloomRadius)
          );
          quarterCtx.clearRect(0, 0, quarterW, quarterH);
          quarterCtx.save();
          quarterCtx.filter = `blur(${pass2BlurPx}px)`;
          quarterCtx.drawImage(bloomHalfCanvas, 0, 0, quarterW, quarterH);
          quarterCtx.restore();

          targetCtx.globalAlpha = Math.min(0.84, bloom * (0.28 + bloomSpread * 0.2));
          targetCtx.drawImage(bloomQuarterCanvas, 0, 0, width, height);
        }

        // Iterative Blur Pass 3: Wide atmospheric mist/haze via eighth-res buffer
        if (eighthCtx && quarterCtx) {
          const pass3BlurPx = Math.max(
            2,
            Math.round(minDim * (0.0074 + bloom * 0.0052) * bloomRadius)
          );
          eighthCtx.clearRect(0, 0, eighthW, eighthH);
          eighthCtx.save();
          eighthCtx.filter = `blur(${pass3BlurPx}px)`;
          eighthCtx.drawImage(bloomQuarterCanvas, 0, 0, eighthW, eighthH);
          eighthCtx.restore();

          targetCtx.globalAlpha = Math.min(0.8, bloom * (0.14 + bloomSpread * 0.34));
          targetCtx.drawImage(bloomEighthCanvas, 0, 0, width, height);
        }

        targetCtx.restore();
      } else {
        drawVisualizerLayer(targetCtx, mode);
      }
    } else {
      drawVisualizerLayer(targetCtx, mode);
    }

    // Center Album Art / Vinyl Disc rendered crisply above bloom passes
    if (isCircularModeFor(mode)) {
      const cx = circularCx;
      const cy = circularCy;
      const artRadius = circularArtRadius;

      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.arc(cx, cy, artRadius, 0, Math.PI * 2);
      targetCtx.clip();

      const albumDims = getImageDimensions(albumImage);
      if (albumDims && albumImage) {
        targetCtx.save();
        targetCtx.translate(cx, cy);
        if (albumRotationRef) {
          targetCtx.rotate(albumRotationRef.angle * 0.35);
        }
        const { width: imgW, height: imgH } = albumDims;
        const scale = (artRadius * 2) / Math.min(imgW, imgH);
        targetCtx.drawImage(
          albumImage,
          (-imgW * scale) / 2,
          (-imgH * scale) / 2,
          imgW * scale,
          imgH * scale
        );
        targetCtx.restore();
      } else {
        // Sleek geometric disc center
        const discGrad = targetCtx.createLinearGradient(
          cx - artRadius,
          cy - artRadius,
          cx + artRadius,
          cy + artRadius
        );
        discGrad.addColorStop(0, '#141926');
        discGrad.addColorStop(1, '#090b10');
        targetCtx.fillStyle = discGrad;
        targetCtx.fillRect(cx - artRadius, cy - artRadius, artRadius * 2, artRadius * 2);

        // Subtle vinyl grooves
        targetCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.18 + mid * 0.18);
        targetCtx.lineWidth = 1.5;
        for (const rFactor of [0.75, 0.55, 0.34]) {
          targetCtx.beginPath();
          targetCtx.arc(cx, cy, artRadius * rFactor, 0, Math.PI * 2);
          targetCtx.stroke();
        }
        targetCtx.beginPath();
        targetCtx.arc(cx, cy, artRadius * 0.14, 0, Math.PI * 2);
        targetCtx.fillStyle = settings.primaryColor;
        targetCtx.fill();
      }
      targetCtx.restore();

      // Crisp outer rim stroke over disc edge
      targetCtx.save();
      targetCtx.beginPath();
      targetCtx.arc(cx, cy, artRadius, 0, Math.PI * 2);
      targetCtx.strokeStyle = hexToRgba(settings.primaryColor, 0.78);
      targetCtx.lineWidth = Math.max(2, minDim * 0.0035);
      targetCtx.stroke();
      targetCtx.restore();
    }
  };

  if (!settings.lyricsOnly) {
    const transType = settings.sceneTransitionType ?? 'none';
    const transTarget = settings.sceneTransitionTarget ?? 'both';
    const transDur = Math.max(0.15, Math.min(1.5, settings.sceneTransitionDuration ?? 0.45));
    const visTransitionEnabled = transType !== 'none' && transTarget !== 'lyrics';

    let renderedModeTransition = false;
    if (sceneTransitionState) {
      if (sceneTransitionState.activeMode === null) {
        sceneTransitionState.activeMode = settings.visualizerMode;
        sceneTransitionState.fromMode = null;
        sceneTransitionState.elapsed = 0;
      } else if (sceneTransitionState.activeMode !== settings.visualizerMode) {
        if (visTransitionEnabled) {
          sceneTransitionState.fromMode = sceneTransitionState.activeMode;
          sceneTransitionState.activeMode = settings.visualizerMode;
          sceneTransitionState.elapsed = 0;
          sceneTransitionState.duration = transDur;
        } else {
          sceneTransitionState.activeMode = settings.visualizerMode;
          sceneTransitionState.fromMode = null;
        }
      }

      if (
        visTransitionEnabled &&
        sceneTransitionState.fromMode &&
        sceneTransitionState.fromMode !== sceneTransitionState.activeMode
      ) {
        sceneTransitionState.elapsed += Math.max(1 / 120, dt);
        const rawP = sceneTransitionState.elapsed / Math.max(0.05, sceneTransitionState.duration);
        if (rawP >= 1) {
          sceneTransitionState.fromMode = null;
        } else {
          sceneFromCanvas = ensureScratchCanvas(sceneFromCanvas, width, height);
          sceneToCanvas = ensureScratchCanvas(sceneToCanvas, width, height);
          const fromCtx = getContext2d(sceneFromCanvas);
          const toCtx = getContext2d(sceneToCanvas);
          if (fromCtx && toCtx) {
            fromCtx.clearRect(0, 0, width, height);
            toCtx.clearRect(0, 0, width, height);
            renderVisualizerScene(fromCtx, sceneTransitionState.fromMode);
            renderVisualizerScene(toCtx, settings.visualizerMode);
            compositeSceneTransition(
              ctx,
              sceneFromCanvas,
              sceneToCanvas,
              width,
              height,
              0,
              0,
              width,
              height,
              transType,
              easeInOutCubic(rawP),
              rawP,
              settings.primaryColor
            );
            renderedModeTransition = true;
          }
        }
      }
    }

    if (!renderedModeTransition) {
      renderVisualizerScene(ctx, settings.visualizerMode);
    }
  } else {
    if (particles.length > 0) {
      particles.length = 0;
    }
    if (sceneTransitionState) {
      sceneTransitionState.fromMode = null;
      sceneTransitionState.elapsed = 0;
    }
  }

  // 2b. Optional Floating Cover / Thumbnail Artwork Card
  const coverSource = settings.coverCardSource ?? 'auto';
  const coverImg =
    coverSource === 'bg'
      ? bgImage
      : coverSource === 'album'
      ? albumImage
      : albumImage ?? bgImage;
  const coverDims = getImageDimensions(coverImg);
  const coverCardPos = settings.coverCardPosition ?? 'top-left';
  const coverCardScale = Math.max(0.6, Math.min(1.4, settings.coverCardSize ?? 1));
  const hasRenderedCoverCard = Boolean(settings.showCoverCard && coverDims && coverImg);
  let coverCardRect: { x: number; y: number; size: number } | null = null;

  if (hasRenderedCoverCard && coverDims && coverImg) {
    const baseSize =
      coverCardPos === 'center'
        ? minDim * (isPortrait ? 0.34 : 0.32)
        : minDim * (isPortrait ? 0.145 : 0.13);
    const cardSize = Math.round(baseSize * coverCardScale);
    const radiusScale = Math.max(0, Math.min(32, settings.coverCardRadius ?? 14));
    const cardRadius = Math.min(
      cardSize * 0.5,
      Math.round((radiusScale / 32) * (cardSize * 0.5))
    );
    const cardX =
      coverCardPos === 'top-left' && !isPortrait
        ? safePadX
        : (width - cardSize) * 0.5;
    const cardY =
      coverCardPos === 'center'
        ? (height - cardSize) * (isPortrait ? 0.38 : 0.44)
        : safePadY;

    coverCardRect = { x: cardX, y: cardY, size: cardSize };

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.68)';
    ctx.shadowBlur = Math.max(16, cardSize * 0.22);
    ctx.fillStyle = '#090b10';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardSize, cardSize, cardRadius);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardSize, cardSize, cardRadius);
    ctx.clip();

    const imgRatio = coverDims.width / coverDims.height;
    let drawW = cardSize;
    let drawH = cardSize;
    let drawX = cardX;
    let drawY = cardY;
    if (imgRatio > 1) {
      drawW = cardSize * imgRatio;
      drawX = cardX - (drawW - cardSize) * 0.5;
    } else {
      drawH = cardSize / imgRatio;
      drawY = cardY - (drawH - cardSize) * 0.5;
    }
    ctx.drawImage(coverImg, drawX, drawY, drawW, drawH);

    // Subtle top-left glass sheen highlight
    const sheen = ctx.createLinearGradient(cardX, cardY, cardX + cardSize, cardY + cardSize);
    sheen.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    sheen.addColorStop(0.45, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(cardX, cardY, cardSize, cardSize);
    ctx.restore();

    ctx.strokeStyle = hexToRgba(settings.primaryColor, 0.52);
    ctx.lineWidth = Math.max(1.5, minDim * 0.0025);
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardSize, cardSize, cardRadius);
    ctx.stroke();
    ctx.restore();
  }

  // 2b. Beat & Lyric Synced Character Dance / Motion-Capture Skeleton
  if (settings.danceEnabled) {
    renderDanceCharacter({
      ctx,
      width,
      height,
      minDim,
      isPortrait,
      currentTime,
      dt,
      bass,
      mid,
      treble,
      beatBurst,
      beatTriggered,
      isExport,
      settings,
      lyrics,
      mocapClip,
      hexToRgba,
    });
  }

  // 3. Track Title & Artist Name Overlay
  if (settings.showTrackOverlay && (settings.trackTitle.trim() || settings.artistName.trim())) {
    ctx.save();
    const titleSize = Math.round(minDim * (isPortrait ? 0.04 : 0.036));
    const artistSize = Math.round(minDim * (isPortrait ? 0.028 : 0.024));

    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 10;

    if (isPortrait || (coverCardRect && coverCardPos === 'top-center')) {
      ctx.textAlign = 'center';
      const topY =
        coverCardRect && coverCardPos !== 'center'
          ? coverCardRect.y + coverCardRect.size + minDim * 0.022
          : safePadY * 1.1;
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
      const topX =
        coverCardRect && coverCardPos === 'top-left'
          ? coverCardRect.x + coverCardRect.size + minDim * 0.024
          : safePadX;
      const topY =
        coverCardRect && coverCardPos === 'top-left'
          ? coverCardRect.y + Math.max(0, (coverCardRect.size - titleSize * 2.35) * 0.5)
          : safePadY;
      const maxTextW = Math.max(width * 0.35, width - topX - safePadX);
      if (settings.trackTitle.trim()) {
        ctx.font = `700 ${titleSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(settings.trackTitle.trim(), topX, topY, maxTextW);
      }
      if (settings.artistName.trim()) {
        ctx.font = `500 ${artistSize}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillStyle = hexToRgba('#e2e8f0', 0.74);
        ctx.fillText(settings.artistName.trim(), topX, topY + titleSize * 1.25, maxTextW);
      }
    }
    ctx.restore();
  }

  // 4. Synced Lyrics Overlay
  const lyricsOnlyTopInset =
    coverCardRect && coverCardPos !== 'center'
      ? coverCardRect.y +
        coverCardRect.size +
        (settings.showTrackOverlay &&
        (Boolean(settings.trackTitle.trim()) || Boolean(settings.artistName.trim())) &&
        (isPortrait || coverCardPos === 'top-center')
          ? minDim * (isPortrait ? 0.11 : 0.095)
          : minDim * 0.03)
      : undefined;

  const lyricPulseIntensity = Math.max(0, Math.min(2, settings.lyricPulseIntensity ?? 1));
  const lyricBeatImpulse = Math.max(beatTriggered ? 1 : 0, Math.min(1, beatBurst));
  const lyricBeatDrive =
    settings.lyricBeatSync && lyricPulseIntensity > 0 && lyricBeatImpulse > 0.01
      ? Math.pow(lyricBeatImpulse, 0.85) * lyricPulseIntensity
      : 0;

  renderLyrics(
    ctx,
    width,
    height,
    minDim,
    isPortrait,
    safePadX,
    lyricPosFrac,
    currentTime,
    bass,
    settings,
    lyrics,
    lyricsOnlyTopInset,
    lyricBeatDrive
  );

  // Restore screen-space transform after Bass Shake before motion blur capture, glitch FX & safe zone
  ctx.restore();

  // Store current frame(s) (before editor-only safe-zone guide) for next-frame motion blur kernel
  if (motionBlurState) {
    if (activeMotionBlurPreset !== 'none') {
      if (activeMotionBlurPreset === 'ghosting') {
        if (
          motionBlurState.hasFrame &&
          motionBlurState.canvas &&
          motionBlurState.canvas.width === width &&
          motionBlurState.canvas.height === height
        ) {
          motionBlurState.secondaryCanvas = ensureScratchCanvas(
            motionBlurState.secondaryCanvas ?? null,
            width,
            height
          );
          const secCtx = getContext2d(motionBlurState.secondaryCanvas, { alpha: false });
          if (secCtx) {
            secCtx.drawImage(motionBlurState.canvas, 0, 0, width, height);
          }
        }
        motionBlurState.canvas = ensureScratchCanvas(motionBlurState.canvas, width, height);
        const prevCtx = getContext2d(motionBlurState.canvas, { alpha: false });
        if (prevCtx) {
          prevCtx.drawImage(ctx.canvas, 0, 0, width, height);
          motionBlurState.hasFrame = true;
        }
      } else if (activeMotionBlurPreset === 'stutter') {
        const nextIdx = (motionBlurState.frameIndex ?? 0) + 1;
        motionBlurState.frameIndex = nextIdx;
        const stutterCadence = Math.max(2, Math.round(2 + (motionBlurAlpha / 0.85) * 3));
        const shouldCapture =
          !motionBlurState.hasFrame ||
          !motionBlurState.canvas ||
          motionBlurState.canvas.width !== width ||
          motionBlurState.canvas.height !== height ||
          nextIdx % stutterCadence === 0;

        if (shouldCapture) {
          motionBlurState.canvas = ensureScratchCanvas(motionBlurState.canvas, width, height);
          const prevCtx = getContext2d(motionBlurState.canvas, { alpha: false });
          if (prevCtx) {
            prevCtx.drawImage(ctx.canvas, 0, 0, width, height);
            const smearShift = Math.max(2, Math.round(minDim * 0.004 * (motionBlurAlpha / 0.85)));
            prevCtx.save();
            prevCtx.globalAlpha = 0.32;
            prevCtx.drawImage(ctx.canvas, smearShift, 0, width, height);
            prevCtx.restore();
            motionBlurState.hasFrame = true;
          }
        }
      } else {
        motionBlurState.canvas = ensureScratchCanvas(motionBlurState.canvas, width, height);
        const prevCtx = getContext2d(motionBlurState.canvas, { alpha: false });
        if (prevCtx) {
          prevCtx.drawImage(ctx.canvas, 0, 0, width, height);
          motionBlurState.hasFrame = true;
        }
      }
    } else {
      motionBlurState.hasFrame = false;
      motionBlurState.frameIndex = 0;
    }
  }

  // 4a-post. Uniform Scene-Wide Global Glow Emission Pass
  renderGlobalGlowEffect(
    ctx,
    width,
    height,
    minDim,
    settings.globalGlow ?? 0
  );

  // 4b. Beat-Triggered Glitch Post-Processing (randomized frame-drops, slice tears, & chromatic aberration)
  renderBeatGlitchEffect(
    ctx,
    width,
    height,
    currentTime,
    settings.glitchIntensity ?? 0,
    beatBurst,
    beatTriggered
  );

  // 4c. Brightness-Reactive Vintage CRT Scanline Texture Overlay
  renderCrtScanlineEffect(
    ctx,
    width,
    height,
    minDim,
    currentTime,
    settings.scanlineIntensity ?? 0,
    settings.scanlineColor,
    settings.primaryColor,
    beatBurst,
    Boolean(isExport)
  );

  // 5. Optional Safe-Zone & Composition Grid Guide (Preview only)
  if (!isExport && settings.showSafeZone) {
    renderSafeZoneGuide(ctx, width, height, minDim, isPortrait, settings.aspectRatio, lyricPosFrac);
  }

  ctx.restore();
}

function renderSafeZoneGuide(
  ctx: RenderContext2D,
  width: number,
  height: number,
  minDim: number,
  isPortrait: boolean,
  aspectRatio: StudioSettings['aspectRatio'],
  lyricPosFrac: number
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
    const lyricLineY = Math.round(height * lyricPosFrac) + 0.5;
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

function resolveLyricsOnlyRange(
  lyrics: LyricLine[],
  focusIdx: number,
  layout: LyricsOnlyLayout
): { startIdx: number; endIdx: number } {
  const total = lyrics.length;
  if (total === 0) return { startIdx: 0, endIdx: -1 };
  if (layout === 'full-lyrics') {
    return { startIdx: 0, endIdx: total - 1 };
  }

  if (layout === 'half-verse') {
    const windowSize = Math.min(total, 5);
    let startIdx = Math.max(0, focusIdx - 2);
    let endIdx = startIdx + windowSize - 1;
    if (endIdx >= total) {
      endIdx = total - 1;
      startIdx = Math.max(0, endIdx - windowSize + 1);
    }
    return { startIdx, endIdx };
  }

  // 'full-verse': split by instrumental/stanza pauses (>= 4.2s) or balanced 8-line stanzas
  const verses: Array<{ start: number; end: number }> = [];
  let vStart = 0;
  for (let i = 1; i < total; i++) {
    const gap = lyrics[i].time - lyrics[i - 1].time;
    const len = i - vStart;
    if (gap >= 4.2 || len >= 8) {
      verses.push({ start: vStart, end: i - 1 });
      vStart = i;
    }
  }
  verses.push({ start: vStart, end: total - 1 });

  const matched =
    verses.find((v) => focusIdx >= v.start && focusIdx <= v.end) ?? verses[0];
  let startIdx = matched.start;
  let endIdx = matched.end;

  // Ensure a full verse always reveals a generous minimum (at least 6 lines if available)
  const minVerseLines = Math.min(total, 6);
  while (endIdx - startIdx + 1 < minVerseLines) {
    if (startIdx > 0 && (focusIdx - startIdx <= endIdx - focusIdx || endIdx === total - 1)) {
      startIdx -= 1;
    } else if (endIdx < total - 1) {
      endIdx += 1;
    } else {
      break;
    }
  }

  return { startIdx, endIdx };
}

interface LyricsOnlyMeasuredEntry {
  globalIdx: number;
  lines: string[];
  isActive: boolean;
  blockH: number;
  maxW: number;
}

interface CachedLyricsOnlyLayout {
  key: string;
  lyricsRef: LyricLine[];
  fontSize: number;
  useTwoCols: boolean;
  measured: {
    entries: LyricsOnlyMeasuredEntry[];
    totalH: number;
    activeFs: number;
    sideLineH: number;
    activeLineH: number;
    gapY: number;
  };
}

let lyricsOnlyLayoutCache: CachedLyricsOnlyLayout | null = null;

function renderLyricsOnlyState(
  ctx: RenderContext2D,
  width: number,
  height: number,
  minDim: number,
  isPortrait: boolean,
  safePadX: number,
  lyricPosFrac: number,
  currentTime: number,
  bass: number,
  settings: StudioSettings,
  lyrics: LyricLine[],
  activeIdx: number,
  topInsetOverride?: number,
  lyricBeatDrive = 0
): void {
  if (lyrics.length === 0) return;

  const beatDrive = Math.max(0, Math.min(2, lyricBeatDrive));
  const beatScale = 1 + beatDrive * 0.065;
  const beatGlowColor =
    beatDrive > 0.01
      ? hexToRgba(settings.primaryColor, Math.min(0.96, 0.48 + beatDrive * 0.34))
      : undefined;

  const layout: LyricsOnlyLayout = settings.lyricsOnlyLayout ?? 'full-verse';
  const focusIdx = activeIdx >= 0 ? activeIdx : 0;
  const isPreIntro = activeIdx < 0;
  const { startIdx, endIdx } = resolveLyricsOnlyRange(lyrics, focusIdx, layout);
  const visibleCount = Math.max(1, endIdx - startIdx + 1);

  const hasTrackHeader =
    settings.showTrackOverlay &&
    (Boolean(settings.trackTitle.trim()) || Boolean(settings.artistName.trim()));
  const baseStageTop = hasTrackHeader ? height * (isPortrait ? 0.16 : 0.17) : height * 0.08;
  const stageTop =
    topInsetOverride !== undefined ? Math.max(baseStageTop, topInsetOverride) : baseStageTop;
  const stageBottom = height * (isPortrait ? 0.9 : 0.92);
  const stageH = Math.max(120, stageBottom - stageTop);

  type MeasuredEntry = LyricsOnlyMeasuredEntry;

  const styleSpec = getLyricsOnlyStyleSpec(settings.lyricStyle, settings.lyricFont);
  const formatLineText = (txt: string) =>
    styleSpec.uppercase ? txt.toUpperCase() : txt;
  const italicPrefix = styleSpec.italic ? 'italic ' : '';

  const singleColMaxW = width - safePadX * 2.2;
  const cacheKey = `${width}x${height}|${isPortrait ? 1 : 0}|${safePadX.toFixed(1)}|${stageTop.toFixed(1)}|${layout}|${settings.lyricStyle}|${settings.lyricFont}|${settings.lyricLetterSpacing ?? 0}|${activeIdx}|${startIdx}-${endIdx}|${lyrics.length}|${lyrics[focusIdx]?.text ?? ''}|${lyrics[0]?.text ?? ''}`;

  let fontSize: number;
  let useTwoCols: boolean;
  let measured: CachedLyricsOnlyLayout['measured'];

  if (
    lyricsOnlyLayoutCache &&
    lyricsOnlyLayoutCache.lyricsRef === lyrics &&
    lyricsOnlyLayoutCache.key === cacheKey
  ) {
    fontSize = lyricsOnlyLayoutCache.fontSize;
    useTwoCols = lyricsOnlyLayoutCache.useTwoCols;
    measured = lyricsOnlyLayoutCache.measured;
  } else {
    fontSize = Math.round(
      minDim *
        (layout === 'half-verse'
          ? isPortrait
            ? 0.041
            : 0.038
          : layout === 'full-verse'
          ? isPortrait
            ? 0.035
            : 0.032
          : isPortrait
          ? 0.029
          : 0.028)
    );
    const minFontSize = Math.max(13, Math.round(minDim * (layout === 'full-lyrics' ? 0.019 : 0.022)));

    const measureBlock = (fs: number, colWidth: number) => {
      const activeFs = Math.round(fs * (layout === 'full-lyrics' ? 1.08 : 1.12));
      const sideLineH = fs * 1.28;
      const activeLineH = activeFs * 1.26;
      const gapY = fs * (layout === 'full-lyrics' ? 0.48 : 0.62);
      const entries: MeasuredEntry[] = [];
      let totalH = 0;

      ctx.save();
      for (let i = startIdx; i <= endIdx; i++) {
        const isActive = !isPreIntro && i === activeIdx;
        const entryFs = isActive ? activeFs : fs;
        const entryLineH = isActive ? activeLineH : sideLineH;
        ctx.font = `${italicPrefix}${isActive ? 700 : 500} ${entryFs}px ${styleSpec.fontFamily}`;
        applyLyricLetterSpacing(ctx, entryFs, settings.lyricLetterSpacing);
        const wrapped = wrapTextLines(ctx, formatLineText(lyrics[i].text), colWidth);
        const maxW = wrapped.reduce((acc, l) => Math.max(acc, ctx.measureText(l).width), 0);
        const blockH = wrapped.length * entryLineH;
        entries.push({ globalIdx: i, lines: wrapped, isActive, blockH, maxW });
        totalH += blockH + (i < endIdx ? gapY : 0);
      }
      ctx.restore();

      return { entries, totalH, activeFs, sideLineH, activeLineH, gapY };
    };

    useTwoCols = false;
    measured = measureBlock(fontSize, singleColMaxW);

    // Shrink font size smoothly so half-verse, full-verse, and full-lyrics fit inside the stage
    while (measured.totalH > stageH * 0.94 && fontSize > minFontSize) {
      fontSize = Math.max(minFontSize, fontSize - 2);
      measured = measureBlock(fontSize, singleColMaxW);
    }

    // On landscape/square in Full Lyrics mode, split into 2 balanced columns if still taller than stage
    if (
      layout === 'full-lyrics' &&
      !isPortrait &&
      measured.totalH > stageH * 0.96 &&
      visibleCount >= 8
    ) {
      const colGap = Math.max(28, width * 0.045);
      const colW = (width - safePadX * 2 - colGap) * 0.5;
      let twoColFs = Math.max(
        minFontSize,
        Math.round(minDim * 0.025)
      );
      let colMeasure = measureBlock(twoColFs, colW);
      while (colMeasure.totalH > stageH * 1.78 && twoColFs > minFontSize) {
        twoColFs = Math.max(minFontSize, twoColFs - 2);
        colMeasure = measureBlock(twoColFs, colW);
      }
      fontSize = twoColFs;
      measured = colMeasure;
      useTwoCols = true;
    }

    lyricsOnlyLayoutCache = {
      key: cacheKey,
      lyricsRef: lyrics,
      fontSize,
      useTwoCols,
      measured,
    };
  }

  const drawLyricsOnlyContainer = (boxX: number, boxY: number, boxW: number, boxH: number) => {
    if (styleSpec.containerKind === 'none') return;
    ctx.save();
    if (styleSpec.containerKind === 'glass-box') {
      const glassGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
      glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
      glassGrad.addColorStop(1, 'rgba(15, 23, 42, 0.68)');
      ctx.fillStyle = glassGrad;
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else if (styleSpec.containerKind === 'hud-box') {
      ctx.fillStyle = 'rgba(6, 12, 22, 0.76)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      const tick = Math.min(20, boxH * 0.16);
      ctx.strokeStyle = settings.primaryColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(boxX, boxY + tick);
      ctx.lineTo(boxX, boxY);
      ctx.lineTo(boxX + tick, boxY);
      ctx.moveTo(boxX + boxW - tick, boxY);
      ctx.lineTo(boxX + boxW, boxY);
      ctx.lineTo(boxX + boxW, boxY + tick);
      ctx.moveTo(boxX, boxY + boxH - tick);
      ctx.lineTo(boxX, boxY + boxH);
      ctx.lineTo(boxX + tick, boxY + boxH);
      ctx.moveTo(boxX + boxW - tick, boxY + boxH);
      ctx.lineTo(boxX + boxW, boxY + boxH);
      ctx.lineTo(boxX + boxW, boxY + boxH - tick);
      ctx.stroke();
    } else if (styleSpec.containerKind === 'ribbon-box') {
      ctx.fillStyle = 'rgba(9, 11, 16, 0.8)';
      ctx.fillRect(0, boxY, width, boxH);
      ctx.fillStyle = settings.primaryColor;
      ctx.fillRect(0, boxY, width, 2);
      ctx.fillRect(0, boxY + boxH - 2, width, 2);
    } else {
      ctx.fillStyle = 'rgba(9, 11, 16, 0.74)';
      ctx.beginPath();
      ctx.roundRect(boxX, boxY, boxW, boxH, 16);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawSingleEntry = (
    entry: MeasuredEntry,
    centerX: number,
    entryTopY: number,
    colMaxW: number
  ) => {
    const isActive = entry.isActive;
    const isPast = !isPreIntro && entry.globalIdx < activeIdx;
    const isPreFocus = isPreIntro && entry.globalIdx === 0;
    const entryFs = isActive ? measured.activeFs : fontSize;
    const lineH = isActive ? measured.activeLineH : measured.sideLineH;
    const entryCenterY = entryTopY + entry.blockH * 0.5;

    ctx.save();
    ctx.translate(centerX, entryCenterY);

    if (isActive) {
      const currLine = lyrics[entry.globalIdx];
      const elapsed = Math.max(0, currentTime - currLine.time);
      const pop = elapsed < 0.14 ? 0.96 + (elapsed / 0.14) * 0.04 : 1;
      const scale = pop * (1 + Math.min(0.03, bass * 0.025)) * beatScale;
      ctx.scale(scale, scale);

      if (styleSpec.activeHighlightKind === 'pill') {
        const padX = entryFs * 0.65;
        const padY = entryFs * 0.34;
        const boxW = Math.min(colMaxW + padX * 1.4, entry.maxW + padX * 2);
        const boxH = entry.blockH + padY * 2;
        if (beatDrive > 0.01 && beatGlowColor) {
          applyLyricTextShadow(ctx, 'transparent', 14, 1, 0, beatGlowColor, beatDrive * 0.7);
        }
        ctx.fillStyle = 'rgba(9, 11, 16, 0.78)';
        ctx.beginPath();
        ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, Math.min(16, entryFs * 0.45));
        ctx.fill();
        applyLyricTextShadow(ctx, 'transparent', 0, 0);
        ctx.strokeStyle = hexToRgba(settings.primaryColor, Math.min(0.98, 0.65 + beatDrive * 0.25));
        ctx.lineWidth = 1.75;
        ctx.stroke();
      } else if (styleSpec.activeHighlightKind === 'duotone-badge') {
        const padX = entryFs * 0.68;
        const padY = entryFs * 0.32;
        const boxW = Math.min(colMaxW + padX * 1.4, entry.maxW + padX * 2);
        const boxH = entry.blockH + padY * 2;
        if (beatDrive > 0.01 && beatGlowColor) {
          applyLyricTextShadow(ctx, 'transparent', 16, 1, 0, beatGlowColor, beatDrive);
        }
        const pillGrad = ctx.createLinearGradient(-boxW * 0.5, 0, boxW * 0.5, 0);
        pillGrad.addColorStop(0, settings.primaryColor);
        pillGrad.addColorStop(1, settings.secondaryColor);
        ctx.fillStyle = pillGrad;
        ctx.beginPath();
        ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, Math.min(16, entryFs * 0.45));
        ctx.fill();
        applyLyricTextShadow(ctx, 'transparent', 0, 0);
      }
    }

    ctx.font = `${italicPrefix}${isActive || isPreFocus ? 700 : 500} ${entryFs}px ${styleSpec.fontFamily}`;
    applyLyricLetterSpacing(ctx, entryFs, settings.lyricLetterSpacing);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const startLineY = -((entry.lines.length - 1) * lineH) * 0.5;
    const shadowIntensity = Math.max(0, Math.min(2, settings.lyricShadowIntensity ?? 1));
    const hasEntryBgBox =
      styleSpec.containerKind !== 'none' ||
      (isActive &&
        (styleSpec.activeHighlightKind === 'pill' ||
          styleSpec.activeHighlightKind === 'duotone-badge'));

    if (isActive && styleSpec.activeHighlightKind === 'neon-outline') {
      entry.lines.forEach((line, idx) => {
        const ly = startLineY + idx * lineH;
        if (!hasEntryBgBox) {
          drawLyricDarkBackdropShadow(ctx, line, 0, ly, entryFs, shadowIntensity);
        }
        applyLyricTextShadow(
          ctx,
          settings.primaryColor,
          16,
          shadowIntensity,
          0,
          beatGlowColor,
          beatDrive
        );
        ctx.strokeStyle = settings.primaryColor;
        ctx.lineWidth = Math.max(1.8, entryFs * 0.065);
        ctx.strokeText(line, 0, ly);
        applyLyricTextShadow(ctx, 'transparent', 0, 0);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.fillText(line, 0, ly);
      });
      ctx.restore();
      return;
    }

    if (isActive && styleSpec.activeHighlightKind === 'retro') {
      const off = Math.max(1.8, entryFs * 0.07);
      entry.lines.forEach((line, idx) => {
        const ly = startLineY + idx * lineH;
        if (!hasEntryBgBox) {
          drawLyricDarkBackdropShadow(ctx, line, off, ly + off, entryFs, shadowIntensity);
        }
        ctx.fillStyle = settings.secondaryColor;
        ctx.fillText(line, off * 1.6, ly + off * 1.6);
        ctx.fillStyle = settings.primaryColor;
        ctx.fillText(line, off * 0.8, ly + off * 0.8);
        applyLyricTextShadow(ctx, 'transparent', 0, 0, 0, beatGlowColor, beatDrive);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, 0, ly);
      });
      ctx.restore();
      return;
    }

    if (isActive && styleSpec.activeHighlightKind === 'glitch') {
      const shift = Math.sin(currentTime * 64) * (1.8 + bass * 4 + beatDrive * 2);
      entry.lines.forEach((line, idx) => {
        const ly = startLineY + idx * lineH;
        if (!hasEntryBgBox) {
          drawLyricDarkBackdropShadow(ctx, line, 0, ly, entryFs, shadowIntensity);
        }
        ctx.fillStyle = hexToRgba(settings.primaryColor, 0.78);
        ctx.fillText(line, -shift - 1.5, ly);
        ctx.fillStyle = hexToRgba(settings.secondaryColor, 0.78);
        ctx.fillText(line, shift + 1.5, ly);
        applyLyricTextShadow(ctx, 'transparent', 0, 0, 0, beatGlowColor, beatDrive);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, 0, ly);
      });
      ctx.restore();
      return;
    }

    if (isActive && styleSpec.activeHighlightKind === 'duotone-badge') {
      ctx.fillStyle = '#090b10';
      applyLyricTextShadow(ctx, 'transparent', 0, 0);
      entry.lines.forEach((line, idx) => {
        ctx.fillText(line, 0, startLineY + idx * lineH);
      });
      ctx.restore();
      return;
    }

    entry.lines.forEach((line, idx) => {
      const ly = startLineY + idx * lineH;
      if (!hasEntryBgBox && (isActive || isPreFocus)) {
        drawLyricDarkBackdropShadow(
          ctx,
          line,
          0,
          ly,
          entryFs,
          isActive ? shadowIntensity : shadowIntensity * 0.65
        );
      }

      if (isActive) {
        if (styleSpec.activeHighlightKind === 'gradient') {
          const gradW = Math.max(120, entry.maxW * 0.55);
          const textGrad = ctx.createLinearGradient(-gradW, 0, gradW, 0);
          textGrad.addColorStop(0, '#ffffff');
          textGrad.addColorStop(0.5, settings.primaryColor);
          textGrad.addColorStop(1, '#ffffff');
          ctx.fillStyle = textGrad;
          applyLyricTextShadow(
            ctx,
            hexToRgba(settings.primaryColor, 0.6),
            16,
            shadowIntensity,
            0,
            beatGlowColor,
            beatDrive
          );
        } else {
          ctx.fillStyle =
            styleSpec.activeHighlightKind === 'solid-primary'
              ? settings.primaryColor
              : '#ffffff';
          applyLyricTextShadow(
            ctx,
            hexToRgba(settings.primaryColor, 0.48),
            12,
            shadowIntensity,
            0,
            beatGlowColor,
            beatDrive
          );
        }
      } else if (isPreFocus) {
        ctx.fillStyle = hexToRgba(settings.primaryColor, 0.9);
        applyLyricTextShadow(ctx, 'rgba(0, 0, 0, 0.65)', 8, shadowIntensity, 1.5);
      } else if (isPast) {
        ctx.fillStyle = 'rgba(226, 232, 240, 0.42)';
        applyLyricTextShadow(ctx, 'rgba(0, 0, 0, 0.6)', 6, shadowIntensity, 1);
      } else {
        ctx.fillStyle = 'rgba(241, 245, 249, 0.8)';
        applyLyricTextShadow(ctx, 'rgba(0, 0, 0, 0.68)', 6, shadowIntensity, 1.5);
      }

      ctx.fillText(line, 0, ly);
    });
    ctx.restore();
  };

  if (useTwoCols) {
    const colGap = Math.max(28, width * 0.045);
    const colW = (width - safePadX * 2 - colGap) * 0.5;
    const leftCenterX = safePadX + colW * 0.5;
    const rightCenterX = width - safePadX - colW * 0.5;

    // Balance split index by cumulative height
    const totalH = measured.totalH;
    let splitIdx = Math.ceil(measured.entries.length / 2);
    let runningH = 0;
    for (let i = 0; i < measured.entries.length; i++) {
      runningH += measured.entries[i].blockH + measured.gapY;
      if (runningH >= totalH * 0.5 && i >= 1) {
        splitIdx = i + 1;
        break;
      }
    }

    const leftEntries = measured.entries.slice(0, splitIdx);
    const rightEntries = measured.entries.slice(splitIdx);
    const sumColH = (arr: MeasuredEntry[]) =>
      arr.reduce(
        (acc, e, idx) => acc + e.blockH + (idx < arr.length - 1 ? measured.gapY : 0),
        0
      );
    const leftH = sumColH(leftEntries);
    const rightH = sumColH(rightEntries);
    const maxColH = Math.max(leftH, rightH);

    // If two columns fit cleanly in stage, center them; otherwise scroll active column gently
    const blockStartY =
      maxColH <= stageH
        ? stageTop + (stageH - maxColH) * 0.5
        : stageTop + fontSize * 0.4;

    if (styleSpec.containerKind !== 'none') {
      const boxW = width - safePadX * 1.4;
      const boxH = Math.min(stageH, maxColH + fontSize * 1.4);
      const boxX = (width - boxW) * 0.5;
      const boxY = Math.max(stageTop - fontSize * 0.4, blockStartY - fontSize * 0.7);
      drawLyricsOnlyContainer(boxX, boxY, boxW, boxH);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, stageTop - 6, width, stageH + 12);
    ctx.clip();

    const drawColumn = (arr: MeasuredEntry[], cx: number) => {
      const colH = sumColH(arr);
      const activeLocalIdx = arr.findIndex((e) => e.isActive);
      let scrollOffset = 0;
      if (colH > stageH && activeLocalIdx >= 0) {
        let activeTop = 0;
        for (let i = 0; i < activeLocalIdx; i++) {
          activeTop += arr[i].blockH + measured.gapY;
        }
        const activeCenter = activeTop + arr[activeLocalIdx].blockH * 0.5;
        scrollOffset = Math.max(0, Math.min(colH - stageH, activeCenter - stageH * 0.5));
      }
      let y = blockStartY - scrollOffset;
      for (const entry of arr) {
        if (y + entry.blockH >= stageTop - 20 && y <= stageBottom + 20) {
          drawSingleEntry(entry, cx, y, colW);
        }
        y += entry.blockH + measured.gapY;
      }
    };

    drawColumn(leftEntries, leftCenterX);
    drawColumn(rightEntries, rightCenterX);
    ctx.restore();
    return;
  }

  // Single-column layout (Half Verse, Full Verse, or Full Lyrics)
  const totalH = measured.totalH;
  let blockStartY: number;
  if (totalH <= stageH) {
    // Allow subtle user position bias while clamping strictly so no line ever clips
    const desiredCenterY =
      layout === 'full-lyrics'
        ? stageTop + stageH * 0.5
        : stageTop + stageH * (0.28 + lyricPosFrac * 0.44);
    const minStart = stageTop;
    const maxStart = stageBottom - totalH;
    blockStartY = Math.max(minStart, Math.min(maxStart, desiredCenterY - totalH * 0.5));
  } else {
    // Smoothly track active line inside stage viewport for extra-long full-lyrics songs
    const activeLocalIdx = Math.max(0, focusIdx - startIdx);
    let activeTop = 0;
    for (let i = 0; i < activeLocalIdx; i++) {
      activeTop += measured.entries[i].blockH + measured.gapY;
    }
    const activeCenter =
      activeTop + (measured.entries[activeLocalIdx]?.blockH ?? 0) * 0.5;
    const maxScroll = Math.max(0, totalH - stageH);
    const scrollOffset = Math.max(0, Math.min(maxScroll, activeCenter - stageH * 0.46));
    blockStartY = stageTop - scrollOffset;
  }

  if (styleSpec.containerKind !== 'none') {
    const maxContentW = measured.entries.reduce((acc, e) => Math.max(acc, e.maxW), 0);
    const padX = fontSize * 1.05;
    const padY = fontSize * 0.7;
    const boxW = Math.min(width - safePadX * 1.4, maxContentW + padX * 2);
    const boxH = Math.min(stageH, totalH + padY * 2);
    const boxX = (width - boxW) * 0.5;
    const boxY = Math.max(
      stageTop - padY * 0.35,
      totalH <= stageH ? blockStartY - padY : stageTop
    );
    drawLyricsOnlyContainer(boxX, boxY, boxW, boxH);
  }

  ctx.save();
  if (totalH > stageH) {
    ctx.beginPath();
    ctx.rect(0, stageTop - 8, width, stageH + 16);
    ctx.clip();
  }

  let cursorY = blockStartY;
  for (const entry of measured.entries) {
    if (cursorY + entry.blockH >= stageTop - 24 && cursorY <= stageBottom + 24) {
      drawSingleEntry(entry, width * 0.5, cursorY, singleColMaxW);
    }
    cursorY += entry.blockH + measured.gapY;
  }
  ctx.restore();
}

function renderLyricState(
  ctx: RenderContext2D,
  width: number,
  height: number,
  minDim: number,
  isPortrait: boolean,
  safePadX: number,
  lyricPosFrac: number,
  currentTime: number,
  bass: number,
  settings: StudioSettings,
  lyrics: LyricLine[],
  activeIdx: number,
  topInsetOverride?: number,
  lyricBeatDrive = 0
): void {
  if (settings.lyricsOnly) {
    renderLyricsOnlyState(
      ctx,
      width,
      height,
      minDim,
      isPortrait,
      safePadX,
      lyricPosFrac,
      currentTime,
      bass,
      settings,
      lyrics,
      activeIdx,
      topInsetOverride,
      lyricBeatDrive
    );
    return;
  }

  const maxTextWidth = width - safePadX * 2.2;
  const shadowIntensity = Math.max(0, Math.min(2, settings.lyricShadowIntensity ?? 1));
  const beatDrive = Math.max(0, Math.min(2, lyricBeatDrive));
  const beatScale = 1 + beatDrive * 0.065;
  const beatGlowColor =
    beatDrive > 0.01
      ? hexToRgba(settings.primaryColor, Math.min(0.96, 0.48 + beatDrive * 0.34))
      : undefined;

  if (settings.lyricStyle === 'karaoke') {
    const activeFontSize = Math.round(minDim * (isPortrait ? 0.044 : 0.042));
    const sideFontSize = Math.round(activeFontSize * 0.74);
    const anchorY = height * lyricPosFrac;

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
      const scale = pop * (1 + Math.min(0.045, bass * 0.04)) * beatScale;

      ctx.save();
      ctx.translate(width * 0.5, anchorY);
      ctx.scale(scale, scale);

      const lyricFontFamily = resolveLyricFontFamily(
        settings.lyricFont,
        '"Plus Jakarta Sans", sans-serif'
      );
      ctx.font = `700 ${activeFontSize}px ${lyricFontFamily}`;
      applyLyricLetterSpacing(ctx, activeFontSize, settings.lyricLetterSpacing);
      const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth);
      const lineH = activeFontSize * 1.24;
      activeBlockHeight = wrapped.length * lineH;

      const textGrad = ctx.createLinearGradient(-maxTextWidth * 0.4, 0, maxTextWidth * 0.4, 0);
      textGrad.addColorStop(0, '#ffffff');
      textGrad.addColorStop(0.5, settings.primaryColor);
      textGrad.addColorStop(1, '#ffffff');

      const startY = -((wrapped.length - 1) * lineH) * 0.5;
      wrapped.forEach((line, idx) => {
        const ly = startY + idx * lineH;
        drawLyricDarkBackdropShadow(ctx, line, 0, ly, activeFontSize, shadowIntensity);
        ctx.fillStyle = textGrad;
        applyLyricTextShadow(
          ctx,
          hexToRgba(settings.primaryColor, 0.55),
          16,
          shadowIntensity,
          0,
          beatGlowColor,
          beatDrive
        );
        ctx.fillText(line, 0, ly);
      });
      ctx.restore();
    }

    // Previous line
    if (prevLine) {
      const sideFontFamily = resolveLyricFontFamily(
        settings.lyricFont,
        '"Plus Jakarta Sans", sans-serif'
      );
      ctx.font = `500 ${sideFontSize}px ${sideFontFamily}`;
      applyLyricLetterSpacing(ctx, sideFontSize, settings.lyricLetterSpacing);
      const prevWrapped = wrapTextLines(ctx, prevLine.text, maxTextWidth);
      const displayPrev = prevWrapped[prevWrapped.length - 1] || prevLine.text;
      const py = anchorY - activeBlockHeight * 0.5 - sideFontSize * 1.35;
      drawLyricDarkBackdropShadow(ctx, displayPrev, width * 0.5, py, sideFontSize, shadowIntensity * 0.65);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.4)';
      applyLyricTextShadow(ctx, 'rgba(0, 0, 0, 0.72)', 6, shadowIntensity, 1.5);
      ctx.fillText(displayPrev, width * 0.5, py);
    }

    // Upcoming line
    if (nextLine) {
      const nextFontFamily = resolveLyricFontFamily(
        settings.lyricFont,
        '"Plus Jakarta Sans", sans-serif'
      );
      ctx.font = `500 ${sideFontSize}px ${nextFontFamily}`;
      applyLyricLetterSpacing(ctx, sideFontSize, settings.lyricLetterSpacing);
      const nextWrapped = wrapTextLines(ctx, nextLine.text, maxTextWidth);
      const displayNext = nextWrapped[0] || nextLine.text;
      const ny = anchorY + activeBlockHeight * 0.5 + sideFontSize * 1.35;
      drawLyricDarkBackdropShadow(ctx, displayNext, width * 0.5, ny, sideFontSize, shadowIntensity * 0.65);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.46)';
      applyLyricTextShadow(ctx, 'rgba(0, 0, 0, 0.72)', 6, shadowIntensity, 1.5);
      ctx.fillText(displayNext, width * 0.5, ny);
    }

    ctx.restore();
    return;
  }

  if (
    settings.lyricStyle === 'floating-cloud' ||
    settings.lyricStyle === 'vertical-spine'
  ) {
    renderExtraLyricStyle(settings.lyricStyle, {
      ctx,
      width,
      height,
      minDim,
      isPortrait,
      safePadX,
      lyricPosFrac,
      currentTime,
      bass,
      settings,
      lyrics,
      activeIdx,
      maxTextWidth,
      wrapTextLines,
      hexToRgba,
      lyricBeatDrive: beatDrive,
    });
    return;
  }

  if (activeIdx < 0) return;
  const currLine = lyrics[activeIdx];

  if (settings.lyricStyle === 'single-pop') {
    const fontSize = Math.round(minDim * (isPortrait ? 0.048 : 0.045));
    const anchorY = height * lyricPosFrac;
    const elapsed = Math.max(0, currentTime - currLine.time);
    const introScale = elapsed < 0.14 ? 0.86 + (elapsed / 0.14) * 0.14 : 1;
    const beatScaleTotal = introScale * (1 + Math.min(0.08, bass * 0.07)) * beatScale;

    ctx.save();
    ctx.font = `700 ${fontSize}px ${resolveLyricFontFamily(
      settings.lyricFont,
      '"Plus Jakarta Sans", sans-serif'
    )}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.88);
    const lineH = fontSize * 1.26;
    const maxLineW = wrapped.reduce((acc, l) => Math.max(acc, ctx.measureText(l).width), 0);

    const padX = fontSize * 0.75;
    const padY = fontSize * 0.45;
    const boxW = maxLineW + padX * 2;
    const boxH = wrapped.length * lineH + padY * 2;

    ctx.translate(width * 0.5, anchorY);
    ctx.scale(beatScaleTotal, beatScaleTotal);

    // Pill/card backdrop
    applyLyricTextShadow(
      ctx,
      'rgba(0, 0, 0, 0.72)',
      24,
      shadowIntensity,
      4,
      beatGlowColor,
      beatDrive * 0.75
    );
    ctx.fillStyle = 'rgba(9, 11, 16, 0.78)';
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, Math.min(20, fontSize * 0.48));
    ctx.fill();

    applyLyricTextShadow(ctx, 'transparent', 0, 0);
    ctx.strokeStyle = hexToRgba(settings.primaryColor, Math.min(0.96, 0.55 + beatDrive * 0.3));
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    applyLyricTextShadow(
      ctx,
      'rgba(0, 0, 0, 0.85)',
      8,
      shadowIntensity,
      1.5,
      beatGlowColor,
      beatDrive
    );
    const startY = -((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((line, idx) => {
      ctx.fillText(line, 0, startY + idx * lineH);
    });

    ctx.restore();
    return;
  }

  if (settings.lyricStyle === 'subtitle-bar') {
    const fontSize = Math.round(minDim * (isPortrait ? 0.039 : 0.036));
    const anchorY = height * lyricPosFrac;

    ctx.save();
    ctx.font = `600 ${fontSize}px ${resolveLyricFontFamily(
      settings.lyricFont,
      '"Plus Jakarta Sans", sans-serif'
    )}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.88);
    const lineH = fontSize * 1.3;
    const maxLineW = wrapped.reduce((acc, l) => Math.max(acc, ctx.measureText(l).width), 0);

    const padX = fontSize * 0.85;
    const padY = fontSize * 0.45;
    const boxW = Math.min(width - safePadX * 1.4, maxLineW + padX * 2);
    const boxH = wrapped.length * lineH + padY * 2;
    const boxX = (width - boxW) * 0.5;
    const boxY = Math.max(
      height * 0.06,
      Math.min(height - height * 0.06 - boxH, anchorY - boxH * 0.5)
    );

    if (beatScale > 1.001) {
      ctx.translate(width * 0.5, boxY + boxH * 0.5);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-width * 0.5, -(boxY + boxH * 0.5));
    }

    applyLyricTextShadow(
      ctx,
      'rgba(0, 0, 0, 0.68)',
      18,
      shadowIntensity,
      4,
      beatGlowColor,
      beatDrive * 0.6
    );
    ctx.fillStyle = 'rgba(9, 11, 16, 0.84)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 12);
    ctx.fill();

    applyLyricTextShadow(ctx, 'transparent', 0, 0);
    ctx.strokeStyle =
      beatDrive > 0.01
        ? hexToRgba(settings.primaryColor, Math.min(0.85, 0.24 + beatDrive * 0.35))
        : 'rgba(255, 255, 255, 0.14)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    applyLyricTextShadow(
      ctx,
      'rgba(0, 0, 0, 0.85)',
      6,
      shadowIntensity,
      1.5,
      beatGlowColor,
      beatDrive
    );
    const centerY = boxY + boxH * 0.5;
    const startY = centerY - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((line, idx) => {
      ctx.fillText(line, width * 0.5, startY + idx * lineH);
    });
    ctx.restore();
    return;
  }

  renderExtraLyricStyle(settings.lyricStyle, {
    ctx,
    width,
    height,
    minDim,
    isPortrait,
    safePadX,
    lyricPosFrac,
    currentTime,
    bass,
    settings,
    lyrics,
    activeIdx,
    maxTextWidth,
    wrapTextLines,
    hexToRgba,
    lyricBeatDrive: beatDrive,
  });
}

function renderLyrics(
  ctx: RenderContext2D,
  width: number,
  height: number,
  minDim: number,
  isPortrait: boolean,
  safePadX: number,
  lyricPosFrac: number,
  currentTime: number,
  bass: number,
  settings: StudioSettings,
  lyrics: LyricLine[],
  topInsetOverride?: number,
  lyricBeatDrive = 0
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

  const transType = settings.sceneTransitionType ?? 'none';
  const transTarget = settings.sceneTransitionTarget ?? 'both';
  const transDur = Math.max(0.15, Math.min(1.5, settings.sceneTransitionDuration ?? 0.45));
  const lyricTransitionEnabled = transType !== 'none' && transTarget !== 'visualizer';

  if (lyricTransitionEnabled && activeIdx >= 0) {
    const currLine = lyrics[activeIdx];
    const prevLine = activeIdx > 0 ? lyrics[activeIdx - 1] : null;
    const switchTime = Math.max(0, currLine.time - 0.06);
    const elapsed = currentTime - switchTime;
    const effectiveDur = prevLine
      ? Math.min(transDur, Math.max(0.12, (currLine.time - prevLine.time) * 0.85))
      : transDur;

    if (elapsed >= 0 && elapsed < effectiveDur) {
      const rawP = elapsed / Math.max(0.05, effectiveDur);
      const easedP = easeInOutCubic(rawP);

      lyricFromCanvas = ensureScratchCanvas(lyricFromCanvas, width, height);
      lyricToCanvas = ensureScratchCanvas(lyricToCanvas, width, height);
      const fromCtx = getContext2d(lyricFromCanvas);
      const toCtx = getContext2d(lyricToCanvas);

      if (fromCtx && toCtx) {
        if (prevLine) {
          fromCtx.clearRect(0, 0, width, height);
          renderLyricState(
            fromCtx,
            width,
            height,
            minDim,
            isPortrait,
            safePadX,
            lyricPosFrac,
            currentTime,
            bass,
            settings,
            lyrics,
            activeIdx - 1,
            topInsetOverride,
            lyricBeatDrive
          );
        }

        toCtx.clearRect(0, 0, width, height);
        renderLyricState(
          toCtx,
          width,
          height,
          minDim,
          isPortrait,
          safePadX,
          lyricPosFrac,
          currentTime,
          bass,
          settings,
          lyrics,
          activeIdx,
          topInsetOverride,
          lyricBeatDrive
        );

        const anchorY = height * lyricPosFrac;
        const bandHalfH =
          settings.lyricStyle === 'karaoke' ? minDim * 0.2 : minDim * 0.14;
        const rx = settings.lyricsOnly ? 0 : safePadX * 0.5;
        const rw = settings.lyricsOnly ? width : width - safePadX;
        const ry = settings.lyricsOnly ? 0 : Math.max(0, anchorY - bandHalfH);
        const rh = settings.lyricsOnly ? height : Math.min(height - ry, bandHalfH * 2);

        compositeSceneTransition(
          ctx,
          prevLine ? lyricFromCanvas : null,
          lyricToCanvas,
          width,
          height,
          rx,
          ry,
          rw,
          rh,
          transType,
          easedP,
          rawP,
          settings.primaryColor
        );
        return;
      }
    }
  }

  renderLyricState(
    ctx,
    width,
    height,
    minDim,
    isPortrait,
    safePadX,
    lyricPosFrac,
    currentTime,
    bass,
    settings,
    lyrics,
    activeIdx,
    topInsetOverride,
    lyricBeatDrive
  );
}
