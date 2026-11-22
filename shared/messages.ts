import type { DetectedMedia } from './types';

// -- Message type definitions (discriminated union) --

export interface GetMediaForTabMsg {
  type: 'GET_MEDIA_FOR_TAB';
  tabId: number;
}

export interface GetMediaForTabResponse {
  items: DetectedMedia[];
}

export interface MediaUpdatedMsg {
  type: 'MEDIA_UPDATED';
  tabId: number;
  items: DetectedMedia[];
}

export interface StartDownloadMsg {
  type: 'START_DOWNLOAD';
  media: DetectedMedia;
  variantUrl?: string;
  audioOnly?: boolean;
}

export interface ClearTabMsg {
  type: 'CLEAR_TAB';
  tabId: number;
}

export interface PlaylistFoundFromContentMsg {
  type: 'PLAYLIST_FOUND_FROM_CONTENT';
  url: string;
  kind: string;
}

export interface UpdateMediaMsg {
  type: 'UPDATE_MEDIA';
  tabId: number;
  item: DetectedMedia;
}

export interface OpenRecordTabMsg {
  type: 'OPEN_RECORD_TAB';
  taskId: string;
  mode: 'mse' | 'realtime';
  title?: string;
}

export type Msg =
  | GetMediaForTabMsg
  | MediaUpdatedMsg
  | StartDownloadMsg
  | ClearTabMsg
  | PlaylistFoundFromContentMsg
  | UpdateMediaMsg
  | OpenRecordTabMsg;

// -- Response type map --

type ResponseMap = {
  GET_MEDIA_FOR_TAB: GetMediaForTabResponse;
  MEDIA_UPDATED: void;
  START_DOWNLOAD: void;
  CLEAR_TAB: void;
  PLAYLIST_FOUND_FROM_CONTENT: void;
  UPDATE_MEDIA: void;
  OPEN_RECORD_TAB: void;
};

// -- Typed helpers --

/**
 * Send a message via browser.runtime and get a typed response.
 */
export function sendMsg<T extends Msg>(
  msg: T,
): Promise<ResponseMap[T['type']]> {
  return browser.runtime.sendMessage(msg);
}

/**
 * Register a typed message handler. Returns unsubscribe function.
 */
export function onMsg<K extends Msg['type']>(
  type: K,
  handler: (
    msg: Extract<Msg, { type: K }>,
    sender: Browser.runtime.MessageSender,
  ) => Promise<ResponseMap[K]> | ResponseMap[K],
): () => void {
  const listener = (
    msg: unknown,
    sender: Browser.runtime.MessageSender,
  ): Promise<ResponseMap[K]> | undefined => {
    if (
      typeof msg === 'object' &&
      msg !== null &&
      (msg as Msg).type === type
    ) {
      const result = handler(msg as Extract<Msg, { type: K }>, sender);
      if (result instanceof Promise) {
        return result;
      }
      return Promise.resolve(result);
    }
    return undefined;
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
