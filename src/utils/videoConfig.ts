export async function resolveSupportedVideoConfig(
  width: number,
  height: number,
  fps: number,
  videoBitrateBps?: number
): Promise<VideoEncoderConfig> {
  // Prefer hardware-accelerated H.264 with realtime latency (disables slow lookahead buffering),
  // selecting AVC levels high enough for 1080p/1440p 60fps while falling back gracefully.
  const pixelArea = width * height;
  const needsLevel5 = pixelArea > 2_100_000 || (pixelArea >= 2_000_000 && fps >= 60);
  const candidates = needsLevel5
    ? [
        'avc1.640033',
        'avc1.640032',
        'avc1.4d0032',
        'avc1.64002a',
        'avc1.4d002a',
        'avc1.640028',
        'avc1.420028',
      ]
    : [
        'avc1.4d002a',
        'avc1.640028',
        'avc1.420028',
        'avc1.640032',
        'avc1.42E01F',
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
  ];

  for (const mode of modes) {
    for (const codec of candidates) {
      const config: VideoEncoderConfig = {
        codec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: mode.hardwareAcceleration,
        ...(mode.latencyMode ? { latencyMode: mode.latencyMode } : {}),
      };
      try {
        const support = await VideoEncoder.isConfigSupported(config);
        if (support.supported) {
          return config;
        }
      } catch {
        // Try next candidate
      }
    }
  }

  return {
    codec: needsLevel5 ? 'avc1.640032' : 'avc1.420028',
    width,
    height,
    bitrate,
    framerate: fps,
  };
}
