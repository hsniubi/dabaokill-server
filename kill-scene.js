(function (root) {
  "use strict";

  function render(round, muted) {
    const video = root.DabaoAssetUrl?.("video/kill-browser.mp4") || "video/kill-browser.mp4?v=20261022k";
    const fallback = root.DabaoAssetUrl?.("picture/kill.jpg") || "picture/kill.jpg";
    return `<section class="kill-overlay" role="dialog" aria-modal="true" aria-label="大宝击杀演出" tabindex="-1">
      <video class="kill-video" preload="auto" muted playsinline webkit-playsinline disablepictureinpicture aria-label="大宝击杀视频"><source src="${video}" type="video/mp4"></video>
      <div class="kill-fallback" hidden><img src="${fallback}" alt="大宝挥刀击杀"><span class="kill-fallback-slash" aria-hidden="true"></span></div>
      <div class="kill-video-vignette" aria-hidden="true"></div>
      <div class="kill-scene-copy"><span>第 ${String(round).padStart(2, "0")} 回合 · 酒 / 杀 / 古锭刀</span><strong>大宝出手</strong></div>
      <div class="kill-play-prompt" hidden><p>视频未能自动播放</p><button data-action="play-kill">点按播放视频</button><button data-action="fallback-kill">查看备用演出</button></div>
      <button class="kill-mute" data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button>
      <button class="kill-skip" data-action="skip-kill">跳过演出 <span>↗</span></button>
    </section>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoKillScene = api;
})(typeof window !== "undefined" ? window : globalThis);
