/**
 * AeroFlow 2D - Shared Mutable State
 * Single source of truth for state that is reassigned across modules.
 */

// Modes: 'fluid' | 'object'
export let currentMode = 'fluid';

// List of active obstacles in the world
export let obstacles = [];

// Currently selected obstacle for editing
export let selectedObstacle = null;

// Pointer state for fluid drawing and object interaction
export const pointer = {
  isDown: false,
  x: 0,
  y: 0,
  prevX: 0,
  prevY: 0,
  pendingDx: 0,
  pendingDy: 0,
  color: [0.1, 0.8, 1.0]
};

// Current drag action in object mode
export let dragAction = null; // { type: 'translate' | 'rotate' | 'scale', ... }

// Hovered handle for cursor updates
export let hoveredHandle = null;

// Color cycling for fluid drawing
export let colorHue = 180;

// Next obstacle ID counter
export let nextObstacleId = 1;

// Animation timing
export let lastTime = performance.now();
export let frameCount = 0;
export let fpsTimer = performance.now();
