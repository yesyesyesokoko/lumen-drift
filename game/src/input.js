'use strict';
/* Lumen Drift — keyboard and mouse state.
   The game reads held keys every frame and drains a queue of
   single presses (Enter, P, R, Space, M) for menu actions. */

const Input = {
  keys: Object.create(null),
  queue: [],
  mouseX: 480,
  mouseY: 380,
  mouseDown: false,
  mouseActive: false,
  lastMouseMove: 0,

  init(canvas) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      this.queue.push(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) {
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
      this.mouseActive = true;
      this.lastMouseMove = performance.now();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.queue.push('MouseClick');
      const r = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - r.left) / r.width) * canvas.width;
      this.mouseY = ((e.clientY - r.top) / r.height) * canvas.height;
      this.mouseActive = true;
      this.lastMouseMove = performance.now();
    });
    window.addEventListener('mouseup', () => {
      this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  },

  held(code) {
    return !!this.keys[code];
  },

  /* Movement axis from WASD or the arrow keys, -1 / 0 / 1 per axis. */
  axisX() {
    let x = 0;
    if (this.held('KeyA') || this.held('ArrowLeft')) x -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) x += 1;
    return x;
  },
  axisY() {
    let y = 0;
    if (this.held('KeyW') || this.held('ArrowUp')) y -= 1;
    if (this.held('KeyS') || this.held('ArrowDown')) y += 1;
    return y;
  },

  /* True while any movement key is held. */
  hasKeyMove() {
    return this.axisX() !== 0 || this.axisY() !== 0;
  },

  /* Drain the press queue; returns the codes pressed since last call. */
  drain() {
    const out = this.queue;
    this.queue = [];
    return out;
  }
};
