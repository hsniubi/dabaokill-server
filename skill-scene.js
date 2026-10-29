(function (root) {
  "use strict";

  function render(round, entry, card, picture, muted) {
    return `<section class="skill-overlay" role="dialog" aria-modal="true" aria-label="${entry.ownerId}号玩家${card.name}${card.skill}结算演出" tabindex="-1">
      <div class="skill-backdrop"></div>
      <div class="skill-ribbon"></div>
      <div class="skill-stage">
        <div class="skill-glow"></div>
        <img class="skill-art" src="${picture(card.emblem)}" alt="${card.name} · ${card.skill}">
      </div>
      <img class="skill-art-foreground" src="${picture(card.emblem)}" alt="" aria-hidden="true">
      <div class="skill-meta"><span>第 ${String(round).padStart(2, "0")} 回合 · ${entry.ownerId} 号玩家</span><strong>${card.name} · ${card.skill}</strong></div>
      <div class="skill-actions"><button data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button><button data-action="skip-skill">跳过演出 ↗</button></div>
    </section>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoSkillScene = api;
})(typeof window !== "undefined" ? window : globalThis);
