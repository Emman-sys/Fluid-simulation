/**
 * AeroFlow 2D - Obstacle Boundary Grid Rasterization
 * Renders obstacles to an offscreen canvas and uploads to WebGL texture.
 */

import { CONFIG } from './config.js';
import { state } from './state.js';
import { gl, simW, simH, getDomainHeight, obstacleCanvas, obstacleCtx, obstacleTex } from './gl.js';

/**
 * Update obstacle texture by rasterizing all obstacles to offscreen canvas
 * @param {number} dt - Time delta for velocity calculation
 */
export function updateObstacles(dt) {
  // Clear obstacle canvas with black (0, 0, 0, 0)
  obstacleCtx.fillStyle = 'black';
  obstacleCtx.fillRect(0, 0, simW, simH);

  const scaleX = simW / CONFIG.domainWidth;
  const scaleY = simH / getDomainHeight();

  for (const obj of state.obstacles) {
    obj.updateVelocity(dt);

    obstacleCtx.save();
    // Transform to sim coordinates
    obstacleCtx.translate(obj.x * scaleX, (getDomainHeight() - obj.y) * scaleY);
    obstacleCtx.rotate(-obj.rotation);

    // Encode obstacle: Red = 255 (solid), Green = Vx, Blue = -Vy (y-inverted)
    const vxNorm = Math.max(0, Math.min(255, Math.round(128 + obj.vx * 0.15)));
    const vyNorm = Math.max(0, Math.min(255, Math.round(128 - obj.vy * 0.15)));
    obstacleCtx.fillStyle = `rgb(255, ${vxNorm}, ${vyNorm})`;

    const w = obj.width * scaleX;
    const h = obj.height * scaleY;

    if (obj.type === 'rect') {
      obstacleCtx.beginPath();
      obstacleCtx.rect(-w / 2, -h / 2, w, h);
      obstacleCtx.fill();
    } else if (obj.type === 'circle') {
      obstacleCtx.beginPath();
      obstacleCtx.arc(0, 0, obj.radius * scaleX, 0, Math.PI * 2);
      obstacleCtx.fill();
    } else if (obj.type === 'triangle') {
      obstacleCtx.beginPath();
      obstacleCtx.moveTo(0, h / 2);
      obstacleCtx.lineTo(w / 2, -h / 2);
      obstacleCtx.lineTo(-w / 2, -h / 2);
      obstacleCtx.closePath();
      obstacleCtx.fill();
    } else if (obj.type === 'airfoil') {
      const chord = w;
      const maxT = h / 2;
      obstacleCtx.beginPath();
      const steps = 32;
      for (let i = 0; i <= steps; i++) {
        const xN = i / steps;
        const x = (xN - 0.5) * chord;
        const y = maxT * 5 * (
          0.2969 * Math.sqrt(Math.max(0, xN)) -
          0.1260 * xN -
          0.3516 * Math.pow(xN, 2) +
          0.2843 * Math.pow(xN, 3) -
          0.1015 * Math.pow(xN, 4)
        );
        if (i === 0) obstacleCtx.moveTo(x, y);
        else obstacleCtx.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const xN = i / steps;
        const x = (xN - 0.5) * chord;
        const y = -maxT * 5 * (
          0.2969 * Math.sqrt(Math.max(0, xN)) -
          0.1260 * xN -
          0.3516 * Math.pow(xN, 2) +
          0.2843 * Math.pow(xN, 3) -
          0.1015 * Math.pow(xN, 4)
        );
        obstacleCtx.lineTo(x, y);
      }
      obstacleCtx.closePath();
      obstacleCtx.fill();
    }

    obstacleCtx.restore();
  }

  // Upload obstacle canvas into WebGL obstacle texture
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, obstacleCanvas);
}
