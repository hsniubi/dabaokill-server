(function (root) {
  "use strict";

  const ART = { victory: "victory.png", fail: "fail.png", tie: "tie.png" };
  const LABEL = { victory: "胜利", fail: "失败", tie: "平局" };
  const signed = (value) => value > 0 ? `+${value}` : String(value);

  function viewModel(game, outcomeFor) {
    const result = game.result;
    const seats = game.players.map((player) => ({
      id: player.id,
      score: game.score(player),
      pendingValue: game.pendingScore(player),
      outcome: outcomeFor(result, player.id),
    }));
    const main = result.kind === "draw" ? "tie" : game.mode === "solo" ? seats.find((seat) => seat.id === game.humanPlayerId).outcome : "victory";
    const title = result.kind === "draw" ? "本局无胜负" : game.mode === "solo" ? `你${LABEL[main]}` : "本局胜者已决出";
    const reason = result.kind === "kill" ? "大宝被击败" : result.kind === "boss" ? "大宝出手" : "玩家牌堆已空";
    return { main, title, reason, message: result.message, seats };
  }

  function render(game, picture, outcomeFor, muted) {
    const view = viewModel(game, outcomeFor);
    const motes = Array.from({ length: 24 }, (_, index) => {
      const x = (index * 43 + 7) % 100;
      const delay = ((index * 7) % 19) / 10;
      const duration = 4 + ((index * 11) % 23) / 10;
      return `<i class="scene-mote" style="--x:${x}%;--delay:${delay}s;--duration:${duration}s" aria-hidden="true"></i>`;
    }).join("");
    return `<section class="result-overlay result-theme-${view.main}" role="dialog" aria-modal="true" aria-labelledby="result-scene-title" tabindex="-1">
      <div class="scene-backdrop" aria-hidden="true"></div>
      <img class="scene-boss" src="${picture("dabao.jpg")}" alt="" aria-hidden="true">
      <div class="scene-motes" aria-hidden="true">${motes}</div>
      <div class="scene-frame">
        <header class="scene-header"><span>DABAO<span>KILL</span> · 对局结算</span><button class="scene-sound" data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button></header>
        <div class="scene-main">
          <div class="scene-eyebrow">第 ${String(game.round).padStart(2, "0")} 回合 · ${view.reason}</div>
          <div class="scene-emblem"><span class="scene-halo" aria-hidden="true"></span><img class="scene-emblem-art" src="${picture(ART[view.main])}" alt="${LABEL[view.main]}" decoding="async" loading="eager"><span class="scene-shine" aria-hidden="true"></span></div>
          <h2 id="result-scene-title">${view.title}</h2>
          <p class="scene-message">${view.message}</p>
          <div class="scene-seats" aria-label="四名玩家的结算结果">${view.seats.map((seat, index) => `<div class="scene-seat scene-seat-${seat.outcome}" style="--seat-order:${index}">
            <span class="scene-seat-number">${String(seat.id).padStart(2, "0")}</span>
            <div class="scene-seat-body"><strong>${seat.id} 号玩家${game.mode === "solo" && seat.id === game.humanPlayerId ? " · 你" : ""}</strong><span>${seat.pendingValue === null ? "" : `<em class="scene-seat-pending-score">(${signed(seat.pendingValue)})</em>`}${seat.score} 勾玉</span></div>
            <img src="${picture(ART[seat.outcome])}" alt="${LABEL[seat.outcome]}">
          </div>`).join("")}</div>
          <div class="scene-actions"><button class="scene-secondary" data-action="close-result">查看战场</button><button class="scene-primary" data-action="restart">再开一局 <span>↗</span></button></div>
        </div>
      </div>
    </section>`;
  }

  const api = { viewModel, render };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoResultScene = api;
})(typeof window !== "undefined" ? window : globalThis);
