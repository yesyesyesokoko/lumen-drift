'use strict';
/* Lumen Drift — game state machine: title, playing, paused, game over.
   Owns waves, spawning, collisions, scoring, combo, HUD and screens. */

const Game = {
  W: 960,
  H: 540,
  state: 'title',
  time: 0,
  score: 0,
  best: 0,
  wave: 0,
  combo: 0,
  comboTimer: 0,
  trauma: 0,
  wavePhase: 'idle', // 'banner' | 'active' | 'clear'
  waveTimer: 0,
  spawnQueue: [],
  spawnTimer: 0,
  demoEnd: false,

  player: null,
  bullets: null,
  enemyShots: null,
  enemies: [],
  powerups: [],
  particles: null,
  stars: null,
  nebulae: null,
  floaters: [],

  init() {
    this.player = makePlayer(this.W, this.H);
    this.bullets = makeBullets();
    this.enemyShots = makeEnemyShots();
    this.particles = makeParticles();
    this.stars = makeStarfield(this.W, this.H);
    this.nebulae = makeNebulae(this.W, this.H);
    try {
      this.best = parseInt(window.localStorage.getItem('lumen-drift-high') || '0', 10) || 0;
    } catch (e) {
      this.best = 0;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.get('demo') === 'end') {
      this.demoEnd = true;
      this.score = 12480;
      this.wave = 6;
      this.combo = 5;
      this.state = 'over';
      this.player.alive = false;
      // A few drifting meteors behind the panel, for the screenshot.
      for (let i = 0; i < 4; i++) {
        this.enemies.push(makeEnemy('meteor', rand(60, 900), rand(40, 300), 6));
      }
      this.particles.spawnBurst(480, 300, '#59e6ff', 26, 260);
      this.particles.spawnRing(480, 300, '#ff4d7e');
    } else if (params.get('demo') === 'play') {
      this.start();
      this.wave = 2;
      this.startWave(2, true);
      for (let i = 0; i < 5; i++) {
        this.enemies.push(makeEnemy(i % 2 ? 'chaser' : 'meteor', rand(80, 880), rand(60, 260), 2));
      }
      this.enemies.push(makeEnemy('turret', 480, 120, 2));
      this.score = 2450;
      this.combo = 4;
      this.comboTimer = 2.0;
    }
  },

  saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      try {
        window.localStorage.setItem('lumen-drift-high', String(this.best));
      } catch (e) { /* storage unavailable; best lives for the session */ }
    }
  },

  start() {
    this.player.reset(this.W, this.H);
    this.bullets.list = [];
    this.enemyShots.list = [];
    this.enemies = [];
    this.powerups = [];
    this.particles.list = [];
    this.floaters = [];
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.trauma = 0;
    this.wave = 0;
    this.state = 'playing';
    this.nextWave();
    AudioSys.ensure();
    AudioSys.click();
  },

  nextWave() {
    this.wave += 1;
    this.startWave(this.wave, false);
  },

  startWave(n, skipBanner) {
    this.spawnQueue = this.buildQueue(n);
    this.spawnTimer = 0.6;
    this.wavePhase = skipBanner ? 'active' : 'banner';
    this.waveTimer = skipBanner ? 0 : 1.6;
    if (!skipBanner) AudioSys.waveStart();
  },

  buildQueue(n) {
    const q = [];
    const meteors = 4 + n * 2;
    const weavers = n >= 2 ? 1 + n : 0;
    const chasers = n >= 2 ? 1 + Math.floor(n * 1.2) : 0;
    const turrets = n >= 3 ? Math.min(3, Math.floor((n - 1) / 2)) : 0;
    for (let i = 0; i < meteors; i++) q.push('meteor');
    for (let i = 0; i < weavers; i++) q.push('weaver');
    for (let i = 0; i < chasers; i++) q.push('chaser');
    for (let i = 0; i < turrets; i++) q.push('turret');
    // Shuffle so the wave never feels scripted.
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = q[i]; q[i] = q[j]; q[j] = tmp;
    }
    return q;
  },

  spawnOne(kind) {
    let x = rand(40, this.W - 40);
    let y = -30;
    if (kind === 'chaser' && Math.random() < 0.3) {
      x = Math.random() < 0.5 ? -20 : this.W + 20;
      y = rand(60, 300);
    }
    this.enemies.push(makeEnemy(kind, x, y, this.wave));
  },

  addScore(base, x, y) {
    const mult = Math.min(8, 1 + Math.floor(this.combo / 3));
    const pts = base * mult;
    this.score += pts;
    this.floaters.push({ x, y, text: '+' + pts, color: '#ffe9a8', life: 0.9, maxLife: 0.9 });
  },

  killEnemy(e, index) {
    this.enemies.splice(index, 1);
    this.particles.spawnBurst(e.x, e.y, e.kind === 'meteor' ? '#ffb37a' : e.kind === 'chaser' ? '#ff4d7e' : e.kind === 'weaver' ? '#a4ff5e' : '#ffb347', 22, 240);
    this.particles.spawnRing(e.x, e.y, '#ffffff');
    AudioSys.boom(e.r > 22);
    this.combo += 1;
    this.comboTimer = 2.5;
    this.addScore(e.score, e.x, e.y);
    if (Math.random() < 0.12) {
      const kinds = ['shield', 'spread', 'slow'];
      this.powerups.push(makePowerUp(kinds[randInt(0, 2)], e.x, e.y));
    }
  },

  damagePlayer(amount, x, y) {
    const p = this.player;
    if (!p.alive || p.invuln > 0) return;
    if (p.shield > 0) {
      p.shield = 0;
      p.invuln = 1.0;
      this.particles.spawnRing(p.x, p.y, '#59e6ff');
      this.particles.spawnBurst(x, y, '#59e6ff', 14, 200);
      AudioSys.hit();
      this.addShake(0.35);
      this.floaters.push({ x: p.x, y: p.y - 30, text: 'SHIELD DOWN', color: '#59e6ff', life: 1.0, maxLife: 1.0 });
      return;
    }
    p.hull -= amount;
    p.invuln = 1.0;
    this.particles.spawnBurst(p.x, p.y, '#ff5e7a', 18, 260);
    AudioSys.hit();
    this.addShake(0.7);
    this.combo = 0;
    this.comboTimer = 0;
    if (p.hull <= 0) {
      p.hull = 0;
      this.gameOver();
    }
  },

  gameOver() {
    const p = this.player;
    p.alive = false;
    this.particles.spawnBurst(p.x, p.y, '#6ff7ff', 40, 320);
    this.particles.spawnBurst(p.x, p.y, '#ff4d7e', 30, 240);
    this.particles.spawnRing(p.x, p.y, '#ffffff');
    AudioSys.boom(true);
    AudioSys.gameOver();
    this.addShake(1.0);
    this.saveBest();
    this.state = 'over';
  },

  addShake(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  },

  applyPower(kind) {
    const p = this.player;
    if (kind === 'shield') {
      p.shield = 8;
      this.floaters.push({ x: p.x, y: p.y - 30, text: 'SHIELD UP', color: '#59e6ff', life: 1.0, maxLife: 1.0 });
    } else if (kind === 'spread') {
      p.spread = 10;
      this.floaters.push({ x: p.x, y: p.y - 30, text: 'SPREAD SHOT', color: '#ffd34d', life: 1.0, maxLife: 1.0 });
    } else if (kind === 'slow') {
      p.slow = 6;
      this.floaters.push({ x: p.x, y: p.y - 30, text: 'SLOW FIELD', color: '#c77dff', life: 1.0, maxLife: 1.0 });
    }
    AudioSys.power();
  },

  update(dt) {
    this.time += dt;
    this.stars.update(dt);
    this.nebulae.update(dt, this.time);
    this.particles.update(dt);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) this.floaters.splice(i, 1);
    }

    if (this.state === 'title') {
      for (const e of this.enemies) updateEnemy(e, dt, this.player, 1);
      this.handleMenuPresses();
      return;
    }
    if (this.state === 'over') {
      for (const e of this.enemies) {
        e.y += 30 * dt;
        e.rot += e.rotSpeed * dt;
        if (e.y > this.H + 40) { e.y = -40; e.x = rand(40, this.W - 40); }
      }
      this.handleMenuPresses();
      return;
    }
    if (this.state === 'paused') {
      this.handleMenuPresses();
      return;
    }

    // --- playing ---
    const p = this.player;
    const slowFactor = p.slow > 0 ? 0.55 : 1;

    for (const code of Input.drain()) {
      if (code === 'KeyP' || code === 'Escape') {
        this.state = 'paused';
        AudioSys.click();
      } else if (code === 'Space') {
        if (p.tryDash()) {
          AudioSys.dash();
          this.particles.spawnBurst(p.x, p.y, '#6ff7ff', 10, 160);
        }
      } else if (code === 'KeyM') {
        AudioSys.toggleMute();
      }
    }

    p.update(dt, this.W, this.H);
    if (p.trailTimer <= 0 && (Math.abs(p.vx) > 60 || Math.abs(p.vy) > 60)) {
      p.trailTimer = 0.03;
      this.particles.spawnTrail(p.x, p.y + 12, '#3fa9c9');
    }

    // Auto-fire.
    if (p.fireTimer <= 0) {
      p.fireTimer = p.fireRate;
      this.bullets.fire(p.x, p.y, p.spread);
      AudioSys.shoot();
    }

    // Spawning.
    if (this.wavePhase === 'banner') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.wavePhase = 'active';
    } else if (this.wavePhase === 'active') {
      if (this.spawnQueue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          this.spawnTimer = Math.max(0.38, 0.95 - this.wave * 0.05);
          this.spawnOne(this.spawnQueue.shift());
        }
      } else if (this.enemies.length === 0) {
        this.wavePhase = 'clear';
        this.waveTimer = 2.4;
        const bonus = 100 * this.wave;
        this.score += bonus;
        p.hull = Math.min(p.maxHull, p.hull + 12);
        this.floaters.push({ x: this.W / 2, y: this.H / 2 - 60, text: 'WAVE BONUS +' + bonus, color: '#ffe9a8', life: 1.6, maxLife: 1.6 });
        AudioSys.waveStart();
      }
    } else if (this.wavePhase === 'clear') {
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.nextWave();
    }

    // Enemies.
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.kind === 'turret' && e.y >= e.hoverY) {
        const dx = p.x - e.x, dy = p.y - e.y;
        e.aimAngle = Math.atan2(dy, dx);
      }
      const action = updateEnemy(e, dt, p, slowFactor);
      if (action === 'fire' && p.alive) {
        this.enemyShots.fire(e.x, e.y, p.x, p.y);
        AudioSys.enemyShoot();
      }
      if (e.y > this.H + 60 || e.x < -90 || e.x > this.W + 90) {
        this.enemies.splice(i, 1);
      }
    }

    this.bullets.update(dt, this.H);
    this.enemyShots.update(dt, this.W, this.H);

    // Power-ups drift and collect.
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pu = this.powerups[i];
      pu.t += dt;
      pu.y += pu.vy * dt;
      if (pu.y > this.H + 20) { this.powerups.splice(i, 1); continue; }
      if (p.alive) {
        const dx = pu.x - p.x, dy = pu.y - p.y;
        if (dx * dx + dy * dy < (pu.r + p.r + 6) * (pu.r + p.r + 6)) {
          this.powerups.splice(i, 1);
          this.particles.spawnBurst(pu.x, pu.y, '#ffffff', 12, 140);
          this.applyPower(pu.kind);
        }
      }
    }

    // Bullets vs enemies.
    for (const b of this.bullets.list) {
      if (b.dead) continue;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const dx = b.x - e.x, dy = b.y - e.y;
        const rr = e.r + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          b.dead = true;
          e.hp -= 1;
          e.flash = 1;
          this.particles.spawnBurst(b.x, b.y, '#ffe9a8', 4, 120);
          if (e.hp <= 0) this.killEnemy(e, i);
          break;
        }
      }
    }
    this.bullets.list = this.bullets.list.filter((b) => !b.dead);

    // Enemies vs player.
    if (p.alive && p.invuln <= 0) {
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        const dx = e.x - p.x, dy = e.y - p.y;
        const rr = e.r + p.r - 2;
        if (dx * dx + dy * dy < rr * rr) {
          const dmg = e.kind === 'meteor' ? Math.round(10 + e.r * 0.5) : e.kind === 'chaser' ? 14 : e.kind === 'weaver' ? 12 : 14;
          this.enemies.splice(i, 1);
          this.particles.spawnBurst(e.x, e.y, '#ff8ba0', 16, 220);
          this.damagePlayer(dmg, e.x, e.y);
          break;
        }
      }
    }

    // Enemy shots vs player.
    if (p.alive && p.invuln <= 0) {
      for (const s of this.enemyShots.list) {
        if (s.dead) continue;
        const dx = s.x - p.x, dy = s.y - p.y;
        const rr = s.r + p.r - 2;
        if (dx * dx + dy * dy < rr * rr) {
          s.dead = true;
          this.damagePlayer(10, s.x, s.y);
          break;
        }
      }
      this.enemyShots.list = this.enemyShots.list.filter((s) => !s.dead);
    }

    // Combo decay.
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
  },

  handleMenuPresses() {
    for (const code of Input.drain()) {
      if (code === 'KeyM') {
        AudioSys.toggleMute();
        continue;
      }
      if (this.state === 'title') {
        if (code === 'Enter' || code === 'Space' || code === 'MouseClick') {
          AudioSys.ensure();
          this.start();
        }
      } else if (this.state === 'over') {
        if (code === 'KeyR' || code === 'Enter' || code === 'Space' || code === 'MouseClick') {
          AudioSys.ensure();
          this.start();
        }
      } else if (this.state === 'paused') {
        if (code === 'KeyP' || code === 'Escape' || code === 'Enter' || code === 'MouseClick') {
          this.state = 'playing';
          AudioSys.click();
        }
      }
    }
  },

  /* ------------------------------------------------------------ */
  render(ctx) {
    ctx.save();
    if (this.trauma > 0) {
      const mag = this.trauma * this.trauma * 9;
      ctx.translate(rand(-mag, mag), rand(-mag, mag));
    }
    // Clear the frame first: an opaque background fill, with a margin
    // so the shake offset never leaves an unpainted strip at the edge.
    ctx.fillStyle = '#04060f';
    ctx.fillRect(-12, -12, this.W + 24, this.H + 24);
    this.nebulae.draw(ctx);
    this.stars.draw(ctx);
    for (const pu of this.powerups) drawPowerUp(ctx, pu, this.time);
    for (const e of this.enemies) drawEnemy(ctx, e, this.time);
    this.enemyShots.draw(ctx, this.time);
    this.bullets.draw(ctx);
    this.particles.draw(ctx);
    // The ship waits below the title text on the title screen.
    if (this.state !== 'title') this.player.draw(ctx, this.time);
    // Floating score popups.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      ctx.globalAlpha = clamp(f.life / f.maxLife, 0, 1);
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (this.state === 'playing' || this.state === 'paused') this.drawHud(ctx);
    if (this.state === 'title') this.drawTitle(ctx);
    if (this.state === 'paused') this.drawPaused(ctx);
    if (this.state === 'over') this.drawGameOver(ctx);
    if (this.state === 'playing' && this.wavePhase === 'banner') {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 44px "Courier New", monospace';
      ctx.shadowColor = '#59e6ff';
      ctx.shadowBlur = 24;
      ctx.fillStyle = '#dff8ff';
      ctx.fillText('WAVE ' + this.wave, this.W / 2, this.H / 2 - 40);
      ctx.restore();
    }
  },

  drawHud(ctx) {
    const p = this.player;
    ctx.save();
    ctx.textBaseline = 'middle';
    // Score, top-left.
    ctx.textAlign = 'left';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillStyle = '#eafcff';
    ctx.fillText('SCORE ' + String(this.score).padStart(6, '0'), 16, 24);
    ctx.font = '13px "Courier New", monospace';
    ctx.fillStyle = '#7fa8c9';
    ctx.fillText('BEST  ' + String(Math.max(this.best, this.score)).padStart(6, '0'), 16, 46);
    // Wave, top-center.
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px "Courier New", monospace';
    ctx.fillStyle = '#ffe9a8';
    ctx.fillText('WAVE ' + this.wave, this.W / 2, 24);
    // Hull bar, top-right.
    const bw = 150, bx = this.W - bw - 16, by = 16;
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.fillStyle = '#7fa8c9';
    ctx.fillText('HULL', bx - 8, by + 7);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(bx, by, bw, 12);
    const hullW = bw * clamp(p.hull / p.maxHull, 0, 1);
    ctx.fillStyle = p.hull > 50 ? '#59e6ff' : p.hull > 25 ? '#ffb347' : '#ff5e7a';
    ctx.fillRect(bx, by, hullW, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw, 12);
    // Active power-up timers under the hull bar.
    let ty = by + 26;
    ctx.font = '12px "Courier New", monospace';
    ctx.textAlign = 'right';
    if (p.shield > 0) { ctx.fillStyle = '#59e6ff'; ctx.fillText('SHIELD ' + p.shield.toFixed(0) + 's', bx + bw, ty); ty += 15; }
    if (p.spread > 0) { ctx.fillStyle = '#ffd34d'; ctx.fillText('SPREAD ' + p.spread.toFixed(0) + 's', bx + bw, ty); ty += 15; }
    if (p.slow > 0) { ctx.fillStyle = '#c77dff'; ctx.fillText('SLOW ' + p.slow.toFixed(0) + 's', bx + bw, ty); ty += 15; }
    // Dash cooldown, bottom-left.
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = '#7fa8c9';
    ctx.fillText('DASH [SPACE]', 16, this.H - 34);
    const dw = 90;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(16, this.H - 26, dw, 6);
    const dashFrac = 1 - clamp(p.dashTimer / 2.2, 0, 1);
    ctx.fillStyle = dashFrac >= 1 ? '#59e6ff' : '#3fa9c9';
    ctx.fillRect(16, this.H - 26, dw * dashFrac, 6);
    // Combo, bottom-right.
    if (this.combo >= 2) {
      const mult = Math.min(8, 1 + Math.floor(this.combo / 3));
      ctx.textAlign = 'right';
      ctx.font = 'bold 20px "Courier New", monospace';
      ctx.fillStyle = '#ffd34d';
      ctx.fillText('COMBO x' + mult, this.W - 16, this.H - 40);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(this.W - 106, this.H - 26, 90, 5);
      ctx.fillStyle = '#ffd34d';
      ctx.fillRect(this.W - 106, this.H - 26, 90 * clamp(this.comboTimer / 2.5, 0, 1), 5);
    }
    ctx.restore();
  },

  drawTitle(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 15, 0.55)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#59e6ff';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#eafcff';
    ctx.font = 'bold 64px "Courier New", monospace';
    ctx.fillText('LUMEN DRIFT', this.W / 2, 150);
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#ff4d7e';
    ctx.fillStyle = '#ffb3c6';
    ctx.font = '16px "Courier New", monospace';
    ctx.fillText('— a neon arcade drift through the dust —', this.W / 2, 196);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '15px "Courier New", monospace';
    const lines = [
      'MOVE  mouse or WASD / arrows      FIRE  automatic',
      'DASH  SPACE (brief invulnerability)      PAUSE  P      MUTE  M',
      'Destroy meteors, chasers, weavers and turrets.',
      'Chain kills to raise your combo. Grab S / W / T orbs:',
      'shield, spread shot, slow field. Survive the waves.'
    ];
    lines.forEach((ln, i) => ctx.fillText(ln, this.W / 2, 252 + i * 26));
    const blink = 0.65 + 0.35 * Math.sin(this.time * 4);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 20px "Courier New", monospace';
    ctx.fillText('CLICK OR PRESS ENTER TO LAUNCH', this.W / 2, 420);
    ctx.globalAlpha = 1;
    if (this.best > 0) {
      ctx.fillStyle = '#7fa8c9';
      ctx.font = '14px "Courier New", monospace';
      ctx.fillText('BEST  ' + String(this.best).padStart(6, '0'), this.W / 2, 452);
    }
    ctx.restore();
  },

  drawPaused(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 15, 0.6)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#eafcff';
    ctx.font = 'bold 40px "Courier New", monospace';
    ctx.fillText('PAUSED', this.W / 2, this.H / 2 - 12);
    ctx.fillStyle = '#7fa8c9';
    ctx.font = '15px "Courier New", monospace';
    ctx.fillText('press P or click to resume', this.W / 2, this.H / 2 + 30);
    ctx.restore();
  },

  drawGameOver(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 6, 15, 0.62)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ff4d7e';
    ctx.shadowBlur = 26;
    ctx.fillStyle = '#ffd3de';
    ctx.font = 'bold 52px "Courier New", monospace';
    ctx.fillText('SIGNAL LOST', this.W / 2, 168);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#cfe8ff';
    ctx.font = '20px "Courier New", monospace';
    ctx.fillText('FINAL SCORE   ' + String(this.score).padStart(6, '0'), this.W / 2, 236);
    ctx.fillText('WAVE REACHED  ' + this.wave, this.W / 2, 268);
    ctx.fillStyle = this.score >= this.best && this.score > 0 ? '#ffd34d' : '#7fa8c9';
    ctx.fillText(this.score >= this.best && this.score > 0 ? 'NEW BEST!' : 'BEST  ' + String(this.best).padStart(6, '0'), this.W / 2, 300);
    const blink = 0.65 + 0.35 * Math.sin(this.time * 4);
    ctx.globalAlpha = blink;
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 19px "Courier New", monospace';
    ctx.fillText('PRESS R OR CLICK TO FLY AGAIN', this.W / 2, 372);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
};
