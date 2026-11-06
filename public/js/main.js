import { CHARACTERS, MODES, SERVERS, PALETTE, WEAPONS, ZOMBIES, getCharacter, getMode, getServer, roomCapacity } from "../shared/catalog.js";
import { hydratePortraits } from "./game/characters.js";
import { createArenaGame } from "./game/arena-scene.js";
import { GameAudio } from "./game/audio.js";

const $ = (id) => document.getElementById(id);
const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing can disable storage. */ } },
};
const savedProfile = storage.get("battlegrid.profile", {});
let selectedCharacter = getCharacter(savedProfile.character) ? savedProfile.character : "vanguard";
let selectedServer = storage.get("battlegrid.server", "outpost");
if (!getServer(selectedServer)) selectedServer = "outpost";
let selectedMode = storage.get("battlegrid.mode", "arena");
if (!getMode(selectedMode)) selectedMode = "arena";
let profile = null;
let sessionActive = false;
let rejoining = false;
let lobbyData = null;
let currentRoom = null;
let currentState = null;
let arenaGame = null;
let paused = false;
let lastAlive = true;
let scoreboardKey = "";
let inviteFromUrl = new URLSearchParams(location.search).get("room");
let touchInput = {};
const audio = new GameAudio(storage.get("battlegrid.sound", false) === true);
const socket = io({ autoConnect: false, reconnection: true, reconnectionDelay: 700, reconnectionDelayMax: 4000 });

function toast(message, type = "neutral") {
  const node = element("div", `toast ${type === "error" ? "toast-error" : type === "ok" ? "toast-ok" : ""}`);
  node.setAttribute("role", type === "error" ? "alert" : "status");
  const icon = element("span", "toast-icon", type === "error" ? "!" : type === "ok" ? "✓" : "◇");
  icon.setAttribute("aria-hidden", "true");
  node.append(icon, element("span", "", message));
  $("toast-stack").append(node);
  while ($("toast-stack").children.length > 3) $("toast-stack").firstElementChild.remove();
  setTimeout(() => node.remove(), type === "error" ? 6500 : 4200);
}

function setBusy(button, busy) {
  button.dataset.busy = String(busy);
  button.setAttribute("aria-busy", String(busy));
  button.disabled = busy || !socket.connected || rejoining;
}

function connectionStatus(connected, label = connected ? "Connected" : "Reconnecting") {
  $("connection-status").className = `badge ${connected ? "badge-ok" : "badge-warn"}`;
  $("connection-label").textContent = label;
  $("host-status").className = `badge ${connected ? "badge-ok" : "badge-warn"}`;
  $("host-status").textContent = connected ? "LIVE HOST" : "OFFLINE";
  for (const button of document.querySelectorAll("[data-requires-connection]")) {
    button.disabled = !connected || rejoining || button.dataset.busy === "true" || button.dataset.full === "true";
  }
  if (currentRoom && !connected) {
    $("connection-overlay").hidden = false;
    arenaGame?.setInputEnabled(false);
  }
  if (!connected) $("header-ping").textContent = "— ms";
  if (sessionActive && !currentRoom) renderServers();
}

function request(event, data = {}) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) { reject(new Error("The arena host is disconnected. Please wait for reconnection.")); return; }
    socket.timeout(6000).emit(event, data, (error, response) => {
      if (error) reject(new Error("The arena host did not respond. Please try again."));
      else if (!response?.ok) reject(new Error(response?.error || "That action could not be completed."));
      else resolve(response);
    });
  });
}

function rememberProfile() {
  storage.set("battlegrid.profile", { name: profile?.name ?? $("callsign").value, character: selectedCharacter });
}

function showScreen(name) {
  for (const screen of ["login", "lobby", "game"]) $(`${screen}-screen`).hidden = screen !== name;
  document.body.classList.toggle("in-game", name === "game");
  document.body.classList.toggle("in-zombies", name === "game" && currentRoom?.mode === "zombies");
  $("profile-switch").hidden = name !== "lobby";
  $("profile-name").textContent = profile?.name ?? "";
  if (name !== "game") {
    $("connection-overlay").hidden = true;
    $("main-content").focus({ preventScroll: true });
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }
}

function button(label, variant = "secondary") {
  const node = element("button", `btn btn-${variant}`, label);
  node.type = "button";
  return node;
}

function renderServers() {
  const activeId = document.activeElement?.dataset.serverId;
  const fragment = document.createDocumentFragment();
  for (const server of lobbyData?.servers ?? SERVERS) {
    const node = element("button", "server-option");
    node.type = "button";
    node.dataset.serverId = server.id;
    node.setAttribute("aria-pressed", String(server.id === selectedServer));
    const top = element("span", "server-top");
    top.append(element("span", "server-name", server.name), element("span", `badge ${socket.connected ? "badge-ok" : "badge-warn"}`, socket.connected ? "ONLINE" : "OFFLINE"));
    node.append(top, element("span", "meta-label", `${server.players ?? 0} players · ${server.rooms ?? 1} rooms`), element("span", "server-description", server.description));
    node.addEventListener("click", () => {
      selectedServer = server.id;
      storage.set("battlegrid.server", selectedServer);
      renderServers();
      renderRooms();
    });
    fragment.append(node);
  }
  $("server-list").replaceChildren(fragment);
  if (activeId) $("server-list").querySelector(`[data-server-id="${activeId}"]`)?.focus({ preventScroll: true });
  $("host-label").textContent = `HOST / ${location.host}`;
}

function renderCharacters() {
  const fragment = document.createDocumentFragment();
  for (const character of CHARACTERS) {
    const node = element("button", "operator-card");
    node.type = "button";
    node.dataset.characterId = character.id;
    node.setAttribute("aria-pressed", String(character.id === selectedCharacter));
    node.setAttribute("aria-label", `${character.name}: ${character.description} ${character.health} health.`);
    const portrait = element("span", "operator-portrait");
    const sprite = element("span", "operator-sprite");
    sprite.dataset.portrait = character.id;
    sprite.setAttribute("aria-hidden", "true");
    portrait.append(sprite);
    const specs = element("span", "operator-specs");
    specs.append(element("span", "", `${character.health} HP`), element("span", "", WEAPONS[character.weapon].name.toUpperCase()));
    node.append(portrait, element("span", "operator-name", character.name), element("span", `badge badge-${character.badge}`, character.role.toUpperCase()), element("span", "operator-trait", character.trait), specs);
    node.addEventListener("click", () => {
      selectedCharacter = character.id;
      for (const option of $("character-list").children) option.setAttribute("aria-pressed", String(option.dataset.characterId === selectedCharacter));
      rememberProfile();
      updateStarter();
    });
    fragment.append(node);
  }
  $("character-list").replaceChildren(fragment);
  hydratePortraits($("character-list"));
}

function renderModes() {
  const fragment = document.createDocumentFragment();
  for (const mode of MODES) {
    const node = element("button", `mode-card mode-${mode.id}`);
    node.type = "button";
    node.dataset.modeId = mode.id;
    node.setAttribute("aria-pressed", String(mode.id === selectedMode));
    const icon = element("span", "mode-icon", mode.icon);
    icon.setAttribute("aria-hidden", "true");
    const content = element("span", "mode-content");
    const heading = element("span", "mode-heading");
    heading.append(element("strong", "", mode.name), element("span", `badge badge-${mode.badge}`, mode.id === "zombies" ? "CO-OP" : "PVP"));
    content.append(heading, element("span", "mode-description", mode.description), element("span", "mode-detail meta-label", mode.detail));
    node.append(icon, content);
    node.addEventListener("click", () => {
      selectedMode = mode.id;
      storage.set("battlegrid.mode", selectedMode);
      for (const option of $("mode-list").children) option.setAttribute("aria-pressed", String(option.dataset.modeId === selectedMode));
      updateModeDetails();
      renderRooms();
    });
    fragment.append(node);
  }
  $("mode-list").replaceChildren(fragment);
  updateModeDetails();
}

function updateModeDetails() {
  const zombies = selectedMode === "zombies";
  $("quick-play-label").textContent = zombies ? "Survive now" : "Quick play";
  $("lobby-mode-description").textContent = zombies ? "Take on the horde solo, or invite your squad. How many waves can you survive?" : "Find a room, or make some room for your friends.";
  $("rooms-title").textContent = zombies ? "Find your squad." : "Find your people.";
  $("lobby-footnote").textContent = zombies ? "ENDLESS WAVES · NO FRIENDLY FIRE · SHARED TEAM SCORE · RESUPPLY & RETURN BETWEEN WAVES" :
    "5-MINUTE ROUNDS · ROOM-ONLY CHAT · LIVE SCOREBOARDS · RESPAWN & GO AGAIN";
}

function updateStarter() {
  $("starter-sprite").dataset.portrait = selectedCharacter;
  $("starter-name").textContent = getCharacter(selectedCharacter).name;
  hydratePortraits($("starter-sprite").parentElement);
}

function renderRooms() {
  const previousFocus = document.activeElement?.dataset.roomId;
  const server = getServer(selectedServer);
  $("selected-server-label").textContent = `${server.name} / ${getMode(selectedMode).label}`;
  const query = $("room-search").value.trim().toLowerCase();
  const rooms = (lobbyData?.rooms ?? []).filter((room) => room.serverId === selectedServer && room.mode === selectedMode && room.name.toLowerCase().includes(query));
  $("room-count").textContent = `${rooms.length} ${rooms.length === 1 ? "ROOM" : "ROOMS"}`;
  $("rooms-message").hidden = Boolean(lobbyData && rooms.length);
  if (!lobbyData) $("rooms-message").textContent = "Loading live rooms…";
  else if (!rooms.length) $("rooms-message").textContent = query ? "No matching rooms. Try a different name, or create your own." : "No public rooms here yet. Create one and invite your friends.";
  const fragment = document.createDocumentFragment();
  for (const room of rooms) {
    const card = element("article", "card room-card");
    card.dataset.mode = room.mode;
    const top = element("div", "room-card-top");
    top.append(element("h3", "room-name", room.name), element("span", `badge ${room.players && (room.mode === "zombies" || room.status === "Live") ? "badge-ok" : "badge-neutral"}`, room.status.toUpperCase()));
    const bottom = element("div", "room-card-bottom");
    const capacity = element("div");
    const occupancy = element("span", "occupancy");
    occupancy.setAttribute("aria-hidden", "true");
    for (let index = 0; index < room.capacity; index += 1) occupancy.append(element("span", index < room.players ? "occupied" : ""));
    capacity.append(element("span", "room-capacity", `${room.players} / ${room.capacity} players`), occupancy);
    const join = button(room.players >= room.capacity ? "Room full" : room.mode === "zombies" ? "Join squad →" : "Join match →");
    join.dataset.roomId = room.id;
    join.dataset.requiresConnection = "";
    join.dataset.full = String(room.players >= room.capacity);
    join.disabled = room.players >= room.capacity || !socket.connected || rejoining;
    join.setAttribute("aria-label", `Join ${room.name}, ${room.players} of ${room.capacity} players`);
    join.addEventListener("click", () => startMatch("room:join", { roomId: room.id }, join));
    bottom.append(capacity, join);
    card.append(top, element("p", "meta-label room-map", `${room.map} / ${getMode(room.mode).label}`), bottom);
    fragment.append(card);
  }
  $("room-list").replaceChildren(fragment);
  if (previousFocus) {
    const join = [...$("room-list").querySelectorAll("button")].find((node) => node.dataset.roomId === previousFocus);
    if (join && !join.disabled) join.focus({ preventScroll: true });
  }
}

function updateLobby(data) {
  lobbyData = { servers: data.servers, rooms: data.rooms };
  $("online-count").textContent = String(data.servers.reduce((total, server) => total + server.players, 0)).padStart(2, "0");
  if (sessionActive && !currentRoom) { renderServers(); renderRooms(); }
}

function showLobby(data = lobbyData) {
  if (data) updateLobby(data);
  showScreen("lobby");
  renderModes();
  renderServers();
  renderRooms();
  connectionStatus(socket.connected);
}

async function startMatch(event, data, sourceButton) {
  audio.unlock();
  if (sourceButton) setBusy(sourceButton, true);
  try {
    const response = await request(event, { ...data, character: selectedCharacter });
    enterGame(response);
  } catch (error) { toast(error.message, "error"); }
  finally { if (sourceButton) setBusy(sourceButton, false); }
}

function updateGameInput() {
  if (!arenaGame) return;
  const active = document.activeElement;
  const typing = active?.matches("input, textarea, select, button") && !active.closest(".touch-controls");
  arenaGame.setInputEnabled(socket.connected && !rejoining && !paused && !typing && !$("pause-dialog").open && !$("room-dialog").open);
}

function focusArena() {
  $("game-container").querySelector("canvas")?.focus({ preventScroll: true });
  updateGameInput();
}

function enterGame(response) {
  arenaGame?.destroy();
  if ($("room-dialog").open) $("room-dialog").close();
  if ($("pause-dialog").open) $("pause-dialog").close();
  currentRoom = response.state.room;
  currentState = response.state;
  selectedServer = currentRoom.serverId;
  selectedMode = currentRoom.mode;
  selectedCharacter = response.state.players.find((player) => player.id === response.playerId)?.character ?? selectedCharacter;
  storage.set("battlegrid.server", selectedServer);
  storage.set("battlegrid.mode", selectedMode);
  rememberProfile();
  paused = false;
  lastAlive = true;
  scoreboardKey = "";
  touchInput = {};
  showScreen("game");
  $("game-loading").hidden = false;
  $("connection-overlay").hidden = true;
  $("respawn-overlay").hidden = true;
  $("scoreboard").hidden = true;
  $("toggle-scoreboard").setAttribute("aria-expanded", "false");
  $("chat-messages").replaceChildren();
  $("kill-feed").replaceChildren();
  $("game-room-name").textContent = currentRoom.name;
  const zombies = currentRoom.mode === "zombies";
  $("game-map-name").textContent = `${response.state.map.name.toUpperCase()} / ${getMode(currentRoom.mode).label}`;
  $("game-room-code").textContent = currentRoom.code;
  $("pause-room-code").textContent = currentRoom.code;
  $("minimap-label").textContent = response.state.map.name;
  $("minimap-legend").textContent = zombies ? "● YOU · ● SQUAD · ■ HORDE" : "● YOU · ● ENEMIES";
  $("minimap").setAttribute("aria-label", zombies ? "Map showing you, your squad, and zombie positions" : "Map showing your position and enemy players");
  $("survival-hud").hidden = !zombies;
  $("respawn-button").hidden = zombies;
  $("respawn-title").textContent = "Down. Not out.";
  $("respawn-hint").textContent = "Your scoreboard stays. Your next chance is coming.";
  $("scoreboard-title").textContent = zombies ? "Squad survival" : "This round";
  $("scoreboard-kills").textContent = zombies ? "Z" : "K";
  $("scoreboard-kills").setAttribute("aria-label", zombies ? "Zombie kills" : "Eliminations");
  $("scoreboard-hint").textContent = zombies ? "Zombie kills and deaths this run. Every kill contributes to your shared team score." : "Most eliminations wins. Ties favor fewer deaths.";
  appendChat({ system: true, text: `Welcome to ${currentRoom.name}. Share code ${currentRoom.code} with your friends.` });
  if (zombies) appendChat({ system: true, text: "Survive together. No friendly fire. Fallen teammates return when a wave clears; a squad wipe starts a new run." });
  arenaGame = createArenaGame({
    parent: $("game-container"), playerId: response.playerId, initialState: response.state, audio,
    sendInput: (input) => { if (socket.connected && currentRoom) socket.volatile.emit("game:input", input); },
    onReady() {
      $("game-loading").hidden = true;
      const canvas = $("game-container").querySelector("canvas");
      if (canvas) {
        canvas.tabIndex = 0;
        canvas.setAttribute("aria-label", "BattleGrid arena. WASD to move, mouse or arrows to aim, click or Space to fire.");
        canvas.addEventListener("pointerdown", () => canvas.focus({ preventScroll: true }));
      }
      focusArena();
    },
  });
  updateHud(response.state);
  renderMinimap(response.state);
}

function updateHud(state) {
  if (!currentRoom) return;
  const player = state.players.find((item) => item.id === socket.id);
  const zombies = currentRoom.mode === "zombies";
  $("game-player-count").textContent = `${state.players.length} / ${currentRoom.capacity} ${zombies ? "SQUAD" : "PLAYERS"}`;
  const seconds = Math.max(0, Math.ceil((zombies ? state.survival.nextWaveIn : state.roundRemaining) / 1000));
  $("round-timer").textContent = zombies && state.survival.phase === "active" ? `WAVE ${state.survival.wave}` :
    `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  $("round-timer").setAttribute("aria-label", zombies ? state.survival.phase === "active" ? `Wave ${state.survival.wave}` : `Next wave or run in ${seconds} seconds` : `${seconds} seconds remaining in round`);
  if (zombies) updateSurvivalHud(state);
  if (player) {
    const character = getCharacter(player.character);
    $("hud-name").textContent = player.name;
    $("hud-operator").textContent = character.name.toUpperCase();
    $("hud-operator").className = `badge badge-${character.badge}`;
    $("player-hud").dataset.characterId = character.id;
    $("hud-health").textContent = `${player.health} / ${player.maxHealth}`;
    $("health-fill").style.width = `${(player.health / player.maxHealth) * 100}%`;
    $("health-bar").classList.toggle("is-low", player.health < player.maxHealth * 0.3);
    $("health-bar").setAttribute("aria-valuemax", player.maxHealth);
    $("health-bar").setAttribute("aria-valuenow", player.health);
    $("stamina-fill").style.width = `${player.stamina}%`;
    $("stamina-bar").setAttribute("aria-valuenow", player.stamina);
    $("hud-weapon").textContent = WEAPONS[player.weapon].name.toUpperCase();
    $("hud-ammo").textContent = player.ammo;
    $("hud-reserve").textContent = `/ ${player.reserve}`;
    $("hud-reload").textContent = player.reloadRemaining ? `RELOADING ${(player.reloadRemaining / 1000).toFixed(1)}s` : player.spawnProtected ? "SPAWN PROTECTED" : player.sprinting ? "SPRINTING" : "R TO RELOAD";
    $("hud-reload").classList.toggle("is-reloading", player.reloadRemaining > 0);
    $("respawn-overlay").hidden = player.alive;
    if (!player.alive) {
      if (zombies) {
        const over = state.survival.phase === "gameover";
        $("respawn-title").textContent = over ? "Squad wiped." : "Hold the line.";
        $("eliminated-by").textContent = over ? `${state.survival.wavesCleared} waves cleared. ${state.survival.score.toLocaleString()} team points. Ready for another run?` :
          "Watching your squad. Clear the wave to get everyone back in the fight.";
        $("respawn-hint").textContent = over ? `Everyone returns in ${seconds}s. The next survival run starts automatically.` : "Fallen operators automatically return when the wave is cleared.";
      } else {
        const wait = Math.ceil(player.respawnRemaining / 1000);
        $("respawn-button").textContent = wait > 0 ? `Reinsert in ${wait}s` : "Respawn & go again →";
        $("respawn-button").disabled = wait > 0 || !socket.connected || $("respawn-button").dataset.busy === "true";
      }
    }
    if (player.alive !== lastAlive) { lastAlive = player.alive; updateGameInput(); }
  }
  const key = JSON.stringify(state.leaderboard);
  if (key !== scoreboardKey) {
    scoreboardKey = key;
    const rows = document.createDocumentFragment();
    for (const [index, item] of state.leaderboard.entries()) {
      const row = element("tr", item.id === socket.id ? "is-you" : "");
      row.append(element("td", "", `${index + 1}. ${item.name}${item.id === socket.id ? " (you)" : ""}${zombies && !item.alive ? " · down" : ""}`), element("td", "", item.kills), element("td", "", item.deaths));
      rows.append(row);
    }
    $("scoreboard-body").replaceChildren(rows);
  }
}

function updateSurvivalHud(state) {
  const survival = state.survival;
  const phases = { preparing: ["PREPARE", "info"], active: ["HORDE ACTIVE", "danger"], intermission: ["RESUPPLY", "ok"], gameover: ["SQUAD DOWN", "danger"] };
  const [label, badge] = phases[survival.phase];
  $("survival-phase").textContent = label;
  $("survival-phase").className = `badge badge-${badge}`;
  $("survival-wave").textContent = `${survival.phase === "intermission" ? "NEXT " : ""}WAVE ${Math.max(1, survival.wave + (survival.phase === "intermission" ? 1 : 0))}`;
  $("survival-remaining").textContent = survival.remaining;
  $("survival-score").textContent = survival.score.toLocaleString();
  $("survival-alive").textContent = `${state.players.filter((player) => player.alive).length}/${state.players.length}`;
  const progress = survival.total ? Math.round((survival.total - survival.remaining) / survival.total * 100) : 0;
  $("wave-progress-fill").style.width = `${progress}%`;
  $("wave-progress").setAttribute("aria-valuenow", progress);
  $("wave-progress").setAttribute("aria-valuetext", `${survival.total - survival.remaining} of ${survival.total} zombies cleared`);
  const seconds = Math.ceil(survival.nextWaveIn / 1000);
  $("survival-status").textContent = survival.phase === "active" ? "Clear every hostile. Watch each other's backs." :
    survival.phase === "gameover" ? `New run in ${seconds}s. Everyone returns together.` :
    survival.phase === "intermission" ? `Health + ammo resupplied. Next wave in ${seconds}s.` : `Wave 1 arrives in ${seconds}s. Stick together.`;
}

function renderMinimap(state) {
  const map = currentState?.map;
  if (!map) return;
  const canvas = $("minimap");
  const ctx = canvas.getContext("2d");
  const sx = canvas.width / map.width;
  const sy = canvas.height / map.height;
  ctx.fillStyle = map.terrain.floor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = map.terrain.tile;
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
  for (const wall of map.walls) {
    ctx.fillStyle = map.terrain.wallTop;
    ctx.fillRect((wall.x - wall.width / 2) * sx, (wall.y - wall.height / 2) * sy, wall.width * sx, wall.height * sy);
  }
  for (const player of state.players) {
    if (!player.alive) continue;
    ctx.beginPath();
    ctx.arc(player.x * sx, player.y * sy, player.id === socket.id ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = player.id === socket.id ? PALETTE.infoBg : currentRoom.mode === "zombies" ? "#a4efb6" : "#ff967f";
    ctx.fill();
    if (player.id === socket.id) { ctx.strokeStyle = PALETTE.info; ctx.lineWidth = 2; ctx.stroke(); }
  }
  for (const zombie of state.zombies ?? []) {
    const size = zombie.kind === "brute" ? 5 : 3;
    ctx.fillStyle = zombie.kind === "runner" ? "#ffd176" : "#ff967f";
    ctx.fillRect(zombie.x * sx - size / 2, zombie.y * sy - size / 2, size, size);
  }
}

function appendChat(message) {
  if (!currentRoom || (message.roomId && message.roomId !== currentRoom.id)) return;
  const node = element("div", `chat-message ${message.system ? "is-system" : ""}`);
  if (!message.system) node.append(element("strong", "", `${message.name}:`));
  node.append(element("span", "", message.text));
  $("chat-messages").append(node);
  while ($("chat-messages").children.length > 40) $("chat-messages").firstElementChild.remove();
  $("chat-messages").scrollTop = $("chat-messages").scrollHeight;
}

function handleGameEvent(event) {
  if (!currentRoom || (event.roomId && event.roomId !== currentRoom.id)) return;
  arenaGame?.event(event);
  if (event.type === "elimination") {
    const node = element("div", `kill-message ${event.byId === socket.id || event.playerId === socket.id ? "is-you" : ""}`, `${event.killerName} → ${event.playerName}`);
    $("kill-feed").prepend(node);
    while ($("kill-feed").children.length > 4) $("kill-feed").lastElementChild.remove();
    setTimeout(() => node.remove(), 6000);
    if (event.playerId === socket.id) $("eliminated-by").textContent = `Eliminated by ${event.killerName}. Try a new angle.`;
  } else if (event.type === "round") {
    toast(event.leaders[0]?.kills ? `${event.leaders[0].name} wins round ${event.round} with ${event.leaders[0].kills} eliminations. New round!` : "New round. Fresh start. Let's go.");
  } else if (event.type === "pickup" && event.playerId === socket.id && event.kind === "weapon") {
    toast(`${WEAPONS[event.weapon].name} equipped.`, "ok");
  } else if (event.type === "zombie-kill") {
    const node = element("div", "kill-message is-coop", `${event.killerName} → ${ZOMBIES[event.kind].name} +${event.points}`);
    $("kill-feed").prepend(node);
    while ($("kill-feed").children.length > 4) $("kill-feed").lastElementChild.remove();
    setTimeout(() => node.remove(), 4200);
  } else if (event.type === "wave-start") {
    toast(`Wave ${event.wave}: ${event.total} zombies. Stay together!`);
  } else if (event.type === "wave-clear") {
    toast(`Wave ${event.wave} cleared! +${event.bonus} team points. Health, ammo, and teammates restored.`, "ok");
  } else if (event.type === "survival-over") {
    toast(`Squad down. ${event.wavesCleared} waves cleared, ${event.score.toLocaleString()} team points. New run soon.`);
  } else if (event.type === "survival-restart") {
    toast("Fresh survival run. Get ready for wave 1!", "ok");
  }
}

function toggleScoreboard(force) {
  const open = force ?? $("scoreboard").hidden;
  $("scoreboard").hidden = !open;
  $("toggle-scoreboard").setAttribute("aria-expanded", String(open));
  focusArena();
}

function openPause() {
  if (!currentRoom || $("pause-dialog").open) return;
  paused = true;
  arenaGame?.setInputEnabled(false);
  $("pause-dialog").showModal();
  $("resume-game").focus();
}

function closePause() {
  paused = false;
  if ($("pause-dialog").open) $("pause-dialog").close();
  focusArena();
}

async function leaveMatch() {
  setBusy($("leave-match"), true);
  try {
    const data = socket.connected ? await request("room:leave") : lobbyData;
    arenaGame?.destroy();
    arenaGame = null;
    currentRoom = null;
    currentState = null;
    paused = false;
    if ($("pause-dialog").open) $("pause-dialog").close();
    showLobby(data);
  } catch (error) { toast(error.message, "error"); }
  finally { setBusy($("leave-match"), false); }
}

$("callsign").value = typeof savedProfile.name === "string" ? savedProfile.name.slice(0, 20) : "";
if (inviteFromUrl) $("invite-code").value = inviteFromUrl.toUpperCase().slice(0, 6);
hydratePortraits();
updateStarter();
renderCharacters();
renderModes();
renderServers();

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy($("login-button"), true);
  $("login-message").className = "form-hint";
  $("login-message").textContent = "Checking in…";
  $("login-message").removeAttribute("role");
  $("callsign").classList.remove("form-input-error");
  $("callsign").removeAttribute("aria-invalid");
  try {
    const data = await request("lobby:login", { name: $("callsign").value, character: selectedCharacter });
    profile = data.profile;
    sessionActive = true;
    rememberProfile();
    showLobby(data);
    if (inviteFromUrl) {
      const code = inviteFromUrl;
      inviteFromUrl = null;
      await startMatch("room:join-code", { code });
    }
  } catch (error) {
    $("login-message").className = "form-error";
    $("login-message").textContent = error.message;
    $("login-message").setAttribute("role", "alert");
    $("callsign").classList.add("form-input-error");
    $("callsign").setAttribute("aria-invalid", "true");
  } finally { setBusy($("login-button"), false); }
});

$("profile-switch").addEventListener("click", () => {
  sessionActive = false;
  $("callsign").value = profile?.name ?? "";
  $("login-message").textContent = "2–20 characters. Make it memorable.";
  $("login-message").className = "form-hint";
  $("login-message").removeAttribute("role");
  $("callsign").classList.remove("form-input-error");
  $("callsign").removeAttribute("aria-invalid");
  showScreen("login");
  $("callsign").focus();
});
$("quick-play").addEventListener("click", () => startMatch("room:quick-join", { serverId: selectedServer, mode: selectedMode }, $("quick-play")));
$("invite-form").addEventListener("submit", (event) => { event.preventDefault(); startMatch("room:join-code", { code: $("invite-code").value }, $("join-invite")); });
$("room-search").addEventListener("input", renderRooms);
$("refresh-rooms").addEventListener("click", async () => {
  setBusy($("refresh-rooms"), true);
  try { updateLobby(await request("lobby:list")); }
  catch (error) { toast(error.message, "error"); }
  finally { setBusy($("refresh-rooms"), false); }
});
$("open-room-dialog").addEventListener("click", () => {
  $("room-name").value = `${profile.name}'s room`.slice(0, 32);
  $("create-room-error").hidden = true;
  $("room-mode").value = selectedMode;
  updateRoomCapacity();
  $("room-dialog").showModal();
  $("room-name").focus();
  $("room-name").select();
});
function updateRoomCapacity() {
  const mode = getMode($("room-mode").value);
  const capacity = roomCapacity(getServer(selectedServer), mode);
  const options = [1, 2, 3, 4, 6, 8, 12, 16].filter((size) => size >= mode.minCapacity && size <= capacity).map((size) => {
    const option = element("option", "", size === 1 ? "Solo (1 player)" : `${size} players`);
    option.value = size;
    return option;
  });
  $("room-capacity").replaceChildren(...options);
  $("room-capacity").value = capacity;
  $("room-capacity-hint").textContent = mode.id === "zombies" ? "Play solo or with up to 4 survivors. No friendly fire." : `Up to ${capacity} operators on this map. Everyone is a rival.`;
}
$("room-mode").addEventListener("change", updateRoomCapacity);
$("close-room-dialog").addEventListener("click", () => $("room-dialog").close());
$("create-room-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setBusy($("create-room-submit"), true);
  $("create-room-error").hidden = true;
  audio.unlock();
  try {
    const response = await request("room:create", {
      serverId: selectedServer, mode: $("room-mode").value, name: $("room-name").value, capacity: Number($("room-capacity").value),
      private: $("room-private").checked, character: selectedCharacter,
    });
    enterGame(response);
  } catch (error) {
    $("create-room-error").textContent = error.message;
    $("create-room-error").hidden = false;
  } finally { setBusy($("create-room-submit"), false); }
});

$("chat-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = $("chat-input").value.trim();
  if (!text) return;
  setBusy($("send-chat"), true);
  try { await request("room:chat", { text }); $("chat-input").value = ""; focusArena(); }
  catch (error) { toast(error.message, "error"); }
  finally { setBusy($("send-chat"), false); }
});
$("copy-invite").addEventListener("click", async () => {
  if (!currentRoom) return;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set("room", currentRoom.code);
  try {
    await navigator.clipboard.writeText(url.href);
    toast(`Invite link copied. Room code: ${currentRoom.code}`, "ok");
  } catch { toast(`Room code: ${currentRoom.code}. Invite link: ${url.href}`); }
  finally { focusArena(); }
});
function updateSoundButton() {
  $("toggle-sound").textContent = audio.enabled ? "Sound on" : "Sound off";
  $("toggle-sound").setAttribute("aria-pressed", String(audio.enabled));
}
updateSoundButton();
$("toggle-sound").addEventListener("click", () => {
  audio.enabled = !audio.enabled;
  storage.set("battlegrid.sound", audio.enabled);
  audio.unlock();
  updateSoundButton();
  focusArena();
});
$("toggle-scoreboard").addEventListener("click", () => toggleScoreboard());
$("close-scoreboard").addEventListener("click", () => toggleScoreboard(false));
$("pause-game").addEventListener("click", openPause);
$("resume-game").addEventListener("click", closePause);
$("pause-dialog").addEventListener("cancel", (event) => { event.preventDefault(); closePause(); });
$("pause-dialog").addEventListener("close", () => { paused = false; updateGameInput(); });
$("leave-match").addEventListener("click", leaveMatch);
$("respawn-button").addEventListener("click", async () => {
  setBusy($("respawn-button"), true);
  try { await request("game:respawn"); focusArena(); }
  catch (error) { toast(error.message, "error"); }
  finally { setBusy($("respawn-button"), false); }
});
for (const dialog of [$("room-dialog"), $("pause-dialog")]) {
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
      if (dialog.id === "pause-dialog") closePause();
      else dialog.close();
    }
  });
}

document.addEventListener("focusin", updateGameInput);
document.addEventListener("focusout", () => queueMicrotask(updateGameInput));
window.addEventListener("blur", () => arenaGame?.setInputEnabled(false));
window.addEventListener("focus", updateGameInput);
document.addEventListener("keydown", (event) => {
  if (!currentRoom || $("room-dialog").open) return;
  const typing = document.activeElement?.matches("input, textarea, select");
  const interactive = document.activeElement?.matches("button, a, input, textarea, select");
  if (event.key === "Escape") {
    if (typing) { event.preventDefault(); focusArena(); }
    else if (!$("pause-dialog").open) { event.preventDefault(); openPause(); }
  } else if (event.key === "Enter" && !interactive && !$("pause-dialog").open) {
    event.preventDefault(); $("chat-input").focus();
  } else if (event.key.toLowerCase() === "l" && !typing && !$("pause-dialog").open) {
    event.preventDefault(); toggleScoreboard();
  }
});
for (const node of document.querySelectorAll("[data-touch]")) {
  node.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    node.setPointerCapture(event.pointerId);
    touchInput[node.dataset.touch] = true;
    node.classList.add("is-pressed");
    arenaGame?.setTouchInput(touchInput);
    audio.unlock();
  });
  const release = () => {
    touchInput[node.dataset.touch] = false;
    node.classList.remove("is-pressed");
    arenaGame?.setTouchInput(touchInput);
  };
  node.addEventListener("pointerup", release);
  node.addEventListener("pointercancel", release);
  node.addEventListener("lostpointercapture", release);
}

socket.on("lobby:update", updateLobby);
socket.on("game:state", (state) => {
  if (!currentRoom || state.roomId !== currentRoom.id) return;
  currentState = { ...state, map: currentState.map };
  arenaGame?.setState(state);
  updateHud(state);
  renderMinimap(state);
});
socket.on("game:event", handleGameEvent);
socket.on("room:message", appendChat);
socket.on("disconnect", () => connectionStatus(false));
socket.on("connect_error", () => connectionStatus(false, "Host unavailable"));
socket.on("connect", async () => {
  const connectionId = socket.id;
  rejoining = sessionActive;
  connectionStatus(true, rejoining ? "Rejoining" : "Connected");
  if (!sessionActive || !profile) return;
  const previousRoom = currentRoom;
  try {
    const data = await request("lobby:login", { name: profile.name, character: selectedCharacter });
    if (socket.id !== connectionId) return;
    profile = data.profile;
    updateLobby(data);
    if (previousRoom) {
      const joined = await request("room:join-code", { code: previousRoom.code, character: selectedCharacter });
      if (socket.id === connectionId) enterGame(joined);
    } else showLobby(data);
  } catch (error) {
    if (socket.id !== connectionId) return;
    arenaGame?.destroy();
    arenaGame = null;
    currentRoom = null;
    currentState = null;
    showLobby();
    toast(`${error.message} You can join another room.`, "error");
  } finally {
    if (socket.id === connectionId) {
      rejoining = false;
      connectionStatus(socket.connected);
      updateGameInput();
    }
  }
});

function measurePing() {
  if (!socket.connected) return;
  const started = performance.now();
  socket.timeout(3000).emit("game:ping", (error) => {
    if (!error) $("header-ping").textContent = `${Math.round(performance.now() - started)} ms`;
  });
}
socket.on("connect", measurePing);
setInterval(measurePing, 5000);
socket.connect();
