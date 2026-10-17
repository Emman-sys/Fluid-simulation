/**
 * AeroFlow 2D - Interaction & Object Editing Subsystem
 * Pointer handling, hit-testing and drag actions for fluid drawing and
 * object manipulation. Shared values live on the imported `state` object.
 */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { screenToWorld, getPointerPos, getWorldScale } from './gl.js';
import { updateObstacles } from './rasterizer.js';
import { updateInspector } from './ui.js';

// Color cycle for fluid drawing (module-local; only getNextFluidColor reads it)
let colorHue = 180;

export function getNextFluidColor() {
  colorHue = (colorHue + 1.2) % 360;
  const h = colorHue;
  // Simple HSL to RGB
  const s = 0.9, l = 0.6;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [(r + m) * 1.5, (g + m) * 1.5, (b + m) * 1.5];
}

// Hit-testing in object editing mode
function hitTestHandles(obj, px, py) {
  const handles = obj.getControlHandles();
  // Rotation handle knob (radius 14px hit region)
  const dRot = Math.hypot(px - handles.rotWorld.x, py - handles.rotWorld.y);
  if (dRot <= 14 / getWorldScale()) {
    return { type: 'rotate', handle: handles.rotWorld };
  }
  // Corner scale handles (radius 10px hit region)
  for (const corner of handles.corners) {
    const dCorner = Math.hypot(px - corner.world.x, py - corner.world.y);
    if (dCorner <= 10 / getWorldScale()) {
      return { type: 'scale', corner: corner };
    }
  }
  return null;
}

function hitTestObstacles(px, py) {
  // Check from top to bottom
  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    if (state.obstacles[i].containsPoint(px, py)) {
      return state.obstacles[i];
    }
  }
  return null;
}

// Pointer event listeners
window.addEventListener('pointerdown', (e) => {
  if (e.target.closest('#sidebar') || e.target.closest('#top-bar') || e.target.closest('#help-modal') || e.target.closest('#toggle-panel-btn')) {
    return;
  }

  const pos = getPointerPos(e);
  const worldPos = screenToWorld(pos.x, pos.y);
  state.pointer.isDown = true;
  state.pointer.x = pos.x;
  state.pointer.y = pos.y;
  state.pointer.prevX = pos.x;
  state.pointer.prevY = pos.y;
  state.pointer.pendingDx = 0;
  state.pointer.pendingDy = 0;

  if (state.currentMode === 'object') {
    // If an object is already selected, check handles first
    if (state.selectedObstacle) {
      const handleHit = hitTestHandles(state.selectedObstacle, worldPos.x, worldPos.y);
      if (handleHit) {
        if (handleHit.type === 'rotate') {
          state.dragAction = {
            type: 'rotate',
            obj: state.selectedObstacle,
            startRotation: state.selectedObstacle.rotation,
            startPointerAngle: Math.atan2(worldPos.y - state.selectedObstacle.y, worldPos.x - state.selectedObstacle.x)
          };
          return;
        } else if (handleHit.type === 'scale') {
          const startLocal = state.selectedObstacle.toLocal(worldPos.x, worldPos.y);
          state.dragAction = {
            type: 'scale',
            obj: state.selectedObstacle,
            corner: handleHit.corner,
            startWidth: state.selectedObstacle.width,
            startHeight: state.selectedObstacle.height,
            startRadius: state.selectedObstacle.radius,
            startLocalX: startLocal.x,
            startLocalY: startLocal.y
          };
          return;
        }
      }
    }

    // Test clicking on obstacle body
    const hitObj = hitTestObstacles(worldPos.x, worldPos.y);
    if (hitObj) {
      state.selectedObstacle = hitObj;
      updateInspector();
      state.dragAction = {
        type: 'translate',
        obj: hitObj,
        startObjX: hitObj.x,
        startObjY: hitObj.y,
        startPointerX: worldPos.x,
        startPointerY: worldPos.y
      };
    } else {
      // Clicked empty canvas -> deselect
      state.selectedObstacle = null;
      updateInspector();
      state.dragAction = null;
    }
  }
});

window.addEventListener('pointermove', (e) => {
  const pos = getPointerPos(e);
  const dx = pos.x - state.pointer.x;
  const dy = pos.y - state.pointer.y;

  state.pointer.prevX = state.pointer.x;
  state.pointer.prevY = state.pointer.y;
  state.pointer.x = pos.x;
  state.pointer.y = pos.y;

  if (state.currentMode === 'fluid') {
    if (state.pointer.isDown) {
      state.pointer.pendingDx += dx;
      state.pointer.pendingDy += dy;
    }
  } else if (state.currentMode === 'object') {
    const worldPos = screenToWorld(pos.x, pos.y);
    if (state.pointer.isDown && state.dragAction) {
      const obj = state.dragAction.obj;

      if (state.dragAction.type === 'translate') {
        obj.x = state.dragAction.startObjX + (worldPos.x - state.dragAction.startPointerX);
        obj.y = state.dragAction.startObjY + (worldPos.y - state.dragAction.startPointerY);
        updateObstacles(CONFIG.dt);
        updateInspector();
      } else if (state.dragAction.type === 'rotate') {
        const currentAngle = Math.atan2(worldPos.y - obj.y, worldPos.x - obj.x);
        let angleDelta = currentAngle - state.dragAction.startPointerAngle;
        let newAngle = state.dragAction.startRotation + angleDelta;
        // Shift to snap 15 deg
        if (e.shiftKey) {
          const snap = Math.PI / 12;
          newAngle = Math.round(newAngle / snap) * snap;
        }
        obj.rotation = newAngle;
        updateObstacles(CONFIG.dt);
        updateInspector();
      } else if (state.dragAction.type === 'scale') {
        const currLocal = obj.toLocal(worldPos.x, worldPos.y);
        const deltaLX = currLocal.x - state.dragAction.startLocalX;
        const deltaLY = currLocal.y - state.dragAction.startLocalY;

        if (obj.type === 'circle') {
          const newRadius = Math.max(12, Math.hypot(currLocal.x, currLocal.y));
          obj.radius = newRadius;
          obj.width = newRadius * 2;
          obj.height = newRadius * 2;
        } else {
          const sx = state.dragAction.corner.sx;
          const sy = state.dragAction.corner.sy;
          let newW = Math.max(0.1, state.dragAction.startWidth + 2 * sx * deltaLX);
          let newH = Math.max(0.1, state.dragAction.startHeight + 2 * sy * deltaLY);

          if (e.shiftKey) {
            // Proportional uniform scaling
            const aspect = state.dragAction.startWidth / state.dragAction.startHeight;
            const avgScale = (newW / state.dragAction.startWidth + newH / state.dragAction.startHeight) / 2;
            newW = Math.max(0.1, state.dragAction.startWidth * avgScale);
            newH = Math.max(24, newW / aspect);
          }

          obj.width = newW;
          obj.height = newH;
          obj.radius = newW / 2;
        }
        updateObstacles(CONFIG.dt);
        updateInspector();
      }
    } else {
      // Hover cursor update
      updateHoverCursor(worldPos.x, worldPos.y);
    }
  }
});

export function releasePointer() {
  state.pointer.isDown = false;
  state.pointer.pendingDx = 0;
  state.pointer.pendingDy = 0;
  state.dragAction = null;
}

window.addEventListener('pointerup', releasePointer);
window.addEventListener('pointercancel', releasePointer);

function updateHoverCursor(px, py) {
  if (!state.selectedObstacle) {
    const hit = hitTestObstacles(px, py);
    document.body.style.cursor = hit ? 'move' : 'default';
    return;
  }

  const handleHit = hitTestHandles(state.selectedObstacle, px, py);
  if (handleHit) {
    if (handleHit.type === 'rotate') {
      document.body.style.cursor = 'crosshair';
    } else if (handleHit.type === 'scale') {
      document.body.style.cursor = 'nesw-resize';
    }
  } else if (state.selectedObstacle.containsPoint(px, py)) {
    document.body.style.cursor = 'move';
  } else {
    const hit = hitTestObstacles(px, py);
    document.body.style.cursor = hit ? 'move' : 'default';
  }
}
