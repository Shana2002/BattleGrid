import test from "node:test";
import assert from "node:assert/strict";
import { Arena, isBlocked, normalizeInput } from "../GameLogic/arena.js";
import { Lobby, validateProfile } from "../lobby.js";
import { CHARACTERS, MAPS, RULES, WEAPONS } from "../../public/shared/catalog.js";

function fixture(character = "vanguard") {
  let time = 10000;
  const arena = new Arena({ id: "test", name: "Test room", map: "outpost", capacity: 16 }, { now: () => time, random: () => 0.5 });
  const player = arena.addPlayer({ id: "one", name: "Player One", character });
  arena.takeEvents();
  return { arena, player, now: () => time, advance(ms, dt = ms / 1000) { time += ms; arena.tick(time, dt); } };
}

test("guest profiles validate names and operator IDs", () => {
  assert.deepEqual(validateProfile({ name: "  Hello   World  ", character: "recon" }), { name: "Hello World", character: "recon" });
  assert.equal(validateProfile({ name: "José", character: "medic" }).name, "José");
  for (const name of ["a", "<script>alert(1)</script>", "x".repeat(21), ""]) {
    assert.throws(() => validateProfile({ name, character: "vanguard" }));
  }
  assert.throws(() => validateProfile({ name: "Ghost", character: "invincible" }));
});

test("inputs accept only booleans and finite aim; coordinates cannot be supplied", () => {
  assert.equal(normalizeInput(null), null);
  assert.equal(normalizeInput([]), null);
  const input = normalizeInput({ up: true, right: "true", angle: Infinity, x: 99999, damage: 999 });
  assert.equal(input.up, true);
  assert.equal(input.right, false);
  assert.equal(input.angle, 0);
  assert.equal(input.x, undefined);
  assert.equal(input.damage, undefined);
});

test("all operators spawn safely with their own loadouts, and pickups are immediately seeded", () => {
  for (const character of CHARACTERS) {
    const { arena, player } = fixture(character.id);
    assert.equal(player.maxHealth, character.health);
    assert.equal(player.weapon, character.weapon);
    assert.equal(player.ammo, WEAPONS[character.weapon].magazine);
    assert.equal(isBlocked(arena.map, player.x, player.y), false);
    assert.ok(arena.pickups.length > 8);
    assert.equal(new Set(arena.pickups.map((item) => item.id)).size, arena.pickups.length);
  }
});

test("diagonal movement is normalized and stale inputs stop movement", () => {
  const straight = fixture();
  const diagonal = fixture();
  const origin = { x: straight.player.x, y: straight.player.y };
  straight.arena.setInput("one", { right: true }, straight.now());
  diagonal.arena.setInput("one", { right: true, down: true }, diagonal.now());
  straight.advance(50);
  diagonal.advance(50);
  const a = Math.hypot(straight.player.x - origin.x, straight.player.y - origin.y);
  const b = Math.hypot(diagonal.player.x - origin.x, diagonal.player.y - origin.y);
  assert.ok(Math.abs(a - b) < 0.0001);
  const x = straight.player.x;
  straight.advance(RULES.inputTimeout + 1);
  assert.equal(straight.player.x, x);
});

test("every map has collision-free spawn points and room-tagged snapshots", () => {
  for (const map of Object.values(MAPS)) {
    for (const point of map.spawnPoints) assert.equal(isBlocked(map, point.x, point.y), false, `${map.name} spawn ${point.x},${point.y}`);
    const arena = new Arena({ id: map.id, name: "Map test", map: map.id, capacity: 2 });
    arena.addPlayer({ id: "one", name: "Player One", character: "vanguard" });
    assert.equal(arena.snapshot().roomId, map.id);
  }
});

test("server collisions stop movement through walls and map boundaries", () => {
  const f = fixture();
  f.player.x = 425;
  f.player.y = 450;
  f.arena.setInput("one", { right: true }, f.now());
  f.advance(50);
  assert.equal(f.player.x, 425);
  f.player.x = RULES.playerRadius;
  f.player.y = 200;
  f.arena.setInput("one", { left: true }, f.now());
  f.advance(50);
  assert.equal(f.player.x, RULES.playerRadius);
});

test("sprint is bounded by energy and disables shooting", () => {
  const f = fixture("recon");
  const x = f.player.x;
  f.arena.setInput("one", { right: true, sprint: true, shoot: true }, f.now());
  f.advance(50);
  assert.ok(f.player.x - x > CHARACTERS[1].speed * 0.05);
  assert.ok(f.player.stamina < 100);
  assert.equal(f.arena.bullets.length, 0);
  f.player.stamina = 0;
  f.arena.setInput("one", { right: true, sprint: true }, f.now());
  f.advance(50);
  assert.equal(f.player.sprinting, false);
});

test("shots use server positions, consume ammo, and enforce weapon fire rate", () => {
  const f = fixture();
  f.arena.setInput("one", { shoot: true, angle: 0, x: 99999, y: 99999 }, f.now());
  f.advance(50);
  const shot = f.arena.takeEvents().find((event) => event.type === "shot");
  assert.equal(shot.x, f.player.x);
  assert.equal(shot.y, f.player.y);
  assert.equal(f.player.ammo, WEAPONS.carbine.magazine - 1);
  f.advance(20);
  assert.equal(f.player.ammo, WEAPONS.carbine.magazine - 1);
  const damage = f.arena.bullets[0].damage;
  f.player.weapon = "lmg";
  assert.equal(f.arena.bullets[0].damage, damage);
  assert.equal(f.player.shieldUntil, 0);
});

test("empty magazines reload from finite reserves", () => {
  const f = fixture();
  f.player.ammo = 0;
  f.player.reserve = 5;
  f.arena.shoot(f.player, f.now());
  assert.equal(f.player.reloadUntil, f.now() + WEAPONS.carbine.reload);
  f.advance(WEAPONS.carbine.reload, 0);
  assert.equal(f.player.ammo, 5);
  assert.equal(f.player.reserve, 0);
  assert.equal(f.player.reloadUntil, 0);
});

test("spawn shields, elimination scores, and delayed respawning are authoritative", () => {
  const f = fixture();
  const killer = f.arena.addPlayer({ id: "two", name: "Player Two", character: "sentinel" });
  f.arena.damage(f.player, { owner: killer.id, damage: 200 }, f.now());
  assert.equal(f.player.alive, true);
  f.advance(RULES.spawnProtection + 1, 0);
  f.arena.damage(f.player, { owner: killer.id, damage: 200 }, f.now());
  assert.equal(f.player.alive, false);
  assert.equal(f.player.deaths, 1);
  assert.equal(killer.kills, 1);
  assert.throws(() => f.arena.respawn(f.player.id, f.now()), /not ready/);
  f.advance(RULES.respawnDelay, 0);
  f.arena.respawn(f.player.id, f.now());
  assert.equal(f.player.alive, true);
  assert.equal(f.player.health, f.player.maxHealth);
  assert.equal(f.player.deaths, 1);
  assert.ok(f.player.shieldUntil > f.now());
});

test("fast bullets cannot tunnel through players or hit players behind cover", () => {
  const f = fixture();
  const target = f.arena.addPlayer({ id: "two", name: "Target", character: "vanguard" });
  target.shieldUntil = 0;
  target.x = 700;
  target.y = 450;
  f.arena.bullets = [{ id: "wall", owner: "one", x: 430, y: 450, vx: 15000, vy: 0, damage: 20, remaining: 2000 }];
  f.arena.moveBullets(f.now(), 0.06);
  assert.equal(target.health, target.maxHealth);
  assert.equal(f.arena.bullets.length, 0);
  target.x = 300;
  target.y = 250;
  f.arena.bullets = [{ id: "target", owner: "one", x: 100, y: 250, vx: 5000, vy: 0, damage: 20, remaining: 2000 }];
  f.arena.moveBullets(f.now(), 0.06);
  assert.equal(target.health, target.maxHealth - 20);
});

test("medic recovery and health pickups never exceed maximum health", () => {
  const f = fixture("medic");
  f.player.health = f.player.maxHealth - 0.1;
  f.player.lastDamageAt = f.now() - 6100;
  f.advance(60);
  assert.equal(f.player.health, f.player.maxHealth);
  const health = f.arena.pickups.find((item) => item.type === "health");
  f.player.x = health.x;
  f.player.y = health.y;
  f.arena.collectPickups(f.player, f.now());
  assert.equal(health.active, true);
  f.player.health = 30;
  f.arena.collectPickups(f.player, f.now());
  assert.equal(f.player.health, 70);
  assert.equal(health.active, false);
  f.player.x = 200;
  f.player.y = 200;
  f.advance(RULES.pickupRespawn, 0);
  assert.equal(health.active, true);
});

test("five-minute rounds reset scores and loadouts without removing participants", () => {
  const f = fixture();
  f.player.kills = 8;
  f.player.deaths = 3;
  f.advance(RULES.roundSeconds * 1000, 0);
  assert.equal(f.arena.round, 2);
  assert.equal(f.player.kills, 0);
  assert.equal(f.player.deaths, 0);
  assert.equal(f.arena.players.size, 1);
  assert.equal(f.arena.takeEvents().find((event) => event.type === "round").leaders[0].kills, 8);
});

test("room state is isolated, private rooms require codes, and empty custom rooms expire", () => {
  let now = 10000;
  const lobby = new Lobby({ now: () => now });
  const privateRoom = lobby.createRoom({ serverId: "outpost", name: "Private squad", capacity: 2, private: true });
  privateRoom.addPlayer({ id: "one", name: "Player One", character: "recon" });
  assert.equal(lobby.summary().rooms.length, 6);
  assert.equal(lobby.getByCode(privateRoom.room.code.toLowerCase()), privateRoom);
  assert.equal(lobby.quickRoom("outpost").players.size, 0);
  assert.throws(() => lobby.createRoom({ serverId: "outpost", name: "Too big", capacity: 99 }));
  privateRoom.removePlayer("one");
  now += RULES.roomIdleTimeout + 1;
  assert.equal(lobby.cleanup(now), true);
  assert.throws(() => lobby.getByCode(privateRoom.room.code), /No room/);
  assert.equal(lobby.rooms.size, 6);
});
