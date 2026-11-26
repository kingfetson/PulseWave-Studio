export interface DjVinylScratchOptions {
  ctx: AudioContext;
  buffer: AudioBuffer;
  destination: AudioNode;
  initialTimeSec: number;
  normalPlaybackRate: number;
  wasPlaying: boolean;
  slipMode: boolean;
  loopStartSec?: number | null;
  loopEndSec?: number | null;
  onPositionUpdate?: (timeSec: number, velocityRate: number) => void;
  onCoastComplete?: (finalTimeSec: number, resumeNormalPlay: boolean) => void;
}

export interface DjVinylScratchSession {
  setScratchVelocity: (rate: number) => void;
  nudgePositionAndVelocity: (deltaSec: number, velocityRate: number) => void;
  holdPlatter: () => void;
  triggerBackspin: (spinRate?: number) => void;
  release: () => void;
  updateLiveParams: (normalRate: number, slipMode: boolean) => void;
  getTimeSec: () => number;
  getVelocityRate: () => number;
  dispose: () => void;
}

function cubicInterpolate(y0: number, y1: number, y2: number, y3: number, mu: number): number {
  const mu2 = mu * mu;
  const a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
  const a1 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const a2 = -0.5 * y0 + 0.5 * y2;
  const a3 = y1;
  return a0 * mu * mu2 + a1 * mu2 + a2 * mu + a3;
}

export function createDjVinylScratchSession(
  options: DjVinylScratchOptions
): DjVinylScratchSession {
  const { ctx, buffer, destination } = options;
  const ch0 = buffer.getChannelData(0);
  const ch1 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : ch0;
  const totalSamples = Math.max(0, ch0.length);
  const bufSr = Math.max(8000, buffer.sampleRate || 44100);
  const ctxSr = Math.max(8000, ctx.sampleRate || 44100);
  const srRatio = bufSr / ctxSr;

  let normalRate = Math.max(0.5, Math.min(2.0, options.normalPlaybackRate || 1));
  let slipMode = options.slipMode;
  let wasPlaying = options.wasPlaying;
  let disposed = false;
  let completed = false;

  const loopStart =
    options.loopStartSec !== undefined &&
    options.loopStartSec !== null &&
    options.loopEndSec !== undefined &&
    options.loopEndSec !== null &&
    options.loopEndSec > options.loopStartSec + 0.05
      ? Math.max(0, options.loopStartSec) * bufSr
      : null;
  const loopEnd =
    loopStart !== null && options.loopEndSec !== undefined && options.loopEndSec !== null
      ? Math.min(totalSamples - 2, options.loopEndSec * bufSr)
      : null;

  let samplePos = Math.max(
    0,
    Math.min(Math.max(0, totalSamples - 2), options.initialTimeSec * bufSr)
  );
  let currentRate = wasPlaying ? normalRate : 0;
  let targetRate = 0;
  let phase: 'holding' | 'scratching' | 'coasting' = 'holding';
  let lastMovePerfMs = performance.now();
  const startedAtPerfMs = performance.now();
  const initialTimeSec = options.initialTimeSec;
  let coastTicks = 0;
  let fadeInGain = 0;

  // Low-pass / vinyl warmth filter state so rapid high-speed scrubs stay analog-smooth
  let lpL = 0;
  let lpR = 0;

  const bufferSize = 512;
  const processor = ctx.createScriptProcessor(bufferSize, 0, 2);
  const gainNode = ctx.createGain();
  gainNode.gain.value = 1;

  processor.onaudioprocess = (ev) => {
    const outL = ev.outputBuffer.getChannelData(0);
    const outR = ev.outputBuffer.getChannelData(1);

    if (disposed || totalSamples < 4) {
      outL.fill(0);
      outR.fill(0);
      return;
    }

    const nowMs = performance.now();

    // If user paused pointer motion while holding the waveform, friction stops the vinyl cleanly
    if (phase === 'scratching' && nowMs - lastMovePerfMs > 48) {
      targetRate *= 0.58;
      if (Math.abs(targetRate) < 0.03) {
        targetRate = 0;
        phase = 'holding';
      }
    } else if (phase === 'holding') {
      targetRate = 0;
    } else if (phase === 'coasting') {
      coastTicks += 1;
      targetRate = wasPlaying ? normalRate : 0;
    }

    // Per-sample smoothing rate: snappy while hand is on vinyl, motor torque / friction while coasting
    const smoothCoeff =
      phase === 'coasting'
        ? wasPlaying
          ? 0.00052
          : 0.00042
        : 0.016;

    for (let i = 0; i < outL.length; i++) {
      currentRate += (targetRate - currentRate) * smoothCoeff;

      if (fadeInGain < 1) {
        fadeInGain = Math.min(1, fadeInGain + 1 / 256);
      }

      const absRate = Math.abs(currentRate);
      // Soft needle friction mute when platter is essentially stopped
      const velocityEnv = absRate < 0.055 ? Math.pow(absRate / 0.055, 0.75) : 1;

      if (absRate < 0.003) {
        outL[i] = 0;
        outR[i] = 0;
        continue;
      }

      samplePos += currentRate * srRatio;

      // Wrap inside deck beat-loop if enabled & playing forward, otherwise clamp smoothly
      if (loopStart !== null && loopEnd !== null && loopEnd > loopStart + 32) {
        if (samplePos >= loopEnd) {
          const span = loopEnd - loopStart;
          samplePos = loopStart + ((samplePos - loopStart) % span);
        } else if (samplePos < loopStart && currentRate < 0 && phase === 'coasting' && wasPlaying) {
          samplePos = loopStart;
        }
      }

      if (samplePos < 1) {
        samplePos = 1;
        if (currentRate < 0) currentRate *= 0.7;
      } else if (samplePos > totalSamples - 3) {
        samplePos = totalSamples - 3;
        if (currentRate > 0) currentRate *= 0.7;
      }

      const idx1 = Math.floor(samplePos);
      const mu = samplePos - idx1;
      const idx0 = Math.max(0, idx1 - 1);
      const idx2 = Math.min(totalSamples - 1, idx1 + 1);
      const idx3 = Math.min(totalSamples - 1, idx1 + 2);

      const rawL = cubicInterpolate(ch0[idx0], ch0[idx1], ch0[idx2], ch0[idx3], mu);
      const rawR = cubicInterpolate(ch1[idx0], ch1[idx1], ch1[idx2], ch1[idx3], mu);

      // Gentle analog vinyl warmth filter at fast forward/reverse speeds (>1.6x) to soften aliasing
      const cutoffAlpha = absRate > 1.5 ? Math.max(0.32, 1 - (absRate - 1.5) * 0.16) : 0.94;
      lpL += cutoffAlpha * (rawL - lpL);
      lpR += cutoffAlpha * (rawR - lpR);

      const env = fadeInGain * velocityEnv;
      outL[i] = lpL * env;
      outR[i] = lpR * env;
    }

    const currentTimeSec = samplePos / bufSr;
    options.onPositionUpdate?.(currentTimeSec, currentRate);

    if (phase === 'coasting' && !completed) {
      const donePlayingSpinUp =
        wasPlaying && Math.abs(currentRate - normalRate) < 0.03 && coastTicks >= 3;
      const donePausedFriction =
        !wasPlaying && Math.abs(currentRate) < 0.03 && coastTicks >= 3;
      const hitBoundaryWhileCoasting =
        !wasPlaying && (samplePos <= 2 || samplePos >= totalSamples - 4) && Math.abs(currentRate) < 0.15;

      if (donePlayingSpinUp || donePausedFriction || hitBoundaryWhileCoasting || coastTicks > 110) {
        completed = true;
        let finalTime = currentTimeSec;
        if (slipMode && wasPlaying) {
          const slipSec =
            initialTimeSec + ((performance.now() - startedAtPerfMs) / 1000) * normalRate;
          if (
            options.loopStartSec !== undefined &&
            options.loopStartSec !== null &&
            options.loopEndSec !== undefined &&
            options.loopEndSec !== null &&
            options.loopEndSec > options.loopStartSec + 0.05
          ) {
            const loopSpan = options.loopEndSec - options.loopStartSec;
            finalTime =
              options.loopStartSec +
              ((((slipSec - options.loopStartSec) % loopSpan) + loopSpan) % loopSpan);
          } else {
            finalTime = Math.max(0, Math.min(buffer.duration - 0.05, slipSec));
          }
        }
        options.onCoastComplete?.(finalTime, wasPlaying);
      }
    }
  };

  processor.connect(gainNode);
  gainNode.connect(destination);

  return {
    setScratchVelocity(rate: number) {
      if (disposed || completed) return;
      phase = 'scratching';
      lastMovePerfMs = performance.now();
      const clamped = Math.max(-4.2, Math.min(4.2, rate));
      targetRate = targetRate * 0.25 + clamped * 0.75;
    },
    nudgePositionAndVelocity(deltaSec: number, velocityRate: number) {
      if (disposed || completed) return;
      phase = 'scratching';
      lastMovePerfMs = performance.now();
      const clamped = Math.max(-4.2, Math.min(4.2, velocityRate));
      targetRate = targetRate * 0.28 + clamped * 0.72;
      // Nudge samplePos slightly toward pointer displacement so visual cursor & groove stay locked
      const maxPull = 0.045 * bufSr;
      const pull = Math.max(-maxPull, Math.min(maxPull, deltaSec * bufSr * 0.35));
      samplePos = Math.max(1, Math.min(totalSamples - 3, samplePos + pull));
    },
    holdPlatter() {
      if (disposed || completed) return;
      phase = 'holding';
      targetRate = 0;
      lastMovePerfMs = performance.now();
    },
    triggerBackspin(spinRate = -3.8) {
      if (disposed || completed) return;
      wasPlaying = false;
      phase = 'coasting';
      coastTicks = 0;
      currentRate = Math.max(-4.5, Math.min(-0.8, spinRate));
      targetRate = 0;
    },
    release() {
      if (disposed || completed) return;
      phase = 'coasting';
      coastTicks = 0;
      targetRate = wasPlaying ? normalRate : 0;
    },
    updateLiveParams(nextRate: number, nextSlip: boolean) {
      normalRate = Math.max(0.5, Math.min(2.0, nextRate || 1));
      slipMode = nextSlip;
    },
    getTimeSec() {
      return samplePos / bufSr;
    },
    getVelocityRate() {
      return currentRate;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      completed = true;
      try {
        processor.onaudioprocess = null;
        processor.disconnect();
        gainNode.disconnect();
      } catch {
        // ignore disconnected nodes
      }
    },
  };
}
