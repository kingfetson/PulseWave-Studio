import { StudioSettings, VisualizerMode } from '../types/studio';
import { renderNewVisualizerMode } from './newVisualizers';

export type ExtraRenderContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface ExtraVisualizerContext {
  vCtx: ExtraRenderContext2D;
  width: number;
  height: number;
  minDim: number;
  isPortrait: boolean;
  visCenterY: number;
  visScale: number;
  linW: number;
  linPadX: number;
  currentTime: number;
  bass: number;
  mid: number;
  treble: number;
  beatBoost: number;
  frequencyData: Uint8Array;
  timeDomainData: Uint8Array;
  settings: StudioSettings;
  applyShadow: (color: string, blurPx: number) => void;
  hexToRgba: (hex: string, alpha: number) => string;
  getPerceptualBarValue: (
    frequencyData: Uint8Array,
    index: number,
    total: number,
    sensitivity: number
  ) => number;
  albumRotationRef?: { angle: number; cubeX?: number; cubeY?: number; cubeZ?: number };
}

function detRand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

export function renderExtraVisualizerMode(
  mode: VisualizerMode,
  c: ExtraVisualizerContext
): boolean {
  const {
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
  } = c;

  const cx = width * 0.5;
  const cy = visCenterY;
  const primary = settings.primaryColor;
  const secondary = settings.secondaryColor;
  const sens = settings.sensitivity;
  const bars = settings.barCount;

  // 23. Implosion Ring (inward-pointing radial spectrum)
  if (mode === 'radial-bars-inward') {
    const outerR = minDim * (isPortrait ? 0.36 : 0.38) * visScale * (1 + beatBoost * 0.08);
    const maxLen = outerR * 0.62;
    const count = Math.max(32, bars);

    vCtx.save();
    vCtx.beginPath();
    vCtx.arc(cx, cy, outerR, 0, Math.PI * 2);
    vCtx.strokeStyle = hexToRgba(secondary, 0.4);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    vCtx.stroke();

    vCtx.lineCap = 'round';
    vCtx.lineWidth = Math.max(2, ((2 * Math.PI * outerR) / count) * 0.52);
    const inwardGrad = vCtx.createRadialGradient(
      cx,
      cy,
      outerR,
      cx,
      cy,
      Math.max(1, outerR - maxLen * 0.85)
    );
    inwardGrad.addColorStop(0, secondary);
    inwardGrad.addColorStop(1, primary);
    vCtx.strokeStyle = inwardGrad;
    applyShadow(primary, minDim * 0.012);
    vCtx.beginPath();
    for (let i = 0; i < count; i++) {
      const val = getPerceptualBarValue(frequencyData, i % Math.ceil(count / 2), Math.ceil(count / 2), sens);
      const len = Math.max(minDim * 0.012, Math.pow(val, 1.15) * maxLen);
      const a = (i / count) * Math.PI * 2 - Math.PI * 0.5 + currentTime * 0.25;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      vCtx.moveTo(cx + cosA * outerR, cy + sinA * outerR);
      vCtx.lineTo(cx + cosA * (outerR - len), cy + sinA * (outerR - len));
    }
    vCtx.stroke();

    const coreR = minDim * (0.045 + bass * 0.04 + beatBoost * 0.03);
    vCtx.beginPath();
    vCtx.arc(cx, cy, coreR, 0, Math.PI * 2);
    vCtx.fillStyle = hexToRgba(primary, 0.85);
    applyShadow(primary, minDim * 0.03);
    vCtx.fill();
    vCtx.restore();
    return true;
  }

  // 24. Neon Waterfall (perspective horizon spectrum layers)
  if (mode === 'spectrum-waterfall') {
    const layers = 11;
    const pts = Math.max(24, Math.min(56, Math.round(bars * 0.6)));
    const baseSpan = linW * 1.04;
    const topY = cy - minDim * 0.24 * visScale;
    const botY = cy + minDim * 0.24 * visScale;

    vCtx.save();
    for (let l = layers - 1; l >= 0; l--) {
      const depth = l / (layers - 1); // 0 = front, 1 = back
      const perspective = 1 - depth * 0.52;
      const rowW = baseSpan * perspective;
      const rowX = cx - rowW * 0.5;
      const rowY = botY - depth * (botY - topY);
      const phase = currentTime * 2.4 - l * 0.35;

      vCtx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const frac = i / pts;
        const binIdx = Math.floor(frac * (pts - 1));
        const val = getPerceptualBarValue(frequencyData, binIdx, pts, sens);
        const ripple = 0.72 + 0.28 * Math.sin(phase + frac * 6.0);
        const amp = Math.pow(val, 1.1) * minDim * 0.14 * visScale * perspective * ripple;
        const px = rowX + frac * rowW;
        const py = rowY - amp;
        if (i === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }

      vCtx.strokeStyle = hexToRgba(l % 2 === 0 ? primary : secondary, 0.9 - depth * 0.62);
      vCtx.lineWidth = Math.max(1.2, (1 - depth * 0.55) * minDim * 0.004);
      applyShadow(primary, minDim * 0.014 * (1 - depth * 0.7));
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 25. Harmonic Pendulum (coupled phase-shifted glowing bobs)
  if (mode === 'pendulum-wave') {
    const count = Math.max(14, Math.min(34, Math.round(bars * 0.36)));
    const span = linW;
    const pivotY = cy - minDim * 0.23 * visScale;
    const maxArm = minDim * 0.36 * visScale;

    vCtx.save();
    const pts: Array<{ x: number; y: number; val: number }> = [];
    for (let i = 0; i < count; i++) {
      const frac = i / Math.max(1, count - 1);
      const val = getPerceptualBarValue(frequencyData, i, count, sens);
      const freq = 1.6 + i * 0.16;
      const swingAngle =
        Math.sin(currentTime * freq) * (0.22 + val * 0.42 + beatBoost * 0.12);
      const armLen = maxArm * (0.65 + 0.35 * Math.sin(frac * Math.PI));
      const anchorX = linPadX + frac * span;
      const bx = anchorX + Math.sin(swingAngle) * armLen * 0.35;
      const by = pivotY + Math.cos(swingAngle) * armLen;
      pts.push({ x: bx, y: by, val });

      vCtx.beginPath();
      vCtx.moveTo(anchorX, pivotY);
      vCtx.lineTo(bx, by);
      vCtx.strokeStyle = hexToRgba('#cbd5e1', 0.18 + val * 0.25);
      vCtx.lineWidth = 1.2;
      vCtx.stroke();
    }

    // Spine curve connecting bobs
    vCtx.beginPath();
    pts.forEach((p, idx) => {
      if (idx === 0) vCtx.moveTo(p.x, p.y);
      else vCtx.lineTo(p.x, p.y);
    });
    vCtx.strokeStyle = hexToRgba(secondary, 0.65);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    applyShadow(secondary, minDim * 0.015);
    vCtx.stroke();

    // Glowing bobs
    pts.forEach((p, idx) => {
      const r = Math.max(3.5, minDim * (0.007 + p.val * 0.011));
      vCtx.beginPath();
      vCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      vCtx.fillStyle = idx % 2 === 0 ? primary : secondary;
      applyShadow(idx % 2 === 0 ? primary : secondary, minDim * 0.02);
      vCtx.fill();
    });
    vCtx.restore();
    return true;
  }

  // 26. Constellation Net (audio-reactive node mesh)
  if (mode === 'constellation-net') {
    const nodeCount = 28;
    const areaW = linW * 1.05;
    const areaH = minDim * 0.46 * visScale;
    const nodes: Array<{ x: number; y: number; val: number }> = [];

    for (let i = 0; i < nodeCount; i++) {
      const val = getPerceptualBarValue(frequencyData, i, nodeCount, sens);
      const bx = (detRand(i * 3.1) - 0.5) * areaW;
      const by = (detRand(i * 7.3) - 0.5) * areaH;
      const driftX = Math.sin(currentTime * (0.5 + detRand(i)) + i) * minDim * 0.03 * (1 + bass);
      const driftY = Math.cos(currentTime * (0.4 + detRand(i + 9)) + i) * minDim * 0.03 * (1 + mid);
      nodes.push({ x: cx + bx + driftX, y: cy + by + driftY, val });
    }

    const linkDist = minDim * (0.19 + bass * 0.08 + beatBoost * 0.05);
    const linkDistSq = linkDist * linkDist;
    const edgeAlphas = [0.22, 0.45, 0.68, 0.88];
    const edgeBuckets: number[][] = [[], [], [], [], [], [], [], []];
    for (let i = 0; i < nodeCount; i++) {
      for (let j = i + 1; j < nodeCount; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dSq = dx * dx + dy * dy;
        if (dSq < linkDistSq) {
          const d = Math.sqrt(dSq);
          const alpha = (1 - d / linkDist) * (0.28 + (nodes[i].val + nodes[j].val) * 0.35);
          const tier = Math.min(3, Math.max(0, Math.floor(Math.min(0.9, alpha) * 4)));
          const colIdx = (i + j) % 2 === 0 ? 0 : 1;
          edgeBuckets[colIdx * 4 + tier].push(nodes[i].x, nodes[i].y, nodes[j].x, nodes[j].y);
        }
      }
    }

    vCtx.save();
    vCtx.lineWidth = Math.max(1, minDim * 0.0022);
    for (let colIdx = 0; colIdx < 2; colIdx++) {
      const col = colIdx === 0 ? primary : secondary;
      for (let tier = 0; tier < 4; tier++) {
        const segs = edgeBuckets[colIdx * 4 + tier];
        if (segs.length === 0) continue;
        vCtx.strokeStyle = hexToRgba(col, edgeAlphas[tier]);
        vCtx.beginPath();
        for (let k = 0; k < segs.length; k += 4) {
          vCtx.moveTo(segs[k], segs[k + 1]);
          vCtx.lineTo(segs[k + 2], segs[k + 3]);
        }
        vCtx.stroke();
      }
    }

    const primaryNodes: Array<{ x: number; y: number; r: number }> = [];
    const secondaryNodes: Array<{ x: number; y: number; r: number }> = [];
    for (let i = 0; i < nodeCount; i++) {
      const n = nodes[i];
      const r = Math.max(2.5, minDim * (0.005 + n.val * 0.009));
      (i % 3 === 0 ? secondaryNodes : primaryNodes).push({ x: n.x, y: n.y, r });
    }
    applyShadow(primary, minDim * 0.015);
    if (primaryNodes.length > 0) {
      vCtx.fillStyle = primary;
      vCtx.beginPath();
      for (let k = 0; k < primaryNodes.length; k++) {
        const n = primaryNodes[k];
        vCtx.moveTo(n.x + n.r, n.y);
        vCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      }
      vCtx.fill();
    }
    if (secondaryNodes.length > 0) {
      vCtx.fillStyle = secondary;
      vCtx.beginPath();
      for (let k = 0; k < secondaryNodes.length; k++) {
        const n = secondaryNodes[k];
        vCtx.moveTo(n.x + n.r, n.y);
        vCtx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      }
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  // 27. Mirrored Oscilloscope (filled symmetrical stereo waveform ribbon)
  if (mode === 'waveform-mirror') {
    const pts = 96;
    const maxAmp = minDim * 0.22 * visScale * (1 + beatBoost * 0.16);
    const step = linW / (pts - 1);

    vCtx.save();
    vCtx.beginPath();
    for (let i = 0; i < pts; i++) {
      const idx = Math.floor((i / pts) * timeDomainData.length);
      const raw = Math.abs((timeDomainData[idx] - 128) / 128);
      const env = Math.sin((i / (pts - 1)) * Math.PI);
      const y = cy - Math.max(2, raw * maxAmp * sens * env);
      const x = linPadX + i * step;
      if (i === 0) vCtx.moveTo(x, y);
      else vCtx.lineTo(x, y);
    }
    for (let i = pts - 1; i >= 0; i--) {
      const idx = Math.floor((i / pts) * timeDomainData.length);
      const raw = Math.abs((timeDomainData[idx] - 128) / 128);
      const env = Math.sin((i / (pts - 1)) * Math.PI);
      const y = cy + Math.max(2, raw * maxAmp * sens * env);
      const x = linPadX + i * step;
      vCtx.lineTo(x, y);
    }
    vCtx.closePath();

    const grad = vCtx.createLinearGradient(linPadX, cy - maxAmp, linPadX + linW, cy + maxAmp);
    grad.addColorStop(0, hexToRgba(primary, 0.35));
    grad.addColorStop(0.5, hexToRgba(secondary, 0.55));
    grad.addColorStop(1, hexToRgba(primary, 0.35));
    vCtx.fillStyle = grad;
    vCtx.fill();

    vCtx.strokeStyle = primary;
    vCtx.lineWidth = Math.max(2, minDim * 0.0038);
    applyShadow(primary, minDim * 0.018);
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 28. Hexagonal Honeycomb (tessellated hex cells pulsing with spectrum bands)
  if (mode === 'hex-hive') {
    const hexR = minDim * 0.044 * visScale;
    const rings = 3;
    const cells: Array<{ q: number; r: number; ring: number }> = [{ q: 0, r: 0, ring: 0 }];
    for (let ring = 1; ring <= rings; ring++) {
      let q = ring;
      let r = 0;
      const dirs = [
        [-1, 1],
        [-1, 0],
        [0, -1],
        [1, -1],
        [1, 0],
        [0, 1],
      ];
      for (const [dq, dr] of dirs) {
        for (let s = 0; s < ring; s++) {
          cells.push({ q, r, ring });
          q += dq;
          r += dr;
        }
      }
    }

    vCtx.save();
    cells.forEach((cell, idx) => {
      const x = cx + hexR * Math.sqrt(3) * (cell.q + cell.r * 0.5);
      const y = cy + hexR * 1.5 * cell.r;
      const val = getPerceptualBarValue(frequencyData, idx % 24, 24, sens);
      const scale = 0.52 + val * 0.44 + (cell.ring === 0 ? beatBoost * 0.14 : 0);
      const rad = hexR * 0.88 * Math.min(1.05, scale);

      vCtx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        const px = x + Math.cos(a) * rad;
        const py = y + Math.sin(a) * rad;
        if (k === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }
      vCtx.closePath();

      const col = cell.ring % 2 === 0 ? primary : secondary;
      vCtx.fillStyle = hexToRgba(col, 0.12 + val * 0.55);
      vCtx.fill();
      vCtx.strokeStyle = hexToRgba(col, 0.45 + val * 0.5);
      vCtx.lineWidth = Math.max(1.2, minDim * 0.0026);
      applyShadow(col, minDim * 0.012);
      vCtx.stroke();
    });
    vCtx.restore();
    return true;
  }

  // 29. Electromagnetic Flux Field (multi-pole glowing interference arcs)
  if (mode === 'plasma-field') {
    const arcCount = 14;
    const span = linW * 0.86;
    const leftPoleX = cx - span * 0.5;
    const rightPoleX = cx + span * 0.5;

    vCtx.save();
    for (let i = 0; i < arcCount; i++) {
      const norm = (i / (arcCount - 1)) * 2 - 1; // -1..1
      const val = getPerceptualBarValue(frequencyData, i, arcCount, sens);
      const archH =
        norm * minDim * (0.24 + val * 0.16 + beatBoost * 0.08) * visScale;
      const wobble = Math.sin(currentTime * 3.5 + i * 0.8) * minDim * 0.03 * (1 + treble);

      vCtx.beginPath();
      vCtx.moveTo(leftPoleX, cy);
      vCtx.bezierCurveTo(
        cx - span * 0.22,
        cy + archH + wobble,
        cx + span * 0.22,
        cy + archH - wobble,
        rightPoleX,
        cy
      );
      const col = i % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.32 + val * 0.65);
      vCtx.lineWidth = Math.max(1.5, minDim * (0.0024 + val * 0.0036));
      applyShadow(col, minDim * 0.016);
      vCtx.stroke();
    }

    for (const px of [leftPoleX, rightPoleX]) {
      const r = minDim * (0.018 + bass * 0.015 + beatBoost * 0.01);
      vCtx.beginPath();
      vCtx.arc(px, cy, r, 0, Math.PI * 2);
      vCtx.fillStyle = '#ffffff';
      applyShadow(primary, minDim * 0.025);
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  // 30. Concert Laser Fan (sweeping volumetric stage beams)
  if (mode === 'laser-fan') {
    const beamCount = 15;
    const originY = cy + minDim * 0.28 * visScale;
    const reach = minDim * 0.65 * visScale;

    vCtx.save();
    for (let i = 0; i < beamCount; i++) {
      const frac = i / (beamCount - 1) - 0.5;
      const val = getPerceptualBarValue(frequencyData, Math.abs(i - Math.floor(beamCount / 2)), Math.ceil(beamCount / 2), sens);
      const sweep = Math.sin(currentTime * 1.9 + i * 0.25) * (0.12 + mid * 0.18);
      const angle = -Math.PI * 0.5 + frac * 1.45 + sweep;
      const len = reach * (0.5 + val * 0.55 + beatBoost * 0.15);

      const ex = cx + Math.cos(angle) * len;
      const ey = originY + Math.sin(angle) * len;
      const spread = 0.032 + val * 0.025;

      const grad = vCtx.createLinearGradient(cx, originY, ex, ey);
      const col = i % 2 === 0 ? primary : secondary;
      grad.addColorStop(0, hexToRgba('#ffffff', 0.72));
      grad.addColorStop(0.25, hexToRgba(col, 0.45 + val * 0.45));
      grad.addColorStop(1, 'rgba(0,0,0,0)');

      vCtx.beginPath();
      vCtx.moveTo(cx, originY);
      vCtx.lineTo(cx + Math.cos(angle - spread) * len, originY + Math.sin(angle - spread) * len);
      vCtx.lineTo(cx + Math.cos(angle + spread) * len, originY + Math.sin(angle + spread) * len);
      vCtx.closePath();
      vCtx.fillStyle = grad;
      vCtx.fill();

      vCtx.beginPath();
      vCtx.moveTo(cx, originY);
      vCtx.lineTo(ex, ey);
      vCtx.strokeStyle = hexToRgba(col, 0.6 + val * 0.4);
      vCtx.lineWidth = Math.max(1.4, minDim * 0.0028);
      applyShadow(col, minDim * 0.015);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 31. Synthwave Horizon (retro sun + 3D scrolling grid + mountain spectrum)
  if (mode === 'synth-grid') {
    const horizonY = cy + minDim * 0.04 * visScale;
    const sunR = minDim * 0.155 * visScale * (1 + beatBoost * 0.08);
    const sunY = horizonY - sunR * 0.22;

    vCtx.save();
    // Retro sliced sun
    vCtx.save();
    vCtx.beginPath();
    vCtx.arc(cx, sunY, sunR, Math.PI, Math.PI * 2);
    vCtx.lineTo(cx + sunR, horizonY);
    vCtx.lineTo(cx - sunR, horizonY);
    vCtx.closePath();
    vCtx.clip();

    const sunGrad = vCtx.createLinearGradient(cx, sunY - sunR, cx, horizonY);
    sunGrad.addColorStop(0, primary);
    sunGrad.addColorStop(1, secondary);
    vCtx.fillStyle = sunGrad;
    vCtx.fillRect(cx - sunR, sunY - sunR, sunR * 2, sunR * 2);

    // Horizontal scan cutouts on lower half of sun
    vCtx.globalCompositeOperation = 'destination-out';
    for (let s = 0; s < 5; s++) {
      const sy = sunY + sunR * (0.1 + s * 0.17);
      const sh = minDim * (0.004 + s * 0.0025);
      vCtx.fillRect(cx - sunR, sy, sunR * 2, sh);
    }
    vCtx.restore();

    // Audio mountain ridge along horizon
    const ridgePts = 40;
    vCtx.beginPath();
    vCtx.moveTo(linPadX, horizonY);
    for (let i = 0; i <= ridgePts; i++) {
      const frac = i / ridgePts;
      const sym = Math.abs(frac - 0.5) * 2;
      const val = getPerceptualBarValue(frequencyData, Math.floor(sym * 24), 25, sens);
      const x = linPadX + frac * linW;
      const y = horizonY - Math.pow(val, 1.1) * minDim * 0.11 * visScale * (0.3 + sym * 0.7);
      vCtx.lineTo(x, y);
    }
    vCtx.lineTo(linPadX + linW, horizonY);
    vCtx.strokeStyle = primary;
    vCtx.lineWidth = Math.max(1.8, minDim * 0.003);
    applyShadow(primary, minDim * 0.015);
    vCtx.stroke();

    // Perspective receding floor grid
    const gridH = minDim * 0.24 * visScale;
    vCtx.strokeStyle = hexToRgba(secondary, 0.55 + bass * 0.35);
    vCtx.lineWidth = Math.max(1, minDim * 0.002);
    for (let r = 0; r <= 7; r++) {
      const scroll = (r + ((currentTime * 1.8) % 1)) / 8;
      const y = horizonY + Math.pow(scroll, 2.0) * gridH;
      vCtx.beginPath();
      vCtx.moveTo(cx - linW * 0.65, y);
      vCtx.lineTo(cx + linW * 0.65, y);
      vCtx.stroke();
    }
    for (let cIdx = -6; cIdx <= 6; cIdx++) {
      const topX = cx + cIdx * (linW * 0.045);
      const botX = cx + cIdx * (linW * 0.14);
      vCtx.beginPath();
      vCtx.moveTo(topX, horizonY);
      vCtx.lineTo(botX, horizonY + gridH);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 32. Atomic Orbital (tilted 3D elliptical electron shells)
  if (mode === 'orbit-atoms') {
    const shellCount = 4;
    const rx = minDim * 0.29 * visScale * (1 + beatBoost * 0.08);
    const ry = rx * 0.34;

    vCtx.save();
    for (let s = 0; s < shellCount; s++) {
      const tilt = (s / shellCount) * Math.PI + currentTime * 0.22 * (s % 2 === 0 ? 1 : -1);
      const val = getPerceptualBarValue(frequencyData, s * 4, 24, sens);
      const col = s % 2 === 0 ? primary : secondary;

      vCtx.save();
      vCtx.translate(cx, cy);
      vCtx.rotate(tilt);

      vCtx.beginPath();
      vCtx.ellipse(0, 0, rx * (0.85 + val * 0.22), ry * (0.85 + val * 0.3), 0, 0, Math.PI * 2);
      vCtx.strokeStyle = hexToRgba(col, 0.55 + val * 0.4);
      vCtx.lineWidth = Math.max(1.6, minDim * 0.003);
      applyShadow(col, minDim * 0.015);
      vCtx.stroke();

      // Orbiting electron pair
      for (let e = 0; e < 2; e++) {
        const theta = currentTime * (2.2 + s * 0.6) + e * Math.PI;
        const ex = Math.cos(theta) * rx * (0.85 + val * 0.22);
        const ey = Math.sin(theta) * ry * (0.85 + val * 0.3);
        vCtx.beginPath();
        vCtx.arc(ex, ey, Math.max(3, minDim * (0.006 + val * 0.006)), 0, Math.PI * 2);
        vCtx.fillStyle = '#ffffff';
        applyShadow(col, minDim * 0.02);
        vCtx.fill();
      }
      vCtx.restore();
    }

    // Nucleus
    vCtx.beginPath();
    vCtx.arc(cx, cy, minDim * (0.032 + bass * 0.025 + beatBoost * 0.02), 0, Math.PI * 2);
    vCtx.fillStyle = primary;
    applyShadow(primary, minDim * 0.03);
    vCtx.fill();
    vCtx.restore();
    return true;
  }

  // 33. Archway Equalizer (semi-circular amphitheater spectrum arc)
  if (mode === 'bar-arc') {
    const baseY = cy + minDim * 0.14 * visScale;
    const innerR = minDim * 0.14 * visScale;
    const maxLen = minDim * 0.2 * visScale * (1 + beatBoost * 0.15);
    const count = Math.max(24, Math.min(72, bars));

    vCtx.save();
    vCtx.lineCap = 'round';
    vCtx.lineWidth = Math.max(2, ((Math.PI * innerR) / count) * 0.65);

    const arcGrad = vCtx.createRadialGradient(
      cx,
      baseY,
      innerR,
      cx,
      baseY,
      Math.max(innerR + 1, innerR + maxLen * 0.85)
    );
    arcGrad.addColorStop(0, primary);
    arcGrad.addColorStop(1, secondary);
    vCtx.strokeStyle = arcGrad;
    applyShadow(primary, minDim * 0.012);
    vCtx.beginPath();
    for (let i = 0; i < count; i++) {
      const sym = i < count / 2 ? i : count - 1 - i;
      const val = getPerceptualBarValue(frequencyData, sym, Math.ceil(count / 2), sens);
      const len = Math.max(minDim * 0.01, Math.pow(val, 1.15) * maxLen);
      const angle = Math.PI + (i / (count - 1)) * Math.PI;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      vCtx.moveTo(cx + cosA * innerR, baseY + sinA * innerR);
      vCtx.lineTo(cx + cosA * (innerR + len), baseY + sinA * (innerR + len));
    }
    vCtx.stroke();

    // Horizon baseline
    vCtx.beginPath();
    vCtx.moveTo(cx - innerR - maxLen, baseY);
    vCtx.lineTo(cx + innerR + maxLen, baseY);
    vCtx.strokeStyle = hexToRgba(primary, 0.35);
    vCtx.lineWidth = 1.5;
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 34. LED Dot Matrix (circular dot columns)
  if (mode === 'dot-equalizer') {
    const cols = Math.max(16, Math.min(44, Math.round(bars * 0.45)));
    const rows = 14;
    const cellW = linW / cols;
    const stackH = minDim * 0.38 * visScale;
    const cellH = stackH / rows;
    const dotR = Math.max(2, Math.min(cellW, cellH) * 0.34);
    const botY = cy + stackH * 0.5;

    const unlitDots: number[] = [];
    const primaryDots: number[] = [];
    const secondaryDots: number[] = [];

    for (let col = 0; col < cols; col++) {
      const val = getPerceptualBarValue(frequencyData, col, cols, sens);
      const lit = Math.max(1, Math.round(Math.pow(val, 1.05) * rows));
      const x = linPadX + (col + 0.5) * cellW;
      for (let r = 0; r < rows; r++) {
        const y = botY - (r + 0.5) * cellH;
        const ratio = r / (rows - 1);
        if (r < lit) {
          (ratio > 0.65 ? secondaryDots : primaryDots).push(x, y);
        } else {
          unlitDots.push(x, y);
        }
      }
    }

    vCtx.save();
    if (unlitDots.length > 0) {
      vCtx.shadowBlur = 0;
      vCtx.fillStyle = 'rgba(148, 163, 184, 0.1)';
      vCtx.beginPath();
      for (let k = 0; k < unlitDots.length; k += 2) {
        const x = unlitDots[k];
        const y = unlitDots[k + 1];
        vCtx.moveTo(x + dotR, y);
        vCtx.arc(x, y, dotR, 0, Math.PI * 2);
      }
      vCtx.fill();
    }
    const dotBlur = minDim * 0.01;
    if (primaryDots.length > 0) {
      vCtx.fillStyle = primary;
      applyShadow(primary, dotBlur);
      vCtx.beginPath();
      for (let k = 0; k < primaryDots.length; k += 2) {
        const x = primaryDots[k];
        const y = primaryDots[k + 1];
        vCtx.moveTo(x + dotR, y);
        vCtx.arc(x, y, dotR, 0, Math.PI * 2);
      }
      vCtx.fill();
    }
    if (secondaryDots.length > 0) {
      vCtx.fillStyle = secondary;
      applyShadow(secondary, dotBlur);
      vCtx.beginPath();
      for (let k = 0; k < secondaryDots.length; k += 2) {
        const x = secondaryDots[k];
        const y = secondaryDots[k + 1];
        vCtx.moveTo(x + dotR, y);
        vCtx.arc(x, y, dotR, 0, Math.PI * 2);
      }
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  // 35. Tesla Arcs (high-voltage jagged electric bolts)
  if (mode === 'lightning-bolts') {
    const bolts = 5;
    const span = linW * 0.9;
    const leftX = cx - span * 0.5;
    const rightX = cx + span * 0.5;
    const segments = 22;
    const bucket = Math.floor(currentTime * 28);

    vCtx.save();
    for (let b = 0; b < bolts; b++) {
      const val = getPerceptualBarValue(frequencyData, b * 4, 24, sens);
      const jitter = minDim * (0.04 + val * 0.14 + beatBoost * 0.08) * visScale;
      const yOffset = (b - (bolts - 1) * 0.5) * minDim * 0.055 * visScale;

      vCtx.beginPath();
      vCtx.moveTo(leftX, cy + yOffset);
      for (let s = 1; s < segments; s++) {
        const frac = s / segments;
        const env = Math.sin(frac * Math.PI);
        const n = (detRand(bucket * 13.7 + b * 31.1 + s * 7.9) - 0.5) * 2;
        const px = leftX + frac * span;
        const py = cy + yOffset + n * jitter * env;
        vCtx.lineTo(px, py);
      }
      vCtx.lineTo(rightX, cy + yOffset);

      const col = b % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.45 + val * 0.55);
      vCtx.lineWidth = Math.max(1.5, minDim * (0.002 + val * 0.004));
      applyShadow(col, minDim * 0.02);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 36. Pixel Spectrum Mosaic (diagonal / radial block tiles)
  if (mode === 'pixel-mosaic') {
    const cols = 18;
    const rows = 10;
    const tileW = linW / cols;
    const totalH = minDim * 0.4 * visScale;
    const tileH = totalH / rows;
    const topY = cy - totalH * 0.5;
    const gap = Math.max(2, minDim * 0.004);

    const w = Math.max(2, tileW - gap);
    const h = Math.max(2, tileH - gap);
    const unlitTiles: number[] = [];
    const tileAlphas = [0.35, 0.62, 0.88];
    const litBuckets: number[][] = [[], [], [], [], [], []];

    for (let r = 0; r < rows; r++) {
      for (let col = 0; col < cols; col++) {
        const dx = Math.abs(col - (cols - 1) * 0.5) / (cols * 0.5);
        const dy = Math.abs(r - (rows - 1) * 0.5) / (rows * 0.5);
        const radial = Math.min(1, Math.hypot(dx, dy) * 0.72);
        const val = getPerceptualBarValue(frequencyData, Math.floor(radial * 24), 25, sens);
        const active = val * 1.15 > radial * 0.85;

        const x = linPadX + col * tileW + gap * 0.5;
        const y = topY + r * tileH + gap * 0.5;

        if (active) {
          const colIdx = (col + r) % 2 === 0 ? 0 : 1;
          const alpha = 0.25 + val * 0.7;
          const tier = alpha > 0.74 ? 2 : alpha > 0.48 ? 1 : 0;
          litBuckets[colIdx * 3 + tier].push(x, y);
        } else {
          unlitTiles.push(x, y);
        }
      }
    }

    vCtx.save();
    if (unlitTiles.length > 0) {
      vCtx.shadowBlur = 0;
      vCtx.fillStyle = 'rgba(148, 163, 184, 0.08)';
      vCtx.beginPath();
      for (let k = 0; k < unlitTiles.length; k += 2) {
        vCtx.roundRect(unlitTiles[k], unlitTiles[k + 1], w, h, 3);
      }
      vCtx.fill();
    }
    const tileGlow = minDim * 0.01;
    for (let colIdx = 0; colIdx < 2; colIdx++) {
      const mix = colIdx === 0 ? primary : secondary;
      applyShadow(mix, tileGlow);
      for (let tier = 0; tier < 3; tier++) {
        const coords = litBuckets[colIdx * 3 + tier];
        if (coords.length === 0) continue;
        vCtx.fillStyle = hexToRgba(mix, tileAlphas[tier]);
        vCtx.beginPath();
        for (let k = 0; k < coords.length; k += 2) {
          vCtx.roundRect(coords[k], coords[k + 1], w, h, 3);
        }
        vCtx.fill();
      }
    }
    vCtx.restore();
    return true;
  }

  // 37. Acoustic Ripples (concentric interfering pond rings)
  if (mode === 'ripple-pond') {
    const rings = 9;
    const maxR = minDim * 0.36 * visScale * (1 + beatBoost * 0.08);
    const speed = 0.45 + bass * 0.25;

    vCtx.save();
    for (let i = 0; i < rings; i++) {
      const phase = ((currentTime * speed + i / rings) % 1);
      const r = Math.max(4, phase * maxR);
      const val = getPerceptualBarValue(frequencyData, i * 3, 28, sens);
      const alpha = (1 - phase) * (0.45 + val * 0.55);
      const col = i % 2 === 0 ? primary : secondary;

      vCtx.beginPath();
      const pts = 72;
      for (let p = 0; p <= pts; p++) {
        const a = (p / pts) * Math.PI * 2;
        const wobble = Math.sin(a * 6 + currentTime * 3 + i) * minDim * 0.012 * val;
        const px = cx + Math.cos(a) * (r + wobble);
        const py = cy + Math.sin(a) * (r + wobble);
        if (p === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }
      vCtx.closePath();
      vCtx.strokeStyle = hexToRgba(col, Math.max(0, Math.min(1, alpha)));
      vCtx.lineWidth = Math.max(1.5, minDim * (0.0022 + (1 - phase) * 0.004));
      applyShadow(col, minDim * 0.014);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 38. Fibonacci Spiral Bars (golden-angle phyllotaxis bars)
  if (mode === 'spiral-bars') {
    const count = Math.max(36, Math.min(96, bars));
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const maxR = minDim * 0.32 * visScale * (1 + beatBoost * 0.1);

    const spiralAlphas = [0.55, 0.78, 0.96];
    const spiralBuckets: number[][] = [[], [], [], [], [], []];

    for (let i = 0; i < count; i++) {
      const frac = i / count;
      const val = getPerceptualBarValue(frequencyData, i % 32, 32, sens);
      const a = i * goldenAngle + currentTime * 0.35;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const dist = Math.sqrt(frac) * maxR;
      const x = cx + cosA * dist;
      const y = cy + sinA * dist;
      const len = minDim * (0.012 + val * 0.048) * visScale;
      const x2 = x + cosA * len;
      const y2 = y + sinA * len;
      const colIdx = i % 2 === 0 ? 0 : 1;
      const tier = val > 0.66 ? 2 : val > 0.33 ? 1 : 0;
      spiralBuckets[colIdx * 3 + tier].push(x, y, x2, y2);
    }

    vCtx.save();
    vCtx.lineWidth = Math.max(2, minDim * 0.0045);
    vCtx.lineCap = 'round';
    const spiralGlow = minDim * 0.01;
    for (let colIdx = 0; colIdx < 2; colIdx++) {
      const col = colIdx === 0 ? primary : secondary;
      applyShadow(col, spiralGlow);
      for (let tier = 0; tier < 3; tier++) {
        const segs = spiralBuckets[colIdx * 3 + tier];
        if (segs.length === 0) continue;
        vCtx.strokeStyle = hexToRgba(col, spiralAlphas[tier]);
        vCtx.beginPath();
        for (let k = 0; k < segs.length; k += 4) {
          vCtx.moveTo(segs[k], segs[k + 1]);
          vCtx.lineTo(segs[k + 2], segs[k + 3]);
        }
        vCtx.stroke();
      }
    }
    vCtx.restore();
    return true;
  }

  // 39. 3D Wireframe Pyramid (nested rotating octahedron / pyramid)
  if (mode === 'pyramid-3d') {
    const scale = minDim * 0.26 * visScale * (1 + bass * 0.15 + beatBoost * 0.14);
    const ry = currentTime * 0.85;
    const rx = 0.42 + Math.sin(currentTime * 0.7) * 0.25;
    const verts: Array<[number, number, number]> = [
      [0, -1.15, 0],
      [1, 0.2, 1],
      [-1, 0.2, 1],
      [-1, 0.2, -1],
      [1, 0.2, -1],
      [0, 1.15, 0],
    ];
    const edges: Array<[number, number]> = [
      [0, 1], [0, 2], [0, 3], [0, 4],
      [1, 2], [2, 3], [3, 4], [4, 1],
      [5, 1], [5, 2], [5, 3], [5, 4],
    ];

    const project = (v: [number, number, number], s: number) => {
      const x1 = v[0] * Math.cos(ry) - v[2] * Math.sin(ry);
      const z1 = v[0] * Math.sin(ry) + v[2] * Math.cos(ry);
      const y2 = v[1] * Math.cos(rx) - z1 * Math.sin(rx);
      const z2 = v[1] * Math.sin(rx) + z1 * Math.cos(rx);
      const p = 3.2 / (3.2 - z2 * 0.7);
      return { x: cx + x1 * s * p, y: cy + y2 * s * p };
    };

    vCtx.save();
    // Outer octahedron
    const outerPts = verts.map((v) => project(v, scale));
    vCtx.strokeStyle = primary;
    vCtx.lineWidth = Math.max(2, minDim * 0.004);
    applyShadow(primary, minDim * 0.02);
    vCtx.beginPath();
    for (const [a, b] of edges) {
      vCtx.moveTo(outerPts[a].x, outerPts[a].y);
      vCtx.lineTo(outerPts[b].x, outerPts[b].y);
    }
    vCtx.stroke();

    // Inner mid-reactive core octahedron
    const innerPts = verts.map((v) => project(v, scale * (0.45 + mid * 0.25)));
    vCtx.strokeStyle = secondary;
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    applyShadow(secondary, minDim * 0.018);
    vCtx.beginPath();
    for (const [a, b] of edges) {
      vCtx.moveTo(innerPts[a].x, innerPts[a].y);
      vCtx.lineTo(innerPts[b].x, innerPts[b].y);
    }
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 40. Pulse ECG Trace (glowing cardiac waveform trace)
  if (mode === 'heartbeat-ecg') {
    const pts = 110;
    const maxAmp = minDim * 0.2 * visScale * (1 + beatBoost * 0.25);
    const step = linW / (pts - 1);

    vCtx.save();
    // Subtle oscilloscope grid
    vCtx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    vCtx.lineWidth = 1;
    vCtx.beginPath();
    vCtx.moveTo(linPadX, cy);
    vCtx.lineTo(linPadX + linW, cy);
    vCtx.stroke();

    vCtx.beginPath();
    for (let i = 0; i < pts; i++) {
      const frac = i / (pts - 1);
      const tdIdx = Math.floor(frac * timeDomainData.length);
      const td = (timeDomainData[tdIdx] - 128) / 128;
      // Sharp QRS complex pulse traveling across display
      const scanPos = (currentTime * 0.55) % 1;
      const dist = Math.abs(frac - scanPos);
      const qrs =
        dist < 0.06
          ? Math.sin(((frac - scanPos) / 0.06) * Math.PI * 2.5) * (0.55 + bass * 0.7 + beatBoost * 0.5)
          : 0;
      const y = cy - (td * 0.45 * sens + qrs) * maxAmp;
      const x = linPadX + i * step;
      if (i === 0) vCtx.moveTo(x, y);
      else vCtx.lineTo(x, y);
    }
    const grad = vCtx.createLinearGradient(linPadX, cy, linPadX + linW, cy);
    grad.addColorStop(0, hexToRgba(primary, 0.25));
    grad.addColorStop(0.5, primary);
    grad.addColorStop(1, secondary);
    vCtx.strokeStyle = grad;
    vCtx.lineWidth = Math.max(2.2, minDim * 0.0045);
    applyShadow(primary, minDim * 0.02);
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 41. Toroidal Lissajous Knot (3D trefoil ribbon)
  if (mode === 'ribbon-knot') {
    const pts = 140;
    const baseR = minDim * 0.19 * visScale * (1 + beatBoost * 0.12);
    const rot = currentTime * 0.6;

    vCtx.save();
    for (let layer = 0; layer < 2; layer++) {
      const col = layer === 0 ? primary : secondary;
      const phaseShift = layer * 0.35;
      vCtx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const t = (i / pts) * Math.PI * 2;
        const binVal = getPerceptualBarValue(frequencyData, i % 36, 36, sens);
        const mod = 1 + binVal * 0.22;
        const x3 = (Math.sin(t) + 2 * Math.sin(2 * t)) * 0.42 * mod;
        const y3 = (Math.cos(t) - 2 * Math.cos(2 * t)) * 0.42 * mod;
        const z3 = -Math.sin(3 * t + phaseShift) * 0.45;

        const rx = x3 * Math.cos(rot) - z3 * Math.sin(rot);
        const rz = x3 * Math.sin(rot) + z3 * Math.cos(rot);
        const p = 2.8 / (2.8 - rz * 0.65);

        const sx = cx + rx * baseR * p;
        const sy = cy + y3 * baseR * p;
        if (i === 0) vCtx.moveTo(sx, sy);
        else vCtx.lineTo(sx, sy);
      }
      vCtx.strokeStyle = hexToRgba(col, 0.85);
      vCtx.lineWidth = Math.max(2, minDim * (layer === 0 ? 0.005 : 0.0032));
      applyShadow(col, minDim * 0.018);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 42. Hypernova Starburst (radial flare spikes bursting on kicks)
  if (mode === 'starburst-rays') {
    const rays = Math.max(20, Math.min(48, Math.round(bars * 0.55)));
    const innerR = minDim * 0.03 * visScale;
    const maxLen = minDim * 0.38 * visScale * (1 + beatBoost * 0.24);

    vCtx.save();
    for (let i = 0; i < rays; i++) {
      const val = getPerceptualBarValue(frequencyData, i % 24, 24, sens);
      const a = (i / rays) * Math.PI * 2 + currentTime * 0.18;
      const len = innerR + Math.pow(val, 1.05) * maxLen;
      const spread = 0.035 + val * 0.03;

      const tipX = cx + Math.cos(a) * len;
      const tipY = cy + Math.sin(a) * len;
      const col = i % 2 === 0 ? primary : secondary;

      vCtx.beginPath();
      vCtx.moveTo(cx + Math.cos(a - spread) * innerR, cy + Math.sin(a - spread) * innerR);
      vCtx.lineTo(tipX, tipY);
      vCtx.lineTo(cx + Math.cos(a + spread) * innerR, cy + Math.sin(a + spread) * innerR);
      vCtx.closePath();
      vCtx.fillStyle = hexToRgba(col, 0.38 + val * 0.55);
      applyShadow(col, minDim * 0.015);
      vCtx.fill();
    }

    vCtx.beginPath();
    vCtx.arc(cx, cy, innerR * (1.2 + bass * 0.6 + beatBoost * 0.4), 0, Math.PI * 2);
    vCtx.fillStyle = '#ffffff';
    applyShadow(primary, minDim * 0.03);
    vCtx.fill();
    vCtx.restore();
    return true;
  }

  // 43. Prismatic Shards (floating faceted triangles refracting gradients)
  if (mode === 'glass-shards') {
    const shards = 18;
    const spreadR = minDim * 0.3 * visScale;

    vCtx.save();
    for (let i = 0; i < shards; i++) {
      const val = getPerceptualBarValue(frequencyData, i, shards, sens);
      const baseAngle = (i / shards) * Math.PI * 2 + currentTime * 0.2 * (i % 2 === 0 ? 1 : -0.7);
      const dist = spreadR * (0.35 + detRand(i * 4.3) * 0.65) * (1 + val * 0.25 + beatBoost * 0.1);
      const sx = cx + Math.cos(baseAngle) * dist;
      const sy = cy + Math.sin(baseAngle) * dist;
      const size = minDim * (0.035 + val * 0.045) * visScale;
      const rot = baseAngle + currentTime * (0.6 + detRand(i));

      vCtx.beginPath();
      for (let k = 0; k < 3; k++) {
        const va = rot + (k / 3) * Math.PI * 2;
        const vx = sx + Math.cos(va) * size;
        const vy = sy + Math.sin(va) * size;
        if (k === 0) vCtx.moveTo(vx, vy);
        else vCtx.lineTo(vx, vy);
      }
      vCtx.closePath();

      const col = i % 2 === 0 ? primary : secondary;
      vCtx.fillStyle = hexToRgba(col, 0.14 + val * 0.42);
      vCtx.fill();
      vCtx.strokeStyle = hexToRgba('#ffffff', 0.35 + val * 0.5);
      vCtx.lineWidth = Math.max(1.2, minDim * 0.0022);
      applyShadow(col, minDim * 0.014);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 44. Vinyl Resonance (concentric frequency-modulated vinyl grooves + stylus arc)
  if (mode === 'vinyl-grooves') {
    const rings = 10;
    const maxR = minDim * 0.34 * visScale;
    const minR = minDim * 0.07 * visScale;

    vCtx.save();
    for (let rIdx = 0; rIdx < rings; rIdx++) {
      const baseR = minR + (rIdx / (rings - 1)) * (maxR - minR);
      const pts = 72;
      const col = rIdx % 2 === 0 ? primary : secondary;

      vCtx.beginPath();
      for (let p = 0; p <= pts; p++) {
        const a = (p / pts) * Math.PI * 2 + currentTime * (0.4 + rIdx * 0.05);
        const val = getPerceptualBarValue(frequencyData, (rIdx * 3 + p) % 36, 36, sens);
        const rad = baseR + val * minDim * 0.018 * visScale * (1 + beatBoost * 0.35);
        const px = cx + Math.cos(a) * rad;
        const py = cy + Math.sin(a) * rad;
        if (p === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }
      vCtx.closePath();
      vCtx.strokeStyle = hexToRgba(col, 0.38 + (rIdx / rings) * 0.45);
      vCtx.lineWidth = Math.max(1.2, minDim * 0.0024);
      applyShadow(col, minDim * 0.01);
      vCtx.stroke();
    }

    // Center label spindle
    vCtx.beginPath();
    vCtx.arc(cx, cy, minR * 0.72, 0, Math.PI * 2);
    vCtx.fillStyle = hexToRgba(primary, 0.25 + bass * 0.3);
    vCtx.fill();
    vCtx.strokeStyle = primary;
    vCtx.lineWidth = 2;
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 45. Stepped Skyline EQ (architectural stepped monolith bars)
  if (mode === 'staircase-eq') {
    const cols = Math.max(16, Math.min(40, Math.round(bars * 0.42)));
    const colW = linW / cols;
    const maxH = minDim * 0.4 * visScale * (1 + beatBoost * 0.14);
    const botY = cy + maxH * 0.45;
    const depthX = colW * 0.24;
    const depthY = -colW * 0.22;

    vCtx.save();
    for (let i = 0; i < cols; i++) {
      const val = getPerceptualBarValue(frequencyData, i, cols, sens);
      const h = Math.max(minDim * 0.02, Math.pow(val, 1.1) * maxH);
      const x = linPadX + i * colW + colW * 0.14;
      const w = colW * 0.62;
      const y = botY - h;
      const col = i % 2 === 0 ? primary : secondary;

      // Side face
      vCtx.fillStyle = hexToRgba(col, 0.28);
      vCtx.beginPath();
      vCtx.moveTo(x + w, y);
      vCtx.lineTo(x + w + depthX, y + depthY);
      vCtx.lineTo(x + w + depthX, botY + depthY);
      vCtx.lineTo(x + w, botY);
      vCtx.closePath();
      vCtx.fill();

      // Front face
      vCtx.fillStyle = hexToRgba(col, 0.65);
      vCtx.fillRect(x, y, w, h);

      // Glowing top cap
      vCtx.fillStyle = '#ffffff';
      applyShadow(col, minDim * 0.012);
      vCtx.beginPath();
      vCtx.moveTo(x, y);
      vCtx.lineTo(x + depthX, y + depthY);
      vCtx.lineTo(x + w + depthX, y + depthY);
      vCtx.lineTo(x + w, y);
      vCtx.closePath();
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  // 46. Infinity Lemniscate (dual counter-phase figure-eight spectrum)
  if (mode === 'infinity-loop') {
    const pts = 120;
    const a = minDim * 0.34 * visScale * (1 + beatBoost * 0.1);

    vCtx.save();
    for (let strand = 0; strand < 2; strand++) {
      const col = strand === 0 ? primary : secondary;
      vCtx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const t = (i / pts) * Math.PI * 2;
        const val = getPerceptualBarValue(frequencyData, i % 32, 32, sens);
        const denom = 1 + Math.sin(t) * Math.sin(t);
        const lx = (a * Math.cos(t)) / denom;
        const ly = (a * Math.sin(t) * Math.cos(t)) / denom;
        const nx = Math.cos(t * 3 + currentTime * 3 + strand * Math.PI) * minDim * 0.025 * val;
        const ny = Math.sin(t * 3 + currentTime * 3 + strand * Math.PI) * minDim * 0.025 * val;
        const px = cx + lx + nx;
        const py = cy + ly + ny;
        if (i === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }
      vCtx.strokeStyle = hexToRgba(col, 0.88);
      vCtx.lineWidth = Math.max(2, minDim * 0.0048);
      applyShadow(col, minDim * 0.018);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 47. Chromatic Halo Rings (offset RGB/primary/secondary rings on sub-bass)
  if (mode === 'chromatic-rings') {
    const baseR = minDim * 0.23 * visScale;
    const drift = minDim * (0.012 + bass * 0.032 + beatBoost * 0.028);
    const channels = [
      { col: primary, angle: currentTime * 2.1, rMul: 1.0 },
      { col: secondary, angle: currentTime * 2.1 + (Math.PI * 2) / 3, rMul: 0.94 },
      { col: '#ffffff', angle: currentTime * 2.1 + (Math.PI * 4) / 3, rMul: 0.88 },
    ];

    vCtx.save();
    const pts = 84;
    channels.forEach((ch, cIdx) => {
      const ox = cx + Math.cos(ch.angle) * drift;
      const oy = cy + Math.sin(ch.angle) * drift;
      vCtx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        const val = getPerceptualBarValue(frequencyData, (i + cIdx * 7) % 36, 36, sens);
        const r = baseR * ch.rMul + val * minDim * 0.06 * visScale;
        const px = ox + Math.cos(a) * r;
        const py = oy + Math.sin(a) * r;
        if (i === 0) vCtx.moveTo(px, py);
        else vCtx.lineTo(px, py);
      }
      vCtx.closePath();
      vCtx.strokeStyle = hexToRgba(ch.col, cIdx === 2 ? 0.5 : 0.85);
      vCtx.lineWidth = Math.max(2, minDim * 0.0042);
      applyShadow(ch.col, minDim * 0.016);
      vCtx.stroke();
    });
    vCtx.restore();
    return true;
  }

  // 48. Acoustic Silk Curtain (vertical swaying harmonic threads)
  if (mode === 'sound-curtain') {
    const threads = Math.max(20, Math.min(48, Math.round(bars * 0.5)));
    const topY = cy - minDim * 0.24 * visScale;
    const botY = cy + minDim * 0.24 * visScale;
    const segs = 16;

    vCtx.save();
    for (let i = 0; i < threads; i++) {
      const frac = i / (threads - 1);
      const baseX = linPadX + frac * linW;
      const val = getPerceptualBarValue(frequencyData, i, threads, sens);
      const swayAmp = minDim * (0.015 + val * 0.045 + beatBoost * 0.02) * visScale;

      vCtx.beginPath();
      for (let s = 0; s <= segs; s++) {
        const sf = s / segs;
        const y = topY + sf * (botY - topY);
        const env = Math.sin(sf * Math.PI);
        const x = baseX + Math.sin(sf * 5.0 + currentTime * 3.4 + i * 0.4) * swayAmp * env;
        if (s === 0) vCtx.moveTo(x, y);
        else vCtx.lineTo(x, y);
      }
      const col = i % 2 === 0 ? primary : secondary;
      vCtx.strokeStyle = hexToRgba(col, 0.35 + val * 0.6);
      vCtx.lineWidth = Math.max(1.4, minDim * 0.0028);
      applyShadow(col, minDim * 0.012);
      vCtx.stroke();
    }
    vCtx.restore();
    return true;
  }

  // 49. HUD Telemetry Compass (aerospace rotating azimuth arcs & spectrum ticks)
  if (mode === 'cyber-compass') {
    const outerR = minDim * 0.31 * visScale * (1 + beatBoost * 0.08);
    const midR = outerR * 0.74;
    const innerR = outerR * 0.46;

    vCtx.save();
    // Outer rotating tick ring
    const ticks = 48;
    for (let i = 0; i < ticks; i++) {
      const val = getPerceptualBarValue(frequencyData, i % 24, 24, sens);
      const a = (i / ticks) * Math.PI * 2 + currentTime * 0.22;
      const len = minDim * (0.012 + val * 0.042);
      vCtx.beginPath();
      vCtx.moveTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
      vCtx.lineTo(cx + Math.cos(a) * (outerR + len), cy + Math.sin(a) * (outerR + len));
      vCtx.strokeStyle = hexToRgba(i % 4 === 0 ? secondary : primary, 0.5 + val * 0.5);
      vCtx.lineWidth = i % 4 === 0 ? Math.max(2, minDim * 0.004) : Math.max(1.2, minDim * 0.0022);
      applyShadow(primary, minDim * 0.012);
      vCtx.stroke();
    }

    // Counter-rotating telemetry arcs
    for (let aIdx = 0; aIdx < 3; aIdx++) {
      const start = currentTime * -0.55 + (aIdx * Math.PI * 2) / 3;
      vCtx.beginPath();
      vCtx.arc(cx, cy, midR, start, start + Math.PI * 0.45);
      vCtx.strokeStyle = secondary;
      vCtx.lineWidth = Math.max(2, minDim * 0.0045);
      applyShadow(secondary, minDim * 0.016);
      vCtx.stroke();
    }

    // Inner crosshair circle
    vCtx.beginPath();
    vCtx.arc(cx, cy, innerR * (1 + bass * 0.12), 0, Math.PI * 2);
    vCtx.strokeStyle = hexToRgba(primary, 0.7);
    vCtx.lineWidth = Math.max(1.5, minDim * 0.003);
    vCtx.stroke();
    vCtx.restore();
    return true;
  }

  // 50. Cosmic Nebula Clouds (soft volumetric plasma clouds + starlight)
  if (mode === 'nebula-clouds') {
    const blobs = 12;
    const spread = minDim * 0.25 * visScale;

    vCtx.save();
    for (let i = 0; i < blobs; i++) {
      const val = getPerceptualBarValue(frequencyData, i * 2, 24, sens);
      const a = (i / blobs) * Math.PI * 2 + currentTime * 0.15;
      const dist = spread * (0.25 + 0.65 * detRand(i * 5.7)) * (1 + bass * 0.2);
      const bx = cx + Math.cos(a) * dist;
      const by = cy + Math.sin(a) * dist * 0.68;
      const rad = minDim * (0.1 + val * 0.12 + beatBoost * 0.05) * visScale;

      const col = i % 2 === 0 ? primary : secondary;
      const g = vCtx.createRadialGradient(bx, by, rad * 0.05, bx, by, rad);
      g.addColorStop(0, hexToRgba(col, 0.34 + val * 0.28));
      g.addColorStop(0.55, hexToRgba(col, 0.12 + val * 0.12));
      g.addColorStop(1, 'rgba(0,0,0,0)');

      vCtx.fillStyle = g;
      vCtx.beginPath();
      vCtx.arc(bx, by, rad, 0, Math.PI * 2);
      vCtx.fill();
    }

    // Sparkling core star cluster
    for (let s = 0; s < 24; s++) {
      const sx = cx + (detRand(s * 9.3) - 0.5) * linW * 0.9;
      const sy = cy + (detRand(s * 14.1) - 0.5) * minDim * 0.42 * visScale;
      const twinkle = 0.4 + 0.6 * Math.sin(currentTime * 4 + s);
      const r = Math.max(1.2, minDim * 0.0025 * (1 + treble * 0.8) * twinkle);
      vCtx.beginPath();
      vCtx.arc(sx, sy, r, 0, Math.PI * 2);
      vCtx.fillStyle = hexToRgba('#ffffff', 0.45 + twinkle * 0.5);
      vCtx.fill();
    }
    vCtx.restore();
    return true;
  }

  if (renderNewVisualizerMode(mode, c)) {
    return true;
  }

  return false;
}
