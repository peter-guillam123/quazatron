// Entry point: check for WebGL, then start the game.
import { Game } from './game.js';

function webglOk() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2'));
  } catch { return false; }
}

if (!webglOk()) {
  const l = document.getElementById('loading');
  l.textContent = 'KLEPTO needs WebGL 2, which this browser does not have.';
} else {
  const game = new Game();
  window.klepto = game;   // handy from the console
  document.fonts.ready.then(() => game.start());
}
