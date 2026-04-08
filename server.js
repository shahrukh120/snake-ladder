const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// ─── Game State ────────────────────────────────────────────────
const games = new Map(); // roomId -> gameState

const BOARD_SIZE = 100;
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const PLAYER_NAMES = ['Red', 'Blue', 'Green', 'Orange', 'Purple', 'Teal'];

function generateSnakesAndLadders() {
  const snakes = {};
  const ladders = {};
  const occupied = new Set([1, 100]);

  // Generate 8 snakes (head > tail, head in rows 2-10)
  let count = 0;
  while (count < 8) {
    const head = Math.floor(Math.random() * 80) + 21; // 21-100
    const tail = Math.floor(Math.random() * (head - 2)) + 2; // 2 to head-1
    if (!occupied.has(head) && !occupied.has(tail) && head !== 100) {
      snakes[head] = tail;
      occupied.add(head);
      occupied.add(tail);
      count++;
    }
  }

  // Generate 8 ladders (bottom < top, bottom in rows 1-9)
  count = 0;
  while (count < 8) {
    const bottom = Math.floor(Math.random() * 78) + 2; // 2-79
    const top = Math.floor(Math.random() * (100 - bottom - 1)) + bottom + 2; // bottom+2 to 100
    if (!occupied.has(bottom) && !occupied.has(top) && top <= 100) {
      ladders[bottom] = top;
      occupied.add(bottom);
      occupied.add(top);
      count++;
    }
  }

  return { snakes, ladders };
}

function createGame(roomId) {
  const { snakes, ladders } = generateSnakesAndLadders();
  return {
    roomId,
    players: [],
    currentTurnIndex: 0,
    snakes,
    ladders,
    started: false,
    winner: null,
    moveHistory: [],
  };
}

function getRoomList() {
  const rooms = [];
  for (const [id, game] of games) {
    rooms.push({
      id,
      playerCount: game.players.length,
      started: game.started,
      winner: game.winner,
    });
  }
  return rooms;
}

// ─── Socket.IO ─────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`\n🔌 [user_connected] socket=${socket.id}`);

  socket.on('get_rooms', () => {
    socket.emit('room_list', getRoomList());
  });

  socket.on('create_room', (playerName) => {
    const roomId = 'room_' + Math.random().toString(36).substring(2, 8);
    const game = createGame(roomId);
    games.set(roomId, game);

    console.log(`🏠 [room_created] room=${roomId} by="${playerName}" socket=${socket.id}`);
    joinRoom(socket, roomId, playerName);
  });

  socket.on('join_room', ({ roomId, playerName }) => {
    console.log(`👋 [join_attempt] room=${roomId} player="${playerName}" socket=${socket.id}`);
    joinRoom(socket, roomId, playerName);
  });

  socket.on('start_game', () => {
    const { roomId } = socket.data;
    if (!roomId) return;
    const game = games.get(roomId);
    if (!game || game.started) return;
    if (game.players.length < 2) {
      socket.emit('error_msg', 'Need at least 2 players to start');
      return;
    }
    // Only the first player (host) can start
    if (game.players[0].socketId !== socket.id) {
      socket.emit('error_msg', 'Only the host can start the game');
      return;
    }

    game.started = true;
    console.log(`🎮 [game_started] room=${roomId} players=${game.players.map(p => p.name).join(', ')}`);
    io.to(roomId).emit('game_started', {
      players: game.players.map(sanitizePlayer),
      snakes: game.snakes,
      ladders: game.ladders,
      currentTurnIndex: game.currentTurnIndex,
    });
  });

  socket.on('chat_message', (text) => {
    const { roomId } = socket.data;
    if (!roomId) return;
    const game = games.get(roomId);
    if (!game) return;

    const player = game.players.find(p => p.socketId === socket.id);
    if (!player) return;

    // Sanitize and limit message
    const msg = String(text).trim().slice(0, 200);
    if (!msg) return;

    console.log(`💬 [chat_message] room=${roomId} player="${player.name}": ${msg}`);

    io.to(roomId).emit('chat_message', {
      name: player.name,
      color: player.color,
      text: msg,
    });
  });

  socket.on('choose_number', (number) => {
    const { roomId } = socket.data;
    if (!roomId) return;
    const game = games.get(roomId);
    if (!game || !game.started || game.winner) return;

    const num = parseInt(number, 10);
    if (num < 1 || num > 6) return;

    const currentPlayer = game.players[game.currentTurnIndex];
    if (currentPlayer.socketId !== socket.id) {
      socket.emit('error_msg', 'Not your turn!');
      return;
    }

    console.log(`🎲 [player_chose] room=${roomId} player="${currentPlayer.name}" chose=${num} from_pos=${currentPlayer.position}`);

    // Calculate new position
    let newPos = currentPlayer.position + num;
    if (newPos > BOARD_SIZE) {
      // Can't move past 100, stay in place
      console.log(`   ⚠️  [bounce_back] ${newPos} > 100, staying at ${currentPlayer.position}`);
      newPos = currentPlayer.position;
    }

    const oldPos = currentPlayer.position;
    currentPlayer.position = newPos;

    // Shuffle snakes and ladders AFTER the move choice
    const oldSnakes = { ...game.snakes };
    const oldLadders = { ...game.ladders };
    const { snakes: newSnakes, ladders: newLadders } = generateSnakesAndLadders();
    game.snakes = newSnakes;
    game.ladders = newLadders;

    console.log(`   🔀 [shuffle] Snakes and ladders reshuffled!`);
    console.log(`   🐍 New snakes: ${JSON.stringify(newSnakes)}`);
    console.log(`   🪜 New ladders: ${JSON.stringify(newLadders)}`);

    // Check if landed on snake or ladder with NEW positions
    let finalPos = newPos;
    let hitSnake = false;
    let hitLadder = false;
    let entityFrom = newPos;
    let entityTo = newPos;

    if (newSnakes[newPos]) {
      finalPos = newSnakes[newPos];
      hitSnake = true;
      entityTo = finalPos;
      console.log(`   🐍 [snake_hit] "${currentPlayer.name}" bitten! ${newPos} → ${finalPos}`);
    } else if (newLadders[newPos]) {
      finalPos = newLadders[newPos];
      hitLadder = true;
      entityTo = finalPos;
      console.log(`   🪜 [ladder_hit] "${currentPlayer.name}" climbed! ${newPos} → ${finalPos}`);
    }

    currentPlayer.position = finalPos;

    // Check for winner
    let winner = null;
    if (finalPos === BOARD_SIZE) {
      game.winner = currentPlayer.name;
      winner = currentPlayer.name;
      console.log(`\n🏆 [game_won] room=${roomId} winner="${winner}" 🏆\n`);
    }

    // Move to next turn
    const prevTurnIndex = game.currentTurnIndex;
    game.currentTurnIndex = (game.currentTurnIndex + 1) % game.players.length;

    const moveData = {
      playerIndex: prevTurnIndex,
      playerName: currentPlayer.name,
      chosenNumber: num,
      oldPosition: oldPos,
      intermediatePosition: newPos,
      finalPosition: finalPos,
      hitSnake,
      hitLadder,
      entityFrom,
      entityTo,
      oldSnakes,
      oldLadders,
      newSnakes,
      newLadders,
      players: game.players.map(sanitizePlayer),
      currentTurnIndex: game.currentTurnIndex,
      winner,
    };

    game.moveHistory.push(moveData);
    io.to(roomId).emit('move_result', moveData);

    console.log(`   📍 [positions] ${game.players.map(p => `${p.name}:${p.position}`).join(' | ')}`);
    console.log(`   ➡️  [next_turn] ${game.players[game.currentTurnIndex].name}'s turn`);
  });

  socket.on('restart_game', () => {
    const { roomId } = socket.data;
    if (!roomId) return;
    const game = games.get(roomId);
    if (!game) return;
    if (game.players[0]?.socketId !== socket.id) {
      socket.emit('error_msg', 'Only the host can restart');
      return;
    }

    const { snakes, ladders } = generateSnakesAndLadders();
    game.snakes = snakes;
    game.ladders = ladders;
    game.currentTurnIndex = 0;
    game.winner = null;
    game.started = true;
    game.moveHistory = [];
    game.players.forEach(p => { p.position = 0; });

    console.log(`🔄 [game_restarted] room=${roomId}`);
    io.to(roomId).emit('game_started', {
      players: game.players.map(sanitizePlayer),
      snakes: game.snakes,
      ladders: game.ladders,
      currentTurnIndex: 0,
    });
  });

  socket.on('disconnect', () => {
    const { roomId } = socket.data;
    console.log(`\n❌ [user_disconnected] socket=${socket.id} room=${roomId || 'none'}`);

    if (roomId) {
      const game = games.get(roomId);
      if (game) {
        const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
          const removed = game.players.splice(playerIndex, 1)[0];
          console.log(`   👤 [player_removed] "${removed.name}" from room=${roomId} (${game.players.length} remaining)`);

          // Adjust turn index
          if (game.currentTurnIndex >= game.players.length) {
            game.currentTurnIndex = 0;
          }

          if (game.players.length === 0) {
            games.delete(roomId);
            console.log(`   🗑️  [room_deleted] room=${roomId} (empty)`);
          } else {
            io.to(roomId).emit('player_left', {
              playerName: removed.name,
              players: game.players.map(sanitizePlayer),
              currentTurnIndex: game.currentTurnIndex,
            });
          }
        }
      }
    }
    // Broadcast updated room list
    io.emit('room_list', getRoomList());
  });
});

function joinRoom(socket, roomId, playerName) {
  const game = games.get(roomId);
  if (!game) {
    socket.emit('error_msg', 'Room not found');
    return;
  }
  if (game.started) {
    socket.emit('error_msg', 'Game already in progress');
    return;
  }
  if (game.players.length >= 6) {
    socket.emit('error_msg', 'Room is full (max 6 players)');
    return;
  }

  const colorIndex = game.players.length;
  const player = {
    socketId: socket.id,
    name: playerName || PLAYER_NAMES[colorIndex],
    color: PLAYER_COLORS[colorIndex],
    position: 0, // 0 = not on board yet
  };

  game.players.push(player);
  socket.data.roomId = roomId;
  socket.join(roomId);

  console.log(`✅ [player_joined] "${player.name}" (${player.color}) → room=${roomId} (${game.players.length} players)`);

  socket.emit('joined_room', {
    roomId,
    players: game.players.map(sanitizePlayer),
    yourIndex: game.players.length - 1,
    isHost: game.players.length === 1,
  });

  socket.to(roomId).emit('player_joined', {
    player: sanitizePlayer(player),
    players: game.players.map(sanitizePlayer),
  });

  io.emit('room_list', getRoomList());
}

function sanitizePlayer(p) {
  return { name: p.name, color: p.color, position: p.position };
}

// ─── Start Server ──────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  🎲 Snake & Ladder Server`);
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`${'═'.repeat(50)}\n`);
  console.log(`Waiting for connections...\n`);
});
