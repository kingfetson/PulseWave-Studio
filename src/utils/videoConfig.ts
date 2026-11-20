export async function resolveSupportedVideoConfig(
  width: number,
  height: number,
  fps: number
): Promise<VideoEncoderConfig> {
  // Prefer hardware-accelerated H.264 with realtime latency (disables slow lookahead buffering),
  // falling back cleanly across profiles and software modes if needed.
  const candidates = ['avc1.420028', 'avc1.4d002a', 'avc1.640028', 'avc1.42E01F'];
  const bitrate = width * height > 1000000 ? 6_000_000 : 4_500_000;

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
    codec: 'avc1.420028',
    width,
    height,
    bitrate,
    framerate: fps,
  };
}
