export type TransientFocusMode = 'full' | 'drums';

export interface TransientShaperParams {
  attack: number; // -1 to +1
  sustain: number; // -1 to +1
  dither?: number; // 0 to 1 TPDF high-pass dither amount
  focus?: TransientFocusMode;
  bypassed?: boolean;
}

export interface TransientShaperMeterSnapshot {
  attackDb: number;
  sustainDb: number;
  active: boolean;
}

export interface LiveTransientShaperNode {
  input: GainNode;
  output: GainNode;
  setParams: (params: TransientShaperParams) => void;
  getMeterSnapshot: () => TransientShaperMeterSnapshot;
  dispose: () => void;
}

const WORKLET_PROCESSOR_NAME = 'dj-transient-shaper-v1';

// Self-contained AudioWorklet DSP module using stereo-linked differential envelopes
// (SPL Transient Designer topology: fast vs slow followers isolate drum attack vs sustain tail).
const WORKLET_SOURCE = `
class DjTransientShaperProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.attack = 0;
    this.sustain = 0;
    this.dither = 0;
    this.focusDrums = false;
    this.bypassed = false;

    this.fastEnv = 0;
    this.slowEnv = 0;
    this.smoothGain = 1;
    this.hpPrevInL = 0;
    this.hpPrevOutL = 0;
    this.hpPrevInR = 0;
    this.hpPrevOutR = 0;
    this.rngStateL = 0x9e3779b9;
    this.rngStateR = 0x85ebca6b;
    this.prevTpdfL = 0;
    this.prevTpdfR = 0;

    this.meterCounter = 0;
    this.peakAttDb = 0;
    this.peakSusDb = 0;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || data.type !== 'params') return;
      if (typeof data.attack === 'number') this.attack = Math.max(-1, Math.min(1, data.attack));
      if (typeof data.sustain === 'number') this.sustain = Math.max(-1, Math.min(1, data.sustain));
      if (typeof data.dither === 'number') this.dither = Math.max(0, Math.min(1, data.dither));
      this.focusDrums = data.focus === 'drums';
      this.bypassed = Boolean(data.bypassed);
    };
  }

  _nextUniformL() {
    let x = this.rngStateL | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngStateL = x;
    return ((x >>> 0) / 4294967296);
  }

  _nextUniformR() {
    let x = this.rngStateR | 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rngStateR = x;
    return ((x >>> 0) / 4294967296);
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const outL = output[0];
    const outR = output[1] || output[0];
    if (!input || input.length === 0) {
      outL.fill(0);
      if (output[1]) outR.fill(0);
      return true;
    }

    const inL = input[0];
    const inR = input[1] || input[0];
    const len = outL.length;

    const hasShaping = Math.abs(this.attack) >= 0.005 || Math.abs(this.sustain) >= 0.005;
    const hasDither = this.dither >= 0.005;
    const isFlat = this.bypassed || (!hasShaping && !hasDither);

    if (isFlat) {
      for (let i = 0; i < len; i++) {
        outL[i] = inL[i];
        if (output[1]) outR[i] = inR[i];
      }
      this.fastEnv *= 0.9;
      this.slowEnv *= 0.9;
      this.smoothGain += (1 - this.smoothGain) * 0.15;
      this.meterCounter += len;
      if (this.meterCounter >= 2048) {
        this.meterCounter = 0;
        this.port.postMessage({ attackDb: 0, sustainDb: 0, active: false });
      }
      return true;
    }

    const ditherAmp = hasDither ? 1.5e-6 * Math.pow(64, this.dither) : 0;

    if (!hasShaping && hasDither) {
      for (let i = 0; i < len; i++) {
        const tpdfL = this._nextUniformL() - this._nextUniformL();
        const hpL = (tpdfL - this.prevTpdfL) * 0.5;
        this.prevTpdfL = tpdfL;
        outL[i] = inL[i] + hpL * ditherAmp;
        if (output[1]) {
          const tpdfR = this._nextUniformR() - this._nextUniformR();
          const hpR = (tpdfR - this.prevTpdfR) * 0.5;
          this.prevTpdfR = tpdfR;
          outR[i] = inR[i] + hpR * ditherAmp;
        }
      }
      this.meterCounter += len;
      if (this.meterCounter >= 2048) {
        this.meterCounter = 0;
        this.port.postMessage({ attackDb: 0, sustainDb: 0, active: false });
      }
      return true;
    }

    const sr = sampleRate || 44100;
    const hpCutHz = this.focusDrums ? 95 : 38;
    const hpCoeff = Math.exp((-2 * Math.PI * hpCutHz) / sr);

    const fastAttackCoeff = 1 - Math.exp(-1 / (0.0012 * sr));
    const fastReleaseCoeff = 1 - Math.exp(-1 / (0.024 * sr));
    const slowAttackCoeff = 1 - Math.exp(-1 / (0.032 * sr));
    const slowReleaseCoeff = 1 - Math.exp(-1 / (0.185 * sr));
    const gainSmoothCoeff = 1 - Math.exp(-1 / (0.0025 * sr));

    let localAttDb = 0;
    let localSusDb = 0;

    for (let i = 0; i < len; i++) {
      const l = inL[i];
      const r = inR[i];

      const hpL = hpCoeff * (this.hpPrevOutL + l - this.hpPrevInL);
      this.hpPrevInL = l;
      this.hpPrevOutL = hpL;

      const hpR = hpCoeff * (this.hpPrevOutR + r - this.hpPrevInR);
      this.hpPrevInR = r;
      this.hpPrevOutR = hpR;

      const det = Math.max(Math.abs(hpL), Math.abs(hpR));

      this.fastEnv +=
        (det - this.fastEnv) * (det > this.fastEnv ? fastAttackCoeff : fastReleaseCoeff);
      this.slowEnv +=
        (det - this.slowEnv) * (det > this.slowEnv ? slowAttackCoeff : slowReleaseCoeff);

      const attDelta = Math.min(1.5, Math.max(0, this.fastEnv - this.slowEnv) / (this.slowEnv + 0.022));
      const susDelta = Math.min(1.2, Math.max(0, this.slowEnv - this.fastEnv * 0.85) / (this.slowEnv + 0.028));

      const attGain =
        this.attack >= 0
          ? 1 + this.attack * attDelta * 1.45
          : 1 / (1 + -this.attack * attDelta * 2.4);

      const susGain =
        this.sustain >= 0
          ? 1 + this.sustain * susDelta * 1.35
          : 1 / (1 + -this.sustain * susDelta * 2.9);

      const targetGain = Math.max(0.12, Math.min(2.8, attGain * susGain));
      this.smoothGain += (targetGain - this.smoothGain) * gainSmoothCoeff;

      const attDb = 20 * Math.log10(Math.max(0.1, attGain));
      const susDb = 20 * Math.log10(Math.max(0.1, susGain));
      if (Math.abs(attDb) > Math.abs(localAttDb)) localAttDb = attDb;
      if (Math.abs(susDb) > Math.abs(localSusDb)) localSusDb = susDb;

      let sL = l * this.smoothGain;
      let sR = r * this.smoothGain;

      // Soft musical ceiling guard above unity so +100% attack snaps don't digitally clip
      if (Math.abs(sL) > 0.96) {
        const excess = Math.abs(sL) - 0.96;
        sL = Math.sign(sL) * (0.96 + 0.28 * Math.tanh(excess / 0.28));
      }
      if (Math.abs(sR) > 0.96) {
        const excess = Math.abs(sR) - 0.96;
        sR = Math.sign(sR) * (0.96 + 0.28 * Math.tanh(excess / 0.28));
      }

      if (ditherAmp > 0) {
        const tpdfL = this._nextUniformL() - this._nextUniformL();
        const hpNoiseL = (tpdfL - this.prevTpdfL) * 0.5;
        this.prevTpdfL = tpdfL;
        sL += hpNoiseL * ditherAmp;

        const tpdfR = this._nextUniformR() - this._nextUniformR();
        const hpNoiseR = (tpdfR - this.prevTpdfR) * 0.5;
        this.prevTpdfR = tpdfR;
        sR += hpNoiseR * ditherAmp;
      }

      outL[i] = sL;
      if (output[1]) outR[i] = sR;
    }

    if (Math.abs(localAttDb) > Math.abs(this.peakAttDb)) {
      this.peakAttDb = localAttDb;
    } else {
      this.peakAttDb *= 0.85;
    }
    if (Math.abs(localSusDb) > Math.abs(this.peakSusDb)) {
      this.peakSusDb = localSusDb;
    } else {
      this.peakSusDb *= 0.85;
    }

    this.meterCounter += len;
    if (this.meterCounter >= 2048) {
      this.meterCounter = 0;
      this.port.postMessage({
        attackDb: this.peakAttDb,
        sustainDb: this.peakSusDb,
        active: true,
      });
    }

    return true;
  }
}

registerProcessor('${WORKLET_PROCESSOR_NAME}', DjTransientShaperProcessor);
`;

const registeredContexts = new WeakSet<AudioContext>();

export function createLiveTransientShaper(ctx: AudioContext): LiveTransientShaperNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const passthrough = ctx.createGain();
  passthrough.gain.value = 1;

  // Connect passthrough immediately so audio flows on frame 0 without latency.
  input.connect(passthrough);
  passthrough.connect(output);

  let disposed = false;
  let currentParams: Required<TransientShaperParams> = {
    attack: 0,
    sustain: 0,
    dither: 0,
    focus: 'full',
    bypassed: false,
  };
  let meterSnapshot: TransientShaperMeterSnapshot = {
    attackDb: 0,
    sustainDb: 0,
    active: false,
  };

  let workletNode: AudioWorkletNode | null = null;
  let scriptNode: ScriptProcessorNode | null = null;

  const setupScriptFallback = () => {
    if (disposed || workletNode || scriptNode) return;
    if (typeof ctx.createScriptProcessor !== 'function') return;

    const proc = ctx.createScriptProcessor(1024, 2, 2);
    let fastEnv = 0;
    let slowEnv = 0;
    let smoothGain = 1;
    let hpPrevInL = 0;
    let hpPrevOutL = 0;
    let hpPrevInR = 0;
    let hpPrevOutR = 0;
    let rngStateL = 0x9e3779b9 | 0;
    let rngStateR = 0x85ebca6b | 0;
    let prevTpdfL = 0;
    let prevTpdfR = 0;

    const nextUniformL = () => {
      rngStateL ^= rngStateL << 13;
      rngStateL ^= rngStateL >>> 17;
      rngStateL ^= rngStateL << 5;
      return (rngStateL >>> 0) / 4294967296;
    };
    const nextUniformR = () => {
      rngStateR ^= rngStateR << 13;
      rngStateR ^= rngStateR >>> 17;
      rngStateR ^= rngStateR << 5;
      return (rngStateR >>> 0) / 4294967296;
    };

    proc.onaudioprocess = (event) => {
      const inBuf = event.inputBuffer;
      const outBuf = event.outputBuffer;
      const inL = inBuf.getChannelData(0);
      const inR = inBuf.numberOfChannels > 1 ? inBuf.getChannelData(1) : inL;
      const outL = outBuf.getChannelData(0);
      const outR = outBuf.numberOfChannels > 1 ? outBuf.getChannelData(1) : outL;
      const len = outL.length;

      const { attack, sustain, dither, focus, bypassed } = currentParams;
      const hasShaping = Math.abs(attack) >= 0.005 || Math.abs(sustain) >= 0.005;
      const hasDither = dither >= 0.005;
      if (bypassed || (!hasShaping && !hasDither)) {
        outL.set(inL);
        if (outR !== outL) outR.set(inR);
        fastEnv *= 0.9;
        slowEnv *= 0.9;
        smoothGain += (1 - smoothGain) * 0.2;
        meterSnapshot = { attackDb: 0, sustainDb: 0, active: false };
        return;
      }

      const ditherAmp = hasDither ? 1.5e-6 * Math.pow(64, dither) : 0;
      if (!hasShaping && hasDither) {
        for (let i = 0; i < len; i++) {
          const tpdfL = nextUniformL() - nextUniformL();
          const hpNoiseL = (tpdfL - prevTpdfL) * 0.5;
          prevTpdfL = tpdfL;
          outL[i] = inL[i] + hpNoiseL * ditherAmp;
          if (outR !== outL) {
            const tpdfR = nextUniformR() - nextUniformR();
            const hpNoiseR = (tpdfR - prevTpdfR) * 0.5;
            prevTpdfR = tpdfR;
            outR[i] = inR[i] + hpNoiseR * ditherAmp;
          }
        }
        meterSnapshot = { attackDb: 0, sustainDb: 0, active: false };
        return;
      }

      const sr = inBuf.sampleRate || ctx.sampleRate || 44100;
      const hpCutHz = focus === 'drums' ? 95 : 38;
      const hpCoeff = Math.exp((-2 * Math.PI * hpCutHz) / sr);

      const fastAttackCoeff = 1 - Math.exp(-1 / (0.0012 * sr));
      const fastReleaseCoeff = 1 - Math.exp(-1 / (0.024 * sr));
      const slowAttackCoeff = 1 - Math.exp(-1 / (0.032 * sr));
      const slowReleaseCoeff = 1 - Math.exp(-1 / (0.185 * sr));
      const gainSmoothCoeff = 1 - Math.exp(-1 / (0.0025 * sr));

      let localAttDb = 0;
      let localSusDb = 0;

      for (let i = 0; i < len; i++) {
        const l = inL[i];
        const r = inR[i];

        const hpL = hpCoeff * (hpPrevOutL + l - hpPrevInL);
        hpPrevInL = l;
        hpPrevOutL = hpL;

        const hpR = hpCoeff * (hpPrevOutR + r - hpPrevInR);
        hpPrevInR = r;
        hpPrevOutR = hpR;

        const det = Math.max(Math.abs(hpL), Math.abs(hpR));
        fastEnv += (det - fastEnv) * (det > fastEnv ? fastAttackCoeff : fastReleaseCoeff);
        slowEnv += (det - slowEnv) * (det > slowEnv ? slowAttackCoeff : slowReleaseCoeff);

        const attDelta = Math.min(1.5, Math.max(0, fastEnv - slowEnv) / (slowEnv + 0.022));
        const susDelta = Math.min(1.2, Math.max(0, slowEnv - fastEnv * 0.85) / (slowEnv + 0.028));

        const attGain =
          attack >= 0 ? 1 + attack * attDelta * 1.45 : 1 / (1 + -attack * attDelta * 2.4);
        const susGain =
          sustain >= 0 ? 1 + sustain * susDelta * 1.35 : 1 / (1 + -sustain * susDelta * 2.9);

        const targetGain = Math.max(0.12, Math.min(2.8, attGain * susGain));
        smoothGain += (targetGain - smoothGain) * gainSmoothCoeff;

        const attDb = 20 * Math.log10(Math.max(0.1, attGain));
        const susDb = 20 * Math.log10(Math.max(0.1, susGain));
        if (Math.abs(attDb) > Math.abs(localAttDb)) localAttDb = attDb;
        if (Math.abs(susDb) > Math.abs(localSusDb)) localSusDb = susDb;

        let sL = l * smoothGain;
        let sR = r * smoothGain;
        if (Math.abs(sL) > 0.96) {
          const excess = Math.abs(sL) - 0.96;
          sL = Math.sign(sL) * (0.96 + 0.28 * Math.tanh(excess / 0.28));
        }
        if (Math.abs(sR) > 0.96) {
          const excess = Math.abs(sR) - 0.96;
          sR = Math.sign(sR) * (0.96 + 0.28 * Math.tanh(excess / 0.28));
        }
        if (ditherAmp > 0) {
          const tpdfL = nextUniformL() - nextUniformL();
          const hpNoiseL = (tpdfL - prevTpdfL) * 0.5;
          prevTpdfL = tpdfL;
          sL += hpNoiseL * ditherAmp;

          const tpdfR = nextUniformR() - nextUniformR();
          const hpNoiseR = (tpdfR - prevTpdfR) * 0.5;
          prevTpdfR = tpdfR;
          sR += hpNoiseR * ditherAmp;
        }
        outL[i] = sL;
        if (outR !== outL) outR[i] = sR;
      }

      meterSnapshot = {
        attackDb:
          Math.abs(localAttDb) > Math.abs(meterSnapshot.attackDb)
            ? localAttDb
            : meterSnapshot.attackDb * 0.78 + localAttDb * 0.22,
        sustainDb:
          Math.abs(localSusDb) > Math.abs(meterSnapshot.sustainDb)
            ? localSusDb
            : meterSnapshot.sustainDb * 0.78 + localSusDb * 0.22,
        active: true,
      };
    };

    try {
      input.disconnect(passthrough);
      passthrough.disconnect();
    } catch {
      // Ignore if already disconnected
    }
    input.connect(proc);
    proc.connect(output);
    scriptNode = proc;
  };

  const initWorklet = async () => {
    if (
      typeof AudioWorkletNode === 'undefined' ||
      !ctx.audioWorklet ||
      typeof ctx.audioWorklet.addModule !== 'function'
    ) {
      setupScriptFallback();
      return;
    }

    let blobUrl: string | null = null;
    try {
      if (!registeredContexts.has(ctx)) {
        const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
        blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);
        registeredContexts.add(ctx);
      }

      if (disposed) return;

      const node = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      node.port.onmessage = (event) => {
        const d = event.data;
        if (!d || typeof d.attackDb !== 'number') return;
        meterSnapshot = {
          attackDb: d.attackDb,
          sustainDb: d.sustainDb ?? 0,
          active: Boolean(d.active),
        };
      };

      node.port.postMessage({ type: 'params', ...currentParams });

      try {
        input.disconnect(passthrough);
        passthrough.disconnect();
      } catch {
        // Ignore disconnect error
      }

      input.connect(node);
      node.connect(output);
      workletNode = node;
    } catch {
      setupScriptFallback();
    } finally {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    }
  };

  void initWorklet();

  return {
    input,
    output,
    setParams: (params: TransientShaperParams) => {
      currentParams = {
        attack: Math.max(-1, Math.min(1, params.attack)),
        sustain: Math.max(-1, Math.min(1, params.sustain)),
        dither: Math.max(0, Math.min(1, params.dither ?? 0)),
        focus: params.focus ?? 'full',
        bypassed: Boolean(params.bypassed),
      };
      if (workletNode) {
        workletNode.port.postMessage({ type: 'params', ...currentParams });
      }
    },
    getMeterSnapshot: () => meterSnapshot,
    dispose: () => {
      disposed = true;
      try {
        input.disconnect();
        passthrough.disconnect();
        if (workletNode) {
          workletNode.port.onmessage = null;
          workletNode.disconnect();
        }
        if (scriptNode) {
          scriptNode.onaudioprocess = null;
          scriptNode.disconnect();
        }
      } catch {
        // Ignore cleanup errors
      }
    },
  };
}

/**
 * Generates normalized (x: 0..1, y: 0..1) curve samples representing an idealized
 * kick/snare hit before vs after transient shaping for the interactive UI curve display.
 */
export function buildTransientEnvelopeCurvePoints(
  attack: number,
  sustain: number,
  sampleCount = 64
): {
  dryPoints: Array<{ x: number; y: number }>;
  shapedPoints: Array<{ x: number; y: number }>;
} {
  const dryPoints: Array<{ x: number; y: number }> = [];
  const shapedPoints: Array<{ x: number; y: number }> = [];
  const clampedAtt = Math.max(-1, Math.min(1, attack));
  const clampedSus = Math.max(-1, Math.min(1, sustain));

  for (let i = 0; i < sampleCount; i++) {
    const t = i / (sampleCount - 1);
    // Idealized percussive hit: crisp 10ms rise peaking at t ≈ 0.14, exponential body tail
    const rise = t < 0.14 ? Math.pow(t / 0.14, 1.35) : 1;
    const transientComponent = t >= 0.14 ? Math.exp(-(t - 0.14) * 15) : rise;
    const sustainComponent =
      t >= 0.14 ? Math.exp(-(t - 0.14) * 3.1) * (1 - Math.exp(-(t - 0.14) * 14)) : 0;

    const dry = Math.min(1, transientComponent * 0.72 + sustainComponent * 0.56);

    const attScale = clampedAtt >= 0 ? 1 + clampedAtt * 0.68 : 1 / (1 + -clampedAtt * 1.6);
    const susScale = clampedSus >= 0 ? 1 + clampedSus * 0.85 : 1 / (1 + -clampedSus * 2.1);

    const shaped = Math.min(
      1.18,
      Math.max(0, transientComponent * 0.72 * attScale + sustainComponent * 0.56 * susScale)
    );

    dryPoints.push({ x: t, y: dry });
    shapedPoints.push({ x: t, y: shaped });
  }

  return { dryPoints, shapedPoints };
}

export function formatTransientDitherReadout(dither: number): string {
  const clamped = Math.max(0, Math.min(1, dither));
  if (clamped < 0.005) return 'Off';
  const amp = 1.5e-6 * Math.pow(64, clamped);
  const floorDb = Math.round(20 * Math.log10(amp));
  return `${Math.round(clamped * 100)}% (${floorDb} dBFS)`;
}
