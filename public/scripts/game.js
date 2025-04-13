const urlParams = new URLSearchParams(window.location.search);
const selectedCharacterName = urlParams.get('character');
const socket = io({ query: { character: selectedCharacterName } });


let player = null, players = {}, npcs = {}, terrain = [];
let gameMode = 'free', battleQueue = [];
let floatingTexts = []; // To store floating damage numbers.

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const apDisplay = document.getElementById("apDisplay");
const cellSize = 32;

// socket.emit('selectCharacter', { characterName: selectedCharacterName });

// --- Load Sprites ---
// Floor sprite (for non-blocking tiles)
const floorSprite = new Image();
floorSprite.src = "sprites/floor.png";

const sprites = {};

function preloadSprites() {
  for (const name in spriteSources) {
    sprites[name] = new Image();
    sprites[name].src = spriteSources[name];
  }
}

// --- Helper: Linear interpolation.
function lerp(start, end, amt) {
return start + (end - start) * amt;
}

function updateGameMode(mode) {
  const modeText = document.getElementById('modeText');
  if (mode === 'battle') {
    modeText.textContent = 'Battle Mode';
    modeText.style.color = '#b71c1c';
  } else {
    modeText.textContent = 'Explore Mode';
    modeText.style.color = '#3e2723';
  }
}

function calculateVisibleTiles(player, terrain, cols, rows) {
  const visibleTiles = Array.from({ length: cols }, () => Array(rows).fill(false));
  const visionRange = 5;

  if (player) {
    for (let dx = -visionRange; dx <= visionRange; dx++) {
      for (let dy = -visionRange; dy <= visionRange; dy++) {
        const x = player.x + dx;
        const y = player.y + dy;

        // Skip out-of-bounds tiles
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;

        const distance = Math.sqrt(dx ** 2 + dy ** 2);
        if (distance <= visionRange) {
          // If line-of-sight is not blocked, mark the tile as visible
          if (!isBlockedByTerrain(player.x, player.y, x, y, terrain)) {
            visibleTiles[x][y] = true;
          }
        }
      }
    }
  }

  return visibleTiles;
}

function isBlockedByTerrain(playerX, playerY, targetX, targetY, terrain) {
  let x = playerX;
  let y = playerY;

  const deltaX = Math.abs(targetX - playerX);
  const deltaY = Math.abs(targetY - playerY);
  const stepX = playerX < targetX ? 1 : -1;
  const stepY = playerY < targetY ? 1 : -1;

  let error = deltaX - deltaY;

  while (x !== targetX || y !== targetY) {
    if (terrain.some(t => t.x === x && t.y === y && t.blocksVision)) {
      return true;
    }

    const error2 = error * 2;

    if (error2 > -deltaY) {
      error -= deltaY;
      x += stepX;
    }

    if (error2 < deltaX) {
      error += deltaX;
      y += stepY;
    }
  }
  return false;
}

function drawFloorTiles(ctx, floorSprite, cols, rows) {
	if (floorSprite.complete) {
	  for (let i = 0; i < cols; i++) {
		  for (let j = 0; j < rows; j++) {
        ctx.drawImage(floorSprite, i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }
	}
}

function drawGridLines(ctx, cols, rows) {
  ctx.strokeStyle = "#ddd";
  for (let i = 0; i <= cols; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cellSize, 0);
    ctx.lineTo(i * cellSize, canvas.height);
    ctx.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * cellSize);
    ctx.lineTo(canvas.width, j * cellSize);
    ctx.stroke();
  }
}

function drawTerrain(ctx, terrain, sprites) {
  terrain.forEach(ob => {
    let sprite = sprites[ob.type];
    if (sprite && sprite.complete) {
      ctx.drawImage(sprite, ob.x * cellSize, ob.y * cellSize, cellSize, cellSize);
    } else {
      ctx.fillStyle = "#555";
      ctx.fillRect(ob.x * cellSize, ob.y * cellSize, cellSize, cellSize);
    }
  });
}

function updateEntityRender(entity) {
	if (entity.renderX === undefined) {
	entity.renderX = entity.x * cellSize;
	entity.renderY = entity.y * cellSize;
	}
	entity.renderX = lerp(entity.renderX, entity.x * cellSize, 0.2);
	entity.renderY = lerp(entity.renderY, entity.y * cellSize, 0.2);
}

function drawPlayers(ctx, players, sprites) {
  Object.values(players).forEach(p => {
    let sprite = sprites[p.sprite];
    updateEntityRender(p);
    if (sprite && sprite.complete) {
      ctx.drawImage(sprite, p.renderX, p.renderY, cellSize, cellSize);
    } else {
      ctx.fillStyle = (p.id === socket.id) ? 'blue' : 'green';
      ctx.fillRect(p.renderX, p.renderY, cellSize, cellSize);
    }
    if (p.isTurn) {
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.renderX, p.renderY, cellSize, cellSize);
    }
  });
}

function drawNPCs(ctx, npcs, sprites) {
  Object.values(npcs).forEach(npc => {
    let sprite = sprites[npc.sprite];
    updateEntityRender(npc);
    if (sprite && sprite.complete) {
      ctx.drawImage(sprite, npc.renderX, npc.renderY, cellSize, cellSize);
    } else {
      ctx.fillStyle = 'red';
      ctx.fillRect(npc.renderX, npc.renderY, cellSize, cellSize);
    }
    if (npc.isTurn) {
      ctx.strokeStyle = 'yellow';
      ctx.lineWidth = 2;
      ctx.strokeRect(npc.renderX, npc.renderY, cellSize, cellSize);
    }
  });
}

function drawOnScreenInfo(player) {
  if (player) {
    const displayAP = (gameMode === 'free') ? "Unlimited" : player.actionPoints;
    apDisplay.textContent = `Your Action Points: ${displayAP} | Health: ${player.health}`;
  } else {
    apDisplay.textContent = "";
  }
}

function drawFloatingDamageText(ctx, floatingTexts) {
  const currentTime = Date.now();
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    const elapsed = currentTime - ft.startTime;
    if (elapsed > ft.duration) {
      // Remove expired text.
      floatingTexts.splice(i, 1);
      continue;
    }
    const alpha = 1 - (elapsed / ft.duration);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "red";
    ctx.font = "bold 14px sans-serif";
    // Draw the damage value; adjust offsets as needed.
    ctx.fillText(ft.damage, ft.x * cellSize, ft.y * cellSize);
    ctx.restore();
  }
}

function drawHiddenTiles(ctx, visibleTiles, cols, rows) {
  ctx.fillStyle = "#000";

  for (let x = 0; x < cols; x++) {
    for (let y = 0; y < rows; y++) {
      if (!visibleTiles[x][y]) {
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cols = canvas.width / cellSize;
  const rows = canvas.height / cellSize;

  const visibleTiles = calculateVisibleTiles(players[socket.id], terrain, cols, rows);

  drawFloorTiles(ctx, floorSprite, cols, rows);
  drawTerrain(ctx, terrain, sprites);
  drawPlayers(ctx, players, sprites);
  drawNPCs(ctx, npcs, sprites);
  drawOnScreenInfo(players[socket.id]);
  drawFloatingDamageText(ctx, floatingTexts);
  drawHiddenTiles(ctx, visibleTiles, cols, rows);

  requestAnimationFrame(render);
}

// Click handler: determine if the click is on an NPC for an attack
canvas.addEventListener('click', (event) => {
  const rect = canvas.getBoundingClientRect();
  const cellX = Math.floor((event.clientX - rect.left) / cellSize);
  const cellY = Math.floor((event.clientY - rect.top) / cellSize);

  // First, check if this cell has an NPC.
  let clickedNpc = null;
  for (let npcId in npcs) {
    let npc = npcs[npcId];
    if (npc.x === cellX && npc.y === cellY) {
    clickedNpc = npc;
    break;
    }
  }
  if (clickedNpc) {
    socket.emit('attack', { npcId: clickedNpc.id });
    return;
  }
  // Otherwise, treat the click as a move command.
  socket.emit('move', { destX: cellX, destY: cellY });
});

// Skip-turn control.
document.getElementById("skipBtn").addEventListener("click", () => {
  socket.emit('skipTurn');
});

// Trigger loading terrain
function travel(fileName) {
  socket.emit('travel', { fileName });
}

/* Socket.IO Event Handlers */
socket.on('init', (data) => {
  player = data.player;
  players = data.players;
  npcs = data.npcs;
  terrain = data.terrain || [];
  gameMode = data.gameMode;
  spriteSources = data.spriteSources;
  preloadSprites();
  Object.values(players).forEach(p => {
    p.renderX = p.x * cellSize;
    p.renderY = p.y * cellSize;
  });
  Object.values(npcs).forEach(npc => {
    npc.renderX = npc.x * cellSize;
    npc.renderY = npc.y * cellSize;
  });
});

// socket.on('playerJoined', (p) => { players[p.id] = p; });
socket.on('playerJoined', (p) => {
  players[p.id] = p;
  console.log(`Player joined: ${p.id} (${p.charClass || ''})`);
});
socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].x = data.x;
    players[data.id].y = data.y;
    players[data.id].actionPoints = data.actionPoints;
  }
});
socket.on('playerUpdated', (data) => {
  if (players[data.id]) {
    if (data.health !== undefined) players[data.id].health = data.health;
    if (data.actionPoints !== undefined) players[data.id].actionPoints = data.actionPoints;
  }
});
socket.on('npcMoved', (data) => {
  if (npcs[data.id]) {
    npcs[data.id].x = data.x;
    npcs[data.id].y = data.y;
    npcs[data.id].actionPoints = data.actionPoints;
  }
});
socket.on('npcUpdated', (data) => {
  if (npcs[data.id]) { npcs[data.id].health = data.health; }
});
socket.on('npcRemoved', (data) => { delete npcs[data.id]; });
socket.on('playerRemoved', (data) => { delete players[data.id]; });
socket.on('playerDisconnected', (data) => { delete players[data.id]; });
socket.on('battleMode', (data) => {
  gameMode = data.gameMode;
  battleQueue = data.battleQueue;
  players = data.players;
  npcs = data.npcs;
  terrain = data.terrain || terrain;
  updateGameMode('battle');
});
socket.on('turnUpdate', (data) => {
  battleQueue = data.battleQueue;
  players = data.players;
  npcs = data.npcs;
  terrain = data.terrain || terrain;
});
socket.on('battleEnded', (data) => {
  gameMode = data.gameMode;
  battleQueue = [];
  players = data.players;
  npcs = data.npcs;
  terrain = data.terrain || terrain;
  console.log("Battle ended: switching to free mode.");
  updateGameMode('free');
});
// Handler for damageFeedback event: display floating text.
socket.on('damageFeedback', (data) => {
  // data contains: { attacker, target, damage, x, y }
  // Create a floating text object.
  floatingTexts.push({
    x: data.x,           // grid x-coordinate
    y: data.y,           // grid y-coordinate
    damage: data.damage, // damage value
    startTime: Date.now(),
    duration: 3000      // duration of 3 seconds
  });
});

// Handler for damageLog event: append the log message to a log panel.
socket.on('damageLog', (message) => {
  const logDiv = document.getElementById("damageLog");
  if (logDiv) {
    const p = document.createElement("p");
    p.style.margin = "0";
    p.textContent = message;
    logDiv.appendChild(p);
    // Optionally, limit to last 10 messages.
    if (logDiv.childNodes.length > 10) {
    logDiv.removeChild(logDiv.firstChild);
    }
  }
});

socket.on('consoleLog', (msg) => { console.log(msg); });

socket.on('terrainUpdated', (newTerrainData) => {
  terrain = Array.isArray(newTerrainData) ? newTerrainData : Object.values(newTerrainData);
  console.log('Terrain completely replaced with new data.');
});

requestAnimationFrame(render);