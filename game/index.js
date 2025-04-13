// game/index.js
const gameState = require('./gameState');
const eventHandlers = require('./eventHandlers');

module.exports = {
  addPlayer: eventHandlers.addPlayer,
  handleMove: eventHandlers.handleMove,
  handleAttack: eventHandlers.handleAttack,
  handleSkipTurn: eventHandlers.handleSkipTurn,
  removePlayer: eventHandlers.removePlayer,
  travel: eventHandlers.travel,
};
