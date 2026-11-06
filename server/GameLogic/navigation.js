import { SURVIVAL_RULES, ZOMBIES } from "../../public/shared/catalog.js";
import { clamp, clearPath, distanceSquared, isBlocked } from "./collision.js";

// A flow field per living teammate is shared by every zombie in the room.
// No per-enemy timers or expensive per-frame path searches.
export class Navigation {
  constructor(map) {
    this.map = map;
    this.cell = SURVIVAL_RULES.navigationCell;
    this.columns = Math.ceil(map.width / this.cell);
    this.rows = Math.ceil(map.height / this.cell);
    this.size = this.columns * this.rows;
    this.walkable = new Uint8Array(this.size);
    this.fields = new Map();
    this.nextRefreshAt = 0;
    const radius = Math.max(...Object.values(ZOMBIES).map((kind) => kind.radius)) + 1;
    for (let index = 0; index < this.size; index += 1) {
      const point = this.point(index);
      this.walkable[index] = Number(!isBlocked(map, point.x, point.y, radius));
    }
    this.neighbors = Array.from({ length: this.size }, (_, index) => {
      const x = index % this.columns;
      const y = Math.floor(index / this.columns);
      return [x > 0 ? index - 1 : -1, x < this.columns - 1 ? index + 1 : -1,
        y > 0 ? index - this.columns : -1, y < this.rows - 1 ? index + this.columns : -1]
        .filter((neighbor) => neighbor >= 0 && this.walkable[neighbor]);
    });
  }

  point(index) {
    return { x: (index % this.columns + 0.5) * this.cell, y: (Math.floor(index / this.columns) + 0.5) * this.cell };
  }

  closestCell(position) {
    const x = clamp(Math.floor(position.x / this.cell), 0, this.columns - 1);
    const y = clamp(Math.floor(position.y / this.cell), 0, this.rows - 1);
    const index = y * this.columns + x;
    if (this.walkable[index]) return index;
    let closest = -1;
    let distance = Infinity;
    for (let candidate = 0; candidate < this.size; candidate += 1) {
      if (!this.walkable[candidate]) continue;
      const next = distanceSquared(position, this.point(candidate));
      if (next < distance) { distance = next; closest = candidate; }
    }
    return closest;
  }

  refresh(players, now) {
    const ids = new Set(players.map((player) => player.id));
    for (const id of this.fields.keys()) if (!ids.has(id)) this.fields.delete(id);
    if (now < this.nextRefreshAt && players.every((player) => this.fields.has(player.id))) return;
    this.nextRefreshAt = now + SURVIVAL_RULES.navigationRefresh;
    for (const player of players) {
      const origin = this.closestCell(player);
      const distances = new Int16Array(this.size).fill(-1);
      if (origin < 0) continue;
      const queue = new Int32Array(this.size);
      let read = 0;
      let write = 1;
      queue[0] = origin;
      distances[origin] = 0;
      while (read < write) {
        const current = queue[read++];
        for (const neighbor of this.neighbors[current]) {
          if (distances[neighbor] >= 0) continue;
          distances[neighbor] = distances[current] + 1;
          queue[write++] = neighbor;
        }
      }
      this.fields.set(player.id, distances);
    }
  }

  waypoint(zombie, player) {
    if (clearPath(this.map, zombie, player, zombie.radius + 1)) return player;
    const distances = this.fields.get(player.id);
    const current = this.closestCell(zombie);
    if (!distances || current < 0 || distances[current] < 0) return null;
    const candidates = this.neighbors[current].filter((index) => distances[index] < distances[current] && distances[index] >= 0)
      .sort((a, b) => distances[a] - distances[b] || distanceSquared(zombie, this.point(a)) - distanceSquared(zombie, this.point(b)));
    for (const index of candidates) {
      const point = this.point(index);
      if (clearPath(this.map, zombie, point, zombie.radius + 1)) return point;
    }
    const center = this.point(current);
    return clearPath(this.map, zombie, center, zombie.radius + 1) ? center : null;
  }
}
