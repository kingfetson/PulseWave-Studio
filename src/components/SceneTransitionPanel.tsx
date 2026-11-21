import { Play, Sparkles } from 'lucide-react';
import {
  SceneTransitionTarget,
  SceneTransitionType,
  StudioSettings,
} from '../types/studio';

interface SceneTransitionPanelProps {
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  onPreviewTransition?: () => void;
}

const TRANSITION_OPTIONS: Array<{
  id: SceneTransitionType;
  label: string;
}> = [
  { id: 'none', label: 'Cut (None)' },
  { id: 'crossfade', label: 'Crossfade' },
  { id: 'wipe-left', label: 'Wipe Left' },
  { id: 'wipe-right', label: 'Wipe Right' },
  { id: 'wipe-up', label: 'Wipe Up' },
  { id: 'wipe-down', label: 'Wipe Down' },
];

const TARGET_OPTIONS: Array<{
  id: SceneTransitionTarget;
  label: string;
}> = [
  { id: 'both', label: 'Both' },
  { id: 'lyrics', label: 'Lyrics' },
  { id: 'visualizer', label: 'Visual Modes' },
];

export function SceneTransitionPanel({
  settings,
  onUpdateSettings,
  onPreviewTransition,
}: SceneTransitionPanelProps) {
  const transitionType = settings.sceneTransitionType ?? 'crossfade';
  const transitionDuration = settings.sceneTransitionDuration ?? 0.45;
  const transitionTarget = settings.sceneTransitionTarget ?? 'both';
  const isEnabled = transitionType !== 'none';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="text-xs font-semibold text-slate-200">Scene Transition</h2>
        </div>

        {onPreviewTransition && isEnabled && transitionTarget !== 'lyrics' && (
          <button
            type="button"
            onClick={onPreviewTransition}
            title="Preview the selected scene transition on the canvas"
            className="px-2 py-1 rounded-md text-[10.5px] font-medium bg-[#090b10] hover:bg-white/[0.06] text-cyan-300 border border-white/[0.08] hover:border-cyan-400/35 transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Play className="w-2.5 h-2.5 fill-current" />
            <span>Preview</span>
          </button>
        )}
      </div>

      {/* Effect Picker */}
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Scene transition effect">
        {TRANSITION_OPTIONS.map((opt) => {
          const active = transitionType === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onUpdateSettings({ sceneTransitionType: opt.id })}
              className={`px-2.5 py-2 rounded-lg border text-left text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap truncate ${
                active
                  ? 'bg-cyan-500/12 border-cyan-400/45 text-cyan-200'
                  : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {isEnabled && (
        <>
          {/* Duration Slider */}
          <div>
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">Transition Duration</span>
              <span className="font-mono tabular-nums text-cyan-400">
                {transitionDuration.toFixed(2)}s
              </span>
            </div>
            <input
              type="range"
              min={0.15}
              max={1.5}
              step={0.05}
              aria-label="Scene transition duration"
              value={transitionDuration}
              onChange={(e) =>
                onUpdateSettings({ sceneTransitionDuration: parseFloat(e.target.value) })
              }
              className="studio-range w-full"
            />
          </div>

          {/* Target Scope */}
          <div className="space-y-1.5">
            <span className="block text-[11px] text-slate-400">Apply Transitions To</span>
            <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
              {TARGET_OPTIONS.map((target) => {
                const active = transitionTarget === target.id;
                return (
                  <button
                    key={target.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => onUpdateSettings({ sceneTransitionTarget: target.id })}
                    className={`px-2 py-1.5 rounded-md text-[10.5px] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-cyan-400 text-[#090b10] font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {target.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <p className="text-[10.5px] leading-relaxed text-slate-500">
        {isEnabled
          ? 'Smoothly blends or wipes between synced lyric cues and visualizer mode switches.'
          : 'Switches immediately between lyric lines and visual modes without blending.'}
      </p>
    </section>
  );
}
