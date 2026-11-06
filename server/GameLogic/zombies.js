import { RULES, SURVIVAL_RULES, WEAPONS, ZOMBIES } from "../../public/shared/catalog.js";
import { clamp, clearPath, distanceSquared, isBlocked } from "./collision.js";
import { Navigation } from "./navigation.js";

export class Survival {
  constructor(arena) {
    this.arena = arena;
    this.navigation = new Navigation(arena.map);
    this.reset(arena.now());
  }

  reset(now, run = 1) {
    this.run = run;
    this.wave = 0;
    this.wavesCleared = 0;
    this.score = 0;
    this.kills = 0;
    this.phase = "preparing";
    this.startedAt = now;
    this.nextWaveAt = now + SURVIVAL_RULES.preparation;
    this.nextSpawnAt = 0;
    this.pending = 0;
    this.total = 0;
    this.spawned = 0;
    this.arena.zombies.clear();
    this.navigation.fields.clear();
    this.navigation.nextRefreshAt = 0;
  }

  startWave(now) {
    this.wave += 1;
    this.phase = "active";
    this.total = Math.min(SURVIVAL_RULES.maxPerWave,
      SURVIVAL_RULES.baseCount + (this.wave - 1) * SURVIVAL_RULES.waveGrowth +
      (this.arena.players.size - 1) * SURVIVAL_RULES.extraPerPlayer);
    this.pending = this.total;
    this.spawned = 0;
    this.nextSpawnAt = now;
    this.arena.events.push({ type: "wave-start", wave: this.wave, total: this.total });
  }

  spawnZombie(now) {
    const alive = [...this.arena.players.values()].filter((player) => player.alive);
    const existing = [...this.arena.zombies.values()];
    const candidates = this.arena.map.zombieSpawnPoints.filter((point) =>
      !isBlocked(this.arena.map, point.x, point.y, ZOMBIES.brute.radius) &&
      existing.every((zombie) => distanceSquared(point, zombie) > (zombie.radius + ZOMBIES.brute.radius + 12) ** 2),
    ).map((point) => ({
      point, distance: alive.length ? Math.min(...alive.map((player) => distanceSquared(point, player))) : Infinity,
    })).sort((a, b) => b.distance - a.distance);
    if (!candidates.length) return false;
    const safe = candidates.filter((candidate) => candidate.distance >= SURVIVAL_RULES.minSpawnDistance ** 2);
    const pool = safe.length ? safe : candidates.slice(0, 1);
    const point = pool[Math.floor(this.arena.random() * pool.length)].point;
    // Runners arrive in wave 3; every fifth wave brings at least one brute.
    const kind = this.wave >= 5 && this.wave % 5 === 0 && this.spawned % 8 === 0 ? "brute" :
      this.wave >= 3 && this.spawned % 3 === 1 ? "runner" : "walker";
    const definition = ZOMBIES[kind];
    const scale = Math.min(this.wave - 1, 20);
    const zombie = {
      ...point, id: this.arena.nextId("zombie"), kind, radius: definition.radius,
      maxHealth: Math.ceil(definition.health * (1 + scale * 0.1)),
      health: Math.ceil(definition.health * (1 + scale * 0.1)),
      speed: definition.speed * (1 + scale * 0.012), angle: 0, moving: true,
      nextAttackAt: now + 500,
    };
    this.arena.zombies.set(zombie.id, zombie);
    this.pending -= 1;
    this.spawned += 1;
    this.arena.events.push({ type: "zombie-spawn", zombieId: zombie.id, kind, x: zombie.x, y: zombie.y });
    return true;
  }

  damage(zombie, bullet) {
    if (this.phase !== "active" || !this.arena.zombies.has(zombie.id) || zombie.health <= 0) return;
    zombie.health = Math.max(0, zombie.health - bullet.damage);
    this.arena.events.push({ type: "zombie-hit", zombieId: zombie.id, byId: bullet.owner, kind: zombie.kind,
      x: zombie.x, y: zombie.y, damage: bullet.damage });
    if (zombie.health > 0) return;
    const killer = this.arena.players.get(bullet.owner);
    const points = ZOMBIES[zombie.kind].score;
    if (killer) { killer.kills += 1; killer.streak += 1; }
    this.kills += 1;
    this.score += points;
    this.arena.zombies.delete(zombie.id);
    this.arena.events.push({ type: "zombie-kill", zombieId: zombie.id, byId: bullet.owner,
      killerName: killer?.name ?? "Squad", kind: zombie.kind, points, x: zombie.x, y: zombie.y });
  }

  clearWave(now) {
    this.wavesCleared = this.wave;
    const bonus = this.wave * SURVIVAL_RULES.waveBonus;
    this.score += bonus;
    this.phase = "intermission";
    this.nextWaveAt = now + SURVIVAL_RULES.waveBreak;
    this.arena.seedPickups();
    for (const player of this.arena.players.values()) {
      if (!player.alive) this.arena.spawn(player, now);
      else {
        const weapon = WEAPONS[player.weapon];
        player.health = Math.min(player.maxHealth, player.health + 40);
        player.ammo = weapon.magazine;
        player.reserve = Math.min(weapon.reserve * 2, player.reserve + weapon.magazine * 2);
        player.reloadUntil = 0;
      }
    }
    this.arena.events.push({ type: "wave-clear", wave: this.wave, bonus, score: this.score });
  }

  checkDefeat(now) {
    if (this.phase === "gameover" || !this.arena.players.size || [...this.arena.players.values()].some((player) => player.alive)) return false;
    this.phase = "gameover";
    this.nextWaveAt = now + SURVIVAL_RULES.restartDelay;
    this.arena.bullets = [];
    for (const zombie of this.arena.zombies.values()) zombie.moving = false;
    this.arena.events.push({ type: "survival-over", wave: this.wave, wavesCleared: this.wavesCleared, score: this.score, kills: this.kills });
    return true;
  }

  tick(now, dt) {
    if (this.phase === "gameover") {
      if (now < this.nextWaveAt) return;
      this.reset(now, this.run + 1);
      this.arena.roundStartedAt = now;
      this.arena.seedPickups();
      for (const player of this.arena.players.values()) {
        player.kills = 0; player.deaths = 0; player.streak = 0;
        this.arena.spawn(player, now);
      }
      this.arena.events.push({ type: "survival-restart", run: this.run });
      return;
    }
    if (this.checkDefeat(now)) return;
    if (this.phase !== "active") {
      if (now < this.nextWaveAt) return;
      this.startWave(now);
    }
    const interval = Math.max(SURVIVAL_RULES.minSpawnInterval, SURVIVAL_RULES.spawnInterval - (this.wave - 1) * 35);
    let spawnedThisTick = 0;
    while (this.pending > 0 && this.arena.zombies.size < SURVIVAL_RULES.maxAlive && now >= this.nextSpawnAt && spawnedThisTick < 2) {
      if (!this.spawnZombie(now)) break;
      this.nextSpawnAt = now + interval;
      spawnedThisTick += 1;
    }
    const players = [...this.arena.players.values()].filter((player) => player.alive);
    this.navigation.refresh(players, now);
    for (const zombie of this.arena.zombies.values()) {
      const target = players.filter((player) => player.alive).sort((a, b) => distanceSquared(zombie, a) - distanceSquared(zombie, b))[0];
      if (!target) break;
      const definition = ZOMBIES[zombie.kind];
      const distance = Math.sqrt(distanceSquared(zombie, target));
      zombie.angle = Math.atan2(target.y - zombie.y, target.x - zombie.x);
      if (distance <= zombie.radius + RULES.playerRadius + 12 && clearPath(this.arena.map, zombie, target)) {
        zombie.moving = false;
        if (now >= zombie.nextAttackAt) {
          zombie.nextAttackAt = now + definition.attackInterval;
          this.arena.events.push({ type: "zombie-attack", zombieId: zombie.id, playerId: target.id, kind: zombie.kind, x: zombie.x, y: zombie.y });
          this.arena.damage(target, { owner: zombie.id, damage: definition.damage, source: "zombie", name: definition.name }, now);
        }
        continue;
      }
      const waypoint = this.navigation.waypoint(zombie, target);
      zombie.moving = Boolean(waypoint);
      if (!waypoint) continue;
      const dx = waypoint.x - zombie.x;
      const dy = waypoint.y - zombie.y;
      const length = Math.hypot(dx, dy);
      if (!length) { zombie.moving = false; continue; }
      const step = Math.min(zombie.speed * clamp(dt, 0, 0.06), length);
      const nextX = zombie.x + dx / length * step;
      const nextY = zombie.y + dy / length * step;
      if (!isBlocked(this.arena.map, nextX, zombie.y, zombie.radius)) zombie.x = nextX;
      if (!isBlocked(this.arena.map, zombie.x, nextY, zombie.radius)) zombie.y = nextY;
    }
    if (this.checkDefeat(now)) return;
    if (this.pending === 0 && this.arena.zombies.size === 0) this.clearWave(now);
  }

  snapshot(now) {
    return {
      run: this.run, wave: this.wave, phase: this.phase, wavesCleared: this.wavesCleared,
      score: this.score, kills: this.kills, total: this.total,
      remaining: this.pending + this.arena.zombies.size, pending: this.pending,
      nextWaveIn: this.phase === "active" ? 0 : Math.max(0, this.nextWaveAt - now),
      elapsed: Math.max(0, now - this.startedAt),
    };
  }
}
