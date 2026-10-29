(function (root) {
  "use strict";

  const CARDS = [
    { key: "caochong", name: "曹冲", value: -3, count: 3, skill: "仁心", description: "若大宝牌堆有牌，本回合大宝不会击杀玩家。", image: "caochong.jpg", emblem: "skill-emblems/caochong-renxin.webp" },
    { key: "caoang", name: "曹昂", value: -2, count: 5, skill: "慷慨", description: "重铸一张未重复的大宝牌；没有则不重铸。", image: "caoang.jpg", emblem: "skill-emblems/caoang-kangkai.webp" },
    { key: "youpangtong", name: "友庞统", value: -1, count: 4, skill: "漫卷", description: "收回自己一张非本回合的展示牌。", image: "youpangtong.jpg", emblem: "skill-emblems/youpangtong-manjuan.webp" },
    { key: "quyi", name: "麹义", value: -1, count: 4, skill: "伏骑", description: "若本轮大宝出手后展示区没有古锭刀，自动倒置为 +2。", image: "quyi.jpg", emblem: "skill-emblems/quyi-fuqi.webp" },
    { key: "shenganning", name: "神甘宁", value: 0, count: 4, skill: "劫营", description: "弃置任意玩家一张非本回合的展示牌。", image: "shenganning.jpg", emblem: "skill-emblems/shenganning-jieying.webp" },
    { key: "wujing", name: "吴景", value: 1, count: 6, skill: "合击", description: "本回合每有一名其他玩家也展示吴景，此牌 +1，至多 +4。", image: "wujing.jpg", emblem: "skill-emblems/wujing-heji.webp" },
    { key: "shenlusu", name: "神鲁肃", value: 2, count: 5, skill: "榻谟", description: "交换两名其他玩家各一张非本回合的展示牌；点数不变。", image: "shenlusu.jpg", emblem: "skill-emblems/shenlusu-tamo.webp" },
    { key: "wenyang", name: "文鸯", value: 3, count: 5, skill: "却敌", description: "重铸一张重复的大宝牌；没有则不重铸。", image: "wenyang.jpg", emblem: "skill-emblems/wenyang-queuedi.webp" },
    { key: "caomao", name: "曹髦", value: 4, count: 4, skill: "决进", description: "本轮大宝出手改为翻开牌堆顶的两张牌。", image: "caomao.jpg", emblem: "skill-emblems/caomao-juejin.webp" },
    { key: "xinghuangzhong", name: "星黄忠", value: 5, count: 4, skill: "烈弓", description: "本回合每有一名其他玩家也展示星黄忠，此牌 -2。", image: "xinghuangzhong.jpg", emblem: "skill-emblems/xinghuangzhong-liegong.webp" },
  ];
  const CARD_MAP = Object.fromEntries(CARDS.map((card) => [card.key, card]));
  const BOSS_CARDS = [
    { key: "sha", name: "杀", count: 4, image: "sha.jpg" },
    { key: "jiu", name: "酒", count: 3, image: "jiu.png" },
    { key: "gudingdao", name: "古锭刀", count: 1, image: "gudingdao.jpg" },
  ];
  const BOSS_MAP = Object.fromEntries(BOSS_CARDS.map((card) => [card.key, card]));

  function shuffle(cards, random) {
    const result = cards.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function outcomeFor(result, playerId) {
    if (result.kind === "draw") return "tie";
    return result.winners.includes(playerId) ? "victory" : "fail";
  }

  class Game {
    constructor(mode = "solo", random = Math.random, humanCount = 4) {
      if (mode === "online" && ![2, 3, 4].includes(humanCount)) throw new Error("联机真人数量必须为 2～4 人");
      this.mode = mode;
      this.random = random;
      this.nextId = 1;
      this.round = 0;
      this.phase = "setup";
      this.players = Array.from({ length: 4 }, (_, index) => ({
        id: index + 1,
        isAI: false,
        hand: [],
        display: [],
        selected: null,
      }));
      this.playerDeck = shuffle(CARDS.flatMap((card) => Array.from({ length: card.count }, () => ({ id: this.id(), key: card.key }))), random);
      this.bossDeck = shuffle(BOSS_CARDS.flatMap((card) => Array.from({ length: card.count }, () => ({ id: this.id(), key: card.key }))), random);
      this.humanPlayerId = mode === "solo" ? Math.floor(random() * 4) + 1 : null;
      this.players.forEach((player) => { player.isAI = mode === "solo" ? player.id !== this.humanPlayerId : mode === "online" && player.id > humanCount; });
      this.bossDisplay = [];
      this.discard = [];
      this.resolutionQueue = [];
      this.revealedThisRound = [];
      this.pendingChoice = null;
      this.activeCard = null;
      this.recastEvent = null;
      this.cardEffectEvent = null;
      this.bossDrawCount = 1;
      this.protectedThisRound = false;
      this.result = null;
      this.log = [];
      this.startRound();
    }

    id() { return this.nextId++; }
    player(id) { return this.players.find((player) => player.id === id); }
    score(player) { return player.display.reduce((sum, card) => sum + (card.value ?? 0), 0); }
    scoreOf(id) { return this.score(this.player(id)); }
    cardValue(entry) {
      const same = this.revealedThisRound.filter((card) => card.ownerId !== entry.ownerId && card.key === entry.key).length;
      if (entry.key === "wujing") return Math.min(4, CARD_MAP[entry.key].value + same);
      if (entry.key === "xinghuangzhong") return CARD_MAP[entry.key].value - 2 * same;
      return CARD_MAP[entry.key].value;
    }
    pendingScore(player) {
      const card = player.display.find((entry) => entry.round === this.round
        && (entry.value === null || (this.phase === "choice" && this.activeCard?.id === entry.id)));
      return card ? (card.value ?? this.cardValue(card)) : null;
    }
    say(message) { this.log.unshift(message); }
    nameOf(key) { return CARD_MAP[key].name; }
    bossName(key) { return BOSS_MAP[key].name; }

    end(kind, winners, message) {
      this.phase = "ended";
      this.pendingChoice = null;
      this.result = { kind, winners, message };
      this.say(message);
    }

    startRound() {
      if (this.phase === "ended") return;
      if (!this.playerDeck.length) {
        this.end("draw", [], "玩家牌堆已经抽空，本局无胜负。");
        return;
      }
      this.round += 1;
      this.bossDrawCount = 1;
      this.protectedThisRound = false;
      this.activeCard = null;
      this.revealedThisRound = [];
      this.pendingChoice = null;
      this.players.forEach((player) => { player.selected = null; });
      for (const player of this.players) {
        while (player.hand.length < 3) {
          if (!this.playerDeck.length) {
            this.end("draw", [], "玩家牌堆已经抽空，本局无胜负。");
            return;
          }
          player.hand.push(this.playerDeck.shift());
          if (!this.playerDeck.length) {
            this.end("draw", [], "玩家牌堆已经抽空，本局无胜负。");
            return;
          }
        }
      }
      this.phase = "select";
      this.say(`第 ${this.round} 回合：所有玩家补牌至三张。`);
      this.selectAI();
    }

    currentChooser() { return this.players.find((player) => !player.selected); }

    selectAI() {
      if (this.phase !== "select") return;
      for (const player of this.players) {
        if (!player.isAI || player.selected) continue;
        const ordered = player.hand.slice().sort((a, b) => CARD_MAP[b.key].value - CARD_MAP[a.key].value);
        player.selected = ordered[0].id;
        this.say(`${player.id} 号电脑玩家已盖放一张牌。`);
      }
      if (this.players.every((player) => player.selected)) this.phase = "ready-reveal";
    }

    selectCard(playerId, cardId) {
      if (this.phase !== "select") return false;
      const chooser = this.mode === "online" ? this.player(playerId) : this.currentChooser();
      if (!chooser || chooser.id !== playerId || chooser.isAI || chooser.selected || !chooser.hand.some((card) => card.id === cardId)) return false;
      chooser.selected = cardId;
      this.say(`${chooser.id} 号玩家已盖放一张牌。`);
      this.selectAI();
      if (this.players.every((player) => player.selected)) this.phase = "ready-reveal";
      return true;
    }

    reselectCard(playerId) {
      if (this.phase !== "select" && this.phase !== "ready-reveal") return false;
      const player = this.player(playerId);
      if (!player || player.isAI || !player.selected) return false;
      player.selected = null;
      this.phase = "select";
      this.say(`${player.id} 号玩家收回盖放的牌，重新选牌。`);
      return true;
    }

    reveal() {
      if (this.phase !== "ready-reveal") return false;
      const played = [];
      for (const player of this.players) {
        const index = player.hand.findIndex((card) => card.id === player.selected);
        const card = player.hand.splice(index, 1)[0];
        const entry = { ...card, ownerId: player.id, round: this.round, value: null, flipped: false };
        player.display.push(entry);
        player.selected = null;
        played.push(entry);
      }
      this.revealedThisRound = played.map((card) => ({ ownerId: card.ownerId, key: card.key }));
      this.resolutionQueue = played.sort((a, b) => CARD_MAP[a.key].value - CARD_MAP[b.key].value || a.ownerId - b.ownerId);
      this.phase = "resolve";
      this.say(`四张牌同时展示：${played.map((card) => `${card.ownerId}号${this.nameOf(card.key)}`).join("、")}。`);
      return true;
    }

    optionsForOlder(filter = () => true) {
      return this.players.flatMap((player) => player.display
        .filter((card) => card.round < this.round && filter(player, card))
        .map((card) => ({ id: card.id, label: `${player.id}号 · ${this.nameOf(card.key)} (${this.signed(card.value)})`, image: CARD_MAP[card.key].image, ownerId: player.id })));
    }

    signed(value) { return value > 0 ? `+${value}` : String(value); }

    bossOptions(repeated) {
      const count = {};
      this.bossDisplay.forEach((card) => { count[card.key] = (count[card.key] || 0) + 1; });
      return this.bossDisplay.filter((card) => repeated ? count[card.key] > 1 : count[card.key] === 1)
        .map((card) => ({ id: card.id, label: `重铸【${this.bossName(card.key)}】`, image: BOSS_MAP[card.key].image }));
    }

    requestChoice(choice) {
      if (!choice.options.length) return false;
      this.pendingChoice = choice;
      this.phase = "choice";
      if (this.player(choice.actorId).isAI) this.choose(this.aiOption(choice));
      return true;
    }

    aiOption(choice) {
      if (choice.kind === "reclaim") {
        return choice.options.slice().sort((a, b) => this.findDisplayed(a.id).card.value - this.findDisplayed(b.id).card.value)[0].id;
      }
      if (choice.kind === "discard") {
        return choice.options.slice().sort((a, b) => {
          const aCard = this.findDisplayed(a.id);
          const bCard = this.findDisplayed(b.id);
          const aBenefit = aCard.player.id === choice.actorId ? -aCard.card.value : aCard.card.value;
          const bBenefit = bCard.player.id === choice.actorId ? -bCard.card.value : bCard.card.value;
          return bBenefit - aBenefit;
        })[0].id;
      }
      if (choice.kind === "recast") {
        const sword = choice.options.find((option) => this.bossDisplay.find((card) => card.id === option.id)?.key === "gudingdao");
        return (sword || choice.options[0]).id;
      }
      return choice.options[0].id;
    }

    findDisplayed(cardId) {
      for (const player of this.players) {
        const index = player.display.findIndex((card) => card.id === cardId);
        if (index !== -1) return { player, card: player.display[index], index };
      }
      return null;
    }

    resolveNext() {
      if (this.phase !== "resolve" || !this.resolutionQueue.length) return false;
      const entry = this.resolutionQueue.shift();
      this.activeCard = entry;
      const actor = this.player(entry.ownerId);
      const value = this.cardValue(entry);
      entry.value = value;
      this.say(`${actor.id} 号玩家的【${this.nameOf(entry.key)}】结算，计 ${this.signed(value)} 勾玉。`);

      let choice = null;
      if (entry.key === "caochong" && this.bossDeck.length) {
        this.protectedThisRound = true;
        this.say("仁心生效：本回合大宝不会击杀玩家。");
      } else if (entry.key === "caoang") {
        choice = { kind: "recast", actorId: actor.id, options: this.bossOptions(false), prompt: "慷慨：选择一张未重复的大宝牌重铸" };
      } else if (entry.key === "youpangtong") {
        choice = { kind: "reclaim", actorId: actor.id, options: this.optionsForOlder((player) => player.id === actor.id), prompt: "漫卷：收回自己一张旧展示牌" };
      } else if (entry.key === "shenganning") {
        choice = { kind: "discard", actorId: actor.id, options: this.optionsForOlder(), prompt: "劫营：弃置一张旧展示牌" };
      } else if (entry.key === "shenlusu") {
        const options = this.optionsForOlder((player) => player.id !== actor.id);
        if (new Set(options.map((option) => option.ownerId)).size >= 2) {
          choice = { kind: "swap-first", actorId: actor.id, options, prompt: "榻谟：先选第一名其他玩家的一张旧展示牌" };
        }
      } else if (entry.key === "wenyang") {
        choice = { kind: "recast", actorId: actor.id, options: this.bossOptions(true), prompt: "却敌：选择一张重复的大宝牌重铸" };
      } else if (entry.key === "caomao") {
        this.bossDrawCount = 2;
        this.say("决进生效：本轮大宝会翻开两张牌。");
      }
      if (choice && this.requestChoice(choice)) return true;
      if (choice) this.say(`${CARD_MAP[entry.key].skill}没有可选目标。`);
      this.finishResolution();
      return true;
    }

    choose(optionId) {
      const choice = this.pendingChoice;
      if (!choice || !choice.options.some((option) => String(option.id) === String(optionId))) return false;
      if (choice.kind === "recast") {
        const index = this.bossDisplay.findIndex((card) => card.id === optionId);
        const oldCard = this.bossDisplay.splice(index, 1)[0];
        this.bossDeck.push(oldCard);
        const replacement = this.bossDeck.shift();
        this.bossDisplay.push(replacement);
        this.recastEvent = {
          actorId: choice.actorId,
          sourceKey: this.activeCard?.key || null,
          oldKey: oldCard.key,
          newKey: replacement.key,
          sameCard: oldCard.id === replacement.id,
          deckRemaining: this.bossDeck.length,
        };
        this.say(`${choice.actorId} 号重铸【${this.bossName(oldCard.key)}】，翻出【${this.bossName(replacement.key)}】。`);
      } else if (choice.kind === "reclaim") {
        const found = this.findDisplayed(optionId);
        found.player.display.splice(found.index, 1);
        found.player.hand.push({ id: found.card.id, key: found.card.key });
        this.say(`${choice.actorId} 号收回【${this.nameOf(found.card.key)}】。`);
      } else if (choice.kind === "discard") {
        const found = this.findDisplayed(optionId);
        this.cardEffectEvent = {
          kind: "discard",
          actorId: choice.actorId,
          targetId: found.player.id,
          cards: found.player.display.map((card) => ({ id: card.id, key: card.key })),
          selectedId: found.card.id,
          selectedKey: found.card.key,
        };
        found.player.display.splice(found.index, 1);
        this.discard.push(found.card);
        this.say(`${choice.actorId} 号弃置了 ${found.player.id} 号的【${this.nameOf(found.card.key)}】。`);
      } else if (choice.kind === "swap-first") {
        const found = this.findDisplayed(optionId);
        const options = this.optionsForOlder((player) => player.id !== choice.actorId && player.id !== found.player.id);
        this.pendingChoice = { kind: "swap-second", actorId: choice.actorId, firstId: optionId, options, prompt: `榻谟：选择另一名玩家的一张旧展示牌，与 ${found.player.id} 号交换` };
        if (this.player(choice.actorId).isAI) this.choose(this.aiOption(this.pendingChoice));
        return true;
      } else if (choice.kind === "swap-second") {
        const first = this.findDisplayed(choice.firstId);
        const second = this.findDisplayed(optionId);
        this.cardEffectEvent = {
          kind: "swap",
          actorId: choice.actorId,
          firstPlayerId: first.player.id,
          secondPlayerId: second.player.id,
          firstCards: first.player.display.map((card) => ({ id: card.id, key: card.key })),
          secondCards: second.player.display.map((card) => ({ id: card.id, key: card.key })),
          firstId: first.card.id,
          secondId: second.card.id,
          firstKey: first.card.key,
          secondKey: second.card.key,
        };
        first.player.display[first.index] = second.card;
        second.player.display[second.index] = first.card;
        first.card.ownerId = second.player.id;
        second.card.ownerId = first.player.id;
        this.say(`${choice.actorId} 号交换了 ${first.player.id} 号的【${this.nameOf(first.card.key)}】与 ${second.player.id} 号的【${this.nameOf(second.card.key)}】，点数保持不变。`);
      }
      this.pendingChoice = null;
      this.finishResolution();
      return true;
    }

    checkScoreVictory(preferredId) {
      const order = this.players.slice().sort((a, b) => (a.id === preferredId ? -1 : b.id === preferredId ? 1 : a.id - b.id));
      const winner = order.find((player) => this.score(player) >= 11);
      if (!winner) return false;
      this.end("kill", [winner.id], `${winner.id} 号玩家达到 ${this.score(winner)} 勾玉，击败大宝！`);
      return true;
    }

    finishResolution() {
      if (this.checkScoreVictory(this.activeCard.ownerId)) return;
      this.activeCard = null;
      this.phase = this.resolutionQueue.length ? "resolve" : "ready-boss";
    }

    bossStage() {
      if (this.phase !== "ready-boss") return false;
      const revealed = [];
      for (let i = 0; i < this.bossDrawCount && this.bossDeck.length; i += 1) {
        const card = this.bossDeck.shift();
        this.bossDisplay.push(card);
        revealed.push(this.bossName(card.key));
      }
      this.say(revealed.length ? `大宝出手：翻出${revealed.map((name) => `【${name}】`).join("、")}。` : "大宝牌堆已空，本轮没有新牌。");
      const types = new Set(this.bossDisplay.map((card) => card.key));
      if (["sha", "jiu", "gudingdao"].every((key) => types.has(key))) {
        if (this.protectedThisRound) {
          this.say("大宝凑齐三种牌，但仁心使本回合玩家免于击杀。");
        } else {
          const lowest = Math.min(...this.players.map((player) => this.score(player)));
          const winners = this.players.filter((player) => this.score(player) === lowest).map((player) => player.id);
          this.end("boss", winners, `大宝凑齐【酒】【杀】【古锭刀】；战斗力最低的 ${winners.map((id) => `${id} 号`).join("、")}玩家获胜。`);
          return true;
        }
      }
      if (!types.has("gudingdao")) {
        for (const player of this.players) {
          for (const card of player.display) {
            if (card.key !== "quyi" || card.round !== this.round || card.flipped) continue;
            card.value = 2;
            card.flipped = true;
            this.say(`${player.id} 号的【麹义】自动倒置，战斗力改为 +2。`);
            if (this.checkScoreVictory(player.id)) return true;
          }
        }
      }
      this.phase = "ready-next";
      return true;
    }
  }

  const api = { Game, CARDS, CARD_MAP, BOSS_CARDS, BOSS_MAP, outcomeFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.DabaoKill = api;
})(typeof window !== "undefined" ? window : globalThis);
