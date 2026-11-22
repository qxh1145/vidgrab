declare module 'mp4box' {
  export interface TrackOptions {
    id?: number;
    type?: string;
    width?: number;
    height?: number;
    timescale?: number;
    duration?: number;
    media_duration?: number;
    nb_samples?: number;
    codec?: string;
    samplerate?: number;
    channel_count?: number;
    samplesize?: number;
    hdlr?: string;
    avcC?: unknown;
    hvcC?: unknown;
    esds?: unknown;
    [key: string]: unknown;
  }

  export interface SampleOptions {
    duration?: number;
    dts?: number;
    cts?: number;
    is_sync?: boolean;
    data?: ArrayBuffer | Uint8Array;
    [key: string]: unknown;
  }

  export interface MP4Sample {
    track_id: number;
    description: unknown;
    is_rap: boolean;
    is_sync: boolean;
    timescale: number;
    dts: number;
    cts: number;
    duration: number;
    size: number;
    data: Uint8Array;
    alreadyRead?: number;
  }

  export interface MP4Track {
    id: number;
    name?: string;
    type?: string;
    codec?: string;
    timescale: number;
    duration: number;
    video?: { width: number; height: number };
    audio?: { sample_rate: number; channel_count: number; sample_size: number };
    [key: string]: unknown;
  }

  export interface MP4Info {
    duration: number;
    timescale: number;
    tracks: MP4Track[];
    videoTracks: MP4Track[];
    audioTracks: MP4Track[];
  }

  export interface MP4File {
    onReady?: (info: MP4Info) => void;
    onError?: (err: string | Error) => void;
    onSamples?: (trackId: number, user: unknown, samples: MP4Sample[]) => void;
    appendBuffer(data: ArrayBuffer & { fileStart?: number }): number;
    flush(): void;
    start(): void;
    stop(): void;
    setExtractionOptions(trackId: number, user?: unknown, options?: { nbSamples?: number }): void;
    addTrack(options: TrackOptions): number;
    addSample(trackId: number, data: ArrayBuffer | Uint8Array, options?: SampleOptions): void;
    getBuffer(): ArrayBuffer;
    save(fileName: string): void;
    write(outStream: unknown): void;
  }

  export function createFile(): MP4File;
}
