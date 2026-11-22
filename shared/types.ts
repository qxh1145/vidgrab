export type MediaKind = 'hls' | 'dash' | 'file';

export interface Variant {
  url: string;
  bandwidth: number;
  resolution?: { width: number; height: number };
  codecs?: string;
  label: string; // "1080p", "720p"…
}

export interface DetectedMedia {
  id: string;
  tabId: number;
  url: string;
  kind: MediaKind;
  mime?: string;
  size?: number; // bytes
  duration?: number; // seconds
  variants?: Variant[];
  requestHeaders: Record<string, string>;
  pageUrl: string;
  pageTitle: string;
  domain: string;
  detectedAt: number;
  isLive?: boolean;
}

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'paused'
  | 'merging'
  | 'saving'
  | 'done'
  | 'error'
  | 'cancelled';

export interface SegmentInfo {
  idx: number;
  url: string;
  duration: number;
  byterange?: { offset: number; length: number };
  key?: { method: 'AES-128'; uri: string; iv?: Uint8Array };
  discontinuity?: boolean;
}

export interface DownloadTask {
  id: string;
  media: DetectedMedia;
  variantUrl?: string;
  mode: 'download' | 'record-buffer' | 'record-realtime';
  audioOnly?: boolean;
  status: TaskStatus;
  totalSegments: number;
  doneSegments: number;
  bytesDownloaded: number;
  threads: number;
  fileName: string;
  error?: { code: string; message: string };
  createdAt: number;
  updatedAt: number;
}
