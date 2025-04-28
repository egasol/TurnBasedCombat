const fs = require('fs');
const path = require('path');

const gameState = require('./gameState');
const { spriteSources } = require('./fileUtilities');

function animateMovement(entity, path, steps, io, entityType, callback) {
  let currentStep = 0;
  if (entity.moveAnimation && entity.moveAnimation.active) {
    entity.moveAnimation.cancel();
  }

  let timeoutId;
  entity.moveAnimation = {
    active: true,
    currentStep: 0,
    cancel: function() {
      clearTimeout(timeoutId);
      this.active = false;
    }
  };

  function step() {
    if (!entity.moveAnimation.active) return;
    if (currentStep >= steps) {
      entity.moveAnimation.active = false;
      callback && callback();
      return;
    }
    currentStep++;

    entity.moveAnimation.currentStep = currentStep;

    entity.x = path[currentStep].x;
    entity.y = path[currentStep].y;

    if (entityType === 'player') {
      gameState.updateNpcsBattleStatus(entity);
      io.emit('playerMoved', { id: entity.id, x: entity.x, y: entity.y, actionPoints: entity.actionPoints });
    } else if (entityType === 'npc') {
      io.emit('npcMoved', { id: entity.id, x: entity.x, y: entity.y, actionPoints: entity.actionPoints });
    }
    timeoutId = setTimeout(step, 200);
  }
  step();
}

/**
 * handleMove:
 * - Computes path using A* (gameState.findPath).
 * - In battle mode: moves along as many nodes as allowed by player actionPoints.
 * - In free mode: moves along the entire path.
 */
 function handleMove(socket, data, io) {
  const player = gameState.players[socket.id];
  if (!player) return;

  if (gameState.gameMode === 'battle' && !player.isTurn) {
    console.log(`Player ${socket.id} attempted to move out-of-turn.`);
    return;
  }

  const destX = data.destX;
  const destY = data.destY;
  if (gameState.isBlocked(destX, destY)) return;

  if (player.moveAnimation && player.moveAnimation.active) {
    let stepsTaken = player.moveAnimation.currentStep;
    player.moveAnimation.cancel();
    if (gameState.gameMode === 'battle') {
      player.actionPoints -= stepsTaken;
      io.emit('playerUpdated', { id: socket.id, actionPoints: player.actionPoints });
      if (player.actionPoints <= 0) {
        gameState.finishTurn(io);
        return;
      }
    }
  }

  const path = gameState.findPath({ x: player.x, y: player.y }, { x: destX, y: destY }, 25, 25);
  if (!path) {
    console.log("No valid path found.");
    return;
  }
  
  if (gameState.gameMode === 'battle') {
    const allowedSteps = Math.min(player.actionPoints, path.length - 1);
    animateMovement(player, path, allowedSteps, io, 'player', () => {
      player.actionPoints -= allowedSteps;
      io.emit('playerUpdated', { id: socket.id, actionPoints: player.actionPoints });
      if (player.actionPoints <= 0) {
        gameState.finishTurn(io);
      }
    });
  } else {
    animateMovement(player, path, path.length - 1, io, 'player', () => {
      io.emit('playerMoved', { id: socket.id, x: player.x, y: player.y, actionPoints: "Unlimited" });
      gameState.checkAggro(player, io);
    });
  }
}

function handleAttack(socket, data, io) {
  const player = gameState.players[socket.id];
  if (!player) return;
  if (gameState.gameMode !== 'battle') return;

  gameState.processAttack(socket.id, data.npcId, io);
}

function handleSkipTurn(socket, io) {
  const player = gameState.players[socket.id];
  if (!player) return;
  if (gameState.gameMode !== 'battle') return;
  if (!player.isTurn) return;
  io.emit('consoleLog', `Player ${socket.id} skipped their turn.`);
  gameState.finishTurn(io);
}

function removePlayer(socket, io) {
  delete gameState.players[socket.id];
  io.emit('playerDisconnected', { id: socket.id });
}

function travel(socket, data, io) {
  console.log(`recieved travel, ${data.fileName}`);
  const fileName = data.fileName;
  const filePath = path.join('terrains', data.fileName);
  try {
    const terrainConfig = gameState.loadTerrain(filePath);
    gameState.setTerrain(terrainConfig);
    io.emit('terrainUpdated', terrainConfig);
    console.log('Terrain successfully loaded from file:', fileName);
  } catch (error) {
    console.error('Error loading terrain file:', error);
  }
}

module.exports = {
  addPlayer: addPlayer,
  handleMove: handleMove,
  handleAttack: handleAttack,
  handleSkipTurn: handleSkipTurn,
  removePlayer: removePlayer,
  travel: travel,
};

function addPlayer(socket, io) {
  // Retrieve the selected character name from the socket handshake query.
  const selectedCharacterName = socket.handshake.query.character;
  
  // Reject connection if no character name was provided.
  if (!selectedCharacterName) {
    socket.emit('error', 'No character selected.');
    return socket.disconnect();
  }
  
  // Check whether a player with this character is already connected.
  for (const id in gameState.players) {
    if (gameState.players[id].name === selectedCharacterName) {
      socket.emit('error', 'This character is already connected.');
      return socket.disconnect();
    }
  }
  
  const charactersDir = "characters";
  // Sanitize the character name (allowing only letters, numbers, underscore, and hyphen).
  const safeName = selectedCharacterName.replace(/[^\w\-]/g, '');
  const filePath = path.join(charactersDir, `${safeName}.json`);

  // Check if the saved character file exists.
  if (!fs.existsSync(filePath)) {
    socket.emit('error', 'Character file not found.');
    return socket.disconnect();
  }
  
  let playerData;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const savedCharacter = JSON.parse(fileContent);
    
    // Verify that the saved character has the required fields.
    if (!savedCharacter.name || !savedCharacter.charClass || !savedCharacter.stats) {
      socket.emit('error', 'Saved character has missing or invalid data.');
      return socket.disconnect();
    }

    console.log(`${savedCharacter.charClass} ${savedCharacter.charClass}`)
    
    // Build the player object from the saved character.
    playerData = {
      id: socket.id,
      x: 2,            // Adjust spawn position if needed.
      y: 2,
      isTurn: false,
      actionPoints: 10,
      health: 24,      // You might recalc or adjust health based on saved stats.
      // Use stats from the saved file.
      name: savedCharacter.name,  // This should equal selectedCharacterName.
      charClass: savedCharacter.charClass,
      strength: savedCharacter.stats.strength,
      luck: savedCharacter.stats.luck,
      intelligence: savedCharacter.stats.intelligence,
      perception: savedCharacter.stats.perception,
      // Set sprite key based on class; you may extend this later.
      sprite: savedCharacter.charClass,
      // Optionally, add additional computed attributes (e.g., weaponAttack, weaponRange).
      weaponRange: 1,
      weaponAttack: 4
    };
  } catch (err) {
    console.error('Error reading character file for', selectedCharacterName, err);
    socket.emit('error', 'Error reading character file.');
    return socket.disconnect();
  }
  
  // At this point, all checks have passed.
  gameState.players[socket.id] = playerData;
  // Inform this client of initialization data.
  socket.emit('init', { 
    player: gameState.players[socket.id],
    players: gameState.players,
    npcs: gameState.npcs,
    terrain: gameState.terrain,
    background: gameState.background,
    gameMode: gameState.gameMode,
    spriteSources: spriteSources
  });
  // Notify other players that a new player has joined.
  socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
}
