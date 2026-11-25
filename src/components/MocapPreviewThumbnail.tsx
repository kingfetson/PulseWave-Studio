import { useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { DanceAvatarStyle, DanceStyleKey, MocapClipData } from '../types/studio';
import {
  DANCE_STYLE_OPTIONS,
  renderMocapPreviewThumbnail,
} from '../utils/danceRenderer';
import {
  BUILT_IN_MOCAP_LIBRARY,
  downloadBuiltInMocapBvh,
  getBuiltInMocapEntry,
  isBuiltInMocapStyle,
} from '../utils/builtInMocapLibrary';

interface MocapPreviewThumbnailProps {
  previewStyle: DanceStyleKey;
  selectedStyle: DanceStyleKey;
  avatarStyle: DanceAvatarStyle;
  primaryColor: string;
  secondaryColor: string;
  rimColor?: string;
  mocapClip?: MocapClipData | null;
}

const THUMB_WIDTH = 96;
const THUMB_HEIGHT = 112;

export function MocapPreviewThumbnail({
  previewStyle,
  selectedStyle,
  avatarStyle,
  primaryColor,
  secondaryColor,
  rimColor,
  mocapClip = null,
}: MocapPreviewThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(THUMB_WIDTH * dpr);
    canvas.height = Math.round(THUMB_HEIGHT * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.scale(dpr, dpr);
    renderMocapPreviewThumbnail({
      ctx,
      width: THUMB_WIDTH,
      height: THUMB_HEIGHT,
      style: previewStyle,
      avatarStyle,
      primaryColor,
      secondaryColor,
      rimColor,
      mocapClip,
    });
    ctx.restore();
  }, [
    previewStyle,
    avatarStyle,
    primaryColor,
    secondaryColor,
    rimColor,
    mocapClip,
  ]);

  const isHoverPreview = previewStyle !== selectedStyle;
  const isBuiltIn = isBuiltInMocapStyle(previewStyle);
  const builtInEntry = isBuiltIn ? getBuiltInMocapEntry(previewStyle) : null;
  const styleOption = DANCE_STYLE_OPTIONS.find((opt) => opt.id === previewStyle);

  const title = builtInEntry
    ? builtInEntry.title
    : previewStyle === 'mocap-custom' && mocapClip
    ? mocapClip.name
    : styleOption?.label ?? 'Dance Pose';

  const metaLine = builtInEntry
    ? `${builtInEntry.genre} · ${builtInEntry.bpmLabel} · ${builtInEntry.frameCount}f`
    : previewStyle === 'mocap-custom'
    ? mocapClip
      ? `Custom Mocap · ${mocapClip.frameCount}f · ${Math.round(mocapClip.fps)}fps`
      : 'Custom Upload · No clip loaded'
    : 'Procedural Beat Choreography';

  const description = builtInEntry
    ? builtInEntry.description
    : previewStyle === 'mocap-custom' && !mocapClip
    ? 'Upload a .bvh or .json file below to preview its pose.'
    : styleOption?.desc ?? '';

  return (
    <div className="rounded-lg bg-[#090b10] border border-white/[0.09] p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[11px] font-medium text-slate-200">
            Mocap Preview
          </span>
          <span
            className={`text-[10px] font-mono ${
              isHoverPreview ? 'text-cyan-300' : 'text-slate-500'
            }`}
          >
            · {isHoverPreview ? 'Before apply' : 'Selected pose'}
          </span>
        </div>
        {isBuiltIn && (
          <button
            type="button"
            onClick={() =>
              downloadBuiltInMocapBvh(
                previewStyle as (typeof BUILT_IN_MOCAP_LIBRARY)[number]['id']
              )
            }
            className="inline-flex items-center gap-1 text-[10.5px] text-cyan-300 hover:text-cyan-200 whitespace-nowrap transition-colors cursor-pointer shrink-0"
            title="Download active built-in BVH motion capture file"
          >
            <Download className="w-3 h-3" />
            <span>.bvh</span>
          </button>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        <div className="relative w-[96px] h-[112px] rounded-md border border-white/[0.1] bg-[#05070c] overflow-hidden shrink-0">
          <canvas
            ref={canvasRef}
            aria-label={`Static pose preview for ${title}`}
            className="w-full h-full block"
          />
          <span className="pointer-events-none absolute bottom-1 left-1.5 right-1.5 text-center text-[9px] font-mono uppercase tracking-wider text-slate-400/80">
            Static Pose
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="text-xs font-semibold text-slate-100 truncate">
            {title}
          </div>
          <div className="text-[10.5px] font-mono tabular-nums text-cyan-300/90 truncate">
            {metaLine}
          </div>
          <p className="text-[11px] text-slate-400 leading-snug line-clamp-3">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}
