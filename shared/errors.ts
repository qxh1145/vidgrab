export type ErrorCode =
  | 'DRM_PROTECTED'
  | 'YOUTUBE_BLOCKED'
  | 'HTTP_403'
  | 'HTTP_404'
  | 'STORAGE_FULL'
  | 'CORS_TAINTED'
  | 'NETWORK_TIMEOUT'
  | 'MERGE_FAILED'
  | 'PARSER_ERROR'
  | 'UNKNOWN';

export const ERROR_MESSAGES: Record<ErrorCode, { vi: string; en: string; key: string }> = {
  DRM_PROTECTED: {
    key: 'err_drm_protected',
    vi: 'Video được bảo vệ bằng DRM (Widevine/FairPlay/PlayReady), extension không hỗ trợ.',
    en: 'Video is protected by DRM (Widevine/FairPlay/PlayReady) and cannot be downloaded.',
  },
  YOUTUBE_BLOCKED: {
    key: 'err_youtube_blocked',
    vi: 'Không hỗ trợ tải video từ YouTube theo chính sách của Chrome Web Store.',
    en: 'YouTube video downloads are not supported per Chrome Web Store policies.',
  },
  HTTP_403: {
    key: 'err_network_403',
    vi: 'Lỗi 403 Forbidden: Server từ chối truy cập (có thể cần đăng nhập trên trang web).',
    en: 'Error 403 Forbidden: Access denied (authentication on the website may be required).',
  },
  HTTP_404: {
    key: 'err_network_404',
    vi: 'Lỗi 404 Not Found: Không tìm thấy phân đoạn video hoặc playlist đã hết hạn.',
    en: 'Error 404 Not Found: Video segments or playlist not found / expired.',
  },
  STORAGE_FULL: {
    key: 'err_disk_full',
    vi: 'Không đủ dung lượng bộ nhớ trống trên thiết bị.',
    en: 'Insufficient disk space on your device.',
  },
  CORS_TAINTED: {
    key: 'err_cors_tainted',
    vi: 'Không thể ghi video do hạn chế bảo mật CORS / Cross-Origin.',
    en: 'Cannot capture video due to CORS / Cross-Origin security restrictions.',
  },
  NETWORK_TIMEOUT: {
    key: 'err_network_timeout',
    vi: 'Yêu cầu mạng bị quá thời gian chờ.',
    en: 'Network request timed out.',
  },
  MERGE_FAILED: {
    key: 'err_merge_failed',
    vi: 'Quá trình ghép file MP4 thất bại.',
    en: 'Failed to remux/merge MP4 tracks.',
  },
  PARSER_ERROR: {
    key: 'err_parser_error',
    vi: 'Không thể phân tích playlist video (m3u8 hoặc mpd không hợp lệ).',
    en: 'Could not parse video playlist (invalid m3u8 or mpd).',
  },
  UNKNOWN: {
    key: 'err_unknown',
    vi: 'Đã xảy ra lỗi không xác định.',
    en: 'An unknown error occurred.',
  },
};

export function classifyError(error: unknown): { code: ErrorCode; message: string; messageKey: string } {
  const msg = error instanceof Error ? error.message : String(error || '');

  if (
    /drm/i.test(msg) ||
    /widevine|fairplay|playready|sample-aes/i.test(msg) ||
    (error && typeof error === 'object' && (error as { name?: string }).name === 'DrmError')
  ) {
    return {
      code: 'DRM_PROTECTED',
      message: ERROR_MESSAGES.DRM_PROTECTED.vi,
      messageKey: ERROR_MESSAGES.DRM_PROTECTED.key,
    };
  }

  if (/youtube\.com|youtu\.be|googlevideo\.com/i.test(msg)) {
    return {
      code: 'YOUTUBE_BLOCKED',
      message: ERROR_MESSAGES.YOUTUBE_BLOCKED.vi,
      messageKey: ERROR_MESSAGES.YOUTUBE_BLOCKED.key,
    };
  }

  if (/\b403\b/i.test(msg) || /forbidden/i.test(msg)) {
    return {
      code: 'HTTP_403',
      message: ERROR_MESSAGES.HTTP_403.vi,
      messageKey: ERROR_MESSAGES.HTTP_403.key,
    };
  }

  if (/\b404\b/i.test(msg) || /not found/i.test(msg)) {
    return {
      code: 'HTTP_404',
      message: ERROR_MESSAGES.HTTP_404.vi,
      messageKey: ERROR_MESSAGES.HTTP_404.key,
    };
  }

  if (/quota|storage|disk|enospc/i.test(msg)) {
    return {
      code: 'STORAGE_FULL',
      message: ERROR_MESSAGES.STORAGE_FULL.vi,
      messageKey: ERROR_MESSAGES.STORAGE_FULL.key,
    };
  }

  if (/cors|tainted|cross-origin/i.test(msg)) {
    return {
      code: 'CORS_TAINTED',
      message: ERROR_MESSAGES.CORS_TAINTED.vi,
      messageKey: ERROR_MESSAGES.CORS_TAINTED.key,
    };
  }

  if (/timeout|timed out|aborted/i.test(msg)) {
    return {
      code: 'NETWORK_TIMEOUT',
      message: ERROR_MESSAGES.NETWORK_TIMEOUT.vi,
      messageKey: ERROR_MESSAGES.NETWORK_TIMEOUT.key,
    };
  }

  if (/merge|remux|mux/i.test(msg)) {
    return {
      code: 'MERGE_FAILED',
      message: ERROR_MESSAGES.MERGE_FAILED.vi,
      messageKey: ERROR_MESSAGES.MERGE_FAILED.key,
    };
  }

  if (/m3u8|mpd|playlist|manifest/i.test(msg)) {
    return {
      code: 'PARSER_ERROR',
      message: ERROR_MESSAGES.PARSER_ERROR.vi,
      messageKey: ERROR_MESSAGES.PARSER_ERROR.key,
    };
  }

  return {
    code: 'UNKNOWN',
    message: msg || ERROR_MESSAGES.UNKNOWN.vi,
    messageKey: ERROR_MESSAGES.UNKNOWN.key,
  };
}

export function getErrorMessage(code: ErrorCode, lang: 'vi' | 'en' = 'vi'): string {
  const item = ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;
  return item[lang] || item.vi;
}
