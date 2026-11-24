import {
  normalizeProjectTags,
  StudioProjectRecord,
  StudioProjectSummary,
} from '../types/studio';

const DB_NAME = 'pulsewave_studio_projects_v1';
const DB_VERSION = 1;
const STORE_NAME = 'projects';
const ACTIVE_PROJECT_KEY = 'pulsewave_active_project_id_v1';
const AUTO_SAVE_PROJECTS_KEY = 'pulsewave_auto_save_projects_v1';

export function createProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadAutoSaveProjects(): boolean {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_PROJECTS_KEY);
    if (raw === null) return true;
    return raw !== 'false';
  } catch {
    return true;
  }
}

export function persistAutoSaveProjects(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_PROJECTS_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore localStorage quota/access errors
  }
}

export function getLastActiveProjectId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setLastActiveProjectId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_PROJECT_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_PROJECT_KEY);
    }
  } catch {
    // Ignore localStorage quota/access errors
  }
}

function openProjectsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open projects database.'));
  });
}

function toSummary(rec: StudioProjectRecord): StudioProjectSummary {
  return {
    id: rec.id,
    name: rec.name,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    status: rec.status,
    completedAt: rec.completedAt,
    lastExportedAt: rec.lastExportedAt,
    exportCount: rec.exportCount,
    tags: normalizeProjectTags(rec.tags),
    settings: rec.settings,
    lyrics: rec.lyrics,
    trimStart: rec.trimStart,
    trimEnd: rec.trimEnd,
    duration: rec.duration,
    waveformPeaks: rec.waveformPeaks,
    audioFileName: rec.audioFileName,
    bgImageName: rec.bgImageName,
    albumImageName: rec.albumImageName,
    thumbnailDataUrl: rec.thumbnailDataUrl,
    hasAudioBlob: Boolean(rec.audioBlob),
  };
}

export async function listProjectSummaries(): Promise<StudioProjectSummary[]> {
  try {
    const db = await openProjectsDb();
    return await new Promise<StudioProjectSummary[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as StudioProjectRecord[]) || [];
        const summaries = rows
          .map(toSummary)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        resolve(summaries);
      };
      req.onerror = () => reject(req.error || new Error('Failed to list projects.'));
      tx.oncomplete = () => db.close();
    });
  } catch {
    return [];
  }
}

export async function getProjectRecord(id: string): Promise<StudioProjectRecord | null> {
  const db = await openProjectsDb();
  return await new Promise<StudioProjectRecord | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => {
      resolve((req.result as StudioProjectRecord | undefined) ?? null);
    };
    req.onerror = () => reject(req.error || new Error('Failed to load project.'));
    tx.oncomplete = () => db.close();
  });
}

export async function saveProjectRecord(record: StudioProjectRecord): Promise<void> {
  const db = await openProjectsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to save project.'));
    };
  });
}

export async function renameProjectRecord(id: string, name: string): Promise<void> {
  const existing = await getProjectRecord(id);
  if (!existing) return;
  await saveProjectRecord({
    ...existing,
    name: name.trim() || existing.name,
    updatedAt: new Date().toISOString(),
  });
}

export async function setProjectCompletionStatus(
  id: string,
  completed: boolean
): Promise<StudioProjectRecord | null> {
  const existing = await getProjectRecord(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const updated: StudioProjectRecord = {
    ...existing,
    status: completed ? 'completed' : 'in-progress',
    completedAt: completed ? existing.completedAt ?? now : undefined,
    updatedAt: now,
  };
  await saveProjectRecord(updated);
  return updated;
}

export async function updateProjectTags(
  id: string,
  tags: string[]
): Promise<StudioProjectRecord | null> {
  const existing = await getProjectRecord(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const updated: StudioProjectRecord = {
    ...existing,
    tags: normalizeProjectTags(tags),
    updatedAt: now,
  };
  await saveProjectRecord(updated);
  return updated;
}

export async function duplicateProjectRecord(
  id: string
): Promise<StudioProjectRecord | null> {
  const existing = await getProjectRecord(id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const copy: StudioProjectRecord = {
    ...existing,
    id: createProjectId(),
    name: `${existing.name} (Copy)`,
    createdAt: now,
    updatedAt: now,
    status: 'in-progress',
    completedAt: undefined,
    lastExportedAt: undefined,
    exportCount: 0,
    tags: normalizeProjectTags(existing.tags),
  };
  await saveProjectRecord(copy);
  return copy;
}

export async function deleteProjectRecord(id: string): Promise<void> {
  const db = await openProjectsDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Failed to delete project.'));
    };
  });
}

export function captureProjectThumbnail(canvas: HTMLCanvasElement | null): string | null {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  try {
    const maxDim = 320;
    const scale = Math.min(1, maxDim / Math.max(canvas.width, canvas.height));
    const thumbW = Math.max(1, Math.round(canvas.width * scale));
    const thumbH = Math.max(1, Math.round(canvas.height * scale));
    const thumb = document.createElement('canvas');
    thumb.width = thumbW;
    thumb.height = thumbH;
    const ctx = thumb.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, thumbW, thumbH);
    return thumb.toDataURL('image/jpeg', 0.8);
  } catch {
    return null;
  }
}
