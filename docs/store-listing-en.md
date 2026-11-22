# VidGrab — Chrome Web Store Listing (English)

## Extension Name
VidGrab — HLS, DASH, MP4 Video Downloader

## Short Description (Under 132 characters)
Download videos from web pages: HLS (m3u8), DASH (mpd), MP4. Runs 100% inside your browser safely and privately.

## Detailed Description

VidGrab is a high-performance browser extension designed to detect and download streaming and direct videos from virtually any webpage directly to your computer.

Unlike server-based downloading tools that route video traffic through external third-party servers, VidGrab operates 100% locally inside your browser using the modern Origin Private File System (OPFS). This guarantees top download speeds, supports large files (up to 10 GB+) without running out of RAM, and ensures complete user privacy.

### Key Features:

1. **Automatic Media Detection:**
   - Detects HLS streams (`.m3u8`).
   - Detects DASH manifests (`.mpd`).
   - Detects direct media files: MP4, WebM, M4A, etc.
   - Real-time toolbar badge counter showing media found on the active tab.

2. **HLS Stream Processing & Download:**
   - Full master and media playlist parsing.
   - Quality/resolution selector (1080p, 720p, 480p, etc.).
   - Multi-threaded parallel segment fetching (2 to 16 threads).
   - Standard AES-128 decryption support.
   - Seamless transmuxing from TS segments to standard playable MP4 (VLC, Chrome, QuickTime compatible).
   - Live HLS stream recording support.
   - WebVTT subtitles download.
   - Audio-only download option (`.m4a`).

3. **DASH Video & Audio Merging:**
   - Fetches video and audio representations in parallel.
   - Synchronously multiplexes tracks into a single MP4 container using MP4Box.

4. **Stream Recording Mode:**
   - Captures `blob:` MSE videos where direct links are hidden.
   - Supports direct MediaSource buffer extraction as well as real-time canvas/stream recording.

5. **User Interface & Controls:**
   - Clean popup UI with full dark mode and Side Panel support.
   - Inline video preview with muted audio.
   - Download manager: Pause, Resume, Cancel tasks, and live speed/ETA metrics.
   - Customizable settings: Dynamic filename templates, blocked domain filters, temporary storage management.
   - Bilingual interface: English and Vietnamese (auto-detects system language).

---

### Privacy & Security:
- **Zero Data Collection:** VidGrab does not track your browsing history, personal data, or downloaded media.
- **100% Local Execution:** No proxy servers, analytics scripts, or remote code execution.
- **Ad-free:** Clean, open-source architecture.

---

### Limitations & Legal Disclaimer:
- **Chrome Web Store Policy:** Does NOT support downloading from YouTube (`youtube.com`, `youtu.be`, `googlevideo.com`).
- **DRM Protection:** Does NOT support or bypass commercial DRM encryption (Widevine, FairPlay, PlayReady). Protected videos will show an unsupported notification.
- **User Responsibility:** Users are solely responsible for ensuring they have appropriate rights and authorization to download any media content.
