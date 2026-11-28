import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ClipboardPaste,
  Disc3,
  Download,
  ExternalLink,
  Film,
  Image as ImageIcon,
  Link2,
  Loader2,
  Music,
  Play,
  RotateCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

export type LinkDownloadFormat =
  | 'original'
  | 'mp4'
  | 'webm'
  | 'mp3'
  | 'wav'
  | 'm4a';

export type MediaQualityTier =
  | 'best'
  | '2160'
  | '1440'
  | '1080'
  | '720'
  | '480'
  | '360';

interface MediaQualityOption {
  id: MediaQualityTier;
  label: string;
  height: number | null;
}

export interface ExtractedMediaMetadata {
  trackName: string;
  artistName: string;
  albumName: string | null;
  albumArtUrl: string | null;
  albumArtDataUrl: string | null;
  metadataSource: string;
}

export interface AppliedProjectMediaMetadata {
  trackTitle: string;
  artistName: string;
  albumArtFile: File | null;
}

interface MediaStreamCandidate {
  id: string;
  url: string;
  previewUrl: string | null;
  sourceType: 'direct' | 'yt-dlp';
  platform: string;
  uploader: string | null;
  thumbnailUrl: string | null;
  title: string;
  filename: string;
  mimeType: string;
  extension: string;
  mediaKind: 'video' | 'audio';
  hasVideo: boolean;
  hasAudio: boolean;
  sizeBytes: number | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  sourceLabel: string;
  qualityOptions: MediaQualityOption[];
  metadata: ExtractedMediaMetadata;
}

interface InspectMediaResponse {
  inputUrl: string;
  resolvedUrl: string;
  sourceHost: string;
  pageTitle: string;
  thumbnailUrl: string | null;
  candidates: MediaStreamCandidate[];
  notice: string | null;
}

interface DownloadedHistoryItem {
  id: string;
  file: File;
  objectUrl: string;
  sourceUrl: string;
  format: LinkDownloadFormat;
  createdAt: string;
  metadata: AppliedProjectMediaMetadata;
}

interface LinkDownloadModalProps {
  isOpen: boolean;
  isExporting: boolean;
  onClose: () => void;
  onApplyMetadata: (metadata: AppliedProjectMediaMetadata) => void;
  onLoadIntoStudio: (file: File, metadata?: AppliedProjectMediaMetadata) => void;
}

function formatBytes(bytes: number | null): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return 'Unknown size';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDuration(sec: number | null): string | null {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return null;
  const total = Math.round(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${rem < 10 ? '0' : ''}${rem}`;
}

function stripExtension(name: string): string {
  return name.replace(/\.[^./\\]+$/, '');
}

const SAFE_DATA_IMAGE_URL_RE =
  /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i;

function dataUrlToFile(dataUrl: string, baseName: string): File | null {
  const match = dataUrl.match(SAFE_DATA_IMAGE_URL_RE);
  if (!match) return null;
  try {
    const mime = match[1].toLowerCase();
    const bin = atob(match[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const safeName = (baseName || 'cover-art').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 48);
    return new File([bytes], `${safeName}.${ext}`, { type: mime });
  } catch {
    return null;
  }
}

export function LinkDownloadModal({
  isOpen,
  isExporting,
  onClose,
  onApplyMetadata,
  onLoadIntoStudio,
}: LinkDownloadModalProps) {
  const [urlInput, setUrlInput] = useState('');
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectResult, setInspectResult] = useState<InspectMediaResponse | null>(null);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<LinkDownloadFormat>('original');
  const [selectedQuality, setSelectedQuality] = useState<MediaQualityTier>('best');
  const [audioBitrate, setAudioBitrate] = useState<'128k' | '192k' | '320k'>('192k');
  const [filenameBase, setFilenameBase] = useState('');

  // Parsed metadata fields & auto-population state
  const [parsedTrackName, setParsedTrackName] = useState('');
  const [parsedArtistName, setParsedArtistName] = useState('');
  const [autoPopulateProject, setAutoPopulateProject] = useState(true);
  const [isApplyingMetadata, setIsApplyingMetadata] = useState(false);
  const [metadataAppliedNotice, setMetadataAppliedNotice] = useState<string | null>(null);

  const [previewFailed, setPreviewFailed] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadAction, setDownloadAction] = useState<'save' | 'studio' | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{
    received: number;
    total: number | null;
    phase: 'resolving' | 'fetching' | 'done';
  } | null>(null);

  const [history, setHistory] = useState<DownloadedHistoryItem[]>([]);
  const historyRef = useRef<DownloadedHistoryItem[]>([]);
  historyRef.current = history;

  const downloadAbortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onApplyMetadataRef = useRef(onApplyMetadata);
  onApplyMetadataRef.current = onApplyMetadata;
  const lastAutoSyncedCandidateIdRef = useRef<string | null>(null);
  const cachedArtFileRef = useRef<{ key: string; file: File | null }>({
    key: '',
    file: null,
  });

  useEffect(() => {
    return () => {
      downloadAbortRef.current?.abort();
      for (const item of historyRef.current) {
        URL.revokeObjectURL(item.objectUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDownloading) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, isDownloading, onClose]);

  const activeCandidate = useMemo(() => {
    if (!inspectResult || inspectResult.candidates.length === 0) return null;
    return (
      inspectResult.candidates.find((c) => c.id === selectedCandidateId) ??
      inspectResult.candidates[0]
    );
  }, [inspectResult, selectedCandidateId]);

  const resolveAlbumArtFile = useCallback(
    async (candidate: MediaStreamCandidate | null, trackTitleHint: string): Promise<File | null> => {
      if (!candidate) return null;
      const artKey =
        candidate.metadata.albumArtDataUrl ||
        candidate.metadata.albumArtUrl ||
        candidate.thumbnailUrl ||
        '';
      if (!artKey) return null;
      if (cachedArtFileRef.current.key === artKey) {
        return cachedArtFileRef.current.file;
      }

      if (candidate.metadata.albumArtDataUrl) {
        const inlineFile = dataUrlToFile(
          candidate.metadata.albumArtDataUrl,
          `${trackTitleHint || 'album'}-cover`
        );
        cachedArtFileRef.current = { key: artKey, file: inlineFile };
        return inlineFile;
      }

      const remoteArtUrl = candidate.metadata.albumArtUrl || candidate.thumbnailUrl;
      if (!remoteArtUrl || !/^https?:\/\//i.test(remoteArtUrl)) {
        return null;
      }

      try {
        const resp = await fetch(
          `/api/media/artwork?url=${encodeURIComponent(remoteArtUrl)}`
        );
        if (!resp.ok) return null;
        const blob = await resp.blob();
        if (!blob || blob.size < 32) return null;
        const ext = resp.headers.get('x-artwork-extension') || 'jpg';
        const safeBase = (trackTitleHint || 'album-cover')
          .replace(/[^a-z0-9_-]+/gi, '_')
          .slice(0, 48);
        const file = new File([blob], `${safeBase}_cover.${ext}`, {
          type: blob.type || 'image/jpeg',
        });
        cachedArtFileRef.current = { key: artKey, file };
        return file;
      } catch {
        return null;
      }
    },
    []
  );

  const pushMetadataToProject = useCallback(
    async (
      candidate: MediaStreamCandidate,
      trackTitle: string,
      artistName: string,
      showConfirm = true
    ) => {
      setIsApplyingMetadata(true);
      try {
        const albumArtFile = await resolveAlbumArtFile(candidate, trackTitle);
        onApplyMetadataRef.current({
          trackTitle: trackTitle.trim(),
          artistName: artistName.trim(),
          albumArtFile,
        });
        if (showConfirm) {
          setMetadataAppliedNotice(
            albumArtFile
              ? 'Pre-populated Track Name, Artist & Album Art in Project Settings.'
              : 'Pre-populated Track Name & Artist in Project Settings.'
          );
        }
      } finally {
        setIsApplyingMetadata(false);
      }
    },
    [resolveAlbumArtFile]
  );

  useEffect(() => {
    if (!activeCandidate) {
      lastAutoSyncedCandidateIdRef.current = null;
      return;
    }
    const nextTrack = activeCandidate.metadata.trackName || stripExtension(activeCandidate.filename);
    const nextArtist = activeCandidate.metadata.artistName || '';
    setParsedTrackName(nextTrack);
    setParsedArtistName(nextArtist);
    setFilenameBase(stripExtension(activeCandidate.filename));
    setSelectedQuality(activeCandidate.qualityOptions[0]?.id ?? 'best');
    setPreviewFailed(false);
    setThumbFailed(false);
    setMetadataAppliedNotice(null);
    setSelectedFormat((prev) =>
      !activeCandidate.hasVideo && (prev === 'mp4' || prev === 'webm')
        ? 'original'
        : prev
    );
  }, [activeCandidate]);

  useEffect(() => {
    if (!activeCandidate || !autoPopulateProject) return;
    if (lastAutoSyncedCandidateIdRef.current === activeCandidate.id) return;
    lastAutoSyncedCandidateIdRef.current = activeCandidate.id;

    const nextTrack = activeCandidate.metadata.trackName || stripExtension(activeCandidate.filename);
    const nextArtist = activeCandidate.metadata.artistName || '';
    void pushMetadataToProject(activeCandidate, nextTrack, nextArtist, true);
  }, [activeCandidate, autoPopulateProject, pushMetadataToProject]);

  const formatOptions = useMemo(() => {
    const hasVideo = Boolean(activeCandidate?.hasVideo);
    const items: Array<{
      id: LinkDownloadFormat;
      label: string;
      hint: string;
      disabled?: boolean;
    }> = [
      {
        id: 'original',
        label: activeCandidate
          ? `Original (.${activeCandidate.extension})`
          : 'Original',
        hint: 'Native stream',
      },
      {
        id: 'mp4',
        label: 'MP4 Video',
        hint: 'H.264 / AAC',
        disabled: !hasVideo,
      },
      {
        id: 'webm',
        label: 'WebM Video',
        hint: 'VP9 / Opus',
        disabled: !hasVideo,
      },
      {
        id: 'mp3',
        label: 'MP3 Audio',
        hint: 'Extract audio',
      },
      {
        id: 'wav',
        label: 'WAV Audio',
        hint: 'Lossless PCM',
      },
      {
        id: 'm4a',
        label: 'M4A Audio',
        hint: 'AAC audio',
      },
    ];
    return items;
  }, [activeCandidate]);

  const triggerBrowserSave = useCallback((objectUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    setErrorMsg(null);
    try {
      if (!navigator.clipboard?.readText) {
        setErrorMsg('Clipboard access is unavailable in this browser. Paste manually with Ctrl+V.');
        return;
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setErrorMsg('Clipboard is empty.');
        return;
      }
      setUrlInput(text);
    } catch {
      setErrorMsg('Clipboard permission was blocked. Paste the link directly into the box.');
    }
  }, []);

  const handleInspectUrl = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = urlInput.trim();
      if (!trimmed) {
        setErrorMsg('Paste a video or audio URL first.');
        return;
      }

      setErrorMsg(null);
      setStatusNotice(null);
      setMetadataAppliedNotice(null);
      setIsInspecting(true);
      setInspectResult(null);
      setSelectedCandidateId(null);
      setPreviewFailed(false);
      setThumbFailed(false);

      try {
        const resp = await fetch('/api/media/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        });
        const data = (await resp.json()) as InspectMediaResponse & { error?: string };
        if (!resp.ok) {
          throw new Error(data.error || `Inspection failed (HTTP ${resp.status}).`);
        }

        setInspectResult(data);
        if (data.candidates.length > 0) {
          const first = data.candidates[0];
          setSelectedCandidateId(first.id);
          setFilenameBase(stripExtension(first.filename));
          setSelectedQuality(first.qualityOptions[0]?.id ?? 'best');
          setSelectedFormat(first.hasVideo ? 'mp4' : 'original');
        }
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : 'Could not inspect that media link.'
        );
      } finally {
        setIsInspecting(false);
      }
    },
    [urlInput]
  );

  const handleDownload = useCallback(
    async (mode: 'save' | 'studio') => {
      if (!activeCandidate || isDownloading) return;
      setErrorMsg(null);
      setStatusNotice(null);
      setIsDownloading(true);
      setDownloadAction(mode);
      setDownloadProgress({
        received: 0,
        total: activeCandidate.sizeBytes,
        phase: 'resolving',
      });

      const controller = new AbortController();
      downloadAbortRef.current = controller;

      try {
        const artPromise = autoPopulateProject
          ? resolveAlbumArtFile(activeCandidate, parsedTrackName)
          : Promise.resolve(null);

        const resp = await fetch('/api/media/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: activeCandidate.url,
            sourceType: activeCandidate.sourceType,
            format: selectedFormat,
            qualityId: selectedQuality,
            audioBitrate,
            filename: filenameBase.trim() || stripExtension(activeCandidate.filename),
          }),
          signal: controller.signal,
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
          throw new Error(errBody.error || `Download failed (HTTP ${resp.status}).`);
        }

        const totalHeader = Number(resp.headers.get('content-length') || '0');
        const expectedTotal =
          Number.isFinite(totalHeader) && totalHeader > 0
            ? totalHeader
            : selectedFormat === 'original'
              ? activeCandidate.sizeBytes
              : null;

        const encodedHeaderName = resp.headers.get('x-download-filename');
        const resolvedExt =
          selectedFormat === 'original' ? activeCandidate.extension : selectedFormat;
        const fallbackName = `${(filenameBase.trim() || 'media_download').replace(/\.[^./\\]+$/, '')}.${resolvedExt}`;
        const finalFilename = encodedHeaderName
          ? decodeURIComponent(encodedHeaderName)
          : fallbackName;
        const mimeType = resp.headers.get('content-type') || 'application/octet-stream';

        const reader = resp.body?.getReader();
        if (!reader) {
          throw new Error('Download stream unavailable.');
        }

        const chunks: BlobPart[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          chunks.push(value);
          received += value.byteLength;
          setDownloadProgress({
            received,
            total: expectedTotal,
            phase: 'fetching',
          });
        }

        const blob = new Blob(chunks, { type: mimeType });
        const file = new File([blob], finalFilename, { type: mimeType });
        const objectUrl = URL.createObjectURL(blob);
        const albumArtFile = await artPromise;
        const appliedMeta: AppliedProjectMediaMetadata = {
          trackTitle: parsedTrackName.trim(),
          artistName: parsedArtistName.trim(),
          albumArtFile,
        };

        setDownloadProgress({
          received: blob.size,
          total: blob.size,
          phase: 'done',
        });

        setHistory((prev) => [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            file,
            objectUrl,
            sourceUrl: activeCandidate.url,
            format: selectedFormat,
            createdAt: new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            }),
            metadata: appliedMeta,
          },
          ...prev.slice(0, 9),
        ]);

        if (mode === 'save') {
          triggerBrowserSave(objectUrl, finalFilename);
          if (autoPopulateProject) {
            onApplyMetadata(appliedMeta);
          }
          setStatusNotice(`Downloaded "${finalFilename}" (${formatBytes(blob.size)}).`);
        } else {
          onLoadIntoStudio(file, autoPopulateProject ? appliedMeta : undefined);
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setStatusNotice('Download cancelled.');
        } else {
          setErrorMsg(
            err instanceof Error ? err.message : 'Unable to download media from link.'
          );
        }
      } finally {
        downloadAbortRef.current = null;
        setIsDownloading(false);
        setDownloadAction(null);
      }
    },
    [
      activeCandidate,
      audioBitrate,
      autoPopulateProject,
      filenameBase,
      isDownloading,
      onApplyMetadata,
      onLoadIntoStudio,
      parsedArtistName,
      parsedTrackName,
      resolveAlbumArtFile,
      selectedFormat,
      selectedQuality,
      triggerBrowserSave,
    ]
  );

  const handleRemoveHistoryItem = useCallback((id: string) => {
    setHistory((prev) => {
      const found = prev.find((item) => item.id === id);
      if (found) URL.revokeObjectURL(found.objectUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  if (!isOpen) return null;

  const previewTargetUrl = activeCandidate?.previewUrl ?? null;
  const previewProxyUrl = previewTargetUrl
    ? `/api/media/preview?url=${encodeURIComponent(previewTargetUrl)}`
    : null;

  const inlineDataArt =
    activeCandidate?.metadata.albumArtDataUrl &&
    SAFE_DATA_IMAGE_URL_RE.test(activeCandidate.metadata.albumArtDataUrl)
      ? activeCandidate.metadata.albumArtDataUrl
      : null;

  const rawAlbumArtSrc = inlineDataArt
    ? inlineDataArt
    : activeCandidate?.metadata.albumArtUrl && /^https?:\/\//i.test(activeCandidate.metadata.albumArtUrl)
      ? `/api/media/artwork?url=${encodeURIComponent(activeCandidate.metadata.albumArtUrl)}`
      : activeCandidate?.thumbnailUrl && /^https?:\/\//i.test(activeCandidate.thumbnailUrl)
        ? `/api/media/artwork?url=${encodeURIComponent(activeCandidate.thumbnailUrl)}`
        : null;

  const progressPct =
    downloadProgress && downloadProgress.total && downloadProgress.total > 0
      ? Math.min(100, Math.round((downloadProgress.received / downloadProgress.total) * 100))
      : null;

  const isVideoTarget =
    selectedFormat === 'original' || selectedFormat === 'mp4' || selectedFormat === 'webm';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Universal Link Video & Audio Downloader"
    >
      <div className="w-full max-w-2xl max-h-[90vh] rounded-xl bg-[#121620] border border-white/[0.12] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] bg-[#0e121b] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/12 border border-cyan-400/25 flex items-center justify-center text-cyan-400 shrink-0">
              <Link2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-100 truncate">
                Universal Link Video &amp; Audio Downloader
              </h2>
              <p className="text-xs text-slate-400 truncate">
                Extracts streams, track title, artist &amp; album art into PulseWave Studio
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isDownloading}
            aria-label="Close modal"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.07] transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto studio-scroll p-5 space-y-5">
          {/* URL Form */}
          <form onSubmit={(e) => void handleInspectUrl(e)} className="space-y-2.5">
            <label
              htmlFor="media-link-input"
              className="block text-xs font-medium text-slate-300"
            >
              Video, Audio, or Webpage URL
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <input
                  ref={inputRef}
                  id="media-link-input"
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={isInspecting || isDownloading}
                  placeholder="https://youtube.com/watch?v=... or TikTok, Instagram, X, SoundCloud, Vimeo, MP4/MP3 link"
                  className="w-full rounded-lg bg-[#090b10] border border-white/[0.1] pl-3 pr-20 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60 disabled:opacity-50"
                />
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {urlInput && !isInspecting && !isDownloading && (
                    <button
                      type="button"
                      onClick={() => {
                        setUrlInput('');
                        setErrorMsg(null);
                      }}
                      title="Clear URL"
                      className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handlePasteFromClipboard()}
                    disabled={isInspecting || isDownloading}
                    title="Paste link from clipboard"
                    className="px-2 py-1 rounded text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.08] flex items-center gap-1 cursor-pointer disabled:opacity-40"
                  >
                    <ClipboardPaste className="w-3 h-3 text-cyan-400" />
                    <span>Paste</span>
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={isInspecting || isDownloading || !urlInput.trim()}
                className="px-4 py-2.5 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                {isInspecting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing...</span>
                  </>
                ) : (
                  <span>Analyze Link</span>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Automatically parses track name, artist, and album art from platform metadata, embedded ID3/MP4 tags, OpenGraph, and RSS feeds.
            </p>
          </form>

          {/* Error Banner */}
          {errorMsg && (
            <div
              role="alert"
              className="rounded-lg bg-rose-500/10 border border-rose-400/35 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-rose-200"
            >
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{errorMsg}</span>
            </div>
          )}

          {/* Success / Info Notice */}
          {statusNotice && !errorMsg && (
            <div
              role="status"
              className="rounded-lg bg-emerald-500/10 border border-emerald-400/35 px-3.5 py-2.5 flex items-center gap-2 text-xs text-emerald-200"
            >
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="flex-1">{statusNotice}</span>
            </div>
          )}

          {/* Loading Skeleton */}
          {isInspecting && (
            <div className="rounded-xl bg-[#090b10] border border-white/[0.08] p-4 space-y-3 animate-pulse">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                <span>Extracting media streams, track metadata &amp; artwork...</span>
              </div>
              <div className="h-4 w-56 rounded bg-white/[0.08]" />
              <div className="h-24 w-full rounded-lg bg-white/[0.04]" />
            </div>
          )}

          {/* Empty State */}
          {!isInspecting && !inspectResult && (
            <div className="rounded-xl bg-[#090b10] border border-white/[0.08] p-5 space-y-3">
              <h3 className="text-xs font-semibold text-slate-200">
                Universal Download &amp; Auto-Metadata
              </h3>
              <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-400 leading-relaxed">
                <div className="space-y-1">
                  <p className="font-medium text-slate-200">All Platforms &amp; Direct Links</p>
                  <p>
                    Paste links from YouTube, TikTok, Instagram, X, SoundCloud, Vimeo, podcasts, HLS/DASH streams, or direct MP4/MP3 files.
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-slate-200">Auto-Populated Project Settings</p>
                  <p>
                    Extracted track name, artist, and album cover art automatically populate your Studio overlay and Center Album Art.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Inspected Result */}
          {!isInspecting && inspectResult && (
            <div className="space-y-4">
              {inspectResult.notice && (
                <div className="rounded-lg bg-amber-500/10 border border-amber-400/30 px-3.5 py-3 text-xs text-amber-200 leading-relaxed">
                  {inspectResult.notice}
                </div>
              )}

              {inspectResult.candidates.length > 0 && (
                <>
                  {/* Stream Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-200">
                        {inspectResult.candidates.length > 1
                          ? `Discovered Media Streams (${inspectResult.candidates.length})`
                          : 'Detected Media'}
                      </span>
                      <span className="text-slate-400 truncate max-w-[260px]">
                        {inspectResult.sourceHost}
                      </span>
                    </div>

                    <div className="space-y-2">
                      {inspectResult.candidates.map((cand) => {
                        const selected = activeCandidate?.id === cand.id;
                        const durationStr = formatDuration(cand.durationSec);
                        const resolutionStr =
                          cand.width && cand.height ? `${cand.width}×${cand.height}` : null;
                        const codecStr = [cand.videoCodec, cand.audioCodec]
                          .filter(Boolean)
                          .map((c) => c!.toUpperCase())
                          .join(' / ');

                        return (
                          <button
                            key={cand.id}
                            type="button"
                            onClick={() => setSelectedCandidateId(cand.id)}
                            disabled={isDownloading}
                            className={`w-full text-left rounded-xl p-3.5 border transition-colors cursor-pointer disabled:opacity-60 ${
                              selected
                                ? 'bg-cyan-500/10 border-cyan-400/45'
                                : 'bg-[#090b10] border-white/[0.08] hover:border-white/[0.16]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0 text-cyan-400 mt-0.5">
                                  {cand.mediaKind === 'video' ? (
                                    <Film className="w-4 h-4" />
                                  ) : (
                                    <Music className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="min-w-0 space-y-1">
                                  <p className="text-xs font-semibold text-slate-100 truncate">
                                    {cand.title}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-400">
                                    <span className="text-slate-300">{cand.sourceLabel}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono uppercase">{cand.extension}</span>
                                    {resolutionStr && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums">{resolutionStr}</span>
                                      </>
                                    )}
                                    {codecStr && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono">{codecStr}</span>
                                      </>
                                    )}
                                    {durationStr && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums">{durationStr}</span>
                                      </>
                                    )}
                                    {cand.sizeBytes && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="font-mono tabular-nums">
                                          {formatBytes(cand.sizeBytes)}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/^https?:\/\//i.test(cand.url) && (
                                <a
                                  href={cand.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  title="Open source URL in new tab"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.07] shrink-0"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Parsed Metadata & Project Settings Pre-population Card */}
                  {activeCandidate && (
                    <div className="rounded-xl bg-[#090b10] border border-white/[0.08] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <Disc3 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                          <span className="font-semibold text-slate-200">
                            Parsed Track Metadata
                          </span>
                          <span className="text-[11px] text-slate-400">
                            · {activeCandidate.metadata.metadataSource}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={isApplyingMetadata || isDownloading}
                          onClick={() =>
                            void pushMetadataToProject(
                              activeCandidate,
                              parsedTrackName,
                              parsedArtistName,
                              true
                            )
                          }
                          className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 transition-colors cursor-pointer disabled:opacity-45 whitespace-nowrap"
                        >
                          {isApplyingMetadata ? 'Syncing...' : 'Sync to Project Settings'}
                        </button>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 items-start">
                        {/* Album Art Thumbnail */}
                        <div className="w-20 h-20 rounded-lg bg-[#121620] border border-white/[0.09] overflow-hidden flex items-center justify-center shrink-0">
                          {rawAlbumArtSrc && !thumbFailed ? (
                            <img
                              src={rawAlbumArtSrc}
                              alt={parsedTrackName || 'Album artwork'}
                              referrerPolicy="no-referrer"
                              onError={() => setThumbFailed(true)}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-1 text-slate-500">
                              <ImageIcon className="w-5 h-5" />
                              <span className="text-[10px]">No Cover</span>
                            </div>
                          )}
                        </div>

                        {/* Track Title & Artist Inputs */}
                        <div className="flex-1 min-w-0 w-full grid sm:grid-cols-2 gap-2.5">
                          <label className="block space-y-1">
                            <span className="text-[11px] text-slate-400">Track Name</span>
                            <input
                              type="text"
                              value={parsedTrackName}
                              onChange={(e) => setParsedTrackName(e.target.value)}
                              disabled={isDownloading}
                              placeholder="Detected track title"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#121620] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                            />
                          </label>
                          <label className="block space-y-1">
                            <span className="text-[11px] text-slate-400">Artist</span>
                            <input
                              type="text"
                              value={parsedArtistName}
                              onChange={(e) => setParsedArtistName(e.target.value)}
                              disabled={isDownloading}
                              placeholder="Detected artist"
                              className="w-full px-2.5 py-1.5 rounded-lg bg-[#121620] border border-white/[0.09] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-400/60"
                            />
                          </label>
                          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-2 pt-0.5">
                            <label className="flex items-center gap-2 text-[11px] text-slate-300 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={autoPopulateProject}
                                onChange={(e) => setAutoPopulateProject(e.target.checked)}
                                className="rounded border-white/20 bg-[#121620] text-cyan-400 focus:ring-cyan-400/40"
                              />
                              <span>
                                Auto-populate Track Name, Artist &amp; Album Art in Project Settings
                              </span>
                            </label>
                            {activeCandidate.metadata.albumName && (
                              <span className="text-[11px] text-slate-400 truncate max-w-[200px]">
                                Album: {activeCandidate.metadata.albumName}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {metadataAppliedNotice && (
                        <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          <span>{metadataAppliedNotice}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Preview Player */}
                  {activeCandidate && previewProxyUrl && !previewFailed && (
                    <div className="rounded-xl bg-[#090b10] border border-white/[0.08] p-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span className="flex items-center gap-1.5 font-medium text-slate-300">
                          <Play className="w-3 h-3 text-cyan-400" />
                          <span>Media Preview</span>
                        </span>
                        <span className="font-mono truncate max-w-[260px]">
                          {activeCandidate.platform}
                        </span>
                      </div>
                      {activeCandidate.mediaKind === 'video' ? (
                        <video
                          key={previewProxyUrl}
                          src={previewProxyUrl}
                          controls
                          preload="metadata"
                          poster={!thumbFailed && rawAlbumArtSrc ? rawAlbumArtSrc : undefined}
                          onError={() => setPreviewFailed(true)}
                          className="w-full max-h-56 rounded-lg bg-black object-contain"
                        />
                      ) : (
                        <audio
                          key={previewProxyUrl}
                          src={previewProxyUrl}
                          controls
                          preload="metadata"
                          onError={() => setPreviewFailed(true)}
                          className="w-full h-10"
                        />
                      )}
                    </div>
                  )}

                  {/* Format, Quality & Output Name Configuration */}
                  {activeCandidate && (
                    <div className="rounded-xl bg-[#090b10] border border-white/[0.08] p-4 space-y-4">
                      <div className="space-y-2">
                        <span className="block text-xs font-semibold text-slate-200">
                          Output Format
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {formatOptions.map((opt) => {
                            const active = selectedFormat === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                disabled={opt.disabled || isDownloading}
                                onClick={() => setSelectedFormat(opt.id)}
                                className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                                  active
                                    ? 'bg-cyan-500/15 border-cyan-400/50 text-cyan-100'
                                    : 'bg-[#121620] border-white/[0.08] text-slate-300 hover:border-white/[0.18]'
                                }`}
                              >
                                <div className="text-xs font-semibold whitespace-nowrap truncate">
                                  {opt.label}
                                </div>
                                <div className="text-[10.5px] text-slate-400 whitespace-nowrap truncate">
                                  {opt.hint}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {activeCandidate.hasVideo &&
                        isVideoTarget &&
                        activeCandidate.qualityOptions.length > 1 && (
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <span className="text-xs text-slate-300 font-medium">
                              Video Quality
                            </span>
                            <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#121620] border border-white/[0.08]">
                              {activeCandidate.qualityOptions.map((q) => (
                                <button
                                  key={q.id}
                                  type="button"
                                  disabled={isDownloading}
                                  onClick={() => setSelectedQuality(q.id)}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                                    selectedQuality === q.id
                                      ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {q.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                      {(selectedFormat === 'mp3' || selectedFormat === 'm4a') && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-slate-300 font-medium">
                            Audio Bitrate
                          </span>
                          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#121620] border border-white/[0.08]">
                            {(['128k', '192k', '320k'] as const).map((br) => (
                              <button
                                key={br}
                                type="button"
                                disabled={isDownloading}
                                onClick={() => setAudioBitrate(br)}
                                className={`px-2.5 py-1 rounded-md text-[11px] font-mono tabular-nums transition-colors cursor-pointer ${
                                  audioBitrate === br
                                    ? 'bg-cyan-400 text-[#090b10] font-semibold'
                                    : 'text-slate-400 hover:text-slate-200'
                                }`}
                              >
                                {br}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <label className="block space-y-1.5">
                        <span className="text-xs font-medium text-slate-300">
                          Save Filename
                        </span>
                        <div className="flex items-center rounded-lg bg-[#121620] border border-white/[0.09] focus-within:border-cyan-400/60 overflow-hidden">
                          <input
                            type="text"
                            value={filenameBase}
                            onChange={(e) => setFilenameBase(e.target.value)}
                            disabled={isDownloading}
                            placeholder="my_downloaded_media"
                            className="flex-1 min-w-0 bg-transparent px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
                          />
                          <span className="px-3 py-2 text-xs font-mono text-slate-400 border-l border-white/[0.08] bg-[#0d1018] shrink-0">
                            .{selectedFormat === 'original' ? activeCandidate.extension : selectedFormat}
                          </span>
                        </div>
                      </label>

                      {/* Progress Bar during download/transcode */}
                      {isDownloading && downloadProgress && (
                        <div className="space-y-1.5 pt-1">
                          <div className="flex items-center justify-between text-[11px] text-slate-300">
                            <span>
                              {downloadProgress.phase === 'resolving'
                                ? 'Fetching & preparing media stream...'
                                : 'Transferring file...'}
                            </span>
                            <span className="font-mono tabular-nums text-cyan-300">
                              {formatBytes(downloadProgress.received)}
                              {progressPct !== null ? ` · ${progressPct}%` : ''}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                            <div
                              className={`h-full bg-cyan-400 transition-all duration-150 ${
                                progressPct === null ? 'w-1/2 animate-pulse' : ''
                              }`}
                              style={
                                progressPct !== null ? { width: `${progressPct}%` } : undefined
                              }
                            />
                          </div>
                        </div>
                      )}

                      {/* Primary & Secondary Actions */}
                      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                        {isDownloading ? (
                          <button
                            type="button"
                            onClick={() => downloadAbortRef.current?.abort()}
                            className="px-4 py-2 rounded-lg text-xs font-medium bg-rose-500/15 hover:bg-rose-500/25 text-rose-200 border border-rose-400/35 transition-colors cursor-pointer"
                          >
                            Cancel Transfer
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleDownload('studio')}
                              disabled={isExporting}
                              className="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-100 border border-white/[0.1] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
                            >
                              <Upload className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Load into Studio</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleDownload('save')}
                              className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download File</span>
                            </button>
                          </>
                        )}

                        {isDownloading && (
                          <div className="flex items-center gap-1.5 text-xs text-cyan-300 font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>
                              {downloadAction === 'studio'
                                ? 'Preparing for Studio...'
                                : 'Preparing download...'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Session Download History */}
          {history.length > 0 && (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-200">
                  Recent Downloads ({history.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    for (const item of history) {
                      URL.revokeObjectURL(item.objectUrl);
                    }
                    setHistory([]);
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Clear list
                </button>
              </div>
              <div className="space-y-1.5">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg bg-[#090b10] border border-white/[0.08] px-3 py-2 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-200 truncate">
                        {item.file.name}
                      </p>
                      <p className="text-[11px] text-slate-400 font-mono tabular-nums">
                        {item.format.toUpperCase()} · {formatBytes(item.file.size)} · {item.createdAt}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => triggerBrowserSave(item.objectUrl, item.file.name)}
                        title="Save file again"
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-white/[0.06] hover:bg-white/[0.11] text-slate-200 border border-white/[0.08] flex items-center gap-1 cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="w-3 h-3 text-cyan-400" />
                        <span>Save</span>
                      </button>
                      <button
                        type="button"
                        disabled={isExporting}
                        onClick={() => onLoadIntoStudio(item.file, item.metadata)}
                        title="Load this file into PulseWave Studio"
                        className="px-2.5 py-1.5 rounded-md text-[11px] font-medium bg-cyan-500/12 hover:bg-cyan-500/20 text-cyan-200 border border-cyan-400/30 flex items-center gap-1 cursor-pointer whitespace-nowrap disabled:opacity-40"
                      >
                        <Upload className="w-3 h-3" />
                        <span>Use</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveHistoryItem(item.id)}
                        title="Remove from list"
                        className="p-1.5 rounded-md text-slate-500 hover:text-rose-300 hover:bg-white/[0.05] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
