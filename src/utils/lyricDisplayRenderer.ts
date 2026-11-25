import { LyricFontKey, LyricLine, LyricStyle, StudioSettings } from '../types/studio';

export interface LyricFontOption {
  id: LyricFontKey;
  label: string;
  shortLabel: string;
  desc: string;
  fontFamily: string;
}

export const LYRIC_FONT_OPTIONS: LyricFontOption[] = [
  {
    id: 'auto',
    label: 'Style Default',
    shortLabel: 'Default',
    desc: 'Uses the selected display preset’s curated typeface',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
  },
  {
    id: 'sans',
    label: 'Sans · Plus Jakarta Sans',
    shortLabel: 'Sans',
    desc: 'Clean, modern studio sans-serif for crisp legibility',
    fontFamily: '"Plus Jakarta Sans", sans-serif',
  },
  {
    id: 'serif',
    label: 'Serif · Playfair Display',
    shortLabel: 'Serif',
    desc: 'Editorial high-contrast serif for ballads and acoustic tracks',
    fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
  },
  {
    id: 'mono',
    label: 'Monospace · JetBrains Mono',
    shortLabel: 'Mono',
    desc: 'Precision technical monospace for HUD & synth tracks',
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
  },
  {
    id: 'display',
    label: 'Display · Oswald',
    shortLabel: 'Display',
    desc: 'Condensed punchy headline type for high-energy drops',
    fontFamily: '"Oswald", "Plus Jakarta Sans", sans-serif',
  },
  {
    id: 'geometric',
    label: 'Geometric · Outfit',
    shortLabel: 'Geometric',
    desc: 'Rounded geometric display type with balanced proportions',
    fontFamily: '"Outfit", "Plus Jakarta Sans", sans-serif',
  },
];

export interface LyricTypographyPreset {
  id: string;
  label: string;
  desc: string;
  lyricFont: LyricFontKey;
  lyricSize: number;
  lyricLetterSpacing: number;
  lyricShadowIntensity: number;
}

export const LYRIC_TYPOGRAPHY_PRESETS: LyricTypographyPreset[] = [
  {
    id: 'modern-minimal',
    label: 'Modern Minimal',
    desc: 'Clean sans-serif with airy tracking and subtle shadow',
    lyricFont: 'sans',
    lyricSize: 0.95,
    lyricLetterSpacing: 0.06,
    lyricShadowIntensity: 0.55,
  },
  {
    id: 'classic-film',
    label: 'Classic Film',
    desc: 'Editorial serif subtitles with cinema tracking and soft depth',
    lyricFont: 'serif',
    lyricSize: 1.0,
    lyricLetterSpacing: 0.14,
    lyricShadowIntensity: 1.15,
  },
  {
    id: 'retro-neon',
    label: 'Retro Neon',
    desc: 'Geometric display type with wide synth tracking and deep glow contrast',
    lyricFont: 'geometric',
    lyricSize: 1.12,
    lyricLetterSpacing: 0.12,
    lyricShadowIntensity: 1.65,
  },
  {
    id: 'bold-impact',
    label: 'Bold Impact',
    desc: 'Condensed headline type, oversized scale, tight tracking & heavy shadow',
    lyricFont: 'display',
    lyricSize: 1.28,
    lyricLetterSpacing: -0.02,
    lyricShadowIntensity: 1.8,
  },
  {
    id: 'studio-hud',
    label: 'Studio HUD',
    desc: 'Technical monospace telemetry with crisp spacing and balanced shadow',
    lyricFont: 'mono',
    lyricSize: 0.92,
    lyricLetterSpacing: 0.08,
    lyricShadowIntensity: 0.9,
  },
  {
    id: 'editorial-poetry',
    label: 'Editorial Poetry',
    desc: 'Oversized intimate serif with natural tracking and warm contrast',
    lyricFont: 'serif',
    lyricSize: 1.18,
    lyricLetterSpacing: 0.01,
    lyricShadowIntensity: 0.85,
  },
];

export function findMatchingLyricPreset(
  settings: Pick<
    StudioSettings,
    'lyricFont' | 'lyricSize' | 'lyricLetterSpacing' | 'lyricShadowIntensity'
  >
): LyricTypographyPreset | null {
  const font = settings.lyricFont ?? 'auto';
  const size = settings.lyricSize ?? 1;
  const spacing = settings.lyricLetterSpacing ?? 0;
  const shadow = settings.lyricShadowIntensity ?? 1;

  return (
    LYRIC_TYPOGRAPHY_PRESETS.find(
      (preset) =>
        preset.lyricFont === font &&
        Math.abs(preset.lyricSize - size) < 0.015 &&
        Math.abs(preset.lyricLetterSpacing - spacing) < 0.008 &&
        Math.abs(preset.lyricShadowIntensity - shadow) < 0.03
    ) ?? null
  );
}

export function resolveLyricFontFamily(
  lyricFont: LyricFontKey | undefined,
  styleDefaultFamily = '"Plus Jakarta Sans", sans-serif'
): string {
  if (!lyricFont || lyricFont === 'auto') {
    return styleDefaultFamily;
  }
  const found = LYRIC_FONT_OPTIONS.find((opt) => opt.id === lyricFont);
  return found ? found.fontFamily : styleDefaultFamily;
}

export function applyLyricLetterSpacing(
  ctx: LyricRenderCtx,
  fontSize: number,
  letterSpacingEm?: number
): number {
  const em = Math.max(-0.08, Math.min(0.35, letterSpacingEm ?? 0));
  const px = em * fontSize;
  const anyCtx = ctx as unknown as { letterSpacing?: string };
  if ('letterSpacing' in anyCtx) {
    anyCtx.letterSpacing = Math.abs(px) > 0.05 ? `${px.toFixed(2)}px` : '0px';
  }
  return px;
}

export type LyricRenderCtx =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export interface ExtraLyricRenderParams {
  ctx: LyricRenderCtx;
  width: number;
  height: number;
  minDim: number;
  isPortrait: boolean;
  safePadX: number;
  lyricPosFrac: number;
  currentTime: number;
  bass: number;
  settings: StudioSettings;
  lyrics: LyricLine[];
  activeIdx: number;
  maxTextWidth: number;
  wrapTextLines: (
    ctx: LyricRenderCtx,
    text: string,
    maxWidth: number
  ) => string[];
  hexToRgba: (hex: string, alpha: number) => string;
  lyricBeatDrive?: number;
}

export function applyLyricTextShadow(
  ctx: LyricRenderCtx,
  shadowColor: string,
  baseBlur: number,
  shadowIntensity: number,
  dropOffsetY = 0,
  beatGlowColor?: string,
  beatDrive = 0
): void {
  const s = Math.max(0, Math.min(2, shadowIntensity));
  const bd = Math.max(0, Math.min(2, beatDrive));
  if (bd > 0.01 && beatGlowColor) {
    ctx.shadowColor = beatGlowColor;
    ctx.shadowBlur = Math.round(
      Math.max(baseBlur, 12) * (0.45 + Math.max(0.65, s) * 0.65) + bd * 18
    );
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  if (s <= 0.01) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    return;
  }
  ctx.shadowColor = shadowColor;
  ctx.shadowBlur = Math.round(baseBlur * (0.4 + s * 0.72));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = dropOffsetY > 0 ? Math.round(dropOffsetY * s) : 0;
}

export function drawLyricDarkBackdropShadow(
  ctx: LyricRenderCtx,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  shadowIntensity: number
): void {
  const s = Math.max(0, Math.min(2, shadowIntensity));
  if (s <= 0.15) return;
  ctx.save();
  ctx.fillStyle = `rgba(4, 6, 12, ${Math.min(0.86, 0.24 + s * 0.34).toFixed(3)})`;
  ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(0.98, 0.48 + s * 0.28).toFixed(3)})`;
  ctx.shadowBlur = Math.round(Math.max(6, fontSize * 0.24) * (0.5 + s * 0.75));
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = Math.round(Math.max(1.5, fontSize * 0.065) * s);
  ctx.fillText(text, x, y);
  ctx.restore();
}

export interface LyricsOnlyStyleSpec {
  fontFamily: string;
  uppercase: boolean;
  italic: boolean;
  containerKind: 'none' | 'dark-box' | 'glass-box' | 'hud-box' | 'ribbon-box';
  activeHighlightKind:
    | 'gradient'
    | 'pill'
    | 'neon-outline'
    | 'duotone-badge'
    | 'glitch'
    | 'retro'
    | 'solid-primary'
    | 'serif-rule';
}

export function getLyricsOnlyStyleSpec(
  style: LyricStyle,
  lyricFont?: LyricFontKey
): LyricsOnlyStyleSpec {
  const pickSpec = (): LyricsOnlyStyleSpec => {
    switch (style) {
      case 'single-pop':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: false,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'pill',
        };
      case 'subtitle-bar':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: false,
          italic: false,
          containerKind: 'dark-box',
          activeHighlightKind: 'solid-primary',
        };
      case 'neon-outline':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: true,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'neon-outline',
        };
      case 'typewriter':
        return {
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          uppercase: false,
          italic: false,
          containerKind: 'dark-box',
          activeHighlightKind: 'solid-primary',
        };
      case 'cinematic-serif':
        return {
          fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
          uppercase: false,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'serif-rule',
        };
      case 'glass-card':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: false,
          italic: false,
          containerKind: 'glass-box',
          activeHighlightKind: 'solid-primary',
        };
      case 'bold-impact':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: true,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'gradient',
        };
      case 'ticker-ribbon':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: false,
          italic: false,
          containerKind: 'ribbon-box',
          activeHighlightKind: 'solid-primary',
        };
      case 'cyber-hud':
        return {
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          uppercase: true,
          italic: false,
          containerKind: 'hud-box',
          activeHighlightKind: 'solid-primary',
        };
      case 'retro-arcade':
        return {
          fontFamily: '"JetBrains Mono", ui-monospace, monospace',
          uppercase: true,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'retro',
        };
      case 'editorial-quote':
        return {
          fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif',
          uppercase: false,
          italic: true,
          containerKind: 'none',
          activeHighlightKind: 'serif-rule',
        };
      case 'glitch-flash':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: true,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'glitch',
        };
      case 'duotone-badge':
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: false,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'duotone-badge',
        };
      case 'word-sweep':
      case 'split-reveal':
      case 'floating-cloud':
      case 'vinyl-sleeve':
      case 'vertical-spine':
      case 'wave-bounce':
      case 'karaoke':
      default:
        return {
          fontFamily: '"Plus Jakarta Sans", sans-serif',
          uppercase: false,
          italic: false,
          containerKind: 'none',
          activeHighlightKind: 'gradient',
        };
    }
  };
  const spec = pickSpec();
  return {
    ...spec,
    fontFamily: resolveLyricFontFamily(lyricFont, spec.fontFamily),
  };
}

export function renderExtraLyricStyle(
  style: Exclude<LyricStyle, 'karaoke' | 'single-pop' | 'subtitle-bar'>,
  params: ExtraLyricRenderParams
): void {
  const {
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
    lyricBeatDrive = 0,
  } = params;

  const anchorY = height * lyricPosFrac;
  const currLine = activeIdx >= 0 ? lyrics[activeIdx] : null;
  const nextLine =
    activeIdx >= 0 && activeIdx + 1 < lyrics.length
      ? lyrics[activeIdx + 1]
      : activeIdx < 0 && lyrics.length > 0
      ? lyrics[0]
      : null;

  const lyricSizeScale = Math.max(0.7, Math.min(1.5, settings.lyricSize ?? 1));
  const fontMinDim = minDim * lyricSizeScale;
  const shadowIntensity = Math.max(0, Math.min(2, settings.lyricShadowIntensity ?? 1));
  const beatDrive = Math.max(0, Math.min(2, lyricBeatDrive));
  const beatScale = 1 + beatDrive * 0.065;
  const beatGlowColor =
    beatDrive > 0.01
      ? hexToRgba(settings.primaryColor, Math.min(0.96, 0.48 + beatDrive * 0.34))
      : undefined;
  const fontSans = resolveLyricFontFamily(
    settings.lyricFont,
    '"Plus Jakarta Sans", sans-serif'
  );
  const fontMono = resolveLyricFontFamily(
    settings.lyricFont,
    '"JetBrains Mono", ui-monospace, monospace'
  );
  const fontSerif = resolveLyricFontFamily(
    settings.lyricFont,
    '"Playfair Display", Georgia, "Times New Roman", serif'
  );

  // Compute approximate line duration for progress-based animations
  const lineDuration = currLine
    ? Math.max(
        1.2,
        nextLine && currLine ? Math.min(8, nextLine.time - currLine.time) : 3.4
      )
    : 3.0;
  const lineElapsed = currLine ? Math.max(0, currentTime - currLine.time) : 0;
  const lineProgress = Math.max(0, Math.min(1, lineElapsed / lineDuration));

  if (style === 'floating-cloud') {
    const activeFs = Math.round(fontMinDim * (isPortrait ? 0.044 : 0.042));
    const anchorCenterY = Math.max(
      height * 0.25,
      Math.min(height * 0.75, anchorY)
    );
    const focusIdx = activeIdx >= 0 ? activeIdx : 0;
    const isPreIntro = activeIdx < 0;
    const offsets = [-2, -1, 0, 1, 2];

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let yCursorOffset = 0;
    const stepSpacing = activeFs * 1.48;

    for (const rel of offsets) {
      const idx = focusIdx + rel;
      if (idx < 0 || idx >= lyrics.length) continue;
      const dist = Math.abs(rel);
      const isAct = !isPreIntro && rel === 0;
      const fs = Math.round(activeFs * (isAct ? 1 : dist === 1 ? 0.76 : 0.58));
      const alpha = isAct ? 1 : dist === 1 ? 0.54 : 0.26;
      const scale = isAct ? (1 + Math.min(0.04, bass * 0.035)) * beatScale : 1;

      ctx.save();
      ctx.font = `${isAct ? 700 : 500} ${fs}px ${fontSans}`;
      applyLyricLetterSpacing(ctx, fs, settings.lyricLetterSpacing);
      const wrapped = wrapTextLines(ctx, lyrics[idx].text, maxTextWidth * 0.92);
      const displayLine = isAct
        ? wrapped
        : [rel < 0 ? wrapped[wrapped.length - 1] : wrapped[0]];
      const lineH = fs * 1.22;
      yCursorOffset = rel * stepSpacing;
      ctx.translate(width * 0.5, anchorCenterY + yCursorOffset);
      ctx.scale(scale, scale);

      const startY = -((displayLine.length - 1) * lineH) * 0.5;
      displayLine.forEach((ln, li) => {
        const ly = startY + li * lineH;
        if (isAct) {
          drawLyricDarkBackdropShadow(ctx, ln, 0, ly, fs, shadowIntensity);
          ctx.fillStyle = '#ffffff';
          applyLyricTextShadow(
            ctx,
            hexToRgba(settings.primaryColor, 0.72),
            16,
            shadowIntensity,
            0,
            beatGlowColor,
            beatDrive
          );
        } else {
          ctx.fillStyle = hexToRgba('#e2e8f0', alpha);
          applyLyricTextShadow(
            ctx,
            `rgba(0,0,0,${Math.min(0.95, 0.5 * shadowIntensity).toFixed(2)})`,
            6,
            shadowIntensity,
            1.5
          );
        }
        ctx.fillText(ln, 0, ly);
      });
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (style === 'vertical-spine') {
    const focusIdx = activeIdx >= 0 ? activeIdx : 0;
    const isPreIntro = activeIdx < 0;
    const activeFs = Math.round(fontMinDim * (isPortrait ? 0.038 : 0.036));
    const sideFs = Math.round(activeFs * 0.74);
    const spineX = width * 0.5;
    const stepH = activeFs * 1.65;
    const centerY = Math.max(height * 0.24, Math.min(height * 0.76, anchorY));

    ctx.save();
    // Vertical glowing spine
    const spineGrad = ctx.createLinearGradient(
      spineX,
      centerY - stepH * 1.7,
      spineX,
      centerY + stepH * 1.7
    );
    spineGrad.addColorStop(0, 'rgba(255,255,255,0)');
    spineGrad.addColorStop(0.5, hexToRgba(settings.primaryColor, 0.8));
    spineGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = spineGrad;
    ctx.lineWidth = Math.max(2, minDim * 0.003);
    ctx.beginPath();
    ctx.moveTo(spineX, centerY - stepH * 1.7);
    ctx.lineTo(spineX, centerY + stepH * 1.7);
    ctx.stroke();

    for (const rel of [-1, 0, 1]) {
      const idx = focusIdx + rel;
      if (idx < 0 || idx >= lyrics.length) continue;
      const isAct = !isPreIntro && rel === 0;
      const rowY = centerY + rel * stepH;
      const isRight = idx % 2 === 0;
      const sideColW = width * 0.5 - safePadX - minDim * 0.035;
      const fs = isAct ? activeFs : sideFs;

      // Spine node dot
      ctx.beginPath();
      ctx.arc(
        spineX,
        rowY,
        isAct
          ? Math.max(5, minDim * 0.009 + bass * 3 + beatDrive * 2.5)
          : Math.max(3, minDim * 0.005),
        0,
        Math.PI * 2
      );
      ctx.fillStyle = isAct ? settings.primaryColor : 'rgba(226, 232, 240, 0.45)';
      applyLyricTextShadow(
        ctx,
        isAct ? settings.primaryColor : 'transparent',
        isAct ? 14 : 0,
        shadowIntensity,
        0,
        isAct ? beatGlowColor : undefined,
        isAct ? beatDrive : 0
      );
      ctx.fill();

      ctx.font = `${isAct ? 700 : 500} ${fs}px ${fontSans}`;
      applyLyricLetterSpacing(ctx, fs, settings.lyricLetterSpacing);
      const wrapped = wrapTextLines(ctx, lyrics[idx].text, sideColW);
      const lineH = fs * 1.22;
      ctx.textAlign = isRight ? 'left' : 'right';
      ctx.textBaseline = 'middle';
      const textX = spineX + (isRight ? minDim * 0.028 : -minDim * 0.028);
      ctx.save();
      if (isAct && beatScale > 1.001) {
        ctx.translate(textX, rowY);
        ctx.scale(beatScale, beatScale);
        ctx.translate(-textX, -rowY);
      }
      const startY = rowY - ((wrapped.length - 1) * lineH) * 0.5;
      wrapped.slice(0, 2).forEach((ln, li) => {
        const ly = startY + li * lineH;
        if (isAct) {
          drawLyricDarkBackdropShadow(ctx, ln, textX, ly, fs, shadowIntensity);
        }
        ctx.fillStyle = isAct ? '#ffffff' : 'rgba(226, 232, 240, 0.48)';
        applyLyricTextShadow(
          ctx,
          isAct ? hexToRgba(settings.primaryColor, 0.55) : 'rgba(0,0,0,0.65)',
          isAct ? 12 : 5,
          shadowIntensity,
          isAct ? 0 : 1.5,
          isAct ? beatGlowColor : undefined,
          isAct ? beatDrive : 0
        );
        ctx.fillText(ln, textX, ly);
      });
      ctx.restore();
    }
    ctx.restore();
    return;
  }

  if (!currLine) return;

  if (style === 'neon-outline') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.052 : 0.049));
    const scale = (1 + Math.min(0.05, bass * 0.045)) * beatScale;
    const text = currLine.text.toUpperCase();
    ctx.save();
    ctx.font = `800 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, text, maxTextWidth * 0.94);
    const lineH = fontSize * 1.2;
    ctx.translate(width * 0.5, anchorY);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const startY = -((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      drawLyricDarkBackdropShadow(ctx, ln, 0, ly, fontSize, shadowIntensity);

      applyLyricTextShadow(
        ctx,
        settings.primaryColor,
        20 + bass * 14,
        shadowIntensity,
        0,
        beatGlowColor,
        beatDrive
      );
      ctx.strokeStyle = settings.primaryColor;
      ctx.lineWidth = Math.max(2.2, fontSize * 0.075 + bass * 1.8);
      ctx.strokeText(ln, 0, ly);

      applyLyricTextShadow(ctx, settings.primaryColor, 6, shadowIntensity);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, fontSize * 0.024);
      ctx.strokeText(ln, 0, ly);

      applyLyricTextShadow(ctx, 'transparent', 0, 0);
      ctx.fillStyle = hexToRgba(settings.primaryColor, 0.14);
      ctx.fillText(ln, 0, ly);
    });
    ctx.restore();
    return;
  }

  if (style === 'typewriter') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.037 : 0.034));
    const revealDuration = Math.min(1.6, lineDuration * 0.72);
    const charRatio = Math.min(1, lineElapsed / Math.max(0.25, revealDuration));
    const visibleChars = Math.max(1, Math.ceil(currLine.text.length * charRatio));
    const showCursor = Math.floor(currentTime * 3.2) % 2 === 0;
    const displayStr =
      currLine.text.slice(0, visibleChars) + (showCursor ? '▍' : ' ');

    ctx.save();
    ctx.font = `600 ${fontSize}px ${fontMono}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, displayStr, maxTextWidth * 0.88);
    const lineH = fontSize * 1.32;
    const maxLineW = wrapped.reduce(
      (acc, l) => Math.max(acc, ctx.measureText(l).width),
      0
    );
    const padX = fontSize * 0.8;
    const padY = fontSize * 0.5;
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
      'rgba(0, 0, 0, 0.72)',
      18,
      shadowIntensity,
      4,
      beatGlowColor,
      beatDrive * 0.65
    );
    ctx.fillStyle = 'rgba(7, 10, 15, 0.86)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 10);
    ctx.fill();
    applyLyricTextShadow(ctx, 'transparent', 0, 0);
    ctx.strokeStyle = hexToRgba(settings.primaryColor, Math.min(0.95, 0.42 + beatDrive * 0.3));
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    applyLyricTextShadow(
      ctx,
      'rgba(0, 0, 0, 0.8)',
      6,
      shadowIntensity,
      1.5,
      beatGlowColor,
      beatDrive
    );
    const startY = boxY + boxH * 0.5 - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      ctx.fillText(ln, width * 0.5, startY + idx * lineH);
    });
    ctx.restore();
    return;
  }

  if (style === 'cinematic-serif') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.044 : 0.042));
    const fadeIn = Math.min(1, lineElapsed / 0.28);
    ctx.save();
    ctx.globalAlpha = 0.25 + fadeIn * 0.75;
    ctx.font = `500 ${fontSize}px ${fontSerif}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.9);
    const lineH = fontSize * 1.3;
    const maxLineW = wrapped.reduce(
      (acc, l) => Math.max(acc, ctx.measureText(l).width),
      0
    );
    const ruleW = Math.min(maxTextWidth * 0.75, Math.max(minDim * 0.2, maxLineW * 0.65));
    const blockH = wrapped.length * lineH;

    if (beatScale > 1.001) {
      ctx.translate(width * 0.5, anchorY);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-width * 0.5, -anchorY);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = anchorY - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      drawLyricDarkBackdropShadow(ctx, ln, width * 0.5, ly, fontSize, shadowIntensity);
      ctx.fillStyle = '#f8fafc';
      applyLyricTextShadow(
        ctx,
        'rgba(0, 0, 0, 0.86)',
        16,
        shadowIntensity,
        2.5,
        beatGlowColor,
        beatDrive
      );
      ctx.fillText(ln, width * 0.5, ly);
    });

    // Hairline gold/accent serif rules above and below
    applyLyricTextShadow(ctx, 'transparent', 0, 0);
    ctx.strokeStyle = hexToRgba(settings.primaryColor, Math.min(0.95, 0.65 + beatDrive * 0.2));
    ctx.lineWidth = 1.25;
    const topRuleY = anchorY - blockH * 0.5 - fontSize * 0.55;
    const botRuleY = anchorY + blockH * 0.5 + fontSize * 0.55;
    ctx.beginPath();
    ctx.moveTo(width * 0.5 - ruleW * 0.5, topRuleY);
    ctx.lineTo(width * 0.5 + ruleW * 0.5, topRuleY);
    ctx.moveTo(width * 0.5 - ruleW * 0.35, botRuleY);
    ctx.lineTo(width * 0.5 + ruleW * 0.35, botRuleY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (style === 'word-sweep') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.046 : 0.044));
    ctx.save();
    ctx.font = `700 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.92);
    const lineH = fontSize * 1.26;
    if (beatScale > 1.001) {
      ctx.translate(width * 0.5, anchorY);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-width * 0.5, -anchorY);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = anchorY - ((wrapped.length - 1) * lineH) * 0.5;
    const totalChars = Math.max(1, wrapped.join('').length);
    let charsBefore = 0;

    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      const lineW = ctx.measureText(ln).width;
      const lineStartFrac = charsBefore / totalChars;
      const lineEndFrac = (charsBefore + ln.length) / totalChars;
      const localSweep = Math.max(
        0,
        Math.min(
          1,
          (lineProgress - lineStartFrac) /
            Math.max(0.05, lineEndFrac - lineStartFrac)
        )
      );
      charsBefore += ln.length;

      // Dimmed unsung base
      drawLyricDarkBackdropShadow(ctx, ln, width * 0.5, ly, fontSize, shadowIntensity);
      ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
      applyLyricTextShadow(ctx, 'rgba(0,0,0,0.68)', 8, shadowIntensity, 1.5);
      ctx.fillText(ln, width * 0.5, ly);

      // Sweeping bright gradient highlight clipped to left-to-right fill
      if (localSweep > 0.005) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(
          width * 0.5 - lineW * 0.52,
          ly - lineH * 0.65,
          lineW * 1.04 * localSweep,
          lineH * 1.3
        );
        ctx.clip();
        const grad = ctx.createLinearGradient(
          width * 0.5 - lineW * 0.5,
          ly,
          width * 0.5 + lineW * 0.5,
          ly
        );
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.55, settings.primaryColor);
        grad.addColorStop(1, settings.secondaryColor);
        ctx.fillStyle = grad;
        applyLyricTextShadow(
          ctx,
          hexToRgba(settings.primaryColor, 0.65),
          14,
          shadowIntensity,
          0,
          beatGlowColor,
          beatDrive
        );
        ctx.fillText(ln, width * 0.5, ly);
        ctx.restore();
      }
    });
    ctx.restore();
    return;
  }

  if (style === 'glass-card') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.04 : 0.038));
    ctx.save();
    ctx.font = `600 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.84);
    const lineH = fontSize * 1.28;
    const maxLineW = wrapped.reduce(
      (acc, l) => Math.max(acc, ctx.measureText(l).width),
      0
    );
    const padX = fontSize * 0.95;
    const padY = fontSize * 0.52;
    const boxW = Math.min(width - safePadX * 1.3, maxLineW + padX * 2);
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

    const glassGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
    glassGrad.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
    glassGrad.addColorStop(1, 'rgba(15, 23, 42, 0.68)');
    applyLyricTextShadow(
      ctx,
      'rgba(0, 0, 0, 0.55)',
      22,
      shadowIntensity,
      4,
      beatGlowColor,
      beatDrive * 0.6
    );
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 16);
    ctx.fill();

    applyLyricTextShadow(ctx, 'transparent', 0, 0);
    ctx.strokeStyle =
      beatDrive > 0.01
        ? hexToRgba(settings.primaryColor, Math.min(0.85, 0.32 + beatDrive * 0.35))
        : 'rgba(255, 255, 255, 0.26)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Accent bar on left edge of frosted card
    ctx.fillStyle = settings.primaryColor;
    ctx.beginPath();
    ctx.roundRect(boxX + 6, boxY + 8, 4, Math.max(12, boxH - 16), 2);
    ctx.fill();

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
    const startY = boxY + boxH * 0.5 - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      ctx.fillText(ln, width * 0.5 + 2, startY + idx * lineH);
    });
    ctx.restore();
    return;
  }

  if (style === 'bold-impact') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.056 : 0.054));
    const punch = lineElapsed < 0.12 ? 1.12 - (lineElapsed / 0.12) * 0.12 : 1;
    const scale = punch * (1 + Math.min(0.06, bass * 0.055)) * beatScale;
    const upper = currLine.text.toUpperCase();

    ctx.save();
    ctx.font = `900 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, upper, maxTextWidth * 0.94);
    const lineH = fontSize * 1.12;
    ctx.translate(width * 0.5, anchorY);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = -((wrapped.length - 1) * lineH) * 0.5;

    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      if (shadowIntensity > 0.05) {
        const depth = Math.max(1.5, 3 * shadowIntensity);
        ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.95, 0.55 + shadowIntensity * 0.22).toFixed(2)})`;
        ctx.fillText(ln, depth, ly + depth * 1.25);
        drawLyricDarkBackdropShadow(ctx, ln, 0, ly, fontSize, shadowIntensity);
      }
      ctx.fillStyle = '#ffffff';
      applyLyricTextShadow(
        ctx,
        hexToRgba(settings.primaryColor, 0.55),
        16,
        shadowIntensity,
        0,
        beatGlowColor,
        beatDrive
      );
      ctx.fillText(ln, 0, ly);
    });
    ctx.restore();
    return;
  }

  if (style === 'split-reveal') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.044 : 0.042));
    const revealFrac = Math.min(1, lineElapsed / 0.25);
    ctx.save();
    ctx.font = `700 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.92);
    const lineH = fontSize * 1.28;
    const startY = anchorY - ((wrapped.length - 1) * lineH) * 0.5;
    if (beatScale > 1.001) {
      ctx.translate(width * 0.5, anchorY);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-width * 0.5, -anchorY);
    }
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    const spaceAdvance = Math.max(
      0,
      ctx.measureText('a b').width - ctx.measureText('a').width - ctx.measureText('b').width
    );

    wrapped.forEach((ln, lineIdx) => {
      const words = ln.split(/\s+/).filter(Boolean);
      const wordWidths = words.map((w) => ctx.measureText(w).width);
      const totalW =
        wordWidths.reduce((sum, w) => sum + w, 0) +
        Math.max(0, words.length - 1) * spaceAdvance;
      let cursorX = width * 0.5 - totalW * 0.5;
      const ly = startY + lineIdx * lineH;

      words.forEach((word, wIdx) => {
        const isAccent = (wIdx + lineIdx) % 2 === 1;
        drawLyricDarkBackdropShadow(ctx, word, cursorX, ly, fontSize, shadowIntensity);
        ctx.fillStyle = isAccent ? settings.primaryColor : '#ffffff';
        applyLyricTextShadow(
          ctx,
          isAccent ? hexToRgba(settings.primaryColor, 0.55) : 'rgba(0,0,0,0.7)',
          isAccent ? 14 : 8,
          shadowIntensity,
          isAccent ? 0 : 1.5,
          beatGlowColor,
          beatDrive
        );
        ctx.fillText(word, cursorX, ly);
        cursorX += wordWidths[wIdx] + spaceAdvance;
      });
    });

    // Expanding center underline rule
    const ruleMaxW = Math.min(maxTextWidth * 0.7, width * 0.55);
    const ruleW = ruleMaxW * revealFrac;
    const ruleY = anchorY + (wrapped.length * lineH) * 0.5 + fontSize * 0.35;
    const ruleGrad = ctx.createLinearGradient(
      width * 0.5 - ruleW * 0.5,
      ruleY,
      width * 0.5 + ruleW * 0.5,
      ruleY
    );
    ruleGrad.addColorStop(0, settings.primaryColor);
    ruleGrad.addColorStop(1, settings.secondaryColor);
    ctx.strokeStyle = ruleGrad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(width * 0.5 - ruleW * 0.5, ruleY);
    ctx.lineTo(width * 0.5 + ruleW * 0.5, ruleY);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (style === 'ticker-ribbon') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.036 : 0.033));
    ctx.save();
    ctx.font = `600 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, width - safePadX * 2.4);
    const lineH = fontSize * 1.26;
    const bandH = wrapped.length * lineH + fontSize * 0.95;
    const bandY = Math.max(
      height * 0.06,
      Math.min(height - height * 0.06 - bandH, anchorY - bandH * 0.5)
    );

    const ribbonGrad = ctx.createLinearGradient(0, bandY, width, bandY);
    ribbonGrad.addColorStop(0, 'rgba(9, 11, 16, 0.25)');
    ribbonGrad.addColorStop(0.15, 'rgba(9, 11, 16, 0.88)');
    ribbonGrad.addColorStop(0.85, 'rgba(9, 11, 16, 0.88)');
    ribbonGrad.addColorStop(1, 'rgba(9, 11, 16, 0.25)');
    ctx.fillStyle = ribbonGrad;
    ctx.fillRect(0, bandY, width, bandH);

    // Top and bottom hairline accent strips
    const stripGrad = ctx.createLinearGradient(0, 0, width, 0);
    stripGrad.addColorStop(0, 'rgba(255,255,255,0)');
    stripGrad.addColorStop(0.25, settings.primaryColor);
    stripGrad.addColorStop(0.75, settings.secondaryColor);
    stripGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = stripGrad;
    ctx.fillRect(0, bandY, width, 2);
    ctx.fillRect(0, bandY + bandH - 2, width, 2);

    if (beatScale > 1.001) {
      ctx.translate(width * 0.5, bandY + bandH * 0.5);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-width * 0.5, -(bandY + bandH * 0.5));
    }

    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    applyLyricTextShadow(
      ctx,
      'rgba(0, 0, 0, 0.82)',
      6,
      shadowIntensity,
      1.5,
      beatGlowColor,
      beatDrive
    );
    const startY = bandY + bandH * 0.5 - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      ctx.fillText(ln, width * 0.5, startY + idx * lineH);
    });
    ctx.restore();
    return;
  }

  if (style === 'cyber-hud') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.036 : 0.034));
    const upper = currLine.text.toUpperCase();
    ctx.save();
    ctx.font = `600 ${fontSize}px ${fontMono}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, upper, maxTextWidth * 0.84);
    const lineH = fontSize * 1.28;
    const maxLineW = wrapped.reduce(
      (acc, l) => Math.max(acc, ctx.measureText(l).width),
      0
    );
    const padX = fontSize * 1.1;
    const padY = fontSize * 0.65;
    const boxW = Math.min(width - safePadX * 1.3, maxLineW + padX * 2);
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
      'rgba(0, 0, 0, 0.72)',
      18,
      shadowIntensity,
      4,
      beatGlowColor,
      beatDrive * 0.55
    );
    ctx.fillStyle = 'rgba(6, 12, 22, 0.78)';
    ctx.fillRect(boxX, boxY, boxW, boxH);

    // Corner HUD brackets
    const tick = Math.min(18, boxH * 0.32);
    ctx.strokeStyle = settings.primaryColor;
    ctx.lineWidth = 2.2;
    applyLyricTextShadow(
      ctx,
      settings.primaryColor,
      10,
      shadowIntensity,
      0,
      beatGlowColor,
      beatDrive
    );
    ctx.beginPath();
    // TL
    ctx.moveTo(boxX, boxY + tick);
    ctx.lineTo(boxX, boxY);
    ctx.lineTo(boxX + tick, boxY);
    // TR
    ctx.moveTo(boxX + boxW - tick, boxY);
    ctx.lineTo(boxX + boxW, boxY);
    ctx.lineTo(boxX + boxW, boxY + tick);
    // BL
    ctx.moveTo(boxX, boxY + boxH - tick);
    ctx.lineTo(boxX, boxY + boxH);
    ctx.lineTo(boxX + tick, boxY + boxH);
    // BR
    ctx.moveTo(boxX + boxW - tick, boxY + boxH);
    ctx.lineTo(boxX + boxW, boxY + boxH);
    ctx.lineTo(boxX + boxW, boxY + boxH - tick);
    ctx.stroke();

    // Index badge
    applyLyricTextShadow(ctx, 'rgba(0, 0, 0, 0.75)', 4, shadowIntensity, 1);
    const tagFs = Math.max(10, Math.round(fontSize * 0.44));
    ctx.font = `700 ${tagFs}px "JetBrains Mono", ui-monospace, monospace`;
    applyLyricLetterSpacing(ctx, tagFs, 0);
    ctx.fillStyle = settings.primaryColor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      `LYR // ${String(activeIdx + 1).padStart(2, '0')}`,
      boxX + 10,
      boxY - 4
    );

    ctx.font = `600 ${fontSize}px ${fontMono}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
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
    const startY = boxY + boxH * 0.5 - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      ctx.fillText(ln, width * 0.5, startY + idx * lineH);
    });
    ctx.restore();
    return;
  }

  if (style === 'retro-arcade') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.044 : 0.041));
    const upper = currLine.text.toUpperCase();
    const scale = (1 + Math.min(0.05, bass * 0.045)) * beatScale;
    ctx.save();
    ctx.font = `800 ${fontSize}px ${fontMono}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, upper, maxTextWidth * 0.92);
    const lineH = fontSize * 1.24;
    ctx.translate(width * 0.5, anchorY);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = -((wrapped.length - 1) * lineH) * 0.5;
    const off = Math.max(2.5, fontSize * 0.085);

    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      drawLyricDarkBackdropShadow(ctx, ln, off * 1.2, ly + off * 1.2, fontSize, shadowIntensity);
      applyLyricTextShadow(ctx, 'rgba(0, 0, 0, 0.8)', 6, shadowIntensity, 2);
      ctx.fillStyle = settings.secondaryColor;
      ctx.fillText(ln, off * 1.7, ly + off * 1.7);
      applyLyricTextShadow(ctx, 'transparent', 0, 0);
      ctx.fillStyle = settings.primaryColor;
      ctx.fillText(ln, off * 0.85, ly + off * 0.85);
      applyLyricTextShadow(ctx, 'transparent', 0, 0, 0, beatGlowColor, beatDrive);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(ln, 0, ly);
    });
    ctx.restore();
    return;
  }

  if (style === 'editorial-quote') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.041 : 0.039));
    ctx.save();
    ctx.font = `italic 600 ${fontSize}px ${fontSerif}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.82);
    const lineH = fontSize * 1.32;
    const blockH = wrapped.length * lineH;
    const maxLineW = wrapped.reduce(
      (acc, l) => Math.max(acc, ctx.measureText(l).width),
      0
    );
    const blockLeftX = Math.max(safePadX, (width - maxLineW) * 0.5);
    const barX = blockLeftX - fontSize * 0.55;
    const topY = anchorY - blockH * 0.5;

    if (beatScale > 1.001) {
      ctx.translate(width * 0.5, anchorY);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-width * 0.5, -anchorY);
    }

    // Vertical accent bar
    ctx.fillStyle = settings.primaryColor;
    ctx.fillRect(barX, topY - 4, 4, blockH + 8);

    // Oversized decorative opening quote mark
    ctx.font = `700 ${Math.round(fontSize * 1.9)}px ${fontSerif}`;
    applyLyricLetterSpacing(ctx, fontSize, 0);
    ctx.fillStyle = hexToRgba(settings.primaryColor, 0.35);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('“', barX - 8, topY - fontSize * 0.45);

    ctx.font = `italic 600 ${fontSize}px ${fontSerif}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const startY = anchorY - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      drawLyricDarkBackdropShadow(ctx, ln, blockLeftX, ly, fontSize, shadowIntensity);
      ctx.fillStyle = '#f8fafc';
      applyLyricTextShadow(
        ctx,
        'rgba(0, 0, 0, 0.82)',
        12,
        shadowIntensity,
        2,
        beatGlowColor,
        beatDrive
      );
      ctx.fillText(ln, blockLeftX, ly);
    });
    ctx.restore();
    return;
  }

  if (style === 'vinyl-sleeve') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.036 : 0.033));
    const mins = Math.floor(currLine.time / 60);
    const secs = Math.floor(currLine.time % 60);
    const stamp = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    ctx.save();
    ctx.font = `500 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.88);
    const lineH = fontSize * 1.28;
    const baseY = Math.max(
      height * 0.14,
      Math.min(height * 0.88 - wrapped.length * lineH * 0.5, anchorY)
    );

    if (beatScale > 1.001) {
      ctx.translate(safePadX, baseY);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-safePadX, -baseY);
    }

    // Small timecode pill above text
    const pillFs = Math.max(10, Math.round(fontSize * 0.48));
    ctx.font = `600 ${pillFs}px "JetBrains Mono", ui-monospace, monospace`;
    applyLyricLetterSpacing(ctx, pillFs, 0);
    const pillW = ctx.measureText(stamp).width + pillFs * 1.1;
    const pillH = pillFs * 1.55;
    const pillY = baseY - (wrapped.length * lineH) * 0.5 - pillH - fontSize * 0.25;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.roundRect(safePadX, pillY, pillW, pillH, pillH * 0.5);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(settings.primaryColor, Math.min(0.95, 0.45 + beatDrive * 0.3));
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = settings.primaryColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(stamp, safePadX + pillW * 0.5, pillY + pillH * 0.52);

    ctx.font = `500 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    ctx.textAlign = 'left';
    const startY = baseY - ((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      drawLyricDarkBackdropShadow(ctx, ln, safePadX, ly, fontSize, shadowIntensity);
      ctx.fillStyle = '#f8fafc';
      applyLyricTextShadow(
        ctx,
        'rgba(0, 0, 0, 0.82)',
        10,
        shadowIntensity,
        2,
        beatGlowColor,
        beatDrive
      );
      ctx.fillText(ln, safePadX, ly);
    });
    ctx.restore();
    return;
  }

  if (style === 'glitch-flash') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.048 : 0.045));
    const upper = currLine.text.toUpperCase();
    const entranceBurst = lineElapsed < 0.18 ? 1 - lineElapsed / 0.18 : 0;
    const jitter =
      (entranceBurst * 0.9 + bass * 0.7 + beatDrive * 0.45) *
      Math.max(3, fontSize * 0.11);
    const shiftX = Math.sin(currentTime * 68) * jitter;
    const shiftY = Math.cos(currentTime * 51) * jitter * 0.35;

    ctx.save();
    ctx.font = `800 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, upper, maxTextWidth * 0.92);
    const lineH = fontSize * 1.22;
    if (beatScale > 1.001) {
      ctx.translate(width * 0.5, anchorY);
      ctx.scale(beatScale, beatScale);
      ctx.translate(-width * 0.5, -anchorY);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = anchorY - ((wrapped.length - 1) * lineH) * 0.5;

    wrapped.forEach((ln, idx) => {
      const ly = startY + idx * lineH;
      drawLyricDarkBackdropShadow(ctx, ln, width * 0.5, ly, fontSize, shadowIntensity);
      ctx.fillStyle = hexToRgba(settings.primaryColor, 0.78);
      ctx.fillText(ln, width * 0.5 - shiftX - 2, ly - shiftY);
      ctx.fillStyle = hexToRgba(settings.secondaryColor, 0.78);
      ctx.fillText(ln, width * 0.5 + shiftX + 2, ly + shiftY);
      ctx.fillStyle = '#ffffff';
      applyLyricTextShadow(
        ctx,
        'rgba(0, 0, 0, 0.82)',
        8,
        shadowIntensity,
        1.5,
        beatGlowColor,
        beatDrive
      );
      ctx.fillText(ln, width * 0.5, ly);
      applyLyricTextShadow(ctx, 'transparent', 0, 0);
    });
    ctx.restore();
    return;
  }

  if (style === 'duotone-badge') {
    const fontSize = Math.round(fontMinDim * (isPortrait ? 0.044 : 0.041));
    const scale = (1 + Math.min(0.06, bass * 0.05)) * beatScale;
    ctx.save();
    ctx.font = `800 ${fontSize}px ${fontSans}`;
    applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
    const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.86);
    const lineH = fontSize * 1.24;
    const maxLineW = wrapped.reduce(
      (acc, l) => Math.max(acc, ctx.measureText(l).width),
      0
    );
    const padX = fontSize * 0.8;
    const padY = fontSize * 0.42;
    const boxW = Math.min(width - safePadX * 1.4, maxLineW + padX * 2);
    const boxH = wrapped.length * lineH + padY * 2;

    ctx.translate(width * 0.5, anchorY);
    ctx.scale(scale, scale);

    const pillGrad = ctx.createLinearGradient(-boxW * 0.5, 0, boxW * 0.5, 0);
    pillGrad.addColorStop(0, settings.primaryColor);
    pillGrad.addColorStop(1, settings.secondaryColor);
    applyLyricTextShadow(
      ctx,
      hexToRgba(settings.primaryColor, 0.52),
      20,
      shadowIntensity,
      3,
      beatGlowColor,
      beatDrive
    );
    ctx.fillStyle = pillGrad;
    ctx.beginPath();
    ctx.roundRect(-boxW * 0.5, -boxH * 0.5, boxW, boxH, Math.min(20, fontSize * 0.45));
    ctx.fill();

    applyLyricTextShadow(ctx, 'transparent', 0, 0);
    ctx.fillStyle = '#090b10';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const startY = -((wrapped.length - 1) * lineH) * 0.5;
    wrapped.forEach((ln, idx) => {
      ctx.fillText(ln, 0, startY + idx * lineH);
    });
    ctx.restore();
    return;
  }

  // 'wave-bounce'
  const fontSize = Math.round(fontMinDim * (isPortrait ? 0.044 : 0.042));
  ctx.save();
  ctx.font = `700 ${fontSize}px ${fontSans}`;
  applyLyricLetterSpacing(ctx, fontSize, settings.lyricLetterSpacing);
  const wrapped = wrapTextLines(ctx, currLine.text, maxTextWidth * 0.9);
  const lineH = fontSize * 1.3;
  const startY = anchorY - ((wrapped.length - 1) * lineH) * 0.5;
  const amp = fontSize * (0.14 + bass * 0.2 + beatDrive * 0.08);
  if (beatScale > 1.001) {
    ctx.translate(width * 0.5, anchorY);
    ctx.scale(beatScale, beatScale);
    ctx.translate(-width * 0.5, -anchorY);
  }
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const spaceAdvance = Math.max(
    0,
    ctx.measureText('a b').width - ctx.measureText('a').width - ctx.measureText('b').width
  );

  wrapped.forEach((ln, lineIdx) => {
    const words = ln.split(/\s+/).filter(Boolean);
    const wordWidths = words.map((w) => ctx.measureText(w).width);
    const totalW =
      wordWidths.reduce((sum, w) => sum + w, 0) +
      Math.max(0, words.length - 1) * spaceAdvance;
    let cursorX = width * 0.5 - totalW * 0.5;
    const baseLy = startY + lineIdx * lineH;

    words.forEach((word, wIdx) => {
      const waveY =
        Math.sin(currentTime * 6.2 + wIdx * 0.85 + lineIdx * 1.3) * amp;
      const isPeak = waveY < -amp * 0.35;
      drawLyricDarkBackdropShadow(ctx, word, cursorX, baseLy + waveY, fontSize, shadowIntensity);
      ctx.fillStyle = isPeak ? settings.primaryColor : '#ffffff';
      applyLyricTextShadow(
        ctx,
        isPeak ? hexToRgba(settings.primaryColor, 0.65) : 'rgba(0,0,0,0.72)',
        isPeak ? 14 : 8,
        shadowIntensity,
        isPeak ? 0 : 1.5,
        beatGlowColor,
        beatDrive
      );
      ctx.fillText(word, cursorX, baseLy + waveY);
      cursorX += wordWidths[wIdx] + spaceAdvance;
    });
  });
  ctx.restore();
}
