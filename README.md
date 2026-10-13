# Web Page ZIP Downloader

A minimal Chrome Extension (Manifest V3) with one button that collects common assets and explicit file links from the active webpage and packages accessible files into a ZIP archive.

## Install in Chrome
1. Extract `webpage_downloader.zip` to a folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the extracted `webpage_downloader` folder.
5. Open a normal HTTP/HTTPS webpage, click the extension icon, then click **Download page files as ZIP**.

## What it collects
- Explicit links to common file types (PDF, DOCX, XLSX, ZIP, images, media, etc.)
- Common image, video, audio, script, stylesheet, and CSS background-image assets
- A `README.txt` noting the source page and count

## Limitations
- It downloads resources that the browser can access. Some cross-origin, protected, authenticated, or dynamically generated assets may fail.
- It does not download every file from the website's server, hidden source files, or the full backend/database.
- Large individual assets over 25 MB are skipped. At most 250 resource URLs are considered.
- Some websites restrict requests through CORS or anti-bot protections.
- Use only on pages and files you are authorized to download. This extension does not export cookies or session tokens.

## Files
- `manifest.json` — extension configuration
- `popup.html` / `popup.css` / `popup.js` — simple popup UI and page scanner
- `background.js` — downloads resources and writes a ZIP archive
