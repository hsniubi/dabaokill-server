(function (root) {
  "use strict";
  class OnlineScenes {
    constructor({ sound, host, app, onChange, onMute, onNewRoom }) {
      Object.assign(this, { sound, host, app, onChange, onMute, onNewRoom });
      this.queue = []; this.current = null; this.code = null; this.lastId = 0;
      this.timer = null; this.soundTimer = null; this.sequence = 0;
      this.assets = new Map(); this.remaining = 0; this.deadline = 0;
      this.loading = false;
      root.document?.addEventListener("visibilitychange", () => {
        if (root.document.hidden) this.pause();
        else this.resume();
      });
      // Warm the compact WebP emblems while players are in the lobby.
      if (root.Image) for (const card of Object.values(root.DabaoKill.CARD_MAP)) this.loadImage(`picture/${card.emblem}`).catch(() => {});
      host.addEventListener("click", event => {
        const action = event.target.closest("[data-action]")?.dataset.action;
        if (action === "mute") {
          onMute();
          host.querySelectorAll('[data-action="mute"]').forEach(button => {
            button.textContent = sound.muted ? "开启声音" : "静音";
            button.setAttribute("aria-pressed", String(sound.muted));
          });
        } else if (action === "restart") onNewRoom();
        else if (action === "retry-scene") this.prepare(this.current, this.sequence);
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
      this.remaining = 0; this.loading = false;
    }
    loadImage(url) {
      if (!root.Image) return Promise.resolve();
      if (this.assets.has(url)) return this.assets.get(url);
      const promise = new Promise((resolve, reject) => {
        const image = new root.Image();
        image.onload = () => Promise.resolve(image.decode?.()).then(resolve, resolve);
        image.onerror = () => reject(new Error("素材加载失败"));
        image.src = url;
      });
      this.assets.set(url, promise);
      promise.catch(() => this.assets.delete(url));
      return promise;
    }
    sceneImages(e) {
      const { CARD_MAP, BOSS_MAP } = root.DabaoKill;
      let names = [];
      if (e.type === "reveal") names = ["wanjiabeimian.jpg", ...e.cards.map(c => CARD_MAP[c.key].image)];
      if (e.type === "skill") names = [CARD_MAP[e.entry.key].emblem];
      if (e.type === "effect") names = [...(e.data.cards || []), ...(e.data.firstCards || []), ...(e.data.secondCards || [])].map(c => CARD_MAP[c.key].image);
      if (e.type === "recast") names = ["dabao.jpg", "dabaobeimian.png", BOSS_MAP[e.data.oldKey].image, BOSS_MAP[e.data.newKey].image];
      if (e.type === "boss") names = ["dabao.jpg", "dabaobeimian.png", ...e.cards.map(c => BOSS_MAP[c.key].image)];
      if (e.type === "kill") names = ["kill.jpg"];
      if (e.type === "result") names = ["dabao.jpg", "victory.png", "fail.png", "tie.png"];
      return [...new Set(names.map(name => `picture/${name}`))];
    }
    prepare(e, sequence) {
      if (!e) return;
      this.loading = true;
      this.host.innerHTML = '<section class="online-scene-loading" role="status"><strong>正在准备结算演出…</strong><p>素材加载完成后开始播放</p><button data-action="skip-loading">跳过本段</button></section>';
      this.onChange();
      Promise.all(this.sceneImages(e).map(url => this.loadImage(url))).then(() => {
        if (sequence !== this.sequence) return;
        this.loading = false;
        this.present(e, sequence);
      }).catch(() => {
        if (sequence !== this.sequence) return;
        this.host.innerHTML = '<section class="online-scene-loading" role="alert"><strong>演出素材暂时未能加载</strong><button data-action="retry-scene">重新加载</button><button data-action="skip-loading">跳过本段</button></section>';
      });
    }
    schedule(duration) {
      clearTimeout(this.timer);
      this.remaining = duration;
      if (root.document?.hidden) return;
      this.deadline = Date.now() + duration;
      const sequence = this.sequence;
      this.timer = setTimeout(() => {
        if (sequence !== this.sequence) return;
        if (root.document?.hidden) { this.pause(); return; }
        this.next();
      }, duration);
    }
    pause() {
      this.host.setAttribute?.("data-scene-paused", "");
      if (this.timer !== null) {
        this.remaining = Math.max(0, this.deadline - Date.now());
        clearTimeout(this.timer); this.timer = null;
      }
      clearTimeout(this.soundTimer);
      this.host.querySelector("video")?.pause();
    }
    resume() {
      this.host.removeAttribute?.("data-scene-paused");
      if (!this.current || this.loading) return;
      this.startSound();
      if (this.current.type === "kill" && !this.fallbackActive) this.playVideo();
      else if (this.current.type !== "result") this.schedule(this.remaining);
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
      this.remaining = 0; this.timer = null; this.loading = false; this.fallbackActive = false; this.soundStarted = false;
      this.current = this.queue.shift() || null;
      this.app.inert = this.active;
      if (!this.current) { this.host.innerHTML = ""; this.onChange(); return; }
      if (root.Image) this.prepare(this.current, sequence);
      else this.present(this.current, sequence);
    }
    present(e, sequence) {
      const sound = this.sound, muted = sound.muted;
      const { CARD_MAP, BOSS_MAP, outcomeFor } = root.DabaoKill;
      const picture = name => `picture/${name.split("/").map(encodeURIComponent).join("/")}`;
      let html = "", duration = 0;
      if (e.type === "reveal") {
        html = root.DabaoPlayerFlipScene.render(e.round, e.cards.slice().sort((a,b) => a.ownerId-b.ownerId).map(card => ({ ownerId: card.ownerId, ...CARD_MAP[card.key] })), picture, muted);
        duration = 2300;
      } else if (e.type === "skill") {
        html = root.DabaoSkillScene.render(e.round, e.entry, CARD_MAP[e.entry.key], picture, muted);
        duration = 1900;
      } else if (e.type === "effect") {
        html = root.DabaoCardEffectScene.render(e.round, e.data, CARD_MAP, picture, muted); duration = 3450;
      } else if (e.type === "recast") {
        const d = e.data, old = BOSS_MAP[d.oldKey], fresh = BOSS_MAP[d.newKey];
        html = `<section class="recast-overlay" role="dialog" aria-modal="true" aria-label="大宝牌重铸演出"><img class="recast-portrait" src="${picture("dabao.jpg")}" alt=""><header class="recast-header"><span>第 ${e.round} 回合 · ${d.actorId} 号玩家</span><h2>重铸大宝牌</h2><p>展示牌入底，再翻牌堆顶。</p></header><div class="recast-stage"><div class="recast-stage-label recast-old-label"><span>放入牌堆底</span><strong>【${old.name}】</strong></div><div class="recast-stage-label recast-deck-label"><span>牌堆顶 ↑</span><strong>大宝牌堆</strong></div><div class="recast-stage-label recast-new-label"><span>翻出新牌</span><strong>【${fresh.name}】</strong></div><div class="recast-old-card"><img src="${picture(old.image)}" alt="${old.name}"></div><div class="recast-deck-stack"><img src="${picture("dabaobeimian.png")}" alt="牌堆"></div><div class="recast-new-card"><div class="recast-new-card-inner"><div class="recast-new-face recast-new-front"><img src="${picture(fresh.image)}" alt="${fresh.name}"></div><div class="recast-new-face recast-new-back"><img src="${picture("dabaobeimian.png")}" alt="牌背"></div></div></div></div><footer class="recast-footer"><span>牌堆剩 ${d.deckRemaining} 张</span><div><button data-action="mute" aria-pressed="${muted}">${muted ? "开启声音" : "静音"}</button><button data-action="skip-recast">跳过演出 ↗</button></div></footer></section>`;
        duration = 4000;
      } else if (e.type === "boss") {
        html = root.DabaoBossFlipScene.render(e.round, e.cards.map(card => BOSS_MAP[card.key]), e.remaining, picture, muted);
        duration = 2100 + Math.max(0, e.cards.length-1)*1150;
      } else if (e.type === "kill") {
        html = root.DabaoKillScene.render(e.round, muted);
      } else if (e.type === "result") {
        const game = { ...e, mode: "solo", humanPlayerId: this.playerId, score: player => player.score, pendingScore: player => player.pendingValue };
        html = root.DabaoResultScene.render(game, picture, outcomeFor, muted);
        sound.finish(e.result, "solo", { humanPlayerId: this.playerId });
      }
      this.host.innerHTML = html;
      if (root.document?.hidden) this.host.setAttribute?.("data-scene-paused", "");
      else this.host.removeAttribute?.("data-scene-paused");
      this.startSound();
      if (e.type === "effect" && e.data.kind === "discard" && !root.document?.hidden) this.soundTimer = setTimeout(() => { if (sequence === this.sequence) sound.playSlash(); }, 1300);
      this.host.querySelector(".result-overlay")?.classList.add("is-art-ready");
      if (e.type === "kill") this.playVideo();
      if (duration) {
        const reduced = root.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
        this.schedule(reduced ? 650 : duration);
      }
      this.onChange();
    }
    startSound() {
      if (this.soundStarted || root.document?.hidden || !this.current) return;
      this.soundStarted = true;
      const e = this.current;
      if (e.type === "skill") this.sound.playCard(e.entry.key);
      if (e.type === "boss") this.sound.playBossTurn();
      if (e.type === "kill") this.sound.playBossKill();
    }
    playVideo() {
      const video = this.host.querySelector("video");
      if (!video) return;
      const sequence = this.sequence;
      if (root.document?.hidden) return;
      video.onended = () => { if (sequence === this.sequence) this.next(); };
      video.onplaying = () => {
        if (sequence !== this.sequence) return;
        this.schedule(Number.isFinite(video.duration) ? Math.max(1000, (video.duration-video.currentTime)*1000+500) : 12000);
      };
      video.onwaiting = () => { clearTimeout(this.timer); this.timer = null; };
      video.onerror = () => { if (sequence === this.sequence) this.fallback(); };
      try { video.play()?.catch(() => { if (sequence === this.sequence) this.fallback(); }); }
      catch { this.fallback(); }
    }
    fallback() {
      this.fallbackActive = true;
      const video = this.host.querySelector("video");
      if (video) { video.onplaying = null; video.onended = null; video.pause(); }
      const fallback = this.host.querySelector(".kill-fallback");
      if (fallback) fallback.hidden = false;
      this.schedule(3000);
    }
  }
  root.DabaoOnlineScenes = { OnlineScenes };
  if (typeof module !== "undefined" && module.exports) module.exports = { OnlineScenes };
})(typeof window !== "undefined" ? window : globalThis);
