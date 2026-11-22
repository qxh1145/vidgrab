declare module 'm3u8-parser' {
  export class Parser {
    push(data: string): void;
    end(): void;
    manifest: {
      playlists?: Array<Record<string, unknown>>;
      segments?: Array<Record<string, unknown>>;
      mediaGroups?: Record<string, Record<string, Record<string, Record<string, unknown>>>>;
      endList?: boolean;
      targetDuration?: number;
      [key: string]: unknown;
    };
  }
}
