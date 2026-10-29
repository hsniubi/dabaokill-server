(function () {
  "use strict";

  const { Game, CARDS, CARD_MAP, BOSS_CARDS, BOSS_MAP, outcomeFor } = window.DabaoKill;
  const sound = new window.DabaoAudio.GameAudio();
  const app = document.getElementById("app");
  const picture = (name) => window.DabaoAssetUrl?.(`picture/${name}`) || `picture/${name.split("/").map(encodeURIComponent).join("/")}`;
  const signed = (number) => number > 0 ? `+${number}` : String(number);
  let game = null;
  let pendingSelection = null;
  let activeTab = "battle";
  let activeTooltipTarget = null;
  let showRules = false;
  let showResultScene = false;
  let showKillScene = false;
  let showPlayerFlipScene = false;
  let playerFlipCards = [];
  let playerFlipTimer = null;
  let playerFlipSequence = 0;
  let skillSceneEntry = null;
  let skillSceneTimer = null;
  let skillSceneSequence = 0;
  let showBossFlipScene = false;
  let bossFlipCards = [];
  let bossFlipTimer = null;
  let bossFlipSequence = 0;
  let recastSceneData = null;
  let recastTimer = null;
  let recastSequence = 0;
  let cardEffectSceneData = null;
  let cardEffectTimer = null;
  let cardEffectSoundTimer = null;
  let cardEffectSequence = 0;
  let killVideoStarted = false;
  let killSoundStarted = false;
  let killFallbackTimer = null;
  let killStartWatchdogTimer = null;
  let killSceneSequence = 0;
  let loadingMode = null;
  let loadingProgress = { done: 0, total: 0, failed: 0 };
  let loadingError = null;
  let loadingSequence = 0;
  const loadingMessages = ["大宝正在擦拭古锭刀...", "大宝正在喝酒...", "大宝正在打扫战场..."];
  let loadingMessageIndex = 0;
  let loadingMessageTimer = null;
  let showBeginScene = false;
  let beginTimer = null;
  let beginStartTimer = null;
  let beginBgmVolume = null;
  let beginSequence = 0;

  const phaseNames = {
    select: "战备阶段", "ready-reveal": "展示阶段", resolve: "展示阶段",
    choice: "技能结算", "ready-boss": "大宝出手", "ready-next": "回合结束", ended: "对局结束",
  };

  function img(src, className, alt = "") {
    return `<img class="${className}" src="${picture(src)}" alt="${alt}">`;
  }

  function tabs() {
    return `<nav class="topbar-tabs" role="tablist" aria-label="游戏页面">
      <button id="tab-battle" role="tab" aria-controls="battle-panel" aria-selected="${activeTab === "battle"}" class="topbar-tab ${activeTab === "battle" ? "is-active" : ""}" data-action="tab-battle">战场</button>
      <button id="tab-rules" role="tab" aria-controls="rules-panel" aria-selected="${activeTab === "rules"}" class="topbar-tab ${activeTab === "rules" ? "is-active" : ""}" data-action="tab-rules">规则</button>
    </nav>`;
  }

  function rulesContent() {
    return `<section class="card-rules-page" id="rules-panel" role="tabpanel" aria-labelledby="tab-rules">
      <div class="rules-page-heading"><div><span class="section-kicker">PLAYER CARDS · 10 种</span><h1>玩家牌图鉴</h1><p>点数按牌面原值列出；吴景、星黄忠和麹义的实际点数会按技能变化。</p></div><div class="rules-page-mark">44 <span>张玩家牌</span></div></div>
      <div class="rules-page-overview"><div><strong>胜利</strong><p>结算后率先达到 11 勾玉者获胜；若大宝凑齐酒、杀、古锭刀，则战斗力最低者获胜。</p></div><div><strong>回合</strong><p>战备补牌、预选并确认盖放；翻牌前可换牌 → 同时展示、按牌面点数结算 → 大宝翻牌。</p></div><div><strong>术语</strong><p>重铸：选中的大宝牌置于牌堆底，再翻顶牌替代。收回：将自己的旧展示牌放回手牌。交换后点数不变。</p></div></div>
      <div class="rules-list-heading"><span>牌面点数由低到高</span><span>悬停立绘可查看说明</span></div>
      <div class="rules-card-grid">${CARDS.map((card) => `<article class="rules-card">
        <div class="rules-card-art" tabindex="0" data-card-key="${card.key}" aria-label="${card.name}，${signed(card.value)} 勾玉，${card.skill}：${card.description}">${img(card.image, "rules-card-image", card.name)}</div>
        <div class="rules-card-copy"><div class="rules-card-top"><span class="rules-card-value">${signed(card.value)} <small>勾玉</small></span><span class="rules-card-count">牌堆 ${card.count} 张</span></div><h2>${card.name}</h2><div class="rules-card-skill">${card.skill}</div><p>${card.description}</p></div>
      </article>`).join("")}</div>
    </section>`;
  }

  const tooltipHost = '<div class="card-hover-tooltip" role="tooltip" hidden></div>';

  function openStart() {
    const localFile = window.location?.protocol === "file:";
    const onlineUrl = localFile && window.DabaoAssetUrl ? `${window.DabaoOnlineConfig?.apiBaseUrl || "http://127.0.0.1:3000"}/online.html` : "online.html";
    app.innerHTML = `
      <div class="start-screen">
        <div class="start-art" aria-hidden="true">${img("dabao.jpg", "start-boss")}</div>
        <div class="start-copy">
          <div class="eyebrow"><span class="eyebrow-line"></span> 四人协力 · 各自争胜</div>
          <h1><span>DABAO</span><em>KILL</em></h1>
          <p class="start-lead">凑足十一勾玉，先手斩将。<br>若大宝集齐酒、杀、古锭刀，唯有战斗力最低者存活。</p>
          <div class="start-options">
            <button class="mode-card" data-action="start" data-mode="solo">
              <span class="mode-number">01</span><strong>单人挑战</strong>
              <span>随机分配你的玩家编号，另外三名由电脑操作。</span><b>开始对局 ↗</b>
            </button>
            <button class="mode-card" data-action="start" data-mode="local">
              <span class="mode-number">02</span><strong>四人手动</strong>
              <span>同一设备依次选牌，四家手牌持续显示。</span><b>开始对局 ↗</b>
            </button>
            <a class="mode-card mode-card-online" href="${onlineUrl}">
              <span class="mode-number">03</span><strong>在线联机</strong>
              <span>2～4 人跨设备同局，空位可由电脑补齐，始终四人对战。</span><b>进入联机大厅 ↗</b>
            </a>
          </div>
          <button class="start-rules-link" data-action="tab-rules">查看规则与全部玩家牌 ↗</button>
          <p class="start-foot">44 张玩家牌 · 8 张大宝牌 · 三阶段回合</p>
        </div>
      </div>${tooltipHost}`;
  }

  function loadingScreen() {
    const { done, total } = loadingProgress;
    const percent = total ? Math.round(done / total * 100) : 0;
    const background = window.DabaoAssetLoader?.urlFor?.("picture/start.jpg") || picture("start.jpg");
    return `<section class="loading-screen" aria-label="游戏资源加载">
      <img class="loading-background" src="${background}" alt="" aria-hidden="true" fetchpriority="high">
      <div class="loading-panel">
        <span class="section-kicker">DABAO KILL · PREPARING</span>
        <h1>${loadingError ? "资源加载未完成" : "战场准备中"}</h1>
        <p class="loading-message">${loadingError ? `${loadingError}。可以重试，或直接进入战场。` : loadingMessages[loadingMessageIndex]}</p>
        <progress class="loading-progress" max="${total || 1}" value="${done}" aria-label="资源加载进度"></progress>
        <div class="loading-count"><strong>${percent}%</strong><span>${done} / ${total} 项资源</span></div>
        <div class="loading-actions">${loadingError ? '<button class="primary-button" data-action="retry-loading">重试加载 ↗</button><button class="quiet-button" data-action="continue-loading">直接进入战场</button>' : ""}<button class="quiet-button" data-action="cancel-loading">返回首页</button></div>
      </div>
    </section>`;
  }

  function beginScreen() {
    const video = window.DabaoAssetUrl?.("video/begin.mp4") || "video/begin.mp4?v=20261022k";
    return `<section class="begin-screen" aria-label="战局开始动画">
      <video class="begin-video" preload="auto" playsinline webkit-playsinline aria-label="战局开始"><source src="${video}" type="video/mp4"></video>
      <div class="begin-caption"><span>DABAO KILL</span><strong>战局开始</strong></div>
      <div class="begin-play-prompt" hidden><button class="primary-button" data-action="play-begin">点击播放开场动画（含音效） ↗</button></div>
      <button class="begin-skip" data-action="skip-begin">跳过动画 ↗</button>
    </section>`;
  }

  function recastScreen() {
    const { actorId, sourceKey, oldKey, newKey, sameCard, deckRemaining } = recastSceneData;
    const oldCard = BOSS_MAP[oldKey];
    const newCard = BOSS_MAP[newKey];
    const skill = CARD_MAP[sourceKey]?.skill || "重铸";
    return `<section class="recast-overlay" role="dialog" aria-modal="true" aria-label="大宝牌重铸演出" tabindex="-1">
      <img class="recast-portrait" src="${picture("dabao.jpg")}" alt="" aria-hidden="true">
      <header class="recast-header"><span>第 ${String(game.round).padStart(2, "0")} 回合 · ${actorId} 号玩家</span><h2>重铸大宝牌</h2><p>【${skill}】将已展示的牌放回牌堆底，再从牌堆顶翻开一张。</p></header>
      <div class="recast-stage" aria-live="polite">
        <div class="recast-stage-label recast-old-label"><span>放入牌堆底</span><strong>【${oldCard.name}】</strong></div>
        <div class="recast-stage-label recast-deck-label"><span>牌堆顶 ↑</span><strong>大宝牌堆</strong><small>牌堆底 ↓</small></div>
        <div class="recast-stage-label recast-new-label"><span>${sameCard ? "翻回原牌" : "翻出新牌"}</span><strong>【${newCard.name}】</strong></div>
        <div class="recast-old-card"><img src="${picture(oldCard.image)}" alt="原牌${oldCard.name}"></div>
        <div class="recast-deck-stack"><img src="${picture("dabaobeimian.png")}" alt="大宝牌堆"></div>
        <div class="recast-new-card"><div class="recast-new-card-inner"><div class="recast-new-face recast-new-front"><img src="${picture(newCard.image)}" alt="新牌${newCard.name}"></div><div class="recast-new-face recast-new-back"><img src="${picture("dabaobeimian.png")}" alt="牌背"></div></div></div>
      </div>
      <footer class="recast-footer"><span>【${oldCard.name}】入底 → ${sameCard ? "牌堆已空，顶牌仍是原牌" : "牌堆顶翻出新牌"} · 牌堆剩 ${deckRemaining} 张</span><div><button data-action="mute" aria-pressed="${sound.muted}">${sound.muted ? "开启声音" : "静音"}</button><button data-action="skip-recast" aria-label="跳过重铸演出">跳过演出 ↗</button></div></footer>
    </section>`;
  }

  function showBeginPlayPrompt(sequence) {
    if (!showBeginScene || sequence !== beginSequence) return;
    if (beginStartTimer !== null) clearTimeout(beginStartTimer);
    beginStartTimer = null;
    const prompt = app.querySelector(".begin-play-prompt");
    if (prompt) prompt.hidden = false;
  }

  function beginPlaybackStarted(sequence) {
    if (!showBeginScene || sequence !== beginSequence) return;
    if (beginStartTimer !== null) clearTimeout(beginStartTimer);
    beginStartTimer = null;
    const prompt = app.querySelector(".begin-play-prompt");
    if (prompt) prompt.hidden = true;
    if (sound.bgm && beginBgmVolume === null) {
      beginBgmVolume = sound.bgm.volume;
      sound.bgm.volume = Math.min(beginBgmVolume, 0.12);
    }
    if (beginTimer === null) beginTimer = setTimeout(() => completeBeginScene(sequence), 8000);
  }

  function tryPlayBeginVideo(sequence) {
    if (!showBeginScene || sequence !== beginSequence) return;
    const video = app.querySelector(".begin-video");
    if (typeof video?.play !== "function") return completeBeginScene(sequence);
    video.muted = sound.muted;
    if (beginStartTimer !== null) clearTimeout(beginStartTimer);
    beginStartTimer = setTimeout(() => showBeginPlayPrompt(sequence), 6000);
    try {
      const playback = video.play();
      if (playback && typeof playback.then === "function") {
        playback.then(() => beginPlaybackStarted(sequence)).catch((error) => {
          if (error?.name === "NotAllowedError") showBeginPlayPrompt(sequence);
          else completeBeginScene(sequence);
        });
      } else beginPlaybackStarted(sequence);
    } catch (error) {
      if (error?.name === "NotAllowedError") showBeginPlayPrompt(sequence);
      else completeBeginScene(sequence);
    }
  }

  function completeBeginScene(sequence = beginSequence) {
    if (!showBeginScene || sequence !== beginSequence) return;
    if (beginTimer !== null) clearTimeout(beginTimer);
    beginTimer = null;
    if (beginStartTimer !== null) clearTimeout(beginStartTimer);
    beginStartTimer = null;
    if (beginBgmVolume !== null && sound.bgm) sound.bgm.volume = beginBgmVolume;
    beginBgmVolume = null;
    app.querySelector(".begin-video")?.pause?.();
    showBeginScene = false;
    beginSequence += 1;
    render();
    sound.ensureBackground?.();
    window.DabaoAssetLoader?.warmOptional?.();
  }

  function startBeginScene() {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      render();
      window.DabaoAssetLoader?.warmOptional?.();
      return;
    }
    showBeginScene = true;
    const sequence = ++beginSequence;
    render();
    tryPlayBeginVideo(sequence);
  }

  function updateLoadingProgress(progress, sequence) {
    if (sequence !== loadingSequence || !loadingMode) return;
    loadingProgress = progress;
    const background = app.querySelector(".loading-background");
    const loadedBackground = window.DabaoAssetLoader.urlFor?.("picture/start.jpg");
    if (background && loadedBackground && background.src !== loadedBackground) background.src = loadedBackground;
    const bar = app.querySelector(".loading-progress");
    if (bar) {
      bar.max = progress.total || 1;
      bar.value = progress.done;
    }
    const count = app.querySelector(".loading-count");
    if (count) count.innerHTML = `<strong>${progress.total ? Math.round(progress.done / progress.total * 100) : 0}%</strong><span>${progress.done} / ${progress.total} 项资源</span>`;
  }

  function stopLoadingMessageRotation() {
    if (loadingMessageTimer !== null) clearTimeout(loadingMessageTimer);
    loadingMessageTimer = null;
  }

  function rotateLoadingMessage(sequence) {
    if (sequence !== loadingSequence || !loadingMode || loadingError) return;
    loadingMessageIndex = (loadingMessageIndex + 1) % loadingMessages.length;
    const message = app.querySelector(".loading-message");
    if (message) message.textContent = loadingMessages[loadingMessageIndex];
    loadingMessageTimer = setTimeout(() => rotateLoadingMessage(sequence), 1800);
  }

  function bossCounts() {
    return Object.fromEntries(BOSS_CARDS.map((card) => [card.key, game.bossDisplay.filter((entry) => entry.key === card.key).length]));
  }

  function bossStickyBar() {
    if (!game.bossDisplay.length) return "";
    const counts = bossCounts();
    return `<aside class="boss-sticky" aria-label="当前已展示的大宝牌" aria-hidden="true">
      <div class="boss-sticky-inner"><strong class="boss-sticky-title">大宝已展示</strong>
        <div class="boss-sticky-cards">${BOSS_CARDS.map((card) => `<div class="boss-sticky-card ${counts[card.key] ? "has-card" : ""}">
          ${img(counts[card.key] ? card.image : "dabaobeimian.png", "boss-sticky-image", counts[card.key] ? card.name : "未展示")}
          <span><strong>${card.name}</strong><small>${counts[card.key]} / ${card.count}</small></span>
        </div>`).join("")}</div>
      </div>
    </aside>`;
  }

  function updateBossStickyBar() {
    const bar = app.querySelector(".boss-sticky");
    const cards = app.querySelector(".boss-set");
    if (!bar || !cards) return;
    const sceneOpen = showPlayerFlipScene || Boolean(skillSceneEntry) || showBossFlipScene || Boolean(recastSceneData) || Boolean(cardEffectSceneData) || (game?.phase === "ended" && (showResultScene || showKillScene));
    const visible = !sceneOpen && cards.getBoundingClientRect().bottom <= 0;
    bar.classList.toggle("is-visible", visible);
    bar.setAttribute("aria-hidden", String(!visible));
  }

  function bossArea() {
    const counts = bossCounts();
    return `<section class="boss-zone" aria-label="大宝区域">
      <div class="boss-portrait">${img("dabao.jpg", "boss-image", "大宝立绘")}<div class="boss-name">大宝 <small>敌方</small></div></div>
      <div class="boss-information">
        <div class="section-kicker">大宝已展示</div>
        <div class="boss-set">${BOSS_CARDS.map((card) => `<div class="boss-type ${counts[card.key] ? "has-card" : ""}">
          <div class="boss-card-frame">${counts[card.key] ? img(card.image, "boss-card-image", card.name) : img("dabaobeimian.png", "boss-card-image", "未展示")}</div>
          <div class="boss-card-meta"><strong>${card.name}</strong><span>${counts[card.key]} / ${card.count}</span></div>
        </div>`).join("")}</div>
        <div class="boss-footnote">${game.bossDisplay.length ? `已展示 ${game.bossDisplay.length} 张 · 牌堆剩 ${game.bossDeck.length} 张` : "三种牌同时出现，大宝便能出手"}</div>
      </div>
      <div class="boss-pile"><div class="boss-pile-art">${img("dabaobeimian.png", "boss-pile-image", "大宝牌背")}</div><strong>${game.bossDeck.length}</strong><span>大宝牌堆</span></div>
    </section>`;
  }

  function displayCards(player) {
    const cards = player.display.map((card) => `<div class="table-card ${card.round === game.round ? "is-new" : ""} ${card.flipped ? "is-flipped" : ""}" tabindex="0" data-card-key="${card.key}" data-card-current="${card.value === null ? "pending" : card.value}" aria-label="${CARD_MAP[card.key].name}，牌面 ${signed(CARD_MAP[card.key].value)} 勾玉，${card.value === null ? "待结算" : `当前 ${signed(card.value)} 勾玉`}，${CARD_MAP[card.key].skill}：${CARD_MAP[card.key].description}">
      ${img(CARD_MAP[card.key].image, "table-card-art", CARD_MAP[card.key].name)}
      <span class="table-card-name">${CARD_MAP[card.key].name}</span>
      <span class="table-card-score">${card.value === null ? "·" : signed(card.value)}</span>
    </div>`).join("");
    if (player.selected) return cards + `<div class="table-card table-card-back" title="本回合已盖放">${img("wanjiabeimian.jpg", "table-card-art", "玩家牌背")}</div>`;
    return cards || `<div class="empty-display">尚无展示牌</div>`;
  }

  function playerPanel(player) {
    const current = game.phase === "select" && game.currentChooser()?.id === player.id;
    const pendingValue = game.pendingScore(player);
    return `<article class="player-panel ${current ? "is-active" : ""}">
      <div class="player-top"><span class="seat-number">${String(player.id).padStart(2, "0")}</span>
        <div class="player-identity"><strong>${player.id} 号玩家</strong><span>${player.isAI ? "电脑" : game.mode === "solo" ? "你" : "手动操控"}</span></div>
        <div class="score-box">${pendingValue === null ? "" : `<span class="score-pending">(${signed(pendingValue)})</span>`}${img("gouyu.jpg", "gouyu", "勾玉")}<strong>${game.score(player)}</strong></div>
      </div>
      <div class="display-heading"><span>展示牌</span><span>${player.display.length} 张</span></div>
      <div class="display-track">${displayCards(player)}</div>
      <div class="player-bottom"><span>手牌 ${player.hand.length - (player.selected ? 1 : 0)} 张</span><span>${player.selected ? `${img("wanjiabeimian.jpg", "tiny-card-back", "已盖放")} 已盖放` : game.phase === "select" ? "等待盖牌" : ""}</span></div>
    </article>`;
  }

  function handCard(card, ownerId, selectable) {
    const info = CARD_MAP[card.key];
    const tag = selectable ? "button" : "div";
    const pending = selectable && pendingSelection?.playerId === ownerId && pendingSelection.cardId === card.id;
    const action = selectable ? `type="button" data-action="select" data-player="${ownerId}" data-id="${card.id}" aria-pressed="${pending}"` : 'tabindex="0"';
    return `<${tag} class="hand-card" ${action} data-card-key="${card.key}" aria-label="${selectable ? "预选" : "手牌"}${info.name}，${signed(info.value)}勾玉，${info.skill}：${info.description}">
      ${img(info.image, "hand-image", info.name)}<span class="hand-value">${signed(info.value)}</span><span class="hand-name">${info.name}</span>
    </${tag}>`;
  }

  function handDock() {
    const chooserId = game.phase === "select" ? game.currentChooser()?.id : null;
    const humanPlayers = game.players.filter((player) => !player.isAI);
    return `<section class="hands-zone ${game.mode === "solo" ? "is-solo" : "is-local"}" aria-label="玩家手牌">
      <div class="hands-heading"><div><span class="section-kicker">PLAYER HAND</span><h2>${game.mode === "solo" ? "你的手牌" : "四家手牌"}</h2></div><span>${chooserId ? `当前由 ${chooserId} 号玩家盖牌` : "手牌持续显示"}</span></div>
      <div class="hand-seats">${humanPlayers.map((player) => {
        const visibleCards = player.hand.filter((card) => card.id !== player.selected);
        const selectable = chooserId === player.id;
        return `<div class="hand-seat ${selectable ? "is-current" : ""}" aria-label="${player.id} 号玩家手牌">
          <div class="hand-seat-heading"><strong>${player.id} 号玩家${game.mode === "solo" ? " · 你" : ""}</strong><span>${visibleCards.length} 张${selectable ? pendingSelection?.playerId === player.id ? " · 待确认" : " · 请选牌" : ""}</span></div>
          <div class="hand-cards">${visibleCards.length ? visibleCards.map((card) => handCard(card, player.id, selectable)).join("") : '<span class="hand-empty">暂无手牌</span>'}</div>
          ${player.selected && (game.phase === "select" || game.phase === "ready-reveal") ? `<button type="button" class="hand-reselect" data-action="reselect" data-player="${player.id}">换牌 ↗</button>` : ""}
        </div>`;
      }).join("")}</div>
    </section>`;
  }

  function interaction() {
    if (game.phase === "ended") {
      const view = window.DabaoResultScene.viewModel(game, outcomeFor);
      return `<div class="decision-content result-summary" aria-live="polite">
        <div class="section-kicker">对局结算 · 第 ${game.round} 回合</div>
        <h2>${view.title}</h2><p>${view.message}</p>
        <div class="result-summary-actions"><button class="primary-button" data-action="replay-result">重播结算画面 <span>↗</span></button><button class="quiet-button" data-action="restart">再开一局</button></div>
      </div>`;
    }
    if (game.phase === "select") {
      const chooser = game.currentChooser();
      const chosen = pendingSelection?.playerId === chooser.id
        ? chooser.hand.find((card) => card.id === pendingSelection.cardId)
        : null;
      return `<div class="decision-content"><div class="decision-title"><div><div class="section-kicker">战备 · 盖放一张</div><h2>请 ${chooser.id} 号玩家选牌</h2></div><span class="decision-tip">翻开展示牌前可换牌</span></div>
        <p>${chosen ? `已预选【${CARD_MAP[chosen.key].name}】。点击另一张手牌可更换，或再次点击这张取消预选。` : "从手牌区点击一张手牌，选好后再确认盖放。"}</p>
        ${chosen ? '<button type="button" class="primary-button" data-action="confirm-select">确认盖放 <span>↗</span></button>' : ""}</div>`;
    }
    if (game.phase === "choice") {
      const choice = game.pendingChoice;
      return `<div class="decision-content"><div class="decision-title"><div><div class="section-kicker">技能选择 · ${choice.actorId} 号玩家</div><h2>${choice.prompt}</h2></div></div>
        <div class="option-list">${choice.options.map((option) => {
          const playerCard = CARDS.find((card) => card.image === option.image);
          return `<button class="choice-option" data-action="choose" data-id="${option.id}" ${playerCard ? `data-card-key="${playerCard.key}"` : ""}>${img(option.image, "choice-image", option.label)}<span>${option.label}</span><b>选择 ↗</b></button>`;
        }).join("")}</div></div>`;
    }
    if (game.phase === "ready-reveal") return buttonPrompt("展示阶段", "四名玩家已盖放", "翻牌前可在手牌区换牌。确认无误后同时翻开四张牌，按牌面点数和玩家编号依次结算。", "翻开展示牌", "reveal");
    if (game.phase === "resolve") {
      const next = game.resolutionQueue[0];
      return buttonPrompt("展示阶段", `下一张 · ${next.ownerId} 号【${CARD_MAP[next.key].name}】`, `牌面 ${signed(CARD_MAP[next.key].value)} 勾玉 · ${CARD_MAP[next.key].skill}`, "结算这张牌", "resolve");
    }
    if (game.phase === "ready-boss") return buttonPrompt("大宝出手", "玩家展示已结算", `翻开大宝牌堆顶的 ${game.bossDrawCount} 张牌，并检查【酒】【杀】【古锭刀】。`, "大宝出手", "boss");
    if (game.phase === "ready-next") return buttonPrompt("回合结束", `第 ${game.round} 回合结束`, "进入战备阶段，按编号将玩家手牌补至三张。", "进入下一回合", "next");
    return "";
  }

  function buttonPrompt(kicker, title, description, label, action) {
    return `<div class="decision-content button-prompt"><div><div class="section-kicker">${kicker}</div><h2>${title}</h2><p>${description}</p></div><button class="primary-button" data-action="${action}">${label} <span>↗</span></button></div>`;
  }

  function rulesPanel() {
    return `<details class="rules-panel" ${showRules ? "open" : ""}><summary>规则速览 <span>${showRules ? "收起 −" : "展开 +"}</span></summary>
      <div class="rules-grid"><div><strong>胜利</strong><p>结算后率先达到 11 勾玉的玩家击败大宝。若大宝凑齐酒、杀、古锭刀，则战斗力最低者获胜；并列者同胜。</p></div>
      <div><strong>每回合</strong><p>补手牌至三张 → 预选并确认盖放，翻牌前可换牌 → 同时展示，按牌面点数由低到高结算，同点数按玩家编号 → 大宝翻牌。</p></div>
      <div><strong>牌堆与技能</strong><p>重铸会将选中的大宝牌放到牌堆底并翻顶牌替代。收回与弃置只能选非本回合的展示牌。玩家牌堆抽空则无胜负。</p></div></div>
    </details>`;
  }

  function battleContent() {
    return `<main id="battle-panel" role="tabpanel" aria-labelledby="tab-battle"><div class="section-heading"><div><span class="section-kicker">BOSS ZONE</span><h1>大宝阵前</h1></div><div class="deck-counter"><span>玩家牌堆</span><strong>${game.playerDeck.length}</strong><small>/ 44</small></div></div>
      ${bossArea()}
      ${bossStickyBar()}
      <div class="section-heading players-heading"><div><span class="section-kicker">PLAYER FIELD</span><h2>四方战阵</h2></div><span class="section-aside">率先达到 11 勾玉，即可击败大宝</span></div>
      <section class="players-grid" aria-label="玩家区域">${game.players.map(playerPanel).join("")}</section>
      <div class="hand-decision-row ${game.mode === "solo" ? "is-solo" : "is-local"}">
        ${handDock()}
        <section class="decision-panel" aria-label="当前操作">${interaction()}</section>
      </div>
      <div class="lower-grid">${rulesPanel()}<section class="battle-log"><div class="log-heading"><strong>战报</strong><span>最新记录在上</span></div><ol>${game.log.slice(0, 7).map((item) => `<li>${item}</li>`).join("")}</ol></section></div>
      </main>`;
  }

  function beginGame(mode, audioStarted = false) {
    if (beginTimer !== null) clearTimeout(beginTimer);
    beginTimer = null;
    if (beginStartTimer !== null) clearTimeout(beginStartTimer);
    beginStartTimer = null;
    if (beginBgmVolume !== null && sound.bgm) sound.bgm.volume = beginBgmVolume;
    beginBgmVolume = null;
    showBeginScene = false;
    beginSequence += 1;
    game = new Game(mode);
    pendingSelection = null;
    activeTab = "battle";
    showResultScene = false;
    showKillScene = false;
    showPlayerFlipScene = false;
    playerFlipCards = [];
    if (playerFlipTimer !== null) clearTimeout(playerFlipTimer);
    playerFlipTimer = null;
    playerFlipSequence += 1;
    skillSceneEntry = null;
    if (skillSceneTimer !== null) clearTimeout(skillSceneTimer);
    skillSceneTimer = null;
    skillSceneSequence += 1;
    showBossFlipScene = false;
    bossFlipCards = [];
    if (bossFlipTimer !== null) clearTimeout(bossFlipTimer);
    bossFlipTimer = null;
    bossFlipSequence += 1;
    recastSceneData = null;
    if (recastTimer !== null) clearTimeout(recastTimer);
    recastTimer = null;
    recastSequence += 1;
    cardEffectSceneData = null;
    if (cardEffectTimer !== null) clearTimeout(cardEffectTimer);
    cardEffectTimer = null;
    if (cardEffectSoundTimer !== null) clearTimeout(cardEffectSoundTimer);
    cardEffectSoundTimer = null;
    cardEffectSequence += 1;
    killVideoStarted = false;
    killSoundStarted = false;
    if (killStartWatchdogTimer !== null) clearTimeout(killStartWatchdogTimer);
    killStartWatchdogTimer = null;
    if (killFallbackTimer !== null) clearTimeout(killFallbackTimer);
    killFallbackTimer = null;
    killSceneSequence += 1;
    sound.prepareAssets?.();
    if (!audioStarted) sound.start();
    startBeginScene();
  }

  function startLoading(mode) {
    stopLoadingMessageRotation();
    loadingMode = mode;
    loadingError = null;
    loadingMessageIndex = 0;
    loadingProgress = { done: 0, total: window.DabaoAssetLoader.manifest().length, failed: 0 };
    const sequence = ++loadingSequence;
    render();
    loadingMessageTimer = setTimeout(() => rotateLoadingMessage(sequence), 1800);
    window.DabaoAssetLoader.load((progress) => updateLoadingProgress(progress, sequence))
      .then(() => {
        if (sequence !== loadingSequence || !loadingMode) return;
        stopLoadingMessageRotation();
        loadingMode = null;
        beginGame(mode, true);
      })
      .catch((error) => {
        if (sequence !== loadingSequence || !loadingMode) return;
        stopLoadingMessageRotation();
        loadingError = error?.message || "网络异常";
        render();
      });
  }

  function render() {
    activeTooltipTarget = null;
    if (loadingMode) {
      document.body.classList.remove("result-open");
      app.innerHTML = loadingScreen();
      return;
    }
    if (showBeginScene) {
      document.body.classList.remove("result-open");
      app.innerHTML = beginScreen();
      return;
    }
    if (!game) {
      document.body.classList.remove("result-open");
      if (activeTab === "rules") {
        app.innerHTML = `<div class="game-shell"><header class="topbar"><div class="brand"><span class="brand-symbol">斩</span><div><strong>DABAO<span>KILL</span></strong><small>四人战大宝</small></div></div>${tabs()}</header>${rulesContent()}<footer>dabao<span>kill</span> · 单机版</footer></div>${tooltipHost}`;
      } else openStart();
      return;
    }
    const sceneOpen = showPlayerFlipScene || Boolean(skillSceneEntry) || showBossFlipScene || Boolean(recastSceneData) || Boolean(cardEffectSceneData) || (game.phase === "ended" && (showResultScene || showKillScene));
    document.body.classList.toggle("result-open", sceneOpen);
    app.innerHTML = `<div class="game-shell" ${sceneOpen ? 'inert aria-hidden="true"' : ""}>
      <header class="topbar"><div class="topbar-left"><div class="brand"><span class="brand-symbol">斩</span><div><strong>DABAO<span>KILL</span></strong><small>四人战大宝</small></div></div>${tabs()}</div>
      <div class="topbar-controls"><div class="turn-label"><span>第 ${String(game.round).padStart(2, "0")} 回合</span><strong>${phaseNames[game.phase]}</strong></div><button class="quiet-button sound-button" data-action="mute" aria-pressed="${sound.muted}">${sound.muted ? "开启声音" : "静音"}</button><button class="quiet-button" data-action="restart">新开一局 ↗</button></div></header>
      ${activeTab === "rules" ? rulesContent() : battleContent()}<footer>dabao<span>kill</span> · 单机版</footer>
    </div>${recastSceneData ? recastScreen() : cardEffectSceneData ? window.DabaoCardEffectScene.render(game.round, cardEffectSceneData, CARD_MAP, picture, sound.muted) : showPlayerFlipScene ? window.DabaoPlayerFlipScene.render(game.round, playerFlipCards, picture, sound.muted) : skillSceneEntry ? window.DabaoSkillScene.render(game.round, skillSceneEntry, CARD_MAP[skillSceneEntry.key], picture, sound.muted) : showBossFlipScene ? window.DabaoBossFlipScene.render(game.round, bossFlipCards, game.bossDeck.length, picture, sound.muted) : showKillScene ? window.DabaoKillScene.render(game.round, sound.muted) : showResultScene ? window.DabaoResultScene.render(game, picture, outcomeFor, sound.muted) : ""}${tooltipHost}`;
    if (activeTab === "battle" && !sceneOpen) updateBossStickyBar();
    if (showResultScene && game.phase === "ended") {
      const overlay = app.querySelector(".result-overlay");
      const art = overlay?.querySelector?.(".scene-emblem-art");
      if (art) {
        const reveal = () => {
          if (overlay.isConnected) overlay.classList.add("is-art-ready");
        };
        if (typeof art.decode === "function") art.decode().then(reveal, reveal);
        else if (art.complete) reveal();
        else {
          art.addEventListener("load", reveal, { once: true });
          art.addEventListener("error", reveal, { once: true });
        }
      }
    }
    if (sceneOpen) app.querySelector(".recast-overlay, .card-effect-overlay, .player-flip-overlay, .skill-overlay, .boss-flip-overlay, .kill-overlay, .result-overlay")?.focus();
  }

  function completeRecastScene() {
    if (!recastSceneData) return;
    if (recastTimer !== null) clearTimeout(recastTimer);
    recastTimer = null;
    recastSequence += 1;
    recastSceneData = null;
    render();
    app.querySelector('.decision-panel button')?.focus();
  }

  function startRecastScene(previousEvent) {
    if (!game?.recastEvent || game.recastEvent === previousEvent) return;
    recastSceneData = game.recastEvent;
    const sequence = ++recastSequence;
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 1400 : 4000;
    recastTimer = setTimeout(() => {
      if (recastSceneData && recastSequence === sequence) completeRecastScene();
    }, duration);
  }

  function completeCardEffectScene() {
    if (!cardEffectSceneData) return;
    if (cardEffectTimer !== null) clearTimeout(cardEffectTimer);
    cardEffectTimer = null;
    if (cardEffectSoundTimer !== null) clearTimeout(cardEffectSoundTimer);
    cardEffectSoundTimer = null;
    cardEffectSequence += 1;
    cardEffectSceneData = null;
    if (game?.phase === "ended" && !showResultScene && !showKillScene) {
      showResultScene = true;
      sound.finish(game.result, game.mode, { humanPlayerId: game.humanPlayerId });
    }
    render();
    if (game?.phase !== "ended") app.querySelector(".decision-panel button")?.focus();
  }

  function startCardEffectScene(previousEvent) {
    if (!game?.cardEffectEvent || game.cardEffectEvent === previousEvent) return;
    cardEffectSceneData = game.cardEffectEvent;
    const sequence = ++cardEffectSequence;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const duration = reducedMotion ? 1200 : 3450;
    if (cardEffectSceneData.kind === "discard") {
      // The sound's impact is 390ms in, aligned to the card split at 53% of 3.2s.
      cardEffectSoundTimer = setTimeout(() => {
        cardEffectSoundTimer = null;
        if (cardEffectSceneData?.kind === "discard" && cardEffectSequence === sequence) sound.playSlash();
      }, reducedMotion ? 50 : 1300);
    }
    cardEffectTimer = setTimeout(() => {
      if (cardEffectSceneData && cardEffectSequence === sequence) completeCardEffectScene();
    }, duration);
  }

  function completeSkillScene() {
    if (!skillSceneEntry) return;
    if (skillSceneTimer !== null) clearTimeout(skillSceneTimer);
    skillSceneTimer = null;
    skillSceneSequence += 1;
    skillSceneEntry = null;
    const previousRecast = game.recastEvent;
    const previousCardEffect = game.cardEffectEvent;
    if (game.resolveNext()) {
      startRecastScene(previousRecast);
      startCardEffectScene(previousCardEffect);
    }
    if (game.phase === "ended" && !cardEffectSceneData) {
      showResultScene = true;
      sound.finish(game.result, game.mode, { humanPlayerId: game.humanPlayerId });
    }
    render();
    if (game.phase === "choice" && !recastSceneData) app.querySelector(".decision-panel button")?.focus();
  }

  function startSkillScene() {
    if (game?.phase !== "resolve" || !game.resolutionQueue.length) return;
    skillSceneEntry = { key: game.resolutionQueue[0].key, ownerId: game.resolutionQueue[0].ownerId };
    sound.playCard(skillSceneEntry.key);
    render();
    const sequence = ++skillSceneSequence;
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 650 : 1900;
    skillSceneTimer = setTimeout(() => {
      if (skillSceneEntry && skillSceneSequence === sequence) completeSkillScene();
    }, duration);
  }

  function completePlayerReveal() {
    if (!showPlayerFlipScene) return;
    if (playerFlipTimer !== null) clearTimeout(playerFlipTimer);
    playerFlipTimer = null;
    playerFlipSequence += 1;
    showPlayerFlipScene = false;
    playerFlipCards = [];
    render();
  }

  function startPlayerReveal() {
    if (!game.reveal()) return;
    playerFlipCards = game.revealedThisRound
      .slice().sort((a, b) => a.ownerId - b.ownerId)
      .map((entry) => ({ ownerId: entry.ownerId, ...CARD_MAP[entry.key] }));
    showPlayerFlipScene = true;
    render();
    const sequence = ++playerFlipSequence;
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? 450 : 2300;
    playerFlipTimer = setTimeout(() => {
      if (showPlayerFlipScene && playerFlipSequence === sequence) completePlayerReveal();
    }, duration);
  }

  function completeBossStage() {
    if (bossFlipTimer !== null) clearTimeout(bossFlipTimer);
    bossFlipTimer = null;
    bossFlipSequence += 1;
    showBossFlipScene = false;
    bossFlipCards = [];
    if (game.phase === "ended") {
      if (game.result.kind === "boss") {
        showKillScene = true;
        killSceneSequence += 1;
        render();
        sound.afterBossTurn(startKillVideo);
      } else {
        showResultScene = true;
        render();
        const finishedGame = game;
        sound.afterBossTurn(() => {
          if (game === finishedGame && game.phase === "ended") sound.finish(game.result, game.mode, { humanPlayerId: game.humanPlayerId });
        });
      }
    } else render();
  }

  function startBossStage() {
    const existing = new Set(game.bossDisplay.map((card) => card.id));
    sound.playBossTurn();
    game.bossStage();
    bossFlipCards = game.bossDisplay.filter((card) => !existing.has(card.id)).map((card) => BOSS_MAP[card.key]);
    if (!bossFlipCards.length) return completeBossStage();
    showBossFlipScene = true;
    render();
    const sequence = ++bossFlipSequence;
    const duration = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      ? 450 : 2100 + (bossFlipCards.length - 1) * 1150;
    bossFlipTimer = setTimeout(() => {
      if (showBossFlipScene && bossFlipSequence === sequence) completeBossStage();
    }, duration);
  }

  function advanceKillScene() {
    if (!showKillScene || game?.phase !== "ended") return;
    if (killStartWatchdogTimer !== null) clearTimeout(killStartWatchdogTimer);
    killStartWatchdogTimer = null;
    if (killFallbackTimer !== null) clearTimeout(killFallbackTimer);
    killFallbackTimer = null;
    killSceneSequence += 1;
    app.querySelector(".kill-video")?.pause();
    const afterBossKill = killSoundStarted;
    killVideoStarted = false;
    killSoundStarted = false;
    showKillScene = false;
    showResultScene = true;
    sound.finish(game.result, game.mode, { afterBossKill, humanPlayerId: game.humanPlayerId });
    render();
  }

  function startKillVideo() {
    if (!showKillScene || killVideoStarted) return;
    const video = app.querySelector(".kill-video");
    if (!video) return advanceKillScene();
    killVideoStarted = true;
    video.muted = true;
    tryPlayKillVideo(false);
  }

  function tryPlayKillVideo(retry) {
    if (!showKillScene || killFallbackTimer !== null) return;
    const video = app.querySelector(".kill-video");
    if (!video) return showKillFallback();
    const sequence = killSceneSequence;
    const failed = () => {
      if (!showKillScene || sequence !== killSceneSequence || killFallbackTimer !== null) return;
      if (killStartWatchdogTimer !== null) clearTimeout(killStartWatchdogTimer);
      killStartWatchdogTimer = null;
      if (retry) showKillFallback();
      else {
        video.controls = true;
        const prompt = app.querySelector(".kill-play-prompt");
        if (prompt) prompt.hidden = false;
      }
    };
    try {
      const playback = video.play();
      if (!killSoundStarted) {
        if (killStartWatchdogTimer !== null) clearTimeout(killStartWatchdogTimer);
        killStartWatchdogTimer = setTimeout(() => {
          killStartWatchdogTimer = null;
          if (!showKillScene || sequence !== killSceneSequence || killSoundStarted) return;
          if (retry) showKillFallback();
          else {
            video.controls = true;
            const prompt = app.querySelector(".kill-play-prompt");
            if (prompt) prompt.hidden = false;
          }
        }, 4000);
      }
      playback?.catch(failed);
    } catch (_) { failed(); }
  }

  function showKillFallback() {
    if (!showKillScene || killFallbackTimer !== null) return;
    if (killStartWatchdogTimer !== null) clearTimeout(killStartWatchdogTimer);
    killStartWatchdogTimer = null;
    const video = app.querySelector(".kill-video");
    if (video) { video.pause(); video.hidden = true; }
    const prompt = app.querySelector(".kill-play-prompt");
    if (prompt) prompt.hidden = true;
    const fallback = app.querySelector(".kill-fallback");
    if (fallback) fallback.hidden = false;
    app.querySelector(".kill-overlay")?.classList.add("is-playing");
    if (!killSoundStarted) {
      killSoundStarted = true;
      sound.playBossKill();
    }
    killFallbackTimer = setTimeout(() => {
      killFallbackTimer = null;
      advanceKillScene();
    }, 2600);
  }

  function hideCardTooltip() {
    activeTooltipTarget = null;
    const tooltip = app.querySelector(".card-hover-tooltip");
    if (tooltip) tooltip.hidden = true;
  }

  function showCardTooltip(target) {
    const info = CARD_MAP[target?.dataset?.cardKey];
    const tooltip = app.querySelector(".card-hover-tooltip");
    if (!info || !tooltip || activeTooltipTarget === target) return;
    activeTooltipTarget = target;
    const current = target.dataset.cardCurrent;
    const currentLine = current === "pending" ? "本张待结算" : current !== undefined ? `本张当前 ${signed(Number(current))} 勾玉` : "";
    tooltip.innerHTML = `<div class="card-hover-heading"><strong>${info.name}</strong><span>${signed(info.value)} 勾玉</span></div><div class="card-hover-skill">${info.skill}</div><p>${info.description}</p>${currentLine ? `<small>${currentLine}</small>` : ""}`;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - box.width / 2, viewportWidth - box.width - 12));
    const above = rect.top - box.height - 12;
    const top = above >= 12 ? above : Math.min(rect.bottom + 12, viewportHeight - box.height - 12);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(12, top)}px`;
  }

  app.addEventListener("pointerover", (event) => {
    const card = event.target.closest?.("[data-card-key]");
    if (card) showCardTooltip(card);
  });
  app.addEventListener("pointerout", (event) => {
    const card = event.target.closest?.("[data-card-key]");
    if (card && !card.contains(event.relatedTarget)) hideCardTooltip();
  });
  app.addEventListener("focusin", (event) => {
    const card = event.target.closest?.("[data-card-key]");
    if (card) showCardTooltip(card);
  });
  app.addEventListener("focusout", (event) => {
    const card = event.target.closest?.("[data-card-key]");
    if (card && !card.contains(event.relatedTarget)) hideCardTooltip();
  });
  window.addEventListener?.("scroll", hideCardTooltip, true);
  window.addEventListener?.("resize", hideCardTooltip);

  app.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (!["start", "mute", "restart", "cancel-loading"].includes(action)) sound.ensureBackground?.();
    const wasEnded = game?.phase === "ended";
    if (loadingMode) {
      if (action === "cancel-loading") {
        loadingSequence += 1;
        stopLoadingMessageRotation();
        loadingMode = null;
        sound.stop();
        render();
      } else if (action === "retry-loading" && loadingError) startLoading(loadingMode);
      else if (action === "continue-loading" && loadingError) {
        const mode = loadingMode;
        loadingSequence += 1;
        stopLoadingMessageRotation();
        loadingMode = null;
        beginGame(mode, true);
      }
      return;
    }
    if (showBeginScene) {
      if (action === "skip-begin") completeBeginScene();
      else if (action === "play-begin") tryPlayBeginVideo(beginSequence);
      return;
    }
    if (showPlayerFlipScene && !["skip-player-flip", "mute", "restart"].includes(action)) return;
    if (skillSceneEntry && !["skip-skill", "mute", "restart"].includes(action)) return;
    if (cardEffectSceneData && !["skip-card-effect", "mute", "restart"].includes(action)) return;
    if (showBossFlipScene && !["skip-flip", "mute", "restart"].includes(action)) return;
    if (recastSceneData && !["skip-recast", "mute", "restart"].includes(action)) return;
    if (action === "tab-battle" || action === "tab-rules") {
      if (showKillScene || showResultScene) return;
      activeTab = action === "tab-rules" ? "rules" : "battle";
      render();
      app.querySelector(`[data-action="${action}"]`)?.focus();
      window.scrollTo?.(0, 0);
      return;
    }
    if (action === "start") {
      if (window.DabaoAssetLoader?.needsLoading()) {
        sound.start();
        startLoading(button.dataset.mode);
      } else beginGame(button.dataset.mode);
      return;
    } else if (action === "restart") {
      app.querySelector(".kill-video")?.pause();
      sound.stop();
      game = null;
      pendingSelection = null;
      activeTab = "battle";
      showRules = false;
      showResultScene = false;
      showKillScene = false;
      showPlayerFlipScene = false;
      playerFlipCards = [];
      if (playerFlipTimer !== null) clearTimeout(playerFlipTimer);
      playerFlipTimer = null;
      playerFlipSequence += 1;
      skillSceneEntry = null;
      if (skillSceneTimer !== null) clearTimeout(skillSceneTimer);
      skillSceneTimer = null;
      skillSceneSequence += 1;
      showBossFlipScene = false;
      bossFlipCards = [];
      if (bossFlipTimer !== null) clearTimeout(bossFlipTimer);
      bossFlipTimer = null;
      bossFlipSequence += 1;
      recastSceneData = null;
      if (recastTimer !== null) clearTimeout(recastTimer);
      recastTimer = null;
      recastSequence += 1;
      cardEffectSceneData = null;
      if (cardEffectTimer !== null) clearTimeout(cardEffectTimer);
      cardEffectTimer = null;
      if (cardEffectSoundTimer !== null) clearTimeout(cardEffectSoundTimer);
      cardEffectSoundTimer = null;
      cardEffectSequence += 1;
      killVideoStarted = false;
      killSoundStarted = false;
      if (killStartWatchdogTimer !== null) clearTimeout(killStartWatchdogTimer);
      killStartWatchdogTimer = null;
      if (killFallbackTimer !== null) clearTimeout(killFallbackTimer);
      killFallbackTimer = null;
      killSceneSequence += 1;
    } else if (action === "mute") {
      sound.setMuted(!sound.muted);
      app.querySelectorAll('[data-action="mute"]').forEach((control) => {
        control.setAttribute("aria-pressed", String(sound.muted));
        control.textContent = sound.muted ? "开启声音" : "静音";
      });
      return;
    } else if (action === "close-result") showResultScene = false;
    else if (action === "replay-result" && game?.phase === "ended") {
      showResultScene = true;
      sound.finish(game.result, game.mode, { humanPlayerId: game.humanPlayerId });
    }
    else if (action === "skip-kill") {
      advanceKillScene();
      return;
    }
    else if (action === "play-kill") {
      tryPlayKillVideo(true);
      return;
    }
    else if (action === "fallback-kill") {
      showKillFallback();
      return;
    }
    else if (action === "skip-flip") {
      if (showBossFlipScene) completeBossStage();
      return;
    }
    else if (action === "skip-recast") {
      completeRecastScene();
      return;
    }
    else if (action === "skip-card-effect") {
      completeCardEffectScene();
      return;
    }
    else if (action === "skip-player-flip") {
      completePlayerReveal();
      return;
    }
    else if (action === "skip-skill") {
      completeSkillScene();
      return;
    }
    else if (action === "select") {
      const playerId = Number(button.dataset.player);
      const cardId = Number(button.dataset.id);
      if (game?.phase !== "select" || game.currentChooser()?.id !== playerId || !game.player(playerId).hand.some((card) => card.id === cardId)) return;
      pendingSelection = pendingSelection?.playerId === playerId && pendingSelection.cardId === cardId ? null : { playerId, cardId };
    } else if (action === "confirm-select") {
      if (!pendingSelection || !game?.selectCard(pendingSelection.playerId, pendingSelection.cardId)) return;
      pendingSelection = null;
    } else if (action === "reselect") {
      if (!game?.reselectCard(Number(button.dataset.player))) return;
      pendingSelection = null;
    }
    else if (action === "choose") {
      const value = button.dataset.id;
      const previousRecast = game.recastEvent;
      const previousCardEffect = game.cardEffectEvent;
      if (game.choose(/^\d+$/.test(value) ? Number(value) : value)) {
        startRecastScene(previousRecast);
        startCardEffectScene(previousCardEffect);
      }
    } else if (action === "reveal") {
      startPlayerReveal();
      return;
    }
    else if (action === "resolve") {
      startSkillScene();
      return;
    }
    else if (action === "boss" && game.phase === "ready-boss") {
      startBossStage();
      return;
    }
    else if (action === "next") game.startRound();
    if (!wasEnded && game?.phase === "ended" && !cardEffectSceneData) {
      showResultScene = true;
      sound.finish(game.result, game.mode, { humanPlayerId: game.humanPlayerId });
    }
    render();
    if (action === "close-result") app.querySelector('[data-action="replay-result"]')?.focus();
  });

  app.addEventListener("ended", (event) => {
    if (event.target.classList?.contains("begin-video")) completeBeginScene();
    else if (event.target.classList?.contains("kill-video")) advanceKillScene();
  }, true);

  app.addEventListener("playing", (event) => {
    if (event.target.classList?.contains("kill-video") && showKillScene && !killSoundStarted) {
      if (killStartWatchdogTimer !== null) clearTimeout(killStartWatchdogTimer);
      killStartWatchdogTimer = null;
      const prompt = app.querySelector(".kill-play-prompt");
      if (prompt) prompt.hidden = true;
      killSoundStarted = true;
      app.querySelector(".kill-overlay")?.classList.add("is-playing");
      sound.playBossKill();
    }
  }, true);

  app.addEventListener("error", (event) => {
    if (event.target.classList?.contains("begin-video")) completeBeginScene();
    else if (event.target.classList?.contains("kill-video") && killVideoStarted) showKillFallback();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && showBeginScene) completeBeginScene();
    else if (event.key === "Escape" && recastSceneData) completeRecastScene();
    else if (event.key === "Escape" && cardEffectSceneData) completeCardEffectScene();
    else if (event.key === "Escape" && showPlayerFlipScene) completePlayerReveal();
    else if (event.key === "Escape" && skillSceneEntry) completeSkillScene();
    else if (event.key === "Escape" && showBossFlipScene) completeBossStage();
    else if (event.key === "Escape" && showKillScene) advanceKillScene();
    else if (event.key === "Escape" && showResultScene) {
      showResultScene = false;
      render();
      app.querySelector('[data-action="replay-result"]')?.focus();
    }
  });

  app.addEventListener("toggle", (event) => {
    if (event.target.classList?.contains("rules-panel")) showRules = event.target.open;
  }, true);

  window.addEventListener?.("scroll", updateBossStickyBar, { passive: true });
  window.addEventListener?.("resize", updateBossStickyBar);
  render();
})();
