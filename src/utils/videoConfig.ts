export type MuxerVideoCodec = 'avc' | 'hevc' | 'vp9' | 'av1';
export type WebmMuxerVideoCodec = 'V_VP9' | 'V_VP8' | 'V_AV1';
export type TargetContainerFormat = 'mp4' | 'webm';

export interface ResolvedVideoConfig {
  encoderConfig: VideoEncoderConfig;
  muxerCodec: MuxerVideoCodec;
  webmMuxerCodec?: WebmMuxerVideoCodec;
  codecLabel: string;
}

async function isVideoConfigUsable(config: VideoEncoderConfig): Promise<VideoEncoderConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;
  try {
    const support = await VideoEncoder.isConfigSupported(config);
    if (!support.supported) return null;
    const candidate = support.config
      ? {
          ...config,
          ...support.config,
          codec: support.config.codec || config.codec,
          width: support.config.width || config.width,
          height: support.config.height || config.height,
        }
      : config;

    const probe = new VideoEncoder({
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
        // ignore close errors
      }
    }
  } catch {
    return null;
  }
}

export async function resolveSupportedVideoConfigForContainer(
  container: TargetContainerFormat,
  width: number,
  height: number,
  fps: number,
  videoBitrateBps?: number
): Promise<ResolvedVideoConfig | null> {
  if (typeof VideoEncoder === 'undefined') return null;

  const pixelArea = width * height;
  const needsLevel5 = pixelArea > 2_100_000 || (pixelArea >= 2_000_000 && fps >= 60);
  const avcCandidates = needsLevel5
    ? [
        'avc1.640033',
        'avc1.640032',
        'avc1.4d0032',
        'avc1.64002a',
        'avc1.4d002a',
        'avc1.640028',
        'avc1.420028',
        'avc1.42E01E',
      ]
    : [
        'avc1.42E01E',
        'avc1.4d002a',
        'avc1.640028',
        'avc1.420028',
        'avc1.640032',
        'avc1.42E01F',
      ];

  const codecTiers: Array<{
    muxerCodec: MuxerVideoCodec;
    webmMuxerCodec?: WebmMuxerVideoCodec;
    codecLabel: string;
    codecs: string[];
  }> =
    container === 'webm'
      ? [
          {
            muxerCodec: 'vp9',
            webmMuxerCodec: 'V_VP9',
            codecLabel: 'VP9',
            codecs: ['vp09.00.41.08', 'vp09.00.31.08', 'vp09.00.10.08'],
          },
          {
            muxerCodec: 'vp9',
            webmMuxerCodec: 'V_VP8',
            codecLabel: 'VP8',
            codecs: ['vp8'],
          },
          {
            muxerCodec: 'av1',
            webmMuxerCodec: 'V_AV1',
            codecLabel: 'AV1',
            codecs: ['av01.0.08M.08', 'av01.0.04M.08'],
          },
        ]
      : [
          { muxerCodec: 'avc', codecLabel: 'H.264', codecs: avcCandidates },
          {
            muxerCodec: 'vp9',
            webmMuxerCodec: 'V_VP9',
            codecLabel: 'VP9',
            codecs: ['vp09.00.41.08', 'vp09.00.31.08', 'vp09.00.10.08'],
          },
          {
            muxerCodec: 'av1',
            webmMuxerCodec: 'V_AV1',
            codecLabel: 'AV1',
            codecs: ['av01.0.08M.08', 'av01.0.04M.08'],
          },
          {
            muxerCodec: 'hevc',
            codecLabel: 'HEVC',
            codecs: ['hvc1.1.6.L120.90', 'hvc1.1.6.L93.B0'],
          },
        ];

  const defaultBitrate = pixelArea > 1_000_000 ? 8_000_000 : 5_000_000;
  const bitrate = Math.round(
    Math.max(1_500_000, Math.min(45_000_000, videoBitrateBps ?? defaultBitrate))
  );

  const modes: Array<{
    hardwareAcceleration: HardwareAcceleration;
    latencyMode?: LatencyMode;
  }> = [
    { hardwareAcceleration: 'prefer-hardware', latencyMode: 'realtime' },
    { hardwareAcceleration: 'prefer-hardware' },
    { hardwareAcceleration: 'no-preference', latencyMode: 'realtime' },
    { hardwareAcceleration: 'no-preference' },
    { hardwareAcceleration: 'prefer-software' },
  ];

  for (const tier of codecTiers) {
    for (const mode of modes) {
      for (const codec of tier.codecs) {
        const config: VideoEncoderConfig = {
          codec,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: mode.hardwareAcceleration,
          ...(mode.latencyMode ? { latencyMode: mode.latencyMode } : {}),
        };
        const usable = await isVideoConfigUsable(config);
        if (usable) {
          return {
            encoderConfig: usable,
            muxerCodec: tier.muxerCodec,
            webmMuxerCodec: tier.webmMuxerCodec,
            codecLabel: tier.codecLabel,
          };
        }
      }
    }
  }

  return null;
}

export async function resolveSupportedVideoConfig(
  width: number,
  height: number,
  fps: number,
  videoBitrateBps?: number
): Promise<ResolvedVideoConfig | null> {
  return resolveSupportedVideoConfigForContainer('mp4', width, height, fps, videoBitrateBps);
}
