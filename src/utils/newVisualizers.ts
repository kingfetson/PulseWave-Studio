import { VisualizerMode } from '../types/studio';
import type { ExtraVisualizerContext } from './extraVisualizers';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Proj2 {
  x: number;
  y: number;
  scale: number;
  z: number;
}

function rotatePoint(
  x: number,
  y: number,
  z: number,
  cosX: number,
  sinX: number,
  cosY: number,
  sinY: number,
  cosZ: number,
  sinZ: number
): Vec3 {
  // Rotate around X
  const y1 = y * cosX - z * sinX;
  const z1 = y * sinX + z * cosX;
  // Rotate around Y
  const x2 = x * cosY + z1 * sinY;
  const z2 = -x * sinY + z1 * cosY;
  // Rotate around Z
  const x3 = x2 * cosZ - y1 * sinZ;
  const y3 = x2 * sinZ + y1 * cosZ;
  return { x: x3, y: y3, z: z2 };
}

function projectPoint(
  p: Vec3,
  cx: number,
  cy: number,
  focal: number,
  camDist: number
): Proj2 {
  const denom = Math.max(0.25 * focal, camDist + p.z);
  const scale = focal / denom;
  return {
    x: cx + p.x * scale,
    y: cy + p.y * scale,
    scale,
    z: p.z,
  };
}

function makeTrig(rx: number, ry: number, rz: number) {
  return {
    cosX: Math.cos(rx),
    sinX: Math.sin(rx),
    cosY: Math.cos(ry),
    sinY: Math.sin(ry),
    cosZ: Math.cos(rz),
    sinZ: Math.sin(rz),
  };
}

function detRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

// Golden ratio constant for regular polyhedra
const PHI = (1 + Math.sqrt(5)) / 2;

const ICOSA_RAW_VERTS: Array<[number, number, number]> = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map(([x, y, z]) => {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
});

const ICOSA_FACES: Array<[number, number, number]> = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

const DODECA_RAW_VERTS: Array<[number, number, number]> = (() => {
  const invPhi = 1 / PHI;
  const raw: Array<[number, number, number]> = [
    [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
    [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
    [0, -invPhi, -PHI], [0, -invPhi, PHI], [0, invPhi, -PHI], [0, invPhi, PHI],
    [-invPhi, -PHI, 0], [-invPhi, PHI, 0], [invPhi, -PHI, 0], [invPhi, PHI, 0],
    [-PHI, 0, -invPhi], [PHI, 0, -invPhi], [-PHI, 0, invPhi], [PHI, 0, invPhi],
  ];
  return raw.map(([x, y, z]) => {
    const l = Math.hypot(x, y, z);
    return [x / l, y / l, z / l];
  });
})();

const DODECA_EDGES: Array<[number, number]> = (() => {
  const edges: Array<[number, number]> = [];
  for (let i = 0; i < DODECA_RAW_VERTS.length; i++) {
    for (let j = i + 1; j < DODECA_RAW_VERTS.length; j++) {
      const dx = DODECA_RAW_VERTS[i][0] - DODECA_RAW_VERTS[j][0];
      const dy = DODECA_RAW_VERTS[i][1] - DODECA_RAW_VERTS[j][1];
      const dz = DODECA_RAW_VERTS[i][2] - DODECA_RAW_VERTS[j][2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist < 0.78) edges.push([i, j]);
    }
  }
  return edges;
})();

const TESSERACT_VERTS: Array<[number, number, number, number]> = (() => {
  const v: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 16; i++) {
    v.push([
      i & 1 ? 1 : -1,
      i & 2 ? 1 : -1,
      i & 4 ? 1 : -1,
      i & 8 ? 1 : -1,
    ]);
  }
  return v;
})();

const TESSERACT_EDGES: Array<[number, number]> = (() => {
  const e: Array<[number, number]> = [];
  for (let i = 0; i < 16; i++) {
    for (let bit = 0; bit < 4; bit++) {
      const j = i ^ (1 << bit);
      if (i < j) e.push([i, j]);
    }
  }
  return e;
})();

export function renderNewVisualizerMode(
  mode: VisualizerMode,
  c: ExtraVisualizerContext
): boolean {
  const {
    vCtx,
    width,
    height,
    minDim,
    visCenterY,
    visScale,
    linW,
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
  } = c;

  const cx = width * 0.5;
  const cy = visCenterY;
  const primary = settings.primaryColor;
  const secondary = settings.secondaryColor;
  const sens = settings.sensitivity;
  const focal = minDim * 1.45;
  const camDist = minDim * 1.55;

  // =========================================================================
  // 25 3D VISUALIZER MODES
  // =========================================================================

  // 1. 3D Torus Knot Matrix
  if (mode === 'torus-3d') {
    const majorR = minDim * 0.22 * visScale * (1 + beatBoost * 0.08);
    const minorBase = minDim * 0.085 * visScale;
    const rings = 24;
    const segs = 12;
    const t = makeTrig(currentTime * 0.55, currentTime * 0.78, currentTime * 0.22);

    const grid: Proj2[][] = [];
    for (let i = 0; i < rings; i++) {
      const u = (i / rings) * Math.PI * 2;
      const band = getPerceptualBarValue(frequencyData, i, rings, sens);
      const minorR = minorBase * (0.65 + band * 0.85 + bass * 0.25);
      const ringPts: Proj2[] = [];
      for (let j = 0; j < segs; j++) {
        const v = (j / segs) * Math.PI * 2;
        const r = majorR + minorR * Math.cos(v);
        const px = r * Math.cos(u);
        const py = minorR * Math.sin(v);
        const pz = r * Math.sin(u);
        const rp = rotatePoint(px, py, pz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        ringPts.push(projectPoint(rp, cx, cy, focal, camDist));
      }
      grid.push(ringPts);
    }

    vCtx.save();
    applyShadow(primary, minDim * 0.014);
    vCtx.lineWidth = Math.max(1.1, minDim * 0.0022);
    for (let i = 0; i < rings; i++) {
      const nextI = (i + 1) % rings;
      vCtx.strokeStyle = i % 2 === 0 ? hexToRgba(primary, 0.72) : hexToRgba(secondary, 0.68);
      vCtx.beginPath();
      for (let j = 0; j < segs; j++) {
        const nextJ = (j + 1) % segs;
        const p0 = grid[i][j];
        const p1 = grid[i][nextJ];
        const p2 = grid[nextI][j];
        vCtx.moveTo(p0.x, p0.y);
        vCtx.lineTo(p1.x, p1.y);
        vCtx.moveTo(p0.x, p0.y);
        vCtx.lineTo(p2.x, p2.y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 2. 3D Geodesic Icosahedron
  if (mode === 'icosahedron-3d') {
    const baseR = minDim * 0.26 * visScale * (1 + bass * 0.14 + beatBoost * 0.12);
    const t = makeTrig(currentTime * 0.48, currentTime * 0.66, currentTime * 0.31);
    const rotVerts: Vec3[] = ICOSA_RAW_VERTS.map((v, idx) => {
      const val = getPerceptualBarValue(frequencyData, idx, 12, sens);
      const r = baseR * (0.85 + val * 0.45);
      return rotatePoint(v[0] * r, v[1] * r, v[2] * r, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
    });
    const projVerts = rotVerts.map((p) => projectPoint(p, cx, cy, focal, camDist));

    const sortedFaces = ICOSA_FACES.map((face, idx) => {
      const zAvg = (rotVerts[face[0]].z + rotVerts[face[1]].z + rotVerts[face[2]].z) / 3;
      return { face, idx, zAvg };
    }).sort((a, b) => b.zAvg - a.zAvg);

    vCtx.save();
    applyShadow(primary, minDim * 0.015);
    vCtx.lineWidth = Math.max(1.4, minDim * 0.0028);
    for (const item of sortedFaces) {
      const a = projVerts[item.face[0]];
      const b = projVerts[item.face[1]];
      const d = projVerts[item.face[2]];
      const depthNorm = Math.max(0.15, Math.min(0.9, 0.5 - item.zAvg / (baseR * 2.2)));
      const col = item.idx % 2 === 0 ? primary : secondary;
      vCtx.beginPath();
      vCtx.moveTo(a.x, a.y);
      vCtx.lineTo(b.x, b.y);
      vCtx.lineTo(d.x, d.y);
      vCtx.closePath();
      vCtx.fillStyle = hexToRgba(col, 0.09 + depthNorm * 0.24);
      vCtx.fill();
      vCtx.strokeStyle = hexToRgba(col, 0.35 + depthNorm * 0.58);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 3. 3D Dual Octahedron
  if (mode === 'octahedron-3d') {
    const outerR = minDim * 0.28 * visScale * (1 + bass * 0.16);
    const innerR = outerR * (0.52 + mid * 0.22);
    const octaVerts: Array<[number, number, number]> = [
      [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1],
    ];
    const octaFaces: Array<[number, number, number]> = [
      [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2],
      [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5],
    ];

    const drawOcta = (r: number, rx: number, ry: number, rz: number, color: string, fillAlpha: number) => {
      const t = makeTrig(rx, ry, rz);
      const rot = octaVerts.map((v) => rotatePoint(v[0] * r, v[1] * r, v[2] * r, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ));
      const proj = rot.map((p) => projectPoint(p, cx, cy, focal, camDist));
      const sorted = octaFaces
        .map((f) => ({ f, z: (rot[f[0]].z + rot[f[1]].z + rot[f[2]].z) / 3 }))
        .sort((a, b) => b.z - a.z);
      for (const item of sorted) {
        const p0 = proj[item.f[0]];
        const p1 = proj[item.f[1]];
        const p2 = proj[item.f[2]];
        vCtx.beginPath();
        vCtx.moveTo(p0.x, p0.y);
        vCtx.lineTo(p1.x, p1.y);
        vCtx.lineTo(p2.x, p2.y);
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(color, fillAlpha);
        vCtx.fill();
        vCtx.strokeStyle = hexToRgba(color, 0.85);
        vCtx.stroke();
      }
    };

    vCtx.save();
    applyShadow(primary, minDim * 0.015);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    drawOcta(outerR, currentTime * 0.5, currentTime * 0.8, 0.3, primary, 0.12 + bass * 0.1);
    drawOcta(innerR, -currentTime * 0.9, -currentTime * 0.6, currentTime * 0.4, secondary, 0.2 + treble * 0.15);
    vCtx.restore();
    return true;
  }

  // 4. 3D Fibonacci Sphere
  if (mode === 'sphere-dots-3d') {
    const count = 110;
    const baseR = minDim * 0.25 * visScale * (1 + beatBoost * 0.1);
    const t = makeTrig(currentTime * 0.35, currentTime * 0.62, currentTime * 0.15);
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const pts: Array<{ p: Proj2; col: string; amp: number }> = [];

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radAtY = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = goldenAngle * i;
      const amp = getPerceptualBarValue(frequencyData, i % 40, 40, sens);
      const r = baseR * (0.78 + amp * 0.55);
      const rp = rotatePoint(
        Math.cos(theta) * radAtY * r,
        y * r,
        Math.sin(theta) * radAtY * r,
        t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ
      );
      pts.push({
        p: projectPoint(rp, cx, cy, focal, camDist),
        col: i % 3 === 0 ? secondary : primary,
        amp,
      });
    }

    pts.sort((a, b) => b.p.z - a.p.z);
    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    for (const item of pts) {
      const depthAlpha = Math.max(0.2, Math.min(1, 0.65 - item.p.z / (baseR * 2.5)));
      const dotR = Math.max(1.8, minDim * 0.0045 * item.p.scale * (0.7 + item.amp * 1.4));
      vCtx.beginPath();
      vCtx.arc(item.p.x, item.p.y, dotR, 0, Math.PI * 2);
      vCtx.fillStyle = hexToRgba(item.col, depthAlpha);
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  // 5. 3D Cylinder Equalizer
  if (mode === 'cylinder-eq-3d') {
    const count = 36;
    const cylR = minDim * 0.24 * visScale;
    const maxH = minDim * 0.34 * visScale;
    const t = makeTrig(0.38 + Math.sin(currentTime * 0.6) * 0.14, currentTime * 0.52, 0);

    const bars3D: Array<{ base: Proj2; top: Proj2; z: number; idx: number; val: number }> = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const val = getPerceptualBarValue(frequencyData, i, count, sens);
      const h = Math.max(minDim * 0.02, val * maxH);
      const x = Math.cos(a) * cylR;
      const z = Math.sin(a) * cylR;
      const bRot = rotatePoint(x, maxH * 0.38, z, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      const tRot = rotatePoint(x, maxH * 0.38 - h, z, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      bars3D.push({
        base: projectPoint(bRot, cx, cy, focal, camDist),
        top: projectPoint(tRot, cx, cy, focal, camDist),
        z: bRot.z,
        idx: i,
        val,
      });
    }
    bars3D.sort((a, b) => b.z - a.z);

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineCap = 'round';
    for (const b of bars3D) {
      const alpha = Math.max(0.25, Math.min(0.98, 0.65 - b.z / (cylR * 2.2)));
      vCtx.strokeStyle = hexToRgba(b.idx % 2 === 0 ? primary : secondary, alpha);
      vCtx.lineWidth = Math.max(2.5, minDim * 0.011 * b.base.scale);
      vCtx.beginPath();
      vCtx.moveTo(b.base.x, b.base.y);
      vCtx.lineTo(b.top.x, b.top.y);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 6. 3D Perspective Helix
  if (mode === 'helix-double-3d') {
    const steps = 34;
    const radius = minDim * 0.14 * visScale * (1 + bass * 0.22);
    const spanH = minDim * 0.56 * visScale;
    const t = makeTrig(0.18, currentTime * 1.15, Math.sin(currentTime * 0.4) * 0.25);
    const sA: Proj2[] = [];
    const sB: Proj2[] = [];

    for (let i = 0; i < steps; i++) {
      const frac = i / (steps - 1);
      const y = (frac - 0.5) * spanH;
      const angle = frac * Math.PI * 3.8;
      const val = getPerceptualBarValue(frequencyData, i, steps, sens);
      const r = radius * (0.75 + val * 0.55);
      const pA = rotatePoint(Math.cos(angle) * r, y, Math.sin(angle) * r, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      const pB = rotatePoint(Math.cos(angle + Math.PI) * r, y, Math.sin(angle + Math.PI) * r, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      sA.push(projectPoint(pA, cx, cy, focal, camDist));
      sB.push(projectPoint(pB, cx, cy, focal, camDist));
    }

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineWidth = Math.max(1.4, minDim * 0.0028);
    for (let i = 0; i < steps; i++) {
      if (i % 2 === 0) {
        vCtx.strokeStyle = hexToRgba('#ffffff', 0.32 + mid * 0.35);
        vCtx.beginPath();
        vCtx.moveTo(sA[i].x, sA[i].y);
        vCtx.lineTo(sB[i].x, sB[i].y);
        vCtx.stroke();
      }
    }
    const drawRibbon = (pts: Proj2[], col: string) => {
      vCtx.strokeStyle = col;
      vCtx.lineWidth = Math.max(2.4, minDim * 0.0055);
      vCtx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? vCtx.moveTo(p.x, p.y) : vCtx.lineTo(p.x, p.y)));
      vCtx.stroke();
    };
    drawRibbon(sA, primary);
    drawRibbon(sB, secondary);
    vCtx.restore();
    return true;
  }

  // 7. 3D Audio Terrain
  if (mode === 'terrain-mesh-3d') {
    const rows = 12;
    const cols = 18;
    const meshW = linW * 0.95;
    const meshD = minDim * 0.65 * visScale;
    const t = makeTrig(0.58, Math.sin(currentTime * 0.35) * 0.16, 0);
    const grid: Proj2[][] = [];

    for (let r = 0; r < rows; r++) {
      const rowPts: Proj2[] = [];
      const zFrac = r / (rows - 1);
      const z = (zFrac - 0.5) * meshD;
      for (let col = 0; col < cols; col++) {
        const xFrac = col / (cols - 1);
        const x = (xFrac - 0.5) * meshW;
        const idx = Math.floor(((col + r * 2) % 32));
        const amp = getPerceptualBarValue(frequencyData, idx, 32, sens);
        const ripple = Math.sin(xFrac * 8 + currentTime * 3.5 - zFrac * 6) * 0.25;
        const y = minDim * 0.12 - (amp * 0.24 + Math.max(0, ripple) * 0.06) * minDim * visScale;
        const rp = rotatePoint(x, y, z, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        rowPts.push(projectPoint(rp, cx, cy + minDim * 0.04, focal, camDist));
      }
      grid.push(rowPts);
    }

    vCtx.save();
    applyShadow(primary, minDim * 0.01);
    vCtx.lineWidth = Math.max(1.1, minDim * 0.0022);
    for (let r = 0; r < rows; r++) {
      const alpha = 0.25 + (1 - r / rows) * 0.65;
      vCtx.strokeStyle = hexToRgba(r % 2 === 0 ? primary : secondary, alpha);
      vCtx.beginPath();
      for (let col = 0; col < cols; col++) {
        const p = grid[r][col];
        if (col === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
        if (r + 1 < rows) {
          vCtx.moveTo(p.x, p.y);
          vCtx.lineTo(grid[r + 1][col].x, grid[r + 1][col].y);
        }
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 8. 3D Prism Cascade
  if (mode === 'prism-stack-3d') {
    const layers = 9;
    const sides = 6;
    const spanH = minDim * 0.48 * visScale;

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    for (let l = 0; l < layers; l++) {
      const frac = l / (layers - 1);
      const val = getPerceptualBarValue(frequencyData, l * 2, layers * 2, sens);
      const r = minDim * (0.09 + val * 0.18 + beatBoost * 0.04) * visScale;
      const y = (frac - 0.5) * spanH;
      const rot = makeTrig(0.45, currentTime * 0.8 + l * 0.35, 0);
      const col = l % 2 === 0 ? primary : secondary;

      vCtx.beginPath();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const rp = rotatePoint(Math.cos(a) * r, y, Math.sin(a) * r, rot.cosX, rot.sinX, rot.cosY, rot.sinY, rot.cosZ, rot.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.fillStyle = hexToRgba(col, 0.08 + val * 0.14);
      vCtx.fill();
      vCtx.strokeStyle = hexToRgba(col, 0.55 + val * 0.4);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 9. 3D Dodecahedron Core
  if (mode === 'dodecahedron-3d') {
    const r = minDim * 0.27 * visScale * (1 + bass * 0.14 + beatBoost * 0.1);
    const t = makeTrig(currentTime * 0.42, currentTime * 0.58, currentTime * 0.25);
    const rot = DODECA_RAW_VERTS.map((v, idx) => {
      const band = getPerceptualBarValue(frequencyData, idx % 16, 16, sens);
      const vr = r * (0.9 + band * 0.22);
      return rotatePoint(v[0] * vr, v[1] * vr, v[2] * vr, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
    });
    const proj = rot.map((p) => projectPoint(p, cx, cy, focal, camDist));

    vCtx.save();
    // Pulsing inner core
    const coreR = r * (0.28 + bass * 0.22);
    const grad = vCtx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    grad.addColorStop(0, hexToRgba(secondary, 0.85));
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    vCtx.fillStyle = grad;
    vCtx.beginPath();
    vCtx.arc(cx, cy, coreR, 0, Math.PI * 2);
    vCtx.fill();

    applyShadow(primary, minDim * 0.015);
    vCtx.lineWidth = Math.max(1.6, minDim * 0.0032);
    for (let eIdx = 0; eIdx < DODECA_EDGES.length; eIdx++) {
      const [i, j] = DODECA_EDGES[eIdx];
      const zAvg = (rot[i].z + rot[j].z) * 0.5;
      const alpha = Math.max(0.22, Math.min(0.95, 0.65 - zAvg / (r * 2)));
      vCtx.strokeStyle = hexToRgba(eIdx % 2 === 0 ? primary : secondary, alpha);
      vCtx.beginPath();
      vCtx.moveTo(proj[i].x, proj[i].y);
      vCtx.lineTo(proj[j].x, proj[j].y);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 10. 3D Planetary Rings
  if (mode === 'saturn-rings-3d') {
    const planetR = minDim * 0.11 * visScale * (1 + bass * 0.14);
    const t = makeTrig(0.55 + Math.sin(currentTime * 0.4) * 0.18, currentTime * 0.4, -0.25);

    vCtx.save();
    // Draw back half of rings, then planet, then front half of rings
    const ringCount = 5;
    const segs = 48;
    const drawHalf = (front: boolean) => {
      for (let ring = 0; ring < ringCount; ring++) {
        const ringR = planetR * (1.55 + ring * 0.38);
        const col = ring % 2 === 0 ? primary : secondary;
        vCtx.strokeStyle = hexToRgba(col, front ? 0.85 : 0.35);
        vCtx.lineWidth = Math.max(1.6, minDim * 0.0035);
        for (let s = 0; s < segs; s++) {
          const val = getPerceptualBarValue(frequencyData, (s + ring * 5) % 32, 32, sens);
          const a0 = (s / segs) * Math.PI * 2 + currentTime * (0.2 + ring * 0.08);
          const a1 = a0 + (Math.PI * 2) / segs * 0.72;
          const rCur = ringR + val * minDim * 0.03 * visScale;
          const p0r = rotatePoint(Math.cos(a0) * rCur, 0, Math.sin(a0) * rCur, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
          const p1r = rotatePoint(Math.cos(a1) * rCur, 0, Math.sin(a1) * rCur, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
          const isFront = (p0r.z + p1r.z) * 0.5 <= 0;
          if (isFront !== front) continue;
          const p0 = projectPoint(p0r, cx, cy, focal, camDist);
          const p1 = projectPoint(p1r, cx, cy, focal, camDist);
          vCtx.beginPath();
          vCtx.moveTo(p0.x, p0.y);
          vCtx.lineTo(p1.x, p1.y);
          vCtx.stroke();
        }
      }
    };

    applyShadow(primary, minDim * 0.012);
    drawHalf(false);

    const sphereGrad = vCtx.createRadialGradient(
      cx - planetR * 0.3,
      cy - planetR * 0.3,
      planetR * 0.1,
      cx,
      cy,
      planetR
    );
    sphereGrad.addColorStop(0, secondary);
    sphereGrad.addColorStop(0.6, primary);
    sphereGrad.addColorStop(1, '#05070b');
    vCtx.fillStyle = sphereGrad;
    vCtx.beginPath();
    vCtx.arc(cx, cy, planetR, 0, Math.PI * 2);
    vCtx.fill();

    drawHalf(true);
    vCtx.restore();
    return true;
  }

  // 11. 3D Voxel Cube Matrix
  if (mode === 'cube-lattice-3d') {
    const grid = 3;
    const spacing = minDim * 0.125 * visScale * (1 + bass * 0.18);
    const t = makeTrig(currentTime * 0.45, currentTime * 0.65, currentTime * 0.2);
    const cubeEdges: Array<[number, number]> = [
      [0, 1], [1, 3], [3, 2], [2, 0],
      [4, 5], [5, 7], [7, 6], [6, 4],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    const items: Array<{ centerZ: number; verts: Proj2[]; col: string; amp: number }> = [];

    let idx = 0;
    for (let ix = -1; ix <= 1; ix++) {
      for (let iy = -1; iy <= 1; iy++) {
        for (let iz = -1; iz <= 1; iz++) {
          const amp = getPerceptualBarValue(frequencyData, idx, grid * grid * grid, sens);
          const half = minDim * (0.018 + amp * 0.028) * visScale;
          const ox = ix * spacing;
          const oy = iy * spacing;
          const oz = iz * spacing;
          const cRot = rotatePoint(ox, oy, oz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
          const verts: Proj2[] = [];
          for (let v = 0; v < 8; v++) {
            const vx = ox + (v & 1 ? half : -half);
            const vy = oy + (v & 2 ? half : -half);
            const vz = oz + (v & 4 ? half : -half);
            const rp = rotatePoint(vx, vy, vz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
            verts.push(projectPoint(rp, cx, cy, focal, camDist));
          }
          items.push({ centerZ: cRot.z, verts, col: idx % 2 === 0 ? primary : secondary, amp });
          idx++;
        }
      }
    }

    items.sort((a, b) => b.centerZ - a.centerZ);
    vCtx.save();
    applyShadow(primary, minDim * 0.01);
    vCtx.lineWidth = Math.max(1.1, minDim * 0.002);
    for (const cube of items) {
      const alpha = Math.max(0.25, Math.min(0.95, 0.4 + cube.amp * 0.6));
      vCtx.strokeStyle = hexToRgba(cube.col, alpha);
      vCtx.beginPath();
      for (const [a, b] of cubeEdges) {
        vCtx.moveTo(cube.verts[a].x, cube.verts[a].y);
        vCtx.lineTo(cube.verts[b].x, cube.verts[b].y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 12. 3D Mobius Ribbon
  if (mode === 'ribbon-mobius-3d') {
    const segs = 48;
    const majorR = minDim * 0.24 * visScale;
    const stripW = minDim * 0.095 * visScale * (1 + bass * 0.25);
    const t = makeTrig(currentTime * 0.5, currentTime * 0.65, currentTime * 0.25);
    const edgeA: Proj2[] = [];
    const edgeB: Proj2[] = [];

    for (let i = 0; i <= segs; i++) {
      const u = (i / segs) * Math.PI * 2;
      const val = getPerceptualBarValue(frequencyData, i % 24, 24, sens);
      const w = stripW * (0.6 + val * 0.7);
      const halfTwist = u * 0.5;
      for (const sign of [-1, 1]) {
        const s = sign * w;
        const px = (majorR + s * Math.cos(halfTwist)) * Math.cos(u);
        const py = (majorR + s * Math.cos(halfTwist)) * Math.sin(u);
        const pz = s * Math.sin(halfTwist);
        const rp = rotatePoint(px, py, pz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (sign === -1) edgeA.push(p);
        else edgeB.push(p);
      }
    }

    vCtx.save();
    applyShadow(primary, minDim * 0.014);
    vCtx.lineWidth = Math.max(1.2, minDim * 0.0024);
    for (let i = 0; i < segs; i++) {
      vCtx.strokeStyle = hexToRgba(i % 2 === 0 ? primary : secondary, 0.58);
      vCtx.beginPath();
      vCtx.moveTo(edgeA[i].x, edgeA[i].y);
      vCtx.lineTo(edgeB[i].x, edgeB[i].y);
      vCtx.stroke();
    }
    vCtx.lineWidth = Math.max(2, minDim * 0.004);
    vCtx.strokeStyle = primary;
    vCtx.beginPath();
    edgeA.forEach((p, idx) => (idx === 0 ? vCtx.moveTo(p.x, p.y) : vCtx.lineTo(p.x, p.y)));
    vCtx.stroke();

    vCtx.strokeStyle = secondary;
    vCtx.beginPath();
    edgeB.forEach((p, idx) => (idx === 0 ? vCtx.moveTo(p.x, p.y) : vCtx.lineTo(p.x, p.y)));
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 13. 3D Funnel Vortex
  if (mode === 'cone-vortex-3d') {
    const rings = 18;
    const ptsPerRing = 24;
    const t = makeTrig(0.55 + Math.sin(currentTime * 0.45) * 0.15, currentTime * 0.5, 0);

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineWidth = Math.max(1.3, minDim * 0.0025);
    for (let r = 0; r < rings; r++) {
      const frac = r / (rings - 1);
      const val = getPerceptualBarValue(frequencyData, r, rings, sens);
      const ringR = minDim * (0.31 * (1 - frac * 0.85) + val * 0.05) * visScale;
      const y = (frac - 0.5) * minDim * 0.45 * visScale;
      const col = r % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.28 + (1 - frac) * 0.65);
      vCtx.beginPath();
      for (let s = 0; s <= ptsPerRing; s++) {
        const a = (s / ptsPerRing) * Math.PI * 2 + currentTime * (0.6 + frac * 1.4);
        const rp = rotatePoint(Math.cos(a) * ringR, y, Math.sin(a) * ringR, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 14. 3D Faceted Diamond
  if (mode === 'diamond-cut-3d') {
    const r = minDim * 0.25 * visScale * (1 + beatBoost * 0.12);
    const sides = 8;
    const t = makeTrig(0.32 + Math.sin(currentTime * 0.6) * 0.16, currentTime * 0.85, 0.12);

    const crownR = r * 0.62;
    const girdleR = r * (1 + bass * 0.12);
    const topY = -r * 0.55;
    const girdleY = -r * 0.12;
    const tipY = r * 0.92;

    const crownPts: Proj2[] = [];
    const girdlePts: Proj2[] = [];
    const tipRot = rotatePoint(0, tipY, 0, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
    const tipProj = projectPoint(tipRot, cx, cy, focal, camDist);

    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const cRot = rotatePoint(Math.cos(a) * crownR, topY, Math.sin(a) * crownR, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      const gRot = rotatePoint(Math.cos(a + Math.PI / sides) * girdleR, girdleY, Math.sin(a + Math.PI / sides) * girdleR, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      crownPts.push(projectPoint(cRot, cx, cy, focal, camDist));
      girdlePts.push(projectPoint(gRot, cx, cy, focal, camDist));
    }

    vCtx.save();
    applyShadow(secondary, minDim * 0.016);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.0028);
    // Crown top polygon
    vCtx.beginPath();
    crownPts.forEach((p, i) => (i === 0 ? vCtx.moveTo(p.x, p.y) : vCtx.lineTo(p.x, p.y)));
    vCtx.closePath();
    vCtx.fillStyle = hexToRgba(secondary, 0.18 + treble * 0.22);
    vCtx.fill();
    vCtx.strokeStyle = secondary;
    vCtx.stroke();

    for (let i = 0; i < sides; i++) {
      const next = (i + 1) % sides;
      const col = i % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.78);
      vCtx.beginPath();
      vCtx.moveTo(crownPts[i].x, crownPts[i].y);
      vCtx.lineTo(girdlePts[i].x, girdlePts[i].y);
      vCtx.lineTo(crownPts[next].x, crownPts[next].y);
      vCtx.moveTo(girdlePts[i].x, girdlePts[i].y);
      vCtx.lineTo(girdlePts[next].x, girdlePts[next].y);
      vCtx.lineTo(tipProj.x, tipProj.y);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 15. 3D Perspective Skyline
  if (mode === 'city-blocks-3d') {
    const cols = 6;
    const rows = 5;
    const span = minDim * 0.5 * visScale;
    const cellW = span / cols;
    const t = makeTrig(0.55, Math.sin(currentTime * 0.35) * 0.28, 0);
    const blocks: Array<{ z: number; topPts: Proj2[]; basePts: Proj2[]; col: string; h: number }> = [];

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const idx = r * cols + col;
        const val = getPerceptualBarValue(frequencyData, idx, rows * cols, sens);
        const h = Math.max(minDim * 0.015, val * minDim * 0.32 * visScale);
        const ox = (col - (cols - 1) * 0.5) * cellW;
        const oz = (r - (rows - 1) * 0.5) * cellW;
        const half = cellW * 0.34;
        const baseY = minDim * 0.16 * visScale;
        const topY = baseY - h;
        const corners = [
          [-half, -half], [half, -half], [half, half], [-half, half],
        ];
        const basePts = corners.map(([dx, dz]) =>
          projectPoint(rotatePoint(ox + dx, baseY, oz + dz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ), cx, cy, focal, camDist)
        );
        const topPts = corners.map(([dx, dz]) =>
          projectPoint(rotatePoint(ox + dx, topY, oz + dz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ), cx, cy, focal, camDist)
        );
        const cRot = rotatePoint(ox, baseY - h * 0.5, oz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        blocks.push({ z: cRot.z, topPts, basePts, col: idx % 2 === 0 ? primary : secondary, h });
      }
    }

    blocks.sort((a, b) => b.z - a.z);
    vCtx.save();
    applyShadow(primary, minDim * 0.01);
    vCtx.lineWidth = Math.max(1.1, minDim * 0.002);
    for (const blk of blocks) {
      vCtx.strokeStyle = hexToRgba(blk.col, 0.72);
      vCtx.fillStyle = hexToRgba(blk.col, 0.18);
      vCtx.beginPath();
      blk.topPts.forEach((p, i) => (i === 0 ? vCtx.moveTo(p.x, p.y) : vCtx.lineTo(p.x, p.y)));
      vCtx.closePath();
      vCtx.fill();
      vCtx.stroke();

      vCtx.beginPath();
      for (let i = 0; i < 4; i++) {
        vCtx.moveTo(blk.basePts[i].x, blk.basePts[i].y);
        vCtx.lineTo(blk.topPts[i].x, blk.topPts[i].y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 16. 3D Hex Warp Tunnel
  if (mode === 'wave-tunnel-3d') {
    const gates = 14;
    const sides = 6;
    const speed = (currentTime * 1.35) % 1;

    vCtx.save();
    applyShadow(primary, minDim * 0.014);
    vCtx.lineWidth = Math.max(1.4, minDim * 0.003);
    for (let g = 0; g < gates; g++) {
      const depth = ((g + 1 - speed) / gates);
      const z = (depth - 0.1) * minDim * 2.2;
      const val = getPerceptualBarValue(frequencyData, g, gates, sens);
      const r = minDim * (0.28 + val * 0.08 + beatBoost * 0.05) * visScale;
      const rotZ = currentTime * 0.35 + g * 0.14;
      const alpha = Math.max(0.08, Math.min(0.95, 1 - depth * 0.9));
      vCtx.strokeStyle = hexToRgba(g % 2 === 0 ? primary : secondary, alpha);
      vCtx.beginPath();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2 + rotZ;
        const p = projectPoint({ x: Math.cos(a) * r, y: Math.sin(a) * r, z }, cx, cy, focal * 0.9, camDist * 0.45);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 17. 3D Orbital Gyro Cage
  if (mode === 'atom-cage-3d') {
    const r = minDim * 0.27 * visScale * (1 + bass * 0.1);
    const segs = 40;
    const axes = [
      [currentTime * 0.9, 0.4, 0.2],
      [0.4, currentTime * 1.1, 0.8],
      [-currentTime * 0.7, -0.5, currentTime * 0.8],
      [1.1, -currentTime * 0.85, 0.3],
    ];

    vCtx.save();
    applyShadow(primary, minDim * 0.015);
    // Core sphere
    const coreR = minDim * (0.045 + bass * 0.035 + beatBoost * 0.025) * visScale;
    vCtx.beginPath();
    vCtx.arc(cx, cy, coreR, 0, Math.PI * 2);
    vCtx.fillStyle = secondary;
    vCtx.fill();

    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    axes.forEach(([rx, ry, rz], idx) => {
      const t = makeTrig(rx, ry, rz);
      const val = getPerceptualBarValue(frequencyData, idx * 5, 24, sens);
      const ringR = r * (0.78 + val * 0.26);
      const col = idx % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.78);
      vCtx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const rp = rotatePoint(Math.cos(a) * ringR, Math.sin(a) * ringR, 0, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();

      // Orbiting electron bead
      const ea = currentTime * (2.2 + idx * 0.45);
      const erp = rotatePoint(Math.cos(ea) * ringR, Math.sin(ea) * ringR, 0, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      const ep = projectPoint(erp, cx, cy, focal, camDist);
      vCtx.beginPath();
      vCtx.arc(ep.x, ep.y, Math.max(3, minDim * 0.007 * ep.scale), 0, Math.PI * 2);
      vCtx.fillStyle = '#ffffff';
      vCtx.fill();
    });
    vCtx.restore();
    return true;
  }

  // 18. 3D Spiral Ribbon
  if (mode === 'ribbon-helix-3d') {
    const pts = 46;
    const spanH = minDim * 0.56 * visScale;
    const baseR = minDim * 0.19 * visScale;
    const t = makeTrig(0.25, currentTime * 0.85, 0);

    vCtx.save();
    applyShadow(primary, minDim * 0.013);
    for (let strand = 0; strand < 2; strand++) {
      const col = strand === 0 ? primary : secondary;
      const offset = strand * Math.PI;
      vCtx.strokeStyle = col;
      vCtx.lineWidth = Math.max(2.5, minDim * 0.006);
      vCtx.beginPath();
      for (let i = 0; i < pts; i++) {
        const frac = i / (pts - 1);
        const val = getPerceptualBarValue(frequencyData, i % 24, 24, sens);
        const r = baseR * (0.55 + val * 0.75 + treble * 0.25);
        const a = frac * Math.PI * 4.5 + offset;
        const y = (frac - 0.5) * spanH;
        const rp = rotatePoint(Math.cos(a) * r, y, Math.sin(a) * r, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (i === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 19. 3D Stellated Star
  if (mode === 'star-poly-3d') {
    const baseR = minDim * 0.14 * visScale;
    const t = makeTrig(currentTime * 0.5, currentTime * 0.72, currentTime * 0.3);
    const spikes = 14;

    vCtx.save();
    applyShadow(primary, minDim * 0.016);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    for (let i = 0; i < spikes; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / spikes);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const dx = Math.sin(phi) * Math.cos(theta);
      const dy = Math.cos(phi);
      const dz = Math.sin(phi) * Math.sin(theta);

      const val = getPerceptualBarValue(frequencyData, i, spikes, sens);
      const tipR = baseR * (1.2 + val * 1.45 + beatBoost * 0.45);
      const rpTip = rotatePoint(dx * tipR, dy * tipR, dz * tipR, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      const pTip = projectPoint(rpTip, cx, cy, focal, camDist);

      // Perpendicular base points
      const px = -dz;
      const pz = dx;
      const pLen = Math.max(0.01, Math.hypot(px, pz));
      const b1 = rotatePoint((px / pLen) * baseR * 0.45, dy * baseR * 0.4, (pz / pLen) * baseR * 0.45, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      const b2 = rotatePoint((-px / pLen) * baseR * 0.45, dy * baseR * 0.4, (-pz / pLen) * baseR * 0.45, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
      const pb1 = projectPoint(b1, cx, cy, focal, camDist);
      const pb2 = projectPoint(b2, cx, cy, focal, camDist);

      const col = i % 2 === 0 ? primary : secondary;
      vCtx.fillStyle = hexToRgba(col, 0.24);
      vCtx.strokeStyle = hexToRgba(col, 0.9);
      vCtx.beginPath();
      vCtx.moveTo(pTip.x, pTip.y);
      vCtx.lineTo(pb1.x, pb1.y);
      vCtx.lineTo(pb2.x, pb2.y);
      vCtx.closePath();
      vCtx.fill();
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 20. 3D Perspective Archway
  if (mode === 'arch-bridge-3d') {
    const arches = 12;
    const archW = minDim * 0.38 * visScale;
    const archH = minDim * 0.34 * visScale;
    const speed = (currentTime * 1.1) % 1;

    vCtx.save();
    applyShadow(primary, minDim * 0.013);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    for (let a = 0; a < arches; a++) {
      const frac = (a + 1 - speed) / arches;
      const z = frac * minDim * 2.1;
      const val = getPerceptualBarValue(frequencyData, a, arches, sens);
      const h = archH * (0.7 + val * 0.55);
      const alpha = Math.max(0.1, Math.min(0.95, 1 - frac * 0.85));
      vCtx.strokeStyle = hexToRgba(a % 2 === 0 ? primary : secondary, alpha);
      vCtx.beginPath();
      const segs = 14;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const angle = Math.PI * (1 - u);
        const px = Math.cos(angle) * archW * 0.5;
        const py = archH * 0.35 - Math.sin(angle) * h;
        const p = projectPoint({ x: px, y: py, z }, cx, cy, focal, camDist * 0.5);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 21. 3D Twisted Ladder
  if (mode === 'dna-spiral-3d') {
    const steps = 30;
    const spanW = linW * 0.9;
    const radius = minDim * 0.13 * visScale * (1 + bass * 0.2);

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    const railA: Proj2[] = [];
    const railB: Proj2[] = [];

    for (let i = 0; i < steps; i++) {
      const frac = i / (steps - 1);
      const x = (frac - 0.5) * spanW;
      const val = getPerceptualBarValue(frequencyData, i, steps, sens);
      const r = radius * (0.65 + val * 0.7);
      const angle = frac * Math.PI * 3.5 + currentTime * 1.45;
      const pA = projectPoint({ x, y: Math.sin(angle) * r, z: Math.cos(angle) * r }, cx, cy, focal, camDist);
      const pB = projectPoint({ x, y: Math.sin(angle + Math.PI) * r, z: Math.cos(angle + Math.PI) * r }, cx, cy, focal, camDist);
      railA.push(pA);
      railB.push(pB);

      vCtx.strokeStyle = hexToRgba('#ffffff', 0.25 + val * 0.45);
      vCtx.lineWidth = Math.max(1.2, minDim * 0.0022);
      vCtx.beginPath();
      vCtx.moveTo(pA.x, pA.y);
      vCtx.lineTo(pB.x, pB.y);
      vCtx.stroke();
    }

    vCtx.lineWidth = Math.max(2.4, minDim * 0.005);
    vCtx.strokeStyle = primary;
    vCtx.beginPath();
    railA.forEach((p, idx) => (idx === 0 ? vCtx.moveTo(p.x, p.y) : vCtx.lineTo(p.x, p.y)));
    vCtx.stroke();

    vCtx.strokeStyle = secondary;
    vCtx.beginPath();
    railB.forEach((p, idx) => (idx === 0 ? vCtx.moveTo(p.x, p.y) : vCtx.lineTo(p.x, p.y)));
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 22. 3D Quartz Cluster
  if (mode === 'crystal-cluster-3d') {
    const spires = 7;
    const t = makeTrig(0.35, currentTime * 0.5, 0);

    vCtx.save();
    applyShadow(secondary, minDim * 0.015);
    vCtx.lineWidth = Math.max(1.4, minDim * 0.0028);
    for (let s = 0; s < spires; s++) {
      const val = getPerceptualBarValue(frequencyData, s * 3, spires * 3, sens);
      const angle = (s / spires) * Math.PI * 2;
      const tilt = s === 0 ? 0 : 0.42 + (s % 2) * 0.16;
      const len = minDim * (0.18 + val * 0.22 + (s === 0 ? 0.08 : 0)) * visScale;
      const w = minDim * 0.036 * visScale;
      const col = s % 2 === 0 ? primary : secondary;

      const baseX = Math.cos(angle) * minDim * 0.04 * (s === 0 ? 0 : 1);
      const baseZ = Math.sin(angle) * minDim * 0.04 * (s === 0 ? 0 : 1);
      const baseY = minDim * 0.14 * visScale;
      const tipX = baseX + Math.cos(angle) * Math.sin(tilt) * len;
      const tipZ = baseZ + Math.sin(angle) * Math.sin(tilt) * len;
      const tipY = baseY - Math.cos(tilt) * len;

      const pTip = projectPoint(rotatePoint(tipX, tipY, tipZ, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ), cx, cy, focal, camDist);
      const sides = 5;
      const ringPts: Proj2[] = [];
      for (let k = 0; k < sides; k++) {
        const ka = (k / sides) * Math.PI * 2;
        const rx = baseX + Math.cos(ka) * w;
        const rz = baseZ + Math.sin(ka) * w;
        ringPts.push(projectPoint(rotatePoint(rx, baseY, rz, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ), cx, cy, focal, camDist));
      }

      vCtx.fillStyle = hexToRgba(col, 0.2 + val * 0.25);
      vCtx.strokeStyle = hexToRgba(col, 0.85);
      for (let k = 0; k < sides; k++) {
        const next = (k + 1) % sides;
        vCtx.beginPath();
        vCtx.moveTo(pTip.x, pTip.y);
        vCtx.lineTo(ringPts[k].x, ringPts[k].y);
        vCtx.lineTo(ringPts[next].x, ringPts[next].y);
        vCtx.closePath();
        vCtx.fill();
        vCtx.stroke();
      }
    }
    vCtx.restore();
    return true;
  }

  // 23. 3D Wireframe Dome
  if (mode === 'radar-dome-3d') {
    const r = minDim * 0.29 * visScale * (1 + beatBoost * 0.06);
    const latRings = 6;
    const lonArcs = 12;
    const t = makeTrig(0.55, currentTime * 0.35, 0);

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineWidth = Math.max(1.2, minDim * 0.0022);
    // Latitude rings
    for (let l = 1; l <= latRings; l++) {
      const phi = (l / latRings) * (Math.PI * 0.5);
      const ringR = Math.sin(phi) * r;
      const y = minDim * 0.12 * visScale - Math.cos(phi) * r;
      const val = getPerceptualBarValue(frequencyData, l * 3, 24, sens);
      vCtx.strokeStyle = hexToRgba(primary, 0.35 + val * 0.55);
      vCtx.beginPath();
      for (let s = 0; s <= 32; s++) {
        const a = (s / 32) * Math.PI * 2;
        const rp = rotatePoint(Math.cos(a) * ringR, y, Math.sin(a) * ringR, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();
    }

    // Sweeping longitude arcs
    for (let m = 0; m < lonArcs; m++) {
      const a = (m / lonArcs) * Math.PI * 2;
      const isSweep = Math.abs(((a - currentTime * 2) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)) < 0.55;
      vCtx.strokeStyle = hexToRgba(isSweep ? secondary : primary, isSweep ? 0.95 : 0.3);
      vCtx.beginPath();
      for (let s = 0; s <= 12; s++) {
        const phi = (s / 12) * (Math.PI * 0.5);
        const ringR = Math.sin(phi) * r;
        const y = minDim * 0.12 * visScale - Math.cos(phi) * r;
        const rp = rotatePoint(Math.cos(a) * ringR, y, Math.sin(a) * ringR, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 24. 3D Dimensional Gate
  if (mode === 'portal-gate-3d') {
    const rings = 7;
    const sides = 8;

    vCtx.save();
    applyShadow(secondary, minDim * 0.015);
    vCtx.lineWidth = Math.max(1.6, minDim * 0.003);
    for (let ring = 0; ring < rings; ring++) {
      const val = getPerceptualBarValue(frequencyData, ring * 3, rings * 3, sens);
      const r = minDim * (0.1 + ring * 0.035 + val * 0.03) * visScale;
      const t = makeTrig(
        Math.sin(currentTime * 0.7 + ring * 0.4) * 0.45,
        Math.cos(currentTime * 0.6 + ring * 0.35) * 0.55,
        currentTime * (0.25 + ring * 0.06)
      );
      const col = ring % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.45 + val * 0.5);
      vCtx.beginPath();
      for (let s = 0; s <= sides; s++) {
        const a = (s / sides) * Math.PI * 2;
        const rp = rotatePoint(Math.cos(a) * r, Math.sin(a) * r, 0, t.cosX, t.sinX, t.cosY, t.sinY, t.cosZ, t.sinZ);
        const p = projectPoint(rp, cx, cy, focal, camDist);
        if (s === 0) vCtx.moveTo(p.x, p.y);
        else vCtx.lineTo(p.x, p.y);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 25. 4D Tesseract Projection
  if (mode === 'hypercube-4d') {
    const scale3 = minDim * 0.24 * visScale * (1 + bass * 0.14 + beatBoost * 0.1);
    const xwAngle = currentTime * 0.7;
    const zwAngle = currentTime * 0.45;
    const cosXW = Math.cos(xwAngle);
    const sinXW = Math.sin(xwAngle);
    const cosZW = Math.cos(zwAngle);
    const sinZW = Math.sin(zwAngle);
    const t3 = makeTrig(currentTime * 0.38, currentTime * 0.55, 0.2);

    const projPts: Proj2[] = TESSERACT_VERTS.map(([x0, y0, z0, w0]) => {
      // Rotate XW
      const x1 = x0 * cosXW - w0 * sinXW;
      const w1 = x0 * sinXW + w0 * cosXW;
      // Rotate ZW
      const z2 = z0 * cosZW - w1 * sinZW;
      const w2 = z0 * sinZW + w1 * cosZW;
      // 4D -> 3D perspective
      const wFactor = 1 / Math.max(0.7, 2.35 - w2);
      const px = x1 * wFactor * scale3;
      const py = y0 * wFactor * scale3;
      const pz = z2 * wFactor * scale3;
      const rp = rotatePoint(px, py, pz, t3.cosX, t3.sinX, t3.cosY, t3.sinY, t3.cosZ, t3.sinZ);
      return projectPoint(rp, cx, cy, focal, camDist);
    });

    vCtx.save();
    applyShadow(primary, minDim * 0.015);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    for (let eIdx = 0; eIdx < TESSERACT_EDGES.length; eIdx++) {
      const [i, j] = TESSERACT_EDGES[eIdx];
      const pA = projPts[i];
      const pB = projPts[j];
      const isCross = (i ^ j) === 8;
      vCtx.strokeStyle = hexToRgba(isCross ? secondary : primary, isCross ? 0.88 : 0.65);
      vCtx.beginPath();
      vCtx.moveTo(pA.x, pA.y);
      vCtx.lineTo(pB.x, pB.y);
      vCtx.stroke();
    }
    for (const p of projPts) {
      vCtx.beginPath();
      vCtx.arc(p.x, p.y, Math.max(2, minDim * 0.0045 * p.scale), 0, Math.PI * 2);
      vCtx.fillStyle = '#ffffff';
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  // =========================================================================
  // 10 UNIQUE VISUALIZER MODES
  // =========================================================================

  // 26. Origami Fold
  if (mode === 'origami-fold') {
    const folds = 12;
    const maxR = minDim * 0.34 * visScale;

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineWidth = Math.max(1.2, minDim * 0.0025);
    for (let i = 0; i < folds; i++) {
      const val = getPerceptualBarValue(frequencyData, i, folds, sens);
      const a0 = (i / folds) * Math.PI * 2 + currentTime * 0.18;
      const aMid = a0 + Math.PI / folds;
      const a1 = a0 + (Math.PI * 2) / folds;
      const foldR = maxR * (0.45 + val * 0.55 + beatBoost * 0.12);
      const creaseR = maxR * (0.25 + mid * 0.25);

      const p1x = cx + Math.cos(a0) * creaseR;
      const p1y = cy + Math.sin(a0) * creaseR;
      const p2x = cx + Math.cos(aMid) * foldR;
      const p2y = cy + Math.sin(aMid) * foldR;
      const p3x = cx + Math.cos(a1) * creaseR;
      const p3y = cy + Math.sin(a1) * creaseR;

      const col = i % 2 === 0 ? primary : secondary;
      vCtx.fillStyle = hexToRgba(col, 0.18 + val * 0.32);
      vCtx.strokeStyle = hexToRgba(col, 0.85);
      vCtx.beginPath();
      vCtx.moveTo(cx, cy);
      vCtx.lineTo(p1x, p1y);
      vCtx.lineTo(p2x, p2y);
      vCtx.lineTo(p3x, p3y);
      vCtx.closePath();
      vCtx.fill();
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 27. Spinning Turntable
  if (mode === 'vinyl-turntable') {
    const discR = minDim * 0.31 * visScale;
    const spin = currentTime * 1.8;

    vCtx.save();
    // Platter strobe ring
    vCtx.beginPath();
    vCtx.arc(cx, cy, discR * 1.05, 0, Math.PI * 2);
    vCtx.strokeStyle = hexToRgba(primary, 0.35 + beatBoost * 0.35);
    vCtx.lineWidth = Math.max(2, minDim * 0.005);
    vCtx.setLineDash([4, 8]);
    vCtx.lineDashOffset = -currentTime * 28;
    vCtx.stroke();
    vCtx.setLineDash([]);

    // Vinyl disc body
    vCtx.beginPath();
    vCtx.arc(cx, cy, discR, 0, Math.PI * 2);
    vCtx.fillStyle = 'rgba(10, 14, 22, 0.86)';
    vCtx.fill();
    vCtx.strokeStyle = hexToRgba(primary, 0.55);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    vCtx.stroke();

    // Audio-modulated grooves
    for (let g = 0; g < 8; g++) {
      const val = getPerceptualBarValue(frequencyData, g * 3, 24, sens);
      const gr = discR * (0.42 + g * 0.068) + val * minDim * 0.008;
      vCtx.beginPath();
      vCtx.arc(cx, cy, gr, spin + g * 0.4, spin + g * 0.4 + Math.PI * 1.6);
      vCtx.strokeStyle = hexToRgba(g % 2 === 0 ? primary : secondary, 0.25 + val * 0.55);
      vCtx.lineWidth = Math.max(1, minDim * 0.002);
      vCtx.stroke();
    }

    // Center label & spindle
    vCtx.beginPath();
    vCtx.arc(cx, cy, discR * 0.3, 0, Math.PI * 2);
    vCtx.fillStyle = hexToRgba(secondary, 0.28 + bass * 0.28);
    vCtx.fill();
    vCtx.strokeStyle = secondary;
    vCtx.stroke();

    vCtx.beginPath();
    vCtx.arc(cx, cy, Math.max(4, discR * 0.04), 0, Math.PI * 2);
    vCtx.fillStyle = '#ffffff';
    vCtx.fill();

    // Tonearm tracking needle
    const pivotX = cx + discR * 0.96;
    const pivotY = cy - discR * 0.72;
    const armAngle = 2.08 + Math.sin(currentTime * 0.35) * 0.03 + bass * 0.02;
    const tipX = pivotX + Math.cos(armAngle) * discR * 0.96;
    const tipY = pivotY + Math.sin(armAngle) * discR * 0.96;

    applyShadow(secondary, minDim * 0.012);
    vCtx.strokeStyle = '#e2e8f0';
    vCtx.lineWidth = Math.max(3, minDim * 0.007);
    vCtx.lineCap = 'round';
    vCtx.beginPath();
    vCtx.moveTo(pivotX, pivotY);
    vCtx.lineTo(tipX, tipY);
    vCtx.stroke();

    vCtx.beginPath();
    vCtx.arc(pivotX, pivotY, Math.max(6, discR * 0.07), 0, Math.PI * 2);
    vCtx.fillStyle = primary;
    vCtx.fill();
    vCtx.restore();
    return true;
  }

  // 28. Clockwork Escapement
  if (mode === 'pendulum-clockwork') {
    const drawGear = (gx: number, gy: number, r: number, teeth: number, angle: number, col: string) => {
      vCtx.beginPath();
      const steps = teeth * 2;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2 + angle;
        const rad = i % 2 === 0 ? r * 1.12 : r * 0.9;
        const px = gx + Math.cos(a) * rad;
        const py = gy + Math.sin(a) * rad;
        if (i === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }
      vCtx.closePath();
      vCtx.fillStyle = hexToRgba(col, 0.14);
      vCtx.fill();
      vCtx.strokeStyle = hexToRgba(col, 0.85);
      vCtx.stroke();

      vCtx.beginPath();
      vCtx.arc(gx, gy, r * 0.45, 0, Math.PI * 2);
      vCtx.stroke();
    };

    const rMain = minDim * 0.21 * visScale * (1 + bass * 0.08);
    const rLeft = rMain * 0.62;
    const rRight = rMain * 0.52;

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    drawGear(cx, cy, rMain, 18, currentTime * 0.55, primary);
    drawGear(cx - rMain * 1.48, cy - rMain * 0.45, rLeft, 12, -currentTime * 0.88, secondary);
    drawGear(cx + rMain * 1.38, cy + rMain * 0.4, rRight, 10, -currentTime * 1.05, secondary);

    // Sweeping escapement hand
    const handA = currentTime * 2.1 + mid * 0.4;
    vCtx.strokeStyle = '#ffffff';
    vCtx.lineWidth = Math.max(2, minDim * 0.004);
    vCtx.beginPath();
    vCtx.moveTo(cx, cy);
    vCtx.lineTo(cx + Math.cos(handA) * rMain * 0.9, cy + Math.sin(handA) * rMain * 0.9);
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 29. Polar Aurora Borealis
  if (mode === 'aurora-curtains') {
    const ribbons = 32;
    const spanW = linW;
    const baseTop = cy - minDim * 0.26 * visScale;

    vCtx.save();
    for (let i = 0; i < ribbons; i++) {
      const frac = i / (ribbons - 1);
      const val = getPerceptualBarValue(frequencyData, i, ribbons, sens);
      const x = cx + (frac - 0.5) * spanW + Math.sin(currentTime * 1.2 + i * 0.3) * minDim * 0.025;
      const sway = Math.cos(currentTime * 0.9 + i * 0.25) * minDim * 0.04;
      const colH = minDim * (0.2 + val * 0.34 + beatBoost * 0.08) * visScale;
      const yTop = baseTop + Math.sin(frac * 5 + currentTime) * minDim * 0.04;

      const grad = vCtx.createLinearGradient(x, yTop, x + sway, yTop + colH);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.45, hexToRgba(i % 2 === 0 ? primary : secondary, 0.35 + val * 0.45));
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      vCtx.strokeStyle = grad;
      vCtx.lineWidth = Math.max(4, (spanW / ribbons) * 0.85);
      vCtx.lineCap = 'round';
      vCtx.beginPath();
      vCtx.moveTo(x, yTop);
      vCtx.lineTo(x + sway, yTop + colH);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 30. Circular Seismograph
  if (mode === 'seismic-circular') {
    const rings = 7;
    const pts = 72;
    const baseR = minDim * 0.11 * visScale;

    vCtx.save();
    applyShadow(primary, minDim * 0.01);
    vCtx.lineWidth = Math.max(1.2, minDim * 0.0022);
    for (let r = 0; r < rings; r++) {
      const ringR = baseR + r * minDim * 0.036 * visScale;
      const col = r % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.42 + (1 - r / rings) * 0.5);
      vCtx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const idx = i % pts;
        const td = (timeDomainData[(idx * 8 + r * 23) % timeDomainData.length] - 128) / 128;
        const amp = td * minDim * (0.025 + bass * 0.045) * sens;
        const a = (idx / pts) * Math.PI * 2 + currentTime * (0.12 * (r % 2 === 0 ? 1 : -1));
        const rad = ringR + amp;
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (i === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 31. Bioluminescent Jelly
  if (mode === 'bioluminescent-jelly') {
    const bellR = minDim * 0.16 * visScale * (1 + bass * 0.18 + beatBoost * 0.1);
    const bellY = cy - minDim * 0.08 * visScale + Math.sin(currentTime * 1.8) * minDim * 0.025;

    vCtx.save();
    applyShadow(secondary, minDim * 0.018);
    // Translucent bell dome
    const domeGrad = vCtx.createRadialGradient(cx, bellY - bellR * 0.25, bellR * 0.08, cx, bellY, bellR);
    domeGrad.addColorStop(0, hexToRgba('#ffffff', 0.65));
    domeGrad.addColorStop(0.45, hexToRgba(secondary, 0.45));
    domeGrad.addColorStop(1, hexToRgba(primary, 0.15));

    vCtx.fillStyle = domeGrad;
    vCtx.strokeStyle = secondary;
    vCtx.lineWidth = Math.max(1.8, minDim * 0.0035);
    vCtx.beginPath();
    vCtx.arc(cx, bellY, bellR, Math.PI, 0);
    vCtx.quadraticCurveTo(cx + bellR * 0.5, bellY + bellR * 0.22, cx, bellY + bellR * 0.08);
    vCtx.quadraticCurveTo(cx - bellR * 0.5, bellY + bellR * 0.22, cx - bellR, bellY);
    vCtx.fill();
    vCtx.stroke();

    // Trailing audio tentacles
    const tentacles = 9;
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    for (let tIdx = 0; tIdx < tentacles; tIdx++) {
      const frac = tIdx / (tentacles - 1) - 0.5;
      const startX = cx + frac * bellR * 1.45;
      const startY = bellY + bellR * 0.06;
      const val = getPerceptualBarValue(frequencyData, tIdx * 3, tentacles * 3, sens);
      const len = minDim * (0.22 + val * 0.18) * visScale;

      vCtx.strokeStyle = hexToRgba(tIdx % 2 === 0 ? primary : secondary, 0.72);
      vCtx.beginPath();
      vCtx.moveTo(startX, startY);
      const segs = 12;
      for (let s = 1; s <= segs; s++) {
        const sf = s / segs;
        const sway = Math.sin(currentTime * 3.8 + tIdx * 0.9 - sf * 4.5) * minDim * 0.032 * sf * (0.7 + mid);
        vCtx.lineTo(startX + sway, startY + sf * len);
      }
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 32. Gothic Rose Window
  if (mode === 'stained-glass') {
    const petals = 12;
    const outerR = minDim * 0.34 * visScale * (1 + beatBoost * 0.05);
    const rot = currentTime * 0.15;

    vCtx.save();
    for (let ring = 0; ring < 3; ring++) {
      const rIn = outerR * (ring * 0.3 + 0.12);
      const rOut = outerR * ((ring + 1) * 0.3 + 0.1);
      for (let i = 0; i < petals; i++) {
        const val = getPerceptualBarValue(frequencyData, (i + ring * 4) % 24, 24, sens);
        const a0 = (i / petals) * Math.PI * 2 + rot * (ring % 2 === 0 ? 1 : -1);
        const a1 = ((i + 1) / petals) * Math.PI * 2 + rot * (ring % 2 === 0 ? 1 : -1);
        const col = (i + ring) % 2 === 0 ? primary : secondary;

        vCtx.beginPath();
        vCtx.arc(cx, cy, rOut, a0, a1);
        vCtx.arc(cx, cy, rIn, a1, a0, true);
        vCtx.closePath();
        vCtx.fillStyle = hexToRgba(col, 0.12 + val * 0.55);
        vCtx.fill();
        vCtx.strokeStyle = 'rgba(9, 11, 16, 0.85)';
        vCtx.lineWidth = Math.max(1.8, minDim * 0.004);
        vCtx.stroke();
      }
    }
    // Outer lead frame glow
    applyShadow(primary, minDim * 0.015);
    vCtx.beginPath();
    vCtx.arc(cx, cy, outerR * 1.01, 0, Math.PI * 2);
    vCtx.strokeStyle = hexToRgba(primary, 0.78);
    vCtx.lineWidth = Math.max(2, minDim * 0.0045);
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 33. Echolocation Arcs
  if (mode === 'sonar-ripples') {
    const emitters = [cx - minDim * 0.24 * visScale, cx + minDim * 0.24 * visScale];
    const waveCount = 7;

    vCtx.save();
    applyShadow(primary, minDim * 0.012);
    vCtx.lineWidth = Math.max(1.6, minDim * 0.003);
    emitters.forEach((ex, eIdx) => {
      const dir = eIdx === 0 ? 0 : Math.PI;
      const col = eIdx === 0 ? primary : secondary;
      for (let w = 0; w < waveCount; w++) {
        const phase = ((currentTime * 0.9 + w / waveCount) % 1);
        const rad = minDim * (0.04 + phase * 0.42) * visScale * (1 + bass * 0.12);
        const val = getPerceptualBarValue(frequencyData, w * 3, waveCount * 3, sens);
        const alpha = (1 - phase) * (0.45 + val * 0.5);
        vCtx.strokeStyle = hexToRgba(col, alpha);
        vCtx.beginPath();
        vCtx.arc(ex, cy, rad, dir - 0.85, dir + 0.85);
        vCtx.stroke();
      }
      vCtx.beginPath();
      vCtx.arc(ex, cy, Math.max(4, minDim * 0.012 * (1 + bass * 0.6)), 0, Math.PI * 2);
      vCtx.fillStyle = col;
      vCtx.fill();
    });
    vCtx.restore();
    return true;
  }

  // 34. Ferrofluid Spikes
  if (mode === 'magnetic-ferrofluid') {
    const pts = 96;
    const baseR = minDim * 0.2 * visScale;

    vCtx.save();
    applyShadow(primary, minDim * 0.018);
    vCtx.beginPath();
    for (let i = 0; i <= pts; i++) {
      const idx = i % pts;
      const a = (idx / pts) * Math.PI * 2;
      const band = getPerceptualBarValue(frequencyData, idx % 24, 24, sens);
      const spike = Math.pow(Math.max(0, Math.sin(a * 9 + currentTime * 3.5)), 3) * (0.06 + bass * 0.16 + beatBoost * 0.08);
      const rad = baseR * (0.85 + band * 0.32) + minDim * spike * visScale;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) vCtx.moveTo(px, py);
      else vCtx.lineTo(px, py);
    }
    vCtx.closePath();
    const grad = vCtx.createRadialGradient(cx, cy, baseR * 0.15, cx, cy, baseR * 1.45);
    grad.addColorStop(0, '#090b10');
    grad.addColorStop(0.65, hexToRgba(primary, 0.75));
    grad.addColorStop(1, secondary);
    vCtx.fillStyle = grad;
    vCtx.fill();
    vCtx.strokeStyle = secondary;
    vCtx.lineWidth = Math.max(1.8, minDim * 0.0035);
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 35. Kaleido Fractals
  if (mode === 'kaleido-tunnels') {
    const layers = 8;
    const baseR = minDim * 0.35 * visScale;

    vCtx.save();
    applyShadow(primary, minDim * 0.014);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    for (let l = 0; l < layers; l++) {
      const frac = 1 - l / layers;
      const val = getPerceptualBarValue(frequencyData, l * 3, layers * 3, sens);
      const r = baseR * frac * (0.85 + val * 0.25 + beatBoost * 0.08);
      const rot = currentTime * (l % 2 === 0 ? 0.45 : -0.55) + l * 0.35;
      const col = l % 2 === 0 ? primary : secondary;

      vCtx.strokeStyle = hexToRgba(col, 0.45 + val * 0.5);
      // Draw two overlapping inverted triangles per layer (hexagram)
      for (const offset of [0, Math.PI]) {
        vCtx.beginPath();
        for (let k = 0; k <= 3; k++) {
          const a = (k / 3) * Math.PI * 2 + rot + offset;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (k === 0) vCtx.moveTo(px, py);
          else vCtx.lineTo(px, py);
        }
        vCtx.stroke();
      }
    }
    // Sparkle dust
    for (let d = 0; d < 12; d++) {
      const a = detRand(d * 7.1) * Math.PI * 2 + currentTime * 0.3;
      const dist = baseR * (0.2 + 0.7 * detRand(d * 13.7));
      vCtx.beginPath();
      vCtx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, Math.max(1.5, minDim * 0.0035 * (1 + treble)), 0, Math.PI * 2);
      vCtx.fillStyle = '#ffffff';
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  return false;
}
