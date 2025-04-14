export const gunMap = new Map();
gunMap.set("Pistol",{speed:10,length:500,damage:2.5});
gunMap.set("AK47",{speed:30,length:1000,damage:5});
gunMap.set("M16",{speed:35,length:2000,damage:7});


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