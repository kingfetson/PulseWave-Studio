import JSZip from 'jszip';
import { BatchExportJob } from '../types/studio';
import { sanitizeFileName } from './mp4Exporter';

export interface BatchZipProgress {
  percentage: number;
  message: string;
}

export interface BatchZipResult {
  zipFileName: string;
  folderName: string;
  fileCount: number;
  totalBytes: number;
}

function makeUniqueFileName(rawName: string, usedNames: Set<string>): string {
  const trimmed = rawName.trim() || 'video.mp4';
  if (!usedNames.has(trimmed.toLowerCase())) {
    usedNames.add(trimmed.toLowerCase());
    return trimmed;
  }

  const lastDot = trimmed.lastIndexOf('.');
  const stem = lastDot > 0 ? trimmed.slice(0, lastDot) : trimmed;
  const ext = lastDot > 0 ? trimmed.slice(lastDot) : '';

  let counter = 2;
  while (counter < 1000) {
    const candidate = `${stem}-${counter}${ext}`;
    if (!usedNames.has(candidate.toLowerCase())) {
      usedNames.add(candidate.toLowerCase());
      return candidate;
    }
    counter += 1;
  }

  const fallback = `${stem}-${Date.now()}${ext}`;
  usedNames.add(fallback.toLowerCase());
  return fallback;
}

export function buildBatchArchiveFolderName(trackTitle?: string): string {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const slug = sanitizeFileName(trackTitle?.trim() || 'pulsewave-batch');
  return `${slug}-exports-${dateStamp}`;
}

export async function exportCompletedBatchToZip(params: {
  jobs: BatchExportJob[];
  trackTitle?: string;
  onProgress?: (progress: BatchZipProgress) => void;
}): Promise<BatchZipResult> {
  const completed = params.jobs.filter(
    (job): job is BatchExportJob & { downloadUrl: string; downloadFileName: string } =>
      job.status === 'completed' &&
      typeof job.downloadUrl === 'string' &&
      job.downloadUrl.length > 0 &&
      typeof job.downloadFileName === 'string' &&
      job.downloadFileName.length > 0
  );

  if (completed.length === 0) {
    throw new Error('No completed videos in the batch queue to archive.');
  }

  const folderName = buildBatchArchiveFolderName(params.trackTitle);
  const zipFileName = `${folderName}.zip`;
  const zip = new JSZip();
  const folder = zip.folder(folderName);
  if (!folder) {
    throw new Error('Unable to initialize ZIP folder archive.');
  }

  const usedNames = new Set<string>();

  for (let i = 0; i < completed.length; i++) {
    const job = completed[i];
    const uniqueName = makeUniqueFileName(job.downloadFileName, usedNames);

    params.onProgress?.({
      percentage: Math.round((i / completed.length) * 55),
      message: `Adding ${uniqueName} (${i + 1}/${completed.length})...`,
    });

    const response = await fetch(job.downloadUrl);
    if (!response.ok) {
      throw new Error(`Failed to read rendered video "${uniqueName}" from memory.`);
    }
    const buffer = await response.arrayBuffer();
    folder.file(uniqueName, buffer, { binary: true });
  }

  params.onProgress?.({
    percentage: 60,
    message: `Packaging ${completed.length} ${completed.length === 1 ? 'video' : 'videos'} into ${zipFileName}...`,
  });

  const zipBlob = await zip.generateAsync(
    {
      type: 'blob',
      // Videos (H.264/MP4 & VP9/WebM) are already compressed; STORE avoids wasting CPU
      compression: 'STORE',
      streamFiles: true,
    },
    (metadata) => {
      const pct = Math.min(99, Math.round(60 + metadata.percent * 0.4));
      params.onProgress?.({
        percentage: pct,
        message: `Archiving folder (${pct}%)...`,
      });
    }
  );

  const objectUrl = URL.createObjectURL(zipBlob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = zipFileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 10_000);

  params.onProgress?.({
    percentage: 100,
    message: `Saved ${zipFileName}`,
  });

  return {
    zipFileName,
    folderName,
    fileCount: completed.length,
    totalBytes: zipBlob.size,
  };
}
