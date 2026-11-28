export interface NoiseGateParams {
  thresholdDb: number; // -80 (Off) to -18 dBFS
  bypassed?: boolean;
}

export interface NoiseGateMeterSnapshot {
  isOpen: boolean;
  active: boolean;
  inputDb: number;
  reductionDb: number;
}

export interface LiveNoiseGateNode {
  input: GainNode;
  output: GainNode;
  setParams: (params: NoiseGateParams) => void;
  getMeterSnapshot: () => NoiseGateMeterSnapshot;
  dispose: () => void;
}

const WORKLET_PROCESSOR_NAME = 'dj-noise-gate-v1';

const WORKLET_SOURCE = `
class DjNoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.thresholdDb = -80;
    this.bypassed = false;
    this.env = 0;
    this.gateGain = 1;
    this.holdSamplesLeft = 0;
    this.isOpen = true;
    this.meterCounter = 0;
    this.peakInputDb = -80;
    this.minGain = 1;

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data || data.type !== 'params') return;
      if (typeof data.thresholdDb === 'number') {
        this.thresholdDb = Math.max(-80, Math.min(-18, data.thresholdDb));
      }
      this.bypassed = Boolean(data.bypassed);
    };
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

    const gateOff = this.bypassed || this.thresholdDb <= -79;
    if (gateOff) {
      for (let i = 0; i < len; i++) {
        outL[i] = inL[i];
        if (output[1]) outR[i] = inR[i];
      }
      this.gateGain += (1 - this.gateGain) * 0.2;
      this.isOpen = true;
      this.meterCounter += len;
      if (this.meterCounter >= 2048) {
        this.meterCounter = 0;
        this.port.postMessage({
          isOpen: true,
          active: false,
          inputDb: -80,
          reductionDb: 0,
        });
      }
      return true;
    }

    const sr = sampleRate || 44100;
    const envAttackCoeff = 1 - Math.exp(-1 / (0.0015 * sr));
    const envReleaseCoeff = 1 - Math.exp(-1 / (0.085 * sr));
    const gainOpenCoeff = 1 - Math.exp(-1 / (0.0022 * sr));
    const gainCloseCoeff = 1 - Math.exp(-1 / (0.125 * sr));
    const holdSamplesTotal = Math.round(0.075 * sr);

    const openThreshDb = this.thresholdDb;
    const closeThreshDb = this.thresholdDb - 3.5;

    let localMaxEnv = 0;
    let localMinGain = 1;

    for (let i = 0; i < len; i++) {
      const l = inL[i];
      const r = inR[i];
      const det = Math.max(Math.abs(l), Math.abs(r));

      this.env += (det - this.env) * (det > this.env ? envAttackCoeff : envReleaseCoeff);
      if (this.env > localMaxEnv) localMaxEnv = this.env;

      const envDb = 20 * Math.log10(this.env + 1e-7);

      if (envDb >= openThreshDb) {
        this.isOpen = true;
        this.holdSamplesLeft = holdSamplesTotal;
      } else if (this.isOpen) {
        if (envDb >= closeThreshDb) {
          this.holdSamplesLeft = holdSamplesTotal;
        } else if (this.holdSamplesLeft > 0) {
          this.holdSamplesLeft--;
        } else {
          this.isOpen = false;
        }
      }

      const targetGain = this.isOpen ? 1 : 0.0001;
      const coeff = targetGain > this.gateGain ? gainOpenCoeff : gainCloseCoeff;
      this.gateGain += (targetGain - this.gateGain) * coeff;
      if (this.gateGain < localMinGain) localMinGain = this.gateGain;

      outL[i] = l * this.gateGain;
      if (output[1]) outR[i] = r * this.gateGain;
    }

    const curInDb = 20 * Math.log10(localMaxEnv + 1e-7);
    this.peakInputDb = this.peakInputDb * 0.55 + curInDb * 0.45;
    this.minGain = this.minGain * 0.5 + localMinGain * 0.5;

    this.meterCounter += len;
    if (this.meterCounter >= 2048) {
      this.meterCounter = 0;
      const reductionDb = Math.max(-72, Math.min(0, 20 * Math.log10(Math.max(0.0002, this.minGain))));
      this.port.postMessage({
        isOpen: this.isOpen,
        active: true,
        inputDb: this.peakInputDb,
        reductionDb,
      });
    }

    return true;
  }
}

registerProcessor('${WORKLET_PROCESSOR_NAME}', DjNoiseGateProcessor);
`;

const registeredGateContexts = new WeakSet<AudioContext>();

export function createLiveNoiseGate(ctx: AudioContext): LiveNoiseGateNode {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const passthrough = ctx.createGain();
  passthrough.gain.value = 1;

  input.connect(passthrough);
  passthrough.connect(output);

  let disposed = false;
  let currentParams: Required<NoiseGateParams> = {
    thresholdDb: -80,
    bypassed: false,
  };
  let meterSnapshot: NoiseGateMeterSnapshot = {
    isOpen: true,
    active: false,
    inputDb: -80,
    reductionDb: 0,
  };

  let workletNode: AudioWorkletNode | null = null;
  let scriptNode: ScriptProcessorNode | null = null;

  const setupScriptFallback = () => {
    if (disposed || workletNode || scriptNode) return;
    if (typeof ctx.createScriptProcessor !== 'function') return;

    const proc = ctx.createScriptProcessor(1024, 2, 2);
    let env = 0;
    let gateGain = 1;
    let holdSamplesLeft = 0;
    let isOpen = true;

    proc.onaudioprocess = (event) => {
      const inBuf = event.inputBuffer;
      const outBuf = event.outputBuffer;
      const inL = inBuf.getChannelData(0);
      const inR = inBuf.numberOfChannels > 1 ? inBuf.getChannelData(1) : inL;
      const outL = outBuf.getChannelData(0);
      const outR = outBuf.numberOfChannels > 1 ? outBuf.getChannelData(1) : outL;
      const len = outL.length;

      const { thresholdDb, bypassed } = currentParams;
      if (bypassed || thresholdDb <= -79) {
        outL.set(inL);
        if (outR !== outL) outR.set(inR);
        gateGain += (1 - gateGain) * 0.25;
        isOpen = true;
        meterSnapshot = { isOpen: true, active: false, inputDb: -80, reductionDb: 0 };
        return;
      }

      const sr = inBuf.sampleRate || ctx.sampleRate || 44100;
      const envAttackCoeff = 1 - Math.exp(-1 / (0.0015 * sr));
      const envReleaseCoeff = 1 - Math.exp(-1 / (0.085 * sr));
      const gainOpenCoeff = 1 - Math.exp(-1 / (0.0022 * sr));
      const gainCloseCoeff = 1 - Math.exp(-1 / (0.125 * sr));
      const holdSamplesTotal = Math.round(0.075 * sr);

      const openThreshDb = thresholdDb;
      const closeThreshDb = thresholdDb - 3.5;

      let localMaxEnv = 0;
      let localMinGain = 1;

      for (let i = 0; i < len; i++) {
        const l = inL[i];
        const r = inR[i];
        const det = Math.max(Math.abs(l), Math.abs(r));

        env += (det - env) * (det > env ? envAttackCoeff : envReleaseCoeff);
        if (env > localMaxEnv) localMaxEnv = env;

        const envDb = 20 * Math.log10(env + 1e-7);
        if (envDb >= openThreshDb) {
          isOpen = true;
          holdSamplesLeft = holdSamplesTotal;
        } else if (isOpen) {
          if (envDb >= closeThreshDb) {
            holdSamplesLeft = holdSamplesTotal;
          } else if (holdSamplesLeft > 0) {
            holdSamplesLeft--;
          } else {
            isOpen = false;
          }
        }

        const targetGain = isOpen ? 1 : 0.0001;
        const coeff = targetGain > gateGain ? gainOpenCoeff : gainCloseCoeff;
        gateGain += (targetGain - gateGain) * coeff;
        if (gateGain < localMinGain) localMinGain = gateGain;

        outL[i] = l * gateGain;
        if (outR !== outL) outR[i] = r * gateGain;
      }

      meterSnapshot = {
        isOpen,
        active: true,
        inputDb: 20 * Math.log10(localMaxEnv + 1e-7),
        reductionDb: Math.max(-72, Math.min(0, 20 * Math.log10(Math.max(0.0002, localMinGain)))),
      };
    };

    try {
      input.disconnect(passthrough);
      passthrough.disconnect();
    } catch {
      // Ignore if disconnected
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
      if (!registeredGateContexts.has(ctx)) {
        const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' });
        blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);
        registeredGateContexts.add(ctx);
      }

      if (disposed) return;

      const node = new AudioWorkletNode(ctx, WORKLET_PROCESSOR_NAME, {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [2],
      });

      node.port.onmessage = (event) => {
        const d = event.data;
        if (!d || typeof d.inputDb !== 'number') return;
        meterSnapshot = {
          isOpen: Boolean(d.isOpen),
          active: Boolean(d.active),
          inputDb: d.inputDb,
          reductionDb: d.reductionDb ?? 0,
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
    setParams: (params: NoiseGateParams) => {
      currentParams = {
        thresholdDb: Math.max(-80, Math.min(-18, params.thresholdDb)),
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

export function formatNoiseGateThreshold(thresholdDb: number): string {
  const rounded = Math.round(thresholdDb);
  return rounded <= -79 ? 'Off' : `${rounded} dBFS`;
}
