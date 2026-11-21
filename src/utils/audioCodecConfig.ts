export type MuxerAudioCodec = 'aac' | 'opus';

export interface ResolvedAudioConfig {
  encoderConfig: AudioEncoderConfig;
  muxerCodec: MuxerAudioCodec;
  targetSampleRate: number;
  targetChannels: number;
  codecLabel: string;
}

export interface PreparedPcmAudio {
  channels: Float32Array[];
  length: number;
  sampleRate: number;
  numberOfChannels: number;
}

const VALID_AAC_SAMPLE_RATES = new Set([
  96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000,
]);

function dedupeNumbers(values: Array<number | undefined>): Array<number | undefined> {
  const seen = new Set<number | undefined>();
  const result: Array<number | undefined> = [];
  for (const v of values) {
    if (!seen.has(v)) {
      seen.add(v);
      result.push(v);
    }
  }
  return result;
}

async function isAudioConfigUsable(config: AudioEncoderConfig): Promise<AudioEncoderConfig | null> {
  if (typeof AudioEncoder === 'undefined') return null;
  try {
    const support = await AudioEncoder.isConfigSupported(config);
    if (!support.supported) return null;
    const candidate = support.config
      ? {
          ...config,
          ...support.config,
          codec: support.config.codec || config.codec,
          sampleRate: support.config.sampleRate || config.sampleRate,
          numberOfChannels: support.config.numberOfChannels || config.numberOfChannels,
        }
      : config;

    // Verify configure() succeeds synchronously (guards against driver quirks)
    const probe = new AudioEncoder({
      output: () => {},
      error: () => {},
    });
    try {
      probe.configure(candidate);
      return candidate;
    } finally {
      try {
        if (probe.state !== 'closed') probe.close();
      } catch {
        // ignore close error
      }
    }
  } catch {
    return null;
  }
}

export async function resolveSupportedAudioConfig(
  numberOfChannels: number,
  sourceSampleRate: number,
  requestedBitrateBps: number
): Promise<ResolvedAudioConfig | null> {
  if (typeof AudioEncoder === 'undefined') return null;

  const baseChannels = Math.min(2, Math.max(1, numberOfChannels));
  const channelCandidates = baseChannels === 1 ? [1, 2] : [2, 1];
  const clampedBitrate = Math.round(
    Math.max(64_000, Math.min(320_000, requestedBitrateBps || 192_000))
  );

  // Many hardware/OS AAC encoders (e.g. Windows Media Foundation) cap AAC bitrate at 192 kbps
  // and only accept 48000 / 44100 Hz sample rates.
  const bitrateCandidates = dedupeNumbers([
    clampedBitrate,
    192_000,
    160_000,
    128_000,
    96_000,
    undefined,
  ]);

  const aacSampleRates = dedupeNumbers([
    VALID_AAC_SAMPLE_RATES.has(sourceSampleRate) ? sourceSampleRate : undefined,
    48000,
    44100,
  ]).filter((sr): sr is number => typeof sr === 'number');

  // Tier 1: AAC (mp4a.40.2 AAC-LC, then mp4a.40.5 HE-AAC)
  for (const codec of ['mp4a.40.2', 'mp4a.40.5'] as const) {
    for (const channels of channelCandidates) {
      for (const sampleRate of aacSampleRates) {
        for (const bitrate of bitrateCandidates) {
          const config: AudioEncoderConfig = {
            codec,
            numberOfChannels: channels,
            sampleRate,
            ...(bitrate !== undefined ? { bitrate } : {}),
          };
          const usable = await isAudioConfigUsable(config);
          if (usable) {
            return {
              encoderConfig: usable,
              muxerCodec: 'aac',
              targetSampleRate: usable.sampleRate,
              targetChannels: usable.numberOfChannels,
              codecLabel: 'AAC',
            };
          }
        }
      }
    }
  }

  // Tier 2: Opus in MP4 (universally supported in Linux Chromium, Chrome, Edge & Firefox)
  // MP4 Opus muxing uses 48000 Hz per ISO BMFF / RFC 7845 specification.
  const opusSampleRates = [48000, 24000, 16000];
  for (const channels of channelCandidates) {
    for (const sampleRate of opusSampleRates) {
      for (const bitrate of bitrateCandidates) {
        const config: AudioEncoderConfig = {
          codec: 'opus',
          numberOfChannels: channels,
          sampleRate,
          ...(bitrate !== undefined ? { bitrate } : {}),
        };
        const usable = await isAudioConfigUsable(config);
        if (usable) {
          return {
            encoderConfig: usable,
            muxerCodec: 'opus',
            targetSampleRate: usable.sampleRate,
            targetChannels: usable.numberOfChannels,
            codecLabel: 'Opus',
          };
        }
      }
    }
  }

  return null;
}

function resampleChannelCatmullRom(
  input: Float32Array,
  sourceSampleRate: number,
  targetSampleRate: number
): Float32Array {
  if (sourceSampleRate === targetSampleRate || input.length === 0) {
    return input;
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);
  const lastIdx = input.length - 1;

  for (let i = 0; i < outputLength; i++) {
    const srcPos = i * ratio;
    const idx = Math.floor(srcPos);
    const t = srcPos - idx;

    const p0 = input[idx > 0 ? idx - 1 : 0];
    const p1 = input[Math.min(lastIdx, idx)];
    const p2 = input[Math.min(lastIdx, idx + 1)];
    const p3 = input[Math.min(lastIdx, idx + 2)];

    const t2 = t * t;
    const t3 = t2 * t;
    const sample =
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3);

    output[i] = sample < -1 ? -1 : sample > 1 ? 1 : sample;
  }

  return output;
}

export function preparePcmChannelsForEncoder(
  sourceChannels: Float32Array[],
  sourceLength: number,
  sourceSampleRate: number,
  targetSampleRate: number,
  targetChannels: number
): PreparedPcmAudio {
  const safeSrcChannels = sourceChannels.length > 0 ? sourceChannels : [new Float32Array(sourceLength)];

  let normalizedChannels: Float32Array[];
  if (targetChannels === 1) {
    if (safeSrcChannels.length === 1) {
      normalizedChannels = [safeSrcChannels[0]];
    } else {
      const mono = new Float32Array(sourceLength);
      const ch0 = safeSrcChannels[0];
      const ch1 = safeSrcChannels[1];
      for (let i = 0; i < sourceLength; i++) {
        mono[i] = 0.5 * (ch0[i] + ch1[i]);
      }
      normalizedChannels = [mono];
    }
  } else {
    if (safeSrcChannels.length >= 2) {
      normalizedChannels = [safeSrcChannels[0], safeSrcChannels[1]];
    } else {
      normalizedChannels = [safeSrcChannels[0], safeSrcChannels[0]];
    }
  }

  if (sourceSampleRate === targetSampleRate) {
    return {
      channels: normalizedChannels,
      length: sourceLength,
      sampleRate: sourceSampleRate,
      numberOfChannels: normalizedChannels.length,
    };
  }

  const resampled = normalizedChannels.map((ch) =>
    resampleChannelCatmullRom(ch, sourceSampleRate, targetSampleRate)
  );

  return {
    channels: resampled,
    length: resampled[0]?.length ?? 0,
    sampleRate: targetSampleRate,
    numberOfChannels: resampled.length,
  };
}
