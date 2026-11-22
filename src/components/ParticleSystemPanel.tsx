import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Compass,
  Eraser,
  Flame,
  Move,
  Orbit,
  RotateCcw,
  Sparkles,
  Target,
} from 'lucide-react';
import {
  createEmptyParticleFlowMap,
  PARTICLE_FLOW_COLS,
  PARTICLE_FLOW_ROWS,
  ParticleShape,
  StudioSettings,
} from '../types/studio';

interface ParticleSystemPanelProps {
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
}

type FlowBrushMode = 'directional' | 'attract' | 'repel' | 'swirl' | 'erase';

const PARTICLE_SHAPES: Array<{ id: ParticleShape; label: string }> = [
  { id: 'circle', label: 'Orb' },
  { id: 'diamond', label: 'Diamond' },
  { id: 'star', label: 'Star' },
  { id: 'square', label: 'Pixel' },
  { id: 'triangle', label: 'Shard' },
  { id: 'ring', label: 'Ring' },
];

const BRUSH_MODES: Array<{
  id: FlowBrushMode;
  label: string;
  icon: typeof Move;
  hint: string;
}> = [
  { id: 'directional', label: 'Stroke', icon: Move, hint: 'Paint flow along drag direction' },
  { id: 'attract', label: 'Attract', icon: Target, hint: 'Pull particles toward cursor' },
  { id: 'repel', label: 'Repel', icon: Compass, hint: 'Push particles away from cursor' },
  { id: 'swirl', label: 'Swirl', icon: Orbit, hint: 'Spin particles in vortex orbit' },
  { id: 'erase', label: 'Erase', icon: Eraser, hint: 'Clear flow vectors under brush' },
];

function ShapeGlyph({ shape, active }: { shape: ParticleShape; active: boolean }) {
  const stroke = active ? '#22d3ee' : 'currentColor';
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {shape === 'circle' && <circle cx="8" cy="8" r="4.5" fill={stroke} />}
      {shape === 'diamond' && (
        <polygon points="8,2.5 13.5,8 8,13.5 2.5,8" fill={stroke} />
      )}
      {shape === 'star' && (
        <polygon
          points="8,2 9.8,6 14,6.4 10.8,9.2 11.8,13.5 8,11.2 4.2,13.5 5.2,9.2 2,6.4 6.2,6"
          fill={stroke}
        />
      )}
      {shape === 'square' && <rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill={stroke} />}
      {shape === 'triangle' && <polygon points="8,2.5 13.5,13 2.5,13" fill={stroke} />}
      {shape === 'ring' && (
        <circle cx="8" cy="8" r="4.5" stroke={stroke} strokeWidth="2" />
      )}
    </svg>
  );
}

function buildPresetFlowMap(preset: 'rise' | 'burst' | 'vortex'): number[] {
  const cols = PARTICLE_FLOW_COLS;
  const rows = PARTICLE_FLOW_ROWS;
  const map = createEmptyParticleFlowMap();
  const cx = (cols - 1) * 0.5;
  const cy = (rows - 1) * 0.5;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = (r * cols + c) * 2;
      if (preset === 'rise') {
        const wave = Math.sin((c / cols) * Math.PI * 2) * 0.25;
        map[idx] = Number(wave.toFixed(3));
        map[idx + 1] = -0.85;
      } else if (preset === 'burst') {
        const dx = c - cx;
        const dy = r - cy;
        const len = Math.hypot(dx, dy) || 1;
        map[idx] = Number(((dx / len) * 0.85).toFixed(3));
        map[idx + 1] = Number(((dy / len) * 0.85).toFixed(3));
      } else {
        const dx = c - cx;
        const dy = r - cy;
        const len = Math.hypot(dx, dy) || 1;
        // Tangential swirl + slight inward pull
        map[idx] = Number(((-dy / len) * 0.85 - (dx / len) * 0.15).toFixed(3));
        map[idx + 1] = Number(((dx / len) * 0.85 - (dy / len) * 0.15).toFixed(3));
      }
    }
  }
  return map;
}

export function ParticleSystemPanel({
  settings,
  onUpdateSettings,
}: ParticleSystemPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [brushMode, setBrushMode] = useState<FlowBrushMode>('directional');
  const [brushRadius, setBrushRadius] = useState(2.2);
  const [brushStrength, setBrushStrength] = useState(0.75);
  const [isPainting, setIsPainting] = useState(false);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const workingMapRef = useRef<number[]>([]);

  const expectedLen = PARTICLE_FLOW_COLS * PARTICLE_FLOW_ROWS * 2;
  const flowMap = useMemo(() => {
    if (
      Array.isArray(settings.particleFlowMap) &&
      settings.particleFlowMap.length === expectedLen
    ) {
      return settings.particleFlowMap;
    }
    return createEmptyParticleFlowMap();
  }, [settings.particleFlowMap, expectedLen]);

  workingMapRef.current = flowMap;

  const hasFlowVectors = useMemo(
    () => flowMap.some((v) => Math.abs(v) > 0.02),
    [flowMap]
  );

  // Draw the flow map vector grid + active brush reticle
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 260;
    const cssH = canvas.clientHeight || 150;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // Subtle background grid
    const cellW = cssW / PARTICLE_FLOW_COLS;
    const cellH = cssH / PARTICLE_FLOW_ROWS;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;

    for (let c = 1; c < PARTICLE_FLOW_COLS; c++) {
      const x = Math.round(c * cellW) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cssH);
      ctx.stroke();
    }
    for (let r = 1; r < PARTICLE_FLOW_ROWS; r++) {
      const y = Math.round(r * cellH) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssW, y);
      ctx.stroke();
    }

    // Center crosshair reference
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.14)';
    ctx.beginPath();
    ctx.moveTo(cssW * 0.5, 0);
    ctx.lineTo(cssW * 0.5, cssH);
    ctx.moveTo(0, cssH * 0.5);
    ctx.lineTo(cssW, cssH * 0.5);
    ctx.stroke();

    // Draw vector arrows per cell
    for (let r = 0; r < PARTICLE_FLOW_ROWS; r++) {
      for (let c = 0; c < PARTICLE_FLOW_COLS; c++) {
        const idx = (r * PARTICLE_FLOW_COLS + c) * 2;
        const vx = flowMap[idx] || 0;
        const vy = flowMap[idx + 1] || 0;
        const mag = Math.hypot(vx, vy);
        const px = (c + 0.5) * cellW;
        const py = (r + 0.5) * cellH;

        if (mag < 0.025) {
          ctx.fillStyle = 'rgba(148, 163, 184, 0.2)';
          ctx.beginPath();
          ctx.arc(px, py, 1.1, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        const clampedMag = Math.min(1, mag);
        const arrowLen = Math.min(cellW, cellH) * 0.72 * clampedMag;
        const nx = vx / mag;
        const ny = vy / mag;
        const ex = px + nx * arrowLen;
        const ey = py + ny * arrowLen;

        ctx.strokeStyle =
          clampedMag > 0.55
            ? 'rgba(34, 211, 238, 0.92)'
            : 'rgba(103, 232, 249, 0.65)';
        ctx.lineWidth = 1.4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(px - nx * arrowLen * 0.25, py - ny * arrowLen * 0.25);
        ctx.lineTo(ex, ey);
        ctx.stroke();

        // Arrowhead
        const head = Math.max(2.6, arrowLen * 0.34);
        const angle = Math.atan2(ny, nx);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - Math.cos(angle - 0.55) * head,
          ey - Math.sin(angle - 0.55) * head
        );
        ctx.moveTo(ex, ey);
        ctx.lineTo(
          ex - Math.cos(angle + 0.55) * head,
          ey - Math.sin(angle + 0.55) * head
        );
        ctx.stroke();
      }
    }

    // Hover brush radius circle
    if (hoverPos) {
      const rPx = brushRadius * ((cellW + cellH) * 0.5);
      ctx.beginPath();
      ctx.arc(hoverPos.x, hoverPos.y, rPx, 0, Math.PI * 2);
      ctx.strokeStyle =
        brushMode === 'erase'
          ? 'rgba(244, 63, 94, 0.65)'
          : 'rgba(34, 211, 238, 0.6)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [flowMap, hoverPos, brushRadius, brushMode]);

  const paintFlowAt = useCallback(
    (clientX: number, clientY: number, prevClient: { x: number; y: number } | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
      setHoverPos({ x, y });

      const gx = (x / Math.max(1, rect.width)) * PARTICLE_FLOW_COLS;
      const gy = (y / Math.max(1, rect.height)) * PARTICLE_FLOW_ROWS;

      let strokeDx = 0;
      let strokeDy = 0;
      if (prevClient) {
        strokeDx = clientX - prevClient.x;
        strokeDy = clientY - prevClient.y;
      }
      const strokeLen = Math.hypot(strokeDx, strokeDy);
      if (brushMode === 'directional' && strokeLen < 1.2) {
        return;
      }

      const nextMap = [...workingMapRef.current];
      const radSq = brushRadius * brushRadius;

      for (let r = 0; r < PARTICLE_FLOW_ROWS; r++) {
        for (let c = 0; c < PARTICLE_FLOW_COLS; c++) {
          const cellCenterX = c + 0.5;
          const cellCenterY = r + 0.5;
          const dx = cellCenterX - gx;
          const dy = cellCenterY - gy;
          const distSq = dx * dx + dy * dy;
          if (distSq > radSq) continue;

          const falloff = 1 - Math.sqrt(distSq) / brushRadius;
          const weight = Math.max(0.08, falloff * brushStrength);
          const idx = (r * PARTICLE_FLOW_COLS + c) * 2;

          if (brushMode === 'erase') {
            nextMap[idx] = Number((nextMap[idx] * (1 - weight)).toFixed(3));
            nextMap[idx + 1] = Number((nextMap[idx + 1] * (1 - weight)).toFixed(3));
            if (Math.abs(nextMap[idx]) < 0.02) nextMap[idx] = 0;
            if (Math.abs(nextMap[idx + 1]) < 0.02) nextMap[idx + 1] = 0;
            continue;
          }

          let tx = 0;
          let ty = 0;
          if (brushMode === 'directional') {
            tx = strokeDx / strokeLen;
            ty = strokeDy / strokeLen;
          } else {
            const dist = Math.hypot(dx, dy) || 0.25;
            if (brushMode === 'attract') {
              tx = -dx / dist;
              ty = -dy / dist;
            } else if (brushMode === 'repel') {
              tx = dx / dist;
              ty = dy / dist;
            } else if (brushMode === 'swirl') {
              tx = -dy / dist;
              ty = dx / dist;
            }
          }

          const blendedX = nextMap[idx] * (1 - weight * 0.55) + tx * weight * 0.55;
          const blendedY = nextMap[idx + 1] * (1 - weight * 0.55) + ty * weight * 0.55;
          const mag = Math.hypot(blendedX, blendedY);
          const scale = mag > 1 ? 1 / mag : 1;
          nextMap[idx] = Number((blendedX * scale).toFixed(3));
          nextMap[idx + 1] = Number((blendedY * scale).toFixed(3));
        }
      }

      onUpdateSettings({
        particleEnabled:
          brushMode === 'erase' ? settings.particleEnabled : true,
        particleFlowMap: nextMap,
      });
    },
    [brushMode, brushRadius, brushStrength, onUpdateSettings, settings.particleEnabled]
  );

  useEffect(() => {
    if (!isPainting) return;

    const handleMove = (e: PointerEvent) => {
      paintFlowAt(e.clientX, e.clientY, lastPointerRef.current);
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
    };

    const handleUp = () => {
      setIsPainting(false);
      lastPointerRef.current = null;
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isPainting, paintFlowAt]);

  const velocity = settings.particleVelocity ?? 1.0;
  const lifespan = settings.particleLifespan ?? 1.2;
  const shape = settings.particleShape ?? 'circle';
  const enabled = Boolean(settings.particleEnabled);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          <h2 className="text-xs font-semibold text-slate-200">Particle System</h2>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Enable ambient particle emitter"
          onClick={() => onUpdateSettings({ particleEnabled: !enabled })}
          className={`w-9 h-5 rounded-full transition-colors p-0.5 cursor-pointer shrink-0 ${
            enabled ? 'bg-cyan-500' : 'bg-slate-700'
          }`}
        >
          <span
            className={`block w-4 h-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Particle Shape Picker */}
      <div className="space-y-1.5">
        <span className="block text-[11px] text-slate-400">Particle Shape</span>
        <div className="grid grid-cols-3 gap-1.5">
          {PARTICLE_SHAPES.map((item) => {
            const active = shape === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => onUpdateSettings({ particleShape: item.id })}
                className={`px-2 py-1.5 rounded-lg border text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-cyan-500/12 border-cyan-400/45 text-cyan-200'
                    : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:border-white/[0.16]'
                }`}
              >
                <ShapeGlyph shape={item.id} active={active} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Velocity & Lifespan Sliders */}
      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-slate-400">Particle Velocity</span>
          <span className="font-mono tabular-nums text-cyan-400">
            {velocity.toFixed(2)}×
          </span>
        </div>
        <input
          type="range"
          min={0.2}
          max={3.0}
          step={0.05}
          aria-label="Particle Velocity"
          value={velocity}
          onChange={(e) =>
            onUpdateSettings({ particleVelocity: parseFloat(e.target.value) })
          }
          className="studio-range w-full"
        />
      </div>

      <div>
        <div className="flex justify-between text-[11px] mb-1">
          <span className="text-slate-400">Particle Lifespan</span>
          <span className="font-mono tabular-nums text-cyan-400">
            {lifespan.toFixed(2)}s
          </span>
        </div>
        <input
          type="range"
          min={0.3}
          max={3.5}
          step={0.05}
          aria-label="Particle Lifespan"
          value={lifespan}
          onChange={(e) =>
            onUpdateSettings({ particleLifespan: parseFloat(e.target.value) })
          }
          className="studio-range w-full"
        />
      </div>

      {/* Brush-Based Flow Map Editor */}
      <div className="space-y-2 pt-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-slate-300">
            Flow Map Brush Editor
          </span>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({ particleFlowMap: createEmptyParticleFlowMap() })
            }
            disabled={!hasFlowVectors}
            title="Clear painted flow vectors"
            className="text-[10.5px] font-medium text-slate-400 hover:text-cyan-300 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Clear</span>
          </button>
        </div>

        {/* Brush Mode Selector */}
        <div className="grid grid-cols-5 gap-1 p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
          {BRUSH_MODES.map((m) => {
            const Icon = m.icon;
            const active = brushMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={active}
                title={m.hint}
                onClick={() => setBrushMode(m.id)}
                className={`py-1.5 px-1 rounded-md text-[10px] font-medium flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-cyan-400 text-[#090b10] font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{m.label}</span>
              </button>
            );
          })}
        </div>

        {/* Interactive Flow Map Canvas */}
        <div className="relative rounded-lg bg-[#090b10] border border-white/[0.09] overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              lastPointerRef.current = { x: e.clientX, y: e.clientY };
              setIsPainting(true);
              paintFlowAt(e.clientX, e.clientY, null);
            }}
            onPointerMove={(e) => {
              const canvas = canvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              setHoverPos({
                x: Math.max(0, Math.min(rect.width, e.clientX - rect.left)),
                y: Math.max(0, Math.min(rect.height, e.clientY - rect.top)),
              });
            }}
            onPointerLeave={() => setHoverPos(null)}
            className="w-full h-[146px] block cursor-crosshair touch-none"
          />
        </div>

        {/* Brush Size & Strength + Quick Flow Presets */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <div className="flex justify-between text-[10.5px] mb-1">
              <span className="text-slate-400">Brush Size</span>
              <span className="font-mono tabular-nums text-cyan-400">
                {brushRadius.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={4.5}
              step={0.25}
              aria-label="Flow brush size"
              value={brushRadius}
              onChange={(e) => setBrushRadius(parseFloat(e.target.value))}
              className="studio-range w-full"
            />
          </div>

          <div>
            <div className="flex justify-between text-[10.5px] mb-1">
              <span className="text-slate-400">Strength</span>
              <span className="font-mono tabular-nums text-cyan-400">
                {Math.round(brushStrength * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              aria-label="Flow brush strength"
              value={brushStrength}
              onChange={(e) => setBrushStrength(parseFloat(e.target.value))}
              className="studio-range w-full"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                particleEnabled: true,
                particleFlowMap: buildPresetFlowMap('rise'),
              })
            }
            className="px-2 py-1 rounded-md bg-[#090b10] hover:bg-white/[0.06] border border-white/[0.08] text-[10.5px] text-slate-300 transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Flame className="w-3 h-3 text-cyan-400" />
            <span>Upward</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                particleEnabled: true,
                particleFlowMap: buildPresetFlowMap('burst'),
              })
            }
            className="px-2 py-1 rounded-md bg-[#090b10] hover:bg-white/[0.06] border border-white/[0.08] text-[10.5px] text-slate-300 transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Compass className="w-3 h-3 text-cyan-400" />
            <span>Radial</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                particleEnabled: true,
                particleFlowMap: buildPresetFlowMap('vortex'),
              })
            }
            className="px-2 py-1 rounded-md bg-[#090b10] hover:bg-white/[0.06] border border-white/[0.08] text-[10.5px] text-slate-300 transition-colors flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Orbit className="w-3 h-3 text-cyan-400" />
            <span>Vortex</span>
          </button>
        </div>

        <p className="text-[10px] text-slate-500 leading-relaxed">
          Drag across the flow field pad to steer particle currents. Applies to the ambient
          particle layer, Hybrid Ring, and Beat Burst particles.
        </p>
      </div>
    </section>
  );
}
