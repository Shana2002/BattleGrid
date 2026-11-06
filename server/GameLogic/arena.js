import { MAPS, RULES, WEAPONS, getCharacter, getMode } from "../../public/shared/catalog.js";
import { clamp, distanceSquared, isBlocked, segmentCircle, segmentRectangle } from "./collision.js";
import { Survival } from "./zombies.js";

export { isBlocked } from "./collision.js";

export function normalizeInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return {
    up: raw.up === true, down: raw.down === true,
    left: raw.left === true, right: raw.right === true,
    shoot: raw.shoot === true, sprint: raw.sprint === true, reload: raw.reload === true,
    angle: Number.isFinite(raw.angle) ? raw.angle % (Math.PI * 2) : 0,
  };
}

export class Arena {
  constructor(room, { now = Date.now, random = Math.random } = {}) {
    if (!getMode(room.mode ?? "arena")) throw new Error("Choose a valid game mode.");
    this.room = { ...room, mode: room.mode ?? "arena" };
    this.map = MAPS[room.map];
    this.now = now;
    this.random = random;
    this.players = new Map();
    this.zombies = new Map();
    this.bullets = [];
    this.pickups = [];
    this.events = [];
    this.counter = 0;
    this.round = 1;
    this.roundStartedAt = now();
    this.survival = this.room.mode === "zombies" ? new Survival(this) : null;
    this.seedPickups();
  }

  nextId(prefix) {
    return `${prefix}-${++this.counter}`;
  }

  seedPickups() {
    this.pickups = this.map.pickupPoints.filter((point) => !isBlocked(this.map, point.x, point.y, 22))
      .map((point, index) => ({
        ...point, id: this.nextId("pickup"),
        type: index % 4 === 0 ? "health" : index % 4 === 2 ? "weapon" : "ammo",
        weapon: ["carbine", "smg", "shotgun", "lmg"][Math.floor(index / 4) % 4],
        active: true, respawnAt: 0,
      }));
  }

  spawnPoint() {
    const alive = [...this.players.values()].filter((player) => player.alive);
    const threats = this.survival ? [...this.zombies.values()] : alive;
    const points = !this.survival ? this.map.spawnPoints : this.zombies.size ?
      [...this.map.survivorSpawnPoints, ...this.map.spawnPoints] : this.map.survivorSpawnPoints;
    let available = points.filter((point) => !isBlocked(this.map, point.x, point.y) &&
      (!this.survival || alive.every((player) => distanceSquared(point, player) > 48 ** 2)));
    // Moving teammates can occupy multiple drop pads. Never fail a wave's reinsertion.
    if (!available.length && this.survival) {
      available = this.map.spawnPoints.filter((point) => !isBlocked(this.map, point.x, point.y) &&
        alive.every((player) => distanceSquared(point, player) > 48 ** 2));
    }
    const ranked = available.map((point) => ({
      point,
      distance: threats.length ? Math.min(...threats.map((player) => distanceSquared(point, player))) : this.random(),
    })).sort((a, b) => b.distance - a.distance);
    if (!ranked.length) throw new Error("This map has no safe spawn points.");
    return { ...ranked[0].point };
  }

  addPlayer(profile) {
    const character = getCharacter(profile.character);
    if (!character) throw new Error("Choose a valid operator.");
    if (this.players.size >= this.room.capacity) throw new Error("This room is full. Try another room.");
    if (!this.players.size) {
      this.roundStartedAt = this.now();
      this.round = 1;
      this.bullets = [];
      this.survival?.reset(this.now());
      this.seedPickups();
    }
    const player = {
      id: profile.id, name: profile.name, character: character.id,
      kills: 0, deaths: 0, streak: 0, input: normalizeInput({}), lastInputAt: 0,
    };
    this.players.set(player.id, player);
    this.spawn(player, this.now(), this.survival?.phase !== "gameover");
    return player;
  }

  spawn(player, now, alive = true) {
    const character = getCharacter(player.character);
    const weapon = WEAPONS[character.weapon];
    Object.assign(player, this.spawnPoint(), {
      alive, health: alive ? character.health : 0, maxHealth: character.health,
      weapon: character.weapon, ammo: weapon.magazine, reserve: weapon.reserve,
      angle: 0, moving: false, sprinting: false, stamina: 100,
      lastShotAt: -Infinity, lastDamageAt: now, reloadUntil: 0,
      shieldUntil: alive ? now + RULES.spawnProtection : 0, respawnAt: 0,
      input: normalizeInput({}), lastInputAt: 0,
    });
    if (alive) this.events.push({ type: "spawn", playerId: player.id, x: player.x, y: player.y });
  }

  removePlayer(id) {
    this.players.delete(id);
    this.bullets = this.bullets.filter((bullet) => bullet.owner !== id);
    if (!this.players.size) this.survival?.reset(this.now());
    else this.survival?.checkDefeat(this.now());
  }

  setInput(id, raw, now = this.now()) {
    const player = this.players.get(id);
    const input = normalizeInput(raw);
    if (!player || !input || !player.alive) return;
    player.input = input;
    player.lastInputAt = now;
  }

  reload(player, now) {
    const weapon = WEAPONS[player.weapon];
    if (player.reloadUntil || player.ammo >= weapon.magazine || player.reserve <= 0) return;
    player.reloadUntil = now + weapon.reload;
    this.events.push({ type: "reload", playerId: player.id });
  }

  shoot(player, now) {
    const weapon = WEAPONS[player.weapon];
    if (!player.alive || player.reloadUntil || now - player.lastShotAt < weapon.interval) return;
    if (player.ammo <= 0) {
      this.reload(player, now);
      return;
    }
    player.ammo -= 1;
    player.lastShotAt = now;
    // Firing ends spawn protection, so protected players cannot deal free damage.
    player.shieldUntil = 0;
    for (let index = 0; index < weapon.pellets; index += 1) {
      const angle = player.angle + (this.random() - 0.5) * weapon.spread;
      this.bullets.push({
        id: this.nextId("bullet"), owner: player.id,
        x: player.x, y: player.y, vx: Math.cos(angle) * weapon.speed, vy: Math.sin(angle) * weapon.speed,
        angle, damage: weapon.damage, remaining: weapon.range,
      });
    }
    this.events.push({ type: "shot", playerId: player.id, x: player.x, y: player.y, angle: player.angle, weapon: player.weapon });
  }

  damage(player, bullet, now) {
    if (!player.alive || now < player.shieldUntil) return;
    if (this.survival && this.players.has(bullet.owner)) return;
    player.health = Math.max(0, player.health - bullet.damage);
    player.lastDamageAt = now;
    this.events.push({ type: "hit", playerId: player.id, byId: bullet.owner, x: player.x, y: player.y, damage: bullet.damage });
    if (player.health > 0) return;
    player.alive = false;
    player.moving = false;
    player.sprinting = false;
    player.deaths += 1;
    player.streak = 0;
    player.reloadUntil = 0;
    player.input = normalizeInput({});
    player.respawnAt = now + RULES.respawnDelay;
    const killer = !this.survival ? this.players.get(bullet.owner) : null;
    if (killer) {
      killer.kills += 1;
      killer.streak += 1;
    }
    this.events.push({
      type: "elimination", playerId: player.id, byId: bullet.owner,
      playerName: player.name, killerName: bullet.source === "zombie" ? bullet.name : killer?.name ?? "Unknown",
      source: bullet.source ?? "player",
      x: player.x, y: player.y,
    });
  }

  respawn(id, now = this.now()) {
    const player = this.players.get(id);
    if (!player) throw new Error("You are not in this match.");
    if (this.survival) throw new Error("Your squad automatically returns between waves or when a new survival run begins.");
    if (player.alive) throw new Error("You are already in the match.");
    if (now < player.respawnAt) throw new Error("Reinsertion is not ready yet.");
    this.spawn(player, now);
  }

  moveBullets(now, dt) {
    const remaining = [];
    for (const bullet of this.bullets) {
      const start = { x: bullet.x, y: bullet.y };
      const next = { x: bullet.x + bullet.vx * dt, y: bullet.y + bullet.vy * dt };
      let firstHit = null;
      let hitTarget = null;
      let zombieHit = false;
      for (const wall of this.map.walls) {
        const hit = segmentRectangle(start, next, wall);
        if (hit !== null && (firstHit === null || hit < firstHit)) firstHit = hit;
      }
      const targets = this.survival ? this.zombies.values() : this.players.values();
      for (const target of targets) {
        if (this.survival ? target.health <= 0 : !target.alive || target.id === bullet.owner) continue;
        const hit = segmentCircle(start, next, target, this.survival ? target.radius + 3 : 24);
        if (hit !== null && (firstHit === null || hit < firstHit)) {
          firstHit = hit;
          hitTarget = target;
          zombieHit = Boolean(this.survival);
        }
      }
      if (firstHit !== null) {
        if (hitTarget) {
          if (zombieHit) this.survival.damage(hitTarget, bullet);
          else this.damage(hitTarget, bullet, now);
        }
        this.events.push({
          type: "impact", x: start.x + (next.x - start.x) * firstHit,
          y: start.y + (next.y - start.y) * firstHit, playerHit: Boolean(hitTarget && !zombieHit), zombieHit,
        });
        continue;
      }
      Object.assign(bullet, next);
      bullet.remaining -= Math.hypot(bullet.vx * dt, bullet.vy * dt);
      if (bullet.remaining > 0 && !isBlocked({ ...this.map, walls: [] }, bullet.x, bullet.y, 0)) remaining.push(bullet);
    }
    this.bullets = remaining;
  }

  collectPickups(player, now) {
    for (const pickup of this.pickups) {
      if (!pickup.active || distanceSquared(player, pickup) > 40 ** 2) continue;
      if (pickup.type === "health") {
        if (player.health >= player.maxHealth) continue;
        player.health = Math.min(player.maxHealth, player.health + 40);
      } else if (pickup.type === "ammo") {
        const weapon = WEAPONS[player.weapon];
        if (player.reserve >= weapon.reserve * 2) continue;
        player.reserve = Math.min(weapon.reserve * 2, player.reserve + weapon.magazine * 2);
      } else {
        if (player.weapon === pickup.weapon && player.ammo === WEAPONS[player.weapon].magazine) continue;
        const weapon = WEAPONS[pickup.weapon];
        player.weapon = pickup.weapon;
        player.ammo = weapon.magazine;
        player.reserve = weapon.reserve;
        player.reloadUntil = 0;
      }
      pickup.active = false;
      pickup.respawnAt = now + RULES.pickupRespawn;
      this.events.push({ type: "pickup", playerId: player.id, kind: pickup.type, weapon: pickup.weapon, x: pickup.x, y: pickup.y });
    }
  }

  tick(now = this.now(), dt = 1 / RULES.tickRate) {
    dt = clamp(dt, 0, 0.06);
    if (!this.survival && this.players.size && now - this.roundStartedAt >= RULES.roundSeconds * 1000) {
      this.events.push({ type: "round", leaders: this.leaderboard().slice(0, 3), round: this.round });
      this.round += 1;
      this.roundStartedAt = now;
      this.bullets = [];
      this.seedPickups();
      for (const player of this.players.values()) {
        player.kills = 0;
        player.deaths = 0;
        player.streak = 0;
        this.spawn(player, now);
      }
    }
    for (const pickup of this.pickups) {
      if (!pickup.active && now >= pickup.respawnAt) pickup.active = true;
    }
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      const character = getCharacter(player.character);
      const input = now - player.lastInputAt <= RULES.inputTimeout ? player.input : normalizeInput({ angle: player.angle });
      const dx = Number(input.right) - Number(input.left);
      const dy = Number(input.down) - Number(input.up);
      const length = Math.hypot(dx, dy);
      player.moving = length > 0;
      player.sprinting = input.sprint && length > 0 && player.stamina > 5;
      const speed = character.speed * (player.sprinting ? 1.42 : 1);
      player.stamina = clamp(player.stamina + (player.sprinting ? -32 : 22) * dt, 0, 100);
      if (length) {
        const nextX = player.x + (dx / length) * speed * dt;
        const nextY = player.y + (dy / length) * speed * dt;
        if (!isBlocked(this.map, nextX, player.y)) player.x = nextX;
        if (!isBlocked(this.map, player.x, nextY)) player.y = nextY;
      }
      player.angle = input.angle;
      if (player.reloadUntil && now >= player.reloadUntil) {
        const count = Math.min(WEAPONS[player.weapon].magazine - player.ammo, player.reserve);
        player.ammo += count;
        player.reserve -= count;
        player.reloadUntil = 0;
      }
      if (input.reload) this.reload(player, now);
      if (input.shoot && !player.sprinting) this.shoot(player, now);
      if (character.id === "medic" && now - player.lastDamageAt > 6000) {
        player.health = Math.min(player.maxHealth, player.health + 5 * dt);
      }
      this.collectPickups(player, now);
    }
    this.moveBullets(now, dt);
    if (this.players.size) this.survival?.tick(now, dt);
  }

  leaderboard() {
    return [...this.players.values()].map(({ id, name, character, kills, deaths, alive }) => ({ id, name, character, kills, deaths, alive }))
      .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
  }

  snapshot(now = this.now(), full = false) {
    const state = {
      roomId: this.room.id,
      mode: this.room.mode,
      serverTime: now, round: this.round,
      roundRemaining: this.survival ? 0 : Math.max(0, RULES.roundSeconds * 1000 - (now - this.roundStartedAt)),
      survival: this.survival?.snapshot(now) ?? null,
      players: [...this.players.values()].map((player) => ({
        id: player.id, name: player.name, character: player.character,
        x: player.x, y: player.y, angle: player.angle, alive: player.alive,
        health: Math.ceil(player.health), maxHealth: player.maxHealth,
        moving: player.moving, sprinting: player.sprinting, stamina: Math.round(player.stamina),
        weapon: player.weapon, ammo: player.ammo, reserve: player.reserve,
        reloadRemaining: Math.max(0, player.reloadUntil - now),
        spawnProtected: player.alive && now < player.shieldUntil,
        respawnRemaining: Math.max(0, player.respawnAt - now), kills: player.kills, deaths: player.deaths,
      })),
      bullets: this.bullets.map(({ id, x, y, vx, vy, angle, owner }) => ({ id, x, y, vx, vy, angle, owner })),
      zombies: [...this.zombies.values()].map(({ id, kind, x, y, angle, moving, health, maxHealth }) =>
        ({ id, kind, x, y, angle, moving, health, maxHealth })),
      pickups: this.pickups.filter((pickup) => pickup.active).map(({ id, x, y, type, weapon }) => ({ id, x, y, type, weapon })),
      leaderboard: this.leaderboard(),
    };
    if (full) {
      state.room = { ...this.room };
      state.map = {
        id: this.map.id, name: this.map.name, width: this.map.width, height: this.map.height,
        walls: this.map.walls, terrain: this.map.terrain, spawnPoints: this.map.spawnPoints,
        survivorSpawnPoints: this.map.survivorSpawnPoints, zombieSpawnPoints: this.map.zombieSpawnPoints,
      };
    }
    return state;
  }

  takeEvents() {
    return this.events.splice(0);
  }
}
