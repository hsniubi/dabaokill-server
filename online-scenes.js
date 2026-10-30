(function (root) {
  "use strict";
  class OnlineScenes {
    constructor({ sound, host, app, onChange, onMute, onNewRoom }) {
      Object.assign(this, { sound, host, app, onChange, onMute, onNewRoom });
      this.queue = []; this.current = null; this.code = null; this.lastId = 0;
      this.timer = null; this.soundTimer = null; this.sequence = 0;
      host.addEventListener("click", event => {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "mute") {
          onMute();
          host.querySelectorAll('[data-action="mute"]').forEach(button => {
            button.textContent = sound.muted ? "开启声音" : "静音";
            button.setAttribute("aria-pressed", String(sound.muted));
          });
        } else if (action === "restart") onNewRoom();
        else if (action === "play-kill") this.playVideo();
        else if (action === "fallback-kill") this.fallback();
        else if (action === "close-result" || action?.startsWith("skip-")) this.next();
      });
    }
    get active() { return Boolean(this.current || this.queue.length); }
    reset() {
      clearTimeout(this.timer); clearTimeout(this.soundTimer); this.sequence++;
      this.queue = []; this.current = null; this.code = null; this.lastId = 0;
      this.host.innerHTML = ""; this.app.inert = false;
    }
    sync(state) {
      if (!state) return;
      const initial = this.code !== state.code;
      if (initial) { this.reset(); this.code = state.code; }
      const events = state.events || [];
      // Reconnecting should show the live turn, not replay the entire match.
      const fresh = events.filter(event => event.id > this.lastId && (!initial || event.type === "result"));
      this.lastId = Math.max(this.lastId, ...events.map(event => event.id));
      this.playerId = state.playerId;
      this.queue.push(...fresh);
      if (!this.current && this.queue.length) this.next();
    }
    next() {
      clearTimeout(this.timer); clearTimeout(this.soundTimer);
      const sequence = ++this.sequence;
      this.current = this.queue.shift() || null;
      this.app.inert = this.active;
      if (!this.current) { this.host.innerHTML = ""; this.onChange(); return; }
      const e = this.current, sound = this.sound, muted = sound.muted;
      const { CARD_MAP, BOSS_MAP, outcomeFor } = root.DabaoKill;
      const picture = name => `picture/${name.split("/").map(encodeURIComponent).join("/")}`;
      let html = "", duration = 0;
      if (e.type === "reveal") {
        html = root.DabaoPlayerFlipScene.render(e.round, e.cards.slice().sort((a,b) => a.ownerId-b.ownerId).map(card => ({ ownerId: card.ownerId, ...CARD_MAP[card.key] })), picture, muted);
        duration = 2300;
      } else if (e.type === "skill") {
        html = root.DabaoSkillScene.render(e.round, e.entry, CARD_MAP[e.entry.key], picture, muted);
        sound.playCard(e.entry.key); duration = 1900;
      } else if (e.type === "effect") {
        html = root.DabaoCardEffectScene.render(e.round, e.data, CARD_MAP, picture, muted); duration = 3450;
        if (e.data.kind === "discard") this.soundTimer = setTimeout(() => { if (sequence === this.sequence) sound.playSlash(); }, 1300);
      } else if (e.type === "recast") {
        const d = e.data, old = BOSS_MAP[d.oldKey], fresh = BOSS_MAP[d.newKey];
        html = `<section class="recast-overlay" role="dialog" aria-modal="true" aria-label="大宝牌重铸演出"><img class="recast-portrait" src="${picture("dabao.jpg")}" alt=""><header class="recast-header"><span>第 ${e.round} 回合 · ${d.actorId} 号玩家</span><h2>重铸大宝牌</h2><p>展示牌入底，再翻牌堆顶。</p></header><div class="recast-stage"><div class="recast-stage-label recast-old-label"><span>放入牌堆底</span><strong>【${old.name}】</strong></div><div class="recast-stage-label recast-deck-label"><span>牌堆顶 ↑</span><strong>大宝牌堆</strong></div><div class="recast-stage-label recast-new-label"><span>翻出新牌</span><strong>【${fresh.name}】</strong></div><div class="recast-old-card"><img src="${picture(old.image)}" alt="${old.name}"></div><div class="recast-deck-stack"><img src="${picture("dabaobeimian.png")}" alt="牌堆"></div><div class="recast-new-card"><div class="recast-new-card-inner"><div class="recast-new-face recast-new-front"><img src="${picture(fresh.image)}" alt="${fresh.name}"></div><div class="recast-new-face recast-new-back"><img src="${picture("dabaobeimian.png")}" alt="牌背"></div></div></div></div><footer class="recast-footer"><span>牌堆剩 ${d.deckRemaining} 张</span><div><button data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button><button data-action="skip-recast">跳过演出 ↗</button></div></footer></section>`;
        duration = 4000;
      } else if (e.type === "boss") {
        html = root.DabaoBossFlipScene.render(e.round, e.cards.map(card => BOSS_MAP[card.key]), e.remaining, picture, muted);
        sound.playBossTurn(); duration = 2100 + Math.max(0, e.cards.length-1)*1150;
      } else if (e.type === "kill") {
        html = root.DabaoKillScene.render(e.round, muted); sound.playBossKill(); duration = 12000;
      } else if (e.type === "result") {
        const game = { ...e, mode: "solo", humanPlayerId: this.playerId, score: player => player.score, pendingScore: player => player.pendingValue };
        html = root.DabaoResultScene.render(game, picture, outcomeFor, muted);
        sound.finish(e.result, "solo", { humanPlayerId: this.playerId });
      }
      this.host.innerHTML = html;
      this.host.querySelector(".result-overlay")?.classList.add("is-art-ready");
      if (e.type === "kill") this.playVideo();
      if (duration) {
        const reduced = root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        this.timer = setTimeout(() => { if (sequence === this.sequence) this.next(); }, reduced && e.type !== "kill" ? 650 : duration);
      }
      this.onChange();
    }
    playVideo() {
      const video = this.host.querySelector("video");
      if (!video) return;
      const sequence = this.sequence;
      video.onended = () => { if (sequence === this.sequence) this.next(); };
      video.onerror = () => this.fallback();
      try { video.play()?.catch(() => { if (sequence === this.sequence) this.fallback(); }); }
      catch { this.fallback(); }
    }
    fallback() {
      const fallback = this.host.querySelector(".kill-fallback");
      if (fallback) fallback.hidden = false;
    }
  }
  root.DabaoOnlineScenes = { OnlineScenes };
  if (typeof module !== "undefined" && module.exports) module.exports = { OnlineScenes };
})(typeof window !== "undefined" ? window : globalThis);
