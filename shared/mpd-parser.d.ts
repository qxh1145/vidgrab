declare module 'mpd-parser' {
  export interface MpdSegment {
    uri: string;
    resolvedUri: string;
    duration: number;
    timeline?: number;
    number?: number;
    map?: {
      uri: string;
      resolvedUri: string;
    };
    [key: string]: unknown;
  }

  export interface MpdPlaylist {
    attributes: {
      NAME?: string;
      BANDWIDTH?: number;
      RESOLUTION?: { width: number; height: number };
      CODECS?: string;
      [key: string]: unknown;
    };
    uri: string;
    resolvedUri?: string;
    segments: MpdSegment[];
    [key: string]: unknown;
  }

  export interface MpdManifest {
    duration?: number;
    playlists?: MpdPlaylist[];
    mediaGroups?: {
      AUDIO?: Record<string, Record<string, {
        playlists?: MpdPlaylist[];
        [key: string]: unknown;
      }>>;
      SUBTITLES?: Record<string, Record<string, unknown>>;
    };
    [key: string]: unknown;
  }

  export function parse(
    manifestString: string,
    options?: { manifestUri?: string },
  ): MpdManifest;
}
