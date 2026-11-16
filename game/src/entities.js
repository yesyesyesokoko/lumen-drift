'use strict';
/* Lumen Drift — entities: the player ship, enemies, bullets,
   power-ups, particles, and the drifting starfield behind them.
   All art is drawn in code; nothing is loaded from a file. */

const TAU = Math.PI * 2;

function rand(a, b) { return a + Math.random() * (b - a); }
function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

/* ------------------------------------------------------------------ */
/* Background: three parallax star layers and slow nebula blobs.      */
/* ------------------------------------------------------------------ */

function makeStarfield(w, h) {
  const layers = [];
  const defs = [
    { n: 70, speed: 12, size: 1.0, alpha: 0.5 },
    { n: 45, speed: 26, size: 1.5, alpha: 0.75 },
    { n: 26, speed: 48, size: 2.1, alpha: 1.0 }
  ];
  for (const d of defs) {
    const stars = [];
    for (let i = 0; i < d.n; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: d.size * rand(0.6, 1.4),
        tw: Math.random() * TAU,
        twSpeed: rand(0.5, 2.2)
      });
    }
    layers.push({ stars, speed: d.speed, alpha: d.alpha });
  }
  return {
    layers,
    update(dt) {
      for (const layer of this.layers) {
        for (const s of layer.stars) {
          s.y += layer.speed * dt;
          s.tw += s.twSpeed * dt;
          if (s.y > h + 4) { s.y = -4; s.x = Math.random() * w; }
        }
      }
    },
    draw(ctx) {
      for (const layer of this.layers) {
        for (const s of layer.stars) {
          const a = layer.alpha * (0.55 + 0.45 * Math.sin(s.tw));
          ctx.globalAlpha = a;
          ctx.fillStyle = '#cfe8ff';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  };
}

function makeNebulae(w, h) {
  const blobs = [
    { x: w * 0.18, y: h * 0.24, r: 260, hue: '124, 78, 200', drift: 6, phase: 0 },
    { x: w * 0.82, y: h * 0.62, r: 300, hue: '16, 120, 160', drift: -5, phase: 2 },
    { x: w * 0.62, y: h * 0.12, r: 200, hue: '200, 40, 110', drift: 4, phase: 4 },
    { x: w * 0.30, y: h * 0.85, r: 230, hue: '20, 90, 120', drift: -3, phase: 1 }
  ];
  return {
    update(dt, t) {
      for (const b of blobs) {
        b.x += b.drift * dt;
        if (b.x < -b.r) b.x = w + b.r;
        if (b.x > w + b.r) b.x = -b.r;
        b.glow = 0.10 + 0.04 * Math.sin(t * 0.4 + b.phase);
      }
    },
    draw(ctx) {
      for (const b of blobs) {
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(' + b.hue + ',' + b.glow + ')');
        g.addColorStop(1, 'rgba(' + b.hue + ',0)');
        ctx.fillStyle = g;
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
    }
  };
}

/* ------------------------------------------------------------------ */
/* Particles: sparks, shockwave rings, engine trail, dash ghosts.     */
/* ------------------------------------------------------------------ */

function makeParticles() {
  return {
    list: [],
    spawnBurst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const s = rand(0.2, 1) * speed;
        this.list.push({
          x, y,
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          life: rand(0.35, 0.8), maxLife: 0.8,
          size: rand(1.5, 3.5), color,
          drag: 0.92, ring: false
        });
      }
    },
    spawnRing(x, y, color) {
      this.list.push({
        x, y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45,
        size: 6, color, drag: 1, ring: true
      });
    },
    spawnTrail(x, y, color) {
      this.list.push({
        x: x + rand(-3, 3), y: y + rand(-3, 3),
        vx: rand(-8, 8), vy: rand(20, 55),
        life: rand(0.2, 0.4), maxLife: 0.4,
        size: rand(1, 2.2), color,
        drag: 0.96, ring: false
      });
    },
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life -= dt;
        if (p.life <= 0) { this.list.splice(i, 1); continue; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= p.drag;
        p.vy *= p.drag;
      }
      if (this.list.length > 320) this.list.splice(0, this.list.length - 320);
    },
    draw(ctx) {
      for (const p of this.list) {
        const a = clamp(p.life / p.maxLife, 0, 1);
        if (p.ring) {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + (1 - a) * 70, 0, TAU);
          ctx.stroke();
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * a + 0.4, 0, TAU);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Player ship.                                                        */
/* ------------------------------------------------------------------ */

function makePlayer(w, h) {
  return {
    x: w / 2, y: h - 110,
    vx: 0, vy: 0,
    r: 13,
    hull: 100,
    maxHull: 100,
    fireTimer: 0,
    fireRate: 0.14,
    dashTimer: 0,       // cooldown left
    dashTime: 0,        // active dash time left
    dashDirX: 0, dashDirY: -1,
    invuln: 0,
    alive: true,
    spread: 0, shield: 0, slow: 0,
    tilt: 0,
    trailTimer: 0,

    reset(w2, h2) {
      this.x = w2 / 2; this.y = h2 - 110;
      this.vx = 0; this.vy = 0;
      this.hull = this.maxHull;
      this.fireTimer = 0;
      this.dashTimer = 0; this.dashTime = 0;
      this.invuln = 0;
      this.alive = true;
      this.spread = 0; this.shield = 0; this.slow = 0;
      this.tilt = 0;
    },

    tryDash() {
      if (this.dashTimer > 0 || !this.alive) return false;
      this.dashTimer = 2.2;
      this.dashTime = 0.18;
      this.invuln = Math.max(this.invuln, 0.35);
      const mx = Input.axisX();
      const my = Input.axisY();
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        this.dashDirX = mx / len; this.dashDirY = my / len;
      } else if (Input.mouseActive) {
        const dx = Input.mouseX - this.x, dy = Input.mouseY - this.y;
        const len = Math.hypot(dx, dy) || 1;
        this.dashDirX = dx / len; this.dashDirY = dy / len;
      } else {
        this.dashDirX = 0; this.dashDirY = -1;
      }
      return true;
    },

    update(dt, w, h) {
      if (!this.alive) return;
      const accel = 2400;
      const maxSpeed = 340;
      let ax = 0, ay = 0;
      if (Input.hasKeyMove()) {
        ax = Input.axisX();
        ay = Input.axisY();
        const len = Math.hypot(ax, ay) || 1;
        ax /= len; ay /= len;
      } else if (Input.mouseActive) {
        const dx = Input.mouseX - this.x;
        const dy = Input.mouseY - this.y;
        const d = Math.hypot(dx, dy);
        if (d > 6) {
          ax = dx / d; ay = dy / d;
          const pull = clamp(d / 90, 0.25, 1);
          ax *= pull; ay *= pull;
        }
      }
      if (this.dashTime > 0) {
        this.dashTime -= dt;
        this.vx = this.dashDirX * 780;
        this.vy = this.dashDirY * 780;
      } else {
        this.vx += ax * accel * dt;
        this.vy += ay * accel * dt;
        this.vx *= Math.pow(0.0018, dt);
        this.vy *= Math.pow(0.0018, dt);
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > maxSpeed) {
          this.vx = (this.vx / sp) * maxSpeed;
          this.vy = (this.vy / sp) * maxSpeed;
        }
      }
      this.x = clamp(this.x + this.vx * dt, 16, w - 16);
      this.y = clamp(this.y + this.vy * dt, 16, h - 16);
      this.tilt = lerp(this.tilt, clamp(this.vx / maxSpeed, -1, 1) * 0.35, Math.min(1, dt * 10));
      this.fireTimer -= dt;
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      this.invuln = Math.max(0, this.invuln - dt);
      this.spread = Math.max(0, this.spread - dt);
      this.shield = Math.max(0, this.shield - dt);
      this.slow = Math.max(0, this.slow - dt);
      this.trailTimer -= dt;
    },

    draw(ctx, t) {
      if (!this.alive) return;
      if (this.invuln > 0 && Math.floor(t * 18) % 2 === 0 && this.dashTime <= 0) {
        ctx.globalAlpha = 0.45;
      }
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.tilt);
      // Engine flame.
      const flame = 10 + Math.sin(t * 32) * 3 + Math.hypot(this.vx, this.vy) * 0.02;
      const fg = ctx.createLinearGradient(0, 10, 0, 10 + flame + 8);
      fg.addColorStop(0, 'rgba(255, 190, 90, 0.95)');
      fg.addColorStop(1, 'rgba(255, 80, 40, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.moveTo(-5, 10);
      ctx.lineTo(0, 10 + flame + 8);
      ctx.lineTo(5, 10);
      ctx.closePath();
      ctx.fill();
      // Hull: a swept dart.
      ctx.shadowColor = '#59e6ff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#0e2a3d';
      ctx.strokeStyle = '#6ff7ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -17);
      ctx.lineTo(11, 9);
      ctx.lineTo(4, 5);
      ctx.lineTo(0, 10);
      ctx.lineTo(-4, 5);
      ctx.lineTo(-11, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Cockpit.
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#bffcff';
      ctx.beginPath();
      ctx.arc(0, -4, 3.4, 0, TAU);
      ctx.fill();
      ctx.restore();
      // Shield ring.
      if (this.shield > 0) {
        ctx.save();
        ctx.globalAlpha = 0.45 + 0.2 * Math.sin(t * 6);
        ctx.strokeStyle = '#59e6ff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y, 24, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  };
}

/* ------------------------------------------------------------------ */
/* Bullets: player shots (up) and enemy shots (aimed).                 */
/* ------------------------------------------------------------------ */

function makeBullets() {
  return {
    list: [],
    fire(x, y, spread) {
      const shots = spread > 0 ? [-0.22, 0, 0.22] : [0];
      for (const a of shots) {
        this.list.push({
          x, y: y - 14,
          vx: Math.sin(a) * 520, vy: -Math.cos(a) * 520,
          r: 3, dead: false
        });
      }
    },
    update(dt, h) {
      for (const b of this.list) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y < -12 || b.x < -12 || b.x > 972) b.dead = true;
      }
      this.list = this.list.filter((b) => !b.dead);
    },
    draw(ctx) {
      ctx.save();
      ctx.shadowColor = '#aef6ff';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#d8fbff';
      for (const b of this.list) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  };
}

function makeEnemyShots() {
  return {
    list: [],
    fire(x, y, tx, ty) {
      const dx = tx - x, dy = ty - y;
      const len = Math.hypot(dx, dy) || 1;
      this.list.push({
        x, y,
        vx: (dx / len) * 210, vy: (dy / len) * 210,
        r: 4.5, dead: false
      });
    },
    update(dt, w, h) {
      for (const s of this.list) {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        if (s.y < -16 || s.y > h + 16 || s.x < -16 || s.x > w + 16) s.dead = true;
      }
      this.list = this.list.filter((s) => !s.dead);
    },
    draw(ctx, t) {
      ctx.save();
      ctx.shadowColor = '#ff5e7a';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff8ba0';
      for (const s of this.list) {
        const pulse = 1 + 0.25 * Math.sin(t * 14 + s.x);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r * pulse, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  };
}

/* ------------------------------------------------------------------ */
/* Enemies.                                                            */
/* ------------------------------------------------------------------ */

function makeEnemy(kind, x, y, wave) {
  const base = {
    kind, x, y, vx: 0, vy: 0,
    r: 14, hp: 1, maxHp: 1,
    score: 50, dead: false,
    rot: rand(0, TAU), rotSpeed: rand(-1.5, 1.5),
    t: rand(0, TAU), flash: 0
  };
  if (kind === 'meteor') {
    base.r = rand(13, 30);
    base.hp = base.maxHp = Math.max(1, Math.round(base.r / 11));
    base.vy = rand(55, 120);
    base.vx = rand(-30, 30);
    base.score = Math.round(base.r);
    base.verts = [];
    const n = 9;
    for (let i = 0; i < n; i++) base.verts.push(rand(0.72, 1.15));
  } else if (kind === 'chaser') {
    base.r = 13;
    // Toughness grows slowly: +1 hull every four waves, capped at 3.
    base.hp = base.maxHp = Math.min(3, 1 + Math.floor(wave / 4));
    base.speed = rand(95, 130);
    base.score = 100;
  } else if (kind === 'weaver') {
    base.r = 12;
    base.hp = base.maxHp = Math.min(3, 1 + Math.floor(wave / 4));
    base.vy = rand(90, 140);
    base.baseX = x;
    base.amp = rand(50, 110);
    base.freq = rand(1.6, 2.6);
    base.score = 80;
  } else if (kind === 'turret') {
    base.r = 16;
    base.hp = base.maxHp = 4;
    base.vy = 55;
    base.hoverY = rand(90, 190);
    base.strafeDir = Math.random() < 0.5 ? -1 : 1;
    base.fireTimer = rand(1.0, 1.8);
    base.telegraph = 0;
    base.score = 150;
  }
  return base;
}

function updateEnemy(e, dt, player, slowFactor) {
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt * 6);
  const s = slowFactor;
  if (e.kind === 'meteor') {
    e.x += e.vx * s * dt;
    e.y += e.vy * s * dt;
    e.rot += e.rotSpeed * s * dt;
  } else if (e.kind === 'chaser') {
    const dx = player.x - e.x, dy = player.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    const accel = 260 * s;
    e.vx += (dx / len) * accel * dt;
    e.vy += (dy / len) * accel * dt;
    const sp = Math.hypot(e.vx, e.vy);
    const max = e.speed * s;
    if (sp > max) { e.vx = (e.vx / sp) * max; e.vy = (e.vy / sp) * max; }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.rot += dt * 2;
  } else if (e.kind === 'weaver') {
    e.y += e.vy * s * dt;
    e.x = e.baseX + Math.sin(e.t * e.freq) * e.amp;
  } else if (e.kind === 'turret') {
    if (e.y < e.hoverY) {
      e.y += e.vy * s * dt;
    } else {
      e.x += e.strafeDir * 42 * s * dt;
      if (e.x < 40) e.strafeDir = 1;
      if (e.x > 920) e.strafeDir = -1;
      e.fireTimer -= dt * s;
      if (e.fireTimer <= 0.45) e.telegraph = 0.45 - Math.max(0, e.fireTimer);
      if (e.fireTimer <= 0) {
        e.fireTimer = rand(1.5, 2.1);
        e.telegraph = 0;
        return 'fire';
      }
    }
  }
  return null;
}

function drawEnemy(ctx, e, t) {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.kind === 'meteor') {
    ctx.rotate(e.rot);
    ctx.fillStyle = e.flash > 0 ? '#ffd9b0' : '#5a4636';
    ctx.strokeStyle = '#c98a5a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    const n = e.verts.length;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const r = e.r * e.verts[i];
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 170, 110, 0.35)';
    ctx.beginPath();
    ctx.arc(-e.r * 0.25, -e.r * 0.2, e.r * 0.28, 0, TAU);
    ctx.fill();
  } else if (e.kind === 'chaser') {
    const pulse = 1 + 0.12 * Math.sin(e.t * 9);
    ctx.rotate(e.rot);
    ctx.shadowColor = '#ff4d7e';
    ctx.shadowBlur = 12;
    ctx.fillStyle = e.flash > 0 ? '#ffd3de' : '#a1123d';
    ctx.strokeStyle = '#ff4d7e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      const r = e.r * pulse * (i % 2 === 0 ? 1 : 0.55);
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ff8ba0';
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, TAU);
    ctx.fill();
  } else if (e.kind === 'weaver') {
    ctx.rotate(Math.sin(e.t * 3) * 0.5);
    ctx.shadowColor = '#a4ff5e';
    ctx.shadowBlur = 10;
    ctx.fillStyle = e.flash > 0 ? '#eaffd0' : '#2c5a12';
    ctx.strokeStyle = '#a4ff5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(12, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (e.kind === 'turret') {
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 12;
    ctx.fillStyle = e.flash > 0 ? '#ffe9c4' : '#4d3208';
    ctx.strokeStyle = '#ffb347';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Barrel points at the player.
    ctx.rotate(e.aimAngle || 0);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(0, -3, e.r + 8, 6);
    ctx.restore();
    ctx.save();
    ctx.translate(e.x, e.y);
    if (e.telegraph > 0) {
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 24);
      ctx.fillStyle = '#ff5e7a';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#ff5e7a';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
  // Health pips for tough enemies.
  if (e.maxHp > 2 && e.hp < e.maxHp) {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(e.x - 12, e.y - e.r - 10, 24 * (e.hp / e.maxHp), 3);
  }
}

/* ------------------------------------------------------------------ */
/* Power-ups: shield, spread shot, slow field.                         */
/* ------------------------------------------------------------------ */

function makePowerUp(kind, x, y) {
  return {
    kind, x, y,
    vy: 46,
    r: 13,
    t: rand(0, TAU),
    dead: false
  };
}

function drawPowerUp(ctx, p, t) {
  const bob = Math.sin(p.t * 3) * 3;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  const colors = {
    shield: { ring: '#59e6ff', core: '#0e2a3d', glyph: '#bffcff', label: 'S' },
    spread: { ring: '#ffd34d', core: '#3d2c05', glyph: '#ffedb0', label: 'W' },
    slow: { ring: '#c77dff', core: '#241040', glyph: '#e9d5ff', label: 'T' }
  };
  const c = colors[p.kind];
  ctx.shadowColor = c.ring;
  ctx.shadowBlur = 14;
  ctx.fillStyle = c.core;
  ctx.strokeStyle = c.ring;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, TAU);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = c.glyph;
  ctx.font = 'bold 12px "Courier New", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(c.label, 0, 1);
  ctx.restore();
}
