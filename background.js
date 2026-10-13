// Small ZIP writer using uncompressed ZIP entries (no external libraries required).
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "MAKE_ZIP") return;
  buildAndDownload(message.pageData)
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(error => sendResponse({ ok: false, error: error.message || String(error) }));
  return true;
});

async function buildAndDownload(pageData) {
  if (!pageData || !Array.isArray(pageData.files)) throw new Error("Invalid page data.");
  const files = [];
  const usedNames = new Set();
  const candidates = pageData.files.slice(0, 250);

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    try {
      const response = await fetch(item.url, { credentials: "include" });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (blob.size > 25 * 1024 * 1024) continue; // Skip individual files over 25 MB.
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const path = safePath(item.name, item.kind, i, usedNames);
      files.push({ name: path, data: bytes });
    } catch (_) {
      // Cross-origin restrictions, unavailable URLs, and protected resources are skipped.
    }
  }

  if (!files.length) {
    throw new Error("No files could be downloaded. The page may block access to its assets.");
  }

  const readme = new TextEncoder().encode(
    `Page ZIP Downloader\\nSource page: ${pageData.pageUrl}\\nPage title: ${pageData.title}\\nFiles included: ${files.length}\\n\\nOnly resources accessible to the browser were included. Some links may have been skipped.\\n`
  );
  files.unshift({ name: "README.txt", data: readme });

  const zip = makeZip(files);
  const blob = new Blob([zip], { type: "application/zip" });
  const dataUrl = await blobToDataUrl(blob);
  const filename = `${safeFilename(pageData.title || "webpage")}-files.zip`;
  await chrome.downloads.download({ url: dataUrl, filename, saveAs: true });
  return { count: files.length - 1 };
}

function safePath(rawName, kind, index, usedNames) {
  let name = String(rawName || "").split(/[?#]/)[0].split(/[\\\\/]/).pop();
  try { name = decodeURIComponent(name); } catch (_) {}
  name = name.replace(/[<>:"|?*\\x00-\\x1F]/g, "_").trim();
  if (!name || name === "." || name === "..") name = `${kind || "file"}-${index + 1}`;
  if (!name.includes(".")) name += ".bin";
  let candidate = name;
  let n = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    const dot = name.lastIndexOf(".");
    candidate = dot > 0 ? `${name.slice(0, dot)}-${n}${name.slice(dot)}` : `${name}-${n}`;
    n++;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function safeFilename(value) {
  return String(value).replace(/[<>:"/\\\\|?*\\x00-\\x1F]/g, "_").trim().slice(0, 90) || "webpage";
}

async function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not prepare ZIP for download."));
    reader.readAsDataURL(blob);
  });
}

function makeZip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, 0, true);      // no compression
    lv.setUint16(10, 0, true); lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    localParts.push(local, data);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true); cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true); cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true); cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true); cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true); cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    centralParts.push(central);
    offset += local.length + data.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true); ev.setUint16(6, 0, true);
  ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);
  return concat([...localParts, ...centralParts, end]);
}

function concat(parts) {
  const length = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}