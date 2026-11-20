import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Download,
  ExternalLink,
  Film,
  Layers,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import {
  AspectRatioKey,
  LyricLine,
  resolveExportDimensions,
  ShareableVideoAsset,
} from '../types/studio';
import {
  buildDefaultShareDraft,
  copyTextToClipboard,
  evaluatePlatformCompatibility,
  formatFileSize,
  formatPlatformPostText,
  ShareDraft,
  shareVideoViaWebShare,
  SOCIAL_PLATFORMS,
  SocialPlatformId,
  supportsNativeFileShare,
  triggerMp4Download,
} from '../utils/socialShare';

interface ShareModalProps {
  isOpen: boolean;
  assets: ShareableVideoAsset[];
  initialAssetId: string | null;
  lyrics: LyricLine[];
  hasAudio: boolean;
  isExporting: boolean;
  onClose: () => void;
  onRenderCurrentClip: () => void;
  onRenderForRatio: (ratio: AspectRatioKey) => void;
  onOpenBatchExport: () => void;
}

const SUGGESTED_TAGS = [
  '#musicvisualizer',
  '#newmusic',
  '#audio',
  '#shorts',
  '#reels',
  '#fyp',
  '#electronicmusic',
];

export function ShareModal({
  isOpen,
  assets,
  initialAssetId,
  lyrics,
  hasAudio,
  isExporting,
  onClose,
  onRenderCurrentClip,
  onRenderForRatio,
  onOpenBatchExport,
}: ShareModalProps) {
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(initialAssetId);
  const [selectedPlatform, setSelectedPlatform] = useState<SocialPlatformId>('youtube');
  const [draft, setDraft] = useState<ShareDraft>({
    title: '',
    caption: '',
    hashtags: ['#musicvisualizer', '#newmusic'],
  });
  const [hashtagInput, setHashtagInput] = useState('');
  const [copiedNotice, setCopiedNotice] = useState(false);
  const [shareFeedback, setShareFeedback] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [isSharingNative, setIsSharingNative] = useState(false);

  const selectedAsset = useMemo(() => {
    if (assets.length === 0) return null;
    return assets.find((a) => a.id === selectedAssetId) ?? assets[0];
  }, [assets, selectedAssetId]);

  useEffect(() => {
    if (!isOpen) return;
    if (initialAssetId && assets.some((a) => a.id === initialAssetId)) {
      setSelectedAssetId(initialAssetId);
    } else if (assets.length > 0 && (!selectedAssetId || !assets.some((a) => a.id === selectedAssetId))) {
      setSelectedAssetId(assets[0].id);
    }
  }, [isOpen, initialAssetId, assets, selectedAssetId]);

  useEffect(() => {
    if (!selectedAsset) return;
    const nextDraft = buildDefaultShareDraft(selectedAsset, lyrics);
    setDraft(nextDraft);
    setHashtagInput(nextDraft.hashtags.join(' '));
    setShareFeedback(null);

    // Auto-select the best matching primary platform for this export's aspect ratio
    if (selectedAsset.aspectRatio === '9:16') {
      setSelectedPlatform('tiktok');
    } else if (selectedAsset.aspectRatio === '1:1') {
      setSelectedPlatform('instagram');
    } else {
      setSelectedPlatform('youtube');
    }
  }, [selectedAsset?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!copiedNotice) return;
    const t = setTimeout(() => setCopiedNotice(false), 2200);
    return () => clearTimeout(t);
  }, [copiedNotice]);

  if (!isOpen) return null;

  const platformSpec =
    SOCIAL_PLATFORMS.find((p) => p.id === selectedPlatform) ?? SOCIAL_PLATFORMS[0];
  const compatibility = selectedAsset
    ? evaluatePlatformCompatibility(selectedPlatform, selectedAsset)
    : null;
  const formattedPostText = selectedAsset
    ? formatPlatformPostText(selectedPlatform, draft, selectedAsset)
    : '';
  const uploadUrl = selectedAsset
    ? platformSpec.getUploadUrl(selectedAsset, formattedPostText)
    : '#';
  const ratioMeta = selectedAsset
    ? resolveExportDimensions(selectedAsset.aspectRatio, selectedAsset.exportResolution)
    : null;
  const nativeShareAvailable = supportsNativeFileShare();

  const handleHashtagsTextChange = (value: string) => {
    setHashtagInput(value);
    const parsed = value
      .split(/[\s,]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith('#') ? t : `#${t}`));
    setDraft((prev) => ({ ...prev, hashtags: parsed }));
  };

  const toggleSuggestedTag = (tag: string) => {
    const exists = draft.hashtags.some((t) => t.toLowerCase() === tag.toLowerCase());
    const next = exists
      ? draft.hashtags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...draft.hashtags, tag];
    setDraft((prev) => ({ ...prev, hashtags: next }));
    setHashtagInput(next.join(' '));
  };

  const handleCopyPost = async () => {
    if (!formattedPostText) return;
    const ok = await copyTextToClipboard(formattedPostText);
    if (ok) {
      setCopiedNotice(true);
      setShareFeedback({
        type: 'success',
        text: `Copied formatted ${platformSpec.shortLabel} title, caption, and tags.`,
      });
    } else {
      setShareFeedback({
        type: 'error',
        text: 'Clipboard access was blocked. Select and copy the text manually.',
      });
    }
  };

  const handlePrepareAndOpenPlatform = async () => {
    if (!selectedAsset) return;
    const copied = await copyTextToClipboard(formattedPostText);
    triggerMp4Download(selectedAsset.downloadUrl, selectedAsset.downloadFileName);
    setShareFeedback({
      type: 'success',
      text: copied
        ? `Downloaded ${selectedAsset.downloadFileName} and copied your ${platformSpec.shortLabel} post text.`
        : `Downloaded ${selectedAsset.downloadFileName}. Upload it in ${platformSpec.shortLabel}.`,
    });
  };

  const handleNativeShare = async () => {
    if (!selectedAsset || isSharingNative) return;
    setIsSharingNative(true);
    setShareFeedback(null);
    const result = await shareVideoViaWebShare(
      selectedAsset,
      draft.title.trim() || selectedAsset.downloadFileName,
      formattedPostText
    );
    setIsSharingNative(false);

    if (result.status === 'shared') {
      setShareFeedback({
        type: 'success',
        text: 'Shared MP4 video via device share sheet.',
      });
    } else if (result.status === 'unsupported') {
      setShareFeedback({
        type: 'info',
        text: 'Direct file sharing is not supported in this desktop browser. Use "Download & Open" to upload directly.',
      });
    } else if (result.status === 'error') {
      setShareFeedback({
        type: 'info',
        text: result.message,
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div className="w-full max-w-4xl rounded-xl bg-[#121620] border border-white/[0.1] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/30 text-cyan-400 flex items-center justify-center shrink-0">
              <Share2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 id="share-modal-title" className="text-sm font-semibold text-slate-100">
                Share &amp; Publish Video
              </h3>
              <p className="text-xs text-slate-400 mt-0.5 truncate">
                {assets.length > 0
                  ? `${assets.length} rendered MP4 ${assets.length === 1 ? 'ready' : 'versions ready'} · YouTube, TikTok, Facebook, Instagram, X & LinkedIn`
                  : 'Export an MP4 to share across social video platforms'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close share dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        {!selectedAsset ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-400/25 text-cyan-400 flex items-center justify-center mx-auto mb-3.5">
              <Film className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-semibold text-slate-100">
              No rendered MP4 ready to share yet
            </h4>
            <p className="text-xs text-slate-400 mt-1.5 max-w-md mx-auto leading-relaxed">
              Render your current visualizer clip to MP4 first, or queue multiple aspect ratios (16:9 for YouTube, 9:16 for TikTok &amp; Reels) in Batch Export.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                disabled={!hasAudio || isExporting}
                onClick={onRenderCurrentClip}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Render MP4 Now</span>
              </button>
              <button
                type="button"
                disabled={!hasAudio || isExporting}
                onClick={onOpenBatchExport}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>Open Batch Queue</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            {/* Rendered Version Selector (when multiple MP4s are available from batch/single exports) */}
            {assets.length > 1 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="text-[11px] text-slate-400 shrink-0">Rendered Clip:</span>
                {assets.map((asset) => {
                  const active = asset.id === selectedAsset.id;
                  return (
                    <button
                      key={asset.id}
                      type="button"
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-200'
                          : 'bg-[#090b10] border-white/[0.08] text-slate-300 hover:text-white'
                      }`}
                    >
                      {asset.label} ({asset.aspectRatio})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Video Preview + File Actions */}
              <div className="lg:col-span-5 space-y-3">
                <div className="rounded-lg bg-[#05070b] border border-white/[0.08] overflow-hidden flex items-center justify-center">
                  <video
                    key={selectedAsset.downloadUrl}
                    src={selectedAsset.downloadUrl}
                    controls
                    playsInline
                    className="w-full max-h-[290px] object-contain"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 font-mono tabular-nums">
                  <span className="text-slate-200 font-sans font-medium truncate max-w-[180px]">
                    {selectedAsset.downloadFileName}
                  </span>
                  {ratioMeta && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>
                        {ratioMeta.width}×{ratioMeta.height}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span>{selectedAsset.durationSec.toFixed(1)}s</span>
                  {selectedAsset.fileSizeBytes && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{formatFileSize(selectedAsset.fileSizeBytes)}</span>
                    </>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  {nativeShareAvailable && (
                    <button
                      type="button"
                      disabled={isSharingNative}
                      onClick={() => void handleNativeShare()}
                      className="w-full px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>
                        {isSharingNative
                          ? 'Opening Share Sheet...'
                          : 'Share Video via Device Sheet'}
                      </span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      triggerMp4Download(
                        selectedAsset.downloadUrl,
                        selectedAsset.downloadFileName
                      )
                    }
                    className="w-full px-4 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Save MP4 to Computer</span>
                  </button>
                </div>
              </div>

              {/* Right Column: Platform Selector + Post Metadata + Launch Uploader */}
              <div className="lg:col-span-7 space-y-4">
                {/* Platform Picker */}
                <div>
                  <span className="block text-xs font-medium text-slate-300 mb-2">
                    Destination Platform
                  </span>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {SOCIAL_PLATFORMS.map((platform) => {
                      const active = platform.id === selectedPlatform;
                      return (
                        <button
                          key={platform.id}
                          type="button"
                          onClick={() => {
                            setSelectedPlatform(platform.id);
                            setShareFeedback(null);
                          }}
                          className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors text-center whitespace-nowrap cursor-pointer ${
                            active
                              ? 'bg-white/[0.1] border-cyan-400/50 text-white'
                              : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200 hover:border-white/[0.16]'
                          }`}
                        >
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle"
                            style={{ backgroundColor: platform.accentHex }}
                          />
                          {platform.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Spec Compatibility Check */}
                {compatibility && (
                  <div
                    className={`rounded-lg border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs ${
                      compatibility.status === 'optimal'
                        ? 'bg-emerald-500/[0.07] border-emerald-500/25 text-emerald-200'
                        : 'bg-amber-500/[0.08] border-amber-500/30 text-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {compatibility.status === 'optimal' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span>{compatibility.summary}</span>
                    </div>

                    {compatibility.recommendedRatio && hasAudio && !isExporting && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onRenderForRatio(compatibility.recommendedRatio!);
                        }}
                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-[#090b10] transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Render {compatibility.recommendedRatio}</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Post Copy Composer */}
                <div className="space-y-3">
                  <label className="block">
                    <span className="text-xs font-medium text-slate-300 block mb-1">
                      Video Title
                    </span>
                    <input
                      type="text"
                      value={draft.title}
                      maxLength={100}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, title: e.target.value }))
                      }
                      placeholder="Track title & artist..."
                      className="w-full rounded-lg bg-[#090b10] border border-white/[0.09] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 outline-none"
                    />
                  </label>

                  <label className="block">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-slate-300">
                        Caption / Description
                      </span>
                      <span
                        className={`text-[11px] font-mono tabular-nums ${
                          formattedPostText.length > platformSpec.captionLimit
                            ? 'text-rose-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {formattedPostText.length} / {platformSpec.captionLimit}
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      value={draft.caption}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, caption: e.target.value }))
                      }
                      placeholder="Write a caption, track story, or credits..."
                      className="w-full rounded-lg bg-[#090b10] border border-white/[0.09] px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:border-cyan-400/60 outline-none resize-none"
                    />
                  </label>

                  <div>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-300 block mb-1">
                        Hashtags
                      </span>
                      <input
                        type="text"
                        value={hashtagInput}
                        onChange={(e) => handleHashtagsTextChange(e.target.value)}
                        placeholder="#musicvisualizer #newmusic #shorts"
                        className="w-full rounded-lg bg-[#090b10] border border-white/[0.09] px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 outline-none"
                      />
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {SUGGESTED_TAGS.map((tag) => {
                        const active = draft.hashtags.some(
                          (t) => t.toLowerCase() === tag.toLowerCase()
                        );
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => toggleSuggestedTag(tag)}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                              active
                                ? 'bg-cyan-500/15 border-cyan-400/40 text-cyan-300'
                                : 'bg-[#090b10] border-white/[0.08] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Publish / Copy Action Bar */}
                <div className="pt-2 border-t border-white/[0.08] space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void handleCopyPost()}
                      className="px-3.5 py-2 rounded-lg text-xs font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {copiedNotice ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <ClipboardCopy className="w-3.5 h-3.5 text-cyan-400" />
                      )}
                      <span>{copiedNotice ? 'Copied!' : 'Copy Caption & Tags'}</span>
                    </button>

                    <a
                      href={uploadUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => void handlePrepareAndOpenPlatform()}
                      className="flex-1 min-w-[200px] px-4 py-2 rounded-lg text-xs font-semibold bg-cyan-400 hover:bg-cyan-300 text-[#090b10] transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap"
                    >
                      <span>Download MP4 &amp; {platformSpec.actionLabel}</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    {platformSpec.uploadInstructions}
                  </p>

                  {shareFeedback && (
                    <div
                      role="status"
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        shareFeedback.type === 'success'
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                          : shareFeedback.type === 'error'
                          ? 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                          : 'bg-cyan-500/10 border-cyan-400/30 text-cyan-200'
                      }`}
                    >
                      {shareFeedback.text}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
