/**
 * AeroFlow 2D - Application Entry Point
 * Window resize handling, the main animation/benchmark loop and startup.
 * Importing this module wires up every subsystem and begins rendering.
 */

import { CONFIG } from './config.js';
import { state } from './state.js';
import {
  glCanvas,
  overlayCanvas,
  overlayCtx
} from './gl.js';
import { updateObstacles } from './rasterizer.js';
import { stepFluid, renderDisplay, splat } from './simulation.js';
import { renderOverlay } from './overlay.js';
import { getNextFluidColor } from './interaction.js';
import { loadPreset, setMode, updateHUD } from './ui.js';

const hudFps = document.getElementById('hud-fps');
const hudRes = document.getElementById('hud-res');

// Animation timing (module-local; only the loop below reads/writes these)
let lastTime = performance.now();
let frameCount = 0;
let fpsTimer = performance.now();

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;

  glCanvas.width = width * dpr;
  glCanvas.height = height * dpr;
  glCanvas.style.width = width + 'px';
  glCanvas.style.height = height + 'px';

  overlayCanvas.width = width * dpr;
  overlayCanvas.height = height * dpr;
  overlayCanvas.style.width = width + 'px';
  overlayCanvas.style.height = height + 'px';
  overlayCtx.scale(dpr, dpr);

  updateObstacles(CONFIG.dt);
}

window.addEventListener('resize', resizeCanvas);

function animate(currentTime) {
  requestAnimationFrame(animate);

  const dt = Math.min((currentTime - lastTime) / 1000.0, 0.033);
  lastTime = currentTime;

  // Refresh boundary velocities every frame so movement forces do not persist
  // after an obstacle stops moving.
  updateObstacles(dt || CONFIG.dt);

  // Draw continuously while the pointer is held, including when it is
  // stationary and no new pointer events are being dispatched.
  if (state.currentMode === 'fluid' && state.pointer.isDown) {
    const col = getNextFluidColor();
    splat(state.pointer.x, state.pointer.y, state.pointer.pendingDx, state.pointer.pendingDy, col);
    state.pointer.pendingDx = 0;
    state.pointer.pendingDy = 0;
  }

  // Step fluid simulation
  stepFluid(dt || CONFIG.dt);

  // Render WebGL view
  renderDisplay();

  // Render 2D handles and overlays
  renderOverlay();

  // FPS Calculation
  frameCount++;
  if (currentTime - fpsTimer >= 500) {
    const fps = Math.round((frameCount * 1000) / (currentTime - fpsTimer));
    hudFps.textContent = fps;
    frameCount = 0;
    fpsTimer = currentTime;
  }
}

// Initialize application
resizeCanvas();
loadPreset('windtunnel');
setMode('fluid');
updateHUD();
if (hudRes) {
  hudRes.textContent = `${CONFIG.simWidth}×${CONFIG.simHeight}`;
}
requestAnimationFrame(animate);
