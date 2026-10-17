/**
 * AeroFlow 2D - Fluid Simulation Step (Navier-Stokes Solver)
 * Incompressible (Stam) path plus a pressure-based compressible approximation
 * selected automatically once inflow Mach exceeds CONFIG.machSwitch.
 */

import { CONFIG, AIR, MAX_INFLOW_SPEED } from './config.js';
import {
  gl,
  glCanvas,
  simW,
  simH,
  getMetersPerSimulationCell,
  renderStep,
  obstacleTex
} from './gl.js';
import {
  progSplat,
  progCurl,
  progVorticity,
  progDivergence,
  progPressure,
  progProject,
  progAdvect,
  progDiffuse,
  progInflow,
  progCompressible,
  progDisplay,
  velocity,
  dye,
  density,
  energy,
  pressure,
  divergence,
  curl
} from './programs.js';

export function getInflowMach() {
  return Math.max(0, CONFIG.inflowSpeed) / AIR.speedOfSoundMetersPerSecond;
}

// Tracks whether the compressible solver is currently active. Used by the
// Mach-aware auto switch to apply hysteresis so the solver does not chatter
// between incompressible and compressible when inflow hovers at the threshold.
let compressibleActive = false;

// Mach dead-band below machSwitch at which the auto solver disengages.
// Prevents solver ping-pong when inflow Mach sits right at the threshold.
const MACH_HYSTERESIS = 0.05;

export function shouldUseCompressibleSolver() {
  if (CONFIG.solverMode === 'compressible') {
    compressibleActive = true;
    return true;
  }
  if (CONFIG.solverMode === 'incompressible') {
    compressibleActive = false;
    return false;
  }
  // Auto (Mach-aware): engage at machSwitch, disengage only below the lower
  // dead-band (machSwitch - MACH_HYSTERESIS).
  const mach = getInflowMach();
  if (compressibleActive) return mach >= CONFIG.machSwitch - MACH_HYSTERESIS;
  return mach >= CONFIG.machSwitch;
}

export function stepCompressible(dt) {
  const texelSize = [1.0 / simW, 1.0 / simH];
  const inflowSpeed = Math.min(Math.max(CONFIG.inflowSpeed, 0), MAX_INFLOW_SPEED) /
    getMetersPerSimulationCell();

  gl.useProgram(progCompressible);
  gl.uniform1i(progCompressible.uLoc.uTarget, 0);
  gl.uniform1i(progCompressible.uLoc.uVelocity, 1);
  gl.uniform1i(progCompressible.uLoc.uDensity, 2);
  gl.uniform1i(progCompressible.uLoc.uEnergy, 3);
  gl.uniform1i(progCompressible.uLoc.uObstacle, 4);
  gl.uniform2f(progCompressible.uLoc.uTexelSize, texelSize[0], texelSize[1]);
  gl.uniform1f(progCompressible.uLoc.uDT, dt);
  gl.uniform1f(progCompressible.uLoc.uSpeed, inflowSpeed);
  gl.uniform1f(progCompressible.uLoc.uGamma, CONFIG.gamma);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, energy.read.tex);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  // Update velocity from the compressible pressure field.
  gl.uniform1i(progCompressible.uLoc.uMode, 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  renderStep(progCompressible, velocity.write);
  velocity.swap();

  // Advect density.
  gl.uniform1i(progCompressible.uLoc.uMode, 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
  renderStep(progCompressible, density.write);
  density.swap();

  // Advect total energy.
  gl.uniform1i(progCompressible.uLoc.uMode, 2);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, energy.read.tex);
  renderStep(progCompressible, energy.write);
  energy.swap();

  // Write thermodynamic pressure to a texture for visualization and for the
  // compressible/Euler pressure field: p = (gamma - 1) * (E - 0.5 * rho * |u|^2).
  // Rebind the updated (post-swap) read textures so this pass uses current state.
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, energy.read.tex);

  gl.uniform1i(progCompressible.uLoc.uMode, 3);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
  renderStep(progCompressible, pressure.write);
  pressure.swap();
}

function stepFluidSingle(dt, useCompressibleSolver) {
  if (CONFIG.paused) return;

  const texelSize = [1.0 / simW, 1.0 / simH];

  // 1. Continuous Inflow (Wind Tunnel mode)
  if (CONFIG.inflow && !useCompressibleSolver) {
    const inflowSpeed = Math.min(Math.max(CONFIG.inflowSpeed, 0), MAX_INFLOW_SPEED);
    CONFIG.inflowSpeed = inflowSpeed;

    // Velocity inflow
    gl.useProgram(progInflow);
    gl.uniform1i(progInflow.uLoc.uTarget, 0);
    gl.uniform1i(progInflow.uLoc.uObstacle, 1);
    gl.uniform1f(
      progInflow.uLoc.uSpeed,
      inflowSpeed / getMetersPerSimulationCell()
    );
    gl.uniform1i(progInflow.uLoc.uMode, 0);
    gl.uniform1i(progInflow.uLoc.uPalette, CONFIG.palette);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    renderStep(progInflow, velocity.write);
    velocity.swap();

    // Dye Streamlines inflow
    if (CONFIG.streamlines) {
      gl.uniform1i(progInflow.uLoc.uMode, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);

      renderStep(progInflow, dye.write);
      dye.swap();
    }

  }

  if (CONFIG.inflow && useCompressibleSolver) {
    stepCompressible(dt);
  }

  // 2. Vorticity Confinement (Turbulent swirling vortex preservation)
  if (CONFIG.vorticity > 0.1) {
    // Compute curl
    gl.useProgram(progCurl);
    gl.uniform1i(progCurl.uLoc.uVelocity, 0);
    gl.uniform2f(progCurl.uLoc.uTexelSize, texelSize[0], texelSize[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    renderStep(progCurl, curl);

    // Apply vorticity force
    gl.useProgram(progVorticity);
    gl.uniform1i(progVorticity.uLoc.uVelocity, 0);
    gl.uniform1i(progVorticity.uLoc.uCurl, 1);
    gl.uniform1i(progVorticity.uLoc.uObstacle, 2);
    gl.uniform2f(progVorticity.uLoc.uTexelSize, texelSize[0], texelSize[1]);
    gl.uniform1f(progVorticity.uLoc.uCurlStrength, CONFIG.vorticity);
    gl.uniform1f(progVorticity.uLoc.uDT, dt);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, curl.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    renderStep(progVorticity, velocity.write);
    velocity.swap();
  }

  // 3. Viscous Diffusion for Velocity (optional when viscosity > 0)
  if (CONFIG.viscosity > 0.0005) {
    const alpha = (1.0 / texelSize[0]) * (1.0 / texelSize[0]) / (CONFIG.viscosity * dt);
    const beta = 4.0 + alpha;

    gl.useProgram(progDiffuse);
    gl.uniform1i(progDiffuse.uLoc.uX, 0);
    gl.uniform1i(progDiffuse.uLoc.uX0, 1);
    gl.uniform1i(progDiffuse.uLoc.uObstacle, 2);
    gl.uniform2f(progDiffuse.uLoc.uTexelSize, texelSize[0], texelSize[1]);
    gl.uniform1f(progDiffuse.uLoc.uAlpha, alpha);
    gl.uniform1f(progDiffuse.uLoc.uBeta, beta);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    for (let i = 0; i < CONFIG.viscosityIterations; i++) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
      renderStep(progDiffuse, velocity.write);
      velocity.swap();
    }
  }

  // 4-6. Divergence / Pressure Poisson / Velocity Projection (incompressible only).
  // Compressible/Euler flow is NOT divergence-free; its pressure-velocity coupling
  // is handled internally by stepCompressible via the thermodynamic pressure
  // gradient. Running the incompressible projection here would overwrite the
  // Euler pressure update and force the compressible field to be divergence-free,
  // destroying compressible physics (shocks, expansion, density waves).
  if (!useCompressibleSolver) {
    // 4. Divergence Calculation with Obstacle Boundaries
    gl.useProgram(progDivergence);
    gl.uniform1i(progDivergence.uLoc.uVelocity, 0);
    gl.uniform1i(progDivergence.uLoc.uObstacle, 1);
    gl.uniform2f(progDivergence.uLoc.uTexelSize, texelSize[0], texelSize[1]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    renderStep(progDivergence, divergence);

    // 5. Pressure Poisson Solver (Red-Black SOR Iterations)
    // Each iteration = red pass + black pass. SOR converges ~2x faster than
    // plain Jacobi, so fewer iterations are needed for the same accuracy.
    gl.useProgram(progPressure);
    gl.uniform1i(progPressure.uLoc.uPressure, 0);
    gl.uniform1i(progPressure.uLoc.uDivergence, 1);
    gl.uniform1i(progPressure.uLoc.uObstacle, 2);
    gl.uniform2f(progPressure.uLoc.uTexelSize, texelSize[0], texelSize[1]);
    gl.uniform1f(progPressure.uLoc.uSOR, CONFIG.sorRelaxation);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, divergence.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    for (let i = 0; i < CONFIG.pressureIterations; i++) {
      // Red pass (even cells)
      gl.uniform1i(progPressure.uLoc.uParity, 0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
      renderStep(progPressure, pressure.write);
      pressure.swap();

      // Black pass (odd cells)
      gl.uniform1i(progPressure.uLoc.uParity, 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
      renderStep(progPressure, pressure.write);
      pressure.swap();
    }

    // 6. Gradient Subtraction / Velocity Projection
    gl.useProgram(progProject);
    gl.uniform1i(progProject.uLoc.uVelocity, 0);
    gl.uniform1i(progProject.uLoc.uPressure, 1);
    gl.uniform1i(progProject.uLoc.uObstacle, 2);
    gl.uniform2f(progProject.uLoc.uTexelSize, texelSize[0], texelSize[1]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    renderStep(progProject, velocity.write);
    velocity.swap();
  }

  // 7. Velocity Self-Advection
  gl.useProgram(progAdvect);
  gl.uniform1i(progAdvect.uLoc.uVelocity, 0);
  gl.uniform1i(progAdvect.uLoc.uSource, 1);
  gl.uniform1i(progAdvect.uLoc.uObstacle, 2);
  gl.uniform2f(progAdvect.uLoc.uTexelSize, texelSize[0], texelSize[1]);
  gl.uniform1f(progAdvect.uLoc.uDT, dt);
  gl.uniform1f(progAdvect.uLoc.uDissipation, CONFIG.velDissipation);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  renderStep(progAdvect, velocity.write);
  velocity.swap();

  // 8. Dye Advection
  gl.uniform1f(progAdvect.uLoc.uDissipation, CONFIG.dissipation);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  renderStep(progAdvect, dye.write);
  dye.swap();

  // 9. Dye Diffusion (optional)
  if (CONFIG.diffusion > 0.0001) {
    const alphaD = (1.0 / texelSize[0]) * (1.0 / texelSize[0]) / (CONFIG.diffusion * dt);
    const betaD = 4.0 + alphaD;

    gl.useProgram(progDiffuse);
    gl.uniform1i(progDiffuse.uLoc.uX, 0);
    gl.uniform1i(progDiffuse.uLoc.uX0, 1);
    gl.uniform1i(progDiffuse.uLoc.uObstacle, 2);
    gl.uniform2f(progDiffuse.uLoc.uTexelSize, texelSize[0], texelSize[1]);
    gl.uniform1f(progDiffuse.uLoc.uAlpha, alphaD);
    gl.uniform1f(progDiffuse.uLoc.uBeta, betaD);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    for (let i = 0; i < 4; i++) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
      renderStep(progDiffuse, dye.write);
      dye.swap();
    }
  }
}

/**
 * Keep semi-Lagrangian backtraces and force integration within a practical
 * CFL range. The simulation velocity is stored in cells per second, so the
 * relevant displacement is speed * dt, not the physical speed in metres/s.
 */
export function stepFluid(dt) {
  if (CONFIG.paused) return;

  const useCompressible = shouldUseCompressibleSolver();
  const speedInCells = Math.min(Math.max(CONFIG.inflowSpeed, 0), MAX_INFLOW_SPEED) /
    getMetersPerSimulationCell();
  // For compressible/Euler flow the CFL signal speed is |u| + a (flow speed
  // plus the speed of sound); for incompressible flow it is just |u|.
  const speedOfSoundInCells = AIR.speedOfSoundMetersPerSecond / getMetersPerSimulationCell();
  const waveSpeedInCells = speedInCells + (useCompressible ? speedOfSoundInCells : 0.0);
  const maxCfl = 0.75;
  const cflCap = CONFIG.cflSubstepCap ?? 8;
  const substeps = Math.min(cflCap, Math.max(1, Math.ceil(waveSpeedInCells * dt / maxCfl)));
  const substepDt = dt / substeps;

  for (let i = 0; i < substeps; i++) {
    stepFluidSingle(substepDt, useCompressible);
  }
}

export function renderDisplay() {
  gl.useProgram(progDisplay);
  gl.uniform1i(progDisplay.uLoc.uDye, 0);
  gl.uniform1i(progDisplay.uLoc.uVelocity, 1);
  gl.uniform1i(progDisplay.uLoc.uPressure, 2);
  gl.uniform1i(progDisplay.uLoc.uCurl, 3);
  gl.uniform1i(progDisplay.uLoc.uObstacle, 4);
  gl.uniform2f(progDisplay.uLoc.uTexelSize, 1.0 / simW, 1.0 / simH);
  gl.uniform1i(progDisplay.uLoc.uDisplayMode, CONFIG.displayMode);
  gl.uniform1i(progDisplay.uLoc.uPalette, CONFIG.palette);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, curl.tex);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  renderStep(progDisplay, null);
}

export function splat(x, y, dx, dy, color) {
  const uX = x / glCanvas.clientWidth;
  const uY = 1.0 - (y / glCanvas.clientHeight);
  const aspect = glCanvas.clientWidth / glCanvas.clientHeight;
  const rad = (CONFIG.splatRadius / glCanvas.clientHeight);

  gl.useProgram(progSplat);
  gl.uniform1i(progSplat.uLoc.uTarget, 0);
  gl.uniform1i(progSplat.uLoc.uObstacle, 1);
  gl.uniform2f(progSplat.uLoc.uPoint, uX, uY);
  gl.uniform1f(progSplat.uLoc.uRadius, rad);
  gl.uniform1f(progSplat.uLoc.uAspectRatio, aspect);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  // 1. Inject velocity
  gl.uniform3f(progSplat.uLoc.uColor, dx * 4.0, -dy * 4.0, 0.0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  renderStep(progSplat, velocity.write);
  velocity.swap();

  // 2. Inject dye smoke
  gl.uniform3f(progSplat.uLoc.uColor, color[0], color[1], color[2]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
  renderStep(progSplat, dye.write);
  dye.swap();
}

export function clearFluid() {
  // Reset the fluid state. Compressible mode uses rho=1 and p=1 as its
  // reference state, so total energy is E = p/(gamma-1) at rest.
  // Velocity and dye reset to rest/empty. Pressure resets to the compressible
  // reference state p = 1 (see rest-state comment at the top of this function).
  // For the incompressible solver the pressure is re-derived by the Poisson
  // projection every frame, so this initial value does not affect the result.
  for (const target of [velocity, dye]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.read.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  // Pressure reference state: p = 1 at rest (compressible Euler reference).
  gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.read.fbo);
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, pressure.write.fbo);
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const restEnergy = 1.0 / (CONFIG.gamma - 1.0);
  for (const target of [density]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.read.fbo);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
    gl.clearColor(1, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  for (const target of [energy]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.read.fbo);
    gl.clearColor(restEnergy, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
    gl.clearColor(restEnergy, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
