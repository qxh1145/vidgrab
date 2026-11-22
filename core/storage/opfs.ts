import { log } from '../../shared/logger';

/**
 * T3.1: OPFS (Origin Private File System) storage API.
 * All segment data flows through OPFS — never held in RAM.
 *
 * Directory layout: root/vidgrab-tasks/<taskId>/seg-<idx>, output-<name>
 */

let rootDirPromise: Promise<FileSystemDirectoryHandle> | null = null;

async function getRoot(): Promise<FileSystemDirectoryHandle> {
  if (!rootDirPromise) {
    rootDirPromise = (async () => {
      // Request persistent storage once
      try {
        await navigator.storage.persist();
      } catch { /* best effort */ }
      const root = await navigator.storage.getDirectory();
      return root.getDirectoryHandle('vidgrab-tasks', { create: true });
    })();
  }
  return rootDirPromise;
}

async function getTaskDir(
  taskId: string,
  create = false,
): Promise<FileSystemDirectoryHandle> {
  const root = await getRoot();
  return root.getDirectoryHandle(taskId, { create });
}

export async function createTaskDir(taskId: string): Promise<void> {
  await getTaskDir(taskId, true);
  log.debug('OPFS task dir created', taskId);
}

export async function writeSegment(
  taskId: string,
  idx: number,
  data: ArrayBuffer,
): Promise<void> {
  const dir = await getTaskDir(taskId, true);
  const file = await dir.getFileHandle(`seg-${idx}`, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readSegment(
  taskId: string,
  idx: number,
): Promise<ArrayBuffer> {
  const dir = await getTaskDir(taskId);
  const file = await dir.getFileHandle(`seg-${idx}`);
  const blob = await file.getFile();
  return blob.arrayBuffer();
}

export async function hasSegment(
  taskId: string,
  idx: number,
): Promise<boolean> {
  try {
    const dir = await getTaskDir(taskId);
    await dir.getFileHandle(`seg-${idx}`);
    return true;
  } catch {
    return false;
  }
}

export async function writeTrackSegment(
  taskId: string,
  track: 'video' | 'audio',
  idx: number,
  data: ArrayBuffer,
): Promise<void> {
  const dir = await getTaskDir(taskId, true);
  const file = await dir.getFileHandle(`seg-${track}-${idx}`, { create: true });
  const writable = await file.createWritable();
  await writable.write(data);
  await writable.close();
}

export async function readTrackSegment(
  taskId: string,
  track: 'video' | 'audio',
  idx: number,
): Promise<ArrayBuffer> {
  const dir = await getTaskDir(taskId);
  const file = await dir.getFileHandle(`seg-${track}-${idx}`);
  const blob = await file.getFile();
  return blob.arrayBuffer();
}

export async function hasTrackSegment(
  taskId: string,
  track: 'video' | 'audio',
  idx: number,
): Promise<boolean> {
  try {
    const dir = await getTaskDir(taskId);
    await dir.getFileHandle(`seg-${track}-${idx}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open a writable stream for the final output file.
 */
export async function openOutput(
  taskId: string,
  name: string,
): Promise<FileSystemWritableFileStream> {
  const dir = await getTaskDir(taskId, true);
  const file = await dir.getFileHandle(`output-${name}`, { create: true });
  return file.createWritable();
}

/**
 * Get the output file as a File object (for createObjectURL).
 */
export async function getOutputFile(
  taskId: string,
  name: string,
): Promise<File> {
  const dir = await getTaskDir(taskId);
  const file = await dir.getFileHandle(`output-${name}`);
  return file.getFile();
}

export async function removeTaskDir(taskId: string): Promise<void> {
  try {
    const root = await getRoot();
    await root.removeEntry(taskId, { recursive: true });
    log.debug('OPFS task dir removed', taskId);
  } catch {
    // Already removed or doesn't exist
  }
}

export async function listTaskDirs(): Promise<string[]> {
  const root = await getRoot();
  const names: string[] = [];
  const dirHandle = root as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> };
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind === 'directory') names.push(name);
  }
  return names;
}

export async function estimateUsage(): Promise<{
  usage: number;
  quota: number;
}> {
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}
