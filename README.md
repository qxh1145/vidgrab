# ⚡ VidGrab — High-Performance Browser Video Downloader

<p align="center">
  <img src="public/icon/128.png" alt="VidGrab Logo" width="96" height="96" />
</p>

<p align="center">
  <strong>Tiện ích mở rộng trình duyệt (Browser Extension) tải video HLS, DASH, MP4 chạy 100% nội bộ trên máy, an toàn và bảo mật.</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-blue?style=flat-square" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Framework-WXT-brightgreen?style=flat-square" alt="WXT" />
  <img src="https://img.shields.io/badge/UI-React%2018%20%2B%20TailwindCSS-61dafb?style=flat-square" alt="React 18" />
  <img src="https://img.shields.io/badge/Language-TypeScript%20Strict-3178c6?style=flat-square" alt="TypeScript Strict" />
  <img src="https://img.shields.io/badge/Tests-118%20Passed-success?style=flat-square" alt="Tests Passed" />
  <img src="https://img.shields.io/badge/Platforms-Chrome%20%7C%20Edge%20%7C%20Firefox-orange?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="License MIT" />
</p>

---

## 📖 Giới thiệu (Overview)

**VidGrab** là tiện ích mở rộng trình duyệt mã nguồn mở giúp phát hiện và tải video trực tuyến từ trang web về máy tính của bạn với tốc độ cao.

Khác với các công cụ tải video thông thường gửi link qua máy chủ trung gian (tiềm ẩn nguy cơ lộ thông tin cá nhân và bị giới hạn băng thông), **VidGrab xử lý 100% dữ liệu ngay trong trình duyệt** bằng công nghệ **OPFS (Origin Private File System)** và **Web Workers**. Các phân đoạn video được lưu trực tiếp vào ổ cứng tạm thời, cho phép bạn tải các tệp video dung lượng lớn (**lên tới 10 GB+**) mà không làm đầy hoặc tràn bộ nhớ RAM.

---

## ✨ Tính năng nổi bật (Key Features)

### 1. Tự động phát hiện video (Smart Sniffer)
- Tự động bắt các luồng **HLS** (`.m3u8`), **DASH** (`.mpd`), và tệp media trực tiếp (**MP4**, **WebM**, **M4A**, v.v.).
- Bắt cả các danh sách phát không có đuôi chuẩn thông qua cơ chế phân tích luồng dữ liệu (Hook Fetch/XHR).
- Hiển thị số lượng video tìm thấy ngay trên huy hiệu (badge) của icon tiện ích theo từng thẻ tab.

### 2. Tải & Ghép luồng HLS (HLS VOD & Live)
- **Chọn độ phân giải linh hoạt**: Hỗ trợ đầy đủ các độ phân giải từ 480p, 720p, 1080p đến 4K.
- **Tải đa luồng song song**: Tuỳ chỉnh từ 2 đến 16 luồng tải để tối đa hoá băng thông mạng.
- **Giải mã AES-128**: Tự động lấy khoá và giải mã các luồng video được bảo vệ bằng chuẩn mã hoá HLS AES-128 chuẩn.
- **Remux TS sang MP4 tức thì**: Chuyển đổi định dạng phân đoạn `.ts` sang file `.mp4` chuẩn phát được trên mọi thiết bị (Chrome, VLC, điện thoại, TV).
- **Hỗ trợ Livestream**: Bắt luồng HLS trực tiếp, cho phép ghi và lưu luồng phát sóng bất kỳ lúc nào.
- **Tải phụ đề VTT & Tách Audio**: Tải kèm tệp phụ đề WebVTT hoặc tuỳ chọn chỉ tải phần âm thanh định dạng `.m4a`.

### 3. Tải luồng DASH (DASH Video + Audio Merging)
- Phân tích tệp manifest `.mpd`, tự động tải song song luồng hình ảnh (Video) và luồng âm thanh (Audio).
- Ghép 2 luồng độc lập thành 1 tệp `.mp4` hoàn chỉnh đồng bộ hình và tiếng nhờ thư viện **MP4Box** tích hợp trong Web Worker.

### 4. Chế độ Ghi hình (Recording Mode)
- Hỗ trợ các video được bảo vệ qua luồng MediaSource (`blob:`) không lộ link trực tiếp.
- **Ghi chất lượng gốc (MSE Buffer)**: Lấy trực tiếp dữ liệu từ `SourceBuffer` của trình phát mà không bị giảm chất lượng hay mất khung hình.
- **Ghi thời gian thực (Realtime)**: Ghi lại luồng phát trực tiếp bằng `MediaRecorder` cho các trang có cơ chế bảo vệ phức tạp.

### 5. Trải nghiệm người dùng cao cấp
- Giao diện Popup 380px hiện đại, hỗ trợ **Dark Mode** tự động theo hệ thống.
- Hỗ trợ mở trên thanh bên **Side Panel** tiện lợi để vừa xem web vừa theo dõi tiến độ tải.
- Xem trước video (Preview) tích hợp trình phát thu nhỏ (tự động tắt tiếng).
- Quản lý tác vụ tải: Tạm dừng (Pause), Tiếp tục (Resume), Huỷ bỏ (Cancel), xem tốc độ (MB/s) và thời gian còn lại (ETA).
- **Đa ngôn ngữ (i18n)**: Hỗ trợ Tiếng Việt và Tiếng Anh (tự động nhận diện theo ngôn ngữ trình duyệt).

---

## 🛡️ Cam kết Bảo mật & Giới hạn (Privacy & Limitations)

- 🔒 **100% Cục bộ & Bảo mật**: Không có server trung gian, không thu thập dữ liệu cá nhân, không analytics, không quảng cáo.
- 🚫 **Chính sách Chrome Web Store**: **KHÔNG** hỗ trợ tải video từ **YouTube** (`youtube.com`, `youtu.be`, `googlevideo.com`).
- 🚫 **Bảo vệ bản quyền DRM**: **KHÔNG** hỗ trợ và **KHÔNG** vượt qua các cơ chế DRM thương mại (Widevine, FairPlay, PlayReady). Gặp luồng DRM, tiện ích sẽ cảnh báo và dừng hoạt động.
- ⚖️ **Trách nhiệm pháp lý**: Người dùng tự chịu trách nhiệm về bản quyền và mục đích sử dụng các nội dung tải về.

---

## 🚀 Hướng dẫn cài đặt (Installation Guide)

### Cách 1: Cài đặt bản dựng sẵn trên Chrome / Edge / Brave / Cốc Cốc

1. Tải tệp mã nguồn hoặc clone repository về máy tính:
   ```bash
   git clone https://github.com/qxh1145/vidgrab.git
   cd vidgrab
   ```
2. Cài đặt các gói phụ thuộc và build dự án:
   ```bash
   pnpm install
   pnpm build
   ```
   *(Thư mục tiện ích sau khi build sẽ nằm tại `.output/chrome-mv3`)*

3. Mở trình duyệt và truy cập trang quản lý tiện ích:
   - **Chrome**: `chrome://extensions/`
   - **Microsoft Edge**: `edge://extensions/`
   - **Brave**: `brave://extensions/`
   - **Cốc Cốc**: `coccoc://extensions/`

4. Gạt công tắc bật **Chế độ dành cho nhà phát triển (Developer mode)** ở góc trên bên phải.

5. Nhấn vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.

6. Điều hướng và chọn thư mục:
   ```
   D:\04_Software_&_Tools\VidGrab\.output\chrome-mv3
   ```
   *(hoặc đường dẫn thư mục `.output/chrome-mv3` trên máy bạn).*

7. Ghim icon **VidGrab** lên thanh công cụ trình duyệt và bắt đầu sử dụng!

---

### Cách 2: Cài đặt trên Mozilla Firefox

1. Chạy lệnh build cho Firefox:
   ```bash
   pnpm build:firefox
   ```
   *(Thư mục tiện ích Firefox sẽ nằm tại `.output/firefox-mv2`)*

2. Mở Firefox và truy cập địa chỉ:
   ```
   about:debugging#/runtime/this-firefox
   ```

3. Nhấp vào nút **Tải tiện ích bổ sung tạm thời... (Load Temporary Add-on...)**.

4. Chọn tệp `manifest.json` nằm trong thư mục:
   ```
   .output/firefox-mv2/manifest.json
   ```

---

## 🛠️ Dành cho lập trình viên (Developer Guide)

### Yêu cầu môi trường
- **Node.js**: Phiên bản 18.0.0 trở lên.
- **pnpm**: Phiên bản 8 trở lên (`npm install -g pnpm`).

### Cài đặt và Chạy Development
```bash
# Cài đặt dependencies
pnpm install

# Khởi chạy extension với live-reload trên Chrome
pnpm dev

# Khởi chạy trên Firefox
pnpm dev:firefox
```

### Đóng gói & Kiểm thử
```bash
# Chạy toàn bộ 118 unit tests
pnpm test

# Kiểm tra kiểu TypeScript (Strict mode)
pnpm typecheck

# Build bản release cho Chrome (Manifest V3)
pnpm build

# Build bản release cho Firefox (Manifest V2)
pnpm build:firefox

# Đóng gói file .zip để đưa lên Chrome Web Store & Firefox Add-on Store
pnpm zip
pnpm zip:firefox
```
Các tệp đóng gói hoàn chỉnh sẽ xuất hiện tại thư mục `.output/`:
- `vidgrab-0.1.0-chrome.zip` (Tải lên Chrome Web Store)
- `vidgrab-0.1.0-firefox.zip` (Tải lên Firefox Add-on Store)
- `vidgrab-0.1.0-sources.zip` (Mã nguồn lưu trữ)

---

## 🏗️ Kiến trúc dự án (Architecture)

```
VidGrab/
├── entrypoints/
│   ├── background.ts             # Service worker: sniffer webRequest, media-store, DNR rules
│   ├── main-world.content.ts     # Content script MAIN world: hook Fetch / XHR / MediaSource
│   ├── overlay.content.ts        # Content script ISOLATED world: nút Ghi video trên player
│   ├── popup/                    # Giao diện Popup danh sách video
│   ├── sidepanel/                # Giao diện Side Panel tiện ích
│   ├── download/                 # Trang điều phối tải, giải mã và ghép video (download.html)
│   ├── record/                   # Trang ghi hình trực tiếp MediaSource buffer (record.html)
│   └── options/                  # Trang cài đặt tiện ích, quản lý bộ nhớ và điều khoản
├── components/                   # React components (MediaList, ProgressBar, VideoPreviewModal)
├── core/
│   ├── detect/                   # Bộ phân loại media (matcher), bộ nhớ media-store, enrich
│   ├── hls/                      # Parser m3u8, giải mã AES-128, tải HLS, livestream, phụ đề VTT
│   ├── dash/                     # Parser MPD, tải DASH video/audio
│   ├── mux/                      # Web Workers transmux ts sang mp4 và merge track mp4box
│   ├── storage/                  # Quản lý Origin Private File System (OPFS)
│   ├── queue/                    # Hàng đợi tải đa luồng worker pool với exponential backoff
│   ├── net/                      # Quản lý DeclarativeNetRequest session rules và fetch retry
│   └── record/                   # Hook MediaSource buffer capture và realtime stream capture
├── shared/                       # Types, discriminated union messaging, settings, i18n, errors
├── public/
│   ├── _locales/{vi,en}/         # Bản dịch đa ngôn ngữ chuẩn Chrome i18n
│   └── icon/                     # Icons kích thước 16, 32, 48, 96, 128 px
├── docs/                         # Tài liệu đăng ký store và giải trình quyền Chrome Web Store
└── tests/                        # 14 bộ kiểm thử unit test Vitest toàn diện
```

---

## 📄 Bản quyền (License)

Dự án được phân phối dưới giấy phép **MIT License**. Bạn được tự do sử dụng, chỉnh sửa và phân phối theo các điều khoản của giấy phép.
