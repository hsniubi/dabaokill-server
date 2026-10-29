(function (root) {
  "use strict";

  function smallCards(cards, picture, cardMap) {
    return cards.map((card) => `<img class="card-effect-mini" src="${picture(cardMap[card.key].image)}" alt="${cardMap[card.key].name}">`).join("");
  }

  function playerRow(playerId, cards, selectedId, picture, cardMap) {
    const selected = cards.find((card) => card.id === selectedId);
    const others = cards.filter((card) => card.id !== selectedId);
    const middle = Math.ceil(others.length / 2);
    return `<div class="card-effect-player-row" aria-label="${playerId}号玩家展示牌区">
      <div class="card-effect-seat"><strong>${playerId} 号玩家</strong><span>展示牌区 · ${cards.length} 张</span></div>
      <div class="card-effect-rail">
        <div class="card-effect-side is-left">${smallCards(others.slice(0, middle), picture, cardMap)}</div>
        <div class="card-effect-vacancy" aria-label="${cardMap[selected.key].name}正在结算"><span>${cardMap[selected.key].name}</span></div>
        <div class="card-effect-side is-right">${smallCards(others.slice(middle), picture, cardMap)}</div>
      </div>
    </div>`;
  }

  function floatingCard(key, className, cardMap, picture) {
    const card = cardMap[key];
    return `<div class="card-effect-flight ${className}"><img src="${picture(card.image)}" alt="${card.name}"><span>${card.name}</span></div>`;
  }

  function renderSwap(data, cardMap, picture) {
    return `<div class="card-effect-stage is-swap">
      <div class="card-effect-half is-top">${playerRow(data.firstPlayerId, data.firstCards, data.firstId, picture, cardMap)}</div>
      <div class="card-effect-half is-bottom">${playerRow(data.secondPlayerId, data.secondCards, data.secondId, picture, cardMap)}</div>
      <div class="card-effect-midline"><span>易</span></div>
      ${floatingCard(data.firstKey, "is-first", cardMap, picture)}
      ${floatingCard(data.secondKey, "is-second", cardMap, picture)}
    </div>`;
  }

  function renderDiscard(data, cardMap, picture) {
    const card = cardMap[data.selectedKey];
    return `<div class="card-effect-stage is-discard">
      <div class="card-effect-source">${playerRow(data.targetId, data.cards, data.selectedId, picture, cardMap)}</div>
      <div class="card-effect-discard-card" aria-label="${card.name}被弃置">
        <div class="card-effect-cut-half is-a"><img src="${picture(card.image)}" alt="${card.name}"></div>
        <div class="card-effect-cut-half is-b"><img src="${picture(card.image)}" alt=""></div>
      </div>
      <div class="card-effect-slash" aria-hidden="true"></div>
      <div class="card-effect-impact" aria-hidden="true"></div>
      <div class="card-effect-shockwave" aria-hidden="true"></div>
    </div>`;
  }

  function render(round, data, cardMap, picture, muted) {
    const swap = data.kind === "swap";
    const title = swap ? "两方展示牌互换" : "目标展示牌弃置";
    const detail = swap
      ? `${data.firstPlayerId} 号【${cardMap[data.firstKey].name}】与 ${data.secondPlayerId} 号【${cardMap[data.secondKey].name}】交换 · 点数不变`
      : `${data.targetId} 号玩家的【${cardMap[data.selectedKey].name}】被弃置`;
    return `<section class="card-effect-overlay ${swap ? "is-swap" : "is-discard"}" role="dialog" aria-modal="true" aria-label="${swap ? "神鲁肃换牌" : "神甘宁弃牌"}结算演出" tabindex="-1">
      <div class="card-effect-backdrop" aria-hidden="true"></div>
      <header class="card-effect-heading"><span>第 ${String(round).padStart(2, "0")} 回合 · ${data.actorId} 号玩家 · ${swap ? "神鲁肃 · 榻谟" : "神甘宁 · 劫营"}</span><h2>${title}</h2></header>
      ${swap ? renderSwap(data, cardMap, picture) : renderDiscard(data, cardMap, picture)}
      <footer class="card-effect-footer"><p>${detail}</p><div><button data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button><button data-action="skip-card-effect">跳过演出 ↗</button></div></footer>
    </section>`;
  }

  const api = { render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoCardEffectScene = api;
})(typeof window !== "undefined" ? window : globalThis);
