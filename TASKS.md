# TASKS.md — Danh sách task giao cho Gemini

## Cách dùng

1. Tạo repo trống, đặt `GEMINI.md` và `TASKS.md` ở thư mục gốc.
2. Giao **từng task một**, theo thứ tự. Mỗi task = 1 commit (`git commit -m "T1.2: background sniffer"`).
3. Prompt mẫu cho mỗi task (copy, đổi mã task):

```
Đọc GEMINI.md và TASKS.md. Thực hiện task T1.2.
Trước khi code: liệt kê file sẽ tạo/sửa và cách tiếp cận trong tối đa 10 dòng.
Sau khi code: chạy pnpm typecheck && pnpm test && pnpm build, rồi báo cáo kết quả,
cách test thủ công và hạn chế còn lại. Không sửa file ngoài phạm vi task.
```

4. Cuối mỗi giai đoạn có **Checkpoint** — bạn tự test bằng tay trước khi sang giai đoạn sau.
5. Nếu Gemini làm sai: dán lỗi (console của service worker / trang download) + nói "Sửa trong phạm vi task Tx.y".

### Nguồn test (kiểm tra còn sống trước khi dùng)

- HLS TS: `https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8`
- HLS fMP4 nhiều độ phân giải: `https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8`
- DASH: `https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd`
- Mở các link trên bằng trang player test (vd. hls.js demo, dash.js reference player) để extension bắt được.
- MP4 trực tiếp: bất kỳ file `.mp4` công khai nào.

---

## Giai đoạn 0 — Khởi tạo

### T0.1 — Khởi tạo dự án WXT
- **Mục tiêu:** Khung dự án chạy được.
- **Yêu cầu:**
  - `pnpm dlx wxt@latest init` với template React + TypeScript; cài Tailwind, Vitest.
  - Tạo đủ cấu trúc thư mục ở GEMINI.md mục 5 (file rỗng có export placeholder).
  - `wxt.config.ts`: manifest permissions `webRequest`, `declarativeNetRequestWithHostAccess`, `storage`, `unlimitedStorage`, `downloads`, `tabs`, `scripting`, `sidePanel`, `notifications`, `webNavigation`; `host_permissions: ["<all_urls>"]`; `default_locale: "vi"`.
  - Script `package.json`: `dev`, `build`, `build:firefox`, `typecheck`, `test`, `lint`.
  - `_locales/vi` và `_locales/en` với `extName`, `extDescription`.
- **Tiêu chí hoàn thành:** `pnpm build` ra thư mục `.output/chrome-mv3`; Load unpacked vào Chrome không có lỗi; popup hiện chữ "Hello".

### T0.2 — Types, messaging, settings, logger
- **Mục tiêu:** Nền tảng dùng chung.
- **Yêu cầu:**
  - `shared/types.ts`: `MediaKind = 'hls'|'dash'|'file'`, `DetectedMedia`, `Variant`, `DownloadTask`, `TaskStatus`, `SegmentInfo` (xem phụ lục A).
  - `shared/messages.ts`: discriminated union `Msg` + helper `sendMsg<T>()` / `onMsg()` có kiểu trả về. Các message tối thiểu: `GET_MEDIA_FOR_TAB`, `MEDIA_UPDATED`, `START_DOWNLOAD`, `CLEAR_TAB`.
  - `shared/settings.ts`: `Settings` + giá trị mặc định (threads 6, autoSave true, notify true, filenameTemplate `"{title}_{quality}"`, minSizeKB 200, blockedDomains [], language 'auto'); `getSettings()`, `setSettings()`, `onSettingsChanged()` dùng `chrome.storage.sync`.
  - `shared/logger.ts`: `log.debug/info/warn/error`, tắt debug khi `import.meta.env.PROD`.
  - `shared/constants.ts`: danh sách domain chặn (YouTube) ở GEMINI.md mục 2.
- **Tiêu chí hoàn thành:** typecheck pass; unit test cho settings (merge default với giá trị thiếu).

**Checkpoint 0:** extension load được, không lỗi console.

---

## Giai đoạn 1 — Phát hiện video

### T1.1 — Bộ lọc media (`core/detect/matcher.ts`)
- **Mục tiêu:** Hàm thuần quyết định 1 request có phải media không.
- **Yêu cầu:** `classify(url, contentType?, contentLength?) → { kind: MediaKind, mime } | null`.
  - HLS: đuôi `.m3u8` hoặc content-type `application/vnd.apple.mpegurl`, `application/x-mpegurl`, `audio/mpegurl`.
  - DASH: `.mpd` hoặc `application/dash+xml`.
  - File: `video/*`, `audio/*`, đuôi `.mp4 .webm .m4v .mov .m4a .mp3 .ogg`.
  - LOẠI BỎ: segment (`.ts`, `.m4s`, `.aac` lẻ, URL có `segment`/`chunk`/`frag` kèm số), file nhỏ hơn `minSizeKB`, domain bị chặn, request có header `Range` bắt đầu khác 0 (vẫn giữ URL gốc 1 lần).
  - Bỏ qua query string khi xét đuôi file.
- **Tiêu chí hoàn thành:** ≥ 25 unit test bao các trường hợp trên.

### T1.2 — Background sniffer + MediaStore
- **Mục tiêu:** Bắt media mọi tab, lưu theo tab.
- **Yêu cầu:**
  - `webRequest.onSendHeaders` (`extraHeaders`, `requestHeaders`) → lưu tạm header theo `requestId` (Map, xoá sau 60s).
  - `webRequest.onHeadersReceived` (`responseHeaders`) → `classify()` → nếu là media thì tạo `DetectedMedia` (gồm `requestHeaders` Referer/Origin/User-Agent, `pageUrl`, `pageTitle` lấy qua `chrome.tabs.get`).
  - `core/detect/media-store.ts`: lưu vào `chrome.storage.session` key `tab:<id>`; khử trùng theo URL đã bỏ query thay đổi (giữ bản mới nhất); tối đa 100 item/tab.
  - Xoá danh sách khi `webNavigation.onCommitted` (frameId 0, không phải reload trong cùng URL hash) và `tabs.onRemoved`.
  - Phát `MEDIA_UPDATED` khi danh sách đổi.
- **Tiêu chí hoàn thành:** mở trang HLS test → `chrome.storage.session` có 1 item kind `hls`, không có segment `.ts`.

### T1.3 — Badge
- **Yêu cầu:** `chrome.action.setBadgeText({ tabId, text })` theo số item; rỗng khi 0; màu nền cố định; cập nhật khi chuyển tab.
- **Tiêu chí hoàn thành:** badge đúng số trên 2 tab khác nhau.

### T1.4 — Content script MAIN world: hook fetch/XHR
- **Mục tiêu:** Bắt playlist không có đuôi chuẩn (vd. `/api/play?id=1` trả về `#EXTM3U`).
- **Yêu cầu:**
  - `entrypoints/main-world.content.ts` (`world: 'MAIN'`, `run_at: document_start`, `all_frames: true`): bọc `window.fetch` và `XMLHttpRequest`; với response text ≤ 2 MB bắt đầu bằng `#EXTM3U` hoặc chứa `<MPD` → `window.postMessage({ source: 'vidgrab', type: 'PLAYLIST_FOUND', url, kind })`.
  - Không làm hỏng response gốc (clone trước khi đọc), không ném lỗi ra trang.
  - `entrypoints/overlay.content.ts` (ISOLATED) nhận postMessage (kiểm tra `event.source === window` và `source === 'vidgrab'`) → gửi background.
- **Tiêu chí hoàn thành:** trang dùng URL playlist không đuôi vẫn được phát hiện; trang web không bị lỗi JS.

### T1.5 — Popup & Side panel: danh sách media
- **Yêu cầu:**
  - Component `components/MediaList.tsx` dùng chung cho `popup/` và `sidepanel/`.
  - Mỗi item: icon loại (HLS/DASH/File), tên (pageTitle hoặc tên file), domain, dung lượng (nếu có), thời lượng (nếu có), nút **Tải**, **Copy link**, menu "Ẩn domain này".
  - Thanh lọc theo domain (dropdown các domain hiện có); trạng thái rỗng có hướng dẫn "Hãy phát video hoặc tải lại trang".
  - Nút mở side panel (`chrome.sidePanel.open`).
  - Tự cập nhật khi nhận `MEDIA_UPDATED`.
  - Popup rộng 380px, giao diện gọn, hỗ trợ dark mode theo hệ thống.
- **Tiêu chí hoàn thành:** danh sách cập nhật realtime khi video bắt đầu phát mà không cần mở lại popup.

### T1.6 — Làm giàu metadata
- **Yêu cầu:** `core/detect/enrich.ts` chạy khi popup mở (không chạy ngầm liên tục):
  - File: `HEAD` (fallback `GET` với `Range: bytes=0-0`) → `size`.
  - HLS: tải playlist → nếu master thì điền `variants[]` (resolution, bandwidth, codecs), nếu media thì tính `duration` = tổng `EXTINF`, ước tính size = bandwidth × duration / 8.
  - DASH: đọc `mediaPresentationDuration` và representations.
  - Cache kết quả vào item trong MediaStore.
- **Tiêu chí hoàn thành:** HLS Apple test hiện đủ các độ phân giải và thời lượng.

**Checkpoint 1:** 3 nguồn test đều hiện đúng trong popup với badge đúng số.

---

## Giai đoạn 2 — File trực tiếp

### T2.1 — Tải file trực tiếp
- **Yêu cầu:** `kind === 'file'` → `chrome.downloads.download({ url, filename, conflictAction: 'uniquify' })`. Tên file từ `filenameTemplate`, làm sạch ký tự cấm `\/:*?"<>|`, giới hạn 150 ký tự, giữ đúng đuôi. Nếu server cần Referer → áp HeaderRuleManager (tạm viết bản đơn giản, hoàn thiện ở T3.3).
- **Tiêu chí hoàn thành:** tải MP4 test ra đúng tên.

---

## Giai đoạn 3 — HLS VOD (phần lõi, làm kỹ)

### T3.1 — Module OPFS (`core/storage/opfs.ts`)
- **Yêu cầu:** API: `createTaskDir(taskId)`, `writeSegment(taskId, idx, data)`, `readSegment(taskId, idx)`, `hasSegment`, `openOutput(taskId, name) → FileSystemWritableFileStream`, `getOutputFile`, `removeTaskDir`, `listTaskDirs`, `estimateUsage()` (`navigator.storage.estimate`). Gọi `navigator.storage.persist()` lần đầu.
- **Tiêu chí hoàn thành:** test (dùng mock OPFS hoặc test thủ công trong trang download) ghi/đọc 100 segment.

### T3.2 — Hàng đợi đa luồng (`core/queue/pool.ts`)
- **Yêu cầu:** `createPool({ concurrency, worker, onProgress })` với `add(jobs)`, `pause()`, `resume()`, `abort()`, `setConcurrency(n)` (đổi khi đang chạy). Mỗi job retry tối đa 5 lần, backoff 1s/2s/4s/8s/16s + jitter; lỗi 403/404 liên tiếp > 20 job → tự pause và báo lỗi. Dùng `AbortController` cho từng fetch.
- **Tiêu chí hoàn thành:** unit test: thứ tự, giới hạn đồng thời, retry, pause/resume, abort.

### T3.3 — HeaderRuleManager (`core/net/header-rules.ts`) + fetch-retry
- **Yêu cầu:** `applyHeaders(taskId, urlFilterDomains, headers)` tạo `declarativeNetRequest.updateSessionRules` (action `modifyHeaders` set Referer/Origin, `resourceTypes: ['xmlhttprequest','media','other']`, `initiatorDomains: [chrome.runtime.id]`); `removeHeaders(taskId)`. Quản lý rule id không trùng. `fetch-retry.ts`: fetch có timeout 30s, trả `ArrayBuffer`, phân loại lỗi.
- **Tiêu chí hoàn thành:** request từ trang extension mang đúng Referer (kiểm tra trong DevTools Network).

### T3.4 — HLS parser (`core/hls/parser.ts`)
- **Yêu cầu:** bọc `m3u8-parser`:
  - `parseMaster(text, baseUrl) → Variant[]` (+ nhóm audio/subtitle `EXT-X-MEDIA`).
  - `parseMedia(text, baseUrl) → { segments[], targetDuration, isLive, map?, keys }`, mỗi segment có `url` tuyệt đối, `duration`, `byterange?`, `key?` (method, uri, iv), `discontinuity`.
  - Phát hiện DRM theo GEMINI.md mục 2 → ném `DrmError`.
- **Tiêu chí hoàn thành:** unit test với ≥ 6 playlist mẫu (TS, fMP4 có EXT-X-MAP, AES-128, byterange, discontinuity, SAMPLE-AES → DrmError).

### T3.5 — Giải mã AES-128 (`core/hls/aes.ts`)
- **Yêu cầu:** WebCrypto `AES-CBC`; IV từ playlist hoặc tính từ media sequence (16 byte big-endian); cache key theo URI.
- **Tiêu chí hoàn thành:** unit test với dữ liệu mã hoá mẫu tự tạo.

### T3.6 — Trang Download (UI + điều phối)
- **Yêu cầu:**
  - `START_DOWNLOAD` từ popup → background tạo `DownloadTask`, lưu `chrome.storage.local`, mở tab `download.html?taskId=…`.
  - `core/hls/downloader.ts`: playlist → danh sách segment → pool → (giải mã) → `writeSegment`. Bỏ qua segment đã có trong OPFS (resume sau khi reload tab).
  - UI: tên file (sửa được), độ phân giải, thanh tiến độ %, số segment xong/tổng, tốc độ MB/s, ETA, dung lượng đã tải, nút Tạm dừng / Tiếp tục / Huỷ / đổi số luồng, log lỗi gọn.
  - Cảnh báo `beforeunload` khi đang tải; nhắc "Giữ tab này mở".
  - Lưu tiến độ định kỳ để mở lại tab vẫn tiếp tục.
- **Tiêu chí hoàn thành:** tải HLS test tới 100%, reload tab giữa chừng → tiếp tục, không tải lại segment cũ.

### T3.7 — Remux sang MP4 (Worker)
- **Yêu cầu:**
  - `core/mux/ts2mp4.worker.ts`: đọc lần lượt segment `.ts` từ OPFS → `mux.js` Transmuxer → ghi init + fragment vào output stream trong OPFS. Xử lý `discontinuity` (reset timestamp hợp lý).
  - fMP4 (có EXT-X-MAP): ghi init 1 lần rồi nối các segment.
  - Xử lý theo luồng (stream), RAM không tăng tuyến tính theo dung lượng video.
  - Trạng thái `merging` có tiến độ riêng trên UI.
  - **Hỏi trước** nếu thấy cần ffmpeg.wasm.
- **Tiêu chí hoàn thành:** file MP4 xuất ra phát được trong VLC và Chrome, tua được, có tiếng.

### T3.8 — Lưu file & dọn dẹp
- **Yêu cầu:** `getOutputFile` → `createObjectURL` → `chrome.downloads.download`. Nếu `autoSave` false → hiện nút "Lưu". `notify` → `chrome.notifications`. Xoá thư mục OPFS sau khi tải xong (`downloads.onChanged` state `complete`) và `removeHeaders(taskId)`. Khi khởi động extension, dọn thư mục OPFS mồ côi > 7 ngày.
- **Tiêu chí hoàn thành:** sau khi lưu, `navigator.storage.estimate()` giảm về như trước.

**Checkpoint 3:** tải 1 video HLS ≥ 1 GB; theo dõi Task Manager của Chrome, RAM tab download không vượt ~500 MB.

---

## Giai đoạn 4 — Trải nghiệm người dùng

### T4.1 — Chọn độ phân giải
- Dropdown trong item HLS/DASH có variants; mặc định cao nhất; truyền `variantUrl` khi bắt đầu tải.

### T4.2 — Preview
- Hover/nhấn nút mắt → popover phát thử bằng `<video>` (file) hoặc `hls.js` (HLS, thêm thư viện `hls.js` được phép ở task này), tắt tiếng, tự huỷ khi đóng.

### T4.3 — Trang Settings
- Form cho mọi field `Settings`; danh sách domain bị ẩn (xoá được); nút "Xoá dữ liệu tạm" (OPFS); hiện dung lượng OPFS đang dùng.

### T4.4 — Danh sách task
- Trong popup thêm tab "Đang tải": các task đang chạy/tạm dừng/lỗi, bấm để mở lại tab download.

**Checkpoint 4:** dùng thử như người dùng thật 30 phút, ghi lại lỗi UI.

---

## Giai đoạn 5 — DASH

### T5.1 — DASH parser (`core/dash/parser.ts`)
- Bọc `mpd-parser`: liệt kê representations video/audio (SegmentTemplate có `$Number$`/`$Time$`, SegmentList, SegmentBase+sidx) → URL segment tuyệt đối + init. Phát hiện `ContentProtection` → `DrmError`.
- Unit test ≥ 4 MPD mẫu.

### T5.2 — DASH downloader + ghép track
- Tải video + audio song song vào 2 thư mục con OPFS; `core/mux/merge.worker.ts` dùng `mp4box.js` ghép thành 1 MP4. Tái sử dụng pool, UI download.
- Tiêu chí: MPD test ra MP4 có hình và tiếng đồng bộ.

---

## Giai đoạn 6 — Chế độ ghi (Record)

### T6.1 — Bắt dữ liệu MediaSource (`core/record/mse-capture.ts`)
- Trong MAIN world: hook `MediaSource.prototype.addSourceBuffer` (ghi lại mime/codecs) và `SourceBuffer.prototype.appendBuffer` (copy dữ liệu). Chỉ bắt khi người dùng bấm "Ghi" cho video đó (không thu sẵn mọi trang). Gửi chunk qua `postMessage` (transferable) → overlay → `runtime.connect` port tới tab record.
- Nếu `video.mediaKeys` khác null → báo DRM, không ghi.

### T6.2 — Trang Record (chất lượng gốc)
- `record.html`: nhận chunk theo từng track, ghi OPFS, hiện thời lượng đã thu, nút Dừng; chọn khoảng thời gian (tua video gốc tới điểm bắt đầu, tự dừng khi tới điểm kết thúc). Kết thúc → ghép track bằng merge worker → lưu MP4.

### T6.3 — Ghi thời gian thực
- `core/record/realtime.ts`: `video.captureStream()` + `MediaRecorder` (ưu tiên `video/mp4` nếu `isTypeSupported`, không thì `video/webm`); chunk mỗi 1s ghi OPFS. Mặc định cho livestream. Bắt lỗi video cross-origin/tainted → thông báo rõ.

### T6.4 — Overlay trên video
- `entrypoints/overlay.content.ts`: viền nổi bật + nút "Ghi" nhỏ ở góc các `<video>` có `src` bắt đầu `blob:` hoặc dùng MSE; dùng Shadow DOM để không ảnh hưởng CSS trang; theo dõi video mới bằng `MutationObserver`.

**Checkpoint 6:** ghi thành công 1 video blob dài 5 phút ở cả 2 chế độ.

---

## Giai đoạn 7 — Mở rộng

### T7.1 — Livestream HLS (`core/hls/live.ts`)
- Poll media playlist mỗi `targetDuration` giây, thêm segment mới theo media sequence, chống trùng; nút "Dừng & lưu"; hiện thời lượng đã tải.

### T7.2 — Phụ đề VTT
- Từ `EXT-X-MEDIA TYPE=SUBTITLES` hoặc file `.vtt` sniff được: tải, nối các segment VTT, lưu `<tên video>.<lang>.vtt` cạnh video.

### T7.3 — Tách audio M4A
- Tuỳ chọn "Chỉ audio": HLS có nhóm audio riêng → tải nhóm đó; không thì remux chỉ giữ track audio → `.m4a`.

---

## Giai đoạn 8 — Hoàn thiện & phát hành

### T8.1 — i18n đầy đủ vi/en
- Rà toàn bộ chuỗi, không còn hard-code; ngôn ngữ theo settings hoặc trình duyệt.

### T8.2 — Bản Firefox
- `pnpm build:firefox`; thay side panel bằng `sidebar_action`; kiểm tra `webRequest`, DNR, OPFS trên Firefox; `browser_specific_settings.gecko.id`.

### T8.3 — Thông báo lỗi & chặn
- Bảng mã lỗi → thông điệp thân thiện (DRM, YouTube, 403 cần đăng nhập, hết dung lượng đĩa, CORS…); trang "Giới thiệu / Chính sách quyền riêng tư / Điều khoản" (người dùng tự chịu trách nhiệm bản quyền nội dung tải).

### T8.4 — Đóng gói lên store
- Icon 16/32/48/128, ảnh chụp màn hình, mô tả store vi/en, giải trình từng permission (Chrome Web Store yêu cầu), `pnpm zip`.

**Checkpoint cuối:** chạy lại toàn bộ Checkpoint 0–6 trên Chrome và Edge.

---

## Phụ lục A — Kiểu dữ liệu chính

```ts
export type MediaKind = 'hls' | 'dash' | 'file';

export interface Variant {
  url: string;
  bandwidth: number;
  resolution?: { width: number; height: number };
  codecs?: string;
  label: string;            // "1080p", "720p"…
}

export interface DetectedMedia {
  id: string;
  tabId: number;
  url: string;
  kind: MediaKind;
  mime?: string;
  size?: number;            // bytes
  duration?: number;        // seconds
  variants?: Variant[];
  requestHeaders: Record<string, string>;
  pageUrl: string;
  pageTitle: string;
  domain: string;
  detectedAt: number;
  isLive?: boolean;
}

export type TaskStatus =
  | 'queued' | 'running' | 'paused' | 'merging' | 'saving' | 'done' | 'error' | 'cancelled';

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
```

## Phụ lục B — Mẹo khi giao việc cho Gemini

- Mỗi cuộc trò chuyện chỉ 1–2 task; context dài làm AI quên quy tắc.
- Task lõi (T3.4, T3.6, T3.7, T5.2, T6.1) nên yêu cầu Gemini viết test trước rồi mới code.
- Khi lỗi khó, yêu cầu: "Thêm log tạm ở các bước X, Y; tôi sẽ gửi log cho bạn" thay vì để AI đoán.
- Sau mỗi giai đoạn, hỏi Gemini: "Review toàn bộ code giai đoạn N theo GEMINI.md, liệt kê vi phạm và rủi ro" — sửa trước khi đi tiếp.
