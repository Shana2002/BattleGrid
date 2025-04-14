export const randomGenereteMediPack = (minX,minY,maxX,maxY) =>{
    let mediLoc = [];
    for (let index = 0; index < 5; index++) {
        let random = Math.floor(Math.random() * (20 - 5 + 1)) + 5; 
        let medipack = {
            id: Date.now()+[random],
            x: Math.floor(Math.random() * (maxX - minX + 1)) + minX, 
            y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
            health_increase:random,
        };
        mediLoc.push(medipack);
    }
    return mediLoc;
}

export function mediCollions(mediSpawnList,players,io){
    mediSpawnList.forEach((medi, index) => {
          for (let id in players) {
            let player = players[id];
            let dx = medi.x - player.x;
            let dy = medi.y - player.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 20) {
              if (player.health < 100) {
                player.health = player.health + medi.health_increase;
                if (player.health > 100) player.health = 100;
              }
              mediSpawnList.splice(index, 1);
              io.emit("updateMediPack", mediSpawnList);
            }
          }
        });
}