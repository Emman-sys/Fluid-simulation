/**
 * AeroFlow 2D - Shader Programs & Simulation Framebuffers
 * Compiles every solver program once at startup and allocates the
 * double-buffered (ping-pong) simulation targets.
 */

import { CONFIG } from './config.js';
import {
  gl,
  simW,
  simH,
  createProgram,
  createFBO,
  createDoubleFBO,
  deleteFBO,
  setSimulationDimensions
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

/** Cache uniform locations on a program object to avoid repeated driver lookups. */
function cacheUniforms(program, names) {
  const locs = {};
  for (const name of names) {
    locs[name] = gl.getUniformLocation(program, name);
  }
  program.uLoc = locs;
}

// Cache uniforms for every program (locations are constant after linking)
cacheUniforms(progCompressible, [
  'uVelocity', 'uDensity', 'uEnergy', 'uObstacle',
  'uTexelSize', 'uDT', 'uSpeed', 'uGamma', 'uMode'
]);
cacheUniforms(progInflow, [
  'uTarget', 'uObstacle', 'uSpeed', 'uMode', 'uPalette'
]);
cacheUniforms(progCurl, ['uVelocity', 'uTexelSize']);
cacheUniforms(progVorticity, [
  'uVelocity', 'uCurl', 'uObstacle', 'uTexelSize', 'uCurlStrength', 'uDT'
]);
cacheUniforms(progDiffuse, ['uX', 'uX0', 'uObstacle', 'uTexelSize', 'uAlpha', 'uBeta']);
cacheUniforms(progDivergence, ['uVelocity', 'uObstacle', 'uTexelSize']);
cacheUniforms(progPressure, ['uPressure', 'uDivergence', 'uObstacle', 'uTexelSize', 'uSOR', 'uParity']);
cacheUniforms(progProject, ['uVelocity', 'uPressure', 'uObstacle', 'uTexelSize']);
cacheUniforms(progAdvect, [
  'uVelocity', 'uSource', 'uObstacle', 'uTexelSize', 'uDT', 'uDissipation'
]);
cacheUniforms(progSplat, [
  'uTarget', 'uObstacle', 'uPoint', 'uRadius', 'uAspectRatio', 'uColor'
]);
cacheUniforms(progDisplay, [
  'uDye', 'uVelocity', 'uPressure', 'uCurl', 'uObstacle',
  'uTexelSize', 'uDisplayMode', 'uPalette'
]);

// Simulation Buffers (Double-buffered for ping-pong)
export let velocity = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export let dye = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export let density = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export let energy = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR);
export let pressure = createDoubleFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
export let divergence = createFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);
export let curl = createFBO(simW, simH, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST);

/**
 * Resize the simulation grid and reallocate every simulation framebuffer.
 *
 * The FBO objects are recreated rather than resized in place: createDoubleFBO
 * exposes `read`/`write` as getters over a private pair, so the underlying
 * textures and framebuffers cannot be swapped out from the outside.
 */
export function setSimulationResolution(scale) {
  CONFIG.simResolutionScale = Math.min(1.0, Math.max(0.25, scale));
  const w = Math.round(CONFIG.simWidth * CONFIG.simResolutionScale);
  const h = Math.round(CONFIG.simHeight * CONFIG.simResolutionScale);

  const formats = {
    velocity:   [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR],
    dye:        [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR],
    density:    [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR],
    energy:     [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.LINEAR],
    pressure:   [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST],
    divergence: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST],
    curl:       [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, gl.NEAREST],
  };

  // Release the previous framebuffers before allocating the new ones, so
  // repeated resolution changes do not leak GPU textures/framebuffers.
  velocity.dispose();
  dye.dispose();
  density.dispose();
  energy.dispose();
  pressure.dispose();
  deleteFBO(divergence);
  deleteFBO(curl);

  // Resize the grid first so the obstacle texture and rasterizer canvas match.
  setSimulationDimensions(w, h);

  velocity   = createDoubleFBO(w, h, ...formats.velocity);
  dye        = createDoubleFBO(w, h, ...formats.dye);
  density    = createDoubleFBO(w, h, ...formats.density);
  energy     = createDoubleFBO(w, h, ...formats.energy);
  pressure   = createDoubleFBO(w, h, ...formats.pressure);
  divergence = createFBO(w, h, ...formats.divergence);
  curl       = createFBO(w, h, ...formats.curl);
}
