import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { Lobby, validateProfile } from "./lobby.js";
import { RULES, getCharacter } from "../public/shared/catalog.js";

const publicDirectory = fileURLToPath(new URL("../public/", import.meta.url));

export function createGameServer({ now = Date.now } = {}) {
  const app = express();
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    maxHttpBufferSize: 16 * 1024,
  });
  const lobby = new Lobby({ now });
  app.get("/api/health", (_request, response) => response.json({ status: "ok", ...lobby.summary() }));
  app.get("/api/servers", (_request, response) => response.json(lobby.summary()));
  app.use(express.static(path.resolve(publicDirectory)));

  const broadcastLobby = () => io.to("lobby").emit("lobby:update", lobby.summary());
  const reply = (ack, payload) => { if (typeof ack === "function") ack(payload); };

  function leaveRoom(socket, returnToLobby = true) {
    const id = socket.data.roomId;
    if (id) {
      const arena = lobby.rooms.get(id);
      const player = arena?.players.get(socket.id);
      arena?.removePlayer(socket.id);
      if (arena && !arena.players.size) arena.emptySince = now();
      socket.leave(`match:${id}`);
      socket.data.roomId = null;
      if (player) io.to(`match:${id}`).emit("room:message", { roomId: id, system: true, text: `${player.name} left the match.`, time: now() });
    }
    if (returnToLobby && socket.data.profile) socket.join("lobby");
    broadcastLobby();
  }

  function joinRoom(socket, arena, character) {
    if (!socket.data.profile) throw new Error("Choose a callsign before joining a room.");
    if (!getCharacter(character)) throw new Error("Choose a valid operator.");
    if (socket.data.roomId === arena.room.id) return { ok: true, playerId: socket.id, state: arena.snapshot(now(), true) };
    if (arena.players.size >= arena.room.capacity && socket.data.roomId !== arena.room.id) throw new Error("This room is full. Try another room.");
    leaveRoom(socket, false);
    socket.data.profile.character = character;
    arena.addPlayer({ ...socket.data.profile, id: socket.id });
    socket.data.roomId = arena.room.id;
    socket.leave("lobby");
    socket.join(`match:${arena.room.id}`);
    io.to(`match:${arena.room.id}`).emit("room:message", { roomId: arena.room.id, system: true, text: `${socket.data.profile.name} joined the match.`, time: now() });
    broadcastLobby();
    return { ok: true, playerId: socket.id, state: arena.snapshot(now(), true) };
  }

  io.on("connection", (socket) => {
    socket.data.lastInputAt = -Infinity;
    socket.data.lastChatAt = -Infinity;
    socket.data.lastCreateAt = -Infinity;
    socket.emit("lobby:update", lobby.summary());

    const handle = (event, action) => socket.on(event, (data, ack) => {
      try { reply(ack, action(data ?? {})); }
      catch (error) { reply(ack, { ok: false, error: error.message }); }
    });

    handle("lobby:login", (data) => {
      if (socket.data.roomId) throw new Error("Leave your match before changing your profile.");
      socket.data.profile = validateProfile(data);
      socket.join("lobby");
      return { ok: true, profile: socket.data.profile, ...lobby.summary() };
    });
    handle("lobby:list", () => ({ ok: true, ...lobby.summary() }));
    handle("room:join", (data) => joinRoom(socket, lobby.getRoom(data.roomId), data.character));
    handle("room:join-code", (data) => joinRoom(socket, lobby.getByCode(data.code), data.character));
    handle("room:quick-join", (data) => {
      if (!socket.data.profile) throw new Error("Choose a callsign before joining a room.");
      if (!getCharacter(data.character)) throw new Error("Choose a valid operator.");
      return joinRoom(socket, lobby.quickRoom(data.serverId, data.mode), data.character);
    });
    handle("room:create", (data) => {
      if (!socket.data.profile) throw new Error("Choose a callsign before creating a room.");
      if (!getCharacter(data.character)) throw new Error("Choose a valid operator.");
      if (now() - socket.data.lastCreateAt < 2000) throw new Error("Wait a moment before creating another room.");
      const arena = lobby.createRoom({ serverId: data.serverId, mode: data.mode, name: data.name, capacity: data.capacity, private: data.private });
      socket.data.lastCreateAt = now();
      return joinRoom(socket, arena, data.character);
    });
    handle("room:leave", () => {
      leaveRoom(socket);
      return { ok: true, ...lobby.summary() };
    });
    handle("game:respawn", () => {
      lobby.getRoom(socket.data.roomId).respawn(socket.id, now());
      return { ok: true };
    });
    handle("room:chat", (data) => {
      const arena = lobby.getRoom(socket.data.roomId);
      if (now() - socket.data.lastChatAt < 750) throw new Error("Give the radio a moment between messages.");
      const text = typeof data.text === "string" ? data.text.trim().replace(/[\u0000-\u001f\u007f]/g, " ") : "";
      if (!text || text.length > 160) throw new Error("Messages must be 1–160 characters.");
      socket.data.lastChatAt = now();
      io.to(`match:${arena.room.id}`).emit("room:message", { roomId: arena.room.id, name: socket.data.profile.name, playerId: socket.id, text, time: now() });
      return { ok: true };
    });
    socket.on("game:input", (data) => {
      const timestamp = now();
      if (timestamp - socket.data.lastInputAt < 1000 / 60) return;
      socket.data.lastInputAt = timestamp;
      lobby.rooms.get(socket.data.roomId)?.setInput(socket.id, data, timestamp);
    });
    socket.on("game:ping", (ack) => { if (typeof ack === "function") ack(); });
    socket.on("disconnect", () => leaveRoom(socket, false));
  });

  // One simulation scheduler for every room, never one interval per connection.
  let previousTick = now();
  let nextSnapshotAt = now();
  let lastCleanup = 0;
  const timer = setInterval(() => {
    const timestamp = now();
    const delta = (timestamp - previousTick) / 1000;
    previousTick = timestamp;
    const sendSnapshot = timestamp >= nextSnapshotAt;
    let modesChanged = false;
    for (const arena of lobby.rooms.values()) {
      if (!arena.players.size) { arena.takeEvents(); continue; }
      arena.tick(timestamp, delta);
      for (const event of arena.takeEvents()) {
        io.to(`match:${arena.room.id}`).emit("game:event", { ...event, roomId: arena.room.id });
        if (["wave-start", "wave-clear", "survival-over", "survival-restart"].includes(event.type)) modesChanged = true;
      }
      if (sendSnapshot) io.to(`match:${arena.room.id}`).emit("game:state", arena.snapshot(timestamp));
    }
    if (modesChanged) broadcastLobby();
    if (sendSnapshot) nextSnapshotAt = Math.max(nextSnapshotAt + 1000 / RULES.stateRate, timestamp);
    if (timestamp - lastCleanup > 5000) {
      if (lobby.cleanup(timestamp)) broadcastLobby();
      lastCleanup = timestamp;
    }
  }, 1000 / RULES.tickRate);
  timer.unref();

  return {
    app, httpServer, io, lobby,
    close: () => new Promise((resolve) => {
      clearInterval(timer);
      io.close(() => {
        if (httpServer.listening) httpServer.close(resolve);
        else resolve();
      });
    }),
  };
}
