/**
 * AeroFlow 2D - Obstacle Class & Geometry Utilities
 */

import { getWorldScale } from './gl.js';

// Next obstacle ID counter (module-local; only Obstacle writes it)
let nextObstacleId = 1;

/**
 * Point-in-triangle test using barycentric technique
 */
export function pointInTriangle(pt, v1, v2, v3) {
  const d1 = sign(pt, v1, v2);
  const d2 = sign(pt, v2, v3);
  const d3 = sign(pt, v3, v1);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}

function sign(p1, p2, p3) {
  return (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
}

/**
 * Obstacle class representing solid bodies in the flow
 */
export class Obstacle {
  constructor(type, x, y, width, height, rotation = 0) {
    this.id = nextObstacleId++;
    this.type = type; // 'rect' | 'circle' | 'triangle' | 'airfoil'
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.radius = width / 2;
    this.rotation = rotation; // radians
    this.prevX = x;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
  }

  updateVelocity(dt) {
    if (dt > 0.001) {
      this.vx = (this.x - this.prevX) / dt;
      this.vy = (this.y - this.prevY) / dt;
    } else {
      this.vx = 0;
      this.vy = 0;
    }
    this.prevX = this.x;
    this.prevY = this.y;
  }

  // Local coordinate transform
  toLocal(worldX, worldY) {
    const dx = worldX - this.x;
    const dy = worldY - this.y;
    const cos = Math.cos(-this.rotation);
    const sin = Math.sin(-this.rotation);
    return {
      x: dx * cos - dy * sin,
      y: dx * sin + dy * cos
    };
  }

  toWorld(localX, localY) {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: this.x + (localX * cos - localY * sin),
      y: this.y + (localX * sin + localY * cos)
    };
  }

  containsPoint(wx, wy) {
    const local = this.toLocal(wx, wy);
    if (this.type === 'circle') {
      return (local.x * local.x + local.y * local.y) <= (this.radius * this.radius);
    } else if (this.type === 'rect') {
      return Math.abs(local.x) <= this.width / 2 && Math.abs(local.y) <= this.height / 2;
    } else if (this.type === 'triangle') {
      // Equilateral / Isosceles triangle pointing right or up
      const p1 = { x: 0, y: -this.height / 2 };
      const p2 = { x: this.width / 2, y: this.height / 2 };
      const p3 = { x: -this.width / 2, y: this.height / 2 };
      return pointInTriangle(local, p1, p2, p3);
    } else if (this.type === 'airfoil') {
      // NACA 0015 teardrop profile
      const chord = this.width;
      const xNorm = (local.x + chord / 2) / chord;
      if (xNorm < 0 || xNorm > 1) return false;
      const maxT = this.height / 2;
      // NACA 4-digit thickness equation
      const yHalf = maxT * 5 * (
        0.2969 * Math.sqrt(Math.max(0, xNorm)) -
        0.1260 * xNorm -
        0.3516 * Math.pow(xNorm, 2) +
        0.2843 * Math.pow(xNorm, 3) -
        0.1015 * Math.pow(xNorm, 4)
      );
      return Math.abs(local.y) <= yHalf;
    }
    return false;
  }

  getControlHandles() {
    const w2 = this.width / 2;
    const h2 = this.height / 2;
    // 4 corner handles
    const corners = [
      { index: 0, local: { x: -w2, y: -h2 }, sx: -1, sy: -1 }, // TL
      { index: 1, local: { x:  w2, y: -h2 }, sx:  1, sy: -1 }, // TR
      { index: 2, local: { x:  w2, y:  h2 }, sx:  1, sy:  1 }, // BR
      { index: 3, local: { x: -w2, y:  h2 }, sx: -1, sy:  1 }  // BL
    ].map(c => ({
      ...c,
      world: this.toWorld(c.local.x, c.local.y)
    }));

    // Rotation handle protruding from top
    // Note: getWorldScale is imported from gl.js where it's used
    const rotLocal = { x: 0, y: -h2 - (32 / getWorldScale()) };
    const rotWorld = this.toWorld(rotLocal.x, rotLocal.y);
    const rotStemTop = this.toWorld(0, -h2);

    return { corners, rotWorld, rotStemTop };
  }

  drawShape(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    if (this.type === 'rect') {
      ctx.beginPath();
      ctx.roundRect(-this.width / 2, -this.height / 2, this.width, this.height, 6);
      ctx.fill();
    } else if (this.type === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'triangle') {
      ctx.beginPath();
      ctx.moveTo(0, -this.height / 2);
      ctx.lineTo(this.width / 2, this.height / 2);
      ctx.lineTo(-this.width / 2, this.height / 2);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'airfoil') {
      const chord = this.width;
      const maxT = this.height / 2;
      ctx.beginPath();
      const steps = 30;
      // Upper surface
      for (let i = 0; i <= steps; i++) {
        const xNorm = i / steps;
        const x = (xNorm - 0.5) * chord;
        const y = -maxT * 5 * (
          0.2969 * Math.sqrt(Math.max(0, xNorm)) -
          0.1260 * xNorm -
          0.3516 * Math.pow(xNorm, 2) +
          0.2843 * Math.pow(xNorm, 3) -
          0.1015 * Math.pow(xNorm, 4)
        );
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      // Lower surface
      for (let i = steps; i >= 0; i--) {
        const xNorm = i / steps;
        const x = (xNorm - 0.5) * chord;
        const y = maxT * 5 * (
          0.2969 * Math.sqrt(Math.max(0, xNorm)) -
          0.1260 * xNorm -
          0.3516 * Math.pow(xNorm, 2) +
          0.2843 * Math.pow(xNorm, 3) -
          0.1015 * Math.pow(xNorm, 4)
        );
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
