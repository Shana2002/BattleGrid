export const gunMap = new Map();
gunMap.set("Pistol",{speed:10,length:500,damage:2.5,bullet:20});
gunMap.set("AK47",{speed:30,length:1000,damage:5,bullet:30});
gunMap.set("M16",{speed:35,length:2000,damage:7,bullet:40});


const gunType = ["Pistol","AK47","M16"]

export const RandomGenerateGun=(minX,minY,maxX,maxY)=>{

    let gunLoc = [];
    for (let index = 0; index < 5; index++) {
        const random= Math.floor(Math.random() * 3)
        let gunLocation = {
            id: Date.now()+gunType[random],
            x: Math.floor(Math.random() * (maxX - minX + 1)) + minX, 
            y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
            gun:gunType[random],
        };
        gunLoc.push(gunLocation);
    }
    return gunLoc;
} 

export function gunCollions(gunSpawnList,players,io){
    gunSpawnList.forEach((gunSpawn, index) => {
          for (let id in players) {
            let player = players[id];
            let dx = gunSpawn.x - player.x;
            let dy = gunSpawn.y - player.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < 20) {
              players[id].gun = gunSpawn.gun;
              players[id].nBullets = gunMap.get(gunSpawn.gun).bullet;
              gunSpawnList.splice(index, 1);
              io.emit("updateGun", gunSpawnList);
            }
          }
        });
}