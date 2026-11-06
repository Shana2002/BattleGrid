// Shared by the browser and server. Keep this module free of DOM/Node APIs.
export const PALETTE = Object.freeze({
  ink: "#15171a",
  dark: "#24272b",
  slate: "#383d43",
  steel: "#60666e",
  muted: "#858b92",
  silver: "#bcc1c6",
  border: "#dedfdf",
  paper: "#f6f6f3",
  white: "#ffffff",
  danger: "#b42318",
  dangerBg: "#fff1ef",
  warn: "#965900",
  warnBg: "#fff8e7",
  ok: "#187248",
  okBg: "#eff9f3",
  info: "#175cd3",
  infoBg: "#eff5ff",
});

export const CHARACTERS = Object.freeze([
  {
    id: "vanguard", name: "Vanguard", role: "Assault", badge: "danger",
    description: "The all-rounder. Steady aim, reliable armor, no compromises.",
    trait: "Balanced loadout", health: 110, speed: 235, weapon: "carbine",
    accent: PALETTE.danger,
    kit: { armor: "#dc6246", light: "#ffad78", fabric: "#713c38", visor: "#ffdf91" },
  },
  {
    id: "recon", name: "Recon", role: "Scout", badge: "info",
    description: "Travel light. Flank faster. Make every opening count.",
    trait: "Fastest movement", health: 90, speed: 280, weapon: "smg",
    accent: PALETTE.info,
    kit: { armor: "#367ed0", light: "#7ccaf8", fabric: "#25466e", visor: "#8eeaff" },
  },
  {
    id: "medic", name: "Medic", role: "Support", badge: "ok",
    description: "A second wind. Recover health after six seconds out of combat.",
    trait: "Passive recovery", health: 100, speed: 245, weapon: "carbine",
    accent: PALETTE.ok,
    kit: { armor: "#57a87b", light: "#bcf1ce", fabric: "#2b6250", visor: "#b6ffcf" },
  },
  {
    id: "sentinel", name: "Sentinel", role: "Heavy", badge: "warn",
    description: "Hold the line with heavy armor and a deep magazine.",
    trait: "Extra armor", health: 135, speed: 210, weapon: "lmg",
    accent: PALETTE.warn,
    kit: { armor: "#d79b36", light: "#ffe08b", fabric: "#735738", visor: "#ffe9a8" },
  },
]);

export const MODES = Object.freeze([
  {
    id: "arena", name: "Arena PvP", label: "FREE-FOR-ALL", badge: "info", icon: "⌖",
    description: "Every operator for themselves. Five-minute rounds, fast respawns, and a race to the top.",
    detail: "2–16 players · competitive", maxPlayers: 16, minCapacity: 2,
  },
  {
    id: "zombies", name: "Co-op Zombies", label: "CO-OP ZOMBIES", badge: "ok", icon: "☣",
    description: "Stick together against an endless horde. Clear waves, resupply, and keep your squad alive.",
    detail: "Solo or 4-player squad · no friendly fire", maxPlayers: 4, minCapacity: 1,
  },
]);

// Artwork colors identify biomes, operator kits, and enemy types; UI colors stay semantic.
export const ZOMBIES = Object.freeze({
  walker: {
    name: "Walker", health: 60, speed: 100, damage: 14, attackInterval: 1000, radius: 18, score: 100,
    skin: "#95c66a", shade: "#54834b", outfit: "#8b5650", light: "#c5846e", eyes: "#ffe08b",
  },
  runner: {
    name: "Runner", health: 42, speed: 166, damage: 11, attackInterval: 850, radius: 17, score: 125,
    skin: "#b1d878", shade: "#66934e", outfit: "#387d97", light: "#78c7d0", eyes: "#ffb56d",
  },
  brute: {
    name: "Brute", health: 180, speed: 73, damage: 27, attackInterval: 1400, radius: 26, score: 300,
    skin: "#84b879", shade: "#496f4e", outfit: "#a77538", light: "#eac66b", eyes: "#ff926e",
  },
});

export const SURVIVAL_RULES = Object.freeze({
  preparation: 8000, waveBreak: 7000, restartDelay: 10000,
  baseCount: 6, waveGrowth: 3, extraPerPlayer: 4, maxPerWave: 80, maxAlive: 32,
  spawnInterval: 850, minSpawnInterval: 280, minSpawnDistance: 420,
  waveBonus: 250, navigationCell: 60, navigationRefresh: 450,
});

export const WEAPONS = Object.freeze({
  carbine: { name: "Carbine", magazine: 30, reserve: 120, damage: 17, interval: 150, reload: 1450, speed: 1150, range: 900, pellets: 1, spread: 0.025 },
  smg: { name: "SMG", magazine: 32, reserve: 160, damage: 12, interval: 95, reload: 1200, speed: 1050, range: 720, pellets: 1, spread: 0.055 },
  lmg: { name: "LMG", magazine: 45, reserve: 180, damage: 15, interval: 135, reload: 1950, speed: 1100, range: 980, pellets: 1, spread: 0.045 },
  shotgun: { name: "Shotgun", magazine: 6, reserve: 36, damage: 11, interval: 600, reload: 1700, speed: 900, range: 480, pellets: 5, spread: 0.30 },
});

const wall = (x, y, width, height) => ({ x, y, width, height });
const spawnPoints = [
  { x: 320, y: 280 }, { x: 1200, y: 160 }, { x: 2080, y: 280 },
  { x: 2240, y: 900 }, { x: 2080, y: 1520 }, { x: 1200, y: 1640 },
  { x: 320, y: 1520 }, { x: 160, y: 900 },
];
const survivorSpawnPoints = [
  { x: 1080, y: 180 }, { x: 1160, y: 180 }, { x: 1240, y: 180 }, { x: 1320, y: 180 },
];
const zombieSpawnPoints = [
  { x: 120, y: 120 }, { x: 600, y: 120 }, { x: 1200, y: 120 }, { x: 1800, y: 120 }, { x: 2280, y: 120 },
  { x: 2280, y: 600 }, { x: 2280, y: 1200 }, { x: 2280, y: 1680 },
  { x: 1800, y: 1680 }, { x: 1200, y: 1680 }, { x: 600, y: 1680 }, { x: 120, y: 1680 },
  { x: 120, y: 1200 }, { x: 120, y: 600 },
];
const pickupPoints = [
  { x: 370, y: 300 }, { x: 900, y: 300 }, { x: 1500, y: 300 }, { x: 2030, y: 300 },
  { x: 350, y: 650 }, { x: 900, y: 650 }, { x: 1500, y: 650 }, { x: 2050, y: 650 },
  { x: 350, y: 1150 }, { x: 900, y: 1150 }, { x: 1500, y: 1150 }, { x: 2050, y: 1150 },
  { x: 370, y: 1500 }, { x: 900, y: 1500 }, { x: 1500, y: 1500 }, { x: 2030, y: 1500 },
];

export const MAPS = Object.freeze({
  outpost: {
    id: "outpost", name: "Outpost", width: 2400, height: 1800, spawnPoints, survivorSpawnPoints, zombieSpawnPoints, pickupPoints,
    terrain: {
      floor: "#345840", tile: "#3b6549", lane: "#68735a", grid: "#83a279",
      wall: "#3e7c92", wallTop: "#83c2cd", wallEdge: "#23495c", accent: "#f5c66f", detail: "#80b966",
    },
    walls: [
      wall(600, 450, 300, 100), wall(1800, 450, 300, 100),
      wall(600, 1350, 300, 100), wall(1800, 1350, 300, 100),
      wall(1200, 900, 280, 200), wall(1200, 400, 100, 260),
      wall(1200, 1400, 100, 260), wall(550, 900, 100, 260), wall(1850, 900, 100, 260),
    ],
  },
  foundry: {
    id: "foundry", name: "Foundry", width: 2400, height: 1800, spawnPoints, survivorSpawnPoints, zombieSpawnPoints, pickupPoints,
    terrain: {
      floor: "#2c4056", tile: "#344c64", lane: "#52677b", grid: "#7b9aac",
      wall: "#b46b45", wallTop: "#f4b06a", wallEdge: "#744633", accent: "#ffcb6b", detail: "#6fc4d0",
    },
    walls: [
      wall(600, 400, 320, 100), wall(1800, 400, 320, 100),
      wall(600, 1400, 320, 100), wall(1800, 1400, 320, 100),
      wall(750, 850, 100, 480), wall(1650, 950, 100, 480),
      wall(1200, 900, 340, 100), wall(1200, 500, 100, 160), wall(1200, 1300, 100, 160),
      wall(300, 900, 180, 100), wall(2100, 900, 180, 100),
    ],
  },
  citadel: {
    id: "citadel", name: "Citadel", width: 2400, height: 1800, spawnPoints, survivorSpawnPoints, zombieSpawnPoints, pickupPoints,
    terrain: {
      floor: "#3c5573", tile: "#466583", lane: "#667f92", grid: "#9bb8c7",
      wall: "#7997b1", wallTop: "#b5d4df", wallEdge: "#415d77", accent: "#f4c977", detail: "#80bb99",
    },
    walls: [
      wall(700, 500, 100, 340), wall(1700, 500, 100, 340),
      wall(700, 1300, 100, 340), wall(1700, 1300, 100, 340),
      wall(1200, 550, 420, 100), wall(1200, 1250, 420, 100),
      wall(950, 900, 100, 260), wall(1450, 900, 100, 260),
      wall(350, 900, 150, 150), wall(2050, 900, 150, 150),
    ],
  },
});

// These are logical arena pools on this host, not separate geographic endpoints.
export const SERVERS = Object.freeze([
  { id: "outpost", name: "Outpost / 01", map: "outpost", maxPlayers: 8, description: "Open lanes. Room to find your feet." },
  { id: "foundry", name: "Foundry / 02", map: "foundry", maxPlayers: 12, description: "Tight corners. Close-range encounters." },
  { id: "citadel", name: "Citadel / 03", map: "citadel", maxPlayers: 16, description: "Fortified cover. Bigger firefights." },
]);

export const RULES = Object.freeze({
  tickRate: 30, stateRate: 20, playerRadius: 20, roundSeconds: 300,
  respawnDelay: 3500, spawnProtection: 2200, inputTimeout: 300,
  pickupRespawn: 20000, roomIdleTimeout: 300000,
});

export const getCharacter = (id) => CHARACTERS.find((character) => character.id === id);
export const getServer = (id) => SERVERS.find((server) => server.id === id);
export const getMode = (id) => MODES.find((mode) => mode.id === id);
export const roomCapacity = (server, mode) => Math.min(server.maxPlayers, mode.maxPlayers);
