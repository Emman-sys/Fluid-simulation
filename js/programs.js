/**
 * AeroFlow 2D - Shader Programs & Simulation Framebuffers
 * Compiles every solver program once at startup and allocates the
 * double-buffered (ping-pong) simulation targets.
 */

import {
  gl,
  simW,
  simH,
  createProgram,
  createFBO,
  createDoubleFBO
} from './gl.js';
import {
  baseVS,
  splatFS,
  curlFS,
  vorticityFS,
  divergenceFS,
  pressureFS,
  projectFS,
  advectFS,
  diffuseFS,
  inflowFS,
  compressibleFS,
  displayFS
} from './shaders.js';

// Compile programs
export const progSplat = createProgram(gl, baseVS, splatFS);
export const progCurl = createProgram(gl, baseVS, curlFS);
export const progVorticity = createProgram(gl, baseVS, vorticityFS);
export const progDivergence = createProgram(gl, baseVS, divergenceFS);
export const progPressure = createProgram(gl, baseVS, pressureFS);
export const progProject = createProgram(gl, baseVS, projectFS);
export const progAdvect = createProgram(gl, baseVS, advectFS);
export const progDiffuse = createProgram(gl, baseVS, diffuseFS);
export const progInflow = createProgram(gl, baseVS, inflowFS);
export const progCompressible = createProgram(gl, baseVS, compressibleFS);
export const progDisplay = createProgram(gl, baseVS, displayFS);

// Simulation Buffers (Double-buffered for ping-pong)
export const velocity = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export const dye = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export const density = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export const energy = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export const pressure = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
export const divergence = createFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
export const curl = createFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
