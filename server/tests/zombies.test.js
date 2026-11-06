import test from "node:test";
import assert from "node:assert/strict";
import { Arena, isBlocked } from "../GameLogic/arena.js";
import { Lobby } from "../lobby.js";
import { CHARACTERS, MAPS, MODES, RULES, SERVERS, SURVIVAL_RULES, WEAPONS, ZOMBIES } from "../../public/shared/catalog.js";

function fixture(map = "outpost", character = "vanguard") {
  let time = 10000;
  const arena = new Arena({ id: `survival-${map}`, name: "Survival test", map, mode: "zombies", capacity: 4 }, { now: () => time, random: () => 0.5 });
  const player = arena.addPlayer({ id: "one", name: "Survivor One", character });
  arena.takeEvents();
  return { arena, player, survival: arena.survival, now: () => time,
    advance(ms, dt = ms / 1000) { time += ms; arena.tick(time, dt); } };
}

function enemy(f, { kind = "walker", x = 400, y = 250, health = ZOMBIES[kind].health } = {}) {
  const definition = ZOMBIES[kind];
  const zombie = { id: f.arena.nextId("zombie"), kind, x, y, health, maxHealth: definition.health,
    speed: definition.speed, radius: definition.radius, angle: 0, moving: false, nextAttackAt: 0 };
  f.arena.zombies.set(zombie.id, zombie);
  f.survival.phase = "active";
  f.survival.wave = Math.max(1, f.survival.wave);
  f.survival.total = f.arena.zombies.size;
  f.survival.pending = 0;
  return zombie;
}

test("each map has separate persistent PvP and cooperative pools, with validated mode-specific capacities", () => {
  const lobby = new Lobby();
  assert.equal(lobby.rooms.size, SERVERS.length * MODES.length);
  for (const server of SERVERS) {
    const pvp = lobby.quickRoom(server.id);
    const coop = lobby.quickRoom(server.id, "zombies");
    assert.notEqual(pvp.room.id, coop.room.id);
    assert.equal(pvp.room.mode, "arena");
    assert.equal(pvp.room.capacity, server.maxPlayers);
    assert.equal(coop.room.mode, "zombies");
    assert.equal(coop.room.capacity, 4);
    coop.addPlayer({ id: `${server.id}-survivor`, name: "Survivor", character: "medic" });
    assert.equal(lobby.quickRoom(server.id, "arena"), pvp);
    assert.equal(lobby.quickRoom(server.id, "zombies"), coop);
  }
  const solo = lobby.createRoom({ serverId: "citadel", mode: "zombies", name: "Solo survival", capacity: 1 });
  assert.equal(solo.room.capacity, 1);
  for (const mode of [null, "zombie", "godmode", {}, true]) {
    assert.throws(() => lobby.createRoom({ serverId: "outpost", mode, name: "Invalid mode", capacity: 2 }), /valid game mode/);
    assert.throws(() => lobby.quickRoom("outpost", mode), /valid game mode/);
  }
  for (const capacity of [0, 5, 16, "4", 1.5]) {
    assert.throws(() => lobby.createRoom({ serverId: "outpost", mode: "zombies", name: "Invalid size", capacity }), /room size/);
  }
  assert.throws(() => lobby.createRoom({ serverId: "outpost", mode: "arena", name: "Solo PvP", capacity: 1 }), /room size/);
  assert.equal(lobby.summary().rooms.filter((room) => room.mode === "zombies").length, 4);
});

test("survivor drop pads and horde portals are safe on every colorful map", () => {
  assert.equal(new Set(Object.values(MAPS).map((map) => map.terrain.floor)).size, 3);
  assert.equal(new Set(CHARACTERS.map((character) => character.kit.armor)).size, 4);
  for (const map of Object.values(MAPS)) {
    for (const point of map.survivorSpawnPoints) assert.equal(isBlocked(map, point.x, point.y), false);
    for (const point of map.zombieSpawnPoints) assert.equal(isBlocked(map, point.x, point.y, ZOMBIES.brute.radius), false);
    const f = fixture(map.id);
    for (let index = 2; index <= 4; index += 1) f.arena.addPlayer({ id: String(index), name: `Survivor ${index}`, character: "recon" });
    const players = [...f.arena.players.values()];
    assert.equal(new Set(players.map((player) => `${player.x},${player.y}`)).size, 4);
    assert.ok(players.every((player) => player.y === map.survivorSpawnPoints[0].y));
  }
});

test("solo survival begins after preparation, spawns at a bounded pace, and counts incoming hostiles", () => {
  const f = fixture();
  assert.equal(f.arena.snapshot().mode, "zombies");
  assert.equal(f.survival.phase, "preparing");
  f.advance(SURVIVAL_RULES.preparation - 1, 0);
  assert.equal(f.arena.zombies.size, 0);
  f.advance(1, 0);
  assert.equal(f.survival.wave, 1);
  assert.equal(f.survival.phase, "active");
  assert.equal(f.arena.zombies.size, 1);
  assert.equal(f.arena.snapshot().survival.remaining, SURVIVAL_RULES.baseCount);
  const zombie = [...f.arena.zombies.values()][0];
  assert.ok(Math.hypot(zombie.x - f.player.x, zombie.y - f.player.y) >= SURVIVAL_RULES.minSpawnDistance);
  f.advance(SURVIVAL_RULES.spawnInterval - 1, 0);
  assert.equal(f.arena.zombies.size, 1);
  f.advance(1, 0);
  assert.equal(f.arena.zombies.size, 2);
  const state = f.arena.snapshot(f.now(), true);
  assert.equal(state.room.mode, "zombies");
  assert.ok(state.map.terrain);
  assert.equal(state.zombies[0].nextAttackAt, undefined);
  assert.equal(state.zombies[0].speed, undefined);
});

test("waves scale to squad size, add runners and brutes, and cap total and simultaneous enemies", () => {
  const f = fixture();
  f.arena.addPlayer({ id: "two", name: "Survivor Two", character: "recon" });
  f.survival.startWave(f.now());
  assert.equal(f.survival.total, SURVIVAL_RULES.baseCount + SURVIVAL_RULES.extraPerPlayer);
  f.survival.wave = 2;
  f.survival.startWave(f.now());
  f.survival.spawnZombie(f.now());
  f.survival.spawnZombie(f.now());
  assert.ok([...f.arena.zombies.values()].some((zombie) => zombie.kind === "runner"));
  f.arena.zombies.clear();
  f.survival.wave = 4;
  f.survival.startWave(f.now());
  f.survival.spawnZombie(f.now());
  assert.equal([...f.arena.zombies.values()][0].kind, "brute");
  f.survival.wave = 1000;
  f.survival.startWave(f.now());
  assert.equal(f.survival.total, SURVIVAL_RULES.maxPerWave);
  f.arena.zombies.clear();
  for (let index = 0; index < SURVIVAL_RULES.maxAlive; index += 1) enemy(f, { x: 200 + index * 50, y: 250 });
  f.survival.pending = 20;
  f.advance(50, 0);
  assert.equal(f.arena.zombies.size, SURVIVAL_RULES.maxAlive);
  assert.equal(f.survival.pending, 20);
});

test("co-op bullets pass through teammates and damage only the first zombie along their path", () => {
  const f = fixture();
  const ally = f.arena.addPlayer({ id: "two", name: "Survivor Two", character: "medic" });
  Object.assign(f.player, { x: 100, y: 250, shieldUntil: 0 });
  Object.assign(ally, { x: 250, y: 250, shieldUntil: 0 });
  const first = enemy(f, { x: 350, y: 250 });
  const behind = enemy(f, { x: 480, y: 250 });
  f.arena.bullets = [{ id: "test-bullet", owner: f.player.id, x: 100, y: 250, vx: 10000, vy: 0, damage: 20, remaining: 1000 }];
  f.arena.moveBullets(f.now(), 0.06);
  assert.equal(ally.health, ally.maxHealth);
  assert.equal(first.health, ZOMBIES.walker.health - 20);
  assert.equal(behind.health, ZOMBIES.walker.health);
  f.arena.damage(ally, { owner: f.player.id, damage: 999 }, f.now());
  assert.equal(ally.health, ally.maxHealth, "friendly fire is also blocked at the damage boundary");
});

test("fast bullets cannot hit zombies through walls, and duplicate hits cannot score a dead enemy twice", () => {
  const f = fixture();
  const zombie = enemy(f, { x: 820, y: 450 });
  f.arena.bullets = [{ id: "cover", owner: f.player.id, x: 400, y: 450, vx: 10000, vy: 0, damage: 999, remaining: 2000 }];
  f.arena.moveBullets(f.now(), 0.06);
  assert.equal(zombie.health, zombie.maxHealth);
  f.survival.damage(zombie, { owner: f.player.id, damage: 999 });
  f.survival.damage(zombie, { owner: f.player.id, damage: 999 });
  assert.equal(f.player.kills, 1);
  assert.equal(f.survival.kills, 1);
  assert.equal(f.survival.score, ZOMBIES.walker.score);
  assert.equal(f.arena.zombies.size, 0);
  assert.equal(f.arena.takeEvents().filter((event) => event.type === "zombie-kill").length, 1);
});

test("enemy melee honors spawn shields, attack intervals, and nearby living targets", () => {
  const f = fixture();
  const ally = f.arena.addPlayer({ id: "two", name: "Survivor Two", character: "recon" });
  Object.assign(f.player, { x: 200, y: 250, shieldUntil: f.now() + 200 });
  Object.assign(ally, { x: 800, y: 250, shieldUntil: 0 });
  const zombie = enemy(f, { x: 235, y: 250 });
  f.advance(50, 0);
  assert.equal(f.player.health, f.player.maxHealth);
  assert.equal(ally.health, ally.maxHealth);
  f.advance(ZOMBIES.walker.attackInterval, 0);
  assert.equal(f.player.health, f.player.maxHealth - ZOMBIES.walker.damage);
  const health = f.player.health;
  f.advance(ZOMBIES.walker.attackInterval - 1, 0);
  assert.equal(f.player.health, health);
  f.advance(1, 0);
  assert.equal(f.player.health, health - ZOMBIES.walker.damage);
  f.player.alive = false;
  zombie.nextAttackAt = 0;
  const x = zombie.x;
  f.advance(50);
  assert.ok(zombie.x > x, "the zombie retargets the remaining live teammate");
});

test("zombies navigate around cover without crossing walls on all three maps", () => {
  const routes = { outpost: [350, 450, 850, 450], foundry: [350, 400, 850, 400], citadel: [580, 500, 820, 500] };
  for (const [map, [x, y, targetX, targetY]] of Object.entries(routes)) {
    const f = fixture(map);
    Object.assign(f.player, { x: targetX, y: targetY, shieldUntil: Infinity });
    const zombie = enemy(f, { x, y });
    for (let tick = 0; tick < 600; tick += 1) {
      f.advance(1000 / RULES.tickRate);
      assert.equal(isBlocked(f.arena.map, zombie.x, zombie.y, zombie.radius), false, `${map} zombie crossed cover`);
    }
    assert.ok(Math.hypot(zombie.x - targetX, zombie.y - targetY) < 55, `${map} zombie stuck at ${zombie.x},${zombie.y}`);
  }
});

test("a zombie cannot attack through cover even when a target is within melee reach", () => {
  const f = fixture();
  // A thin test barrier isolates the melee ray check from pathfinding.
  f.arena.map = { ...f.arena.map, walls: [{ x: 220, y: 250, width: 4, height: 100 }] };
  Object.assign(f.player, { x: 244, y: 250, shieldUntil: 0 });
  enemy(f, { x: 196, y: 250 });
  f.advance(50, 0);
  assert.equal(f.player.health, f.player.maxHealth);
  assert.ok(!f.arena.takeEvents().some((event) => event.type === "zombie-attack"));
});

test("wave clearance restores teammates and supplies, preserves run scores, and delays the next wave", () => {
  const f = fixture();
  const ally = f.arena.addPlayer({ id: "two", name: "Survivor Two", character: "recon" });
  Object.assign(f.player, { x: 100, y: 250, health: 45, weapon: "shotgun", ammo: 1, reserve: 0, kills: 3 });
  Object.assign(ally, { alive: false, health: 0, deaths: 1 });
  f.survival.phase = "active";
  f.survival.wave = 2;
  f.survival.score = 300;
  f.survival.pending = 0;
  f.arena.pickups[0].active = false;
  f.advance(50, 0);
  assert.equal(f.survival.phase, "intermission");
  assert.equal(f.survival.wavesCleared, 2);
  assert.equal(f.survival.score, 300 + 2 * SURVIVAL_RULES.waveBonus);
  assert.equal(f.player.health, 85);
  assert.equal(f.player.weapon, "shotgun");
  assert.equal(f.player.ammo, WEAPONS.shotgun.magazine);
  assert.equal(f.player.reserve, WEAPONS.shotgun.magazine * 2);
  assert.equal(f.player.kills, 3);
  assert.equal(ally.alive, true);
  assert.equal(ally.deaths, 1);
  assert.equal(ally.ammo, WEAPONS.smg.magazine);
  assert.ok(f.arena.pickups.every((pickup) => pickup.active));
  f.advance(SURVIVAL_RULES.waveBreak - 1, 0);
  assert.equal(f.survival.wave, 2);
  f.advance(1, 0);
  assert.equal(f.survival.wave, 3);
});

test("occupied survivor pads cannot break automatic reinsertion", () => {
  const f = fixture();
  Object.assign(f.player, { x: 1120, y: 180 });
  const second = f.arena.addPlayer({ id: "two", name: "Survivor Two", character: "recon" });
  Object.assign(second, { x: 1280, y: 180 });
  const third = f.arena.addPlayer({ id: "three", name: "Survivor Three", character: "medic" });
  assert.equal(isBlocked(f.arena.map, third.x, third.y), false);
  assert.ok(f.arena.map.spawnPoints.some((point) => point.x === third.x && point.y === third.y));
});

test("fallen survivors cannot manually respawn during a wave or use forged inputs to reset scores", () => {
  const f = fixture();
  f.arena.addPlayer({ id: "two", name: "Survivor Two", character: "sentinel" });
  enemy(f);
  f.player.shieldUntil = 0;
  f.arena.damage(f.player, { owner: "zombie-test", damage: 999, source: "zombie", name: "Brute" }, f.now());
  f.advance(RULES.respawnDelay + 1, 0);
  assert.equal(f.survival.phase, "active");
  assert.throws(() => f.arena.respawn(f.player.id, f.now()), /automatically returns/);
  assert.equal(f.player.alive, false);
  f.arena.setInput("two", { score: 999999, wave: 100, zombies: [], health: 999999, damage: 999999 }, f.now());
  assert.equal(f.survival.wave, 1);
  assert.equal(f.survival.score, 0);
  assert.equal(f.arena.zombies.size, 1);
  assert.equal(f.arena.takeEvents().find((event) => event.type === "elimination").killerName, "Brute");
});

test("squad wipes end a run once, late joins cannot cancel defeat, and automatic restarts reset the squad", () => {
  const f = fixture();
  enemy(f);
  f.survival.score = 700;
  f.survival.wavesCleared = 1;
  f.player.shieldUntil = 0;
  f.player.kills = 4;
  f.arena.damage(f.player, { owner: "zombie-test", damage: 999, source: "zombie", name: "Walker" }, f.now());
  f.advance(50, 0);
  assert.equal(f.survival.phase, "gameover");
  const nextRunAt = f.survival.nextWaveAt;
  const late = f.arena.addPlayer({ id: "two", name: "Late Survivor", character: "medic" });
  assert.equal(late.alive, false);
  assert.equal(f.survival.nextWaveAt, nextRunAt);
  f.advance(SURVIVAL_RULES.restartDelay - 1, 0);
  assert.equal(f.player.alive, false);
  assert.equal(f.arena.takeEvents().filter((event) => event.type === "survival-over").length, 1);
  f.advance(1, 0);
  assert.equal(f.survival.run, 2);
  assert.equal(f.survival.phase, "preparing");
  assert.equal(f.survival.score, 0);
  assert.equal(f.survival.wave, 0);
  assert.equal(f.arena.zombies.size, 0);
  assert.ok([...f.arena.players.values()].every((player) => player.alive && player.kills === 0 && player.deaths === 0));
  assert.equal(f.arena.snapshot().survival.nextWaveIn, SURVIVAL_RULES.preparation);
});

test("survival is not reset by the PvP round timer, and leaving the last survivor clears all horde state", () => {
  const f = fixture();
  enemy(f);
  f.survival.score = 900;
  f.player.kills = 9;
  f.advance(RULES.roundSeconds * 1000, 0);
  assert.equal(f.survival.score, 900);
  assert.equal(f.player.kills, 9);
  assert.equal(f.arena.round, 1);
  assert.ok(!f.arena.takeEvents().some((event) => event.type === "round"));
  f.arena.removePlayer(f.player.id);
  assert.equal(f.arena.zombies.size, 0);
  assert.equal(f.survival.wave, 0);
  assert.equal(f.survival.score, 0);
  f.arena.addPlayer({ id: "new", name: "Fresh Survivor", character: "vanguard" });
  assert.equal(f.survival.phase, "preparing");
  assert.equal(f.arena.snapshot().survival.nextWaveIn, SURVIVAL_RULES.preparation);
  const pvp = new Arena({ id: "pvp", name: "PvP", map: "outpost", capacity: 2 });
  pvp.addPlayer({ id: "pvp-one", name: "PvP One", character: "vanguard" });
  pvp.tick(f.now());
  assert.deepEqual(pvp.snapshot().zombies, []);
  assert.equal(pvp.snapshot().survival, null);
});

test("a living survivor leaving a downed squad ends that run without leaking stale navigation targets", () => {
  const f = fixture();
  const ally = f.arena.addPlayer({ id: "two", name: "Survivor Two", character: "recon" });
  enemy(f);
  f.player.shieldUntil = 0;
  f.arena.damage(f.player, { owner: "zombie-test", damage: 999 }, f.now());
  f.arena.removePlayer(ally.id);
  assert.equal(f.survival.phase, "gameover");
  f.arena.removePlayer(f.player.id);
  assert.equal(f.survival.navigation.fields.size, 0);
  assert.equal(f.arena.zombies.size, 0);
});
