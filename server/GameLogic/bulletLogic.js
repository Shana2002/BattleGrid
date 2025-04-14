export const randomGenereteBulletPack = (minX, minY, maxX, maxY) => {
  let mediLoc = [];
  for (let index = 0; index < 5; index++) {
    let random = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
    let medipack = {
      id: Date.now() + [random],
      x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
      y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
      nBullets: random,
    };
    mediLoc.push(medipack);
  }
  return mediLoc;
};

export function bulletCollion(BulletSpawn, players, io) {
    BulletSpawn.forEach((spawn, index) => {
    for (let id in players) {
      let player = players[id];
      let dx = spawn.x - player.x;
      let dy = spawn.y - player.y;
      let distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 20) {
        player.nBullets = player.nBullets + spawn.nBullets;
        BulletSpawn.splice(index, 1);
        io.emit("updateBulletPack", BulletSpawn);
      }
    }
  });
}
