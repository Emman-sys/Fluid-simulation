/**
 * AeroFlow 2D - WebGL2 Context, Shader Utilities, FBO Helpers, Coordinate Transforms
 */

import { CONFIG } from './config.js';

// Canvas references
export const glCanvas = document.getElementById('gl-canvas');
export const overlayCanvas = document.getElementById('overlay-canvas');
export const overlayCtx = overlayCanvas.getContext('2d');

// WebGL2 context
export const gl = glCanvas.getContext('webgl2', {
  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance'
});

if (!gl) {
  alert('WebGL 2.0 is required but not supported on this browser/device.');
  throw new Error('WebGL 2 not supported');
}

// Required WebGL2 extensions
gl.getExtension('EXT_color_buffer_float');
gl.getExtension('OES_texture_float_linear');

/**
 * Create a shader from source
 */
export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compilation error: ' + info);
  }
  return shader;
}

/**
 * Create a program from vertex and fragment shaders
 */
export function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Program link error: ' + info);
  }
  return program;
}

/**
 * Create a framebuffer with texture attachment
 */
export function createFBO(w, h, internalFormat, format, type, filter) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fbo, width: w, height: h };
}

/**
 * Create a double-buffered FBO (ping-pong)
 */
export function createDoubleFBO(w, h, internalFormat, format, type, filter) {
  let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
  let fbo2 = createFBO(w, h, internalFormat, format, type, filter);
  return {
    get read() { return fbo1; },
    get write() { return fbo2; },
    swap() { const tmp = fbo1; fbo1 = fbo2; fbo2 = tmp; }
  };
}

/**
 * Render a full-screen quad to target FBO (or screen if null)
 */
export function renderStep(program, targetFBO) {
  gl.useProgram(program);
  if (targetFBO) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, targetFBO.fbo);
    gl.viewport(0, 0, targetFBO.width, targetFBO.height);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  }
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// Quad VAO for full-screen rendering
export const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);
const quadVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
  -1,  1,
   1, -1,
   1,  1
]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

// Simulation dimensions
export const simW = CONFIG.simWidth;
export const simH = CONFIG.simHeight;

// Offscreen obstacle rasterizer (RGB: R=255 solid, G=Vx, B=-Vy)
export const obstacleCanvas = document.createElement('canvas');
obstacleCanvas.width = CONFIG.simWidth;
obstacleCanvas.height = CONFIG.simHeight;
export const obstacleCtx = obstacleCanvas.getContext('2d', { willReadFrequently: false });

// Obstacle boundary texture (RGBA8)
export const obstacleTex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, obstacleTex);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, simW, simH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

/**
 * Get domain height in metres (follows canvas aspect ratio)
 */
export function getDomainHeight() {
  return CONFIG.domainWidth * glCanvas.clientHeight / Math.max(glCanvas.clientWidth, 1);
}

/**
 * Get world-to-screen scale factor
 */
export function getWorldScale() {
  return glCanvas.clientWidth / Math.max(CONFIG.domainWidth, 1e-6);
}

/**
 * Get metres per simulation cell
 */
export function getMetersPerSimulationCell() {
  return CONFIG.domainWidth / simW;
}

/**
 * Convert screen coordinates to world coordinates (metres)
 */
export function screenToWorld(x, y) {
  const scale = getWorldScale();
  return { x: x / scale, y: y / scale };
}

/**
 * Convert world coordinates (metres) to screen coordinates
 */
export function worldToScreen(x, y) {
  const scale = getWorldScale();
  return { x: x * scale, y: y * scale };
}

/**
 * Get pointer position relative to canvas
 */
export function getPointerPos(e) {
  const rect = glCanvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}
