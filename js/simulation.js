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

export function shouldUseCompressibleSolver() {
  return CONFIG.solverMode === 'compressible' ||
    (CONFIG.solverMode === 'auto' && getInflowMach() >= CONFIG.machSwitch);
}

export function stepCompressible(dt) {
  const texelSize = [1.0 / simW, 1.0 / simH];
  const inflowSpeed = Math.min(Math.max(CONFIG.inflowSpeed, 0), MAX_INFLOW_SPEED) /
    getMetersPerSimulationCell();

  gl.useProgram(progCompressible);
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uTarget'), 0);
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uVelocity'), 1);
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uDensity'), 2);
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uEnergy'), 3);
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uObstacle'), 4);
  gl.uniform2f(gl.getUniformLocation(progCompressible, 'uTexelSize'), texelSize[0], texelSize[1]);
  gl.uniform1f(gl.getUniformLocation(progCompressible, 'uDT'), dt);
  gl.uniform1f(gl.getUniformLocation(progCompressible, 'uSpeed'), inflowSpeed);
  gl.uniform1f(gl.getUniformLocation(progCompressible, 'uGamma'), CONFIG.gamma);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, energy.read.tex);
  gl.activeTexture(gl.TEXTURE4);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  // Update velocity from the compressible pressure field.
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uMode'), 0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  renderStep(progCompressible, velocity.write);
  velocity.swap();

  // Advect density.
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uMode'), 1);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, density.read.tex);
  renderStep(progCompressible, density.write);
  density.swap();

  // Advect total energy.
  gl.uniform1i(gl.getUniformLocation(progCompressible, 'uMode'), 2);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, energy.read.tex);
  renderStep(progCompressible, energy.write);
  energy.swap();
}

function stepFluidSingle(dt) {
  if (CONFIG.paused) return;

  const texelSize = [1.0 / simW, 1.0 / simH];
  const useCompressibleSolver = shouldUseCompressibleSolver();

  // 1. Continuous Inflow (Wind Tunnel mode)
  if (CONFIG.inflow && !useCompressibleSolver) {
    const inflowSpeed = Math.min(Math.max(CONFIG.inflowSpeed, 0), MAX_INFLOW_SPEED);
    CONFIG.inflowSpeed = inflowSpeed;

    // Velocity inflow
    gl.useProgram(progInflow);
    gl.uniform1i(gl.getUniformLocation(progInflow, 'uTarget'), 0);
    gl.uniform1i(gl.getUniformLocation(progInflow, 'uObstacle'), 1);
    gl.uniform1f(
      gl.getUniformLocation(progInflow, 'uSpeed'),
      inflowSpeed / getMetersPerSimulationCell()
    );
    gl.uniform1i(gl.getUniformLocation(progInflow, 'uMode'), 0);
    gl.uniform1i(gl.getUniformLocation(progInflow, 'uPalette'), CONFIG.palette);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

    renderStep(progInflow, velocity.write);
    velocity.swap();

    // Dye Streamlines inflow
    if (CONFIG.streamlines) {
      gl.uniform1i(gl.getUniformLocation(progInflow, 'uMode'), 1);
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
    gl.uniform1i(gl.getUniformLocation(progCurl, 'uVelocity'), 0);
    gl.uniform2f(gl.getUniformLocation(progCurl, 'uTexelSize'), texelSize[0], texelSize[1]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
    renderStep(progCurl, curl);

    // Apply vorticity force
    gl.useProgram(progVorticity);
    gl.uniform1i(gl.getUniformLocation(progVorticity, 'uVelocity'), 0);
    gl.uniform1i(gl.getUniformLocation(progVorticity, 'uCurl'), 1);
    gl.uniform1i(gl.getUniformLocation(progVorticity, 'uObstacle'), 2);
    gl.uniform2f(gl.getUniformLocation(progVorticity, 'uTexelSize'), texelSize[0], texelSize[1]);
    gl.uniform1f(gl.getUniformLocation(progVorticity, 'uCurlStrength'), CONFIG.vorticity);
    gl.uniform1f(gl.getUniformLocation(progVorticity, 'uDT'), dt);

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
    gl.uniform1i(gl.getUniformLocation(progDiffuse, 'uX'), 0);
    gl.uniform1i(gl.getUniformLocation(progDiffuse, 'uX0'), 1);
    gl.uniform1i(gl.getUniformLocation(progDiffuse, 'uObstacle'), 2);
    gl.uniform2f(gl.getUniformLocation(progDiffuse, 'uTexelSize'), texelSize[0], texelSize[1]);
    gl.uniform1f(gl.getUniformLocation(progDiffuse, 'uAlpha'), alpha);
    gl.uniform1f(gl.getUniformLocation(progDiffuse, 'uBeta'), beta);

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

  // 4. Divergence Calculation with Obstacle Boundaries
  gl.useProgram(progDivergence);
  gl.uniform1i(gl.getUniformLocation(progDivergence, 'uVelocity'), 0);
  gl.uniform1i(gl.getUniformLocation(progDivergence, 'uObstacle'), 1);
  gl.uniform2f(gl.getUniformLocation(progDivergence, 'uTexelSize'), texelSize[0], texelSize[1]);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  renderStep(progDivergence, divergence);

  // 5. Pressure Poisson Solver (Jacobi Iterations)
  gl.useProgram(progPressure);
  gl.uniform1i(gl.getUniformLocation(progPressure, 'uPressure'), 0);
  gl.uniform1i(gl.getUniformLocation(progPressure, 'uDivergence'), 1);
  gl.uniform1i(gl.getUniformLocation(progPressure, 'uObstacle'), 2);
  gl.uniform2f(gl.getUniformLocation(progPressure, 'uTexelSize'), texelSize[0], texelSize[1]);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, divergence.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  for (let i = 0; i < CONFIG.pressureIterations; i++) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
    renderStep(progPressure, pressure.write);
    pressure.swap();
  }

  // 6. Gradient Subtraction / Velocity Projection
  gl.useProgram(progProject);
  gl.uniform1i(gl.getUniformLocation(progProject, 'uVelocity'), 0);
  gl.uniform1i(gl.getUniformLocation(progProject, 'uPressure'), 1);
  gl.uniform1i(gl.getUniformLocation(progProject, 'uObstacle'), 2);
  gl.uniform2f(gl.getUniformLocation(progProject, 'uTexelSize'), texelSize[0], texelSize[1]);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, pressure.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  renderStep(progProject, velocity.write);
  velocity.swap();

  // 7. Velocity Self-Advection
  gl.useProgram(progAdvect);
  gl.uniform1i(gl.getUniformLocation(progAdvect, 'uVelocity'), 0);
  gl.uniform1i(gl.getUniformLocation(progAdvect, 'uSource'), 1);
  gl.uniform1i(gl.getUniformLocation(progAdvect, 'uObstacle'), 2);
  gl.uniform2f(gl.getUniformLocation(progAdvect, 'uTexelSize'), texelSize[0], texelSize[1]);
  gl.uniform1f(gl.getUniformLocation(progAdvect, 'uDT'), dt);
  gl.uniform1f(gl.getUniformLocation(progAdvect, 'uDissipation'), CONFIG.velDissipation);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  renderStep(progAdvect, velocity.write);
  velocity.swap();

  // 8. Dye Advection
  gl.uniform1f(gl.getUniformLocation(progAdvect, 'uDissipation'), CONFIG.dissipation);
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
    gl.uniform1i(gl.getUniformLocation(progDiffuse, 'uX'), 0);
    gl.uniform1i(gl.getUniformLocation(progDiffuse, 'uX0'), 1);
    gl.uniform1i(gl.getUniformLocation(progDiffuse, 'uObstacle'), 2);
    gl.uniform2f(gl.getUniformLocation(progDiffuse, 'uTexelSize'), texelSize[0], texelSize[1]);
    gl.uniform1f(gl.getUniformLocation(progDiffuse, 'uAlpha'), alphaD);
    gl.uniform1f(gl.getUniformLocation(progDiffuse, 'uBeta'), betaD);

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

  const speedInCells = Math.min(Math.max(CONFIG.inflowSpeed, 0), MAX_INFLOW_SPEED) /
    getMetersPerSimulationCell();
  const maxCfl = 0.75;
  const substeps = Math.min(8, Math.max(1, Math.ceil(speedInCells * dt / maxCfl)));
  const substepDt = dt / substeps;

  for (let i = 0; i < substeps; i++) {
    stepFluidSingle(substepDt);
  }
}

export function renderDisplay() {
  gl.useProgram(progDisplay);
  gl.uniform1i(gl.getUniformLocation(progDisplay, 'uDye'), 0);
  gl.uniform1i(gl.getUniformLocation(progDisplay, 'uVelocity'), 1);
  gl.uniform1i(gl.getUniformLocation(progDisplay, 'uPressure'), 2);
  gl.uniform1i(gl.getUniformLocation(progDisplay, 'uCurl'), 3);
  gl.uniform1i(gl.getUniformLocation(progDisplay, 'uObstacle'), 4);
  gl.uniform2f(gl.getUniformLocation(progDisplay, 'uTexelSize'), 1.0 / simW, 1.0 / simH);
  gl.uniform1i(gl.getUniformLocation(progDisplay, 'uDisplayMode'), CONFIG.displayMode);
  gl.uniform1i(gl.getUniformLocation(progDisplay, 'uPalette'), CONFIG.palette);

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
  gl.uniform1i(gl.getUniformLocation(progSplat, 'uTarget'), 0);
  gl.uniform1i(gl.getUniformLocation(progSplat, 'uObstacle'), 1);
  gl.uniform2f(gl.getUniformLocation(progSplat, 'uPoint'), uX, uY);
  gl.uniform1f(gl.getUniformLocation(progSplat, 'uRadius'), rad);
  gl.uniform1f(gl.getUniformLocation(progSplat, 'uAspectRatio'), aspect);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, obstacleTex);

  // 1. Inject velocity
  gl.uniform3f(gl.getUniformLocation(progSplat, 'uColor'), dx * 4.0, -dy * 4.0, 0.0);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, velocity.read.tex);
  renderStep(progSplat, velocity.write);
  velocity.swap();

  // 2. Inject dye smoke
  gl.uniform3f(gl.getUniformLocation(progSplat, 'uColor'), color[0], color[1], color[2]);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dye.read.tex);
  renderStep(progSplat, dye.write);
  dye.swap();
}

export function clearFluid() {
  // Reset the fluid state. Compressible mode uses rho=1 and p=1 as its
  // reference state, so total energy is E = p/(gamma-1) at rest.
  for (const target of [velocity, dye, pressure]) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.read.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.write.fbo);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
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
