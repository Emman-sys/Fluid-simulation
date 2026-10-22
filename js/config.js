/**
 * AeroFlow 2D - Configuration Constants
 * Airflow units are physical metres and seconds. The solver operates in
 * grid cells per second, so the conversion depends on the domain width.
 */

export const AIR = {
  speedOfSoundMetersPerSecond: 343
};

export const MAX_INFLOW_SPEED = AIR.speedOfSoundMetersPerSecond * 2.0;

// Simulation configuration
export const CONFIG = {
  simWidth: 512,
  simHeight: 512,
  domainWidth: 100.0, // metres; domain height follows the canvas aspect ratio
  pressureIterations: 32,
  viscosityIterations: 10,
  dt: 0.016,
  viscosity: 0.000,
  diffusion: 0.000,
  dissipation: 0.992,
  velDissipation: 0.998,
  splatRadius: 28,
  vorticity: 24.0,
  inflow: true,
  inflowSpeed: 65.0, // m/s
  solverMode: 'auto', // 'auto' | 'incompressible' | 'compressible'
  machSwitch: 0.3,
  gamma: 1.4,
  streamlines: true,
  displayMode: 0, // 0: Dye, 1: Velocity, 2: Pressure, 3: Vorticity
  palette: 0,     // 0: Cyan, 1: Fire, 2: Violet, 3: Thermal, 4: White
  paused: false,

  // Solver quality preset: 'high' | 'medium' | 'low'. Controls pressure
  // Poisson iterations, viscous diffusion iterations, and the CFL substep cap.
  // Lower quality = fewer GPU passes per frame = higher frame rate.
  quality: 'high',

  // Internal simulation resolution as a fraction of the base 512x512 grid.
  // 1.0 = full 512x512, 0.5 = 256x256, 0.25 = 128x128. Lower = much faster on
  // low-end / mobile GPUs. Display is always rendered at canvas resolution.
  simResolutionScale: 1.0,

  // Maximum milliseconds to spend on simulation per frame. If the sim exceeds
  // this budget, remaining substeps are deferred to the next frame. Prevents
  // spiral-of-death stutter on slow devices at high Mach.
  maxSimMsPerFrame: 8.0,

  // When true, the app auto-selects a quality preset based on measured FPS
  // during the first few seconds. Overridden by manual quality selection.
  autoQuality: true,

  // SOR relaxation factor for the pressure Poisson solver.
  // 1.0 = plain Jacobi, 1.0-2.0 = successive over-relaxation (faster convergence).
  sorRelaxation: 1.8,
};

// Quality presets override CONFIG solver parameters. Each preset trades
// physical accuracy for frame rate by reducing the number of iterative
// solver passes (pressure Poisson is the dominant cost).
// Each pressure "iteration" = red pass + black pass (2 render passes).
// SOR converges faster per iteration than Jacobi, but on a 512x512 grid we
// still need enough iterations for pressure information to propagate from the
// boundaries to the centre of the domain. Too few iterations leaves the centre
// under-resolved, which impedes airflow there.
export const QUALITY_PRESETS = {
  high:   { pressureIterations: 16, viscosityIterations: 4,  cflSubstepCap: 64 },
  medium: { pressureIterations: 12, viscosityIterations: 2,  cflSubstepCap: 32 },
  low:    { pressureIterations: 8,  viscosityIterations: 0,  cflSubstepCap: 16 },
};

// Apply the selected quality preset to CONFIG (mutating in place so all
// importers see the updated values). Call this whenever CONFIG.quality changes.
export function applyQualityPreset(qualityName) {
  const preset = QUALITY_PRESETS[qualityName] || QUALITY_PRESETS.high;
  CONFIG.quality = qualityName;
  CONFIG.pressureIterations = preset.pressureIterations;
  CONFIG.viscosityIterations = preset.viscosityIterations;
  CONFIG.cflSubstepCap = preset.cflSubstepCap;
}

// Initialize with the configured quality preset.
applyQualityPreset(CONFIG.quality);
