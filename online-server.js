"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Game } = require("./game.js");

const ROOT = __dirname;
const ROOM_LIFETIME = 2 * 60 * 60 * 1000;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const PUBLIC_FILES = new Set(["index.html", "online.html", "style.css", "online.css", "game.js", "online.js", "app.js", "asset-loader.js", "audio.js", "result-scene.js", "kill-scene.js", "boss-flip-scene.js", "player-flip-scene.js", "skill-scene.js", "card-effect-scene.js"]);
const ASSET_DIRS = new Set(["picture", "voice", "video"]);
PUBLIC_FILES.add("online-config.js");
PUBLIC_FILES.add("online-scenes.js");
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".mp4": "video/mp4", ".wav": "audio/wav",
};

function codeForRoom() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[crypto.randomInt(ROOM_ALPHABET.length)]).join("");
}

// The journal contains only already-public actions, never hands or deck order.
function presentationGame(random, humans = 4) {
  const game = new Game("online", random, humans);
  game.events = [];
  game.emitScene = (type, data = {}) => game.events.push({ id: game.events.length + 1, round: game.round, type, ...JSON.parse(JSON.stringify(data)) });
  let lastRecast, lastEffect;
  const effects = () => {
    if (game.recastEvent && game.recastEvent !== lastRecast) {
      lastRecast = game.recastEvent; game.emitScene("recast", { data: lastRecast });
    }
    if (game.cardEffectEvent && game.cardEffectEvent !== lastEffect) {
      lastEffect = game.cardEffectEvent; game.emitScene("effect", { data: lastEffect });
    }
  };
  for (const method of ["reveal", "resolveNext", "choose", "bossStage"]) {
    const original = game[method].bind(game);
    game[method] = (...args) => {
      if (method === "resolveNext" && game.phase === "resolve" && game.resolutionQueue.length) {
        const { key, ownerId } = game.resolutionQueue[0];
        game.emitScene("skill", { entry: { key, ownerId } });
      }
      const previousBoss = new Set(game.bossDisplay.map(card => card.id));
      const accepted = original(...args);
      if (accepted && method === "reveal") game.emitScene("reveal", { cards: game.revealedThisRound });
      if (accepted && method === "bossStage") game.emitScene("boss", { cards: game.bossDisplay.filter(card => !previousBoss.has(card.id)), remaining: game.bossDeck.length });
      effects();
      return accepted;
    };
  }
  return game;
}

function recordResult(game) {
  if (game.events && game.phase === "ended" && !game.events.some(event => event.type === "result")) {
    if (game.result.kind === "boss") game.emitScene("kill");
    game.emitScene("result", { result: game.result, players: game.players.map(player => ({ id: player.id, score: game.score(player), pendingValue: game.pendingScore(player) })) });
  }
}

function advanceGame(game) {
  for (let step = 0; step < 16; step += 1) {
    if (game.phase === "ready-reveal") game.reveal();
    else if (game.phase === "resolve") game.resolveNext();
    else if (game.phase === "ready-boss") game.bossStage();
    else if (game.phase === "ready-next") game.startRound();
    else { recordResult(game); return; }
  }
  throw new Error("对局自动结算超过预期步数");
}

function publicState(room, seat) {
  const game = room.game;
  return {
    code: room.code,
    playerId: seat.id,
    seats: room.seats.map((entry) => entry.id),
    version: room.version,
    status: game ? "playing" : "waiting",
    events: game?.events || [],
    ...(game ? {
      round: game.round,
      phase: game.phase,
      players: game.players.map((player) => ({
        id: player.id,
        isAI: player.isAI,
        score: game.score(player),
        handCount: player.hand.length,
        hand: player.id === seat.id ? player.hand.map((card) => ({ ...card })) : undefined,
        selected: Boolean(player.selected),
        display: player.display.map((card) => ({ ...card })),
      })),
      playerDeckCount: game.playerDeck.length,
      bossDeckCount: game.bossDeck.length,
      bossDisplay: game.bossDisplay.map((card) => ({ ...card })),
      pendingChoice: game.pendingChoice ? {
        actorId: game.pendingChoice.actorId,
        prompt: game.pendingChoice.prompt,
        options: game.pendingChoice.actorId === seat.id ? game.pendingChoice.options.map((option) => ({ ...option })) : [],
      } : null,
      result: game.result,
      log: game.log.slice(0, 18),
    } : {}),
  };
}

function createRoomStore(random = () => crypto.randomInt(0x100000000) / 0x100000000) {
  const rooms = new Map();

  function find(code) {
    const room = rooms.get(String(code).toUpperCase());
    if (!room) throw Object.assign(new Error("房间不存在或已过期"), { status: 404 });
    room.touchedAt = Date.now();
    return room;
  }

  function authenticate(room, token) {
    const seat = room.seats.find((entry) => entry.token === token);
    if (!seat) throw Object.assign(new Error("席位凭证无效，请重新加入房间"), { status: 403 });
    return seat;
  }

  function addSeat(room) {
    if (room.game || room.seats.length >= 4) throw Object.assign(new Error("房间已经满员"), { status: 409 });
    const seat = { id: room.seats.length + 1, token: crypto.randomBytes(24).toString("hex") };
    room.seats.push(seat);
    if (room.seats.length === 4) {
      room.game = presentationGame(random);
      advanceGame(room.game);
    }
    room.version += 1;
    return { token: seat.token, state: publicState(room, seat) };
  }

  return {
    rooms,
    create() {
      if (rooms.size >= 500) throw Object.assign(new Error("房间数量已达上限，请稍后再试"), { status: 503 });
      let code;
      do { code = codeForRoom(); } while (rooms.has(code));
      const room = { code, seats: [], game: null, version: 0, touchedAt: Date.now() };
      rooms.set(code, room);
      return addSeat(room);
    },
    join(code) { return addSeat(find(code)); },
    state(code, token) {
      const room = find(code);
      return publicState(room, authenticate(room, token));
    },
    act(code, token, action) {
      const room = find(code);
      const seat = authenticate(room, token);
      const game = room.game;
      if (!game && action?.type === "start" && action.fillAI === true && seat.id === 1 && room.seats.length >= 2) {
        room.game = presentationGame(random, room.seats.length);
        advanceGame(room.game);
        room.version += 1;
        return publicState(room, seat);
      }
      if (!game) throw Object.assign(new Error("等待四位玩家入座"), { status: 409 });
      let accepted = false;
      if (action?.type === "select" && Number.isSafeInteger(action.cardId)) {
        accepted = game.selectCard(seat.id, action.cardId);
      } else if (action?.type === "reselect") {
        accepted = game.reselectCard(seat.id);
      } else if (action?.type === "choose" && Number.isSafeInteger(action.optionId)
        && game.pendingChoice?.actorId === seat.id) {
        accepted = game.choose(action.optionId);
      }
      if (!accepted) throw Object.assign(new Error("当前无法执行这个操作，战局可能已更新"), { status: 409 });
      advanceGame(game);
      room.version += 1;
      return publicState(room, seat);
    },
    cleanup(now = Date.now()) {
      for (const [code, room] of rooms) if (now - room.touchedAt > ROOM_LIFETIME) rooms.delete(code);
    },
  };
}

function json(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  response.end(JSON.stringify(data));
}

async function bodyOf(request) {
  let data = "";
  for await (const chunk of request) {
    data += chunk;
    if (data.length > 4096) throw Object.assign(new Error("请求内容过长"), { status: 413 });
  }
  try { return data ? JSON.parse(data) : {}; }
  catch { throw Object.assign(new Error("请求格式错误"), { status: 400 }); }
}

async function serveFile(response, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  if (relative.includes("\\") || relative.includes(":")) {
    json(response, 404, { error: "文件不存在" });
    return;
  }
  const parts = relative.split("/");
  if (!PUBLIC_FILES.has(relative) && !(ASSET_DIRS.has(parts[0]) && parts.length >= 2 && parts.every((part) => part && part !== "." && part !== ".."))) {
    json(response, 404, { error: "文件不存在" });
    return;
  }
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep)) {
    json(response, 404, { error: "文件不存在" });
    return;
  }
  try {
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) throw new Error("Not a file");
    response.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "X-Content-Type-Options": "nosniff" });
    fs.createReadStream(file).pipe(response);
  } catch { json(response, 404, { error: "文件不存在" }); }
}

function createServer(store = createRoomStore()) {
  return http.createServer(async (request, response) => {
    // Public bearer-token API: clients never authenticate with cookies.
    // Permit browsers, packaged desktop clients and local HTML to share a service.
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Room-Token");
    if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
    try {
      const url = new URL(request.url, "http://localhost");
      const match = /^\/api\/rooms\/([A-Z2-9]{6})(?:\/(join|action))?$/i.exec(url.pathname);
      if (request.method === "GET" && url.pathname === "/api/health") {
        json(response, 200, { service: "dabaokill", status: "ok" });
      } else if (request.method === "POST" && url.pathname === "/api/rooms") {
        await bodyOf(request);
        json(response, 201, store.create());
      } else if (match && request.method === "POST" && match[2] === "join") {
        await bodyOf(request);
        json(response, 201, store.join(match[1]));
      } else if (match && request.method === "GET" && !match[2]) {
        json(response, 200, store.state(match[1], request.headers["x-room-token"]));
      } else if (match && request.method === "POST" && match[2] === "action") {
        json(response, 200, store.act(match[1], request.headers["x-room-token"], await bodyOf(request)));
      } else if (request.method === "GET" && !url.pathname.startsWith("/api/")) {
        await serveFile(response, url.pathname);
      } else json(response, 404, { error: "接口不存在" });
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, { error: error.status ? error.message : "服务器处理失败" });
      if (!error.status) console.error(error);
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "0.0.0.0";
  const store = createRoomStore();
  createServer(store).listen(port, host, () => console.log(`DabaoKill online: http://localhost:${port}/online.html`));
  setInterval(() => store.cleanup(), 10 * 60 * 1000).unref();
}

module.exports = { createRoomStore, createServer, advanceGame, publicState };
