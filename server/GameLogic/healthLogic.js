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