# VidGrab — Thông tin đăng ký Chrome Web Store (Tiếng Việt)

## Tên tiện ích
VidGrab — Trình tải video HLS, DASH, MP4

## Mô tả ngắn (Dưới 132 ký tự)
Tải video nhanh chóng từ trang web: HLS (m3u8), DASH (mpd), MP4. Chạy 100% trong trình duyệt, an toàn và bảo mật.

## Mô tả chi tiết

VidGrab là tiện ích mở rộng mạnh mẽ giúp bạn phát hiện và tải video từ hầu hết các trang web trực tuyến trực tiếp về máy tính. 

Khác với các công cụ trực tuyến cần gửi dữ liệu video về máy chủ trung gian, VidGrab thực thi 100% nội bộ trong trình duyệt thông qua hệ thống tệp riêng tư (OPFS - Origin Private File System). Điều này đảm bảo tốc độ tối đa, hỗ trợ tải các tệp video dung lượng lớn (lên tới 10 GB+) mà không gây tràn bộ nhớ RAM, đồng thời bảo vệ tuyệt đối quyền riêng tư của bạn.

### Các tính năng chính:
1. **Tự động bắt link video:**
   - Hỗ trợ định dạng phân đoạn HLS (`.m3u8`).
   - Hỗ trợ định dạng tách luồng DASH (`.mpd`).
   - Bắt các tệp phương tiện trực tiếp: MP4, WebM, M4A, v.v.
   - Huy hiệu (Badge) trên biểu tượng hiển thị số lượng video tìm thấy trên tab hiện tại.

2. **Tải & Ghép luồng HLS:**
   - Tự động phân tích danh sách phát (master & media playlist).
   - Cho phép lựa chọn độ phân giải mong muốn (1080p, 720p, 480p...).
   - Tải đa luồng song song có thể tuỳ chỉnh (2-16 luồng) giúp tăng tốc độ tải.
   - Tự động giải mã các luồng mã hoá chuẩn AES-128.
   - Ghép các phân đoạn `.ts` thành tệp `.mp4` chuẩn phát được trên mọi thiết bị và trình phát (Chrome, VLC, QuickTime).
   - Hỗ trợ tải Livestream HLS đang phát.
   - Hỗ trợ tải phụ đề VTT đi kèm.
   - Tuỳ chọn tải riêng âm thanh định dạng `.m4a`.

3. **Tải luồng DASH:**
   - Tự động tải song song luồng hình ảnh (Video) và âm thanh (Audio).
   - Ghép 2 luồng đồng bộ thành một tệp MP4 duy nhất bằng thư viện MP4Box.

4. **Chế độ Ghi hình (Record):**
   - Hỗ trợ các video sử dụng MediaSource buffer (`blob:` URL) không thể bắt link trực tiếp.
   - Trích xuất dữ liệu gốc trực tiếp từ buffer trình phát hoặc ghi hình thời gian thực (Realtime Screen Capture).

5. **Giao diện & Tiện ích:**
   - Cửa sổ Popup nhanh gọn (380px) và hỗ trợ mở ở khung cạnh bên (Side Panel).
   - Xem trước video (Preview) tích hợp trình phát thu nhỏ có tắt tiếng.
   - Quản lý các tác vụ tải đang chạy: Tạm dừng (Pause), Tiếp tục (Resume), Huỷ bỏ (Cancel).
   - Cài đặt linh hoạt: Mẫu đặt tên tệp tự động, lọc/ẩn tên miền không mong muốn, quản lý bộ nhớ tạm.
   - Hỗ trợ đa ngôn ngữ: Tiếng Việt, Tiếng Anh và tự động theo hệ thống.

---

### Cam kết bảo mật & Quyền riêng tư:
- **KHÔNG thu thập dữ liệu:** Tiện ích không thu thập bất kỳ lịch sử duyệt web, thông tin cá nhân hay tệp tải về nào.
- **KHÔNG máy chủ trung gian:** Mọi tác vụ tải, giải mã và ghép video đều chạy ngay trên máy tính của bạn.
- **KHÔNG chứa quảng cáo:** Tiện ích hoàn toàn sạch và mã nguồn mở.

---

### Tuyên bố từ chối trách nhiệm & Giới hạn:
- **Chính sách Chrome Web Store:** Tiện ích KHÔNG hỗ trợ tải video từ YouTube (`youtube.com`, `youtu.be`, `googlevideo.com`).
- **Bảo vệ bản quyền DRM:** Tiện ích KHÔNG hỗ trợ và KHÔNG vượt qua các cơ chế DRM thương mại (Widevine, FairPlay, PlayReady). Nếu phát hiện nội dung có DRM, tiện ích sẽ thông báo và dừng hoạt động.
- **Trách nhiệm pháp lý:** Người dùng tự chịu trách nhiệm về bản quyền và tính hợp pháp của các nội dung được tải về máy.
