/**
 * AeroFlow 2D - UI Controls, Presets, and Event Binding
 * Mode switching, spawning, the object inspector, aerodynamic presets,
 * the control panel bindings, keyboard shortcuts and HUD updates.
 */

import { CONFIG, MAX_INFLOW_SPEED, applyQualityPreset } from './config.js';
import { state } from './state.js';
import { getDomainHeight } from './gl.js';
import { Obstacle } from './obstacle.js';
import { updateObstacles } from './rasterizer.js';
import { clearFluid } from './simulation.js';

export function setMode(mode) {
  state.currentMode = mode;
  const btnFluid = document.getElementById('mode-fluid-btn');
  const btnObj = document.getElementById('mode-object-btn');
  const hudMode = document.getElementById('hud-mode');
  const hintBadge = document.getElementById('hint-badge');
  const hintText = document.getElementById('hint-text');

  if (mode === 'fluid') {
    btnFluid.classList.add('active');
    btnObj.classList.remove('active');
    hudMode.textContent = 'Fluid Draw';
    hintBadge.textContent = 'FLUID MODE';
    hintText.textContent = 'Click and drag anywhere to inject airflow and smoke.';
    document.body.style.cursor = 'crosshair';
  } else {
    btnObj.classList.add('active');
    btnFluid.classList.remove('active');
    hudMode.textContent = 'Object Edit';
    hintBadge.textContent = 'OBJECT MODE';
    hintText.textContent = 'Click to select. Drag body to move, corners to scale, top knob to rotate.';
    document.body.style.cursor = 'default';
  }
}

document.getElementById('mode-fluid-btn').addEventListener('click', () => setMode('fluid'));
document.getElementById('mode-object-btn').addEventListener('click', () => setMode('object'));

// Spawning Shapes
function spawnObstacle(type) {
  const domainHeight = getDomainHeight();
  const cx = CONFIG.domainWidth / 2 + (Math.random() - 0.5) * CONFIG.domainWidth * 0.08;
  const cy = domainHeight / 2 + (Math.random() - 0.5) * domainHeight * 0.08;
  let obj;
  if (type === 'rect') {
    obj = new Obstacle('rect', cx, cy, CONFIG.domainWidth * 0.14, CONFIG.domainWidth * 0.07, 0);
  } else if (type === 'circle') {
    obj = new Obstacle('circle', cx, cy, CONFIG.domainWidth * 0.10, CONFIG.domainWidth * 0.10, 0);
  } else if (type === 'triangle') {
    obj = new Obstacle('triangle', cx, cy, CONFIG.domainWidth * 0.12, CONFIG.domainWidth * 0.11, 0);
  } else if (type === 'airfoil') {
    obj = new Obstacle('airfoil', cx, cy, CONFIG.domainWidth * 0.20, CONFIG.domainWidth * 0.06, -0.2); // ~11 deg angle of attack
  }

  state.obstacles.push(obj);
  state.selectedObstacle = obj;
  state.obstacleDirty = true;
  setMode('object');
  updateObstacles(CONFIG.dt);
  updateInspector();
  updateHUD();
}

document.getElementById('btn-spawn-rect').addEventListener('click', () => spawnObstacle('rect'));
document.getElementById('btn-spawn-circle').addEventListener('click', () => spawnObstacle('circle'));
document.getElementById('btn-spawn-triangle').addEventListener('click', () => spawnObstacle('triangle'));
document.getElementById('btn-spawn-airfoil').addEventListener('click', () => spawnObstacle('airfoil'));

// Inspector
export function updateInspector() {
  const card = document.getElementById('object-inspector');
  if (!state.selectedObstacle || state.currentMode !== 'object') {
    card.classList.remove('visible');
    return;
  }
  card.classList.add('visible');
  document.getElementById('insp-type').textContent = state.selectedObstacle.type;
  document.getElementById('insp-dim').textContent =
    `${state.selectedObstacle.width.toFixed(2)} × ${state.selectedObstacle.height.toFixed(2)} m`;
  let deg = Math.round((state.selectedObstacle.rotation * 180 / Math.PI) % 360);
  if (deg < 0) deg += 360;
  document.getElementById('val-insp-angle').textContent = `${deg}°`;
  document.getElementById('slider-insp-angle').value = deg;
  document.getElementById('slider-insp-width').max = CONFIG.domainWidth;
  document.getElementById('slider-insp-height').max = getDomainHeight();
  document.getElementById('slider-insp-width').value = state.selectedObstacle.width;
  document.getElementById('slider-insp-height').value = state.selectedObstacle.height;
  document.getElementById('val-insp-width').textContent = `${state.selectedObstacle.width.toFixed(2)} m`;
  document.getElementById('val-insp-height').textContent = `${state.selectedObstacle.height.toFixed(2)} m`;
}

document.getElementById('slider-insp-angle').addEventListener('input', (e) => {
  if (state.selectedObstacle) {
    state.selectedObstacle.rotation = (parseFloat(e.target.value) * Math.PI) / 180;
    document.getElementById('val-insp-angle').textContent = `${e.target.value}°`;
    state.obstacleDirty = true;
    updateObstacles(CONFIG.dt);
  }
});

function updateSelectedObstacleSize(width, height) {
  if (!state.selectedObstacle) return;
  state.selectedObstacle.width = Math.max(0.1, Math.min(width, CONFIG.domainWidth));
  state.selectedObstacle.height = Math.max(0.1, Math.min(height, getDomainHeight()));
  if (state.selectedObstacle.type === 'circle') {
    const diameter = Math.min(state.selectedObstacle.width, state.selectedObstacle.height);
    state.selectedObstacle.width = diameter;
    state.selectedObstacle.height = diameter;
  }
  state.selectedObstacle.radius = state.selectedObstacle.width / 2;
  state.obstacleDirty = true;
  updateObstacles(CONFIG.dt);
  updateInspector();
}

document.getElementById('slider-insp-width').addEventListener('input', (e) => {
  if (state.selectedObstacle) {
    updateSelectedObstacleSize(parseFloat(e.target.value), state.selectedObstacle.height);
  }
});

document.getElementById('slider-insp-height').addEventListener('input', (e) => {
  if (state.selectedObstacle) {
    updateSelectedObstacleSize(state.selectedObstacle.width, parseFloat(e.target.value));
  }
});

document.getElementById('btn-insp-del').addEventListener('click', () => {
  if (state.selectedObstacle) {
    state.obstacles = state.obstacles.filter(o => o !== state.selectedObstacle);
    state.selectedObstacle = null;
    state.obstacleDirty = true;
    updateObstacles(CONFIG.dt);
    updateInspector();
    updateHUD();
  }
});

// Preset Manager
export function loadPreset(name) {
  clearFluid();
  state.obstacles = [];
  state.selectedObstacle = null;

  const cw = CONFIG.domainWidth;
  const ch = getDomainHeight();

  if (name === 'windtunnel') {
    // Wind tunnel with aerodynamic NACA airfoil
    CONFIG.inflow = true;
    CONFIG.inflowSpeed = 75;
    CONFIG.streamlines = true;
    CONFIG.viscosity = 0.000;
    CONFIG.vorticity = 24.0;
    CONFIG.displayMode = 0;
    CONFIG.palette = 0;

    const foil = new Obstacle('airfoil', cw * 0.42, ch * 0.5, cw * 0.22, cw * 0.065, -0.15); // angle of attack
    state.obstacles.push(foil);
    state.selectedObstacle = foil;
  } else if (name === 'karman') {
    // Karman vortex street cylinder wake
    CONFIG.inflow = true;
    CONFIG.inflowSpeed = 65;
    CONFIG.streamlines = true;
    CONFIG.viscosity = 0.000;
    CONFIG.vorticity = 32.0;
    CONFIG.displayMode = 0;
    CONFIG.palette = 0;

    const cyl = new Obstacle('circle', cw * 0.32, ch * 0.5, cw * 0.09, cw * 0.09, 0);
    state.obstacles.push(cyl);
    state.selectedObstacle = cyl;
  } else if (name === 'slalom') {
    // Slalom course
    CONFIG.inflow = true;
    CONFIG.inflowSpeed = 80;
    CONFIG.streamlines = true;
    CONFIG.viscosity = 0.001;
    CONFIG.vorticity = 28.0;

    const tri = new Obstacle('triangle', cw * 0.3, ch * 0.35, cw * 0.12, cw * 0.11, Math.PI / 2);
    const rect = new Obstacle('rect', cw * 0.55, ch * 0.65, cw * 0.14, cw * 0.06, -Math.PI / 4);
    state.obstacles.push(tri, rect);
    state.selectedObstacle = tri;
  } else if (name === 'sandbox') {
    // Clean sandbox
    CONFIG.inflow = false;
    CONFIG.streamlines = false;
    CONFIG.viscosity = 0.000;
    CONFIG.vorticity = 20.0;

    const rect = new Obstacle('rect', cw * 0.5, ch * 0.5, cw * 0.13, cw * 0.08, 0.4);
    state.obstacles.push(rect);
    state.selectedObstacle = rect;
    setMode('fluid');
  }

  syncControlsToUI();
  updateObstacles(CONFIG.dt);
  updateInspector();
  updateHUD();
}

document.getElementById('preset-select').addEventListener('change', (e) => {
  loadPreset(e.target.value);
});

function syncControlsToUI() {
  document.getElementById('select-solver').value = CONFIG.solverMode;

  document.getElementById('slider-viscosity').value = CONFIG.viscosity;
  document.getElementById('val-viscosity').textContent = CONFIG.viscosity.toFixed(3);

  document.getElementById('slider-dissipation').value = CONFIG.dissipation;
  document.getElementById('val-dissipation').textContent = CONFIG.dissipation.toFixed(3);

  document.getElementById('slider-vorticity').value = CONFIG.vorticity;
  document.getElementById('val-vorticity').textContent = Math.round(CONFIG.vorticity);

  document.getElementById('toggle-inflow').checked = CONFIG.inflow;
  CONFIG.inflowSpeed = Math.min(Math.max(CONFIG.inflowSpeed, 0), MAX_INFLOW_SPEED);
  document.getElementById('slider-inflow-speed').value = CONFIG.inflowSpeed;
  document.getElementById('val-inflow-speed').textContent = `${Math.round(CONFIG.inflowSpeed)} m/s`;
  document.getElementById('toggle-streamlines').checked = CONFIG.streamlines;

  document.getElementById('select-viewmode').value = CONFIG.displayMode;
  document.getElementById('select-palette').value = CONFIG.palette;
}

// Sliders & Toggles event listeners
document.getElementById('select-solver').addEventListener('change', (e) => {
  CONFIG.solverMode = e.target.value;
  clearFluid();
});

document.getElementById('slider-viscosity').addEventListener('input', (e) => {
  CONFIG.viscosity = parseFloat(e.target.value);
  document.getElementById('val-viscosity').textContent = CONFIG.viscosity.toFixed(3);
});

document.getElementById('slider-dissipation').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  CONFIG.dissipation = val;
  CONFIG.velDissipation = val;
  document.getElementById('val-dissipation').textContent = val.toFixed(3);
});

document.getElementById('slider-vorticity').addEventListener('input', (e) => {
  CONFIG.vorticity = parseFloat(e.target.value);
  document.getElementById('val-vorticity').textContent = Math.round(CONFIG.vorticity);
});

document.getElementById('toggle-inflow').addEventListener('change', (e) => {
  CONFIG.inflow = e.target.checked;
});

document.getElementById('slider-inflow-speed').addEventListener('input', (e) => {
  CONFIG.inflowSpeed = Math.min(parseFloat(e.target.value), MAX_INFLOW_SPEED);
  e.target.value = CONFIG.inflowSpeed;
  document.getElementById('val-inflow-speed').textContent = `${Math.round(CONFIG.inflowSpeed)} m/s`;
});

document.getElementById('toggle-streamlines').addEventListener('change', (e) => {
  CONFIG.streamlines = e.target.checked;
});

document.getElementById('select-viewmode').addEventListener('change', (e) => {
  CONFIG.displayMode = parseInt(e.target.value, 10);
});

document.getElementById('select-palette').addEventListener('change', (e) => {
  CONFIG.palette = parseInt(e.target.value, 10);
});

document.getElementById('select-quality').addEventListener('change', (e) => {
  const quality = e.target.value;
  applyQualityPreset(quality);
  document.getElementById('val-solver-quality').textContent =
    quality.charAt(0).toUpperCase() + quality.slice(1);
});

// Initialize the quality selector to match CONFIG
document.getElementById('select-quality').value = CONFIG.quality;
document.getElementById('val-solver-quality').textContent =
  CONFIG.quality.charAt(0).toUpperCase() + CONFIG.quality.slice(1);

// Action Buttons
document.getElementById('btn-clear-fluid').addEventListener('click', clearFluid);
document.getElementById('btn-clear-objects').addEventListener('click', () => {
  state.obstacles = [];
  state.selectedObstacle = null;
  state.obstacleDirty = true;
  updateObstacles(CONFIG.dt);
  updateInspector();
  updateHUD();
});
document.getElementById('btn-reset').addEventListener('click', () => {
  loadPreset('windtunnel');
});

// Sidebar & Help Modal
const sidebar = document.getElementById('sidebar');
const togglePanelBtn = document.getElementById('toggle-panel-btn');
const closeSidebarBtn = document.getElementById('close-sidebar-btn');
const helpModal = document.getElementById('help-modal');
const btnHelp = document.getElementById('btn-help');
const btnCloseHelp = document.getElementById('btn-close-help');

export function toggleSidebar() {
  sidebar.classList.toggle('minimized');
}

togglePanelBtn.addEventListener('click', toggleSidebar);
closeSidebarBtn.addEventListener('click', toggleSidebar);

btnHelp.addEventListener('click', () => helpModal.classList.add('visible'));
btnCloseHelp.addEventListener('click', () => helpModal.classList.remove('visible'));

// Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  if (e.key === '1') {
    setMode('fluid');
  } else if (e.key === '2') {
    setMode('object');
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (state.selectedObstacle) {
      state.obstacles = state.obstacles.filter(o => o !== state.selectedObstacle);
      state.selectedObstacle = null;
      state.obstacleDirty = true;
      updateObstacles(CONFIG.dt);
      updateInspector();
      updateHUD();
    }
  } else if (e.key === 'Escape') {
    state.selectedObstacle = null;
    updateInspector();
  } else if (e.key === ' ') {
    e.preventDefault();
    CONFIG.paused = !CONFIG.paused;
  } else if (e.key === 'Tab') {
    e.preventDefault();
    toggleSidebar();
  } else if (e.key === '?' || e.key === 'h' || e.key === 'H') {
    helpModal.classList.toggle('visible');
  }
});

export function updateHUD() {
  document.getElementById('hud-objs').textContent = state.obstacles.length;
}
