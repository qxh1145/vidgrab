# Chrome Web Store — Permissions Justification Guide

When submitting VidGrab to the Chrome Web Store, Google requires a detailed justification for every permission declared in `manifest.json`. Below are the exact explanations to copy-paste into the Chrome Web Store Developer Dashboard.

---

### 1. `webRequest`
- **Justification:** Required to sniff and detect HTTP response headers (`Content-Type: application/vnd.apple.mpegurl`, `application/dash+xml`, `video/*`) to discover video playlists and streams loaded by the active webpage. Also captures required referer/origin headers so subsequent segment requests from the extension are authorized by the media host.

### 2. `declarativeNetRequestWithHostAccess` / `declarativeNetRequest`
- **Justification:** Used dynamically to attach session-scoped `Referer` and `Origin` headers to outgoing video segment requests initiated by the extension download tab, ensuring media servers that enforce hotlink protection allow fetching video chunks. Rules are temporary and removed upon task completion.

### 3. `storage`
- **Justification:** Stores user preferences (number of threads, minimum detection size, filename template, blocked domain list, language preference) and ongoing download task states so progress can be resumed across tabs.

### 4. `unlimitedStorage`
- **Justification:** Required for the Origin Private File System (OPFS) and local caching to store large temporary video chunks (e.g. multi-gigabyte HLS/DASH video streams) during remuxing without failing due to standard browser quota limits.

### 5. `downloads`
- **Justification:** Triggers the browser download manager to save the final transmuxed/merged MP4 video file from OPFS storage to the user's local Downloads folder.

### 6. `tabs`
- **Justification:** Retrieves the active tab's URL and title to name downloaded video files accurately using the page title and to isolate media detection per tab.

### 7. `scripting`
- **Justification:** Injects lightweight inspection scripts into web pages when recording MSE (MediaSource Extensions) buffers upon explicit user action ("Record" button).

### 8. `notifications`
- **Justification:** Displays an operating system notification when a long-running video download or remux task finishes, alerting the user that their video file is ready.

### 9. `webNavigation`
- **Justification:** Listens for top-level navigation events (`onCommitted`) to clear outdated detected video lists when the user navigates away to a new web page.

### 10. `sidePanel`
- **Justification:** Allows opening the detected media list in Chrome's native Side Panel for convenient side-by-side video browsing and downloading.

### 11. `host_permissions: ["<all_urls>"]`
- **Justification:** Needed to detect video requests, parse playlist manifests (HLS/DASH), and fetch video chunks from arbitrary media CDN domains across any web page the user chooses to browse.
