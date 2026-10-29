"use strict";

const assert = require("node:assert/strict");
const { createRoomStore, createServer } = require("./online-server.js");

async function main() {
  const store = createRoomStore(() => 0.5);
  const server = createServer(store);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const send = async (method, pathname, body, token) => {
    const response = await fetch(origin + pathname, {
      method,
      headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(token ? { "X-Room-Token": token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const preflight = await fetch(origin + "/api/rooms", { method: "OPTIONS", headers: { Origin: "https://hsniubi.github.io", "Access-Control-Request-Headers": "content-type,x-room-token" } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    const page = await fetch(origin + "/online.html");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /online\.js/);
    const health = await send("GET", "/api/health");
    assert.equal(health.body.service, "dabaokill");
    const home = await (await fetch(origin + "/")).text();
    for (const [, script] of home.matchAll(/<script src="([^"]+)"/g)) {
      const asset = await fetch(origin + "/" + script);
      assert.equal(asset.status, 200, `Home page script must be served: ${script}`);
    }
    assert.equal((await fetch(origin + "/online-server.js")).status, 404, "Server source is not a public asset");
    assert.equal((await fetch(origin + "/picture/..%5Conline-server.js")).status, 404, "Encoded Windows separators must not expose server files");

    const first = (await send("POST", "/api/rooms", {})).body;
    const code = first.state.code;
    assert.match(code, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(first.state.status, "waiting");
    const seats = [first];
    for (let i = 0; i < 3; i += 1) seats.push((await send("POST", `/api/rooms/${code}/join`, {})).body);
    assert.deepEqual(seats.map((seat) => seat.state.playerId), [1, 2, 3, 4]);
    assert.equal(seats[3].state.status, "playing");
    assert.equal((await send("POST", `/api/rooms/${code}/join`, {})).status, 409);

    const snapshot = async (index) => (await send("GET", `/api/rooms/${code}`, null, seats[index].token)).body;
    const playerOne = await snapshot(0);
    const playerTwo = await snapshot(1);
    assert.equal(playerOne.players[0].hand.length, 3);
    assert.equal(playerOne.players[1].hand, undefined);
    assert.equal(playerTwo.players[0].hand, undefined);
    assert.equal(playerTwo.players[1].hand.length, 3);
    assert.equal(playerOne.playerDeck, undefined);
    assert.equal(playerOne.bossDeck, undefined);
    assert.equal((await send("GET", `/api/rooms/${code}`, null, "invalid")).status, 403);

    const firstCard = playerOne.players[0].hand[0].id;
    assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "select", cardId: firstCard }, seats[1].token)).status, 409);
    assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "select", cardId: firstCard }, seats[0].token)).status, 200);
    assert.equal((await snapshot(1)).players[0].selected, true);
    assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "select", cardId: firstCard }, seats[0].token)).status, 409);
    assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "reselect" }, seats[1].token)).status, 409);
    assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "reselect" }, seats[0].token)).status, 200);
    assert.equal((await snapshot(1)).players[0].selected, false);

    for (let i = 0; i < 4; i += 1) {
      const own = await snapshot(i);
      const cardId = own.players[i].hand[0].id;
      assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "select", cardId }, seats[i].token)).status, 200);
    }
    const afterReveal = await snapshot(0);
    assert.match(afterReveal.log.join(" "), /四张牌同时展示/);
    assert.ok(afterReveal.players.every((player) => player.display.length === 1));
    assert.ok(["select", "choice", "ended"].includes(afterReveal.phase));
    if (afterReveal.phase === "choice") {
      const actorId = afterReveal.pendingChoice.actorId;
      const actor = await snapshot(actorId - 1);
      const optionId = actor.pendingChoice.options[0].id;
      const otherId = actorId === 1 ? 2 : 1;
      assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "choose", optionId }, seats[otherId - 1].token)).status, 409);
      assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "choose", optionId }, seats[actorId - 1].token)).status, 200);
    }

    let finished = false;
    for (let turn = 0; turn < 100; turn += 1) {
      const current = await snapshot(0);
      if (current.phase === "ended") { finished = true; break; }
      if (current.phase === "choice") {
        const actorIndex = current.pendingChoice.actorId - 1;
        const actorState = await snapshot(actorIndex);
        const optionId = actorState.pendingChoice.options[0].id;
        assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "choose", optionId }, seats[actorIndex].token)).status, 200);
      } else {
        assert.equal(current.phase, "select");
        const index = current.players.findIndex((player) => !player.selected);
        const own = await snapshot(index);
        assert.equal((await send("POST", `/api/rooms/${code}/action`, { type: "select", cardId: own.players[index].hand[0].id }, seats[index].token)).status, 200);
      }
    }
    assert.equal(finished, true, "A four-player match should reach a result without manual server steps");

    for (const humans of [2, 3]) {
      const host = store.create();
      const roomCode = host.state.code;
      assert.throws(() => store.act(roomCode, host.token, { type: "start", fillAI: true }));
      const members = [host];
      for (let i = 1; i < humans; i++) members.push(store.join(roomCode));
      assert.throws(() => store.act(roomCode, members[1].token, { type: "start", fillAI: true }));
      assert.throws(() => store.act(roomCode, host.token, { type: "start" }));
      let current = store.act(roomCode, host.token, { type: "start", fillAI: true });
      assert.equal(current.players.length, 4);
      assert.equal(current.players.filter((p) => p.isAI).length, 4 - humans);
      assert.ok(current.players.filter((p) => p.isAI).every((p) => !p.hand));
      assert.throws(() => store.join(roomCode));
      for (let step = 0; step < 200 && current.phase !== "ended"; step++) {
        const actorId = current.phase === "choice" ? current.pendingChoice.actorId : current.players.find((p) => !p.isAI && !p.selected).id;
        assert.ok(actorId <= humans, "AI skills must resolve automatically");
        const token = members[actorId - 1].token;
        const own = store.state(roomCode, token);
        current = store.act(roomCode, token, own.phase === "choice" ? { type: "choose", optionId: own.pendingChoice.options[0].id } : { type: "select", cardId: own.players[actorId - 1].hand[0].id });
      }
      assert.equal(current.phase, "ended", `${humans} humans plus AI must finish a full game`);
    }

    store.cleanup(Date.now() + 2 * 60 * 60 * 1000 + 1000);
    assert.equal((await send("GET", `/api/rooms/${code}`, null, seats[0].token)).status, 404);
    console.log("online room, four seats, hidden hands, turn actions and cleanup: ok");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
