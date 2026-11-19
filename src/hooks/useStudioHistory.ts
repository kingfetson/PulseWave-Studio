import { useCallback, useRef, useState } from 'react';
import { LyricLine, StudioSettings } from '../types/studio';

export interface StudioSnapshot {
  settings: StudioSettings;
  lyrics: LyricLine[];
}

interface HistoryState {
  past: StudioSnapshot[];
  present: StudioSnapshot;
  future: StudioSnapshot[];
}

const MAX_HISTORY = 80;
const COALESCE_WINDOW_MS = 450;

export function useStudioHistory(initialPresent: StudioSnapshot) {
  const [history, setHistory] = useState<HistoryState>({
    past: [],
    present: initialPresent,
    future: [],
  });

  const lastMergeRef = useRef<{ key: string; timestamp: number } | null>(null);

  const commit = useCallback(
    (updater: (prev: StudioSnapshot) => StudioSnapshot, mergeKey?: string) => {
      const now = Date.now();
      const lastMerge = lastMergeRef.current;
      const shouldMerge =
        Boolean(mergeKey) &&
        lastMerge !== null &&
        lastMerge.key === mergeKey &&
        now - lastMerge.timestamp < COALESCE_WINDOW_MS;

      lastMergeRef.current = mergeKey ? { key: mergeKey, timestamp: now } : null;

      setHistory((prev) => {
        const next = updater(prev.present);
        if (JSON.stringify(next) === JSON.stringify(prev.present)) {
          return prev;
        }

        if (shouldMerge) {
          return {
            past: prev.past,
            present: next,
            future: [],
          };
        }

        const nextPast =
          prev.past.length >= MAX_HISTORY
            ? [...prev.past.slice(prev.past.length - MAX_HISTORY + 1), prev.present]
            : [...prev.past, prev.present];

        return {
          past: nextPast,
          present: next,
          future: [],
        };
      });
    },
    []
  );

  const undo = useCallback(() => {
    lastMergeRef.current = null;
    setHistory((prev) => {
      if (prev.past.length === 0) return prev;
      const previous = prev.past[prev.past.length - 1];
      return {
        past: prev.past.slice(0, -1),
        present: previous,
        future: [prev.present, ...prev.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    lastMergeRef.current = null;
    setHistory((prev) => {
      if (prev.future.length === 0) return prev;
      const next = prev.future[0];
      return {
        past: [...prev.past, prev.present],
        present: next,
        future: prev.future.slice(1),
      };
    });
  }, []);

  const reset = useCallback((snapshot: StudioSnapshot) => {
    lastMergeRef.current = null;
    setHistory({
      past: [],
      present: snapshot,
      future: [],
    });
  }, []);

  return {
    settings: history.present.settings,
    lyrics: history.present.lyrics,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    undoCount: history.past.length,
    redoCount: history.future.length,
    commit,
    undo,
    redo,
    reset,
  };
}
