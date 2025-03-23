// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIo(server);

const game = require('./game');

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  game.addPlayer(socket, io);

  socket.on('move', (data) => {
    game.handleMove(socket, data, io);
  });
  socket.on('attack', (data) => {
    game.handleAttack(socket, data, io);
  });
  socket.on('skipTurn', () => {
    game.handleSkipTurn(socket, io);
  });
  socket.on('disconnect', () => {
    game.removePlayer(socket, io);
    console.log(`Player disconnected: ${socket.id}`);
  });
});

server.listen(3000, () => {
  console.log('Server listening on port 3000');
});
