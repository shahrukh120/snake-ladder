// ─── Board Renderer (Canvas) ───────────────────────────────────
class BoardRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.size = 600;
    this.cellSize = this.size / 10;
    this.scale = 1; // for high-DPI
    this.snakes = {};
    this.ladders = {};
    this.players = [];
    this.animatingEntities = false;
    this.entityOpacity = 1;
    this.highlightCell = -1;
    this.highlightAlpha = 0;

    // Animation state for player movement
    this.movingPlayer = null; // { index, fromPos, toPos, progress, path }
    this.onMoveComplete = null;

    // Snake and ladder colors
    this.snakeColors = ['#e74c3c', '#c0392b', '#e91e63', '#d32f2f', '#f44336', '#ff5722', '#e53935', '#b71c1c'];
    this.ladderColors = ['#f39c12', '#e67e22', '#d4a017', '#c8a415', '#b8860b', '#daa520', '#cd853f', '#d2691e'];
  }

  // Resize canvas to fit container
  resize(containerWidth) {
    const maxSize = Math.min(containerWidth, 600);
    const dpr = window.devicePixelRatio || 1;
    this.size = maxSize;
    this.cellSize = this.size / 10;
    this.canvas.width = maxSize * dpr;
    this.canvas.height = maxSize * dpr;
    this.canvas.style.width = maxSize + 'px';
    this.canvas.style.height = maxSize + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  // Convert board position (1-100) to pixel coordinates
  posToXY(pos) {
    if (pos <= 0) return { x: -this.cellSize, y: this.size + this.cellSize };
    const p = pos - 1;
    const row = Math.floor(p / 10);
    let col = p % 10;
    // Snake-style board: even rows go left-to-right, odd rows go right-to-left
    if (row % 2 === 1) col = 9 - col;
    const x = col * this.cellSize + this.cellSize / 2;
    const y = (9 - row) * this.cellSize + this.cellSize / 2;
    return { x, y };
  }

  setEntities(snakes, ladders) {
    this.snakes = snakes || {};
    this.ladders = ladders || {};
  }

  setPlayers(players) {
    this.players = players || [];
  }

  // ─── Draw Board ────────────────────────────────
  drawBoard() {
    const ctx = this.ctx;
    const cs = this.cellSize;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, this.size, this.size);

    // Draw cells
    for (let i = 0; i < 100; i++) {
      const row = Math.floor(i / 10);
      let col = i % 10;
      if (row % 2 === 1) col = 9 - col;

      const x = col * cs;
      const y = (9 - row) * cs;
      const num = i + 1;

      // Checkerboard pattern
      const isLight = (Math.floor(i / 10) + (i % 10)) % 2 === 0;
      ctx.fillStyle = isLight ? '#16213e' : '#0f3460';
      ctx.fillRect(x, y, cs, cs);

      // Subtle border
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x, y, cs, cs);

      // Highlight cell
      if (num === this.highlightCell && this.highlightAlpha > 0) {
        ctx.fillStyle = `rgba(245, 197, 24, ${this.highlightAlpha * 0.3})`;
        ctx.fillRect(x, y, cs, cs);
      }

      // Cell number
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(num, x + 3, y + 3);

      // Star on 100
      if (num === 100) {
        ctx.fillStyle = '#f5c518';
        ctx.font = '24px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('★', x + cs / 2, y + cs / 2);
      }
    }
  }

  // ─── Draw Snakes ───────────────────────────────
  drawSnakes() {
    const ctx = this.ctx;
    const entries = Object.entries(this.snakes);
    entries.forEach(([head, tail], i) => {
      const from = this.posToXY(parseInt(head));
      const to = this.posToXY(parseInt(tail));
      const color = this.snakeColors[i % this.snakeColors.length];

      ctx.save();
      ctx.globalAlpha = this.entityOpacity;

      // Snake body (wavy line)
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const segments = Math.max(20, Math.floor(dist / 5));

      ctx.beginPath();
      ctx.moveTo(from.x, from.y);

      for (let s = 1; s <= segments; s++) {
        const t = s / segments;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        // Perpendicular offset for wave
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const wave = Math.sin(t * Math.PI * 4) * 12;
        ctx.lineTo(x + perpX * wave, y + perpY * wave);
      }

      ctx.strokeStyle = color;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // Snake body outline
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 10;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      for (let s = 1; s <= segments; s++) {
        const t = s / segments;
        const x = from.x + dx * t;
        const y = from.y + dy * t;
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const wave = Math.sin(t * Math.PI * 4) * 12;
        ctx.lineTo(x + perpX * wave, y + perpY * wave);
      }
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // Snake head (circle with eyes)
      ctx.beginPath();
      ctx.arc(from.x, from.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Eyes
      const angle = Math.atan2(dy, dx);
      const eyeOffset = 4;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(from.x + Math.cos(angle - 0.5) * eyeOffset, from.y + Math.sin(angle - 0.5) * eyeOffset, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(from.x + Math.cos(angle + 0.5) * eyeOffset, from.y + Math.sin(angle + 0.5) * eyeOffset, 3, 0, Math.PI * 2);
      ctx.fill();

      // Pupils
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(from.x + Math.cos(angle - 0.5) * eyeOffset + Math.cos(angle) * 1.5, from.y + Math.sin(angle - 0.5) * eyeOffset + Math.sin(angle) * 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(from.x + Math.cos(angle + 0.5) * eyeOffset + Math.cos(angle) * 1.5, from.y + Math.sin(angle + 0.5) * eyeOffset + Math.sin(angle) * 1.5, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Tongue
      ctx.beginPath();
      const tongueStart = { x: from.x + Math.cos(angle) * 10, y: from.y + Math.sin(angle) * 10 };
      ctx.moveTo(tongueStart.x, tongueStart.y);
      ctx.lineTo(tongueStart.x + Math.cos(angle - 0.3) * 8, tongueStart.y + Math.sin(angle - 0.3) * 8);
      ctx.moveTo(tongueStart.x, tongueStart.y);
      ctx.lineTo(tongueStart.x + Math.cos(angle + 0.3) * 8, tongueStart.y + Math.sin(angle + 0.3) * 8);
      ctx.strokeStyle = '#ff1744';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Tail
      ctx.beginPath();
      ctx.arc(to.x, to.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.restore();
    });
  }

  // ─── Draw Ladders ──────────────────────────────
  drawLadders() {
    const ctx = this.ctx;
    const entries = Object.entries(this.ladders);
    entries.forEach(([bottom, top], i) => {
      const from = this.posToXY(parseInt(bottom));
      const to = this.posToXY(parseInt(top));
      const color = this.ladderColors[i % this.ladderColors.length];

      ctx.save();
      ctx.globalAlpha = this.entityOpacity;

      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Perpendicular for rails
      const perpX = (-dy / dist) * 10;
      const perpY = (dx / dist) * 10;

      // Left rail
      ctx.beginPath();
      ctx.moveTo(from.x + perpX, from.y + perpY);
      ctx.lineTo(to.x + perpX, to.y + perpY);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Right rail
      ctx.beginPath();
      ctx.moveTo(from.x - perpX, from.y - perpY);
      ctx.lineTo(to.x - perpX, to.y - perpY);
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.stroke();

      // Rail outline (shadow)
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 6;
      ctx.globalCompositeOperation = 'destination-over';
      ctx.beginPath();
      ctx.moveTo(from.x + perpX, from.y + perpY);
      ctx.lineTo(to.x + perpX, to.y + perpY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(from.x - perpX, from.y - perpY);
      ctx.lineTo(to.x - perpX, to.y - perpY);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';

      // Rungs
      const numRungs = Math.max(3, Math.floor(dist / 30));
      for (let r = 1; r <= numRungs; r++) {
        const t = r / (numRungs + 1);
        const rx = from.x + dx * t;
        const ry = from.y + dy * t;
        ctx.beginPath();
        ctx.moveTo(rx + perpX, ry + perpY);
        ctx.lineTo(rx - perpX, ry - perpY);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.globalAlpha = this.entityOpacity * 0.8;
        ctx.stroke();
        ctx.globalAlpha = this.entityOpacity;
      }

      // Glow at bottom
      const gradient = ctx.createRadialGradient(from.x, from.y, 0, from.x, from.y, 20);
      gradient.addColorStop(0, `${color}44`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(from.x, from.y, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });
  }

  // ─── Draw Players ──────────────────────────────
  drawPlayers() {
    const ctx = this.ctx;
    const playersByPos = {};

    this.players.forEach((p, i) => {
      // Skip the moving player, we draw them separately
      if (this.movingPlayer && this.movingPlayer.index === i) return;
      if (p.position <= 0) return;

      const key = p.position;
      if (!playersByPos[key]) playersByPos[key] = [];
      playersByPos[key].push({ ...p, index: i });
    });

    // Draw stationary players
    for (const [pos, playersAtPos] of Object.entries(playersByPos)) {
      const { x, y } = this.posToXY(parseInt(pos));
      const count = playersAtPos.length;
      playersAtPos.forEach((p, i) => {
        const offsetAngle = (i / count) * Math.PI * 2;
        const offsetDist = count > 1 ? 10 : 0;
        const px = x + Math.cos(offsetAngle) * offsetDist;
        const py = y + Math.sin(offsetAngle) * offsetDist;
        this._drawPlayerToken(px, py, p.color, p.name);
      });
    }

    // Draw moving player
    if (this.movingPlayer) {
      const mp = this.movingPlayer;
      const p = this.players[mp.index];
      if (p) {
        const fromXY = this.posToXY(mp.currentDisplayPos);
        const toXY = this.posToXY(mp.nextDisplayPos);
        let t = mp.cellProgress;
        
        // Apply easing for a smooth slide
        if (mp.isSlide) {
          t = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        }

        const px = fromXY.x + (toXY.x - fromXY.x) * t;
        const py = fromXY.y + (toXY.y - fromXY.y) * t;
        // Bounce effect
        const bounce = mp.isSlide ? 0 : -Math.sin(mp.cellProgress * Math.PI) * 15;
        
        this._drawPlayerToken(px, py + bounce, p.color, p.name, true);
      }
    }
  }

  _drawPlayerToken(x, y, color, name, isMoving = false) {
    const ctx = this.ctx;
    const radius = 14;

    ctx.save();

    // Shadow
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Main circle
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(x - 3, y - 3, 0, x, y, radius);
    gradient.addColorStop(0, lightenColor(color, 40));
    gradient.addColorStop(1, color);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Moving glow
    if (isMoving) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Name initial
    ctx.fillStyle = 'white';
    ctx.font = 'bold 13px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.charAt(0).toUpperCase(), x, y);

    ctx.restore();
  }

  // ─── Full Render ───────────────────────────────
  render() {
    this.drawBoard();
    this.drawLadders();
    this.drawSnakes();
    this.drawPlayers();
  }

  // ─── Animate Player Moving Cell by Cell ────────
  animatePlayerMove(playerIndex, fromPos, toPos, callback) {
    if (fromPos === toPos) {
      if (callback) callback();
      return;
    }

    const path = [];
    const step = fromPos < toPos ? 1 : -1;
    for (let p = fromPos; p !== toPos; p += step) {
      path.push(p);
    }
    path.push(toPos);

    this.movingPlayer = {
      index: playerIndex,
      path,
      pathIndex: 0,
      currentDisplayPos: path[0],
      nextDisplayPos: path.length > 1 ? path[1] : path[0],
      cellProgress: 0,
    };
    this.onMoveComplete = callback;

    const INTERVAL = 16; // ~60fps
    const cellDuration = 150; // ms per cell

    const timer = setInterval(() => {
      const mp = this.movingPlayer;
      if (!mp) { clearInterval(timer); return; }

      mp.cellProgress += INTERVAL / cellDuration;

      if (mp.cellProgress >= 1) {
        mp.pathIndex++;
        if (mp.pathIndex >= mp.path.length - 1) {
          clearInterval(timer);
          this.movingPlayer = null;
          this.render();
          if (this.onMoveComplete) this.onMoveComplete();
          return;
        }
        mp.cellProgress = 0;
        mp.currentDisplayPos = mp.path[mp.pathIndex];
        mp.nextDisplayPos = mp.path[mp.pathIndex + 1];
      }

      this.render();
    }, INTERVAL);
  }

  // ─── Animate Player Sliding directly (for Snakes/Ladders) ────
  animatePlayerSlide(playerIndex, fromPos, toPos, callback) {
    if (fromPos === toPos) {
      if (callback) callback();
      return;
    }

    this.movingPlayer = {
      index: playerIndex,
      path: [fromPos, toPos],
      pathIndex: 0,
      currentDisplayPos: fromPos,
      nextDisplayPos: toPos,
      cellProgress: 0,
      isSlide: true
    };
    this.onMoveComplete = callback;

    const INTERVAL = 16; // ~60fps
    const fromXY = this.posToXY(fromPos);
    const toXY = this.posToXY(toPos);
    const dist = Math.hypot(toXY.x - fromXY.x, toXY.y - fromXY.y);
    const slideDuration = Math.max(600, dist * 1.5); // Scale duration based on distance

    const timer = setInterval(() => {
      const mp = this.movingPlayer;
      if (!mp) { clearInterval(timer); return; }

      mp.cellProgress += INTERVAL / slideDuration;

      if (mp.cellProgress >= 1) {
        clearInterval(timer);
        this.movingPlayer = null;
        this.render();
        if (this.onMoveComplete) this.onMoveComplete();
        return;
      }

      this.render();
    }, INTERVAL);
  }

  // ─── Animate Entity Shuffle ────────────────────
  animateEntityShuffle(newSnakes, newLadders, callback) {
    const INTERVAL = 16;
    const halfDur = 200; // ms for each phase
    let elapsed = 0;
    let phase = 'out';

    const timer = setInterval(() => {
      elapsed += INTERVAL;

      if (phase === 'out') {
        this.entityOpacity = Math.max(0, 1 - elapsed / halfDur);
        if (elapsed >= halfDur) {
          this.entityOpacity = 0;
          this.snakes = newSnakes;
          this.ladders = newLadders;
          phase = 'in';
          elapsed = 0;
        }
      } else {
        this.entityOpacity = Math.min(1, elapsed / halfDur);
        if (elapsed >= halfDur) {
          clearInterval(timer);
          this.entityOpacity = 1;
          this.render();
          if (callback) callback();
          return;
        }
      }

      this.render();
    }, INTERVAL);
  }

  // ─── Highlight a Cell ──────────────────────────
  flashCell(pos, duration = 1000) {
    this.highlightCell = pos;
    this.highlightAlpha = 1;
    const start = performance.now();
    const animate = (time) => {
      const elapsed = time - start;
      this.highlightAlpha = Math.max(0, 1 - elapsed / duration);
      this.render();
      if (elapsed < duration) {
        requestAnimationFrame(animate);
      } else {
        this.highlightCell = -1;
        this.render();
      }
    };
    requestAnimationFrame(animate);
  }
}

// ─── Utility ─────────────────────────────────────
function lightenColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
  const B = Math.min(255, (num & 0x0000FF) + amt);
  return `rgb(${R},${G},${B})`;
}
