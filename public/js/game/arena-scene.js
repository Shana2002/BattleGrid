import { CHARACTERS, PALETTE, WEAPONS, ZOMBIES, getCharacter } from "../../shared/catalog.js";
import { characterSheet, FRAME_WIDTH, FRAME_HEIGHT } from "./characters.js";
import { zombieSheet } from "./zombies.js";
import { terrainCanvas } from "./terrain.js";

const color = (hex) => Number.parseInt(hex.slice(1), 16);
const P = Object.fromEntries(Object.entries(PALETTE).map(([key, hex]) => [key, color(hex)]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createArenaGame({ parent, playerId, initialState, sendInput, audio, onReady }) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let snapshot = initialState;
  let scene;
  let inputEnabled = true;
  let touchState = {};
  const queuedEvents = [];

  class ArenaScene extends Phaser.Scene {
    constructor() {
      super("Arena");
      this.playerObjects = new Map();
      this.zombieObjects = new Map();
      this.bulletObjects = new Map();
      this.pickupObjects = new Map();
      this.nextInputAt = 0;
      this.aimAngle = 0;
      this.aimMode = "keyboard";
      this.lastStateAt = 0;
      this.ready = false;
    }

    create() {
      scene = this;
      for (const character of CHARACTERS) {
        const key = `operator-${character.id}`;
        this.textures.addSpriteSheet(key, characterSheet(character), { frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT });
        this.anims.create({ key: `walk-${character.id}`, frames: this.anims.generateFrameNumbers(key, { start: 0, end: 7 }), frameRate: 12, repeat: -1 });
        this.anims.create({ key: `idle-${character.id}`, frames: this.anims.generateFrameNumbers(key, { start: 8, end: 11 }), frameRate: 4, repeat: -1 });
        this.anims.create({ key: `fire-${character.id}`, frames: this.anims.generateFrameNumbers(key, { start: 12, end: 15 }), frameRate: 24, repeat: 0 });
      }
      for (const kind of Object.keys(ZOMBIES)) {
        const key = `zombie-${kind}`;
        this.textures.addSpriteSheet(key, zombieSheet(kind), { frameWidth: FRAME_WIDTH, frameHeight: FRAME_HEIGHT });
        this.anims.create({ key: `zombie-walk-${kind}`, frames: this.anims.generateFrameNumbers(key, { start: 0, end: 7 }), frameRate: kind === "runner" ? 15 : 9, repeat: -1 });
        this.anims.create({ key: `zombie-idle-${kind}`, frames: this.anims.generateFrameNumbers(key, { start: 8, end: 11 }), frameRate: 4, repeat: -1 });
        this.anims.create({ key: `zombie-attack-${kind}`, frames: this.anims.generateFrameNumbers(key, { start: 12, end: 15 }), frameRate: 16, repeat: 0 });
      }
      this.drawWorld(initialState.map);
      this.cameraTarget = this.add.zone(initialState.map.width / 2, initialState.map.height / 2, 1, 1);
      this.cameras.main.setBounds(0, 0, initialState.map.width, initialState.map.height);
      this.cameras.main.setZoom(1);
      this.cameras.main.startFollow(this.cameraTarget, true, 0.12, 0.12);
      if (!reducedMotion) this.cameras.main.fadeIn(180, 21, 23, 26);
      this.keys = this.input.keyboard.addKeys({
        up: "W", down: "S", left: "A", right: "D", aimUp: "UP", aimDown: "DOWN",
        aimLeft: "LEFT", aimRight: "RIGHT", shoot: "SPACE", sprint: "SHIFT", reload: "R",
      });
      this.input.on("pointermove", (pointer) => { if (!pointer.wasTouch) this.aimMode = "mouse"; });
      this.input.on("wheel", (_pointer, _objects, _dx, dy) => {
        if (inputEnabled) this.cameras.main.setZoom(clamp(this.cameras.main.zoom - dy * 0.001, 0.75, 1.35));
      });
      this.reticle = this.add.graphics().setDepth(1000);
      this.reticle.lineStyle(1.5, P.white, 0.9);
      this.reticle.strokeCircle(0, 0, 8);
      this.reticle.lineBetween(-13, 0, -5, 0);
      this.reticle.lineBetween(5, 0, 13, 0);
      this.reticle.lineBetween(0, -13, 0, -5);
      this.reticle.lineBetween(0, 5, 0, 13);
      this.reticle.fillStyle(P.infoBg);
      this.reticle.fillCircle(0, 0, 2);
      this.ready = true;
      this.applyState(snapshot);
      for (const event of queuedEvents.splice(0)) this.effect(event);
      onReady?.();
    }

    drawWorld(map) {
      this.cameras.main.setBackgroundColor(map.terrain.floor);
      this.textures.addCanvas("arena-floor", terrainCanvas(map, initialState.mode));
      this.add.image(0, 0, "arena-floor").setOrigin(0).setDepth(-10);
    }

    makePlayer(player) {
      const local = player.id === playerId;
      const ally = initialState.mode === "zombies" && !local;
      const character = getCharacter(player.character);
      const ring = this.add.ellipse(0, 13, 42, 20, local ? P.info : ally ? P.ok : P.danger, 0.2)
        .setStrokeStyle(1.5, local ? P.infoBg : ally ? P.okBg : P.danger, 0.8);
      const shadow = this.add.ellipse(0, 14, 34, 12, P.ink, 0.7);
      const sprite = this.add.sprite(0, 0, `operator-${player.character}`, 8).setOrigin(0.5, 0.65).setScale(1.15);
      const name = this.add.text(0, -62, `${player.name}${local ? " · YOU" : ""}`, {
        fontFamily: "sans-serif", fontSize: "13px", fontStyle: local ? "bold" : "normal",
        color: local ? PALETTE.infoBg : PALETTE.paper, stroke: PALETTE.ink, strokeThickness: 4,
      }).setOrigin(0.5);
      const healthBackground = this.add.rectangle(0, -43, 42, 4, P.ink);
      const health = this.add.rectangle(-21, -43, 42, 4, P.okBg).setOrigin(0, 0.5);
      const shield = this.add.circle(0, -5, 32).setStrokeStyle(1.5, P.infoBg, 0.65).setVisible(false);
      const root = this.add.container(player.x, player.y, [ring, shadow, shield, sprite, name, healthBackground, health]);
      root.setDepth(player.y + 10);
      const object = { root, sprite, name, health, ring, shield, character, target: player, firingUntil: 0, lastDustAt: 0 };
      this.playerObjects.set(player.id, object);
      return object;
    }

    makeZombie(zombie) {
      const definition = ZOMBIES[zombie.kind];
      const brute = zombie.kind === "brute";
      const width = brute ? 50 : 34;
      const ring = this.add.ellipse(0, 13, width + 10, 20, P.danger, 0.25).setStrokeStyle(1, P.danger, 0.8);
      const shadow = this.add.ellipse(0, 14, width, 12, P.ink, 0.55);
      const sprite = this.add.sprite(0, 0, `zombie-${zombie.kind}`, 8).setOrigin(0.5, 0.65).setScale(brute ? 1.45 : 1.1);
      const label = this.add.text(0, brute ? -76 : -59, definition.name.toUpperCase(), {
        fontFamily: "monospace", fontSize: "10px", color: definition.eyes, stroke: PALETTE.ink, strokeThickness: 3,
      }).setOrigin(0.5);
      const healthBackground = this.add.rectangle(0, brute ? -58 : -43, width, 3, P.ink);
      const health = this.add.rectangle(-width / 2, brute ? -58 : -43, width, 3, color(definition.skin)).setOrigin(0, 0.5);
      const root = this.add.container(zombie.x, zombie.y, [ring, shadow, sprite, label, healthBackground, health]);
      const object = { root, sprite, health, width, target: zombie, attackingUntil: 0 };
      this.zombieObjects.set(zombie.id, object);
      return object;
    }

    makePickup(pickup) {
      const accent = pickup.type === "health" ? P.okBg : pickup.type === "ammo" ? P.warnBg : P.infoBg;
      const solid = pickup.type === "health" ? P.ok : pickup.type === "ammo" ? P.warn : P.info;
      const halo = this.add.circle(0, 0, 23, solid, 0.22);
      const base = this.add.circle(0, 0, 17, solid, 0.95).setStrokeStyle(2, accent, 0.9);
      const icon = this.add.graphics();
      icon.fillStyle(accent);
      if (pickup.type === "health") {
        icon.fillRect(-3, -9, 6, 18);
        icon.fillRect(-9, -3, 18, 6);
      } else if (pickup.type === "ammo") {
        for (const x of [-7, 0, 7]) { icon.fillRect(x - 2, -5, 4, 12); icon.fillTriangle(x - 2, -5, x + 2, -5, x, -9); }
      } else {
        icon.fillRect(-11, -4, 20, 5);
        icon.fillRect(7, -3, 6, 2);
        icon.fillRect(-3, 0, 4, 7);
      }
      const label = this.add.text(0, 29, pickup.type === "weapon" ? WEAPONS[pickup.weapon].name.toUpperCase() : pickup.type === "health" ? "+ HEALTH" : "+ AMMO", {
        fontFamily: "monospace", fontSize: "10px", color: PALETTE.silver, stroke: PALETTE.ink, strokeThickness: 3,
      }).setOrigin(0.5);
      const root = this.add.container(pickup.x, pickup.y, [halo, base, icon, label]).setDepth(1);
      if (!reducedMotion) this.tweens.add({ targets: icon, y: -4, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.inOut" });
      this.pickupObjects.set(pickup.id, root);
    }

    applyState(state) {
      if (!this.ready) return;
      this.lastStateAt = performance.now();
      const playerIds = new Set(state.players.map((player) => player.id));
      for (const [id, object] of this.playerObjects) {
        if (!playerIds.has(id)) { object.root.destroy(true); this.playerObjects.delete(id); }
      }
      for (const player of state.players) {
        const object = this.playerObjects.get(player.id) ?? this.makePlayer(player);
        object.target = player;
        object.health.displayWidth = 42 * (player.health / player.maxHealth);
        object.health.fillColor = player.health / player.maxHealth < 0.3 ? P.danger : P.okBg;
        object.shield.setVisible(player.spawnProtected);
        object.ring.setVisible(player.alive);
        object.root.setAlpha(player.alive ? 1 : 0.25);
        if (Math.hypot(object.root.x - player.x, object.root.y - player.y) > 160) object.root.setPosition(player.x, player.y);
      }
      const zombieIds = new Set((state.zombies ?? []).map((zombie) => zombie.id));
      for (const [id, object] of this.zombieObjects) {
        if (!zombieIds.has(id)) { object.root.destroy(true); this.zombieObjects.delete(id); }
      }
      for (const zombie of state.zombies ?? []) {
        const object = this.zombieObjects.get(zombie.id) ?? this.makeZombie(zombie);
        object.target = zombie;
        object.health.displayWidth = object.width * zombie.health / zombie.maxHealth;
      }
      const bulletIds = new Set(state.bullets.map((bullet) => bullet.id));
      for (const [id, object] of this.bulletObjects) {
        if (!bulletIds.has(id)) { object.sprite.destroy(); this.bulletObjects.delete(id); }
      }
      for (const bullet of state.bullets) {
        let object = this.bulletObjects.get(bullet.id);
        if (!object) {
          const sprite = this.add.rectangle(bullet.x, bullet.y, 15, 3, bullet.owner === playerId ? P.infoBg : P.warnBg)
            .setRotation(bullet.angle).setDepth(3000);
          object = { sprite, target: bullet };
          this.bulletObjects.set(bullet.id, object);
        }
        object.target = bullet;
      }
      const pickupIds = new Set(state.pickups.map((pickup) => pickup.id));
      for (const [id, object] of this.pickupObjects) {
        if (!pickupIds.has(id)) { this.tweens.killTweensOf(object.list); object.destroy(true); this.pickupObjects.delete(id); }
      }
      for (const pickup of state.pickups) if (!this.pickupObjects.has(pickup.id)) this.makePickup(pickup);
    }

    burst(x, y, tint, count = 5, distance = 26) {
      if (reducedMotion) return;
      for (let index = 0; index < count; index += 1) {
        const angle = (index / count) * Math.PI * 2 + Math.random();
        const particle = this.add.rectangle(x, y, 3, 3, tint).setDepth(4000);
        this.tweens.add({
          targets: particle, x: x + Math.cos(angle) * distance, y: y + Math.sin(angle) * distance,
          alpha: 0, angle: 120, duration: 260 + Math.random() * 150,
          onComplete: () => particle.destroy(),
        });
      }
    }

    effect(event) {
      if (!this.ready) { queuedEvents.push(event); return; }
      const object = this.playerObjects.get(event.playerId);
      const zombie = this.zombieObjects.get(event.zombieId);
      if (event.type === "shot") {
        if (object) {
          object.firingUntil = performance.now() + 130;
          if (!reducedMotion) object.sprite.play(`fire-${object.character.id}`, true);
        }
        const x = event.x + Math.cos(event.angle) * 35;
        const y = event.y + Math.sin(event.angle) * 35 - 6;
        const flash = this.add.star(x, y, 4, 3, 10, P.warnBg).setRotation(event.angle).setDepth(4000);
        this.tweens.add({ targets: flash, alpha: 0, scale: 0.2, duration: 85, onComplete: () => flash.destroy() });
        if (event.playerId === playerId) audio.play("shot");
      } else if (event.type === "hit") {
        this.burst(event.x, event.y, P.danger, 6, 22);
        if (object) {
          object.sprite.setTintFill(P.dangerBg);
          this.time.delayedCall(90, () => { if (object.sprite.active) object.sprite.clearTint(); });
        }
        if (event.byId === playerId) {
          const text = this.add.text(event.x, event.y - 35, `−${event.damage}`, {
            fontFamily: "monospace", fontSize: "16px", color: PALETTE.dangerBg, stroke: PALETTE.ink, strokeThickness: 3,
          }).setOrigin(0.5).setDepth(5000);
          this.tweens.add({ targets: text, y: event.y - 65, alpha: 0, duration: reducedMotion ? 150 : 550, onComplete: () => text.destroy() });
          audio.play("hit");
        }
        if (event.playerId === playerId && !reducedMotion) this.cameras.main.shake(100, 0.003);
      } else if (event.type === "zombie-hit") {
        this.burst(event.x, event.y, color(ZOMBIES[event.kind].skin), 6, 24);
        if (zombie && !reducedMotion) {
          zombie.sprite.setTintFill(P.okBg);
          this.time.delayedCall(85, () => { if (zombie.sprite.active) zombie.sprite.clearTint(); });
        }
        if (event.byId === playerId) audio.play("hit");
      } else if (event.type === "zombie-kill") {
        this.burst(event.x, event.y, color(ZOMBIES[event.kind].skin), 12, 48);
        if (event.byId === playerId) {
          const points = this.add.text(event.x, event.y - 35, `+${event.points}`, {
            fontFamily: "monospace", fontSize: "17px", color: PALETTE.okBg, stroke: PALETTE.ink, strokeThickness: 3,
          }).setOrigin(0.5).setDepth(5000);
          if (reducedMotion) this.time.delayedCall(200, () => points.destroy());
          else this.tweens.add({ targets: points, y: event.y - 65, alpha: 0, duration: 650, onComplete: () => points.destroy() });
        }
      } else if (event.type === "zombie-attack") {
        if (zombie && !reducedMotion) {
          zombie.attackingUntil = performance.now() + 250;
          zombie.sprite.play(`zombie-attack-${event.kind}`, true);
        }
        if (event.playerId === playerId) audio.play("zombie");
      } else if (event.type === "zombie-spawn") {
        this.burst(event.x, event.y, color(ZOMBIES[event.kind].shade), 8, 30);
      } else if (event.type === "wave-start" || event.type === "wave-clear") {
        audio.play(event.type === "wave-clear" ? "clear" : "wave");
      } else if (event.type === "impact") {
        this.burst(event.x, event.y, event.zombieHit ? P.okBg : event.playerHit ? P.dangerBg : P.silver, 3, 15);
      } else if (event.type === "elimination") {
        this.burst(event.x, event.y, P.danger, 14, 60);
        if (object) object.sprite.setAngle(80);
      } else if (event.type === "spawn") {
        if (object) object.sprite.setAngle(0);
        const ring = this.add.circle(event.x, event.y, 12).setStrokeStyle(2, P.infoBg, 0.8).setDepth(3000);
        this.tweens.add({ targets: ring, radius: 60, alpha: 0, duration: reducedMotion ? 150 : 550, onComplete: () => ring.destroy() });
        if (event.playerId === playerId) audio.play("spawn");
      } else if (event.type === "pickup") {
        this.burst(event.x, event.y, event.kind === "health" ? P.okBg : P.infoBg, 8, 35);
        if (event.playerId === playerId) audio.play("pickup");
      }
    }

    update(time, delta) {
      if (!this.ready) return;
      const realTime = performance.now();
      const local = this.playerObjects.get(playerId);
      const enabled = inputEnabled && document.hasFocus() && local?.target.alive;
      const pointer = this.input.activePointer;
      // Phaser also tracks touches on HTML controls as left-button presses.
      // Only canvas-origin mouse clicks fire here; touch fire has its own control.
      const mouseFire = !pointer.wasTouch && pointer.isDown && pointer.downElement === this.game.canvas && pointer.leftButtonDown();
      this.input.keyboard.enabled = Boolean(enabled);
      const keys = this.keys;
      const aimX = Number(Boolean(keys.aimRight.isDown || touchState.right)) - Number(Boolean(keys.aimLeft.isDown || touchState.left));
      const aimY = Number(Boolean(keys.aimDown.isDown || touchState.down)) - Number(Boolean(keys.aimUp.isDown || touchState.up));
      if (enabled && (aimX || aimY)) {
        this.aimAngle = Math.atan2(aimY, aimX);
        this.aimMode = "keyboard";
      } else if (enabled && this.aimMode === "mouse" && local) {
        this.aimAngle = Math.atan2(pointer.worldY - local.root.y, pointer.worldX - local.root.x);
      }
      if (time >= this.nextInputAt) {
        sendInput({
          up: Boolean(enabled && (keys.up.isDown || touchState.up)), down: Boolean(enabled && (keys.down.isDown || touchState.down)),
          left: Boolean(enabled && (keys.left.isDown || touchState.left)), right: Boolean(enabled && (keys.right.isDown || touchState.right)),
          sprint: Boolean(enabled && keys.sprint.isDown), reload: Boolean(enabled && (keys.reload.isDown || touchState.reload)),
          shoot: Boolean(enabled && (keys.shoot.isDown || touchState.shoot || mouseFire)),
          angle: this.aimAngle,
        });
        this.nextInputAt = time + 1000 / 30;
      }
      for (const [id, object] of this.playerObjects) {
        const player = object.target;
        const factor = Math.min(1, (delta / 16.67) * (id === playerId ? 0.55 : 0.32));
        object.root.x += (player.x - object.root.x) * factor;
        object.root.y += (player.y - object.root.y) * factor;
        object.root.setDepth(object.root.y + 10);
        object.sprite.setFlipX(Math.cos(id === playerId && enabled ? this.aimAngle : player.angle) < 0);
        if (player.alive) {
          object.sprite.setAngle(0);
          if (reducedMotion) { object.sprite.anims.stop(); object.sprite.setFrame(8); }
          else if (realTime > object.firingUntil) object.sprite.play(`${player.moving ? "walk" : "idle"}-${object.character.id}`, true);
          if (player.moving && !reducedMotion && time - object.lastDustAt > 180) {
            const dust = this.add.circle(object.root.x, object.root.y + 14, 3, P.silver, 0.2).setDepth(2);
            this.tweens.add({ targets: dust, alpha: 0, scale: 2, duration: 400, onComplete: () => dust.destroy() });
            object.lastDustAt = time;
          }
        } else object.sprite.anims.stop();
      }
      for (const object of this.zombieObjects.values()) {
        const zombie = object.target;
        const factor = Math.min(1, delta / 16.67 * 0.32);
        object.root.x += (zombie.x - object.root.x) * factor;
        object.root.y += (zombie.y - object.root.y) * factor;
        object.root.setDepth(object.root.y + 10);
        object.sprite.setFlipX(Math.cos(zombie.angle) < 0);
        if (reducedMotion) { object.sprite.anims.stop(); object.sprite.setFrame(8); }
        else if (realTime > object.attackingUntil) object.sprite.play(`zombie-${zombie.moving ? "walk" : "idle"}-${zombie.kind}`, true);
      }
      const elapsed = Math.min((realTime - this.lastStateAt) / 1000, 0.06);
      for (const object of this.bulletObjects.values()) {
        object.sprite.setPosition(object.target.x + object.target.vx * elapsed, object.target.y + object.target.vy * elapsed);
      }
      const follow = local?.target.alive ? local : [...this.playerObjects.values()].find((object) => object.target.alive) ?? local;
      if (follow) this.cameraTarget.setPosition(follow.root.x, follow.root.y);
      if (local && enabled) {
        this.reticle.setVisible(true).setPosition(local.root.x + Math.cos(this.aimAngle) * 85, local.root.y + Math.sin(this.aimAngle) * 85);
      } else this.reticle.setVisible(false);
    }
  }

  const game = new Phaser.Game({
    // This pixel-art arena only needs 2D rendering; it also works without a GPU.
    type: Phaser.CANVAS, parent, backgroundColor: PALETTE.ink,
    pixelArt: true, roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth, height: parent.clientHeight },
    render: { antialias: false }, scene: ArenaScene,
  });

  return {
    setState(state) { snapshot = state; scene?.applyState(state); },
    setTouchInput(input) { touchState = { ...input }; },
    event(event) { if (scene?.ready) scene.effect(event); else if (queuedEvents.length < 100) queuedEvents.push(event); },
    setInputEnabled(enabled) {
      inputEnabled = enabled;
      if (scene?.input.keyboard) {
        scene.input.keyboard.resetKeys();
        if (enabled) scene.input.keyboard.addCapture("W,S,A,D,UP,DOWN,LEFT,RIGHT,SPACE,SHIFT,R");
        else scene.input.keyboard.clearCaptures();
      }
      if (!enabled) { touchState = {}; sendInput({ angle: scene?.aimAngle ?? 0 }); }
    },
    destroy() { sendInput({}); game.destroy(true); scene = null; },
  };
}
