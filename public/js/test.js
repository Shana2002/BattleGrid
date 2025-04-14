socket.on("updateGun", (data) => {
    data.forEach((gun) => {  // Loop through the array of gun objects
        let gunID = gun.id;  // Get the gun's ID
        // console.log(`Gun position - x: ${gun.x}, y: ${gun.y}`);  // Log gun's position

        // If the gun is not already in the container, create a new sprite
        if (!gunContainer[gunID]) {
            if(gun.gun==="Pistol"){
              gunContainer[gunID] = this.physics.add.sprite(gun.x, gun.y, 'pistol').setScale(0.1);
            }
            else if(gun.gun==="AK47"){
              gunContainer[gunID] = this.physics.add.sprite(gun.x, gun.y, 'ak47').setScale(0.1);
            }
            else{
              gunContainer[gunID] = this.physics.add.sprite(gun.x, gun.y, 'm16').setScale(0.1);
            };
        } else {
            // Optionally update the position if it already exists
            gunContainer[gunID].setPosition(gun.x, gun.y);
        }
    });
});