import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ControlSidebar } from './components/ControlSidebar';
import { DjApplyMixPayload, DjStudioModal } from './components/DjStudioModal';
import { ExportModal, ExportModalView } from './components/ExportModal';
import { LinkDownloadModal } from './components/LinkDownloadModal';
import { MidiMappingModal } from './components/MidiMappingModal';
import { MixStudioModal } from './components/MixStudioModal';
import { PreviewStage } from './components/PreviewStage';
import { buildSyntheticAudioFrame } from './components/PresetThumbnail';
import { ProjectsModal } from './components/ProjectsModal';
import { ShareModal } from './components/ShareModal';
import { TopBar } from './components/TopBar';
import { TransportBar } from './components/TransportBar';
import { useMidiController } from './hooks/useMidiController';
import { StudioSnapshot, useStudioHistory } from './hooks/useStudioHistory';
import type {
  MidiMappableParamKey,
  MidiMapping,
  MidiSignalEvent,
} from './types/midi';
import {
  ASPECT_RATIOS,
  AspectRatioKey,
  BatchCompletionSummary,
  BatchExportJob,
  BeatState,
  createEmptyParticleFlowMap,
  ExportProfile,
  ExportProgressState,
  isProjectCompleted,
  LyricLine,
  MixClipItem,
  MixProjectOptions,
  MocapClipData,
  MotionBlurState,
  normalizeProjectTags,
  Particle,
  ProjectMediaSnapshot,
  ProjectMetaSnapshot,
  ProjectStateVersionRecord,
  ProjectStatus,
  SavedPreset,
  SceneTransitionState,
  ShareableVideoAsset,
  SidebarTab,
  StudioProjectRecord,
  StudioProjectSummary,
  StudioSettings,
  THEME_PRESETS,
} from './types/studio';
import {
  audioBufferToCompactWavBase64,
  computeLowPassRms,
  createInitialBeatState,
  estimateBpmFromAudioBuffer,
  extractWaveformPeaks,
  generateDemoBeat,
  stepBeatDetector,
} from './utils/audioEngine';
import { computeAutoArrangeFraming } from './utils/autoArrange';
import { parseMocapFile } from './utils/bvhParser';
import { renderVisualizerFrame } from './utils/canvasRenderer';
import { resolveAutoCycledColors } from './utils/colorHarmony';
import {
  BrowserNotificationPermission,
  getBrowserNotificationPermission,
  loadNotifyOnBatchComplete,
  persistNotifyOnBatchComplete,
  requestBrowserNotificationPermission,
  triggerBatchCompletionAlert,
} from './utils/batchNotifications';
import {
  BUILT_IN_EXPORT_PROFILES,
  buildExportProfileFromSettings,
  exportProfileToSettingsPatch,
  loadCustomExportProfiles,
  persistCustomExportProfiles,
} from './utils/exportProfiles';
import { createLyricId, parseCaptionsFile } from './utils/lrcParser';
import {
  applyMidiSignalToMappings,
  createMappingFromSignal,
  createStarterMidiMappings,
  formatMidiShortTag,
  formatMidiSourceLabel,
  getMidiParamSpec,
  loadMidiEnabled,
  loadMidiMappings,
  persistMidiEnabled,
  persistMidiMappings,
} from './utils/midiMapping';
import { exportProjectToMp4, sanitizeFileName } from './utils/mp4Exporter';
import {
  createMixVideoFrameResolver,
  disposeMixClips,
  MixVideoFrameResolver,
  renderCombinedMixAudioBuffer,
} from './utils/mixEngine';
import {
  captureCanvasSnapshotPng,
  createPresetId,
  loadSavedPresets,
  parsePresetJson,
  persistSavedPresets,
  validateAndNormalizeSettings,
} from './utils/presetStorage';
import {
  captureProjectThumbnail,
  createProjectId,
  createProjectVersionId,
  deleteProjectRecord,
  duplicateProjectRecord,
  getLastActiveProjectId,
  getProjectRecord,
  listProjectSummaries,
  loadAutoSaveProjects,
  mergeProjectVersionList,
  persistAutoSaveProjects,
  renameProjectRecord,
  saveProjectRecord,
  setLastActiveProjectId,
  setProjectCompletionStatus,
  updateProjectTags,
} from './utils/projectStorage';
import {
  computeTapTempoCalibration,
  TAP_TEMPO_IDLE_RESET_MS,
  TapSample,
} from './utils/tapTempo';

const DEFAULT_SETTINGS: StudioSettings = {
  aspectRatio: '16:9',
  visualizerMode: 'mirrored-bars',
  displayLayer: 'visualizer-lyrics',
  lyricsOnly: false,
  lyricsOnlyLayout: 'full-verse',
  lyricStyle: 'karaoke',
  lyricFont: 'auto',
  themePreset: 'cyberpunk',
  primaryColor: THEME_PRESETS[0].primaryColor,
  secondaryColor: THEME_PRESETS[0].secondaryColor,
  bgColor: THEME_PRESETS[0].bgColor,
  autoCycleColor: false,
  colorCycleSpeed: 1,
  globalHueRotation: 0,
  sensitivity: 1.2,
  barCount: 72,
  smoothing: 0.78,
  motionBlur: 0,
  motionBlurPreset: 'none',
  bloomIntensity: 0,
  bloomPreset: 'off',
  bloomRadius: 1.0,
  bloomSpread: 0.5,
  bloomSaturation: 1.05,
  globalGlow: 0,
  glitchIntensity: 0,
  bassShake: 0,
  beatShake: 0,
  scanlineIntensity: 0,
  scanlineColor: 'auto',
  visualizerScale: 1,
  lyricPosition: 80,
  lyricSize: 1,
  lyricLetterSpacing: 0,
  lyricShadowIntensity: 1,
  lyricBeatSync: false,
  lyricPulseIntensity: 1,
  trackTitle: '',
  artistName: '',
  showTrackOverlay: true,
  bgBlur: 8,
  bgDim: 0.45,
  bgFit: 'cover',
  bgScale: 1,
  bgOffsetX: 0,
  bgOffsetY: 0,
  bgBrightness: 1,
  bgContrast: 1,
  bgSaturation: 1,
  bgVignette: 0,
  bgTintStrength: 0,
  showCoverCard: false,
  coverCardSource: 'auto',
  coverCardPosition: 'top-left',
  coverCardSize: 1,
  coverCardRadius: 14,
  exportFps: 30,
  exportResolution: '720p',
  bitratePreset: 'balanced',
  videoBitrateMbps: 8,
  audioBitrateKbps: 192,
  fadeType: 'linear',
  showSafeZone: false,
  beatDetection: false,
  beatSensitivity: 1.25,
  beatFlash: false,
  beatColorMappingEnabled: false,
  beatColorLow: '#f43f5e',
  beatColorMid: '#a855f7',
  beatColorHigh: '#22d3ee',
  sceneTransitionType: 'crossfade',
  sceneTransitionDuration: 0.45,
  sceneTransitionTarget: 'both',
  particleEnabled: false,
  particleShape: 'circle',
  particleVelocity: 1.0,
  particleLifespan: 1.2,
  particleFlowMap: createEmptyParticleFlowMap(),
  danceEnabled: false,
  danceStyle: 'hip-hop',
  danceMedleyEnabled: false,
  danceMedleyStyles: ['hip-hop', 'mocap-salsa', 'mocap-kpop', 'mocap-breakdance'],
  danceMedleyTrigger: 'seconds',
  danceMedleyIntervalBeats: 8,
  danceMedleyIntervalSeconds: 8,
  danceMedleyBlendDuration: 0.45,
  avatarStyle: 'human-dancer',
  danceAvatarStyle: 'human-dancer',
  dancePlacement: 'center',
  danceCount: 1,
  danceScale: 1,
  danceEnergy: 1,
  danceLyricSync: true,
  danceStrobe: 0,
  danceGlow: 0,
  danceMirror: false,
  danceSpotlightIntensity: 1,
  danceRimColor: 'auto',
  danceShadow: true,
  djFilterCutoff: 1,
  djFilterResonance: 1.6,
  djAutoFilterDepth: 0,
  djDelayMix: 0,
  djDelayFeedback: 0.38,
  djBeatGateDepth: 0,
  djTransientAttack: 0,
  djTransientSustain: 0,
  djTransientDither: 0,
  djNoiseGateThreshold: -80,
};

const INITIAL_EXPORT_STATE: ExportProgressState = {
  status: 'idle',
  currentFrame: 0,
  totalFrames: 0,
  percentage: 0,
  message: '',
};

const INITIAL_MEDIA_SNAPSHOT: ProjectMediaSnapshot = {
  audioFileName: null,
  audioBlob: null,
  audioBuffer: null,
  waveformPeaks: [],
  duration: 0,
  trimStart: 0,
  trimEnd: 0,
  bgImageName: null,
  bgImageBlob: null,
  bgImage: null,
  albumImageName: null,
  albumImageBlob: null,
  albumImage: null,
  mocapClip: null,
  mixClips: [],
  mixOptions: { normalizeMixAudio: true, defaultCrossfadeSec: 1.5 },
};

function createInitialProjectMetaSnapshot(): ProjectMetaSnapshot {
  return {
    id: null,
    name: 'Untitled Project',
    createdAt: new Date().toISOString(),
    status: 'in-progress',
    completedAt: undefined,
    lastExportedAt: undefined,
    exportCount: 0,
    tags: [],
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<SidebarTab>('media');
  const {
    settings,
    lyrics,
    currentEntryId,
    historyEntries,
    canUndo,
    canRedo,
    commit: commitHistory,
    commitProjectSnapshot,
    undo,
    redo,
    jumpTo,
    reset: resetHistory,
  } = useStudioHistory({
    settings: DEFAULT_SETTINGS,
    lyrics: [],
    media: INITIAL_MEDIA_SNAPSHOT,
    projectMeta: createInitialProjectMetaSnapshot(),
  });
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>(() => loadSavedPresets());
  const [customExportProfiles, setCustomExportProfiles] = useState<ExportProfile[]>(() =>
    loadCustomExportProfiles()
  );
  const [projects, setProjects] = useState<StudioProjectSummary[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState('Untitled Project');
  const [activeProjectCompleted, setActiveProjectCompleted] = useState(false);
  const [autoSaveProjects, setAutoSaveProjects] = useState<boolean>(() =>
    loadAutoSaveProjects()
  );
  const [isProjectDirty, setIsProjectDirty] = useState(false);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [isProjectsModalOpen, setIsProjectsModalOpen] = useState(false);

  // Audio state
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopClip, setLoopClip] = useState(true);
  const [previewTrimLoop, setPreviewTrimLoop] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isGeneratingDemo, setIsGeneratingDemo] = useState(false);
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [captionsNotice, setCaptionsNotice] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  // Image overlays & motion capture clip
  const [bgImageName, setBgImageName] = useState<string | null>(null);
  const [albumImageName, setAlbumImageName] = useState<string | null>(null);
  const [mocapClip, setMocapClip] = useState<MocapClipData | null>(null);

  // Multi-track Audio & Video Mixer state
  const [mixClips, setMixClips] = useState<MixClipItem[]>([]);
  const [mixOptions, setMixOptions] = useState<MixProjectOptions>({
    normalizeMixAudio: true,
    defaultCrossfadeSec: 1.5,
  });
  const [isMixModalOpen, setIsMixModalOpen] = useState(false);
  const [isDjModalOpen, setIsDjModalOpen] = useState(false);
  const [isLinkDownloadModalOpen, setIsLinkDownloadModalOpen] = useState(false);

  // Export modal & batch queue state
  const [exportState, setExportState] = useState<ExportProgressState>(INITIAL_EXPORT_STATE);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportModalView, setExportModalView] = useState<ExportModalView>('single');
  const [lastSingleExportAsset, setLastSingleExportAsset] =
    useState<ShareableVideoAsset | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareModalInitialAssetId, setShareModalInitialAssetId] = useState<string | null>(null);
  const [batchJobs, setBatchJobs] = useState<BatchExportJob[]>([]);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [autoDownloadBatch, setAutoDownloadBatch] = useState(true);
  const [notifyOnBatchComplete, setNotifyOnBatchComplete] = useState<boolean>(() =>
    loadNotifyOnBatchComplete()
  );
  const [notificationPermission, setNotificationPermission] =
    useState<BrowserNotificationPermission>(() => getBrowserNotificationPermission());
  const [batchCompletionBanner, setBatchCompletionBanner] =
    useState<BatchCompletionSummary | null>(null);
  const [autoArrangeNotice, setAutoArrangeNotice] = useState<string | null>(null);
  const [midiMappings, setMidiMappings] = useState<MidiMapping[]>(() =>
    loadMidiMappings()
  );
  const [midiEnabled, setMidiEnabled] = useState<boolean>(() => loadMidiEnabled());
  const [isMidiModalOpen, setIsMidiModalOpen] = useState(false);
  const [midiInitialCategory, setMidiInitialCategory] = useState<
    'all' | 'Audio & Visuals' | 'Lyrics & Overlay' | 'Backdrop' | 'DJ Filter & FX'
  >('all');
  const [learningParam, setLearningParam] = useState<MidiMappableParamKey | null>(null);
  const [midiNotice, setMidiNotice] = useState<string | null>(null);
  const [tapTempoBpm, setTapTempoBpm] = useState<number | null>(null);
  const [detectedTrackBpm, setDetectedTrackBpm] = useState<number | null>(null);
  const [tapTempoCount, setTapTempoCount] = useState(0);

  // Refs for Web Audio API, Canvas, Images, and AbortController
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const lowPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const beatAnalyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const audioUrlRef = useRef<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const bgUrlRef = useRef<string | null>(null);
  const bgBlobRef = useRef<Blob | null>(null);
  const albumImageRef = useRef<HTMLImageElement | null>(null);
  const albumUrlRef = useRef<string | null>(null);
  const albumBlobRef = useRef<Blob | null>(null);
  const audioBlobRef = useRef<Blob | null>(null);
  const customThumbnailRef = useRef<string | null>(null);

  const particlesRef = useRef<Particle[]>([]);
  const motionBlurStateRef = useRef<MotionBlurState>({ canvas: null, hasFrame: false });
  const sceneTransitionStateRef = useRef<SceneTransitionState>({
    activeMode: null,
    fromMode: null,
    elapsed: 0,
    duration: 0.45,
  });
  const beatStateRef = useRef<BeatState>(createInitialBeatState());
  const latestBassRmsRef = useRef(0);
  const rollingBassRmsRef = useRef(0.08);
  const tapSamplesRef = useRef<TapSample[]>([]);
  const tapResetTimerRef = useRef<number | null>(null);
  const beatMeterBarRef = useRef<HTMLDivElement | null>(null);
  const albumRotationRef = useRef<{ angle: number }>({ angle: 0 });
  const exportAbortRef = useRef<AbortController | null>(null);
  const lastSingleExportUrlRef = useRef<string | null>(null);

  // Keep latest state accessible inside RAF loop & project autosave without stale closures
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const lyricsRef = useRef(lyrics);
  lyricsRef.current = lyrics;
  const mocapClipRef = useRef<MocapClipData | null>(null);
  mocapClipRef.current = mocapClip;
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  audioBufferRef.current = audioBuffer;
  const mixClipsRef = useRef<MixClipItem[]>([]);
  mixClipsRef.current = mixClips;
  const mixOptionsRef = useRef<MixProjectOptions>(mixOptions);
  mixOptionsRef.current = mixOptions;
  const mixVideoResolverRef = useRef<MixVideoFrameResolver | null>(null);
  const trimRef = useRef({ trimStart, trimEnd, loopClip, previewTrimLoop });
  trimRef.current = { trimStart, trimEnd, loopClip, previewTrimLoop };
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const isMixModalOpenRef = useRef(isMixModalOpen);
  isMixModalOpenRef.current = isMixModalOpen;
  const isDjModalOpenRef = useRef(isDjModalOpen);
  isDjModalOpenRef.current = isDjModalOpen;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  const tapTempoBpmRef = useRef<number | null>(tapTempoBpm);
  tapTempoBpmRef.current = tapTempoBpm;
  const detectedTrackBpmRef = useRef<number | null>(detectedTrackBpm);
  detectedTrackBpmRef.current = detectedTrackBpm;
  const batchJobsRef = useRef(batchJobs);
  batchJobsRef.current = batchJobs;
  const autoDownloadBatchRef = useRef(autoDownloadBatch);
  autoDownloadBatchRef.current = autoDownloadBatch;
  const notifyOnBatchCompleteRef = useRef(notifyOnBatchComplete);
  notifyOnBatchCompleteRef.current = notifyOnBatchComplete;
  const midiMappingsRef = useRef(midiMappings);
  midiMappingsRef.current = midiMappings;
  const midiEnabledRef = useRef(midiEnabled);
  midiEnabledRef.current = midiEnabled;
  const learningParamRef = useRef(learningParam);
  learningParamRef.current = learningParam;
  const batchIdCounterRef = useRef(0);
  const mediaMetaRef = useRef({
    duration,
    waveformPeaks,
    audioFileName,
    bgImageName,
    albumImageName,
  });
  mediaMetaRef.current = {
    duration,
    waveformPeaks,
    audioFileName,
    bgImageName,
    albumImageName,
  };
  const activeProjectRef = useRef<ProjectMetaSnapshot>({
    id: activeProjectId,
    name: activeProjectName,
    createdAt: new Date().toISOString(),
    status: 'in-progress',
    completedAt: undefined,
    lastExportedAt: undefined,
    exportCount: 0,
    tags: [],
  });
  activeProjectRef.current.id = activeProjectId;
  activeProjectRef.current.name = activeProjectName;
  const autoSaveProjectsRef = useRef(autoSaveProjects);
  autoSaveProjectsRef.current = autoSaveProjects;
  const isProjectDirtyRef = useRef(isProjectDirty);
  isProjectDirtyRef.current = isProjectDirty;
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveCurrentProjectRef = useRef<
    (opts?: {
      exported?: boolean;
      forceCreate?: boolean;
      versionReason?: ProjectStateVersionRecord['reason'];
      versionLabel?: string;
    }) => Promise<void>
  >(async () => {});
  const skipDirtyMarkRef = useRef(true);

  const captureCurrentMediaSnapshot = useCallback(
    (overrides?: Partial<ProjectMediaSnapshot>): ProjectMediaSnapshot => {
      const meta = mediaMetaRef.current;
      const trim = trimRef.current;
      return {
        audioFileName: meta.audioFileName,
        audioBlob: audioBlobRef.current,
        audioBuffer: audioBufferRef.current,
        waveformPeaks: [...meta.waveformPeaks],
        duration: meta.duration,
        trimStart: trim.trimStart,
        trimEnd: trim.trimEnd,
        bgImageName: meta.bgImageName,
        bgImageBlob: bgBlobRef.current,
        bgImage: bgImageRef.current,
        albumImageName: meta.albumImageName,
        albumImageBlob: albumBlobRef.current,
        albumImage: albumImageRef.current,
        mocapClip: mocapClipRef.current,
        mixClips: mixClipsRef.current,
        mixOptions: { ...mixOptionsRef.current },
        ...overrides,
      };
    },
    []
  );

  const captureCurrentProjectMetaSnapshot = useCallback(
    (overrides?: Partial<ProjectMetaSnapshot>): ProjectMetaSnapshot => {
      const proj = activeProjectRef.current;
      return {
        id: proj.id,
        name: proj.name,
        createdAt: proj.createdAt,
        status: proj.status ?? 'in-progress',
        completedAt: proj.completedAt,
        lastExportedAt: proj.lastExportedAt,
        exportCount: proj.exportCount ?? 0,
        tags: normalizeProjectTags(proj.tags),
        ...overrides,
      };
    },
    []
  );

  const applySnapshotToStudio = useCallback((snapshot: StudioSnapshot) => {
    const audio = audioElRef.current;
    const { media, projectMeta } = snapshot;

    // 1. Synchronize audio source & trim bounds
    const audioChanged =
      media.audioBlob !== audioBlobRef.current ||
      media.audioBuffer !== audioBufferRef.current ||
      media.audioFileName !== mediaMetaRef.current.audioFileName;

    if (audioChanged) {
      if (audio) {
        audio.pause();
        setIsPlaying(false);
      }
      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      audioBlobRef.current = media.audioBlob;
      if (media.audioBlob) {
        const nextUrl = URL.createObjectURL(media.audioBlob);
        audioUrlRef.current = nextUrl;
        if (audio) {
          audio.src = nextUrl;
          audio.currentTime = media.trimStart || 0;
          audio.defaultPlaybackRate = playbackRateRef.current;
          audio.playbackRate = playbackRateRef.current;
        }
      } else if (audio) {
        audio.removeAttribute('src');
        audio.load();
      }
    }

    audioBufferRef.current = media.audioBuffer;
    setAudioBuffer(media.audioBuffer);
    setWaveformPeaks(media.waveformPeaks);
    setAudioFileName(media.audioFileName);
    setDuration(media.duration);
    setTrimStart(media.trimStart);
    setTrimEnd(media.trimEnd);
    if (audioChanged) {
      setCurrentTime(media.trimStart || 0);
    } else if (audio && audio.src && media.trimEnd > media.trimStart) {
      const cur = audio.currentTime;
      if (cur < media.trimStart || cur > media.trimEnd) {
        const clamped = Math.max(media.trimStart, Math.min(media.trimEnd, cur));
        audio.currentTime = clamped;
        setCurrentTime(clamped);
      }
    }

    // 2. Synchronize backdrop image assignment
    const bgChanged =
      media.bgImageBlob !== bgBlobRef.current ||
      media.bgImage !== bgImageRef.current ||
      media.bgImageName !== mediaMetaRef.current.bgImageName;
    if (bgChanged) {
      if (bgUrlRef.current) {
        URL.revokeObjectURL(bgUrlRef.current);
        bgUrlRef.current = null;
      }
      bgBlobRef.current = media.bgImageBlob;
      if (media.bgImage) {
        bgImageRef.current = media.bgImage;
      } else if (media.bgImageBlob) {
        const bgUrl = URL.createObjectURL(media.bgImageBlob);
        bgUrlRef.current = bgUrl;
        const img = new Image();
        img.onload = () => {
          bgImageRef.current = img;
        };
        img.src = bgUrl;
      } else {
        bgImageRef.current = null;
      }
      setBgImageName(media.bgImageName);
    }

    // 3. Synchronize album cover assignment
    const albumChanged =
      media.albumImageBlob !== albumBlobRef.current ||
      media.albumImage !== albumImageRef.current ||
      media.albumImageName !== mediaMetaRef.current.albumImageName;
    if (albumChanged) {
      if (albumUrlRef.current) {
        URL.revokeObjectURL(albumUrlRef.current);
        albumUrlRef.current = null;
      }
      albumBlobRef.current = media.albumImageBlob;
      if (media.albumImage) {
        albumImageRef.current = media.albumImage;
      } else if (media.albumImageBlob) {
        const albumUrl = URL.createObjectURL(media.albumImageBlob);
        albumUrlRef.current = albumUrl;
        const img = new Image();
        img.onload = () => {
          albumImageRef.current = img;
        };
        img.src = albumUrl;
      } else {
        albumImageRef.current = null;
      }
      setAlbumImageName(media.albumImageName);
    }

    // 4. Synchronize mocap & multi-track mix assignments
    mocapClipRef.current = media.mocapClip;
    setMocapClip(media.mocapClip);

    if (media.mixClips !== mixClipsRef.current) {
      mixVideoResolverRef.current?.dispose();
      const restoredMixClips = media.mixClips.map((clip) => {
        if (clip.hasVideo && !clip.objectUrl && clip.file) {
          return { ...clip, objectUrl: URL.createObjectURL(clip.file) };
        }
        return clip;
      });
      mixVideoResolverRef.current = restoredMixClips.some(
        (c) => c.hasVideo && c.objectUrl
      )
        ? createMixVideoFrameResolver(restoredMixClips)
        : null;
      mixClipsRef.current = restoredMixClips;
      setMixClips(restoredMixClips);
    }
    mixOptionsRef.current = media.mixOptions;
    setMixOptions(media.mixOptions);

    // 5. Synchronize active project record metadata
    activeProjectRef.current = {
      ...projectMeta,
      tags: normalizeProjectTags(projectMeta.tags),
    };
    setActiveProjectId(projectMeta.id);
    setActiveProjectName(projectMeta.name);
    setActiveProjectCompleted(isProjectCompleted(projectMeta));
    setLastActiveProjectId(projectMeta.id);
    customThumbnailRef.current = null;
  }, []);

  // Initialize hidden <audio> element once
  useEffect(() => {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    audioElRef.current = audio;

    const handleEnded = () => {
      const {
        loopClip: shouldLoop,
        previewTrimLoop: shouldPreviewTrimLoop,
        trimStart: start,
      } = trimRef.current;
      if (shouldLoop || shouldPreviewTrimLoop) {
        audio.currentTime = start;
        void audio.play().catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(false);
      }
    };

    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('play', handlePlay);

    return () => {
      audio.pause();
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('play', handlePlay);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (bgUrlRef.current) URL.revokeObjectURL(bgUrlRef.current);
      if (albumUrlRef.current) URL.revokeObjectURL(albumUrlRef.current);
      for (const job of batchJobsRef.current) {
        if (job.downloadUrl) URL.revokeObjectURL(job.downloadUrl);
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close();
      }
    };
  }, []);

  // Sync volume & mute to <audio>
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Sync live preview playback speed to <audio>
  useEffect(() => {
    if (audioElRef.current) {
      audioElRef.current.defaultPlaybackRate = playbackRate;
      audioElRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Sync smoothing to AnalyserNode
  useEffect(() => {
    if (analyserRef.current) {
      analyserRef.current.smoothingTimeConstant = settings.smoothing;
    }
  }, [settings.smoothing]);

  // Keep browser notification permission synced if changed via browser site settings
  useEffect(() => {
    const syncPermission = () => {
      setNotificationPermission(getBrowserNotificationPermission());
    };
    window.addEventListener('focus', syncPermission);
    document.addEventListener('visibilitychange', syncPermission);
    return () => {
      window.removeEventListener('focus', syncPermission);
      document.removeEventListener('visibilitychange', syncPermission);
    };
  }, []);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioElRef.current;
    if (!audio) return null;

    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }

    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    if (!analyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.minDecibels = -100;
      analyser.maxDecibels = -28;
      analyser.smoothingTimeConstant = settingsRef.current.smoothing;
      analyserRef.current = analyser;
    }

    if (!lowPassFilterRef.current) {
      const lowPass = ctx.createBiquadFilter();
      lowPass.type = 'lowpass';
      lowPass.frequency.value = 140;
      lowPass.Q.value = 1.2;
      lowPassFilterRef.current = lowPass;
    }

    if (!beatAnalyserRef.current) {
      const beatAnalyser = ctx.createAnalyser();
      beatAnalyser.fftSize = 1024;
      beatAnalyser.smoothingTimeConstant = 0.25;
      beatAnalyserRef.current = beatAnalyser;
    }

    // Guard against duplicate createMediaElementSource attachment on the same <audio> element
    if (!sourceNodeRef.current) {
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
      source.connect(lowPassFilterRef.current);
      lowPassFilterRef.current.connect(beatAnalyserRef.current);
      sourceNodeRef.current = source;
    }

    return ctx;
  }, []);

  const handleUndo = useCallback(() => {
    const restored = undo();
    if (restored) {
      applySnapshotToStudio(restored);
    }
  }, [undo, applySnapshotToStudio]);

  const handleRedo = useCallback(() => {
    const restored = redo();
    if (restored) {
      applySnapshotToStudio(restored);
    }
  }, [redo, applySnapshotToStudio]);

  const handleJumpToHistory = useCallback(
    (entryId: string) => {
      const restored = jumpTo(entryId);
      if (restored) {
        applySnapshotToStudio(restored);
      }
    },
    [jumpTo, applySnapshotToStudio]
  );

  // Global Ctrl+Z / Ctrl+Y (and Cmd+Z / Cmd+Shift+Z) history shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;

      // Preserve native text undo/redo when actively editing text fields
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'TEXTAREA' ||
          target.isContentEditable ||
          (tag === 'INPUT' &&
            ['text', 'search', 'url', 'email', 'password'].includes(
              (target as HTMLInputElement).type
            ))
        ) {
          return;
        }
      }

      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo, handleRedo]);

  const updateSettings = useCallback(
    (patch: Partial<StudioSettings>) => {
      const keys = Object.keys(patch);
      const coalescedKeys = new Set([
        'sensitivity',
        'beatSensitivity',
        'barCount',
        'smoothing',
        'motionBlur',
        'bloomIntensity',
        'bloomRadius',
        'bloomSpread',
        'bloomSaturation',
        'globalGlow',
        'glitchIntensity',
        'bassShake',
        'beatShake',
        'globalHueRotation',
        'visualizerScale',
        'lyricPosition',
        'lyricSize',
        'lyricLetterSpacing',
        'lyricShadowIntensity',
        'lyricPulseIntensity',
        'videoBitrateMbps',
        'bgBlur',
        'bgDim',
        'primaryColor',
        'secondaryColor',
        'bgColor',
        'trackTitle',
        'artistName',
        'particleVelocity',
        'particleLifespan',
        'particleFlowMap',
        'danceMedleyIntervalBeats',
        'danceMedleyIntervalSeconds',
        'danceMedleyBlendDuration',
      ]);
      const mergeKey =
        keys.length === 1 && coalescedKeys.has(keys[0])
          ? `settings:${keys[0]}`
          : undefined;

      commitHistory(
        (prev) => ({
          ...prev,
          settings: { ...prev.settings, ...patch },
        }),
        mergeKey
      );
    },
    [commitHistory]
  );

  useEffect(() => {
    if (!autoArrangeNotice) return;
    const timer = window.setTimeout(() => {
      setAutoArrangeNotice(null);
    }, 2800);
    return () => window.clearTimeout(timer);
  }, [autoArrangeNotice]);

  const handleAutoArrange = useCallback(() => {
    const result = computeAutoArrangeFraming(
      settingsRef.current,
      lyricsRef.current.length > 0
    );
    updateSettings(result.patch);
    setAutoArrangeNotice(result.summary);
  }, [updateSettings]);

  useEffect(() => {
    return () => {
      if (tapResetTimerRef.current !== null) {
        window.clearTimeout(tapResetTimerRef.current);
      }
    };
  }, []);

  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const prevSamples = tapSamplesRef.current;
    const lastSample = prevSamples[prevSamples.length - 1];
    const isFreshSequence =
      !lastSample || now - lastSample.tapTimeMs > TAP_TEMPO_IDLE_RESET_MS;

    const nextSample: TapSample = {
      tapTimeMs: now,
      bassRms: isPlayingRef.current ? latestBassRmsRef.current : 0,
      rollingRms: isPlayingRef.current ? rollingBassRmsRef.current : 0,
    };

    const nextSamples = isFreshSequence
      ? [nextSample]
      : [...prevSamples.slice(-7), nextSample];
    tapSamplesRef.current = nextSamples;
    setTapTempoCount(nextSamples.length);

    if (tapResetTimerRef.current !== null) {
      window.clearTimeout(tapResetTimerRef.current);
    }
    tapResetTimerRef.current = window.setTimeout(() => {
      tapSamplesRef.current = [];
      setTapTempoCount(0);
      tapResetTimerRef.current = null;
    }, TAP_TEMPO_IDLE_RESET_MS);

    // Give subtle visual beat feedback in live preview while tapping
    beatStateRef.current.burstIntensity = Math.max(
      beatStateRef.current.burstIntensity,
      0.78
    );

    const calibration = computeTapTempoCalibration(
      nextSamples,
      audioElRef.current?.playbackRate ?? 1
    );
    if (!calibration) return;

    setTapTempoBpm(calibration.bpm);
    commitHistory(
      (prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          beatDetection: true,
          beatSensitivity: calibration.beatSensitivity,
        },
      }),
      'tap-tempo:calibrate'
    );
  }, [commitHistory]);

  const midiUpdateSettings = useCallback(
    (patch: Partial<StudioSettings>) => {
      commitHistory(
        (prev) => ({
          ...prev,
          settings: { ...prev.settings, ...patch },
        }),
        'midi:performance'
      );
    },
    [commitHistory]
  );

  useEffect(() => {
    setTapTempoBpm(null);
    if (!audioBuffer) {
      setDetectedTrackBpm(null);
      return;
    }
    try {
      const bpm = estimateBpmFromAudioBuffer(
        audioBuffer,
        settingsRef.current.beatSensitivity
      );
      setDetectedTrackBpm(bpm);
    } catch {
      setDetectedTrackBpm(null);
    }
  }, [audioBuffer]);

  useEffect(() => {
    if (!midiNotice) return;
    const timer = window.setTimeout(() => setMidiNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [midiNotice]);

  const handleMidiSignal = useCallback(
    (signal: MidiSignalEvent) => {
      const targetLearn = learningParamRef.current;
      if (targetLearn) {
        setMidiMappings((prev) => {
          const existing = prev.find((m) => m.targetParam === targetLearn);
          const nextMapping = createMappingFromSignal(targetLearn, signal, existing);
          const next = existing
            ? prev.map((m) => (m.targetParam === targetLearn ? nextMapping : m))
            : [...prev, nextMapping];
          persistMidiMappings(next);
          return next;
        });
        setLearningParam(null);
        setMidiNotice(
          `Bound ${formatMidiSourceLabel(signal)} → ${getMidiParamSpec(targetLearn).label}`
        );
        return;
      }

      if (!midiEnabledRef.current) return;
      const patch = applyMidiSignalToMappings(signal, midiMappingsRef.current);
      if (patch) {
        midiUpdateSettings(patch);
      }
    },
    [midiUpdateSettings]
  );

  const midiController = useMidiController({
    active: isMidiModalOpen || (midiEnabled && midiMappings.length > 0),
    onSignal: handleMidiSignal,
  });

  const handleToggleMidiEnabled = useCallback((enabled: boolean) => {
    setMidiEnabled(enabled);
    persistMidiEnabled(enabled);
  }, []);

  const handleUpdateMidiMapping = useCallback(
    (id: string, patch: Partial<MidiMapping>) => {
      setMidiMappings((prev) => {
        const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m));
        persistMidiMappings(next);
        return next;
      });
    },
    []
  );

  const handleAddManualMidiMapping = useCallback((mapping: MidiMapping) => {
    setMidiMappings((prev) => {
      const withoutTarget = prev.filter((m) => m.targetParam !== mapping.targetParam);
      const next = [...withoutTarget, mapping];
      persistMidiMappings(next);
      return next;
    });
    setMidiNotice(
      `Assigned ${formatMidiSourceLabel(mapping)} → ${getMidiParamSpec(mapping.targetParam).label}`
    );
  }, []);

  const handleRemoveMidiMapping = useCallback((id: string) => {
    setMidiMappings((prev) => {
      const next = prev.filter((m) => m.id !== id);
      persistMidiMappings(next);
      return next;
    });
  }, []);

  const handleLoadStarterMidiMappings = useCallback(() => {
    const starter = createStarterMidiMappings();
    setMidiMappings(starter);
    persistMidiMappings(starter);
    setMidiNotice('Loaded CC 1–4 performance starter pack');
  }, []);

  const handleClearAllMidiMappings = useCallback(() => {
    setMidiMappings([]);
    persistMidiMappings([]);
    setLearningParam(null);
    setMidiNotice('Cleared all MIDI bindings');
  }, []);

  const midiMappingBadges = useMemo(() => {
    const map: Partial<Record<MidiMappableParamKey, string>> = {};
    if (!midiEnabled) return map;
    for (const m of midiMappings) {
      if (m.enabled) {
        map[m.targetParam] = formatMidiShortTag(m);
      }
    }
    return map;
  }, [midiMappings, midiEnabled]);

  const handleLyricsChange = useCallback(
    (nextLyrics: LyricLine[]) => {
      commitHistory(
        (prev) => ({
          ...prev,
          lyrics: nextLyrics,
        }),
        nextLyrics.length === lyricsRef.current.length ? 'lyrics:edit' : undefined
      );
    },
    [commitHistory]
  );

  const handleUploadCaptionsFile = useCallback(
    async (file: File): Promise<number> => {
      try {
        const text = await file.text();
        const parsed = parseCaptionsFile(
          text,
          file.name,
          duration > 0 ? duration : undefined
        );
        if (parsed.length > 0) {
          handleLyricsChange(parsed);
        }
        return parsed.length;
      } catch {
        return 0;
      }
    },
    [duration, handleLyricsChange]
  );

  const decodeImageFileToElement = useCallback(
    (file: File): Promise<{ img: HTMLImageElement; objectUrl: string }> =>
      new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => resolve({ img, objectUrl });
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to decode album artwork image.'));
        };
        img.src = objectUrl;
      }),
    []
  );

  const handleApplyParsedLinkMetadata = useCallback(
    async (meta: {
      trackTitle?: string;
      artistName?: string;
      albumArtFile?: File | null;
    }) => {
      const nextTrackTitle = meta.trackTitle?.trim() ?? '';
      const nextArtistName = meta.artistName?.trim() ?? '';

      let loadedArt: { file: File; img: HTMLImageElement; objectUrl: string } | null = null;
      if (meta.albumArtFile) {
        try {
          const decodedArt = await decodeImageFileToElement(meta.albumArtFile);
          loadedArt = { file: meta.albumArtFile, ...decodedArt };
        } catch {
          loadedArt = null;
        }
      }

      if (loadedArt) {
        customThumbnailRef.current = null;
        if (albumUrlRef.current) {
          URL.revokeObjectURL(albumUrlRef.current);
        }
        albumBlobRef.current = loadedArt.file;
        albumUrlRef.current = loadedArt.objectUrl;
        albumImageRef.current = loadedArt.img;
        setAlbumImageName(loadedArt.file.name);
      }

      const nextMedia = captureCurrentMediaSnapshot(
        loadedArt
          ? {
              albumImageName: loadedArt.file.name,
              albumImageBlob: loadedArt.file,
              albumImage: loadedArt.img,
            }
          : undefined
      );

      commitHistory(
        (prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            ...(nextTrackTitle ? { trackTitle: nextTrackTitle } : {}),
            ...(meta.artistName !== undefined ? { artistName: nextArtistName } : {}),
            ...(nextTrackTitle || nextArtistName ? { showTrackOverlay: true } : {}),
            ...(loadedArt ? { showCoverCard: true } : {}),
          },
          media: nextMedia,
        }),
        {
          label: `Link metadata: ${nextTrackTitle || nextArtistName || 'Updated'}`,
          kind: 'settings',
        }
      );
      setIsProjectDirty(true);
    },
    [captureCurrentMediaSnapshot, commitHistory, decodeImageFileToElement]
  );

  const handleAudioFileSelect = useCallback(
    async (
      file: File,
      metadataOverride?: {
        trackTitle?: string;
        artistName?: string;
        albumArtFile?: File | null;
      }
    ) => {
      setAudioError(null);
      const audio = audioElRef.current;
      if (!audio) return;

      try {
        audio.pause();
        setIsPlaying(false);

        if (mixClipsRef.current.length > 0 || mixVideoResolverRef.current) {
          mixVideoResolverRef.current?.dispose();
          mixVideoResolverRef.current = null;
          mixClipsRef.current = [];
          setMixClips([]);
        }

        const ctx = await ensureAudioGraph();
        if (!ctx) throw new Error('Web Audio API is unavailable.');

        const arrayBuf = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));

        const previousAudioFileName = mediaMetaRef.current.audioFileName;
        const isSwitchingTracks = Boolean(
          previousAudioFileName && previousAudioFileName !== file.name
        );

        // Save outgoing project work before switching to a different audio file
        if (isSwitchingTracks && autoSaveProjectsRef.current) {
          await saveCurrentProjectRef.current();
          const blankMeta = createInitialProjectMetaSnapshot();
          activeProjectRef.current = blankMeta;
          setActiveProjectId(null);
          setActiveProjectName('Untitled Project');
          setActiveProjectCompleted(false);
          setLastActiveProjectId(null);
        }

        let loadedArt: { file: File; img: HTMLImageElement; objectUrl: string } | null = null;
        if (metadataOverride?.albumArtFile) {
          try {
            const decodedArt = await decodeImageFileToElement(metadataOverride.albumArtFile);
            loadedArt = { file: metadataOverride.albumArtFile, ...decodedArt };
          } catch {
            loadedArt = null;
          }
        }

        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
        }
        audioBlobRef.current = file;
        audioBufferRef.current = decoded;
        const blobUrl = URL.createObjectURL(file);
        audioUrlRef.current = blobUrl;
        audio.src = blobUrl;
        audio.currentTime = 0;
        audio.defaultPlaybackRate = playbackRateRef.current;
        audio.playbackRate = playbackRateRef.current;

        if (loadedArt) {
          customThumbnailRef.current = null;
          if (albumUrlRef.current) {
            URL.revokeObjectURL(albumUrlRef.current);
          }
          albumBlobRef.current = loadedArt.file;
          albumUrlRef.current = loadedArt.objectUrl;
          albumImageRef.current = loadedArt.img;
          setAlbumImageName(loadedArt.file.name);
        }

        const peaks = extractWaveformPeaks(decoded, 200);
        const safeTrimEnd = Number(decoded.duration.toFixed(2));
        setAudioBuffer(decoded);
        setWaveformPeaks(peaks);
        setAudioFileName(file.name);
        setDuration(decoded.duration);
        setCurrentTime(0);
        setTrimStart(0);
        setTrimEnd(safeTrimEnd);

        const baseTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
        const overrideTitle = metadataOverride?.trackTitle?.trim() ?? '';
        const overrideArtist = metadataOverride?.artistName?.trim() ?? '';
        const nextMedia = captureCurrentMediaSnapshot({
          audioFileName: file.name,
          audioBlob: file,
          audioBuffer: decoded,
          waveformPeaks: peaks,
          duration: decoded.duration,
          trimStart: 0,
          trimEnd: safeTrimEnd,
          mixClips: [],
          ...(loadedArt
            ? {
                albumImageName: loadedArt.file.name,
                albumImageBlob: loadedArt.file,
                albumImage: loadedArt.img,
              }
            : {}),
        });
        const nextProjectMeta = captureCurrentProjectMetaSnapshot();
        commitHistory(
          (prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              trackTitle: overrideTitle
                ? overrideTitle
                : isSwitchingTracks
                  ? baseTitle
                  : prev.settings.trackTitle || baseTitle,
              ...(metadataOverride?.artistName !== undefined
                ? { artistName: overrideArtist }
                : {}),
              ...(overrideTitle || overrideArtist ? { showTrackOverlay: true } : {}),
              ...(loadedArt ? { showCoverCard: true } : {}),
            },
            media: nextMedia,
            projectMeta: nextProjectMeta,
          }),
          { label: `Loaded audio: ${file.name}`, kind: 'media' }
        );
      } catch (err) {
        setAudioError(
          err instanceof Error ? err.message : 'Unable to decode this audio file.'
        );
      }
    },
    [
      captureCurrentMediaSnapshot,
      captureCurrentProjectMetaSnapshot,
      commitHistory,
      decodeImageFileToElement,
      ensureAudioGraph,
    ]
  );

  const handleLoadDemo = useCallback(async () => {
    setAudioError(null);
    setIsGeneratingDemo(true);
    const audio = audioElRef.current;

    try {
      if (audio) {
        audio.pause();
        setIsPlaying(false);
      }

      if (mixClipsRef.current.length > 0 || mixVideoResolverRef.current) {
        mixVideoResolverRef.current?.dispose();
        mixVideoResolverRef.current = null;
        mixClipsRef.current = [];
        setMixClips([]);
      }

      const demo = await generateDemoBeat();
      await ensureAudioGraph();

      const previousAudioFileName = mediaMetaRef.current.audioFileName;
      if (previousAudioFileName && previousAudioFileName !== demo.fileName) {
        if (autoSaveProjectsRef.current) {
          await saveCurrentProjectRef.current();
        }
        const blankMeta = createInitialProjectMetaSnapshot();
        activeProjectRef.current = blankMeta;
        setActiveProjectId(null);
        setActiveProjectName('Untitled Project');
        setActiveProjectCompleted(false);
        setLastActiveProjectId(null);
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      audioBlobRef.current = demo.blob;
      audioBufferRef.current = demo.audioBuffer;
      audioUrlRef.current = demo.blobUrl;

      if (audio) {
        audio.src = demo.blobUrl;
        audio.currentTime = 0;
        audio.defaultPlaybackRate = playbackRateRef.current;
        audio.playbackRate = playbackRateRef.current;
      }

      const peaks = extractWaveformPeaks(demo.audioBuffer, 200);
      const safeTrimEnd = Number(demo.audioBuffer.duration.toFixed(2));
      setAudioBuffer(demo.audioBuffer);
      setWaveformPeaks(peaks);
      setAudioFileName(demo.fileName);
      setDuration(demo.audioBuffer.duration);
      setCurrentTime(0);
      setTrimStart(0);
      setTrimEnd(safeTrimEnd);

      const nextMedia = captureCurrentMediaSnapshot({
        audioFileName: demo.fileName,
        audioBlob: demo.blob,
        audioBuffer: demo.audioBuffer,
        waveformPeaks: peaks,
        duration: demo.audioBuffer.duration,
        trimStart: 0,
        trimEnd: safeTrimEnd,
        mixClips: [],
      });
      const nextProjectMeta = captureCurrentProjectMetaSnapshot();
      commitHistory(
        (prev) => ({
          settings: {
            ...prev.settings,
            trackTitle: demo.trackTitle,
            artistName: demo.artistName,
          },
          lyrics: demo.lyrics,
          media: nextMedia,
          projectMeta: nextProjectMeta,
        }),
        { label: 'Loaded demo beat', kind: 'media' }
      );
    } catch (err) {
      setAudioError(
        err instanceof Error ? err.message : 'Failed to generate demo beat.'
      );
    } finally {
      setIsGeneratingDemo(false);
    }
  }, [
    captureCurrentMediaSnapshot,
    captureCurrentProjectMetaSnapshot,
    commitHistory,
    ensureAudioGraph,
  ]);

  const handleBgImageSelect = useCallback(
    (file: File | null) => {
      customThumbnailRef.current = null;
      if (bgUrlRef.current) {
        URL.revokeObjectURL(bgUrlRef.current);
        bgUrlRef.current = null;
      }
      if (!file) {
        bgImageRef.current = null;
        bgBlobRef.current = null;
        setBgImageName(null);
        const nextMedia = captureCurrentMediaSnapshot({
          bgImageName: null,
          bgImageBlob: null,
          bgImage: null,
        });
        commitHistory(
          (prev) => ({ ...prev, media: nextMedia }),
          { label: 'Cleared backdrop image', kind: 'media' }
        );
        return;
      }
      bgBlobRef.current = file;
      const url = URL.createObjectURL(file);
      bgUrlRef.current = url;
      const img = new Image();
      img.onload = () => {
        bgImageRef.current = img;
        setBgImageName(file.name);
        const nextMedia = captureCurrentMediaSnapshot({
          bgImageName: file.name,
          bgImageBlob: file,
          bgImage: img,
        });
        commitHistory(
          (prev) => ({ ...prev, media: nextMedia }),
          { label: `Backdrop: ${file.name}`, kind: 'media' }
        );
      };
      img.src = url;
    },
    [captureCurrentMediaSnapshot, commitHistory]
  );

  const handleAlbumImageSelect = useCallback(
    (file: File | null) => {
      customThumbnailRef.current = null;
      if (albumUrlRef.current) {
        URL.revokeObjectURL(albumUrlRef.current);
        albumUrlRef.current = null;
      }
      if (!file) {
        albumImageRef.current = null;
        albumBlobRef.current = null;
        setAlbumImageName(null);
        const nextMedia = captureCurrentMediaSnapshot({
          albumImageName: null,
          albumImageBlob: null,
          albumImage: null,
        });
        commitHistory(
          (prev) => ({ ...prev, media: nextMedia }),
          { label: 'Cleared cover art', kind: 'media' }
        );
        return;
      }
      albumBlobRef.current = file;
      const url = URL.createObjectURL(file);
      albumUrlRef.current = url;
      const img = new Image();
      img.onload = () => {
        albumImageRef.current = img;
        setAlbumImageName(file.name);
        const nextMedia = captureCurrentMediaSnapshot({
          albumImageName: file.name,
          albumImageBlob: file,
          albumImage: img,
        });
        commitHistory(
          (prev) => ({ ...prev, media: nextMedia }),
          { label: `Cover Art: ${file.name}`, kind: 'media' }
        );
      };
      img.src = url;
    },
    [captureCurrentMediaSnapshot, commitHistory]
  );

  const handleCopyBgToAlbum = useCallback(() => {
    const blob = bgBlobRef.current;
    if (!blob) return;
    customThumbnailRef.current = null;
    if (albumUrlRef.current) {
      URL.revokeObjectURL(albumUrlRef.current);
      albumUrlRef.current = null;
    }
    albumBlobRef.current = blob;
    const url = URL.createObjectURL(blob);
    albumUrlRef.current = url;
    const targetName = mediaMetaRef.current.bgImageName || 'cover-from-backdrop.png';
    const img = new Image();
    img.onload = () => {
      albumImageRef.current = img;
      setAlbumImageName(targetName);
      setIsProjectDirty(true);
      const nextMedia = captureCurrentMediaSnapshot({
        albumImageName: targetName,
        albumImageBlob: blob,
        albumImage: img,
      });
      commitHistory(
        (prev) => ({ ...prev, media: nextMedia }),
        { label: `Copied backdrop to cover`, kind: 'media' }
      );
    };
    img.src = url;
  }, [captureCurrentMediaSnapshot, commitHistory]);

  const handleCopyAlbumToBg = useCallback(() => {
    const blob = albumBlobRef.current;
    if (!blob) return;
    customThumbnailRef.current = null;
    if (bgUrlRef.current) {
      URL.revokeObjectURL(bgUrlRef.current);
      bgUrlRef.current = null;
    }
    bgBlobRef.current = blob;
    const url = URL.createObjectURL(blob);
    bgUrlRef.current = url;
    const targetName = mediaMetaRef.current.albumImageName || 'backdrop-from-cover.png';
    const img = new Image();
    img.onload = () => {
      bgImageRef.current = img;
      setBgImageName(targetName);
      setIsProjectDirty(true);
      const nextMedia = captureCurrentMediaSnapshot({
        bgImageName: targetName,
        bgImageBlob: blob,
        bgImage: img,
      });
      commitHistory(
        (prev) => ({ ...prev, media: nextMedia }),
        { label: `Copied cover to backdrop`, kind: 'media' }
      );
    };
    img.src = url;
  }, [captureCurrentMediaSnapshot, commitHistory]);

  const handleMocapFileSelect = useCallback(
    async (
      file: File
    ): Promise<{ ok: true; clip: MocapClipData } | { ok: false; error: string }> => {
      try {
        const text = await file.text();
        const clip = parseMocapFile(text, file.name);
        mocapClipRef.current = clip;
        setMocapClip(clip);
        const nextMedia = captureCurrentMediaSnapshot({ mocapClip: clip });
        commitHistory(
          (prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              danceEnabled: true,
              danceStyle: 'mocap-custom',
            },
            media: nextMedia,
          }),
          { label: `Mocap: ${clip.name}`, kind: 'media' }
        );
        return { ok: true, clip };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Unable to parse motion capture file.',
        };
      }
    },
    [captureCurrentMediaSnapshot, commitHistory]
  );

  const handleClearMocapClip = useCallback(() => {
    mocapClipRef.current = null;
    setMocapClip(null);
    const nextMedia = captureCurrentMediaSnapshot({ mocapClip: null });
    commitHistory(
      (prev) => ({
        ...prev,
        settings:
          prev.settings.danceStyle === 'mocap-custom'
            ? { ...prev.settings, danceStyle: 'hip-hop' }
            : prev.settings,
        media: nextMedia,
      }),
      { label: 'Cleared mocap clip', kind: 'media' }
    );
  }, [captureCurrentMediaSnapshot, commitHistory]);

  const loadProjectIntoStudio = useCallback(
    async (
      record: StudioProjectRecord,
      opts?: { resetHistoryStack?: boolean; snapshotLabel?: string }
    ) => {
      setIsLoadingProject(true);
      setAudioError(null);
      const audio = audioElRef.current;

      try {
        if (audio) {
          audio.pause();
          setIsPlaying(false);
        }

        if (audioUrlRef.current) {
          URL.revokeObjectURL(audioUrlRef.current);
          audioUrlRef.current = null;
        }
        if (bgUrlRef.current) {
          URL.revokeObjectURL(bgUrlRef.current);
          bgUrlRef.current = null;
        }
        if (albumUrlRef.current) {
          URL.revokeObjectURL(albumUrlRef.current);
          albumUrlRef.current = null;
        }
        if (mixClipsRef.current.length > 0 || mixVideoResolverRef.current) {
          mixVideoResolverRef.current?.dispose();
          mixVideoResolverRef.current = null;
          mixClipsRef.current = [];
          setMixClips([]);
        }

        audioBlobRef.current = record.audioBlob;
        bgBlobRef.current = record.bgImageBlob;
        albumBlobRef.current = record.albumImageBlob;
        customThumbnailRef.current = null;

        let decodedAudio: AudioBuffer | null = null;
        let nextPeaks: number[] = [];
        let nextDuration = 0;
        let nextTrimStart = 0;
        let nextTrimEnd = 0;
        let nextAudioFileName: string | null = null;

        if (record.audioBlob) {
          if (!audioCtxRef.current) {
            const AudioCtx =
              window.AudioContext ||
              (window as unknown as { webkitAudioContext: typeof AudioContext })
                .webkitAudioContext;
            audioCtxRef.current = new AudioCtx();
          }
          const arrayBuf = await record.audioBlob.arrayBuffer();
          decodedAudio = await audioCtxRef.current.decodeAudioData(arrayBuf.slice(0));
          const blobUrl = URL.createObjectURL(record.audioBlob);
          audioUrlRef.current = blobUrl;
          if (audio) {
            audio.src = blobUrl;
            audio.currentTime = record.trimStart || 0;
            audio.defaultPlaybackRate = playbackRateRef.current;
            audio.playbackRate = playbackRateRef.current;
          }
          nextPeaks =
            record.waveformPeaks.length > 0
              ? record.waveformPeaks
              : extractWaveformPeaks(decodedAudio, 200);
          nextDuration = decodedAudio.duration;
          nextTrimStart = Math.max(0, Math.min(record.trimStart || 0, nextDuration));
          nextTrimEnd =
            record.trimEnd > nextTrimStart
              ? Math.min(nextDuration, record.trimEnd)
              : Number(nextDuration.toFixed(2));
          nextAudioFileName = record.audioFileName;

          audioBufferRef.current = decodedAudio;
          setAudioBuffer(decodedAudio);
          setWaveformPeaks(nextPeaks);
          setAudioFileName(nextAudioFileName);
          setDuration(nextDuration);
          setTrimStart(nextTrimStart);
          setTrimEnd(nextTrimEnd);
          setCurrentTime(nextTrimStart);
        } else {
          if (audio) {
            audio.removeAttribute('src');
            audio.load();
          }
          audioBufferRef.current = null;
          setAudioBuffer(null);
          setWaveformPeaks([]);
          setAudioFileName(null);
          setDuration(0);
          setTrimStart(0);
          setTrimEnd(0);
          setCurrentTime(0);
        }

        let loadedBgImage: HTMLImageElement | null = null;
        if (record.bgImageBlob) {
          const bgUrl = URL.createObjectURL(record.bgImageBlob);
          bgUrlRef.current = bgUrl;
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = bgUrl;
          });
          loadedBgImage = img.naturalWidth > 0 ? img : null;
          bgImageRef.current = loadedBgImage;
          setBgImageName(record.bgImageName);
        } else {
          bgImageRef.current = null;
          setBgImageName(null);
        }

        let loadedAlbumImage: HTMLImageElement | null = null;
        if (record.albumImageBlob) {
          const albumUrl = URL.createObjectURL(record.albumImageBlob);
          albumUrlRef.current = albumUrl;
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = albumUrl;
          });
          loadedAlbumImage = img.naturalWidth > 0 ? img : null;
          albumImageRef.current = loadedAlbumImage;
          setAlbumImageName(record.albumImageName);
        } else {
          albumImageRef.current = null;
          setAlbumImageName(null);
        }

        const nextMocap = record.mocapClip ?? null;
        mocapClipRef.current = nextMocap;
        setMocapClip(nextMocap);

        const normalized =
          validateAndNormalizeSettings(record.settings, DEFAULT_SETTINGS) ??
          DEFAULT_SETTINGS;
        const nextLyrics = Array.isArray(record.lyrics) ? record.lyrics : [];
        const nextProjectMeta: ProjectMetaSnapshot = {
          id: record.id,
          name: record.name,
          createdAt: record.createdAt,
          status:
            record.status ??
            (isProjectCompleted(record) ? 'completed' : 'in-progress'),
          completedAt: record.completedAt,
          lastExportedAt: record.lastExportedAt,
          exportCount: record.exportCount ?? 0,
          tags: normalizeProjectTags(record.tags),
        };
        const nextMedia: ProjectMediaSnapshot = {
          audioFileName: nextAudioFileName,
          audioBlob: record.audioBlob,
          audioBuffer: decodedAudio,
          waveformPeaks: nextPeaks,
          duration: nextDuration,
          trimStart: nextTrimStart,
          trimEnd: nextTrimEnd,
          bgImageName: record.bgImageBlob ? record.bgImageName : null,
          bgImageBlob: record.bgImageBlob,
          bgImage: loadedBgImage,
          albumImageName: record.albumImageBlob ? record.albumImageName : null,
          albumImageBlob: record.albumImageBlob,
          albumImage: loadedAlbumImage,
          mocapClip: nextMocap,
          mixClips: [],
          mixOptions: { ...mixOptionsRef.current },
        };

        const loadedSnapshot: StudioSnapshot = {
          settings: normalized,
          lyrics: nextLyrics,
          media: nextMedia,
          projectMeta: nextProjectMeta,
        };

        skipDirtyMarkRef.current = true;
        if (opts?.resetHistoryStack) {
          resetHistory(
            loadedSnapshot,
            opts.snapshotLabel || `Opened project: ${record.name}`
          );
        } else {
          commitProjectSnapshot(
            loadedSnapshot,
            opts?.snapshotLabel || `Opened project: ${record.name}`
          );
        }

        setActiveProjectId(record.id);
        setActiveProjectName(record.name);
        setActiveProjectCompleted(isProjectCompleted(record));
        activeProjectRef.current = nextProjectMeta;
        setLastActiveProjectId(record.id);
        setIsProjectDirty(false);
      } catch (err) {
        setAudioError(
          err instanceof Error ? err.message : 'Failed to load saved project.'
        );
      } finally {
        setIsLoadingProject(false);
      }
    },
    [commitProjectSnapshot, resetHistory]
  );

  const hasMeaningfulProjectData = useCallback(() => {
    const meta = mediaMetaRef.current;
    const s = settingsRef.current;
    return Boolean(
      activeProjectRef.current.id ||
        audioBlobRef.current ||
        meta.audioFileName ||
        bgBlobRef.current ||
        meta.bgImageName ||
        albumBlobRef.current ||
        meta.albumImageName ||
        lyricsRef.current.length > 0 ||
        s.trackTitle.trim().length > 0 ||
        s.artistName.trim().length > 0
    );
  }, []);

  const buildCurrentProjectVersionRecord = useCallback(
    (
      reason: ProjectStateVersionRecord['reason'],
      label?: string
    ): ProjectStateVersionRecord => {
      const now = new Date().toISOString();
      const meta = mediaMetaRef.current;
      const trim = trimRef.current;
      const s = settingsRef.current;
      const currentLyrics = lyricsRef.current;
      return {
        id: createProjectVersionId(),
        label:
          label?.trim() ||
          (reason === 'export'
            ? 'Exported Project State'
            : reason === 'checkpoint'
            ? 'Manual Project Snapshot'
            : 'Saved Project State'),
        createdAt: now,
        reason,
        audioFileName: meta.audioFileName,
        bgImageName: meta.bgImageName,
        albumImageName: meta.albumImageName,
        mocapName: mocapClipRef.current?.name ?? null,
        mixClipCount: mixClipsRef.current.length,
        lyricsCount: currentLyrics.length,
        trimStart: trim.trimStart,
        trimEnd: trim.trimEnd,
        duration: meta.duration,
        visualizerMode: s.visualizerMode,
        aspectRatio: s.aspectRatio,
        thumbnailDataUrl:
          customThumbnailRef.current || captureProjectThumbnail(previewCanvasRef.current),
        settings: { ...s },
        lyrics: currentLyrics.map((l) => ({ ...l })),
        waveformPeaks: [...meta.waveformPeaks],
        audioBlob: audioBlobRef.current,
        bgImageBlob: bgBlobRef.current,
        albumImageBlob: albumBlobRef.current,
        mocapClip: mocapClipRef.current,
      };
    },
    []
  );

  const buildCurrentProjectRecord = useCallback(
    (
      id: string,
      name: string,
      createdAt: string,
      status: ProjectStatus,
      completedAt?: string,
      lastExportedAt?: string,
      exportCount?: number,
      tags?: string[],
      versions?: ProjectStateVersionRecord[]
    ): StudioProjectRecord => {
      const now = new Date().toISOString();
      const meta = mediaMetaRef.current;
      const trim = trimRef.current;
      return {
        id,
        name,
        createdAt,
        updatedAt: now,
        status,
        completedAt,
        lastExportedAt,
        exportCount,
        tags: normalizeProjectTags(tags),
        settings: { ...settingsRef.current },
        lyrics: lyricsRef.current.map((l) => ({ ...l })),
        trimStart: trim.trimStart,
        trimEnd: trim.trimEnd,
        duration: meta.duration,
        waveformPeaks: [...meta.waveformPeaks],
        audioFileName: meta.audioFileName,
        bgImageName: meta.bgImageName,
        albumImageName: meta.albumImageName,
        thumbnailDataUrl:
          customThumbnailRef.current || captureProjectThumbnail(previewCanvasRef.current),
        hasAudioBlob: Boolean(audioBlobRef.current),
        audioBlob: audioBlobRef.current,
        bgImageBlob: bgBlobRef.current,
        albumImageBlob: albumBlobRef.current,
        mocapClip: mocapClipRef.current,
        versions,
      };
    },
    []
  );

  const refreshProjectsList = useCallback(async () => {
    const list = await listProjectSummaries();
    setProjects(list);
  }, []);

  const deriveProjectName = useCallback((existingName?: string) => {
    const title = settingsRef.current.trackTitle.trim();
    const cleanedFile = mediaMetaRef.current.audioFileName
      ?.replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .trim();
    if (existingName && existingName !== 'Untitled Project') {
      return existingName;
    }
    return title || cleanedFile || 'Untitled Project';
  }, []);

  const saveCurrentProject = useCallback(
    (opts?: {
      exported?: boolean;
      forceCreate?: boolean;
      versionReason?: ProjectStateVersionRecord['reason'];
      versionLabel?: string;
    }): Promise<void> => {
      const task = saveChainRef.current.then(async () => {
        if (!opts?.forceCreate && !hasMeaningfulProjectData()) {
          return;
        }
        setIsSavingProject(true);
        try {
          const proj = activeProjectRef.current;
          const now = new Date().toISOString();
          const id = proj.id || createProjectId();
          const createdAt = proj.id ? proj.createdAt : now;
          const name = deriveProjectName(proj.id ? proj.name : undefined);
          const lastExportedAt = opts?.exported ? now : proj.lastExportedAt;
          const exportCount = opts?.exported
            ? (proj.exportCount ?? 0) + 1
            : proj.exportCount;
          const status: ProjectStatus = opts?.exported
            ? 'completed'
            : proj.status ??
              (isProjectCompleted({
                status: proj.status,
                lastExportedAt,
                exportCount,
              })
                ? 'completed'
                : 'in-progress');
          const completedAt =
            status === 'completed' ? proj.completedAt ?? now : undefined;

          const tags = normalizeProjectTags(proj.tags);
          const existingRecord = proj.id
            ? await getProjectRecord(proj.id).catch(() => null)
            : null;
          const shouldRecordVersion = Boolean(
            opts?.exported || opts?.forceCreate || opts?.versionReason || !existingRecord
          );
          const nextVersions = shouldRecordVersion
            ? mergeProjectVersionList(
                existingRecord?.versions,
                buildCurrentProjectVersionRecord(
                  opts?.exported
                    ? 'export'
                    : opts?.versionReason ?? 'save',
                  opts?.versionLabel
                ),
                opts?.versionReason === 'checkpoint'
              )
            : existingRecord?.versions ?? [];

          const record = buildCurrentProjectRecord(
            id,
            name,
            createdAt,
            status,
            completedAt,
            lastExportedAt,
            exportCount,
            tags,
            nextVersions
          );
          await saveProjectRecord(record);

          activeProjectRef.current = {
            id,
            name,
            createdAt,
            status,
            completedAt,
            lastExportedAt,
            exportCount,
            tags,
          };
          setActiveProjectId(id);
          setActiveProjectName(name);
          setActiveProjectCompleted(status === 'completed');
          setLastActiveProjectId(id);
          setIsProjectDirty(false);
          await refreshProjectsList();
        } catch (err) {
          setAudioError(err instanceof Error ? err.message : 'Failed to save project.');
        } finally {
          setIsSavingProject(false);
        }
      });

      saveChainRef.current = task.catch(() => {});
      return task;
    },
    [
      buildCurrentProjectRecord,
      buildCurrentProjectVersionRecord,
      deriveProjectName,
      hasMeaningfulProjectData,
      refreshProjectsList,
    ]
  );

  saveCurrentProjectRef.current = saveCurrentProject;

  const handleSaveAsNewProject = useCallback(
    (requestedName: string, requestedTags?: string[]): Promise<void> => {
      const task = saveChainRef.current.then(async () => {
        setIsSavingProject(true);
        try {
          const now = new Date().toISOString();
          const id = createProjectId();
          const finalName =
            requestedName.trim() ||
            settingsRef.current.trackTitle.trim() ||
            mediaMetaRef.current.audioFileName?.replace(/\.[^.]+$/, '') ||
            'Untitled Project';
          const normalizedTags = normalizeProjectTags(requestedTags);
          const initialVersion = buildCurrentProjectVersionRecord(
            'save',
            `Initial: ${finalName}`
          );
          const record = buildCurrentProjectRecord(
            id,
            finalName,
            now,
            'in-progress',
            undefined,
            undefined,
            0,
            normalizedTags,
            [initialVersion]
          );
          await saveProjectRecord(record);
          const nextProjectMeta: ProjectMetaSnapshot = {
            id,
            name: finalName,
            createdAt: now,
            status: 'in-progress',
            completedAt: undefined,
            lastExportedAt: undefined,
            exportCount: 0,
            tags: normalizedTags,
          };
          activeProjectRef.current = nextProjectMeta;
          setActiveProjectId(id);
          setActiveProjectName(finalName);
          setActiveProjectCompleted(false);
          setLastActiveProjectId(id);
          setIsProjectDirty(false);
          commitProjectSnapshot(
            (prev) => ({
              ...prev,
              projectMeta: nextProjectMeta,
            }),
            `Saved project: ${finalName}`
          );
          await refreshProjectsList();
        } catch (err) {
          setAudioError(err instanceof Error ? err.message : 'Failed to save project.');
        } finally {
          setIsSavingProject(false);
        }
      });

      saveChainRef.current = task.catch(() => {});
      return task;
    },
    [
      buildCurrentProjectRecord,
      buildCurrentProjectVersionRecord,
      commitProjectSnapshot,
      refreshProjectsList,
    ]
  );

  const handleSaveActiveProject = useCallback(async () => {
    await saveCurrentProject({
      forceCreate: true,
      versionReason: 'save',
      versionLabel: `Saved: ${activeProjectRef.current.name || 'Project'}`,
    });
  }, [saveCurrentProject]);

  const handleCaptureProjectSnapshot = useCallback(
    async (label?: string) => {
      const cleanLabel =
        label?.trim() ||
        `${activeProjectRef.current.name || 'Project'} Snapshot`;
      const snapshot: StudioSnapshot = {
        settings: { ...settingsRef.current },
        lyrics: lyricsRef.current.map((l) => ({ ...l })),
        media: captureCurrentMediaSnapshot(),
        projectMeta: captureCurrentProjectMetaSnapshot(),
      };
      commitProjectSnapshot(snapshot, cleanLabel);

      if (activeProjectRef.current.id || hasMeaningfulProjectData()) {
        await saveCurrentProject({
          forceCreate: true,
          versionReason: 'checkpoint',
          versionLabel: cleanLabel,
        });
      }
    },
    [
      captureCurrentMediaSnapshot,
      captureCurrentProjectMetaSnapshot,
      commitProjectSnapshot,
      hasMeaningfulProjectData,
      saveCurrentProject,
    ]
  );

  const handleRestoreProjectVersion = useCallback(
    async (projectId: string, versionId: string) => {
      const record = await getProjectRecord(projectId);
      const version = record?.versions?.find((v) => v.id === versionId);
      if (!record || !version) return;

      setIsLoadingProject(true);
      setAudioError(null);
      try {
        let decodedAudio: AudioBuffer | null = null;
        let nextPeaks = version.waveformPeaks ?? [];
        let nextDuration = version.duration ?? 0;
        let nextTrimStart = version.trimStart ?? 0;
        let nextTrimEnd = version.trimEnd ?? 0;

        if (version.audioBlob) {
          if (
            version.audioBlob === audioBlobRef.current &&
            audioBufferRef.current
          ) {
            decodedAudio = audioBufferRef.current;
          } else {
            if (!audioCtxRef.current) {
              const AudioCtx =
                window.AudioContext ||
                (window as unknown as { webkitAudioContext: typeof AudioContext })
                  .webkitAudioContext;
              audioCtxRef.current = new AudioCtx();
            }
            const arrayBuf = await version.audioBlob.arrayBuffer();
            decodedAudio = await audioCtxRef.current.decodeAudioData(
              arrayBuf.slice(0)
            );
          }
          nextDuration = decodedAudio.duration;
          if (nextPeaks.length === 0) {
            nextPeaks = extractWaveformPeaks(decodedAudio, 200);
          }
          nextTrimStart = Math.max(0, Math.min(version.trimStart || 0, nextDuration));
          nextTrimEnd =
            version.trimEnd > nextTrimStart
              ? Math.min(nextDuration, version.trimEnd)
              : Number(nextDuration.toFixed(2));
        }

        let loadedBgImage: HTMLImageElement | null = null;
        if (version.bgImageBlob) {
          if (version.bgImageBlob === bgBlobRef.current && bgImageRef.current) {
            loadedBgImage = bgImageRef.current;
          } else {
            const tempUrl = URL.createObjectURL(version.bgImageBlob);
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = tempUrl;
            });
            URL.revokeObjectURL(tempUrl);
            loadedBgImage = img.naturalWidth > 0 ? img : null;
          }
        }

        let loadedAlbumImage: HTMLImageElement | null = null;
        if (version.albumImageBlob) {
          if (
            version.albumImageBlob === albumBlobRef.current &&
            albumImageRef.current
          ) {
            loadedAlbumImage = albumImageRef.current;
          } else {
            const tempUrl = URL.createObjectURL(version.albumImageBlob);
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
              img.src = tempUrl;
            });
            URL.revokeObjectURL(tempUrl);
            loadedAlbumImage = img.naturalWidth > 0 ? img : null;
          }
        }

        const normalizedSettings =
          validateAndNormalizeSettings(version.settings, DEFAULT_SETTINGS) ??
          DEFAULT_SETTINGS;
        const restoredSnapshot: StudioSnapshot = {
          settings: normalizedSettings,
          lyrics: Array.isArray(version.lyrics)
            ? version.lyrics.map((l) => ({ ...l }))
            : [],
          media: {
            audioFileName: version.audioFileName,
            audioBlob: version.audioBlob,
            audioBuffer: decodedAudio,
            waveformPeaks: nextPeaks,
            duration: nextDuration,
            trimStart: nextTrimStart,
            trimEnd: nextTrimEnd,
            bgImageName: version.bgImageBlob ? version.bgImageName : null,
            bgImageBlob: version.bgImageBlob,
            bgImage: loadedBgImage,
            albumImageName: version.albumImageBlob ? version.albumImageName : null,
            albumImageBlob: version.albumImageBlob,
            albumImage: loadedAlbumImage,
            mocapClip: version.mocapClip ?? null,
            mixClips: [],
            mixOptions: { ...mixOptionsRef.current },
          },
          projectMeta: {
            id: record.id,
            name: record.name,
            createdAt: record.createdAt,
            status:
              record.status ??
              (isProjectCompleted(record) ? 'completed' : 'in-progress'),
            completedAt: record.completedAt,
            lastExportedAt: record.lastExportedAt,
            exportCount: record.exportCount ?? 0,
            tags: normalizeProjectTags(record.tags),
          },
        };

        applySnapshotToStudio(restoredSnapshot);
        commitProjectSnapshot(
          restoredSnapshot,
          `Restored: ${version.label}`
        );
        setIsProjectDirty(true);
        setIsProjectsModalOpen(false);
      } catch (err) {
        setAudioError(
          err instanceof Error
            ? err.message
            : 'Failed to restore project state snapshot.'
        );
      } finally {
        setIsLoadingProject(false);
      }
    },
    [applySnapshotToStudio, commitProjectSnapshot]
  );

  const handleOpenProject = useCallback(
    async (id: string) => {
      if (
        autoSaveProjectsRef.current &&
        isProjectDirtyRef.current &&
        hasMeaningfulProjectData() &&
        activeProjectRef.current.id !== id
      ) {
        await saveCurrentProject();
      }
      const record = await getProjectRecord(id);
      if (!record) return;
      await loadProjectIntoStudio(record, { resetHistoryStack: false });
      setIsProjectsModalOpen(false);
    },
    [hasMeaningfulProjectData, loadProjectIntoStudio, saveCurrentProject]
  );

  const handleRenameProject = useCallback(
    async (id: string, name: string) => {
      await renameProjectRecord(id, name);
      if (activeProjectRef.current.id === id) {
        activeProjectRef.current.name = name;
        setActiveProjectName(name);
        commitHistory(
          (prev) => ({
            ...prev,
            projectMeta: captureCurrentProjectMetaSnapshot({ name }),
          }),
          { label: `Renamed project: ${name}`, kind: 'project-state' }
        );
      }
      await refreshProjectsList();
    },
    [captureCurrentProjectMetaSnapshot, commitHistory, refreshProjectsList]
  );

  const handleDuplicateProject = useCallback(
    async (id: string) => {
      await duplicateProjectRecord(id);
      await refreshProjectsList();
    },
    [refreshProjectsList]
  );

  const handleToggleProjectCompleted = useCallback(
    async (id: string, completed: boolean) => {
      const updated = await setProjectCompletionStatus(id, completed);
      if (updated && activeProjectRef.current.id === id) {
        const nextStatus: ProjectStatus =
          updated.status ?? (completed ? 'completed' : 'in-progress');
        activeProjectRef.current.status = nextStatus;
        activeProjectRef.current.completedAt = updated.completedAt;
        setActiveProjectCompleted(completed);
        commitHistory(
          (prev) => ({
            ...prev,
            projectMeta: captureCurrentProjectMetaSnapshot({
              status: nextStatus,
              completedAt: updated.completedAt,
            }),
          }),
          {
            label: completed ? 'Marked project completed' : 'Reopened project',
            kind: 'project-state',
          }
        );
      }
      await refreshProjectsList();
    },
    [captureCurrentProjectMetaSnapshot, commitHistory, refreshProjectsList]
  );

  const handleUpdateProjectTags = useCallback(
    async (id: string, tags: string[]) => {
      const updated = await updateProjectTags(id, tags);
      if (updated && activeProjectRef.current.id === id) {
        const cleanTags = normalizeProjectTags(updated.tags);
        activeProjectRef.current.tags = cleanTags;
        commitHistory(
          (prev) => ({
            ...prev,
            projectMeta: captureCurrentProjectMetaSnapshot({ tags: cleanTags }),
          }),
          { label: 'Updated project tags', kind: 'project-state' }
        );
      }
      await refreshProjectsList();
    },
    [captureCurrentProjectMetaSnapshot, commitHistory, refreshProjectsList]
  );

  const handleDeleteProject = useCallback(
    async (id: string) => {
      await deleteProjectRecord(id);
      if (activeProjectRef.current.id === id) {
        activeProjectRef.current = createInitialProjectMetaSnapshot();
        setActiveProjectId(null);
        setActiveProjectName('Untitled Project');
        setActiveProjectCompleted(false);
        setLastActiveProjectId(null);
        setIsProjectDirty(true);
      }
      await refreshProjectsList();
    },
    [refreshProjectsList]
  );

  const handleToggleAutoSaveProjects = useCallback(
    (enabled: boolean) => {
      setAutoSaveProjects(enabled);
      persistAutoSaveProjects(enabled);
      if (enabled && isProjectDirtyRef.current && hasMeaningfulProjectData()) {
        void saveCurrentProject();
      }
    },
    [hasMeaningfulProjectData, saveCurrentProject]
  );

  const handleNewBlankProject = useCallback(() => {
    void (async () => {
      if (
        autoSaveProjectsRef.current &&
        isProjectDirtyRef.current &&
        hasMeaningfulProjectData()
      ) {
        await saveCurrentProject();
      }

      const audio = audioElRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }
      setIsPlaying(false);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }
      if (bgUrlRef.current) {
        URL.revokeObjectURL(bgUrlRef.current);
        bgUrlRef.current = null;
      }
      if (albumUrlRef.current) {
        URL.revokeObjectURL(albumUrlRef.current);
        albumUrlRef.current = null;
      }
      if (mixClipsRef.current.length > 0 || mixVideoResolverRef.current) {
        mixVideoResolverRef.current?.dispose();
        mixVideoResolverRef.current = null;
        mixClipsRef.current = [];
        setMixClips([]);
      }

      audioBlobRef.current = null;
      audioBufferRef.current = null;
      bgBlobRef.current = null;
      albumBlobRef.current = null;
      bgImageRef.current = null;
      albumImageRef.current = null;
      mocapClipRef.current = null;
      customThumbnailRef.current = null;

      setAudioBuffer(null);
      setWaveformPeaks([]);
      setAudioFileName(null);
      setBgImageName(null);
      setAlbumImageName(null);
      setMocapClip(null);
      setDuration(0);
      setTrimStart(0);
      setTrimEnd(0);
      setCurrentTime(0);

      const blankMeta = createInitialProjectMetaSnapshot();
      activeProjectRef.current = blankMeta;
      skipDirtyMarkRef.current = true;
      commitProjectSnapshot(
        {
          settings: DEFAULT_SETTINGS,
          lyrics: [],
          media: INITIAL_MEDIA_SNAPSHOT,
          projectMeta: blankMeta,
        },
        'Started blank project'
      );
      setActiveProjectId(null);
      setActiveProjectName('Untitled Project');
      setActiveProjectCompleted(false);
      setLastActiveProjectId(null);
      setIsProjectDirty(false);
      setIsProjectsModalOpen(false);
    })();
  }, [commitProjectSnapshot, hasMeaningfulProjectData, saveCurrentProject]);

  // Restore saved project library & last active project on startup
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await listProjectSummaries();
      if (cancelled) return;
      setProjects(list);

      const lastId = getLastActiveProjectId();
      if (lastId) {
        const record = await getProjectRecord(lastId);
        if (!cancelled && record) {
          await loadProjectIntoStudio(record, { resetHistoryStack: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadProjectIntoStudio]);

  // Track edits & automatically store projects with meaningful work
  useEffect(() => {
    if (skipDirtyMarkRef.current) {
      skipDirtyMarkRef.current = false;
      return;
    }

    setIsProjectDirty(true);
    if (!autoSaveProjects || !hasMeaningfulProjectData()) return;

    const timer = setTimeout(() => {
      void saveCurrentProject();
    }, 1400);
    return () => clearTimeout(timer);
  }, [
    settings,
    lyrics,
    trimStart,
    trimEnd,
    audioFileName,
    bgImageName,
    albumImageName,
    autoSaveProjects,
    hasMeaningfulProjectData,
    saveCurrentProject,
  ]);

  // Flush pending auto-save when switching tabs or closing the page
  useEffect(() => {
    const flushIfDirty = () => {
      if (
        autoSaveProjectsRef.current &&
        isProjectDirtyRef.current &&
        hasMeaningfulProjectData()
      ) {
        void saveCurrentProjectRef.current();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushIfDirty();
      }
    };
    window.addEventListener('pagehide', flushIfDirty);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushIfDirty);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [hasMeaningfulProjectData]);

  const handleTogglePlay = useCallback(async () => {
    const audio = audioElRef.current;
    if (!audio || !audioBuffer) return;

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await ensureAudioGraph();
      audio.playbackRate = playbackRateRef.current;
      const {
        trimStart: start,
        trimEnd: end,
        loopClip: shouldLoop,
        previewTrimLoop: shouldPreviewTrimLoop,
      } = trimRef.current;
      if (
        (shouldLoop || shouldPreviewTrimLoop) &&
        end > start &&
        (audio.currentTime < start || audio.currentTime >= end - 0.02)
      ) {
        audio.currentTime = start;
        setCurrentTime(start);
      }
      await audio.play();
    } catch (err) {
      setAudioError(err instanceof Error ? err.message : 'Playback blocked by browser.');
    }
  }, [audioBuffer, ensureAudioGraph]);

  const handleSeek = useCallback(
    (time: number) => {
      const audio = audioElRef.current;
      const { trimStart: start, trimEnd: end, previewTrimLoop: strictTrim } = trimRef.current;
      let clamped = Math.max(0, Math.min(time, duration || time));
      if (strictTrim && end > start) {
        clamped = Math.max(start, Math.min(end, clamped));
      }
      setCurrentTime(clamped);
      if (audio && audio.src) {
        audio.currentTime = clamped;
      }
    },
    [duration]
  );

  const handleTrimChange = useCallback(
    (start: number, end: number) => {
      setTrimStart(start);
      setTrimEnd(end);
      if (trimRef.current.previewTrimLoop && end > start) {
        const audio = audioElRef.current;
        const cur = audio && audio.src ? audio.currentTime : currentTimeRef.current;
        if (cur < start || cur >= end) {
          const nextPos =
            !audio?.paused && cur >= end ? start : Math.max(start, Math.min(end, cur));
          setCurrentTime(nextPos);
          if (audio && audio.src) {
            audio.currentTime = nextPos;
          }
        }
      }
      const nextMedia = captureCurrentMediaSnapshot({
        trimStart: start,
        trimEnd: end,
      });
      commitHistory(
        (prev) => ({
          ...prev,
          media: nextMedia,
        }),
        { mergeKey: 'media:trim', label: 'Adjusted trim range', kind: 'media' }
      );
    },
    [captureCurrentMediaSnapshot, commitHistory]
  );

  const handleTogglePreviewTrimLoop = useCallback(() => {
    setPreviewTrimLoop((prev) => {
      const next = !prev;
      if (next) {
        const { trimStart: start, trimEnd: end } = trimRef.current;
        const audio = audioElRef.current;
        if (end > start) {
          const cur = audio && audio.src ? audio.currentTime : currentTimeRef.current;
          if (cur < start || cur >= end) {
            setCurrentTime(start);
            if (audio && audio.src) {
              audio.currentTime = start;
            }
          }
        }
      }
      return next;
    });
  }, []);

  const handlePreviewSceneTransition = useCallback(() => {
    const activeSettings = settingsRef.current;
    if (activeSettings.lyricsOnly || activeSettings.displayLayer === 'dance-only') return;
    if ((activeSettings.sceneTransitionType ?? 'none') === 'none') return;
    const altMode =
      activeSettings.visualizerMode === 'mirrored-bars'
        ? 'circular-ring'
        : 'mirrored-bars';
    sceneTransitionStateRef.current = {
      activeMode: activeSettings.visualizerMode,
      fromMode: altMode,
      elapsed: 0,
      duration: Math.max(0.15, Math.min(1.5, activeSettings.sceneTransitionDuration ?? 0.45)),
    };
  }, []);

  // Global keyboard shortcuts: Spacebar (Play/Pause), Left/Right Arrows (Seek), S (Safe Zone grid)
  useEffect(() => {
    const isModalOpen =
      isExportModalOpen ||
      exportState.status !== 'idle' ||
      isProjectsModalOpen ||
      isMidiModalOpen ||
      isMixModalOpen ||
      isDjModalOpen;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isModalOpen) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          target.isContentEditable ||
          Boolean(target.closest('[role="slider"]'))
        ) {
          return;
        }
      }

      if (e.code === 'Space' || e.key === ' ') {
        if (document.querySelector('[data-tap-sync="true"]')) {
          return;
        }
        e.preventDefault();
        if (!e.repeat && audioBuffer) {
          void handleTogglePlay();
        }
        return;
      }

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!audioBuffer || duration <= 0) return;
        e.preventDefault();
        const stepSec = e.shiftKey ? 1 : 5;
        const delta = e.key === 'ArrowLeft' ? -stepSec : stepSec;
        const audio = audioElRef.current;
        const baseTime =
          audio && audio.src ? audio.currentTime : currentTimeRef.current;
        handleSeek(Math.max(0, Math.min(duration, baseTime + delta)));
        return;
      }

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (!e.repeat) {
          updateSettings({ showSafeZone: !settingsRef.current.showSafeZone });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    audioBuffer,
    duration,
    exportState.status,
    handleSeek,
    handleTogglePlay,
    isExportModalOpen,
    isMidiModalOpen,
    isMixModalOpen,
    isDjModalOpen,
    isProjectsModalOpen,
    updateSettings,
  ]);

  // Live 60 FPS Visualizer Render Loop
  useEffect(() => {
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

      if (isMixModalOpenRef.current || isDjModalOpenRef.current) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const audio = audioElRef.current;
      const analyser = analyserRef.current;
      const beatAnalyser = beatAnalyserRef.current;
      const canvas = previewCanvasRef.current;
      const activeSettings = settingsRef.current;

      // Enforce Loop Clip & Preview Trim Loop boundaries during playback
      let trackTime = audio ? audio.currentTime : 0;
      if (audio && !audio.paused) {
        const {
          loopClip: shouldLoop,
          previewTrimLoop: strictTrimLoop,
          trimStart: start,
          trimEnd: end,
        } = trimRef.current;
        if (end > start) {
          if (strictTrimLoop && trackTime < start) {
            audio.currentTime = start;
            trackTime = start;
          } else if ((strictTrimLoop || shouldLoop) && trackTime >= end) {
            audio.currentTime = start;
            trackTime = start;
          }
        }
        setCurrentTime(trackTime);
      }

      let lowPassRms = 0;
      if (analyser && isPlayingRef.current) {
        analyser.getByteFrequencyData(freqBuf);
        analyser.getByteTimeDomainData(waveBuf);
        if (beatAnalyser) {
          beatAnalyser.getByteTimeDomainData(lowPassWaveBuf);
          lowPassRms = computeLowPassRms(lowPassWaveBuf);
          latestBassRmsRef.current = lowPassRms;
          rollingBassRmsRef.current =
            rollingBassRmsRef.current * 0.94 + lowPassRms * 0.06;
        }
      } else {
        // Gentle idle decay when paused so bars settle cleanly
        for (let i = 0; i < freqBuf.length; i++) {
          freqBuf[i] = Math.floor(freqBuf[i] * 0.86);
        }
        for (let i = 0; i < waveBuf.length; i++) {
          waveBuf[i] = Math.round(128 + (waveBuf[i] - 128) * 0.85);
        }
      }

      const activeDuration =
        mediaMetaRef.current.duration ||
        trimRef.current.trimEnd ||
        undefined;
      const cycled = resolveAutoCycledColors(
        activeSettings,
        trackTime,
        activeDuration
      );

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

      if (canvas) {
        const { width, height } = ASPECT_RATIOS[activeSettings.aspectRatio];
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const baseBpm =
            tapTempoBpmRef.current ??
            detectedTrackBpmRef.current ??
            beatStateRef.current.estimatedBpm ??
            120;
          const liveBpm = baseBpm * playbackRateRef.current;
          const mixResolver = mixVideoResolverRef.current;
          const activeMixBgFrame =
            mixResolver && mixResolver.hasActiveVideo()
              ? mixResolver.resolvePreviewFrame(trackTime, width, height)
              : null;

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
            bgImage: activeMixBgFrame ?? bgImageRef.current,
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
  }, []);

  // Clean up retained single export URL and mix resources on unmount
  useEffect(() => {
    return () => {
      if (lastSingleExportUrlRef.current) {
        URL.revokeObjectURL(lastSingleExportUrlRef.current);
        lastSingleExportUrlRef.current = null;
      }
      mixVideoResolverRef.current?.dispose();
      mixVideoResolverRef.current = null;
      disposeMixClips(mixClipsRef.current);
    };
  }, []);

  // Offline MP4 Export Trigger
  const handleStartExport = useCallback(
    async (
      overrideSettings?: StudioSettings,
      overrideMedia?: {
        audioBuffer: AudioBuffer;
        trimStart: number;
        trimEnd: number;
        audioFileName?: string;
        lyrics?: LyricLine[];
      }
    ) => {
      const targetBuffer = overrideMedia?.audioBuffer ?? audioBuffer;
      if (!targetBuffer || isBatchRunning) return;

      const activeSettings = overrideSettings ?? settings;
      const activeTrimStart = overrideMedia?.trimStart ?? trimStart;
      const activeTrimEnd = overrideMedia?.trimEnd ?? trimEnd;
      const activeLyrics = overrideMedia?.lyrics ?? lyrics;
      const activeFileName =
        overrideMedia?.audioFileName ?? mediaMetaRef.current.audioFileName;

      // Pause live playback cleanly during offline render
      if (audioElRef.current && !audioElRef.current.paused) {
        audioElRef.current.pause();
      }

      const controller = new AbortController();
      exportAbortRef.current = controller;

      setExportModalView('single');
      setIsExportModalOpen(true);
      setExportState({
        status: 'preparing',
        currentFrame: 0,
        totalFrames: 1,
        percentage: 0,
        message: 'Initializing video & audio encoders...',
      });

      const mixResolver = mixVideoResolverRef.current;
      const resolveBgImageAtTime =
        mixResolver && mixResolver.hasActiveVideo()
          ? (t: number, w: number, h: number) => mixResolver.resolveExportFrame(t, w, h)
          : undefined;

      try {
        const result = await exportProjectToMp4({
          audioBuffer: targetBuffer,
          trimStart: activeTrimStart,
          trimEnd: activeTrimEnd,
          settings: activeSettings,
          lyrics: activeLyrics,
          bgImage: bgImageRef.current,
          albumImage: albumImageRef.current,
          resolveBgImageAtTime,
          mocapClip: mocapClipRef.current,
          signal: controller.signal,
          onProgress: (next) => setExportState(next),
        });

        if (
          lastSingleExportUrlRef.current &&
          lastSingleExportUrlRef.current !== result.downloadUrl
        ) {
          URL.revokeObjectURL(lastSingleExportUrlRef.current);
        }
        lastSingleExportUrlRef.current = result.downloadUrl;

        setLastSingleExportAsset({
          id: 'latest-single-export',
          label:
            activeSettings.trackTitle.trim() ||
            activeFileName?.replace(/\.[^.]+$/, '') ||
            'Latest Export',
          downloadUrl: result.downloadUrl,
          downloadFileName: result.downloadFileName,
          fileSizeBytes: result.fileSizeBytes,
          aspectRatio: activeSettings.aspectRatio,
          exportResolution: activeSettings.exportResolution,
          durationSec: Math.max(0.5, activeTrimEnd - activeTrimStart),
          trackTitle: activeSettings.trackTitle,
          artistName: activeSettings.artistName,
          visualizerMode: activeSettings.visualizerMode,
          createdAt: new Date().toISOString(),
        });

        if (autoSaveProjectsRef.current || activeProjectRef.current.id) {
          void saveCurrentProject({ exported: true, forceCreate: true });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setExportState({
            ...INITIAL_EXPORT_STATE,
            status: 'cancelled',
            message: 'Export cancelled.',
          });
          return;
        }
        setExportState({
          status: 'error',
          currentFrame: 0,
          totalFrames: 0,
          percentage: 0,
          message: 'Export failed',
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [audioBuffer, isBatchRunning, trimStart, trimEnd, settings, lyrics, saveCurrentProject]
  );

  const handleApplyMixToStudio = useCallback(
    async (params: {
      clips: MixClipItem[];
      options: MixProjectOptions;
      trackTitle: string;
      trimStart: number;
      trimEnd: number;
      action: 'apply' | 'export' | 'batch';
    }) => {
      const {
        clips: nextClips,
        options: nextOptions,
        trackTitle,
        trimStart: mixTrimStart,
        trimEnd: mixTrimEnd,
        action,
      } = params;
      setAudioError(null);

      const audio = audioElRef.current;
      if (audio) {
        audio.pause();
        setIsPlaying(false);
      }

      await ensureAudioGraph();
      const rendered = await renderCombinedMixAudioBuffer(nextClips, {
        normalize: nextOptions.normalizeMixAudio,
      });

      mixVideoResolverRef.current?.dispose();
      mixVideoResolverRef.current = nextClips.some((c) => c.hasVideo && c.objectUrl)
        ? createMixVideoFrameResolver(nextClips)
        : null;

      mixClipsRef.current = nextClips;
      mixOptionsRef.current = nextOptions;
      setMixClips(nextClips);
      setMixOptions(nextOptions);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const mixFileName = `${sanitizeFileName(trackTitle || 'combined-mix')}.wav`;
      audioBlobRef.current = rendered.wavBlob;
      audioBufferRef.current = rendered.audioBuffer;
      const wavUrl = URL.createObjectURL(rendered.wavBlob);
      audioUrlRef.current = wavUrl;

      const safeTrimStart = Number(
        Math.max(0, Math.min(Math.max(0, rendered.duration - 0.1), mixTrimStart)).toFixed(2)
      );
      const safeTrimEnd = Number(
        Math.max(
          Math.min(rendered.duration, safeTrimStart + 0.1),
          Math.min(
            rendered.duration,
            mixTrimEnd > mixTrimStart ? mixTrimEnd : rendered.duration
          )
        ).toFixed(2)
      );

      if (audio) {
        audio.src = wavUrl;
        audio.currentTime = safeTrimStart;
        audio.defaultPlaybackRate = playbackRateRef.current;
        audio.playbackRate = playbackRateRef.current;
      }

      setAudioBuffer(rendered.audioBuffer);
      setWaveformPeaks(rendered.waveformPeaks);
      setAudioFileName(mixFileName);
      setDuration(rendered.duration);
      setCurrentTime(safeTrimStart);
      setTrimStart(safeTrimStart);
      setTrimEnd(safeTrimEnd);

      const nextSettings: StudioSettings = {
        ...settingsRef.current,
        trackTitle: trackTitle.trim() || settingsRef.current.trackTitle || 'Combined Mix',
      };
      const nextMedia = captureCurrentMediaSnapshot({
        audioFileName: mixFileName,
        audioBlob: rendered.wavBlob,
        audioBuffer: rendered.audioBuffer,
        waveformPeaks: rendered.waveformPeaks,
        duration: rendered.duration,
        trimStart: safeTrimStart,
        trimEnd: safeTrimEnd,
        mixClips: nextClips,
        mixOptions: nextOptions,
      });
      commitHistory(
        (prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            trackTitle: nextSettings.trackTitle,
          },
          media: nextMedia,
        }),
        { label: `Applied mix (${nextClips.length} tracks)`, kind: 'media' }
      );

      setIsMixModalOpen(false);

      if (action === 'export') {
        void handleStartExport(nextSettings, {
          audioBuffer: rendered.audioBuffer,
          trimStart: safeTrimStart,
          trimEnd: safeTrimEnd,
          audioFileName: mixFileName,
        });
      } else if (action === 'batch') {
        setExportState(INITIAL_EXPORT_STATE);
        setExportModalView('batch');
        setIsExportModalOpen(true);
      }
    },
    [
      captureCurrentMediaSnapshot,
      commitHistory,
      ensureAudioGraph,
      handleStartExport,
    ]
  );

  const handleApplyDjMixToStudio = useCallback(
    async (payload: DjApplyMixPayload) => {
      setAudioError(null);
      const audio = audioElRef.current;
      if (audio) {
        audio.pause();
        setIsPlaying(false);
      }

      await ensureAudioGraph();

      mixVideoResolverRef.current?.dispose();
      mixVideoResolverRef.current = payload.videoResolver;
      mixClipsRef.current = [];
      setMixClips([]);

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
      }
      const mixFileName = `${sanitizeFileName(payload.trackTitle || 'dj-mix')}.wav`;
      audioBlobRef.current = payload.wavBlob;
      audioBufferRef.current = payload.audioBuffer;
      const wavUrl = URL.createObjectURL(payload.wavBlob);
      audioUrlRef.current = wavUrl;

      const safeTrimStart = Math.max(
        0,
        Math.min(payload.trimStart ?? 0, Math.max(0, payload.duration - 0.5))
      );
      const safeTrimEnd =
        payload.trimEnd && payload.trimEnd > safeTrimStart
          ? Math.min(payload.duration, Number(payload.trimEnd.toFixed(2)))
          : Number(Math.max(0.5, payload.duration).toFixed(2));

      if (audio) {
        audio.src = wavUrl;
        audio.currentTime = safeTrimStart;
        audio.defaultPlaybackRate = 1;
        audio.playbackRate = 1;
      }

      setAudioBuffer(payload.audioBuffer);
      setWaveformPeaks(payload.waveformPeaks);
      setAudioFileName(mixFileName);
      setDuration(payload.duration);
      setCurrentTime(safeTrimStart);
      setTrimStart(safeTrimStart);
      setTrimEnd(safeTrimEnd);

      const nextSettings: StudioSettings = {
        ...settingsRef.current,
        trackTitle: payload.trackTitle.trim() || settingsRef.current.trackTitle || 'DJ Mix',
      };
      const nextMedia = captureCurrentMediaSnapshot({
        audioFileName: mixFileName,
        audioBlob: payload.wavBlob,
        audioBuffer: payload.audioBuffer,
        waveformPeaks: payload.waveformPeaks,
        duration: payload.duration,
        trimStart: safeTrimStart,
        trimEnd: safeTrimEnd,
        mixClips: [],
        mixOptions: mixOptionsRef.current,
      });
      commitHistory(
        (prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            trackTitle: nextSettings.trackTitle,
          },
          lyrics: payload.mergedLyrics,
          media: nextMedia,
        }),
        { label: `Applied DJ Mix (${payload.trackTitle})`, kind: 'media' }
      );

      setIsDjModalOpen(false);

      if (payload.action === 'export') {
        void handleStartExport(nextSettings, {
          audioBuffer: payload.audioBuffer,
          trimStart: safeTrimStart,
          trimEnd: safeTrimEnd,
          audioFileName: mixFileName,
          lyrics: payload.mergedLyrics,
        });
      } else if (payload.action === 'batch') {
        setExportState(INITIAL_EXPORT_STATE);
        setExportModalView('batch');
        setIsExportModalOpen(true);
      }
    },
    [captureCurrentMediaSnapshot, commitHistory, ensureAudioGraph, handleStartExport]
  );

  const handleOpenSingleExport = useCallback(() => {
    if (!audioBuffer || isBatchRunning) return;
    setExportState(INITIAL_EXPORT_STATE);
    setExportModalView('single');
    setIsExportModalOpen(true);
  }, [audioBuffer, isBatchRunning]);

  const handleOpenBatchExport = useCallback(() => {
    if (!audioBuffer) return;
    setExportModalView('batch');
    setIsExportModalOpen(true);
  }, [audioBuffer]);

  const handleAddBatchJobs = useCallback(
    (
      newItems: Array<{
        label: string;
        trimStart: number;
        trimEnd: number;
        settings: StudioSettings;
      }>
    ) => {
      setBatchJobs((prev) => [
        ...prev,
        ...newItems.map((item) => {
          batchIdCounterRef.current += 1;
          return {
            id: `batch-${Date.now()}-${batchIdCounterRef.current}`,
            label: item.label,
            trimStart: item.trimStart,
            trimEnd: item.trimEnd,
            settings: { ...item.settings },
            status: 'queued' as const,
            currentFrame: 0,
            totalFrames: 0,
            percentage: 0,
            message: 'Queued',
          };
        }),
      ]);
    },
    []
  );

  const handleUpdateBatchJob = useCallback(
    (
      id: string,
      patch: Partial<
        Pick<BatchExportJob, 'label' | 'trimStart' | 'trimEnd' | 'settings' | 'status'>
      >
    ) => {
      setBatchJobs((prev) =>
        prev.map((job) => {
          if (job.id !== id) return job;
          const next = { ...job, ...patch };
          if (patch.status === 'queued') {
            if (job.downloadUrl) URL.revokeObjectURL(job.downloadUrl);
            next.downloadUrl = undefined;
            next.downloadFileName = undefined;
            next.error = undefined;
            next.percentage = 0;
            next.currentFrame = 0;
            next.totalFrames = 0;
            next.elapsedMs = undefined;
            next.message = 'Queued';
          }
          return next;
        })
      );
    },
    []
  );

  const handleMoveBatchJob = useCallback((id: string, direction: 'up' | 'down') => {
    setBatchJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === id);
      if (idx === -1) return prev;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(idx, 1);
      copy.splice(targetIdx, 0, moved);
      return copy;
    });
  }, []);

  const handleDuplicateBatchJob = useCallback((id: string) => {
    setBatchJobs((prev) => {
      const idx = prev.findIndex((j) => j.id === id);
      if (idx === -1) return prev;
      const source = prev[idx];
      batchIdCounterRef.current += 1;
      const clone: BatchExportJob = {
        id: `batch-${Date.now()}-${batchIdCounterRef.current}`,
        label: `${source.label} (Copy)`,
        trimStart: source.trimStart,
        trimEnd: source.trimEnd,
        settings: { ...source.settings },
        status: 'queued',
        currentFrame: 0,
        totalFrames: 0,
        percentage: 0,
        message: 'Queued',
      };
      const copy = [...prev];
      copy.splice(idx + 1, 0, clone);
      return copy;
    });
  }, []);

  const handleRemoveBatchJob = useCallback((id: string) => {
    setBatchJobs((prev) => {
      const target = prev.find((j) => j.id === id);
      if (target?.downloadUrl) URL.revokeObjectURL(target.downloadUrl);
      return prev.filter((j) => j.id !== id);
    });
  }, []);

  const handleClearBatchJobs = useCallback((scope: 'completed' | 'all') => {
    if (scope === 'all') {
      setBatchCompletionBanner(null);
    }
    setBatchJobs((prev) => {
      if (scope === 'completed') {
        prev.forEach((j) => {
          if (j.status === 'completed' && j.downloadUrl) {
            URL.revokeObjectURL(j.downloadUrl);
          }
        });
        return prev.filter((j) => j.status !== 'completed');
      }
      prev.forEach((j) => {
        if (j.downloadUrl) URL.revokeObjectURL(j.downloadUrl);
      });
      return [];
    });
  }, []);

  const handleRequestNotificationPermission = useCallback(async () => {
    const perm = await requestBrowserNotificationPermission();
    setNotificationPermission(perm);
    if (perm === 'granted') {
      setNotifyOnBatchComplete(true);
      persistNotifyOnBatchComplete(true);
    }
  }, []);

  const handleToggleNotifyOnBatchComplete = useCallback(async (enabled: boolean) => {
    setNotifyOnBatchComplete(enabled);
    persistNotifyOnBatchComplete(enabled);
    if (enabled && getBrowserNotificationPermission() === 'default') {
      const perm = await requestBrowserNotificationPermission();
      setNotificationPermission(perm);
    }
  }, []);

  const handleDownloadAllBatch = useCallback(() => {
    const completed = batchJobsRef.current.filter(
      (j) => j.status === 'completed' && j.downloadUrl && j.downloadFileName
    );
    completed.forEach((job, i) => {
      setTimeout(() => {
        if (!job.downloadUrl || !job.downloadFileName) return;
        const anchor = document.createElement('a');
        anchor.href = job.downloadUrl;
        anchor.download = job.downloadFileName;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
      }, i * 180);
    });
  }, []);

  const handleStartBatchExport = useCallback(async () => {
    if (!audioBuffer || isBatchRunning) return;

    const pendingSnapshot = batchJobsRef.current
      .map((job, idx) => ({ job, idx }))
      .filter(
        ({ job }) =>
          job.status === 'queued' || job.status === 'error' || job.status === 'cancelled'
      );

    if (pendingSnapshot.length === 0) return;

    // Request browser notification permission inside this user click gesture if not yet decided
    if (notifyOnBatchCompleteRef.current && getBrowserNotificationPermission() === 'default') {
      void requestBrowserNotificationPermission().then((perm) => {
        setNotificationPermission(perm);
      });
    }

    setBatchCompletionBanner(null);

    if (audioElRef.current && !audioElRef.current.paused) {
      audioElRef.current.pause();
    }

    const pendingIds = new Set(pendingSnapshot.map(({ job }) => job.id));
    setBatchJobs((prev) =>
      prev.map((j) => {
        if (!pendingIds.has(j.id)) return j;
        if (j.downloadUrl) URL.revokeObjectURL(j.downloadUrl);
        return {
          ...j,
          status: 'queued',
          currentFrame: 0,
          totalFrames: 0,
          percentage: 0,
          message: 'Queued',
          error: undefined,
          downloadUrl: undefined,
          downloadFileName: undefined,
          elapsedMs: undefined,
        };
      })
    );

    const controller = new AbortController();
    exportAbortRef.current = controller;
    setIsBatchRunning(true);

    const batchStartMs = performance.now();
    let completedCount = 0;
    let failedCount = 0;
    let totalClipDurationMs = 0;
    let totalOutputBytes = 0;
    let totalFramesRendered = 0;
    let wasCancelled = false;

    try {
      for (const { job, idx } of pendingSnapshot) {
        if (controller.signal.aborted) {
          wasCancelled = true;
          break;
        }

        setBatchJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? {
                  ...j,
                  status: 'rendering',
                  percentage: 0,
                  message: 'Initializing video & audio encoders...',
                }
              : j
          )
        );

        const baseSlug = sanitizeFileName(
          job.label || job.settings.trackTitle || `pulsewave-item`
        );
        const ratioSlug = job.settings.aspectRatio.replace(':', 'x');
        const customFileName = `${baseSlug}-${ratioSlug}-${String(idx + 1).padStart(2, '0')}`;

        try {
          const mixResolver = mixVideoResolverRef.current;
          const resolveBgImageAtTime =
            mixResolver && mixResolver.hasActiveVideo()
              ? (t: number, w: number, h: number) => mixResolver.resolveExportFrame(t, w, h)
              : undefined;
          const result = await exportProjectToMp4({
            audioBuffer,
            trimStart: job.trimStart,
            trimEnd: job.trimEnd,
            settings: job.settings,
            lyrics: lyricsRef.current,
            bgImage: bgImageRef.current,
            albumImage: albumImageRef.current,
            resolveBgImageAtTime,
            mocapClip: mocapClipRef.current,
            signal: controller.signal,
            autoDownload: autoDownloadBatchRef.current,
            customFileName,
            onProgress: (progress) => {
              setBatchJobs((prev) =>
                prev.map((j) =>
                  j.id === job.id
                    ? {
                        ...j,
                        currentFrame: progress.currentFrame,
                        totalFrames: progress.totalFrames,
                        percentage: progress.percentage,
                        message: progress.message,
                      }
                    : j
                )
              );
            },
          });

          completedCount += 1;
          totalClipDurationMs += Math.max(0, job.trimEnd - job.trimStart) * 1000;
          totalOutputBytes += result.fileSizeBytes;
          totalFramesRendered += result.totalFrames;
          setBatchJobs((prev) =>
            prev.map((j) =>
              j.id === job.id
                ? {
                    ...j,
                    status: 'completed',
                    currentFrame: result.totalFrames,
                    totalFrames: result.totalFrames,
                    percentage: 100,
                    message: `Rendered ${result.totalFrames} frames in ${(
                      result.elapsedMs / 1000
                    ).toFixed(1)}s`,
                    elapsedMs: result.elapsedMs,
                    downloadUrl: result.downloadUrl,
                    downloadFileName: result.downloadFileName,
                    fileSizeBytes: result.fileSizeBytes,
                  }
                : j
            )
          );
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            wasCancelled = true;
            setBatchJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? {
                      ...j,
                      status: 'cancelled',
                      message: 'Batch cancelled',
                    }
                  : j
              )
            );
            break;
          }

          failedCount += 1;
          setBatchJobs((prev) =>
            prev.map((j) =>
              j.id === job.id
                ? {
                    ...j,
                    status: 'error',
                    message: 'Export failed',
                    error: err instanceof Error ? err.message : String(err),
                  }
                : j
            )
          );
        }
      }

      if (completedCount > 0 && (autoSaveProjectsRef.current || activeProjectRef.current.id)) {
        void saveCurrentProject({ exported: true, forceCreate: true });
      }

      if (!wasCancelled && (completedCount > 0 || failedCount > 0)) {
        const totalElapsedMs = Math.round(performance.now() - batchStartMs);
        const alertResult = triggerBatchCompletionAlert(
          {
            completedCount,
            failedCount,
            totalElapsedMs,
            cancelled: false,
          },
          {
            enableDesktop: notifyOnBatchCompleteRef.current,
            enableSound: notifyOnBatchCompleteRef.current,
          }
        );
        setBatchCompletionBanner({
          completedCount,
          failedCount,
          totalElapsedMs,
          totalClipDurationMs: Math.round(totalClipDurationMs),
          totalOutputBytes,
          totalFramesRendered,
          desktopSent: alertResult.desktopSent,
        });
      }
    } finally {
      setIsBatchRunning(false);
    }
  }, [audioBuffer, isBatchRunning, saveCurrentProject]);

  const handleCancelExport = useCallback(() => {
    exportAbortRef.current?.abort();
  }, []);

  const handleCloseExportModal = useCallback(() => {
    if (
      exportState.downloadUrl &&
      exportState.downloadUrl !== lastSingleExportUrlRef.current
    ) {
      URL.revokeObjectURL(exportState.downloadUrl);
    }
    setExportState(INITIAL_EXPORT_STATE);
    setIsExportModalOpen(false);
  }, [exportState.downloadUrl]);

  const handleOpenShareModal = useCallback(
    (assetId?: string) => {
      if (isExportModalOpen || exportState.status !== 'idle') {
        setExportState(INITIAL_EXPORT_STATE);
        setIsExportModalOpen(false);
      }
      setShareModalInitialAssetId(assetId ?? null);
      setIsShareModalOpen(true);
    },
    [isExportModalOpen, exportState.status]
  );

  const handleRenderForRatio = useCallback(
    (targetRatio: AspectRatioKey) => {
      const nextSettings: StudioSettings = {
        ...settingsRef.current,
        aspectRatio: targetRatio,
      };
      updateSettings({ aspectRatio: targetRatio });
      void handleStartExport(nextSettings);
    },
    [updateSettings, handleStartExport]
  );

  const handlePreviewBatchJob = useCallback(
    (job: BatchExportJob) => {
      if (isBatchRunning) return;
      const safeDur = duration > 0 ? duration : job.trimEnd;
      const clampedStart = Number(
        Math.max(0, Math.min(job.trimStart, Math.max(0, safeDur - 0.5))).toFixed(2)
      );
      const clampedEnd = Number(
        Math.max(clampedStart + 0.5, Math.min(job.trimEnd, safeDur || job.trimEnd)).toFixed(2)
      );

      setTrimStart(clampedStart);
      setTrimEnd(clampedEnd);
      setCurrentTime(clampedStart);
      const nextMedia = captureCurrentMediaSnapshot({
        trimStart: clampedStart,
        trimEnd: clampedEnd,
      });
      commitHistory(
        (prev) => ({
          ...prev,
          settings: { ...job.settings },
          media: nextMedia,
        }),
        { label: `Loaded batch job: ${job.label}`, kind: 'project-state' }
      );
      if (audioElRef.current && audioElRef.current.src) {
        audioElRef.current.currentTime = clampedStart;
      }
      particlesRef.current.length = 0;
      motionBlurStateRef.current.hasFrame = false;
      motionBlurStateRef.current.frameIndex = 0;
      handleCloseExportModal();
    },
    [
      isBatchRunning,
      duration,
      captureCurrentMediaSnapshot,
      commitHistory,
      handleCloseExportModal,
    ]
  );

  const handleSavePreset = useCallback(
    (name: string) => {
      const trimmed = name.trim() || settings.trackTitle.trim() || 'Custom Preset';
      const newPreset: SavedPreset = {
        id: createPresetId(),
        name: trimmed,
        createdAt: new Date().toISOString(),
        version: 1,
        settings: { ...settings },
      };
      setSavedPresets((prev) => {
        const next = [newPreset, ...prev];
        persistSavedPresets(next);
        return next;
      });
      return newPreset;
    },
    [settings]
  );

  const handleApplyPreset = useCallback(
    (preset: SavedPreset) => {
      commitHistory((prev) => ({
        ...prev,
        settings: { ...preset.settings },
      }));
    },
    [commitHistory]
  );

  const handleDeletePreset = useCallback((id: string) => {
    setSavedPresets((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persistSavedPresets(next);
      return next;
    });
  }, []);

  const handleApplyExportProfile = useCallback(
    (profile: ExportProfile, autoArrangeOnRatioChange = true) => {
      const ratioChanged = profile.aspectRatio !== settingsRef.current.aspectRatio;
      const basePatch = exportProfileToSettingsPatch(profile);
      if (ratioChanged && autoArrangeOnRatioChange) {
        const nextCandidate: StudioSettings = {
          ...settingsRef.current,
          ...basePatch,
        };
        const framing = computeAutoArrangeFraming(
          nextCandidate,
          lyricsRef.current.length > 0
        );
        updateSettings({ ...basePatch, ...framing.patch });
      } else {
        updateSettings(basePatch);
      }
    },
    [updateSettings]
  );

  const handleSaveExportProfile = useCallback(
    (name: string, targetSettings: StudioSettings): ExportProfile => {
      const newProfile = buildExportProfileFromSettings(name, targetSettings);
      setCustomExportProfiles((prev) => {
        const next = [newProfile, ...prev];
        persistCustomExportProfiles(next);
        return next;
      });
      return newProfile;
    },
    []
  );

  const handleDeleteExportProfile = useCallback((id: string) => {
    setCustomExportProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id);
      persistCustomExportProfiles(next);
      return next;
    });
  }, []);

  const handleImportPresetFile = useCallback(
    async (file: File): Promise<{ ok: true; preset: SavedPreset } | { ok: false; error: string }> => {
      try {
        const text = await file.text();
        const { name, settings: importedSettings } = parsePresetJson(
          text,
          file.name,
          settingsRef.current
        );
        commitHistory((prev) => ({
          ...prev,
          settings: importedSettings,
        }));
        const importedPreset: SavedPreset = {
          id: createPresetId(),
          name,
          createdAt: new Date().toISOString(),
          version: 1,
          settings: importedSettings,
        };
        setSavedPresets((prev) => {
          const next = [importedPreset, ...prev];
          persistSavedPresets(next);
          return next;
        });
        return { ok: true, preset: importedPreset };
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : 'Failed to import preset JSON.',
        };
      }
    },
    [commitHistory]
  );

  const handleSaveCanvasSnapshot = useCallback(
    async (name: string, targetSettings?: StudioSettings): Promise<string> => {
      const liveCanvas = previewCanvasRef.current;
      const useLiveCanvas =
        !targetSettings ||
        JSON.stringify(targetSettings) === JSON.stringify(settingsRef.current);

      if (useLiveCanvas && liveCanvas) {
        return captureCanvasSnapshotPng(liveCanvas, name);
      }

      const activeSettings = targetSettings || settingsRef.current;
      const { width, height } = ASPECT_RATIOS[activeSettings.aspectRatio];
      const offscreen = document.createElement('canvas');
      offscreen.width = width;
      offscreen.height = height;
      const ctx = offscreen.getContext('2d');
      if (!ctx) {
        throw new Error('Unable to create 2D canvas context for snapshot.');
      }

      const freqBuf = new Uint8Array(1024);
      const waveBuf = new Uint8Array(1024);
      if (analyserRef.current && isPlayingRef.current) {
        analyserRef.current.getByteFrequencyData(freqBuf);
        analyserRef.current.getByteTimeDomainData(waveBuf);
      } else {
        const synthetic = buildSyntheticAudioFrame(1024);
        freqBuf.set(synthetic.frequencyData);
        waveBuf.set(synthetic.timeDomainData);
      }

      const particles: Particle[] = [];
      const rotRef = { angle: albumRotationRef.current.angle };
      const steps =
        !activeSettings.lyricsOnly &&
        activeSettings.displayLayer !== 'dance-only' &&
        (activeSettings.visualizerMode === 'hybrid-particles' || activeSettings.particleEnabled)
          ? 10
          : 1;
      const trackTime = audioElRef.current ? audioElRef.current.currentTime : currentTime;

      for (let s = 0; s < steps; s++) {
        renderVisualizerFrame({
          ctx,
          width,
          height,
          currentTime: trackTime,
          dt: 1 / 30,
          frequencyData: freqBuf,
          timeDomainData: waveBuf,
          settings: activeSettings,
          lyrics: lyricsRef.current,
          bgImage: bgImageRef.current,
          albumImage: albumImageRef.current,
          mocapClip: mocapClipRef.current,
          particles,
          isExport: true,
          albumRotationRef: rotRef,
          trackDuration: mediaMetaRef.current.duration || trimRef.current.trimEnd || undefined,
        });
      }

      return captureCanvasSnapshotPng(offscreen, name);
    },
    [currentTime]
  );

  const renderCleanCoverCanvas = useCallback((targetSettings: StudioSettings): HTMLCanvasElement => {
    const { width, height } = ASPECT_RATIOS[targetSettings.aspectRatio];
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      throw new Error('Unable to create 2D canvas context for cover render.');
    }

    const emptyFreq = new Uint8Array(1024);
    const neutralWave = new Uint8Array(1024).fill(128);
    const cleanCoverSettings: StudioSettings = {
      ...targetSettings,
      displayLayer: 'lyrics-only',
      lyricsOnly: true,
      showSafeZone: false,
      glitchIntensity: 0,
      bassShake: 0,
      beatShake: 0,
      scanlineIntensity: 0,
      motionBlur: 0,
      motionBlurPreset: 'none',
    };

    renderVisualizerFrame({
      ctx,
      width,
      height,
      currentTime: 0,
      dt: 1 / 30,
      frequencyData: emptyFreq,
      timeDomainData: neutralWave,
      settings: cleanCoverSettings,
      lyrics: [],
      bgImage: bgImageRef.current,
      albumImage: albumImageRef.current,
      particles: [],
      isExport: true,
    });

    return offscreen;
  }, []);

  const handleDownloadCoverThumbnail = useCallback(
    async (mode: 'clean-cover' | 'full-stage'): Promise<string> => {
      const baseTitle = sanitizeFileName(
        settingsRef.current.trackTitle.trim() || activeProjectName || 'studio-cover'
      );
      if (mode === 'full-stage') {
        return handleSaveCanvasSnapshot(`${baseTitle}-stage`);
      }
      const offscreen = renderCleanCoverCanvas(settingsRef.current);
      return captureCanvasSnapshotPng(offscreen, `${baseTitle}-cover`);
    },
    [activeProjectName, handleSaveCanvasSnapshot, renderCleanCoverCanvas]
  );

  const handleSetProjectThumbnailFromCover = useCallback(async (): Promise<void> => {
    const offscreen = renderCleanCoverCanvas(settingsRef.current);
    const dataUrl = captureProjectThumbnail(offscreen);
    if (dataUrl) {
      customThumbnailRef.current = dataUrl;
    }
    await saveCurrentProject({ forceCreate: true });
  }, [renderCleanCoverCanvas, saveCurrentProject]);

  const handleAutoGenerateCaptions = useCallback(
    async (overrideAudio?: {
      audioBuffer: AudioBuffer;
      trimStart: number;
      trimEnd: number;
    }) => {
      const targetBuffer = overrideAudio?.audioBuffer ?? audioBuffer;
      if (!targetBuffer || isGeneratingCaptions) return;

      const activeTrimStart = overrideAudio?.trimStart ?? trimStart;
      const activeTrimEnd =
        overrideAudio && overrideAudio.trimEnd > overrideAudio.trimStart
          ? overrideAudio.trimEnd
          : overrideAudio
          ? targetBuffer.duration
          : trimEnd;

      setActiveTab('lyrics');
      setIsGeneratingCaptions(true);
      setCaptionsNotice(null);

      try {
        const { base64, mimeType, durationSec } = audioBufferToCompactWavBase64(
          targetBuffer,
          activeTrimStart,
          activeTrimEnd
        );

        const response = await fetch('/api/captions/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioBase64: base64,
            mimeType,
            durationSec,
            trackTitle: settingsRef.current.trackTitle,
            artistName: settingsRef.current.artistName,
          }),
        });

        const rawText = await response.text();
        let payload: {
          captions?: Array<{ timeSec: number; text: string }>;
          error?: string;
        } = {};
        if (rawText) {
          try {
            payload = JSON.parse(rawText) as typeof payload;
          } catch {
            payload = { error: rawText };
          }
        }

        if (!response.ok) {
          throw new Error(
            payload.error || `Failed to generate captions (HTTP ${response.status}).`
          );
        }

        const maxTime = Math.max(activeTrimStart, activeTrimEnd - 0.1);
        const generated = (payload.captions ?? [])
          .map((c) => ({
            id: createLyricId(),
            time: Number(
              Math.max(activeTrimStart, Math.min(maxTime, activeTrimStart + c.timeSec)).toFixed(
                2
              )
            ),
            text: c.text,
          }))
          .sort((a, b) => a.time - b.time);

        if (generated.length === 0) {
          throw new Error('No caption cues were generated for this audio clip.');
        }

        commitHistory((prev) => ({
          ...prev,
          lyrics: generated,
        }));
        setCaptionsNotice({
          type: 'success',
          text: `Generated ${generated.length} synced captions for this clip.`,
        });
      } catch (err) {
        setCaptionsNotice({
          type: 'error',
          text:
            err instanceof Error
              ? err.message
              : 'Unable to generate captions automatically.',
        });
      } finally {
        setIsGeneratingCaptions(false);
      }
    },
    [audioBuffer, isGeneratingCaptions, trimStart, trimEnd, commitHistory]
  );

  const isSingleExporting =
    exportState.status === 'preparing' ||
    exportState.status === 'rendering' ||
    exportState.status === 'muxing';
  const isExporting = isSingleExporting || isBatchRunning;
  const pendingBatchCount = batchJobs.filter(
    (j) => j.status === 'queued' || j.status === 'error' || j.status === 'cancelled'
  ).length;

  const shareableAssets: ShareableVideoAsset[] = [
    ...(lastSingleExportAsset ? [lastSingleExportAsset] : []),
    ...batchJobs
      .filter((j) => j.status === 'completed' && j.downloadUrl && j.downloadFileName)
      .map((j) => ({
        id: j.id,
        label: j.label || j.settings.trackTitle || 'Batch Clip',
        downloadUrl: j.downloadUrl!,
        downloadFileName: j.downloadFileName!,
        fileSizeBytes: j.fileSizeBytes,
        aspectRatio: j.settings.aspectRatio,
        exportResolution: j.settings.exportResolution,
        durationSec: Math.max(0.5, j.trimEnd - j.trimStart),
        trackTitle: j.settings.trackTitle,
        artistName: j.settings.artistName,
        visualizerMode: j.settings.visualizerMode,
        createdAt: new Date().toISOString(),
      })),
  ];

  const clipDuration = Math.max(0, trimEnd - trimStart);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#090b10] text-slate-100 flex flex-col">
      <TopBar
        audioFileName={audioFileName}
        aspectRatio={settings.aspectRatio}
        exportResolution={settings.exportResolution}
        clipDuration={clipDuration}
        hasAudio={Boolean(audioBuffer)}
        isGeneratingDemo={isGeneratingDemo}
        isExporting={isExporting}
        batchQueueCount={pendingBatchCount}
        shareableCount={shareableAssets.length}
        activeProjectId={activeProjectId}
        activeProjectName={activeProjectName}
        activeProjectCompleted={activeProjectCompleted}
        projectCount={projects.length}
        autoSaveProjects={autoSaveProjects}
        isProjectDirty={isProjectDirty}
        isSavingProject={isSavingProject}
        canUndo={canUndo}
        canRedo={canRedo}
        historyEntries={historyEntries}
        currentHistoryEntryId={currentEntryId}
        midiActiveCount={midiMappings.filter((m) => m.enabled).length}
        midiConnectedCount={
          midiController.devices.filter((d) => d.state === 'connected').length
        }
        midiEnabled={midiEnabled}
        mixClipCount={mixClips.length}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onJumpToHistory={handleJumpToHistory}
        onCaptureProjectSnapshot={(label) => void handleCaptureProjectSnapshot(label)}
        onOpenProjects={() => setIsProjectsModalOpen(true)}
        onQuickSaveProject={() => void handleSaveActiveProject()}
        onLoadDemo={() => void handleLoadDemo()}
        onOpenLinkDownloader={() => setIsLinkDownloadModalOpen(true)}
        onOpenMixStudio={() => {
          if (audioElRef.current && !audioElRef.current.paused) {
            audioElRef.current.pause();
            setIsPlaying(false);
          }
          setIsMixModalOpen(true);
        }}
        onOpenDjStudio={() => {
          if (audioElRef.current && !audioElRef.current.paused) {
            audioElRef.current.pause();
            setIsPlaying(false);
          }
          setIsDjModalOpen(true);
        }}
        onOpenMidi={() => setIsMidiModalOpen(true)}
        onOpenBatchExport={handleOpenBatchExport}
        onOpenShare={() => handleOpenShareModal()}
        onExport={handleOpenSingleExport}
      />

      {audioError && (
        <div className="bg-rose-500/15 border-b border-rose-500/30 px-5 py-2 text-xs text-rose-200 flex items-center justify-between">
          <span>{audioError}</span>
          <button
            type="button"
            onClick={() => setAudioError(null)}
            className="text-rose-300 hover:text-white font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col lg:flex-row">
        <ControlSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          settings={settings}
          onUpdateSettings={updateSettings}
          audioFileName={audioFileName}
          duration={duration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          trimStart={trimStart}
          trimEnd={trimEnd}
          onTrimChange={handleTrimChange}
          onAudioFileSelect={(file) => void handleAudioFileSelect(file)}
          onLoadDemo={() => void handleLoadDemo()}
          isGeneratingDemo={isGeneratingDemo}
          onBgImageSelect={handleBgImageSelect}
          bgImageName={bgImageName}
          hasBgImage={Boolean(bgImageName)}
          onAlbumImageSelect={handleAlbumImageSelect}
          albumImageName={albumImageName}
          hasAlbumImage={Boolean(albumImageName)}
          onCopyBgToAlbum={handleCopyBgToAlbum}
          onCopyAlbumToBg={handleCopyAlbumToBg}
          onDownloadCoverThumbnail={handleDownloadCoverThumbnail}
          onSetProjectThumbnailFromCover={handleSetProjectThumbnailFromCover}
          lyrics={lyrics}
          onLyricsChange={handleLyricsChange}
          onSeek={handleSeek}
          audioInputRef={audioInputRef}
          savedPresets={savedPresets}
          onSavePreset={handleSavePreset}
          onApplyPreset={handleApplyPreset}
          onDeletePreset={handleDeletePreset}
          onImportPresetFile={handleImportPresetFile}
          onDownloadSnapshot={handleSaveCanvasSnapshot}
          hasAudio={Boolean(audioBuffer)}
          audioBuffer={audioBuffer}
          isGeneratingCaptions={isGeneratingCaptions}
          captionsNotice={captionsNotice}
          onDismissCaptionsNotice={() => setCaptionsNotice(null)}
          onAutoGenerateCaptions={() => void handleAutoGenerateCaptions()}
          onAutoArrange={handleAutoArrange}
          autoArrangeNotice={autoArrangeNotice}
          beatMeterBarRef={beatMeterBarRef}
          currentBpm={(tapTempoBpm ?? detectedTrackBpm ?? 120) * playbackRate}
          midiMappingBadges={midiMappingBadges}
          onOpenMidiMapping={() => setIsMidiModalOpen(true)}
          onPreviewSceneTransition={handlePreviewSceneTransition}
          mocapClip={mocapClip}
          onMocapFileSelect={handleMocapFileSelect}
          onClearMocapClip={handleClearMocapClip}
          mixClipCount={mixClips.length}
          onOpenMixStudio={() => {
            if (audioElRef.current && !audioElRef.current.paused) {
              audioElRef.current.pause();
              setIsPlaying(false);
            }
            setIsMixModalOpen(true);
          }}
          onOpenDjStudio={() => {
            if (audioElRef.current && !audioElRef.current.paused) {
              audioElRef.current.pause();
              setIsPlaying(false);
            }
            setIsDjModalOpen(true);
          }}
          onOpenLinkDownloader={() => setIsLinkDownloadModalOpen(true)}
        />

        <main className="flex-1 min-w-0 min-h-0 flex flex-col">
          <PreviewStage
            canvasRef={previewCanvasRef}
            aspectRatio={settings.aspectRatio}
            hasAudio={Boolean(audioBuffer)}
            isPlaying={isPlaying}
            isGeneratingDemo={isGeneratingDemo}
            showSafeZone={settings.showSafeZone}
            onToggleSafeZone={() =>
              updateSettings({ showSafeZone: !settings.showSafeZone })
            }
            onAutoArrange={handleAutoArrange}
            autoArrangeNotice={autoArrangeNotice}
            onTogglePlay={() => void handleTogglePlay()}
            onUploadAudioClick={() => {
              setActiveTab('media');
              audioInputRef.current?.click();
            }}
            onOpenLinkDownloader={() => setIsLinkDownloadModalOpen(true)}
            onLoadDemo={() => void handleLoadDemo()}
            lyrics={lyrics}
            currentTime={currentTime}
            duration={duration}
            isGeneratingCaptions={isGeneratingCaptions}
            onLyricsChange={handleLyricsChange}
            onAutoGenerateCaptions={() => void handleAutoGenerateCaptions()}
            onOpenLyricsTab={() => setActiveTab('lyrics')}
          />

          <TransportBar
            hasAudio={Boolean(audioBuffer)}
            audioBuffer={audioBuffer}
            duration={duration}
            currentTime={currentTime}
            trimStart={trimStart}
            trimEnd={trimEnd}
            isPlaying={isPlaying}
            loopClip={loopClip}
            previewTrimLoop={previewTrimLoop}
            volume={volume}
            isMuted={isMuted}
            playbackRate={playbackRate}
            isExporting={isExporting}
            batchQueueCount={pendingBatchCount}
            isGeneratingCaptions={isGeneratingCaptions}
            beatDetection={settings.beatDetection}
            beatSensitivity={settings.beatSensitivity}
            tapTempoBpm={tapTempoBpm}
            tapTempoCount={tapTempoCount}
            waveformPeaks={waveformPeaks}
            primaryColor={settings.primaryColor}
            onTogglePlay={() => void handleTogglePlay()}
            onSeek={handleSeek}
            onTrimChange={handleTrimChange}
            onToggleLoop={() => setLoopClip((v) => !v)}
            onTogglePreviewTrimLoop={handleTogglePreviewTrimLoop}
            onTapTempo={handleTapTempo}
            onVolumeChange={(v) => {
              setVolume(v);
              if (v > 0 && isMuted) setIsMuted(false);
            }}
            onToggleMute={() => setIsMuted((m) => !m)}
            onPlaybackRateChange={setPlaybackRate}
            onAutoCaptions={() => void handleAutoGenerateCaptions()}
            onOpenBatchExport={handleOpenBatchExport}
            onExport={handleOpenSingleExport}
          />
        </main>
      </div>

      <ExportModal
        isOpen={isExportModalOpen || exportState.status !== 'idle'}
        view={exportModalView}
        onViewChange={setExportModalView}
        state={exportState}
        onCancel={handleCancelExport}
        onClose={handleCloseExportModal}
        duration={duration}
        currentTrimStart={trimStart}
        currentTrimEnd={trimEnd}
        currentSettings={settings}
        savedPresets={savedPresets}
        exportProfiles={[...customExportProfiles, ...BUILT_IN_EXPORT_PROFILES]}
        onUpdateSettings={updateSettings}
        onApplyExportProfile={handleApplyExportProfile}
        onSaveExportProfile={handleSaveExportProfile}
        onDeleteExportProfile={handleDeleteExportProfile}
        batchJobs={batchJobs}
        isBatchRunning={isBatchRunning}
        autoDownloadBatch={autoDownloadBatch}
        onToggleAutoDownloadBatch={setAutoDownloadBatch}
        notifyOnBatchComplete={notifyOnBatchComplete}
        notificationPermission={notificationPermission}
        batchCompletionBanner={batchCompletionBanner}
        onToggleNotifyOnBatchComplete={(val) => void handleToggleNotifyOnBatchComplete(val)}
        onRequestNotificationPermission={() => void handleRequestNotificationPermission()}
        onDismissBatchCompletionBanner={() => setBatchCompletionBanner(null)}
        onAddBatchJobs={handleAddBatchJobs}
        onUpdateBatchJob={handleUpdateBatchJob}
        onMoveBatchJob={handleMoveBatchJob}
        onDuplicateBatchJob={handleDuplicateBatchJob}
        onRemoveBatchJob={handleRemoveBatchJob}
        onPreviewBatchJob={handlePreviewBatchJob}
        onClearBatchJobs={handleClearBatchJobs}
        onStartBatchExport={() => void handleStartBatchExport()}
        onDownloadAllBatch={handleDownloadAllBatch}
        onStartSingleExport={() => void handleStartExport()}
        onShareSingle={() => handleOpenShareModal('latest-single-export')}
        onShareBatchJob={(job) => handleOpenShareModal(job.id)}
        lyricsCount={lyrics.length}
        onUploadCaptionsFile={handleUploadCaptionsFile}
      />

      <ShareModal
        isOpen={isShareModalOpen}
        assets={shareableAssets}
        initialAssetId={shareModalInitialAssetId}
        lyrics={lyrics}
        hasAudio={Boolean(audioBuffer)}
        isExporting={isExporting}
        onClose={() => setIsShareModalOpen(false)}
        onRenderCurrentClip={() => {
          setIsShareModalOpen(false);
          void handleStartExport();
        }}
        onRenderForRatio={handleRenderForRatio}
        onOpenBatchExport={() => {
          setIsShareModalOpen(false);
          handleOpenBatchExport();
        }}
      />

      <ProjectsModal
        isOpen={isProjectsModalOpen}
        projects={projects}
        activeProjectId={activeProjectId}
        activeProjectName={activeProjectName}
        autoSaveProjects={autoSaveProjects}
        isProjectDirty={isProjectDirty}
        isSavingProject={isSavingProject}
        isLoadingProject={isLoadingProject}
        defaultProjectName={
          settings.trackTitle.trim() ||
          audioFileName?.replace(/\.[^.]+$/, '') ||
          'My PulseWave Project'
        }
        onClose={() => setIsProjectsModalOpen(false)}
        onToggleAutoSaveProjects={handleToggleAutoSaveProjects}
        onSaveAsNewProject={handleSaveAsNewProject}
        onSaveActiveProject={handleSaveActiveProject}
        onOpenProject={handleOpenProject}
        onRenameProject={handleRenameProject}
        onDuplicateProject={handleDuplicateProject}
        onToggleProjectCompleted={handleToggleProjectCompleted}
        onUpdateProjectTags={handleUpdateProjectTags}
        onDeleteProject={handleDeleteProject}
        onRestoreProjectVersion={handleRestoreProjectVersion}
        onCaptureProjectSnapshot={(label) => void handleCaptureProjectSnapshot(label)}
        onNewBlankProject={handleNewBlankProject}
      />

      <MidiMappingModal
        isOpen={isMidiModalOpen}
        status={midiController.status}
        errorMessage={midiController.errorMessage}
        devices={midiController.devices}
        lastSignal={midiController.lastSignal}
        midiEnabled={midiEnabled}
        mappings={midiMappings}
        learningParam={learningParam}
        settings={settings}
        notice={midiNotice}
        initialCategoryFilter={midiInitialCategory}
        onClose={() => {
          setLearningParam(null);
          setIsMidiModalOpen(false);
          setMidiInitialCategory('all');
        }}
        onConnectMidi={() => void midiController.connectMidi()}
        onToggleMidiEnabled={handleToggleMidiEnabled}
        onSetLearningParam={setLearningParam}
        onUpdateMapping={handleUpdateMidiMapping}
        onAddManualMapping={handleAddManualMidiMapping}
        onRemoveMapping={handleRemoveMidiMapping}
        onLoadStarterMappings={handleLoadStarterMidiMappings}
        onClearAllMappings={handleClearAllMidiMappings}
      />

      <MixStudioModal
        isOpen={isMixModalOpen}
        initialClips={mixClips}
        initialOptions={mixOptions}
        currentAudioBuffer={audioBuffer}
        currentAudioFileName={audioFileName}
        ensureAudioContext={ensureAudioGraph}
        isExporting={isExporting}
        onClose={() => setIsMixModalOpen(false)}
        onApplyMix={handleApplyMixToStudio}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        settings={settings}
        onUpdateSettings={updateSettings}
        lyrics={lyrics}
        onLyricsChange={handleLyricsChange}
        bgImage={bgImageRef.current}
        bgImageName={bgImageName}
        onBgImageSelect={handleBgImageSelect}
        albumImage={albumImageRef.current}
        albumImageName={albumImageName}
        onAlbumImageSelect={handleAlbumImageSelect}
        onCopyBgToAlbum={handleCopyBgToAlbum}
        onCopyAlbumToBg={handleCopyAlbumToBg}
        onDownloadCoverThumbnail={handleDownloadCoverThumbnail}
        onSetProjectThumbnailFromCover={handleSetProjectThumbnailFromCover}
        savedPresets={savedPresets}
        onSavePreset={handleSavePreset}
        onApplyPreset={handleApplyPreset}
        onDeletePreset={handleDeletePreset}
        onImportPresetFile={handleImportPresetFile}
        onDownloadSnapshot={handleSaveCanvasSnapshot}
        isGeneratingCaptions={isGeneratingCaptions}
        captionsNotice={captionsNotice}
        onDismissCaptionsNotice={() => setCaptionsNotice(null)}
        onAutoGenerateCaptions={(overrideAudio) => void handleAutoGenerateCaptions(overrideAudio)}
        onAutoArrange={handleAutoArrange}
        autoArrangeNotice={autoArrangeNotice}
        midiMappingBadges={midiMappingBadges}
        onOpenMidiMapping={() => setIsMidiModalOpen(true)}
        mocapClip={mocapClip}
        onMocapFileSelect={handleMocapFileSelect}
        onClearMocapClip={handleClearMocapClip}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
      />

      <DjStudioModal
        isOpen={isDjModalOpen}
        currentAudioBuffer={audioBuffer}
        currentAudioFileName={audioFileName}
        currentLyrics={lyrics}
        ensureAudioContext={ensureAudioGraph}
        isExporting={isExporting}
        onClose={() => setIsDjModalOpen(false)}
        onApplyDjMix={handleApplyDjMixToStudio}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        settings={settings}
        onUpdateSettings={updateSettings}
        onLyricsChange={handleLyricsChange}
        bgImage={bgImageRef.current}
        bgImageName={bgImageName}
        onBgImageSelect={handleBgImageSelect}
        albumImage={albumImageRef.current}
        albumImageName={albumImageName}
        onAlbumImageSelect={handleAlbumImageSelect}
        onCopyBgToAlbum={handleCopyBgToAlbum}
        onCopyAlbumToBg={handleCopyAlbumToBg}
        onDownloadCoverThumbnail={handleDownloadCoverThumbnail}
        onSetProjectThumbnailFromCover={handleSetProjectThumbnailFromCover}
        savedPresets={savedPresets}
        onSavePreset={handleSavePreset}
        onApplyPreset={handleApplyPreset}
        onDeletePreset={handleDeletePreset}
        onImportPresetFile={handleImportPresetFile}
        onDownloadSnapshot={handleSaveCanvasSnapshot}
        isGeneratingCaptions={isGeneratingCaptions}
        captionsNotice={captionsNotice}
        onDismissCaptionsNotice={() => setCaptionsNotice(null)}
        onAutoGenerateCaptions={(overrideAudio) => void handleAutoGenerateCaptions(overrideAudio)}
        onAutoArrange={handleAutoArrange}
        autoArrangeNotice={autoArrangeNotice}
        midiMappingBadges={midiMappingBadges}
        onOpenMidiMapping={() => {
          setMidiInitialCategory('DJ Filter & FX');
          setIsMidiModalOpen(true);
        }}
        mocapClip={mocapClip}
        onMocapFileSelect={handleMocapFileSelect}
        onClearMocapClip={handleClearMocapClip}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCaptureProjectSnapshot={(label) => void handleCaptureProjectSnapshot(label)}
        onOpenProjects={() => setIsProjectsModalOpen(true)}
        onOpenMixStudio={() => {
          setIsDjModalOpen(false);
          setIsMixModalOpen(true);
        }}
        mixClipCount={mixClips.length}
      />

      <LinkDownloadModal
        isOpen={isLinkDownloadModalOpen}
        isExporting={isExporting}
        onClose={() => setIsLinkDownloadModalOpen(false)}
        onApplyMetadata={(meta) => void handleApplyParsedLinkMetadata(meta)}
        onLoadIntoStudio={(file, metadata) => {
          void handleAudioFileSelect(file, metadata);
          setIsLinkDownloadModalOpen(false);
        }}
      />
    </div>
  );
}
