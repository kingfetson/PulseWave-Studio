import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Download,
  Film,
  Layers,
  ListOrdered,
  Loader2,
  Music,
  Pause,
  Play,
  Plus,
  Redo2,
  Repeat,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { MidiMappableParamKey } from '../types/midi';
import {
  ASPECT_RATIOS,
  BeatState,
  LyricLine,
  MixClipItem,
  MixProjectOptions,
  MocapClipData,
  MotionBlurState,
  Particle,
  SavedPreset,
  SceneTransitionState,
  SidebarTab,
  StudioSettings,
} from '../types/studio';
import {
  computeLowPassRms,
  createInitialBeatState,
  estimateBpmFromAudioBuffer,
  generateDemoBeat,
  OfflineAudioAnalyzer,
  stepBeatDetector,
} from '../utils/audioEngine';
import { renderVisualizerFrame } from '../utils/canvasRenderer';
import { resolveAutoCycledColors } from '../utils/colorHarmony';
import {
  arrangeMixClipsLayered,
  arrangeMixClipsSequential,
  computeMixTotalDuration,
  createMixClipFromBuffer,
  createMixVideoFrameResolver,
  decodeMixClipFile,
  getMixClipPlayLength,
  isMixClipAudioActive,
  MixVideoFrameResolver,
  renderCombinedMixAudioBuffer,
} from '../utils/mixEngine';
import { captureCanvasSnapshotPng } from '../utils/presetStorage';
import { ControlSidebar } from './ControlSidebar';
import { buildSyntheticAudioFrame } from './PresetThumbnail';
import { PreviewStage } from './PreviewStage';

interface MixStudioModalProps {
  isOpen: boolean;
  initialClips: MixClipItem[];
  initialOptions: MixProjectOptions;
  currentAudioBuffer: AudioBuffer | null;
  currentAudioFileName: string | null;
  ensureAudioContext: () => Promise<AudioContext | null>;
  isExporting: boolean;
  onClose: () => void;
  onApplyMix: (params: {
    clips: MixClipItem[];
    options: MixProjectOptions;
    trackTitle: string;
    trimStart: number;
    trimEnd: number;
    action: 'apply' | 'export' | 'batch';
  }) => Promise<void>;

  // Full Main Studio Features embedded inside Mixer
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
  settings: StudioSettings;
  onUpdateSettings: (patch: Partial<StudioSettings>) => void;
  lyrics: LyricLine[];
  onLyricsChange: (lyrics: LyricLine[]) => void;
  bgImage: HTMLImageElement | null;
  bgImageName: string | null;
  onBgImageSelect: (file: File | null) => void;
  albumImage: HTMLImageElement | null;
  albumImageName: string | null;
  onAlbumImageSelect: (file: File | null) => void;
  onCopyBgToAlbum: () => void;
  onCopyAlbumToBg: () => void;
  onDownloadCoverThumbnail: (mode: 'clean-cover' | 'full-stage') => Promise<string>;
  onSetProjectThumbnailFromCover: () => Promise<void>;
  savedPresets: SavedPreset[];
  onSavePreset: (name: string) => SavedPreset;
  onApplyPreset: (preset: SavedPreset) => void;
  onDeletePreset: (id: string) => void;
  onImportPresetFile: (
    file: File
  ) => Promise<{ ok: true; preset: SavedPreset } | { ok: false; error: string }>;
  onDownloadSnapshot: (name: string, targetSettings?: StudioSettings) => Promise<string>;
  isGeneratingCaptions: boolean;
  captionsNotice: { type: 'success' | 'error'; text: string } | null;
  onDismissCaptionsNotice: () => void;
  onAutoGenerateCaptions: (overrideAudio?: {
    audioBuffer: AudioBuffer;
    trimStart: number;
    trimEnd: number;
  }) => void;
  onAutoArrange: () => void;
  autoArrangeNotice: string | null;
  midiMappingBadges?: Partial<Record<MidiMappableParamKey, string>>;
  onOpenMidiMapping: () => void;
  mocapClip: MocapClipData | null;
  onMocapFileSelect: (
    file: File
  ) => Promise<{ ok: true; clip: MocapClipData } | { ok: false; error: string }>;
  onClearMocapClip: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
}

type StageLayoutMode = 'split' | 'preview' | 'tracks';
type MobilePane = 'mix' | 'studio';

function formatMixTime(sec: number): string {
  const safe = Math.max(0, sec);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs.toFixed(1)}`;
}

export function MixStudioModal({
  isOpen,
  initialClips,
  initialOptions,
  currentAudioBuffer,
  currentAudioFileName,
  ensureAudioContext,
  isExporting,
  onClose,
  onApplyMix,
  activeTab,
  onTabChange,
  settings,
  onUpdateSettings,
  lyrics,
  onLyricsChange,
  bgImage,
  bgImageName,
  onBgImageSelect,
  albumImage,
  albumImageName,
  onAlbumImageSelect,
  onCopyBgToAlbum,
  onCopyAlbumToBg,
  onDownloadCoverThumbnail,
  onSetProjectThumbnailFromCover,
  savedPresets,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onImportPresetFile,
  onDownloadSnapshot,
  isGeneratingCaptions,
  captionsNotice,
  onDismissCaptionsNotice,
  onAutoGenerateCaptions,
  onAutoArrange,
  autoArrangeNotice,
  midiMappingBadges,
  onOpenMidiMapping,
  mocapClip,
  onMocapFileSelect,
  onClearMocapClip,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: MixStudioModalProps) {
  const [clips, setClips] = useState<MixClipItem[]>([]);
  const [options, setOptions] = useState<MixProjectOptions>(initialOptions);
  const [isDecoding, setIsDecoding] = useState(false);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Embedded workspace layout controls
  const [layoutMode, setLayoutMode] = useState<StageLayoutMode>('split');
  const [mobilePane, setMobilePane] = useState<MobilePane>('mix');

  // Rendered mix preview buffer for waveform/BPM/captions/scrubbing
  const [mixedPreviewBuffer, setMixedPreviewBuffer] = useState<AudioBuffer | null>(null);
  const [detectedMixBpm, setDetectedMixBpm] = useState<number | null>(null);
  const [mixTrimStart, setMixTrimStart] = useState(0);
  const [mixTrimEnd, setMixTrimEnd] = useState(0);

  // Live playback & audio-reactive visualizer state
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [loopMix, setLoopMix] = useState(true);
  const [masterVolume, setMasterVolume] = useState(0.9);
  const [isMasterMuted, setIsMasterMuted] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarAudioInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const beatMeterBarRef = useRef<HTMLDivElement | null>(null);

  const sessionCreatedUrlsRef = useRef<Set<string>>(new Set());
  const previewNodesRef = useRef<Array<{ stop: () => void }>>([]);
  const previewMasterGainRef = useRef<GainNode | null>(null);
  const previewAnalyserRef = useRef<AnalyserNode | null>(null);
  const previewBeatAnalyserRef = useRef<AnalyserNode | null>(null);
  const previewStartPerfRef = useRef<number>(0);
  const previewStartOffsetRef = useRef<number>(0);
  const videoResolverRef = useRef<MixVideoFrameResolver | null>(null);
  const offlineAnalyzerRef = useRef<OfflineAudioAnalyzer | null>(null);
  const lastAnalyzedScrubTimeRef = useRef<number>(-1);

  // Visualizer state refs for 60fps loop
  const clipsRef = useRef<MixClipItem[]>([]);
  clipsRef.current = clips;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lyricsRef = useRef(lyrics);
  lyricsRef.current = lyrics;
  const bgImageRef = useRef(bgImage);
  bgImageRef.current = bgImage;
  const albumImageRef = useRef(albumImage);
  albumImageRef.current = albumImage;
  const mocapClipRef = useRef(mocapClip);
  mocapClipRef.current = mocapClip;
  const isPlayingRef = useRef(isPreviewPlaying);
  isPlayingRef.current = isPreviewPlaying;
  const previewTimeRef = useRef(previewTime);
  previewTimeRef.current = previewTime;
  const loopMixRef = useRef(loopMix);
  loopMixRef.current = loopMix;
  const masterGainValRef = useRef(isMasterMuted ? 0 : masterVolume);
  masterGainValRef.current = isMasterMuted ? 0 : masterVolume;
  const detectedBpmRef = useRef<number | null>(null);
  detectedBpmRef.current = detectedMixBpm;

  const particlesRef = useRef<Particle[]>([]);
  const motionBlurStateRef = useRef<MotionBlurState>({ canvas: null, hasFrame: false });
  const sceneTransitionStateRef = useRef<SceneTransitionState>({
    activeMode: null,
    fromMode: null,
    elapsed: 0,
    duration: 0.45,
  });
  const prevVisualizerModeRef = useRef(settings.visualizerMode);
  const beatStateRef = useRef<BeatState>(createInitialBeatState());
  const albumRotationRef = useRef<{ angle: number }>({ angle: 0 });
  const renderMixGenRef = useRef(0);

  const totalDuration = useMemo(() => computeMixTotalDuration(clips), [clips]);
  const videoClipCount = useMemo(() => clips.filter((c) => c.hasVideo).length, [clips]);
  const audioClipCount = useMemo(() => clips.filter((c) => Boolean(c.audioBuffer)).length, [clips]);

  const stopPreviewPlayback = useCallback(() => {
    for (const node of previewNodesRef.current) {
      try {
        node.stop();
      } catch {
        // already stopped
      }
    }
    previewNodesRef.current = [];
    setIsPreviewPlaying(false);
  }, []);

  // Trigger scene transition preview when visualizerMode changes inside mixer
  useEffect(() => {
    if (!isOpen) return;
    const prevMode = prevVisualizerModeRef.current;
    if (prevMode !== settings.visualizerMode) {
      prevVisualizerModeRef.current = settings.visualizerMode;
      if (settings.sceneTransitionType !== 'none' && !settings.lyricsOnly) {
        sceneTransitionStateRef.current = {
          activeMode: settings.visualizerMode,
          fromMode: prevMode,
          elapsed: 0,
          duration: Math.max(0.15, Math.min(1.5, settings.sceneTransitionDuration ?? 0.45)),
        };
      }
    }
  }, [isOpen, settings.visualizerMode, settings.sceneTransitionType, settings.sceneTransitionDuration, settings.lyricsOnly]);

  // Initialize modal state when opened
  useEffect(() => {
    if (!isOpen) {
      stopPreviewPlayback();
      return;
    }
    setClips(initialClips.map((c) => ({ ...c })));
    setOptions({ ...initialOptions });
    setErrorMsg(null);
    setPreviewTime(0);
    setMobilePane('mix');
    sessionCreatedUrlsRef.current.clear();
    prevVisualizerModeRef.current = settingsRef.current.visualizerMode;
    beatStateRef.current = createInitialBeatState();
    particlesRef.current = [];
    lastAnalyzedScrubTimeRef.current = -1;
  }, [isOpen, initialClips, initialOptions, stopPreviewPlayback]);

  // Sync trim range cleanly when totalDuration changes
  useEffect(() => {
    if (!isOpen) return;
    if (totalDuration <= 0) {
      setMixTrimStart(0);
      setMixTrimEnd(0);
      return;
    }
    setMixTrimStart((prev) => Math.max(0, Math.min(prev, Math.max(0, totalDuration - 0.1))));
    setMixTrimEnd(Number(totalDuration.toFixed(2)));
  }, [isOpen, totalDuration]);

  // Sync live master volume without restarting audio playback
  useEffect(() => {
    const gainNode = previewMasterGainRef.current;
    if (gainNode) {
      gainNode.gain.setValueAtTime(isMasterMuted ? 0 : masterVolume, gainNode.context.currentTime);
    }
  }, [masterVolume, isMasterMuted]);

  // Keep video frame resolver synced with active video clips
  useEffect(() => {
    videoResolverRef.current?.dispose();
    videoResolverRef.current = null;
    if (!isOpen) return;
    if (clips.some((c) => c.hasVideo && c.objectUrl)) {
      videoResolverRef.current = createMixVideoFrameResolver(clips);
    }
    return () => {
      videoResolverRef.current?.dispose();
      videoResolverRef.current = null;
    };
  }, [isOpen, clips]);

  // Debounced background render of mixed AudioBuffer for BPM, Auto-Captions, Beat-Sync Lyrics & scrub spectra
  useEffect(() => {
    if (!isOpen) return;
    if (clips.length === 0) {
      setMixedPreviewBuffer(null);
      setDetectedMixBpm(null);
      offlineAnalyzerRef.current = null;
      return;
    }

    const gen = ++renderMixGenRef.current;
    const timer = window.setTimeout(() => {
      void renderCombinedMixAudioBuffer(clips, {
        normalize: options.normalizeMixAudio,
      })
        .then((res) => {
          if (renderMixGenRef.current !== gen) return;
          setMixedPreviewBuffer(res.audioBuffer);
          offlineAnalyzerRef.current = new OfflineAudioAnalyzer(res.audioBuffer, 2048);
          lastAnalyzedScrubTimeRef.current = -1;
          try {
            const bpm = estimateBpmFromAudioBuffer(
              res.audioBuffer,
              settingsRef.current.beatSensitivity
            );
            setDetectedMixBpm(bpm);
          } catch {
            setDetectedMixBpm(null);
          }
        })
        .catch(() => {
          // Ignore transient decode/render errors during edits
        });
    }, 220);

    return () => window.clearTimeout(timer);
  }, [isOpen, clips, options.normalizeMixAudio]);

  const startPreviewFromTime = useCallback(
    async (offsetSec: number) => {
      const currentClips = clipsRef.current;
      const dur = computeMixTotalDuration(currentClips);
      if (dur <= 0) return;

      stopPreviewPlayback();
      const ctx = await ensureAudioContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      if (!previewMasterGainRef.current || previewMasterGainRef.current.context !== ctx) {
        const master = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
        analyser.smoothingTimeConstant = settingsRef.current.smoothing;

        const lowPass = ctx.createBiquadFilter();
        lowPass.type = 'lowpass';
        lowPass.frequency.value = 140;
        lowPass.Q.value = 1.2;

        const beatAnalyser = ctx.createAnalyser();
        beatAnalyser.fftSize = 2048;
        beatAnalyser.smoothingTimeConstant = 0.2;

        master.connect(analyser);
        analyser.connect(ctx.destination);
        master.connect(lowPass);
        lowPass.connect(beatAnalyser);

        previewMasterGainRef.current = master;
        previewAnalyserRef.current = analyser;
        previewBeatAnalyserRef.current = beatAnalyser;
      }

      const master = previewMasterGainRef.current;
      master.gain.setValueAtTime(masterGainValRef.current, ctx.currentTime);
      if (previewAnalyserRef.current) {
        previewAnalyserRef.current.smoothingTimeConstant = settingsRef.current.smoothing;
      }

      const startFrom = Math.max(0, Math.min(dur - 0.05, offsetSec));
      const now = ctx.currentTime + 0.02;
      const spawned: Array<{ stop: () => void }> = [];

      for (const clip of currentClips) {
        if (!isMixClipAudioActive(clip, currentClips) || !clip.audioBuffer) continue;

        const playLen = getMixClipPlayLength(clip);
        const clipStart = Math.max(0, clip.startTime);
        const clipEnd = clipStart + playLen;
        if (clipEnd <= startFrom) continue;

        const volume = Math.max(0, Math.min(1.5, clip.volume));
        if (volume <= 0.001) continue;

        const src = ctx.createBufferSource();
        src.buffer = clip.audioBuffer;
        const gain = ctx.createGain();

        const skipIntoClip = Math.max(0, startFrom - clipStart);
        const whenToStart = now + Math.max(0, clipStart - startFrom);
        const bufferOffset = Math.max(0, clip.trimStart + skipIntoClip);
        const remainingDur = Math.max(0.01, playLen - skipIntoClip);

        const fadeIn = Math.max(0, Math.min(clip.fadeIn, playLen * 0.49));
        const fadeOut = Math.max(0, Math.min(clip.fadeOut, playLen * 0.49));

        if (fadeIn > 0.01 && skipIntoClip < fadeIn) {
          const initialGain = volume * (skipIntoClip / fadeIn);
          gain.gain.setValueAtTime(Math.max(0.0001, initialGain), whenToStart);
          gain.gain.linearRampToValueAtTime(volume, whenToStart + (fadeIn - skipIntoClip));
        } else {
          gain.gain.setValueAtTime(volume, whenToStart);
        }

        const fadeOutStartLocal = playLen - fadeOut;
        if (fadeOut > 0.01) {
          const timeUntilFadeOut = fadeOutStartLocal - skipIntoClip;
          if (timeUntilFadeOut > 0) {
            gain.gain.setValueAtTime(volume, whenToStart + timeUntilFadeOut);
            gain.gain.linearRampToValueAtTime(0.0001, whenToStart + remainingDur);
          } else {
            const frac = Math.max(0.0001, (playLen - skipIntoClip) / fadeOut);
            gain.gain.setValueAtTime(volume * frac, whenToStart);
            gain.gain.linearRampToValueAtTime(0.0001, whenToStart + remainingDur);
          }
        }

        src.connect(gain);
        gain.connect(master);
        src.start(whenToStart, bufferOffset, remainingDur);
        spawned.push(src);
      }

      previewNodesRef.current = spawned;
      previewStartOffsetRef.current = startFrom;
      previewStartPerfRef.current = performance.now();
      setPreviewTime(startFrom);
      setIsPreviewPlaying(true);
    },
    [ensureAudioContext, stopPreviewPlayback]
  );

  // Update analyser smoothing live when user tweaks smoothing slider
  useEffect(() => {
    if (previewAnalyserRef.current) {
      previewAnalyserRef.current.smoothingTimeConstant = settings.smoothing;
    }
  }, [settings.smoothing]);

  const handleTogglePreviewPlay = useCallback(() => {
    if (isPreviewPlaying) {
      stopPreviewPlayback();
    } else {
      void startPreviewFromTime(previewTimeRef.current);
    }
  }, [isPreviewPlaying, startPreviewFromTime, stopPreviewPlayback]);

  const handleScrubPreview = useCallback(
    (nextTime: number) => {
      const clamped = Math.max(0, Math.min(computeMixTotalDuration(clipsRef.current), nextTime));
      setPreviewTime(clamped);
      lastAnalyzedScrubTimeRef.current = -1;
      if (isPlayingRef.current) {
        void startPreviewFromTime(clamped);
      }
    },
    [startPreviewFromTime]
  );

  // Full 60fps Audio-Reactive Visualizer + Mixed Video Preview Loop
  useEffect(() => {
    if (!isOpen) return;
    let rafId = 0;
    let lastTimestamp = performance.now();
    const freqBuf = new Uint8Array(1024);
    const waveBuf = new Uint8Array(1024);
    const lowPassWaveBuf = new Uint8Array(1024);
    waveBuf.fill(128);
    lowPassWaveBuf.fill(128);

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      const activeSettings = settingsRef.current;
      const dur = computeMixTotalDuration(clipsRef.current);
      let trackTime = previewTimeRef.current;

      if (isPlayingRef.current) {
        const elapsed = (now - previewStartPerfRef.current) / 1000;
        const candidate = previewStartOffsetRef.current + elapsed;
        if (dur > 0 && candidate >= dur) {
          if (loopMixRef.current) {
            trackTime = 0;
            void startPreviewFromTime(0);
          } else {
            trackTime = 0;
            setPreviewTime(0);
            stopPreviewPlayback();
          }
        } else {
          trackTime = candidate;
          setPreviewTime(trackTime);
        }
      }

      let lowPassRms = 0;
      const analyser = previewAnalyserRef.current;
      const beatAnalyser = previewBeatAnalyserRef.current;

      if (analyser && isPlayingRef.current) {
        analyser.getByteFrequencyData(freqBuf);
        analyser.getByteTimeDomainData(waveBuf);
        if (beatAnalyser) {
          beatAnalyser.getByteTimeDomainData(lowPassWaveBuf);
          lowPassRms = computeLowPassRms(lowPassWaveBuf);
        }
      } else if (offlineAnalyzerRef.current && clipsRef.current.length > 0 && trackTime > 0.02) {
        if (Math.abs(lastAnalyzedScrubTimeRef.current - trackTime) > 0.001) {
          offlineAnalyzerRef.current.analyzeAt(
            trackTime,
            activeSettings.smoothing,
            freqBuf,
            waveBuf
          );
          lastAnalyzedScrubTimeRef.current = trackTime;
        }
      } else if (clipsRef.current.length > 0) {
        for (let i = 0; i < freqBuf.length; i++) {
          freqBuf[i] = Math.floor(freqBuf[i] * 0.86);
        }
        for (let i = 0; i < waveBuf.length; i++) {
          waveBuf[i] = Math.round(128 + (waveBuf[i] - 128) * 0.85);
        }
      } else {
        const syn = buildSyntheticAudioFrame(1024);
        freqBuf.set(syn.frequencyData);
        waveBuf.set(syn.timeDomainData);
      }

      const activeDuration = dur > 0 ? dur : undefined;
      const cycled = resolveAutoCycledColors(activeSettings, trackTime, activeDuration);

      let beatBurst = 0;
      let beatTriggered = false;
      const minDim = Math.min(
        ASPECT_RATIOS[activeSettings.aspectRatio].width,
        ASPECT_RATIOS[activeSettings.aspectRatio].height
      );

      const needsBeatDetector =
        activeSettings.beatDetection ||
        Boolean(activeSettings.beatFlash) ||
        Boolean(activeSettings.danceEnabled) ||
        (activeSettings.glitchIntensity ?? 0) > 0 ||
        (activeSettings.bassShake ?? 0) > 0 ||
        (activeSettings.beatShake ?? 0) > 0 ||
        (Boolean(activeSettings.lyricBeatSync) &&
          (activeSettings.lyricPulseIntensity ?? 1) > 0);

      if (needsBeatDetector) {
        const step = stepBeatDetector(
          beatStateRef.current,
          lowPassRms,
          dt,
          activeSettings.beatSensitivity,
          minDim,
          cycled.primaryColor,
          cycled.secondaryColor
        );
        beatBurst = step.burstIntensity;
        beatTriggered = step.triggered;

        if (beatMeterBarRef.current) {
          const meterScale = Math.min(1, lowPassRms * 1.35);
          beatMeterBarRef.current.style.transform = `scaleX(${meterScale.toFixed(3)})`;
        }
      } else {
        beatStateRef.current.burstIntensity = 0;
        beatStateRef.current.shockwaves.length = 0;
        if (beatMeterBarRef.current) {
          beatMeterBarRef.current.style.transform = 'scaleX(0)';
        }
      }

      const canvas = previewCanvasRef.current;
      if (canvas) {
        const { width, height } = ASPECT_RATIOS[activeSettings.aspectRatio];
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const mixResolver = videoResolverRef.current;
          const activeMixVideoFrame =
            mixResolver && mixResolver.hasActiveVideo()
              ? mixResolver.resolvePreviewFrame(trackTime, width, height)
              : null;

          const liveBpm =
            detectedBpmRef.current ?? beatStateRef.current.estimatedBpm ?? 120;

          renderVisualizerFrame({
            ctx,
            width,
            height,
            currentTime: trackTime,
            dt,
            frequencyData: freqBuf,
            timeDomainData: waveBuf,
            settings: activeSettings,
            lyrics: lyricsRef.current,
            bgImage: activeMixVideoFrame ?? bgImageRef.current,
            albumImage: albumImageRef.current,
            mocapClip: mocapClipRef.current,
            particles: particlesRef.current,
            isExport: false,
            albumRotationRef: albumRotationRef.current,
            beatBurst,
            beatTriggered,
            bpm: liveBpm,
            beatShockwaves: activeSettings.beatDetection
              ? beatStateRef.current.shockwaves
              : undefined,
            motionBlurState: motionBlurStateRef.current,
            sceneTransitionState: sceneTransitionStateRef.current,
            trackDuration: activeDuration,
          });
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isOpen, startPreviewFromTime, stopPreviewPlayback]);

  const handleAddFiles = useCallback(
    async (fileList: FileList | File[]) => {
      const files = Array.from(fileList);
      if (files.length === 0) return;

      setErrorMsg(null);
      setIsDecoding(true);
      stopPreviewPlayback();

      try {
        const ctx = await ensureAudioContext();
        if (!ctx) throw new Error('Web Audio API is unavailable in this browser.');

        const decoded: MixClipItem[] = [];
        for (const file of files) {
          const item = await decodeMixClipFile(file, ctx);
          if (item.objectUrl) {
            sessionCreatedUrlsRef.current.add(item.objectUrl);
          }
          decoded.push(item);
        }

        setClips((prev) => {
          const next = [...prev];
          let cursor = computeMixTotalDuration(prev);
          for (const clip of decoded) {
            const positioned: MixClipItem = {
              ...clip,
              startTime: Number(cursor.toFixed(2)),
            };
            cursor += getMixClipPlayLength(positioned);
            next.push(positioned);
          }
          return next;
        });

        if (!settingsRef.current.trackTitle.trim() && decoded[0]) {
          const base = decoded[0].name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
          onUpdateSettings({
            trackTitle: files.length > 1 ? `${base} Mix` : base,
          });
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Unable to decode selected file.');
      } finally {
        setIsDecoding(false);
      }
    },
    [ensureAudioContext, onUpdateSettings, stopPreviewPlayback]
  );

  const handleImportCurrentTrack = useCallback(() => {
    if (!currentAudioBuffer) return;
    stopPreviewPlayback();
    const label = currentAudioFileName || 'Current Studio Track';
    const imported = createMixClipFromBuffer(currentAudioBuffer, label);
    setClips((prev) => {
      const cursor = computeMixTotalDuration(prev);
      return [...prev, { ...imported, startTime: Number(cursor.toFixed(2)) }];
    });
    if (!settingsRef.current.trackTitle.trim()) {
      onUpdateSettings({
        trackTitle: `${label.replace(/\.[^.]+$/, '')} Mix`,
      });
    }
  }, [currentAudioBuffer, currentAudioFileName, onUpdateSettings, stopPreviewPlayback]);

  const handleLoadDemoIntoMix = useCallback(async () => {
    setErrorMsg(null);
    setIsGeneratingDemo(true);
    stopPreviewPlayback();
    try {
      const demo = await generateDemoBeat();
      URL.revokeObjectURL(demo.blobUrl);
      const imported = createMixClipFromBuffer(demo.audioBuffer, demo.fileName);
      setClips((prev) => {
        const cursor = computeMixTotalDuration(prev);
        return [...prev, { ...imported, startTime: Number(cursor.toFixed(2)) }];
      });
      if (!settingsRef.current.trackTitle.trim()) {
        onUpdateSettings({
          trackTitle: demo.trackTitle,
          artistName: settingsRef.current.artistName || demo.artistName,
        });
      }
      if (lyricsRef.current.length === 0 && demo.lyrics.length > 0) {
        onLyricsChange(demo.lyrics);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create demo beat.');
    } finally {
      setIsGeneratingDemo(false);
    }
  }, [onLyricsChange, onUpdateSettings, stopPreviewPlayback]);

  const handleUpdateClip = useCallback(
    (id: string, patch: Partial<MixClipItem>) => {
      stopPreviewPlayback();
      setClips((prev) =>
        prev.map((c) => {
          if (c.id !== id) return c;
          const updated = { ...c, ...patch };
          updated.trimStart = Math.max(0, Math.min(updated.duration - 0.1, updated.trimStart));
          updated.trimEnd = Math.max(
            updated.trimStart + 0.1,
            Math.min(updated.duration, updated.trimEnd)
          );
          updated.startTime = Math.max(0, updated.startTime);
          return updated;
        })
      );
    },
    [stopPreviewPlayback]
  );

  const handleRemoveClip = useCallback(
    (id: string) => {
      stopPreviewPlayback();
      setClips((prev) => {
        const target = prev.find((c) => c.id === id);
        if (target?.objectUrl && sessionCreatedUrlsRef.current.has(target.objectUrl)) {
          URL.revokeObjectURL(target.objectUrl);
          sessionCreatedUrlsRef.current.delete(target.objectUrl);
        }
        return prev.filter((c) => c.id !== id);
      });
    },
    [stopPreviewPlayback]
  );

  const handleMoveClip = useCallback(
    (index: number, dir: -1 | 1) => {
      stopPreviewPlayback();
      setClips((prev) => {
        const targetIndex = index + dir;
        if (targetIndex < 0 || targetIndex >= prev.length) return prev;
        const copy = [...prev];
        const [item] = copy.splice(index, 1);
        copy.splice(targetIndex, 0, item);
        return copy;
      });
    },
    [stopPreviewPlayback]
  );

  const handlePreviewSceneTransition = useCallback(() => {
    const s = settingsRef.current;
    if (s.sceneTransitionType === 'none' || s.lyricsOnly) return;
    sceneTransitionStateRef.current = {
      activeMode: s.visualizerMode,
      fromMode: s.visualizerMode,
      elapsed: 0,
      duration: Math.max(0.15, Math.min(1.5, s.sceneTransitionDuration ?? 0.45)),
    };
  }, []);

  const handleMixSnapshot = useCallback(
    async (name: string, targetSettings?: StudioSettings): Promise<string> => {
      if (
        previewCanvasRef.current &&
        (!targetSettings ||
          JSON.stringify(targetSettings) === JSON.stringify(settingsRef.current))
      ) {
        return captureCanvasSnapshotPng(previewCanvasRef.current, name);
      }
      return onDownloadSnapshot(name, targetSettings);
    },
    [onDownloadSnapshot]
  );

  const handleMixAutoCaptions = useCallback(() => {
    if (mixedPreviewBuffer) {
      onAutoGenerateCaptions({
        audioBuffer: mixedPreviewBuffer,
        trimStart: mixTrimStart,
        trimEnd: mixTrimEnd > mixTrimStart ? mixTrimEnd : mixedPreviewBuffer.duration,
      });
      return;
    }
    onAutoGenerateCaptions();
  }, [mixedPreviewBuffer, mixTrimEnd, mixTrimStart, onAutoGenerateCaptions]);

  const handleCancelAndClose = useCallback(() => {
    stopPreviewPlayback();
    for (const url of sessionCreatedUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    sessionCreatedUrlsRef.current.clear();
    onClose();
  }, [onClose, stopPreviewPlayback]);

  const handleCommitMix = useCallback(
    async (action: 'apply' | 'export' | 'batch') => {
      if (clips.length === 0 || isApplying || isExporting) return;
      stopPreviewPlayback();
      setErrorMsg(null);
      setIsApplying(true);
      try {
        const keptUrls = new Set(clips.map((c) => c.objectUrl).filter(Boolean) as string[]);
        for (const url of sessionCreatedUrlsRef.current) {
          if (!keptUrls.has(url)) {
            URL.revokeObjectURL(url);
          }
        }
        sessionCreatedUrlsRef.current.clear();

        await onApplyMix({
          clips,
          options,
          trackTitle: settingsRef.current.trackTitle.trim() || 'Combined Mix',
          trimStart: mixTrimStart,
          trimEnd: mixTrimEnd > mixTrimStart ? mixTrimEnd : totalDuration,
          action,
        });
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Failed to mix audio & video tracks.'
        );
      } finally {
        setIsApplying(false);
      }
    },
    [
      clips,
      isApplying,
      isExporting,
      mixTrimEnd,
      mixTrimStart,
      onApplyMix,
      options,
      stopPreviewPlayback,
      totalDuration,
    ]
  );

  if (!isOpen) return null;

  const activeBpm = detectedMixBpm ?? beatStateRef.current.estimatedBpm ?? 120;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-1.5 sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mix-studio-title"
    >
      <div className="w-full h-full bg-[#090b10] border border-white/[0.12] rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Top Studio Bar */}
        <div className="h-13 shrink-0 px-3 sm:px-4 border-b border-white/[0.08] bg-[#121620] flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h2
                id="mix-studio-title"
                className="text-xs sm:text-sm font-semibold text-slate-100 truncate"
              >
                Multi-Track Audio &amp; Video Mixer Studio
              </h2>
            </div>

            {/* Mobile Pane Switcher */}
            <div className="flex lg:hidden items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08] shrink-0">
              <button
                type="button"
                onClick={() => setMobilePane('mix')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  mobilePane === 'mix'
                    ? 'bg-cyan-400 text-[#090b10] font-semibold'
                    : 'text-slate-300'
                }`}
              >
                Mix &amp; Preview
              </button>
              <button
                type="button"
                onClick={() => setMobilePane('studio')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  mobilePane === 'studio'
                    ? 'bg-cyan-400 text-[#090b10] font-semibold'
                    : 'text-slate-300'
                }`}
              >
                Studio Features
              </button>
            </div>

            {/* Quick Title Input */}
            <input
              type="text"
              value={settings.trackTitle}
              onChange={(e) => onUpdateSettings({ trackTitle: e.target.value })}
              placeholder="Combined Mix Title"
              aria-label="Combined Mix Title"
              className="hidden md:block w-48 px-2.5 py-1 rounded-lg bg-[#090b10] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1 pr-2 border-r border-white/[0.08]">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo || isApplying}
                title="Undo"
                aria-label="Undo"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 cursor-pointer"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo || isApplying}
                title="Redo"
                aria-label="Redo"
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 cursor-pointer"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleCommitMix('batch')}
              disabled={clips.length === 0 || isApplying || isExporting}
              className="hidden sm:flex px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.09] transition-colors items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Batch Export</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCommitMix('apply')}
              disabled={clips.length === 0 || isApplying || isExporting}
              className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/[0.07] hover:bg-white/[0.13] text-slate-100 border border-white/[0.1] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              {isApplying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
              ) : (
                <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              )}
              <span className="hidden sm:inline">Apply to Studio</span>
              <span className="sm:hidden">Apply</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCommitMix('export')}
              disabled={clips.length === 0 || isApplying || isExporting}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
            >
              {isApplying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span>Export Mix MP4</span>
            </button>

            <button
              type="button"
              onClick={handleCancelAndClose}
              disabled={isApplying}
              aria-label="Close mixer"
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Full Studio Body: Embedded ControlSidebar (Left) + Preview Stage & Multi-Track Timeline (Right) */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Embedded Full Studio Sidebar (All Visuals, Dancers, Glow, Lyrics, Presets, Format, Style, Backdrop) */}
          <div
            className={`${
              mobilePane === 'studio' ? 'flex flex-1 min-h-0' : 'hidden lg:flex'
            } lg:w-[370px] shrink-0 min-h-0`}
          >
            <ControlSidebar
              activeTab={activeTab}
              onTabChange={onTabChange}
              settings={settings}
              onUpdateSettings={onUpdateSettings}
              audioFileName={
                clips.length > 0
                  ? `${clips.length} mixed track${clips.length > 1 ? 's' : ''}`
                  : null
              }
              duration={totalDuration}
              currentTime={previewTime}
              isPlaying={isPreviewPlaying}
              trimStart={mixTrimStart}
              trimEnd={mixTrimEnd}
              onTrimChange={(start, end) => {
                setMixTrimStart(start);
                setMixTrimEnd(end);
              }}
              onAudioFileSelect={(file) => void handleAddFiles([file])}
              onLoadDemo={() => void handleLoadDemoIntoMix()}
              isGeneratingDemo={isGeneratingDemo}
              onBgImageSelect={onBgImageSelect}
              bgImageName={bgImageName}
              hasBgImage={Boolean(bgImageName)}
              onAlbumImageSelect={onAlbumImageSelect}
              albumImageName={albumImageName}
              hasAlbumImage={Boolean(albumImageName)}
              onCopyBgToAlbum={onCopyBgToAlbum}
              onCopyAlbumToBg={onCopyAlbumToBg}
              onDownloadCoverThumbnail={onDownloadCoverThumbnail}
              onSetProjectThumbnailFromCover={onSetProjectThumbnailFromCover}
              lyrics={lyrics}
              onLyricsChange={onLyricsChange}
              onSeek={handleScrubPreview}
              audioInputRef={sidebarAudioInputRef}
              savedPresets={savedPresets}
              onSavePreset={onSavePreset}
              onApplyPreset={onApplyPreset}
              onDeletePreset={onDeletePreset}
              onImportPresetFile={onImportPresetFile}
              onDownloadSnapshot={handleMixSnapshot}
              hasAudio={clips.length > 0}
              audioBuffer={mixedPreviewBuffer}
              isGeneratingCaptions={isGeneratingCaptions}
              captionsNotice={captionsNotice}
              onDismissCaptionsNotice={onDismissCaptionsNotice}
              onAutoGenerateCaptions={handleMixAutoCaptions}
              onAutoArrange={onAutoArrange}
              autoArrangeNotice={autoArrangeNotice}
              beatMeterBarRef={beatMeterBarRef}
              currentBpm={activeBpm}
              midiMappingBadges={midiMappingBadges}
              onOpenMidiMapping={onOpenMidiMapping}
              onPreviewSceneTransition={handlePreviewSceneTransition}
              mocapClip={mocapClip}
              onMocapFileSelect={onMocapFileSelect}
              onClearMocapClip={onClearMocapClip}
              containerClassName="w-full h-full border-r border-white/[0.08] bg-[#121620] flex flex-col min-h-0"
            />
          </div>

          {/* Right Workspace: Live Visualizer Stage + Transport + Multi-Track Mixer */}
          <div
            className={`${
              mobilePane === 'mix' ? 'flex' : 'hidden lg:flex'
            } flex-1 min-w-0 min-h-0 flex-col overflow-hidden`}
          >
            {/* Live Audio-Reactive Visualizer + Video Mix Preview Stage */}
            {layoutMode !== 'tracks' && (
              <div className="flex-1 min-h-[200px] flex flex-col overflow-hidden">
                <PreviewStage
                  canvasRef={previewCanvasRef}
                  aspectRatio={settings.aspectRatio}
                  hasAudio={clips.length > 0}
                  isPlaying={isPreviewPlaying}
                  isGeneratingDemo={isGeneratingDemo}
                  showSafeZone={settings.showSafeZone}
                  onToggleSafeZone={() =>
                    onUpdateSettings({ showSafeZone: !settings.showSafeZone })
                  }
                  onAutoArrange={onAutoArrange}
                  autoArrangeNotice={autoArrangeNotice}
                  onTogglePlay={handleTogglePreviewPlay}
                  onUploadAudioClick={() => fileInputRef.current?.click()}
                  onLoadDemo={() => void handleLoadDemoIntoMix()}
                  lyrics={lyrics}
                  currentTime={previewTime}
                  duration={totalDuration}
                  isGeneratingCaptions={isGeneratingCaptions}
                  onLyricsChange={onLyricsChange}
                  onAutoGenerateCaptions={handleMixAutoCaptions}
                  onOpenLyricsTab={() => {
                    onTabChange('lyrics');
                    setMobilePane('studio');
                  }}
                />
              </div>
            )}

            {/* Mix Transport & Layout Strip */}
            <div className="shrink-0 px-3 sm:px-4 py-2 bg-[#121620] border-y border-white/[0.08] flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                <button
                  type="button"
                  onClick={handleTogglePreviewPlay}
                  disabled={clips.length === 0 || totalDuration <= 0}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                >
                  {isPreviewPlaying ? (
                    <Pause className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{isPreviewPlaying ? 'Pause' : 'Play Mix'}</span>
                </button>

                <span className="text-[11px] font-mono tabular-nums text-slate-300 whitespace-nowrap">
                  {formatMixTime(previewTime)} / {formatMixTime(totalDuration)}
                </span>

                <input
                  type="range"
                  min={0}
                  max={Math.max(0.1, totalDuration)}
                  step={0.05}
                  disabled={clips.length === 0 || totalDuration <= 0}
                  value={Math.min(previewTime, Math.max(0.1, totalDuration))}
                  onChange={(e) => handleScrubPreview(parseFloat(e.target.value))}
                  aria-label="Mix timeline scrubber"
                  className="flex-1 min-w-[80px] accent-cyan-400 cursor-pointer disabled:opacity-40"
                />

                <button
                  type="button"
                  onClick={() => setLoopMix((v) => !v)}
                  aria-pressed={loopMix}
                  title="Loop mix playback"
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    loopMix
                      ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                      : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Repeat className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMasterMuted((m) => !m)}
                  aria-label={isMasterMuted ? 'Unmute mix' : 'Mute mix'}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.07] cursor-pointer"
                >
                  {isMasterMuted || masterVolume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMasterMuted ? 0 : masterVolume}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setMasterVolume(v);
                    if (v > 0 && isMasterMuted) setIsMasterMuted(false);
                  }}
                  aria-label="Master preview volume"
                  className="w-16 accent-cyan-400 cursor-pointer"
                />

                <div className="flex items-center p-0.5 rounded-lg bg-[#090b10] border border-white/[0.08]">
                  {(
                    [
                      { id: 'split', label: 'Split' },
                      { id: 'preview', label: 'Stage' },
                      { id: 'tracks', label: 'Tracks' },
                    ] as const
                  ).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setLayoutMode(mode.id)}
                      className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                        layoutMode === mode.id
                          ? 'bg-cyan-500/20 text-cyan-200'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Multi-Track Mixer Rack */}
            <div
              className={`bg-[#0f131c] flex flex-col min-h-0 ${
                layoutMode === 'tracks'
                  ? 'flex-1'
                  : layoutMode === 'preview'
                  ? 'shrink-0'
                  : 'h-[260px] xl:h-[290px] shrink-0'
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDraggingOver(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void handleAddFiles(e.dataTransfer.files);
                }
              }}
            >
              {/* Multi-Track Toolbar */}
              <div className="px-3 sm:px-4 py-2 bg-[#0b0e16] border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".mp3,.wav,.ogg,.m4a,.mp4,.webm,.mov,audio/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        void handleAddFiles(e.target.files);
                      }
                      e.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isDecoding || isApplying}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                  >
                    {isDecoding ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>{isDecoding ? 'Decoding...' : 'Add Audio / Video'}</span>
                  </button>

                  {currentAudioBuffer && (
                    <button
                      type="button"
                      onClick={handleImportCurrentTrack}
                      disabled={isDecoding || isApplying}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-3 h-3 text-cyan-400" />
                      <span>Import Studio Track</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      stopPreviewPlayback();
                      setClips((prev) =>
                        arrangeMixClipsSequential(prev, options.defaultCrossfadeSec)
                      );
                    }}
                    disabled={clips.length < 2 || isApplying}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-40"
                  >
                    <ListOrdered className="w-3 h-3 text-cyan-400" />
                    <span>Join</span>
                  </button>

                  <label className="flex items-center gap-1 text-[11px] text-slate-300 bg-[#121620] border border-white/[0.08] rounded-lg px-2 py-1">
                    <span className="whitespace-nowrap">Fade</span>
                    <input
                      type="range"
                      min={0}
                      max={4}
                      step={0.25}
                      value={options.defaultCrossfadeSec}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setOptions((o) => ({ ...o, defaultCrossfadeSec: val }));
                      }}
                      className="w-12 accent-cyan-400 cursor-pointer"
                    />
                    <span className="font-mono tabular-nums text-cyan-300 w-6 text-right">
                      {options.defaultCrossfadeSec.toFixed(1)}s
                    </span>
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      stopPreviewPlayback();
                      setClips((prev) => arrangeMixClipsLayered(prev));
                    }}
                    disabled={clips.length < 2 || isApplying}
                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white/[0.05] hover:bg-white/[0.09] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer disabled:opacity-40"
                  >
                    <Layers className="w-3 h-3 text-cyan-400" />
                    <span>Layer</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setOptions((o) => ({
                        ...o,
                        normalizeMixAudio: !o.normalizeMixAudio,
                      }))
                    }
                    aria-pressed={options.normalizeMixAudio}
                    className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors whitespace-nowrap cursor-pointer ${
                      options.normalizeMixAudio
                        ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/35'
                        : 'bg-white/[0.05] text-slate-400 border-white/[0.08] hover:text-slate-200'
                    }`}
                  >
                    Auto-Level: {options.normalizeMixAudio ? 'On' : 'Off'}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="font-mono tabular-nums whitespace-nowrap">
                    {clips.length} track{clips.length === 1 ? '' : 's'} · {audioClipCount}A/{videoClipCount}V
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setLayoutMode((m) => (m === 'preview' ? 'split' : 'preview'))
                    }
                    title={layoutMode === 'preview' ? 'Show track rack' : 'Collapse track rack'}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.08] cursor-pointer"
                  >
                    {layoutMode === 'preview' ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Scrollable Track Rows */}
              {layoutMode !== 'preview' && (
                <div
                  className={`flex-1 min-h-0 overflow-y-auto studio-scroll p-3 space-y-2 transition-colors ${
                    isDraggingOver ? 'bg-cyan-500/[0.06]' : ''
                  }`}
                >
                  {errorMsg && (
                    <div className="px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200 flex items-center justify-between gap-2">
                      <span>{errorMsg}</span>
                      <button
                        type="button"
                        onClick={() => setErrorMsg(null)}
                        className="text-rose-300 hover:text-white cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  )}

                  {clips.length === 0 ? (
                    <div className="border border-dashed border-white/[0.14] rounded-xl py-6 px-4 text-center space-y-2 bg-[#090b10]/60">
                      <Upload className="w-5 h-5 text-cyan-400 mx-auto" />
                      <p className="text-xs font-medium text-slate-200">
                        Drop audio &amp; video files here or click Add Audio / Video
                      </p>
                      <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                        Customize visualizers, 3D dancers, glow, lyrics, themes, and format in the Studio Features sidebar on the left, then export one combined MP4.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                      {clips.map((clip, index) => {
                        const playLen = getMixClipPlayLength(clip);
                        const audioActive = isMixClipAudioActive(clip, clips);
                        return (
                          <div
                            key={clip.id}
                            className="p-2.5 rounded-lg bg-[#090b10] border border-white/[0.08] space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-[11px] font-mono tabular-nums text-slate-500 shrink-0">
                                  {String(index + 1).padStart(2, '0')}
                                </span>
                                {clip.hasVideo ? (
                                  <Film className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                ) : (
                                  <Music className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                )}
                                <span className="text-xs font-medium text-slate-100 truncate">
                                  {clip.name}
                                </span>
                                <span className="text-[10.5px] font-mono tabular-nums text-slate-400 shrink-0">
                                  {clip.hasVideo
                                    ? `${clip.videoWidth}×${clip.videoHeight} · ${playLen.toFixed(1)}s`
                                    : `${playLen.toFixed(1)}s`}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateClip(clip.id, { muted: !clip.muted })
                                  }
                                  title={clip.muted ? 'Unmute audio' : 'Mute audio'}
                                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold border transition-colors cursor-pointer ${
                                    clip.muted
                                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/35'
                                      : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08]'
                                  }`}
                                >
                                  M
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUpdateClip(clip.id, { solo: !clip.solo })
                                  }
                                  title={clip.solo ? 'Unsolo audio' : 'Solo audio'}
                                  className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold border transition-colors cursor-pointer ${
                                    clip.solo
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                                      : 'bg-white/[0.04] text-slate-300 border-white/[0.08] hover:bg-white/[0.08]'
                                  }`}
                                >
                                  S
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveClip(index, -1)}
                                  disabled={index === 0}
                                  title="Move track up"
                                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveClip(index, 1)}
                                  disabled={index === clips.length - 1}
                                  title="Move track down"
                                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-white/[0.07] disabled:opacity-30 cursor-pointer"
                                >
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveClip(clip.id)}
                                  title="Remove track"
                                  className="p-1 rounded text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Mini Waveform */}
                            <div className="h-4 rounded bg-[#121620] border border-white/[0.06] px-1 flex items-center gap-[2px] overflow-hidden">
                              {clip.waveformPeaks.map((p, idx) => (
                                <div
                                  key={idx}
                                  className={`flex-1 rounded-sm ${
                                    audioActive ? 'bg-cyan-400/75' : 'bg-slate-600/50'
                                  }`}
                                  style={{
                                    height: `${Math.max(12, Math.round(p * 100))}%`,
                                  }}
                                />
                              ))}
                            </div>

                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-[10.5px]">
                              <label className="space-y-0.5">
                                <span className="text-slate-400 block">Start (s)</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={0.1}
                                  value={Number(clip.startTime.toFixed(2))}
                                  onChange={(e) =>
                                    handleUpdateClip(clip.id, {
                                      startTime: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="w-full px-1.5 py-0.5 rounded bg-[#121620] border border-white/[0.08] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400/60"
                                />
                              </label>

                              <label className="space-y-0.5">
                                <span className="text-slate-400 block">Trim In</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={Math.max(0, clip.trimEnd - 0.1)}
                                  step={0.1}
                                  value={Number(clip.trimStart.toFixed(2))}
                                  onChange={(e) =>
                                    handleUpdateClip(clip.id, {
                                      trimStart: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="w-full px-1.5 py-0.5 rounded bg-[#121620] border border-white/[0.08] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400/60"
                                />
                              </label>

                              <label className="space-y-0.5">
                                <span className="text-slate-400 block">Trim Out</span>
                                <input
                                  type="number"
                                  min={clip.trimStart + 0.1}
                                  max={clip.duration}
                                  step={0.1}
                                  value={Number(clip.trimEnd.toFixed(2))}
                                  onChange={(e) =>
                                    handleUpdateClip(clip.id, {
                                      trimEnd: parseFloat(e.target.value) || clip.duration,
                                    })
                                  }
                                  className="w-full px-1.5 py-0.5 rounded bg-[#121620] border border-white/[0.08] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400/60"
                                />
                              </label>

                              <label className="space-y-0.5">
                                <span className="text-slate-400 block">Fade In</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  step={0.2}
                                  value={Number(clip.fadeIn.toFixed(1))}
                                  onChange={(e) =>
                                    handleUpdateClip(clip.id, {
                                      fadeIn: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="w-full px-1.5 py-0.5 rounded bg-[#121620] border border-white/[0.08] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400/60"
                                />
                              </label>

                              <label className="space-y-0.5">
                                <span className="text-slate-400 block">Fade Out</span>
                                <input
                                  type="number"
                                  min={0}
                                  max={10}
                                  step={0.2}
                                  value={Number(clip.fadeOut.toFixed(1))}
                                  onChange={(e) =>
                                    handleUpdateClip(clip.id, {
                                      fadeOut: Math.max(0, parseFloat(e.target.value) || 0),
                                    })
                                  }
                                  className="w-full px-1.5 py-0.5 rounded bg-[#121620] border border-white/[0.08] font-mono tabular-nums text-slate-100 focus:outline-none focus:border-cyan-400/60"
                                />
                              </label>

                              <label className="space-y-0.5">
                                <span className="text-slate-400 flex justify-between">
                                  <span>{clip.hasVideo ? 'Vol / Vid' : 'Vol'}</span>
                                  <span className="font-mono tabular-nums text-cyan-300">
                                    {Math.round(clip.volume * 100)}%
                                  </span>
                                </span>
                                <input
                                  type="range"
                                  min={0}
                                  max={1.5}
                                  step={0.05}
                                  value={clip.volume}
                                  onChange={(e) =>
                                    handleUpdateClip(clip.id, {
                                      volume: parseFloat(e.target.value),
                                    })
                                  }
                                  className="w-full accent-cyan-400 cursor-pointer"
                                />
                                {clip.hasVideo && (
                                  <input
                                    type="range"
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={clip.videoOpacity}
                                    aria-label="Video opacity"
                                    title={`Video Opacity: ${Math.round(clip.videoOpacity * 100)}%`}
                                    onChange={(e) =>
                                      handleUpdateClip(clip.id, {
                                        videoOpacity: parseFloat(e.target.value),
                                      })
                                    }
                                    className="w-full accent-cyan-400 cursor-pointer"
                                  />
                                )}
                              </label>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
