(function (root) {
  "use strict";

  function render(round, cards, remaining, picture, muted) {
    const total = cards.length;
    return `<section class="boss-flip-overlay" role="dialog" aria-modal="true" aria-label="大宝翻牌演出" tabindex="-1">
      <div class="boss-flip-backdrop" aria-hidden="true"></div>
      <img class="boss-flip-portrait" src="${picture("dabao.jpg")}" alt="" aria-hidden="true">
      <div class="boss-flip-header"><span>第 ${String(round).padStart(2, "0")} 回合</span><strong>大宝出手</strong><span>牌堆剩余 ${remaining} 张</span></div>
      <div class="boss-flip-stage" aria-live="polite">
        <div class="boss-flip-cards ${total === 2 ? "is-double" : ""}">${cards.map((card, index) => `<div class="boss-flip-slot" style="--flip-delay:${(index * 1.15 + .35).toFixed(2)}s">
          <div class="boss-flip-card"><div class="boss-flip-card-side boss-flip-card-back"><img src="${picture("dabaobeimian.png")}" alt="大宝牌背"></div><div class="boss-flip-card-side boss-flip-card-front"><img src="${picture(card.image)}" alt="${card.name}"></div></div>
          <div class="boss-flip-caption"><span>第 ${index + 1} / ${total} 张</span><strong>【${card.name}】</strong></div>
        </div>`).join("")}</div>
      </div>
      <div class="boss-flip-footer"><span>翻牌结算中</span><div><button class="boss-flip-mute" data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button><button data-action="skip-flip" aria-label="跳过翻牌演出">跳过演出 ↗</button></div></div>
    </section>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoBossFlipScene = api;
})(typeof window !== "undefined" ? window : globalThis);
