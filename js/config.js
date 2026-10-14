/**
 * AeroFlow 2D - Configuration Constants
 * Airflow units are physical metres and seconds. The solver operates in
 * grid cells per second, so the conversion depends on the domain width.
 */

export const AIR = {
  speedOfSoundMetersPerSecond: 343,
  maxMach: 2.0
};

export const MAX_INFLOW_SPEED = AIR.speedOfSoundMetersPerSecond * AIR.maxMach;

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
  paused: false
};
