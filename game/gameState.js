// game/gameState.js
// --- Global State ---
const players = {};
// Enemy NPCs placed in strategic positions within the maze.
const npcs = {
  'npc1': { id: 'npc1', x: 11, y: 3, friendly: false, health: 20, isInBattle: false, sprite: "rat" },
  'npc2': { id: 'npc2', x: 13, y: 23, friendly: false, health: 20, isInBattle: false, sprite: "rat" },
  'npc3': { id: 'npc3', x: 20, y: 12, friendly: false, health: 20, isInBattle: false, sprite: "rat" },
  'npc4': { id: 'npc4', x: 5, y: 17, friendly: false, health: 20, isInBattle: false, sprite: "rat" }
};

// Maze-like terrain configuration for a 25x25 grid.
// Note: In a production setting, you might generate repetitive elements (like borders)
// programmatically rather than listing every object. Here, we mix manually defined objects
// to illustrate both an outer forest border and internal maze-like partitions.

// --- Outer Border (all cells at the edge) ---
// Top and bottom borders.
const terrain = [];

// Top border (y = 0)
for (let x = 0; x < 25; x++) {
  terrain.push({ x: x, y: 0, type: "tree", blocksVision: true });
}
// Bottom border (y = 24)
for (let x = 0; x < 25; x++) {
  terrain.push({ x: x, y: 24, type: "tree", blocksVision: true });
}
// Left and right borders (y between 1 and 23)
for (let y = 1; y < 24; y++) {
  terrain.push({ x: 0, y: y, type: "tree", blocksVision: true });
  terrain.push({ x: 24, y: y, type: "tree", blocksVision: true });
}

// --- Internal Maze Walls ---
// Vertical walls at x = 6, 12, and 18, with gaps for corridors.
for (let y = 2; y < 23; y++) {
  // Wall at x = 6, with gaps at y = 7 and y = 11.
  if (y !== 7 && y !== 11) {
    terrain.push({ x: 6, y: y, type: "rock", blocksVision: true });
  }
  // Wall at x = 12, with gaps at y = 5 and y = 8 and y = 15.
  if (y !== 5 && y !== 8 && y !== 15) {
    terrain.push({ x: 12, y: y, type: "tree", blocksVision: true });
  }
  // Wall at x = 18, with a gap at y = 12.
  if (y !== 12) {
    terrain.push({ x: 18, y: y, type: "rock", blocksVision: true });
  }
}

// Horizontal walls at y = 8 and y = 16.
// Horizontal wall at y = 8 from x = 2 to 22, gap at x = 12.
for (let x = 2; x < 23; x++) {
  if (x !== 12) {
    terrain.push({ x: x, y: 8, type: "tree", blocksVision: true });
  }
}
// Horizontal wall at y = 16 from x = 2 to 22, gap at x = 18.
for (let x = 2; x < 23; x++) {
  if (x !== 18) {
    terrain.push({ x: x, y: 16, type: "rock", blocksVision: true });
  }
}

// --- Decorative/Additional Terrain ---
// Add some bushes in open areas (do not block vision).
terrain.push({ x: 3, y: 12, type: "bush", blocksVision: false });
terrain.push({ x: 4, y: 12, type: "bush", blocksVision: false });
terrain.push({ x: 20, y: 3, type: "bush", blocksVision: false });
terrain.push({ x: 21, y: 3, type: "bush", blocksVision: false });
terrain.push({ x: 10, y: 20, type: "bush", blocksVision: false });
terrain.push({ x: 11, y: 20, type: "bush", blocksVision: false });

// Optional: Add a few scattered trees for variety
terrain.push({ x: 16, y: 5, type: "tree", blocksVision: true });
terrain.push({ x: 7, y: 19, type: "tree", blocksVision: true });

let gameMode = 'free'; // Either "free" or "battle"
let battleQueue = [];  // Array of objects { type: 'player' or 'npc', id: <id> }

// --- Helper Functions ---
function manhattan(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}
function euclidean(x1, y1, x2, y2) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}
function chebyshev(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
// Assume players and npcs objects are defined in this module.
function isBlocked(x, y) {
  // Check against terrain.
  for (const ob of terrain) {
    if (ob.x === x && ob.y === y) return true;
  }
  // Check players.
  for (const id in players) {
    if (players[id].x === x && players[id].y === y) return true;
  }
  // Check NPCs.
  for (const id in npcs) {
    if (npcs[id].x === x && npcs[id].y === y) return true;
  }
  return false;
}
// A helper that returns unoccupied neighbor cells of a given target.
function getAvailableNeighbors(target, gridWidth, gridHeight) {
  const result = [];
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 }
  ];
  for (const d of directions) {
    const nx = target.x + d.dx;
    const ny = target.y + d.dy;
    if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
    // For pathing purposes, ignore occupancy by the target itself.
    // But still use our isBlocked function for terrain and other entities.
    if (isBlocked(nx, ny)) continue;
    result.push({ x: nx, y: ny });
  }
  return result;
}

// --- Battle Mode Functions ---
function checkBattleOver(io) {
  // If no players remain, end battle mode.
  if (Object.keys(players).length === 0) {
    console.log("No players remain. Ending battle mode and switching to free mode.");
    gameMode = 'free';
    battleQueue = [];
    io.emit('battleEnded', { gameMode, players, npcs, terrain });
    return;
  }
  
  // Check if any NPC is still engaged in battle.
  const engagedNpcExists = Object.values(npcs).some(npc => npc.isInBattle);

  if (!engagedNpcExists) {
    console.log("No engaged NPCs remain. Ending battle mode and switching to free mode.");
    gameMode = 'free';
    battleQueue = [];
    io.emit('battleEnded', { gameMode, players, npcs, terrain });
    return;
  }
}

function initBattleMode(io) {
  gameMode = 'battle';
  battleQueue = [];
  // Include all players.
  for (const id in players) {
    battleQueue.push({ type: 'player', id });
  }
  // Include only unfriendly NPCs.
  for (const id in npcs) {
    if (!npcs[id].friendly) {
      npcs[id].actionPoints = 10;
      battleQueue.push({ type: 'npc', id });
    }
  }
  if (battleQueue.length > 0) {
    const current = battleQueue[0];
    if (current.type === 'player' && players[current.id]) {
      players[current.id].isTurn = true;
      players[current.id].actionPoints = 12;
    } else if (current.type === 'npc' && npcs[current.id]) {
      npcs[current.id].isTurn = true;
      npcs[current.id].actionPoints = 10;
      // Emit the battle mode update before processing NPC turn.
      io.emit('battleMode', { battleQueue, gameMode, players, npcs, terrain });
      processNpcTurn(current.id, io);
      return;
    }
  }
  io.emit('battleMode', { battleQueue, gameMode, players, npcs, terrain });
}

function finishTurn(io) {
  // Clean up battleQueue (remove dead players or NPCs, if necessary)
  cleanupBattleQueue();
  
  // Call checkBattleOver to see if battle mode should naturally end.
  checkBattleOver(io);
  if (gameMode !== 'battle') return;
  
  if (battleQueue.length === 0) return;
  const current = battleQueue.shift();
  if (current.type === 'player' && players[current.id]) {
    players[current.id].isTurn = false;
  } else if (current.type === 'npc' && npcs[current.id]) {
    npcs[current.id].isTurn = false;
  }
  
  // Rebuild battleQueue if needed.
  if (battleQueue.length === 0) {
    battleQueue = [];
    for (const pid in players) battleQueue.push({ type: 'player', id: pid });
    for (const npcId in npcs)
      if (!npcs[npcId].friendly)
        battleQueue.push({ type: 'npc', id: npcId });
  }
  
  cleanupBattleQueue();

  const next = battleQueue[0];
  if (!next) return;
  if (next.type === 'player' && players[next.id]) {
    players[next.id].isTurn = true;
    players[next.id].actionPoints = 12;
  } else if (next.type === 'npc' && npcs[next.id]) {
    npcs[next.id].isTurn = true;
    npcs[next.id].actionPoints = 10;
    io.emit('turnUpdate', { battleQueue, players, npcs, terrain });
    processNpcTurn(next.id, io);
    return;
  }
  io.emit('turnUpdate', { battleQueue, players, npcs, terrain });
}

function processNpcTurn(npcId, io) {
  // Ensure that this NPC is the current combatant.
  if (!battleQueue.length || battleQueue[0].type !== 'npc' || battleQueue[0].id !== npcId) {
    return; // Not this NPC's turn; exit.
  }

  const npc = npcs[npcId];

  if (!npc || !npc.isInBattle) {
    finishTurn(io);
    return;
  }
  
  let nearestPlayer = null;
  let nearestDist = Infinity;
  for (const pid in players) {
    const p = players[pid];
    const d = chebyshev(npc.x, npc.y, p.x, p.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearestPlayer = p;
    }
  }
  if (!nearestPlayer) {
    finishTurn(io);
    return;
  }
  
  // If already adjacent (1 tile away), attack immediately.
  if (nearestDist <= 1) {
    if (npc.actionPoints >= 4) {
      const damage = Math.floor(Math.random() * 6) + 1;
      npc.actionPoints -= 4;
      nearestPlayer.health -= damage;
      // io.emit('consoleLog', `NPC ${npc.id} attacked player ${nearestPlayer.id} for ${damage} damage.`);
      const logMessage = `NPC ${npc.id} attacked player ${nearestPlayer.id} for ${damage} damage.`
      io.emit('damageFeedback', {
        attacker: npc.id,
        target: nearestPlayer.id,
        damage: damage,
        x: nearestPlayer.x,
        y: nearestPlayer.y
      });
      io.emit('damageLog', logMessage);
      io.emit('consoleLog', logMessage);
      if (nearestPlayer.health <= 0) {
        delete players[nearestPlayer.id];
        io.emit('playerRemoved', { id: nearestPlayer.id });
      } else {
        io.emit('playerUpdated', { id: nearestPlayer.id, health: nearestPlayer.health });
      }
      // Wait before checking again.
      setTimeout(() => processNpcTurn(npcId, io), 300);
      return;
    } else {
      finishTurn(io);
      return;
    }
  }
  
  // Otherwise, compute a destination adjacent to the player.
  const gridWidth = 25, gridHeight = 25;
  const targetCell = { x: nearestPlayer.x, y: nearestPlayer.y };
  
  // Get available neighbor cells around the target.
  let available = getAvailableNeighbors(targetCell, gridWidth, gridHeight);
  let destination;
  if (available.length > 0) {
    // Choose the one closest to the NPC.
    destination = available.reduce((best, current) => {
      return (chebyshev(npc.x, npc.y, current.x, current.y) < chebyshev(npc.x, npc.y, best.x, best.y))
             ? current : best;
    });
  } else {
    destination = targetCell;
  }
  
  const path = findPath({ x: npc.x, y: npc.y }, destination, gridWidth, gridHeight);
  if (!path) {
    finishTurn(io);
    return;
  }
  
  if (path.length > 1) {
    if (npc.actionPoints >= 1) {
      const nextStep = path[1];
      npc.x = nextStep.x;
      npc.y = nextStep.y;
      npc.actionPoints -= 1;
      io.emit('npcMoved', { id: npc.id, x: npc.x, y: npc.y, actionPoints: npc.actionPoints });
      setTimeout(() => processNpcTurn(npcId, io), 300);
      return;
    } else {
      finishTurn(io);
      return;
    }
  }
}

function cleanupBattleQueue() {
  battleQueue = battleQueue.filter(item => {
    if (item.type === 'player') {
      return players.hasOwnProperty(item.id);
    } else if (item.type === 'npc') {
      return npcs.hasOwnProperty(item.id);
    }
    return false;
  });
}

function createGrid(width, height, initialValue) {
  const grid = new Array(width);
  for (let i = 0; i < width; i++) {
    grid[i] = new Array(height).fill(initialValue);
  }
  return grid;
}

/**
 * findPath: Finds a path from the cell "from" (an object with {x, y})
 * to the cell "to" on a grid of dimensions gridWidth x gridHeight.
 * Returns an array of cells [{x,y}, ...] representing the path from start to goal,
 * including both start and goal cells.
 * Returns null if no path is found.
 *
 * This implementation uses 2D arrays to store gScore, fScore, and cameFrom values.
 */
function findPath(from, to, gridWidth = 25, gridHeight = 25) {
  const gScore = createGrid(gridWidth, gridHeight, Infinity);
  const fScore = createGrid(gridWidth, gridHeight, Infinity);
  const cameFrom = createGrid(gridWidth, gridHeight, null);
  const closed = createGrid(gridWidth, gridHeight, false);

  gScore[from.x][from.y] = 0;
  fScore[from.x][from.y] = chebyshev(from.x, from.y, to.x, to.y);

  const openSet = [{ x: from.x, y: from.y }];

  while (openSet.length > 0) {
    let currentIndex = 0;
    let current = openSet[0];
    for (let i = 1; i < openSet.length; i++) {
      const node = openSet[i];
      if (fScore[node.x][node.y] < fScore[current.x][current.y]) {
        current = node;
        currentIndex = i;
      }
    }

    if (current.x === to.x && current.y === to.y) {
      const totalPath = [];
      let cx = current.x;
      let cy = current.y;
      totalPath.push({ x: cx, y: cy });
      while (cameFrom[cx][cy] !== null) {
        const prev = cameFrom[cx][cy];
        totalPath.unshift(prev);
        cx = prev.x;
        cy = prev.y;
      }
      return totalPath;
    }

    openSet.splice(currentIndex, 1);
    closed[current.x][current.y] = true;

    const directions = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 }
    ];
    for (const d of directions) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;

      // Ensure neighbor is within bounds.
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;
      // Check if the cell is blocked.
      if (isBlocked(nx, ny)) continue;
      // Check if the cell is already evaluated.
      if (closed[nx][ny]) continue;

      const tentativeG = gScore[current.x][current.y] + 1;
      if (tentativeG < gScore[nx][ny]) {  // This path is better.
        cameFrom[nx][ny] = { x: current.x, y: current.y };
        gScore[nx][ny] = tentativeG;
        fScore[nx][ny] = tentativeG + chebyshev(nx, ny, to.x, to.y);
        // If neighbor is not already in openSet, add it.
        if (!openSet.some(node => node.x === nx && node.y === ny)) {
          openSet.push({ x: nx, y: ny });
        }
      }
    }
  }
  console.log(`findPath: No path found from (${from.x}, ${from.y}) to (${to.x}, ${to.y}).`);
  return null;
}

module.exports = {
  players,
  npcs,
  terrain,
  get gameMode() { return gameMode; },
  set gameMode(mode) { gameMode = mode; },
  battleQueue,
  manhattan,
  euclidean,
  chebyshev,
  isBlocked,
  checkBattleOver,
  findPath,
  initBattleMode,
  cleanupBattleQueue,
  finishTurn,
  processNpcTurn
};
