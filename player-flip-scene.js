(function (root) {
  "use strict";

  function signed(value) { return value > 0 ? `+${value}` : String(value); }

  function render(round, cards, picture, muted) {
    return `<section class="player-flip-overlay" role="dialog" aria-modal="true" aria-label="四名玩家同时展示卡牌" tabindex="-1">
      <div class="player-flip-heading"><span>第 ${String(round).padStart(2, "0")} 回合 · 展示阶段</span><strong>四方亮牌</strong><p>四张牌同时翻开，随后按牌面点数与玩家编号结算。</p></div>
      <div class="player-flip-stage" aria-live="polite"><div class="player-flip-grid">${cards.map((card) => `<div class="player-flip-slot" style="--flip-delay:.45s">
        <span class="player-flip-seat">${String(card.ownerId).padStart(2, "0")} <small>号玩家</small></span>
        <div class="player-flip-card"><div class="player-flip-side player-flip-back"><img src="${picture("wanjiabeimian.jpg")}" alt="玩家牌背"></div><div class="player-flip-side player-flip-front"><img src="${picture(card.image)}" alt="${card.name}"></div></div>
        <div class="player-flip-caption"><strong>${card.name}</strong><span>${signed(card.value)} 勾玉 · ${card.skill}</span></div>
      </div>`).join("")}</div></div>
      <div class="player-flip-footer"><span>同时展示 · 依次结算</span><div><button data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button><button data-action="skip-player-flip">跳过演出 ↗</button></div></div>
    </section>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoPlayerFlipScene = api;
})(typeof window !== "undefined" ? window : globalThis);
