(function () {
  "use strict";

  const { CARD_MAP, BOSS_MAP } = window.DabaoKill;
  const app = document.getElementById("online-app");
  const openedAsFile = location.protocol === "file:";
  const config = window.DabaoOnlineConfig || {};
  function readStorage(key) { try { return localStorage.getItem(key); } catch { return null; } }
  const sound = new window.DabaoAudio.GameAudio();
  sound.setMuted(readStorage("dabaokill-online-muted") === "true");
  function startRoomAudio() {
    if (state?.phase === "ended") return;
    if (!sound.inGame) sound.start();
    else sound.ensureBackground();
  }
  function serviceOrigin(value) {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("请输入完整服务地址，如 https://你的服务.onrender.com，不要附带页面路径");
    if (location.protocol === "https:" && url.protocol !== "https:") throw new Error("HTTPS 网页需要连接 HTTPS 房间服务");
    return url.origin;
  }
  let apiBase = readStorage("dabaokill-service") || config.apiBaseUrl || (openedAsFile ? "http://127.0.0.1:3000" : location.origin);
  const storageKey = (key) => `dabaokill:${apiBase}:${key}`;
  let requestedCode = new URLSearchParams(location.search).get("room")?.toUpperCase() || "";
  let session = null;
  let state = null;
  let busy = false;
  let polling = false;
  let error = "";

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }

  function image(name) {
    return `picture/${name.split("/").map(encodeURIComponent).join("/")}`;
  }

  function shell(content) {
    app.innerHTML = `<div class="online-shell"><header class="online-header"><a class="online-brand" href="index.html">DABAO<span>KILL</span></a><div class="online-header-actions"><small>在线四人 · 独立设备</small><button class="quiet-button" data-action="mute" aria-pressed="${sound.muted}" aria-label="静音">${sound.muted ? "开启音乐" : "静音"}</button><a class="quiet-button" href="index.html">返回模式选择</a></div></header>${content}</div>`;
  }

  function renderEntry() {
    shell(`<div class="online-entry"><div class="online-entry-art"><img src="picture/dabao.jpg" alt="大宝"><strong>四人同局，各自争胜</strong></div>
      <div class="online-card"><span class="section-kicker">ONLINE ROOM</span><h1>在线四人</h1>
        <p>邀请朋友跨设备同局。4 名真人到齐自动开局；已有 2 或 3 人时，房主可选择电脑补齐空位。每局始终四人对战。</p>
        <div class="online-actions"><button class="online-primary" data-action="create" ${busy ? "disabled" : ""}>创建房间 ↗</button>
          <form class="online-join" id="online-join"><input name="code" maxlength="6" required autocomplete="off" placeholder="输入 6 位房间码" value="${escapeHtml(requestedCode)}" aria-label="房间码"><button class="online-secondary" ${busy ? "disabled" : ""}>加入房间</button></form></div>
        <p class="online-note">已有席位的玩家刷新页面即可返回原房间。邀请链接只包含房间码。</p>
        <details><summary>房间服务设置</summary><form id="service-settings" class="online-actions"><label for="service-url">公网服务地址（所有玩家使用同一地址）</label><input id="service-url" name="service" type="url" value="${escapeHtml(apiBase)}" required><button class="online-secondary">保存并连接</button></form><p class="online-hint">发布版配置好服务后无需填写。本地测试可用 http://127.0.0.1:3000。</p></details>
        ${error ? `<p class="online-error" role="alert">${escapeHtml(error)}</p>` : ""}
      </div></div>`);
  }

  function cardView(card) {
    const info = CARD_MAP[card.key];
    return `<div class="online-card-mini"><img src="${image(info.image)}" alt="${escapeHtml(info.name)}"><span>${escapeHtml(info.name)} ${card.value === null ? "·" : card.value > 0 ? `+${card.value}` : card.value}</span></div>`;
  }

  function seatView(player) {
    return `<article class="online-seat ${player.id === state.playerId ? "is-self" : ""}">
      <h2>${player.id} 号${player.isAI ? "电脑" : "玩家"} ${player.id === state.playerId ? "· 你" : ""}</h2>
      <small>${player.selected ? "已盖放" : state.phase === "select" ? "等待盖放" : "已入座"} · 手牌 ${player.handCount} 张</small>
      <div class="online-seat-score">${player.score} <span>勾玉</span></div>
      <div class="online-display">${player.display.length ? player.display.map(cardView).join("") : '<span class="online-hint">尚无展示牌</span>'}</div></article>`;
  }

  function controls() {
    const self = state.players.find((player) => player.id === state.playerId);
    if (state.phase === "ended") {
      const won = state.result.winners.includes(state.playerId);
      return `<div class="online-result"><strong>${state.result.kind === "draw" ? "本局无胜负" : won ? "你获胜了" : "本局结束"}</strong><p>${escapeHtml(state.result.message)}</p><button class="online-primary" data-action="create" ${busy ? "disabled" : ""}>创建新房间 ↗</button></div>`;
    }
    if (state.phase === "choice") {
      const choice = state.pendingChoice;
      if (choice.actorId !== state.playerId) return `<h2>技能结算</h2><p>${choice.actorId} 号玩家正在选择目标，稍候即可继续。</p>`;
      return `<h2>轮到你选择技能目标</h2><p>${escapeHtml(choice.prompt)}</p><div class="online-options">${choice.options.map((option) => `<button data-action="choose" data-id="${option.id}" ${busy ? "disabled" : ""}><img src="${image(option.image)}" alt=""><strong>${escapeHtml(option.label)}</strong><small>选择目标 ↗</small></button>`).join("")}</div>`;
    }
    if (state.phase === "select") {
      if (self.selected) return `<h2>已盖放</h2><p>等待其余玩家出牌。翻牌前可收回并换牌。</p><button class="online-secondary" data-action="reselect" ${busy ? "disabled" : ""}>换牌 ↗</button>`;
      return `<h2>请盖放一张牌</h2><p>其他玩家看不到你的手牌。四人全部盖放后会自动展示并结算。</p><div class="online-hand">${self.hand.map((card) => {
        const info = CARD_MAP[card.key];
        return `<button data-action="select" data-id="${card.id}" ${busy ? "disabled" : ""}><img src="${image(info.image)}" alt="${escapeHtml(info.name)}"><strong>${escapeHtml(info.name)}</strong><small>${info.value > 0 ? "+" : ""}${info.value} 勾玉 · ${escapeHtml(info.skill)}</small></button>`;
      }).join("")}</div>`;
    }
    return `<h2>战局结算中</h2><p>正在同步最新回合。</p>`;
  }

  function renderRoom() {
    const invite = config.invitePageUrl ? new URL(config.invitePageUrl) : new URL("/online.html", apiBase);
    invite.search = `?room=${state.code}`;
    if (state.status === "waiting") {
      shell(`<div class="online-room-head"><div><span class="section-kicker">WAITING ROOM</span><h1>房间 ${state.code}</h1><span class="online-status">${state.seats.length} / 4 人已入座</span></div><div><span class="online-pill">你是 ${state.playerId} 号玩家</span><button class="online-secondary" data-action="switch-room" ${busy ? "disabled" : ""}>切换房间</button></div></div>
        <div class="online-grid">${Array.from({ length: 4 }, (_, index) => `<div class="online-seat ${index + 1 === state.playerId ? "is-self" : ""} ${state.seats.includes(index + 1) ? "" : "is-empty"}"><h2>${index + 1} 号位</h2><small>${state.seats.includes(index + 1) ? index + 1 === state.playerId ? "你已入座" : "玩家已入座" : "等待玩家"}</small></div>`).join("")}</div>
        <div class="online-wait"><h2>邀请朋友加入</h2><p>四名真人到齐自动开始；至少两名真人时，房主可选择电脑补齐空位。</p>
          ${state.playerId === 1 && state.seats.length >= 2 ? `<button class="online-primary" data-action="start-ai" ${busy ? "disabled" : ""}>开始对局 · ${4 - state.seats.length} 名电脑补位</button>` : `<p class="online-hint">${state.seats.length < 2 ? "等待至少一位朋友加入" : "等待房主选择开始，或继续邀请朋友"}</p>`}
          <div class="online-copy-row"><input id="invite-url" readonly value="${escapeHtml(invite.href)}" aria-label="邀请链接"><button class="online-secondary" data-action="copy">复制链接</button></div>
          <p class="online-hint">房间码：${state.code}。请用运行联机服务器的可访问地址分享链接。</p></div>${error ? `<p class="online-error" role="alert">${escapeHtml(error)}</p>` : ""}`);
      return;
    }
    const boss = state.bossDisplay.map((card) => `<div class="online-card-mini"><img src="${image(BOSS_MAP[card.key].image)}" alt="${BOSS_MAP[card.key].name}"><span>${BOSS_MAP[card.key].name}</span></div>`).join("");
    shell(`<div class="online-room-head"><div><span class="section-kicker">ONLINE BATTLE · ${state.code}</span><h1>第 ${state.round} 回合</h1><span class="online-status">${state.phase === "ended" ? "对局结束" : state.phase === "choice" ? "技能选择" : "战备阶段"}</span></div><div><span class="online-pill">你是 ${state.playerId} 号玩家</span><button class="online-secondary" data-action="switch-room" ${busy ? "disabled" : ""}>切换房间</button></div></div>
      <div class="online-grid">${state.players.map(seatView).join("")}</div>
      <section class="online-boss"><h2>大宝展示区</h2><div class="online-boss-cards">${boss || '<span class="online-hint">尚无大宝牌</span>'}</div><p class="online-hint">玩家牌堆 ${state.playerDeckCount} 张 · 大宝牌堆 ${state.bossDeckCount} 张</p></section>
      <div class="online-control-grid"><section class="online-controls">${controls()}${error ? `<p class="online-error" role="alert">${escapeHtml(error)}</p>` : ""}</section>
        <section class="online-history"><h2>战报</h2><ol>${state.log.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ol></section></div>`);
  }

  function render() {
    if (state) {
      if (state.phase === "ended") { if (!busy) sound.stop(); }
      else startRoomAudio();
      renderRoom();
    } else renderEntry();
  }

  async function api(method, url, payload, token) {
    const response = await fetch(new URL(url, serviceOrigin(apiBase)).href, {
      method,
      headers: { ...(payload ? { "Content-Type": "application/json" } : {}), ...(token ? { "X-Room-Token": token } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
      cache: "no-store",
    }).catch(() => { throw new Error("无法连接房间服务，请检查网络和“房间服务设置”中的地址；免费服务唤醒期间请稍后重试。"); });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) throw new Error("此地址尚未提供房间服务，或服务正在唤醒。请稍后重试，或在“房间服务设置”中填写已部署的 HTTPS 服务地址。");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "网络请求失败");
    return data;
  }

  function saveSession(code, token) {
    session = { code, token };
    try {
      localStorage.setItem(storageKey(`room-${code}`), token);
      localStorage.setItem(storageKey("last-room"), code);
    } catch { /* Private browsing may block storage. */ }
    history.replaceState(null, "", `online.html?room=${code}`);
  }

  async function createOrJoin(code) {
    if (busy) return;
    // Start inside the user's click/submit, before waiting for the network.
    // A room restored after a refresh can retry on the next user interaction.
    if (state?.phase === "ended") sound.start();
    else startRoomAudio();
    busy = true;
    error = "";
    render();
    try {
      const data = code ? await api("POST", `/api/rooms/${code}/join`, {}) : await api("POST", "/api/rooms", {});
      saveSession(data.state.code, data.token);
      state = data.state;
    } catch (failure) { error = failure.message; if (!state) sound.stop(); }
    busy = false;
    render();
  }

  async function poll() {
    if (!session || polling || busy) return;
    const activeSession = session;
    polling = true;
    try {
      const update = await api("GET", `/api/rooms/${activeSession.code}`, null, activeSession.token);
      if (session !== activeSession) return;
      if (!state || update.version > state.version || (update.version === state.version && error)) {
        state = update;
        error = "";
        render();
      }
    } catch (failure) {
      if (session !== activeSession) return;
      if (error !== failure.message) { error = failure.message; render(); }
    } finally { polling = false; }
  }

  async function act(type, id) {
    if (busy || !session) return;
    startRoomAudio();
    const activeSession = session;
    busy = true;
    error = "";
    render();
    try {
      const payload = type === "start" ? { type, fillAI: true } : type === "select" ? { type, cardId: id } : type === "choose" ? { type, optionId: id } : { type };
      const update = await api("POST", `/api/rooms/${activeSession.code}/action`, payload, activeSession.token);
      if (session === activeSession) state = update;
    } catch (failure) {
      if (session === activeSession) error = failure.message;
    }
    busy = false;
    render();
  }

  app.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button?.dataset.action !== "mute") sound.ensureBackground();
    if (!button) return;
    if (button.dataset.action === "mute") {
      sound.setMuted(!sound.muted);
      try { localStorage.setItem("dabaokill-online-muted", String(sound.muted)); } catch { /* Optional persistence. */ }
      if (!sound.muted) startRoomAudio();
      render();
    }
    else if (button.dataset.action === "create") createOrJoin(null);
    else if (button.dataset.action === "start-ai") act("start");
    else if (button.dataset.action === "switch-room") {
      sound.stop();
      session = null;
      state = null;
      error = "";
      requestedCode = "";
      try { localStorage.removeItem(storageKey("last-room")); } catch { /* Storage may be unavailable. */ }
      history.replaceState(null, "", "online.html");
      render();
    }
    else if (button.dataset.action === "select" || button.dataset.action === "choose") act(button.dataset.action, Number(button.dataset.id));
    else if (button.dataset.action === "reselect") act("reselect");
    else if (button.dataset.action === "copy") {
      const input = document.getElementById("invite-url");
      navigator.clipboard?.writeText(input.value).then(() => { button.textContent = "已复制"; }).catch(() => { input.select(); });
      if (!navigator.clipboard) input.select();
    }
  });

  app.addEventListener("submit", (event) => {
    if (event.target.id === "service-settings") {
      event.preventDefault();
      try {
        apiBase = serviceOrigin(new FormData(event.target).get("service").trim());
        try { localStorage.setItem("dabaokill-service", apiBase); } catch { /* Optional persistence. */ }
        session = null; state = null; error = "服务地址已保存，可以创建或加入房间。";
        sound.stop();
      } catch (failure) { error = failure.message; }
      render(); return;
    }
    if (event.target.id !== "online-join") return;
    event.preventDefault();
    const code = new FormData(event.target).get("code").toString().trim().toUpperCase();
    if (!/^[A-Z2-9]{6}$/.test(code)) { error = "请输入有效的 6 位房间码"; render(); return; }
    createOrJoin(code);
  });

  async function restore() {
    const code = /^[A-Z2-9]{6}$/.test(requestedCode) ? requestedCode : readStorage(storageKey("last-room"));
    if (code) {
      try {
        const token = readStorage(storageKey(`room-${code}`));
        if (token) {
          const restored = await api("GET", `/api/rooms/${code}`, null, token);
          if (!session && !busy) {
            session = { code, token };
            state = restored;
            history.replaceState(null, "", `online.html?room=${code}`);
          }
        }
      } catch { /* The room may have expired; keep the entry screen available. */ }
    }
    render();
  }

  renderEntry();
  restore();
  setInterval(poll, 1200);
})();
