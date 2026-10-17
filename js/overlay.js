/**
 * AeroFlow 2D - Overlay Canvas Rendering (Bounding Boxes & Control Handles)
 * 2D editor affordances drawn over the WebGL view for the selected obstacle.
 */

import { state } from './state.js';
import { overlayCanvas, overlayCtx, getWorldScale } from './gl.js';

export function renderOverlay() {
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  if (state.currentMode === 'object' && state.selectedObstacle) {
    const obj = state.selectedObstacle;
    const handles = obj.getControlHandles();
    const scale = getWorldScale();

    overlayCtx.save();
    overlayCtx.scale(scale, scale);

    // 1. Draw Oriented Bounding Box
    overlayCtx.save();
    overlayCtx.translate(obj.x, obj.y);
    overlayCtx.rotate(obj.rotation);

    overlayCtx.strokeStyle = '#00f2fe';
    overlayCtx.lineWidth = 1.8 / scale;
    overlayCtx.setLineDash([6, 4]);
    overlayCtx.strokeRect(-obj.width / 2, -obj.height / 2, obj.width, obj.height);

    // Center origin dot
    overlayCtx.fillStyle = '#00f2fe';
    overlayCtx.beginPath();
    overlayCtx.arc(0, 0, 3 / scale, 0, Math.PI * 2);
    overlayCtx.fill();

    overlayCtx.restore();

    // 2. Draw Rotation Handle Stem & Knob
    overlayCtx.beginPath();
    overlayCtx.setLineDash([]);
    overlayCtx.strokeStyle = '#00f2fe';
    overlayCtx.lineWidth = 2 / scale;
    overlayCtx.moveTo(handles.rotStemTop.x, handles.rotStemTop.y);
    overlayCtx.lineTo(handles.rotWorld.x, handles.rotWorld.y);
    overlayCtx.stroke();

    // Rotation Knob
    overlayCtx.beginPath();
    overlayCtx.arc(handles.rotWorld.x, handles.rotWorld.y, 8 / scale, 0, Math.PI * 2);
    overlayCtx.fillStyle = '#ffffff';
    overlayCtx.fill();
    overlayCtx.strokeStyle = '#00f2fe';
    overlayCtx.lineWidth = 2.5 / scale;
    overlayCtx.stroke();

    // Little rotate symbol inside knob
    overlayCtx.strokeStyle = '#031124';
    overlayCtx.lineWidth = 1.5 / scale;
    overlayCtx.beginPath();
    overlayCtx.arc(handles.rotWorld.x, handles.rotWorld.y, 4 / scale, 0.4 * Math.PI, 1.8 * Math.PI);
    overlayCtx.stroke();

    // 3. Draw Corner Scale Handles
    for (const corner of handles.corners) {
      overlayCtx.save();
      overlayCtx.translate(corner.world.x, corner.world.y);
      overlayCtx.rotate(obj.rotation);

      overlayCtx.fillStyle = '#ffffff';
      overlayCtx.strokeStyle = '#00f2fe';
      overlayCtx.lineWidth = 2 / scale;
      overlayCtx.beginPath();
      overlayCtx.roundRect(-5 / scale, -5 / scale, 10 / scale, 10 / scale, 2 / scale);
      overlayCtx.fill();
      overlayCtx.stroke();

      overlayCtx.restore();
    }

    // 4. Angle / Dimensions Tooltip
    overlayCtx.font = `${11 / scale}px monospace`;
    overlayCtx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    const deg = Math.round((obj.rotation * 180 / Math.PI) % 360);
    const text = `${obj.width.toFixed(2)}×${obj.height.toFixed(2)} m | ${deg < 0 ? deg + 360 : deg}°`;
    const textMetrics = overlayCtx.measureText(text);
    const tipX = obj.x - textMetrics.width / 2 - 6 / scale;
    const tipY = obj.y + obj.height / 2 + 20 / scale;

    overlayCtx.beginPath();
    overlayCtx.roundRect(tipX, tipY, textMetrics.width + 12 / scale, 18 / scale, 4 / scale);
    overlayCtx.fill();
    overlayCtx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    overlayCtx.lineWidth = 1 / scale;
    overlayCtx.stroke();

    overlayCtx.fillStyle = '#00f2fe';
    overlayCtx.fillText(text, tipX + 6 / scale, tipY + 13 / scale);

    overlayCtx.restore();
  }
}
