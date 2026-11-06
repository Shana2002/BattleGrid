import { RULES } from "../../public/shared/catalog.js";

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const distanceSquared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

export function isBlocked(map, x, y, radius = RULES.playerRadius) {
  if (x < radius || y < radius || x > map.width - radius || y > map.height - radius) return true;
  return map.walls.some((wall) =>
    x + radius > wall.x - wall.width / 2 && x - radius < wall.x + wall.width / 2 &&
    y + radius > wall.y - wall.height / 2 && y - radius < wall.y + wall.height / 2,
  );
}

// First intersection along a segment. Padding lets navigation account for enemy width.
export function segmentRectangle(a, b, wall, padding = 3) {
  let near = 0;
  let far = 1;
  for (const [axis, size] of [["x", "width"], ["y", "height"]]) {
    const delta = b[axis] - a[axis];
    const min = wall[axis] - wall[size] / 2 - padding;
    const max = wall[axis] + wall[size] / 2 + padding;
    if (Math.abs(delta) < 0.00001) {
      if (a[axis] < min || a[axis] > max) return null;
    } else {
      const first = (min - a[axis]) / delta;
      const second = (max - a[axis]) / delta;
      near = Math.max(near, Math.min(first, second));
      far = Math.min(far, Math.max(first, second));
      if (near > far) return null;
    }
  }
  return near;
}

export function segmentCircle(a, b, target, radius = 24) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const fx = a.x - target.x;
  const fy = a.y - target.y;
  const length = dx * dx + dy * dy;
  if (length === 0) return null;
  const projection = clamp(-(fx * dx + fy * dy) / length, 0, 1);
  if ((fx + projection * dx) ** 2 + (fy + projection * dy) ** 2 > radius ** 2) return null;
  const discriminant = (fx * dx + fy * dy) ** 2 - length * (fx * fx + fy * fy - radius ** 2);
  if (discriminant < 0) return null;
  return clamp((-(fx * dx + fy * dy) - Math.sqrt(discriminant)) / length, 0, 1);
}

export const clearPath = (map, a, b, radius = 0) =>
  !map.walls.some((wall) => segmentRectangle(a, b, wall, radius) !== null);
