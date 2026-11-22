# GEMINI.md — Ngữ cảnh dự án VidGrab

> File này là "luật chơi" cho AI code. Đặt ở thư mục gốc repo. Gemini CLI tự đọc file `GEMINI.md`;
> nếu dùng Gemini web thì dán nội dung file này vào đầu mỗi cuộc trò chuyện mới.
> (Thay "VidGrab" bằng tên extension bạn chọn.)

## 1. Sản phẩm là gì

Browser extension (Chrome/Edge/Chromium, sau đó Firefox) tải video từ trang web, chạy 100% trong trình duyệt,
không có server, không thu thập dữ liệu người dùng.

Tính năng:
1. Tự phát hiện video trên trang: HLS (`.m3u8`), DASH (`.mpd`), file trực tiếp (MP4, WebM, M4A…). Badge trên icon hiện số video tìm thấy.
2. Popup / side panel liệt kê video: tiêu đề, loại, độ phân giải, thời lượng, dung lượng, preview; lọc theo domain.
3. Tải HLS → gộp thành 1 file MP4; chọn độ phân giải; tải đa luồng; tạm dừng / tiếp tục; hỗ trợ file ~10 GB không tràn RAM.
4. Tải DASH (video + audio tách rời → ghép MP4).
5. Chế độ ghi (Record) cho video `blob:` không bắt được link: (a) lấy dữ liệu gốc từ MediaSource buffer, (b) ghi thời gian thực bằng `captureStream` + `MediaRecorder`.
6. Livestream HLS, phụ đề VTT, tách audio M4A.
7. Settings: số luồng, tự lưu, thông báo, mẫu tên file, lọc domain, ngôn ngữ (vi/en).

## 2. Giới hạn BẮT BUỘC (không được vi phạm)

- KHÔNG hỗ trợ, KHÔNG viết code vượt qua DRM/EME: Widevine, FairPlay, PlayReady, HLS `SAMPLE-AES`, `KEYFORMAT` khác `identity`.
  Gặp các trường hợp này → hiển thị "Video được bảo vệ DRM, không hỗ trợ" và dừng.
  (HLS `METHOD=AES-128` với key công khai trong playlist là mã hoá truyền tải chuẩn, KHÔNG phải DRM → được hỗ trợ.)
- KHÔNG hỗ trợ YouTube (chính sách Chrome Web Store). Chặn các domain `youtube.com`, `youtu.be`, `googlevideo.com`.
- KHÔNG gửi dữ liệu ra server bên ngoài, không analytics, không remote code (MV3 cấm `eval` / tải script từ xa).
- KHÔNG dùng tên, logo, giao diện của FetchV hay sản phẩm khác.

## 3. Tech stack (không tự ý đổi)

| Mảng | Lựa chọn |
|---|---|
| Framework extension | WXT (Manifest V3), TypeScript `strict` |
| UI | React 18 + Tailwind CSS |
| Test | Vitest (unit test cho mọi hàm thuần trong `core/`) |
| Parse playlist | `m3u8-parser`, `mpd-parser` |
| Remux | `mux.js` (TS → fMP4), `mp4box.js` (ghép track) — chạy trong Web Worker |
| Dự phòng | `@ffmpeg/ffmpeg` (wasm, đóng gói local) — chỉ thêm ở task được giao |
| Lưu tạm | OPFS (`navigator.storage.getDirectory()`) |
| Package manager | pnpm |

## 4. Kiến trúc

```
Trang web
 ├─ main-world.content.ts (world: MAIN)     hook fetch/XHR, MediaSource/SourceBuffer
 └─ overlay.content.ts    (world: ISOLATED) nút "Ghi" trên <video>, cầu nối message
        │ window.postMessage ⇄ runtime messaging
Background service worker
 ├─ sniffer: webRequest.onSendHeaders + onHeadersReceived → lọc media
 ├─ MediaStore theo tabId (chrome.storage.session)
 ├─ badge (chrome.action.setBadgeText theo tab)
 └─ HeaderRuleManager (declarativeNetRequest session rules: Referer/Origin)
UI
 ├─ popup/ & sidepanel/  — dùng chung component MediaList
 ├─ download/ (download.html?taskId=…) — CHẠY TÁC VỤ TẢI Ở ĐÂY
 ├─ record/   (record.html?…)          — chạy tác vụ ghi
 └─ options/
```

Nguyên tắc kiến trúc:
- **Không tải video trong service worker** (MV3 kill SW sau ~30s idle). Mọi tác vụ dài chạy trong tab `download.html` / `record.html`.
- **Không giữ segment trong RAM.** Segment tải xong ghi ngay vào OPFS. Remux đọc từ OPFS, ghi ra OPFS. Lưu file cuối bằng
  `URL.createObjectURL(await fileHandle.getFile())` + `chrome.downloads.download`.
- **Header gốc:** sniffer lưu `Referer`, `Origin`, `User-Agent` của request gốc. Trước khi tải, `HeaderRuleManager` tạo session rule DNR
  gắn lại header cho domain đó; xoá rule khi task kết thúc.
- **Message có kiểu:** mọi message đi qua `shared/messages.ts` (discriminated union), không dùng chuỗi tự do.
- `core/` chỉ chứa logic thuần, không gọi `chrome.*` trực tiếp (inject qua tham số) → test được bằng Vitest.

## 5. Cấu trúc thư mục

```
entrypoints/
  background.ts
  main-world.content.ts   # WXT: content scripts must be <name>.content.ts directly in entrypoints/
  overlay.content.ts
  popup/  sidepanel/  download/  record/  options/
components/            # React component dùng chung (MediaList, ProgressBar…)
core/
  detect/    matcher.ts, media-store.ts
  hls/       parser.ts, downloader.ts, aes.ts, live.ts
  dash/      parser.ts, downloader.ts
  mux/       ts2mp4.worker.ts, merge.worker.ts
  storage/   opfs.ts
  queue/     pool.ts
  net/       header-rules.ts, fetch-retry.ts
  record/    mse-capture.ts, realtime.ts
shared/      types.ts, messages.ts, settings.ts, constants.ts, i18n.ts
public/_locales/{vi,en}/messages.json
tests/
```

## 6. Quy ước code

- TypeScript strict, không dùng `any` (dùng `unknown` + type guard).
- Tên file kebab-case, component PascalCase, hàm camelCase.
- Mọi chuỗi hiển thị qua `i18n` (`chrome.i18n.getMessage`), không hard-code tiếng Việt/Anh trong component.
- Xử lý lỗi: không nuốt lỗi im lặng; lỗi mạng retry theo `fetch-retry.ts`; lỗi người dùng thấy được phải có message rõ ràng.
- Comment bằng tiếng Anh, ngắn, giải thích "tại sao" chứ không phải "làm gì".
- Không thêm thư viện mới ngoài mục 3 nếu task không cho phép — nếu cần, hỏi trước.

## 7. Cách làm việc với mỗi task

1. Đọc task trong `TASKS.md`, đọc các file liên quan đang có.
2. Trước khi code, viết ngắn gọn: các file sẽ tạo/sửa + cách tiếp cận. Chờ xác nhận nếu task có ghi "Hỏi trước".
3. Chỉ sửa các file thuộc phạm vi task. Không refactor phần khác.
4. Viết/cập nhật unit test cho logic trong `core/`.
5. Chạy `pnpm typecheck && pnpm test && pnpm build` — phải pass hết.
6. Báo cáo: đã làm gì, cách test thủ công, hạn chế còn lại.

## 8. Định nghĩa "Xong" (Definition of Done)

- Build không lỗi, typecheck không lỗi, test pass.
- Đạt toàn bộ "Tiêu chí hoàn thành" của task.
- Không có `console.log` debug thừa (dùng `shared/logger.ts`, tắt ở production).
- Không vi phạm mục 2.
