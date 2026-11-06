import test from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../app.js";
import { WEAPONS } from "../../public/shared/catalog.js";

const request = (socket, event, data = {}) => new Promise((resolve, reject) => {
  socket.timeout(3000).emit(event, data, (error, response) => error ? reject(error) : resolve(response));
});
const waitFor = (socket, event, predicate = () => true) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timed out waiting for ${event}`)); }, 3000);
  const listener = (data) => {
    if (predicate(data)) { clearTimeout(timer); socket.off(event, listener); resolve(data); }
  };
  socket.on(event, listener);
});
const client = (url) => new Promise((resolve, reject) => {
  const socket = connect(url, { transports: ["websocket"], forceNew: true, reconnection: false });
  socket.once("connect", () => resolve(socket));
  socket.once("connect_error", (error) => { socket.disconnect(); reject(error); });
});

test("real Socket.IO clients can log in, share isolated rooms, chat, and leave", { timeout: 15000 }, async (t) => {
  const game = createGameServer();
  await new Promise((resolve) => game.httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${game.httpServer.address().port}`;
  const clients = await Promise.all(Array.from({ length: 4 }, () => client(url)));
  const [alice, bob, cara, dan] = clients;
  t.after(async () => { for (const socket of clients) socket.disconnect(); await game.close(); });
  let room;

  await t.test("HTTP endpoints and guest login prerequisites", async () => {
    assert.equal((await fetch(`${url}/api/health`)).status, 200);
    const home = await (await fetch(url)).text();
    assert.ok(home.includes("login-screen"));
    assert.equal((await fetch(`${url}/shared/catalog.js`)).status, 200);
    const denied = await request(alice, "room:quick-join", { serverId: "outpost", character: "vanguard" });
    assert.equal(denied.ok, false);
    const names = ["Alice", "Bob", "Cara", "Dan"];
    for (const [index, socket] of clients.entries()) {
      const result = await request(socket, "lobby:login", { name: names[index], character: "vanguard" });
      assert.equal(result.ok, true);
      assert.equal(result.servers.length, 3);
    }
  });

  await t.test("private room creation, invite joining, and full-room protection", async () => {
    const created = await request(alice, "room:create", { serverId: "outpost", name: "Private squad", capacity: 2, private: true, character: "medic", persistent: true });
    assert.equal(created.ok, true);
    room = created.state.room;
    assert.equal(room.persistent, false, "clients cannot create permanent rooms");
    assert.ok(created.state.pickups.length);
    const joined = await request(bob, "room:join-code", { code: room.code, character: "recon" });
    assert.equal(joined.ok, true);
    assert.equal(joined.state.players.length, 2);
    const full = await request(dan, "room:join-code", { code: room.code, character: "sentinel" });
    assert.equal(full.ok, false);
    assert.match(full.error, /full/);
    const list = await request(dan, "lobby:list");
    assert.ok(!list.rooms.some((item) => item.id === room.id));
  });

  await t.test("other rooms cannot receive private state or room chat", async () => {
    const publicRoom = await request(cara, "room:quick-join", { serverId: "foundry", character: "sentinel" });
    assert.equal(publicRoom.ok, true);
    assert.notEqual(publicRoom.state.room.id, room.id);
    const privateState = await waitFor(alice, "game:state", (state) => state.players.length === 2);
    assert.deepEqual(new Set(privateState.players.map((player) => player.id)), new Set([alice.id, bob.id]));
    const publicState = await waitFor(cara, "game:state");
    assert.equal(publicState.players.length, 1);
    const message = "Hello, private squad <b>not HTML</b>";
    const a = waitFor(alice, "room:message", (data) => data.text === message);
    const b = waitFor(bob, "room:message", (data) => data.text === message);
    const otherMessages = [];
    const listener = (data) => otherMessages.push(data);
    cara.on("room:message", listener);
    assert.equal((await request(alice, "room:chat", { text: message })).ok, true);
    assert.equal((await a).name, "Alice");
    assert.equal((await b).text, message);
    await waitFor(cara, "game:state");
    assert.equal(otherMessages.length, 0);
    cara.off("room:message", listener);
  });

  await t.test("malformed movement cannot teleport, and joining twice cannot heal/reset a player", async () => {
    const arena = game.lobby.getRoom(room.id);
    const player = arena.players.get(alice.id);
    const x = player.x;
    const y = player.y;
    alice.emit("game:input", { right: true, shoot: true, angle: 0, x: 999999, y: 999999 });
    await waitFor(alice, "game:state", (state) => state.players.find((item) => item.id === alice.id).x > x);
    assert.ok(player.x < x + 100);
    assert.equal(player.y, y);
    player.health = 60;
    player.kills = 2;
    const again = await request(alice, "room:join", { roomId: room.id, character: "medic" });
    const unchanged = again.state.players.find((item) => item.id === alice.id);
    assert.equal(unchanged.health, 60);
    assert.equal(unchanged.kills, 2);
    assert.ok(unchanged.ammo < WEAPONS.carbine.magazine);
  });

  await t.test("leaving and disconnecting remove only the relevant room participant", async () => {
    const afterLeave = waitFor(alice, "game:state", (state) => state.players.length === 1);
    assert.equal((await request(bob, "room:leave")).ok, true);
    assert.equal((await afterLeave).players[0].id, alice.id);
    const lobbyChanged = waitFor(dan, "lobby:update", (data) => data.servers.find((server) => server.id === "outpost").players === 0);
    alice.disconnect();
    await lobbyChanged;
    assert.equal(game.lobby.getRoom(room.id).players.size, 0);
    assert.equal((await waitFor(cara, "game:state")).players.length, 1);
  });
});
