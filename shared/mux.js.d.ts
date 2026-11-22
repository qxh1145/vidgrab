declare module 'mux.js' {
  export interface TransmuxerSegment {
    initSegment: Uint8Array;
    data: Uint8Array;
  }

  export class Transmuxer {
    constructor(options?: {
      remux?: boolean;
      keepOriginalTimestamps?: boolean;
    });
    on(event: 'data', callback: (segment: TransmuxerSegment) => void): void;
    on(event: 'done', callback: () => void): void;
    push(data: Uint8Array): void;
    flush(): void;
    endTimeline(): void;
    reset(): void;
    dispose(): void;
  }

  const muxjs: {
    mp4: {
      Transmuxer: typeof Transmuxer;
    };
  };

  export default muxjs;
}
