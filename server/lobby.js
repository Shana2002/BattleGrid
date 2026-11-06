import { randomBytes, randomUUID } from "node:crypto";
import { Arena } from "./GameLogic/arena.js";
import { MODES, RULES, SERVERS, getCharacter, getMode, getServer, roomCapacity } from "../public/shared/catalog.js";

export function validateProfile(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Enter your callsign to continue.");
  const name = typeof raw.name === "string" ? raw.name.normalize("NFKC").trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 20 || !/^[\p{L}\p{N}_. '\-]+$/u.test(name)) {
    throw new Error("Use 2–20 letters, numbers, spaces, dots, or dashes for your callsign.");
  }
  if (!getCharacter(raw.character)) throw new Error("Choose a valid operator.");
  return { name, character: raw.character };
}

export class Lobby {
  constructor({ now = Date.now, random = Math.random } = {}) {
    this.now = now;
    this.random = random;
    this.rooms = new Map();
    for (const server of SERVERS) {
      for (const mode of MODES) {
        this.createRoom({ serverId: server.id, mode: mode.id, name: mode.id === "zombies" ? "Open survival" : "Open arena",
          capacity: roomCapacity(server, mode), persistent: true });
      }
    }
  }

  createRoom({ serverId, mode: modeId = "arena", name, capacity, private: privateRoom = false, persistent = false } = {}) {
    const server = getServer(serverId);
    if (!server) throw new Error("Select an available arena server.");
    const mode = getMode(modeId);
    if (!mode) throw new Error("Choose a valid game mode.");
    const title = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
    if (title.length < 3 || title.length > 32 || /[<>\u0000-\u001f]/.test(title)) throw new Error("Room names must be 3–32 characters, without markup.");
    const maximum = roomCapacity(server, mode);
    if (!Number.isInteger(capacity) || capacity < mode.minCapacity || capacity > maximum) {
      throw new Error(`Choose a room size between ${mode.minCapacity} and ${maximum} for ${mode.name}.`);
    }
    if (this.rooms.size >= 48) throw new Error("This host has reached its room limit. Join an existing room.");
    let code;
    do { code = randomBytes(3).toString("hex").toUpperCase(); }
    while ([...this.rooms.values()].some((arena) => arena.room.code === code));
    const room = {
      id: randomUUID(), code, name: title, serverId, map: server.map, mode: mode.id,
      capacity, private: privateRoom === true, persistent,
    };
    const arena = new Arena(room, { now: this.now, random: this.random });
    arena.emptySince = this.now();
    this.rooms.set(room.id, arena);
    return arena;
  }

  getRoom(id) {
    const arena = this.rooms.get(id);
    if (!arena) throw new Error("This room no longer exists. Choose another room.");
    return arena;
  }

  getByCode(raw) {
    const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
    if (!/^[A-F0-9]{6}$/.test(code)) throw new Error("Enter a six-character invite code.");
    const arena = [...this.rooms.values()].find((room) => room.room.code === code);
    if (!arena) throw new Error("No room has that invite code. It may have expired.");
    return arena;
  }

  quickRoom(serverId, modeId = "arena") {
    const server = getServer(serverId);
    if (!server) throw new Error("Select an available arena server.");
    const mode = getMode(modeId);
    if (!mode) throw new Error("Choose a valid game mode.");
    const available = [...this.rooms.values()]
      .filter((arena) => arena.room.serverId === serverId && arena.room.mode === mode.id && !arena.room.private && arena.players.size < arena.room.capacity)
      .sort((a, b) => Number(a.survival?.phase === "gameover") - Number(b.survival?.phase === "gameover") || b.players.size - a.players.size);
    return available[0] ?? this.createRoom({ serverId, mode: mode.id, name: mode.id === "zombies" ? "Open survival" : "Open arena", capacity: roomCapacity(server, mode) });
  }

  summary() {
    const rooms = [...this.rooms.values()].filter((arena) => !arena.room.private).map((arena) => ({
      id: arena.room.id, name: arena.room.name, serverId: arena.room.serverId,
      map: arena.map.name, mode: arena.room.mode, players: arena.players.size, capacity: arena.room.capacity,
      status: !arena.players.size ? "Ready" : arena.survival ?
        arena.survival.phase === "gameover" ? "New run soon" : arena.survival.phase === "intermission" ? "Resupplying" :
        arena.survival.wave ? `Wave ${arena.survival.wave}` : "Preparing" :
        arena.players.size >= 2 ? "Live" : "Waiting for players",
    }));
    const servers = SERVERS.map((server) => ({
      ...server,
      players: [...this.rooms.values()].filter((arena) => arena.room.serverId === server.id)
        .reduce((total, arena) => total + arena.players.size, 0),
      rooms: [...this.rooms.values()].filter((arena) => arena.room.serverId === server.id).length,
    }));
    return { servers, rooms };
  }

  cleanup(now = this.now()) {
    let changed = false;
    for (const [id, arena] of this.rooms) {
      if (arena.players.size) arena.emptySince = now;
      else if (!arena.room.persistent && now - arena.emptySince > RULES.roomIdleTimeout) {
        this.rooms.delete(id);
        changed = true;
      }
      if (!arena.players.size) arena.roundStartedAt = now;
    }
    return changed;
  }
}
