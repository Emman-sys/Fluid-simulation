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
let simTime = 0;
let simFrameCount = 0;
let simAccumulator = 0;
const FIXED_SIM_DT = 1 / 60;   // fixed simulation timestep (60 Hz)
const MAX_SIM_SUBSTEPS = 1;    // at most one sim step per frame; no catch-up spiral

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

  state.obstacleDirty = true;
  updateObstacles(CONFIG.dt);
}

window.addEventListener('resize', resizeCanvas);

function animate(currentTime) {
  requestAnimationFrame(animate);

  const frameDt = Math.min((currentTime - lastTime) / 1000.0, 0.25);
  lastTime = currentTime;

  // Refresh boundary velocities every frame so movement forces do not persist
  // after an obstacle stops moving.
  updateObstacles(frameDt || CONFIG.dt);

  // Draw continuously while the pointer is held, including when it is
  // stationary and no new pointer events are being dispatched.
  if (state.currentMode === 'fluid' && state.pointer.isDown) {
    const col = getNextFluidColor();
    splat(state.pointer.x, state.pointer.y, state.pointer.pendingDx, state.pointer.pendingDy, col);
    state.pointer.pendingDx = 0;
    state.pointer.pendingDy = 0;
  }

  // Step fluid simulation at a fixed timestep.
  // Accumulate frame time and step the simulation as many fixed steps as needed,
  // capped to avoid a spiral of death on slow frames.
  simAccumulator += frameDt;
  let simSteps = 0;
  while (simAccumulator >= FIXED_SIM_DT && simSteps < MAX_SIM_SUBSTEPS) {
    const simStart = performance.now();
    stepFluid(FIXED_SIM_DT);
    const simEnd = performance.now();
    simTime += simEnd - simStart;
    simFrameCount++;
    simAccumulator -= FIXED_SIM_DT;
    simSteps++;
  }

  // Render WebGL view
  renderDisplay();

  // Render 2D handles and overlays
  renderOverlay();

  // FPS Calculation
  frameCount++;
  if (currentTime - fpsTimer >= 500) {
    const fps = Math.round((frameCount * 1000) / (currentTime - fpsTimer));
    const avgSimMs = simFrameCount ? (simTime / simFrameCount).toFixed(1) : '0';
    hudFps.textContent = `${fps} FPS  (sim ~${avgSimMs}ms)`;
    frameCount = 0;
    fpsTimer = currentTime;
    simTime = 0;
    simFrameCount = 0;
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
