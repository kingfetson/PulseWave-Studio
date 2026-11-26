import { useCallback, useMemo, useRef, useState } from 'react';
import {
  LyricLine,
  ProjectMediaSnapshot,
  ProjectMetaSnapshot,
  SnapshotKind,
  StudioSettings,
} from '../types/studio';

export interface StudioSnapshot {
  settings: StudioSettings;
  lyrics: LyricLine[];
  media: ProjectMediaSnapshot;
  projectMeta: ProjectMetaSnapshot;
}

export interface StudioHistoryEntry {
  id: string;
  label: string;
  kind: SnapshotKind;
  timestamp: string;
  snapshot: StudioSnapshot;
}

export interface HistoryTimelineItem {
  id: string;
  label: string;
  kind: SnapshotKind;
  timestamp: string;
  position: 'past' | 'present' | 'future';
  projectName: string;
  audioFileName: string | null;
  bgImageName: string | null;
  albumImageName: string | null;
  mocapName: string | null;
  mixClipCount: number;
  lyricsCount: number;
  visualizerMode: StudioSettings['visualizerMode'];
}

export interface HistoryCommitOptions {
  mergeKey?: string;
  label?: string;
  kind?: SnapshotKind;
}

interface HistoryState {
  past: StudioHistoryEntry[];
  present: StudioHistoryEntry;
  future: StudioHistoryEntry[];
}

const MAX_HISTORY = 80;
const COALESCE_WINDOW_MS = 450;

let entryCounter = 0;
function createHistoryEntryId(): string {
  entryCounter += 1;
  return `hist-${Date.now()}-${entryCounter}-${Math.random().toString(36).slice(2, 6)}`;
}

function areMixClipsEqual(
  a: ProjectMediaSnapshot['mixClips'],
  b: ProjectMediaSnapshot['mixClips']
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const ca = a[i];
    const cb = b[i];
    if (ca === cb) continue;
    if (
      ca.id !== cb.id ||
      ca.name !== cb.name ||
      ca.kind !== cb.kind ||
      ca.startTime !== cb.startTime ||
      ca.trimStart !== cb.trimStart ||
      ca.trimEnd !== cb.trimEnd ||
      ca.volume !== cb.volume ||
      ca.muted !== cb.muted ||
      ca.solo !== cb.solo ||
      ca.fadeIn !== cb.fadeIn ||
      ca.fadeOut !== cb.fadeOut ||
      ca.videoOpacity !== cb.videoOpacity ||
      (ca.videoBlendMode ?? 'normal') !== (cb.videoBlendMode ?? 'normal')
    ) {
      return false;
    }
  }
  return true;
}

function areMediaSnapshotsEqual(a: ProjectMediaSnapshot, b: ProjectMediaSnapshot): boolean {
  if (a === b) return true;
  return (
    a.audioFileName === b.audioFileName &&
    a.audioBlob === b.audioBlob &&
    a.audioBuffer === b.audioBuffer &&
    a.duration === b.duration &&
    a.trimStart === b.trimStart &&
    a.trimEnd === b.trimEnd &&
    a.bgImageName === b.bgImageName &&
    a.bgImageBlob === b.bgImageBlob &&
    a.bgImage === b.bgImage &&
    a.albumImageName === b.albumImageName &&
    a.albumImageBlob === b.albumImageBlob &&
    a.albumImage === b.albumImage &&
    a.mocapClip === b.mocapClip &&
    a.mixOptions.normalizeMixAudio === b.mixOptions.normalizeMixAudio &&
    a.mixOptions.defaultCrossfadeSec === b.mixOptions.defaultCrossfadeSec &&
    areMixClipsEqual(a.mixClips, b.mixClips)
  );
}

function areProjectMetaEqual(a: ProjectMetaSnapshot, b: ProjectMetaSnapshot): boolean {
  if (a === b) return true;
  if (
    a.id !== b.id ||
    a.name !== b.name ||
    a.createdAt !== b.createdAt ||
    a.status !== b.status ||
    a.completedAt !== b.completedAt ||
    a.lastExportedAt !== b.lastExportedAt ||
    a.exportCount !== b.exportCount ||
    a.tags.length !== b.tags.length
  ) {
    return false;
  }
  for (let i = 0; i < a.tags.length; i++) {
    if (a.tags[i] !== b.tags[i]) return false;
  }
  return true;
}

function areLyricsEqual(a: LyricLine[], b: LyricLine[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].time !== b[i].time || a[i].text !== b[i].text) {
      return false;
    }
  }
  return true;
}

function areSnapshotsEqual(a: StudioSnapshot, b: StudioSnapshot): boolean {
  if (a === b) return true;
  const settingsEqual =
    a.settings === b.settings || JSON.stringify(a.settings) === JSON.stringify(b.settings);
  if (!settingsEqual) return false;
  if (!areLyricsEqual(a.lyrics, b.lyrics)) return false;
  if (!areMediaSnapshotsEqual(a.media, b.media)) return false;
  if (!areProjectMetaEqual(a.projectMeta, b.projectMeta)) return false;
  return true;
}

function inferHistoryMeta(
  prev: StudioSnapshot,
  next: StudioSnapshot
): { label: string; kind: SnapshotKind } {
  const settingsChanged =
    prev.settings !== next.settings &&
    JSON.stringify(prev.settings) !== JSON.stringify(next.settings);
  const lyricsChanged = !areLyricsEqual(prev.lyrics, next.lyrics);
  const mediaChanged = !areMediaSnapshotsEqual(prev.media, next.media);
  const metaChanged = !areProjectMetaEqual(prev.projectMeta, next.projectMeta);

  const changedDomains = [settingsChanged, lyricsChanged, mediaChanged, metaChanged].filter(
    Boolean
  ).length;

  if (changedDomains > 1 || metaChanged) {
    return {
      label: next.projectMeta.name
        ? `Project State: ${next.projectMeta.name}`
        : 'Project State Snapshot',
      kind: 'project-state',
    };
  }
  if (mediaChanged) {
    if (prev.media.audioFileName !== next.media.audioFileName) {
      return {
        label: next.media.audioFileName
          ? `Audio: ${next.media.audioFileName}`
          : 'Cleared audio track',
        kind: 'media',
      };
    }
    if (
      prev.media.bgImageName !== next.media.bgImageName ||
      prev.media.bgImageBlob !== next.media.bgImageBlob
    ) {
      return {
        label: next.media.bgImageName
          ? `Backdrop: ${next.media.bgImageName}`
          : 'Cleared backdrop image',
        kind: 'media',
      };
    }
    if (
      prev.media.albumImageName !== next.media.albumImageName ||
      prev.media.albumImageBlob !== next.media.albumImageBlob
    ) {
      return {
        label: next.media.albumImageName
          ? `Cover Art: ${next.media.albumImageName}`
          : 'Cleared cover art',
        kind: 'media',
      };
    }
    if (prev.media.mocapClip !== next.media.mocapClip) {
      return {
        label: next.media.mocapClip
          ? `Mocap: ${next.media.mocapClip.name}`
          : 'Cleared mocap clip',
        kind: 'media',
      };
    }
    if (!areMixClipsEqual(prev.media.mixClips, next.media.mixClips)) {
      return {
        label:
          next.media.mixClips.length > 0
            ? `Mix (${next.media.mixClips.length} tracks)`
            : 'Cleared mix tracks',
        kind: 'media',
      };
    }
    if (
      prev.media.trimStart !== next.media.trimStart ||
      prev.media.trimEnd !== next.media.trimEnd
    ) {
      return { label: 'Adjusted trim range', kind: 'media' };
    }
    return { label: 'Updated media assignments', kind: 'media' };
  }
  if (lyricsChanged) {
    return {
      label:
        next.lyrics.length === 0
          ? 'Cleared lyrics'
          : `Edited lyrics (${next.lyrics.length})`,
      kind: 'lyrics',
    };
  }
  if (settingsChanged) {
    if (prev.settings.visualizerMode !== next.settings.visualizerMode) {
      return { label: `Visualizer: ${next.settings.visualizerMode}`, kind: 'settings' };
    }
    if (prev.settings.aspectRatio !== next.settings.aspectRatio) {
      return { label: `Aspect ratio: ${next.settings.aspectRatio}`, kind: 'settings' };
    }
    return { label: 'Updated studio settings', kind: 'settings' };
  }
  return { label: 'Project State Snapshot', kind: 'project-state' };
}

function makeEntry(
  snapshot: StudioSnapshot,
  label: string,
  kind: SnapshotKind
): StudioHistoryEntry {
  return {
    id: createHistoryEntryId(),
    label,
    kind,
    timestamp: new Date().toISOString(),
    snapshot,
  };
}

export function useStudioHistory(initialPresent: StudioSnapshot) {
  const initialEntryRef = useRef<StudioHistoryEntry | null>(null);
  if (!initialEntryRef.current) {
    initialEntryRef.current = makeEntry(
      initialPresent,
      'Initial Project State',
      'project-state'
    );
  }

  const initialState: HistoryState = {
    past: [],
    present: initialEntryRef.current,
    future: [],
  };

  const [history, setHistory] = useState<HistoryState>(initialState);
  const historyRef = useRef<HistoryState>(initialState);
  const lastMergeRef = useRef<{ key: string; timestamp: number } | null>(null);

  const commit = useCallback(
    (
      updater: (prev: StudioSnapshot) => StudioSnapshot,
      options?: string | HistoryCommitOptions
    ) => {
      const normalizedOpts: HistoryCommitOptions =
        typeof options === 'string' ? { mergeKey: options } : options ?? {};
      const mergeKey = normalizedOpts.mergeKey;
      const now = Date.now();
      const lastMerge = lastMergeRef.current;
      const shouldMerge =
        Boolean(mergeKey) &&
        lastMerge !== null &&
        lastMerge.key === mergeKey &&
        now - lastMerge.timestamp < COALESCE_WINDOW_MS;

      lastMergeRef.current = mergeKey ? { key: mergeKey, timestamp: now } : null;

      const prev = historyRef.current;
      const nextSnapshot = updater(prev.present.snapshot);
      if (areSnapshotsEqual(nextSnapshot, prev.present.snapshot)) {
        return;
      }

      const inferred = inferHistoryMeta(prev.present.snapshot, nextSnapshot);
      const label = normalizedOpts.label || inferred.label;
      const kind = normalizedOpts.kind || inferred.kind;

      let nextState: HistoryState;
      if (shouldMerge) {
        nextState = {
          past: prev.past,
          present: {
            ...prev.present,
            label: normalizedOpts.label || prev.present.label,
            timestamp: new Date().toISOString(),
            snapshot: nextSnapshot,
          },
          future: [],
        };
      } else {
        const nextPast =
          prev.past.length >= MAX_HISTORY
            ? [...prev.past.slice(prev.past.length - MAX_HISTORY + 1), prev.present]
            : [...prev.past, prev.present];
        nextState = {
          past: nextPast,
          present: makeEntry(nextSnapshot, label, kind),
          future: [],
        };
      }

      historyRef.current = nextState;
      setHistory(nextState);
    },
    []
  );

  const commitProjectSnapshot = useCallback(
    (
      updaterOrSnapshot: StudioSnapshot | ((prev: StudioSnapshot) => StudioSnapshot),
      label = 'Project State Snapshot'
    ) => {
      lastMergeRef.current = null;
      const prev = historyRef.current;
      const nextSnapshot =
        typeof updaterOrSnapshot === 'function'
          ? updaterOrSnapshot(prev.present.snapshot)
          : updaterOrSnapshot;

      const nextPast =
        prev.past.length >= MAX_HISTORY
          ? [...prev.past.slice(prev.past.length - MAX_HISTORY + 1), prev.present]
          : [...prev.past, prev.present];

      const nextState: HistoryState = {
        past: nextPast,
        present: makeEntry(nextSnapshot, label, 'project-state'),
        future: [],
      };
      historyRef.current = nextState;
      setHistory(nextState);
    },
    []
  );

  const undo = useCallback((): StudioSnapshot | null => {
    lastMergeRef.current = null;
    const prev = historyRef.current;
    if (prev.past.length === 0) return null;
    const previous = prev.past[prev.past.length - 1];
    const nextState: HistoryState = {
      past: prev.past.slice(0, -1),
      present: previous,
      future: [prev.present, ...prev.future],
    };
    historyRef.current = nextState;
    setHistory(nextState);
    return previous.snapshot;
  }, []);

  const redo = useCallback((): StudioSnapshot | null => {
    lastMergeRef.current = null;
    const prev = historyRef.current;
    if (prev.future.length === 0) return null;
    const next = prev.future[0];
    const nextState: HistoryState = {
      past: [...prev.past, prev.present],
      present: next,
      future: prev.future.slice(1),
    };
    historyRef.current = nextState;
    setHistory(nextState);
    return next.snapshot;
  }, []);

  const jumpTo = useCallback((entryId: string): StudioSnapshot | null => {
    lastMergeRef.current = null;
    const prev = historyRef.current;
    if (prev.present.id === entryId) {
      return null;
    }

    const combined = [...prev.past, prev.present, ...prev.future];
    const targetIdx = combined.findIndex((item) => item.id === entryId);
    if (targetIdx === -1) return null;

    const target = combined[targetIdx];
    const nextState: HistoryState = {
      past: combined.slice(0, targetIdx),
      present: target,
      future: combined.slice(targetIdx + 1),
    };
    historyRef.current = nextState;
    setHistory(nextState);
    return target.snapshot;
  }, []);

  const reset = useCallback(
    (snapshot: StudioSnapshot, label = 'Initial Project State') => {
      lastMergeRef.current = null;
      const nextState: HistoryState = {
        past: [],
        present: makeEntry(snapshot, label, 'project-state'),
        future: [],
      };
      historyRef.current = nextState;
      setHistory(nextState);
    },
    []
  );

  const historyEntries = useMemo<HistoryTimelineItem[]>(() => {
    const toItem = (
      entry: StudioHistoryEntry,
      position: HistoryTimelineItem['position']
    ): HistoryTimelineItem => ({
      id: entry.id,
      label: entry.label,
      kind: entry.kind,
      timestamp: entry.timestamp,
      position,
      projectName: entry.snapshot.projectMeta.name,
      audioFileName: entry.snapshot.media.audioFileName,
      bgImageName: entry.snapshot.media.bgImageName,
      albumImageName: entry.snapshot.media.albumImageName,
      mocapName: entry.snapshot.media.mocapClip?.name ?? null,
      mixClipCount: entry.snapshot.media.mixClips.length,
      lyricsCount: entry.snapshot.lyrics.length,
      visualizerMode: entry.snapshot.settings.visualizerMode,
    });

    return [
      ...history.past.map((e) => toItem(e, 'past')),
      toItem(history.present, 'present'),
      ...history.future.map((e) => toItem(e, 'future')),
    ];
  }, [history]);

  return {
    settings: history.present.snapshot.settings,
    lyrics: history.present.snapshot.lyrics,
    media: history.present.snapshot.media,
    projectMeta: history.present.snapshot.projectMeta,
    currentSnapshot: history.present.snapshot,
    currentEntryId: history.present.id,
    historyEntries,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoCount: history.past.length,
    redoCount: history.future.length,
    commit,
    commitProjectSnapshot,
    undo,
    redo,
    jumpTo,
    reset,
  };
}
