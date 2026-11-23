import { MocapClipData } from '../types/studio';

interface BvhNode {
  name: string;
  index: number;
  parentIndex: number;
  offset: [number, number, number];
  channels: string[];
  channelOffset: number;
  isEndSite: boolean;
}

type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

function mat4Identity(): Mat4 {
  return [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0) as Mat4;
  for (let row = 0; row < 4; row++) {
    const r = row * 4;
    for (let col = 0; col < 4; col++) {
      out[r + col] =
        a[r] * b[col] +
        a[r + 1] * b[4 + col] +
        a[r + 2] * b[8 + col] +
        a[r + 3] * b[12 + col];
    }
  }
  return out;
}

function mat4Translate(tx: number, ty: number, tz: number): Mat4 {
  return [
    1, 0, 0, tx,
    0, 1, 0, ty,
    0, 0, 1, tz,
    0, 0, 0, 1,
  ];
}

function mat4RotateX(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    1, 0, 0, 0,
    0, c, -s, 0,
    0, s, c, 0,
    0, 0, 0, 1,
  ];
}

function mat4RotateY(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    c, 0, s, 0,
    0, 1, 0, 0,
    -s, 0, c, 0,
    0, 0, 0, 1,
  ];
}

function mat4RotateZ(rad: number): Mat4 {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return [
    c, -s, 0, 0,
    s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ];
}

function findJointIndexByPattern(names: string[], patterns: RegExp[], fallback: number): number {
  for (const pat of patterns) {
    const idx = names.findIndex((n) => pat.test(n));
    if (idx >= 0) return idx;
  }
  return fallback;
}

function normalizeMocapFrames(
  rawFrames: number[][],
  jointCount: number,
  hipsIdx: number
): number[][] {
  if (rawFrames.length === 0 || jointCount === 0) return [];

  // Determine typical skeleton height across sample frames
  const sampleStep = Math.max(1, Math.floor(rawFrames.length / 24));
  let heightAccum = 0;
  let sampleCount = 0;

  for (let f = 0; f < rawFrames.length; f += sampleStep) {
    const coords = rawFrames[f];
    let minY = Infinity;
    let maxY = -Infinity;
    for (let j = 0; j < jointCount; j++) {
      const y = coords[j * 3 + 1];
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (Number.isFinite(minY) && Number.isFinite(maxY) && maxY > minY) {
      heightAccum += maxY - minY;
      sampleCount += 1;
    }
  }

  const avgHeight = sampleCount > 0 ? Math.max(0.001, heightAccum / sampleCount) : 1;
  const scale = 1.65 / avgHeight;

  // Determine a stable clip-wide ground plane from the lowest points across frames
  // so lifted feet, jumps, and relevés keep natural weight rather than pinning every foot to y=0.
  const frameMins: number[] = [];
  for (let f = 0; f < rawFrames.length; f++) {
    const coords = rawFrames[f];
    let minY = Infinity;
    for (let j = 0; j < jointCount; j++) {
      const y = coords[j * 3 + 1];
      if (y < minY) minY = y;
    }
    if (Number.isFinite(minY)) frameMins.push(minY);
  }
  frameMins.sort((a, b) => a - b);
  const globalFloorY =
    frameMins.length > 0
      ? frameMins[Math.min(frameMins.length - 1, Math.floor(frameMins.length * 0.08))]
      : 0;

  // Keep root XY/Z centered around frame 0 hips XZ so character dances cleanly in place
  const baseHipX = rawFrames[0][hipsIdx * 3] || 0;
  const baseHipZ = rawFrames[0][hipsIdx * 3 + 2] || 0;

  return rawFrames.map((coords) => {
    const hipX = coords[hipsIdx * 3] ?? baseHipX;
    const hipZ = coords[hipsIdx * 3 + 2] ?? baseHipZ;
    // Allow subtle lateral/depth hip sway while preventing character from walking off-screen
    const centerX = hipX * 0.72 + baseHipX * 0.28;
    const centerZ = hipZ * 0.72 + baseHipZ * 0.28;

    const normalized = new Array<number>(jointCount * 3);
    for (let j = 0; j < jointCount; j++) {
      const x = (coords[j * 3] - centerX) * scale;
      const y = Math.max(0, (coords[j * 3 + 1] - globalFloorY) * scale);
      const z = (coords[j * 3 + 2] - centerZ) * scale;
      normalized[j * 3] = Number(x.toFixed(4));
      normalized[j * 3 + 1] = Number(y.toFixed(4));
      normalized[j * 3 + 2] = Number(z.toFixed(4));
    }
    return normalized;
  });
}

export function parseBvhMocap(content: string, fileName: string): MocapClipData {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/);
  const nodes: BvhNode[] = [];
  const stack: number[] = [];
  let totalChannels = 0;
  let inMotion = false;
  let expectedFrames = 0;
  let frameTime = 1 / 30;
  const motionRows: number[][] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    if (!inMotion) {
      const tokens = trimmed.split(/\s+/);
      const head = tokens[0].toUpperCase();

      if (head === 'MOTION') {
        inMotion = true;
        continue;
      }

      if (head === 'ROOT' || head === 'JOINT') {
        const parentIndex = stack.length > 0 ? stack[stack.length - 1] : -1;
        const idx = nodes.length;
        nodes.push({
          name: tokens.slice(1).join(' ') || `Joint_${idx}`,
          index: idx,
          parentIndex,
          offset: [0, 0, 0],
          channels: [],
          channelOffset: totalChannels,
          isEndSite: false,
        });
        stack.push(idx);
      } else if (head === 'END' && (tokens[1] || '').toUpperCase() === 'SITE') {
        const parentIndex = stack.length > 0 ? stack[stack.length - 1] : -1;
        const parentName = parentIndex >= 0 ? nodes[parentIndex].name : 'Root';
        const idx = nodes.length;
        nodes.push({
          name: `${parentName}_End`,
          index: idx,
          parentIndex,
          offset: [0, 0, 0],
          channels: [],
          channelOffset: totalChannels,
          isEndSite: true,
        });
        stack.push(idx);
      } else if (head === 'OFFSET' && stack.length > 0) {
        const cur = nodes[stack[stack.length - 1]];
        cur.offset = [
          parseFloat(tokens[1]) || 0,
          parseFloat(tokens[2]) || 0,
          parseFloat(tokens[3]) || 0,
        ];
      } else if (head === 'CHANNELS' && stack.length > 0) {
        const count = Math.max(0, parseInt(tokens[1], 10) || 0);
        const cur = nodes[stack[stack.length - 1]];
        cur.channels = tokens.slice(2, 2 + count);
        cur.channelOffset = totalChannels;
        totalChannels += cur.channels.length;
      } else if (head === '}') {
        if (stack.length > 0) stack.pop();
      }
    } else {
      if (/^Frames\s*:/i.test(trimmed)) {
        expectedFrames = Math.max(0, parseInt(trimmed.split(':')[1] || '0', 10) || 0);
        continue;
      }
      if (/^Frame\s+Time\s*:/i.test(trimmed)) {
        const parsedFt = parseFloat(trimmed.split(':')[1] || '0.033333');
        if (Number.isFinite(parsedFt) && parsedFt > 0.001) {
          frameTime = parsedFt;
        }
        continue;
      }
      const nums = trimmed
        .split(/\s+/)
        .map((n) => parseFloat(n))
        .filter((n) => Number.isFinite(n));
      if (nums.length >= Math.max(3, totalChannels)) {
        motionRows.push(nums);
      }
    }
  }

  if (nodes.length < 3 || motionRows.length === 0) {
    throw new Error('Invalid BVH file: missing skeleton hierarchy or motion frames.');
  }

  // Cap ultra-long mocap captures smoothly while preserving cadence
  const maxFrames = 3600;
  const stride = motionRows.length > maxFrames ? Math.ceil(motionRows.length / maxFrames) : 1;
  const effectiveFps = Math.max(10, Math.min(120, Math.round((1 / frameTime / stride) * 10) / 10));

  const bones: Array<[number, number]> = [];
  for (const node of nodes) {
    if (node.parentIndex >= 0) {
      bones.push([node.parentIndex, node.index]);
    }
  }

  const deg2rad = Math.PI / 180;
  const worldFrames: number[][] = [];
  const limit = expectedFrames > 0 ? Math.min(motionRows.length, expectedFrames) : motionRows.length;

  for (let f = 0; f < limit; f += stride) {
    const row = motionRows[f];
    const worldMats: Mat4[] = new Array(nodes.length);
    const frameCoords = new Array<number>(nodes.length * 3);

    for (let n = 0; n < nodes.length; n++) {
      const node = nodes[n];
      let tx = node.offset[0];
      let ty = node.offset[1];
      let tz = node.offset[2];

      for (let c = 0; c < node.channels.length; c++) {
        const ch = node.channels[c].toLowerCase();
        const val = row[node.channelOffset + c] ?? 0;
        if (ch === 'xposition') tx += val;
        else if (ch === 'yposition') ty += val;
        else if (ch === 'zposition') tz += val;
      }

      let local = mat4Translate(tx, ty, tz);

      for (let c = 0; c < node.channels.length; c++) {
        const ch = node.channels[c].toLowerCase();
        const val = (row[node.channelOffset + c] ?? 0) * deg2rad;
        if (ch === 'xrotation') local = mat4Multiply(local, mat4RotateX(val));
        else if (ch === 'yrotation') local = mat4Multiply(local, mat4RotateY(val));
        else if (ch === 'zrotation') local = mat4Multiply(local, mat4RotateZ(val));
      }

      const world =
        node.parentIndex >= 0
          ? mat4Multiply(worldMats[node.parentIndex], local)
          : local;
      worldMats[n] = world;
      frameCoords[n * 3] = world[3];
      frameCoords[n * 3 + 1] = world[7];
      frameCoords[n * 3 + 2] = world[11];
    }

    worldFrames.push(frameCoords);
  }

  const jointNames = nodes.map((n) => n.name);
  const hipsJointIndex = findJointIndexByPattern(jointNames, [/hips?/i, /pelvis/i, /root/i], 0);
  const headJointIndex = findJointIndexByPattern(
    jointNames,
    [/^head$/i, /head/i, /neck/i],
    Math.min(4, jointNames.length - 1)
  );

  const normalizedFrames = normalizeMocapFrames(worldFrames, nodes.length, hipsJointIndex);
  const cleanName = fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Custom BVH';

  return {
    name: cleanName,
    fps: effectiveFps,
    frameCount: normalizedFrames.length,
    jointNames,
    bones,
    frames: normalizedFrames,
    headJointIndex,
    hipsJointIndex,
  };
}

export function parseJsonMocap(content: string, fileName: string): MocapClipData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('Invalid JSON motion capture file.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON mocap file must be an object containing frames and bones.');
  }

  const obj = parsed as Record<string, unknown>;
  if (!Array.isArray(obj.frames) || obj.frames.length === 0) {
    throw new Error('JSON mocap file requires a non-empty "frames" array.');
  }

  const rawFrames: number[][] = [];
  for (const frame of obj.frames) {
    if (!Array.isArray(frame)) continue;
    if (typeof frame[0] === 'number') {
      rawFrames.push((frame as number[]).map((v) => (Number.isFinite(v) ? v : 0)));
    } else if (Array.isArray(frame[0])) {
      const flat: number[] = [];
      for (const pt of frame as number[][]) {
        flat.push(
          Number.isFinite(pt?.[0]) ? pt[0] : 0,
          Number.isFinite(pt?.[1]) ? pt[1] : 0,
          Number.isFinite(pt?.[2]) ? pt[2] : 0
        );
      }
      rawFrames.push(flat);
    }
  }

  if (rawFrames.length === 0 || rawFrames[0].length < 9) {
    throw new Error('JSON mocap frames must contain at least 3 3D joints per frame.');
  }

  const jointCount = Math.floor(rawFrames[0].length / 3);
  const jointNames = Array.isArray(obj.jointNames)
    ? obj.jointNames.slice(0, jointCount).map((n, idx) => String(n || `Joint_${idx}`))
    : Array.from({ length: jointCount }, (_, idx) => `Joint_${idx}`);

  const bones: Array<[number, number]> = Array.isArray(obj.bones)
    ? (obj.bones as unknown[])
        .filter(
          (b): b is [number, number] =>
            Array.isArray(b) &&
            b.length >= 2 &&
            typeof b[0] === 'number' &&
            typeof b[1] === 'number' &&
            b[0] >= 0 &&
            b[1] >= 0 &&
            b[0] < jointCount &&
            b[1] < jointCount
        )
        .map(([a, b]) => [a, b])
    : Array.from({ length: Math.max(0, jointCount - 1) }, (_, idx) => [idx, idx + 1]);

  const fps =
    typeof obj.fps === 'number' && Number.isFinite(obj.fps) && obj.fps >= 5 && obj.fps <= 120
      ? obj.fps
      : 30;
  const hipsJointIndex = findJointIndexByPattern(jointNames, [/hips?/i, /pelvis/i, /root/i], 0);
  const headJointIndex = findJointIndexByPattern(
    jointNames,
    [/^head$/i, /head/i, /neck/i],
    Math.min(4, jointCount - 1)
  );

  const normalizedFrames = normalizeMocapFrames(rawFrames, jointCount, hipsJointIndex);
  const cleanName =
    typeof obj.name === 'string' && obj.name.trim()
      ? obj.name.trim()
      : fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Custom Mocap';

  return {
    name: cleanName,
    fps,
    frameCount: normalizedFrames.length,
    jointNames,
    bones,
    frames: normalizedFrames,
    headJointIndex,
    hipsJointIndex,
  };
}

export function parseMocapFile(content: string, fileName: string): MocapClipData {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json') || content.trimStart().startsWith('{')) {
    return parseJsonMocap(content, fileName);
  }
  return parseBvhMocap(content, fileName);
}
