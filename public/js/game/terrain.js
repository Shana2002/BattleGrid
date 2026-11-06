import { MAPS, PALETTE } from "../../shared/catalog.js";

// The colorful terrain is baked once into a Canvas texture, not redrawn every frame.
export function terrainCanvas(map, mode) {
  const theme = map.terrain ?? MAPS[map.id].terrain;
  const canvas = document.createElement("canvas");
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext("2d");
  let seed = [...map.id].reduce((value, letter) => value + letter.charCodeAt(0), 17);
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const rect = (x, y, width, height, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, width, height); };
  const line = (x1, y1, x2, y2, stroke, width = 1) => {
    ctx.strokeStyle = stroke; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  rect(0, 0, map.width, map.height, theme.floor);
  for (let y = 0; y < map.height; y += 80) {
    for (let x = 0; x < map.width; x += 80) {
      if (random() > 0.45) rect(x + 1, y + 1, 78, 78, theme.tile);
      ctx.globalAlpha = 0.13;
      line(x, y, x + 80, y, theme.grid);
      line(x, y, x, y + 80, theme.grid);
      ctx.globalAlpha = 1;
    }
  }
  // Three biomes: wild grass, industrial steel, and a tiled blue-stone courtyard.
  for (let index = 0; index < 750; index += 1) {
    const x = Math.floor(random() * map.width);
    const y = Math.floor(random() * map.height);
    ctx.globalAlpha = 0.18 + random() * 0.24;
    if (map.id === "outpost") {
      rect(x, y, 2, 7, theme.detail); rect(x - 4, y + 2, 2, 4, theme.detail);
      if (index % 14 === 0) rect(x + 3, y - 2, 3, 3, theme.accent);
    } else if (map.id === "foundry") {
      rect(x, y, 12, 2, theme.grid);
      if (index % 10 === 0) rect(x + 4, y + 4, 3, 3, theme.accent);
    } else {
      line(x, y, x + 8, y + 2, theme.grid);
      if (index % 10 === 0) rect(x, y, 5, 3, theme.detail);
    }
  }
  ctx.globalAlpha = 1;
  rect(0, map.height / 2 - 100, map.width, 200, theme.lane);
  rect(map.width / 2 - 100, 0, 200, map.height, theme.lane);
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([28, 32]);
  line(0, map.height / 2 - 84, map.width, map.height / 2 - 84, theme.accent, 3);
  line(0, map.height / 2 + 84, map.width, map.height / 2 + 84, theme.accent, 3);
  line(map.width / 2 - 84, 0, map.width / 2 - 84, map.height, theme.accent, 3);
  line(map.width / 2 + 84, 0, map.width / 2 + 84, map.height, theme.accent, 3);
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.4;
  for (const radius of [280, 310]) {
    ctx.beginPath(); ctx.arc(map.width / 2, map.height / 2, radius, 0, Math.PI * 2);
    ctx.strokeStyle = theme.detail; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (map.id === "foundry") {
    for (const x of [90, map.width - 102]) {
      rect(x, 240, 12, map.height - 480, theme.wallEdge);
      rect(x + 3, 240, 6, map.height - 480, theme.accent);
    }
  }
  const spawns = mode === "zombies" ? map.survivorSpawnPoints : map.spawnPoints;
  for (const point of spawns ?? []) {
    ctx.globalAlpha = 0.28;
    rect(point.x - 28, point.y - 28, 56, 56, theme.detail);
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = theme.detail; ctx.lineWidth = 2;
    ctx.strokeRect(point.x - 28, point.y - 28, 56, 56);
    ctx.globalAlpha = 1;
  }
  if (mode === "zombies") {
    for (const point of map.zombieSpawnPoints ?? []) {
      ctx.fillStyle = PALETTE.ink; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.arc(point.x, point.y, 33, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = "#e89372"; ctx.lineWidth = 3;
      ctx.setLineDash([8, 7]); ctx.stroke(); ctx.setLineDash([]);
      line(point.x - 11, point.y - 11, point.x + 11, point.y + 11, "#e89372", 3);
      line(point.x + 11, point.y - 11, point.x - 11, point.y + 11, "#e89372", 3);
      ctx.globalAlpha = 1;
    }
  }
  for (const [index, wall] of map.walls.entries()) {
    const x = wall.x - wall.width / 2;
    const y = wall.y - wall.height / 2;
    ctx.globalAlpha = 0.45;
    rect(x + 10, y + 14, wall.width, wall.height, PALETTE.ink);
    ctx.globalAlpha = 1;
    rect(x, y + 8, wall.width, wall.height, theme.wallEdge);
    rect(x, y, wall.width, wall.height - 5, theme.wall);
    rect(x + 3, y + 3, wall.width - 6, 7, theme.wallTop);
    ctx.strokeStyle = theme.wallEdge; ctx.lineWidth = 3;
    ctx.strokeRect(x, y, wall.width, wall.height);
    ctx.globalAlpha = 0.65;
    if (map.id === "citadel") {
      for (let stripe = y + 35; stripe < y + wall.height - 15; stripe += 36) line(x + 4, stripe, x + wall.width - 4, stripe, theme.wallEdge, 2);
    } else {
      for (let stripe = x + 32; stripe < x + wall.width - 12; stripe += 40) line(stripe, y + 13, stripe, y + wall.height - 18, theme.wallEdge, 2);
    }
    ctx.globalAlpha = 1;
    for (const cornerX of [x + 9, x + wall.width - 13]) {
      for (const cornerY of [y + 13, y + wall.height - 24]) rect(cornerX, cornerY, 4, 4, theme.wallTop);
    }
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 3, y + wall.height - 13, wall.width - 6, 9); ctx.clip();
    rect(x, y + wall.height - 13, wall.width, 9, theme.wallEdge);
    for (let stripe = x - 8; stripe < x + wall.width; stripe += 22) {
      ctx.fillStyle = theme.accent;
      ctx.beginPath(); ctx.moveTo(stripe, y + wall.height - 4); ctx.lineTo(stripe + 9, y + wall.height - 13);
      ctx.lineTo(stripe + 18, y + wall.height - 13); ctx.lineTo(stripe + 9, y + wall.height - 4); ctx.fill();
    }
    ctx.restore();
    ctx.font = "bold 16px monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = PALETTE.paper;
    ctx.fillText(String(index + 1).padStart(2, "0"), wall.x, wall.y);
  }
  ctx.strokeStyle = theme.wallEdge; ctx.lineWidth = 12; ctx.strokeRect(6, 6, map.width - 12, map.height - 12);
  ctx.strokeStyle = theme.accent; ctx.lineWidth = 3; ctx.strokeRect(14, 14, map.width - 28, map.height - 28);
  ctx.font = "bold 22px monospace"; ctx.textAlign = "center"; ctx.fillStyle = theme.wallTop;
  ctx.fillText(`${map.name.toUpperCase()} / NORTH`, 300, 65);
  ctx.fillText(mode === "zombies" ? "HORDE ZONE / SURVIVE TOGETHER" : "SOUTH / BATTLEGRID", map.width - 400, map.height - 65);
  if (mode === "zombies") {
    ctx.font = "bold 13px monospace"; ctx.fillStyle = PALETTE.okBg;
    ctx.fillText("SQUAD DROP / NO FRIENDLY FIRE", map.width / 2, 110);
  }
  return canvas;
}
