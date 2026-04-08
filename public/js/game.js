// ─── Game Client ───────────────────────────────────────────────
const socket = io();

// State
let myIndex = -1;
let isHost = false;
let roomId = null;
let myAvailableNumbers = [1, 2, 3, 4, 5, 6]; // "Hand of Cards" mechanic
let unreadChatCount = 0; // Tracks missed chat messages on mobile
let gameState = {
  players: [],
  snakes: {},
  ladders: {},
  currentTurnIndex: 0,
  started: false,
};

// DOM Elements
const $lobby = document.getElementById('lobby');
const $waitingRoom = document.getElementById('waiting-room');
const $gameScreen = document.getElementById('game-screen');
const $playerName = document.getElementById('player-name');
const $roomCode = document.getElementById('room-code');
const $roomList = document.getElementById('room-list');
const $waitingPlayers = document.getElementById('waiting-players');
const $displayRoomCode = document.getElementById('display-room-code');
const $btnCreate = document.getElementById('btn-create');
const $btnJoin = document.getElementById('btn-join');
const $btnStart = document.getElementById('btn-start');
const $btnRestart = document.getElementById('btn-restart');
const $turnIndicator = document.getElementById('turn-indicator');
const $numberChooser = document.getElementById('number-chooser');
const $scoreboard = document.getElementById('scoreboard');
const $moveLog = document.getElementById('move-log');
const $winnerOverlay = document.getElementById('winner-overlay');
const $winnerName = document.getElementById('winner-name');
const $btnLeaveGame = document.getElementById('btn-leave-game');
const $leaveOverlay = document.getElementById('leave-overlay');
const $btnCancelLeave = document.getElementById('btn-cancel-leave');
const $btnConfirmLeave = document.getElementById('btn-confirm-leave');
const $mobileChatFab = document.getElementById('mobile-chat-fab');
const $chatBadge = document.getElementById('chat-badge');
const $chatCloseBtn = document.getElementById('chat-close-btn');
const $leftPanel = document.querySelector('.left-panel');
const $floatingBubblesContainer = document.getElementById('floating-bubbles-container');

// Tutorial Elements
const $tutorialOverlay = document.getElementById('tutorial-overlay');
const $tutorialTitle = document.getElementById('tutorial-title');
const $tutorialText = document.getElementById('tutorial-text');
const $btnTutorialSkip = document.getElementById('btn-tutorial-skip');
const $btnTutorialNext = document.getElementById('btn-tutorial-next');

// Audio Elements
const $bgMusic = document.getElementById('bg-music');
const $btnMute = document.getElementById('btn-mute');

// Board
const canvas = document.getElementById('board-canvas');
const board = new BoardRenderer(canvas);

function resizeBoard() {
  const container = document.querySelector('.board-container');
  if (!container) return;
  const width = container.clientWidth || window.innerWidth - 32;
  board.resize(Math.min(width, 600));
}

let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    if (gameState.started) resizeBoard();
  }, 150);
});

// ─── Lobby ─────────────────────────────────────────────────────

// Request room list on load
socket.emit('get_rooms');

$btnCreate.addEventListener('click', () => {
  const name = $playerName.value.trim() || 'Player';
  socket.emit('create_room', name);
});

$btnJoin.addEventListener('click', () => {
  const name = $playerName.value.trim() || 'Player';
  const code = $roomCode.value.trim();
  if (!code) {
    showToast('Enter a room code', 'error');
    return;
  }
  socket.emit('join_room', { roomId: code, playerName: name });
});

$playerName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $btnCreate.click();
});

$roomCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $btnJoin.click();
});

// ─── Socket Events: Lobby ──────────────────────────────────────

socket.on('room_list', (rooms) => {
  if (rooms.length === 0) {
    $roomList.innerHTML = '<div class="no-rooms">No rooms available. Create one!</div>';
    return;
  }
  $roomList.innerHTML = rooms
    .filter(r => !r.started)
    .map(r => `
      <div class="room-item" onclick="joinRoomFromList('${r.id}')">
        <div>
          <div class="room-info">${r.id}</div>
          <div class="room-players">${r.playerCount}/6 players</div>
        </div>
        <button class="btn btn-secondary" style="padding:0.4rem 0.8rem;font-size:0.8rem">Join</button>
      </div>
    `).join('') || '<div class="no-rooms">No open rooms</div>';
});

function joinRoomFromList(id) {
  const name = $playerName.value.trim() || 'Player';
  socket.emit('join_room', { roomId: id, playerName: name });
}

socket.on('joined_room', (data) => {
  roomId = data.roomId;
  myIndex = data.yourIndex;
  isHost = data.isHost;
  gameState.players = data.players;

  showScreen('waiting');
  $displayRoomCode.textContent = roomId;
  updateWaitingPlayers();

  if (isHost) {
    $btnStart.style.display = 'inline-block';
  }
});

socket.on('player_joined', (data) => {
  gameState.players = data.players;
  updateWaitingPlayers();
  showToast(`${data.player.name} joined!`, 'info');
});

socket.on('player_left', (data) => {
  gameState.players = data.players;
  gameState.currentTurnIndex = data.currentTurnIndex;

  // Recalculate myIndex
  const mySocket = socket.id;
  // We don't have socket IDs client-side, so rely on position staying same
  if (myIndex >= gameState.players.length) {
    myIndex = gameState.players.length - 1;
  }

  showToast(`${data.playerName} left the game`, 'error');

  if (gameState.started) {
    updateScoreboard();
    updateTurnIndicator();
    updateNumberChooser();
    board.setPlayers(gameState.players);
    board.render();
  } else {
    updateWaitingPlayers();
  }
});

$btnStart.addEventListener('click', () => {
  socket.emit('start_game');
});

function updateWaitingPlayers() {
  $waitingPlayers.innerHTML = gameState.players.map((p, i) => `
    <div class="player-tag" style="background:${p.color}22; border:2px solid ${p.color}">
      <span class="player-dot" style="background:${p.color}"></span>
      ${p.name}${i === 0 ? ' (Host)' : ''}
    </div>
  `).join('');
}

// ─── Socket Events: Game ───────────────────────────────────────

socket.on('game_started', (data) => {
  gameState.players = data.players;
  gameState.snakes = data.snakes;
  gameState.ladders = data.ladders;
  gameState.currentTurnIndex = data.currentTurnIndex;
  gameState.started = true;
  myAvailableNumbers = [1, 2, 3, 4, 5, 6]; // Reset hand on start

  showScreen('game');
  $winnerOverlay.classList.remove('active');

  board.setEntities(gameState.snakes, gameState.ladders);
  board.setPlayers(gameState.players);
  resizeBoard();
  board.render();

  buildNumberChooser();
  updateScoreboard();
  updateTurnIndicator();
  updateNumberChooser();
  $moveLog.innerHTML = '';
});

socket.on('move_result', (data) => {
  const {
    playerIndex, playerName, chosenNumber,
    oldPosition, intermediatePosition, finalPosition,
    hitSnake, hitLadder,
    newSnakes, newLadders,
    players, currentTurnIndex, winner
  } = data;

  gameState.currentTurnIndex = currentTurnIndex;

  // Disable chooser during animation
  disableChooser();

  // Step 1: Move player to intermediate position (the chosen number of steps)
  const startPos = oldPosition === 0 ? 0 : oldPosition;
  gameState.players[playerIndex].position = intermediatePosition;
  board.setPlayers(gameState.players);

  board.animatePlayerMove(playerIndex, startPos, intermediatePosition, () => {
    // Step 2: Shuffle snakes and ladders with animation
    board.animateEntityShuffle(newSnakes, newLadders, () => {
      gameState.snakes = newSnakes;
      gameState.ladders = newLadders;

      if (hitSnake || hitLadder) {
        // Step 3: If hit snake/ladder, animate to final position
        gameState.players[playerIndex].position = finalPosition;
        board.setPlayers(gameState.players);

        // Flash the cell
        board.flashCell(intermediatePosition);

        setTimeout(() => {
          board.animatePlayerSlide(playerIndex, intermediatePosition, finalPosition, () => {
            finishMove(data);
          });
        }, 300);
      } else {
        gameState.players = players;
        board.setPlayers(gameState.players);
        board.render();
        finishMove(data);
      }
    });
  });
});

function finishMove(data) {
  const { playerName, chosenNumber, oldPosition, intermediatePosition, finalPosition, hitSnake, hitLadder, players, currentTurnIndex, winner } = data;

  gameState.players = players;
  gameState.currentTurnIndex = currentTurnIndex;

  board.setPlayers(gameState.players);
  board.render();

  // Update UI
  updateScoreboard();
  addMoveLog(playerName, chosenNumber, oldPosition, intermediatePosition, finalPosition, hitSnake, hitLadder);

  if (winner) {
    showWinner(winner);
  } else {
    updateTurnIndicator();
    updateNumberChooser();
  }
}

// ─── Number Chooser ────────────────────────────────────────────

const DICE_LAYOUTS = {
  1: [0,0,0, 0,1,0, 0,0,0],
  2: [0,0,1, 0,0,0, 1,0,0],
  3: [0,0,1, 0,1,0, 1,0,0],
  4: [1,0,1, 0,0,0, 1,0,1],
  5: [1,0,1, 0,1,0, 1,0,1],
  6: [1,0,1, 1,0,1, 1,0,1],
};

function buildNumberChooser() {
  $numberChooser.innerHTML = '';
  for (let n = 1; n <= 6; n++) {
    const btn = document.createElement('button');
    btn.className = 'num-btn';
    btn.dataset.num = n;

    const dots = document.createElement('div');
    dots.className = 'dice-dots';
    DICE_LAYOUTS[n].forEach(show => {
      const dot = document.createElement('div');
      dot.className = `dice-dot${show ? '' : ' hidden'}`;
      dots.appendChild(dot);
    });

    btn.appendChild(dots);
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      
      // "Hand of Cards" logic: Consume card, replenish if all 6 are used
      myAvailableNumbers = myAvailableNumbers.filter(x => x !== n);
      if (myAvailableNumbers.length === 0) {
        myAvailableNumbers = [1, 2, 3, 4, 5, 6];
      }

      socket.emit('choose_number', n);
      disableChooser();
    });
    $numberChooser.appendChild(btn);
  }
}

function updateNumberChooser() {
  const isMyTurn = gameState.currentTurnIndex === myIndex;
  const btns = $numberChooser.querySelectorAll('.num-btn');
  btns.forEach(btn => {
    const num = parseInt(btn.dataset.num);
    const isAvailable = myAvailableNumbers.includes(num);
    
    btn.disabled = !isMyTurn || !isAvailable;
    btn.style.opacity = isAvailable ? '1' : '0.2'; // Visual cue for used cards
    btn.style.transform = isAvailable ? 'scale(1)' : 'scale(0.9)';
  });
}

function disableChooser() {
  const btns = $numberChooser.querySelectorAll('.num-btn');
  btns.forEach(btn => { btn.disabled = true; });
}

// ─── Turn Indicator ────────────────────────────────────────────

function updateTurnIndicator() {
  const current = gameState.players[gameState.currentTurnIndex];
  if (!current) return;

  const isMyTurn = gameState.currentTurnIndex === myIndex;
  $turnIndicator.className = `turn-indicator ${isMyTurn ? 'your-turn' : 'other-turn'}`;
  $turnIndicator.style.borderColor = current.color;
  $turnIndicator.innerHTML = isMyTurn
    ? `<span style="color:${current.color}">Your Turn!</span><br><small style="color:var(--text-dim)">Pick a number 1-6</small>`
    : `<span style="color:${current.color}">${current.name}'s Turn</span><br><small style="color:var(--text-dim)">Waiting...</small>`;
}

// ─── Scoreboard ────────────────────────────────────────────────

function updateScoreboard() {
  $scoreboard.innerHTML = gameState.players.map((p, i) => `
    <div class="scoreboard-player ${i === gameState.currentTurnIndex ? 'sb-active' : ''}">
      <div class="sb-color" style="background:${p.color}"></div>
      <div class="sb-name" style="color:${p.color}">${p.name}${i === myIndex ? ' (You)' : ''}</div>
      <div class="sb-pos">${p.position}/100</div>
    </div>
  `).join('');
}

// ─── Move Log ──────────────────────────────────────────────────

function addMoveLog(name, num, oldPos, midPos, finalPos, hitSnake, hitLadder) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  let text;
  // "Burn to Skip" Rule: If it pushes past 100, no movement happens
  if (oldPos + num > 100 && oldPos === finalPos) {
    text = `<span class="player-name">${name}</span> burned <b>${num}</b> and stayed at ${oldPos}`;
  } else {
    text = `<span class="player-name">${name}</span> chose <b>${num}</b> → ${midPos}`;
    if (hitSnake) {
      text += ` <span class="snake-text">🐍 Snake! → ${finalPos}</span>`;
    } else if (hitLadder) {
      text += ` <span class="ladder-text">🪜 Ladder! → ${finalPos}</span>`;
    }
  }

  entry.innerHTML = text;
  $moveLog.prepend(entry);

  // Keep log manageable
  while ($moveLog.children.length > 50) {
    $moveLog.removeChild($moveLog.lastChild);
  }
}

// ─── Winner ────────────────────────────────────────────────────

function showWinner(name) {
  const player = gameState.players.find(p => p.name === name);
  $winnerName.style.color = player ? player.color : 'var(--gold)';
  $winnerName.textContent = name;
  $winnerOverlay.classList.add('active');
  spawnConfetti();
}

$btnRestart.addEventListener('click', () => {
  socket.emit('restart_game');
});

function spawnConfetti() {
  const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e91e63', '#f5c518'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.width = (Math.random() * 8 + 4) + 'px';
    piece.style.height = (Math.random() * 16 + 8) + 'px';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDuration = (Math.random() * 2 + 2) + 's';
    piece.style.animationDelay = (Math.random() * 1.5) + 's';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    document.body.appendChild(piece);
    setTimeout(() => piece.remove(), 5000);
  }
}

// ─── Leave Game ────────────────────────────────────────────────

$btnLeaveGame.addEventListener('click', () => {
  $leaveOverlay.classList.add('active');
});

$btnCancelLeave.addEventListener('click', () => {
  $leaveOverlay.classList.remove('active');
});

$btnConfirmLeave.addEventListener('click', () => {
  window.location.reload(); // Cleanly disconnects the socket and resets the app state
});

// ─── Chat ──────────────────────────────────────────────────────

const $chatMessages = document.getElementById('chat-messages');
const $chatInput = document.getElementById('chat-input');
const $chatSend = document.getElementById('chat-send');
const $emojiToggle = document.getElementById('emoji-toggle');
const $emojiPicker = document.getElementById('emoji-picker');

const EMOJI_LIST = [
  '😀','😂','🤣','😍','😎','🤩','😜','😏','🤔','😱',
  '😡','😢','🥺','😴','🤮','🤯','🥳','😈','👻','💀',
  '👍','👎','👏','🙌','🤝','✌️','🤞','💪','🫡','🫶',
  '❤️','🔥','⭐','💯','🎯','🎲','🐍','🪜','🏆','🎉',
  '🎊','💥','💫','⚡','🚀','💎','🍀','🌈','☠️','🤡',
  '😤','🥱','😬','🫣','🤭','😇','🤪','👀','💬','🗣️',
];

// Build emoji picker
EMOJI_LIST.forEach(emoji => {
  const btn = document.createElement('button');
  btn.className = 'emoji-btn';
  btn.textContent = emoji;
  btn.addEventListener('click', () => {
    $chatInput.value += emoji;
    $chatInput.focus();
  });
  $emojiPicker.appendChild(btn);
});

$emojiToggle.addEventListener('click', () => {
  $emojiPicker.classList.toggle('open');
  $emojiToggle.classList.toggle('active');
});

function sendChatMessage() {
  const text = $chatInput.value.trim();
  if (!text) return;
  socket.emit('chat_message', text);
  $chatInput.value = '';
  $emojiPicker.classList.remove('open');
  $emojiToggle.classList.remove('active');
}

$chatSend.addEventListener('click', sendChatMessage);
$chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendChatMessage();
});

socket.on('chat_message', (data) => {
  const msg = document.createElement('div');
  msg.className = 'chat-msg';
  msg.innerHTML = `<span class="chat-name" style="color:${data.color}">${data.name}:</span><span class="chat-text">${escapeHtml(data.text)}</span>`;
  $chatMessages.appendChild(msg);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;

  // Mobile Unread Badge logic
  if (window.innerWidth <= 1000 && !$leftPanel.classList.contains('open')) {
    unreadChatCount++;
    $chatBadge.textContent = unreadChatCount > 99 ? '99+' : unreadChatCount;
    $chatBadge.classList.remove('hidden');
  }

  // Spawn Floating Bubble over game board
  spawnFloatingBubble(data.name, data.color, data.text);

  // Keep chat manageable
  while ($chatMessages.children.length > 100) {
    $chatMessages.removeChild($chatMessages.firstChild);
  }
});

function spawnFloatingBubble(name, color, text) {
  const bubble = document.createElement('div');
  bubble.className = 'floating-bubble';
  bubble.innerHTML = `<strong style="color:${color}">${escapeHtml(name)}:</strong> ${escapeHtml(text)}`;
  $floatingBubblesContainer.appendChild(bubble);

  setTimeout(() => { if (bubble.parentElement) bubble.remove(); }, 4000);
}

$mobileChatFab.addEventListener('click', () => {
  $leftPanel.classList.add('open');
  unreadChatCount = 0;
  $chatBadge.classList.add('hidden');
  $chatMessages.scrollTop = $chatMessages.scrollHeight; // Auto-scroll to latest on open
});

$chatCloseBtn.addEventListener('click', () => {
  $leftPanel.classList.remove('open');
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function addChatSystemMessage(text) {
  const msg = document.createElement('div');
  msg.className = 'chat-msg-system';
  msg.textContent = text;
  $chatMessages.appendChild(msg);
  $chatMessages.scrollTop = $chatMessages.scrollHeight;
}

// ─── Screen Management ─────────────────────────────────────────

function showScreen(screen) {
  $lobby.style.display = 'none';
  $waitingRoom.style.display = 'none';
  $gameScreen.style.display = 'none';

  switch (screen) {
    case 'lobby':
      $lobby.style.display = 'flex';
      break;
    case 'waiting':
      $waitingRoom.style.display = 'flex';
      break;
    case 'game':
      $gameScreen.style.display = 'block';
      break;
  }
}

// ─── Tutorial / Tour Management ────────────────────────────────

const tutorialSteps = [
  {
    title: "Welcome!",
    text: "Welcome to <b>Strategic Snake & Ladder</b>!<br><br>This isn't just a game of luck. We've introduced new mechanics that turn this classic into a thoughtful resource management puzzle."
  },
  {
    title: "Hand of Cards",
    text: "Instead of rolling a dice, you have a <b>'Hand of Cards'</b> (1 to 6).<br><br>You choose exactly which number to play. Once you use a number, it's locked until you've played all six of your cards!"
  },
  {
    title: "Burn to Skip",
    text: "Are you on 98 and only have a 6 left? <br><br>If a card pushes you past 100, you <b>'burn'</b> it! Your piece doesn't move, the card is consumed, and you safely skip the traps on your current square."
  },
  {
    title: "Shifting Board",
    text: "Watch out! After <i>every single turn</i>, the Snakes and Ladders <b>shuffle</b> to entirely new positions.<br><br>Plan ahead and outsmart your opponents!"
  }
];

let currentTutorialStep = 0;

function showTutorialStep(step) {
  if (step >= tutorialSteps.length) {
    $tutorialOverlay.classList.remove('active');
    localStorage.setItem('snakeLadderTutorialSeen', 'true');
    return;
  }
  $tutorialTitle.innerHTML = tutorialSteps[step].title;
  $tutorialText.innerHTML = tutorialSteps[step].text;
  
  $btnTutorialNext.textContent = step === 0 ? "Start Tour" : (step === tutorialSteps.length - 1 ? "Let's Play!" : "Next");
  $btnTutorialSkip.style.display = step === tutorialSteps.length - 1 ? "none" : "block";
}

$btnTutorialNext.addEventListener('click', () => showTutorialStep(++currentTutorialStep));
$btnTutorialSkip.addEventListener('click', () => showTutorialStep(tutorialSteps.length));

window.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('snakeLadderTutorialSeen') !== 'true') {
    $tutorialOverlay.classList.add('active');
    showTutorialStep(0);
  }
});

// ─── Audio Management ──────────────────────────────────────────

// Lower default volume so it's not too loud
$bgMusic.volume = 0.25;

function toggleMusic() {
  if ($bgMusic.paused) {
    const playPromise = $bgMusic.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        $btnMute.textContent = '🔊';
      }).catch(e => {
        console.warn('Audio play failed:', e);
        if (e.name === 'NotSupportedError') {
          showToast('Music file missing! Add soundtrack.mp3 to assets.', 'error');
        }
        $btnMute.textContent = '🔇'; // Revert button state on failure
      });
    }
  } else {
    $bgMusic.pause();
    $btnMute.textContent = '🔇';
  }
}

$btnMute.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent triggering the global interaction listener
  toggleMusic();
});

// Browsers block autoplay, so we start music on the first user interaction
document.body.addEventListener('click', () => {
  if ($bgMusic.paused && $btnMute.textContent === '🔇') {
    toggleMusic();
  }
}, { once: true });

// ─── Toast Notifications ───────────────────────────────────────

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── Error Handling ────────────────────────────────────────────

socket.on('error_msg', (msg) => {
  showToast(msg, 'error');
});

socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('disconnect', () => {
  showToast('Disconnected from server!', 'error');
});
