/**
 * AeroFlow 2D - Shared Mutable State
 * Single source of truth for state that is reassigned across modules.
 *
 * Module-level `let` bindings cannot be reassigned from an importing module,
 * so everything that must be written by more than one module lives on this
 * plain object. Single-owner values (colorHue, nextObstacleId, lastTime,
 * frameCount, fpsTimer) stay local to their owning module instead.
 */

// Modes: 'fluid' | 'object'
export const state = {
  currentMode: 'fluid',

  // List of active obstacles in the world
  obstacles: [],

  // Currently selected obstacle for editing
  selectedObstacle: null,

  // Current drag action in object mode
  dragAction: null, // { type: 'translate' | 'rotate' | 'scale', ... }

  // Pointer state for fluid drawing and object interaction
  pointer: {
    isDown: false,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    pendingDx: 0,
    pendingDy: 0,
    color: [0.1, 0.8, 1.0]
  },

  // True when obstacle geometry/transform has changed and the obstacle
  // texture needs to be re-rasterized. Skips redundant GPU uploads when
  // obstacles are static.
  obstacleDirty: true
};
