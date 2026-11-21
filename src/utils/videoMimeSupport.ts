export interface MimeSupportCandidate {
  mimeType: string;
  extension: 'mp4' | 'webm';
  container: 'mp4' | 'webm';
  videoCodec: string;
  audioCodec: string;
  label: string;
}

export interface BrowserExportCapabilities {
  container: 'mp4' | 'webm';
  extension: 'mp4' | 'webm';
  mimeType: string;
  label: string;
  aacSupported: boolean;
  opusSupported: boolean;
  pipeline: 'webcodecs' | 'mediarecorder' | 'unsupported';
  supportedRecorderMimeTypes: string[];
}

export const PRIORITIZED_VIDEO_MIME_CANDIDATES: MimeSupportCandidate[] = [
  {
    mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
    extension: 'mp4',
    container: 'mp4',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    label: 'MP4 (H.264 + AAC)',
  },
  {
    mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    extension: 'mp4',
    container: 'mp4',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    label: 'MP4 (H.264 + AAC)',
  },
  {
    mimeType: 'video/mp4; codecs="avc1.4d002a, mp4a.40.2"',
    extension: 'mp4',
    container: 'mp4',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    label: 'MP4 (H.264 + AAC)',
  },
  {
    mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    extension: 'mp4',
    container: 'mp4',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    label: 'MP4 (H.264 + AAC)',
  },
  {
    mimeType: 'video/mp4;codecs=avc1,mp4a.40.2',
    extension: 'mp4',
    container: 'mp4',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    label: 'MP4 (H.264 + AAC)',
  },
  {
    mimeType: 'video/mp4;codecs=h264,aac',
    extension: 'mp4',
    container: 'mp4',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    label: 'MP4 (H.264 + AAC)',
  },
  {
    mimeType: 'video/mp4',
    extension: 'mp4',
    container: 'mp4',
    videoCodec: 'H.264',
    audioCodec: 'AAC',
    label: 'MP4',
  },
  {
    mimeType: 'video/webm; codecs="vp9, opus"',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'VP9',
    audioCodec: 'Opus',
    label: 'WebM (VP9 + Opus)',
  },
  {
    mimeType: 'video/webm;codecs=vp9,opus',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'VP9',
    audioCodec: 'Opus',
    label: 'WebM (VP9 + Opus)',
  },
  {
    mimeType: 'video/webm; codecs="vp8, opus"',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'VP8',
    audioCodec: 'Opus',
    label: 'WebM (VP8 + Opus)',
  },
  {
    mimeType: 'video/webm;codecs=vp8,opus',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'VP8',
    audioCodec: 'Opus',
    label: 'WebM (VP8 + Opus)',
  },
  {
    mimeType: 'video/webm; codecs="av01.0.04M.08, opus"',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'AV1',
    audioCodec: 'Opus',
    label: 'WebM (AV1 + Opus)',
  },
  {
    mimeType: 'video/webm;codecs=opus',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'VP8',
    audioCodec: 'Opus',
    label: 'WebM (Opus)',
  },
  {
    mimeType: 'video/webm',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'VP8/VP9',
    audioCodec: 'Opus',
    label: 'WebM',
  },
];

export function getSupportedMediaRecorderMimeCandidates(): MimeSupportCandidate[] {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return [];
  }
  return PRIORITIZED_VIDEO_MIME_CANDIDATES.filter((candidate) => {
    try {
      return MediaRecorder.isTypeSupported(candidate.mimeType);
    } catch {
      return false;
    }
  });
}

export function selectBestMediaRecorderMime(): MimeSupportCandidate {
  const supported = getSupportedMediaRecorderMimeCandidates();
  if (supported.length > 0) {
    return supported[0];
  }
  return {
    mimeType: '',
    extension: 'webm',
    container: 'webm',
    videoCodec: 'VP8/VP9',
    audioCodec: 'Opus',
    label: 'WebM (Opus)',
  };
}

async function isWebCodecsCodecSupported(
  type: 'video' | 'audio',
  codecs: string[]
): Promise<string | null> {
  if (type === 'audio') {
    if (typeof AudioEncoder === 'undefined') return null;
    for (const codec of codecs) {
      const sampleRates = codec === 'opus' ? [48000] : [48000, 44100];
      const bitrates = codec === 'opus' ? [192_000, 128_000] : [192_000, 128_000, 96_000];
      for (const sampleRate of sampleRates) {
        for (const bitrate of bitrates) {
          try {
            const res = await AudioEncoder.isConfigSupported({
              codec,
              numberOfChannels: 2,
              sampleRate,
              bitrate,
            });
            if (res.supported) return codec;
          } catch {
            // Try next candidate
          }
        }
      }
    }
    return null;
  }

  if (typeof VideoEncoder === 'undefined') return null;
  for (const codec of codecs) {
    try {
      const res = await VideoEncoder.isConfigSupported({
        codec,
        width: 1280,
        height: 720,
        bitrate: 5_000_000,
        framerate: 30,
      });
      if (res.supported) return codec;
    } catch {
      // Try next candidate
    }
  }
  return null;
}

export async function probeBrowserExportCapabilities(): Promise<BrowserExportCapabilities> {
  const supportedRecorderCandidates = getSupportedMediaRecorderMimeCandidates();
  const supportedRecorderMimeTypes = supportedRecorderCandidates.map((c) => c.mimeType);

  const hasWebCodecs =
    typeof VideoEncoder !== 'undefined' &&
    typeof AudioEncoder !== 'undefined' &&
    typeof VideoFrame !== 'undefined' &&
    typeof AudioData !== 'undefined';

  if (hasWebCodecs) {
    const [aacCodec, opusCodec, avcCodec, vp9Codec, vp8Codec] = await Promise.all([
      isWebCodecsCodecSupported('audio', ['mp4a.40.2', 'mp4a.40.5']),
      isWebCodecsCodecSupported('audio', ['opus']),
      isWebCodecsCodecSupported('video', ['avc1.42E01E', 'avc1.4d002a', 'avc1.640028']),
      isWebCodecsCodecSupported('video', ['vp09.00.31.08', 'vp09.00.10.08']),
      isWebCodecsCodecSupported('video', ['vp8']),
    ]);

    if (aacCodec && (avcCodec || vp9Codec)) {
      return {
        container: 'mp4',
        extension: 'mp4',
        mimeType: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        label: `MP4 (${avcCodec ? 'H.264' : 'VP9'} + AAC)`,
        aacSupported: true,
        opusSupported: Boolean(opusCodec),
        pipeline: 'webcodecs',
        supportedRecorderMimeTypes,
      };
    }

    if (opusCodec && (vp9Codec || vp8Codec)) {
      return {
        container: 'webm',
        extension: 'webm',
        mimeType: vp9Codec ? 'video/webm; codecs="vp9, opus"' : 'video/webm; codecs="vp8, opus"',
        label: `WebM (${vp9Codec ? 'VP9' : 'VP8'} + Opus)`,
        aacSupported: false,
        opusSupported: true,
        pipeline: 'webcodecs',
        supportedRecorderMimeTypes,
      };
    }

    if (opusCodec && avcCodec) {
      return {
        container: 'mp4',
        extension: 'mp4',
        mimeType: 'video/mp4',
        label: 'MP4 (H.264 + Opus)',
        aacSupported: false,
        opusSupported: true,
        pipeline: 'webcodecs',
        supportedRecorderMimeTypes,
      };
    }
  }

  if (supportedRecorderCandidates.length > 0) {
    const best = supportedRecorderCandidates[0];
    return {
      container: best.container,
      extension: best.extension,
      mimeType: best.mimeType,
      label: best.label,
      aacSupported: best.audioCodec === 'AAC',
      opusSupported: best.audioCodec === 'Opus',
      pipeline: 'mediarecorder',
      supportedRecorderMimeTypes,
    };
  }

  return {
    container: 'webm',
    extension: 'webm',
    mimeType: 'video/webm',
    label: 'WebM (Fallback)',
    aacSupported: false,
    opusSupported: false,
    pipeline: typeof MediaRecorder !== 'undefined' ? 'mediarecorder' : 'unsupported',
    supportedRecorderMimeTypes,
  };
}
