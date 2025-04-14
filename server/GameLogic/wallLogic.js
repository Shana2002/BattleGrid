function generateRandomWalls(numWalls, minX, minY, maxX, maxY) {
  const walls = [];
  const maxWallWidth = 500; // maximum width of a wall
  const maxWallHeight = 500; // maximum height of a wall

  for (let i = 0; i < numWalls; i++) {
    const x = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
    const y = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
    const width = Math.floor(Math.random() * maxWallWidth) + 50; // Random width between 50 and maxWallWidth
    const height = Math.floor(Math.random() * maxWallHeight) + 50; // Random height between 50 and maxWallHeight

    // Create the wall object and add it to the array
    walls.push({ x, y, width, height });
  }

  return walls;
}

// Example usage: Generate 200 walls
// export const walls = generateRandomWalls(200, -900, -1495, 3900, 3400);
export const walls = [
    { x: -800, y: -1400, width: 200, height: 50 },
    { x: -500, y: -1000, width: 50, height: 300 },
    { x: 0, y: -1200, width: 300, height: 50 },
    { x: 500, y: -800, width: 50, height: 400 },
    { x: -200, y: 0, width: 400, height: 50 },
    { x: 800, y: 100, width: 50, height: 500 },
    { x: 1000, y: 1200, width: 300, height: 50 },
    { x: 1200, y: -1000, width: 200, height: 50 },
    { x: 1600, y: 2000, width: 50, height: 400 },
    { x: 2000, y: 3000, width: 300, height: 50 },
    { x: 2500, y: -400, width: 50, height: 600 },
    { x: 3000, y: 1000, width: 200, height: 50 },
    { x: 3300, y: 2800, width: 400, height: 100 },
    { x: 3700, y: 3200, width: 150, height: 150 },
    { x: 3800, y: -1000, width: 50, height: 600 },
    { x: -850, y: -800, width: 100, height: 100 },
    { x: -300, y: -300, width: 50, height: 200 },
    { x: 1500, y: 500, width: 200, height: 150 },
    { x: -500, y: 500, width: 100, height: 100 },
    { x: 400, y: -600, width: 50, height: 250 },
    { x: 1600, y: -500, width: 200, height: 50 },
    { x: -400, y: 0, width: 250, height: 50 },
    { x: 1700, y: 0, width: 50, height: 400 },
    { x: 2200, y: 500, width: 300, height: 50 },
    { x: -300, y: -1500, width: 150, height: 100 },
    { x: -100, y: 1200, width: 50, height: 200 },
    { x: 1200, y: -800, width: 300, height: 50 },
    { x: 300, y: -200, width: 200, height: 50 },
    { x: 800, y: -1300, width: 150, height: 100 },
    { x: -700, y: 1500, width: 100, height: 250 },
    { x: 500, y: -2000, width: 100, height: 300 },
    { x: 2000, y: -500, width: 150, height: 50 },
    { x: 2500, y: -500, width: 100, height: 200 },
    { x: 1300, y: 2000, width: 300, height: 50 },
    { x: 3200, y: 1000, width: 200, height: 50 },
    { x: -200, y: 2500, width: 50, height: 150 },
    { x: -1500, y: 500, width: 200, height: 50 },
    { x: -1800, y: 1000, width: 50, height: 300 },
    { x: 900, y: 2200, width: 150, height: 50 },
    { x: 2300, y: 0, width: 100, height: 250 },
    { x: 1800, y: 1500, width: 50, height: 200 },
    { x: -1000, y: -1000, width: 300, height: 100 },
    { x: 1200, y: 1000, width: 150, height: 100 },
    { x: 700, y: 0, width: 50, height: 150 },
    { x: 1600, y: 400, width: 200, height: 50 },
    { x: -600, y: -1500, width: 100, height: 50 },
    { x: -100, y: -2500, width: 200, height: 50 }
  ];

export function isCollidingWithWall(x, y) {
  const playerSize = 40; // approximate player size

  for (const wall of walls) {
    if (
      x + playerSize > wall.x - wall.width / 2 &&
      x - playerSize < wall.x + wall.width / 2 &&
      y + playerSize > wall.y - wall.height / 2 &&
      y - playerSize < wall.y + wall.height / 2
    ) {
      return true;
    }
  }

  return false;
}

export function isBulletCollidingWithWall(x, y) {
  const bulletSize = 5; // or adjust based on your game's bullet size

  for (const wall of walls) {
    if (
      x + bulletSize > wall.x - wall.width / 2 &&
      x - bulletSize < wall.x + wall.width / 2 &&
      y + bulletSize > wall.y - wall.height / 2 &&
      y - bulletSize < wall.y + wall.height / 2
    ) {
      return true;
    }
  }

  return false;
}
