import { CHARACTERS, PALETTE } from "../../shared/catalog.js";

export const FRAME_WIDTH = 64;
export const FRAME_HEIGHT = 80;
const sheets = new Map();

// Original, procedurally drawn sprite sheets: eight walk, four idle, four fire frames.
// Lobby portraits and the actual game use the same artwork, without external downloads.
export function characterSheet(character) {
  if (sheets.has(character.id)) return sheets.get(character.id);
  const canvas = document.createElement("canvas");
  canvas.width = FRAME_WIDTH * 16;
  canvas.height = FRAME_HEIGHT;
  const ctx = canvas.getContext("2d");
  const rect = (x, y, width, height, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  };
  for (let frame = 0; frame < 16; frame += 1) {
    ctx.save();
    ctx.translate(frame * FRAME_WIDTH, 0);
    const walk = frame < 8;
    const phase = walk ? (frame / 8) * Math.PI * 2 : ((frame - 8) / 4) * Math.PI * 2;
    const stride = walk ? Math.round(Math.sin(phase) * 5) : 0;
    const bob = walk ? Math.round(Math.abs(Math.sin(phase)) * 2) : Math.round(Math.sin(phase));
    const heavy = character.id === "sentinel";
    const scout = character.id === "recon";
    const medic = character.id === "medic";
    const kit = character.kit;
    const body = kit.armor;
    ctx.translate(0, -bob);
    // Backpack, articulated boots and layered armor create a different silhouette per class.
    rect(10, 31, heavy ? 12 : 9, 26, PALETTE.ink);
    rect(12, 33, heavy ? 8 : 5, 19, kit.fabric);
    rect(12, 34, heavy ? 8 : 5, 3, kit.light);
    rect(20 - stride, 49, 10, 16, PALETTE.ink);
    rect(33 + stride, 49, 10, 16, PALETTE.ink);
    rect(22 - stride, 50, 6, 12, kit.fabric);
    rect(35 + stride, 50, 6, 12, kit.fabric);
    rect(22 - stride, 53, 6, 4, body);
    rect(35 + stride, 53, 6, 4, body);
    rect(17 - stride, 62, 15, 6, PALETTE.ink);
    rect(30 + stride, 62, 15, 6, PALETTE.ink);
    rect(20 - stride, 62, 10, 2, PALETTE.muted);
    rect(33 + stride, 62, 10, 2, PALETTE.steel);
    rect(heavy ? 14 : 17, 29, heavy ? 33 : 27, 26, PALETTE.ink);
    rect(heavy ? 17 : 20, 31, heavy ? 27 : 21, 21, body);
    rect(22, 32, 18, 3, kit.light);
    rect(21, 36, 3, 6, kit.light);
    rect(21, 42, 20, 3, PALETTE.dark);
    rect(22, 47, 5, 5, PALETTE.slate);
    rect(30, 47, 5, 5, PALETTE.slate);
    rect(38, 47, 4, 5, PALETTE.slate);
    rect(heavy ? 12 : 15, 29, heavy ? 14 : 10, 10, PALETTE.ink);
    rect(heavy ? 14 : 17, 30, heavy ? 10 : 6, 7, body);
    rect(18, 31, 3, 3, kit.light);
    // Helmet / face. Recon has a hood, Medic a cross, Sentinel a full visor.
    rect(scout ? 17 : 19, 11, heavy ? 27 : scout ? 28 : 24, 23, PALETTE.ink);
    rect(21, 13, heavy ? 23 : 20, 17, medic ? PALETTE.paper : body);
    if (scout) {
      rect(18, 13, 6, 20, kit.fabric);
      rect(23, 12, 20, 5, kit.light);
    }
    rect(27, 20, heavy ? 18 : 16, 8, PALETTE.dark);
    rect(29, 21, heavy ? 14 : 12, 4, kit.visor);
    rect(33, 22, 7, 1, PALETTE.white);
    rect(25, 29, 15, 3, kit.fabric);
    if (medic) {
      rect(27, 14, 9, 3, PALETTE.ok);
      rect(30, 11, 3, 9, PALETTE.ok);
      rect(23, 36, 9, 3, PALETTE.ok);
      rect(26, 33, 3, 9, PALETTE.ok);
    }
    if (heavy) {
      rect(17, 36, 26, 3, kit.light);
      rect(23, 37, 3, 7, kit.fabric);
      rect(36, 37, 3, 7, kit.fabric);
    }
    // Hands, receiver, sight, barrel. Firing frames visibly recoil.
    const recoil = frame >= 12 ? [2, 3, 1, 0][frame - 12] : 0;
    rect(32 - recoil, 36, 11, 9, PALETTE.ink);
    rect(34 - recoil, 38, 8, 5, PALETTE.silver);
    rect(34 - recoil, 37, 7, 2, body);
    rect(36 - recoil, 37, heavy ? 23 : 21, 8, PALETTE.ink);
    rect(38 - recoil, 38, 16, 3, PALETTE.steel);
    rect(52 - recoil, 38, 10, heavy ? 5 : 3, PALETTE.ink);
    rect(42 - recoil, 45, 7, heavy ? 10 : 7, PALETTE.ink);
    rect(43 - recoil, 45, 4, heavy ? 8 : 5, PALETTE.slate);
    rect(45 - recoil, 33, 6, 4, PALETTE.ink);
    rect(46 - recoil, 34, 3, 2, kit.visor);
    ctx.restore();
  }
  sheets.set(character.id, canvas);
  return canvas;
}

export function hydratePortraits(root = document) {
  for (const element of root.querySelectorAll("[data-portrait]")) {
    const character = CHARACTERS.find((item) => item.id === element.dataset.portrait);
    if (!character) continue;
    element.style.backgroundImage = `url("${characterSheet(character).toDataURL()}")`;
  }
}
