import express from 'express'
import http from 'http'
import {Server} from 'socket.io'
import {gunMap,RandomGenerateGun} from './GameLogic/gunLogic.js'
import {walls,isCollidingWithWall ,isBulletCollidingWithWall} from './GameLogic/wallLogic.js'
import cors from 'cors'

const app = express();

app.use(cors({
    origin: "*", // or "*" for testing (not for production)
    methods: ["GET", "POST"],
    credentials: true
  }));

  
const server = http.createServer(app);
const io = new Server(server,{
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    }
  });



let players = {};
let bullets = [];
let safeZone = { x: 400, y: 300, radius: 250 };
  


const minX = -900 ,minY = -1495 , maxX = 3900 , maxY= 3400; 
let gunSpawnList = [];
app.use(express.static("public"));
function share(){
    io.emit("updateWalls", walls);
}
io.on("connection", (socket) => {
    // Player Conncetion
    console.log("Player connected:", socket.id);
    players[socket.id] = { 
        x: Math.floor(Math.random() * (maxX - minX + 1)) + minX, 
        y: Math.floor(Math.random() * (maxY - minY + 1)) + minY, 
        health: 100 ,
        side: "left",
        gun:"Pistol",
    };
    share();
    socket.on('ping-check', (callback) => {
        // Simply respond to the ping
        callback();
      });
    // player Update
    io.emit("updatePlayers", players);
    socket.emit("updateSafeZone", safeZone);

    // Player Movement
    socket.on("move", (data) => {
        if (players[socket.id]) {
            const current = players[socket.id];
            const nextX = current.x + data.dx;
            const nextY = current.y + data.dy;

            const withinBoundsX = nextX > -930 && nextX < 3935;
            const withinBoundsY = nextY > -1450 && nextY < 3435;
            if (withinBoundsX && !isCollidingWithWall(nextX, current.y)) {
                current.x = nextX;
              }
              if (withinBoundsY && !isCollidingWithWall(current.x, nextY)) {
                current.y = nextY;
              }
          
            current.side = data.playerSide;
            io.emit("updatePlayers", players);
            // console.log(players)
            // players[socket.id].side = data.playerSide;
            // // Check if player is inside the safe zone
            // let dx = players[socket.id].x - safeZone.x;
            // let dy = players[socket.id].y - safeZone.y;
            // let distance = Math.sqrt(dx * dx + dy * dy);

            // if (distance > safeZone.radius) {
            //     players[socket.id].health -= 2; // Damage if outside safe zone
            //     if (players[socket.id].health <= 0) {
            //         delete players[socket.id];
            //         io.emit("playerEliminated", socket.id);
            //     }
            // }
            // console.log(players[socket.id])
            // io.emit("updatePlayers", players);
        }
    });

    socket.on("changeSide",(data)=>{
        if (players[socket.id]) {
            const current = players[socket.id];
            current.side = data.playerSide;
            io.emit("updatePlayers", players);
        }
    })
    
    // Shooting
    socket.on("shoot", (data) => {
        const timestamp = Date.now();
        bullets.push({id:timestamp+socket.id, x: data.x, y: data.y, owner: socket.id ,side :players[socket.id].side,startX:data.x,startY:data.y ,fireSide: data.fireSide});
        // console.log(bullets);
        io.emit("updateBullets", bullets);
    });


    setInterval(() => {
        bullets = bullets.map(bullet => ({
            ...bullet,
            x: bullet.fireSide==="left" || bullet.fireSide==="top-left" || bullet.fireSide==="bottom-left" ? bullet.x- gunMap.get(players[bullet.owner].gun).speed:
                bullet.fireSide==="right" || bullet.fireSide==="top-right" || bullet.fireSide==="bottom-right"  ? bullet.x +gunMap.get(players[bullet.owner].gun).speed:
                bullet.x,
            y: bullet.fireSide==="top" || bullet.fireSide==="top-left" || bullet.fireSide==="top-right" ? bullet.y- gunMap.get(players[bullet.owner].gun).speed:
            bullet.fireSide==="bottom" || bullet.fireSide==="bottom-left" || bullet.fireSide==="bottom-right"  ? bullet.y +gunMap.get(players[bullet.owner].gun).speed:
            bullet.y,
            // x: bullet.side==="left"? bullet.x+ gunMap.get(players[bullet.owner].gun).speed:bullet.x -gunMap.get(players[bullet.owner].gun).speed ,  // Move in the direction it was fired
            // y: bullet.side==="left"? bullet.y+ gunMap.get(players[bullet.owner].gun).speed:bullet.y -gunMap.get(players[bullet.owner].gun).speed
            // y: bullet.y + 1 
        })).filter(b => b.x < 3955 && b.x > -930 && Math.abs(b.startX-b.x)<gunMap.get(players[b.owner].gun).length); // filter(b => b.x > 3955 && b.x < -930 && b.y > 3435 && b.y < -1450
        bullets.forEach((bullet, index) => {
            if (isBulletCollidingWithWall(bullet.x, bullet.y)) {
                bullets.splice(index, 1); // Destroy bullet
                return; // Exit early
            }
            for (let id in players) {
                if (id !== bullet.owner) {
                    let player = players[id];
                    let dx = bullet.x - player.x;
                    let dy = bullet.y - player.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);
    
                    if (distance < 20) { // Collision range
                        players[id].health -= gunMap.get(players[bullet.owner].gun).damage; // Decrease HP by 20
    
                        if (players[id].health <= 0) {
                            delete players[id];
                            io.emit("playerEliminated", id);
                        }
    
                        bullets.splice(index, 1); // Remove bullet
                        break;
                    }
                }
            }
        });
        
        gunSpawnList.forEach((gunSpawn,index)=>{
            for(let id in players){
                let player = players[id];
                let dx = gunSpawn.x - player.x;
                let dy = gunSpawn.y - player.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                if (distance < 20){
                    players[id].gun=gunSpawn.gun;
                    gunSpawnList.splice(index,1);
                    io.emit("updateGun",gunSpawnList);
                }
            }
        })

        io.emit("updateBullets", bullets);
        io.emit("updatePlayers", players);
    }, 1);
    
    
    setInterval(()=>{
        gunSpawnList = RandomGenerateGun(minX,minY,maxX,maxY);
        io.emit("updateGun",gunSpawnList)
    },30000);

    // setInterval(() => {
    //     if (safeZone.radius > 50) {
    //         safeZone.radius -= 5;
    //     }
    //     io.emit("updateSafeZone", safeZone);
    // }, 5000); // Shrink safe zone every 5 seconds

    

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        delete players[socket.id];
        io.emit("updatePlayers", players);
    });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
