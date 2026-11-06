import test from "node:test";
import assert from "node:assert/strict";
import { io as connect } from "socket.io-client";
import { createGameServer } from "../app.js";
import { SURVIVAL_RULES, WEAPONS, ZOMBIES } from "../../public/shared/catalog.js";

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

test("real clients can share zombie survival without leaking waves, scores, or combat across rooms and modes", { timeout: 15000 }, async (t) => {
  const game = createGameServer();
  await new Promise((resolve) => game.httpServer.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${game.httpServer.address().port}`;
  const clients = await Promise.all(Array.from({ length: 4 }, () => client(url)));
  const [alice, bob, cara, dan] = clients;
  t.after(async () => { for (const socket of clients) socket.disconnect(); await game.close(); });
  for (const [index, socket] of clients.entries()) {
    assert.equal((await request(socket, "lobby:login", { name: ["Alice", "Bob", "Cara", "Dan"][index], character: "vanguard" })).ok, true);
  }
  let room;
  let arena;
  let publicSurvival;
  const otherEvents = [];
  const otherStates = [];
  cara.on("game:event", (event) => otherEvents.push(event));
  dan.on("game:event", (event) => otherEvents.push(event));
  cara.on("game:state", (state) => otherStates.push(state));
  dan.on("game:state", (state) => otherStates.push(state));

  await t.test("invalid modes and squad sizes cannot create or join rooms", async () => {
    const originalCount = game.lobby.rooms.size;
    const denied = await request(alice, "room:quick-join", { serverId: "outpost", mode: "godmode", character: "vanguard" });
    assert.equal(denied.ok, false);
    assert.match(denied.error, /valid game mode/);
    const invalid = await request(alice, "room:create", { serverId: "outpost", mode: null, name: "Bad mode", capacity: 2, character: "vanguard" });
    assert.equal(invalid.ok, false);
    const tooBig = await request(alice, "room:create", { serverId: "outpost", mode: "zombies", name: "Too many survivors", capacity: 5, character: "vanguard" });
    assert.equal(tooBig.ok, false);
    assert.equal(game.lobby.rooms.size, originalCount);
    assert.equal(game.io.sockets.sockets.get(alice.id).data.roomId, undefined);
  });

  await t.test("private invites select the room's mode, and quick play isolates PvP and other zombie rooms", async () => {
    const created = await request(alice, "room:create", { serverId: "outpost", mode: "zombies", name: "Private survival", capacity: 2, private: true, character: "vanguard" });
    assert.equal(created.ok, true);
    room = created.state.room;
    arena = game.lobby.getRoom(room.id);
    assert.equal(created.state.mode, "zombies");
    assert.equal(created.state.survival.phase, "preparing");
    const joined = await request(bob, "room:join-code", { code: room.code, mode: "arena", character: "recon" });
    assert.equal(joined.ok, true);
    assert.equal(joined.state.room.mode, "zombies", "client mode cannot override an invite");
    assert.equal(joined.state.players.length, 2);
    const pvp = await request(cara, "room:quick-join", { serverId: "outpost", mode: "arena", character: "sentinel" });
    const coop = await request(dan, "room:quick-join", { serverId: "outpost", mode: "zombies", character: "medic" });
    assert.equal(pvp.state.room.mode, "arena");
    assert.equal(pvp.state.survival, null);
    assert.equal(coop.state.room.mode, "zombies");
    assert.notEqual(coop.state.room.id, room.id);
    publicSurvival = game.lobby.getRoom(coop.state.room.id);
    const list = await request(cara, "lobby:list");
    assert.equal(list.rooms.length, 6);
    assert.ok(!list.rooms.some((item) => item.id === room.id));
  });

  await t.test("the shared scheduler sends room-tagged zombie waves and room-only chat", async () => {
    const first = waitFor(alice, "game:state", (state) => state.survival?.phase === "active");
    const second = waitFor(bob, "game:state", (state) => state.survival?.phase === "active");
    const wave = waitFor(alice, "game:event", (event) => event.type === "wave-start");
    arena.survival.nextWaveAt = Date.now();
    const state = await first;
    assert.equal(state.roomId, room.id);
    assert.equal(state.survival.wave, 1);
    assert.equal(state.survival.total, SURVIVAL_RULES.baseCount + SURVIVAL_RULES.extraPerPlayer);
    assert.ok(state.zombies.length);
    assert.equal((await second).survival.total, state.survival.total);
    assert.equal((await wave).roomId, room.id);
    assert.deepEqual((await waitFor(cara, "game:state")).zombies, []);
    assert.equal((await waitFor(dan, "game:state")).survival.wave, 0);
    const text = "Stay together, squad <script>literal text</script>";
    const message = waitFor(bob, "room:message", (item) => item.text === text);
    const outsiders = [];
    const listener = (item) => outsiders.push(item);
    cara.on("room:message", listener);
    dan.on("room:message", listener);
    assert.equal((await request(alice, "room:chat", { text })).ok, true);
    assert.equal((await message).roomId, room.id);
    await waitFor(dan, "game:state");
    assert.deepEqual(outsiders, []);
    cara.off("room:message", listener);
    dan.off("room:message", listener);
  });

  await t.test("authoritative shots ignore teammate collision and forged client damage/wave/score", async () => {
    const shooter = arena.players.get(alice.id);
    const ally = arena.players.get(bob.id);
    Object.assign(shooter, { x: 300, y: 250, angle: 0, shieldUntil: 0 });
    Object.assign(ally, { x: 380, y: 250, shieldUntil: 0 });
    arena.zombies.clear();
    const zombie = { id: arena.nextId("zombie"), kind: "walker", x: 480, y: 250,
      health: 5, maxHealth: ZOMBIES.walker.health, radius: ZOMBIES.walker.radius, speed: 0, angle: 0, moving: false, nextAttackAt: Date.now() + 10000 };
    arena.zombies.set(zombie.id, zombie);
    arena.survival.pending = 1;
    arena.survival.nextSpawnAt = Date.now() + 60000;
    const hit = waitFor(alice, "game:event", (event) => event.type === "zombie-kill" && event.zombieId === zombie.id);
    alice.emit("game:input", { shoot: true, angle: 0, x: 999999, y: 999999, damage: 999999, score: 999999, wave: 100, zombies: [] });
    const killed = await hit;
    alice.emit("game:input", { shoot: false, angle: 0 });
    assert.equal(killed.byId, alice.id);
    assert.equal(killed.roomId, room.id);
    assert.equal(shooter.kills, 1);
    assert.ok(shooter.ammo < WEAPONS.carbine.magazine);
    assert.equal(shooter.x, 300);
    assert.equal(ally.health, ally.maxHealth);
    assert.equal(ally.kills, 0);
    assert.equal(arena.survival.wave, 1);
    assert.equal(arena.survival.score, ZOMBIES.walker.score);
    assert.equal(publicSurvival.survival.score, 0);
    const repeatedJoin = await request(alice, "room:join", { roomId: room.id, mode: "arena", character: "vanguard" });
    assert.equal(repeatedJoin.state.mode, "zombies");
    assert.equal(repeatedJoin.state.players.find((player) => player.id === alice.id).kills, 1);
    assert.ok(otherEvents.every((event) => event.roomId !== room.id));
    assert.ok(otherStates.every((state) => state.roomId !== room.id));
  });

  await t.test("downed teammates return only when the wave clears, with shared scores and resupply", async () => {
    const shooter = arena.players.get(alice.id);
    const ally = arena.players.get(bob.id);
    arena.setInput(alice.id, {}, Date.now());
    const down = waitFor(bob, "game:state", (state) => !state.players.find((player) => player.id === bob.id).alive);
    arena.damage(ally, { owner: "zombie-test", damage: 999, source: "zombie", name: "Brute" }, Date.now());
    assert.equal((await down).survival.phase, "active");
    const denied = await request(bob, "game:respawn");
    assert.equal(denied.ok, false);
    assert.match(denied.error, /automatically returns/);
    Object.assign(shooter, { health: 45, weapon: "shotgun", ammo: 1, reserve: 0 });
    const back = waitFor(bob, "game:state", (state) => state.survival.phase === "intermission" && state.players.every((player) => player.alive));
    const clear = waitFor(alice, "game:event", (event) => event.type === "wave-clear");
    arena.zombies.clear();
    arena.survival.pending = 0;
    const state = await back;
    assert.equal((await clear).roomId, room.id);
    assert.equal(state.survival.score, ZOMBIES.walker.score + SURVIVAL_RULES.waveBonus);
    assert.equal(state.players.find((player) => player.id === alice.id).health, 85);
    assert.equal(state.players.find((player) => player.id === alice.id).ammo, WEAPONS.shotgun.magazine);
    assert.equal(state.players.find((player) => player.id === bob.id).deaths, 1);
  });

  await t.test("mode switching and reconnect-style rejoining clean up only the former room", async () => {
    const switched = await request(bob, "room:quick-join", { serverId: "foundry", mode: "arena", character: "vanguard" });
    assert.equal(switched.state.mode, "arena");
    assert.deepEqual(switched.state.zombies, []);
    assert.equal(arena.players.size, 1);
    alice.disconnect();
    await waitFor(dan, "game:state");
    assert.equal(arena.players.size, 0);
    assert.equal(arena.zombies.size, 0);
    assert.equal(arena.survival.score, 0);
    assert.equal(publicSurvival.players.size, 1);
    const replacement = await client(url);
    clients.push(replacement);
    await request(replacement, "lobby:login", { name: "Alice", character: "medic" });
    const rejoined = await request(replacement, "room:join-code", { code: room.code, character: "medic" });
    assert.equal(rejoined.ok, true);
    assert.equal(rejoined.state.mode, "zombies");
    assert.equal(rejoined.state.survival.phase, "preparing");
    assert.equal(rejoined.state.survival.wave, 0);
    assert.equal(rejoined.state.survival.score, 0);
    assert.equal(rejoined.state.players.length, 1);
    assert.notEqual(rejoined.playerId, alice.id);
    assert.equal((await waitFor(cara, "game:state")).mode, "arena");
  });
});
