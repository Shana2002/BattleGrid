import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { gunMap, RandomGenerateGun } from './GameLogic/gunLogic.js';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let players = {};
let bullets = [];
let safeZone = { x: 400, y: 300, radius: 250 };

// Shared gunSpawn array globally
let gunSpawn = [
    {
        id: Date.now() + 1,
        x: 100,
        y: 100,
    }
];

const minX = -900, minY = -1495, maxX = 3900, maxY = 3400;

app.use(express.static("public"));

// Send gun updates to all clients every 50 seconds
setInterval(() => {
    // Optional: Regenerate random guns
    // gunSpawn = RandomGenerateGun();

    io.emit("updateGun", gunSpawn);
}, 50000);

io.on("connection", (socket) => {
    console.log("Player connected:", socket.id);

    players[socket.id] = {
        x: Math.floor(Math.random() * (maxX - minX + 1)) + minX,
        y: Math.floor(Math.random() * (maxY - minY + 1)) + minY,
        health: 100,
        side: "left",
        gun: "Pistol",
    };

    socket.emit("updatePlayers", players);
    socket.emit("updateGun", gunSpawn); // Send gun data on connect
    socket.emit("updateSafeZone", safeZone);

    socket.on("move", (data) => {
        if (players[socket.id]) {
            if (players[socket.id].x + data.dx > -930 && players[socket.id].x + data.dx < 3935) {
                players[socket.id].x += data.dx;
            }
            if (players[socket.id].y + data.dy > -1450 && players[socket.id].y + data.dy < 3435) {
                players[socket.id].y += data.dy;
            }

            players[socket.id].side = data.playerSide;
            io.emit("updatePlayers", players);
        }
    });

    socket.on("shoot", (data) => {
        const timestamp = Date.now();
        bullets.push({
            id: timestamp + socket.id,
            x: data.x,
            y: data.y,
            owner: socket.id,
            side: players[socket.id].side,
            startX: data.x,
            startY: data.y
        });
        io.emit("updateBullets", bullets);
    });

    setInterval(() => {
        bullets = bullets.map(bullet => ({
            ...bullet,
            x: bullet.side === "left"
                ? bullet.x + gunMap.get(players[bullet.owner]?.gun)?.speed
                : bullet.x - gunMap.get(players[bullet.owner]?.gun)?.speed,
        })).filter(b => b.x < 3955 && b.x > -930 && Math.abs(b.startX - b.x) < gunMap.get(players[b.owner]?.gun)?.length);

        bullets.forEach((bullet, index) => {
            for (let id in players) {
                if (id !== bullet.owner) {
                    let player = players[id];
                    let dx = bullet.x - player.x;
                    let dy = bullet.y - player.y;
                    let distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 20) {
                        players[id].health -= gunMap.get(players[bullet.owner].gun).damage;
                        if (players[id].health <= 0) {
                            delete players[id];
                            io.emit("playerEliminated", id);
                        }
                        bullets.splice(index, 1);
                        break;
                    }
                }
            }
        });

        io.emit("updateBullets", bullets);
        io.emit("updatePlayers", players);
    }, 1);

    // socket.on("pickupGun", (gunId) => {
    //     gunSpawn = gunSpawn.filter(g => g.id !== gunId);
    //     io.emit("updateGun", gunSpawn);
    // });

    socket.on("disconnect", () => {
        console.log("Player disconnected:", socket.id);
        delete players[socket.id];
        io.emit("updatePlayers", players);
    });
});

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
