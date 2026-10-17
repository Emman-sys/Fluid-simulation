/**
 * AeroFlow 2D - GLSL Shader Sources
 * All shaders are static template literals with no interpolation.
 */

// Base vertex shader for all programs
export const baseVS = `#version 300 es
    precision highp float;
    in vec2 aPosition;
    out vec2 vUV;
    void main() {
      vUV = aPosition * 0.5 + 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }`;

// Splat (Force / Dye Injection) Shader
export const splatFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uTarget;
    uniform sampler2D uObstacle;
    uniform vec2 uPoint;
    uniform vec3 uColor;
    uniform float uRadius;
    uniform float uAspectRatio;
    out vec4 fragColor;
    void main() {
      vec4 obs = texture(uObstacle, vUV);
      if (obs.r > 0.5) {
        fragColor = texture(uTarget, vUV);
        return;
      }
      vec2 p = vUV - uPoint;
      p.x *= uAspectRatio;
      float weight = exp(-dot(p, p) / (uRadius * uRadius));
      vec3 splat = uColor * weight;
      vec4 base = texture(uTarget, vUV);
      fragColor = vec4(base.rgb + splat, max(base.a, weight));
    }`;

// Curl (Vorticity) Calculation Shader
export const curlFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uVelocity;
    uniform vec2 uTexelSize;
    out vec4 fragColor;
    void main() {
      float L = texture(uVelocity, vUV - vec2(uTexelSize.x, 0.0)).y;
      float R = texture(uVelocity, vUV + vec2(uTexelSize.x, 0.0)).y;
      float B = texture(uVelocity, vUV - vec2(0.0, uTexelSize.y)).x;
      float T = texture(uVelocity, vUV + vec2(0.0, uTexelSize.y)).x;
      float vorticity = 0.5 * ((R - L) - (T - B));
      if (isnan(vorticity) || isinf(vorticity)) vorticity = 0.0;
      fragColor = vec4(vorticity, 0.0, 0.0, 1.0);
    }`;

// Vorticity Confinement Shader
export const vorticityFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    uniform float uCurlStrength;
    uniform float uDT;
    out vec4 fragColor;
    void main() {
      vec4 obs = texture(uObstacle, vUV);
      if (obs.r > 0.5) {
        fragColor = texture(uVelocity, vUV);
        return;
      }
      float L = abs(texture(uCurl, vUV - vec2(uTexelSize.x, 0.0)).x);
      float R = abs(texture(uCurl, vUV + vec2(uTexelSize.x, 0.0)).x);
      float B = abs(texture(uCurl, vUV - vec2(0.0, uTexelSize.y)).x);
      float T = abs(texture(uCurl, vUV + vec2(0.0, uTexelSize.y)).x);
      float C = texture(uCurl, vUV).x;

      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      float len = length(force) + 1e-5;
      force = (force / len) * vec2(1.0, -1.0) * C * uCurlStrength;
      // Prevent sharp inflow/obstacle gradients from becoming isolated
      // full-screen-sized velocity impulses.
      float forceMagnitude = length(force);
      force *= min(1.0, 120.0 / max(forceMagnitude, 1e-5));

      vec2 vel = texture(uVelocity, vUV).xy;
      vec2 newVel = vel + force * uDT;
      if (isnan(newVel.x) || isinf(newVel.x) || isnan(newVel.y) || isinf(newVel.y)) {
        newVel = vel;
      }
      fragColor = vec4(newVel, 0.0, 1.0);
    }`;

// Divergence Shader with Solid Boundary Conditions
export const divergenceFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uVelocity;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    out vec4 fragColor;
    void main() {
      vec4 obsC = texture(uObstacle, vUV);
      if (obsC.r > 0.5) {
        fragColor = vec4(0.0);
        return;
      }
      vec2 d = uTexelSize;
      // Open outlet on the right boundary. This keeps fluid moving out while
      // preventing pressure buildup at the domain edge.
      bool rightEdge = vUV.x >= 1.0 - d.x;
      float L = rightEdge ? texture(uVelocity, vUV).x : texture(uVelocity, vUV - vec2(d.x, 0.0)).x;
      float R = rightEdge ? texture(uVelocity, vUV).x : texture(uVelocity, vUV + vec2(d.x, 0.0)).x;
      float B = texture(uVelocity, vUV - vec2(0.0, d.y)).y;
      float T = texture(uVelocity, vUV + vec2(0.0, d.y)).y;
      float div = 0.5 * ((R - L) + (T - B));
      if (isnan(div) || isinf(div)) div = 0.0;
      fragColor = vec4(div, 0.0, 0.0, 1.0);
    }`;

// Pressure Poisson Solver (Red-Black SOR) Shader
// Red-black Gauss-Seidel / SOR converges ~2x faster than plain Jacobi.
// Each "iteration" consists of two parity passes (red then black).
export const pressureFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    uniform float uSOR;      // Relaxation factor (1.0 = Jacobi, 1.0-2.0 = SOR)
    uniform int uParity;     // 0 = red/even cells, 1 = black/odd cells
    out vec4 fragColor;
    void main() {
      vec4 obsC = texture(uObstacle, vUV);
      if (obsC.r > 0.5) {
        fragColor = vec4(0.0);
        return;
      }
      // Red-black parity: only update cells matching uParity; copy others unchanged.
      vec2 px = vUV / uTexelSize;  // pixel coordinates
      float parity = mod(floor(px.x) + floor(px.y), 2.0);
      if (mod(parity, 2.0) != float(uParity)) {
        fragColor = vec4(texture(uPressure, vUV).x, 0.0, 0.0, 1.0);
        return;
      }
      vec2 d = uTexelSize;
      // Pressure at the current cell (used for the solid-wall Neumann condition).
      float pC = texture(uPressure, vUV).x;
      // Solid-wall boundary condition: if a neighbour lies inside an obstacle,
      // use pC instead of the obstacle's hard p = 0. This is ∂p/∂n = 0 at the
      // wall and prevents an artificial low-pressure sink from forming at the
      // rear of obstacles (which would otherwise suck the flow toward them).
      vec4 obsL = texture(uObstacle, vUV - vec2(d.x, 0.0));
      vec4 obsR = texture(uObstacle, vUV + vec2(d.x, 0.0));
      vec4 obsB = texture(uObstacle, vUV - vec2(0.0, d.y));
      vec4 obsT = texture(uObstacle, vUV + vec2(0.0, d.y));
      float L = (obsL.r > 0.5) ? pC : texture(uPressure, vUV - vec2(d.x, 0.0)).x;
      float R = (obsR.r > 0.5) ? pC : texture(uPressure, vUV + vec2(d.x, 0.0)).x;
      float B = (obsB.r > 0.5) ? pC : texture(uPressure, vUV - vec2(0.0, d.y)).x;
      float T = (obsT.r > 0.5) ? pC : texture(uPressure, vUV + vec2(0.0, d.y)).x;
      float div = texture(uDivergence, vUV).x;
      float jacobi = (L + R + B + T - div) * 0.25;
      // SOR: p_new = p_old + omega * (jacobi - p_old)
      float p = pC + uSOR * (jacobi - pC);
      if (isnan(p) || isinf(p)) p = 0.0;
      fragColor = vec4(p, 0.0, 0.0, 1.0);
    }`;

// Velocity Projection (Gradient Subtraction) Shader
export const projectFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uVelocity;
    uniform sampler2D uPressure;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    out vec4 fragColor;
    void main() {
      vec4 obsC = texture(uObstacle, vUV);
      if (obsC.r > 0.5) {
        // No-penetration / no-slip: solid cells carry no fluid velocity so they
        // cannot act as reservoirs that leak into or attract flow around the
        // obstacle (e.g. air being drawn to the rear of an aerofoil).
        fragColor = vec4(0.0);
        return;
      }
      vec2 d = uTexelSize;
      float L = texture(uPressure, vUV - vec2(d.x, 0.0)).x;
      float R = texture(uPressure, vUV + vec2(d.x, 0.0)).x;
      float B = texture(uPressure, vUV - vec2(0.0, d.y)).x;
      float T = texture(uPressure, vUV + vec2(0.0, d.y)).x;
      vec2 gradP = 0.5 * vec2(R - L, T - B);
      vec2 vel = texture(uVelocity, vUV).xy;
      vec2 newVel = vel - gradP;
      if (isnan(newVel.x) || isinf(newVel.x) || isnan(newVel.y) || isinf(newVel.y)) {
        newVel = vel;
      }
      fragColor = vec4(newVel, 0.0, 1.0);
    }`;

// Advection Shader (Semi-Lagrangian)
export const advectFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    uniform float uDT;
    uniform float uDissipation;
    out vec4 fragColor;
    void main() {
      vec4 obsC = texture(uObstacle, vUV);
      if (obsC.r > 0.5) {
        fragColor = texture(uSource, vUV);
        return;
      }
      vec2 vel = texture(uVelocity, vUV).xy;
      if (isnan(vel.x) || isinf(vel.x) || isnan(vel.y) || isinf(vel.y)) {
        vel = vec2(0.0);
      }
      vec2 backUV = vUV - vel * uDT * uTexelSize;
      vec4 val = texture(uSource, backUV);
      if (isnan(val.r) || isinf(val.r) || isnan(val.g) || isinf(val.g) || isnan(val.b) || isinf(val.b)) {
        val = texture(uSource, vUV);
      }
      fragColor = vec4(val.rgb * uDissipation, val.a);
    }`;

// Diffusion Shader (Jacobi)
export const diffuseFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uX;
    uniform sampler2D uX0;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    uniform float uAlpha;
    uniform float uBeta;
    out vec4 fragColor;
    void main() {
      vec4 obsC = texture(uObstacle, vUV);
      if (obsC.r > 0.5) {
        fragColor = texture(uX, vUV);
        return;
      }
      vec2 d = uTexelSize;
      float L = texture(uX, vUV - vec2(d.x, 0.0)).x;
      float R = texture(uX, vUV + vec2(d.x, 0.0)).x;
      float B = texture(uX, vUV - vec2(0.0, d.y)).x;
      float T = texture(uX, vUV + vec2(0.0, d.y)).x;
      float x0 = texture(uX0, vUV).x;
      float betaSafe = max(uBeta, 1e-5);
      float x = (uAlpha * x0 + L + R + B + T) / betaSafe;
      if (isnan(x) || isinf(x)) x = x0;
      fragColor = vec4(x, 0.0, 0.0, 1.0);
    }`;

// Inflow / Wind Tunnel Shader
export const inflowFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uTarget;
    uniform sampler2D uObstacle;
    uniform float uSpeed;
    uniform int uMode;
    uniform int uPalette;
    out vec4 fragColor;
    void main() {
      vec4 obs = texture(uObstacle, vUV);
      if (obs.r > 0.5) {
        fragColor = texture(uTarget, vUV);
        return;
      }
      vec4 base = texture(uTarget, vUV);
      if (uMode == 0) {
        // Velocity inflow: left boundary
        if (vUV.x < 0.02) {
          fragColor = vec4(uSpeed, 0.0, 0.0, 1.0);
        } else {
          fragColor = base;
        }
      } else {
        // Dye streamlines: inject at left edge
        if (vUV.x < 0.01) {
          float t = fract(vUV.y * 10.0);
          vec3 color;
          if (uPalette == 0) { // Cyan
            color = mix(vec3(0.0, 0.8, 1.0), vec3(0.0, 0.4, 0.8), t);
          } else if (uPalette == 1) { // Fire
            color = mix(vec3(1.0, 0.3, 0.0), vec3(1.0, 0.8, 0.0), t);
          } else if (uPalette == 2) { // Violet
            color = mix(vec3(0.6, 0.0, 1.0), vec3(0.2, 0.6, 1.0), t);
          } else if (uPalette == 3) { // Thermal
            color = mix(vec3(0.0, 0.0, 0.5), vec3(1.0, 0.0, 0.0), t);
          } else { // White
            color = vec3(1.0);
          }
          fragColor = vec4(color, 1.0);
        } else {
          fragColor = base;
        }
      }
    }`;

// Compressible Flow Solver Shader
export const compressibleFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uTarget;
    uniform sampler2D uVelocity;
    uniform sampler2D uDensity;
    uniform sampler2D uEnergy;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    uniform float uDT;
    uniform float uSpeed;
    uniform float uGamma;
    uniform int uMode;
    out vec4 fragColor;
    void main() {
      vec4 obs = texture(uObstacle, vUV);
      if (obs.r > 0.5) {
        fragColor = texture(uTarget, vUV);
        return;
      }
      vec2 d = uTexelSize;
      if (uMode == 0) {
        // Primitive-variable pressure update. E is total energy density:
        // p = (gamma - 1) * (E - rho * |u|^2 / 2).
        vec2 vel = texture(uVelocity, vUV).xy;
        float rho = max(texture(uDensity, vUV).x, 1e-4);
        float E = max(texture(uEnergy, vUV).x, 0.0);
        float pL = max((uGamma - 1.0) * (
          texture(uEnergy, vUV - vec2(d.x, 0.0)).x -
          0.5 * texture(uDensity, vUV - vec2(d.x, 0.0)).x *
          dot(texture(uVelocity, vUV - vec2(d.x, 0.0)).xy,
              texture(uVelocity, vUV - vec2(d.x, 0.0)).xy)), 0.0);
        float pR = max((uGamma - 1.0) * (
          texture(uEnergy, vUV + vec2(d.x, 0.0)).x -
          0.5 * texture(uDensity, vUV + vec2(d.x, 0.0)).x *
          dot(texture(uVelocity, vUV + vec2(d.x, 0.0)).xy,
              texture(uVelocity, vUV + vec2(d.x, 0.0)).xy)), 0.0);
        float pB = max((uGamma - 1.0) * (
          texture(uEnergy, vUV - vec2(0.0, d.y)).x -
          0.5 * texture(uDensity, vUV - vec2(0.0, d.y)).x *
          dot(texture(uVelocity, vUV - vec2(0.0, d.y)).xy,
              texture(uVelocity, vUV - vec2(0.0, d.y)).xy)), 0.0);
        float pT = max((uGamma - 1.0) * (
          texture(uEnergy, vUV + vec2(0.0, d.y)).x -
          0.5 * texture(uDensity, vUV + vec2(0.0, d.y)).x *
          dot(texture(uVelocity, vUV + vec2(0.0, d.y)).xy,
              texture(uVelocity, vUV + vec2(0.0, d.y)).xy)), 0.0);
        vec2 gradP = 0.5 * vec2(pR - pL, pT - pB);
        if (vUV.x < 0.02) vel.x = uSpeed;
        fragColor = vec4(vel - gradP * uDT / rho, 0.0, 1.0);
      } else if (uMode == 1) {
        // Advect density and apply the continuity compression term.
        vec2 vel = texture(uVelocity, vUV).xy;
        vec2 backUV = vUV - vel * uDT * d;
        float rho = texture(uDensity, backUV).x;
        float L = texture(uVelocity, vUV - vec2(d.x, 0.0)).x;
        float R = texture(uVelocity, vUV + vec2(d.x, 0.0)).x;
        float B = texture(uVelocity, vUV - vec2(0.0, d.y)).y;
        float T = texture(uVelocity, vUV + vec2(0.0, d.y)).y;
        float div = 0.5 * ((R - L) + (T - B));
        rho = max(rho * (1.0 - uDT * div), 1e-4);
        // Inflow at left boundary
        if (vUV.x < 0.02) rho = 1.0;
        fragColor = vec4(rho, 0.0, 0.0, 1.0);
      } else if (uMode == 2) {
        // Advect total energy density and apply its compression work term.
        vec2 vel = texture(uVelocity, vUV).xy;
        vec2 backUV = vUV - vel * uDT * d;
        float E = texture(uEnergy, backUV).x;
        float rho = max(texture(uDensity, vUV).x, 1e-4);
        float p = max((uGamma - 1.0) * (
          texture(uEnergy, vUV).x - 0.5 * rho * dot(vel, vel)), 0.0);
        float L = texture(uVelocity, vUV - vec2(d.x, 0.0)).x;
        float R = texture(uVelocity, vUV + vec2(d.x, 0.0)).x;
        float B = texture(uVelocity, vUV - vec2(0.0, d.y)).y;
        float T = texture(uVelocity, vUV + vec2(0.0, d.y)).y;
        float div = 0.5 * ((R - L) + (T - B));
        E = max(E - uDT * (E + p) * div, 1e-4);
        // Inflow energy at left boundary
        if (vUV.x < 0.02) {
          float rho = 1.0;
          float p = 1.0;
          E = p / (uGamma - 1.0) + 0.5 * rho * uSpeed * uSpeed;
        }
        fragColor = vec4(E, 0.0, 0.0, 1.0);
      } else {
        // uMode == 3: write thermodynamic pressure for display/visualization.
        // p = (gamma - 1) * (E - 0.5 * rho * |u|^2)
        vec2 vel = texture(uVelocity, vUV).xy;
        float rho = max(texture(uDensity, vUV).x, 1e-4);
        float E = max(texture(uEnergy, vUV).x, 0.0);
        float p = max((uGamma - 1.0) * (E - 0.5 * rho * dot(vel, vel)), 0.0);
        fragColor = vec4(p, 0.0, 0.0, 1.0);
      }
    }`;

// Display Shader (Visualization)
export const displayFS = `#version 300 es
    precision highp float;
    in vec2 vUV;
    uniform sampler2D uDye;
    uniform sampler2D uVelocity;
    uniform sampler2D uPressure;
    uniform sampler2D uCurl;
    uniform sampler2D uObstacle;
    uniform vec2 uTexelSize;
    uniform int uDisplayMode;
    uniform int uPalette;
    out vec4 fragColor;
    void main() {
      vec4 obs = texture(uObstacle, vUV);
      if (obs.r > 0.5) {
        // Draw obstacle outline
        vec4 obsN = texture(uObstacle, vUV + vec2(uTexelSize.x, 0.0));
        vec4 obsS = texture(uObstacle, vUV - vec2(uTexelSize.x, 0.0));
        vec4 obsE = texture(uObstacle, vUV + vec2(0.0, uTexelSize.y));
        vec4 obsW = texture(uObstacle, vUV - vec2(0.0, uTexelSize.y));
        bool edge = (obsN.r < 0.5) || (obsS.r < 0.5) || (obsE.r < 0.5) || (obsW.r < 0.5);
        if (edge) {
          fragColor = vec4(0.0, 0.95, 1.0, 1.0);
        } else {
          fragColor = vec4(0.05, 0.1, 0.2, 1.0);
        }
        return;
      }
      vec4 dye = texture(uDye, vUV);
      vec4 vel = texture(uVelocity, vUV);
      vec4 pres = texture(uPressure, vUV);
      vec4 curl = texture(uCurl, vUV);
      float speed = length(vel.xy);
      float vort = abs(curl.x);
      float p = pres.x;
      vec3 color;
      if (uDisplayMode == 0) {
        // Dye / Smoke
        color = dye.rgb;
      } else if (uDisplayMode == 1) {
        // Velocity magnitude
        float v = min(speed * 0.5, 1.0);
        if (uPalette == 0) color = mix(vec3(0.0, 0.2, 0.4), vec3(0.0, 1.0, 1.0), v);
        else if (uPalette == 1) color = mix(vec3(0.2, 0.0, 0.0), vec3(1.0, 0.5, 0.0), v);
        else if (uPalette == 2) color = mix(vec3(0.2, 0.0, 0.4), vec3(0.8, 0.2, 1.0), v);
        else if (uPalette == 3) color = mix(vec3(0.0, 0.0, 0.3), vec3(1.0, 0.0, 0.0), v);
        else color = vec3(v);
      } else if (uDisplayMode == 2) {
        // Pressure
        float v = min(abs(p) * 2.0, 1.0);
        if (uPalette == 0) color = mix(vec3(0.0, 0.2, 0.4), vec3(0.0, 1.0, 1.0), v);
        else if (uPalette == 1) color = mix(vec3(0.2, 0.0, 0.0), vec3(1.0, 0.5, 0.0), v);
        else if (uPalette == 2) color = mix(vec3(0.2, 0.0, 0.4), vec3(0.8, 0.2, 1.0), v);
        else if (uPalette == 3) color = mix(vec3(0.0, 0.0, 0.3), vec3(1.0, 0.0, 0.0), v);
        else color = vec3(v);
      } else {
        // Vorticity
        float v = min(vort * 0.1, 1.0);
        if (uPalette == 0) color = mix(vec3(0.0, 0.2, 0.4), vec3(0.0, 1.0, 1.0), v);
        else if (uPalette == 1) color = mix(vec3(0.2, 0.0, 0.0), vec3(1.0, 0.5, 0.0), v);
        else if (uPalette == 2) color = mix(vec3(0.2, 0.0, 0.4), vec3(0.8, 0.2, 1.0), v);
        else if (uPalette == 3) color = mix(vec3(0.0, 0.0, 0.3), vec3(1.0, 0.0, 0.0), v);
        else color = vec3(v);
      }
      // Background
      vec3 bg = vec3(0.03, 0.05, 0.1);
      color = mix(bg, color, 1.0 - exp(-dye.a * 3.0));
      // Subtle grid lines
      float grid = sin(vUV.x * 314.0) * sin(vUV.y * 314.0);
      color += 0.02 * grid * vec3(0.0, 0.5, 1.0);
      fragColor = vec4(color, 1.0);
    }`;
