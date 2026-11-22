import {
  createEmptyParticleFlowMap,
  PARTICLE_FLOW_COLS,
  PARTICLE_FLOW_ROWS,
} from '../types/studio';

export const FLOW_MAP_LENGTH = PARTICLE_FLOW_COLS * PARTICLE_FLOW_ROWS * 2;

export type FlowBrushMode = 'draw' | 'swirl' | 'attract' | 'erase';
export type FlowPresetKind = 'upward' | 'radial' | 'swirl' | 'converge' | 'clear';

export function normalizeParticleFlowMap(raw: unknown): number[] {
  if (!Array.isArray(raw) || raw.length !== FLOW_MAP_LENGTH) {
    return createEmptyParticleFlowMap();
  }
  const out = new Array<number>(FLOW_MAP_LENGTH);
  for (let i = 0; i < FLOW_MAP_LENGTH; i++) {
    const v = raw[i];
    out[i] =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.max(-1, Math.min(1, Number(v.toFixed(3))))
        : 0;
  }
  return out;
}

export function hasActiveFlowVectors(grid: number[] | undefined): boolean {
  if (!grid || grid.length < 2) return false;
  for (let i = 0; i < grid.length; i++) {
    if (Math.abs(grid[i]) > 0.02) return true;
  }
  return false;
}

export function buildPresetFlowMap(kind: FlowPresetKind): number[] {
  const grid = createEmptyParticleFlowMap();
  if (kind === 'clear') return grid;

  for (let r = 0; r < PARTICLE_FLOW_ROWS; r++) {
    const ny = r / (PARTICLE_FLOW_ROWS - 1);
    const dy = ny - 0.5;
    for (let c = 0; c < PARTICLE_FLOW_COLS; c++) {
      const nx = c / (PARTICLE_FLOW_COLS - 1);
      const dx = nx - 0.5;
      const dist = Math.hypot(dx, dy) || 0.001;
      const idx = (r * PARTICLE_FLOW_COLS + c) * 2;

      if (kind === 'upward') {
        grid[idx] = Number((Math.sin(nx * Math.PI * 2) * 0.25).toFixed(3));
        grid[idx + 1] = -0.88;
      } else if (kind === 'radial') {
        grid[idx] = Number(((dx / dist) * 0.9).toFixed(3));
        grid[idx + 1] = Number(((dy / dist) * 0.9).toFixed(3));
      } else if (kind === 'converge') {
        grid[idx] = Number((-(dx / dist) * 0.88).toFixed(3));
        grid[idx + 1] = Number((-(dy / dist) * 0.88).toFixed(3));
      } else if (kind === 'swirl') {
        const tx = -dy / dist;
        const ty = dx / dist;
        grid[idx] = Number(Math.max(-1, Math.min(1, tx * 0.88 + dx * 0.18)).toFixed(3));
        grid[idx + 1] = Number(Math.max(-1, Math.min(1, ty * 0.88 + dy * 0.18)).toFixed(3));
      }
    }
  }
  return grid;
}

export function paintFlowMapBrush(
  currentGrid: number[] | undefined,
  normX: number,
  normY: number,
  dirX: number,
  dirY: number,
  radiusNorm: number,
  brushMode: FlowBrushMode,
  brushStrength = 0.72
): number[] {
  const grid = normalizeParticleFlowMap(currentGrid);
  const cx = Math.max(0, Math.min(1, normX));
  const cy = Math.max(0, Math.min(1, normY));
  const rad = Math.max(0.06, Math.min(0.45, radiusNorm));

  const dirLen = Math.hypot(dirX, dirY);
  const ux = dirLen > 1e-4 ? dirX / dirLen : 0;
  const uy = dirLen > 1e-4 ? dirY / dirLen : 0;

  for (let r = 0; r < PARTICLE_FLOW_ROWS; r++) {
    const ny = r / (PARTICLE_FLOW_ROWS - 1);
    for (let c = 0; c < PARTICLE_FLOW_COLS; c++) {
      const nx = c / (PARTICLE_FLOW_COLS - 1);
      const dx = nx - cx;
      const dy = ny - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > rad) continue;

      const falloff = 1 - dist / rad;
      const weight = falloff * falloff * brushStrength;
      const idx = (r * PARTICLE_FLOW_COLS + c) * 2;

      if (brushMode === 'erase') {
        const keep = Math.max(0, 1 - weight * 1.2);
        grid[idx] = Number((grid[idx] * keep).toFixed(3));
        grid[idx + 1] = Number((grid[idx + 1] * keep).toFixed(3));
      } else if (brushMode === 'swirl') {
        const d = dist > 1e-4 ? dist : 0.001;
        const tx = -dy / d;
        const ty = dx / d;
        const nxVec = grid[idx] * (1 - weight) + tx * weight;
        const nyVec = grid[idx + 1] * (1 - weight) + ty * weight;
        const mag = Math.hypot(nxVec, nyVec);
        const clampScale = mag > 1 ? 1 / mag : 1;
        grid[idx] = Number((nxVec * clampScale).toFixed(3));
        grid[idx + 1] = Number((nyVec * clampScale).toFixed(3));
      } else if (brushMode === 'attract') {
        const d = dist > 1e-4 ? dist : 0.001;
        const ax = -dx / d;
        const ay = -dy / d;
        const nxVec = grid[idx] * (1 - weight) + ax * weight;
        const nyVec = grid[idx + 1] * (1 - weight) + ay * weight;
        const mag = Math.hypot(nxVec, nyVec);
        const clampScale = mag > 1 ? 1 / mag : 1;
        grid[idx] = Number((nxVec * clampScale).toFixed(3));
        grid[idx + 1] = Number((nyVec * clampScale).toFixed(3));
      } else if (dirLen > 1e-4) {
        const nxVec = grid[idx] * (1 - weight) + ux * weight;
        const nyVec = grid[idx + 1] * (1 - weight) + uy * weight;
        const mag = Math.hypot(nxVec, nyVec);
        const clampScale = mag > 1 ? 1 / mag : 1;
        grid[idx] = Number((nxVec * clampScale).toFixed(3));
        grid[idx + 1] = Number((nyVec * clampScale).toFixed(3));
      }
    }
  }

  return grid;
}

/**
 * Bilinearly samples the 16x12 flow map at normalized coordinates (normX, normY in [0..1]).
 */
export function sampleParticleFlowMap(
  grid: number[] | undefined,
  normX: number,
  normY: number
): { fx: number; fy: number } {
  if (!grid || grid.length !== FLOW_MAP_LENGTH) {
    return { fx: 0, fy: 0 };
  }

  const gx = Math.max(0, Math.min(1, normX)) * (PARTICLE_FLOW_COLS - 1);
  const gy = Math.max(0, Math.min(1, normY)) * (PARTICLE_FLOW_ROWS - 1);

  const c0 = Math.floor(gx);
  const r0 = Math.floor(gy);
  const c1 = Math.min(PARTICLE_FLOW_COLS - 1, c0 + 1);
  const r1 = Math.min(PARTICLE_FLOW_ROWS - 1, r0 + 1);

  const tx = gx - c0;
  const ty = gy - r0;

  const i00 = (r0 * PARTICLE_FLOW_COLS + c0) * 2;
  const i10 = (r0 * PARTICLE_FLOW_COLS + c1) * 2;
  const i01 = (r1 * PARTICLE_FLOW_COLS + c0) * 2;
  const i11 = (r1 * PARTICLE_FLOW_COLS + c1) * 2;

  const fx0 = grid[i00] * (1 - tx) + grid[i10] * tx;
  const fx1 = grid[i01] * (1 - tx) + grid[i11] * tx;
  const fy0 = grid[i00 + 1] * (1 - tx) + grid[i10 + 1] * tx;
  const fy1 = grid[i01 + 1] * (1 - tx) + grid[i11 + 1] * tx;

  return {
    fx: fx0 * (1 - ty) + fx1 * ty,
    fy: fy0 * (1 - ty) + fy1 * ty,
  };
}
