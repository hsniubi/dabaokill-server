(function (root) {
  "use strict";

  const EXTRA_PICTURES = [
    "dabao.jpg", "dabaobeimian.png", "wanjiabeimian.jpg", "gouyu.jpg",
    "victory.png", "fail.png", "tie.png", "kill.jpg", "start.jpg",
  ];
  // Background music starts from the user's click; preloading it again competes with playback.
  const EXTRA_VOICES = [
    "dabao1.mp3", "dabaokill.mp3", "victory.mp3", "fail.mp3", "slash.wav",
  ];
  const OPTIONAL_ASSETS = [
    "picture/victory.png", "picture/fail.png", "picture/tie.png", "picture/kill.jpg",
    "video/kill-browser.mp4",
    "voice/dabaokill.mp3", "voice/victory.mp3", "voice/fail.mp3",
  ];
  const optionalPaths = new Set(OPTIONAL_ASSETS);
  const urls = new Map();
  const decodedImages = [];
  const listeners = new Set();
  let inFlight = null;
  let optionalInFlight = null;
  let ready = false;
  const requestUrl = (path) => path.startsWith("video/") ? `${path}?v=20261022k` : path;

  function allManifest() {
    const { CARDS, BOSS_CARDS } = root.DabaoKill;
    return [
      "picture/start.jpg",
      "video/begin.mp4",
      "video/kill-browser.mp4",
      ...Array.from(new Set([...CARDS.map((card) => card.image), ...BOSS_CARDS.map((card) => card.image), ...EXTRA_PICTURES]),
        (name) => `picture/${name}`).filter((path) => path !== "picture/start.jpg"),
      ...CARDS.map((card) => `picture/${card.emblem}`),
      ...Array.from(new Set([...CARDS.map((card) => `${card.key}.mp3`), ...EXTRA_VOICES]),
        (name) => `voice/${name}`),
    ];
  }

  function manifest() {
    return allManifest().filter((path) => !optionalPaths.has(path));
  }

  function needsLoading() {
    return !ready && !root.DabaoAssetUrl && /^(https?:)$/.test(root.location?.protocol || "")
      && typeof root.fetch === "function" && typeof root.URL?.createObjectURL === "function"
      && typeof root.Image === "function";
  }

  function notify(done, total, failed = 0) {
    for (const listener of listeners) {
      try { listener({ done, total, failed }); } catch (_) { /* Keep loading if a view was closed. */ }
    }
  }

  async function decodeImage(url) {
    const image = new root.Image();
    image.decoding = "async";
    if (typeof image.decode === "function") {
      image.src = url;
      await image.decode();
    } else {
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = url;
      });
    }
    decodedImages.push(image);
  }

  async function fetchAsset(path, lowPriority = false) {
    const controller = typeof root.AbortController === "function" ? new root.AbortController() : null;
    let timer = null;
    const armTimeout = (milliseconds = 45000) => {
      if (!controller) return;
      if (timer !== null) root.clearTimeout(timer);
      timer = root.setTimeout(() => controller.abort(), milliseconds);
    };
    armTimeout();
    try {
      const response = await root.fetch(requestUrl(path), {
        cache: "force-cache", signal: controller?.signal, ...(lowPriority ? { priority: "low" } : {}),
      });
      if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
      let blob;
      if (typeof response.body?.getReader === "function" && typeof root.Blob === "function") {
        const reader = response.body.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          armTimeout();
        }
        blob = new root.Blob(chunks, { type: response.headers?.get?.("content-type") || "" });
      } else {
        if (path.startsWith("video/")) armTimeout(120000);
        blob = await response.blob();
      }
      if (timer !== null) { root.clearTimeout(timer); timer = null; }
      const url = root.URL.createObjectURL(blob);
      try {
        if (path.startsWith("picture/")) await decodeImage(url);
        urls.set(path, url);
      } catch (error) {
        root.URL.revokeObjectURL(url);
        throw error;
      }
    } finally {
      if (timer !== null) root.clearTimeout(timer);
    }
  }

  async function fetchWithRetry(path, lowPriority = false) {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await fetchAsset(path, lowPriority);
        return;
      } catch (error) {
        if (attempt === 3) throw error;
        await new Promise((resolve) => root.setTimeout(resolve, attempt * 600));
      }
    }
  }

  async function run() {
    const all = manifest();
    const remaining = all.filter((path) => !urls.has(path));
    let cursor = 0;
    let done = urls.size;
    let failed = 0;
    const failedPaths = [];
    notify(done, all.length);
    if (remaining[0] === "picture/start.jpg") {
      const background = remaining.shift();
      try { await fetchWithRetry(background); } catch (_) { failed += 1; failedPaths.push(background); }
      done += 1;
      notify(done, all.length, failed);
    }
    const worker = async () => {
      while (cursor < remaining.length) {
        const path = remaining[cursor++];
        try { await fetchWithRetry(path); } catch (_) { failed += 1; failedPaths.push(path); }
        done += 1;
        notify(done, all.length, failed);
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, remaining.length) }, worker));
    if (failed) throw new Error(`${failed} 个资源加载失败：${failedPaths.slice(0, 2).join("、")}${failed > 2 ? " 等" : ""}`);
    root.DabaoAssetUrl = (path) => urls.get(path) || requestUrl(path);
    ready = true;
  }

  function warmOptional() {
    if (!ready) return Promise.resolve();
    if (!optionalInFlight) optionalInFlight = (async () => {
      for (const path of OPTIONAL_ASSETS) {
        if (urls.has(path)) continue;
        try { await fetchWithRetry(path, true); } catch (_) { /* The original URL remains playable. */ }
      }
    })().finally(() => { optionalInFlight = null; });
    return optionalInFlight;
  }

  function load(onProgress) {
    if (typeof onProgress === "function") listeners.add(onProgress);
    if (!needsLoading()) {
      notify(ready ? manifest().length : 0, ready ? manifest().length : 0);
      listeners.clear();
      return Promise.resolve();
    }
    if (!inFlight) inFlight = run().finally(() => { inFlight = null; listeners.clear(); });
    return inFlight;
  }

  const urlFor = (path) => urls.get(path) || null;
  const api = { manifest, needsLoading, load, warmOptional, urlFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoAssetLoader = api;
})(typeof window !== "undefined" ? window : globalThis);
