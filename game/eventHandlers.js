const fs = require('fs');
const path = require('path');

const gameState = require('./gameState');

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
      updateNpcsBattleStatus(entity, gameState.npcs);
      io.emit('playerMoved', { id: entity.id, x: entity.x, y: entity.y, actionPoints: entity.actionPoints });
    } else if (entityType === 'npc') {
      io.emit('npcMoved', { id: entity.id, x: entity.x, y: entity.y, actionPoints: entity.actionPoints });
    }
    timeoutId = setTimeout(step, 200);
  }
  step();
}

function updateNpcsBattleStatus(player, npcs) {
  for (const npcId in npcs) {
    const npc = npcs[npcId];
    if (!npc.friendly) {
      // If the flag is already true, keep it as true.
      if (npc.isInBattle) continue;

      // Check if the player is within Euclidean distance 4.
      if (gameState.euclidean(player.x, player.y, npc.x, npc.y) < 4) {
        npc.isInBattle = true;
        console.log(`Npc isInBattle = True`)
      }
    }
  }
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
      for (const npcId in gameState.npcs) {
        const npc = gameState.npcs[npcId];
        if (!npc.friendly && gameState.euclidean(player.x, player.y, npc.x, npc.y) < 4) {
          gameState.initBattleMode(io);
          break;
        }
      }
    });
  }
}

function handleAttack(socket, data, io) {
  const player = gameState.players[socket.id];
  if (!player) return;

  if (gameState.gameMode === 'battle') {
    if (!player.isTurn) return;
    let targetNpc = null;
    if (data.npcId && gameState.npcs[data.npcId]) {
      targetNpc = gameState.npcs[data.npcId];
    }
    if (!targetNpc) return;
    if (player.actionPoints < 4) return;
    if (gameState.chebyshev(player.x, player.y, targetNpc.x, targetNpc.y) > player.weaponRange) return;
    player.actionPoints -= 4;
    const maxAttack = player.weaponAttack + player.strength;
    const damage = Math.floor(Math.random() * maxAttack) + 1;
    targetNpc.health -= damage;
    io.emit('damageFeedback', {
      attacker: socket.id,
      target: targetNpc.id,
      damage: damage,
      x: targetNpc.x,
      y: targetNpc.y
    });
    io.emit('damageLog', `Player ${socket.id} attacked NPC ${targetNpc.id} for ${damage} damage.`);
    if (targetNpc.health <= 0) {
      delete gameState.npcs[targetNpc.id];
      io.emit('npcRemoved', { id: targetNpc.id });
      gameState.checkBattleOver(io);
    } else {
      io.emit('npcUpdated', { id: targetNpc.id, health: targetNpc.health });
    }
    io.emit('playerUpdated', { id: socket.id, actionPoints: player.actionPoints });
    if (player.actionPoints <= 0) {
      gameState.finishTurn(io);
    }
  }
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

module.exports = {
  addPlayer: addPlayer,
  handleMove: handleMove,
  handleAttack: handleAttack,
  handleSkipTurn: handleSkipTurn,
  removePlayer: removePlayer
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
    gameMode: gameState.gameMode
  });
  // Notify other players that a new player has joined.
  socket.broadcast.emit('playerJoined', gameState.players[socket.id]);
}
