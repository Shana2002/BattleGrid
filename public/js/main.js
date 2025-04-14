const socket = io();
let players = {};
let playersContainer = {};
let bulletList = [];
let bulletContainer = {};
let gunSpawn = [],mediSpawn=[],bulletSpawn = [];
let gunContainer = {},mediSpawnContainer = {} , bulletSpawnListContainer = {};
let wallList = [];

setInterval(() => {
  const start = Date.now();
  socket.emit('ping-check', () => {
    const latency = Date.now() - start;
    console.log('Ping:', latency, 'ms');
  });
}, 5000);

socket.on("updateWalls",(walls)=>{
  // console.log("Hello");
  wallList = walls;
  // console.log(wallList);
})

const config = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight * 0.8, // 80% of viewport height
  parent: "game-container",
  physics: {
    default: "arcade",
    arcade: {
      gravity: { y: 0 },
      debug: true,
    },
  },
  scene: {
    preload: preload,
    create: create,
    update: update,
  },
};

let background,
  keys,
  player,
  cursors,
  wallGroup,
  enemyBulletTime = 0,
  bullets,
  bulletTime = 0,
  playerSide = "left",
  enemy,
  spacebar,
  enemyHP = 10,
  playerHP = 5;
const W = 1250,
  H = 660;
function preload() {
  this.load.image("wall", "./assets/wall.jpg");
  this.load.spritesheet("player", "./assets/move_spritesheet.png", {
    frameWidth: W / 5,
    frameHeight: H / 4,
  });
  this.load.image("enemy", "./assets/enemy.png");
  this.load.image("player1", "./assets/enemy.png");
  this.load.image("bullet", "./assets/bullet.png");
  this.load.image("background", "./assets/map-background.png");
  this.load.image("pistol", "./assets/pistol_icon.png");
  this.load.image("ak47", "./assets/ak47.webp");
  this.load.image("m16", "./assets/m16.jpg");
  this.load.image("medi", "./assets/medipack1.png");
  this.load.image("bulletpack", "./assets/bulletpack.png");
}

function create() {
  // Set a large world size (e.g., 3000x2000)
  this.physics.world.setBounds(0, 0, 5000, 5000);

  // Add background and scale it to match the world size
  background = this.add
    .image(1500, 1000, "background")
    .setDisplaySize(5000, 5000);

  this.anims.create({
    key: "move",
    frames: this.anims.generateFrameNumbers("player", { start: 19, end: 0 }), // Adjust frame range
    frameRate: 50,
    repeat: -1,
  });

  socket.on("updatePlayers", (serverPlayers) => {
    players = serverPlayers;
    // console.log(serverPlayers);
  });

  socket.on("updatePlayers", (serverPlayers) => {
    players = serverPlayers;
    for (let id in players) {
      if (id === socket.id) {
        document.getElementById(
          "player-hp"
        ).innerText = `${players[id].health}`;
        document.getElementById("player-gun").innerHTML = players[id].gun;
        document.getElementById("player-ammo").innerHTML = players[id].nBullets;
        // console.log(players[id])
      }
    }
  });

  socket.on("updateGun", (data) => {
    // console.log("Hello");
    // console.log(data);
    gunSpawn = data;
  });

  socket.on("updateMediPack", (data) => {
    // console.log("Hello");
    // console.log(data);
    mediSpawn = data;
  });

  socket.on("playerEliminated", (data) => {
    if (data.id === socket.id) {
      alert(`You have been eliminated by  ${data.killed}`);
      this.cameras.main.startFollow(playersContainer[data.killed].sprite, true, 0.1, 0.1);
    }
  });

  socket.on("updateBullets", (other) => {
    bulletList = other;
  });

  socket.on("updateBulletPack", (other) => {
    bulletSpawn = other;
  });

  
  // socket.on("updateBullets",(bullets)=>{

  // })

  // Create cursor keys for movement
  cursors = this.input.keyboard.createCursorKeys();
  keys = this.input.keyboard.addKeys({
    up: Phaser.Input.Keyboard.KeyCodes.W,
    down: Phaser.Input.Keyboard.KeyCodes.S,
    left: Phaser.Input.Keyboard.KeyCodes.A,
    right: Phaser.Input.Keyboard.KeyCodes.D
  });
  
  wallGroup = this.physics.add.staticGroup();
  // Create the wall group
  wallList.forEach((w)=>{
    wallGroup.create(w.x, w.y, "wall").setDisplaySize(w.width, w.height).refreshBody();
  })
  // wallGroup = this.physics.add.staticGroup();
  // wallGroup.create(1100, 600, "wall").setDisplaySize(50, 500).refreshBody();
  // wallGroup.create(200, 300, "wall").setDisplaySize(500, 50).refreshBody();

  // bullets = this.physics.add.group({
  //   defaultKey: "bullet",
  // });
  spacebar = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
}

function update() {
  // movement
  // arrow keys movement
  let dx = 0,
    dy = 0;
  if (keys.left.isDown) dx = -5;
  if (keys.right.isDown) dx = 5;
  if (keys.up.isDown) dy = -5;
  if (keys.down.isDown) dy = 5;

  if (keys.left.isDown || keys.right.isDown || keys.up.isDown || keys.down.isDown){
    playersContainer[socket.id].sprite.anims.play("move", true);
  }else{
    if(playersContainer[socket.id]){
      playersContainer[socket.id].sprite.anims.stop();
      playersContainer[socket.id].sprite.setFrame(1);
    }
  }
  if (dx || dy) {
    socket.emit("move", { dx, dy });
  }
  // player side chanage
  if(cursors.left.isDown || keys.left.isDown) {
    playerSide = "left";
    socket.emit("changeSide", {playerSide});
  }
  if(cursors.right.isDown || keys.right.isDown) {
    playerSide = "right";
    socket.emit("changeSide", {playerSide});
  }
  // // Shooting bullets
  if (Phaser.Input.Keyboard.JustDown(spacebar)) {
    let fireSide = playerSide;
    // side define bullet
    if (cursors.left.isDown && cursors.up.isDown) {
      fireSide = "top-left";
    } else if (cursors.right.isDown && cursors.up.isDown) {
      fireSide = "top-right";
    } else if (cursors.left.isDown && cursors.down.isDown) {
      fireSide = "bottom-left";
    } else if (cursors.right.isDown && cursors.down.isDown) {
      fireSide = "bottom-right";
    } else if (cursors.left.isDown) {
      fireSide = "left";
    } else if (cursors.right.isDown) {
      fireSide = "right";
    } else if (cursors.up.isDown) {
      fireSide = "top";
    } else if (cursors.down.isDown) {
      fireSide = "bottom";
    }
    if(!players[socket.id]) return;
    socket.emit("shoot", { x: players[socket.id].x, y: players[socket.id].y,fireSide:fireSide });
  }

  // // Render all players and bullets
  for (let id in players) {
    let p = players[id];

    // Check if the player already exists in playersContainer
    if (!playersContainer[id]) {
      const sprite = this.add
      .sprite(p.x, p.y, "player")
      .setFrame(1)
      .setScale(0.8);

    // Create name text
      const nameText = this.add
      .text(p.x, p.y - 60, id || "Player", {
        fontSize: "14px",
        fill: id===socket.id?"#ffffff":"#ff0000",
        align: "center",
        stroke: "#000000",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5);
      // If the player does not exist, create a new player sprite
      playersContainer[id] = {
        sprite,
        nameText,
      };
        
    } else {
      // Update the position of the existing player sprite
      playersContainer[id].sprite.setPosition(p.x, p.y);
      playersContainer[id].nameText.setPosition(p.x, p.y-60);
      if (p.side === "left") {
        playersContainer[id].sprite.setFlipX(true);
      } else {
        playersContainer[id].sprite.setFlipX(false);
      }
    }
    if(id!= socket.id){
      playersContainer[id].sprite.anims.play("move", true);
    }
    
    if (id === socket.id) {
      this.cameras.main.startFollow(playersContainer[id].sprite, true, 0.1, 0.1);
    }
  }

  // console.log(bulletList);
  bulletList.forEach((b) => {
    let id = b.id;
    if (!bulletContainer[id]) {
      bulletContainer[id] = this.physics.add
        .sprite(b.x, b.y, "bullet")
        .setScale(0.1);
        switch (b.fireSide) {
          case "top":
            bulletContainer[id].setAngle(-90);
            break;
          case "bottom":
            bulletContainer[id].setAngle(90);
            break;
          case "left":
            bulletContainer[id].setAngle(180);
            break;
          case "right":
            bulletContainer[id].setAngle(0);
            break;
          case "top-left":
            bulletContainer[id].setAngle(-135);
            break;
          case "top-right":
            bulletContainer[id].setAngle(-45);
            break;
          case "bottom-left":
            bulletContainer[id].setAngle(135);
            break;
          case "bottom-right":
            bulletContainer[id].setAngle(45);
            break;
        }   
    } else {
      bulletContainer[id].setPosition(b.x, b.y);
    }
  });
  for (let id in bulletContainer) {
    if (!bulletList.some((b) => b.id === id)) {
      bulletContainer[id].destroy();
      delete bulletContainer[id]; // Remove it from playersContainer
    }
  }

  // for (let gun in gunSpawn){
  //   let gunID = gun.id;
  //   console.log(`${gun.x} g ${gun.y}`)
  //   if(!gunContainer[gunID]){
  //     gunContainer[gunID]  = this.physics.add.sprite(gun.x, gun.y, 'bullet').setScale(0.1);
  //   }
  // }

  // guns spawn
  gunSpawn.forEach((gun) => {
    // Loop through the array of gun objects
    let id = gun.id; // Get the gun's ID
    // console.log(`Gun position - x: ${gun.x}, y: ${gun.y}`);  // Log gun's position

    // If the gun is not already in the container, create a new sprite
    if (!gunContainer[id]) {
      if (gun.gun === "Pistol") {
        gunContainer[id] = this.physics.add
          .sprite(gun.x, gun.y, "pistol")
          .setScale(0.1);
      } else if (gun.gun === "AK47") {
        gunContainer[id] = this.physics.add
          .sprite(gun.x, gun.y, "ak47")
          .setScale(0.1);
      } else {
        gunContainer[id] = this.physics.add
          .sprite(gun.x, gun.y, "m16")
          .setScale(0.1);
      }
    } else {
      // Optionally update the position if it already exists
      gunContainer[id].setPosition(gun.x, gun.y);
    }
  });

  // Medi pack spawn
  mediSpawn.forEach((medi)=>{
    let id = medi.id;
    if(!mediSpawnContainer[id]){
      mediSpawnContainer[id] = this.physics.add
      .sprite(medi.x, medi.y, "medi").setScale(0.5);
    }else{
      mediSpawnContainer[id].setPosition(medi.x, medi.y);
    }
  })

  bulletSpawn.forEach((bullet)=>{
    let id = bullet.id;
    if(!bulletSpawnListContainer[id]){
      bulletSpawnListContainer[id] = this.physics.add
      .sprite(bullet.x, bullet.y, "bulletpack").setScale(0.5);
    }else{
      bulletSpawnListContainer[id].setPosition(bullet.x, bullet.y);
    }
  })

  for (let id in gunContainer) {
    if (!gunSpawn.some((b) => b.id === id)) {
      gunContainer[id].destroy();
      delete gunContainer[id]; // Remove it from playersContainer
    }
  }

  for (let id in mediSpawnContainer) {
    if (!mediSpawn.some((m) => m.id === id)) {
      mediSpawnContainer[id].destroy();
      delete mediSpawnContainer[id]; // Remove it from playersContainer
    }
  }

  for (let id in bulletSpawnListContainer) {
    if (!bulletSpawn.some((m) => m.id === id)) {
      bulletSpawnListContainer[id].destroy();
      delete bulletSpawnListContainer[id]; // Remove it from playersContainer
    }
  }


  // Remove players that are no longer present
  for (let id in playersContainer) {
    if (!players.hasOwnProperty(id)) {
      // If the player is not in the server's players list, destroy it
      playersContainer[id].sprite.destroy();
      playersContainer[id].nameText.destroy();
      delete playersContainer[id]; // Remove it from playersContainer
    }
  }
}





new Phaser.Game(config);
