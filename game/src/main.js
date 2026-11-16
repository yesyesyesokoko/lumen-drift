'use strict';
/* Lumen Drift — boot: wire the canvas, the input and the loop. */

(function boot() {
  const canvas = document.getElementById('game');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  Input.init(canvas);
  Game.init();

  // First gesture unlocks audio (browsers block sound before input).
  const unlock = () => AudioSys.ensure();
  canvas.addEventListener('mousedown', unlock);
  window.addEventListener('keydown', unlock);

  let last = performance.now();
  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.05) dt = 0.05; // clamp hitches so physics stays stable
    Game.update(dt);
    Game.render(ctx);
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
})();
