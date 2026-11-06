import { PALETTE, ZOMBIES } from "../../shared/catalog.js";
import { FRAME_HEIGHT, FRAME_WIDTH } from "./characters.js";

const sheets = new Map();

export function zombieSheet(kind) {
  if (sheets.has(kind)) return sheets.get(kind);
  const definition = ZOMBIES[kind];
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH * 16;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext("2d");
  const rect = (x, y, width, height, fill) => {
    ctx.fillStyle = fill;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  };
  for (let frame = 0; frame < 16; frame += 1) {
    ctx.save();
    ctx.translate(frame * FRAME_WIDTH, 0);
    const walk = frame < 8;
    const phase = frame / (walk ? 8 : 4) * Math.PI * 2;
    const stride = walk ? Math.round(Math.sin(phase) * (kind === "runner" ? 6 : 4)) : 0;
    const bob = Math.round(Math.sin(phase) * (walk ? 2 : 1));
    const brute = kind === "brute";
    const reach = frame >= 12 ? [2, 7, 4, 0][frame - 12] : 0;
    ctx.translate(0, bob);
    // Ragged clothing, an exposed green face, and outstretched hands distinguish the horde.
    rect(18 - stride, 48, 12, 17, PALETTE.ink);
    rect(33 + stride, 48, 12, 17, PALETTE.ink);
    rect(20 - stride, 49, 8, 12, definition.shade);
    rect(35 + stride, 49, 8, 12, PALETTE.slate);
    rect(20 - stride, 56, 5, 3, definition.skin);
    rect(17 - stride, 63, 15, 5, PALETTE.dark);
    rect(32 + stride, 63, 15, 5, PALETTE.dark);
    rect(brute ? 12 : 17, 29, brute ? 37 : 29, 26, PALETTE.ink);
    rect(brute ? 15 : 20, 31, brute ? 31 : 23, 21, definition.outfit);
    rect(brute ? 16 : 21, 31, brute ? 29 : 21, 4, definition.light);
    rect(23, 39, 7, 11, definition.shade);
    rect(26, 38, 4, 8, definition.skin);
    rect(35, 49, 4, 5, definition.skin);
    rect(14, 33, 9, 17, PALETTE.ink);
    rect(16, 35, 5, 12, definition.shade);
    rect(15, 47, 8, 5, definition.skin);
    rect(brute ? 17 : 20, 10, brute ? 30 : 25, 24, PALETTE.ink);
    rect(brute ? 20 : 23, 12, brute ? 25 : 20, 19, definition.shade);
    rect(25, 13, brute ? 19 : 17, 15, definition.skin);
    rect(25, 11, 8, 4, PALETTE.slate);
    rect(34, 12, 7, 3, definition.shade);
    rect(27, 20, 6, 5, PALETTE.ink);
    rect(37, 20, 6, 5, PALETTE.ink);
    rect(28, 21, 3, 2, definition.eyes);
    rect(38, 21, 3, 2, definition.eyes);
    rect(31, 27, 11, 4, PALETTE.dark);
    rect(33, 27, 2, 2, PALETTE.paper);
    rect(38, 27, 2, 2, PALETTE.paper);
    if (brute) {
      rect(12, 31, 12, 8, definition.light);
      rect(22, 37, 3, 13, PALETTE.dark);
      rect(37, 36, 3, 14, PALETTE.dark);
    }
    rect(36, 34, 16 + reach, 10, PALETTE.ink);
    rect(38, 35, 10 + reach, 4, definition.outfit);
    rect(46 + reach, 35, 10, 7, definition.skin);
    rect(52 + reach, 34, 4, 3, definition.skin);
    rect(52 + reach, 41, 5, 2, definition.shade);
    ctx.restore();
  }
  sheets.set(kind, canvas);
  return canvas;
}
