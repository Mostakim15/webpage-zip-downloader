const button = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");

button.addEventListener("click", async () => {
  button.disabled = true;
  statusEl.textContent = "Scanning this webpage…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) {
      throw new Error("Open a regular HTTP or HTTPS webpage first.");
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageFiles
    });
    const pageData = results?.[0]?.result;
    if (!pageData) throw new Error("Could not inspect this page.");

    statusEl.textContent = `Found ${pageData.files.length} file link(s). Preparing ZIP…`;
    const response = await chrome.runtime.sendMessage({
      type: "MAKE_ZIP",
      pageData
    });
    if (!response?.ok) throw new Error(response?.error || "ZIP creation failed.");
    statusEl.textContent = `ZIP download started. ${response.count} file(s) included.`;
  } catch (error) {
    statusEl.textContent = error.message || "Something went wrong.";
  } finally {
    button.disabled = false;
  }
});

// This function runs in the active page. It collects URLs, not page cookies or tokens.
function collectPageFiles() {
  const pageUrl = location.href;
  const found = new Map();
  const add = (url, label, kind) => {
    try {
      const absolute = new URL(url, pageUrl);
      if (!["http:", "https:"].includes(absolute.protocol)) return;
      if (absolute.href === pageUrl) return;
      if (!found.has(absolute.href)) {
        found.set(absolute.href, {
          url: absolute.href,
          name: label || absolute.pathname.split("/").pop() || kind || "file",
          kind: kind || "linked-file"
        });
      }
    } catch (_) {}
  };

  // Explicit file links, including PDFs, docs, archives, images, etc.
  document.querySelectorAll("a[href]").forEach(a => {
    const href = a.href;
    const path = new URL(href, pageUrl).pathname;
    const looksLikeFile = /\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|csv|txt|json|xml|jpg|jpeg|png|gif|webp|svg|mp3|mp4|wav|webm|epub|apk|dmg|exe)(?:$)/i.test(path)
      || a.hasAttribute("download");
    if (looksLikeFile) add(href, a.getAttribute("download") || a.textContent.trim() || path.split("/").pop(), "file");
  });

  // Common static assets referenced by the current document.
  document.querySelectorAll("img[src],source[src],video[src],audio[src],track[src],script[src],link[rel='stylesheet'][href]").forEach(el => {
    const url = el.src || el.href;
    if (!url) return;
    const kind = el.tagName.toLowerCase();
    add(url, url.split("/").pop().split("?")[0], kind);
  });

  // CSS background images and poster images.
  document.querySelectorAll("[poster]").forEach(el => add(el.poster, el.poster.split("/").pop(), "poster"));
  document.querySelectorAll("*").forEach(el => {
    const bg = getComputedStyle(el).backgroundImage;
    for (const match of bg.matchAll(/url\\(["']?(.*?)["']?\\)/g)) {
      add(match[1], match[1].split("/").pop().split("?")[0], "background-image");
    }
  });

  return {
    title: document.title || "webpage",
    pageUrl,
    files: Array.from(found.values()).slice(0, 250)
  };
}