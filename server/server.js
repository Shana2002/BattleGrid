import express from 'express'
import http from 'http'
import {Server} from 'socket.io'
import {gunMap} from './GameLogic/gunLogic.js'

const app = express();
const server = http.createServer(app);
const io = new Server(server);



let players = {};
let bullets = [];
let safeZone = { x: 400, y: 300, radius: 250 };


const minX = -900 ,minY = -1495 , maxX = 3900 , maxY= 3400; 

app.use(express.static("public"));

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);
    players[socket.id] = { 
        x: Math.floor(Math.random() * (maxX - minX + 1)) + minX, 
        y: Math.floor(Math.random() * (maxY - minY + 1)) + minY, 
        health: 100 ,
        side: "left",
        gun:"Pistol",
    };
    
    io.emit("updatePlayers", players);
    socket.emit("updateSafeZone", safeZone);

    socket.on("move", (data) => {
        if (players[socket.id]) {
            if(players[socket.id].x + data.dx > -930  && players[socket.id].x + data.dx < 3935){
                players[socket.id].x += data.dx;
            }
            if(players[socket.id].y + data.dy > -1450 && players[socket.id].y + data.dy < 3435){
                players[socket.id].y += data.dy;
            }
            // console.log(players)
            players[socket.id].side = data.playerSide;
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
            io.emit("updatePlayers", players);
        }
    });

    socket.on("shoot", (data) => {
        const timestamp = Date.now();
        bullets.push({id:timestamp+socket.id, x: data.x, y: data.y, owner: socket.id ,side :players[socket.id].side,startX:data.x,startY:data.y });
        console.log(bullets);
        io.emit("updateBullets", bullets);
    });
    

    setInterval(() => {
        bullets = bullets.map(bullet => ({
            ...bullet,
            x: bullet.side==="left"? bullet.x+ gunMap.get(players[bullet.owner].gun).speed:bullet.x -gunMap.get(players[bullet.owner].gun).speed ,  // Move in the direction it was fired
            // y: bullet.y + 1 
        })).filter(b => b.x < 3955 && b.x > -930 && Math.abs(b.startX-b.x)<gunMap.get(players[b.owner].gun).length); // filter(b => b.x > 3955 && b.x < -930 && b.y > 3435 && b.y < -1450
        bullets.forEach((bullet, index) => {
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
    
        io.emit("updateBullets", bullets);
        io.emit("updatePlayers", players);
    }, 1);
    

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
